import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/state/store";
import { BOARDS, type Role } from "@/lib/hardware/boards";
import { MAC_MODELS } from "@/lib/hardware/macModels";
import { CONNECTORS } from "@/lib/hardware/connectors";
import { buildWiring } from "@/lib/hardware/wiring";
import { BoardView, ConnectorFace, WiringDiagram } from "@/ui/WiringDiagram";
import { CopyBlock, Field, PageHead, Seg, SettingRow, Toggle, ConnectSheet } from "@/ui/components";
import { Icon, PixelIcon } from "@/ui/icons";
import { useCommand } from "@/ui/useCommand";
import { N_, t, tx } from "@/i18n";
import { joinPath } from "@/lib/paths";

type Tab = "wiring" | "bridge" | "firmware";

export function Hardware() {
  const [tab, setTab] = useState<Tab>("wiring");
  return (
    <div style={{ maxWidth: 1240 }}>
      <PageHead kicker={t("ESP32 bridge")} title={t("Hardware & link")} desc={t("Pick your Mac and your board: Platinum tells you exactly what to connect to each pin, with which parts and in what order.")} />
      <div className="tabs">
        <button className={`tab ${tab === "wiring" ? "on" : ""}`} onClick={() => setTab("wiring")}><Icon name="cable" size={14} /> {t("Wiring")}</button>
        <button className={`tab ${tab === "firmware" ? "on" : ""}`} onClick={() => setTab("firmware")}><Icon name="bolt" size={14} /> Firmware</button>
        <button className={`tab ${tab === "bridge" ? "on" : ""}`} onClick={() => setTab("bridge")}><Icon name="wifi" size={14} /> {t("Bridge & network")}</button>
      </div>
      {tab === "wiring" && <Wiring />}
      {tab === "firmware" && <Firmware />}
      {tab === "bridge" && <BridgePanel />}
    </div>
  );
}

const ROLE_LABELS: Partial<Record<Role, string>> = {
  ADB_DATA: N_("ADB data"), ADB_PSW: N_("Power-on"), SER_TX: N_("Serial TX"), SER_RX: N_("Serial RX"),
  KBD_CLK: N_("Keyboard CLK"), KBD_DATA: N_("Keyboard DATA"), MOUSE_X1: N_("Mouse X1"), MOUSE_X2: N_("Mouse X2"),
  MOUSE_Y1: N_("Mouse Y1"), MOUSE_Y2: N_("Mouse Y2"), MOUSE_SW: N_("Mouse button"),
};

