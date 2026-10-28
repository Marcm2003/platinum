// The front-panel controls: the BOOT button on every board, and on the Platinum Bridge PCB a
// 5-way joystick whose centre press is that same button.
#pragma once
#include <Arduino.h>

namespace joystick {

enum Event : uint8_t { NONE, UP, DOWN, LEFT, RIGHT, PRESS };

bool present();  // the board has the four directions, not just the button
void begin();
/** Call every loop: at most one event per call. Up and down repeat while held. */
Event poll();
const char* name(Event e);

}  // namespace joystick
