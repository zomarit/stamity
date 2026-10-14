import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { INBOX_PATH, parseInbox, SCHEDULE_RULE_HEADING } from "../../src/runs/inboxStore.ts";

/**
 * This repository's deferral inbox, held to the shared parser (REQ-FLOW-068, REQ-FLOW-076).
 *
 * TEST CHANGE, justified (2026-10-14, unit r1-records-suite, REQ-PROVE-025): the case moved here
 * from `test/runs/inboxStore.test.ts` under its own name and describe, its body unchanged. It reads
 * the committed inbox, so it is part of the records suite (`npm run test:records`) and `npm test`
 * does not run it; the parser's own cases, over hand-built rows, stay in `test/runs/inboxStore.test.ts`.
 */

/** Repo root, resolved from this file rather than from the process cwd. */
const REPO_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

describe("parseInbox", () => {
  it("parses this repository's inbox with no problem, one row per bullet", () => {
    expect(INBOX_PATH).toBe(".stamity/inbox.md");
    const text = readFileSync(resolve(REPO_ROOT, ".stamity/inbox.md"), "utf8");
    const bullets = text.split("\n").filter((line) => line.startsWith("- ")).length;

    const parsed = parseInbox(text);

    expect(bullets).toBeGreaterThan(0);
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows).toHaveLength(bullets);
    // The schedule rule's heading (D28) is there once, so a close has a section to append under,
    // and every row below it is read as one the rule binds.
    const lines = text.split("\n");
    const heading = lines.indexOf(SCHEDULE_RULE_HEADING);
    expect(lines.filter((line) => line === SCHEDULE_RULE_HEADING)).toHaveLength(1);
    for (const parsedRow of parsed.rows) expect(parsedRow.belowRule).toBe(parsedRow.line > heading + 1);
  });
});
