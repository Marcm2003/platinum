// Platinum Bridge — board profiles, pin map and constants.
// Keep in sync with src/lib/hardware/boards.ts in the desktop app.
//
// The chip is detected automatically. Boards that share a chip are told apart with a define,
// which the app passes when it compiles:
//   arduino-cli compile --build-property "compiler.cpp.extra_flags=-DPLATINUM_BOARD_ESP32C3_OLED" …
#pragma once

#define FW_VERSION "0.5.0"
#define FW_NAME "Platinum Bridge"

// Optional SSD1306 OLED. DISPLAY_W×DISPLAY_H is the visible area; boards without a built-in
// screen probe for an external 128×64 one on PIN_I2C_SDA/SCL and run headless if there's none.
#define DISPLAY_NONE 0
#define DISPLAY_SSD1306_72X40 1   // 0.42" OLED built into ESP32-C3 "OLED" boards
#define DISPLAY_SSD1306_128X64 2  // the common 0.96" module

#if CONFIG_IDF_TARGET_ESP32S3 && (defined(PLATINUM_BOARD_PCB_V2) || defined(PLATINUM_BOARD_PCB_V3))
  // The Platinum Bridge PCB, rev B: the rev A pinout, with the screen, LED and a 5-way joystick
  // on a front board. The joystick's centre press is BOOT; its four directions pull PIN_JOY to
  // different voltages through a resistor ladder (see joystick.cpp). The OLED sits upright.
  // Rev C adds a microSD card on a board of its own, over an FFC, in SPI mode.
  #if defined(PLATINUM_BOARD_PCB_V3)
    #define BOARD_ID "pcb-v3"
    #define PIN_SD_SCK   39
    #define PIN_SD_MOSI  40
    #define PIN_SD_MISO  41
    #define PIN_SD_CS    42
    #define PIN_SD_DET   2   // low with a card in
  #else
    #define BOARD_ID "pcb-v2"
  #endif
  #define PIN_ADB_DATA   4
  #define PIN_ADB_PSW    5
  #define PIN_KBD_CLK    4
  #define PIN_KBD_DATA   5
  #define PIN_SER_TX     17
  #define PIN_SER_RX     18
  #define PIN_MOUSE_X1   12
  #define PIN_MOUSE_X2   13
  #define PIN_MOUSE_Y1   14
  #define PIN_MOUSE_Y2   15
  #define PIN_MOUSE_SW   16
  #define PIN_HSK_CLK    21
  #define PIN_LED        48  // WS2812B-2020 behind the light pipe
  #define LED_IS_RGB     1
  #define LED_ACTIVE_LOW 0
  #define PIN_I2C_SDA    8
  #define PIN_I2C_SCL    9
  #define PIN_BUTTON     0   // joystick centre press
  #define PIN_JOY        6   // joystick directions (ADC1)
  #define JOY_DIRS       "URDL"  // the direction of the switch's A, B, C and D contacts as fitted
  #define DISPLAY_KIND   DISPLAY_SSD1306_128X64
  #define DISPLAY_ROTATE_180 0

#elif CONFIG_IDF_TARGET_ESP32S3 && defined(PLATINUM_BOARD_PCB_V1)
  // The Platinum Bridge PCB (hardware/pcb, rev A): an ESP32-S3-WROOM-1 with every Mac signal on
  // one HD-15. Like the C3 boards, ADB and the M0110 keyboard share two lines (BUS1/BUS2), and
  // the OLED module sits upside down so its header stays clear of the antenna.
  #define BOARD_ID "pcb-v1"
  #define PIN_ADB_DATA   4
  #define PIN_ADB_PSW    5
  #define PIN_KBD_CLK    4
  #define PIN_KBD_DATA   5
  #define PIN_SER_TX     17
  #define PIN_SER_RX     18
  #define PIN_MOUSE_X1   12
  #define PIN_MOUSE_X2   13
  #define PIN_MOUSE_Y1   14
  #define PIN_MOUSE_Y2   15
  #define PIN_MOUSE_SW   16
  #define PIN_HSK_CLK    21  // HSKi: external serial clock for 230.4 kbps (not used yet)
  #define PIN_LED        48  // WS2812B
  #define LED_IS_RGB     1
  #define LED_ACTIVE_LOW 0
  #define PIN_I2C_SDA    8
  #define PIN_I2C_SCL    9
  #define PIN_BUTTON     0   // BOOT / PAGE
  #define DISPLAY_KIND   DISPLAY_SSD1306_128X64
  #define DISPLAY_ROTATE_180 1

