import { useEffect, useRef, useState } from "react";
import { useApp } from "@/state/store";
import { adbCodeFor, ADB_POWER_KEY } from "@/lib/link/keymap";
import { Empty, PageHead, SettingRow, Toggle } from "@/ui/components";
import { Icon, PixelIcon } from "@/ui/icons";
import { t, tx } from "@/i18n";

// Apple Extended Keyboard (main block). [label, KeyboardEvent.code, width]
const ROWS: [string, string, number?][][] = [
  [["esc", "Escape"], ["F1", "F1"], ["F2", "F2"], ["F3", "F3"], ["F4", "F4"], ["F5", "F5"], ["F6", "F6"], ["F7", "F7"], ["F8", "F8"], ["F9", "F9"], ["F10", "F10"], ["F11", "F11"], ["F12", "F12"], ["⏻", "Power", 1.2]],
  [["`", "Backquote"], ["1", "Digit1"], ["2", "Digit2"], ["3", "Digit3"], ["4", "Digit4"], ["5", "Digit5"], ["6", "Digit6"], ["7", "Digit7"], ["8", "Digit8"], ["9", "Digit9"], ["0", "Digit0"], ["-", "Minus"], ["=", "Equal"], ["delete", "Backspace", 2]],
  [["tab", "Tab", 1.5], ["Q", "KeyQ"], ["W", "KeyW"], ["E", "KeyE"], ["R", "KeyR"], ["T", "KeyT"], ["Y", "KeyY"], ["U", "KeyU"], ["I", "KeyI"], ["O", "KeyO"], ["P", "KeyP"], ["[", "BracketLeft"], ["]", "BracketRight"], ["\\", "Backslash", 1.5]],
  [["caps", "CapsLock", 1.8], ["A", "KeyA"], ["S", "KeyS"], ["D", "KeyD"], ["F", "KeyF"], ["G", "KeyG"], ["H", "KeyH"], ["J", "KeyJ"], ["K", "KeyK"], ["L", "KeyL"], [";", "Semicolon"], ["'", "Quote"], ["return", "Enter", 2.2]],
  [["shift", "ShiftLeft", 2.3], ["Z", "KeyZ"], ["X", "KeyX"], ["C", "KeyC"], ["V", "KeyV"], ["B", "KeyB"], ["N", "KeyN"], ["M", "KeyM"], [",", "Comma"], [".", "Period"], ["/", "Slash"], ["shift", "ShiftRight", 2.7]],
  [["control", "ControlLeft", 1.5], ["option", "AltLeft", 1.3], ["⌘", "MetaLeft", 1.5], ["", "Space", 6.2], ["⌘", "MetaRight", 1.5], ["option", "AltRight", 1.3], ["←", "ArrowLeft"], ["↓", "ArrowDown"], ["↑", "ArrowUp"], ["→", "ArrowRight"]],
];

