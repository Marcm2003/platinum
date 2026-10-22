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
  id: "esp32s3" | "esp32";
  name: string;
  chip: string;
  bluetooth: string;
  notes: string;
  /** Header pins top→bottom, USB connector at the bottom. */
  left: string[];
  right: string[];
  roles: Record<Role, number>;
  fqbn: string;
}

export const BOARDS: Board[] = [
  {
    id: "esp32s3",
    name: "ESP32-S3-DevKitC-1",
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
    fqbn: "esp32:esp32:esp32s3:CDCOnBoot=cdc",
  },
  {
    id: "esp32",
    name: "ESP32-DevKitC (WROOM-32)",
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
    fqbn: "esp32:esp32:esp32",
  },
];

export const boardById = (id: string) => BOARDS.find((b) => b.id === id) ?? BOARDS[0];
