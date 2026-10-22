// ADB device side, bit-banged.
//
// Bus timing (Apple "ADB Device Specification"):
//   Attention  host low ~800 µs        Reset      host low ≥ 3 ms
//   Sync       high ~65 µs             Bit cell   100 µs: '0' = 65 low/35 high, '1' = 35 low/65 high
//   Command    8 bits + stop bit '0'   Tlt        140–260 µs stop-to-start
//   Data       start bit '1', 2–8 bytes, stop bit '0'
//   SRQ        device stretches the command stop bit low to ~300 µs
//
// A falling-edge interrupt wakes a high-priority task pinned to core 1; the task
// then polls the line with µs timing. WiFi/BT run on core 0.

#include "adb.h"
#include "config.h"
#include <driver/gpio.h>
#include <esp_timer.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>

namespace adb {

void (*onEvent)(const char*, uint8_t, uint8_t) = nullptr;

static TaskHandle_t task = nullptr;
static portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;
static volatile bool running = false;

// Device state
static uint8_t kbdAddr = ADB_KBD_ADDR, mouseAddr = ADB_MOUSE_ADDR;
static uint8_t kbdHandler = ADB_KBD_HANDLER, mouseHandler = ADB_MOUSE_HANDLER;
static bool kbdSrq = true, mouseSrq = true;
static uint8_t modifiers = 0xFF;  // Talk R2 byte 0, active low

// Key queue (single producer: link task; single consumer: ADB task)
static uint8_t keyq[64];
static volatile uint8_t kHead = 0, kTail = 0;

// Mouse accumulators
static volatile int32_t mdx = 0, mdy = 0;
static volatile bool mbtn = false, mbtnSent = false;

static Stats st = {};

static inline int64_t now() { return esp_timer_get_time(); }
static inline bool line() { return gpio_get_level((gpio_num_t)PIN_ADB_DATA); }
static inline void low() { gpio_set_level((gpio_num_t)PIN_ADB_DATA, 0); }
static inline void release() { gpio_set_level((gpio_num_t)PIN_ADB_DATA, 1); }

static inline void waitUntil(int64_t t) { while (now() < t) {} }

/** Wait for the line to reach `level`; returns the time, or -1 on timeout. */
static int64_t waitLevel(bool level, int64_t timeoutUs) {
  int64_t end = now() + timeoutUs;
  while (line() != level) if (now() > end) return -1;
  return now();
}

static bool kbdHasData() { return kHead != kTail; }
static bool mouseHasData() { return mdx != 0 || mdy != 0 || mbtn != mbtnSent; }

// ───────── Transmit (device → host) ─────────

static void sendBit(bool one) {
  int64_t t = now();
  low();
  waitUntil(t + (one ? 35 : 65));
  release();
  waitUntil(t + 100);
}

static void sendPacket(const uint8_t* data, int n) {
  portENTER_CRITICAL(&mux);
  sendBit(true);  // start bit
  for (int i = 0; i < n; i++)
    for (int b = 7; b >= 0; b--) sendBit((data[i] >> b) & 1);
  sendBit(false);  // stop bit
  portEXIT_CRITICAL(&mux);
}

// ───────── Receive (host → device) ─────────

/** Read one bit cell starting at the falling edge; returns 0/1 or -1. */
static int readBit(int64_t timeoutUs) {
  int64_t fall = waitLevel(false, timeoutUs);
  if (fall < 0) return -1;
  int64_t rise = waitLevel(true, 130);
  if (rise < 0) return -1;
  return (rise - fall) < 50 ? 1 : 0;
}

static int readData(uint8_t* out, int maxBytes) {
  // Host starts its data packet Tlt (140–260 µs) after the command stop bit.
  if (readBit(400) != 1) return -1;  // start bit
  int n = 0;
  for (; n < maxBytes; n++) {
    uint8_t v = 0;
    for (int b = 0; b < 8; b++) {
      int bit = readBit(n == 0 && b == 0 ? 140 : 140);
      if (bit < 0) return n;  // stop bit / end
      v = (v << 1) | bit;
    }
    out[n] = v;
  }
  return n;
}

// ───────── Registers ─────────

static int talkKeyboard(uint8_t reg, uint8_t* out) {
  if (reg == 0) {
    if (!kbdHasData()) return 0;
    uint8_t a = keyq[kTail]; kTail = (kTail + 1) % sizeof(keyq);
    uint8_t b = 0xFF;
    if (a == 0x7F || a == 0xFF) b = a;  // power key is sent as 7F7F / FFFF
    else if (kbdHasData() && keyq[kTail] != 0x7F && keyq[kTail] != 0xFF) { b = keyq[kTail]; kTail = (kTail + 1) % sizeof(keyq); }
    out[0] = a; out[1] = b;
    return 2;
  }
  if (reg == 2) { out[0] = modifiers; out[1] = 0xFF; return 2; }
  if (reg == 3) { out[0] = 0x40 | (kbdSrq ? 0x20 : 0) | (esp_random() & 0x0F); out[1] = kbdHandler; return 2; }
  return 0;
}

static int talkMouse(uint8_t reg, uint8_t* out) {
  if (reg == 0) {
    if (!mouseHasData()) return 0;
    int dx, dy; bool btn;
    portENTER_CRITICAL(&mux);
    dx = constrain(mdx, -63, 63); dy = constrain(mdy, -63, 63);
    mdx -= dx; mdy -= dy; btn = mbtn;
    portEXIT_CRITICAL(&mux);
    mbtnSent = btn;
    out[0] = (btn ? 0x00 : 0x80) | (dy & 0x7F);
    out[1] = 0x80 | (dx & 0x7F);
    return 2;
  }
  if (reg == 3) { out[0] = 0x40 | (mouseSrq ? 0x20 : 0) | (esp_random() & 0x0F); out[1] = mouseHandler; return 2; }
  return 0;
}

static void listenR3(bool isKbd, const uint8_t* d) {
  uint8_t newAddr = d[0] & 0x0F, handler = d[1];
  if (handler == 0xFE) {  // move to a new address
    if (isKbd) kbdAddr = newAddr; else mouseAddr = newAddr;
    if (onEvent) onEvent("move", newAddr, 3);
  } else if (handler == 0x00 || handler == 0xFD || handler == 0xFF) {
    // self-test / activator modes: ignore
  } else if (isKbd && (handler == 2 || handler == 3)) {
    kbdHandler = handler;
  } else if (!isKbd && (handler == 1 || handler == 2 || handler == 4)) {
    mouseHandler = handler == 4 ? 2 : handler;  // no extended protocol: stay compatible
  }
  if (isKbd) kbdSrq = d[0] & 0x20; else mouseSrq = d[0] & 0x20;
}

static void resetDevices() {
  kbdAddr = ADB_KBD_ADDR; mouseAddr = ADB_MOUSE_ADDR;
  kbdHandler = ADB_KBD_HANDLER; mouseHandler = ADB_MOUSE_HANDLER;
  kbdSrq = mouseSrq = true;
  kHead = kTail = 0;
  mdx = mdy = 0;
}

// ───────── Main loop ─────────

static void IRAM_ATTR onFall(void*) {
  BaseType_t woken = pdFALSE;
  if (task) vTaskNotifyGiveFromISR(task, &woken);
  if (woken) portYIELD_FROM_ISR();
}

static void transaction() {
  int64_t fall = now();
  if (line()) return;  // glitch
  int64_t rise = waitLevel(true, 4000);
  if (rise < 0) { waitLevel(true, 100000); resetDevices(); if (onEvent) onEvent("reset", 0, 0); return; }
  int64_t lowFor = rise - fall;
  if (lowFor >= 2800) { resetDevices(); if (onEvent) onEvent("reset", 0, 0); return; }
  if (lowFor < 500) return;  // not an attention signal (probably someone else's data)

  // Command byte
  uint8_t cmd = 0;
  for (int b = 0; b < 8; b++) {
    int bit = readBit(200);
    if (bit < 0) return;
    cmd = (cmd << 1) | bit;
  }
  // Stop bit — stretch it for a service request if we have data and aren't being asked.
  int64_t stopFall = waitLevel(false, 200);
  if (stopFall < 0) return;
  uint8_t addr = cmd >> 4, type = (cmd >> 2) & 3, reg = cmd & 3;
  bool forKbd = addr == kbdAddr, forMouse = addr == mouseAddr;
  bool wantSrq = (kbdSrq && kbdHasData() && !(forKbd && type == 3 && reg == 0)) ||
                 (mouseSrq && mouseHasData() && !(forMouse && type == 3 && reg == 0));
  if (wantSrq) {
    waitUntil(stopFall + 60);
    low();
    waitUntil(stopFall + 300);
    release();
  }
  if (waitLevel(true, 400) < 0) return;
  int64_t stopEnd = now();

  st.lastTalkMs = millis();
  if (type == 3) {
    st.talks++;
    uint8_t out[8];
    int n = forKbd ? talkKeyboard(reg, out) : forMouse ? talkMouse(reg, out) : 0;
    if (n) {
      st.ourTalks++;
      waitUntil(stopEnd + 180);  // Tlt
      if (line()) sendPacket(out, n);
    }
  } else if (type == 2 && (forKbd || forMouse)) {
    uint8_t d[8];
    int n = readData(d, 8);
    if (n >= 2 && reg == 3) listenR3(forKbd, d);
    if (onEvent) onEvent("listen", addr, reg);
  } else if (type == 0 && reg == 0) {  // SendReset
    resetDevices();
  } else if (type == 0 && reg == 1) {  // Flush
    if (forKbd) kHead = kTail = 0;
    if (forMouse) { mdx = mdy = 0; }
  }
}

static void adbTask(void*) {
  for (;;) {
    ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(50));
    if (!running) continue;
    if (!line()) {
      gpio_intr_disable((gpio_num_t)PIN_ADB_DATA);
      transaction();
      ulTaskNotifyTake(pdTRUE, 0);  // drop edges caused by our own traffic
      gpio_intr_enable((gpio_num_t)PIN_ADB_DATA);
    }
  }
}