function MacKeyboard({ pressed, onKey }: { pressed: Set<string>; onKey: (code: string, down: boolean) => void }) {
  const U = 38;
  return (
    <div style={{ padding: 14, borderRadius: 12, background: "linear-gradient(180deg, var(--platinum), var(--platinum-dark))", boxShadow: "inset 0 1px 0 rgba(255,255,255,.4), var(--shadow)", display: "inline-block" }}>
      {ROWS.map((row, r) => (
        <div key={r} style={{ display: "flex", gap: 4, marginBottom: 4 }}>
          {row.map(([label, code, w = 1]) => {
            const on = pressed.has(code);
            return (
              <button key={code + label} onMouseDown={() => onKey(code, true)} onMouseUp={() => onKey(code, false)} onMouseLeave={() => on && onKey(code, false)}
                style={{
                  width: U * w + (w - 1) * 4, height: U, border: 0, borderRadius: 5, fontSize: label.length > 3 ? 9.5 : 12, fontWeight: 600,
                  color: on ? "#fff" : "#2a2a2a", display: "flex", alignItems: label.length > 3 ? "flex-end" : "center", justifyContent: label.length > 3 ? "flex-start" : "center",
                  padding: label.length > 3 ? "0 6px 5px" : 0, cursor: "default",
                  background: on ? "var(--accent)" : "linear-gradient(180deg, #fbfaf6, #e7e3d8)",
                  boxShadow: on ? "inset 0 1px 3px rgba(0,0,0,.3)" : "0 2px 0 #b9b4a6, 0 0 0 0.5px rgba(0,0,0,.25)",
                  transform: on ? "translateY(1px)" : undefined, transition: "background .06s",
                }}>{label}</button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function Input() {
  const { bridge, status, settings, patchSettings, bleDevices, adbEvents, info } = useApp();
  const [pressed, setPressed] = useState<Set<string>>(new Set());
  const [captured, setCaptured] = useState(false);
  const [button, setButton] = useState(false);
  const padRef = useRef<HTMLDivElement>(null);
  const acc = useRef({ dx: 0, dy: 0, b: false, dirty: false });
  const [scanning, setScanning] = useState(false);
  const live = status === "connected" && bridge && !bridge.direct;

  const sendKey = (code: string, down: boolean) => {
    setPressed((p) => { const n = new Set(p); down ? n.add(code) : n.delete(code); return n; });
    if (code === "Power") { if (down) bridge?.key(ADB_POWER_KEY, true); else bridge?.key(ADB_POWER_KEY, false); return; }
    const adb = adbCodeFor(code, settings.swapCmdCtrl);
    if (adb !== undefined) bridge?.key(adb, down);
  };

  // Mouse deltas are batched at ~60 Hz so the ESP32 isn't flooded.
  useEffect(() => {
    const t = setInterval(() => {
      const a = acc.current;
      if (!a.dirty || !bridge) return;
      bridge.mouse(a.dx, a.dy, a.b);
      a.dx = 0; a.dy = 0; a.dirty = false;
    }, 16);
    return () => clearInterval(t);
  }, [bridge]);

  useEffect(() => {
    if (!captured) return;
    const down = (e: KeyboardEvent) => { if (e.code === "Escape" && e.shiftKey) return; e.preventDefault(); if (!e.repeat) sendKey(e.code, true); };
    const up = (e: KeyboardEvent) => { e.preventDefault(); sendKey(e.code, false); };
    const move = (e: MouseEvent) => { const a = acc.current; a.dx += e.movementX * settings.mouseSpeed; a.dy += e.movementY * settings.mouseSpeed; a.dirty = true; };
    const md = () => { acc.current.b = true; acc.current.dirty = true; setButton(true); };
    const mu = () => { acc.current.b = false; acc.current.dirty = true; setButton(false); };
    const lockChange = () => { if (document.pointerLockElement !== padRef.current) setCaptured(false); };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    document.addEventListener("mousemove", move);
    document.addEventListener("mousedown", md);
    document.addEventListener("mouseup", mu);
    document.addEventListener("pointerlockchange", lockChange);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mousedown", md);
      document.removeEventListener("mouseup", mu);
      document.removeEventListener("pointerlockchange", lockChange);
      setPressed(new Set());
    };
  }, [captured, settings.mouseSpeed, settings.swapCmdCtrl, bridge]);

  // Physical BLE keyboards on the bridge light up the on-screen keyboard too.
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d.kind !== "key") return;
      const code = Object.entries(ADB_TO_CODE).find(([adb]) => Number(adb) === d.code)?.[1];
      if (code) setPressed((p) => { const n = new Set(p); d.down ? n.add(code) : n.delete(code); return n; });
    };
    window.addEventListener("platinum:hid", h);
    return () => window.removeEventListener("platinum:hid", h);
  }, []);

  const lastAdb = adbEvents[adbEvents.length - 1];

  return (
    <div style={{ maxWidth: 1240 }}>
      <PageHead kicker={t("ESP32 bridge")} title={t("Keyboard & mouse")} desc={info?.mode === "m0110" ? t("The bridge shows up on the Mac as an original keyboard and mouse (M0110 and quadrature). Type from here or pair Bluetooth keyboards and mice with it.") : t("The bridge shows up on the Mac as an Apple ADB keyboard and mouse. Type from here or pair Bluetooth keyboards and mice with it.")}>
        <button className="btn" disabled={!live} onClick={() => bridge?.power()}><Icon name="power" size={14} /> {t("Power on the Mac")}</button>
      </PageHead>

      <div className="grid" style={{ gridTemplateColumns: "1fr 380px" }}>
        <div className="col" style={{ gap: 16 }}>
          <div className="card">
            <div className="card-head"><h3>{t("Remote control")}</h3><span className="sub">{t("Captures your computer's keyboard and mouse and sends them to the Mac")}</span></div>
            <div style={{ padding: 18 }}>
              <div ref={padRef} className="desktop-pattern" onClick={() => { if (!live) return; padRef.current?.requestPointerLock(); setCaptured(true); }}
                style={{ height: 180, borderRadius: 12, display: "grid", placeItems: "center", boxShadow: captured ? "0 0 0 3px var(--accent)" : "inset 0 0 0 1px var(--line-2)", cursor: live ? "pointer" : "not-allowed" }}>
                <div className="win" style={{ minWidth: 300 }}>
                  <div className="win-bar"><span className="win-close" /><span className="win-title">{captured ? t("Controlling the Mac") : t("Remote control")}</span></div>
                  <div className="win-body center small">
                    {!live ? t("Connect the ESP32 bridge to enable it.") : captured ? tx("Everything you do goes to the Mac. {key} releases the mouse.", { key: <span className="kbd">Esc</span> }) : t("Click here to start controlling the Mac.")}
                    {captured && <div style={{ marginTop: 8 }}><span className={`pill ${button ? "accent" : ""}`}>{button ? t("Button down") : t("Button up")}</span></div>}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 16, overflowX: "auto" }}><MacKeyboard pressed={pressed} onKey={(c, d) => live && sendKey(c, d)} /></div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>{info?.mode === "m0110" ? t("Keyboard bus monitor") : t("ADB bus monitor")}</h3><span className="sub">{lastAdb ? t("Last: {s} s ago", { s: Math.max(0, Math.round((Date.now() - lastAdb.at) / 1000)) }) : t("No traffic")}</span></div>
            {adbEvents.length === 0 ? (
              <div className="list-row small muted">{t("Once the Mac boots it polls the bus every ~11 ms. The bridge sends a summary here so you can check the wiring works.")}</div>
            ) : (
              <div style={{ maxHeight: 220, overflow: "auto" }}>
                <table className="tbl"><thead><tr><th>{t("Time")}</th><th>{t("Command")}</th><th>{t("Address")}</th><th>{t("Register")}</th></tr></thead>
                  <tbody>{adbEvents.slice(-40).reverse().map((e, i) => <tr key={i}><td className="mono">{new Date(e.at).toLocaleTimeString()}</td><td>{e.ev}</td><td className="mono">{e.addr} {e.addr === 2 ? t("(keyboard)") : e.addr === 3 ? t("(mouse)") : ""}</td><td className="mono">R{e.reg}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="col" style={{ gap: 16 }}>
          <div className="card">
            <div className="card-head"><h3>Bluetooth</h3><span className="sub">{t("Paired with the bridge")}</span>
              <button className="btn sm right" disabled={!live || scanning} onClick={async () => { setScanning(true); await bridge?.bleScan(); setTimeout(() => setScanning(false), 8000); }}>
                <Icon name="search" size={12} /> {scanning ? t("Searching…") : t("Search")}
              </button>
            </div>
            {bleDevices.length === 0 ? (
              <Empty icon="keyboard" title={t("No devices")}>{t("Put the keyboard or mouse into pairing mode and press “Search”. Works with any Bluetooth LE keyboard or mouse.")}</Empty>
            ) : bleDevices.map((d) => (
              <div key={d.addr} className="list-row">
                <PixelIcon name={d.kind === "mouse" ? "mouse" : "keyboard"} size={22} />
                <div className="grow">
                  <div className="strong">{d.name || t("HID device")}</div>
                  <div className="tiny muted mono">{d.addr} · {d.rssi} dBm</div>
                </div>
                {d.connected ? <span className="pill ok"><span className="dot" />{t("Connected")}</span> : null}
                {d.paired ? <button className="btn sm danger" onClick={() => bridge?.bleForget(d.addr)}>{t("Forget")}</button> : <button className="btn sm primary" onClick={() => bridge?.blePair(d.addr)}>{t("Pair")}</button>}
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-head"><h3>{t("Options")}</h3></div>
            <SettingRow title={t("PC Ctrl as ⌘")} desc={t("Ctrl+C copies on the Mac")}><Toggle on={settings.swapCmdCtrl} onChange={(v) => patchSettings({ swapCmdCtrl: v })} /></SettingRow>
            <SettingRow title={t("Mouse speed")} desc={`${settings.mouseSpeed.toFixed(1)}×`}>
              <input type="range" min={0.2} max={3} step={0.1} value={settings.mouseSpeed} onChange={(e) => patchSettings({ mouseSpeed: Number(e.target.value) })} />
            </SettingRow>
          </div>
        </div>
      </div>
    </div>
  );
}

const ADB_TO_CODE: Record<number, string> = Object.fromEntries(
  ROWS.flat().map(([, code]) => [adbCodeFor(code, false), code]).filter(([a]) => a !== undefined),
);
