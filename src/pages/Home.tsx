import { useApp } from "@/state/store";
import { boardById } from "@/lib/hardware/boards";
import { modelById } from "@/lib/hardware/macModels";
import { Icon, PixelIcon } from "@/ui/icons";
import { ConnectSheet } from "@/ui/components";
import { useState } from "react";
import { t, tx } from "@/i18n";

export function CompactMac({ children }: { children?: React.ReactNode }) {
  return (
    <div className="compact-mac">
      <div className="cm-body">
        <div className="cm-bezel">
          <div className="cm-screen crt">{children}</div>
        </div>
        <div className="cm-chin">
          <span className="cm-apple" />
          <span className="cm-slot" />
        </div>
      </div>
      <div className="cm-foot" />
    </div>
  );
}

export function Home() {
  const { go, status, linkLabel, info, agentOnline, sysinfo, settings, latency } = useApp();
  const [connect, setConnect] = useState(false);
  const model = modelById(settings.modelId);
  const board = boardById(settings.boardId);

  const steps = [
    { done: true, title: t("Pick your Mac and board"), desc: `${model.name} · ${board.name}`, action: () => go("hardware"), cta: t("Change") },
    { done: false, title: t("Wire it up"), desc: t("Interactive diagram with pins, level shifters and a parts list."), action: () => go("hardware"), cta: t("Open the diagram") },
    { done: status === "connected" && !!info, title: t("Flash the firmware and connect the bridge"), desc: info ? `${info.name} v${info.fw} · ${linkLabel.split(" · ")[0]}` : t("Over USB, WiFi or Bluetooth LE."), action: () => setConnect(true), cta: status === "connected" ? t("Details") : t("Connect") },
    { done: agentOnline, title: t("Run Platinum Agent on the Mac"), desc: sysinfo ? `${sysinfo.machineName} · System ${sysinfo.systemVersion}` : t("Files, screen and debugging over the Modem port."), action: () => go("debug"), cta: t("How to install") },
  ];

  return (
    <div className="col" style={{ gap: 18, maxWidth: 1180 }}>
      <div className="card hero">
        <CompactMac>
          <div className="center" style={{ padding: 8 }}>
            <PixelIcon name="happyMac" size={34} style={{ color: "#111", ["--icon-fill" as string]: "var(--screen)" }} />
            <div style={{ fontFamily: "var(--pixel)", fontSize: 8, marginTop: 6, letterSpacing: ".04em" }}>Welcome to Macintosh</div>
          </div>
        </CompactMac>
        <div style={{ flex: 1 }}>
          <div className="kicker">{t("Welcome")}</div>
          <h2>{t("Your classic Mac,")}<br />{t("connected to the 21st century.")}</h2>
          <p>{t("Emulate any System release, build the ESP32 bridge step by step, move games and apps across with Disk Studio, and debug your code on real hardware.")}</p>
          <div className="row wrap">
            <button className="btn primary lg" onClick={() => go("emulator")}><Icon name="play" /> {t("Start the emulator")}</button>
            <button className="btn lg" onClick={() => go("disks")}><PixelIcon name="floppy" size={15} /> Disk Studio</button>
            <button className="btn lg" onClick={() => go("hardware")}><PixelIcon name="chip" size={15} /> {t("ESP32 wiring")}</button>
          </div>
        </div>
      </div>

      <div className="grid g4">
        <div className="card tile">
          <div className="row"><div className="tile-icon"><PixelIcon name="chip" size={20} /></div><span className={`pill right ${status === "connected" ? "ok" : ""}`}><span className="dot" />{status === "connected" ? t("Connected") : t("Disconnected")}</span></div>
          <div><div className="stat-value">{info ? `v${info.fw}` : "—"}</div><div className="stat-label">{t("ESP32 bridge")} {info ? `· ${info.mode.toUpperCase()}` : ""}</div></div>
          <button className="btn sm" style={{ marginTop: "auto", alignSelf: "flex-start" }} onClick={() => setConnect(true)}>{status === "connected" ? linkLabel.split(" · ")[0] : t("Connect…")}</button>
        </div>
        <div className="card tile">
          <div className="row"><div className="tile-icon"><PixelIcon name="happyMac" size={20} /></div><span className={`pill right ${agentOnline ? "ok" : ""}`}><span className="dot" />{agentOnline ? `${latency} ms` : t("Offline")}</span></div>
          <div><div className="stat-value">{sysinfo ? sysinfo.machineName : model.name}</div><div className="stat-label">{sysinfo ? `System ${sysinfo.systemVersion} · ${Math.round(sysinfo.physicalRam / 1048576)} MB RAM` : t("Real Mac (configured)")}</div></div>
          <button className="btn sm" style={{ marginTop: "auto", alignSelf: "flex-start" }} onClick={() => go("screen")} disabled={!agentOnline}>{t("Show the screen")}</button>
        </div>
        <div className="card tile">
          <div className="row"><div className="tile-icon"><PixelIcon name="screen" size={20} /></div><span className="pill right accent">Infinite Mac</span></div>
          <div><div className="stat-value">{settings.emu.disk}</div><div className="stat-label">{settings.emu.machine}</div></div>
          <button className="btn sm" style={{ marginTop: "auto", alignSelf: "flex-start" }} onClick={() => go("emulator")}><Icon name="play" size={12} /> {t("Boot")}</button>
        </div>
        <div className="card tile">
          <div className="row"><div className="tile-icon"><PixelIcon name="floppy" size={20} /></div><span className="pill right">HFS</span></div>
          <div><div className="stat-value">Disk Studio</div><div className="stat-label">{t("Create and edit .dsk, .img and .hda images")}</div></div>
          <button className="btn sm" style={{ marginTop: "auto", alignSelf: "flex-start" }} onClick={() => go("disks")}>{t("Open a disk…")}</button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
        <div className="card">
          <div className="card-head"><h3>{t("Getting started")}</h3><span className="sub">{t("{done} of {total}", { done: steps.filter((s) => s.done).length, total: steps.length })}</span></div>
          <div className="steps">
            {steps.map((s, i) => (
              <div key={i} className={`step ${s.done ? "done" : ""}`}>
                <div className="step-num">{s.done ? <Icon name="check" size={13} stroke={2.2} /> : i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div className="strong">{s.title}</div>
                  <div className="small muted">{s.desc}</div>
                </div>
                <button className="btn sm" onClick={s.action}>{s.cta}</button>
              </div>
            ))}
          </div>
        </div>
        <div className="win">
          <div className="win-bar"><span className="win-close" /><span className="win-title">{t("About Platinum")}</span></div>
          <div className="win-body small">
            <p style={{ marginTop: 0 }}>{t("Platinum is a workbench for classic Macs (1984–2001):")}</p>
            <ul style={{ paddingLeft: 18, margin: 0, lineHeight: 1.8 }}>
              <li>{tx("{b} embedded (Infinite Mac) or native (Mini vMac, Basilisk II, SheepShaver, QEMU)", { b: <b>{t("Emulator")}</b> })}</li>
              <li>{tx("{b}: Bluetooth keyboard and mouse over ADB or M0110, RS-422 serial over WiFi", { b: <b>{t("ESP32 bridge")}</b> })}</li>
              <li>{tx("{b}: our own TransMac for HFS, MacBinary and BinHex", { b: <b>Disk Studio</b> })}</li>
              <li>{tx("{screen} and {debug} with Platinum Agent on the real Mac", { screen: <b>{t("Remote screen")}</b>, debug: <b>{t("debugging")}</b> })}</li>
            </ul>
          </div>
        </div>
      </div>
      {connect && <ConnectSheet onClose={() => setConnect(false)} />}
    </div>
  );
}
