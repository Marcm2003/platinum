// Pixel-art icons (retro accents) + thin line icons (controls).
// Pixel legend: X = ink (currentColor), o = fill (var(--icon-fill)), a = accent, r/y/g/b = rainbow.

import type { CSSProperties, ReactNode } from "react";

const PX: Record<string, string[]> = {
  happyMac: [
    "..XXXXXXXXXXXX..",
    ".XooooooooooooX.",
    ".XoXXXXXXXXXXoX.",
    ".XoXooooooooXoX.",
    ".XoXoXooooXoXoX.",
    ".XoXooooooooXoX.",
    ".XoXoooXXoooXoX.",
    ".XoXoXooooXoXoX.",
    ".XoXooXXXXooXoX.",
    ".XoXooooooooXoX.",
    ".XoXXXXXXXXXXoX.",
    ".XooooooooooooX.",
    ".XoaoooXXXXXooX.",
    ".XooooooooooooX.",
    ".XXXXXXXXXXXXXX.",
    ".XooooooooooooX.",
    ".XXXXXXXXXXXXXX.",
  ],
  floppy: [
    "XXXXXXXXXXXXXXX.",
    "XooXooooooXooXXX",
    "XooXooooXoXoooXX",
    "XooXooooXoXooooX",
    "XooXooooooXooooX",
    "XooXXXXXXXXooooX",
    "XooooooooooooooX",
    "XooooooooooooooX",
    "XoXXXXXXXXXXXXoX",
    "XoXooooooooooXoX",
    "XoXoXXXXXXXXoXoX",
    "XoXooooooooooXoX",
    "XoXoXXXXXXXXoXoX",
    "XoXooooooooooXoX",
    "XXXXXXXXXXXXXXXX",
  ],
  chip: [
    "...X.X.X.X.X....",
    "...X.X.X.X.X....",
    ".XXXXXXXXXXXXX..",
    ".XoooooooooooX..",
    "XXoXXXXXXXXXoXX.",
    ".XoXaaaaaaaXoX..",
    "XXoXaoooooaXoXX.",
    ".XoXaoXXXoaXoX..",
    "XXoXaoooooaXoXX.",
    ".XoXaaaaaaaXoX..",
    "XXoXXXXXXXXXoXX.",
    ".XoooooooooooX..",
    ".XXXXXXXXXXXXX..",
    "...X.X.X.X.X....",
    "...X.X.X.X.X....",
  ],
  keyboard: [
    "................",
    "................",
    "XXXXXXXXXXXXXXXX",
    "XooooooooooooooX",
    "XoXoXoXoXoXoXooX",
    "XooooooooooooooX",
    "XooXoXoXoXoXoXoX",
    "XooooooooooooooX",
    "XoXXoXXXXXXoXXoX",
    "XooooooooooooooX",
    "XXXXXXXXXXXXXXXX",
  ],
  mouse: [
    "......XXXX......",
    ".....XooooX.....",
    "....XooooooX....",
    "....XXXXXXXX....",
    "....XooooooX....",
    "....XooooooX....",
    "....XooooooX....",
    "....XooooooX....",
    "....XooooooX....",
    ".....XooooX.....",
    "......XXXX......",
    ".......X........",
    "........XX......",
    "..........X.....",
  ],
  screen: [
    "XXXXXXXXXXXXXXXX",
    "XooooooooooooooX",
    "XoXXXXXXXXXXXXoX",
    "XoXaaaaaaaaaaXoX",
    "XoXaXXXXXXXXaXoX",
    "XoXaXooooooXaXoX",
    "XoXaXooooooXaXoX",
    "XoXaXXXXXXXXaXoX",
    "XoXaaaaaaaaaaXoX",
    "XoXXXXXXXXXXXXoX",
    "XooooooooooooooX",
    "XXXXXXXXXXXXXXXX",
    "......XXXX......",
    "....XXXXXXXX....",
  ],
  bug: [
    "...X........X...",
    "....X......X....",
    ".....XXXXXX.....",
    "....XooooooX....",
    "X..XXXXXXXXXX..X",
    ".XXXooooXoooXXX.",
    "...XooooXoooX...",
    "XXXXooooXoooXXXX",
    "...XooooXoooX...",
    ".XXXooooXoooXXX.",
    "X...XoooXooX...X",
    ".....XXXXXX.....",
  ],
  gear: [
    "......XXXX......",
    "..XX..XooX..XX..",
    ".XooXXXooXXXooX.",
    ".XooooooooooooX.",
    "..XoooXXXXoooX..",
    "XXXooXooooXooXXX",
    "XoooXooooooXoooX",
    "XoooXooooooXoooX",
    "XXXooXooooXooXXX",
    "..XoooXXXXoooX..",
    ".XooooooooooooX.",
    ".XooXXXooXXXooX.",
    "..XX..XooX..XX..",
    "......XXXX......",
  ],
  disk: [
    "................",
    "..XXXXXXXXXXXX..",
    ".XooooooooooooX.",
    "XooooooooooooooX",
    "XXXXXXXXXXXXXXXX",
    "XooooooooooooooX",
    "XoooooooooooaaoX",
    "XooooooooooooooX",
    "XXXXXXXXXXXXXXXX",
  ],
  home: [
    ".......XX.......",
    "......XooX......",
    ".....XooooX.....",
    "....XooooooX....",
    "...XooooooooX...",
    "..XooooooooooX..",
    ".XXXXXXXXXXXXXX.",
    "..XooooooooooX..",
    "..XoXXXooXXXoX..",
    "..XoXaXooXaXoX..",
    "..XoXXXooXXXoX..",
    "..XooooooooooX..",
    "..XoooXXXXoooX..",
    "..XoooXooXoooX..",
    "..XXXXXXXXXXXX..",
  ],
  folder: [
    "................",
    ".XXXXX..........",
    "XoooooX.........",
    "XXXXXXXXXXXXXXX.",
    "XoooooooooooooX.",
    "XoooooooooooooX.",
    "XoooooooooooooX.",
    "XoooooooooooooX.",
    "XoooooooooooooX.",
    "XoooooooooooooX.",
    "XoooooooooooooX.",
    "XXXXXXXXXXXXXXX.",
  ],
  app: [
    ".......X........",
    "......XoX.......",
    ".....XoooX......",
    "....XoooooX.....",
    "...XoooaoooX....",
    "..XoooaaaoooX...",
    ".XoooaaaaaoooX..",
    "..XoooaaaoooX...",
    "...XoooaoooX....",
    "....XoooooX.....",
    ".....XoooX......",
    "......XoX.......",
    ".......X........",
  ],
  doc: [
    "XXXXXXXXX.......",
    "XoooooooXX......",
    "XoooooooXoX.....",
    "XoooooooXooX....",
    "XoooooooXXXXX...",
    "XoooooooooooX...",
    "XoXXXXXXXXooX...",
    "XoooooooooooX...",
    "XoXXXXXXXXooX...",
    "XoooooooooooX...",
    "XoXXXXXXooooX...",
    "XoooooooooooX...",
    "XXXXXXXXXXXXX...",
  ],
  sad: [
    "..XXXXXXXXXXXX..",
    ".XooooooooooooX.",
    ".XoXXXXXXXXXXoX.",
    ".XoXXXXXXXXXXoX.",
    ".XoXXoXXXXoXXoX.",
    ".XoXXXoXXoXXXoX.",
    ".XoXXoXXXXoXXoX.",
    ".XoXXXXXXXXXXoX.",
    ".XoXXXooooXXXoX.",
    ".XoXXoXXXXoXXoX.",
    ".XoXXXXXXXXXXoX.",
    ".XooooooooooooX.",
    ".XXXXXXXXXXXXXX.",
  ],
};

