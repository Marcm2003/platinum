// Renders the bridge's status screens on a computer, with the real U8g2 library and the firmware's
// own screens.cpp, into PGM frames. scripts/oled-preview.mjs builds this and turns the frames
// into PNGs and an animated GIF.
//   preview <outdir> <72x40|128x64>

#include <stdio.h>
#include <string.h>
#include <string>
#include "../../platinum-bridge/screens.h"

static u8g2_t g;
static std::string dir;
static int frameNo = 0;

static void save(const char* name) {
  int w = u8g2_GetDisplayWidth(&g), h = u8g2_GetDisplayHeight(&g), tw = u8g2_GetBufferTileWidth(&g);
  uint8_t* buf = u8g2_GetBufferPtr(&g);
  std::string path = dir + "/" + name + ".pgm";
  FILE* f = fopen(path.c_str(), "wb");
  fprintf(f, "P5\n%d %d\n255\n", w, h);
  for (int y = 0; y < h; y++)
    for (int x = 0; x < w; x++) fputc((buf[(y / 8) * tw * 8 + x] >> (y % 8)) & 1 ? 255 : 0, f);
  fclose(f);
}

/** One frame of the animated tour (100 ms each). */
static void frame() {
  char name[32];
  snprintf(name, sizeof name, "anim_%04d", frameNo++);
  save(name);
}

static ScreenState base(uint32_t now) {
  ScreenState s = {};
  s.now = now;
  s.mode = "ADB";
  s.mac = MAC_ACTIVE;
  s.link = "USB";
  s.wifi = WIFI_JOINED;
  s.ip = "192.168.1.42";
  s.ssid = "Home";
  s.ble[0] = "Magic Keyboard";
  s.ble[1] = "MX Anywhere 3";
  s.bleCount = 2;
  s.serIn = 18432;
  s.serOut = 2210;
  s.keys = 312;
  return s;
}

int main(int argc, char** argv) {
  if (argc < 3) { fprintf(stderr, "usage: preview <outdir> <72x40|128x64>\n"); return 1; }
  dir = argv[1];
  if (!strcmp(argv[2], "128x64")) u8g2_Setup_ssd1306_i2c_128x64_noname_f(&g, U8G2_R0, u8x8_byte_empty, u8x8_dummy_cb);
  else u8g2_Setup_ssd1306_i2c_72x40_er_f(&g, U8G2_R0, u8x8_byte_empty, u8x8_dummy_cb);

  // ── The animated tour ──
  for (int i = 0; i <= 9; i++) { screen_zoom(&g, i); frame(); }
  screen_hello(&g);
  for (int i = 0; i < 8; i++) frame();
  for (int i = 0; i <= 20; i++) { screen_welcome(&g, i / 20.0f, i * 100); frame(); }

  uint32_t t = 0;
  auto run = [&](ScreenState s, int frames, void (*tweak)(ScreenState&, int)) {
    for (int i = 0; i < frames; i++, t += 100) {
      s.now = t;
      if (tweak) tweak(s, i);
      screen_status(&g, &s);
      frame();
    }
  };
  ScreenState s = base(0);
  s.mac = MAC_NEVER; s.link = nullptr; s.wifi = WIFI_JOINING;
  run(s, 24, [](ScreenState& x, int i) { if (i > 12) x.wifi = WIFI_JOINED; });
  s = base(0);
  s.toast = "Platinum connected";
  run(s, 14, nullptr);
  s.toast = nullptr;
  run(s, 40, [](ScreenState& x, int i) {
    if (i % 3 == 0) x.lastKeyMs = x.now;
    if (i > 20 && i % 2 == 0) x.lastMouseMs = x.now;
  });
  s.mac = MAC_GONE;
  run(s, 30, nullptr);
  s = base(0);
  s.errorCode = 0x02; s.errorText = "Pair failed";
  run(s, 18, nullptr);
  s = base(0);
  for (int p = 1; p <= 3; p++) { s.page = p; run(s, 10, nullptr); }
  screen_bomb(&g, 4, "panic");
  for (int i = 0; i < 18; i++) frame();

  // ── Stills for the docs ──
  screen_zoom(&g, 5); save("boot_zoom");
  screen_hello(&g); save("boot_hello");
  screen_welcome(&g, 0.6f, 0); save("boot_welcome");
  s = base(1000); s.mac = MAC_NEVER; s.link = nullptr; s.now = 0; screen_status(&g, &s); save("home_no_mac");
  s = base(1000); s.lastKeyMs = 1000; screen_status(&g, &s); save("home_mac_ok");
  s = base(1000); s.mac = MAC_GONE; screen_status(&g, &s); save("home_mac_asleep");
  s = base(1000); s.errorCode = 0x02; s.errorText = "Pair failed"; screen_status(&g, &s); save("home_error");
  s = base(1000); s.wifi = WIFI_AP; s.ssid = "Platinum-0BA8"; s.ip = "192.168.4.1"; s.page = 1; screen_status(&g, &s); save("page_network_ap");
  s = base(1000); s.page = 2; screen_status(&g, &s); save("page_bluetooth");
  s = base(1000); s.page = 3; screen_status(&g, &s); save("page_traffic");
  screen_bomb(&g, 4, "panic"); save("bomb");
  printf("%d animation frames\n", frameNo);
  return 0;
}
