// Status-screen drawing, written against U8g2's C API only (no Arduino), so the same code renders
// on the bridge and on a computer for previews (tools/oled-preview).
#pragma once
#include <stdint.h>

#ifdef ARDUINO
#include <U8g2lib.h>
#else
#include "u8g2.h"
#endif

enum MacSeen : uint8_t { MAC_NEVER, MAC_ACTIVE, MAC_GONE };
enum WifiState : uint8_t { WIFI_OFF, WIFI_JOINED, WIFI_AP, WIFI_JOINING };

struct ScreenState {
  uint32_t now;            // ms, drives the animations
  uint8_t page;            // 0 home, 1 network, 2 Bluetooth, 3 traffic
  const char* mode;        // "ADB" | "M0110"
  MacSeen mac;
  const char* link;        // how Platinum is connected: "USB", "WiFi", "BLE" or nullptr
  WifiState wifi;
  const char* ip;
  const char* ssid;
  const char* ble[4];
  uint8_t bleCount;
  uint32_t serIn, serOut, keys;
  uint32_t lastKeyMs, lastMouseMs, lastSerialMs;  // 0 = never
  uint8_t errorCode;       // non-zero shows the sad Mac
  const char* errorText;
  const char* toast;       // overlay message, or nullptr
};

/** Finder-style zoom rectangles opening from the centre; frame 0..7. */
void screen_zoom(u8g2_t* g, uint8_t frame);
/** The happy Mac on its own, centred. */
void screen_hello(u8g2_t* g);
/** "Welcome to Platinum" with a progress bar (0..1). */
void screen_welcome(u8g2_t* g, float progress, uint32_t now);
/** The classic system-error box with the bomb. */
void screen_bomb(u8g2_t* g, uint8_t id, const char* why);
/** One of the four pages, plus any toast. */
void screen_status(u8g2_t* g, const ScreenState* s);
