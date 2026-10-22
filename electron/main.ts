import { app, BrowserWindow, dialog, ipcMain, nativeTheme, session, shell, type WebContents } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { createSocket } from "node:dgram";
import { createServer, type Server } from "node:http";
import { promises as fs, createReadStream, statSync } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import type { DevicePick, DiscoveredBridge, FileBlob, RunCommandSpec } from "../src/shared/ipc";

const DEV_URL = process.env.PLATINUM_DEV_URL;
const isMac = process.platform === "darwin";
let win: BrowserWindow | null = null;

// The few strings the main process shows itself (native dialogs). The renderer tells us its language.
const STRINGS = {
  en: { disks: "Mac disk images", all: "All files", destination: "Choose the destination folder", unnamed: "(unnamed)" },
  ca: { disks: "Imatges de disc Mac", all: "Tots els fitxers", destination: "Tria la carpeta de destinació", unnamed: "(sense nom)" },
};
let str = STRINGS.en;
ipcMain.on("lang:set", (_e, lang: string) => { str = lang === "ca" ? STRINGS.ca : STRINGS.en; });

// ───────────────────────── Window ─────────────────────────

const overlay = (dark: boolean) => ({
  color: "#00000000",
  symbolColor: dark ? "#e8e8ed" : "#1d1d1f",
  height: 44,
});

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1040,
    minHeight: 680,
    title: "Platinum",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#1b1b1f" : "#f2f2f5",
    titleBarStyle: "hidden",
    titleBarOverlay: isMac ? undefined : overlay(nativeTheme.shouldUseDarkColors),
    trafficLightPosition: { x: 16, y: 15 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: false,
      webviewTag: true,
    },
  });
  win.once("ready-to-show", () => win?.show());
  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, "../dist/index.html"));

  wireDevicePickers(win.webContents);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  // Only allow the embedded emulator host inside <webview>.
  win.webContents.on("will-attach-webview", (event, prefs, params) => {
    delete (prefs as { preload?: string }).preload;
    prefs.nodeIntegration = false;
    prefs.contextIsolation = true;
    if (!params.src.startsWith("https://infinitemac.org/")) event.preventDefault();
  });
}

// ───────────────────── Device pickers ─────────────────────
// Web Serial / Web Bluetooth ask the main process to pick a device; we forward
// the list to the renderer, which shows its own picker and answers by id.

let pendingSerial: ((id: string) => void) | null = null;
let pendingBluetooth: ((id: string) => void) | null = null;

function wireDevicePickers(wc: WebContents) {
  const ses = wc.session;
  ses.setPermissionCheckHandler((_wc, permission) => ["serial", "bluetooth", "media"].includes(permission) || permission === "clipboard-sanitized-write");
  ses.setDevicePermissionHandler((d) => d.deviceType === "serial");

  ses.on("select-serial-port", (event, portList, _wc, callback) => {
    event.preventDefault();
    pendingSerial = callback;
    const devices: DevicePick[] = portList.map((p) => ({
      id: p.portId,
      name: p.displayName || p.portName || p.portId,
      detail: [p.portName, p.vendorId && `VID ${p.vendorId}`, p.productId && `PID ${p.productId}`].filter(Boolean).join(" · "),
    }));
    wc.send("picker:serial", devices);
  });

  wc.on("select-bluetooth-device", (event, list, callback) => {
    event.preventDefault();
    pendingBluetooth = callback;
    wc.send("picker:bluetooth", list.map((d) => ({ id: d.deviceId, name: d.deviceName || str.unnamed, detail: d.deviceId })));
  });
}

ipcMain.on("picker:serial:choose", (_e, id: string) => { pendingSerial?.(id); pendingSerial = null; });
ipcMain.on("picker:bluetooth:choose", (_e, id: string) => { pendingBluetooth?.(id); if (id === "") pendingBluetooth = null; });

// ─────────────────────── Files ───────────────────────

const DISK_EXTENSIONS = ["dsk", "img", "image", "hda", "hfs", "dc42", "diskcopy", "iso", "toast", "cdr"];
const diskFilters = () => [{ name: str.disks, extensions: DISK_EXTENSIONS }, { name: str.all, extensions: ["*"] }];

