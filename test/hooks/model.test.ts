import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_HOOK_EVENTS,
  CLAUDE_EVENT_NAMES,
  CLIENT_EXTENSION_EVENTS,
  CLIENT_HOOK_GUARANTEES,
  type CanonicalHookEvent,
  isCanonicalHookEvent,
} from "../../src/hooks/model.ts";
import { TOOLS } from "../../src/types/core.ts";

const toPascalCase = (event: string): string =>
  event
    .split("_")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join("");

describe("CANONICAL_HOOK_EVENTS", () => {
  it("is the six-intent core, in intent order, without duplicates", () => {
    expect(CANONICAL_HOOK_EVENTS).toEqual([
      "session_start",
      "pre_tool_use",
      "post_tool_use",
      "user_prompt_submit",
      "stop",
      "session_end",
    ]);
    expect(new Set(CANONICAL_HOOK_EVENTS).size).toBe(CANONICAL_HOOK_EVENTS.length);
  });

  it("declares every id in snake_case, so the wire transform stays mechanical", () => {
    for (const event of CANONICAL_HOOK_EVENTS) {
      expect(event, `${event} must be snake_case`).toMatch(/^[a-z]+(?:_[a-z]+)*$/);
    }
  });
});

describe("CLAUDE_EVENT_NAMES", () => {
  it("maps every canonical event to a PascalCase interchange name and back uniquely", () => {
    const names = CANONICAL_HOOK_EVENTS.map((event) => CLAUDE_EVENT_NAMES[event]);

    // Bijectivity is the load-bearing property: emission writes the name, a config
    // read back off disk has to map home to exactly one canonical event.
    const inverse = new Map<string, CanonicalHookEvent>(
      CANONICAL_HOOK_EVENTS.map((event) => [CLAUDE_EVENT_NAMES[event], event]),
    );
    expect(inverse.size).toBe(CANONICAL_HOOK_EVENTS.length);
    for (const event of CANONICAL_HOOK_EVENTS) {
      expect(names).toContain(CLAUDE_EVENT_NAMES[event]);
      expect(inverse.get(CLAUDE_EVENT_NAMES[event])).toBe(event);
    }
  });

  it("spells each name as the PascalCase of its canonical id", () => {
    for (const event of CANONICAL_HOOK_EVENTS) {
      expect(CLAUDE_EVENT_NAMES[event]).toBe(toPascalCase(event));
      expect(CLAUDE_EVENT_NAMES[event]).toMatch(/^[A-Z][A-Za-z]*$/);
    }
  });

  it("carries no name outside the canonical six", () => {
    expect(Object.keys(CLAUDE_EVENT_NAMES).toSorted()).toEqual([...CANONICAL_HOOK_EVENTS].toSorted());
  });
});

describe("isCanonicalHookEvent", () => {
  it("accepts every canonical event", () => {
    for (const event of CANONICAL_HOOK_EVENTS) {
      expect(isCanonicalHookEvent(event)).toBe(true);
    }
  });

  it.each([
    { label: "a retired event class", value: "file_save" },
    { label: "the interchange spelling", value: "SessionStart" },
    { label: "a kebab-case spelling", value: "pre-tool-use" },
    { label: "the empty string", value: "" },
    { label: "a prototype member name", value: "constructor" },
  ])("rejects $label", ({ value }) => {
    expect(isCanonicalHookEvent(value)).toBe(false);
  });
});

describe("CLIENT_HOOK_GUARANTEES", () => {
  it("covers exactly the four target tools, one row each", () => {
    const covered = CLIENT_HOOK_GUARANTEES.map((row) => row.tool);
    expect(covered.length).toBe(TOOLS.length);
    expect(new Set(covered).size).toBe(covered.length);
    expect(covered.toSorted()).toEqual([...TOOLS].toSorted());
  });

  it.each([
    { tool: "claude", failMode: "fail-closed", blockingExitCode: 2 },
    { tool: "codex", failMode: "fail-closed", blockingExitCode: 2 },
    { tool: "cursor", failMode: "opt-in-fail-closed", blockingExitCode: 2 },
    { tool: "copilot", failMode: "fail-open", blockingExitCode: null },
  ])("states $tool as $failMode", ({ tool, failMode, blockingExitCode }) => {
    const row = CLIENT_HOOK_GUARANTEES.find((entry) => entry.tool === tool);
    expect(row).toBeDefined();
    expect(row?.failMode).toBe(failMode);
    expect(row?.blockingExitCode).toBe(blockingExitCode);
  });

  it("ties blocking capability to the fail mode, so no row over-claims", () => {
    for (const row of CLIENT_HOOK_GUARANTEES) {
      if (row.failMode === "fail-open") {
        expect(row.blockingExitCode, `${row.tool} cannot block`).toBeNull();
      } else {
        expect(Number.isInteger(row.blockingExitCode), `${row.tool} needs a blocking exit code`).toBe(
          true,
        );
      }
    }
  });

  it("gives every row a note, since the table is what docs render", () => {
    for (const row of CLIENT_HOOK_GUARANTEES) {
      expect(row.notes.length, `${row.tool} note`).toBeGreaterThan(0);
    }
  });

  it("orders rows strongest guarantee first", () => {
    const strength = { "fail-closed": 0, "opt-in-fail-closed": 1, "fail-open": 2 } as const;
    const ranks = CLIENT_HOOK_GUARANTEES.map((row) => strength[row.failMode]);
    expect(ranks).toEqual([...ranks].toSorted((a, b) => a - b));
  });
});

