import { useEffect, useRef, useState } from "react";
import { t } from "@/i18n";

/** Run a shell command in the main process and stream its output. */
export function useCommand() {
  const [lines, setLines] = useState<{ s: "out" | "err" | "sys"; t: string }[]>([]);
  const [running, setRunning] = useState(false);
  const idRef = useRef("");

  useEffect(() => window.platinum.onCommandOutput((id, stream, text) => {
    if (id !== idRef.current) return;
    setLines((l) => [...l, ...text.split(/\r?\n/).filter(Boolean).map((t) => ({ s: stream, t }))].slice(-2000));
  }), []);

  const run = async (command: string, cwd?: string): Promise<number> => {
    const id = `cmd-${Date.now()}`;
    idRef.current = id;
    setRunning(true);
    setLines((l) => [...l, { s: "sys", t: `$ ${command}` }]);
    const code = await window.platinum.runCommand({ id, command, cwd });
    setLines((l) => [...l, { s: "sys", t: code === 0 ? t("✓ Done") : t("✗ Exited with code {code}", { code }) }]);
    setRunning(false);
    return code;
  };

  return { lines, running, run, clear: () => setLines([]), kill: () => window.platinum.killCommand(idRef.current) };
}
