#include "screens.h"
#include <math.h>
#include <stdio.h>
#include <string.h>
#include "oled_art.h"

namespace {

const int PAGES = 4;

// Everything is laid out for the 72×40 screen and doubled where there's room (128×64).
struct Look {
  bool big;
  int w, h;
  const uint8_t* font;   // body text
  const uint8_t* title;  // headings
  int row;               // line height
};

Look look(u8g2_t* g) {
  Look l;
  l.w = u8g2_GetDisplayWidth(g);
  l.h = u8g2_GetDisplayHeight(g);
  l.big = l.w >= 128;
  l.font = l.big ? u8g2_font_6x10_tf : u8g2_font_4x6_tf;
  l.title = l.big ? u8g2_font_7x13B_tf : u8g2_font_6x10_tf;
  l.row = l.big ? 11 : 7;
  return l;
}

const Art& pick(const Art& small, const Art& large, const Look& l) { return l.big ? large : small; }

void art(u8g2_t* g, int x, int y, const Art& a) { u8g2_DrawXBM(g, x, y, a.w, a.h, a.bits); }

void text(u8g2_t* g, int x, int y, const char* s, int maxW) {
  char buf[40];
  strncpy(buf, s ? s : "", sizeof buf - 1);
  buf[sizeof buf - 1] = 0;
  for (size_t n = strlen(buf); n && (int)u8g2_GetStrWidth(g, buf) > maxW; n--) buf[n - 1] = 0;
  u8g2_DrawStr(g, x, y, buf);
}

void centred(u8g2_t* g, int y, const char* s, int w) { u8g2_DrawStr(g, (w - (int)u8g2_GetStrWidth(g, s)) / 2, y, s); }

bool recent(uint32_t at, uint32_t now, uint32_t ms) { return at && now - at < ms; }

/** WiFi arcs, 9×7, or an AP tower when we're the access point. */
void wifiIcon(u8g2_t* g, int x, int y, WifiState w, uint32_t now) {
  if (w == WIFI_OFF) return;
  if (w == WIFI_JOINING && (now / 300) % 2) return;  // blink while joining
  int cx = x + 6, cy = y + 6;
  u8g2_DrawPixel(g, cx, cy);
  u8g2_DrawCircle(g, cx, cy, 3, U8G2_DRAW_UPPER_LEFT | U8G2_DRAW_UPPER_RIGHT);
  u8g2_DrawCircle(g, cx, cy, 6, U8G2_DRAW_UPPER_LEFT | U8G2_DRAW_UPPER_RIGHT);
  if (w == WIFI_AP) u8g2_DrawStr(g, x + 14, y + 6, "AP");
}

/** Top bar: bus mode on the left, activity and radio icons on the right. */
void statusBar(u8g2_t* g, const ScreenState* s, const Look& l) {
  u8g2_SetFont(g, l.font);
  u8g2_DrawStr(g, 0, l.big ? 8 : 5, s->mode);
  int x = l.w;
  if (s->bleCount) { x -= 8; art(g, x, 0, ART_BLUETOOTH_1X); x -= 2; }
  x -= s->wifi == WIFI_AP ? 22 : 13;
  wifiIcon(g, x, 0, s->wifi, s->now);
  if (recent(s->lastMouseMs, s->now, 400)) { x -= 9; art(g, x, 0, ART_MOUSE_1X); }
  if (recent(s->lastKeyMs, s->now, 400)) { x -= 13; art(g, x, 2, ART_KEYBOARD_1X); }
  if (recent(s->lastSerialMs, s->now, 300) && (s->now / 100) % 2) { x -= 5; u8g2_DrawBox(g, x, 2, 3, 3); }
}

void pageDots(u8g2_t* g, const ScreenState* s, const Look& l) {
  for (int i = 0; i < PAGES; i++) {
    int x = l.w / 2 - PAGES * 2 + i * 4;
    if (i == s->page) u8g2_DrawBox(g, x, l.h - 2, 2, 2); else u8g2_DrawPixel(g, x, l.h - 1);
  }
}

// ───────── Home: the little Mac tells you how things are ─────────

void home(u8g2_t* g, const ScreenState* s, const Look& l) {
  statusBar(g, s, l);
  int ix = l.big ? 4 : 2, iy = l.big ? 12 : 9;
  int tx = l.big ? 54 : 28, tw = l.w - tx;
  int y = l.big ? 26 : 17;
  char line[32];
  const char* title;
  const char* detail;

  if (s->errorCode) {
    art(g, ix, iy, pick(ART_MAC_SAD_1X, ART_MAC_SAD_2X, l));
    snprintf(line, sizeof line, "%08X", (unsigned)s->errorCode);  // the codes under a sad Mac
    title = line;
    detail = s->errorText;
  } else if (s->mac == MAC_ACTIVE) {
    bool blink = (s->now % 3700) < 140;  // blinks every few seconds
    art(g, ix, iy, blink ? pick(ART_MAC_BLINK_1X, ART_MAC_BLINK_2X, l) : pick(ART_MAC_HAPPY_1X, ART_MAC_HAPPY_2X, l));
    title = "Mac OK";
    detail = recent(s->lastKeyMs, s->now, 1500) ? "Typing" : recent(s->lastMouseMs, s->now, 1500) ? "Mouse" : "Bus active";
  } else if (s->mac == MAC_GONE) {
    const Art& m = pick(ART_MAC_OFF_1X, ART_MAC_OFF_2X, l);
    art(g, ix, iy, m);
    // "z"s drifting up out of the dark screen
    int k = l.big ? 2 : 1;
    for (int i = 0; i < 2; i++) {
      int t = (int)((s->now / 120 + i * 9) % 18);
      u8g2_SetFont(g, l.font);
      u8g2_DrawStr(g, ix + (6 + i * 5 + t / 6) * k, iy + (14 - t / 2) * k + 2, "z");
    }
    title = "Mac asleep";
    detail = "No traffic";
  } else {
    bool q = (s->now / 600) % 2;  // the question mark blinks
    int fx = ix + (l.big ? 2 : 1), fy = iy + (l.big ? 2 : 2);
    art(g, fx, fy, q ? pick(ART_FLOPPY_Q_1X, ART_FLOPPY_Q_2X, l) : pick(ART_FLOPPY_1X, ART_FLOPPY_2X, l));
    title = "No Mac yet";
    detail = "Plug it in";
  }

  u8g2_SetFont(g, l.font);
  text(g, tx, y, title, tw);
  text(g, tx, y + l.row, detail, tw);
  snprintf(line, sizeof line, "App %s", s->link ? s->link : "-");
  text(g, tx, y + 2 * l.row, line, tw);
  pageDots(g, s, l);
}

void header(u8g2_t* g, const char* title, const char* right, const Look& l) {
  u8g2_SetFont(g, l.font);
  u8g2_DrawBox(g, 0, 0, l.w, l.row);
  u8g2_SetDrawColor(g, 0);
  u8g2_DrawStr(g, 1, l.row - 1, title);
  if (right) u8g2_DrawStr(g, l.w - u8g2_GetStrWidth(g, right) - 1, l.row - 1, right);
  u8g2_SetDrawColor(g, 1);
}

void count(char* out, size_t n, const char* label, uint32_t v) {
  if (v < 10000) snprintf(out, n, "%s %lu", label, (unsigned long)v);
  else if (v < 10000000) snprintf(out, n, "%s %luk", label, (unsigned long)(v / 1000));
  else snprintf(out, n, "%s %luM", label, (unsigned long)(v / 1000000));
}

void toast(u8g2_t* g, const char* msg, const Look& l) {
  u8g2_SetFont(g, l.font);
  int w = (int)u8g2_GetStrWidth(g, msg) + 8;
  if (w > l.w) w = l.w;
  int h = l.row + 5, x = (l.w - w) / 2, y = l.h - h - 3;
  u8g2_SetDrawColor(g, 0);
  u8g2_DrawBox(g, x - 1, y - 1, w + 2, h + 2);
  u8g2_SetDrawColor(g, 1);
  u8g2_DrawRBox(g, x, y, w, h, 2);
  u8g2_SetDrawColor(g, 0);
  text(g, x + 4, y + h - 3, msg, w - 6);
  u8g2_SetDrawColor(g, 1);
}

}  // namespace

