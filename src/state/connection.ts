// Connection lifecycle: open a transport, wire bridge events into the store,
// and keep probing for the Mac-side agent.

import { Bridge } from "@/lib/link/bridge";
import { BOARDS } from "@/lib/hardware/boards";
import { openBle, openSerial, openWebSocket, type TransportKind } from "@/lib/link/transport";
import { useApp } from "./store";
import { t } from "@/i18n";

let probeTimer: ReturnType<typeof setInterval> | undefined;

export async function connect(kind: TransportKind, host?: string) {
  const app = useApp.getState();
  if (app.bridge) await disconnect();
  app.set({ status: "connecting" });
  try {
    const { settings } = useApp.getState();
    const transport =
      kind === "wifi" ? await openWebSocket(host || settings.lastHost)
      : kind === "ble" ? await openBle()
      : await openSerial(kind, kind === "usb" ? settings.serialBaud : settings.directBaud);
    if (kind === "wifi" && host) app.patchSettings({ lastHost: host });

    const bridge = new Bridge(transport);
    bridge.onEvent = (e) => {
      const s = useApp.getState();
      switch (e.t) {
        case "info":
          s.set({ info: e.info });
          // The firmware knows which board it was built for; follow it in the wiring guide.
          if (e.info.board !== s.settings.boardId && BOARDS.some((b) => b.id === e.info.board)) s.patchSettings({ boardId: e.info.board });
          break;
        case "log": s.log(e.m); break;
        case "ble": s.set({ bleDevices: e.list }); break;
        case "adb": s.set({ adbEvents: [...s.adbEvents.slice(-199), e] }); break;
        case "hid": window.dispatchEvent(new CustomEvent("platinum:hid", { detail: e })); break;
      }
    };
    bridge.onClose = (reason) => {
      if (useApp.getState().bridge !== bridge) return;
      cleanup();
      useApp.getState().toast(reason ? t("Connection closed: {reason}", { reason }) : t("Connection lost"), "err");
    };
    bridge.agent.onLog = (l) => useApp.setState((s) => ({ agentLog: [...s.agentLog.slice(-4999), l] }));
    bridge.agent.onHello = (v) => { useApp.getState().log(t("Mac agent v{v} online", { v }), "app"); probeAgent(); };

    app.set({ bridge, status: "connected", linkLabel: transport.label });
    app.log(t("Connected: {label}", { label: transport.label }), "app");
    app.toast(t("Connected via {link}", { link: transport.label.split(" · ")[0] }), "ok");
    if (!bridge.direct) {
      await bridge.hello();
      await bridge.configure({ mode: useApp.getState().settings.modelId.match(/^(128k|512k|plus)$/) ? "m0110" : "adb" });
    }
    probeTimer = setInterval(probeAgent, 4000);
    setTimeout(probeAgent, 600);
  } catch (e) {
    app.set({ status: "disconnected" });
    const msg = e instanceof Error ? e.message : String(e);
    if (!/cancel|No port selected|User cancelled/i.test(msg)) app.toast(msg, "err");
  }
}

async function probeAgent() {
  const { bridge } = useApp.getState();
  if (!bridge) return;
  try {
    const ms = await bridge.agent.ping();
    const wasOnline = useApp.getState().agentOnline;
    useApp.setState({ agentOnline: true, latency: Math.round(ms) });
    if (!wasOnline) {
      const sysinfo = await bridge.agent.sysinfo();
      useApp.setState({ sysinfo });
      useApp.getState().toast(t("{machine} running System {version} is online", { machine: sysinfo.machineName, version: sysinfo.systemVersion }), "ok");
    }
  } catch {
    if (useApp.getState().agentOnline) useApp.getState().log(t("The Mac agent stopped responding"), "warn");
    useApp.setState({ agentOnline: false, latency: null });
  }
}

function cleanup() {
  clearInterval(probeTimer);
  useApp.setState({ bridge: null, status: "disconnected", info: null, agentOnline: false, sysinfo: null, latency: null, linkLabel: "", bleDevices: [] });
}

export async function disconnect() {
  const { bridge } = useApp.getState();
  cleanup();
  try { await bridge?.close(); } catch { /* ignore */ }
}
