// App-wide state (Zustand). Settings persist to userData/settings.json via IPC.

import { create } from "zustand";
import type { Bridge, BridgeInfo, BleDevice } from "@/lib/link/bridge";
import type { LogLine, SysInfo } from "@/lib/link/agent";
import type { NativeConfig } from "@/lib/emulator/catalog";
import { resolveLang, setLang, type LangSetting } from "@/i18n";

export type Page = "home" | "emulator" | "hardware" | "input" | "disks" | "screen" | "debug" | "settings";

export interface Settings {
  theme: "system" | "light" | "dark";
  language: LangSetting;
  chime: boolean;
  boardId: string;
  modelId: string;
  features: { input: boolean; serial: boolean; power: "usb" | "mac" };
  lastHost: string;
  serialBaud: number;
  directBaud: number;
  swapCmdCtrl: boolean;
  mouseSpeed: number;
  emu: {
    disk: string;
    machine: string;
    width: number;
    height: number;
    scale: number;
    infiniteHd: boolean;
    savedHd: boolean;
    autoPause: boolean;
  };
  native: NativeConfig & { exes: Partial<Record<NativeConfig["engine"], string>> };
  dev: { retro68: string; project: string; buildCmd: string; outputApp: string };
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  language: "system",
  chime: true,
  boardId: "esp32s3",
  modelId: "se",
  features: { input: true, serial: true, power: "usb" },
  lastHost: "platinum.local",
  serialBaud: 921600,
  directBaud: 57600,
  swapCmdCtrl: true,
  mouseSpeed: 1,
  emu: { disk: "System 7.5.3", machine: "Quadra 650", width: 640, height: 480, scale: 1, infiniteHd: true, savedHd: true, autoPause: true },
  native: { engine: "basilisk", exe: "", rom: "", disks: [], ramMB: 64, width: 800, height: 600, modelId: 30, cpu: 4, fpu: true, extraArgs: "", exes: {} },
  dev: { retro68: "", project: "", buildCmd: "cmake --build build", outputApp: "" },
};

export type LinkStatus = "disconnected" | "connecting" | "connected";

export interface BridgeLogLine { m: string; at: number; level: "info" | "warn" | "error" | "app" }
export interface AdbEvent { ev: string; addr: number; reg: number; at: number }

interface State {
  page: Page;
  settings: Settings;
  settingsLoaded: boolean;
  status: LinkStatus;
  bridge: Bridge | null;
  linkLabel: string;
  info: BridgeInfo | null;
  agentOnline: boolean;
  sysinfo: SysInfo | null;
  latency: number | null;
  bleDevices: BleDevice[];
  bridgeLog: BridgeLogLine[];
  agentLog: LogLine[];
  adbEvents: AdbEvent[];
  toasts: { id: number; text: string; kind: "ok" | "err" | "info" }[];
  /** Disk image sent from Disk Studio to boot in the embedded emulator. */
  pendingDiskUrl: { name: string; url: string } | null;

  go(p: Page): void;
  patchSettings(p: Partial<Settings>): void;
  log(m: string, level?: BridgeLogLine["level"]): void;
  toast(text: string, kind?: "ok" | "err" | "info"): void;
  set(p: Partial<State>): void;
}

let toastId = 0;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

export const useApp = create<State>((set, get) => ({
  page: "home",
  settings: DEFAULT_SETTINGS,
  settingsLoaded: false,
  status: "disconnected",
  bridge: null,
  linkLabel: "",
  info: null,
  agentOnline: false,
  sysinfo: null,
  latency: null,
  bleDevices: [],
  bridgeLog: [],
  agentLog: [],
  adbEvents: [],
  toasts: [],
  pendingDiskUrl: null,

  go: (page) => set({ page }),
  patchSettings: (p) => {
    const settings = { ...get().settings, ...p };
    if (p.language) setLang(resolveLang(p.language));
    set({ settings });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => window.platinum.saveSettings(settings), 300);
  },
  log: (m, level = "info") => set((s) => ({ bridgeLog: [...s.bridgeLog.slice(-999), { m, at: Date.now(), level }] })),
  toast: (text, kind = "info") => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4200);
  },
  set: (p) => set(p),
}));

export async function loadSettings() {
  const saved = (await window.platinum.loadSettings()) as Partial<Settings> | null;
  const s = { ...DEFAULT_SETTINGS, ...saved };
  s.emu = { ...DEFAULT_SETTINGS.emu, ...saved?.emu };
  s.native = { ...DEFAULT_SETTINGS.native, ...saved?.native };
  s.dev = { ...DEFAULT_SETTINGS.dev, ...saved?.dev };
  s.features = { ...DEFAULT_SETTINGS.features, ...saved?.features };
  setLang(resolveLang(s.language));
  useApp.setState({ settings: s, settingsLoaded: true });
  window.platinum.setTheme(s.theme);
}
