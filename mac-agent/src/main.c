/* Platinum Agent: a small background-capable app that serves the Platinum protocol over the
   Mac's serial port. Runs on System 6.0.8 – Mac OS 9 (68k code, also fine on PowerPC). */
#include <Devices.h>
#include <Events.h>
#include <Fonts.h>
#include <Menus.h>
#include <OSUtils.h>
#include <Quickdraw.h>
#include <TextUtils.h>
#include <ToolUtils.h>
#include <Windows.h>
#include <stdio.h>
#include <string.h>
#include "agent.h"

enum { MENU_APPLE = 128, MENU_FILE, MENU_PORT };
enum { BAUD = 57600 };

AgentStats g_stats;
static FrameDecoder decoder;
static WindowPtr window;
static int port = PORT_MODEM;
static short port_err;
static char last_note[64] = "Waiting for Platinum\xC9";  /* \xC9 is "…" in MacRoman */
static int quitting, dirty = 1;
static MenuHandle port_menu;

/* ───────── Helpers ───────── */

int trap_available(unsigned short trap) {
  TrapType kind = (trap & 0x0800) ? kToolboxTrapType : kOSTrapType;
  if (kind == kToolboxTrapType && (trap & 0x07FF) >= 0x0200 &&
      NGetTrapAddress(0xA86E, kToolboxTrapType) == NGetTrapAddress(0xAA6E, kToolboxTrapType))
    return 0;  /* small trap table (Mac Plus/SE): high Toolbox traps don't exist */
  return NGetTrapAddress(trap, kind) != NGetTrapAddress(0xA89F, kToolboxTrapType);  /* _Unimplemented */
}

void status_note(const char *what) {
  strncpy(last_note, what, sizeof last_note - 1);
  dirty = 1;
}

/* ───────── Frames out ───────── */

void send_frame(uint8_t type, uint8_t seq, const uint8_t *payload, uint16_t len) {
  static uint8_t buf[MAX_PAYLOAD + FRAME_OVERHEAD];
  if (len > MAX_PAYLOAD) return;
  serial_write(buf, (long)frame_encode(buf, type, seq, payload, len));
  g_stats.frames_out++;
}

void send_reply(uint8_t req_type, uint8_t seq, const uint8_t *payload, uint16_t len) {
  send_frame((uint8_t)(req_type | T_REPLY), seq, payload, len);
}

void send_error(uint8_t seq, int code, const char *message) {
  uint8_t p[1 + 128];
  size_t n = strlen(message);
  if (n > 128) n = 128;
  p[0] = (uint8_t)(int8_t)(code < -128 ? -128 : code > 127 ? 127 : code);
  memcpy(p + 1, message, n);
  send_frame(T_ERROR, seq, p, (uint16_t)(n + 1));
  status_note(message);
}

/* ───────── Window ───────── */

static void draw_line(short y, const char *s) {
  Str255 p;
  size_t n = strlen(s);
  if (n > 255) n = 255;
  p[0] = (unsigned char)n;
  memcpy(p + 1, s, n);
  MoveTo(12, y);
  DrawString(p);
}

static void draw_status(void) {
  char line[96];
  GrafPtr saved;
  Rect r;
  unsigned long ago;

  GetPort(&saved);
  SetPort(window);
  r = window->portRect;
  EraseRect(&r);
  TextFont(0); TextSize(12);
  draw_line(20, "Platinum Agent " "0.1");
  TextFont(1); TextSize(9);
  if (port_err) sprintf(line, "%s port: can't open (error %d)", port == PORT_MODEM ? "Modem" : "Printer", port_err);
  else sprintf(line, "%s port, %d bps", port == PORT_MODEM ? "Modem" : "Printer", BAUD);
  draw_line(40, line);
  ago = g_stats.last_frame_ticks ? (TickCount() - g_stats.last_frame_ticks) / 60 : 0;
  if (!g_stats.last_frame_ticks) draw_line(54, "Not connected yet");
  else if (ago < 10) draw_line(54, "Connected to Platinum");
  else { sprintf(line, "Last request %lu s ago", ago); draw_line(54, line); }
  sprintf(line, "%lu requests, %lu frames sent, %lu files received", g_stats.frames_in, g_stats.frames_out, g_stats.files);
  draw_line(68, line);
  if (g_stats.logq == LOGQ_OK) sprintf(line, "PDLog relay on, %lu messages forwarded", g_stats.logs);
  else if (g_stats.logq == LOGQ_NO_GESTALT) sprintf(line, "PDLog relay off (needs System 6.0.4)");
  else sprintf(line, "PDLog relay off (error %d)", g_stats.logq);
  draw_line(82, line);
  draw_line(100, last_note);
  SetPort(saved);
  dirty = 0;
}

