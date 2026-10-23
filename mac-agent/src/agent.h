/* Shared declarations for the Platinum Agent (68k Mac side). */
#ifndef PLATINUM_AGENT_H
#define PLATINUM_AGENT_H

#include <stdint.h>
#include "protocol.h"

#define AGENT_MAJOR 0
#define AGENT_MINOR 1

/* serial.c */
enum { PORT_MODEM = 0, PORT_PRINTER = 1 };
short serial_open(int port, long baud);  /* returns an OSErr */
void serial_close(void);
long serial_read(uint8_t *buf, long max);
void serial_write(const uint8_t *p, long n);
int serial_is_open(void);

/* main.c / handlers.c */
void send_frame(uint8_t type, uint8_t seq, const uint8_t *payload, uint16_t len);
void send_reply(uint8_t req_type, uint8_t seq, const uint8_t *payload, uint16_t len);
void send_error(uint8_t seq, int code, const char *message);
void handle_frame(uint8_t type, uint8_t seq, const uint8_t *payload, uint16_t len, void *ctx);
void handlers_shutdown(void);

/* screen.c */
void screen_send(uint8_t req_type, uint8_t seq, int delta);
void screen_describe(uint16_t *w, uint16_t *h, uint16_t *depth);

/* logqueue.c: PDLog() messages from other programs, see pdebug/ */
void logqueue_install(void);
void logqueue_drain(void);
void logqueue_shutdown(void);

/* Small helpers shared by the modules. */
int trap_available(unsigned short trap);
void status_note(const char *what); /* last-activity line in the window */

/* PDLog relay state: LOGQ_OK, one of these, or an OSErr from NewGestalt. */
enum { LOGQ_OK = 1, LOGQ_NO_GESTALT = 2, LOGQ_FOREIGN = 3, LOGQ_NO_MEMORY = 4 };

typedef struct {
  unsigned long frames_in, frames_out, files, bad_frames, logs;
  unsigned long last_frame_ticks;
  short logq;
} AgentStats;
extern AgentStats g_stats;

#endif
