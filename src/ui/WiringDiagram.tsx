import { useMemo } from "react";
import type { WiringPlan, Wire, WireEnd } from "@/lib/hardware/wiring";
import { CONNECTORS, type Connector } from "@/lib/hardware/connectors";
import type { Board } from "@/lib/hardware/boards";
import { t } from "@/i18n";

const PITCH = 26;
const COL = { esp: 24, espW: 170, mod: 360, modW: 190, con: 740, conW: 150, face: 920 };

interface Pt { x: number; y: number }

export function WiringDiagram({ plan, hover, setHover }: { plan: WiringPlan; hover: string | null; setHover: (id: string | null) => void }) {
  const layout = useMemo(() => {
    const pos = new Map<string, Pt>();
    const key = (e: WireEnd) => `${e.part}:${e.pin}`;

    // ESP32 block: only pins in use, power first.
    const espPins = [...new Set(plan.wires.flatMap((w) => [w.from, w.to]).filter((e) => e.part === "esp").map((e) => e.pin))];
    const order = (p: string) => (p === "5V" ? 0 : p === "3V3" ? 1 : p === "GND" ? 2 : 3 + parseInt(p.replace("GPIO", "")) / 100);
    espPins.sort((a, b) => order(a) - order(b));
    const espTop = 30;
    espPins.forEach((p, i) => pos.set(`esp:${p}`, { x: COL.esp + COL.espW, y: espTop + 50 + i * PITCH }));
    const espH = 60 + espPins.length * PITCH;

    // Modules stacked.
    let y = 30;
    const mods = plan.modules.map((m) => {
      const lv = m.pins.filter((p) => p.side === "lv"), hv = m.pins.filter((p) => p.side === "hv");
      const h = 56 + Math.max(lv.length, hv.length) * PITCH;
      lv.forEach((p, i) => pos.set(`${m.id}:${p.id}`, { x: COL.mod, y: y + 50 + i * PITCH }));
      hv.forEach((p, i) => pos.set(`${m.id}:${p.id}`, { x: COL.mod + COL.modW, y: y + 50 + i * PITCH }));
      const r = { m, y, h, lv, hv };
      y += h + 24;
      return r;
    });
    const modH = y;

    // Connectors stacked.
    y = 30;
    const cons = plan.connectors.map((id) => {
      const c = CONNECTORS[id];
      const pins = [...c.pins].sort((a, b) => a.n - b.n);
      const h = Math.max(56 + pins.length * 24, 190);
      pins.forEach((p, i) => pos.set(`${id}:${p.n}`, { x: COL.con, y: y + 50 + i * 24 }));
      const r = { c, y, h, pins };
      y += h + 24;
      return r;
    });

    const height = Math.max(espTop + espH, modH, y) + 20;
    const used = new Map<string, string>();
    for (const w of plan.wires) { used.set(key(w.from), w.color); used.set(key(w.to), w.color); }
    return { pos, espPins, espH, espTop, mods, cons, height, used, key };
  }, [plan]);

  const path = (w: Wire) => {
    let a = layout.pos.get(layout.key(w.from)), b = layout.pos.get(layout.key(w.to));
    if (!a || !b) return "";
    if (a.x > b.x) [a, b] = [b, a];
    const dx = Math.max(40, (b.x - a.x) * 0.45);
    return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
  };

  const dim = (w: Wire) => hover !== null && hover !== w.id && !(hover.startsWith("pin:") && (hover === `pin:${layout.key(w.from)}` || hover === `pin:${layout.key(w.to)}`));

  return (
    <svg viewBox={`0 0 1100 ${layout.height}`} width="100%" style={{ display: "block", minWidth: 900 }} onMouseLeave={() => setHover(null)}>
      <defs>
        <linearGradient id="pcb" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#25313f" /><stop offset="1" stopColor="#1a222c" /></linearGradient>
        <linearGradient id="modg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#1d5fa8" /><stop offset="1" stopColor="#164a85" /></linearGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="2.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>

      {/* ESP32 */}
      <g>
        <rect x={COL.esp} y={layout.espTop} width={COL.espW} height={layout.espH} rx={10} fill="url(#pcb)" />
        <rect x={COL.esp + 18} y={layout.espTop + 10} width={COL.espW - 60} height={26} rx={3} fill="#c9ccd1" />
        <text x={COL.esp + 24} y={layout.espTop + 27} fontSize={10} fontWeight={700} fill="#30343a" fontFamily="var(--font)">{plan.board.id === "esp32s3" ? "ESP32-S3" : "ESP32"}</text>
        {layout.espPins.map((p) => {
          const pt = layout.pos.get(`esp:${p}`)!;
          const color = layout.used.get(`esp:${p}`);
          return (
            <g key={p} onMouseEnter={() => setHover(`pin:esp:${p}`)} style={{ cursor: "default" }}>
              <text x={pt.x - 14} y={pt.y + 4} textAnchor="end" fontSize={11} fontFamily="var(--mono)" fill="#e6edf5">{p}</text>
              <rect x={pt.x - 7} y={pt.y - 5} width={10} height={10} rx={2} fill="#d4a94a" stroke={color} strokeWidth={1.5} />
            </g>
          );
        })}
      </g>

      {/* Modules */}
      {layout.mods.map(({ m, y, h, lv, hv }) => (
        <g key={m.id}>
          <rect x={COL.mod} y={y} width={COL.modW} height={h} rx={8} fill="url(#modg)" />
          <text x={COL.mod + COL.modW / 2} y={y + 18} textAnchor="middle" fontSize={11.5} fontWeight={650} fill="#fff" fontFamily="var(--font)">{m.title}</text>
          <text x={COL.mod + COL.modW / 2} y={y + 32} textAnchor="middle" fontSize={9.5} fill="#bcd6f5" fontFamily="var(--font)">{m.subtitle}</text>
          {lv.map((p) => { const pt = layout.pos.get(`${m.id}:${p.id}`)!; return <g key={p.id}><circle cx={pt.x} cy={pt.y} r={4.5} fill="#d4a94a" /><text x={pt.x + 10} y={pt.y + 4} fontSize={10} fill="#e8f1fb" fontFamily="var(--mono)">{p.label}</text></g>; })}
          {hv.map((p) => { const pt = layout.pos.get(`${m.id}:${p.id}`)!; return <g key={p.id}><circle cx={pt.x} cy={pt.y} r={4.5} fill="#d4a94a" /><text x={pt.x - 10} y={pt.y + 4} textAnchor="end" fontSize={10} fill="#e8f1fb" fontFamily="var(--mono)">{p.label}</text></g>; })}
        </g>
      ))}

      {/* Connectors */}
      {layout.cons.map(({ c, y, h, pins }) => (
        <g key={c.id}>
          <rect x={COL.con} y={y} width={COL.conW} height={h} rx={8} fill="var(--surface-2)" stroke="var(--line-2)" />
          <text x={COL.con + 12} y={y + 20} fontSize={11.5} fontWeight={650} fill="var(--text)" fontFamily="var(--font)">{t(c.name).split(" (")[0]}</text>
          <text x={COL.con + 12} y={y + 34} fontSize={9.5} fill="var(--muted)" fontFamily="var(--font)">{t(c.name).match(/\((.*)\)/)?.[1] ?? ""}</text>
          {pins.map((p) => {
            const pt = layout.pos.get(`${c.id}:${p.n}`)!;
            const color = layout.used.get(`${c.id}:${p.n}`);
            return (
              <g key={p.n} onMouseEnter={() => setHover(`pin:${c.id}:${p.n}`)} opacity={color ? 1 : 0.45}>
                <circle cx={pt.x} cy={pt.y} r={4.5} fill={color ?? "var(--faint)"} />
                <text x={pt.x + 12} y={pt.y + 4} fontSize={10.5} fill="var(--text)" fontFamily="var(--mono)">{p.n} · {p.name}</text>
              </g>
            );
          })}
          <ConnectorFace c={c} x={COL.face} y={y + 6} size={150} used={layout.used} />
        </g>
      ))}

      {/* Wires on top */}
      {plan.wires.map((w) => (
        <g key={w.id} onMouseEnter={() => setHover(w.id)} style={{ cursor: "default" }}>
          <path d={path(w)} stroke="transparent" strokeWidth={12} fill="none" />
          <path d={path(w)} stroke={w.color} strokeWidth={hover === w.id ? 3.5 : 2.2} fill="none" strokeLinecap="round" opacity={dim(w) ? 0.15 : 0.95} filter={hover === w.id ? "url(#glow)" : undefined} />
        </g>
      ))}
    </svg>
  );
}

