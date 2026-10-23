/* Request handlers: sysinfo, file transfer into "Platinum Inbox", peek/poke, launch, list. */
#include <Files.h>
#include <Gestalt.h>
#include <Memory.h>
#include <OSUtils.h>
#include <Processes.h>
#include <string.h>
#include "agent.h"

enum { launchNoFileFlags_ = 0x0800 };

static short inbox_vref;
static long inbox_dir;
enum { fsRtDirID_ = 2 };  /* root directory ID */
static short data_ref, rsrc_ref;  /* the file being received, 0 when none */

/* ───────── Helpers ───────── */

static long gestalt_or(OSType selector, long fallback) {
  long v;
  if (trap_available(0xA1AD) && Gestalt(selector, &v) == noErr) return v;
  return fallback;
}

/* Copies a length-prefixed name from the payload into a Str255; returns bytes consumed. */
static int read_pstring(const uint8_t *p, uint16_t avail, Str255 out) {
  int n = avail ? p[0] : 0;
  if (n > 31) n = 31;
  if (n + 1 > avail) n = avail ? avail - 1 : 0;
  out[0] = (unsigned char)n;
  memcpy(out + 1, p + 1, (size_t)n);
  return n + 1;
}

/* "Platinum Inbox" at the root of the startup volume, created on first use. */
static OSErr find_inbox(void) {
  SysEnvRec env;
  WDPBRec wd;
  HParamBlockRec pb;
  CInfoPBRec ci;
  OSErr err;
  static unsigned char name[] = "\pPlatinum Inbox";

  if (inbox_dir) return noErr;
  SysEnvirons(1, &env);
  memset(&wd, 0, sizeof wd);
  wd.ioVRefNum = env.sysVRefNum;
  if (PBGetWDInfoSync(&wd) == noErr) inbox_vref = wd.ioWDVRefNum;
  else inbox_vref = env.sysVRefNum;

  memset(&pb, 0, sizeof pb);
  pb.fileParam.ioNamePtr = name;
  pb.fileParam.ioVRefNum = inbox_vref;
  pb.fileParam.ioDirID = fsRtDirID_;
  err = PBDirCreateSync(&pb);
  if (err == noErr) { inbox_dir = pb.fileParam.ioDirID; return noErr; }
  if (err != dupFNErr) return err;

  memset(&ci, 0, sizeof ci);
  ci.dirInfo.ioNamePtr = name;
  ci.dirInfo.ioVRefNum = inbox_vref;
  ci.dirInfo.ioDrDirID = fsRtDirID_;
  err = PBGetCatInfoSync(&ci);
  if (err == noErr) inbox_dir = ci.dirInfo.ioDrDirID;
  return err;
}

static void close_incoming(void) {
  if (data_ref) FSClose(data_ref);
  if (rsrc_ref) FSClose(rsrc_ref);
  data_ref = rsrc_ref = 0;
}

/* ───────── Requests ───────── */

static void do_sysinfo(uint8_t seq) {
  uint8_t r[22];
  SysEnvRec env;
  uint16_t w, h, depth;

  SysEnvirons(1, &env);
  screen_describe(&w, &h, &depth);
  put32(r + 0, (uint32_t)gestalt_or(gestaltMachineType, env.machineType));
  put16(r + 4, (uint16_t)gestalt_or(gestaltSystemVersion, env.systemVersion));
  put32(r + 6, (uint32_t)gestalt_or(gestaltPhysicalRAMSize, 0));
  put16(r + 10, w);
  put16(r + 12, h);
  put16(r + 14, depth);
  r[16] = AGENT_MAJOR;
  r[17] = AGENT_MINOR;
  put32(r + 18, (uint32_t)FreeMem());
  send_reply(T_SYSINFO, seq, r, sizeof r);
}

static void do_file_begin(uint8_t seq, const uint8_t *p, uint16_t len) {
  Str255 name;
  OSType type, creator;
  uint16_t flags;
  uint32_t data_len, rsrc_len;
  HParamBlockRec pb;
  OSErr err;

  if (len < 19) { send_error(seq, -50, "FILE_BEGIN too short"); return; }
  close_incoming();
  if ((err = find_inbox()) != noErr) { send_error(seq, err, "Can't open Platinum Inbox"); return; }

  type = (OSType)get32(p); creator = (OSType)get32(p + 4);
  flags = get16(p + 8);
  data_len = get32(p + 10); rsrc_len = get32(p + 14);
  read_pstring(p + 18, (uint16_t)(len - 18), name);

  HDelete(inbox_vref, inbox_dir, name);  /* replace any earlier copy */
  err = HCreate(inbox_vref, inbox_dir, name, creator, type);
  if (err == noErr) {
    memset(&pb, 0, sizeof pb);
    pb.fileParam.ioNamePtr = name;
    pb.fileParam.ioVRefNum = inbox_vref;
    pb.fileParam.ioDirID = inbox_dir;
    if (PBHGetFInfoSync(&pb) == noErr) {
      pb.fileParam.ioFlFndrInfo.fdFlags = (short)(flags & ~0x0100);  /* let the Finder place it */
      pb.fileParam.ioDirID = inbox_dir;
      PBHSetFInfoSync(&pb);
    }
    err = HOpen(inbox_vref, inbox_dir, name, fsRdWrPerm, &data_ref);
  }
  if (err == noErr) err = HOpenRF(inbox_vref, inbox_dir, name, fsRdWrPerm, &rsrc_ref);
  if (err == noErr) err = SetEOF(data_ref, (long)data_len);
  if (err == noErr) err = SetEOF(rsrc_ref, (long)rsrc_len);
  if (err != noErr) {
    close_incoming();
    send_error(seq, err, err == dskFulErr ? "The disk is full" : "Can't create the file");
    return;
  }
  status_note("Receiving a file");
  send_reply(T_FILE_BEGIN, seq, NULL, 0);
}

