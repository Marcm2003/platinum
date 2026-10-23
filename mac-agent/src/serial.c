/* The Mac's serial port through the Serial Driver (.AIn/.AOut for Modem, .BIn/.BOut for Printer). */
#include <Devices.h>
#include <Files.h>
#include <Memory.h>
#include <Serial.h>
#include <string.h>
#include "agent.h"

#define IN_BUFFER_SIZE 16384  /* the driver's default 64 bytes overflows at 57600 bps */

static short in_ref, out_ref;
static Ptr in_buffer;
static int open_flag;

static short baud_code(long baud) {
  switch (baud) {
    case 9600: return baud9600;
    case 19200: return baud19200;
    default: return baud57600;
  }
}

short serial_open(int port, long baud) {
  OSErr err;
  SerShk shk;
  short config = baud_code(baud) + data8 + stop10 + noParity;

  serial_close();
  err = OpenDriver(port == PORT_PRINTER ? "\p.BIn" : "\p.AIn", &in_ref);
  if (err == noErr) err = OpenDriver(port == PORT_PRINTER ? "\p.BOut" : "\p.AOut", &out_ref);
  if (err != noErr) return err;

  SerReset(in_ref, config);
  SerReset(out_ref, config);
  if (!in_buffer) in_buffer = NewPtr(IN_BUFFER_SIZE);
  if (in_buffer) SerSetBuf(in_ref, in_buffer, IN_BUFFER_SIZE);

  /* No XON/XOFF or CTS handshaking: the protocol is binary and frames carry a CRC. */
  shk.fXOn = 0; shk.fCTS = 0; shk.xOn = 0x11; shk.xOff = 0x13;
  shk.errs = 0; shk.evts = 0; shk.fInX = 0; shk.null = 0;
  SerHShake(out_ref, &shk);
  SerHShake(in_ref, &shk);
  open_flag = 1;
  return noErr;
}

static void kill_io(short ref) {
  ParamBlockRec pb;
  memset(&pb, 0, sizeof pb);
  pb.ioParam.ioRefNum = ref;
  PBKillIOSync(&pb);
}

void serial_close(void) {
  if (!open_flag) return;
  kill_io(in_ref);
  kill_io(out_ref);
  SerSetBuf(in_ref, NULL, 0);  /* give the driver back its own buffer before ours goes away */
  CloseDriver(in_ref);
  CloseDriver(out_ref);
  open_flag = 0;
}

int serial_is_open(void) { return open_flag; }

long serial_read(uint8_t *buf, long max) {
  long count = 0;
  if (!open_flag) return 0;
  if (SerGetBuf(in_ref, &count) != noErr || count <= 0) return 0;
  if (count > max) count = max;
  if (FSRead(in_ref, &count, buf) != noErr) return 0;
  return count;
}

void serial_write(const uint8_t *p, long n) {
  if (open_flag && n > 0) FSWrite(out_ref, &n, p);
}
