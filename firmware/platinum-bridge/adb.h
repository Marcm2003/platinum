// Apple Desktop Bus device emulation: one keyboard + one mouse on a single data line.
#pragma once
#include <Arduino.h>

namespace adb {

struct Stats {
  uint32_t talks;        // Talk commands seen (any address)
  uint32_t ourTalks;     // Talk commands addressed to us
  uint32_t lastTalkMs;   // millis() of the last command
  uint8_t kbdAddr, mouseAddr;
};

void begin();
void end();
/** Queue a key transition (ADB virtual key code, 0x7F = power). */
void key(uint8_t code, bool down);
/** Accumulate relative mouse motion and button state. */
void mouse(int dx, int dy, bool button);
Stats stats();
/** Called from the ADB task for notable bus events (Listen, address changes…). */
extern void (*onEvent)(const char* ev, uint8_t addr, uint8_t reg);

}  // namespace adb
