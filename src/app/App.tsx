import { useEffect, useRef, useState, type ReactNode } from "react";
import { useApp, type Page } from "@/state/store";
import { PixelIcon, type PixelName } from "@/ui/icons";
import { DevicePickers, LinkPill, Toasts } from "@/ui/components";
import { Home } from "@/pages/Home";
import { Emulator } from "@/pages/Emulator";
import { Hardware } from "@/pages/Hardware";
import { Input } from "@/pages/Input";
import { Disks } from "@/pages/Disks";
import { Screen } from "@/pages/Screen";
import { Debug } from "@/pages/Debug";
import { SettingsPage } from "@/pages/Settings";
import { N_, t } from "@/i18n";

const NAV: { section: string; items: { id: Page; label: string; icon: PixelName }[] }[] = [
  { section: "", items: [{ id: "home", label: N_("Home"), icon: "home" }] },
  {
    section: N_("Macintosh"),
    items: [
      { id: "emulator", label: N_("Emulator"), icon: "happyMac" },
      { id: "disks", label: N_("Disk Studio"), icon: "floppy" },
      { id: "screen", label: N_("Remote screen"), icon: "screen" },
      { id: "debug", label: N_("Debugger"), icon: "bug" },
    ],
  },
  {
    section: N_("ESP32 bridge"),
    items: [
      { id: "hardware", label: N_("Hardware & link"), icon: "chip" },
      { id: "input", label: N_("Keyboard & mouse"), icon: "keyboard" },
    ],
  },
  { section: "", items: [{ id: "settings", label: N_("Settings"), icon: "gear" }] },
];

const TITLES: Record<Page, string> = Object.fromEntries(NAV.flatMap((s) => s.items).map((it) => [it.id, it.label])) as Record<Page, string>;

const FLUSH: Page[] = ["emulator"];

export function App() {
  const { page, go, status, agentOnline, sysinfo, settings } = useApp();
  const contentRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme === "system" ? "" : settings.theme;
  }, [settings.theme]);

  useEffect(() => { contentRef.current?.scrollTo(0, 0); setScrolled(false); }, [page]);

  const pages: Record<Page, ReactNode> = {
    home: <Home />, emulator: null, hardware: <Hardware />, input: <Input />,
    disks: <Disks />, screen: <Screen />, debug: <Debug />, settings: <SettingsPage />,
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><PixelIcon name="happyMac" size={20} style={{ color: "#1d1d1f", ["--icon-fill" as string]: "#fff" }} /></div>
          <div>
            <div className="brand-name">Platinum</div>
            <div className="brand-sub">Classic Mac Workbench</div>
          </div>
        </div>
        <div className="rainbow" />
        <nav>
          {NAV.map((sec, i) => (
            <div key={i}>
              {sec.section && <div className="nav-section">{t(sec.section)}</div>}
              {sec.items.map((it) => (
                <button key={it.id} className={`nav-item ${page === it.id ? "active" : ""}`} onClick={() => go(it.id)}>
                  <span className="nav-icon"><PixelIcon name={it.icon} size={16} /></span>
                  {t(it.label)}
                  {it.id === "hardware" && status === "connected" && <span className="nav-badge" />}
                  {it.id === "debug" && agentOnline && <span className="nav-badge" />}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          {sysinfo ? (
            <div className="row">
              <PixelIcon name="happyMac" size={22} />
              <div style={{ minWidth: 0 }}>
                <div className="strong" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sysinfo.machineName}</div>
                <div className="tiny muted">System {sysinfo.systemVersion} · {Math.round(sysinfo.physicalRam / 1048576)} MB</div>
              </div>
            </div>
          ) : (
            <div className="row">
              <PixelIcon name="happyMac" size={22} style={{ opacity: 0.4 }} />
              <div>
                <div className="strong">{t("No real Mac")}</div>
                <div className="tiny muted">{status === "connected" ? t("Waiting for the agent…") : t("Connect the bridge")}</div>
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className="main">
        <header className={`topbar ${scrolled ? "scrolled" : ""}`}>
          <div className="topbar-title">{t(TITLES[page])}</div>
          <div className="spacer" />
          <LinkPill />
        </header>
        {/* The emulator stays mounted so the emulated Mac keeps running while you browse other pages. */}
        <div className="content flush" style={{ display: page === "emulator" ? undefined : "none" }}>
          <Emulator active={page === "emulator"} />
        </div>
        {!FLUSH.includes(page) && (
          <div ref={contentRef} className="content" onScroll={(e) => setScrolled((e.target as HTMLElement).scrollTop > 4)}>
            {pages[page]}
          </div>
        )}
      </main>
      <DevicePickers />
      <Toasts />
    </div>
  );
}
