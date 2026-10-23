// Hardware & link → Mac network: the bridge answers the Mac's PPP connection as if it were a
// modem and routes it to WiFi (firmware/platinum-bridge/macnet.cpp). The Mac uses the PPP
// software of its day, so this page is mostly a guide to setting that up.

import { useState } from "react";
import { useApp } from "@/state/store";
import { Seg, SettingRow, fmtBytes } from "@/ui/components";
import { Icon } from "@/ui/icons";
import { t, tx } from "@/i18n";

type Stack = "mactcp" | "ot";

const STATE_LABEL = {
  off: () => t("Off"),
  waiting: () => t("Waiting for the Mac to dial"),
  connecting: () => t("Connecting…"),
  online: () => t("Online"),
};

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="step" style={{ alignItems: "flex-start" }}>
      <div className="step-num">{n}</div>
      <div className="grow"><div className="strong">{title}</div><div className="small muted">{children}</div></div>
    </div>
  );
}

export function MacNetwork() {
  const { status, bridge, info } = useApp();
  const live = status === "connected" && bridge && !bridge.direct && info;
  const net = info?.serial === "net";
  const state = info?.net?.state ?? "off";
  const homeWifi = !!info?.ip && !info.ssid?.startsWith("Platinum-");

  return (
    <div className="col" style={{ gap: 16 }}>
        <div className="card">
          <div className="card-head"><h3>{t("Mac network")}</h3></div>
          <div className="list-row small muted">{t("The bridge answers the Mac like a modem and connects it to your WiFi network, so the Mac gets its own IP address. No drivers to install: the Mac uses the PPP software of its day.")}</div>
          {live ? (
            <>
              <SettingRow title={t("Serial port")} desc={net ? t("Platinum Agent is unavailable while the Mac is on the network.") : t("The Modem port carries Platinum Agent.")}>
                <Seg value={net ? "net" : "agent"} onChange={(v) => bridge!.configure({ serial: v })}
                  options={[{ value: "agent", label: "Platinum Agent" }, { value: "net", label: t("Network") }]} />
              </SettingRow>
              {net && (
                <>
                  <SettingRow title={t("Link")} desc={state === "online" && info.net?.ip ? tx("The Mac is {ip}", { ip: <code>{info.net.ip}</code> }) : t("Start the connection on the Mac (step 4).")}>
                    <span className={`pill ${state === "online" ? "ok" : ""}`}>{STATE_LABEL[state]()}</span>
                  </SettingRow>
                  <SettingRow title={t("Traffic")} desc={t("At 57600 bps, about 5 KB/s.")}>
                    <span className="mono small">↑ {fmtBytes(info.net?.in ?? 0)} · ↓ {fmtBytes(info.net?.out ?? 0)}</span>
                  </SettingRow>
                </>
              )}
              {!homeWifi && <div className="list-row small" style={{ color: "var(--warn)" }}><Icon name="warn" size={13} /> {t("The bridge isn't on your home network yet, so the Mac will only reach the bridge. Set up its WiFi in “Bridge & network”.")}</div>}
            </>
          ) : (
            <div className="list-row small muted">{t("Connect the bridge (USB, WiFi or Bluetooth) to turn this on.")}</div>
          )}
        </div>

      <div className="grid" style={{ gridTemplateColumns: "1.3fr 1fr", alignItems: "start" }}>
        <SetupGuide />
        <div className="card card-pad col" style={{ gap: 8 }}>
          <h3>{t("Things to try")}</h3>
          <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            <li>{tx("The web, simplified for old browsers: {a} and {b}.", { a: <code>http://frogfind.com</code>, b: <code>http://68k.news</code> })}</li>
            <li>{t("FTP with Fetch, Telnet, IRC and email from the period.")}</li>
            <li>{tx("Files from a NAS: with Netatalk on the NAS and Mac OS 8 or later, open the Chooser → AppleShare → {b}.", { b: <b>Server IP Address</b> })}</li>
          </ul>
          <div className="hint">{t("Secure (https) sites won't open: old browsers don't speak modern encryption.")}</div>
        </div>
      </div>
    </div>
  );
}

function SetupGuide() {
  const [stack, setStack] = useState<Stack>("ot");
  return (
      <div className="card">
        <div className="card-head"><h3>{t("Set up the Mac")}</h3>
          <div className="right"><Seg value={stack} onChange={setStack} options={[{ value: "mactcp", label: "System 7 · MacTCP" }, { value: "ot", label: "Open Transport" }]} /></div>
        </div>
        <div className="list-row small muted">{stack === "ot" ? t("Mac OS 7.6 to 9.2 come with everything you need. On System 7.5.3, install Open Transport PPP first.") : t("System 7.0 to 7.5. Needs MacTCP and a PPP control panel.")}</div>
        <div className="steps">
          <Step n={1} title={t("Wire the serial port")}>{t("The same cable as for Platinum Agent: the bridge to the Mac's Modem port. Set the serial port above to “Network”.")}</Step>
          {stack === "mactcp" ? (
            <>
              <Step n={2} title={t("Install MacTCP and a PPP control panel")}>{tx("MacTCP 2.0.6 and {a} or {b}, from period CDs or archives such as Macintosh Garden.", { a: <b>MacPPP 2.0.1</b>, b: <b>FreePPP 2.6.2</b> })}</Step>
              <Step n={3} title={t("Configure them")}>{tx("In MacTCP choose {ppp} and set addressing to {server}; under More…, set the name server to your router's address. In the PPP panel choose the {port} at {baud} bps with a {hw} connection, or any Hayes modem with phone number {num}, and no authentication.", { ppp: <b>PPP</b>, server: <b>Server</b>, port: <b>Modem port</b>, baud: <b>57600</b>, hw: <b>Hard-wired</b>, num: <code>1</code> })}</Step>
              <Step n={4} title={t("Connect")}>{tx("Press {open} in the PPP panel. The status above changes to Online.", { open: <b>Open</b> })}</Step>
            </>
          ) : (
            <>
              <Step n={2} title={t("Modem control panel")}>{tx("Connect via {port}, any Hayes-compatible modem script, sound off, and tick {ignore}.", { port: <b>Modem Port</b>, ignore: <b>Ignore dial tone</b> })}</Step>
              <Step n={3} title={t("TCP/IP control panel")}>{tx("Connect via {ppp}, configure {server}.", { ppp: <b>PPP</b>, server: <b>Using PPP Server</b> })}</Step>
              <Step n={4} title={t("Remote Access: connect")}>{tx("Choose {guest} (or any name with no password), phone number {num}, and press {connect}. The status above changes to Online.", { guest: <b>Guest</b>, num: <code>1</code>, connect: <b>Connect</b> })}</Step>
            </>
          )}
        </div>
        <div className="list-row small muted"><span>{tx("The bridge answers modem commands and dials instantly, so any phone number works. The Mac gets {ip} and the bridge passes on your network's DNS server.", { ip: <code>172.31.73.2</code> })}</span></div>
      </div>
  );
}
