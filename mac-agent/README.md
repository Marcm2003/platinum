# Platinum Agent

Platinum Agent is a small 68k application for the classic Mac. It talks to Platinum over the Mac's serial port and provides:

- file transfer into a “Platinum Inbox” folder, with both forks and the type/creator codes,
- the remote screen (1–32 bpp, sending only the rows that changed),
- memory peek and poke,
- launching apps from the inbox (System 7 and later),
- relaying `PDLog()` messages from your own programs to Platinum's Debugger console.

It runs from System 6.0.8 to Mac OS 9, keeps working in the background, and shows a small status window. The protocol is specified in [`docs/protocol.md`](../docs/protocol.md).

## Status

| What | Tested |
| --- | --- |
| Launches, status window, menus, background operation | ✅ System 7.5.3 on a Quadra 650 (Infinite Mac) |
| `PDLog()` relay through the agent | ✅ Same setup, with `PDebugDemo` |
| Framing, CRC-16 and PackBits | ✅ Cross-checked against the app's TypeScript by `npm test` |
| Serial link to the app (file transfer, screen, peek/poke) | 🧪 Not yet tested on a real Mac: the emulator has no serial port. Reports welcome! |

## Getting it onto a Mac

Platinum releases include the agent. In the app, go to **Debugger → Platinum Agent** and choose **Make the floppy** (a 1.44 MB DiskCopy image for FloppyEmu, Greaseweazle or a BlueSCSI SD card) or **Try it in the emulator**. Open it, plug the bridge or a USB-RS422 cable into the **Modem** port (or pick the Printer port from the **Port** menu), and put it in Startup Items if you want it to start by itself.

## Building

The easiest route is Retro68's Docker image, which works on Windows, macOS and Linux:

```sh
docker run --rm -v "$PWD:/src" -w /src ghcr.io/autc04/retro68 sh -c \
  "cmake -B build -DCMAKE_TOOLCHAIN_FILE=/Retro68-build/toolchain/m68k-apple-macos/cmake/retro68.toolchain.cmake && cmake --build build"
```

Or, with a local [Retro68](https://github.com/autc04/Retro68) toolchain:

```sh
cmake -B build -DCMAKE_TOOLCHAIN_FILE=$RETRO68/toolchain/m68k-apple-macos/cmake/retro68.toolchain.cmake
cmake --build build
```

You get `build/PlatinumAgent.bin` (MacBinary) and `.dsk`, plus `PDebugDemo`, a tiny program that logs a few lines. Platinum picks up `build/PlatinumAgent.bin` automatically when you run it from source.

## Logging from your programs (pdebug)

Add `pdebug/pdebug.c` and `src/protocol.c` to your Retro68 project, then:

```c
#include "pdebug.h"

PDInit();
PDLog("Hello from the Mac! x=%d", x);
PDWarn("Low memory: %ld", FreeMem());
PDHex("buffer", buf, 64);
```

If the agent is running, messages go through it. If it isn't, `pdebug` opens the Modem port itself.

## Layout

| Path | What's there |
| --- | --- |
| `src/main.c` | Event loop, status window, menus |
| `src/protocol.c` | Framing, CRC-16/XMODEM, PackBits. Portable C, also built on the host by `test/host_test.c`. |
| `src/serial.c` | Serial Driver (`.AIn`/`.AOut`, `.BIn`/`.BOut`) with a 16 KB input buffer |
| `src/handlers.c` | Requests: sysinfo, files, peek/poke, launch, list |
| `src/screen.c` | Screen capture with per-row fingerprints for deltas |
| `src/logqueue.c` | The `'PDbg'` Gestalt queue for `pdebug` |
| `pdebug/` | The logging library and `PDebugDemo` |

A note for Retro68 users: the Multiversal interfaces define `NewGestalt` with the `_Gestalt` trap (`A1AD`) instead of `_NewGestalt` (`A3AD`), so it just looks the selector up. `src/logqueue.c` issues the right trap itself.
