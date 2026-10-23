import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/state/store";
import { addNode, createImage, decodeMacBinary, isMacBinary, saveImage, newFile } from "@/lib/hfs";
import { CopyBlock, Empty, Field, PageHead, fmtBytes } from "@/ui/components";
import { Icon, PixelIcon } from "@/ui/icons";
import { useCommand } from "@/ui/useCommand";
import { N_, t, tx } from "@/i18n";
import { examplePath, joinPath } from "@/lib/paths";

type Tab = "console" | "memory" | "build" | "agent";
const LEVELS = [N_("Trace"), N_("Info"), N_("Warning"), N_("Error")];

export function Debug() {
  const [tab, setTab] = useState<Tab>("console");
  const { agentOnline, sysinfo, latency, bridge } = useApp();
  return (
    <div style={{ maxWidth: 1280 }}>
      <PageHead kicker="Macintosh" title={t("Debugger")} desc={t("Run and debug your programs on the real Mac: live log, memory inspector and the build → send → run loop with Retro68.")}>
        {agentOnline && sysinfo && <span className="pill ok"><span className="dot" />{sysinfo.machineName} · {latency} ms</span>}
      </PageHead>
      <div className="tabs">
        <button className={`tab ${tab === "console" ? "on" : ""}`} onClick={() => setTab("console")}><Icon name="terminal" size={14} /> {t("Console")}</button>
        <button className={`tab ${tab === "memory" ? "on" : ""}`} onClick={() => setTab("memory")}><Icon name="eye" size={14} /> {t("Memory")}</button>
        <button className={`tab ${tab === "build" ? "on" : ""}`} onClick={() => setTab("build")}><Icon name="hammer" size={14} /> {t("Build & run")}</button>
        <button className={`tab ${tab === "agent" ? "on" : ""}`} onClick={() => setTab("agent")}><PixelIcon name="happyMac" size={13} /> Platinum Agent</button>
      </div>
      {tab === "console" && <ConsoleTab />}
      {tab === "memory" && (agentOnline && bridge ? <MemoryTab /> : <NeedAgent />)}
      {tab === "build" && <BuildTab />}
      {tab === "agent" && <AgentTab />}
    </div>
  );
}

function NeedAgent() {
  return <div className="card"><Empty icon="bug" title={t("The agent must be online")}>{t("Open Platinum Agent on the Mac and connect the bridge or a direct serial cable. See the “Platinum Agent” tab to install it.")}</Empty></div>;
}

