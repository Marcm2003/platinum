#include "display.h"
#include "config.h"

#if DISPLAY_KIND != DISPLAY_NONE
#include <U8g2lib.h>
#include <Wire.h>
#include <esp_system.h>
#include "screens.h"

namespace display {

#if DISPLAY_ROTATE_180
#define DISPLAY_ROTATION U8G2_R2
#else
#define DISPLAY_ROTATION U8G2_R0
#endif
#if DISPLAY_KIND == DISPLAY_SSD1306_72X40
static U8G2_SSD1306_72X40_ER_F_HW_I2C oled(DISPLAY_ROTATION, U8X8_PIN_NONE);
#else
static U8G2_SSD1306_128X64_NONAME_F_HW_I2C oled(DISPLAY_ROTATION, U8X8_PIN_NONE);
#endif

static bool found = false;
static uint8_t page = 0;
static uint32_t lastDraw = 0, toastUntil = 0, errorUntil = 0;
static String toastMsg;
static uint8_t errorCode = 0;
static const char* errorText = nullptr;
static bool macSeen = false;

static void show() { oled.sendBuffer(); }

/** If the last reset was a crash, say so the way a classic Mac would. */
static void bombIfCrashed() {
  const char* why = nullptr;
  esp_reset_reason_t r = esp_reset_reason();
  switch (r) {
    case ESP_RST_PANIC: why = "panic"; break;
    case ESP_RST_INT_WDT: case ESP_RST_TASK_WDT: case ESP_RST_WDT: why = "watchdog"; break;
    case ESP_RST_BROWNOUT: why = "power"; break;
    default: return;
  }
  screen_bomb(oled.getU8g2(), (uint8_t)r, why);
  show();
  delay(3500);
}

bool begin() {
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  Wire.beginTransmission(0x3C);
  found = Wire.endTransmission() == 0;
  if (!found) { Wire.end(); return false; }
  oled.begin();
  oled.setContrast(170);
  bombIfCrashed();
  for (uint8_t f = 0; f <= 9; f++) { screen_zoom(oled.getU8g2(), f); show(); delay(45); }
  screen_hello(oled.getU8g2());
  show();
  delay(700);
  bootProgress(0);
  return true;
}

bool present() { return found; }

void bootProgress(float p) {
  if (!found) return;
  screen_welcome(oled.getU8g2(), p, millis());
  show();
}

void bootDone() {
  if (!found) return;
  bootProgress(1);
  delay(250);
}

void nextPage() {
  page = (page + 1) % 4;
  toastUntil = 0;
  lastDraw = 0;
}

void prevPage() {
  page = (page + 3) % 4;
  toastUntil = 0;
  lastDraw = 0;
}

static bool menuOpen = false;

void menu(const char* title, const char* const* labels, const char* const* values, uint8_t count, uint8_t selected) {
  if (!found) return;
  menuOpen = true;
  uint32_t now = millis();
  MenuView m = {title, labels, values, count, selected, now < toastUntil ? toastMsg.c_str() : nullptr};
  screen_menu(oled.getU8g2(), &m);
  show();
  lastDraw = now;
}

void hideMenu() {
  menuOpen = false;
  lastDraw = 0;
}

void toast(const String& msg) {
  toastMsg = msg;
  toastUntil = millis() + 2500;
  lastDraw = 0;
}

void error(uint8_t code, const char* text, uint32_t forMs) {
  errorCode = code;
  errorText = text;
  errorUntil = millis() + forMs;
  page = 0;
  lastDraw = 0;
}

void update(const Status& s) {
  if (!found || menuOpen) return;
  uint32_t now = millis();
  if (now - lastDraw < 100) return;
  lastDraw = now;
  if (s.macActive) macSeen = true;

  String mode = String(s.mode);
  mode.toUpperCase();
  ScreenState st = {};
  st.now = now;
  st.page = page;
  st.mode = mode.c_str();
  st.mac = s.macActive ? MAC_ACTIVE : macSeen ? MAC_GONE : MAC_NEVER;
  st.link = s.link;
  st.wifi = s.joining ? WIFI_JOINING : s.wifi ? WIFI_JOINED : s.ap ? WIFI_AP : WIFI_OFF;
  st.ip = s.ip.c_str();
  st.ssid = s.ssid.c_str();
  st.bleCount = (uint8_t)min(s.bleConnected, 4);
  for (int i = 0; i < st.bleCount; i++) st.ble[i] = s.bleNames[i].c_str();
  st.serIn = s.serIn;
  st.serOut = s.serOut;
  st.keys = s.keys;
  st.lastKeyMs = s.lastKeyMs;
  st.lastMouseMs = s.lastMouseMs;
  st.lastSerialMs = s.lastSerialMs;
  if (now < errorUntil) { st.errorCode = errorCode; st.errorText = errorText; }
  st.toast = now < toastUntil ? toastMsg.c_str() : nullptr;
  screen_status(oled.getU8g2(), &st);
  show();
}

}  // namespace display

#else

namespace display {
bool begin() { return false; }
bool present() { return false; }
void bootProgress(float) {}
void bootDone() {}
void update(const Status&) {}
void nextPage() {}
void prevPage() {}
void menu(const char*, const char* const*, const char* const*, uint8_t, uint8_t) {}
void hideMenu() {}
void toast(const String&) {}
void error(uint8_t, const char*, uint32_t) {}
}  // namespace display

#endif
