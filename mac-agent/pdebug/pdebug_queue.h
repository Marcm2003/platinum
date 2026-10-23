/* Shared between Platinum Agent and pdebug: a byte ring in the system heap, found through
   Gestalt selector 'PDbg'. Each record is [len u16][LOG payload], exactly the payload of a
   LOG frame (see docs/protocol.md), so the agent forwards it untouched.
   Cooperative multitasking means there's one writer or reader at a time; no locking needed. */
#ifndef PDEBUG_QUEUE_H
#define PDEBUG_QUEUE_H

#include <stdint.h>

#define PDBG_SELECTOR 0x50446267L  /* 'PDbg' */
#define PDBG_MAGIC 0x50444251L     /* 'PDBQ' */
#define PDBG_SIZE 8192

typedef struct {
  uint32_t magic;
  volatile uint16_t alive;  /* 1 while the agent is running and draining */
  volatile uint16_t head;   /* next write position */
  volatile uint16_t tail;   /* next read position */
  uint16_t dropped;
  uint8_t data[PDBG_SIZE];
} PDLogQueue;

static inline uint16_t pdq_used(const PDLogQueue *q) { return (uint16_t)((q->head - q->tail + PDBG_SIZE) % PDBG_SIZE); }
static inline uint16_t pdq_free(const PDLogQueue *q) { return (uint16_t)(PDBG_SIZE - 1 - pdq_used(q)); }

static inline void pdq_put(PDLogQueue *q, const uint8_t *p, uint16_t n) {
  while (n--) { q->data[q->head] = *p++; q->head = (uint16_t)((q->head + 1) % PDBG_SIZE); }
}
static inline void pdq_get(PDLogQueue *q, uint8_t *p, uint16_t n) {
  while (n--) { *p++ = q->data[q->tail]; q->tail = (uint16_t)((q->tail + 1) % PDBG_SIZE); }
}

#endif