ipcMain.handle("fs:open", async (_e, opts: { multi?: boolean; disks?: boolean; title?: string }) => {
  const r = await dialog.showOpenDialog(win!, {
    title: opts.title,
    properties: opts.multi ? ["openFile", "multiSelections"] : ["openFile"],
    filters: opts.disks ? diskFilters() : undefined,
  });
  if (r.canceled) return [];
  return Promise.all(r.filePaths.map(readBlob));
});

ipcMain.handle("fs:pick", async (_e, opts: { dir?: boolean; title?: string; filters?: Electron.FileFilter[] }) => {
  const r = await dialog.showOpenDialog(win!, { title: opts.title, properties: [opts.dir ? "openDirectory" : "openFile"], filters: opts.filters });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle("fs:save", async (_e, defaultName: string, data: Uint8Array) => {
  const r = await dialog.showSaveDialog(win!, { defaultPath: defaultName });
  if (r.canceled || !r.filePath) return null;
  await fs.writeFile(r.filePath, data);
  return r.filePath;
});

ipcMain.handle("fs:saveMany", async (_e, files: { name: string; data: Uint8Array }[]) => {
  const r = await dialog.showOpenDialog(win!, { title: str.destination, properties: ["openDirectory", "createDirectory"] });
  if (r.canceled) return null;
  for (const f of files) await fs.writeFile(path.join(r.filePaths[0], f.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")), f.data);
  return r.filePaths[0];
});

ipcMain.handle("fs:read", (_e, p: string) => readBlob(p));
ipcMain.handle("fs:write", (_e, p: string, data: Uint8Array) => fs.writeFile(p, data));
ipcMain.handle("fs:exists", async (_e, p: string) => fs.access(p).then(() => true, () => false));

async function readBlob(p: string): Promise<FileBlob> {
  return { path: p, name: path.basename(p), data: new Uint8Array(await fs.readFile(p)) };
}

// ─────────────────────── Settings ───────────────────────

const settingsFile = () => path.join(app.getPath("userData"), "settings.json");
ipcMain.handle("settings:load", async () => {
  try { return JSON.parse(await fs.readFile(settingsFile(), "utf8")); } catch { return null; }
});
ipcMain.handle("settings:save", (_e, data: unknown) => fs.writeFile(settingsFile(), JSON.stringify(data, null, 2)));

ipcMain.on("theme:set", (_e, mode: "system" | "light" | "dark") => {
  nativeTheme.themeSource = mode;
  if (!isMac) win?.setTitleBarOverlay(overlay(nativeTheme.shouldUseDarkColors));
});
nativeTheme.on("updated", () => { if (!isMac) win?.setTitleBarOverlay(overlay(nativeTheme.shouldUseDarkColors)); });

// ───────────────── Disk server (for the embedded emulator) ─────────────────
// Infinite Mac loads extra disks by URL; we serve local images over loopback
// with the CORS / CORP / Private-Network headers a cross-origin-isolated page needs.

type Served = { kind: "file"; path: string } | { kind: "buffer"; data: Buffer };
const served = new Map<string, Served>();
let diskServer: Server | null = null;
let diskPort = 0;

async function ensureDiskServer() {
  if (diskServer) return;
  diskServer = createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Range");
    res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    if (req.method === "OPTIONS") return void res.writeHead(204).end();

    const id = decodeURIComponent((req.url ?? "/").split("/")[1] ?? "");
    const item = served.get(id);
    if (!item) return void res.writeHead(404).end();

    const size = item.kind === "file" ? statSync(item.path).size : item.data.length;
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
    let start = 0, end = size - 1, status = 200;
    if (m) {
      start = m[1] ? parseInt(m[1]) : size - parseInt(m[2]);
      end = m[1] && m[2] ? Math.min(parseInt(m[2]), size - 1) : size - 1;
      status = 206;
      res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
    }
    res.writeHead(status, { "Content-Type": "application/octet-stream", "Content-Length": end - start + 1, "Accept-Ranges": "bytes" });
    if (req.method === "HEAD") return void res.end();
    if (item.kind === "file") createReadStream(item.path, { start, end }).pipe(res);
    else res.end(item.data.subarray(start, end + 1));
  });
  await new Promise<void>((resolve) => diskServer!.listen(0, "127.0.0.1", resolve));
  diskPort = (diskServer.address() as { port: number }).port;
}

ipcMain.handle("disk:serveFile", async (_e, p: string) => {
  await ensureDiskServer();
  const id = `${Date.now().toString(36)}-${path.basename(p).replace(/[^\w.-]/g, "_")}`;
  served.set(id, { kind: "file", path: p });
  return `http://127.0.0.1:${diskPort}/${encodeURIComponent(id)}`;
});

ipcMain.handle("disk:serveBuffer", async (_e, name: string, data: Uint8Array) => {
  await ensureDiskServer();
  const id = `${Date.now().toString(36)}-${name.replace(/[^\w.-]/g, "_")}`;
  served.set(id, { kind: "buffer", data: Buffer.from(data) });
  return `http://127.0.0.1:${diskPort}/${encodeURIComponent(id)}`;
});

// ───────────────── Bridge discovery (UDP broadcast) ─────────────────
// The firmware answers "PLATINUM?" on UDP 4210 with a JSON line.

ipcMain.handle("net:discover", () => new Promise<DiscoveredBridge[]>((resolve) => {
  const found = new Map<string, DiscoveredBridge>();
  const sock = createSocket({ type: "udp4", reuseAddr: true });
  sock.on("message", (msg, rinfo) => {
    try {
      const info = JSON.parse(msg.toString("utf8"));
      if (info.t === "here") found.set(rinfo.address, { ip: rinfo.address, name: info.name ?? "Platinum Bridge", fw: info.fw ?? "?", board: info.board ?? "?" });
    } catch { /* not ours */ }
  });
  sock.on("error", () => { sock.close(); resolve([...found.values()]); });
  sock.bind(() => {
    sock.setBroadcast(true);
    const probe = Buffer.from("PLATINUM?");
    for (const addr of broadcastAddresses()) sock.send(probe, 4210, addr);
  });
  setTimeout(() => { sock.close(); resolve([...found.values()]); }, 1500);
}));

function broadcastAddresses(): string[] {
  const out = new Set<string>(["255.255.255.255"]);
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family !== "IPv4" || ni.internal) continue;
      const ip = ni.address.split(".").map(Number), mask = ni.netmask.split(".").map(Number);
      out.add(ip.map((b, i) => (b & mask[i]) | (~mask[i] & 255)).join("."));
    }
  }
  return [...out];
}

