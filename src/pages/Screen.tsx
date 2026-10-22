import { useEffect, useRef, useState } from "react";
import { useApp } from "@/state/store";
import type { ScreenFrame } from "@/lib/link/agent";
import { adbCodeFor } from "@/lib/link/keymap";
import { Empty, PageHead, Seg, Toggle } from "@/ui/components";
import { Icon } from "@/ui/icons";
import { t, tx } from "@/i18n";

/** Convert an agent screen frame (1/2/4/8/16/32 bpp) into RGBA. */
function toImageData(f: ScreenFrame): ImageData {
  const img = new ImageData(f.w, f.h);
  const d = img.data;
  const clut = f.clut;
  const grey = (v: number, bits: number) => 255 - Math.round((v / ((1 << bits) - 1)) * 255);
  for (let y = 0; y < f.h; y++) {
    const row = y * f.rowBytes;
    for (let x = 0; x < f.w; x++) {
      const o = (y * f.w + x) * 4;
      let r = 0, g = 0, b = 0;
      if (f.depth <= 8) {
        const per = 8 / f.depth;
        const byte = f.pixels[row + Math.floor(x / per)];
        const shift = (per - 1 - (x % per)) * f.depth;
        const v = (byte >> shift) & ((1 << f.depth) - 1);
        if (clut && clut.length >= (v + 1) * 3 + 2) { r = clut[2 + v * 3]; g = clut[3 + v * 3]; b = clut[4 + v * 3]; }
        else r = g = b = grey(v, f.depth);
      } else if (f.depth === 16) {
        const v = (f.pixels[row + x * 2] << 8) | f.pixels[row + x * 2 + 1];
        r = ((v >> 10) & 31) << 3; g = ((v >> 5) & 31) << 3; b = (v & 31) << 3;
      } else {
        r = f.pixels[row + x * 4 + 1]; g = f.pixels[row + x * 4 + 2]; b = f.pixels[row + x * 4 + 3];
      }
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  return img;
}

export function Screen() {
  const { bridge, agentOnline, sysinfo, settings, toast } = useApp();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [streaming, setStreaming] = useState(false);
  const [delta, setDelta] = useState(true);
  const [crt, setCrt] = useState(true);
  const [scale, setScale] = useState<1 | 2>(1);
  const [stats, setStats] = useState({ fps: 0, rows: 0, w: 0, h: 0, depth: 0 });
  const [control, setControl] = useState(false);
  const streamRef = useRef(false);

  const draw = (f: ScreenFrame) => {
    const c = canvasRef.current;
    if (!c) return;
    if (c.width !== f.w || c.height !== f.h) { c.width = f.w; c.height = f.h; }
    c.getContext("2d")!.putImageData(toImageData(f), 0, 0);
  };

  const grabOnce = async () => {
    if (!bridge) return;
    try { const f = await bridge.agent.grabScreen(false); draw(f); setStats((s) => ({ ...s, w: f.w, h: f.h, depth: f.depth, rows: f.dirtyRows })); }
    catch (e) { toast((e as Error).message, "err"); }
  };

  useEffect(() => {
    streamRef.current = streaming;
    if (!streaming || !bridge) return;
    let frames = 0, t0 = performance.now();
    (async () => {
      while (streamRef.current) {
        try {
          const f = await bridge.agent.grabScreen(delta);
          draw(f);
          frames++;
          const dt = performance.now() - t0;
          if (dt > 1000) { setStats({ fps: (frames * 1000) / dt, rows: f.dirtyRows, w: f.w, h: f.h, depth: f.depth }); frames = 0; t0 = performance.now(); }
        } catch (e) { toast((e as Error).message, "err"); setStreaming(false); break; }
      }
    })();
    return () => { streamRef.current = false; };
  }, [streaming, delta, bridge]);

  // Forward input while the canvas holds the pointer lock.
  useEffect(() => {
    if (!control || !bridge || bridge.direct) return;
    const c = canvasRef.current!;
    c.requestPointerLock();
    let dx = 0, dy = 0, btn = false, dirty = false;
    const t = setInterval(() => { if (dirty) { bridge.mouse(dx, dy, btn); dx = dy = 0; dirty = false; } }, 16);
    const move = (e: MouseEvent) => { dx += e.movementX * settings.mouseSpeed; dy += e.movementY * settings.mouseSpeed; dirty = true; };
    const md = () => { btn = true; dirty = true; };
    const mu = () => { btn = false; dirty = true; };
    const key = (down: boolean) => (e: KeyboardEvent) => { e.preventDefault(); if (e.repeat) return; const a = adbCodeFor(e.code, settings.swapCmdCtrl); if (a !== undefined) bridge.key(a, down); };
    const kd = key(true), ku = key(false);
    const lock = () => { if (document.pointerLockElement !== c) setControl(false); };
    document.addEventListener("mousemove", move); document.addEventListener("mousedown", md); document.addEventListener("mouseup", mu);
    window.addEventListener("keydown", kd, true); window.addEventListener("keyup", ku, true);
    document.addEventListener("pointerlockchange", lock);
    return () => {
      clearInterval(t);
      document.removeEventListener("mousemove", move); document.removeEventListener("mousedown", md); document.removeEventListener("mouseup", mu);
      window.removeEventListener("keydown", kd, true); window.removeEventListener("keyup", ku, true);
      document.removeEventListener("pointerlockchange", lock);
      if (document.pointerLockElement === c) document.exitPointerLock();
    };
  }, [control]);

  const screenshot = () => {
    canvasRef.current?.toBlob(async (b) => {
      if (!b) return;
      const p = await window.platinum.saveFile(`Mac ${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`, new Uint8Array(await b.arrayBuffer()));
      if (p) toast(t("Screenshot saved"), "ok");
    });
  };

  if (!agentOnline) {
    return (
      <div style={{ maxWidth: 1100 }}>
        <PageHead kicker="Macintosh" title={t("Remote screen")} desc={t("See and control the real Mac's screen from your computer.")} />
        <div className="card"><Empty icon="screen" title={t("Platinum Agent is needed on the Mac")}>{tx("Connect the bridge (or a direct serial cable) and open {agent} on the Mac. The agent reads video memory and only sends the rows that change.", { agent: <b>Platinum Agent</b> })}</Empty></div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1240 }}>
      <PageHead kicker="Macintosh" title={t("Remote screen")} desc={`${sysinfo?.machineName ?? "Mac"} · ${stats.w || sysinfo?.screen.w}×${stats.h || sysinfo?.screen.h} · ${stats.depth || sysinfo?.screen.depth} bpp`}>
        <button className="btn" onClick={grabOnce} disabled={streaming}><Icon name="camera" /> {t("Capture")}</button>
        <button className={`btn ${streaming ? "" : "primary"}`} onClick={() => setStreaming(!streaming)}><Icon name={streaming ? "stop" : "play"} /> {streaming ? t("Stop") : t("Stream")}</button>
      </PageHead>
      <div className="grid" style={{ gridTemplateColumns: "1fr 280px", alignItems: "start" }}>
        <div className="desktop-pattern stage" style={{ borderRadius: 14, minHeight: 420 }}>
          <div style={{ padding: 16, borderRadius: 16, background: "linear-gradient(180deg, var(--beige), var(--beige-dark))", boxShadow: "var(--shadow-lg)" }}>
            <div className={crt ? "crt" : ""} style={{ borderRadius: crt ? "8px / 14px" : 2, overflow: "hidden", background: "#000", boxShadow: crt ? "inset 0 0 30px rgba(0,0,0,.6)" : undefined }}>
              <canvas ref={canvasRef} width={sysinfo?.screen.w ?? 512} height={sysinfo?.screen.h ?? 342} onClick={() => bridge && !bridge.direct && setControl(true)}
                style={{ display: "block", width: (stats.w || sysinfo?.screen.w || 512) * scale, imageRendering: "pixelated", cursor: control ? "none" : "pointer", filter: crt ? "contrast(1.08) brightness(1.02)" : undefined }} />
            </div>
          </div>
        </div>
        <div className="col" style={{ gap: 14 }}>
          <div className="card">
            <div className="list-row"><span className="grow strong">{t("Changes only")}</span><Toggle on={delta} onChange={setDelta} /></div>
            <div className="list-row"><span className="grow strong">{t("CRT effect")}</span><Toggle on={crt} onChange={setCrt} /></div>
            <div className="list-row"><span className="grow strong">{t("Scale")}</span><Seg value={scale} onChange={setScale} options={[{ value: 1, label: "1×" }, { value: 2, label: "2×" }]} /></div>
            <div className="list-row"><button className="btn sm" onClick={screenshot}><Icon name="download" size={13} /> {t("Save PNG")}</button></div>
          </div>
          <div className="card card-pad col" style={{ gap: 6 }}>
            <div className="stat-value">{stats.fps.toFixed(1)} <span className="small muted">fps</span></div>
            <div className="small muted">{t("{n} rows updated in the last frame", { n: stats.rows })}</div>
            <div className="small muted">{t("Link: {label}", { label: bridge?.transport.label ?? "—" })}</div>
          </div>
          <div className="card card-pad small muted">
            {control ? tx("Controlling the Mac. {key} to release.", { key: <span className="kbd">Esc</span> }) : t("Click the screen to control the Mac with your computer's keyboard and mouse (over ADB).")}
            <div className="divider" />
            {t("Streaming over serial is slow (57.6 kbps): a full 512×342 screen takes about 4 s, but with “changes only” the cursor and moving windows reach several fps.")}
          </div>
        </div>
      </div>
    </div>
  );
}