describe("CLIENT_EXTENSION_EVENTS", () => {
  it("names the events the engine wires outside the portable set, without duplicates", () => {
    const events = CLIENT_EXTENSION_EVENTS.map((row) => `${row.tool}:${row.event}`);

    expect(events).toEqual([
      "claude:ConfigChange",
      "claude:TaskCompleted",
      "claude:SubagentStop",
    ]);
    expect(new Set(events).size).toBe(events.length);
  });

  it("carries no member of the canonical six, under either spelling", () => {
    // The six-intent core is the only set enforceable everywhere. An extension
    // that leaked into it would make every adapter promise an event three of
    // these clients do not have.
    const canonical = new Set<string>([
      ...CANONICAL_HOOK_EVENTS,
      ...CANONICAL_HOOK_EVENTS.map((event) => CLAUDE_EVENT_NAMES[event]),
    ]);

    for (const row of CLIENT_EXTENSION_EVENTS) {
      expect(canonical.has(row.event), `${row.event} is portable`).toBe(false);
      expect(isCanonicalHookEvent(row.event), row.event).toBe(false);
      expect(row.portable, row.event).toBe(false);
    }
  });

  it("claims an extension only on the client that fires it", () => {
    // A row for a client with no such event is a gate an adapter would emit and
    // never fire — the guarantee-honesty failure the tables here exist to
    // prevent. One client publishes these three; the rest get the prose twin.
    const claiming = new Set(CLIENT_EXTENSION_EVENTS.map((row) => row.tool));

    expect([...claiming]).toEqual(["claude"]);
    for (const tool of TOOLS) {
      expect(CLIENT_HOOK_GUARANTEES.some((row) => row.tool === tool), tool).toBe(true);
    }
  });

  it("scopes its completeness claim to the rows it carries, and names what it excludes", () => {
    // The table's docstring read "Every non-portable event this engine wires", which a
    // reader checking whether an event is wired would take as a census. It is not one: the
    // cursor adapter wires two non-portable events of its own, both fail-closed, declared
    // beside the guard scripts that are their only consumer and absent from every row here.
    // Measured first, then required of the prose.
    const model = readFileSync(new URL("../../src/hooks/model.ts", import.meta.url), "utf8");
    const cursor = readFileSync(new URL("../../src/adapters/cursor.ts", import.meta.url), "utf8");
    const prose = model.replaceAll(/^\s*(?:\*|\/\/)\s?/gm, " ").replaceAll(/\s+/g, " ");

    for (const event of ["subagentStart", "beforeMCPExecution"]) {
      expect(cursor, `${event} is not wired by the cursor adapter`).toContain(`"${event}"`);
      expect(
        CLIENT_EXTENSION_EVENTS.some((row) => row.event === event),
        `${event} is carried by the table after all`,
      ).toBe(false);
    }

    expect(prose).not.toContain("Every non-portable event this engine wires");
    expect(prose).toMatch(/this is not every non-portable event the engine wires/i);
    expect(prose).toContain("CURSOR_GUARD_EVENTS");
    expect(prose).toContain("subagentStart");
    expect(prose).toContain("beforeMCPExecution");
    // The narrowed claim keeps its reason — the table is shared vocabulary, so a row lands
    // here when a consumer outside the declaring adapter reads it.
    expect(prose).toMatch(/the table's job is shared vocabulary, not a census/i);
    expect(prose).toMatch(/not a claim that the other clients fire no extension events/i);
  });

  it("cites where each row was read, with an access date", () => {
    // The wire names and the exit-status effects are the client's to change, so
    // a row without a dated source cannot be re-verified.
    for (const row of CLIENT_EXTENSION_EVENTS) {
      expect(row.citation.url, row.event).toMatch(/^https:\/\/[a-z0-9.-]+\//);
      expect(row.citation.accessDate, row.event).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(row.citation.accessDate)), row.event).toBe(false);
      // The note is what a doc page renders: it must say what the other clients
      // get instead, which is always the prose twin.
      expect(row.note.length, row.event).toBeGreaterThan(0);
    }
  });
});
