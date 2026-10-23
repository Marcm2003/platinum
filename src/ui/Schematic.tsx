// Logical schematic of the bridge: parts as symbols with their real pin numbers, signal wires
// routed orthogonally through lanes so they never overlap, and power drawn as GND / 3V3 / +5V
// symbols instead of long wires. Hovering a wire or pin highlights its connection.

import { useMemo } from "react";
import { partRefs, type Net, type WiringPlan, type Wire, type WireEnd } from "@/lib/hardware/wiring";
import { CONNECTORS } from "@/lib/hardware/connectors";
import { t } from "@/i18n";

const PITCH = 22;     // pin spacing
const STUB = 18;      // pin lead length
const LANE = 11;      // spacing between vertical wire runs
const TITLE = 40;     // space above the first pin of a part
const ESP_W = 150, MOD_W = 168, CON_W = 172;

type Side = "l" | "r";
interface Pin { key: string; part: string; id: string; label: string; num?: number | string; side: Side; x: number; y: number; net?: Net; used: boolean }
interface Block { id: string; ref: string; title: string; subtitle?: string; x: number; y: number; w: number; h: number; kind: "esp" | "module" | "connector" }

const keyOf = (e: WireEnd) => `${e.part}:${e.pin}`;
const NET_LABEL: Record<Net, string> = { GND: "GND", "3V3": "3V3", "5V_MAC": "+5V Mac" };

