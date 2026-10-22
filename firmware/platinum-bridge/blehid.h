// BLE HID host: pairs Bluetooth LE keyboards/mice and forwards them to the Mac.
#pragma once
#include <Arduino.h>
#include <functional>

namespace blehid {

struct Device {
  String addr;
  String name;
  int rssi;
  uint16_t appearance;
  bool paired;
  bool connected;
};

using KeyFn = std::function<void(uint8_t adbCode, bool down)>;
using MouseFn = std::function<void(int dx, int dy, bool button)>;

void begin(KeyFn onKey, MouseFn onMouse);
void scan(uint32_t ms);
bool pair(const String& addr);
void forget(const String& addr);
/** Reconnect bonded devices that are out of range / not connected. Call periodically. */
void maintain();
/** Snapshot of scanned + bonded devices, as JSON array text. */
String listJson();
bool listChanged();

}  // namespace blehid
