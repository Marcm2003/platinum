/* Screen capture: reads the main screen's frame buffer and streams rows compressed with PackBits.
   With `delta`, only rows whose fingerprint changed since the previous grab are sent. */
#include <Memory.h>
#include <OSUtils.h>
#include <Quickdraw.h>
#include <string.h>
#include "agent.h"

enum { true32b_ = 1, SWAP_MMU_TRAP = 0xA05D };

typedef struct {
  Ptr base;
  uint16_t row_bytes, w, h, depth;
  CTabHandle clut;  /* NULL for 1-bit screens without Color QuickDraw */
} ScreenInfo;

static uint32_t *fingerprints;
static uint16_t fp_rows, fp_w, fp_depth;

static int has_color_qd(void) {
  SysEnvRec env;
  SysEnvirons(1, &env);
  return env.hasColorQD;
}

static void get_screen(ScreenInfo *s) {
  if (has_color_qd()) {
    PixMapHandle pm = (**GetMainDevice()).gdPMap;
    s->base = (**pm).baseAddr;
    s->row_bytes = (uint16_t)((**pm).rowBytes & 0x3FFF);
    s->w = (uint16_t)((**pm).bounds.right - (**pm).bounds.left);
    s->h = (uint16_t)((**pm).bounds.bottom - (**pm).bounds.top);
    s->depth = (uint16_t)(**pm).pixelSize;
    s->clut = s->depth <= 8 ? (**pm).pmTable : NULL;
  } else {
    s->base = qd.screenBits.baseAddr;
    s->row_bytes = (uint16_t)(qd.screenBits.rowBytes & 0x3FFF);
    s->w = (uint16_t)(qd.screenBits.bounds.right - qd.screenBits.bounds.left);
    s->h = (uint16_t)(qd.screenBits.bounds.bottom - qd.screenBits.bounds.top);
    s->depth = 1;
    s->clut = NULL;
  }
}

void screen_describe(uint16_t *w, uint16_t *h, uint16_t *depth) {
  ScreenInfo s;
  get_screen(&s);
  *w = s.w; *h = s.h; *depth = s.depth;
}

/* Frame buffers can live above the 24-bit address space (Mac II family), so copy in 32-bit mode. */
static void copy_row(const ScreenInfo *s, uint16_t y, uint8_t *dst, int swap) {
  Ptr src = s->base + (long)y * s->row_bytes;
  if (swap) {
    char mode = true32b_;
    SwapMMUMode(&mode);
    BlockMoveData(src, (Ptr)dst, s->row_bytes);
    SwapMMUMode(&mode);
  } else {
    BlockMoveData(src, (Ptr)dst, s->row_bytes);
  }
}

static void send_clut(CTabHandle ct, uint16_t depth) {
  static uint8_t p[2 + 256 * 3];
  int i, n = 1 << depth, entries = (**ct).ctSize + 1;
  memset(p, 0, sizeof p);
  for (i = 0; i < n && i < entries; i++) {
    ColorSpec *c = &(**ct).ctTable[i];
    int v = (**ct).ctFlags & 0x8000 ? i : (c->value & 0xFF);  /* device CLUTs are indexed by position */
    if (v >= n) continue;
    p[2 + v * 3] = (uint8_t)(c->rgb.red >> 8);
    p[3 + v * 3] = (uint8_t)(c->rgb.green >> 8);
    p[4 + v * 3] = (uint8_t)(c->rgb.blue >> 8);
  }
  send_frame(T_SCREEN_CLUT, 0, p, (uint16_t)(2 + n * 3));
}

void screen_send(uint8_t req_type, uint8_t seq, int delta) {
  static uint8_t row[8192];
  static uint8_t out[MAX_PAYLOAD];
  ScreenInfo s;
  uint8_t info[7];
  uint16_t y, run_y = 0, run_n = 0;
  size_t o = 4;
  int swap;

  get_screen(&s);
  if (s.row_bytes > sizeof row || PACKBITS_MAX(s.row_bytes) + 4 > MAX_PAYLOAD) {
    send_error(seq, -1, "Screen too large; use a lower colour depth");
    return;
  }
  swap = trap_available(SWAP_MMU_TRAP) && has_color_qd();

  /* Fingerprints are only comparable for the same geometry. */
  if (!fingerprints || fp_rows != s.h || fp_w != s.w || fp_depth != s.depth) {
    if (fingerprints) DisposePtr((Ptr)fingerprints);
    fingerprints = (uint32_t *)NewPtrClear((long)s.h * 4);
    fp_rows = s.h; fp_w = s.w; fp_depth = s.depth;
    delta = 0;
  }

  put16(info, s.w); put16(info + 2, s.h); put16(info + 4, s.row_bytes); info[6] = (uint8_t)s.depth;
  send_frame(T_SCREEN_INFO, 0, info, sizeof info);
  if (s.clut) send_clut(s.clut, s.depth);

  for (y = 0; y < s.h; y++) {
    uint32_t fp;
    size_t packed_max = PACKBITS_MAX(s.row_bytes);
    copy_row(&s, y, row, swap);
    fp = row_fingerprint(row, s.row_bytes);
    if (delta && fingerprints && fingerprints[y] == fp) {
      if (run_n) { put16(out, run_y); put16(out + 2, run_n); send_frame(T_SCREEN_ROWS, 0, out, (uint16_t)o); run_n = 0; o = 4; }
      continue;
    }
    if (fingerprints) fingerprints[y] = fp;
    if (run_n && o + packed_max > sizeof out) {
      put16(out, run_y); put16(out + 2, run_n); send_frame(T_SCREEN_ROWS, 0, out, (uint16_t)o);
      run_n = 0; o = 4;
    }
    if (!run_n) run_y = y;
    o += packbits(row, s.row_bytes, out + o);
    run_n++;
  }
  if (run_n) { put16(out, run_y); put16(out + 2, run_n); send_frame(T_SCREEN_ROWS, 0, out, (uint16_t)o); }

  send_frame(T_SCREEN_END, 0, NULL, 0);
  send_reply(req_type, seq, NULL, 0);
}
