import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/state/store";
import { ENGINES, ERA_LABELS, SCREEN_PRESETS, SYSTEMS, infiniteMacUrl, nativeArgs, type Era, type NativeEngine } from "@/lib/emulator/catalog";
import { Icon, PixelIcon } from "@/ui/icons";
import { CopyBlock, Field, Seg, SettingRow, Toggle } from "@/ui/components";
import { t, tx } from "@/i18n";

type RunState = "idle" | "loading" | "running" | "paused" | "exited" | "error";

interface WebviewEl extends HTMLElement {
  executeJavaScript(code: string): Promise<unknown>;
  reload(): void;
}

export function Emulator({ active }: { active: boolean }) {
  const [mode, setMode] = useState<"embedded" | "native">("embedded");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "340px minmax(0, 1fr)", gridTemplateRows: "minmax(0, 1fr)", height: "100%" }}>
      <div style={{ borderRight: "1px solid var(--line)", overflow: "auto", minHeight: 0, padding: "14px 18px 30px", background: "var(--surface)" }}>
        <Seg value={mode} onChange={setMode} options={[{ value: "embedded", label: t("Embedded") }, { value: "native", label: t("Native") }]} />
        <div style={{ height: 14 }} />
        {mode === "embedded" ? <EmbeddedConfig /> : <NativeConfigPanel />}
      </div>
      {mode === "embedded" ? <EmbeddedStage active={active} /> : <NativeStage />}
    </div>
  );
}

// ───────────── Embedded (Infinite Mac) ─────────────

const runBus = new EventTarget();