/* ───────── Menus ───────── */

static void open_port(int which) {
  port = which;
  port_err = serial_open(port, BAUD);
  CheckItem(port_menu, 1, port == PORT_MODEM);
  CheckItem(port_menu, 2, port == PORT_PRINTER);
  if (!port_err) send_frame(T_HELLO, 0, (const uint8_t *)"\x00\x01", 2);
  dirty = 1;
}

static void setup_menus(void) {
  MenuHandle apple = NewMenu(MENU_APPLE, "\p\x14");
  MenuHandle file = NewMenu(MENU_FILE, "\pFile");
  port_menu = NewMenu(MENU_PORT, "\pPort");
  AppendMenu(apple, "\pAbout Platinum Agent\xC9;(-");
  AppendResMenu(apple, 'DRVR');
  AppendMenu(file, "\pQuit/Q");
  AppendMenu(port_menu, "\pModem Port;Printer Port");
  InsertMenu(apple, 0);
  InsertMenu(file, 0);
  InsertMenu(port_menu, 0);
  DrawMenuBar();
}

static void do_menu(long choice) {
  short menu = HiWord(choice), item = LoWord(choice);
  if (menu == MENU_APPLE) {
    if (item == 1) status_note("github.com/Marcm2003/platinum \xA5 GPL-3.0");  /* \xA5 is a bullet in MacRoman */
    else { Str255 name; GetMenuItemText(GetMenuHandle(MENU_APPLE), item, name); OpenDeskAcc(name); }
  } else if (menu == MENU_FILE && item == 1) {
    quitting = 1;
  } else if (menu == MENU_PORT) {
    open_port(item == 2 ? PORT_PRINTER : PORT_MODEM);
  }
  HiliteMenu(0);
}

/* ───────── Events ───────── */

static void do_event(EventRecord *ev) {
  WindowPtr w;
  switch (ev->what) {
    case mouseDown:
      switch (FindWindow(ev->where, &w)) {
        case inMenuBar: do_menu(MenuSelect(ev->where)); break;
        case inSysWindow: SystemClick(ev, w); break;
        case inDrag: DragWindow(w, ev->where, &qd.screenBits.bounds); break;
        case inGoAway: if (TrackGoAway(w, ev->where)) quitting = 1; break;
        case inContent: if (w != FrontWindow()) SelectWindow(w); break;
      }
      break;
    case keyDown:
    case autoKey:
      if (ev->modifiers & cmdKey) do_menu(MenuKey((char)(ev->message & charCodeMask)));
      break;
    case updateEvt:
      BeginUpdate((WindowPtr)ev->message);
      draw_status();
      EndUpdate((WindowPtr)ev->message);
      break;
  }
}

static void poll_serial(void) {
  static uint8_t buf[1024];
  long n;
  int rounds = 8;
  while (rounds-- && (n = serial_read(buf, sizeof buf)) > 0)
    decoder_push(&decoder, buf, (size_t)n, handle_frame, NULL);
  if (decoder.bad_frames != g_stats.bad_frames) { g_stats.bad_frames = decoder.bad_frames; dirty = 1; }
}

int main(void) {
  Rect bounds;
  EventRecord ev;
  unsigned long last_draw = 0, last_in = 0;

  InitGraf(&qd.thePort);
  InitFonts();
  InitWindows();
  InitMenus();
  TEInit();
  InitDialogs(NULL);
  InitCursor();
  FlushEvents(everyEvent, 0);

  setup_menus();
  SetRect(&bounds, 40, 60, 40 + 320, 60 + 110);
  window = NewWindow(NULL, &bounds, "\pPlatinum Agent", true, noGrowDocProc, (WindowPtr)-1, true, 0);

  decoder_init(&decoder);
  logqueue_install();
  open_port(PORT_MODEM);

  while (!quitting) {
    /* Sleep one tick: short enough to keep up with 57600 bps, kind to other apps. */
    if (WaitNextEvent(everyEvent, &ev, 1, NULL)) do_event(&ev);
    poll_serial();
    logqueue_drain();
    if (g_stats.frames_in + g_stats.logs != last_in) { last_in = g_stats.frames_in + g_stats.logs; dirty = 1; }
    if (dirty && TickCount() - last_draw > 20) { draw_status(); last_draw = TickCount(); }
  }

  logqueue_shutdown();
  handlers_shutdown();
  serial_close();
  return 0;
}
