# Platinum Agent for 68k Macs (System 6.0.8 – Mac OS 9). Build with Retro68:
#   cmake -B build -DCMAKE_TOOLCHAIN_FILE=$RETRO68/toolchain/m68k-apple-macos/cmake/retro68.toolchain.cmake
#   cmake --build build
# Produces build/PlatinumAgent.bin (MacBinary), .dsk and .APPL.

cmake_minimum_required(VERSION 3.13)
project(PlatinumAgent C)

add_application(PlatinumAgent
  src/main.c
  src/protocol.c
  src/serial.c
  src/handlers.c
  src/screen.c
  src/logqueue.c
  src/agent.r
  CREATOR "PLAT"
  TYPE "APPL"
)
target_compile_options(PlatinumAgent PRIVATE -Os -Wall -Wno-multichar -Wno-pointer-sign -ffunction-sections)
set_target_properties(PlatinumAgent PROPERTIES LINK_FLAGS "-Wl,-gc-sections")

# Example program that logs through pdebug, handy for trying the Debugger console.
add_application(PDebugDemo
  pdebug/demo.c
  pdebug/pdebug.c
  src/protocol.c
  CREATOR "PDdm"
  TYPE "APPL"
)
target_compile_options(PDebugDemo PRIVATE -Os -Wall -Wno-multichar -Wno-pointer-sign)
