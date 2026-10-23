// Types shared between the Electron main process, preload and renderer.

export interface FileBlob { path: string; name: string; data: Uint8Array }
export interface DevicePick { id: string; name: string; detail?: string }
export interface DiscoveredBridge { ip: string; name: string; fw: string; board: string }
export interface RunCommandSpec { id: string; command: string; cwd?: string }
export interface AppInfo { version: string; electron: string; platform: string; userData: string; firmwareDir: string; agentDir: string }
export interface FileFilter { name: string; extensions: string[] }
export interface SerialPortInfo { path: string; vendorId?: string; productId?: string; manufacturer?: string; name?: string }
export interface ChipInfo { chip: string; features?: string; flash?: string; mac?: string }

export interface PlatinumAPI {
  openFiles(opts: { multi?: boolean; disks?: boolean; title?: string }): Promise<FileBlob[]>;
  pick(opts: { dir?: boolean; title?: string; filters?: FileFilter[] }): Promise<string | null>;
  saveFile(defaultName: string, data: Uint8Array): Promise<string | null>;
  saveMany(files: { name: string; data: Uint8Array }[]): Promise<string | null>;
  readFile(path: string): Promise<FileBlob>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  exists(path: string): Promise<boolean>;

  loadSettings(): Promise<unknown>;
  saveSettings(data: unknown): Promise<void>;
  setTheme(mode: "system" | "light" | "dark"): void;
  setLanguage(lang: string): void;

  serveDiskFile(path: string): Promise<string>;
  serveDiskBuffer(name: string, data: Uint8Array): Promise<string>;

  discoverBridges(): Promise<DiscoveredBridge[]>;
  listSerialPorts(): Promise<SerialPortInfo[]>;
  findEsptool(): Promise<string | null>;
  identifyChip(port: string): Promise<ChipInfo>;

  launchEmulator(exe: string, args: string[]): Promise<number>;
  writeEmulatorPrefs(name: string, text: string): Promise<string>;
  copyFile(from: string, to: string): Promise<void>;

  runCommand(spec: RunCommandSpec): Promise<number>;
  killCommand(id: string): void;
  onCommandOutput(cb: (id: string, stream: "out" | "err", text: string) => void): () => void;

  onSerialPicker(cb: (devices: DevicePick[]) => void): () => void;
  chooseSerial(id: string): void;
  onBluetoothPicker(cb: (devices: DevicePick[]) => void): () => void;
  chooseBluetooth(id: string): void;

  appInfo(): Promise<AppInfo>;
  openExternal(url: string): void;
  reveal(path: string): void;
  platform: string;
}
