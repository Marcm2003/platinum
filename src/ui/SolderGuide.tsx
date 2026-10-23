// Bench view of the build: every part drawn as it looks in your hand, with the pads to solder
// highlighted in their wire colour and labelled with where they go, plus a checklist of joints.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { partRefs, type ModulePart, type WireEnd, type WiringPlan } from "@/lib/hardware/wiring";
import { CONNECTORS, type Connector, type ConnectorId } from "@/lib/hardware/connectors";
import { t } from "@/i18n";

interface Joint { color: string; to: string }

export function SolderGuide({ plan }: { plan: WiringPlan }) {
  const refs = useMemo(() => partRefs(plan), [plan]);
  const describe = (e: WireEnd) => {
    if (e.part === "esp") return `${plan.board.shortChip} ${e.pin}`;
    const m = plan.modules.find((x) => x.id === e.part);
    if (m) return `${refs.get(m.id)} ${m.pins.find((p) => p.id === e.pin)?.label ?? e.pin}${pinNum(m, e.pin)}`;
    const c = CONNECTORS[e.part as ConnectorId];
    return `${refs.get(e.part)} ${t("pin {n}", { n: e.pin })} (${c?.pins.find((p) => String(p.n) === e.pin)?.name ?? ""})`;
  };
  /** Where each pad of a part goes. */
  const joints = (part: string) => {
    const m = new Map<string, Joint[]>();
    for (const w of plan.wires) {
      for (const [a, b] of [[w.from, w.to], [w.to, w.from]] as const) {
        if (a.part !== part) continue;
        m.set(a.pin, [...(m.get(a.pin) ?? []), { color: w.color, to: describe(b) + (w.via ? ` · ${t("via {part}", { part: w.via })}` : "") }]);
      }
    }
    return m;
  };

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="grid g2" style={{ alignItems: "start" }}>
        {plan.modules.map((m) => (
          <PartCard key={m.id} title={`${refs.get(m.id)} · ${m.part}`} sub={m.title}>
            {m.pkg.kind === "breakout" ? <Breakout m={m} joints={joints(m.id)} />
              : m.pkg.kind === "dip" ? <Dip m={m} joints={joints(m.id)} />
              : <ToNinetyTwo m={m} joints={joints(m.id)} />}
          </PartCard>
        ))}
        {plan.connectors.map((id) => (
          <PartCard key={id} title={`${refs.get(id)} · ${t(CONNECTORS[id].name)}`} sub={CONNECTORS[id].shape === "rj11" ? t("Crimped plug, seen from the contacts") : t("Your plug, seen from the solder side")}>
            <ConnectorSolder c={CONNECTORS[id]} joints={joints(id)} />
          </PartCard>
        ))}
      </div>
      <Checklist plan={plan} describe={describe} />
    </div>
  );
}

const pinNum = (m: ModulePart, id: string) => {
  const n = m.pins.find((p) => p.id === id)?.num;
  return n !== undefined ? ` (${t("pin {n}", { n })})` : "";
};

function PartCard({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <div className="card">
      <div className="card-head"><h3>{title}</h3><span className="sub">{sub}</span></div>
      <div style={{ padding: "8px 12px 14px" }}>{children}</div>
    </div>
  );
}

const COPPER = "#d4a94a";

/** A pad: copper ring with a hole; highlighted in the wire colour when it's used. */
function Pad({ x, y, color, r = 7 }: { x: number; y: number; color?: string; r?: number }) {
  return (
    <g>
      {color && <circle cx={x} cy={y} r={r + 3.5} fill="none" stroke={color} strokeWidth={2.5} />}
      <circle cx={x} cy={y} r={r} fill={COPPER} />
      <circle cx={x} cy={y} r={r * 0.42} fill="#101418" />
    </g>
  );
}

/** Text next to a pad saying where it goes; multiple destinations stack. */
function Callout({ x, y, anchor, joints }: { x: number; y: number; anchor: "start" | "end"; joints?: Joint[] }) {
  if (!joints?.length) return null;
  return (
    <g>
      {joints.map((j, i) => (
        <g key={i}>
          <circle cx={anchor === "end" ? x + 5 : x - 5} cy={y - 3.5 + i * 12} r={3} fill={j.color} />
          <text x={x} y={y + i * 12} textAnchor={anchor === "end" ? "end" : "start"} dx={anchor === "end" ? -4 : 4} fontSize={10.5} fill="var(--text)">{j.to}</text>
        </g>
      ))}
    </g>
  );
}

