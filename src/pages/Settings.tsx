import { useEffect, useState } from "react";
import { useApp } from "@/state/store";
import type { AppInfo } from "@/shared/ipc";
import { PageHead, Seg, SettingRow, Toggle } from "@/ui/components";
import { PixelIcon } from "@/ui/icons";
import { playChime } from "@/lib/chime";
import { LANGUAGES, t } from "@/i18n";

const REPO_URL = "https://github.com/Marcm2003/platinum";

export function SettingsPage() {
  const { settings, patchSettings } = useApp();
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => { window.platinum.appInfo().then(setInfo); }, []);

  return (
    <div style={{ maxWidth: 760 }}>
      <PageHead kicker="Platinum" title={t("Settings")} />
      <div className="col" style={{ gap: 16 }}>
        <div className="card">
          <SettingRow title={t("Language")} desc={t("“System” follows your computer's language")}>
            <select className="select" style={{ width: 200 }} value={settings.language} onChange={(e) => patchSettings({ language: e.target.value as typeof settings.language })}>
              {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.value === "system" ? t("System") : l.label}</option>)}
            </select>
          </SettingRow>
          <SettingRow title={t("Appearance")} desc={t("Light, dark or the system setting")}>
            <Seg value={settings.theme} onChange={(v) => { patchSettings({ theme: v }); window.platinum.setTheme(v); }}
              options={[{ value: "system", label: t("System") }, { value: "light", label: t("Light") }, { value: "dark", label: t("Dark") }]} />
          </SettingRow>
          <SettingRow title={t("Startup chime")} desc={t("Plays when Platinum opens")}>
            <div className="row"><button className="btn sm" onClick={() => playChime()}>{t("Test")}</button><Toggle on={settings.chime} onChange={(v) => patchSettings({ chime: v })} /></div>
          </SettingRow>
          <SettingRow title={t("PC Ctrl as ⌘")} desc={t("In the emulator and over the bridge")}><Toggle on={settings.swapCmdCtrl} onChange={(v) => patchSettings({ swapCmdCtrl: v })} /></SettingRow>
        </div>
        <div className="win">
          <div className="win-bar"><span className="win-close" /><span className="win-title">{t("About Platinum")}</span></div>
          <div className="win-body row" style={{ gap: 16 }}>
            <PixelIcon name="happyMac" size={48} />
            <div className="small">
              <div className="strong" style={{ fontSize: 15 }}>Platinum {info?.version}</div>
              <div className="muted">Electron {info?.electron} · {info?.platform}</div>
              <div className="muted" style={{ marginTop: 6 }}>{t("Free software under the GPL-3.0-or-later licence. Embedded emulation: Infinite Mac (Apache-2.0). HFS sort table: libhfs (GPL). Not affiliated with Apple Inc.; Apple, Mac, Macintosh and Mac OS are trademarks of Apple Inc.")}</div>
              <div className="row" style={{ marginTop: 6, gap: 14 }}>
                <a className="tiny" onClick={() => window.platinum.openExternal(REPO_URL)}>{t("Source code")}</a>
                {info && <a className="tiny" onClick={() => window.platinum.reveal(info.userData)}>{t("Data folder")}</a>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
