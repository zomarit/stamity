/**
 * The prerequisites a change's added lines imply (REQ-FLOW-094): an
 * environment variable the new code reads, a key a `.env.example` gains, a
 * migration file added. The morning list carries each as a row marked
 * `inferred`, beside the rows a plan declares, so a person learns what must
 * be set before the change can merge, deploy or run.
 *
 * A row names the need and where it is read, never a value: only the name
 * group of each pattern is kept, and a `.env.example` line's right-hand side
 * is never read. Test paths are skipped, as a test sets what it reads.
 *
 * Read from the added lines alone, so a destructured read
 * (`const { X } = process.env`) or a name built at run time is not seen; the
 * rows are a prompt for the person, not a complete list.
 *
 * Pure: values in, rows out. Nothing here touches the filesystem.
 */

/** One prerequisite row as the morning list prints it. */
export interface PrereqRow {
  readonly kind: "env" | "migration";
  /** The variable's name, or the migration file's repo-relative path. */
  readonly name: string;
  /** `<path>:<line>` for a variable, the path for a migration. */
  readonly where: string;
  readonly setBy: "person";
  readonly blocks: "merge" | "deploy" | "run";
  readonly verified: false;
  readonly inferred: true;
}

/** The added lines of one file, as the change scan reads them. */
export interface PrereqFile {
  readonly path: string;
  readonly added: readonly { readonly line: number; readonly text: string }[];
}

const NAME = "[A-Za-z_][A-Za-z0-9_]*";

/**
 * The environment reads, each with its name in group `name`. The look-behind
 * keeps a longer identifier (`myprocess.env`, `MY_ENV[…]`) from reading as one.
 */
const ENV_READS: readonly RegExp[] = [
  new RegExp(`(?<![A-Za-z0-9_$.])process\\.env\\.(?<name>${NAME})`, "g"),
  new RegExp(`(?<![A-Za-z0-9_$.])process\\.env\\[\\s*(["'\`])(?<name>${NAME})\\1\\s*\\]`, "g"),
  new RegExp(`(?<![A-Za-z0-9_.])os\\.environ\\[\\s*(["'])(?<name>${NAME})\\1\\s*\\]`, "g"),
  new RegExp(`(?<![A-Za-z0-9_.])os\\.environ\\.get\\(\\s*(["'])(?<name>${NAME})\\1`, "g"),
  new RegExp(`(?<![A-Za-z0-9_.])os\\.getenv\\(\\s*(["'])(?<name>${NAME})\\1`, "g"),
  new RegExp(`(?<![A-Za-z0-9_.:])ENV\\[\\s*(["'])(?<name>${NAME})\\1\\s*\\]`, "g"),
  new RegExp(`(?<![A-Za-z0-9_.:])ENV\\.fetch\\(\\s*(["'])(?<name>${NAME})\\1`, "g"),
];

/** A `.env.example` key: `KEY=…` or `export KEY=…`; the value is never captured. */
const DOTENV_KEY = new RegExp(`^\\s*(?:export\\s+)?(?<name>${NAME})\\s*=`);
const DOTENV_EXAMPLE = /(?:^|\/)\.env\.example$/;
const MIGRATION_PATH = /(?:^|\/)(?:migrations|db\/migrate)\//;

/**
 * A test path: a `test`, `tests`, `__tests__` or `spec` folder, a
 * `*.test.*` or `*.spec.*` file, or a Python `test_*.py` or `*_test.py`.
 */
const TEST_PATH = /(?:^|\/)(?:test|tests|__tests__|spec)\/|\.(?:test|spec)\.[^/]+$|(?:^|\/)test_[^/]*\.py$|_test\.py$/;

/** Every prerequisite the added lines of `files` imply, one row per kind and name, at the first place it is read. */
export function inferPrerequisites(files: readonly PrereqFile[]): PrereqRow[] {
  const rows: PrereqRow[] = [];
  const seen = new Set<string>();
  const add = (row: PrereqRow): void => {
    const key = `${row.kind}\u0000${row.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  };
  for (const { path: rawPath, added } of files) {
    const path = rawPath.replace(/\\/g, "/");
    if (TEST_PATH.test(path) || added.length === 0) continue;
    if (MIGRATION_PATH.test(path)) {
      add({ kind: "migration", name: path, where: path, setBy: "person", blocks: "deploy", verified: false, inferred: true });
    }
    const dotenv = DOTENV_EXAMPLE.test(path);
    for (const { line, text } of added) {
      const found: { at: number; name: string }[] = [];
      if (dotenv) {
        const key = DOTENV_KEY.exec(text)?.groups?.["name"];
        if (key !== undefined) found.push({ at: 0, name: key });
      } else {
        for (const pattern of ENV_READS) {
          for (const match of text.matchAll(pattern)) {
            const name = match.groups?.["name"];
            if (name !== undefined) found.push({ at: match.index, name });
          }
        }
      }
      // The patterns run one after another, so a line reading two names is put back in column order.
      found.sort((a, b) => a.at - b.at);
      for (const { name } of found) {
        add({ kind: "env", name, where: `${path}:${line}`, setBy: "person", blocks: "run", verified: false, inferred: true });
      }
    }
  }
  return rows;
}
