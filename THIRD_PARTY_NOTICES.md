# Third-party notices

Platinum is licensed under the GNU General Public License v3.0 or later (see `LICENSE`). It includes or uses the following third-party work.

## Bundled in the app

| Component | Licence | Used for |
| --- | --- | --- |
| [React](https://react.dev) and React DOM, with Scheduler (Meta Platforms, Inc. and affiliates) | MIT | User interface |
| [Zustand](https://github.com/pmndrs/zustand) (Paul Henschel) | MIT | App state |
| [Inter](https://rsms.me/inter/) by Rasmus Andersson, via Fontsource | SIL Open Font License 1.1 | Interface font |
| [Silkscreen](https://kottke.org/plus/type/silkscreen/) by Jason Kottke, via Fontsource | SIL Open Font License 1.1 | Pixel font |
| [Electron](https://www.electronjs.org) and Chromium | MIT and others | Desktop runtime. The installers ship Electron's own `LICENSE` and `LICENSES.chromium.html`. |

## Derived code

| Component | Licence | Where |
| --- | --- | --- |
| HFS catalog collation table from [hfsutils / libhfs](https://www.mars.org/home/rob/proj/hfs/) by Robert Leslie | GPL-2.0-or-later | `src/lib/hfs/macroman.ts` |

## Used at runtime, not bundled

| Component | Licence | Notes |
| --- | --- | --- |
| [Infinite Mac](https://infinitemac.org) by Mihai Parparita | Apache-2.0 | The embedded emulator is loaded from infinitemac.org inside the app. Its emulator cores (Mini vMac, Basilisk II, SheepShaver, DingusPPC and others) are under their own licences. |
| Mini vMac, Basilisk II, SheepShaver, QEMU | GPL-2.0 and others | Native emulators you download and point Platinum at. Not included. |

## Firmware libraries (built by you with arduino-cli)

| Component | Licence |
| --- | --- |
| Arduino core for ESP32 (Espressif) | LGPL-2.1 |
| [NimBLE-Arduino](https://github.com/h2zero/NimBLE-Arduino) | Apache-2.0 |
| [arduinoWebSockets](https://github.com/Links2004/arduinoWebSockets) | LGPL-2.1 |
| [ArduinoJson](https://arduinojson.org) | MIT |

## Test-only

| Component | Licence |
| --- | --- |
| [machfs](https://github.com/elliotnunn/machfs) by Elliot Nunn, used by `tests/hfs_ref.py` for cross-validation | MIT |

## Trademarks and ROMs

Apple, Macintosh, Mac, Mac OS, Apple Desktop Bus and the Apple logo are trademarks of Apple Inc. Platinum isn't affiliated with or endorsed by Apple Inc.

Platinum doesn't include any Apple ROM, system software or other copyrighted Apple code. The native emulators need a ROM image from a Macintosh you own.
