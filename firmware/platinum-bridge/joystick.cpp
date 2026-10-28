#include "joystick.h"
#include "config.h"

namespace joystick {

// The directions share one ADC pin: a 10 kΩ pull-up to 3.3 V, and each contact pulls it down
// through its own resistor (A 1 kΩ, B 3.3 kΩ, C 6.8 kΩ, D 15 kΩ), giving about 0.30, 0.82, 1.34
// and 1.98 V. These are the midpoints, in mV; above the last one nothing is pressed.
static const uint16_t LEVELS[4] = {560, 1080, 1660, 2640};

static const uint32_t SAMPLE_MS = 10, REPEAT_DELAY_MS = 450, REPEAT_MS = 150;

static Event fromAdc() {
#if PIN_JOY >= 0
  uint32_t mv = analogReadMilliVolts(PIN_JOY);
  for (int i = 0; i < 4; i++) {
    if (mv < LEVELS[i]) {
      switch (JOY_DIRS[i]) {
        case 'U': return UP;
        case 'D': return DOWN;
        case 'L': return LEFT;
        case 'R': return RIGHT;
      }
    }
  }
#endif
  return NONE;
}

bool present() { return PIN_JOY >= 0; }

void begin() {
  pinMode(PIN_BUTTON, INPUT_PULLUP);
#if PIN_JOY >= 0
  analogSetPinAttenuation(PIN_JOY, ADC_11db);
#endif
}

Event poll() {
  static uint32_t lastSample = 0, heldSince = 0, lastRepeat = 0;
  static Event candidate = NONE, held = NONE;
  uint32_t now = millis();
  if (now - lastSample < SAMPLE_MS) return NONE;
  lastSample = now;

  Event e = digitalRead(PIN_BUTTON) == LOW ? PRESS : fromAdc();
  // A reading counts once it's the same twice in a row (20 ms), which also rides out the
  // moment the knob passes between two contacts.
  if (e != candidate) { candidate = e; return NONE; }
  if (e != held) {
    held = e;
    heldSince = lastRepeat = now;
    return e;
  }
  if ((e == UP || e == DOWN) && now - heldSince > REPEAT_DELAY_MS && now - lastRepeat > REPEAT_MS) {
    lastRepeat = now;
    return e;
  }
  return NONE;
}

const char* name(Event e) {
  static const char* const names[] = {"none", "up", "down", "left", "right", "press"};
  return names[e];
}

}  // namespace joystick
