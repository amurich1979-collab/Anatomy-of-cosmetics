import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = fileURLToPath(new URL("..", import.meta.url));
const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
const commands = [
  [process.execPath, ["--test", "audit/t01-known-defects.test.mjs"]],
  [python, ["audit/t01-browser-regressions.py"]]
];

let failed = false;
for (const [command, args] of commands) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) failed = true;
}

process.exitCode = failed ? 1 : 0;
