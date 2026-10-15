import { describe, expect, it } from "vitest";
import { inferPrerequisites } from "../../src/runs/prerequisites.ts";

/**
 * u5-morning (REQ-FLOW-094): the prerequisites a change's added lines imply,
 * read from the diff and marked `inferred` on the morning list.
 *
 * Pure lane: the added lines are values, so no repository and no git are
 * involved. Every row names where a need is read and never a value.
 */

/** One file of added lines, numbered from `from`. */
const file = (path: string, lines: readonly string[], from = 1) => ({
  path,
  added: lines.map((text, at) => ({ line: from + at, text })),
});

const env = (name: string, where: string) => ({
  kind: "env",
  name,
  where,
  setBy: "person",
  blocks: "run",
  verified: false,
  inferred: true,
});

describe("inferPrerequisites", () => {
  it("reads each language's environment read as one env row naming where it is read", () => {
    const rows = inferPrerequisites([
      file("src/server.ts", ["const port = process.env.PORT_NUMBER;", 'const url = process.env["SERVICE_URL"];']),
      file("app/main.py", ['region = os.environ["CLOUD_REGION"]', "bucket = os.getenv('BUCKET_NAME', 'x')"], 10),
      file("lib/worker.rb", ['queue = ENV["QUEUE_NAME"]']),
    ]);

    expect(rows).toEqual([
      env("PORT_NUMBER", "src/server.ts:1"),
      env("SERVICE_URL", "src/server.ts:2"),
      env("CLOUD_REGION", "app/main.py:10"),
      env("BUCKET_NAME", "app/main.py:11"),
      env("QUEUE_NAME", "lib/worker.rb:1"),
    ]);
  });

  it("keeps one row per name across two files, at the first place it is read", () => {
    const rows = inferPrerequisites([
      file("src/a.ts", ["export const a = process.env.SHARED_KEY_NAME;"], 4),
      file("src/b.ts", ["export const b = process.env.SHARED_KEY_NAME ?? process.env.OTHER_NAME;"], 7),
    ]);

    expect(rows).toEqual([env("SHARED_KEY_NAME", "src/a.ts:4"), env("OTHER_NAME", "src/b.ts:7")]);
  });

  it("reads the keys of an added .env.example line, never its value, and skips comments", () => {
    const value = ["change", "me", "-", "later"].join("");
    const rows = inferPrerequisites([
      file("config/.env.example", ["# the mail relay", `SMTP_HOST=${value}`, `export SMTP_PORT=${value}`, ""]),
    ]);

    expect(rows).toEqual([env("SMTP_HOST", "config/.env.example:2"), env("SMTP_PORT", "config/.env.example:3")]);
    expect(JSON.stringify(rows)).not.toContain(value);
  });

  it("names one migration row per added file under migrations/ or db/migrate/, blocking deploy", () => {
    const rows = inferPrerequisites([
      file("migrations/0004_add_index.sql", ["CREATE INDEX a ON b (c);", "CREATE INDEX d ON b (e);"]),
      file("db/migrate/20261016_add_users.rb", ["class AddUsers < ActiveRecord::Migration[7.1]"]),
    ]);

    expect(rows).toEqual([
      {
        kind: "migration",
        name: "migrations/0004_add_index.sql",
        where: "migrations/0004_add_index.sql",
        setBy: "person",
        blocks: "deploy",
        verified: false,
        inferred: true,
      },
      {
        kind: "migration",
        name: "db/migrate/20261016_add_users.rb",
        where: "db/migrate/20261016_add_users.rb",
        setBy: "person",
        blocks: "deploy",
        verified: false,
        inferred: true,
      },
    ]);
  });

  it("infers nothing from a test path, whatever it reads", () => {
    const rows = inferPrerequisites([
      file("test/server.test.ts", ["process.env.PORT_NUMBER = '1';"]),
      file("tests/test_main.py", ['os.getenv("CLOUD_REGION")']),
      file("src/__tests__/a.ts", ["process.env.A_NAME"]),
      file("src/a.spec.ts", ["process.env.B_NAME"]),
      file("pkg/x_test.py", ['os.getenv("C_NAME")']),
      file("test/fixtures/migrations/0001.sql", ["CREATE TABLE t ();"]),
      file("test\\win\\a.ts", ["process.env.D_NAME"]),
    ]);

    expect(rows).toEqual([]);
  });

  it("does not read a name that only ends in ENV or process.env", () => {
    const rows = inferPrerequisites([
      file("src/a.rb", ['x = MY_ENV["NOT_ME"]']),
      file("src/b.ts", ["const y = myprocess.env.NOT_ME_EITHER;"]),
    ]);

    expect(rows).toEqual([]);
  });

  it("returns no rows for no files and for a file with no added lines", () => {
    expect(inferPrerequisites([])).toEqual([]);
    expect(inferPrerequisites([file("src/a.ts", [])])).toEqual([]);
  });
});
