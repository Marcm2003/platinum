// Classic Mac connectors as seen from the FRONT of the socket on the Mac.
// Coordinates are normalised (0..1) inside the connector face, used by the wiring diagram.

import { N_ } from "@/i18n";

export type Signal = "data" | "power" | "ground" | "clock" | "control" | "nc";

export interface ConnectorPin {
  n: number;
  name: string;
  desc: string;
  signal: Signal;
  x: number;
  y: number;
}

export interface Connector {
  id: ConnectorId;
  name: string;
  shape: "minidin" | "de9" | "rj11";
  note: string;
  pins: ConnectorPin[];
}

export type ConnectorId = "adb" | "serial8" | "serial9" | "kbd-rj11" | "mouse-de9";

export const CONNECTORS: Record<ConnectorId, Connector> = {
  adb: {
    id: "adb",
    name: N_("ADB (mini-DIN-4)"),
    shape: "minidin",
    note: N_("Apple Desktop Bus. Open-collector data line with a 5 V pull-up inside the Mac. +5 V is limited to 500 mA for the whole bus."),
    pins: [
      { n: 4, name: "GND", desc: N_("Ground"), signal: "ground", x: 0.3, y: 0.32 },
      { n: 3, name: "+5V", desc: N_("Power (max. 500 mA for the whole bus)"), signal: "power", x: 0.7, y: 0.32 },
      { n: 2, name: "PSW", desc: N_("Power-on: pull to GND to switch on (Mac II, LC, Quadra…)"), signal: "control", x: 0.24, y: 0.66 },
      { n: 1, name: "ADB", desc: N_("ADB data (bidirectional, 5 V, open collector)"), signal: "data", x: 0.76, y: 0.66 },
    ],
  },
  serial8: {
    id: "serial8",
    name: N_("Modem/Printer serial port (mini-DIN-8)"),
    shape: "minidin",
    note: N_("Differential RS-422 (Zilog 8530 SCC). Up to 57.6 kbps as standard; 230.4 kbps with an external clock on HSKi. Pin 7 (GPi) doesn't exist on the Mac Plus."),
    pins: [
      { n: 8, name: "RxD+", desc: N_("Receive +"), signal: "data", x: 0.22, y: 0.3 },
      { n: 7, name: "GPi", desc: N_("General-purpose input (not on the Mac Plus)"), signal: "control", x: 0.5, y: 0.22 },
      { n: 6, name: "TxD+", desc: N_("Transmit +"), signal: "data", x: 0.78, y: 0.3 },
      { n: 5, name: "RxD−", desc: N_("Receive −"), signal: "data", x: 0.18, y: 0.55 },
      { n: 4, name: "GND", desc: N_("Ground"), signal: "ground", x: 0.5, y: 0.5 },
      { n: 3, name: "TxD−", desc: N_("Transmit −"), signal: "data", x: 0.82, y: 0.55 },
      { n: 2, name: "HSKi", desc: N_("Handshake in / external clock"), signal: "control", x: 0.3, y: 0.78 },
      { n: 1, name: "HSKo", desc: N_("Handshake out (DTR)"), signal: "control", x: 0.7, y: 0.78 },
    ],
  },
  serial9: {
    id: "serial9",
    name: N_("Serial port (DE-9, Mac 128K/512K)"),
    shape: "de9",
    note: N_("RS-422 on a DE-9. Pins 2 (+5 V) and 6 (+12 V) carry power: don't short them."),
    pins: [
      { n: 5, name: "TxD−", desc: N_("Transmit −"), signal: "data", x: 0.14, y: 0.33 },
      { n: 4, name: "TxD+", desc: N_("Transmit +"), signal: "data", x: 0.32, y: 0.33 },
      { n: 3, name: "GND", desc: N_("Ground"), signal: "ground", x: 0.5, y: 0.33 },
      { n: 2, name: "+5V", desc: N_("+5 V"), signal: "power", x: 0.68, y: 0.33 },
      { n: 1, name: "GND", desc: N_("Ground (chassis)"), signal: "ground", x: 0.86, y: 0.33 },
      { n: 9, name: "RxD−", desc: N_("Receive −"), signal: "data", x: 0.23, y: 0.67 },
      { n: 8, name: "RxD+", desc: N_("Receive +"), signal: "data", x: 0.41, y: 0.67 },
      { n: 7, name: "HSK", desc: N_("Handshake / external clock"), signal: "control", x: 0.59, y: 0.67 },
      { n: 6, name: "+12V", desc: N_("+12 V — do not connect"), signal: "power", x: 0.77, y: 0.67 },
    ],
  },
  "kbd-rj11": {
    id: "kbd-rj11",
    name: N_("Keyboard (RJ-11 4P4C, Mac 128K/512K/Plus)"),
    shape: "rj11",
    note: N_("Synchronous M0110 protocol: the keyboard generates the clock and the Mac polls it every ~250 ms."),
    pins: [
      { n: 1, name: "GND", desc: N_("Ground"), signal: "ground", x: 0.2, y: 0.4 },
      { n: 2, name: "CLK", desc: N_("Clock (driven by the keyboard)"), signal: "clock", x: 0.4, y: 0.4 },
      { n: 3, name: "DATA", desc: N_("Bidirectional data"), signal: "data", x: 0.6, y: 0.4 },
      { n: 4, name: "+5V", desc: N_("+5 V"), signal: "power", x: 0.8, y: 0.4 },
    ],
  },
  "mouse-de9": {
    id: "mouse-de9",
    name: N_("Mouse (DE-9, Mac 128K/512K/Plus)"),
    shape: "de9",
    note: N_("Quadrature mouse: two phase-shifted signals per axis (X1/X2, Y1/Y2) and an active-low button."),
    pins: [
      { n: 5, name: "X1", desc: N_("X quadrature, phase 1"), signal: "data", x: 0.14, y: 0.33 },
      { n: 4, name: "X2", desc: N_("X quadrature, phase 2"), signal: "data", x: 0.32, y: 0.33 },
      { n: 3, name: "GND", desc: N_("Ground"), signal: "ground", x: 0.5, y: 0.33 },
      { n: 2, name: "+5V", desc: N_("+5 V"), signal: "power", x: 0.68, y: 0.33 },
      { n: 1, name: "GND", desc: N_("Ground"), signal: "ground", x: 0.86, y: 0.33 },
      { n: 9, name: "Y1", desc: N_("Y quadrature, phase 1"), signal: "data", x: 0.23, y: 0.67 },
      { n: 8, name: "Y2", desc: N_("Y quadrature, phase 2"), signal: "data", x: 0.41, y: 0.67 },
      { n: 7, name: "SW", desc: N_("Button (active low)"), signal: "control", x: 0.59, y: 0.67 },
      { n: 6, name: "NC", desc: N_("Not connected"), signal: "nc", x: 0.77, y: 0.67 },
    ],
  },
};
