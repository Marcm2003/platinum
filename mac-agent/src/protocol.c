#include "protocol.h"
#include <string.h>

uint16_t crc16_xmodem(const uint8_t *p, size_t n, uint16_t crc) {
  while (n--) {
    int i;
    crc ^= (uint16_t)(*p++) << 8;
    for (i = 0; i < 8; i++) crc = (crc & 0x8000) ? (uint16_t)((crc << 1) ^ 0x1021) : (uint16_t)(crc << 1);
  }
  return crc;
}

size_t frame_encode(uint8_t *out, uint8_t type, uint8_t seq, const uint8_t *payload, uint16_t len) {
  out[0] = 0xA5; out[1] = 0x5A; out[2] = type; out[3] = seq;
  put16(out + 4, len);
  if (len) memcpy(out + 6, payload, len);
  put16(out + 6 + len, crc16_xmodem(out + 2, 4 + (size_t)len, 0));
  return (size_t)len + FRAME_OVERHEAD;
}

void decoder_init(FrameDecoder *d) { d->have = 0; d->bad_frames = 0; }

static void drop(FrameDecoder *d, size_t n) {
  memmove(d->buf, d->buf + n, d->have - n);
  d->have -= n;
}

void decoder_push(FrameDecoder *d, const uint8_t *data, size_t n, FrameHandler on_frame, void *ctx) {
  while (n) {
    size_t room = sizeof d->buf - d->have, take = n < room ? n : room;
    memcpy(d->buf + d->have, data, take);
    d->have += take; data += take; n -= take;

    for (;;) {
      size_t i = 0, len;
      while (i + 1 < d->have && !(d->buf[i] == 0xA5 && d->buf[i + 1] == 0x5A)) i++;
      if (i) drop(d, i);
      if (d->have < FRAME_OVERHEAD) break;
      len = get16(d->buf + 4);
      if (len > MAX_PAYLOAD) { drop(d, 2); d->bad_frames++; continue; }
      if (d->have < len + FRAME_OVERHEAD) {
        if (d->have == sizeof d->buf) { drop(d, 2); d->bad_frames++; continue; }
        break;
      }
      if (crc16_xmodem(d->buf + 2, 4 + len, 0) == get16(d->buf + 6 + len)) {
        on_frame(d->buf[2], d->buf[3], d->buf + 6, (uint16_t)len, ctx);
        drop(d, len + FRAME_OVERHEAD);
      } else {
        d->bad_frames++;
        drop(d, 2);
      }
    }
  }
}

size_t packbits(const uint8_t *src, size_t n, uint8_t *dst) {
  size_t i = 0, o = 0;
  while (i < n) {
    size_t run = 1;
    while (i + run < n && run < 128 && src[i + run] == src[i]) run++;
    if (run >= 2) {
      dst[o++] = (uint8_t)(1 - (int)run);   /* -(run-1) */
      dst[o++] = src[i];
      i += run;
    } else {
      /* Literal: up to 128 bytes, stopping before a run of 3 or more. */
      size_t start = i, lit = 0;
      while (i < n && lit < 128) {
        if (i + 2 < n && src[i] == src[i + 1] && src[i] == src[i + 2]) break;
        i++; lit++;
      }
      dst[o++] = (uint8_t)(lit - 1);
      memcpy(dst + o, src + start, lit);
      o += lit;
    }
  }
  return o;
}

uint32_t row_fingerprint(const uint8_t *p, size_t n) {
  uint32_t a = 1, b = 0;
  while (n) {
    size_t block = n < 360 ? n : 360;
    n -= block;
    while (block--) { a += *p++; b += a; }
    a %= 65521; b %= 65521;
  }
  return (b << 16) | a;
}
