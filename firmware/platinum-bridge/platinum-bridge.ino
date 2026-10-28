// Platinum Bridge — ESP32 firmware that connects a classic Macintosh to the Platinum desktop app.
//
//  • Emulates an ADB keyboard + mouse (SE and later) or an M0110A keyboard + quadrature mouse (128K/512K/Plus)
//  • Pairs Bluetooth LE keyboards and mice and forwards them to the Mac
//  • Bridges the Mac's RS-422 serial port (Platinum Agent) to the app, or puts the Mac on the
//    network: it answers as a modem, runs PPP and routes it to WiFi with NAT (see macnet.h)
//  • Talks to the app over USB, WebSocket (ws://platinum.local:81) or BLE (Nordic UART)
//
// Protocol: newline-delimited JSON, see docs/protocol.md.

#include <Arduino.h>
#include <ArduinoJson.h>
#include <ESPmDNS.h>
#include <NimBLEDevice.h>
#include <Preferences.h>
#include <WebSocketsServer.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <mbedtls/base64.h>

#include "adb.h"
#include "blehid.h"
#include "config.h"
#include "display.h"
#include "joystick.h"
#include "m0110.h"
#include "macnet.h"

static Preferences prefs;
static WebSocketsServer ws(WS_PORT);
static WiFiUDP udp;
static HardwareSerial& macSerial = Serial1;

static String bridgeName = FW_NAME;
static String mode = "adb";  // "adb" | "m0110"
static String serialMode = "agent";  // who owns the Mac's serial port: "agent" | "net"
static uint32_t macBaud = MAC_DEFAULT_BAUD;
static bool apMode = false;
static uint32_t pswUntil = 0;
static uint32_t serIn = 0, serOut = 0, keysSent = 0, lastUsbMs = 0;
static uint32_t lastKeyMs = 0, lastMouseMs = 0, lastSerialMs = 0;  // for the screen's activity icons
static bool wifiConfigured = false;

// ───────── Output to every connected client ─────────

static NimBLECharacteristic* nusTx = nullptr;
static volatile bool bleClient = false;

static void out(const String& line) {
  Serial.println(line);
  if (ws.connectedClients()) ws.broadcastTXT(line.c_str(), line.length());
  if (bleClient && nusTx) {
    String l = line + "\n";
    const size_t chunk = 180;
    for (size_t i = 0; i < l.length(); i += chunk) {
      nusTx->setValue((const uint8_t*)l.c_str() + i, min(chunk, l.length() - i));
      nusTx->notify();
    }
  }
}

static void logf(const char* fmt, ...) {
  char buf[200];
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(buf, sizeof buf, fmt, ap);
  va_end(ap);
  JsonDocument d;
  d["t"] = "log";
  d["m"] = buf;
  String s;
  serializeJson(d, s);
  out(s);
}

// ───────── Input routing ─────────

static void sendKey(uint8_t code, bool down) {
  if (down) { keysSent++; lastKeyMs = millis(); }
  if (mode == "adb") adb::key(code, down); else m0110::key(code, down);
}
static void sendMouse(int dx, int dy, bool b) {
  lastMouseMs = millis();
  if (mode == "adb") adb::mouse(dx, dy, b); else m0110::mouse(dx, dy, b);
}

// ───────── Status ─────────

static bool macPolling() {
  uint32_t last = mode == "adb" ? adb::stats().lastTalkMs : m0110::lastCommandMs();
  return last && millis() - last < 1500;
}

static void sendInfo() {
  JsonDocument d;
  d["t"] = "info";
  d["fw"] = FW_VERSION;
  d["board"] = BOARD_ID;
  d["name"] = bridgeName;
  d["mode"] = mode;
  d["baud"] = macBaud;
  d["heap"] = ESP.getFreeHeap();
  d["uptime"] = millis() / 1000;
  d["macPolling"] = macPolling();
  d["display"] = display::present();
  d["serial"] = serialMode;
  if (serialMode == "net") {
    JsonObject n = d["net"].to<JsonObject>();
    n["state"] = macnet::stateName();
    if (macnet::state() == macnet::ONLINE) n["ip"] = macnet::macAddress();
    n["in"] = macnet::bytesIn();
    n["out"] = macnet::bytesOut();
  }
  if (WiFi.status() == WL_CONNECTED) {
    d["ip"] = WiFi.localIP().toString();
    d["ssid"] = WiFi.SSID();
    d["rssi"] = WiFi.RSSI();
  } else if (apMode) {
    d["ip"] = WiFi.softAPIP().toString();
    d["ssid"] = WiFi.softAPSSID();
    d["rssi"] = 0;
  }
  if (mode == "adb") {
    adb::Stats s = adb::stats();
    d["adbAddr"]["kbd"] = s.kbdAddr;
    d["adbAddr"]["mouse"] = s.mouseAddr;
  }
  String s;
  serializeJson(d, s);
  out(s);
}

