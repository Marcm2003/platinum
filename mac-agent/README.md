# Platinum Agent

Platinum Agent is the small 68k application that runs on the classic Mac and talks to Platinum over the serial port. It handles file transfer to “Platinum Inbox”, the remote screen, memory peek/poke, app launching and `PDLog()` debug logging.

**Status: not published yet.** The protocol it speaks is fully specified in [`docs/protocol.md`](../docs/protocol.md), and the app side is implemented in `src/lib/link/agent.ts`. Until the agent lands here, the features that need it are disabled in the app: Remote screen, Debugger → Memory, “Send to Mac” in Disk Studio, and Build & run on the Mac. Everything else, including the emulator, Disk Studio and the ESP32 bridge's keyboard and mouse, works without it.

Planned layout:

```
mac-agent/
  CMakeLists.txt     Retro68 build (68k, System 6.0.8 – Mac OS 9)
  src/               the agent
  pdebug/            PDLog()/PDWarn()/PDHex() for your own Retro68 programs
```

Build (once it's here):

```sh
cmake -B build -DCMAKE_TOOLCHAIN_FILE=$RETRO68/toolchain/m68k-apple-macos/cmake/retro68.toolchain.cmake
cmake --build build
```

Contributions are welcome. If you'd like to help write it, open an issue first so we can coordinate.