/** Front view of a Mac connector with pin numbers; pins in use take their wire colour. */
export function ConnectorFace({ c, x = 0, y = 0, size = 150, used }: { c: Connector; x?: number; y?: number; size?: number; used?: Map<string, string> }) {
  const s = size;
  const body =
    c.shape === "minidin" ? (
      <>
        <circle cx={s / 2} cy={s / 2} r={s * 0.44} fill="#3a3a3f" />
        <circle cx={s / 2} cy={s / 2} r={s * 0.38} fill="#151518" />
        <rect x={s / 2 - s * 0.07} y={s * 0.8} width={s * 0.14} height={s * 0.08} fill="#3a3a3f" />
      </>
    ) : c.shape === "de9" ? (
      <path d={`M${s * 0.04},${s * 0.24} L${s * 0.96},${s * 0.24} L${s * 0.86},${s * 0.76} L${s * 0.14},${s * 0.76} Z`} fill="#151518" stroke="#55555c" strokeWidth={4} strokeLinejoin="round" />
    ) : (
      <>
        <rect x={s * 0.1} y={s * 0.18} width={s * 0.8} height={s * 0.6} rx={6} fill="#151518" stroke="#55555c" strokeWidth={3} />
        <rect x={s * 0.38} y={s * 0.78} width={s * 0.24} height={s * 0.08} fill="#55555c" />
      </>
    );
  return (
    <g transform={`translate(${x},${y})`}>
      {body}
      {c.pins.map((p) => {
        const color = used?.get(`${c.id}:${p.n}`);
        const cx = p.x * s, cy = p.y * s;
        return (
          <g key={p.n}>
            {c.shape === "rj11" ? <rect x={cx - 4} y={cy - 14} width={8} height={22} rx={1.5} fill={color ?? "#c9a24a"} /> : <circle cx={cx} cy={cy} r={c.shape === "de9" ? 7 : 8} fill={color ?? "#c9a24a"} stroke="#000" strokeWidth={1} />}
            <text x={cx} y={c.shape === "rj11" ? cy + 24 : cy + 3.5} textAnchor="middle" fontSize={10} fontWeight={700} fill={c.shape === "rj11" ? "#ddd" : "#111"} fontFamily="var(--font)">{p.n}</text>
          </g>
        );
      })}
      <text x={s / 2} y={s + 6} textAnchor="middle" fontSize={9} fill="var(--muted)" fontFamily="var(--font)">{t("front view (Mac port)")}</text>
    </g>
  );
}