static void sendBleList() {
  out(String("{\"t\":\"ble\",\"list\":") + blehid::listJson() + "}");
}

// ───────── ADB / keyboard bus events (queued from the bus task) ─────────

struct BusEvent { char ev[8]; uint8_t addr, reg; };
static QueueHandle_t busEvents;

static void onAdbEvent(const char* ev, uint8_t addr, uint8_t reg) {
  BusEvent e = {};
  strncpy(e.ev, ev, sizeof e.ev - 1);
  e.addr = addr;
  e.reg = reg;
  xQueueSend(busEvents, &e, 0);
}

// ───────── Mac serial port ⇄ app ─────────

static uint8_t serBuf[192];
static size_t serLen = 0;
static uint32_t serLast = 0;

static void flushSerial() {
  if (!serLen) return;
  unsigned char b64[300];
  size_t olen = 0;
  mbedtls_base64_encode(b64, sizeof b64, &olen, serBuf, serLen);
  b64[olen] = 0;
  out(String("{\"t\":\"ser\",\"d\":\"") + (const char*)b64 + "\"}");
  serLen = 0;
}

static void pumpMacSerial() {
  if (serialMode == "net") {
    uint8_t b[256];
    int n;
    while ((n = macSerial.available()) > 0) {
      n = macSerial.readBytes(b, min(n, (int)sizeof b));
      serIn += n;
      lastSerialMs = millis();
      macnet::feed(b, n);
    }
    return;
  }
  while (macSerial.available()) {
    serBuf[serLen++] = macSerial.read();
    serIn++;
    lastSerialMs = millis();
    serLast = micros();
    if (serLen == sizeof serBuf) flushSerial();
  }
  if (serLen && micros() - serLast > 3000) flushSerial();
}

// ───────── Command handling ─────────

static void applyMode(const String& m) {
  if (m == mode) return;
  if (mode == "adb") adb::end(); else m0110::end();
  mode = m;
  if (mode == "adb") { pinMode(PIN_ADB_PSW, OUTPUT); digitalWrite(PIN_ADB_PSW, LOW); adb::begin(); } else m0110::begin();
  prefs.putString("mode", mode);
  logf("Mode %s", mode.c_str());
}

static void applySerialMode(const String& m) {
  if (m == serialMode || (m != "agent" && m != "net")) return;
  if (serialMode == "net") macnet::end();
  serialMode = m;
  if (serialMode == "net") macnet::begin(macSerial, logf);
  prefs.putString("serial", serialMode);
  logf(serialMode == "net" ? "Serial port: Mac network (PPP)" : "Serial port: Platinum Agent");
}

/** Holds the ADB power-on line for a moment, like the keyboard's power key. */
static void powerOn() {
  // On the ESP32-C3 the PSW pin doubles as the M0110 keyboard's DATA line.
  if (mode != "adb") { display::toast("ADB Macs only"); return; }
  digitalWrite(PIN_ADB_PSW, HIGH);
  pswUntil = millis() + 400;
  logf("Power-on");
  display::toast("Power on");
}