#elif CONFIG_IDF_TARGET_ESP32S3
  // ESP32-S3-DevKitC-1: dual core, native USB, RGB LED.
  #define BOARD_ID "esp32s3"
  #define PIN_ADB_DATA   4
  #define PIN_ADB_PSW    5
  #define PIN_SER_TX     17
  #define PIN_SER_RX     18
  #define PIN_KBD_CLK    10
  #define PIN_KBD_DATA   11
  #define PIN_MOUSE_X1   12
  #define PIN_MOUSE_X2   13
  #define PIN_MOUSE_Y1   14
  #define PIN_MOUSE_Y2   15
  #define PIN_MOUSE_SW   16
  #define PIN_LED        48
  #define LED_IS_RGB     1
  #define LED_ACTIVE_LOW 0
  #define PIN_I2C_SDA    8
  #define PIN_I2C_SCL    9
  #define PIN_BUTTON     0   // BOOT
  #define DISPLAY_KIND   DISPLAY_SSD1306_128X64

#elif CONFIG_IDF_TARGET_ESP32
  // ESP32-DevKitC (WROOM-32): dual core, USB-UART bridge.
  #define BOARD_ID "esp32"
  #define PIN_ADB_DATA   25
  #define PIN_ADB_PSW    26
  #define PIN_SER_TX     17
  #define PIN_SER_RX     16
  #define PIN_KBD_CLK    32
  #define PIN_KBD_DATA   33
  #define PIN_MOUSE_X1   21
  #define PIN_MOUSE_X2   22
  #define PIN_MOUSE_Y1   23
  #define PIN_MOUSE_Y2   27
  #define PIN_MOUSE_SW   13
  #define PIN_LED        2
  #define LED_IS_RGB     0
  #define LED_ACTIVE_LOW 0
  #define PIN_I2C_SDA    18
  #define PIN_I2C_SCL    19
  #define PIN_BUTTON     0   // BOOT
  #define DISPLAY_KIND   DISPLAY_SSD1306_128X64

#elif CONFIG_IDF_TARGET_ESP32C3
  // ESP32-C3 boards (single RISC-V core, BLE 5, native USB). Only 13 GPIOs reach the headers, so
  // the ADB and M0110 signals share pins: a Mac uses one bus or the other, never both.
  // GPIO 0/1 carry the Mac's serial port rather than 20/21, because the ROM bootloader prints
  // its boot log on GPIO 21 and that would reach the Mac.
  #define PIN_ADB_DATA   3
  #define PIN_ADB_PSW    4
  #define PIN_KBD_CLK    3
  #define PIN_KBD_DATA   4
  #define PIN_SER_TX     0
  #define PIN_SER_RX     1
  #define PIN_MOUSE_X1   20
  #define PIN_MOUSE_X2   21
  #define PIN_MOUSE_Y1   7
  #define PIN_MOUSE_Y2   10
  #define PIN_MOUSE_SW   2   // strapping pin: the level shifter's pull-up keeps it high at boot
  #define PIN_LED        8   // also a strapping pin; the board's LED pulls it the right way
  #define LED_IS_RGB     0
  #define LED_ACTIVE_LOW 1
  #define PIN_I2C_SDA    5
  #define PIN_I2C_SCL    6
  #define PIN_BUTTON     9   // BOOT
  #if defined(PLATINUM_BOARD_ESP32C3_SUPERMINI)
    #define BOARD_ID "esp32c3"
    #define DISPLAY_KIND DISPLAY_SSD1306_128X64
  #else
    // ESP32-C3 with the built-in 0.42" OLED (sold as "ESP32-C3 OLED", Abrobot / 01Space).
    #define BOARD_ID "esp32c3-oled"
    #define DISPLAY_KIND DISPLAY_SSD1306_72X40
    #define DISPLAY_BUILT_IN 1
  #endif

#else
  #error "Platinum Bridge supports the ESP32, ESP32-S3 and ESP32-C3 (they have BLE central + WiFi)."
#endif

#ifndef DISPLAY_BUILT_IN
  #define DISPLAY_BUILT_IN 0
#endif
#ifndef DISPLAY_ROTATE_180
  #define DISPLAY_ROTATE_180 0
#endif
#ifndef PIN_JOY
  #define PIN_JOY -1  // no joystick: the BOOT button alone pages through the screen
#endif
#ifndef PIN_SD_CS
  #define PIN_SD_CS -1  // no card slot
#endif

// Timing-critical bus tasks: on dual-core chips they get core 1 to themselves (WiFi/BT live on
// core 0); single-core chips just run them at top priority.
#if CONFIG_FREERTOS_UNICORE
  #define BUS_CORE 0
#else
  #define BUS_CORE 1
#endif

#define MAC_DEFAULT_BAUD   57600
#define USB_BAUD           921600
#define WS_PORT            81
#define DISCOVERY_PORT     4210
#define AP_PASSWORD        "macintosh"
#define MDNS_NAME          "platinum"

// ADB defaults (Apple Extended Keyboard + standard mouse)
#define ADB_KBD_ADDR       2
#define ADB_MOUSE_ADDR     3
#define ADB_KBD_HANDLER    2
#define ADB_MOUSE_HANDLER  1
