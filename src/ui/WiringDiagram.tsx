// Connector faces and the dev board drawing used on the Hardware page.
import type { Connector } from "@/lib/hardware/connectors";
import type { Board } from "@/lib/hardware/boards";
import { t } from "@/i18n";

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
      <text x={bx + bw / 2} y={47} textAnchor="middle" fontSize={11} fontWeight={700} fill="#30343a" fontFamily="var(--font)">{board.module}</text>
      {board.display.kind === "builtin-72x40" && (
        <g>
          <rect x={bx + bw / 2 - 36} y={top + 2} width={72} height={44} rx={3} fill="#0b0f14" stroke="#4a5562" />
          <text x={bx + bw / 2} y={top + 20} textAnchor="middle" fontSize={8} fill="#7fb4ff" fontFamily="var(--mono)">OLED</text>
          <text x={bx + bw / 2} y={top + 32} textAnchor="middle" fontSize={7} fill="#7fb4ff" fontFamily="var(--mono)">72×40</text>
        </g>
      )}
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
