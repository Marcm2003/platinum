// Status screen on an SSD1306 OLED: the 0.42" (72×40) one built into ESP32-C3 OLED boards, or
// an external 0.96" (128×64) module, which is probed for and simply absent if not connected.
// A little Mac tells you how things are (see screens.cpp); the BOOT button cycles through pages.
#pragma once
#include <Arduino.h>

namespace display {

// Codes shown under the sad Mac, like the classic start-up error codes.
enum : uint8_t { ERR_WIFI_JOIN = 0x01, ERR_BLE_PAIR = 0x02 };

struct Status {
  const char* mode;      // "adb" | "m0110"
  bool macActive;        // the Mac is polling the bus right now
  const char* link;      // how Platinum is connected: "USB", "WiFi", "BLE" or nullptr
  bool wifi, ap, joining;
  String ip, ssid;
  String bleNames[4];
  int bleConnected;
  uint32_t serIn, serOut, keys;
  uint32_t lastKeyMs, lastMouseMs, lastSerialMs;
};

/** Finds the screen and plays the start-up sequence (with the bomb first if we crashed). */
bool begin();
bool present();
/** "Welcome to Platinum" progress while setup() runs, 0..1. */
void bootProgress(float p);
void bootDone();
void update(const Status& s);  // redraws at most every 100 ms
void nextPage();
void toast(const String& msg);  // shown over the current page for a few seconds
void error(uint8_t code, const char* text, uint32_t forMs);

}  // namespace display