function EmbeddedConfig() {
  const { settings, patchSettings } = useApp();
  const emu = settings.emu;
  const set = (p: Partial<typeof emu>) => patchSettings({ emu: { ...emu, ...p } });
  const sys = SYSTEMS.find((s) => s.disk === emu.disk) ?? SYSTEMS[7];
  const eras = [...new Set(SYSTEMS.map((s) => s.era))] as Era[];

  return (
    <div className="col" style={{ gap: 16 }}>
      <div>
        <div className="label" style={{ marginBottom: 8 }}>{t("System software")}</div>
        <div className="col" style={{ gap: 12 }}>
          {eras.map((era) => (
            <div key={era}>
              <div className="pixel-tag" style={{ display: "inline-block", marginBottom: 6 }}>{ERA_LABELS[era]}</div>
              <div className="col" style={{ gap: 4 }}>
                {SYSTEMS.filter((s) => s.era === era).map((s) => (
                  <button key={s.disk} className={`choice ${s.disk === emu.disk ? "on" : ""}`} style={{ padding: "8px 10px" }}
                    onClick={() => set({ disk: s.disk, machine: s.machines.includes(emu.machine) ? emu.machine : s.machines[0], ...(s.era === "classic" && emu.width > 640 ? { width: 512, height: 342 } : {}) })}>
                    <PixelIcon name={s.arch === "ppc" ? "screen" : "happyMac"} size={18} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row"><span className="t">{s.label}</span><span className="tiny muted right">{s.year}</span></div>
                      {s.disk === emu.disk && <div className="d">{t(s.blurb)}</div>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Field label={t("Machine")}>
        <select className="select" value={emu.machine} onChange={(e) => set({ machine: e.target.value })}>
          {sys.machines.map((m) => <option key={m}>{m}</option>)}
        </select>
      </Field>

      <Field label={t("Screen")}>
        <select className="select" value={`${emu.width}x${emu.height}`} onChange={(e) => { const [w, h] = e.target.value.split("x").map(Number); set({ width: w, height: h }); }}>
          {SCREEN_PRESETS.map((p) => <option key={p.label} value={`${p.w}x${p.h}`}>{t(p.label)}</option>)}
        </select>
      </Field>
      <div className="row"><span className="label">{t("Scale")}</span><span className="spacer" /><Seg value={emu.scale} onChange={(v) => set({ scale: v })} options={[{ value: 1, label: "1×" }, { value: 2, label: "2×" }]} /></div>

      <div className="card" style={{ boxShadow: "inset 0 0 0 1px var(--line)" }}>
        <SettingRow title="Infinite HD" desc={t("A disk with hundreds of period games and apps")}><Toggle on={emu.infiniteHd} onChange={(v) => set({ infiniteHd: v })} /></SettingRow>
        <SettingRow title={t("Saved HD")} desc={t("Persists between sessions")}><Toggle on={emu.savedHd} onChange={(v) => set({ savedHd: v })} /></SettingRow>
        <SettingRow title={t("Auto-pause")} desc={t("When it isn't visible")}><Toggle on={emu.autoPause} onChange={(v) => set({ autoPause: v })} /></SettingRow>
        <SettingRow title="Ctrl ↔ ⌘" desc={t("The PC's Ctrl key acts as Command")}><Toggle on={settings.swapCmdCtrl} onChange={(v) => patchSettings({ swapCmdCtrl: v })} /></SettingRow>
      </div>

      <button className="btn primary lg" onClick={() => runBus.dispatchEvent(new Event("boot"))}><Icon name="play" /> {t("Boot {system}", { system: sys.label })}</button>
      <div className="hint">{tx("Emulation by {link} by Mihai Parparita (Apache-2.0). Needs an Internet connection the first time.", { link: <a onClick={() => window.platinum.openExternal("https://infinitemac.org")}>Infinite Mac</a> })}</div>
    </div>
  );
}

function EmbeddedStage({ active }: { active: boolean }) {
  const { settings, pendingDiskUrl, set: setApp, toast } = useApp();
  const emu = settings.emu;
  const ref = useRef<WebviewEl>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<RunState>("idle");
  const [error, setError] = useState("");
  const [disks, setDisks] = useState<{ name: string; url: string }[]>([]);

  const build = (extra = disks) => infiniteMacUrl({
    ...emu, ramMB: undefined, swapCmdCtrl: settings.swapCmdCtrl,
    diskUrls: extra.map((d) => d.url), screenUpdates: false,
  });

  const boot = (extra = disks) => { setState("loading"); setError(""); setUrl(build(extra) + `&_=${Date.now()}`); };

  useEffect(() => {
    const h = () => boot();
    runBus.addEventListener("boot", h);
    return () => runBus.removeEventListener("boot", h);
  });

  // A disk sent from Disk Studio: insert live if running, otherwise boot with it.
  useEffect(() => {
    if (!pendingDiskUrl) return;
    setApp({ pendingDiskUrl: null });
    const next = [...disks, pendingDiskUrl];
    setDisks(next);
    if (state === "running" || state === "paused") { send({ type: "emulator_load_disk", url: pendingDiskUrl.url }); toast(t("Disk “{name}” inserted", { name: pendingDiskUrl.name }), "ok"); }
    else boot(next);
  }, [pendingDiskUrl]);

  useEffect(() => {
    const wv = ref.current;
    if (!wv || !url) return;
    const onReady = () => {
      // Embedded notifications are posted to window.parent, which is the guest itself inside <webview>.
      wv.executeJavaScript(`window.addEventListener("message", (e) => {
        const d = e.data; if (d && typeof d.type === "string" && d.type.startsWith("emulator_") && d.type !== "emulator_screen")
          console.log("__PLATINUM__" + JSON.stringify({ type: d.type, error: d.error }));
      });`).catch(() => {});
    };
    const onConsole = (e: Event) => {
      const msg = (e as unknown as { message: string }).message;
      if (!msg.startsWith("__PLATINUM__")) return;
      const d = JSON.parse(msg.slice(12));
      if (d.type === "emulator_loaded") setState("running");
      if (d.type === "emulator_exited") setState("exited");
      if (d.type === "emulator_error") { setState("error"); setError(d.error); }
    };
    const onFail = (e: Event) => { const ev = e as unknown as { errorDescription: string; errorCode: number }; if (ev.errorCode !== -3) { setState("error"); setError(ev.errorDescription); } };
    wv.addEventListener("dom-ready", onReady);
    wv.addEventListener("console-message", onConsole);
    wv.addEventListener("did-fail-load", onFail);
    return () => { wv.removeEventListener("dom-ready", onReady); wv.removeEventListener("console-message", onConsole); wv.removeEventListener("did-fail-load", onFail); };
  }, [url]);

  const send = (msg: Record<string, unknown>) => ref.current?.executeJavaScript(`window.postMessage(${JSON.stringify(msg)}, "*")`).catch(() => {});

  useEffect(() => {
    if (!active && state === "running" && emu.autoPause) { send({ type: "emulator_pause" }); setState("paused"); }
  }, [active]);

  const attachFile = async () => {
    const files = await window.platinum.pick({ title: t("Choose a disk image"), filters: [{ name: t("Disk images"), extensions: ["dsk", "img", "image", "hda", "iso", "toast", "cdr"] }] });
    if (!files) return;
    const d = { name: files.split(/[\\/]/).pop()!, url: await window.platinum.serveDiskFile(files) };
    setApp({ pendingDiskUrl: d });
  };

  const w = emu.width * emu.scale, h = emu.height * emu.scale;
  const label: Record<RunState, string> = { idle: t("Stopped"), loading: t("Loading…"), running: t("Running"), paused: t("Paused"), exited: t("Shut down"), error: t("Error") };

  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, height: "100%" }}>
      <div className="row wrap" style={{ flex: "none", rowGap: 8, padding: "10px 16px", borderBottom: "1px solid var(--line)", background: "var(--surface)" }}>
        <span className={`pill ${state === "running" ? "ok" : state === "error" ? "err" : state === "loading" ? "warn" : ""}`}><span className={`dot ${state === "loading" ? "pulse" : ""}`} />{label[state]}</span>
        <span className="small muted">{emu.disk} · {emu.machine} · {emu.width}×{emu.height}</span>
        <span className="spacer" />
        {disks.length > 0 && <span className="pill accent"><PixelIcon name="floppy" size={11} /> {disks.length === 1 ? t("1 disk") : t("{n} disks", { n: disks.length })}</span>}
        <button className="btn sm" onClick={attachFile} title={t("Insert a disk image from this computer")}><PixelIcon name="floppy" size={13} /> {t("Insert disk")}</button>
        {state === "running" && <button className="btn sm" onClick={() => { send({ type: "emulator_pause" }); setState("paused"); }}><Icon name="pause" size={13} /> {t("Pause")}</button>}
        {state === "paused" && <button className="btn sm" onClick={() => { send({ type: "emulator_unpause" }); setState("running"); }}><Icon name="play" size={13} /> {t("Resume")}</button>}
        <button className="btn sm" onClick={() => boot()}><Icon name="refresh" size={13} /> {url ? t("Restart") : t("Boot")}</button>
        {url && <button className="btn sm" onClick={() => { setUrl(null); setState("idle"); setDisks([]); }}><Icon name="stop" size={13} /> {t("Stop")}</button>}
        {url && <button className="btn sm icon" title={t("Full screen")} onClick={() => ref.current?.requestFullscreen()}><Icon name="expand" size={13} /></button>}
      </div>
      <div className="desktop-pattern stage" style={{ flex: 1 }}>
        {url ? (
          <div style={{ padding: 14, borderRadius: 14, background: "linear-gradient(180deg, var(--platinum), var(--platinum-dark))", boxShadow: "var(--shadow-lg)" }}>
            <div style={{ width: w, height: h, background: "#000", borderRadius: 4, overflow: "hidden", position: "relative" }}>
              <webview ref={ref as React.Ref<HTMLElement>} src={url} partition="persist:infinitemac" style={{ width: w, height: h, display: "flex" }} />
              {state === "loading" && (
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "#9a9aae", pointerEvents: "none" }}>
                  <div className="center"><PixelIcon name="happyMac" size={48} style={{ color: "#111", ["--icon-fill" as string]: "#fff" }} /><div style={{ fontFamily: "var(--pixel)", fontSize: 9, marginTop: 10, color: "#111" }}>{t("Loading…")}</div></div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="card center" style={{ padding: "34px 40px", maxWidth: 420 }}>
            <PixelIcon name={state === "error" ? "sad" : "happyMac"} size={56} />
            <h3 style={{ marginTop: 14, fontSize: 17 }}>{state === "error" ? t("The emulator failed") : t("{system} is ready", { system: emu.disk })}</h3>
            <p className="muted small">{state === "error" ? error : t("Pick a system on the left and press Boot. You can insert your own disks from Disk Studio or from this computer.")}</p>
            <button className="btn primary lg" onClick={() => boot()}><Icon name="play" /> {t("Boot")}</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────── Native emulators ─────────────

function NativeConfigPanel() {
  const { settings, patchSettings } = useApp();
  const n = settings.native;
  const set = (p: Partial<typeof n>) => patchSettings({ native: { ...n, ...p } });
  const engine = ENGINES[n.engine];
  const exe = n.exes[n.engine] ?? "";

  return (
    <div className="col" style={{ gap: 14 }}>
      <Field label={t("Emulator")}>
        <select className="select" value={n.engine} onChange={(e) => set({ engine: e.target.value as NativeEngine })}>
          {(Object.keys(ENGINES) as NativeEngine[]).map((k) => <option key={k} value={k}>{ENGINES[k].name} — {ENGINES[k].arch}</option>)}
        </select>
      </Field>
      <Field label={t("Executable")} hint={tx("Download it from {link}", { link: <a onClick={() => window.platinum.openExternal(engine.url)}>{engine.url.replace(/^https?:\/\//, "")}</a> })}>
        <div className="row">
          <input className="input" value={exe} readOnly placeholder={t("No executable chosen")} />
          <button className="btn" onClick={async () => { const p = await window.platinum.pick({ title: t("{engine} executable", { engine: engine.name }), filters: [{ name: t("Programs"), extensions: ["exe", "*"] }] }); if (p) set({ exes: { ...n.exes, [n.engine]: p } }); }}>{t("Choose…")}</button>
        </div>
      </Field>
      {engine.needsRom && (
        <Field label="ROM" hint={t("{hint}. Use the ROM from your own Mac.", { hint: t(engine.romHint) })}>
          <div className="row">
            <input className="input" value={n.rom} readOnly placeholder={t("No ROM")} />
            <button className="btn" onClick={async () => { const p = await window.platinum.pick({ title: t("ROM file") }); if (p) set({ rom: p }); }}>{t("Choose…")}</button>
          </div>
        </Field>
      )}
      <Field label={t("Disks")}>
        <div className="col" style={{ gap: 6 }}>
          {n.disks.map((d, i) => (
            <div key={d + i} className="row small" style={{ padding: "6px 8px", borderRadius: 8, background: "var(--surface-2)" }}>
              <PixelIcon name="floppy" size={13} /><span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d}>{d.split(/[\\/]/).pop()}</span>
              <button className="btn ghost sm icon" onClick={() => set({ disks: n.disks.filter((_, j) => j !== i) })}><Icon name="x" size={12} /></button>
            </div>
          ))}
          <button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={async () => { const p = await window.platinum.pick({ title: t("Disk image") }); if (p) set({ disks: [...n.disks, p] }); }}><Icon name="plus" size={12} /> {t("Add disk")}</button>
        </div>
      </Field>
      {n.engine !== "minivmac" && (
        <div className="grid g2">
          <Field label={t("RAM (MB)")}><input className="input" type="number" min={4} max={1024} value={n.ramMB} onChange={(e) => set({ ramMB: Number(e.target.value) })} /></Field>
          <Field label={t("Screen")}>
            <select className="select" value={`${n.width}x${n.height}`} onChange={(e) => { const [w, h] = e.target.value.split("x").map(Number); set({ width: w, height: h }); }}>
              {[...SCREEN_PRESETS, { label: "1280 × 960", w: 1280, h: 960 }].map((p) => <option key={p.label} value={`${p.w}x${p.h}`}>{p.w}×{p.h}</option>)}
            </select>
          </Field>
        </div>
      )}
      {n.engine === "basilisk" && (
        <div className="grid g2">
          <Field label={t("Model (Gestalt−6)")}><input className="input" type="number" value={n.modelId ?? 14} onChange={(e) => set({ modelId: Number(e.target.value) })} /></Field>
          <Field label="CPU">
            <select className="select" value={n.cpu ?? 4} onChange={(e) => set({ cpu: Number(e.target.value) })}>
              <option value={2}>68020</option><option value={3}>68030</option><option value={4}>68040</option>
            </select>
          </Field>
        </div>
      )}
      <Field label={t("Extra arguments")}><input className="input mono" value={n.extraArgs ?? ""} onChange={(e) => set({ extraArgs: e.target.value })} placeholder={t("e.g. --nogui true")} /></Field>
    </div>
  );
}

function NativeStage() {
  const { settings, toast } = useApp();
  const n = settings.native;
  const exe = n.exes[n.engine] ?? "";
  const engine = ENGINES[n.engine];
  const args = useMemo(() => nativeArgs({ ...n, exe }), [n, exe]);
  const quote = (s: string) => (/\s/.test(s) ? `"${s}"` : s);
  const ready = !!exe && (!engine.needsRom || !!n.rom || n.engine === "minivmac") && n.disks.length > 0;

  const launch = async () => {
    if (n.engine === "minivmac" && n.rom) {
      const target = exe.replace(/[^\\/]+$/, "vMac.ROM");
      if (!(await window.platinum.exists(target))) await window.platinum.copyFile(n.rom, target);
    }
    const pid = await window.platinum.launchEmulator(exe, args);
    toast(t("{engine} is running (PID {pid})", { engine: engine.name, pid }), "ok");
  };

  return (
    <div className="desktop-pattern stage">
      <div className="win" style={{ width: "min(720px, 100%)" }}>
        <div className="win-bar"><span className="win-close" /><span className="win-title">{engine.name}</span></div>
        <div className="win-body col" style={{ gap: 14 }}>
          <div className="row">
            <PixelIcon name="happyMac" size={40} />
            <div>
              <h3>{engine.name}</h3>
              <div className="small muted">{engine.arch} · {t("opens in its own window")}</div>
            </div>
            <button className="btn primary lg right" disabled={!ready} onClick={launch}><Icon name="play" /> {t("Launch")}</button>
          </div>
          {!ready && <div className="pill warn" style={{ alignSelf: "flex-start" }}><Icon name="info" size={12} /> {engine.needsRom ? t("Choose the executable, the ROM and at least one disk") : t("Choose the executable and at least one disk")}</div>}
          <div>
            <div className="label" style={{ marginBottom: 6 }}>{t("Command that will run")}</div>
            <CopyBlock text={[quote(exe || `<${engine.name}>`), ...args.map(quote)].join(" ")} />
          </div>
          {n.engine === "minivmac" && <div className="hint">{tx("Mini vMac looks for the ROM as {file} next to the executable; Platinum copies it there if it's missing.", { file: <code>vMac.ROM</code> })}</div>}
          {n.engine === "qemu" && <div className="hint">{tx("For Mac OS 9 use {exe}. Add {args} to install.", { exe: <code>qemu-system-ppc</code>, args: <code>-cdrom installer.iso -boot d</code> })}</div>}
        </div>
      </div>
    </div>
  );
}
