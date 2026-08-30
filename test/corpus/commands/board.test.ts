import { describe, expect, it } from "vitest";
import { frontmatterField } from "../../../src/content/frontmatter.ts";
import {
  assertDenyClean,
  assertLineCap,
  requireLoadClass,
  requireObsoleteWhen,
  walkAllMarkdown,
  type CorpusFile,
} from "../harness.ts";

/**
 * The `/st-board` artifact's own suite. Corpus-wide shape (identity head,
 * load enum, deny cleanliness across every file) is the frontmatter-contract
 * and invariant suites' job; this one binds the design decisions that are
 * specific to THIS command and would otherwise erode silently:
 *
 *   - the sub-agent declaration that makes it a command rather than a skill;
 *   - the four-channel write-back contract, counted, not merely mentioned;
 *   - the single platform reference table (the churn-containment invariant —
 *     a second platform table anywhere in the body defeats it);
 *   - the board/work boundary: dependency vocabulary, readiness gate, handoff.
 *
 * Body assertions run over whitespace-flattened section text, so re-wrapping a
 * paragraph never fails a test and only a changed statement does.
 */

/** Corpus-relative path of the artifact under test. */
const ARTIFACT_PATH = "commands/st-board.md";

/** Command-body cap for the touchpoint class (resolved SoT silence). */
const BODY_LINE_CAP = 500;

/** The nine touchpoints. A `/st-*` mention outside this set is a dangling reference. */
const TOUCHPOINTS: ReadonlySet<string> = new Set([
  "/st-spec",
  "/st-plan",
  "/st-work",
  "/st-board",
  "/st-ask",
  "/st-debug",
  "/st-quick",
  "/st-rework",
  "/st-pr-resolve",
]);

/** The `##` skeleton the SoT design fixes, in order. */
const SECTION_SKELETON: readonly string[] = [
  "Modes",
  "Sources and authority",
  "Semantic signals",
  "Platform reference table",
  "Write-back contract",
  "Progress contract",
  "Deferral inbox",
  "Return contract",
];

/** The write-back channels, in contract order — exactly four, no fifth. */
const WRITE_BACK_CHANNELS: readonly string[] = [
  "Progress comment",
  "PR link",
  "Status transition",
  "PR-thread reply",
];

/**
 * Board actions that exist on a platform and that NO write-back channel opens.
 *
 * A progress-event mapping naming one of these promises a write the contract
 * refuses, so by the command's own fifth-channel rule the event returns
 * `BLOCKED_DEPENDENCY`. `criterion.done` mapped to a checklist tick — the most
 * routine event on the board — was exactly that shape.
 */
const NON_CHANNEL_ACTIONS: readonly string[] = [
  "checklist tick",
  "label",
  "create",
  "title",
  "body edit",
  "delete",
];

let cached: Promise<CorpusFile> | undefined;

/** The artifact, walked through the harness so a missing file fails by name. */
function board(): Promise<CorpusFile> {
  cached ??= (async (): Promise<CorpusFile> => {
    const file = (await walkAllMarkdown()).find((entry) => entry.relPath === ARTIFACT_PATH);
    if (file === undefined) throw new Error(`${ARTIFACT_PATH}: absent from the corpus`);
    return file;
  })();
  return cached;
}