// ───────── Public ─────────

void screen_zoom(u8g2_t* g, uint8_t frame) {
  Look l = look(g);
  u8g2_ClearBuffer(g);
  // Three trailing outlines, growing from the centre like a Finder window opening.
  for (int k = 0; k < 3; k++) {
    int f = frame - k * 2;
    if (f < 0) continue;
    int w = 4 + (l.w - 4) * f / 8, h = 3 + (l.h - 3) * f / 8;
    u8g2_DrawFrame(g, (l.w - w) / 2, (l.h - h) / 2, w, h);
  }
}

void screen_hello(u8g2_t* g) {
  Look l = look(g);
  const Art& m = pick(ART_MAC_HAPPY_1X, ART_MAC_HAPPY_2X, l);
  u8g2_ClearBuffer(g);
  art(g, (l.w - m.w) / 2, (l.h - m.h) / 2, m);
}

void screen_welcome(u8g2_t* g, float progress, uint32_t now) {
  Look l = look(g);
  u8g2_ClearBuffer(g);
  u8g2_DrawRFrame(g, 0, 0, l.w, l.h, 3);
  u8g2_SetFont(g, l.font);
  centred(g, l.big ? 16 : 9, "Welcome to", l.w);
  u8g2_SetFont(g, l.title);
  centred(g, l.big ? 36 : 21, "Platinum", l.w);
  int bw = l.w - (l.big ? 40 : 16), bh = l.big ? 7 : 5, bx = (l.w - bw) / 2, by = l.h - bh - (l.big ? 10 : 5);
  if (progress < 0) progress = 0;
  if (progress > 1) progress = 1;
  u8g2_DrawFrame(g, bx, by, bw, bh);
  u8g2_DrawBox(g, bx + 1, by + 1, (int)((bw - 2) * progress), bh - 2);
  (void)now;
}