/** Physical top view of the dev board with the used pins called out. */
export function BoardView({ board, roles }: { board: Board; roles: Map<number, { label: string; color: string }> }) {
  const pitch = 22, top = 70;
  const rows = Math.max(board.left.length, board.right.length);
  const W = 520, bx = 175, bw = 170, bh = top + rows * pitch + 40;
  const pinNum = (p: string) => (/^\d+$/.test(p) ? Number(p) : NaN);
  return (
    <svg viewBox={`0 0 ${W} ${bh + 20}`} width="100%" style={{ maxWidth: 560, display: "block", margin: "0 auto" }}>
      <rect x={bx} y={10} width={bw} height={bh} rx={10} fill="#1d2630" />
      <rect x={bx + 25} y={20} width={bw - 50} height={44} rx={4} fill="#c9ccd1" />
      <text x={bx + bw / 2} y={47} textAnchor="middle" fontSize={11} fontWeight={700} fill="#30343a" fontFamily="var(--font)">{board.id === "esp32s3" ? "ESP32-S3-WROOM-1" : "ESP32-WROOM-32"}</text>
      <rect x={bx + bw / 2 - 18} y={bh - 4} width={36} height={20} rx={3} fill="#9aa0a8" />
      <text x={bx + bw / 2} y={bh + 9} textAnchor="middle" fontSize={8} fill="#222" fontFamily="var(--font)">USB</text>
      {(["left", "right"] as const).map((side) =>
        board[side].map((p, i) => {
          const y = top + 10 + i * pitch;
          const x = side === "left" ? bx + 12 : bx + bw - 12;
          const role = roles.get(pinNum(p)) ?? (p === "GND" || p === "3V3" || p === "5V" ? undefined : undefined);
          const isPower = p === "GND" || p === "3V3" || p === "5V";
          return (
            <g key={side + i}>
              <rect x={x - 5} y={y - 5} width={10} height={10} rx={1.5} fill={role ? role.color : isPower ? "#7d6a3a" : "#d4a94a"} opacity={role || isPower ? 1 : 0.55} />
              <text x={side === "left" ? x + 10 : x - 10} y={y + 3.5} textAnchor={side === "left" ? "start" : "end"} fontSize={9.5} fill="#cfd8e3" fontFamily="var(--mono)">{p}</text>
              {role && (
                <>
                  <line x1={side === "left" ? x - 6 : x + 6} y1={y} x2={side === "left" ? bx - 14 : bx + bw + 14} y2={y} stroke={role.color} strokeWidth={1.5} />
                  <text x={side === "left" ? bx - 18 : bx + bw + 18} y={y + 4} textAnchor={side === "left" ? "end" : "start"} fontSize={11} fontWeight={600} fill="var(--text)" fontFamily="var(--font)">{role.label}</text>
                </>
              )}
            </g>
          );
        }),
      )}
    </svg>
  );
}