// ───────── Parts ─────────

function Breakout({ m, joints }: { m: ModulePart; joints: Map<string, Joint[]> }) {
  const pkg = m.pkg as Extract<ModulePart["pkg"], { kind: "breakout" }>;
  const rows = Math.max(pkg.left.length, pkg.right.length);
  const W = 560, bw = 150, bx = (W - bw) / 2, by = 16, pitch = 30, bh = 40 + rows * pitch;
  const label = (id: string) => m.pins.find((p) => p.id === id)?.label ?? id;
  return (
    <svg viewBox={`0 0 ${W} ${bh + 30}`} width="100%">
      <rect x={bx} y={by} width={bw} height={bh} rx={6} fill="#1f4f9c" stroke="#163a73" strokeWidth={2} />
      <text x={W / 2} y={by + 18} textAnchor="middle" fontSize={10} fontWeight={700} fill="#cfe0ff">LV ⇄ HV</text>
      {/* the four MOSFETs and their pull-ups, for recognition */}
      {[0, 1, 2, 3].map((i) => (
        <g key={i} transform={`translate(${W / 2 - 9},${by + 40 + i * ((bh - 60) / 4)})`}>
          <rect width={18} height={11} rx={1.5} fill="#202428" />
          <rect x={3} y={11} width={3} height={3} fill="#b9bcc2" /><rect x={12} y={11} width={3} height={3} fill="#b9bcc2" /><rect x={7.5} y={-3} width={3} height={3} fill="#b9bcc2" />
        </g>
      ))}
      {(["left", "right"] as const).map((side) => pkg[side].map((id, i) => {
        const x = side === "left" ? bx + 16 : bx + bw - 16, y = by + 36 + i * pitch;
        const j = joints.get(id);
        const known = m.pins.some((p) => p.id === id);
        return (
          <g key={side + id} opacity={known ? 1 : 0.55}>
            <Pad x={x} y={y} color={j?.[0]?.color} />
            <text x={side === "left" ? x + 13 : x - 13} y={y + 4} textAnchor={side === "left" ? "start" : "end"} fontSize={10.5} fontWeight={700} fill="#fff" fontFamily="var(--mono)">{known ? label(id) : id}</text>
            <Callout x={side === "left" ? bx - 14 : bx + bw + 14} y={y + 4} anchor={side === "left" ? "end" : "start"} joints={j} />
          </g>
        );
      }))}
      <text x={W / 2} y={bh + 28} textAnchor="middle" fontSize={9.5} fill="var(--muted)">{t("Pin order varies between sellers: match the labels printed on your board.")}</text>
    </svg>
  );
}