function Wiring() {
  const { settings, patchSettings } = useApp();
  const [hover, setHover] = useState<string | null>(null);
  // The plan's text is translated as it is built, so rebuild it when the language changes too.
  const plan = useMemo(() => buildWiring(settings.boardId, settings.modelId, settings.features), [settings.boardId, settings.modelId, settings.features, settings.language]);
  const f = settings.features;
  const setF = (p: Partial<typeof f>) => patchSettings({ features: { ...f, ...p } });

  const roles = useMemo(() => {
    const m = new Map<number, { label: string; color: string }>();
    for (const w of plan.wires) {
      for (const e of [w.from, w.to]) {
        if (e.part !== "esp" || !e.pin.startsWith("GPIO")) continue;
        const gpio = Number(e.pin.slice(4));
        const role = (Object.entries(plan.board.roles) as [Role, number][]).find(([, g]) => g === gpio)?.[0];
        if (role) m.set(gpio, { label: t(ROLE_LABELS[role] ?? role), color: w.color });
      }
    }
    return m;
  }, [plan]);

  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="card card-pad">
        <div className="grid" style={{ gridTemplateColumns: "1.2fr 1fr 1.6fr", gap: 20, alignItems: "end" }}>
          <Field label={t("Your Mac")}>
            <select className="select" value={settings.modelId} onChange={(e) => patchSettings({ modelId: e.target.value })}>
              {MAC_MODELS.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.year})</option>)}
            </select>
          </Field>
          <Field label={t("ESP32 board")}>
            <select className="select" value={settings.boardId} onChange={(e) => patchSettings({ boardId: e.target.value })}>
              {BOARDS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <div className="row wrap" style={{ gap: 16 }}>
            <label className="row small strong"><Toggle on={f.input} onChange={(v) => setF({ input: v })} /> {t("Keyboard & mouse")}</label>
            <label className="row small strong"><Toggle on={f.serial} onChange={(v) => setF({ serial: v })} /> {t("Serial port")}</label>
            <Seg value={f.power} onChange={(v) => setF({ power: v })} options={[{ value: "usb", label: t("USB power") }, { value: "mac", label: t("Mac power") }]} />
          </div>
        </div>
        <div className="row wrap small muted" style={{ marginTop: 12, gap: 14 }}>
          <span className="pixel-tag">{plan.model.input === "adb" ? "ADB" : t("M0110 + quadrature")}</span>
          <span>{plan.model.cpu} · {plan.model.serial === "minidin8" ? t("mini-DIN-8 serial") : t("DE-9 serial")}{plan.model.adbPorts ? ` · ${plan.model.adbPorts === 1 ? t("1 ADB port") : t("{n} ADB ports", { n: plan.model.adbPorts })}` : ""}</span>
          <span>{t(plan.board.bluetooth)}</span>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>{t("Schematic")}</h3><span className="sub">{t("Hover over a wire or a pin to highlight it")}</span></div>
        <div style={{ overflowX: "auto", padding: "8px 8px 0" }}>
          <WiringDiagram plan={plan} hover={hover} setHover={setHover} />
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1.3fr 1fr" }}>
        <div className="card">
          <div className="card-head"><h3>{t("Pin-by-pin connections")}</h3></div>
          <table className="tbl">
            <thead><tr><th>{t("Signal")}</th><th>ESP32</th><th>{t("Through")}</th><th>Mac</th></tr></thead>
            <tbody>
              {plan.table.map((r, i) => {
                const wire = plan.wires.find((w) => w.from.pin === r.esp || w.label === r.signal);
                return (
                  <tr key={i} onMouseEnter={() => wire && setHover(wire.id)} onMouseLeave={() => setHover(null)}>
                    <td className="strong"><span className="dot" style={{ display: "inline-block", marginRight: 8, color: wire?.color ?? "var(--faint)" }} />{r.signal}</td>
                    <td className="mono">{r.esp}</td><td className="small">{r.via}</td><td className="mono">{r.mac}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="card-head"><h3>{t("Where each pin is on the board")}</h3><span className="sub">{plan.board.name}</span></div>
          <div style={{ padding: 12 }}><BoardView board={plan.board} roles={roles} /></div>
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="card-head"><h3>{t("Parts list")}</h3></div>
          {plan.bom.map((b, i) => (
            <div key={i} className="list-row">
              <span className="kbd">{b.qty}×</span>
              <div className="grow"><div className="strong">{b.part}</div><div className="small muted">{b.why}</div></div>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-head"><h3>{t("Before you plug in")}</h3></div>
          {plan.warnings.map((w, i) => (
            <div key={i} className="list-row" style={{ alignItems: "flex-start" }}>
              <span style={{ color: "var(--warn)", marginTop: 2 }}><Icon name="warn" size={15} /></span>
              <div className="grow small">{w}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid g2">
        {plan.connectors.map((id) => {
          const c = CONNECTORS[id];
          return (
            <div key={id} className="card">
              <div className="card-head"><h3>{t(c.name)}</h3></div>
              <div className="row" style={{ alignItems: "flex-start", padding: 16, gap: 18 }}>
                <svg viewBox="0 0 150 165" width={150} style={{ flex: "none" }}><ConnectorFace c={c} size={150} /></svg>
                <div className="col" style={{ gap: 4, flex: 1 }}>
                  <div className="small muted" style={{ marginBottom: 6 }}>{t(c.note)}</div>
                  {[...c.pins].sort((a, b) => a.n - b.n).map((p) => (
                    <div key={p.n} className="row small"><span className="kbd">{p.n}</span><span className="mono strong" style={{ width: 46 }}>{p.name}</span><span className="muted">{t(p.desc)}</span></div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───────────── Firmware ─────────────

function Firmware() {
  const { settings } = useApp();
  const board = BOARDS.find((b) => b.id === settings.boardId)!;
  const [dir, setDir] = useState("");
  const [port, setPort] = useState(() => ({ win32: "COM5", darwin: "/dev/cu.usbmodem1101" })[window.platinum.platform] ?? "/dev/ttyACM0");
  const cmd = useCommand();
  const consoleRef = useRef<HTMLDivElement>(null);
  useEffect(() => { window.platinum.appInfo().then((i) => setDir(joinPath(i.firmwareDir, "platinum-bridge"))); }, []);
  useEffect(() => { consoleRef.current?.scrollTo(0, 1e9); }, [cmd.lines]);

  const libs = `arduino-cli core install esp32:esp32\narduino-cli lib install "NimBLE-Arduino" "WebSockets" "ArduinoJson"`;
  const compile = `arduino-cli compile --fqbn ${board.fqbn} "${dir}"`;
  const upload = `arduino-cli upload -p ${port} --fqbn ${board.fqbn} "${dir}"`;

  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr 1.1fr" }}>
      <div className="col" style={{ gap: 16 }}>
        <div className="card card-pad col" style={{ gap: 14 }}>
          <div className="row"><PixelIcon name="chip" size={30} /><div><h3>Platinum Bridge firmware</h3><div className="small muted">Arduino · ESP32 core 3.x · {board.name}</div></div></div>
          <div className="small muted">{t("The firmware speaks ADB or M0110 to the Mac, takes BLE keyboards and mice, bridges the RS-422 serial port to WiFi, and talks to Platinum over USB, WebSocket or BLE.")}</div>
          <Field label={t("1 · Install the core and libraries (once)")}><CopyBlock text={libs} /></Field>
          <Field label={t("2 · Compile")}><CopyBlock text={compile} /></Field>
          <Field label={t("3 · Upload to the board")}>
            <div className="row" style={{ marginBottom: 6 }}><span className="small">{t("Port:")}</span><input className="input mono" style={{ width: 110 }} value={port} onChange={(e) => setPort(e.target.value)} /></div>
            <CopyBlock text={upload} />
          </Field>
          <div className="row">
            <button className="btn" disabled={cmd.running} onClick={() => cmd.run(libs.replace("\n", " && "))}>{t("Install")}</button>
            <button className="btn" disabled={cmd.running} onClick={() => cmd.run(compile)}><Icon name="hammer" size={14} /> {t("Compile")}</button>
            <button className="btn primary" disabled={cmd.running} onClick={async () => { if ((await cmd.run(compile)) === 0) await cmd.run(upload); }}><Icon name="bolt" size={14} /> {t("Compile & upload")}</button>
            {cmd.running && <button className="btn danger" onClick={cmd.kill}>{t("Stop")}</button>}
          </div>
          <div className="hint">{t("If it's your first time with an ESP32-S3 and it isn't detected: hold BOOT, press RST and release BOOT.")}</div>
        </div>
      </div>
      <div className="card" style={{ display: "flex", flexDirection: "column", minHeight: 420 }}>
        <div className="card-head"><h3>{t("Output")}</h3><button className="btn sm right" onClick={cmd.clear}>{t("Clear")}</button></div>
        <div ref={consoleRef} className="console" style={{ flex: 1 }}>
          {cmd.lines.length === 0 && <div className="ln lv0">{t("arduino-cli output will appear here.")}</div>}
          {cmd.lines.map((l, i) => <div key={i} className={`ln ${l.s === "err" ? "lv2" : l.s === "sys" ? "app" : "lv1"}`}>{l.t}</div>)}
        </div>
      </div>
    </div>
  );
}

// ───────────── Bridge / network ─────────────

function BridgePanel() {
  const { status, bridge, info, bridgeLog, settings, patchSettings, toast } = useApp();
  const [ssid, setSsid] = useState("");
  const [pass, setPass] = useState("");
  const [connectOpen, setConnectOpen] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { logRef.current?.scrollTo(0, 1e9); }, [bridgeLog]);
  const live = status === "connected" && bridge && !bridge.direct;

  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr 1.1fr" }}>
      <div className="col" style={{ gap: 16 }}>
        <div className="card">
          <div className="card-head"><h3>{t("Bridge status")}</h3>
            <button className="btn sm right" onClick={() => setConnectOpen(true)}>{status === "connected" ? t("Connection…") : t("Connect…")}</button>
          </div>
          {info ? (
            <>
              <SettingRow title="Firmware" desc={info.board}><span className="mono">v{info.fw}</span></SettingRow>
              <SettingRow title={t("Mac mode")} desc={info.macPolling ? t("The Mac is polling the bus") : t("No traffic from the Mac yet")}><span className={`pill ${info.macPolling ? "ok" : ""}`}>{info.mode.toUpperCase()}</span></SettingRow>
              <SettingRow title="WiFi" desc={info.ip ? `${info.ip} · ${info.rssi} dBm` : t("Not connected")}><span className="small">{info.ssid ?? "—"}</span></SettingRow>
              <SettingRow title={t("Mac serial speed")} desc={t("Must match the agent (57600 by default)")}>
                <select className="select" style={{ width: 110 }} value={info.baud ?? 57600} onChange={(e) => bridge?.configure({ baud: Number(e.target.value) })}>
                  {[9600, 19200, 38400, 57600, 115200, 230400].map((b) => <option key={b}>{b}</option>)}
                </select>
              </SettingRow>
              <div className="list-row"><button className="btn sm" onClick={() => bridge?.power()}><Icon name="power" size={13} /> {t("Power on the Mac (PSW)")}</button><button className="btn sm" onClick={() => bridge?.reboot()}><Icon name="refresh" size={13} /> {t("Restart the ESP32")}</button></div>
            </>
          ) : (
            <div className="list-row small muted">{status === "connected" ? t("Direct link: there's no ESP32.") : t("Connect the bridge over USB to set it up.")}</div>
          )}
        </div>

        <div className="card card-pad col" style={{ gap: 12 }}>
          <h3>{t("Set up the bridge's WiFi")}</h3>
          <div className="small muted">{tx("Sent over the current link (USB is best). The bridge restarts and shows up as {host}.", { host: <code>platinum.local</code> })}</div>
          <div className="grid g2">
            <Field label={t("Network (SSID)")}><input className="input" value={ssid} onChange={(e) => setSsid(e.target.value)} /></Field>
            <Field label={t("Password")}><input className="input" type="password" value={pass} onChange={(e) => setPass(e.target.value)} /></Field>
          </div>
          <button className="btn primary" style={{ alignSelf: "flex-start" }} disabled={!live || !ssid} onClick={async () => { await bridge!.wifi(ssid, pass); toast(t("Credentials sent. The bridge is restarting…"), "ok"); }}>{t("Save to the bridge")}</button>
          <div className="hint">{tx("With no network set up, the bridge creates the {ap} access point (password {pw}) at 192.168.4.1.", { ap: <b>Platinum-XXXX</b>, pw: <code>macintosh</code> })}</div>
        </div>

        <div className="card card-pad col" style={{ gap: 10 }}>
          <h3>{t("Speeds")}</h3>
          <div className="grid g2">
            <Field label="USB (ESP32)"><select className="select" value={settings.serialBaud} onChange={(e) => patchSettings({ serialBaud: Number(e.target.value) })}>{[115200, 460800, 921600].map((b) => <option key={b}>{b}</option>)}</select></Field>
            <Field label={t("Direct serial (Mac)")}><select className="select" value={settings.directBaud} onChange={(e) => patchSettings({ directBaud: Number(e.target.value) })}>{[9600, 19200, 57600, 115200, 230400].map((b) => <option key={b}>{b}</option>)}</select></Field>
          </div>
        </div>
      </div>

      <div className="card" style={{ display: "flex", flexDirection: "column", minHeight: 480 }}>
        <div className="card-head"><h3>{t("Bridge log")}</h3><span className="sub">{bridge ? `↓ ${bridge.rx} B · ↑ ${bridge.tx} B` : ""}</span><button className="btn sm right" onClick={() => useApp.setState({ bridgeLog: [] })}>{t("Clear")}</button></div>
        <div ref={logRef} className="console" style={{ flex: 1 }}>
          {bridgeLog.length === 0 && <div className="ln lv0">{t("No messages yet.")}</div>}
          {bridgeLog.map((l, i) => (
            <div key={i} className={`ln ${l.level === "app" ? "app" : l.level === "warn" ? "lv2" : l.level === "error" ? "lv3" : "lv1"}`}>
              <span className="t">{new Date(l.at).toLocaleTimeString()}</span>{l.m}
            </div>
          ))}
        </div>
      </div>
      {connectOpen && <ConnectSheet onClose={() => setConnectOpen(false)} />}
    </div>
  );
}
