// ESP32 dev boards: physical header layout + the pin roles used by the Platinum Bridge firmware.
// Keep in sync with firmware/platinum-bridge/config.h.

import { N_ } from "@/i18n";

export type Role =
  | "ADB_DATA" | "ADB_PSW"
  | "SER_TX" | "SER_RX"
  | "KBD_CLK" | "KBD_DATA"
  | "MOUSE_X1" | "MOUSE_X2" | "MOUSE_Y1" | "MOUSE_Y2" | "MOUSE_SW"
  | "LED"
  | "I2S_BCK" | "I2S_WS" | "I2S_DIN";

export interface Board {
  id: "esp32s3" | "esp32" | "esp32c3-oled" | "esp32c3";
  name: string;
  /** Short chip name for diagrams, and the module/chip label printed on the board drawing. */
  shortChip: string;
  module: string;
  chip: string;
  bluetooth: string;
  notes: string;
  /** Header pins top→bottom, USB connector at the bottom. */
  left: string[];
  right: string[];
  /** GPIO per role; -1 when the board doesn't have it. ESP32-C3 boards share ADB and M0110 pins. */
  roles: Record<Role, number>;
  fqbn: string;
  /** Firmware profile define, for boards that share a chip (see firmware config.h). */
  define?: string;
  /** Status screen: built in, or an optional external 0.96" OLED on these I2C pins. */
  display: { kind: "builtin-72x40" | "optional-128x64"; sda: number; scl: number };
}

export const BOARDS: Board[] = [
  {
    id: "esp32s3",
    name: "ESP32-S3-DevKitC-1",
    shortChip: "ESP32-S3",
    module: "ESP32-S3-WROOM-1",
    chip: "ESP32-S3 (Xtensa LX7 dual-core, 240 MHz)",
    bluetooth: N_("Bluetooth LE 5 (BLE keyboards and mice)"),
    notes: N_("Recommended: native USB, more RAM and the LCD_CAM peripheral for future video capture."),
    left: ["3V3", "3V3", "RST", "4", "5", "6", "7", "15", "16", "17", "18", "8", "3", "46", "9", "10", "11", "12", "13", "14", "5V", "GND"],
    right: ["GND", "43", "44", "1", "2", "42", "41", "40", "39", "38", "37", "36", "35", "0", "45", "48", "47", "21", "20", "19", "GND", "GND"],
    roles: {
      ADB_DATA: 4, ADB_PSW: 5,
      SER_TX: 17, SER_RX: 18,
      KBD_CLK: 10, KBD_DATA: 11,
      MOUSE_X1: 12, MOUSE_X2: 13, MOUSE_Y1: 14, MOUSE_Y2: 15, MOUSE_SW: 16,
      LED: 48,
      I2S_BCK: 39, I2S_WS: 40, I2S_DIN: 41,
    },
    fqbn: "esp32:esp32:esp32s3:CDCOnBoot=cdc,PartitionScheme=min_spiffs",
    display: { kind: "optional-128x64", sda: 8, scl: 9 },
  },
  {
    id: "esp32",
    name: "ESP32-DevKitC (WROOM-32)",
    shortChip: "ESP32",
    module: "ESP32-WROOM-32",
    chip: "ESP32 (Xtensa LX6 dual-core, 240 MHz)",
    bluetooth: N_("Bluetooth Classic + LE 4.2"),
    notes: N_("The most common and cheapest. GPIO 34–39 are input-only."),
    left: ["3V3", "EN", "36", "39", "34", "35", "32", "33", "25", "26", "27", "14", "12", "GND", "13", "9", "10", "11", "5V"],
    right: ["GND", "23", "22", "1", "3", "21", "GND", "19", "18", "5", "17", "16", "4", "0", "2", "15", "8", "7", "6"],
    roles: {
      ADB_DATA: 25, ADB_PSW: 26,
      SER_TX: 17, SER_RX: 16,
      KBD_CLK: 32, KBD_DATA: 33,
      MOUSE_X1: 21, MOUSE_X2: 22, MOUSE_Y1: 23, MOUSE_Y2: 27, MOUSE_SW: 13,
      LED: 2,
      I2S_BCK: 14, I2S_WS: 4, I2S_DIN: 35,
    },
    fqbn: "esp32:esp32:esp32:PartitionScheme=min_spiffs",
    display: { kind: "optional-128x64", sda: 18, scl: 19 },
  },
  {
    id: "esp32c3-oled",
    name: "ESP32-C3 with 0.42\" OLED",
    shortChip: "ESP32-C3",
    module: "ESP32-C3 + OLED",
    chip: "ESP32-C3 (RISC-V single-core, 160 MHz)",
    bluetooth: N_("Bluetooth LE 5 (BLE keyboards and mice)"),
    notes: N_("Tiny and cheap, with a built-in status screen. Single core, so ADB timing is tighter: prefer the S3 if you have one. ADB and M0110 share pins."),
    // Pin rows vary between sellers: check the silkscreen. USB at the bottom.
    left: ["21", "20", "10", "9", "8", "7", "6", "5"],
    right: ["0", "1", "2", "3", "4", "3V3", "GND", "5V"],
    roles: {
      ADB_DATA: 3, ADB_PSW: 4,
      SER_TX: 0, SER_RX: 1,
      KBD_CLK: 3, KBD_DATA: 4,
      MOUSE_X1: 20, MOUSE_X2: 21, MOUSE_Y1: 7, MOUSE_Y2: 10, MOUSE_SW: 2,
      LED: 8,
      I2S_BCK: -1, I2S_WS: -1, I2S_DIN: -1,
    },
    fqbn: "esp32:esp32:esp32c3:CDCOnBoot=cdc,PartitionScheme=min_spiffs",
    define: "PLATINUM_BOARD_ESP32C3_OLED",
    display: { kind: "builtin-72x40", sda: 5, scl: 6 },
  },
  {
    id: "esp32c3",
    name: "ESP32-C3 SuperMini",
    shortChip: "ESP32-C3",
    module: "ESP32-C3",
    chip: "ESP32-C3 (RISC-V single-core, 160 MHz)",
    bluetooth: N_("Bluetooth LE 5 (BLE keyboards and mice)"),
    notes: N_("The smallest option. Single core, so ADB timing is tighter: prefer the S3 if you have one. ADB and M0110 share pins."),
    left: ["21", "20", "10", "9", "8", "7", "6", "5"],
    right: ["0", "1", "2", "3", "4", "3V3", "GND", "5V"],
    roles: {
      ADB_DATA: 3, ADB_PSW: 4,
      SER_TX: 0, SER_RX: 1,
      KBD_CLK: 3, KBD_DATA: 4,
      MOUSE_X1: 20, MOUSE_X2: 21, MOUSE_Y1: 7, MOUSE_Y2: 10, MOUSE_SW: 2,
      LED: 8,
      I2S_BCK: -1, I2S_WS: -1, I2S_DIN: -1,
    },
    fqbn: "esp32:esp32:esp32c3:CDCOnBoot=cdc,PartitionScheme=min_spiffs",
    define: "PLATINUM_BOARD_ESP32C3_SUPERMINI",
    display: { kind: "optional-128x64", sda: 5, scl: 6 },
  },
];

/** arduino-cli flags that select a board's firmware profile. */
export const boardBuildFlags = (b: Board) => (b.define ? ` --build-property "compiler.cpp.extra_flags=-D${b.define}"` : "");

export const boardById = (id: string) => BOARDS.find((b) => b.id === id) ?? BOARDS[0];
