import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { privateTempRoot } from "./vitest.config.ts";

/**
 * The records suite (REQ-PROVE-025): the cases that read the committed records — the run ledgers,
 * the deferral inbox, the plans and the specs they name — run here, through `npm run test:records`,
 * and `npm test` runs none of them (`vitest.config.ts` excludes `test/records/`).
 *
 * `test/support/recordsPresent.ts` runs first and fails the whole run, naming
 * `node scripts/records.mjs restore`, when the records are not on disk; then the private temp root
 * `vitest.config.ts` sets up for every run. The case budget is the leak-gate budget,
 * `GATE_RUN_TIMEOUT_MS` in `test/support/leakGateRun.ts`.
 */
const tempRoot = privateTempRoot(
  fileURLToPath(new URL("./test/support/globalSetup.ts", import.meta.url)),
  tmpdir(),
  process.pid,
);

export default defineConfig({
  test: {
    include: ["test/records/**/*.test.ts"],
    environment: "node",
    testTimeout: 180_000,
    ...tempRoot,
    globalSetup: ["test/support/recordsPresent.ts", ...[tempRoot.globalSetup ?? []].flat()],
  },
});