// ───────────────── Native emulators & build commands ─────────────────

ipcMain.handle("emu:launch", async (_e, exe: string, args: string[]) => {
  const child = spawn(exe, args, { cwd: path.dirname(exe), detached: true, stdio: "ignore" });
  child.unref();
  return child.pid ?? 0;
});

ipcMain.handle("emu:writePrefs", async (_e, name: string, text: string) => {
  const dir = path.join(app.getPath("userData"), "emulators");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, name);
  await fs.writeFile(file, text);
  return file;
});

ipcMain.handle("emu:copyFile", async (_e, from: string, to: string) => {
  await fs.copyFile(from, to);
});

const running = new Map<string, ChildProcess>();
ipcMain.handle("cmd:run", (e, spec: RunCommandSpec) => {
  const child = spawn(spec.command, { cwd: spec.cwd || undefined, shell: true, env: process.env });
  running.set(spec.id, child);
  const send = (stream: "out" | "err", d: Buffer) => e.sender.send("cmd:output", spec.id, stream, d.toString());
  child.stdout?.on("data", (d) => send("out", d));
  child.stderr?.on("data", (d) => send("err", d));
  return new Promise<number>((resolve) => child.on("close", (code) => { running.delete(spec.id); resolve(code ?? -1); }));
});
ipcMain.on("cmd:kill", (_e, id: string) => running.get(id)?.kill());

const resourceDir = (name: string) => (app.isPackaged ? path.join(process.resourcesPath, name) : path.join(app.getAppPath(), name));
ipcMain.handle("app:info", () => ({
  version: app.getVersion(),
  electron: process.versions.electron,
  platform: process.platform,
  userData: app.getPath("userData"),
  firmwareDir: resourceDir("firmware"),
  agentDir: resourceDir("mac-agent"),
}));
ipcMain.on("shell:open", (_e, url: string) => { if (/^https?:/.test(url)) shell.openExternal(url); });
ipcMain.on("shell:reveal", (_e, p: string) => shell.showItemInFolder(p));

// ─────────────────────── Lifecycle ───────────────────────

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(["serial", "bluetooth", "media", "fullscreen", "pointerLock"].includes(permission)));
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (!isMac) app.quit(); });
