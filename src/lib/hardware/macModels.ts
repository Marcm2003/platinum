// Classic Macintosh models: what ports they have and how to emulate them.

export type InputBus = "m0110" | "adb";
export type SerialKind = "de9" | "minidin8";
export type Cpu = "68000" | "68020" | "68030" | "68040" | "PPC601" | "PPC603" | "PPC604" | "G3";
export type Form = "compact" | "modular" | "lc" | "tower" | "allinone";

export interface MacModel {
  id: string;
  name: string;
  year: number;
  cpu: Cpu;
  form: Form;
  input: InputBus;
  adbPorts?: number;
  serial: SerialKind;
  /** Native screen when built in. */
  screen?: { w: number; h: number; depth: 1 | 8 | 16 };
  /** Infinite Mac machine name (embedded emulator), when available. */
  infiniteMachine?: string;
  /** Best native emulator. */
  nativeEngine: "minivmac" | "basilisk" | "sheepshaver" | "qemu";
  /** Basilisk II "modelid" (Gestalt ID − 6) when relevant. */
  basiliskModelId?: number;
  maxSystem: string;
  minSystem: string;
}

export const MAC_MODELS: MacModel[] = [
  { id: "128k", name: "Macintosh 128K", year: 1984, cpu: "68000", form: "compact", input: "m0110", serial: "de9", screen: { w: 512, h: 342, depth: 1 }, infiniteMachine: "Mac 128K", nativeEngine: "minivmac", minSystem: "System 1.0", maxSystem: "System 2.0" },
  { id: "512k", name: "Macintosh 512K", year: 1984, cpu: "68000", form: "compact", input: "m0110", serial: "de9", screen: { w: 512, h: 342, depth: 1 }, infiniteMachine: "Mac 512Ke", nativeEngine: "minivmac", minSystem: "System 1.0", maxSystem: "System 4.1" },
  { id: "plus", name: "Macintosh Plus", year: 1986, cpu: "68000", form: "compact", input: "m0110", serial: "minidin8", screen: { w: 512, h: 342, depth: 1 }, infiniteMachine: "Mac Plus", nativeEngine: "minivmac", minSystem: "System 3.0", maxSystem: "System 7.5.5" },
  { id: "se", name: "Macintosh SE", year: 1987, cpu: "68000", form: "compact", input: "adb", adbPorts: 2, serial: "minidin8", screen: { w: 512, h: 342, depth: 1 }, infiniteMachine: "Mac SE", nativeEngine: "minivmac", minSystem: "System 4.0", maxSystem: "System 7.5.5" },
  { id: "macii", name: "Macintosh II", year: 1987, cpu: "68020", form: "modular", input: "adb", adbPorts: 2, serial: "minidin8", infiniteMachine: "Mac II", nativeEngine: "minivmac", minSystem: "System 4.1", maxSystem: "System 7.5.5" },
  { id: "se30", name: "Macintosh SE/30", year: 1989, cpu: "68030", form: "compact", input: "adb", adbPorts: 2, serial: "minidin8", screen: { w: 512, h: 342, depth: 1 }, infiniteMachine: "Mac SE/30 (Snow)", nativeEngine: "basilisk", basiliskModelId: 3, minSystem: "System 6.0.3", maxSystem: "Mac OS 7.6.1" },
  { id: "iicx", name: "Macintosh IIcx", year: 1989, cpu: "68030", form: "modular", input: "adb", adbPorts: 2, serial: "minidin8", infiniteMachine: "Mac IIcx (Snow)", nativeEngine: "basilisk", basiliskModelId: 2, minSystem: "System 6.0.3", maxSystem: "Mac OS 7.6.1" },
  { id: "classic", name: "Macintosh Classic", year: 1990, cpu: "68000", form: "compact", input: "adb", adbPorts: 1, serial: "minidin8", screen: { w: 512, h: 342, depth: 1 }, infiniteMachine: "Mac Classic (Snow)", nativeEngine: "minivmac", minSystem: "System 6.0.7", maxSystem: "System 7.5.5" },
  { id: "lc", name: "Macintosh LC", year: 1990, cpu: "68020", form: "lc", input: "adb", adbPorts: 1, serial: "minidin8", nativeEngine: "basilisk", basiliskModelId: 13, minSystem: "System 6.0.7", maxSystem: "System 7.5.5" },
  { id: "iici", name: "Macintosh IIci", year: 1989, cpu: "68030", form: "modular", input: "adb", adbPorts: 2, serial: "minidin8", nativeEngine: "basilisk", basiliskModelId: 5, minSystem: "System 6.0.4", maxSystem: "Mac OS 7.6.1" },
  { id: "iifx", name: "Macintosh IIfx", year: 1990, cpu: "68030", form: "modular", input: "adb", adbPorts: 2, serial: "minidin8", infiniteMachine: "Mac IIfx", nativeEngine: "basilisk", basiliskModelId: 7, minSystem: "System 6.0.5", maxSystem: "Mac OS 7.6.1" },
  { id: "classic2", name: "Macintosh Classic II", year: 1991, cpu: "68030", form: "compact", input: "adb", adbPorts: 1, serial: "minidin8", screen: { w: 512, h: 342, depth: 1 }, nativeEngine: "basilisk", basiliskModelId: 17, minSystem: "System 7.0.1", maxSystem: "Mac OS 7.6.1" },
  { id: "q650", name: "Quadra 650", year: 1993, cpu: "68040", form: "tower", input: "adb", adbPorts: 2, serial: "minidin8", infiniteMachine: "Quadra 650", nativeEngine: "basilisk", basiliskModelId: 30, minSystem: "System 7.1", maxSystem: "Mac OS 8.1" },
  { id: "q800", name: "Quadra 800", year: 1993, cpu: "68040", form: "tower", input: "adb", adbPorts: 1, serial: "minidin8", nativeEngine: "basilisk", basiliskModelId: 29, minSystem: "System 7.1", maxSystem: "Mac OS 8.1" },
  { id: "pm6100", name: "Power Macintosh 6100", year: 1994, cpu: "PPC601", form: "lc", input: "adb", adbPorts: 1, serial: "minidin8", infiniteMachine: "Power Macintosh 6100", nativeEngine: "sheepshaver", minSystem: "System 7.1.2", maxSystem: "Mac OS 9.1" },
  { id: "pm7500", name: "Power Macintosh 7500", year: 1995, cpu: "PPC601", form: "modular", input: "adb", adbPorts: 1, serial: "minidin8", infiniteMachine: "Power Macintosh 7500", nativeEngine: "sheepshaver", minSystem: "System 7.5.2", maxSystem: "Mac OS 9.1" },
  { id: "pm9500", name: "Power Macintosh 9500", year: 1995, cpu: "PPC604", form: "tower", input: "adb", adbPorts: 1, serial: "minidin8", infiniteMachine: "Power Macintosh 9500", nativeEngine: "sheepshaver", minSystem: "System 7.5.2", maxSystem: "Mac OS 9.1" },
  { id: "g3beige", name: "Power Macintosh G3 (Beige)", year: 1997, cpu: "G3", form: "modular", input: "adb", adbPorts: 1, serial: "minidin8", infiniteMachine: "Power Macintosh G3 (Beige)", nativeEngine: "qemu", minSystem: "Mac OS 8.0", maxSystem: "Mac OS 9.2.2" },
];

export const modelById = (id: string) => MAC_MODELS.find((m) => m.id === id) ?? MAC_MODELS[2];
