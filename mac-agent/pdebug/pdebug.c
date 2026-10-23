#include <Devices.h>
#include <Events.h>
#include <Gestalt.h>
#include <LowMem.h>
#include <Serial.h>
#include <stdarg.h>
#include <stdio.h>
#include <string.h>
#include "pdebug.h"
#include "pdebug_queue.h"
#include "../src/protocol.h"

enum { LV_TRACE, LV_INFO, LV_WARN, LV_ERROR };

static PDLogQueue *queue;
static short out_ref, in_ref;
static int direct, ready;

static int gestalt_available(void) {
  return NGetTrapAddress(0xA1AD, kOSTrapType) != NGetTrapAddress(0xA89F, kToolboxTrapType);
}

void PDInit(void) {
  long addr = 0;
  if (ready) return;
  ready = 1;
  if (gestalt_available() && Gestalt(PDBG_SELECTOR, &addr) == noErr && addr &&
      ((PDLogQueue *)addr)->magic == PDBG_MAGIC) {
    queue = (PDLogQueue *)addr;
    if (queue->alive) return;
  }
  /* No agent: talk to Platinum over the Modem port directly. */
  if (OpenDriver("\p.AIn", &in_ref) == noErr && OpenDriver("\p.AOut", &out_ref) == noErr) {
    short config = baud57600 + data8 + stop10 + noParity;
    SerReset(in_ref, config);
    SerReset(out_ref, config);
    direct = 1;
  }
}

void PDClose(void) {
  if (direct) { CloseDriver(in_ref); CloseDriver(out_ref); direct = 0; }
  ready = 0;
}

static void emit(int level, const char *text) {
  uint8_t p[6 + 32 + 256];
  /* CurApName (low memory $910); read through a plain pointer so GCC doesn't see a Byte[0]. */
  const unsigned char *app = (const unsigned char *)(uintptr_t)0x910;
  size_t src = app[0] > 31 ? 31 : app[0], n = strlen(text), len;
  if (!ready) PDInit();
  if (n > 255) n = 255;
  p[0] = (uint8_t)level;
  put32(p + 1, (uint32_t)TickCount());
  p[5] = (uint8_t)src;
  memcpy(p + 6, app + 1, src);
  memcpy(p + 6 + src, text, n);
  len = 6 + src + n;

  if (queue && queue->alive) {
    uint8_t lenb[2];
    if (pdq_free(queue) < len + 2) { queue->dropped++; return; }
    put16(lenb, (uint16_t)len);
    pdq_put(queue, lenb, 2);
    pdq_put(queue, p, (uint16_t)len);
  } else if (direct) {
    static uint8_t frame[sizeof p + FRAME_OVERHEAD];
    long count = (long)frame_encode(frame, T_LOG, 0, p, (uint16_t)len);
    FSWrite(out_ref, &count, frame);
  }
}

#define PD_FORMAT(level) \
  char text[256]; va_list ap; \
  va_start(ap, fmt); vsnprintf(text, sizeof text, fmt, ap); va_end(ap); \
  emit(level, text)

void PDLog(const char *fmt, ...) { PD_FORMAT(LV_INFO); }
void PDWarn(const char *fmt, ...) { PD_FORMAT(LV_WARN); }
void PDError(const char *fmt, ...) { PD_FORMAT(LV_ERROR); }
void PDTrace(const char *fmt, ...) { PD_FORMAT(LV_TRACE); }

void PDHex(const char *label, const void *data, long length) {
  const uint8_t *b = (const uint8_t *)data;
  long off;
  char line[96];
  for (off = 0; off < length; off += 16) {
    int i, o = snprintf(line, sizeof line, "%s+%04lX ", label, off);
    for (i = 0; i < 16 && off + i < length; i++) o += snprintf(line + o, sizeof line - o, " %02X", b[off + i]);
    emit(LV_TRACE, line);
  }
}
