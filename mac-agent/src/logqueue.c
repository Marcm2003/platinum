/* Receives PDLog() messages from other programs through a queue in the system heap and
   forwards them as LOG frames. The queue outlives the agent (Gestalt selectors can't be
   removed), so on quit it's only marked as not alive and reused on the next launch. */
#include <Gestalt.h>
#include <Memory.h>
#include <OSUtils.h>
#include <string.h>
#include "agent.h"
#include "../pdebug/pdebug_queue.h"

static PDLogQueue *queue;

/* A Gestalt function must stay valid after we quit, so it's a tiny 68k routine copied into
   the system heap that hands back the queue's address:
     MOVEA.L 4(SP),A0 ; MOVE.L #queue,(A0) ; MOVEA.L (SP)+,A1 ; ADDQ.L #8,SP ; CLR.W (SP) ; JMP (A1) */
static Ptr make_gestalt_stub(PDLogQueue *q) {
  static const uint8_t code[] = {
    0x20, 0x6F, 0x00, 0x04,              /* MOVEA.L 4(SP),A0 */
    0x20, 0xBC, 0, 0, 0, 0,              /* MOVE.L #q,(A0) */
    0x22, 0x5F,                          /* MOVEA.L (SP)+,A1 */
    0x50, 0x8F,                          /* ADDQ.L #8,SP */
    0x42, 0x57,                          /* CLR.W (SP) */
    0x4E, 0xD1                           /* JMP (A1) */
  };
  Ptr stub = NewPtrSys(sizeof code);
  if (!stub) return NULL;
  BlockMoveData((Ptr)code, stub, sizeof code);
  put32((uint8_t *)stub + 6, (uint32_t)(uintptr_t)q);
  if (trap_available(0xA0BD)) FlushCodeCache();
  return stub;
}

/* Multiversal's NewGestalt glue issues _Gestalt (A1AD) instead of _NewGestalt (A3AD), which just
   looks the selector up and returns gestaltUndefSelectorErr, so call the trap ourselves:
   D0 = selector, A0 = selector function; D0 = result. */
static OSErr new_gestalt(OSType selector, Ptr function) {
  register long d0 __asm__("%d0") = (long)selector;
  register Ptr a0 __asm__("%a0") = function;
  __asm__ volatile(".short 0xA3AD" : "+r"(d0), "+r"(a0) : : "d1", "d2", "a1", "cc", "memory");
  return (OSErr)d0;
}

void logqueue_install(void) {
  long addr = 0;
  OSErr err;
  if (!trap_available(0xA1AD)) { g_stats.logq = LOGQ_NO_GESTALT; return; }  /* before System 6.0.4 */

  if (Gestalt(PDBG_SELECTOR, &addr) == noErr && addr) {
    queue = (PDLogQueue *)addr;
    if (queue->magic != PDBG_MAGIC) { queue = NULL; g_stats.logq = LOGQ_FOREIGN; return; }
  } else {
    Ptr stub;
    queue = (PDLogQueue *)NewPtrSysClear(sizeof(PDLogQueue));
    if (!queue) { g_stats.logq = LOGQ_NO_MEMORY; return; }
    queue->magic = PDBG_MAGIC;
    stub = make_gestalt_stub(queue);
    err = stub ? new_gestalt(PDBG_SELECTOR, stub) : memFullErr;
    if (err != noErr) {
      DisposePtr((Ptr)queue);
      queue = NULL;
      g_stats.logq = err;
      return;
    }
  }
  g_stats.logq = LOGQ_OK;
  queue->head = queue->tail = 0;
  queue->alive = 1;
}

void logqueue_drain(void) {
  static uint8_t rec[1024];
  int budget = 16;  /* don't starve the event loop */
  if (!queue) return;
  while (budget-- && pdq_used(queue) >= 2) {
    uint8_t lenb[2];
    uint16_t n;
    pdq_get(queue, lenb, 2);
    n = get16(lenb);
    if (n > sizeof rec || n > pdq_used(queue)) { queue->tail = queue->head; break; }  /* corrupt: reset */
    pdq_get(queue, rec, n);
    send_frame(T_LOG, 0, rec, n);
    g_stats.logs++;
  }
}

void logqueue_shutdown(void) {
  if (queue) queue->alive = 0;
}
