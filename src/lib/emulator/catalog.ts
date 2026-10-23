// Emulation catalog: system versions, machines and how to boot them,
// either embedded (Infinite Mac, Apache-2.0) or with a native emulator.

import { N_ } from "@/i18n";

export type Era = "classic" | "system7" | "macos8" | "macos9" | "macosx";

export interface SystemVersion {
  /** Exact disk name Infinite Mac accepts in ?disk= */
  disk: string;
  label: string;
  year: number;
  era: Era;
  /** Recommended / compatible Infinite Mac machines (first = default). */
  machines: string[];
  arch: "68k" | "ppc";
  blurb: string;
}

const M68K_COMPACT = ["Mac Plus", "Mac SE", "Mac 512Ke", "Mac II", "Mac IIx"];
const M68K_COLOR = ["Quadra 650", "Mac IIfx", "Mac IIcx (Snow)", "Mac SE/30 (Snow)", "Mac II"];
const PPC_OLD = ["Power Macintosh 9500", "Power Macintosh 6100", "Power Macintosh 7500"];
const PPC_G3 = ["Power Macintosh G3 (Beige)", "Power Macintosh G3 (Blue & White)", "Power Macintosh 9500"];

export const SYSTEMS: SystemVersion[] = [
  { disk: "System 1.0", label: "System 1.0", year: 1984, era: "classic", arch: "68k", machines: ["Mac 128K", "Mac 128K (Snow)", "Mac 512Ke"], blurb: N_("The original. MacPaint, MacWrite and Finder 1.0.") },
  { disk: "System 2.0", label: "System 2.0", year: 1985, era: "classic", arch: "68k", machines: ["Mac 128K (Snow)", "Mac 512Ke"], blurb: N_("First MiniFinder and the Cmd-Shift-3 shortcut.") },
  { disk: "System 3.0", label: "System 3.0", year: 1986, era: "classic", arch: "68k", machines: ["Mac Plus (Snow)", "Mac Plus"], blurb: N_("HFS and real folders.") },
  { disk: "System 4.1", label: "System 4.1", year: 1987, era: "classic", arch: "68k", machines: ["Mac II (Snow)", "Mac SE", "Mac Plus"], blurb: N_("Support for the Mac II and colour.") },
  { disk: "System 6.0.8", label: "System 6.0.8", year: 1991, era: "classic", arch: "68k", machines: ["Mac SE/30 (Snow)", ...M68K_COMPACT], blurb: N_("The classic of classics: fast, MultiFinder, perfect for games.") },
  { disk: "System 7.0", label: "System 7.0", year: 1991, era: "system7", arch: "68k", machines: ["Mac IIcx (Snow)", ...M68K_COLOR, "Mac Plus"], blurb: N_("Cooperative multitasking, aliases, Balloon Help.") },
  { disk: "System 7.1", label: "System 7.1", year: 1992, era: "system7", arch: "68k", machines: M68K_COLOR, blurb: N_("Fonts folder and WorldScript.") },
  { disk: "System 7.5.3", label: "System 7.5.3", year: 1996, era: "system7", arch: "68k", machines: M68K_COLOR, blurb: N_("Menu bar clock, Launcher and lots of extras.") },
  { disk: "System 7.5.3 - PowerPC", label: "System 7.5.3 (PowerPC)", year: 1996, era: "system7", arch: "ppc", machines: PPC_OLD, blurb: N_("The same release for PowerPC.") },
  { disk: "Mac OS 7.6.1", label: "Mac OS 7.6.1", year: 1997, era: "system7", arch: "68k", machines: M68K_COLOR, blurb: N_("The first to be called “Mac OS”.") },
  { disk: "Mac OS 8.0", label: "Mac OS 8.0", year: 1997, era: "macos8", arch: "68k", machines: ["Quadra 650", ...PPC_OLD], blurb: N_("Platinum appearance, multithreaded Finder.") },
  { disk: "Mac OS 8.1", label: "Mac OS 8.1", year: 1998, era: "macos8", arch: "68k", machines: ["Quadra 650", ...PPC_OLD], blurb: N_("Last for 68k. HFS+ arrives.") },
  { disk: "Mac OS 8.6", label: "Mac OS 8.6", year: 1999, era: "macos8", arch: "ppc", machines: PPC_OLD, blurb: N_("New nanokernel, PowerPC only.") },
  { disk: "Mac OS 9.0.4", label: "Mac OS 9.0.4", year: 2000, era: "macos9", arch: "ppc", machines: PPC_G3, blurb: N_("Sherlock 2, multiple users, Keychain.") },
  { disk: "Mac OS 9.2.2", label: "Mac OS 9.2.2", year: 2001, era: "macos9", arch: "ppc", machines: ["Power Macintosh G3 (Beige)", "Power Macintosh G3 (Blue & White)"], blurb: N_("The last release of the classic Mac OS.") },
  { disk: "Mac OS X 10.1", label: "Mac OS X 10.1", year: 2001, era: "macosx", arch: "ppc", machines: ["Power Macintosh G3 (Beige)"], blurb: N_("Puma: to compare with the Classic Environment.") },
];

