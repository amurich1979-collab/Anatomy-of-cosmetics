import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["--test", "tests/t08-product-sources.live.test.js"], {
  cwd: process.cwd(),
  env: { ...process.env, LIVE_PRODUCT_SOURCES: "1" },
  stdio: "inherit"
});

process.exitCode = result.status ?? 1;
