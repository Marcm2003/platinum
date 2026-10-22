// Platinum Bridge — pin map and constants.
// Keep in sync with src/lib/hardware/boards.ts in the desktop app.
#pragma once

#define FW_VERSION "0.1.0"
#define FW_NAME "Platinum Bridge"

#if CONFIG_IDF_TARGET_ESP32S3
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
#elif CONFIG_IDF_TARGET_ESP32
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
#else
  #error "Platinum Bridge supports ESP32 and ESP32-S3 (BLE central + WiFi)."
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