static void handleLine(const char* line, size_t len) {
  JsonDocument d;
  if (deserializeJson(d, line, len)) return;
  const char* t = d["t"] | "";

  if (!strcmp(t, "key")) sendKey(d["c"] | 0, (d["d"] | 0) != 0);
  else if (!strcmp(t, "mouse")) sendMouse(d["dx"] | 0, d["dy"] | 0, (d["b"] | 0) != 0);
  else if (!strcmp(t, "ser")) {
    if (serialMode == "net") return;  // the port is carrying PPP
    const char* s = d["d"] | "";
    unsigned char bin[768];
    size_t olen = 0;
    if (!mbedtls_base64_decode(bin, sizeof bin, &olen, (const unsigned char*)s, strlen(s))) { macSerial.write(bin, olen); serOut += olen; lastSerialMs = millis(); }
  }
  else if (!strcmp(t, "hello")) { sendInfo(); sendBleList(); display::toast("Platinum connected"); }
  else if (!strcmp(t, "power")) powerOn();
  else if (!strcmp(t, "cfg")) {
    if (d["mode"].is<const char*>()) applyMode(d["mode"].as<String>());
    if (d["serial"].is<const char*>()) applySerialMode(d["serial"].as<String>());
    if (d["baud"].is<uint32_t>()) { macBaud = d["baud"]; macSerial.updateBaudRate(macBaud); prefs.putUInt("baud", macBaud); }
    if (d["name"].is<const char*>()) { bridgeName = d["name"].as<String>(); prefs.putString("name", bridgeName); }
    if (d["invertX"].is<bool>() || d["invertY"].is<bool>()) m0110::setInvert(d["invertX"] | false, d["invertY"] | false);
    sendInfo();
  }
  else if (!strcmp(t, "wifi")) {
    prefs.putString("ssid", d["ssid"] | "");
    prefs.putString("pass", d["pass"] | "");
    logf("WiFi saved, restarting…");
    display::toast("WiFi saved, restarting");
    delay(300);
    ESP.restart();
  }
  else if (!strcmp(t, "ble_scan")) { blehid::scan(8000); logf("Scanning for BLE devices…"); }
  else if (!strcmp(t, "ble_pair")) {
    String a = d["addr"] | "";
    bool ok = blehid::pair(a);
    logf(ok ? "Paired %s" : "Could not pair %s", a.c_str());
    if (ok) display::toast("Paired"); else display::error(display::ERR_BLE_PAIR, "Pair failed", 5000);
    sendBleList();
  }
  else if (!strcmp(t, "ble_forget")) { blehid::forget(d["addr"] | ""); sendBleList(); }
  else if (!strcmp(t, "reboot")) { delay(100); ESP.restart(); }
}

// Line assemblers for each transport.
struct LineBuf {
  char buf[1400];
  size_t n = 0;
  void feed(const uint8_t* data, size_t len) {
    for (size_t i = 0; i < len; i++) {
      char c = data[i];
      if (c == '\n') { if (n) handleLine(buf, n); n = 0; }
      else if (n < sizeof buf - 1) buf[n++] = c;
    }
  }
};
static LineBuf usbLine;

// BLE NUS writes arrive on the NimBLE task; hand them to loop() through a stream buffer.
static StreamBufferHandle_t bleRx;
static LineBuf bleLine;

class NusRxCb : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c, NimBLEConnInfo&) override {
    NimBLEAttValue v = c->getValue();
    xStreamBufferSend(bleRx, v.data(), v.length(), 0);
  }
};
class ServerCb : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer*, NimBLEConnInfo&) override { bleClient = true; }
  void onDisconnect(NimBLEServer*, NimBLEConnInfo&, int) override { bleClient = false; NimBLEDevice::startAdvertising(); }
};
static NusRxCb nusRxCb;
static ServerCb serverCb;

static void wsEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
  if (type == WStype_TEXT) {
    static LineBuf wsLine;
    wsLine.feed(payload, length);
    const uint8_t nl = '\n';
    wsLine.feed(&nl, 1);
  } else if (type == WStype_CONNECTED) {
    sendInfo();
  }
}

// ───────── Setup ─────────

