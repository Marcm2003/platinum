import { useEffect, useState, type ReactNode } from "react";
import type { DevicePick, DiscoveredBridge } from "@/shared/ipc";
import { useApp } from "@/state/store";
import { connect, disconnect } from "@/state/connection";
import { Icon, PixelIcon, type LineName } from "./icons";
import { N_, t } from "@/i18n";

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <button className={`toggle ${on ? "on" : ""}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={String(o.value)} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)} role="tab" aria-selected={o.value === value}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function SettingRow({ title, desc, children }: { title: ReactNode; desc?: ReactNode; children: ReactNode }) {
  return (
    <div className="list-row">
      <div className="grow">
        <div className="strong">{title}</div>
        {desc && <div className="small muted">{desc}</div>}
      </div>
      {children}
    </div>
  );
}

export function PageHead({ kicker, title, desc, children }: { kicker: string; title: string; desc?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <div className="kicker">{kicker}</div>
        <h1>{title}</h1>
        {desc && <p>{desc}</p>}
      </div>
      <div className="spacer" />
      {children}
    </div>
  );
}

export function Modal({ title, desc, children, footer, onClose, width }: { title: string; desc?: ReactNode; children: ReactNode; footer?: ReactNode; onClose: () => void; width?: number }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={width ? { width: `min(${width}px, calc(100vw - 32px))` } : undefined} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          {desc && <div className="small muted" style={{ marginTop: 4 }}>{desc}</div>}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function CopyBlock({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="copy-block">
      {text}
      <button className="btn sm" onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1200); }}>
        <Icon name={ok ? "check" : "copy"} size={13} /> {ok ? t("Copied") : t("Copy")}
      </button>
    </div>
  );
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}><span className="dot" />{t.text}</div>
      ))}
    </div>
  );
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

export function LinkPill() {
  const { status, linkLabel, agentOnline } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={`pill ${status === "connected" ? "ok" : status === "connecting" ? "warn" : ""}`} style={{ border: 0, height: 26, cursor: "default" }} onClick={() => setOpen(true)}>
        <span className={`dot ${status === "connecting" ? "pulse" : ""}`} />
        {status === "connected" ? linkLabel.split(" · ")[0] : status === "connecting" ? t("Connecting…") : t("Not connected")}
        {status === "connected" && <span style={{ opacity: 0.7, fontWeight: 500 }}>· Mac {agentOnline ? t("online") : "—"}</span>}
      </button>
      {open && <ConnectSheet onClose={() => setOpen(false)} />}
    </>
  );
}

const CHOICES: { kind: "usb" | "wifi" | "ble" | "direct"; icon: LineName; title: string; desc: string }[] = [
  { kind: "usb", icon: "usb", title: N_("USB"), desc: N_("ESP32 plugged into this computer. The most reliable way to set up and flash.") },
  { kind: "wifi", icon: "wifi", title: N_("WiFi"), desc: N_("The bridge on your local network (WebSocket). No cables between the computer and the Mac.") },
  { kind: "ble", icon: "bluetooth", title: N_("Bluetooth LE"), desc: N_("Direct link to the bridge, no network needed.") },
  { kind: "direct", icon: "cable", title: N_("Direct serial (no ESP32)"), desc: N_("USB-RS422 adapter plugged into the Mac's Modem port. Agent only.") },
];

export function ConnectSheet({ onClose }: { onClose: () => void }) {
  const { status, linkLabel, settings, info } = useApp();
  const [host, setHost] = useState(settings.lastHost);
  const [found, setFound] = useState<DiscoveredBridge[] | null>(null);
  const [scanning, setScanning] = useState(false);

  const scan = async () => {
    setScanning(true);
    setFound(await window.platinum.discoverBridges());
    setScanning(false);
  };

  if (status === "connected") {
    return (
      <Modal title={t("Active connection")} desc={linkLabel} onClose={onClose}
        footer={<><button className="btn" onClick={onClose}>{t("Close")}</button><button className="btn danger" onClick={() => { disconnect(); onClose(); }}><Icon name="unlink" /> {t("Disconnect")}</button></>}>
        {info ? (
          <table className="tbl"><tbody>
            <tr><td className="muted">Firmware</td><td>{info.name} · v{info.fw} · {info.board}</td></tr>
            <tr><td className="muted">{t("Mode")}</td><td>{info.mode === "adb" ? t("ADB (SE and later)") : t("M0110 + quadrature mouse (128K–Plus)")}</td></tr>
            {info.ip && <tr><td className="muted">{t("Network")}</td><td>{info.ssid} · {info.ip} · {info.rssi} dBm</td></tr>}
            {info.heap != null && <tr><td className="muted">{t("Free memory")}</td><td>{fmtBytes(info.heap)}</td></tr>}
          </tbody></table>
        ) : <div className="muted small">{t("Direct link to the Mac's serial port.")}</div>}
      </Modal>
    );
  }

  return (
    <Modal title={t("Connect to the Mac")} desc={t("Choose how Platinum reaches the ESP32 bridge (or the Mac directly).")} onClose={onClose} width={560}>
      <div className="col">
        {CHOICES.map((c) => (
          <div key={c.kind} className="choice" role="button" tabIndex={0} aria-disabled={status === "connecting"} onClick={async () => {
            if (c.kind === "wifi" || status === "connecting") return;
            await connect(c.kind);
            if (useApp.getState().status === "connected") onClose();
          }}>
            <div className="tile-icon"><Icon name={c.icon} size={18} /></div>
            <div style={{ flex: 1 }}>
              <div className="t">{t(c.title)}</div>
              <div className="d">{t(c.desc)}</div>
              {c.kind === "wifi" && (
                <div className="row" style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                  <input className="input" value={host} onChange={(e) => setHost(e.target.value)} placeholder={t("platinum.local or 192.168.1.50")} />
                  <button className="btn primary" onClick={async () => { await connect("wifi", host); if (useApp.getState().status === "connected") onClose(); }}>{t("Connect")}</button>
                  <button className="btn" onClick={scan} disabled={scanning}><Icon name="search" /> {scanning ? t("Searching…") : t("Search")}</button>
                </div>
              )}
              {c.kind === "wifi" && found && (
                <div className="col" style={{ marginTop: 8, gap: 4 }} onClick={(e) => e.stopPropagation()}>
                  {found.length === 0 && <div className="small muted">{t("No bridge found on the network (UDP 4210).")}</div>}
                  {found.map((b) => (
                    <button key={b.ip} className="btn sm" style={{ justifyContent: "flex-start" }} onClick={() => setHost(b.ip)}>
                      <PixelIcon name="chip" size={14} /> {b.name} · {b.ip} · v{b.fw}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/** Renders the pickers Electron asks for when the renderer calls requestPort()/requestDevice(). */
export function DevicePickers() {
  const [serial, setSerial] = useState<DevicePick[] | null>(null);
  const [ble, setBle] = useState<DevicePick[] | null>(null);
  useEffect(() => {
    const a = window.platinum.onSerialPicker(setSerial);
    const b = window.platinum.onBluetoothPicker((list) => setBle(list));
    return () => { a(); b(); };
  }, []);

  if (serial) {
    const choose = (id: string) => { window.platinum.chooseSerial(id); setSerial(null); };
    return (
      <Modal title={t("Choose the serial port")} desc={t("The ESP32 usually shows up as “USB JTAG/serial debug unit”, CP210x or CH340.")} onClose={() => choose("")}
        footer={<button className="btn" onClick={() => choose("")}>{t("Cancel")}</button>}>
        <div className="col">
          {serial.length === 0 && <div className="empty"><PixelIcon name="sad" size={40} /><div>{t("No ports found. Plug in the ESP32 and try again.")}</div></div>}
          {serial.map((d) => (
            <button key={d.id} className="choice" onClick={() => choose(d.id)}>
              <div className="tile-icon"><Icon name="usb" /></div>
              <div><div className="t">{d.name}</div><div className="d">{d.detail}</div></div>
            </button>
          ))}
        </div>
      </Modal>
    );
  }
  if (ble) {
    const choose = (id: string) => { window.platinum.chooseBluetooth(id); setBle(null); };
    return (
      <Modal title={t("Bluetooth devices")} desc={t("Looking for nearby Platinum bridges…")} onClose={() => choose("")}
        footer={<button className="btn" onClick={() => choose("")}>{t("Cancel")}</button>}>
        <div className="col">
          {ble.length === 0 && <div className="row muted"><Icon name="refresh" style={{ animation: "spin 1s linear infinite" }} /> {t("Searching…")}</div>}
          {ble.map((d) => (
            <button key={d.id} className="choice" onClick={() => choose(d.id)}>
              <div className="tile-icon"><Icon name="bluetooth" /></div>
              <div><div className="t">{d.name}</div><div className="d">{d.detail}</div></div>
            </button>
          ))}
        </div>
      </Modal>
    );
  }
  return null;
}

export function Empty({ icon = "happyMac", title, children }: { icon?: Parameters<typeof PixelIcon>[0]["name"]; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <PixelIcon name={icon} size={44} />
      <h3>{title}</h3>
      {children && <div className="small" style={{ maxWidth: 420 }}>{children}</div>}
    </div>
  );
}
