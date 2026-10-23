#include "macnet.h"

#include <lwip/dns.h>
#include <lwip/lwip_napt.h>
#include <lwip/netif.h>
#include <lwip/tcpip.h>
#include <netif/ppp/ppp.h>
#include <netif/ppp/pppos.h>

// lwIP's PPP server mode isn't compiled into the Arduino core, but the client can do the job:
// it waits passively for the Mac's LCP request, and IPCP hands the Mac `MAC_IP` (NAKing the
// 0.0.0.0 it asks for) and the DNS server we got from the WiFi network.

namespace macnet {

// A private subnet unlikely to clash with a home network.
static ip4_addr_t OUR_IP, MAC_IP;

static HardwareSerial* port = nullptr;
static void (*report)(const char*, ...) = nullptr;
static ppp_pcb* pcb = nullptr;
static struct netif pppNetif;
static volatile State st = OFF;
static volatile bool linkUp = false, linkDown = false;
static uint32_t inBytes = 0, outBytes = 0, lastRxMs = 0;

// Hayes command state.
static char line[64];
static size_t lineLen = 0;
static bool echo = true, verbose = true, quiet = false;

static void say(const char* text, uint8_t code) {
  if (quiet) return;
  char buf[48];
  int n = verbose ? snprintf(buf, sizeof buf, "\r\n%s\r\n", text) : snprintf(buf, sizeof buf, "%u\r", code);
  port->write((const uint8_t*)buf, n);
  outBytes += n;
}

// ───────── PPP (callbacks run on the lwIP thread) ─────────

static u32_t pppOutput(ppp_pcb*, const void* data, u32_t len, void*) {
  outBytes += len;
  return port ? port->write((const uint8_t*)data, len) : 0;
}

static void pppStatus(ppp_pcb* p, int err, void*) {
  if (err == PPPERR_NONE) {
    // Route the Mac's traffic out through WiFi, translated to the bridge's address.
    struct netif* wifi = nullptr;
    struct netif* n;
    NETIF_FOREACH(n) if (n != &pppNetif && !ip4_addr_isany_val(*netif_ip4_addr(n)) && netif_is_up(n)) { wifi = n; break; }
    if (netif_default == &pppNetif && wifi) netif_set_default(wifi);
    ip_napt_enable_netif(&pppNetif, 1);
    linkUp = true;
  } else {
    linkDown = true;
  }
  (void)p;
}

static bool phaseDead() { return !pcb || pcb->phase == PPP_PHASE_DEAD; }

static void startPpp() {
  LOCK_TCPIP_CORE();
  if (phaseDead()) {
    // Pass on the DNS server we got from the WiFi network.
    const ip_addr_t* dns = dns_getserver(0);
    ip4_addr_t d;
    if (dns && IP_IS_V4(dns) && !ip_addr_isany(dns)) ip4_addr_copy(d, *ip_2_ip4(dns));
    else IP4_ADDR(&d, 1, 1, 1, 1);
    ppp_set_ipcp_dnsaddr(pcb, 0, &d);
    ppp_connect(pcb, 0);
  }
  UNLOCK_TCPIP_CORE();
  st = NEGOTIATING;
}

// ───────── Modem commands ─────────

static void command(const char* cmd) {
  if (strncmp(cmd, "AT", 2)) return;
  for (const char* c = cmd + 2; *c; c++) {
    char k = *c;
    int arg = isdigit((unsigned char)c[1]) ? c[1] - '0' : -1;
    switch (k) {
      case 'D': case 'A': {  // dial (any number) or answer: "connect" straight away
        char msg[24];
        snprintf(msg, sizeof msg, "CONNECT %lu", (unsigned long)port->baudRate());
        say(msg, 1);
        if (report) report("Mac dialled the bridge: starting PPP");
        startPpp();
        return;
      }
      case 'O': if (!phaseDead()) { say("CONNECT", 1); st = NEGOTIATING; return; } break;
      case 'E': echo = arg != 0; break;
      case 'V': verbose = arg != 0; break;
      case 'Q': quiet = arg == 1; break;
      case 'Z': echo = verbose = true; quiet = false; break;
      case 'I': if (!quiet) { const char* id = "\r\nPlatinum Bridge PPP\r\n"; port->write((const uint8_t*)id, strlen(id)); } break;
      case '&': if (c[1]) c++; break;  // &F, &C1, &D2…: accepted and ignored
      default: break;
    }
    if (arg >= 0) c++;
  }
  say("OK", 0);
}

static void commandByte(uint8_t b) {
  if (echo) { port->write(b); outBytes++; }
  if (b == '\r' || b == '\n') {
    if (lineLen) {
      line[lineLen] = 0;
      lineLen = 0;
      command(line);
    }
    return;
  }
  if (b == 8 || b == 127) { if (lineLen) lineLen--; return; }
  if (b > ' ' && lineLen < sizeof line - 1) line[lineLen++] = toupper(b);
}

// ───────── Public ─────────

void begin(HardwareSerial& p, void (*log)(const char*, ...)) {
  port = &p;
  report = log;
  if (!pcb) {
    IP4_ADDR(&OUR_IP, 172, 31, 73, 1);
    IP4_ADDR(&MAC_IP, 172, 31, 73, 2);
    LOCK_TCPIP_CORE();
    pcb = pppos_create(&pppNetif, pppOutput, pppStatus, nullptr);
    if (pcb) {
      ppp_set_ipcp_ouraddr(pcb, &OUR_IP);
      ppp_set_ipcp_hisaddr(pcb, &MAC_IP);
      ppp_set_passive(pcb, 1);    // the Mac starts the conversation
      ppp_set_auth(pcb, PPPAUTHTYPE_NONE, "", "");
    }
    UNLOCK_TCPIP_CORE();
  }
  if (!pcb) { if (report) report("PPP: out of memory"); st = OFF; return; }
  echo = verbose = true;
  quiet = false;
  lineLen = 0;
  linkUp = linkDown = false;
  st = COMMAND;
}

void end() {
  if (!pcb) { st = OFF; return; }
  LOCK_TCPIP_CORE();
  if (!phaseDead()) ppp_close(pcb, 1);
  UNLOCK_TCPIP_CORE();
  for (int i = 0; i < 100 && !phaseDead(); i++) delay(10);
  LOCK_TCPIP_CORE();
  if (phaseDead()) { ppp_free(pcb); pcb = nullptr; }
  UNLOCK_TCPIP_CORE();
  st = OFF;
}

void feed(const uint8_t* data, size_t len) {
  if (st == OFF || !len) return;
  uint32_t now = millis();
  inBytes += len;
  // After a quiet spell, plain "AT" instead of a PPP flag means the Mac hung up and is redialling.
  if (st != COMMAND && now - lastRxMs > 1500 && len >= 2 && data[0] == 'A' && (data[1] == 'T' || data[1] == 't')) {
    LOCK_TCPIP_CORE();
    if (!phaseDead()) ppp_close(pcb, 1);
    UNLOCK_TCPIP_CORE();
    st = COMMAND;
  }
  lastRxMs = now;
  if (st == COMMAND) {
    // A PPP flag in command mode: the Mac's PPP software is set to a direct ("hard-wired") line.
    const uint8_t* flag = (const uint8_t*)memchr(data, 0x7E, len);
    if (!flag) { for (size_t i = 0; i < len; i++) commandByte(data[i]); return; }
    for (const uint8_t* b = data; b < flag; b++) commandByte(*b);
    if (report) report("PPP frame from the Mac: starting PPP");
    startPpp();
    len -= flag - data;
    data = flag;
  }
  pppos_input_tcpip(pcb, data, len);
}

void loop() {
  if (linkUp) {
    linkUp = false;
    st = ONLINE;
    if (report) report("Mac online at %s", macAddress().c_str());
  }
  if (linkDown) {
    linkDown = false;
    if (st != OFF) {
      if (st != COMMAND) say("NO CARRIER", 3);
      st = COMMAND;
      if (report) report("Mac network link closed");
    }
  }
}

State state() { return st; }

const char* stateName() {
  switch (st) {
    case COMMAND: return "waiting";
    case NEGOTIATING: return "connecting";
    case ONLINE: return "online";
    default: return "off";
  }
}

String macAddress() {
  if (st != ONLINE) return String();
  char buf[16];
  return String(ip4addr_ntoa_r(netif_ip4_gw(&pppNetif), buf, sizeof buf));
}

uint32_t bytesIn() { return inBytes; }
uint32_t bytesOut() { return outBytes; }

}  // namespace macnet