function ConsoleTab() {
  const { agentLog, sysinfo, agentOnline, bridge } = useApp();
  const [minLevel, setMinLevel] = useState(0);
  const [q, setQ] = useState("");
  const [follow, setFollow] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => agentLog.filter((l) => l.level >= minLevel && (!q || l.text.toLowerCase().includes(q.toLowerCase()) || l.source.toLowerCase().includes(q.toLowerCase()))), [agentLog, minLevel, q]);
  useEffect(() => { if (follow) ref.current?.scrollTo(0, 1e9); }, [shown, follow]);

  const exportLog = () => window.platinum.saveFile("platinum-log.txt", new TextEncoder().encode(agentLog.map((l) => `${new Date(l.at).toISOString()} [${LEVELS[l.level] ?? l.level}] ${l.source}: ${l.text}`).join("\n")));

  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr 300px", alignItems: "start" }}>
      <div className="card" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 290px)", minHeight: 380 }}>
        <div className="row" style={{ padding: "10px 12px", borderBottom: "1px solid var(--line)" }}>
          <input className="input" style={{ maxWidth: 260 }} placeholder={t("Filter…")} value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="select" style={{ width: 130 }} value={minLevel} onChange={(e) => setMinLevel(Number(e.target.value))}>
            {LEVELS.map((l, i) => <option key={l} value={i}>{i === 0 ? t("All") : t("{level} and above", { level: t(l) })}</option>)}
          </select>
          <label className="row small"><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> {t("Follow")}</label>
          <span className="spacer" />
          <span className="small muted">{t("{n} lines", { n: shown.length })}{bridge?.agent.badFrames ? ` · ${t("{n} bad frames", { n: bridge.agent.badFrames })}` : ""}</span>
          <button className="btn sm" onClick={exportLog} disabled={!agentLog.length}>{t("Export")}</button>
          <button className="btn sm" onClick={() => useApp.setState({ agentLog: [] })}>{t("Clear")}</button>
        </div>
        <div ref={ref} className="console" style={{ flex: 1 }}>
          {shown.length === 0 && <div className="ln lv0">{agentOnline ? t("Waiting for messages… Call PDLog() from your program.") : t("The agent is not connected.")}</div>}
          {shown.map((l, i) => (
            <div key={i} className={`ln lv${Math.min(3, l.level)}`}>
              <span className="t">{new Date(l.at).toLocaleTimeString()}.{String(l.at % 1000).padStart(3, "0")}</span>
              <span className="src">{l.source}</span>{l.text}
            </div>
          ))}
        </div>
      </div>
      <div className="col" style={{ gap: 14 }}>
        <div className="card">
          <div className="card-head"><h3>{t("The Mac")}</h3></div>
          {sysinfo ? (
            <table className="tbl"><tbody>
              <tr><td className="muted">Model</td><td>{sysinfo.machineName}</td></tr>
              <tr><td className="muted">{t("System")}</td><td>System {sysinfo.systemVersion}</td></tr>
              <tr><td className="muted">RAM</td><td>{fmtBytes(sysinfo.physicalRam)}</td></tr>
              <tr><td className="muted">{t("Free")}</td><td>{fmtBytes(sysinfo.freeMem)}</td></tr>
              <tr><td className="muted">{t("Screen")}</td><td>{sysinfo.screen.w}×{sysinfo.screen.h}, {sysinfo.screen.depth} bpp</td></tr>
              <tr><td className="muted">Agent</td><td>v{sysinfo.agentVersion}</td></tr>
            </tbody></table>
          ) : <div className="list-row small muted">{t("No data yet.")}</div>}
        </div>
        <div className="card card-pad col" style={{ gap: 8 }}>
          <div className="strong">{t("Log from your code")}</div>
          <CopyBlock text={`#include "pdebug.h"\n\nPDInit();\nPDLog("Hello from the Mac! x=%d", x);\nPDWarn("Low memory: %ld", FreeMem());\nPDHex("buffer", buf, 64);`} />
          <div className="hint">{tx("Copy {dir} into your Retro68 project. If the agent is running, messages go through it; otherwise your program opens the Modem port directly.", { dir: <code>mac-agent/pdebug/</code> })}</div>
        </div>
      </div>
    </div>
  );
}

