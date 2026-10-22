import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { PlatinumAPI } from "../src/shared/ipc";

function on<A extends unknown[]>(channel: string, cb: (...args: A) => void) {
  const listener = (_e: IpcRendererEvent, ...args: unknown[]) => cb(...(args as A));
  ipcRenderer.on(channel, listener);
  return () => void ipcRenderer.removeListener(channel, listener);
}

const api: PlatinumAPI = {
  openFiles: (opts) => ipcRenderer.invoke("fs:open", opts),
  pick: (opts) => ipcRenderer.invoke("fs:pick", opts),
  saveFile: (name, data) => ipcRenderer.invoke("fs:save", name, data),
  saveMany: (files) => ipcRenderer.invoke("fs:saveMany", files),
  readFile: (p) => ipcRenderer.invoke("fs:read", p),
  writeFile: (p, data) => ipcRenderer.invoke("fs:write", p, data),
  exists: (p) => ipcRenderer.invoke("fs:exists", p),

  loadSettings: () => ipcRenderer.invoke("settings:load"),
  saveSettings: (data) => ipcRenderer.invoke("settings:save", data),
  setTheme: (mode) => ipcRenderer.send("theme:set", mode),
  setLanguage: (lang) => ipcRenderer.send("lang:set", lang),

  serveDiskFile: (p) => ipcRenderer.invoke("disk:serveFile", p),
  serveDiskBuffer: (name, data) => ipcRenderer.invoke("disk:serveBuffer", name, data),

  discoverBridges: () => ipcRenderer.invoke("net:discover"),

  launchEmulator: (exe, args) => ipcRenderer.invoke("emu:launch", exe, args),
  writeEmulatorPrefs: (name, text) => ipcRenderer.invoke("emu:writePrefs", name, text),
  copyFile: (from, to) => ipcRenderer.invoke("emu:copyFile", from, to),

  runCommand: (spec) => ipcRenderer.invoke("cmd:run", spec),
  killCommand: (id) => ipcRenderer.send("cmd:kill", id),
  onCommandOutput: (cb) => on("cmd:output", cb),

  onSerialPicker: (cb) => on("picker:serial", cb),
  chooseSerial: (id) => ipcRenderer.send("picker:serial:choose", id),
  onBluetoothPicker: (cb) => on("picker:bluetooth", cb),
  chooseBluetooth: (id) => ipcRenderer.send("picker:bluetooth:choose", id),

  appInfo: () => ipcRenderer.invoke("app:info"),
  openExternal: (url) => ipcRenderer.send("shell:open", url),
  reveal: (p) => ipcRenderer.send("shell:reveal", p),
  platform: process.platform,
};

contextBridge.exposeInMainWorld("platinum", api);