export type PixelName = keyof typeof PX;

export function PixelIcon({ name, size = 16, style, className }: { name: PixelName; size?: number; style?: CSSProperties; className?: string }) {
  const rows = PX[name];
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const rects: ReactNode[] = [];
  rows.forEach((row, y) => {
    [...row].forEach((c, x) => {
      const fill = c === "X" ? "currentColor" : c === "o" ? "var(--icon-fill)" : c === "a" ? "var(--accent)" : null;
      if (fill) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.04} height={1.04} fill={fill} />);
    });
  });
  const scale = size / Math.max(w, h);
  return (
    <svg className={`pixel ${className ?? ""}`} width={w * scale} height={h * scale} viewBox={`0 0 ${w} ${h}`} style={style} aria-hidden>
      {rects}
    </svg>
  );
}

// ───────────── Line icons ─────────────

const LINE: Record<string, string> = {
  plus: "M8 3v10M3 8h10",
  folder: "M2 4.5h4l1.5 1.5H14v6.5H2z",
  folderPlus: "M2 4.5h4l1.5 1.5H14v6.5H2zM8 7.5v3.5M6.25 9.25h3.5",
  open: "M2 4.5h4l1.5 1.5H13v1.5M2 12.5l1.8-5H15l-1.8 5z",
  save: "M3 2.5h8l2 2v9H3zM5 2.5v3.5h5V2.5M5 13.5V9.5h6v4",
  download: "M8 2.5v8M4.5 7L8 10.5 11.5 7M3 13.5h10",
  upload: "M8 10.5v-8M4.5 6L8 2.5 11.5 6M3 13.5h10",
  trash: "M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9",
  play: "M5 3.2v9.6L12.5 8z",
  stop: "M4 4h8v8H4z",
  pause: "M5 3.5v9M11 3.5v9",
  refresh: "M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3",
  link: "M7 9a2.5 2.5 0 0 0 3.5 0l2-2A2.5 2.5 0 0 0 9 3.5l-.7.7M9 7a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 7 12.5l.7-.7",
  unlink: "M4 4l8 8M9.5 4.5l.7-.7a2.5 2.5 0 0 1 3.5 3.5l-1 1M6.5 11.5l-.7.7a2.5 2.5 0 0 1-3.5-3.5l1-1",
  wifi: "M2 6.2a8.5 8.5 0 0 1 12 0M4.2 8.6a5.3 5.3 0 0 1 7.6 0M6.4 10.9a2.2 2.2 0 0 1 3.2 0M8 13.2v.1",
  globe: "M8 1.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 0 0 0-13zM1.5 8h13M8 1.5c-2.4 2.4-2.4 10.6 0 13M8 1.5c2.4 2.4 2.4 10.6 0 13",
  usb: "M8 14V2.5M6 4.5L8 2.5l2 2M8 11L4.5 8.8V7M8 9.5l3.5-2V6M4 6h1v1H4zM11 5h1v1h-1z",
  bluetooth: "M4.5 5l7 6L8 14V2l3.5 3-7 6",
  cable: "M3 13V9.5a2 2 0 0 1 2-2h6a2 2 0 0 0 2-2V3M1.5 13h3M11.5 3h3",
  copy: "M5.5 5.5h7v7h-7zM3.5 10.5v-7h7",
  check: "M3 8.5l3 3 7-7",
  x: "M4 4l8 8M12 4l-8 8",
  chevronRight: "M6 3.5L10.5 8 6 12.5",
  chevronLeft: "M10 3.5L5.5 8 10 12.5",
  power: "M8 2v6M4.5 4.2a5 5 0 1 0 7 0",
  info: "M8 7v4.5M8 4.6v.1M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12z",
  warn: "M8 2.5l6 11H2zM8 6.5v3.5M8 11.8v.1",
  search: "M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM10.6 10.6L14 14",
  expand: "M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10",
  camera: "M2 5h3l1-1.5h4L11 5h3v7.5H2zM8 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  terminal: "M2 3h12v10H2zM4.5 6l2 2-2 2M8 10.5h3.5",
  edit: "M10.5 2.5l3 3-8 8H2.5v-3z",
  send: "M14 2L7 9M14 2l-4.5 12L7 9 2 6.5z",
  hammer: "M9 3.5l3.5 3.5-1.5 1.5L7.5 5zM8 6.5l-5.5 5.5 1.5 1.5L9.5 8",
  bolt: "M9 1.5L3.5 9H8l-1 5.5L12.5 7H8z",
  sparkle: "M8 2v3M8 11v3M2 8h3M11 8h3M4 4l2 2M10 10l2 2M12 4l-2 2M6 10l-2 2",
  eye: "M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  file: "M4 2h5l3 3v9H4zM9 2v3h3",
};

export type LineName = keyof typeof LINE;

export function Icon({ name, size = 16, stroke = 1.5, style }: { name: LineName; size?: number; stroke?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden>
      <path d={LINE[name]} />
    </svg>
  );
}

export function AppleRainbow({ size = 14 }: { size?: number }) {
  return <span className="cm-apple" style={{ width: size, height: size, display: "inline-block" }} />;
}
