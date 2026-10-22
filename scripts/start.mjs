// Start the built app. Editors built on Electron (VS Code) export ELECTRON_RUN_AS_NODE,
// which would make Electron run as plain Node, so drop it.
import { spawn } from "node:child_process";
import electronPath from "electron";

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
spawn(electronPath, [".", ...process.argv.slice(2)], { stdio: "inherit", env }).on("exit", (c) => process.exit(c ?? 0));
