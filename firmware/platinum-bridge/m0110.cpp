// M0110A keyboard protocol (Mac 128K/512K/Plus) and quadrature mouse.
//
// Keyboard: the KEYBOARD generates the clock.
//   Mac → kbd: Mac pulls DATA low to request; kbd clocks 8 bits (low 180 µs / high 220 µs),
//              sampling DATA on the rising edge, MSB first.
//   kbd → Mac: kbd drives DATA and clocks 8 bits (low 160 µs / high 170 µs); Mac samples on rising edge.
//   Commands: 0x10 Inquiry (answer within 250 ms or 0x7B Null), 0x14 Instant, 0x16 Model, 0x36 Test (0x7D ACK).
//   Transitions: (code << 1) | 1, bit 7 set on release. Keypad/arrow keys are preceded by 0x79.
//
// Mouse: two quadrature channels per axis plus an active-low button, stepped by a 200 µs timer.

#include "m0110.h"
#include "config.h"
#include <driver/gpio.h>
#include <esp_timer.h>

namespace m0110 {

static TaskHandle_t task = nullptr;
static volatile bool running = false;
static uint8_t q[64];
static volatile uint8_t head = 0, tail = 0;
static uint32_t cmds = 0, lastCmd = 0;

static esp_timer_handle_t quadTimer = nullptr;
static volatile int32_t pendX = 0, pendY = 0;
static uint8_t phaseX = 0, phaseY = 0;
static bool invX = false, invY = false;
static const uint8_t GRAY[4][2] = {{0, 0}, {1, 0}, {1, 1}, {0, 1}};

static inline void clk(bool v) { gpio_set_level((gpio_num_t)PIN_KBD_CLK, v); }
static inline void dat(bool v) { gpio_set_level((gpio_num_t)PIN_KBD_DATA, v); }
static inline bool datIn() { return gpio_get_level((gpio_num_t)PIN_KBD_DATA); }

static void push(uint8_t v) {
  uint8_t n = (head + 1) % sizeof(q);
  if (n != tail) { q[head] = v; head = n; }
}
static bool pop(uint8_t& v) {
  if (head == tail) return false;
  v = q[tail]; tail = (tail + 1) % sizeof(q);
  return true;
}

static uint8_t receiveByte() {
  uint8_t v = 0;
  for (int i = 0; i < 8; i++) {
    clk(0); delayMicroseconds(180);
    clk(1); delayMicroseconds(80);
    v = (v << 1) | (datIn() ? 1 : 0);
    delayMicroseconds(140);
  }
  return v;
}

static void sendByte(uint8_t v) {
  for (int i = 7; i >= 0; i--) {
    dat((v >> i) & 1);
    delayMicroseconds(20);
    clk(0); delayMicroseconds(160);
    clk(1); delayMicroseconds(170);
  }
  dat(1);
}

static void kbdTask(void*) {
  for (;;) {
    if (!running || datIn()) { vTaskDelay(1); continue; }
    // Host is requesting to send a command.
    uint8_t cmd = receiveByte();
    uint32_t t0 = millis();
    while (!datIn() && millis() - t0 < 5) {}  // host releases DATA
    cmds++; lastCmd = millis();
    uint8_t out = 0x7B;  // Null
    switch (cmd) {
      case 0x10: {  // Inquiry: wait up to 250 ms for a key
        uint32_t start = millis();
        while (!pop(out) && millis() - start < 240) vTaskDelay(1);
        break;
      }
      case 0x14: if (!pop(out)) out = 0x7B; break;  // Instant
      case 0x16: head = tail = 0; out = 0x0B; break; // Model: M0110A
      case 0x36: out = 0x7D; break;                  // Test: ACK
      default: out = 0x7B; break;
    }
    sendByte(out);
  }
}

static void IRAM_ATTR quadStep(void*) {
  if (pendX) {
    int s = pendX > 0 ? 1 : -1;
    pendX -= s;
    phaseX = (phaseX + (invX ? -s : s)) & 3;
    gpio_set_level((gpio_num_t)PIN_MOUSE_X1, GRAY[phaseX][0]);
    gpio_set_level((gpio_num_t)PIN_MOUSE_X2, GRAY[phaseX][1]);
  }
  if (pendY) {
    int s = pendY > 0 ? 1 : -1;
    pendY -= s;
    phaseY = (phaseY + (invY ? -s : s)) & 3;
    gpio_set_level((gpio_num_t)PIN_MOUSE_Y1, GRAY[phaseY][0]);
    gpio_set_level((gpio_num_t)PIN_MOUSE_Y2, GRAY[phaseY][1]);
  }
}

void begin() {
  gpio_config_t od = {};
  od.pin_bit_mask = (1ULL << PIN_KBD_CLK) | (1ULL << PIN_KBD_DATA) | (1ULL << PIN_MOUSE_SW);
  od.mode = GPIO_MODE_INPUT_OUTPUT_OD;
  gpio_config(&od);
  clk(1); dat(1);
  gpio_set_level((gpio_num_t)PIN_MOUSE_SW, 1);

  gpio_config_t pp = {};
  pp.pin_bit_mask = (1ULL << PIN_MOUSE_X1) | (1ULL << PIN_MOUSE_X2) | (1ULL << PIN_MOUSE_Y1) | (1ULL << PIN_MOUSE_Y2);
  pp.mode = GPIO_MODE_OUTPUT;
  gpio_config(&pp);

  if (!quadTimer) {
    esp_timer_create_args_t a = {};
    a.callback = quadStep;
    a.name = "quad";
    esp_timer_create(&a, &quadTimer);
  }
  esp_timer_start_periodic(quadTimer, 200);
  running = true;
  if (!task) xTaskCreatePinnedToCore(kbdTask, "m0110", 4096, nullptr, configMAX_PRIORITIES - 2, &task, BUS_CORE);
}

void end() {
  running = false;
  if (quadTimer) esp_timer_stop(quadTimer);
}

static int arrowCode(uint8_t adb) {
  switch (adb) {
    case 0x3E: return 0x0D;  // up    → 0x1B
    case 0x3D: return 0x08;  // down  → 0x11
    case 0x3B: return 0x06;  // left  → 0x0D
    case 0x3C: return 0x02;  // right → 0x05
  }
  return -1;
}

void key(uint8_t adb, bool down) {
  uint8_t rel = down ? 0 : 0x80;
  if (adb == 0x7B) adb = 0x38;        // right shift → shift
  if (adb == 0x7C) adb = 0x3A;        // right option → option
  if (adb == 0x36 || adb == 0x7D) return;  // no Control key on the Plus keyboard
  int arrow = arrowCode(adb);
  if (arrow >= 0) { push(0x79); push(((arrow << 1) | 1) | rel); return; }
  if (adb >= 0x41 && adb <= 0x5C) { push(0x79); push((((adb - 0x40) << 1) | 1) | rel); return; }
  if (adb < 0x40) push(((adb << 1) | 1) | rel);
}

void mouse(int dx, int dy, bool button) {
  pendX = constrain(pendX + dx, -4000, 4000);
  pendY = constrain(pendY + dy, -4000, 4000);
  gpio_set_level((gpio_num_t)PIN_MOUSE_SW, button ? 0 : 1);
}

uint32_t commandsSeen() { return cmds; }
uint32_t lastCommandMs() { return lastCmd; }
void setInvert(bool x, bool y) { invX = x; invY = y; }

}  // namespace m0110