void begin() {
  gpio_config_t io = {};
  io.pin_bit_mask = 1ULL << PIN_ADB_DATA;
  io.mode = GPIO_MODE_INPUT_OUTPUT_OD;
  io.pull_up_en = GPIO_PULLUP_DISABLE;  // the Mac (and the level shifter) pull the bus up
  io.intr_type = GPIO_INTR_NEGEDGE;
  gpio_config(&io);
  release();
  gpio_install_isr_service(0);
  gpio_isr_handler_add((gpio_num_t)PIN_ADB_DATA, onFall, nullptr);
  resetDevices();
  running = true;
  if (!task) xTaskCreatePinnedToCore(adbTask, "adb", 4096, nullptr, configMAX_PRIORITIES - 1, &task, 1);
}

void end() {
  running = false;
  gpio_isr_handler_remove((gpio_num_t)PIN_ADB_DATA);
  release();
}

static void updateModifiers(uint8_t code, bool down) {
  int bit = -1;
  switch (code) {
    case 0x37: bit = 0; break;              // command
    case 0x3A: case 0x7C: bit = 1; break;   // option
    case 0x38: case 0x7B: bit = 2; break;   // shift
    case 0x36: case 0x7D: bit = 3; break;   // control
    case 0x39: bit = 5; break;              // caps lock
    case 0x33: bit = 6; break;              // delete
  }
  if (bit < 0) return;
  if (down) modifiers &= ~(1 << bit); else modifiers |= (1 << bit);
}

void key(uint8_t code, bool down) {
  updateModifiers(code, down);
  uint8_t v = code == 0x7F ? (down ? 0x7F : 0xFF) : (code & 0x7F) | (down ? 0 : 0x80);
  uint8_t next = (kHead + 1) % sizeof(keyq);
  if (next == kTail) return;  // full: drop
  keyq[kHead] = v;
  kHead = next;
}

void mouse(int dx, int dy, bool button) {
  portENTER_CRITICAL(&mux);
  mdx = constrain(mdx + dx, -2000, 2000);
  mdy = constrain(mdy + dy, -2000, 2000);
  mbtn = button;
  portEXIT_CRITICAL(&mux);
}

Stats stats() {
  Stats s = st;
  s.kbdAddr = kbdAddr;
  s.mouseAddr = mouseAddr;
  return s;
}

}  // namespace adb