static void setupBle() {
  NimBLEDevice::init(bridgeName.c_str());
  NimBLEServer* server = NimBLEDevice::createServer();
  server->setCallbacks(&serverCb);
  NimBLEService* nus = server->createService("6E400001-B5A3-F393-E0A9-E50E24DCCA9E");
  NimBLECharacteristic* rx = nus->createCharacteristic("6E400002-B5A3-F393-E0A9-E50E24DCCA9E", NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  rx->setCallbacks(&nusRxCb);
  nusTx = nus->createCharacteristic("6E400003-B5A3-F393-E0A9-E50E24DCCA9E", NIMBLE_PROPERTY::NOTIFY);
  nus->start();
  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->setName(bridgeName.c_str());
  adv->addServiceUUID(nus->getUUID());
  adv->enableScanResponse(true);
  adv->start();

  blehid::begin(
    [](uint8_t code, bool down) {
      sendKey(code, down);
      out(String("{\"t\":\"hid\",\"kind\":\"key\",\"code\":") + code + ",\"down\":" + (down ? "true" : "false") + "}");
    },
    [](int dx, int dy, bool b) { sendMouse(dx, dy, b); });
}

static void setupWifi() {
  String ssid = prefs.getString("ssid", ""), pass = prefs.getString("pass", "");
  WiFi.setHostname(MDNS_NAME);
  wifiConfigured = ssid.length() > 0;
  if (ssid.length()) {
    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid.c_str(), pass.c_str());
    for (int i = 0; i < 120 && WiFi.status() != WL_CONNECTED; i++) {
      delay(100);
      display::bootProgress(0.3f + 0.65f * i / 120);
    }
    if (WiFi.status() != WL_CONNECTED) display::error(display::ERR_WIFI_JOIN, "No WiFi", 8000);
  }
  if (WiFi.status() != WL_CONNECTED) {
    uint8_t mac[6];
    WiFi.macAddress(mac);
    char ap[24];
    snprintf(ap, sizeof ap, "Platinum-%02X%02X", mac[4], mac[5]);
    WiFi.mode(WIFI_AP);
    WiFi.softAP(ap, AP_PASSWORD);
    apMode = true;
  }
  if (MDNS.begin(MDNS_NAME)) MDNS.addService("platinum", "tcp", WS_PORT);
  ws.begin();
  ws.onEvent(wsEvent);
  udp.begin(DISCOVERY_PORT);
}

static void setLed(uint8_t r, uint8_t g, uint8_t b) {
#if LED_IS_RGB
  rgbLedWrite(PIN_LED, r, g, b);
#else
  bool on = r | g | b;
  digitalWrite(PIN_LED, on != LED_ACTIVE_LOW ? HIGH : LOW);
#endif
}

// ───────── Screen ─────────

static const char* appLink() {
  if (bleClient) return "BLE";
  if (ws.connectedClients()) return "WiFi";
  if (lastUsbMs && millis() - lastUsbMs < 6000) return "USB";
  return nullptr;
}

static void updateDisplay() {
  if (!display::present()) return;
  display::Status s;
  s.mode = mode.c_str();
  s.macActive = macPolling();
  s.link = appLink();
  s.wifi = WiFi.status() == WL_CONNECTED;
  s.ap = apMode;
  s.ip = s.wifi ? WiFi.localIP().toString() : apMode ? WiFi.softAPIP().toString() : String();
  s.ssid = s.wifi ? WiFi.SSID() : apMode ? WiFi.softAPSSID() : String();
  s.bleConnected = blehid::connectedNames(s.bleNames, 4);
  s.serIn = serIn;
  s.serOut = serialMode == "net" ? macnet::bytesOut() : serOut;
  s.keys = keysSent;
  s.joining = !s.wifi && !apMode && wifiConfigured;
  s.lastKeyMs = lastKeyMs;
  s.lastMouseMs = lastMouseMs;
  s.lastSerialMs = lastSerialMs;
  display::update(s);
}

// ───────── Front panel ─────────
// With only the BOOT button, a press shows the next page. With the joystick, left and right page
// through the screen and the centre press opens a menu: up and down choose, the press or right
// runs, left goes back. It closes on its own after a while.

enum MenuId : uint8_t { MENU_CLOSED, MENU_MAIN, MENU_BLE };
enum MainItem : uint8_t { M_MAC, M_SERIAL, M_POWER, M_BLE, M_WIFI, M_RESTART, M_FIRMWARE, M_COUNT };
static MenuId menuAt = MENU_CLOSED;
static uint8_t menuSel = 0;
static int menuArmed = -1;  // the item waiting for a second press to confirm
static uint32_t menuInputMs = 0, menuDrawMs = 0, bleReadMs = 0, bleScanUntil = 0;

// The Bluetooth page lists keyboards and mice from the last scan, and the bonded ones.
static const uint8_t BLE_MAX = 8;
static String bleAddr[BLE_MAX], bleName[BLE_MAX];
static const char* bleState[BLE_MAX];
static uint8_t bleCount = 0;

static void readBleList() {
  bleReadMs = millis();
  JsonDocument d;
  if (deserializeJson(d, blehid::listJson())) return;
  bleCount = 0;
  for (JsonObject o : d.as<JsonArray>()) {
    if (bleCount == BLE_MAX) break;
    String name = o["name"] | "";
    bool paired = o["paired"] | false;
    if (!strcmp(o["kind"] | "unknown", "unknown") && !paired && !name.length()) continue;
    bleAddr[bleCount] = o["addr"] | "";
    bleName[bleCount] = name.length() ? name : bleAddr[bleCount];
    bleState[bleCount] = (o["connected"] | false) ? "on" : paired ? "paired" : nullptr;
    bleCount++;
  }
}