void screen_bomb(u8g2_t* g, uint8_t id, const char* why) {
  Look l = look(g);
  u8g2_ClearBuffer(g);
  u8g2_DrawFrame(g, 0, 0, l.w, l.h);
  u8g2_DrawFrame(g, 2, 2, l.w - 4, l.h - 4);  // the double border of a stop dialog
  const Art& b = pick(ART_BOMB_1X, ART_BOMB_2X, l);
  art(g, 4, l.big ? 8 : 5, b);
  u8g2_SetFont(g, l.font);
  int x = b.w + 7, w = l.w - x - 3, y = l.big ? 15 : 9;
  // As on the real dialog, the ID says roughly what went wrong.
  char line[24];
  snprintf(line, sizeof line, "ID = %02u", id);
  if (l.big) {
    char id[32];
    snprintf(id, sizeof id, "%s %s", line, why ? why : "");
    text(g, x, y, "Sorry, a", w);
    text(g, x, y + l.row, "system error", w);
    text(g, x, y + 2 * l.row, "occurred.", w);
    text(g, x, y + 3 * l.row + 4, id, w);
  } else {
    text(g, x, y, "Sorry, a", w);
    text(g, x, y + l.row, "system", w);
    text(g, x, y + 2 * l.row, "error.", w);
    text(g, x, y + 3 * l.row, line, w);
  }
}

void screen_status(u8g2_t* g, const ScreenState* s) {
  Look l = look(g);
  u8g2_ClearBuffer(g);
  u8g2_SetDrawColor(g, 1);
  u8g2_SetFontMode(g, 1);
  char line[40];
  int y = l.row * 2;

  if (s->page == 0) {
    home(g, s, l);
  } else if (s->page == 1) {
    header(g, "Network", s->wifi == WIFI_AP ? "AP" : s->wifi == WIFI_JOINED ? "WiFi" : "off", l);
    if (s->wifi == WIFI_JOINED || s->wifi == WIFI_AP) {
      text(g, 0, y, s->ssid, l.w);
      text(g, 0, y += l.row, s->ip, l.w);
      if (s->wifi == WIFI_AP) text(g, 0, y += l.row, "pw macintosh", l.w);
    } else {
      text(g, 0, y, s->wifi == WIFI_JOINING ? "Joining..." : "Not connected", l.w);
    }
    text(g, 0, y += l.row, "platinum.local", l.w);
    pageDots(g, s, l);
  } else if (s->page == 2) {
    header(g, "Bluetooth", nullptr, l);
    for (int i = 0; i < s->bleCount && i < 4; i++) { text(g, 0, y, s->ble[i], l.w); y += l.row; }
    if (!s->bleCount) text(g, 0, y, "No keyboard/mouse", l.w);
    pageDots(g, s, l);
  } else {
    header(g, "Traffic", nullptr, l);
    count(line, sizeof line, "Mac in ", s->serIn);  text(g, 0, y, line, l.w);
    count(line, sizeof line, "Mac out", s->serOut); text(g, 0, y += l.row, line, l.w);
    count(line, sizeof line, "Keys   ", s->keys);   text(g, 0, y += l.row, line, l.w);
    pageDots(g, s, l);
  }
  if (s->toast) toast(g, s->toast, l);
}

void screen_menu(u8g2_t* g, const MenuView* m) {
  Look l = look(g);
  u8g2_ClearBuffer(g);
  u8g2_SetDrawColor(g, 1);
  u8g2_SetFontMode(g, 1);
  header(g, m->title, nullptr, l);

  // As many rows as fit under the title, scrolled to keep the selection in view.
  int rows = (l.h - l.row - 1) / l.row;
  int first = m->selected < rows ? 0 : m->selected - rows + 1;
  bool scroll = m->count > rows;
  int right = scroll ? l.w - 4 : l.w;
  for (int i = 0; i < rows && first + i < m->count; i++) {
    int item = first + i, top = l.row + 1 + i * l.row, y = top + l.row - 2;
    bool sel = item == m->selected;
    if (sel) { u8g2_DrawRBox(g, 0, top, right, l.row, 2); u8g2_SetDrawColor(g, 0); }
    const char* v = m->values ? m->values[item] : nullptr;
    int vw = v ? (int)u8g2_GetStrWidth(g, v) : 0;
    text(g, 2, y, m->labels[item], right - 4 - (v ? vw + 4 : 0));
    if (v) u8g2_DrawStr(g, right - vw - 2, y, v);
    u8g2_SetDrawColor(g, 1);
  }
  if (scroll) {
    int track = l.h - l.row - 2, h = track * rows / m->count;
    if (h < 3) h = 3;
    int y = l.row + 1 + (track - h) * first / (m->count - rows);
    u8g2_DrawVLine(g, l.w - 2, l.row + 1, track);
    u8g2_DrawBox(g, l.w - 3, y, 3, h);
  }
  if (m->toast) toast(g, m->toast, l);
}