function Dip({ m, joints }: { m: ModulePart; joints: Map<string, Joint[]> }) {
  const pkg = m.pkg as Extract<ModulePart["pkg"], { kind: "dip" }>;
  const half = pkg.count / 2;
  const W = 560, cw = 124, cx = (W - cw) / 2, top = 26, pitch = 26, ch = 16 + half * pitch;
  const idOf = (num: number) => m.pins.find((p) => p.num === num)?.id;
  return (
    <svg viewBox={`0 0 ${W} ${ch + 58}`} width="100%">
      <rect x={cx} y={top} width={cw} height={ch} rx={4} fill="#1c1d20" />
      <path d={`M${W / 2 - 9},${top} a9,9 0 0,0 18,0`} fill="var(--surface)" />
      <circle cx={cx + 14} cy={top + 16} r={3.5} fill="#3a3c41" />
      <text x={W / 2} y={top - 8} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--text)" fontFamily="var(--mono)">{m.part}</text>
      {Array.from({ length: pkg.count }, (_, k) => {
        const num = k + 1;
        const left = num <= half;
        const row = left ? num - 1 : pkg.count - num;   // pins count down the right side
        const y = top + 20 + row * pitch;
        const legX = left ? cx - 14 : cx + cw;
        const id = idOf(num);
        const j = id ? joints.get(id) : undefined;
        return (
          <g key={num} opacity={id ? 1 : 0.5}>
            <rect x={legX} y={y - 4} width={14} height={8} fill={j?.[0]?.color ?? "#b9bcc2"} />
            <text x={left ? cx + 8 : cx + cw - 8} y={y + 3.5} textAnchor={left ? "start" : "end"} fontSize={9} fill="#9aa0a8" fontFamily="var(--mono)">{num}</text>
            <text x={left ? cx + 22 : cx + cw - 22} y={y + 3.5} textAnchor={left ? "start" : "end"} fontSize={9.5} fontWeight={600} fill="#e8e8ec" fontFamily="var(--mono)">{pkg.names[num]}</text>
            <Callout x={left ? cx - 22 : cx + cw + 22} y={y + 4} anchor={left ? "end" : "start"} joints={j} />
          </g>
        );
      })}
      <text x={W / 2} y={top + ch + 26} textAnchor="middle" fontSize={9.5} fill="var(--muted)">{t("Top view. Pin 1 is next to the notch and the dot.")}</text>
    </svg>
  );
}

function ToNinetyTwo({ m, joints }: { m: ModulePart; joints: Map<string, Joint[]> }) {
  const pkg = m.pkg as Extract<ModulePart["pkg"], { kind: "to92" }>;
  const W = 560, cx = W / 2;
  return (
    <svg viewBox={`0 0 ${W} 210`} width="100%">
      <path d={`M${cx - 34},70 L${cx + 34},70 L${cx + 34},28 A34,34 0 0,0 ${cx - 34},28 Z`} fill="#1c1d20" />
      <text x={cx} y={56} textAnchor="middle" fontSize={10} fontWeight={700} fill="#d9d9de" fontFamily="var(--mono)">{m.part}</text>
      {pkg.legs.map((id, i) => {
        const x = cx - 22 + i * 22;
        const j = joints.get(id);
        const num = m.pins.find((p) => p.id === id)?.num;
        return (
          <g key={id}>
            <rect x={x - 2} y={70} width={4} height={60} fill={j?.[0]?.color ?? "#b9bcc2"} />
            <text x={x} y={146} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--text)" fontFamily="var(--mono)">{id}</text>
            <text x={x} y={158} textAnchor="middle" fontSize={8.5} fill="var(--muted)" fontFamily="var(--mono)">{num}</text>
            <Callout x={i === 0 ? cx - 70 : i === 2 ? cx + 70 : cx + 70} y={i === 1 ? 186 : 120} anchor={i === 0 ? "end" : "start"} joints={j} />
            {i === 1 && <line x1={x} x2={cx + 64} y1={130} y2={182} stroke="var(--line-2)" strokeDasharray="3 3" />}
          </g>
        );
      })}
      <text x={cx} y={204} textAnchor="middle" fontSize={9.5} fill="var(--muted)">{t("Flat side facing you, legs down.")}</text>
    </svg>
  );
}

