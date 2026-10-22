// Mac 128K / 512K / Plus input: M0110A keyboard protocol + quadrature mouse.
#pragma once
#include <Arduino.h>

namespace m0110 {

void begin();
void end();
/** Queue a key transition using ADB virtual key codes (translated to M0110A codes). */
void key(uint8_t adbCode, bool down);
void mouse(int dx, int dy, bool button);
uint32_t commandsSeen();
uint32_t lastCommandMs();
void setInvert(bool x, bool y);

}  // namespace m0110
