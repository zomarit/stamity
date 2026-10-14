import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The records suite's global setup (REQ-PROVE-025): `npm run test:records` reads the committed
 * records at their usual repo-root paths, so a checkout that does not carry them fails here, before
 * any case runs, rather than passing a gate over nothing.
 *
 * Four locations are checked, each for at least one entry: a run folder under `.stamity/runs/`
 * holding a `ledger.jsonl`, a markdown plan under `docs/plans/`, an eval run folder under
 * `evals/runs/` named `<YYYY-MM-DD>-run-<n>`, and a merge-ready measurement under
 * `evals/measurements/`. Each is read from disk, never through git, so a restored copy counts the
 * same as a tracked one.
 */

/** Repo root, resolved from this file rather than from the process cwd. */
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

const ABSENT =
  "The records are not in this checkout. Run `node scripts/records.mjs restore` " +
  "(a fresh clone: `node scripts/records.mjs setup`), then `npm run test:records`.";

const EVAL_RUN = /^\d{4}-\d{2}-\d{2}-run-\d+$/;
const MEASUREMENT = /^merge-ready-.+\.json$/;

/** The entries of one folder under `root`, or none where the folder is absent. */
function entriesOf(root: string, segments: readonly string[]) {
  const dir = join(root, ...segments);
  return existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : [];
}

/** What each location needs, by the name a failure prints. */
const LOCATIONS: readonly { readonly name: string; readonly holds: (root: string) => boolean }[] = [
  {
    name: "a run ledger (.stamity/runs/<run>/ledger.jsonl)",
    holds: (root) =>
      entriesOf(root, [".stamity", "runs"]).some(
        (entry) => entry.isDirectory() && existsSync(join(root, ".stamity", "runs", entry.name, "ledger.jsonl")),
      ),
  },
  {
    name: "a plan (docs/plans/<name>.md)",
    holds: (root) => entriesOf(root, ["docs", "plans"]).some((entry) => entry.isFile() && entry.name.endsWith(".md")),
  },
  {
    name: "an eval run folder (evals/runs/<YYYY-MM-DD>-run-<n>/)",
    holds: (root) => entriesOf(root, ["evals", "runs"]).some((entry) => entry.isDirectory() && EVAL_RUN.test(entry.name)),
  },
  {
    name: "a merge-ready measurement (evals/measurements/merge-ready-<date>.json)",
    holds: (root) =>
      entriesOf(root, ["evals", "measurements"]).some((entry) => entry.isFile() && MEASUREMENT.test(entry.name)),
  },
];

/** Throws the setup message, naming each missing location, unless `root` carries all four. */
export function assertRecordsPresent(root: string): void {
  const missing = LOCATIONS.filter((location) => !location.holds(root)).map((location) => location.name);
  if (missing.length > 0) throw new Error(`${ABSENT}\nMissing: ${missing.join("; ")}.`);
}

/** Vitest's global-setup entry: the check, over this checkout. */
export default function recordsPresent(): void {
  assertRecordsPresent(REPO_ROOT);
}