export const ERA_LABELS: Record<Era, string> = {
  classic: "System 1–6",
  system7: "System 7",
  macos8: "Mac OS 8",
  macos9: "Mac OS 9",
  macosx: "Mac OS X",
};

export interface InfiniteOptions {
  disk: string;
  machine: string;
  ramMB?: number;
  width: number;
  height: number;
  scale: number;
  infiniteHd: boolean;
  savedHd: boolean;
  autoPause: boolean;
  swapCmdCtrl: boolean;
  screenUpdates: boolean;
}

export function infiniteMacUrl(o: InfiniteOptions): string {
  const u = new URL("https://infinitemac.org/embed");
  u.searchParams.set("disk", o.disk);
  u.searchParams.set("machine", o.machine);
  if (o.ramMB) u.searchParams.set("ram", `${o.ramMB}M`);
  u.searchParams.set("infinite_hd", String(o.infiniteHd));
  u.searchParams.set("saved_hd", String(o.savedHd));
  // In /embed the iframe/webview size *is* the screen size; passing screenSize switches
  // Infinite Mac to its windowed mode with its own bezel.
  if (o.scale !== 1) u.searchParams.set("screen_scale", String(o.scale));
  if (o.autoPause) u.searchParams.set("auto_pause", "true");
  if (o.screenUpdates) u.searchParams.set("screen_update_messages", "true");
  u.searchParams.set("settings", JSON.stringify({ swapControlAndCommand: o.swapCmdCtrl }));
  return u.toString();
}

export const SCREEN_PRESETS = [
  { label: N_("512 × 342 (compact)"), w: 512, h: 342 },
  { label: N_("640 × 480 (13\")"), w: 640, h: 480 },
  { label: "800 × 600", w: 800, h: 600 },
  { label: "1024 × 768", w: 1024, h: 768 },
];

// ───────────── Native emulators ─────────────

export type NativeEngine = "minivmac" | "basilisk" | "sheepshaver" | "qemu";

export const ENGINES: Record<NativeEngine, { name: string; arch: string; url: string; needsRom: boolean; romHint: string }> = {
  minivmac: { name: "Mini vMac", arch: "68000 (128K–Mac II)", url: "https://www.gryphel.com/c/minivmac/", needsRom: true, romHint: N_("Mac Plus ROM (vMac.ROM, 128 KB)") },
  basilisk: { name: "Basilisk II", arch: "68020–68040", url: "https://www.emaculation.com/doku.php/basilisk_ii", needsRom: true, romHint: N_("Quadra 650 / Mac IIci ROM (1 MB)") },
  sheepshaver: { name: "SheepShaver", arch: "PowerPC (7.5.2–9.0.4)", url: "https://www.emaculation.com/doku.php/sheepshaver", needsRom: true, romHint: N_("“New World” ROM (Mac OS ROM) or a 4 MB Old World ROM") },
  qemu: { name: "QEMU (ppc)", arch: "G3/G4 (8.6–9.2.2, OS X)", url: "https://www.emaculation.com/doku.php/qemu", needsRom: false, romHint: N_("No ROM needed (OpenBIOS)") },
};

export interface NativeConfig {
  engine: NativeEngine;
  exe: string;
  rom: string;
  disks: string[];
  ramMB: number;
  width: number;
  height: number;
  modelId?: number;
  cpu?: number;
  fpu?: boolean;
  extraArgs?: string;
}

/** Command-line arguments for each emulator. Basilisk II / SheepShaver accept any prefs item as --item value. */
export function nativeArgs(c: NativeConfig): string[] {
  const extra = c.extraArgs?.trim() ? c.extraArgs.trim().split(/\s+/) : [];
  switch (c.engine) {
    case "minivmac":
      return [...c.disks, ...extra];
    case "basilisk":
      return [
        "--rom", c.rom,
        ...c.disks.flatMap((d) => ["--disk", d]),
        "--ramsize", String(c.ramMB * 1024 * 1024),
        "--screen", `win/${c.width}/${c.height}`,
        "--modelid", String(c.modelId ?? 14),
        "--cpu", String(c.cpu ?? 4),
        "--fpu", String(c.fpu ?? true),
        "--nosound", "false",
        ...extra,
      ];
    case "sheepshaver":
      return [
        "--rom", c.rom,
        ...c.disks.flatMap((d) => ["--disk", d]),
        "--ramsize", String(c.ramMB * 1024 * 1024),
        "--screen", `win/${c.width}/${c.height}`,
        ...extra,
      ];
    case "qemu":
      return [
        "-M", "mac99,via=pmu",
        "-m", String(c.ramMB),
        "-g", `${c.width}x${c.height}x32`,
        ...c.disks.flatMap((d, i) => (i === 0 ? ["-drive", `file=${d},format=raw,media=disk`] : ["-drive", `file=${d},format=raw,media=${/\.(iso|toast|cdr)$/i.test(d) ? "cdrom" : "disk"}`])),
        "-boot", "c",
        ...extra,
      ];
  }
}
