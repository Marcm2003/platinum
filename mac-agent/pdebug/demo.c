/* PDebug Demo: logs a few messages to Platinum's Debugger console, then quits. */
#include <Events.h>
#include <Memory.h>
#include <Quickdraw.h>
#include "pdebug.h"

int main(void) {
  static const char greeting[] = "Hello, Platinum!";
  int i;
  InitGraf(&qd.thePort);
  PDInit();
  PDLog("PDebug Demo started");
  for (i = 1; i <= 3; i++) PDLog("Tick %d: %ld ticks since boot", i, TickCount());
  PDWarn("Free memory: %ld bytes", FreeMem());
  PDHex("greeting", greeting, sizeof greeting);
  PDError("This is what an error looks like");
  PDClose();
  return 0;
}
