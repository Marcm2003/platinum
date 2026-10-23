/* Platinum Agent protocol: framing, CRC and PackBits. Portable C (no Toolbox calls),
   so it also builds on the host for the cross-check test in test/host_test.c.
   Spec: docs/protocol.md. */
#ifndef PLATINUM_PROTOCOL_H
#define PLATINUM_PROTOCOL_H

#include <stddef.h>
#include <stdint.h>

enum {
  T_PING = 0x01, T_SYSINFO = 0x02,
  T_LOG = 0x10,
  T_FILE_BEGIN = 0x20, T_FILE_DATA = 0x21, T_FILE_END = 0x22,
  T_SCREEN_FULL = 0x30, T_SCREEN_DELTA = 0x31,
  T_PEEK = 0x40, T_POKE = 0x41,
  T_LAUNCH = 0x50, T_LIST = 0x51,
  T_HELLO = 0x7F,
  T_REPLY = 0x80,
  T_SCREEN_INFO = 0xB0, T_SCREEN_ROWS = 0xB1, T_SCREEN_END = 0xB2, T_SCREEN_CLUT = 0xB3,
  T_ERROR = 0xFF
};

#define MAX_PAYLOAD 8192
#define FRAME_OVERHEAD 8

uint16_t crc16_xmodem(const uint8_t *p, size_t n, uint16_t crc);

/* Writes a complete frame into out (needs len + 8 bytes); returns its size. */
size_t frame_encode(uint8_t *out, uint8_t type, uint8_t seq, const uint8_t *payload, uint16_t len);

typedef struct {
  uint8_t buf[MAX_PAYLOAD + FRAME_OVERHEAD];
  size_t have;
  uint32_t bad_frames;
} FrameDecoder;

typedef void (*FrameHandler)(uint8_t type, uint8_t seq, const uint8_t *payload, uint16_t len, void *ctx);

void decoder_init(FrameDecoder *d);
/* Feeds bytes; calls on_frame for each valid frame. Resynchronises on A5 5A. */
void decoder_push(FrameDecoder *d, const uint8_t *data, size_t n, FrameHandler on_frame, void *ctx);

/* Apple PackBits. Worst case output is n + (n + 127) / 128 bytes. */
size_t packbits(const uint8_t *src, size_t n, uint8_t *dst);
#define PACKBITS_MAX(n) ((n) + ((n) + 127) / 128)

/* Cheap per-row fingerprint for screen deltas (Fletcher-32 over the row). */
uint32_t row_fingerprint(const uint8_t *p, size_t n);

/* Big-endian helpers. */
static inline void put16(uint8_t *p, uint16_t v) { p[0] = (uint8_t)(v >> 8); p[1] = (uint8_t)v; }
static inline void put32(uint8_t *p, uint32_t v) { p[0] = (uint8_t)(v >> 24); p[1] = (uint8_t)(v >> 16); p[2] = (uint8_t)(v >> 8); p[3] = (uint8_t)v; }
static inline uint16_t get16(const uint8_t *p) { return (uint16_t)((p[0] << 8) | p[1]); }
static inline uint32_t get32(const uint8_t *p) { return ((uint32_t)p[0] << 24) | ((uint32_t)p[1] << 16) | ((uint32_t)p[2] << 8) | p[3]; }

#endif