static uint8_t menuCount() { return menuAt == MENU_MAIN ? M_COUNT : bleCount + 1; }

static void drawMenu() {
  menuDrawMs = millis();
  if (menuSel >= menuCount()) menuSel = menuCount() - 1;
  if (menuAt == MENU_MAIN) {
    static const char* const labels[M_COUNT] = {"Mac", "Serial port", "Power on Mac", "Bluetooth", "Forget WiFi", "Restart", "Firmware"};
    const char* values[M_COUNT] = {
        mode == "adb" ? "ADB" : "M0110", serialMode == "net" ? "Network" : "Agent", nullptr, "Pair >",
        menuArmed == M_WIFI ? "Sure?" : nullptr, menuArmed == M_RESTART ? "Sure?" : nullptr, FW_VERSION};
    display::menu("Settings", labels, values, M_COUNT, menuSel);
  } else {
    const char* labels[BLE_MAX + 1];
    const char* values[BLE_MAX + 1];
    for (uint8_t i = 0; i < bleCount; i++) { labels[i] = bleName[i].c_str(); values[i] = bleState[i]; }
    labels[bleCount] = millis() < bleScanUntil ? "Searching..." : "Search again";
    values[bleCount] = nullptr;
    display::menu("Bluetooth", labels, values, bleCount + 1, menuSel);
  }
}

static void closeMenu() {
  menuAt = MENU_CLOSED;
  display::hideMenu();
}

static void bleSearch() {
  blehid::scan(8000);
  bleScanUntil = millis() + 8000;
  readBleList();
}

/** Asks for a second press first; true once confirmed. */
static bool confirmed(uint8_t item) {
  if (menuArmed == item) return true;
  menuArmed = item;
  return false;
}

static void runMain() {
  switch (menuSel) {
    case M_MAC: applyMode(mode == "adb" ? "m0110" : "adb"); sendInfo(); break;
    case M_SERIAL: applySerialMode(serialMode == "net" ? "agent" : "net"); sendInfo(); break;
    case M_POWER: powerOn(); break;
    case M_BLE: menuAt = MENU_BLE; menuSel = 0; bleSearch(); break;
    case M_WIFI:
      if (!confirmed(M_WIFI)) break;
      prefs.remove("ssid");
      prefs.remove("pass");
      [[fallthrough]];  // restart into access-point mode
    case M_RESTART:
      if (menuSel == M_RESTART && !confirmed(M_RESTART)) break;
      display::toast("Restarting");
      drawMenu();
      delay(600);
      ESP.restart();
  }
}

static void runBle() {
  if (menuSel == bleCount) { bleSearch(); return; }
  if (bleState[menuSel]) { display::toast("Already paired"); return; }
  display::toast("Pairing...");
  drawMenu();
  bool ok = blehid::pair(bleAddr[menuSel]);
  logf(ok ? "Paired %s" : "Could not pair %s", bleAddr[menuSel].c_str());
  if (ok) display::toast("Paired"); else display::toast("Pair failed");
  sendBleList();
  readBleList();
}

static void onJoystick(joystick::Event e) {
  using namespace joystick;
  if (!present()) {
    if (e == PRESS) display::nextPage();
    return;
  }
  logf("Joystick %s", name(e));
  menuInputMs = millis();
  if (menuAt == MENU_CLOSED) {
    if (e == PRESS) { menuAt = MENU_MAIN; menuSel = 0; menuArmed = -1; drawMenu(); }
    else if (e == RIGHT || e == DOWN) display::nextPage();
    else display::prevPage();
    return;
  }
  uint8_t n = menuCount();
  if (e == UP) { menuSel = (menuSel + n - 1) % n; menuArmed = -1; }
  else if (e == DOWN) { menuSel = (menuSel + 1) % n; menuArmed = -1; }
  else if (e == LEFT) {
    if (menuAt == MENU_MAIN) { closeMenu(); return; }
    menuAt = MENU_MAIN;
    menuSel = M_BLE;
  }
  else if (menuAt == MENU_MAIN) runMain();
  else runBle();
  drawMenu();
}

