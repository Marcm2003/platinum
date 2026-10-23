// BLE HID central using NimBLE-Arduino 2.x.
// Devices are switched to Boot Protocol so keyboard (8 bytes) and mouse (≥3 bytes) reports
// have a fixed layout; if a device refuses, Report characteristics are parsed heuristically.

#include "blehid.h"
#include <NimBLEDevice.h>
#include <map>
#include <vector>

namespace blehid {

static const NimBLEUUID HID_SERVICE((uint16_t)0x1812);
static const NimBLEUUID PROTOCOL_MODE((uint16_t)0x2A4E);
static const NimBLEUUID REPORT((uint16_t)0x2A4D);
static const NimBLEUUID BOOT_KBD_IN((uint16_t)0x2A22);
static const NimBLEUUID BOOT_MOUSE_IN((uint16_t)0x2A33);

static KeyFn keyCb;
static MouseFn mouseCb;
static std::map<std::string, Device> devices;
static volatile bool changed = true;
static uint8_t lastKeys[6] = {0};
static uint8_t lastMods = 0;
static uint32_t lastMaintain = 0;

// HID usage (keyboard page) → ADB virtual key code. 0xFF = none.
static const uint8_t HID2ADB[0x68] = {
  0xFF, 0xFF, 0xFF, 0xFF,
  0x00, 0x0B, 0x08, 0x02, 0x0E, 0x03, 0x05, 0x04, 0x22, 0x26, 0x28, 0x25,  // a-l
  0x2E, 0x2D, 0x1F, 0x23, 0x0C, 0x0F, 0x01, 0x11, 0x20, 0x09, 0x0D, 0x07,  // m-x
  0x10, 0x06,                                                              // y z
  0x12, 0x13, 0x14, 0x15, 0x17, 0x16, 0x1A, 0x1C, 0x19, 0x1D,              // 1-0
  0x24, 0x35, 0x33, 0x30, 0x31, 0x1B, 0x18, 0x21, 0x1E, 0x2A, 0x2A, 0x29,  // enter esc bksp tab space - = [ ] \ # ;
  0x27, 0x32, 0x2B, 0x2F, 0x2C, 0x39,                                      // ' ` , . / caps
  0x7A, 0x78, 0x63, 0x76, 0x60, 0x61, 0x62, 0x64, 0x65, 0x6D, 0x67, 0x6F,  // F1-F12
  0x69, 0x6B, 0x71, 0x72, 0x73, 0x74, 0x75, 0x77, 0x79,                    // F13 F14 F15 ins home pgup del end pgdn
  0x3C, 0x3B, 0x3D, 0x3E,                                                  // right left down up
  0x47, 0x4B, 0x43, 0x4E, 0x45, 0x4C,                                      // numlock(clear) kp/ kp* kp- kp+ kpenter
  0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5B, 0x5C, 0x52, 0x41,        // kp1-9 kp0 kp.
  0x0A, 0xFF, 0x7F, 0x51,                                                  // non-US \ (ISO §), app, power, kp=
};
static const uint8_t MOD2ADB[8] = {0x36, 0x38, 0x3A, 0x37, 0x7D, 0x7B, 0x7C, 0x37};  // LCtrl LShift LAlt LGUI RCtrl RShift RAlt RGUI

static void handleKeyboard(const uint8_t* r, size_t len) {
  if (len < 8) return;
  uint8_t mods = r[0];
  for (int b = 0; b < 8; b++) {
    bool was = lastMods & (1 << b), is = mods & (1 << b);
    if (was != is) keyCb(MOD2ADB[b], is);
  }
  lastMods = mods;
  const uint8_t* keys = r + 2;
  if (keys[0] == 0x01) return;  // rollover error
  for (int i = 0; i < 6; i++) {  // releases
    uint8_t k = lastKeys[i];
    if (!k) continue;
    bool still = false;
    for (int j = 0; j < 6; j++) still |= keys[j] == k;
    if (!still && k < sizeof(HID2ADB) && HID2ADB[k] != 0xFF) keyCb(HID2ADB[k], false);
  }
  for (int i = 0; i < 6; i++) {  // presses
    uint8_t k = keys[i];
    if (!k) continue;
    bool was = false;
    for (int j = 0; j < 6; j++) was |= lastKeys[j] == k;
    if (!was && k < sizeof(HID2ADB) && HID2ADB[k] != 0xFF) keyCb(HID2ADB[k], true);
  }
  memcpy(lastKeys, keys, 6);
}

static void handleMouse(const uint8_t* r, size_t len) {
  if (len < 3) return;
  mouseCb((int8_t)r[1], (int8_t)r[2], r[0] & 0x07);
}

static void onReport(NimBLERemoteCharacteristic* c, uint8_t* data, size_t len, bool) {
  const NimBLEUUID& u = c->getUUID();
  if (u == BOOT_KBD_IN) return handleKeyboard(data, len);
  if (u == BOOT_MOUSE_IN) return handleMouse(data, len);
  // Report protocol fallback: guess by length.
  if (len == 8) handleKeyboard(data, len);
  else if (len == 9 && data[0] <= 0x10) handleKeyboard(data + 1, 8);  // with report ID
  else if (len >= 3 && len <= 8) handleMouse(data, len);
}

class ClientCb : public NimBLEClientCallbacks {
  void onDisconnect(NimBLEClient* c, int) override {
    auto it = devices.find(c->getPeerAddress().toString());
    if (it != devices.end()) { it->second.connected = false; changed = true; }
    memset(lastKeys, 0, 6);
    lastMods = 0;
  }
};
static ClientCb clientCb;

class ScanCb : public NimBLEScanCallbacks {
  void onResult(const NimBLEAdvertisedDevice* d) override {
    if (!d->isAdvertisingService(HID_SERVICE)) return;
    std::string a = d->getAddress().toString();
    Device& dev = devices[a];
    dev.addr = a.c_str();
    if (!d->getName().empty()) dev.name = d->getName().c_str();
    dev.rssi = d->getRSSI();
    dev.appearance = d->getAppearance();
    changed = true;
  }
};
static ScanCb scanCb;

void begin(KeyFn onKey, MouseFn onMouse) {
  keyCb = onKey;
  mouseCb = onMouse;
  NimBLEDevice::setSecurityAuth(true, false, true);  // bonding, no MITM, secure connections
  NimBLEDevice::setSecurityIOCap(BLE_HS_IO_NO_INPUT_OUTPUT);
  for (int i = 0; i < NimBLEDevice::getNumBonds(); i++) {
    std::string a = NimBLEDevice::getBondedAddress(i).toString();
    Device& dev = devices[a];
    dev.addr = a.c_str();
    if (!dev.name.length()) dev.name = "Paired device";
    dev.paired = true;
  }
  NimBLEScan* s = NimBLEDevice::getScan();
  s->setScanCallbacks(&scanCb, false);
  s->setActiveScan(true);
  s->setInterval(100);
  s->setWindow(99);
}

void scan(uint32_t ms) {
  NimBLEScan* s = NimBLEDevice::getScan();
  if (s->isScanning()) s->stop();
  s->clearResults();
  s->start(ms, false, true);
}

static bool connectTo(const NimBLEAddress& addr) {
  NimBLEClient* c = nullptr;
  for (auto* existing : NimBLEDevice::getConnectedClients()) if (existing->getPeerAddress() == addr) return true;
  c = NimBLEDevice::getDisconnectedClient();
  if (!c) c = NimBLEDevice::createClient();
  if (!c) return false;
  c->setClientCallbacks(&clientCb, false);
  c->setConnectionParams(6, 12, 0, 200);
  if (!c->connect(addr)) { NimBLEDevice::deleteClient(c); return false; }
  c->secureConnection();
  NimBLERemoteService* hid = c->getService(HID_SERVICE);
  if (!hid) { c->disconnect(); return false; }

  // Prefer Boot Protocol for fixed report layouts.
  bool boot = false;
  if (auto* pm = hid->getCharacteristic(PROTOCOL_MODE)) {
    uint8_t zero = 0;
    boot = pm->writeValue(&zero, 1, false);
  }
  int subs = 0;
  if (boot) {
    if (auto* k = hid->getCharacteristic(BOOT_KBD_IN)) subs += k->subscribe(true, onReport);
    if (auto* m = hid->getCharacteristic(BOOT_MOUSE_IN)) subs += m->subscribe(true, onReport);
  }
  if (!subs) {
    for (auto* ch : hid->getCharacteristics(true))
      if (ch->getUUID() == REPORT && ch->canNotify()) subs += ch->subscribe(true, onReport);
  }
  Device& dev = devices[addr.toString()];
  dev.addr = addr.toString().c_str();
  dev.paired = true;
  dev.connected = subs > 0;
  changed = true;
  return subs > 0;
}

bool pair(const String& addr) {
  NimBLEDevice::getScan()->stop();
  return connectTo(NimBLEAddress(std::string(addr.c_str()), BLE_ADDR_RANDOM)) ||
         connectTo(NimBLEAddress(std::string(addr.c_str()), BLE_ADDR_PUBLIC));
}

void forget(const String& addr) {
  std::string a = addr.c_str();
  for (auto* c : NimBLEDevice::getConnectedClients()) if (c->getPeerAddress().toString() == a) c->disconnect();
  for (int i = 0; i < NimBLEDevice::getNumBonds(); i++) {
    NimBLEAddress b = NimBLEDevice::getBondedAddress(i);
    if (b.toString() == a) { NimBLEDevice::deleteBond(b); break; }
  }
  devices.erase(a);
  changed = true;
}

void maintain() {
  if (millis() - lastMaintain < 10000 || NimBLEDevice::getScan()->isScanning()) return;
  lastMaintain = millis();
  for (int i = 0; i < NimBLEDevice::getNumBonds(); i++) {
    NimBLEAddress b = NimBLEDevice::getBondedAddress(i);
    auto it = devices.find(b.toString());
    if (it == devices.end() || !it->second.connected) connectTo(b);
  }
}

String listJson() {
  String s = "[";
  bool first = true;
  for (auto& [k, d] : devices) {
    if (!first) s += ",";
    first = false;
    const char* kind = d.appearance == 0x03C1 ? "keyboard" : d.appearance == 0x03C2 ? "mouse" : d.appearance >= 0x03C0 && d.appearance <= 0x03CF ? "hid" : "unknown";
    String name = d.name;
    name.replace("\"", "'");
    s += "{\"addr\":\"" + d.addr + "\",\"name\":\"" + name + "\",\"rssi\":" + String(d.rssi) + ",\"kind\":\"" + kind +
         "\",\"paired\":" + (d.paired ? "true" : "false") + ",\"connected\":" + (d.connected ? "true" : "false") + "}";
  }
  return s + "]";
}

bool listChanged() {
  bool c = changed;
  changed = false;
  return c;
}

}  // namespace blehid

namespace blehid {

int connectedNames(String* out, int max) {
  int n = 0;
  for (auto& kv : devices) {
    if (!kv.second.connected || n >= max) continue;
    out[n++] = kv.second.name.length() ? kv.second.name : kv.second.addr;
  }
  return n;
}

}  // namespace blehid
