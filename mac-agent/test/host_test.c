/* Host build of the agent's protocol core, for cross-checking against the app's TypeScript
   (scripts/check-agent-protocol.mjs).
     host_test vectors   prints CRCs, frames and PackBits output as JSON
     host_test decode    reads a byte stream on stdin and prints the frames it contains */
#include <stdio.h>
#include <string.h>
#include "../src/protocol.h"

static uint32_t seed = 12345;
static uint8_t rnd(void) { seed = seed * 1103515245u + 12345u; return (uint8_t)(seed >> 16); }

static void hex(const uint8_t *p, size_t n) {
  size_t i;
  putchar('"');
  for (i = 0; i < n; i++) printf("%02x", p[i]);
  putchar('"');
}

static void print_frame(uint8_t type, uint8_t seq, const uint8_t *p, uint16_t len, void *ctx) {
  int *first = (int *)ctx;
  printf("%s{\"type\":%u,\"seq\":%u,\"payload\":", *first ? "" : ",", type, seq);
  hex(p, len);
  putchar('}');
  *first = 0;
}

static void vectors(void) {
  static uint8_t src[3000], packed[PACKBITS_MAX(3000)], frame[MAX_PAYLOAD + FRAME_OVERHEAD];
  size_t i, k;
  printf("{\"crc\":%u,\"frames\":[", crc16_xmodem((const uint8_t *)"123456789", 9, 0));
  for (k = 0; k < 6; k++) {
    uint16_t len = (uint16_t)(k == 0 ? 0 : k * 97);
    for (i = 0; i < len; i++) src[i] = rnd();
    printf("%s{\"type\":%u,\"seq\":%u,\"payload\":", k ? "," : "", (unsigned)(0x10 + k), (unsigned)(k * 40));
    hex(src, len);
    printf(",\"frame\":");
    hex(frame, frame_encode(frame, (uint8_t)(0x10 + k), (uint8_t)(k * 40), src, len));
    putchar('}');
  }
  printf("],\"packbits\":[");
  for (k = 0; k < 12; k++) {
    size_t n = 1 + (k * 271) % 3000;
    /* Mix runs and noise, like a real screen row. */
    for (i = 0; i < n;) {
      size_t run = 1 + rnd() % (k % 3 == 0 ? 200 : 6);
      uint8_t v = rnd(), mode = rnd() % 3;
      while (run-- && i < n) src[i++] = mode ? v : rnd();
    }
    printf("%s{\"src\":", k ? "," : "");
    hex(src, n);
    printf(",\"packed\":");
    hex(packed, packbits(src, n, packed));
    putchar('}');
  }
  printf("]}\n");
}

static void decode(void) {
  static uint8_t buf[4096];
  FrameDecoder d;
  int first = 1;
  size_t n;
  decoder_init(&d);
  printf("{\"frames\":[");
  while ((n = fread(buf, 1, sizeof buf, stdin)) > 0) decoder_push(&d, buf, n, print_frame, &first);
  printf("],\"bad\":%u}\n", (unsigned)d.bad_frames);
}

int main(int argc, char **argv) {
  if (argc > 1 && !strcmp(argv[1], "decode")) decode();
  else vectors();
  return 0;
}
