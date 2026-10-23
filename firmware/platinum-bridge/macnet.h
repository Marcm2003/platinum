// Network for the Mac: the bridge behaves like a Hayes modem on the Mac's serial port, answers
// the Mac's PPP connection and routes it to the WiFi network with NAT. On the Mac, the PPP
// software of the time does the rest (MacPPP / FreePPP with MacTCP, or Remote Access with
// Open Transport); no driver of our own is needed.
#pragma once
#include <Arduino.h>

namespace macnet {

enum State : uint8_t {
  OFF,         // the serial port belongs to Platinum Agent
  COMMAND,     // modem command mode, waiting for AT commands or a PPP frame
  NEGOTIATING, // PPP link coming up
  ONLINE,      // the Mac has an IP address
};

/** Takes over the Mac's serial port. `log` reports to the app. */
void begin(HardwareSerial& port, void (*log)(const char* fmt, ...));
/** Hangs up and gives the serial port back. */
void end();
/** Bytes received from the Mac. */
void feed(const uint8_t* data, size_t len);
/** Housekeeping from loop(): restarts the link after the Mac hangs up. */
void loop();

State state();
const char* stateName();
String macAddress();   // the Mac's IP address once ONLINE
uint32_t bytesIn();    // from the Mac
uint32_t bytesOut();   // to the Mac

}  // namespace macnet