static void pollFrontPanel() {
  joystick::Event e = joystick::poll();
  if (e) onJoystick(e);
  if (menuAt == MENU_CLOSED) return;
  uint32_t now = millis();
  if (now - menuInputMs > 20000) { closeMenu(); return; }
  if (menuAt == MENU_BLE && now - bleReadMs > 1000) readBleList();
  if (now - menuDrawMs > 250) drawMenu();  // toasts, values and the scan list change on their own
}

void setup() {
  Serial.begin(USB_BAUD);
#if !LED_IS_RGB
  pinMode(PIN_LED, OUTPUT);
#endif
  setLed(0, 0, 24);
  joystick::begin();
  display::begin();
  pinMode(PIN_ADB_PSW, OUTPUT);
  digitalWrite(PIN_ADB_PSW, LOW);

  prefs.begin("platinum", false);
  bridgeName = prefs.getString("name", FW_NAME);
  mode = prefs.getString("mode", "adb");
  macBaud = prefs.getUInt("baud", MAC_DEFAULT_BAUD);
  serialMode = prefs.getString("serial", "agent");

  macSerial.begin(macBaud, SERIAL_8N1, PIN_SER_RX, PIN_SER_TX);
  macSerial.setRxBufferSize(4096);

  busEvents = xQueueCreate(16, sizeof(BusEvent));
  bleRx = xStreamBufferCreate(2048, 1);
  adb::onEvent = onAdbEvent;
  if (mode == "adb") adb::begin(); else m0110::begin();

  display::bootProgress(0.1f);
  setupBle();
  display::bootProgress(0.3f);
  setupWifi();
  display::bootDone();
  if (serialMode == "net") macnet::begin(macSerial, logf);
  logf("%s v%s ready (%s, %s)", FW_NAME, FW_VERSION, BOARD_ID, mode.c_str());
  sendInfo();
}

// ───────── Loop ─────────

void loop() {
  static uint32_t lastInfo = 0, lastTalkReport = 0, lastTalks = 0;

  if (Serial.available()) lastUsbMs = millis();
  while (Serial.available()) {
    uint8_t b[64];
    size_t n = Serial.readBytes(b, min((int)sizeof b, Serial.available()));
    usbLine.feed(b, n);
  }
  uint8_t bb[128];
  size_t bn;
  while ((bn = xStreamBufferReceive(bleRx, bb, sizeof bb, 0)) > 0) bleLine.feed(bb, bn);

  ws.loop();
  pumpMacSerial();
  macnet::loop();
  static macnet::State netWas = macnet::OFF;
  if (macnet::state() != netWas) {
    if (macnet::state() == macnet::ONLINE) display::toast("Mac online");
    else if (netWas == macnet::ONLINE) display::toast("Mac offline");
    netWas = macnet::state();
  }

  int pkt = udp.parsePacket();
  if (pkt) {
    char q[16] = {0};
    udp.read(q, sizeof q - 1);
    if (!strncmp(q, "PLATINUM?", 9)) {
      String r = String("{\"t\":\"here\",\"name\":\"") + bridgeName + "\",\"fw\":\"" FW_VERSION "\",\"board\":\"" BOARD_ID "\"}";
      udp.beginPacket(udp.remoteIP(), udp.remotePort());
      udp.print(r);
      udp.endPacket();
    }
  }

  BusEvent e;
  while (xQueueReceive(busEvents, &e, 0)) {
    out(String("{\"t\":\"adb\",\"ev\":\"") + e.ev + "\",\"addr\":" + e.addr + ",\"reg\":" + e.reg + "}");
  }
  if (mode == "adb") {
    adb::Stats s = adb::stats();
    if (s.talks != lastTalks && millis() - lastTalkReport > 2000) {
      lastTalks = s.talks;
      lastTalkReport = millis();
      out(String("{\"t\":\"adb\",\"ev\":\"talk\",\"addr\":") + s.kbdAddr + ",\"reg\":0}");
    }
  }

  if (pswUntil && millis() > pswUntil) { digitalWrite(PIN_ADB_PSW, LOW); pswUntil = 0; }
  blehid::maintain();
  if (blehid::listChanged()) sendBleList();

  pollFrontPanel();
  updateDisplay();

  if (millis() - lastInfo > 2000) {
    lastInfo = millis();
    sendInfo();
    setLed(0, macPolling() ? 32 : 0, macPolling() ? 0 : 24);
  }
  delay(1);
}
