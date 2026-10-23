// Builds the wiring plan (parts, wires, bill of materials) for a board + Mac model.

import { boardById, type Board, type Role } from "./boards";
import { CONNECTORS, type ConnectorId } from "./connectors";
import { modelById, type MacModel } from "./macModels";
import { t } from "@/i18n";

/** `num` is the physical pin number on the package, when it has one. */
export interface ModulePin { id: string; label: string; side: "lv" | "hv"; num?: number }

/** How the part looks on the bench, for the solder guide. */
export type Package =
  | { kind: "breakout"; left: string[]; right: string[] }  // pin ids along each header, top→bottom; unknown ids are unused pins
  | { kind: "dip"; count: 8 | 14; names: Record<number, string> }
  | { kind: "to92"; legs: [string, string, string] };       // pin ids left→right, flat face towards you

export interface ModulePart { id: string; title: string; subtitle: string; part: string; pins: ModulePin[]; pkg: Package }

export interface WireEnd { part: string; pin: string }

/** Power nets are drawn as symbols in the schematic rather than as long wires. */
export type Net = "GND" | "3V3" | "5V_MAC";

export interface Wire {
  id: string;
  from: WireEnd;
  to: WireEnd;
  color: string;
  label: string;
  group: "input" | "serial" | "power";
  net?: Net;
  /** A component in series, e.g. the gate resistor. */
  via?: string;
}

export interface BomItem { qty: number; part: string; why: string }

export interface Features { input: boolean; serial: boolean; power: "usb" | "mac" }

export interface WiringPlan {
  board: Board;
  model: MacModel;
  connectors: ConnectorId[];
  modules: ModulePart[];
  wires: Wire[];
  bom: BomItem[];
  warnings: string[];
  table: { signal: string; esp: string; via: string; mac: string; group: Wire["group"] }[];
}

const C = {
  data: "#0a84ff", clock: "#bf5af2", ctl: "#ff9f0a", tx: "#30d158", rx: "#ff375f", gnd: "#8e8e93", vcc: "#ff453a",
};