function MemoryTab() {
  const { bridge, toast } = useApp();
  const [addr, setAddr] = useState("0x0000016A");
  const [len, setLen] = useState(256);
  const [data, setData] = useState<{ base: number; bytes: Uint8Array } | null>(null);
  const [poke, setPoke] = useState("");
  const parse = (s: string) => parseInt(s.replace(/^\$/, "0x"), s.trim().match(/^(0x|\$)/i) ? 16 : 10);

  const read = async () => {
    try { const base = parse(addr); setData({ base, bytes: await bridge!.agent.peek(base, len) }); }
    catch (e) { toast((e as Error).message, "err"); }
  };
  const write = async () => {
    const bytes = new Uint8Array(poke.trim().split(/[\s,]+/).filter(Boolean).map((h) => parseInt(h, 16)));
    if (!bytes.length || bytes.some(isNaN)) return toast(t("Type bytes in hexadecimal: 4E 71 4E 75"), "err");
    try { await bridge!.agent.poke(parse(addr), bytes); toast(t("{n} bytes written", { n: bytes.length }), "ok"); read(); }
    catch (e) { toast((e as Error).message, "err"); }
  };

  const LOWMEM = [["Ticks", 0x16a], ["MemTop", 0x108], ["CurApName", 0x910], ["ScrnBase", 0x824], ["ApplZone", 0x2aa], ["SysZone", 0x2a6], ["CurrentA5", 0x904], ["ROMBase", 0x2ae]] as const;

  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr 300px", alignItems: "start" }}>
      <div className="card">
        <div className="row" style={{ padding: "10px 12px", borderBottom: "1px solid var(--line)" }}>
          <Field label={t("Address")}><input className="input mono" style={{ width: 140 }} value={addr} onChange={(e) => setAddr(e.target.value)} onKeyDown={(e) => e.key === "Enter" && read()} /></Field>
          <Field label="Bytes"><select className="select" style={{ width: 90 }} value={len} onChange={(e) => setLen(Number(e.target.value))}>{[64, 128, 256, 512].map((n) => <option key={n}>{n}</option>)}</select></Field>
          <button className="btn primary" style={{ alignSelf: "flex-end" }} onClick={read}><Icon name="eye" size={14} /> {t("Read")}</button>
          <button className="btn" style={{ alignSelf: "flex-end" }} onClick={read} disabled={!data}><Icon name="refresh" size={14} /></button>
        </div>
        <div className="console" style={{ minHeight: 360, background: "var(--surface)", color: "var(--text)" }}>
          {!data && <div className="ln muted">{t("Read an address to see what's there.")}</div>}
          {data && Array.from({ length: Math.ceil(data.bytes.length / 16) }, (_, r) => {
            const row = data.bytes.subarray(r * 16, r * 16 + 16);
            return (
              <div key={r} className="ln">
                <span style={{ color: "var(--accent-text)" }}>{(data.base + r * 16).toString(16).toUpperCase().padStart(8, "0")}</span>{"  "}
                {Array.from(row, (b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ").padEnd(47)}{"  "}
                <span style={{ color: "var(--muted)" }}>{Array.from(row, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("")}</span>
              </div>
            );
          })}
        </div>
        <div className="row" style={{ padding: "10px 12px", borderTop: "1px solid var(--line)" }}>
          <input className="input mono" placeholder={t("Bytes to write (hex): 4E 71 4E 75")} value={poke} onChange={(e) => setPoke(e.target.value)} />
          <button className="btn danger" onClick={write}><Icon name="edit" size={14} /> {t("Write")}</button>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h3>{t("Low-memory globals")}</h3></div>
        {LOWMEM.map(([n, a]) => (
          <button key={n} className="list-row" style={{ width: "100%", border: 0, background: "none", textAlign: "left", cursor: "default" }} onClick={() => setAddr(`0x${a.toString(16).toUpperCase().padStart(8, "0")}`)}>
            <span className="grow strong">{n}</span><span className="mono muted">${a.toString(16).toUpperCase()}</span>
          </button>
        ))}
        <div className="list-row tiny muted">{t("Writing to memory can crash the Mac. Know what you're poking.")}</div>
      </div>
    </div>
  );
}

function BuildTab() {
  const { settings, patchSettings, bridge, agentOnline, toast, set: setApp, go } = useApp();
  const dev = settings.dev;
  const set = (p: Partial<typeof dev>) => patchSettings({ dev: { ...dev, ...p } });
  const cmd = useCommand();
  const [inbox, setInbox] = useState<{ name: string; type: string; creator: string; size: number }[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo(0, 1e9); }, [cmd.lines]);

  const loadApp = async () => {
    if (!dev.outputApp) throw new Error(t("Choose the file Retro68 produces (.bin)."));
    const blob = await window.platinum.readFile(dev.outputApp);
    return isMacBinary(blob.data) ? decodeMacBinary(blob.data) : newFile(blob.name.replace(/\.(bin|APPL)$/i, ""), { type: "APPL", creator: "????", data: blob.data });
  };

  const sendAndRun = async () => {
    try {
      const app = await loadApp();
      toast(t("Sending {name} ({size})…", { name: app.name, size: fmtBytes(app.data.length + app.rsrc.length) }), "info");
      await bridge!.agent.sendFile(app);
      await bridge!.agent.launch(app.name);
      toast(t("{name} is running on the Mac", { name: app.name }), "ok");
    } catch (e) { toast((e as Error).message, "err"); }
  };

  const runInEmulator = async () => {
    try {
      const app = await loadApp();
      const img = createImage("Build", 1440 * 1024, false);
      addNode(img.volume.root, app);
      const url = await window.platinum.serveDiskBuffer(`${app.name}.dsk`, saveImage(img));
      setApp({ pendingDiskUrl: { name: app.name, url } });
      go("emulator");
    } catch (e) { toast((e as Error).message, "err"); }
  };

  return (
    <div className="grid" style={{ gridTemplateColumns: "400px 1fr", alignItems: "start" }}>
      <div className="col" style={{ gap: 14 }}>
        <div className="card card-pad col" style={{ gap: 12 }}>
          <h3>{t("Retro68 project")}</h3>
          <Field label={t("Project folder")}>
            <div className="row"><input className="input" value={dev.project} readOnly placeholder={examplePath("C:\\dev\\games\\my-game", "~/dev/my-game")} /><button className="btn" onClick={async () => { const p = await window.platinum.pick({ dir: true }); if (p) set({ project: p }); }}>{t("Choose…")}</button></div>
          </Field>
          <Field label={t("Build command")} hint={t("On Windows, Retro68 usually runs inside WSL: wsl -e bash -lc \"cmake --build build\"")}>
            <input className="input mono" value={dev.buildCmd} onChange={(e) => set({ buildCmd: e.target.value })} />
          </Field>
          <Field label={t("Resulting app (MacBinary .bin)")}>
            <div className="row"><input className="input" value={dev.outputApp} readOnly placeholder={joinPath("build", "MyGame.bin")} /><button className="btn" onClick={async () => { const p = await window.platinum.pick({ title: t("Retro68 output"), filters: [{ name: "MacBinary", extensions: ["bin"] }, { name: t("All files"), extensions: ["*"] }] }); if (p) set({ outputApp: p }); }}>{t("Choose…")}</button></div>
          </Field>
          <div className="row wrap">
            <button className="btn" disabled={cmd.running || !dev.project} onClick={() => cmd.run(dev.buildCmd, dev.project)}><Icon name="hammer" size={14} /> {t("Build")}</button>
            <button className="btn primary" disabled={cmd.running || !agentOnline} onClick={async () => { if (!dev.project || (await cmd.run(dev.buildCmd, dev.project)) === 0) await sendAndRun(); }} title={agentOnline ? "" : t("The agent must be online")}><Icon name="send" size={14} /> {t("Build & run on the Mac")}</button>
            <button className="btn" disabled={cmd.running} onClick={async () => { if (!dev.project || (await cmd.run(dev.buildCmd, dev.project)) === 0) await runInEmulator(); }}><PixelIcon name="happyMac" size={13} /> {t("In the emulator")}</button>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>{t("Mac inbox")}</h3><span className="sub">{t("“Platinum Inbox” folder")}</span>
            <button className="btn sm right" disabled={!agentOnline} onClick={async () => { try { setInbox(await bridge!.agent.list()); } catch (e) { toast((e as Error).message, "err"); } }}><Icon name="refresh" size={12} /></button>
          </div>
          {!inbox ? <div className="list-row small muted">{agentOnline ? t("Press refresh to see what's there.") : t("Agent offline.")}</div>
            : inbox.length === 0 ? <div className="list-row small muted">{t("Empty.")}</div>
            : inbox.map((f) => (
              <div key={f.name} className="list-row">
                <PixelIcon name={f.type === "APPL" ? "app" : "doc"} size={18} />
                <div className="grow"><div className="strong">{f.name}</div><div className="tiny muted mono">{f.type}/{f.creator} · {fmtBytes(f.size)}</div></div>
                {f.type === "APPL" && <button className="btn sm" onClick={() => bridge!.agent.launch(f.name).catch((e) => toast(e.message, "err"))}><Icon name="play" size={12} /> {t("Open")}</button>}
              </div>
            ))}
        </div>
      </div>
      <div className="card" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 290px)", minHeight: 380 }}>
        <div className="card-head"><h3>{t("Build output")}</h3>{cmd.running && <button className="btn sm danger" onClick={cmd.kill}>{t("Stop")}</button>}<button className="btn sm right" onClick={cmd.clear}>{t("Clear")}</button></div>
        <div ref={ref} className="console" style={{ flex: 1 }}>
          {cmd.lines.length === 0 && <div className="ln lv0">{t("Build to see the output here.")}</div>}
          {cmd.lines.map((l, i) => <div key={i} className={`ln ${l.s === "err" ? (/error/i.test(l.t) ? "lv3" : "lv2") : l.s === "sys" ? "app" : "lv1"}`}>{l.t}</div>)}
        </div>
      </div>
    </div>
  );
}

function AgentTab() {
  const { toast, set: setApp, go } = useApp();
  const [agentDir, setAgentDir] = useState("");
  const [ready, setReady] = useState(false);
  const built = joinPath(agentDir, "build", "PlatinumAgent.bin");
  useEffect(() => { window.platinum.appInfo().then((i) => setAgentDir(i.agentDir)); }, []);
  // Release builds ship a prebuilt agent; a source checkout needs it built first.
  useEffect(() => { if (agentDir) window.platinum.exists(built).then(setReady); }, [agentDir]);

  const makeFloppy = async () => {
    try {
      const blob = await window.platinum.readFile(built);
      const img = createImage("Platinum Agent", 1440 * 1024, true);
      addNode(img.volume.root, decodeMacBinary(blob.data));
      const path = await window.platinum.saveFile("Platinum Agent.image", saveImage(img));
      if (path) toast(t("Floppy created. Write it with FloppyEmu or Greaseweazle, or copy it to the BlueSCSI SD card."), "ok");
    } catch { toast(t("There is no built PlatinumAgent.bin yet. Follow step 1."), "err"); }
  };
  const tryEmu = async () => {
    try {
      const blob = await window.platinum.readFile(built);
      const img = createImage("Platinum Agent", 1440 * 1024, false);
      addNode(img.volume.root, decodeMacBinary(blob.data));
      setApp({ pendingDiskUrl: { name: "Platinum Agent", url: await window.platinum.serveDiskBuffer("agent.dsk", saveImage(img)) } });
      go("emulator");
    } catch { toast(t("Build the agent first."), "err"); }
  };

  return (
    <div className="grid g2" style={{ alignItems: "start" }}>
      <div className="card">
        <div className="card-head"><h3>{t("Installing Platinum Agent on the Mac")}</h3></div>
        <div className="steps">
          {ready ? (
            <div className="step done"><div className="step-num"><Icon name="check" size={13} stroke={2.2} /></div><div className="grow"><div className="strong">{t("Platinum Agent is included")}</div><div className="small muted">{t("A 68k app that runs from System 6.0.8 to Mac OS 9.")}</div></div></div>
          ) : (
            <div className="step"><div className="step-num">1</div><div className="grow"><div className="strong">{t("Build the agent with Retro68")}</div><div className="small muted">{t("The easiest way is Retro68's Docker image, on any OS. Produces a 68k app that runs from System 6.0.8 to Mac OS 9.")}</div><CopyBlock text={`docker run --rm -v "${agentDir}:/src" -w /src ghcr.io/autc04/retro68 sh -c "cmake -B build -DCMAKE_TOOLCHAIN_FILE=/Retro68-build/toolchain/m68k-apple-macos/cmake/retro68.toolchain.cmake && cmake --build build"`} /></div></div>
          )}
          <div className="step"><div className="step-num">2</div><div className="grow"><div className="strong">{t("Put it on a disk")}</div><div className="small muted">{t("Platinum makes a 1.44 MB floppy with the agent on it.")}</div><div className="row" style={{ marginTop: 6 }}><button className="btn sm primary" onClick={makeFloppy}><PixelIcon name="floppy" size={13} /> {t("Make the floppy")}</button><button className="btn sm" onClick={tryEmu}>{t("Try it in the emulator")}</button></div></div></div>
          <div className="step"><div className="step-num">3</div><div className="grow"><div className="strong">{t("Get it onto the Mac")}</div><div className="small muted">{t("FloppyEmu, BlueSCSI/ZuluSCSI, a real floppy written with Greaseweazle, or AppleTalk. You only need to do this once.")}</div></div></div>
          <div className="step"><div className="step-num">4</div><div className="grow"><div className="strong">{t("Open it and connect the Modem port")}</div><div className="small muted">{t("The agent opens the port at 57600 bps and waits. Put it in “Startup Items” so it opens by itself.")}</div></div></div>
        </div>
      </div>
      <div className="win">
        <div className="win-bar"><span className="win-close" /><span className="win-title">{t("What the agent does")}</span></div>
        <div className="win-body small col" style={{ gap: 8 }}>
          <div>{tx("{b}: receives files with both forks and their type/creator into “Platinum Inbox”.", { b: <b>{t("Files")}</b> })}</div>
          <div>{tx("{b}: reads video memory (1–32 bpp) and sends changed rows compressed with PackBits.", { b: <b>{t("Screen")}</b> })}</div>
          <div>{tx("{b}: forwards {fn} from your programs, and peeks/pokes memory.", { b: <b>{t("Debugging")}</b>, fn: <code>PDLog()</code> })}</div>
          <div>{tx("{b}: opens apps from the inbox with {fn}.", { b: <b>{t("Launching")}</b>, fn: <code>LaunchApplication</code> })}</div>
          <div>{tx("{b}: model (Gestalt), system version, RAM and screen.", { b: <b>{t("Info")}</b> })}</div>
          <div className="divider" />
          <div className="muted">{tx("Protocol: {frames} frames with CRC-16, documented in {doc}.", { frames: <code>A5 5A</code>, doc: <code>docs/protocol.md</code> })}</div>
        </div>
      </div>
    </div>
  );
}
