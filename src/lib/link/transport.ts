// Byte transports to the Platinum Bridge (ESP32) or straight to the Mac's serial port.

import { t } from "@/i18n";

export type TransportKind = "usb" | "wifi" | "ble" | "direct";

export interface Transport {
  kind: TransportKind;
  label: string;
  send(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
  onData: (data: Uint8Array) => void;
  onClose: (reason?: string) => void;
}

const noop = () => {};

/** Web Serial (USB CDC of the ESP32, or a USB-RS422 adapter wired to the Mac). */
export async function openSerial(kind: "usb" | "direct", baudRate: number): Promise<Transport> {
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate, bufferSize: 64 * 1024 });
  const info = port.getInfo();
  const link: Transport = {
    kind,
    label: `${kind === "usb" ? "USB" : t("Direct serial")} · ${info.usbVendorId ? `${info.usbVendorId.toString(16)}:${info.usbProductId?.toString(16)}` : "port"} · ${baudRate} bps`,
    onData: noop,
    onClose: noop,
    async send(data) {
      const w = port.writable!.getWriter();
      try { await w.write(data); } finally { w.releaseLock(); }
    },
    async close() {
      closed = true;
      try { await reader?.cancel(); } catch { /* already closed */ }
      try { await port.close(); } catch { /* already closed */ }
    },
  };
  let closed = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  (async () => {
    while (port.readable && !closed) {
      reader = port.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) link.onData(value);
        }
      } catch (e) {
        if (!closed) { link.onClose(String(e)); return; }
      } finally {
        reader.releaseLock();
      }
    }
    link.onClose();
  })();
  return link;
}

/** WebSocket to the bridge on the LAN (firmware serves ws://<ip>:81/). */
export function openWebSocket(host: string): Promise<Transport> {
  return new Promise((resolve, reject) => {
    const url = host.startsWith("ws") ? host : `ws://${host}:81/`;
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    const enc = new TextEncoder();
    const link: Transport = {
      kind: "wifi",
      label: `WiFi · ${host}`,
      onData: noop,
      onClose: noop,
      async send(data) { ws.send(data as Uint8Array<ArrayBuffer>); },
      async close() { ws.close(); },
    };
    const timer = setTimeout(() => { ws.close(); reject(new Error(t("No response from {url}", { url }))); }, 5000);
    ws.onopen = () => { clearTimeout(timer); resolve(link); };
    ws.onerror = () => { clearTimeout(timer); reject(new Error(t("Could not connect to {url}", { url }))); };
    ws.onclose = () => link.onClose();
    ws.onmessage = (e) => link.onData(typeof e.data === "string" ? enc.encode(e.data + "\n") : new Uint8Array(e.data));
  });
}

// Nordic UART Service, as exposed by the firmware over BLE.
const NUS = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

export async function openBle(): Promise<Transport> {
  const device = await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: "Platinum" }], optionalServices: [NUS] });
  const server = await device.gatt!.connect();
  const svc = await server.getPrimaryService(NUS);
  const rx = await svc.getCharacteristic(NUS_RX);
  const tx = await svc.getCharacteristic(NUS_TX);
  const link: Transport = {
    kind: "ble",
    label: `BLE · ${device.name ?? device.id}`,
    onData: noop,
    onClose: noop,
    async send(data) {
      for (let i = 0; i < data.length; i += 180) await rx.writeValueWithoutResponse(data.subarray(i, i + 180) as Uint8Array<ArrayBuffer>);
    },
    async close() { device.gatt?.disconnect(); },
  };
  tx.addEventListener("characteristicvaluechanged", () => {
    const v = tx.value!;
    link.onData(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
  });
  await tx.startNotifications();
  device.addEventListener("gattserverdisconnected", () => link.onClose());
  return link;
}