export function buildWiring(boardId: string, modelId: string, f: Features): WiringPlan {
  const board = boardById(boardId);
  const model = modelById(modelId);
  const gpio = (r: Role) => `GPIO${board.roles[r]}`;
  const modules: ModulePart[] = [];
  const wires: Wire[] = [];
  const bom: BomItem[] = [{ qty: 1, part: board.name, why: t("The bridge: WiFi, Bluetooth and USB") }];
  const warnings: string[] = [];
  const connectors: ConnectorId[] = [];
  const table: WiringPlan["table"] = [];
  let n = 0;
  const wire = (from: WireEnd, to: WireEnd, color: string, label: string, group: Wire["group"], extra: Partial<Wire> = {}) =>
    wires.push({ id: `w${n++}`, from, to, color, label, group, ...extra });
  const gnd = (to: WireEnd) => wire(esp("GND"), to, C.gnd, "GND", "power", { net: "GND" });
  const v33 = (to: WireEnd) => wire(esp("3V3"), to, C.vcc, "3.3 V", "power", { net: "3V3" });
  const levelShifter = (): ModulePart => ({
    id: "ls", title: t("Level shifter"), subtitle: t("BSS138 4-channel · 3.3 V ↔ 5 V"), part: "BSS138 ×4",
    pins: [
      { id: "LV", label: "LV", side: "lv" }, { id: "LV1", label: "LV1", side: "lv" }, { id: "LV2", label: "LV2", side: "lv" }, { id: "LV3", label: "LV3", side: "lv" }, { id: "GNDl", label: "GND", side: "lv" },
      { id: "HV", label: "HV", side: "hv" }, { id: "HV1", label: "HV1", side: "hv" }, { id: "HV2", label: "HV2", side: "hv" }, { id: "HV3", label: "HV3", side: "hv" }, { id: "GNDh", label: "GND", side: "hv" },
    ],
    // The common SparkFun-style module; check yours, some put LV/HV in other spots.
    pkg: { kind: "breakout", left: ["LV1", "LV2", "LV", "GNDl", "LV3", "LV4"], right: ["HV1", "HV2", "HV", "GNDh", "HV3", "HV4"] },
  });
  const esp = (pin: string): WireEnd => ({ part: "esp", pin });

  // ── Keyboard / mouse ─────────────────────────────
  if (f.input && model.input === "adb") {
    connectors.push("adb");
    modules.push(levelShifter());
    modules.push({
      id: "q1", title: t("Power switch"), subtitle: t("2N7000 MOSFET + 1 kΩ on the gate"), part: "2N7000",
      pins: [{ id: "G", label: "G", side: "lv", num: 2 }, { id: "S", label: "S", side: "lv", num: 1 }, { id: "D", label: "D", side: "hv", num: 3 }],
      pkg: { kind: "to92", legs: ["S", "G", "D"] },
    });
    wire(esp(gpio("ADB_DATA")), { part: "ls", pin: "LV1" }, C.data, "ADB data", "input");
    wire({ part: "ls", pin: "HV1" }, { part: "adb", pin: "1" }, C.data, "ADB data", "input");
    v33({ part: "ls", pin: "LV" });
    wire({ part: "ls", pin: "HV" }, { part: "adb", pin: "3" }, C.vcc, "+5 V ADB", "power", { net: "5V_MAC" });
    gnd({ part: "ls", pin: "GNDl" });
    gnd({ part: "ls", pin: "GNDh" });
    gnd({ part: "adb", pin: "4" });
    wire(esp(gpio("ADB_PSW")), { part: "q1", pin: "G" }, C.ctl, "Power-on", "input", { via: "1 kΩ" });
    wire({ part: "q1", pin: "D" }, { part: "adb", pin: "2" }, C.ctl, "PSW", "input");
    gnd({ part: "q1", pin: "S" });
    table.push(
      { signal: "ADB data", esp: gpio("ADB_DATA"), via: "BSS138 LV1→HV1", mac: "ADB pin 1", group: "input" },
      { signal: "Power-on (PSW)", esp: gpio("ADB_PSW"), via: t("2N7000 (drain)"), mac: "ADB pin 2", group: "input" },
      { signal: t("+5 V reference"), esp: "—", via: "BSS138 HV", mac: "ADB pin 3", group: "power" },
      { signal: t("Ground"), esp: "GND", via: t("common"), mac: "ADB pin 4", group: "power" },
    );
    bom.push(
      { qty: 1, part: t("BSS138 level shifter (4-channel)"), why: t("The ADB line is 5 V and the ESP32 can't take that") },
      { qty: 1, part: t("2N7000 MOSFET + 1 kΩ resistor"), why: t("Power the Mac on from the app (Power key)") },
      { qty: 1, part: t("Male mini-DIN-4 cable/connector (S-Video works)"), why: t("Connects to the ADB port") },
    );
    if (model.form === "compact" || model.id === "classic") warnings.push(t("On compact Macs (SE, Classic) the PSW pin doesn't power the machine on: use the switch on the back."));
  }

  if (f.input && model.input === "m0110") {
    connectors.push("kbd-rj11", "mouse-de9");
    modules.push(levelShifter());
    modules.push({
      id: "buf", title: t("Quadrature buffer"), subtitle: t("74AHCT125 at 5 V (TTL inputs)"), part: "74AHCT125",
      pins: [
        { id: "1A", label: "1A", side: "lv", num: 2 }, { id: "2A", label: "2A", side: "lv", num: 5 }, { id: "3A", label: "3A", side: "lv", num: 9 }, { id: "4A", label: "4A", side: "lv", num: 12 },
        { id: "1OE", label: "1OE̅", side: "lv", num: 1 }, { id: "2OE", label: "2OE̅", side: "lv", num: 4 }, { id: "3OE", label: "3OE̅", side: "lv", num: 10 }, { id: "4OE", label: "4OE̅", side: "lv", num: 13 },
        { id: "GND", label: "GND", side: "lv", num: 7 },
        { id: "1Y", label: "1Y", side: "hv", num: 3 }, { id: "2Y", label: "2Y", side: "hv", num: 6 }, { id: "3Y", label: "3Y", side: "hv", num: 8 }, { id: "4Y", label: "4Y", side: "hv", num: 11 },
        { id: "VCC", label: "VCC", side: "hv", num: 14 },
      ],
      pkg: { kind: "dip", count: 14, names: { 1: "1OE̅", 2: "1A", 3: "1Y", 4: "2OE̅", 5: "2A", 6: "2Y", 7: "GND", 8: "3Y", 9: "3A", 10: "3OE̅", 11: "4Y", 12: "4A", 13: "4OE̅", 14: "VCC" } },
    });
    wire(esp(gpio("KBD_CLK")), { part: "ls", pin: "LV1" }, C.clock, t("Keyboard CLK"), "input");
    wire({ part: "ls", pin: "HV1" }, { part: "kbd-rj11", pin: "2" }, C.clock, "CLK", "input");
    wire(esp(gpio("KBD_DATA")), { part: "ls", pin: "LV2" }, C.data, t("Keyboard DATA"), "input");
    wire({ part: "ls", pin: "HV2" }, { part: "kbd-rj11", pin: "3" }, C.data, "DATA", "input");
    wire(esp(gpio("MOUSE_SW")), { part: "ls", pin: "LV3" }, C.ctl, t("Mouse button"), "input");
    wire({ part: "ls", pin: "HV3" }, { part: "mouse-de9", pin: "7" }, C.ctl, "SW", "input");
    v33({ part: "ls", pin: "LV" });
    wire({ part: "ls", pin: "HV" }, { part: "kbd-rj11", pin: "4" }, C.vcc, "+5 V", "power", { net: "5V_MAC" });
    gnd({ part: "ls", pin: "GNDl" });
    gnd({ part: "ls", pin: "GNDh" });
    gnd({ part: "kbd-rj11", pin: "1" });
    const quad: [Role, string, string][] = [["MOUSE_X1", "1", "5"], ["MOUSE_X2", "2", "4"], ["MOUSE_Y1", "3", "9"], ["MOUSE_Y2", "4", "8"]];
    for (const [role, ch, macPin] of quad) {
      const lbl = role.replace("MOUSE_", "");
      wire(esp(gpio(role)), { part: "buf", pin: `${ch}A` }, C.tx, lbl, "input");
      wire({ part: "buf", pin: `${ch}Y` }, { part: "mouse-de9", pin: macPin }, C.tx, lbl, "input");
      table.push({ signal: t("Mouse {axis}", { axis: lbl }), esp: gpio(role), via: `74AHCT125 ${ch}A→${ch}Y`, mac: `DE-9 pin ${macPin}`, group: "input" });
    }
    wire({ part: "buf", pin: "VCC" }, { part: "mouse-de9", pin: "2" }, C.vcc, "+5 V", "power", { net: "5V_MAC" });
    for (const p of ["1OE", "2OE", "3OE", "4OE", "GND"]) gnd({ part: "buf", pin: p });  // outputs always enabled
    gnd({ part: "mouse-de9", pin: "3" });
    table.push(
      { signal: t("Keyboard CLK"), esp: gpio("KBD_CLK"), via: "BSS138 LV1→HV1", mac: "RJ-11 pin 2", group: "input" },
      { signal: t("Keyboard DATA"), esp: gpio("KBD_DATA"), via: "BSS138 LV2→HV2", mac: "RJ-11 pin 3", group: "input" },
      { signal: t("Mouse button"), esp: gpio("MOUSE_SW"), via: "BSS138 LV3→HV3", mac: "DE-9 pin 7", group: "input" },
      { signal: "+5 V / GND", esp: "3V3 / GND", via: "BSS138 HV/GND", mac: "RJ-11 4 / 1, DE-9 2 / 3", group: "power" },
    );
    bom.push(
      { qty: 1, part: t("BSS138 level shifter (4-channel)"), why: t("Keyboard (CLK, DATA) and mouse button at 5 V") },
      { qty: 1, part: t("74AHCT125 (or 74HCT125)"), why: t("Clean 5 V quadrature outputs") },
      { qty: 1, part: t("RJ-11 4P4C phone cable"), why: t("Keyboard port") },
      { qty: 1, part: t("Male DE-9 connector"), why: t("Mouse port") },
    );
  }

  // ── Serial (RS-422) ─────────────────────────────
  if (f.serial) {
    const port: ConnectorId = model.serial === "de9" ? "serial9" : "serial8";
    connectors.push(port);
    const pinOf = (name: string) => String(CONNECTORS[port].pins.find((p) => p.name === name)!.n);
    modules.push({
      id: "rs422", title: t("RS-422 transceiver"), subtitle: t("MAX3488 (3.3 V, full duplex)"), part: "MAX3488",
      pins: [
        { id: "VCC", label: "VCC", side: "lv", num: 1 }, { id: "RO", label: "RO", side: "lv", num: 2 }, { id: "DI", label: "DI", side: "lv", num: 3 }, { id: "GND", label: "GND", side: "lv", num: 4 },
        { id: "A", label: "A", side: "hv", num: 8 }, { id: "B", label: "B", side: "hv", num: 7 }, { id: "Z", label: "Z", side: "hv", num: 6 }, { id: "Y", label: "Y", side: "hv", num: 5 },
      ],
      pkg: { kind: "dip", count: 8, names: { 1: "VCC", 2: "RO", 3: "DI", 4: "GND", 5: "Y", 6: "Z", 7: "B", 8: "A" } },
    });
    wire(esp(gpio("SER_TX")), { part: "rs422", pin: "DI" }, C.tx, "TX → Mac", "serial");
    wire(esp(gpio("SER_RX")), { part: "rs422", pin: "RO" }, C.rx, "RX ← Mac", "serial");
    v33({ part: "rs422", pin: "VCC" });
    gnd({ part: "rs422", pin: "GND" });
    wire({ part: "rs422", pin: "Y" }, { part: port, pin: pinOf("RxD+") }, C.tx, "RxD+", "serial");
    wire({ part: "rs422", pin: "Z" }, { part: port, pin: pinOf("RxD−") }, C.tx, "RxD−", "serial");
    wire({ part: "rs422", pin: "A" }, { part: port, pin: pinOf("TxD+") }, C.rx, "TxD+", "serial");
    wire({ part: "rs422", pin: "B" }, { part: port, pin: pinOf("TxD−") }, C.rx, "TxD−", "serial");
    gnd({ part: port, pin: pinOf("GND") });
    table.push(
      { signal: "ESP32 → Mac", esp: gpio("SER_TX"), via: "MAX3488 DI → Y/Z", mac: `RxD+ (${pinOf("RxD+")}) / RxD− (${pinOf("RxD−")})`, group: "serial" },
      { signal: "Mac → ESP32", esp: gpio("SER_RX"), via: "MAX3488 A/B → RO", mac: `TxD+ (${pinOf("TxD+")}) / TxD− (${pinOf("TxD−")})`, group: "serial" },
      { signal: t("Ground"), esp: "GND", via: t("common"), mac: `GND (${pinOf("GND")})`, group: "power" },
    );
    bom.push(
      { qty: 1, part: t("MAX3488 (or SN65HVD379 / a 3.3 V RS-422 module)"), why: t("The Mac's serial port is differential RS-422") },
      { qty: 1, part: port === "serial8" ? t("Male mini-DIN-8 cable (Mac printer cable)") : t("Male DE-9 connector"), why: t("Modem/Printer port") },
      { qty: 1, part: t("100 nF capacitor"), why: t("MAX3488 decoupling") },
    );
    warnings.push(t("Use the Modem port for the agent. If AppleTalk is on, the Printer port may be busy."));
  }

  // ── Power ─────────────────────────────
  if (f.power === "mac" && model.input === "adb") {
    wire({ part: "adb", pin: "3" }, esp("5V"), C.vcc, "+5 V → ESP32", "power", { net: "5V_MAC" });
    warnings.push(t("Powering the ESP32 from ADB: the bus supplies 500 mA in total. Add a 470 µF capacitor and don't hang many more ADB devices off it."));
    bom.push({ qty: 1, part: t("470 µF / 10 V electrolytic capacitor"), why: t("Soaks up the WiFi current spikes") });
  } else if (f.power === "mac" && model.input === "m0110") {
    wire({ part: "kbd-rj11", pin: "4" }, esp("5V"), C.vcc, "+5 V → ESP32", "power", { net: "5V_MAC" });
    warnings.push(t("The Mac Plus keyboard port isn't meant for 300 mA peaks. Better to power the ESP32 over USB."));
  } else {
    warnings.push(t("USB power: still connect the ESP32's ground (GND) to the Mac's."));
  }

  warnings.push(t("Check every pin of the cable for continuity with a multimeter before plugging it into the Mac. Connector diagrams show the front of the Mac's port."));

  return { board, model, connectors, modules, wires, bom, warnings, table };
}

/** Reference designators shared by the schematic and the solder guide: U = IC/module, Q = transistor, J = connector. */
export function partRefs(plan: WiringPlan): Map<string, string> {
  const refs = new Map<string, string>([["esp", "MCU"]]);
  let u = 0, q = 0;
  for (const m of plan.modules) refs.set(m.id, m.pkg.kind === "to92" ? `Q${++q}` : `U${++u}`);
  plan.connectors.forEach((id, i) => refs.set(id, `J${i + 1}`));
  return refs;
}
