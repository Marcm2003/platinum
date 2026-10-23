/* pdebug: log from your own Retro68 programs to Platinum's Debugger console.
 *
 *   #include "pdebug.h"
 *   PDInit();
 *   PDLog("Hello from the Mac! x=%d", x);
 *   PDWarn("Low memory: %ld", FreeMem());
 *   PDHex("buffer", buf, 64);
 *
 * Add pdebug.c and ../src/protocol.c to your build. If Platinum Agent is running, messages
 * go through it; otherwise pdebug opens the Modem port itself at 57600 bps. */
#ifndef PDEBUG_H
#define PDEBUG_H

#ifdef __cplusplus
extern "C" {
#endif

void PDInit(void);
void PDLog(const char *fmt, ...);
void PDWarn(const char *fmt, ...);
void PDError(const char *fmt, ...);
void PDTrace(const char *fmt, ...);
void PDHex(const char *label, const void *data, long length);
void PDClose(void);

#ifdef __cplusplus
}
#endif

#endif
