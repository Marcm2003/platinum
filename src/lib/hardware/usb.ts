// Recognising ESP32 boards among the computer's serial ports, by USB vendor/product ID.

import type { SerialPortInfo } from "@/shared/ipc";
import { BOARDS, type Board } from "./boards";

export type UsbKind = "native" | "bridge" | "other";

export interface UsbDescription { kind: UsbKind; label: string; chips: Board["shortChip"][] }

const BRIDGES: Record<string, string> = {
  "10C4:EA60": "CP210x",
  "1A86:7523": "CH340",
  "1A86:7522": "CH340K",
  "1A86:55D4": "CH9102",
  "1A86:55D3": "CH343",
  "0403:6001": "FTDI FT232R",
  "0403:6010": "FTDI FT2232",
  "0403:6014": "FTDI FT232H",
  "0403:6015": "FTDI FT-X",
};

export function describePort(p: SerialPortInfo): UsbDescription {
  const id = `${p.vendorId ?? ""}:${p.productId ?? ""}`;
  // Espressif's own USB: the S3/C3 "USB-Serial/JTAG" (1001) or TinyUSB CDC on the S2/S3.
  if (p.vendorId === "303A") return { kind: "native", label: p.productId === "1001" ? "Espressif USB-Serial/JTAG" : "Espressif USB", chips: ["ESP32-S3", "ESP32-C3"] };
  if (BRIDGES[id]) return { kind: "bridge", label: BRIDGES[id], chips: ["ESP32", "ESP32-S3", "ESP32-C3"] };
  return { kind: "other", label: p.name ?? p.manufacturer ?? "", chips: [] };
}

/** Best port for this board: a native Espressif port for S3/C3 boards, a USB-UART bridge otherwise. */
export function bestPort(ports: SerialPortInfo[], board: Board): SerialPortInfo | undefined {
  const score = (p: SerialPortInfo) => {
    const d = describePort(p);
    if (d.kind === "other") return 0;
    const wantsNative = board.shortChip !== "ESP32";
    return (d.kind === "native") === wantsNative ? 2 : 1;
  };
  return [...ports].filter((p) => score(p) > 0).sort((a, b) => score(b) - score(a))[0];
}

/** Boards whose chip matches what esptool reported, e.g. "ESP32-C3 (QFN32) (revision v0.4)". */
export function boardsForChip(chip: string): Board[] {
  const family = /^ESP32-S3/i.test(chip) ? "ESP32-S3" : /^ESP32-C3/i.test(chip) ? "ESP32-C3" : /^ESP32(?![-\w])/i.test(chip) || /^ESP32-D0/i.test(chip) ? "ESP32" : null;
  return family ? BOARDS.filter((b) => b.shortChip === family) : [];
}
