// The microSD card on the Platinum Bridge PCB rev C (an SD board under the main board, SPI mode).
// Mounted at /sd when a card goes in, unmounted when it comes out.
#pragma once
#include <Arduino.h>

namespace sdcard {

enum Change : uint8_t { NONE, MOUNTED, REMOVED, FAILED };

bool present();   // the board has a card slot
Change begin();
/** Call every loop: watches the detect switch. */
Change poll();
bool mounted();
uint64_t totalBytes();
uint64_t usedBytes();

}  // namespace sdcard