static void do_file_data(uint8_t seq, const uint8_t *p, uint16_t len) {
  short ref;
  long count;
  OSErr err;

  if (len < 5) { send_error(seq, -50, "FILE_DATA too short"); return; }
  ref = p[0] ? rsrc_ref : data_ref;
  if (!ref) { send_error(seq, -51, "No file is open"); return; }
  count = len - 5;
  err = SetFPos(ref, fsFromStart, (long)get32(p + 1));
  if (err == noErr) err = FSWrite(ref, &count, p + 5);
  if (err != noErr) { send_error(seq, err, "Write failed"); return; }
  send_reply(T_FILE_DATA, seq, NULL, 0);
}

static void do_file_end(uint8_t seq) {
  close_incoming();
  FlushVol(NULL, inbox_vref);
  g_stats.files++;
  status_note("File received");
  send_reply(T_FILE_END, seq, NULL, 0);
}

static void do_peek(uint8_t seq, const uint8_t *p, uint16_t len) {
  static uint8_t out[512];
  uint16_t n;
  if (len < 6) { send_error(seq, -50, "PEEK too short"); return; }
  n = get16(p + 4);
  if (n > sizeof out) n = sizeof out;
  BlockMoveData((Ptr)(uintptr_t)get32(p), (Ptr)out, n);
  send_reply(T_PEEK, seq, out, n);
}

static void do_poke(uint8_t seq, const uint8_t *p, uint16_t len) {
  if (len < 4) { send_error(seq, -50, "POKE too short"); return; }
  BlockMoveData((Ptr)(p + 4), (Ptr)(uintptr_t)get32(p), len - 4);
  status_note("Memory written");
  send_reply(T_POKE, seq, NULL, 0);
}

static void do_launch(uint8_t seq, const uint8_t *p, uint16_t len) {
  Str255 name;
  FSSpec spec;
  LaunchParamBlockRec lp;
  OSErr err;

  if (gestalt_or(gestaltSystemVersion, 0) < 0x0700) { send_error(seq, -1, "Launching needs System 7"); return; }
  if ((err = find_inbox()) != noErr) { send_error(seq, err, "Can't open Platinum Inbox"); return; }
  read_pstring(p, len, name);
  err = FSMakeFSSpec(inbox_vref, inbox_dir, name, &spec);
  if (err == noErr) {
    memset(&lp, 0, sizeof lp);
    lp.launchBlockID = extendedBlock;
    lp.launchEPBLength = sizeof lp - 12;  /* extendedBlockLen */
    lp.launchControlFlags = launchContinue | launchNoFileFlags_;
    lp.launchAppSpec = &spec;
    err = LaunchApplication(&lp);
  }
  if (err != noErr) { send_error(seq, err, "Launch failed"); return; }
  status_note("Launched an app");
  send_reply(T_LAUNCH, seq, NULL, 0);
}

static void do_list(uint8_t seq) {
  static uint8_t out[MAX_PAYLOAD];
  Str255 name;
  CInfoPBRec ci;
  uint16_t o = 0;
  short i;
  OSErr err;

  if ((err = find_inbox()) != noErr) { send_error(seq, err, "Can't open Platinum Inbox"); return; }
  for (i = 1;; i++) {
    memset(&ci, 0, sizeof ci);
    ci.hFileInfo.ioNamePtr = name;
    ci.hFileInfo.ioVRefNum = inbox_vref;
    ci.hFileInfo.ioDirID = inbox_dir;
    ci.hFileInfo.ioFDirIndex = i;
    if (PBGetCatInfoSync(&ci) != noErr) break;
    if (ci.hFileInfo.ioFlAttrib & 0x10) continue;  /* a folder */
    if (o + 13 + name[0] > sizeof out) break;
    put32(out + o, (uint32_t)ci.hFileInfo.ioFlFndrInfo.fdType);
    put32(out + o + 4, (uint32_t)ci.hFileInfo.ioFlFndrInfo.fdCreator);
    put32(out + o + 8, (uint32_t)(ci.hFileInfo.ioFlLgLen + ci.hFileInfo.ioFlRLgLen));
    memcpy(out + o + 12, name, (size_t)name[0] + 1);
    o += 13 + name[0];
  }
  send_reply(T_LIST, seq, out, o);
}

/* ───────── Dispatch ───────── */

void handle_frame(uint8_t type, uint8_t seq, const uint8_t *p, uint16_t len, void *ctx) {
  (void)ctx;
  g_stats.frames_in++;
  g_stats.last_frame_ticks = TickCount();
  switch (type) {
    case T_PING: send_reply(T_PING, seq, NULL, 0); break;
    case T_SYSINFO: do_sysinfo(seq); break;
    case T_FILE_BEGIN: do_file_begin(seq, p, len); break;
    case T_FILE_DATA: do_file_data(seq, p, len); break;
    case T_FILE_END: do_file_end(seq); break;
    case T_SCREEN_FULL: screen_send(T_SCREEN_FULL, seq, 0); break;
    case T_SCREEN_DELTA: screen_send(T_SCREEN_DELTA, seq, 1); break;
    case T_PEEK: do_peek(seq, p, len); break;
    case T_POKE: do_poke(seq, p, len); break;
    case T_LAUNCH: do_launch(seq, p, len); break;
    case T_LIST: do_list(seq); break;
    default: send_error(seq, -4, "Unknown request"); break;
  }
}

void handlers_shutdown(void) { close_incoming(); }
