// Host-path helpers for the renderer (no Node `path` here). Paths come from the main process
// in the host's own format, so join with the host separator.

const isWindows = () => window.platinum.platform === "win32";

export const joinPath = (...parts: string[]) => parts.join(isWindows() ? "\\" : "/");

/** Example paths for placeholders, in the host's style. */
export const examplePath = (win: string, unix: string) => (isWindows() ? win : unix);
