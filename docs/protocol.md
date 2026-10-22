# Platinum protocols

Platinum talks over two layers:

1. **Bridge protocol**: newline-delimited JSON between the app and the ESP32 bridge firmware, over USB serial, WebSocket or Bluetooth LE.
2. **Agent protocol**: binary frames between the app and Platinum Agent on the Mac, over the Mac's serial port. With a bridge, these bytes travel base64-encoded inside `ser` messages. With a direct USB-RS422 cable, the app writes them to the serial port as-is.

```
Platinum app ──JSON lines──▶ ESP32 bridge ──RS-422 bytes──▶ Mac (Platinum Agent)
             ◀─────────────               ◀──────────────
Platinum app ──────────── agent frames over a USB-RS422 cable ─────────▶ Mac   (direct mode)
```

Reference implementations: `src/lib/link/bridge.ts` and `src/lib/link/agent.ts` (app), `firmware/platinum-bridge/platinum-bridge.ino` (bridge).

## 1. Bridge protocol (JSON lines)

### Transports

| Transport | Details |
| --- | --- |
| USB serial | 921600 baud, 8N1. Lines that don't start with `{` (boot messages) are shown as log lines. |
| WebSocket | `ws://platinum.local:81/`. One JSON object per text message. mDNS service `_platinum._tcp`. |
| Bluetooth LE | Nordic UART Service `6E400001-B5A3-F393-E0A9-E50E24DCCA9E`; write to RX `…0002`, notifications on TX `…0003`. Notifications are split into 180-byte chunks; reassemble on `\n`. |

**Discovery:** send the ASCII datagram `PLATINUM?` to UDP port 4210 (broadcast). Each bridge answers with `{"t":"here","name":"…","fw":"0.1.0","board":"esp32s3"}`.

Every message is one JSON object with a `t` (type) field, terminated by `\n`.

### App → bridge

| `t` | Fields | Effect |
| --- | --- | --- |
| `hello` | `app`, `v` | Bridge replies with `info` and `ble`. |
| `key` | `c` (ADB key code), `d` (1 down / 0 up) | Key event to the Mac (translated to M0110 in M0110 mode). |
| `mouse` | `dx`, `dy`, `b` (button 1/0) | Relative mouse movement. The app batches at ~60 Hz. |
| `power` | — | Pulls ADB pin 2 (PSW) low for 400 ms. |
| `cfg` | optional `mode` (`"adb"`/`"m0110"`), `baud`, `name`, `invertX`, `invertY` | Stored in flash; bridge replies with `info`. |
| `wifi` | `ssid`, `pass` | Stores the credentials and restarts. |
| `ser` | `d` (base64) | Bytes to write to the Mac's serial port. |
| `ble_scan` | — | Scans for BLE HID devices for 8 s. |
| `ble_pair` / `ble_forget` | `addr` | Pair or forget a BLE keyboard/mouse. |
| `reboot` | — | Restarts the ESP32. |

### Bridge → app

| `t` | Fields | Meaning |
| --- | --- | --- |
| `info` | `fw`, `board`, `name`, `mode`, `baud`, `heap`, `uptime`, `macPolling`, `ip`, `ssid`, `rssi`, `adbAddr {kbd, mouse}` | Status, sent every 2 s and after `hello`/`cfg`. |
| `log` | `m` | Human-readable log line. |
| `ble` | `list: [{addr, name, rssi, kind, paired, connected}]` | Known/nearby BLE HID devices. |
| `adb` | `ev`, `addr`, `reg` | Bus activity summary (for the bus monitor). |
| `hid` | `kind: "key"`, `code`, `down` | A paired BLE keyboard pressed a key (mirrored on the on-screen keyboard). |
| `ser` | `d` (base64) | Bytes received from the Mac's serial port (flushed every 192 bytes or after 3 ms of silence). |

## 2. Agent protocol (binary frames)

> [!NOTE]
> The Mac-side agent (`mac-agent/`) isn't published yet. This section is the specification it implements, and the app side (`src/lib/link/agent.ts`) already follows it.

The Mac's serial port runs at 57600 bps, 8N1, by default (it must match the bridge's `baud`).

### Frame

```
A5 5A | type | seq | len_hi len_lo | payload (len bytes) | crc_hi crc_lo
```

- All multi-byte integers are big-endian (the 68k's native order).
- `seq` is chosen by the requester (1–255) and echoed in the reply.
- `len` ≤ 1024.
- CRC-16/XMODEM (poly 0x1021, init 0) over `type`, `seq`, `len` and `payload`.
- Receivers resynchronise on `A5 5A` and drop frames with a bad CRC.
- A **reply** has the request's type with bit 7 set (`type | 0x80`). An error reply has type `0xFF`: payload `[code: i8][message: MacRoman]`.
- Strings are MacRoman. A Pascal string is a length byte followed by the characters.

### Requests (app → agent)

| Type | Name | Request payload | Reply payload |
| --- | --- | --- | --- |
| `0x01` | PING | — | — |
| `0x02` | SYSINFO | — | `machineType u32` (Gestalt `mach`), `systemVersion u16` (BCD, e.g. `0x0753`), `physicalRam u32`, `screenW u16`, `screenH u16`, `depth u16`, `agentMajor u8`, `agentMinor u8`, `freeMem u32` |
| `0x20` | FILE_BEGIN | `type[4]`, `creator[4]`, `finderFlags[2]`, `dataLen u32`, `rsrcLen u32`, `name` (Pascal) | — |
| `0x21` | FILE_DATA | `fork u8` (0 data, 1 resource), `offset u32`, bytes (≤ 512) | — |
| `0x22` | FILE_END | — | — (file is closed in “Platinum Inbox”) |
| `0x30` | SCREEN_FULL | — | screen stream, then reply |
| `0x31` | SCREEN_DELTA | — | screen stream with changed rows only, then reply |
| `0x40` | PEEK | `addr u32`, `len u16` (≤ 512) | the bytes |
| `0x41` | POKE | `addr u32`, bytes | — |
| `0x50` | LAUNCH | `name` (Pascal), an app in “Platinum Inbox” | — |
| `0x51` | LIST | — | repeated: `type[4]`, `creator[4]`, `size u32`, `name` (Pascal) |

The app retries `FILE_DATA` up to 3 times, so the agent must accept a repeated chunk (same fork and offset).

### Unsolicited frames (agent → app)

| Type | Name | Payload |
| --- | --- | --- |
| `0x7F` | HELLO | `major u8`, `minor u8`: sent when the agent starts |
| `0x10` | LOG | `level u8` (0 trace, 1 info, 2 warning, 3 error), `ticks u32`, `source` (Pascal), text (rest of the payload) |
| `0xB0` | SCREEN_INFO | `w u16`, `h u16`, `rowBytes u16`, `depth u8`: starts a screen stream |
| `0xB3` | SCREEN_CLUT | colour table: 2 reserved bytes, then `r g b` (8-bit) per entry, for depths ≤ 8 |
| `0xB1` | SCREEN_ROWS | `y u16`, `count u16`, rows compressed with PackBits |
| `0xB2` | SCREEN_END | — (frame complete) |

Pixels are in QuickDraw's layout: 1/2/4/8 bpp indexed (MSB first, 1 = black when there is no CLUT), 16 bpp `xRRRRRGGGGGBBBBB`, 32 bpp `xRGB`.

### Logging from your own programs

Programs built with Retro68 can log through the agent with `PDLog()`/`PDWarn()`/`PDHex()`. These calls send `LOG` frames. If the agent isn't running, the program opens the Modem port itself.