export function Schematic({ plan, hover, setHover }: { plan: WiringPlan; hover: string | null; setHover: (id: string | null) => void }) {
  const L = useMemo(() => layout(plan), [plan]);

  const isLit = (w: Wire) => hover === w.id || hover === `pin:${keyOf(w.from)}` || hover === `pin:${keyOf(w.to)}`;
  const dimWire = (w: Wire) => hover !== null && !isLit(w);

  return (
    <svg viewBox={`0 0 ${L.width} ${L.height}`} width="100%" style={{ display: "block", minWidth: 960, fontFamily: "var(--font)" }} onMouseLeave={() => setHover(null)}>
      <defs>
        <pattern id="sch-grid" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.7" fill="var(--line-2)" /></pattern>
        <filter id="sch-glow"><feGaussianBlur stdDeviation="2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <rect width={L.width} height={L.height} fill="url(#sch-grid)" />

      {/* Part bodies */}
      {L.blocks.map((b) => (
        <g key={b.id}>
          <text x={b.x} y={b.y - 8} fontSize={10.5} fontWeight={700} fill="var(--accent-text)" fontFamily="var(--mono)">{b.ref}</text>
          <text x={b.x + b.ref.length * 7 + 8} y={b.y - 8} fontSize={10.5} fill="var(--muted)">{b.subtitle}</text>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={b.kind === "connector" ? 10 : 3} fill="var(--surface)" stroke="var(--text-2)" strokeWidth={1.4} />
          <text x={b.x + b.w / 2} y={b.y + 20} textAnchor="middle" fontSize={11.5} fontWeight={650} fill="var(--text)">{b.title}</text>
          <line x1={b.x + 8} x2={b.x + b.w - 8} y1={b.y + 28} y2={b.y + 28} stroke="var(--line-2)" />
        </g>
      ))}

      {/* Pins */}
      {L.pins.map((p) => {
        const inner = p.side === "r" ? p.x - STUB : p.x + STUB;
        const lit = hover === `pin:${p.key}` || L.wires.some((w) => (hover === w.id) && (keyOf(w.from) === p.key || keyOf(w.to) === p.key));
        const color = L.pinColor.get(p.key);
        return (
          <g key={p.key} onMouseEnter={() => setHover(`pin:${p.key}`)} opacity={p.used ? 1 : 0.4}>
            <line x1={inner} x2={p.x} y1={p.y} y2={p.y} stroke={lit && color ? color : "var(--text-2)"} strokeWidth={lit ? 2.4 : 1.4} />
            <text x={p.side === "r" ? inner - 6 : inner + 6} y={p.y + 3.8} textAnchor={p.side === "r" ? "end" : "start"} fontSize={10.5} fill="var(--text)" fontFamily="var(--mono)">{p.label}</text>
            {p.num !== undefined && <text x={(inner + p.x) / 2} y={p.y - 3.5} textAnchor="middle" fontSize={8.5} fill="var(--muted)" fontFamily="var(--mono)">{p.num}</text>}
            {p.used && !p.net && <circle cx={p.x} cy={p.y} r={2.3} fill={color ?? "var(--text-2)"} />}
            <rect x={Math.min(inner, p.x) - 2} y={p.y - 8} width={STUB + 4 + 50} height={16} fill="transparent" transform={p.side === "r" ? `translate(${-50},0)` : undefined} />
          </g>
        );
      })}

      {/* Power symbols, with consecutive pins on the same net joined by a short bus */}
      {L.netGroups.map((g, i) => (g.net === "GND" ? <NetSymbol key={i} {...g} /> : g.ys.map((y) => <NetFlag key={`${i}-${y}`} net={g.net} side={g.side} x={g.x} y={y} />)))}

      {/* Signal wires */}
      {L.routes.map(({ w, d, label, res }) => (
        <g key={w.id} onMouseEnter={() => setHover(w.id)}>
          <path d={d} stroke="transparent" strokeWidth={12} fill="none" />
          <path d={d} stroke={w.color} strokeWidth={isLit(w) ? 3 : 1.9} fill="none" strokeLinejoin="round" opacity={dimWire(w) ? 0.15 : 1} filter={hover === w.id ? "url(#sch-glow)" : undefined} />
          {label && <text x={label.x} y={label.y} fontSize={9.5} fill={w.color} opacity={dimWire(w) ? 0.25 : 1} fontWeight={600}>{w.label}</text>}
          {res && (
            <g opacity={dimWire(w) ? 0.25 : 1}>
              <rect x={res.x - 14} y={res.y - 5} width={28} height={10} fill="var(--surface)" stroke={w.color} strokeWidth={1.6} />
              <text x={res.x} y={res.y - 9} textAnchor="middle" fontSize={9} fill="var(--text)" fontFamily="var(--mono)">R1 {w.via}</text>
            </g>
          )}
        </g>
      ))}

      <Legend x={20} y={L.height - 46} />
      <TitleBlock x={L.width - 300} y={L.height - 62} plan={plan} />
    </svg>
  );
}

// ───────── Layout ─────────

function layout(plan: WiringPlan) {
  const signal = plan.wires.filter((w) => !w.net);
  const power = plan.wires.filter((w) => w.net);
  const partner = new Map<string, string[]>();
  for (const w of signal) {
    partner.set(keyOf(w.from), [...(partner.get(keyOf(w.from)) ?? []), keyOf(w.to)]);
    partner.set(keyOf(w.to), [...(partner.get(keyOf(w.to)) ?? []), keyOf(w.from)]);
  }
  const netOf = new Map<string, Net>();
  for (const w of power) {
    for (const e of [w.from, w.to]) netOf.set(keyOf(e), w.net!);
    // The ESP32's own power pins are named after the net they carry.
  }
  const used = new Set(plan.wires.flatMap((w) => [keyOf(w.from), keyOf(w.to)]));
  const pinColor = new Map<string, string>();
  for (const w of signal) { pinColor.set(keyOf(w.from), w.color); pinColor.set(keyOf(w.to), w.color); }

  const pins: Pin[] = [];
  const blocks: Block[] = [];
  const pos = new Map<string, Pin>();
  const add = (p: Pin) => { pins.push(p); pos.set(p.key, p); };

  // Columns. Lane counts are known up front, so x positions can be fixed now.
  const espSignal = [...new Set(signal.flatMap((w) => [w.from, w.to]).filter((e) => e.part === "esp").map((e) => e.pin))];
  const modIds = new Set(plan.modules.map((m) => m.id));
  const lanesA = signal.filter((w) => w.from.part === "esp" || w.to.part === "esp").length;
  const lanesB = signal.filter((w) => (modIds.has(w.from.part) && !modIds.has(w.to.part) && w.to.part !== "esp") || (modIds.has(w.to.part) && !modIds.has(w.from.part) && w.from.part !== "esp")).length;
  const espX = 30;
  const espPinX = espX + ESP_W + STUB;
  const chanA = 70 + lanesA * LANE + 30;
  const modX = espPinX + chanA + STUB;
  const modRightPin = modX + MOD_W + STUB;
  const chanB = 60 + lanesB * LANE + 30;
  const conX = modRightPin + chanB + STUB;

  // Modules, stacked. Signal pins first, power pins at the bottom of each side.
  const refs = partRefs(plan);
  let y = 60;
  for (const m of plan.modules) {
    const order = (side: "lv" | "hv") => {
      const list = m.pins.filter((p) => p.side === side);
      const k = (id: string) => `${m.id}:${id}`;
      return [...list.filter((p) => !netOf.has(k(p.id))), ...list.filter((p) => netOf.has(k(p.id)))];
    };
    const lv = order("lv"), hv = order("hv");
    const h = TITLE + Math.max(lv.length, hv.length) * PITCH;
    const ref = refs.get(m.id)!;
    blocks.push({ id: m.id, ref, title: m.title, subtitle: m.part, x: modX, y, w: MOD_W, h, kind: "module" });
    lv.forEach((p, i) => add({ key: `${m.id}:${p.id}`, part: m.id, id: p.id, label: p.label, num: p.num, side: "l", x: modX - STUB, y: y + TITLE + i * PITCH, net: netOf.get(`${m.id}:${p.id}`), used: used.has(`${m.id}:${p.id}`) }));
    hv.forEach((p, i) => add({ key: `${m.id}:${p.id}`, part: m.id, id: p.id, label: p.label, num: p.num, side: "r", x: modRightPin, y: y + TITLE + i * PITCH, net: netOf.get(`${m.id}:${p.id}`), used: used.has(`${m.id}:${p.id}`) }));
    y += h + 44;
  }
  const modBottom = y;

  // ESP32: each signal pin sits level with the pin it goes to, so most wires run straight.
  const target = (pin: string) => Math.min(...(partner.get(`esp:${pin}`) ?? []).map((k) => pos.get(k)?.y ?? 1e9));
  espSignal.sort((a, b) => target(a) - target(b));
  let espY = -1e9;
  const espPins: { pin: string; y: number }[] = [];
  for (const p of espSignal) { espY = Math.max(target(p), espY + PITCH); espPins.push({ pin: p, y: espY }); }
  const espPower = (["5V", "3V3", "GND"] as const).filter((p) => used.has(`esp:${p}`));
  const firstEsp = espPins.length ? espPins[0].y : 100;
  espY = (espPins.length ? espY : firstEsp) + PITCH * 1.5;
  for (const p of espPower) { espPins.push({ pin: p, y: espY }); espY += PITCH; }
  const espTop = firstEsp - TITLE;
  blocks.push({ id: "esp", ref: "MCU", title: plan.board.shortChip, subtitle: plan.board.name, x: espX, y: espTop, w: ESP_W, h: espY - PITCH + 18 - espTop, kind: "esp" });
  for (const { pin, y: py } of espPins) {
    const net: Net | undefined = pin === "GND" ? "GND" : pin === "3V3" ? "3V3" : pin === "5V" ? "5V_MAC" : undefined;
    add({ key: `esp:${pin}`, part: "esp", id: pin, label: pin, side: "r", x: espPinX, y: py, net, used: true });
  }

  // Connectors: all pins in number order, placed so their first wired pin lines up.
  let conY = 30;
  const cons = [...plan.connectors].map((id) => {
    const c = CONNECTORS[id];
    const ps = [...c.pins].sort((a, b) => a.n - b.n);
    const ys = ps.map((p) => Math.min(...(partner.get(`${id}:${p.n}`) ?? []).map((k) => pos.get(k)?.y ?? 1e9)));
    return { id, c, ps, ys, first: Math.min(...ys) };
  }).sort((a, b) => a.first - b.first);
  for (const { id, c, ps, ys } of cons) {
    const firstIdx = ys.findIndex((v) => v < 1e9);
    const top = Math.max(conY, firstIdx >= 0 ? ys[firstIdx] - TITLE - firstIdx * PITCH : conY);
    const h = TITLE + ps.length * PITCH;
    const name = t(c.name);
    blocks.push({ id, ref: refs.get(id)!, title: name.split(" (")[0], subtitle: name.match(/\((.*)\)/)?.[1] ?? "", x: conX, y: top, w: CON_W, h, kind: "connector" });
    ps.forEach((p, i) => add({ key: `${id}:${p.n}`, part: id, id: String(p.n), label: p.name, num: p.n, side: "l", x: conX - STUB, y: top + TITLE + i * PITCH, net: netOf.get(`${id}:${p.n}`), used: used.has(`${id}:${p.n}`) }));
    conY = top + h + 44;
  }

  // Routes. Within a channel, downward wires take lanes from the right in order of their start,
  // upward wires likewise from the bottom: that ordering avoids most crossings.
  const routes: { w: Wire; d: string; label?: { x: number; y: number }; res?: { x: number; y: number } }[] = [];
  const route = (ws: Wire[], laneStart: number) => {
    const ends = ws.map((w) => {
      let a = pos.get(keyOf(w.from))!, b = pos.get(keyOf(w.to))!;
      if (a.x > b.x) [a, b] = [b, a];
      return { w, a, b };
    });
    const down = ends.filter((e) => e.b.y > e.a.y).sort((p, q) => p.a.y - q.a.y);
    const up = ends.filter((e) => e.b.y < e.a.y).sort((p, q) => q.a.y - p.a.y);
    const flat = ends.filter((e) => e.b.y === e.a.y);
    const lanes = down.length + up.length;
    [...down, ...up].forEach((e, i) => {
      const lane = laneStart + (lanes - 1 - i) * LANE;
      routes.push({ w: e.w, d: ortho(e.a, e.b, lane), label: labelAt(e.a, e.w), res: e.w.via ? { x: e.a.x + 34, y: e.a.y } : undefined });
    });
    for (const e of flat) routes.push({ w: e.w, d: `M${e.a.x},${e.a.y} H${e.b.x}`, label: labelAt(e.a, e.w), res: e.w.via ? { x: e.a.x + 34, y: e.a.y } : undefined });
  };
  const labelAt = (a: { x: number; y: number }, w: Wire) => (w.via ? undefined : { x: a.x + 6, y: a.y - 4 });
  route(signal.filter((w) => w.from.part === "esp" || w.to.part === "esp"), espPinX + 64);
  route(signal.filter((w) => w.from.part !== "esp" && w.to.part !== "esp"), modRightPin + 40);

  // Power symbols: group consecutive pins on the same side of a part that share a net.
  const netGroups: { net: Net; side: Side; x: number; ys: number[] }[] = [];
  const byPart = new Map<string, Pin[]>();
  for (const p of pins) if (p.net) byPart.set(`${p.part}/${p.side}`, [...(byPart.get(`${p.part}/${p.side}`) ?? []), p]);
  for (const list of byPart.values()) {
    list.sort((a, b) => a.y - b.y);
    for (const p of list) {
      const g = netGroups[netGroups.length - 1];
      if (g && g.net === p.net && g.side === p.side && g.x === p.x && p.y - g.ys[g.ys.length - 1] <= PITCH + 1) g.ys.push(p.y);
      else netGroups.push({ net: p.net!, side: p.side, x: p.x, ys: [p.y] });
    }
  }

  const width = conX + CON_W + 40;
  const height = Math.max(modBottom, conY, espY + 40) + 70;
  return { pins, blocks, routes, netGroups, pinColor, wires: plan.wires, width, height };
}

/** Orthogonal path a → lane → b with rounded corners. */
function ortho(a: { x: number; y: number }, b: { x: number; y: number }, lane: number) {
  const r = Math.min(6, Math.abs(b.y - a.y) / 2);
  const s = b.y > a.y ? 1 : -1;
  return `M${a.x},${a.y} H${lane - r} Q${lane},${a.y} ${lane},${a.y + s * r} V${b.y - s * r} Q${lane},${b.y} ${lane + r},${b.y} H${b.x}`;
}

// ───────── Symbols ─────────

function NetSymbol({ net, side, x, ys }: { net: Net; side: Side; x: number; ys: number[] }) {
  const dir = side === "l" ? -1 : 1;
  const bx = x + dir * 12;                  // bus x
  const top = ys[0], bottom = ys[ys.length - 1];
  const stroke = "var(--text-2)";
  return (
    <g>
      {ys.map((y) => <line key={y} x1={x} x2={bx} y1={y} y2={y} stroke={stroke} strokeWidth={1.4} />)}
      {ys.length > 1 && <line x1={bx} x2={bx} y1={top} y2={bottom} stroke={stroke} strokeWidth={1.4} />}
      {ys.length > 1 && ys.map((y) => <circle key={y} cx={bx} cy={y} r={2.2} fill={stroke} />)}
      {net === "GND" ? (
        <>
          <line x1={bx} x2={bx} y1={bottom} y2={bottom + 8} stroke={stroke} strokeWidth={1.4} />
          <line x1={bx - 8} x2={bx + 8} y1={bottom + 8} y2={bottom + 8} stroke={stroke} strokeWidth={1.6} />
          <line x1={bx - 5} x2={bx + 5} y1={bottom + 11.5} y2={bottom + 11.5} stroke={stroke} strokeWidth={1.6} />
          <line x1={bx - 2} x2={bx + 2} y1={bottom + 15} y2={bottom + 15} stroke={stroke} strokeWidth={1.6} />
        </>
      ) : null}
    </g>
  );
}

/** Supply nets as horizontal net-label flags pointing at the pin, so they never take vertical room. */
function NetFlag({ net, side, x, y }: { net: Net; side: Side; x: number; y: number }) {
  const dir = side === "l" ? -1 : 1;
  const text = NET_LABEL[net];
  const w = text.length * 6.2 + 16;
  const x0 = x + dir * 8;
  const pts = [[0, 0], [7, -7], [w, -7], [w, 7], [7, 7]].map(([px, py]) => `${x0 + dir * px},${y + py}`).join(" ");
  return (
    <g>
      <line x1={x} x2={x0} y1={y} y2={y} stroke="var(--err)" strokeWidth={1.4} />
      <polygon points={pts} fill="var(--err-soft)" stroke="var(--err)" strokeWidth={1.2} />
      <text x={x0 + dir * (w + 7) / 2} y={y + 3.5} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="var(--err)" fontFamily="var(--mono)">{text}</text>
    </g>
  );
}

function Legend({ x, y }: { x: number; y: number }) {
  const items: [string, string][] = [["#0a84ff", t("Data")], ["#bf5af2", t("Clock")], ["#ff9f0a", t("Control")], ["#30d158", t("To the Mac")], ["#ff375f", t("From the Mac")]];
  return (
    <g transform={`translate(${x},${y})`}>
      {items.map(([c, l], i) => (
        <g key={l} transform={`translate(${i * 110},0)`}>
          <line x1={0} x2={22} y1={0} y2={0} stroke={c} strokeWidth={2.4} />
          <text x={28} y={3.5} fontSize={10} fill="var(--muted)">{l}</text>
        </g>
      ))}
      <text x={0} y={22} fontSize={9.5} fill="var(--faint)">{t("Wires that cross without a dot aren't connected. Small numbers are physical pin numbers.")}</text>
    </g>
  );
}

function TitleBlock({ x, y, plan }: { x: number; y: number; plan: WiringPlan }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <rect width={280} height={52} fill="var(--surface)" stroke="var(--text-2)" strokeWidth={1.2} />
      <line x1={0} x2={280} y1={20} y2={20} stroke="var(--line-2)" />
      <text x={8} y={14} fontSize={10.5} fontWeight={700} fill="var(--text)">Platinum Bridge</text>
      <text x={272} y={14} textAnchor="end" fontSize={9.5} fill="var(--muted)" fontFamily="var(--mono)">{plan.model.input.toUpperCase()}</text>
      <text x={8} y={34} fontSize={10} fill="var(--text)">{plan.model.name}</text>
      <text x={8} y={47} fontSize={9.5} fill="var(--muted)">{plan.board.name}</text>
    </g>
  );
}