/** Collapse every whitespace run to one space, so line wrapping is not load-bearing. */
function flat(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Split a body into its `##` sections, keyed by heading text. `###` headings
 * stay inside their parent section — the pattern needs whitespace after exactly
 * two hashes, which a third hash denies.
 */
function sections(body: string, level: "##" | "###"): Map<string, string> {
  const blocks = body.split(new RegExp(`^${level}[^#\\S]\\s*`, "gm")).slice(1);
  const found = new Map<string, string>();
  for (const block of blocks) {
    const cut = block.indexOf("\n");
    found.set(
      (cut === -1 ? block : block.slice(0, cut)).trim(),
      cut === -1 ? "" : block.slice(cut + 1),
    );
  }
  return found;
}

/** Section text by heading; a missing heading fails here rather than as an empty match. */
function section(body: string, heading: string, level: "##" | "###" = "##"): string {
  const text = sections(body, level).get(heading);
  if (text === undefined) {
    throw new Error(`${ARTIFACT_PATH}: no ${level} section titled ${JSON.stringify(heading)}`);
  }
  return text;
}

interface MarkdownTable {
  header: string[];
  rows: string[][];
}

/** Cells of one pipe row, outer pipes dropped and cells trimmed. */
function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/** Every markdown table in `text`: a pipe header row followed by a delimiter row. */
function tables(text: string): MarkdownTable[] {
  const lines = text.split("\n");
  const found: MarkdownTable[] = [];
  for (let index = 0; index + 1 < lines.length; index += 1) {
    const head = lines[index] ?? "";
    const delimiter = lines[index + 1] ?? "";
    if (!head.trim().startsWith("|") || !/^\s*\|[\s|:-]+\|\s*$/.test(delimiter)) continue;

    const rows: string[][] = [];
    let cursor = index + 2;
    while (cursor < lines.length && (lines[cursor] ?? "").trim().startsWith("|")) {
      rows.push(cells(lines[cursor] ?? ""));
      cursor += 1;
    }
    found.push({ header: cells(head), rows });
    index = cursor - 1;
  }
  return found;
}

/**
 * The channel names the write-back contract enumerates, read out of its own
 * numbered list rather than restated — so a mapping assertion binds whatever
 * the contract currently opens, not a copy that can go stale beside it.
 */
function enumeratedChannels(writeBackSection: string): string[] {
  return [...writeBackSection.matchAll(/^\d+\.\s+\*\*(.+?)\*\*/gm)].map((match) => match[1] ?? "");
}

/** The progress-event table, selected by its `Event` header rather than by position. */
function eventTable(progressSection: string): MarkdownTable {
  const found = tables(progressSection).find((table) => /^event$/i.test(table.header[0] ?? ""));
  if (found === undefined) {
    throw new Error(`${ARTIFACT_PATH}: the progress contract ships no Event table`);
  }
  return found;
}

describe("st-board — frontmatter", () => {
  it("declares the command identity, load class, and deletion trigger", async () => {
    const file = await board();

    expect(frontmatterField(file.parsed, "id")).toBe("board");
    expect(frontmatterField(file.parsed, "type")).toBe("command");
    expect(frontmatterField(file.parsed, "tags")).toEqual(["board", "planning"]);
    expect(frontmatterField(file.parsed, "description")).toMatch(/board/i);
    expect(() => requireLoadClass(file, ["on-demand"])).not.toThrow();
    expect(() => requireObsoleteWhen(file)).not.toThrow();
  });

  it("spawns the researcher — the declaration that makes this a command, not a skill", async () => {
    const file = await board();

    // The command discriminator is machine-checkable through `spawns`: an empty
    // list would mean this artifact orchestrates nothing and belongs in skills.
    expect(frontmatterField(file.parsed, "spawns")).toEqual(["researcher"]);
  });

  it("leaves the engine-reserved tools key unset, so the artifact ships to every client", async () => {
    expect(frontmatterField((await board()).parsed, "tools")).toBeUndefined();
  });
});

describe("st-board — body budget and safety", () => {
  it("stays within the command body cap", async () => {
    const file = await board();

    expect(() => assertLineCap(file, BODY_LINE_CAP)).not.toThrow();
  });

  it("is deny-scan clean at block severity", async () => {
    const file = await board();

    expect(() => assertDenyClean(file)).not.toThrow();
  });

  it("mints no URL — platform facts name tools, never product domains", async () => {
    expect((await board()).parsed.body.match(/https?:\/\//g)).toBeNull();
  });

  it("references only touchpoints that exist", async () => {
    const mentioned = new Set((await board()).parsed.body.match(/\/st-[a-z-]+/g) ?? []);

    expect([...mentioned].filter((name) => !TOUCHPOINTS.has(name))).toEqual([]);
    // The handoff target is the point of the pickup mode; assert it is present
    // rather than merely permitted.
    expect(mentioned.has("/st-work")).toBe(true);
  });
});

describe("st-board — section skeleton", () => {
  it("carries the SoT sections in order", async () => {
    expect([...sections((await board()).parsed.body, "##").keys()]).toEqual(SECTION_SKELETON);
  });

  it("dispatches the four modes as subsections of Modes", async () => {
    const modes = [...sections(section((await board()).parsed.body, "Modes"), "###").keys()];

    expect(modes.map((heading) => heading.split(" ")[0])).toEqual([
      "fill",
      "pickup",
      "groom",
      "setup",
    ]);
  });
});

describe("st-board — write-back contract", () => {
  it("enumerates exactly four channels, in contract order", async () => {
    const text = section((await board()).parsed.body, "Write-back contract");
    const enumerated = [...text.matchAll(/^(\d+)\.\s+\*\*(.+?)\*\*/gm)];

    expect(enumerated.map((match) => match[1])).toEqual(["1", "2", "3", "4"]);
    expect(enumerated.map((match) => match[2])).toEqual(WRITE_BACK_CHANNELS);
  });

  it("is read-only by default and refuses a fifth channel", async () => {
    const text = flat(section((await board()).parsed.body, "Write-back contract"));

    expect(text).toMatch(/Read-only by default/);
    expect(text).toMatch(/enabled at setup/);
    expect(text).toMatch(/fifth channel stops and returns `BLOCKED_DEPENDENCY`/);
  });

  it("scopes the PR-thread reply to the pr-resolve touchpoint", async () => {
    expect(flat(section((await board()).parsed.body, "Write-back contract"))).toMatch(
      /PR-thread reply\*\* — .*`\/st-pr-resolve` only/,
    );
  });

  it("excludes item creation and label writes from the sanctioned set", async () => {
    const body = (await board()).parsed.body;
    const text = flat(section(body, "Write-back contract"));

    // The four channels are the whole set, so a mode that "creates" an item is
    // producing a report proposal — not writing one to the source through a
    // fifth channel the contract never opened. Without this the body promises a
    // capability no channel implements, and a conforming run has to improvise.
    expect(text).toMatch(/Those four are the whole set/);
    expect(text).toMatch(/Creating an item and writing labels are not among\s*them/);
    expect(text).toMatch(/a new item is a proposal in the run report/);
    // Status is the one label-shaped write a run may make, through its channel.
    expect(text).toMatch(/the status field or column the status channel maps/);
  });

  it("settles a platform close as channel 3 or as a proposal, and never as a fifth channel", async () => {
    const body = (await board()).parsed.body;
    const writeBack = flat(section(body, "Write-back contract"));
    const groom = flat(section(section(body, "Modes"), "groom — maintain", "###"));

    // Groom applied confirm-first closes while the contract placed
    // closes outside all four channels and refused a fifth — so the routine
    // groom disposition had no legal mechanism. The split is stated once on the
    // channel and repeated in the question that applies it.
    expect(writeBack).toMatch(/close rides this channel exactly when the platform models closure/);
    expect(writeBack).toMatch(/Where closure is a separate operation the status field does not/);
    expect(writeBack).toMatch(/it is a proposal in the run report/);
    // The blanket "closes stay outside" claim is gone from the exclusion list.
    expect(writeBack).toMatch(/Item bodies, titles, checklist ticks, deletions/);
    expect(writeBack).toMatch(/Closes are the one case that splits/);
    // groom's bundled question states which mechanism each row takes.
    expect(groom).toMatch(/question states its mechanism per row/);
    expect(groom).toMatch(/`status` — the platform models closure as the status field/);
    expect(groom).toMatch(/`proposal` — closure is a separate operation/);
    expect(groom).toMatch(/the reference table does not settle is a `proposal`/);
  });

  it("says the same at the fill site that would otherwise imply a creation write", async () => {
    const fill = flat(
      section(section((await board()).parsed.body, "Modes"), "fill — intake to items", "###"),
    );

    expect(fill).toMatch(/that contract opens no creation channel/);
    expect(fill).toMatch(/a new item is a proposal in the run report until a person files it/);
  });
});

describe("st-board — platform reference table", () => {
  it("holds exactly one platform table in the whole body", async () => {
    const body = (await board()).parsed.body;
    const platformTables = tables(body).filter((table) =>
      table.header.some((cell) => /^platform$/i.test(cell)),
    );

    // The churn-containment invariant: one table owns platform facts, so a
    // platform change touches one place. A second platform-keyed table anywhere
    // in the body reopens the duplication the design closed.
    expect(platformTables).toHaveLength(1);
    expect(tables(section(body, "Platform reference table"))).toHaveLength(1);
  });

  it("dates the table and names access checks per platform", async () => {
    const text = section((await board()).parsed.body, "Platform reference table");
    const table = tables(text)[0];

    expect(flat(text)).toMatch(/Verified 2026-08/);
    expect(table?.rows.map((row) => row[0])).toEqual([
      "GitHub",
      "GitLab",
      "Azure DevOps",
      "Anything else",
    ]);
    // GitHub is first-class in core; the other platforms arrive as packs.
    expect(table?.rows.map((row) => row.at(-1))).toEqual(["core", "pack", "pack", "pack"]);
    for (const row of table?.rows ?? []) expect(row.every((cell) => cell !== "")).toBe(true);
  });

  it("legends the availability column as shipping location, not a platform status model", async () => {
    const body = (await board()).parsed.body;
    const text = flat(section(body, "Platform reference table"));

    // The column word is the ambiguity a reader hits: `core`/`pack` states where
    // support ships, and the platform's own status semantics are stated once by
    // the setup advisory instead of being compressed into a table cell.
    expect(text).toMatch(/\*\*Availability\*\* is where support lives/);
    expect(text).toMatch(/`core` ships in the box, `pack` arrives with an installed pack/);
    expect(text).toMatch(/says nothing about the platform's own status model/);
    expect(text).toMatch(/`setup` states it once in the post-merge semantics advisory/);
    // The advisory the legend points at exists, so the pointer does not dangle.
    expect(flat(section(section(body, "Modes"), "setup — wiring", "###"))).toMatch(
      /Post-merge semantics advisory, once/,
    );
  });

  it("publishes the abstract board contract the packs implement", async () => {
    const text = flat(section((await board()).parsed.body, "Platform reference table"));

    for (const verb of ["`list`", "`get`", "`update`", "`comment`", "`link-PR`"]) {
      expect(text).toContain(verb);
    }
  });

  it("names canonical mcp__server__tool ids with the CLI as the stated fallback", async () => {
    const text = section((await board()).parsed.body, "Platform reference table");
    const table = tables(text)[0];

    // No `mcp__` token existed anywhere in content or packs, and the one
    // place content chose made the CLI primary with MCP an unnamed alternative —
    // the inverse of the specified direction. Every row names a server
    // namespace, and the core platform names concrete tools.
    expect(table?.header.slice(0, 3)).toEqual(["Platform", "MCP tools", "CLI fallback"]);
    // Named servers spell their id; the pack-supplied catch-all keeps the
    // `<server>` placeholder, which is the same canonical shape unresolved.
    for (const row of table?.rows ?? []) {
      expect(row[1], `${row[0] ?? ""} names no mcp__ tool`).toMatch(
        /`mcp__(?:[a-z][\w-]*|<server>)__/,
      );
    }
    expect(table?.rows[0]?.[1]).toContain("`mcp__github__list_issues`");
    expect(flat(text)).toMatch(/Content names the canonical\s+`mcp__server__tool` id/);
    expect(flat(text)).toMatch(/the CLI is the graceful fallback, not the interface/);
    // Fallback ORDER, not merely presence: MCP first, CLI on a failed check.
    expect(flat(text)).toMatch(/drops to the CLI column when it is not/);
  });

  it("carries the status facet per platform, before the availability column", async () => {
    const text = section((await board()).parsed.body, "Platform reference table");
    const table = tables(text)[0];

    expect(table?.header.at(-2)).toBe("Status field");
    expect(table?.header.at(-1)).toBe("Availability");
    // GitHub's status primitive is the one channel 3 writes on the core path.
    expect(table?.rows[0]?.at(-2)).toContain("`state`");
    expect(flat(text)).toMatch(/what decides whether a close is a transition or a proposal/);
  });
});

describe("st-board — board/work boundary", () => {
  it("states that the board hands off rather than executes", async () => {
    const body = (await board()).parsed.body;
    const preamble = flat(body.slice(0, body.indexOf("## Modes")));

    expect(preamble).toMatch(/does not execute work/);
    expect(preamble).toMatch(/handoff, not an edit/);
  });

  it("splits hard and soft dependency edges and derives implementation order", async () => {
    const pickup = flat(
      section(section((await board()).parsed.body, "Modes"), "pickup — select, gate, hand off", "###"),
    );

    expect(pickup).toMatch(/`Blocked by #N` is hard/);
    expect(pickup).toMatch(/`Recommended after #N` is soft/);
    expect(pickup).toMatch(/Implementation Order is a derived view/);
  });

  it("gates readiness in a single pass and hands the payload to work", async () => {
    const pickup = flat(
      section(section((await board()).parsed.body, "Modes"), "pickup — select, gate, hand off", "###"),
    );

    expect(pickup).toMatch(/Readiness gate — one pass, no loop/);
    expect(pickup).toMatch(/reports gaps; it does not fix them/);
    expect(pickup).toMatch(/Hand off to `\/st-work`/);
    expect(pickup).toMatch(/acceptance criteria verbatim/);
  });

  it("publishes the progress events work emits with zero platform knowledge", async () => {
    const text = section((await board()).parsed.body, "Progress contract");
    const table = tables(text)[0];

    expect(flat(text)).toMatch(/zero platform knowledge/);
    expect(table?.rows.map((row) => row[0])).toEqual([
      "`phase.transition`",
      "`criterion.done`",
      "`pr.linked`",
      "`run.terminal`",
    ]);
  });

  it("maps every progress event onto a channel that exists", async () => {
    const body = (await board()).parsed.body;
    const declared = enumeratedChannels(section(body, "Write-back contract"));
    const rows = eventTable(section(body, "Progress contract")).rows;

    // `criterion.done` mapped to a checklist tick, which is an item-body
    // edit and not one of the four channels — so by this command's own
    // escalation rule the most routine progress event returned
    // `BLOCKED_DEPENDENCY`. The channel set is read from the contract rather
    // than restated, so a renamed channel fails here instead of drifting.
    expect(declared).toEqual(WRITE_BACK_CHANNELS);
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      const event = row[0] ?? "";
      const mapping = (row[2] ?? "").toLowerCase();
      const named = declared.filter((channel) => mapping.includes(channel.toLowerCase()));
      expect(named, `${event} maps to nothing in the four-channel set`).not.toEqual([]);
      for (const action of NON_CHANNEL_ACTIONS) {
        expect(mapping, `${event} maps to \`${action}\`, which no channel opens`).not.toContain(
          action,
        );
      }
    }
  });

  it("fixture: the pre-fix checklist-tick mapping is flagged", () => {
    // The exact defect, minimised. Without this the case above passes on a
    // table whose mapping column merely mentions a channel somewhere.
    const rows = eventTable(
      [
        "| Event | Emitted when | Board mapping |",
        "|---|---|---|",
        "| `criterion.done` | a criterion is verified | checklist tick plus a progress comment |",
      ].join("\n"),
    ).rows;
    const mapping = (rows[0]?.[2] ?? "").toLowerCase();

    expect(WRITE_BACK_CHANNELS.filter((c) => mapping.includes(c.toLowerCase()))).toEqual([
      "Progress comment",
    ]);
    expect(NON_CHANNEL_ACTIONS.filter((action) => mapping.includes(action))).toEqual([
      "checklist tick",
    ]);
  });

  it("says why the tick is gone rather than dropping the event with it", async () => {
    const progress = flat(section((await board()).parsed.body, "Progress contract"));

    // Edge case: dropping the tick must not silence the board on a verified
    // criterion. The event survives on the progress-comment channel and the
    // tick travels as a proposal, which is where every non-channel write goes.
    expect(progress).toMatch(/names one or more of the four write-back channels and nothing else/);
    expect(progress).toMatch(/A checklist tick would be an item-body edit, which no channel opens/);
    expect(progress).toMatch(/the most routine event on the board stays loud/);
    expect(progress).toMatch(/carries it as a proposal in the report/);
  });

  it("re-homes the phase-to-status map the mapping column resolves against", async () => {
    const body = (await board()).parsed.body;
    const progress = section(body, "Progress contract");
    const phaseMap = tables(progress).find((table) =>
      table.header.some((cell) => /work phase/i.test(cell)),
    );

    // Channel 3's "mapped value" and the table-driven claim both
    // pointed at a status table that existed nowhere in the repo.
    expect(phaseMap, "the phase-to-status map is missing").toBeDefined();
    expect(phaseMap?.rows.map((row) => row[1])).toEqual([
      "in progress",
      "in review",
      "done",
      "blocked, or the platform's nearest needs-attention value",
    ]);
    // The right column is board vocabulary; the platform's spelling lives in
    // the reference table, so the two pointers resolve to different columns.
    expect(flat(progress)).toMatch(/the Status field column of the reference table/);
    expect(flat(progress)).toMatch(/A phase with no mapped status emits no transition/);
  });
});

describe("st-board — sources, signals, and the inbox", () => {
  it("keeps the source authoritative and splits status from content truth", async () => {
    const text = flat(section((await board()).parsed.body, "Sources and authority"));

    expect(text).toMatch(/The linked source is authoritative/);
    expect(text).toMatch(/Board is truth for STATUS\. Repo is truth for CONTENT/);
    expect(text).toMatch(/Two-way file-and-board synchronization is not performed/);
    expect(text).toMatch(/mirrored one-way .*not read back as truth/);
  });

  it("extracts exactly the three surviving semantic signals", async () => {
    const table = tables(section((await board()).parsed.body, "Semantic signals"))[0];

    expect(table?.rows.map((row) => row[0])).toEqual([
      "Priority bucket",
      "Business or technical lean",
      "Spec reference",
    ]);
    expect(flat(section((await board()).parsed.body, "Semantic signals"))).toMatch(
      /absent; it is not inferred/,
    );
  });

  it("fixes the deferral inbox at one path and counts its readers as the corpus has them", async () => {
    // CHANGED TEST: the reader clause said "both mandatory" and named
    // two, while `/st-plan`'s shared intake reads the inbox as its step 4 —
    // three readers, not two. The behaviour that moved is the census itself, so
    // the assertion moves with it and the count is now derived from the corpus
    // instead of restated, which is what made the old number able to go stale.
    const files = await walkAllMarkdown();
    const inbox = flat(section((await board()).parsed.body, "Deferral inbox"));

    expect(inbox).toContain(".stamity/inbox.md");
    expect(inbox).toMatch(/Readers, three, all mandatory:.*`fill` triages the inbox on every run/);
    for (const reader of ["/st-work", "/st-plan"]) {
      expect(inbox, `${reader} reads the inbox and must be named`).toContain(reader);
    }

    // The writers the census names have to be the writers the corpus has. Board
    // itself is excluded: it is the reader/parser, not a writer.
    const writers = files
      .filter(
        (file) =>
          file.relPath !== ARTIFACT_PATH &&
          /append|land|routed|deferr/i.test(file.parsed.body) &&
          file.parsed.body.includes(".stamity/inbox.md"),
      )
      .map((file) => file.relPath);
    expect(writers.length).toBe(4);
    expect(inbox).toMatch(/Writers, four:/);
    for (const writer of ["/st-rework", "/st-pr-resolve", "/st-plan", "dep-audit"]) {
      expect(inbox, `${writer} writes to the inbox and must be named`).toContain(writer);
    }

    // The fill mode is one of the readers, so it cites the same path.
    expect(flat(section(section((await board()).parsed.body, "Modes"), "fill — intake to items", "###"))).toContain(
      ".stamity/inbox.md",
    );
  });

  it("declares one row grammar and pulls critical-deferred rows to the front", async () => {
    const inbox = flat(section((await board()).parsed.body, "Deferral inbox"));

    // The census defect's other half: "no grammar" nullified three writers' declared row
    // grammars, so the elevated-triage tag a deferred Critical carries had no
    // reader and read as a Minor. One declared grammar, board parses it, and
    // the tag has an order clause behind it.
    expect(inbox).toMatch(/one declared row grammar, and this command is what parses it/);
    expect(inbox).toContain("`severity · file:line · description · source: <writer>`");
    expect(inbox).toMatch(/A row that does not parse is kept verbatim/);
    expect(inbox).toMatch(/Triage order:.*`critical-deferred` are triaged first/);
    expect(inbox).toMatch(/a deferred Critical is indistinguishable from a Minor/);
  });

  it("returns a typed status with the write ledger and handoff", async () => {
    const text = flat(section((await board()).parsed.body, "Return contract"));

    for (const token of [
      "`DONE`",
      "`BLOCKED_AMBIGUITY`",
      "`BLOCKED_DEPENDENCY`",
      "`BLOCKED_FAILURE`",
      "`Critical`",
      "`Warning`",
      "`Minor`",
    ]) {
      expect(text).toContain(token);
    }
    expect(text).toMatch(/`writes` — every write-back channel used/);
    expect(text).toMatch(/`handoff` — the payload passed to `\/st-work`/);
  });

  it("closes with a next step derived from the run's own state", async () => {
    const text = flat(section((await board()).parsed.body, "Return contract"));

    // The closing-contract gap, board's share: derivation named, and named from this mode's own
    // outputs rather than from a menu that would fit any run.
    expect(text).toMatch(/`next` — the recommended next step/);
    expect(text).toMatch(/derived from this run's own state and not from a fixed menu/);
    expect(text).toMatch(/inbox entries that did not drain/);
  });
});

describe("st-board — durable state and authorization", () => {
  it("says the source link is session-carried at all three pointers", async () => {
    const modes = section((await board()).parsed.body, "Modes");
    const setup = flat(section(modes, "setup — wiring", "###"));
    const fill = flat(section(modes, "fill — intake to items", "###"));
    const pickup = flat(section(modes, "pickup — select, gate, hand off", "###"));

    // Setup claimed to write the link and the channel enablement into
    // repo config, which carries a key for neither — so pickup could never
    // confirm a prior setup and the read-only default had no durable state.
    expect(setup).toMatch(/It is session-carried: no config key and no manifest field holds it/);
    expect(setup).toMatch(/A durable home is not built, and this text claims none/);
    expect(setup).toMatch(/enablement is session-\s*carried too/);
    expect(fill).toMatch(/the source linked for this session/);
    expect(pickup).toMatch(/The link is session-carried/);
    // No pointer claims repo config any more.
    expect(fill).not.toMatch(/repo config/);
    expect(setup).not.toMatch(/in repo config/);
  });

  it("keeps pickup's refusal path intact on an unlinked source", async () => {
    const pickup = flat(
      section(section((await board()).parsed.body, "Modes"), "pickup — select, gate, hand off", "###"),
    );

    // Edge case: correcting the pointer must not soften the refusal. An
    // unlinked session runs setup again — it does not proceed on an assumption.
    expect(pickup).toMatch(/An unlinked source has no pickup — run `setup` first/);
    expect(pickup).toMatch(/runs `setup` again rather than assuming one/);
  });

  it("makes pickup's status write conditional and reports the read-only case", async () => {
    const pickup = flat(
      section(section((await board()).parsed.body, "Modes"), "pickup — select, gate, hand off", "###"),
    );

    // Step 5 stated an unconditional status write while every channel
    // is opt-in and the default is read-only, and neither the step nor the
    // return contract said what pickup reports when it writes nothing.
    expect(pickup).toMatch(/Where the status channel was enabled for this session/);
    expect(pickup).toMatch(/Where it was not — the read-only default/);
    expect(pickup).toMatch(/`writes` list stays empty and `handoff` carries `status-write: skipped`/);
    expect(pickup).toMatch(/does not assume a board already showing the item in progress/);
  });

  it("drains a proposal-only inbox entry instead of growing the rendezvous", async () => {
    const body = (await board()).parsed.body;
    const fill = flat(section(section(body, "Modes"), "fill — intake to items", "###"));
    const inbox = flat(section(body, "Deferral inbox"));

    // An entry left only once its destination item existed, while the
    // contract opens no creation channel — so a proposal-only entry could never
    // leave, and the rendezvous three commands write to grew monotonically.
    expect(fill).toMatch(/becomes a recorded proposal/);
    expect(fill).toMatch(/records that proposal under an id and the entry is annotated with it/);
    expect(fill).toMatch(/That is the drain for proposal-only entries/);
    expect(fill).toMatch(/still unfiled after two further `fill` runs is re-raised/);
    // The removal clause carries the same third exit, so the two agree.
    expect(inbox).toMatch(/when its proposal id is recorded per `fill` step 5/);
  });

  it("defines the --source grammar the plan touchpoint tells operators to pass", async () => {
    const fill = flat(
      section(section((await board()).parsed.body, "Modes"), "fill — intake to items", "###"),
    );

    // `--source` had one occurrence in the corpus — plan's closing line —
    // while board documented intake as prose ordering with no flag grammar.
    expect(fill).toMatch(/Invocation grammar: `--source <ref>`, repeatable/);
    expect(fill).toMatch(/Order is precedence — the first `--source` wins a conflict/);
    expect(fill).toMatch(/An unresolvable `<ref>` is reported by name and skipped/);
  });
});

describe("st-board — edge cases", () => {
  it("falls back to chat intake when nothing is linked, and invents no backlog file", async () => {
    const fill = flat(
      section(section((await board()).parsed.body, "Modes"), "fill — intake to items", "###"),
    );

    expect(fill).toMatch(/no linked source and an empty inbox, fall back to chat intake/);
    expect(fill).toMatch(/Nothing is invented/);
    expect(fill).toMatch(/no backlog file is created, no todo file is written/);
  });

  it("defers one side of a collision instead of assigning overlapping writes in parallel", async () => {
    const pickup = flat(
      section(section((await board()).parsed.body, "Modes"), "pickup — select, gate, hand off", "###"),
    );

    expect(pickup).toMatch(/Collision check/);
    expect(pickup).toMatch(/sharing a file or a contract collide/);
    expect(pickup).toMatch(/defer the lower-priority candidate/);
    expect(pickup).toMatch(/overlapping writes are not assigned in parallel/);
  });

  it("makes a half-applied platform write safe to retry through event-id idempotency", async () => {
    const progress = flat(section((await board()).parsed.body, "Progress contract"));

    expect(progress).toMatch(/idempotent by that id/);
    expect(progress).toMatch(/retry after a failed or half-applied platform write/);
    expect(progress).toMatch(/converges on the same board state and posts no duplicate/);
    // The progress-comment channel carries the id, which is what makes the
    // retry converge instead of appending a second comment.
    expect(flat(section((await board()).parsed.body, "Write-back contract"))).toMatch(
      /carrying the event id, so a replay updates the existing comment/,
    );
  });

  it("refuses to mutate a completed item and supersedes instead", async () => {
    const body = (await board()).parsed.body;
    const groom = flat(section(section(body, "Modes"), "groom — maintain", "###"));

    expect(groom).toMatch(/Completed items are immutable/);
    expect(groom).toMatch(/refused; append a superseding item/);
    expect(flat(section(body, "Sources and authority"))).toMatch(
      /Completed items are immutable\*\* — append or supersede, never rewrite/,
    );
    // Editing a completed item is also outside the four write-back channels.
    expect(flat(section(body, "Write-back contract"))).toMatch(/any edit to a completed item/);
  });
});
