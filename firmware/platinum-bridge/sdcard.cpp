#include "sdcard.h"

#include "config.h"

#if PIN_SD_CS >= 0
#include <SD.h>
#include <SPI.h>

namespace sdcard {

static SPIClass spi(FSPI);
static bool isMounted = false;
static bool lastIn = false;
static uint32_t changedMs = 0;

static bool cardIn() { return digitalRead(PIN_SD_DET) == LOW; }  // the socket's switch closes with a card in

static Change mount() {
  // 20 MHz: the lines run through a short FFC, so stay under the card's 25 MHz.
  isMounted = SD.begin(PIN_SD_CS, spi, 20000000, "/sd");
  return isMounted ? MOUNTED : FAILED;
}

bool present() { return true; }

Change begin() {
  pinMode(PIN_SD_DET, INPUT_PULLUP);  // the SD board has its own 10k too
  spi.begin(PIN_SD_SCK, PIN_SD_MISO, PIN_SD_MOSI, PIN_SD_CS);
  lastIn = cardIn();
  return lastIn ? mount() : NONE;
}

Change poll() {
  bool in = cardIn();
  if (in != lastIn) {
    lastIn = in;
    changedMs = millis();  // let the contacts settle before mounting
    if (!in && isMounted) {
      SD.end();
      isMounted = false;
      return REMOVED;
    }
    return NONE;
  }
  if (in && !isMounted && changedMs && millis() - changedMs > 300) {
    changedMs = 0;
    return mount();
  }
  return NONE;
}

bool mounted() { return isMounted; }
uint64_t totalBytes() { return isMounted ? SD.totalBytes() : 0; }
uint64_t usedBytes() { return isMounted ? SD.usedBytes() : 0; }

}  // namespace sdcard

#else

namespace sdcard {
bool present() { return false; }
Change begin() { return NONE; }
Change poll() { return NONE; }
bool mounted() { return false; }
uint64_t totalBytes() { return 0; }
uint64_t usedBytes() { return 0; }
}  // namespace sdcard

#endif
