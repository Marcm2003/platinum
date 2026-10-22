// KeyboardEvent.code → Apple ADB virtual key codes (Apple Extended Keyboard layout).
// The firmware translates ADB codes to M0110 scan codes for Mac 128K/512K/Plus.

export const ADB_KEYS: Record<string, number> = {
  KeyA: 0x00, KeyS: 0x01, KeyD: 0x02, KeyF: 0x03, KeyH: 0x04, KeyG: 0x05, KeyZ: 0x06, KeyX: 0x07,
  KeyC: 0x08, KeyV: 0x09, IntlBackslash: 0x0a, KeyB: 0x0b, KeyQ: 0x0c, KeyW: 0x0d, KeyE: 0x0e, KeyR: 0x0f,
  KeyY: 0x10, KeyT: 0x11, Digit1: 0x12, Digit2: 0x13, Digit3: 0x14, Digit4: 0x15, Digit6: 0x16, Digit5: 0x17,
  Equal: 0x18, Digit9: 0x19, Digit7: 0x1a, Minus: 0x1b, Digit8: 0x1c, Digit0: 0x1d, BracketRight: 0x1e, KeyO: 0x1f,
  KeyU: 0x20, BracketLeft: 0x21, KeyI: 0x22, KeyP: 0x23, Enter: 0x24, KeyL: 0x25, KeyJ: 0x26, Quote: 0x27,
  KeyK: 0x28, Semicolon: 0x29, Backslash: 0x2a, Comma: 0x2b, Slash: 0x2c, KeyN: 0x2d, KeyM: 0x2e, Period: 0x2f,
  Tab: 0x30, Space: 0x31, Backquote: 0x32, Backspace: 0x33, Escape: 0x35,
  ControlLeft: 0x36, MetaLeft: 0x37, ShiftLeft: 0x38, CapsLock: 0x39, AltLeft: 0x3a,
  ArrowLeft: 0x3b, ArrowRight: 0x3c, ArrowDown: 0x3d, ArrowUp: 0x3e,
  ShiftRight: 0x7b, AltRight: 0x7c, ControlRight: 0x7d, MetaRight: 0x37,
  NumpadDecimal: 0x41, NumpadMultiply: 0x43, NumpadAdd: 0x45, NumLock: 0x47, NumpadDivide: 0x4b,
  NumpadEnter: 0x4c, NumpadSubtract: 0x4e, NumpadEqual: 0x51,
  Numpad0: 0x52, Numpad1: 0x53, Numpad2: 0x54, Numpad3: 0x55, Numpad4: 0x56, Numpad5: 0x57,
  Numpad6: 0x58, Numpad7: 0x59, Numpad8: 0x5b, Numpad9: 0x5c,
  F1: 0x7a, F2: 0x78, F3: 0x63, F4: 0x76, F5: 0x60, F6: 0x61, F7: 0x62, F8: 0x64,
  F9: 0x65, F10: 0x6d, F11: 0x67, F12: 0x6f, F13: 0x69, F14: 0x6b, F15: 0x71,
  Insert: 0x72, Home: 0x73, PageUp: 0x74, Delete: 0x75, End: 0x77, PageDown: 0x79,
};

/** On a PC keyboard people expect Ctrl to behave like ⌘; optionally swap. */
export function adbCodeFor(code: string, swapCmdCtrl: boolean): number | undefined {
  if (swapCmdCtrl) {
    if (code === "ControlLeft") return ADB_KEYS.MetaLeft;
    if (code === "MetaLeft") return ADB_KEYS.ControlLeft;
  }
  return ADB_KEYS[code];
}

export const ADB_POWER_KEY = 0x7f;

export const ADB_KEY_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(ADB_KEYS).map(([k, v]) => [v, k.replace(/^Key|^Digit/, "")]),
);