function ConnectorSolder({ c, joints }: { c: Connector; joints: Map<string, Joint[]> }) {
  const S = 170, W = 560, ox = 40, oy = 12;
  const pins = [...c.pins].sort((a, b) => a.n - b.n);
  return (
    <svg viewBox={`0 0 ${W} ${Math.max(S + 30, 30 + pins.length * 20)}`} overflow="visible" width="100%">
      <g transform={`translate(${ox},${oy})`}>
        {c.shape === "minidin" ? (
          <>
            <circle cx={S / 2} cy={S / 2} r={S * 0.46} fill="#2a2b30" />
            <circle cx={S / 2} cy={S / 2} r={S * 0.4} fill="#141518" stroke="#4a4b52" />
          </>
        ) : c.shape === "de9" ? (
          <path d={`M${S * 0.02},${S * 0.26} L${S * 0.98},${S * 0.26} L${S * 0.88},${S * 0.74} L${S * 0.12},${S * 0.74} Z`} fill="#141518" stroke="#8a8d94" strokeWidth={4} strokeLinejoin="round" />
        ) : (
          <rect x={S * 0.1} y={S * 0.2} width={S * 0.8} height={S * 0.56} rx={6} fill="#d9dce2" stroke="#9aa0a8" strokeWidth={2} />
        )}
        {c.pins.map((p) => {
          const j = joints.get(String(p.n));
          const x = p.x * S, y = p.y * S;
          return c.shape === "rj11" ? (
            <g key={p.n}>
              <rect x={x - 6} y={y - 22} width={12} height={30} rx={1} fill={j?.[0]?.color ?? COPPER} />
              <text x={x} y={y + 22} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--text)">{p.n}</text>
            </g>
          ) : (
            <g key={p.n}>
              <circle cx={x} cy={y} r={11} fill={COPPER} stroke={j?.[0]?.color ?? "#5a5d63"} strokeWidth={j ? 4 : 1.5} />
              <circle cx={x} cy={y} r={5} fill="#3a3122" />
              <text x={x} y={y - 15} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#fff">{p.n}</text>
            </g>
          );
        })}
      </g>
      {c.shape === "rj11" && (
        <text x={ox + S / 2} y={S + 18} textAnchor="middle" fontSize={9.5} fill="var(--muted)">
          {t("Crimp it, don't solder. Check pin 1 reaches pin 1 at the other end: handset cords are often reversed.")}
        </text>
      )}
      <g transform={`translate(${ox + S + 40},${22})`}>
        {pins.map((p, i) => {
          const j = joints.get(String(p.n));
          return (
            <g key={p.n} transform={`translate(0,${i * 20})`} opacity={j ? 1 : 0.45}>
              <text x={0} y={4} fontSize={10.5} fontWeight={700} fill="var(--text)" fontFamily="var(--mono)">{p.n}</text>
              <text x={18} y={4} fontSize={10.5} fill="var(--text)" fontFamily="var(--mono)">{p.name}</text>
              {j ? <Callout x={74} y={4} anchor="start" joints={j} /> : <text x={74} y={4} fontSize={10} fill="var(--muted)">{t("leave unconnected")}</text>}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

// ───────── Checklist ─────────

function Checklist({ plan, describe }: { plan: WiringPlan; describe: (e: WireEnd) => string }) {
  const storeKey = `platinum.solder.${plan.board.id}.${plan.model.id}.${plan.wires.length}`;
  const [done, setDone] = useState<Set<string>>(new Set());
  useEffect(() => {
    try { setDone(new Set(JSON.parse(localStorage.getItem(storeKey) ?? "[]"))); } catch { setDone(new Set()); }
  }, [storeKey]);
  const toggle = (id: string) => {
    const next = new Set(done);
    if (next.has(id)) next.delete(id); else next.add(id);
    setDone(next);
    try { localStorage.setItem(storeKey, JSON.stringify([...next])); } catch { /* storage unavailable */ }
  };
  const rows = plan.wires;
  return (
    <div className="card">
      <div className="card-head">
        <h3>{t("Soldering checklist")}</h3>
        <span className="sub">{t("{done} of {total}", { done: rows.filter((w) => done.has(w.id)).length, total: rows.length })}</span>
        <div className="progress right" style={{ width: 160 }}><div style={{ width: `${(rows.filter((w) => done.has(w.id)).length / Math.max(1, rows.length)) * 100}%` }} /></div>
      </div>
      {rows.map((w, i) => (
        <label key={w.id} className="list-row small" style={{ cursor: "default", opacity: done.has(w.id) ? 0.55 : 1 }}>
          <input type="checkbox" checked={done.has(w.id)} onChange={() => toggle(w.id)} />
          <span className="mono muted" style={{ width: 22 }}>{i + 1}</span>
          <span style={{ width: 22, height: 4, borderRadius: 2, background: w.color, flex: "none" }} />
          <span className="grow" style={{ textDecoration: done.has(w.id) ? "line-through" : undefined }}>
            <b>{describe(w.from)}</b> → <b>{describe(w.to)}</b>
            {w.via && <span className="muted"> · {t("via {part}", { part: w.via })}</span>}
          </span>
          <span className="muted">{w.label}</span>
        </label>
      ))}
    </div>
  );
}
