<p align="center">
  <img src="build/icon.png" width="128" alt="Platinum icon: a beige compact computer">
</p>

<h1 align="center">Platinum</h1>

<p align="center"><b>Classic Mac workbench: emulate, bridge real hardware, move files, debug.</b></p>

<p align="center">
  <a href="https://github.com/Marcm2003/platinum/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/Marcm2003/platinum?include_prereleases&label=download"></a>
  <a href="https://github.com/Marcm2003/platinum/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Marcm2003/platinum/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="Licence: GPL-3.0-or-later" src="https://img.shields.io/badge/licence-GPL--3.0--or--later-blue"></a>
  <img alt="Windows, macOS and Linux" src="https://img.shields.io/badge/platforms-Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-lightgrey">
</p>

<p align="center">
  <img src="docs/images/emulator-boot.gif" width="640" alt="System 7.5.3 booting inside Platinum's embedded emulator">
</p>

Platinum is a desktop app for people who love the Macs of 1984–2001. It puts everything you need in one window: an emulator for every System release, a disk tool that speaks HFS, and a step-by-step guide to building an inexpensive ESP32 bridge that gives your real Mac a Bluetooth keyboard and mouse and a wireless serial link.

## What it does

| | |
| --- | --- |
| **Emulator.** Boot anything from System 1.0 to Mac OS 9.2.2 (and Mac OS X 10.1) inside the app, powered by [Infinite Mac](https://infinitemac.org). Pick the machine, screen size and scale, and insert your own disk images on the fly. Prefer native emulators? Platinum builds the command line for Mini vMac, Basilisk II, SheepShaver and QEMU. | <img src="docs/images/emulator.png" alt="The emulator page running System 7.5.3"> |
| **Disk Studio.** Open, create and edit HFS disk images: DiskCopy 4.2 floppies, raw `.dsk`/`.img`, and partitioned hard-disk images for BlueSCSI, ZuluSCSI or emulators. Drag files in from your computer: MacBinary and BinHex are decoded, text is converted to MacRoman, and type/creator codes and resource forks are kept. Then boot the disk in the emulator with one click. | <img src="docs/images/disk-studio.png" alt="Disk Studio browsing an HFS volume"> |
| **ESP32 bridge.** Choose your Mac and your board and Platinum draws the exact wiring, pin by pin, with a parts list and the gotchas. Flash the firmware from the app. The bridge then acts as an ADB or M0110 keyboard and mouse (type from your PC or pair Bluetooth ones) and carries the Mac's RS-422 serial port over USB, WiFi or Bluetooth. | <img src="docs/images/hardware.png" alt="The interactive wiring diagram for a Macintosh SE"> |

Plus a **remote screen** and a **debugger** (live `PDLog()` console, memory peek/poke, build → send → run with Retro68) for when Platinum Agent runs on the real Mac — see [Status](#status).

The interface is in **English** and **Catalan**, with light and dark themes.

<p align="center"><img src="docs/images/home-dark.png" width="720" alt="Platinum's home page in dark mode"></p>

## Download

Get the latest version from **[Releases](https://github.com/Marcm2003/platinum/releases/latest)**:

| System | File | Notes |
| --- | --- | --- |
| Windows 10/11 (x64) | `Platinum-…-win-x64.exe` | The installer isn't code-signed yet, so SmartScreen may warn you: choose **More info → Run anyway**. |
| macOS 12+ (Apple silicon and Intel) | `Platinum-…-mac-universal.dmg` | Not notarised yet. The first time, right-click the app → **Open**, or run `xattr -dr com.apple.quarantine /Applications/Platinum.app`. |
| Linux (x64) | `Platinum-….AppImage` | `chmod +x` it and run it. For USB serial, add yourself to the `dialout` group (or `uucp` on Arch) and log in again. On Ubuntu 24.04+, if it won't start, run it with `--no-sandbox`. |

The embedded emulator needs an Internet connection the first time it loads a system.

## Status

Platinum is young (v0.1). Here's where each part stands:

| Part | Status |
| --- | --- |
| Embedded emulator (Infinite Mac) | ✅ Works |
| Native emulator launcher | ✅ Works (bring your own emulator and ROM) |
| Disk Studio (HFS read/write, MacBinary, BinHex, DiskCopy 4.2, partitioned images) | ✅ Works, cross-tested against [machfs](https://github.com/elliotnunn/machfs). MFS (System 1–2) and HFS+ aren't supported yet. |
| ESP32 bridge firmware: ADB / M0110 keyboard and mouse, BLE HID, serial over USB/WiFi/BLE | 🧪 Feedback from real hardware very welcome |
| Platinum Agent for the Mac (remote screen, file transfer, debugger) | 🚧 Not published yet: the [protocol](docs/protocol.md) is specified and the app side is done |

## Build the bridge

Everything is in **[docs/hardware.md](docs/hardware.md)**: board choice, pin maps, wiring tables for each Mac family, connector pinouts, the parts list and a first-power-on checklist. The same information is interactive in the app under **Hardware & link**.

A typical ADB build is an ESP32-S3 dev board, a BSS138 level shifter, a MAX3488 RS-422 transceiver, a 2N7000 MOSFET and two cables (S-Video for ADB, a Mac printer cable for serial).

> [!WARNING]
> Vintage Macs are irreplaceable. Check every wire with a multimeter before plugging anything in, and never connect +12 V.

## Build from source

You need [Node.js](https://nodejs.org) 22 or newer. The HFS tests also need Python 3 with `pip install machfs`, which they use as a reference implementation.

```sh
git clone https://github.com/Marcm2003/platinum.git
cd platinum
npm ci
npm run dev        # app with hot reload
npm test           # HFS tests + translation check
npm run dist       # installer for your OS in release/
```

| Path | What's there |
| --- | --- |
| `src/` | The app (React + TypeScript). `src/lib/hfs` is a standalone HFS implementation, `src/lib/hardware` holds the wiring data, `src/lib/link` the bridge and agent protocols. |
| `electron/` | Main process: windows, file dialogs, the local disk server for the emulator, device pickers. |
| `firmware/platinum-bridge/` | The ESP32 Arduino sketch. |
| `mac-agent/` | Platinum Agent for the Mac (coming soon). |
| `docs/` | Hardware guide, protocol spec and screenshots. |
| `scripts/` | Dev, build, test, docs and screenshot scripts. |

### Translations

Strings live in the code in English, wrapped in `t("…")`, and `src/i18n/ca.ts` maps them to Catalan. `npm test` fails if a translation is missing or stale. To add a language, copy `ca.ts`, translate the values and register it in `src/i18n/index.ts`.

## Contributing

Bug reports, photos of your bridge build, translations and pull requests are all welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Credits and licence

Platinum is free software under the [GNU GPL v3.0 or later](LICENSE).

The embedded emulator is [Infinite Mac](https://infinitemac.org) by Mihai Parparita (Apache-2.0), which is loaded from infinitemac.org. Thank you, Mihai. The HFS catalog collation table comes from Robert Leslie's [hfsutils](https://www.mars.org/home/rob/proj/hfs/). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for everything else.

Platinum doesn't include any Apple ROM or system software. Apple, Macintosh, Mac and Mac OS are trademarks of Apple Inc. Platinum isn't affiliated with or endorsed by Apple.
