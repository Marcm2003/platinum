import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./app/App";
import { loadSettings, useApp } from "./state/store";
import { playChime } from "./lib/chime";
import { resolveLang, setLang } from "./i18n";

// Pick the OS language straight away; the saved preference (if any) replaces it once settings load.
setLang(resolveLang("system"));
document.documentElement.dataset.platform = window.platinum.platform;

loadSettings().then(() => {
  const { settings } = useApp.getState();
  document.documentElement.dataset.theme = settings.theme === "system" ? "" : settings.theme;
  if (settings.chime) { try { playChime(); } catch { /* audio blocked */ } }
});

createRoot(document.getElementById("root")!).render(<App />);
