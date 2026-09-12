import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SECRET_PATTERNS } from "../../src/mcp/secretScan.ts";
// @ts-expect-error — the gate is a plain .mjs script with no type declarations, and it stays
// that way on purpose: it must run standalone against an arbitrary `--root`, including an
// extracted publish tarball with no TypeScript toolchain anywhere near it.
import { RULES, decodeCandidates, normalizeWithMap } from "../../scripts/leak-gate.mjs";

/**
 * The name-and-credential leak gate, against the real repository — and writing NOTHING into it.
 *
 * This file used to plant reserved-name-bearing probe files in the working tree, cleaned only by
 * an `afterEach`. An interrupted run — a failing assertion that killed the worker, a Ctrl-C — left
 * them sitting in the tree the gate exists to keep the name out of, where the next `git add -A`
 * would have committed it. Every probe-bearing case now lives in
 * `test/gate/leakGateEvasion.test.ts`, which stages them in a throwaway repository.
 *
 * What is left here is what genuinely needs the real repository: that it passes as it stands, that
 * the run states what it actually scanned, and that the credential-shape rules have not drifted
 * from the engine module they mirror.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const GATE = join(REPO_ROOT, "scripts", "leak-gate.mjs");

interface GateResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runGate(): GateResult {
  try {
    return { status: 0, stdout: execFileSync("node", [GATE], { cwd: REPO_ROOT, encoding: "utf8" }), stderr: "" };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { status: failure.status ?? -1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
}

/**
 * Wall-clock budget for one whole-repository gate run, derived rather than inherited.
 *
 * Every case below spawns the real gate over the real tree, so what each one is really bounded by
 * is the gate's cost — and the suite-wide default (20s in `vitest.config.ts`, sized for a CLI
 * spawn) is not that number. It read as one until the gate's wall time doubled and the failure
 * that reached CI was a TIMEOUT: a red with no cost in it, on the floor and LTS legs only,
 * saying nothing about what got slower or by how much.
 *
 * The basis, so the next person can re-derive it instead of guessing:
 *   local wall time   16s   — `time node scripts/leak-gate.mjs`, three runs, 15.81-16.13s over
 *                             5,561 files, node start included. It was 3.3s over 852 files when
 *                             this budget was first derived; the tree grew because every run
 *                             export publishes each attempt's output under `evals/runs/<run>/calls/`,
 *                             and the gate reads all of them — by design, so nothing is excluded.
 *   CI ratio          2x    — the runner class is about half this machine's speed
 *   margin            4x    — a shared runner with a cold file cache, not a second budget
 *   = 16 x 2 x 4 ≈ 128s, rounded up to 180s
 *
 * So a CI leg twice as slow as expected still REPORTS the gate's true cost, and only a gate that
 * has become roughly eleven times its local wall time trips this — where a timeout is the
 * finding. The 30s this replaced was derived against a tree six times smaller, and on the floor
 * and Windows legs of 4b2d8d9 it turned the gate's growth into a timeout that named no cost.
 */
const GATE_RUN_TIMEOUT_MS = 180_000;

describe("leak-gate against the repository as it stands", () => {
  it("passes, and says how many files it read", () => {
    const result = runGate();

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("PASS");
    // A census of zero would "pass" too. The scan has to have happened.
    const scanned = Number(/scanned (\d+) file\(s\)/.exec(result.stdout)?.[1] ?? 0);
    expect(scanned).toBeGreaterThan(100);
  }, GATE_RUN_TIMEOUT_MS);

  it("names the encodings it actually read, rather than implying every encoding", () => {
    // The claim that broke: every file was reported as scanned while UTF-16 was a whole-file
    // blind spot, so a file rendering as the plain name passed AND was counted as read.
    const summary = runGate().stdout;

    expect(summary).toContain("latin1");
    expect(summary).toContain("utf8");
    expect(summary).toContain("utf16le/utf16be when detected");
    expect(summary).toContain("raw and normalized");
  }, GATE_RUN_TIMEOUT_MS);

  it("prints every path exemption with the rule it was dropped from", () => {
    // The one exemption that existed never printed: the census line only filled when ALL rules
    // were exempt for a file, and no file is exempt from all of them, so the branch was dead.
    const summary = runGate().stdout;

    expect(summary).toContain("not scanned (rule predecessor-project allowlisted)");
    expect(summary).toContain("src/migration/");
    // Per rule, not per file: the migration module is exempt from the predecessor name and from
    // nothing else, and the scanner's own corpus is exempt from the credential shapes only.
    expect(summary).toContain("not scanned (rule github-token allowlisted)");
    expect(summary).toContain("src/mcp/secretScan.ts");
    expect(summary).not.toMatch(/rule predecessor-project allowlisted\)[^\n]*secretScan/);
  }, GATE_RUN_TIMEOUT_MS);

  it("carries the private-layer family, and counts it in the summary", () => {
    // The third family: a row identifier out of one of the private layer's ledgers, and the name
    // of the repository holding them. Neither is legal anywhere here, so both carry an empty
    // allowlist and are counted in the run's rule total like every other rule.
    const ids = (RULES as { id: string }[]).map((rule) => rule.id);
    expect(ids).toContain("private-ledger-id");
    expect(ids).toContain("private-repo-name");
    // 5 reserved names + 2 private-layer references + 11 credential shapes. A literal, because a
    // count derived from the thing it counts would agree with any drift.
    expect(RULES.length).toBe(18);

    const summary = runGate().stdout;

    expect(summary).toContain("PASS - 0 hits for 18 rule(s)");
  }, GATE_RUN_TIMEOUT_MS);

  it("scans its own file by its own rules, with no self-exemption", () => {
    // Every reserved token in the gate is assembled from fragments at run time, which is what
    // lets the gate be an ordinary file in its own scan. A literal in here would fail the run.
    const source = readFileSync(GATE, "utf8");
    for (const rule of RULES as { id: string; pattern: RegExp; allow: ((file: string) => boolean)[] }[]) {
      rule.pattern.lastIndex = 0;
      expect(rule.pattern.test(source), rule.id).toBe(false);
      expect(rule.allow.some((allowed) => allowed("scripts/leak-gate.mjs")), rule.id).toBe(
        false,
      );
    }
  });
});

describe("credential-shape rules mirror the engine's scanner", () => {
  it("uses only pattern ids that exist in src/mcp/secretScan.ts", () => {
    // Mirrored rather than imported, because the gate runs against an arbitrary `--root` —
    // including an extracted tarball with no `src/` at all. A mirror needs a drift guard, and
    // this is it: an id here that the engine does not define is a pattern nobody reviews.
    const engineIds = new Set(SECRET_PATTERNS.map((pattern) => pattern.id));
    const gateIds = (RULES as { id: string }[])
      .map((rule) => rule.id)
      .filter(
        (id) =>
          !id.startsWith("candidate-name") &&
          !id.startsWith("predecessor-") &&
          !id.startsWith("private-") &&
          id !== "retired-name",
      );

    expect(gateIds.length).toBeGreaterThan(8);
    for (const id of gateIds) {
      expect(engineIds, `${id} must be defined in SECRET_PATTERNS`).toContain(id);
    }
  });

  it("leaves out the context-gated and prose-shaped patterns on purpose", () => {
    // These fire on commit SHAs and on any document that discusses a password. A scanner whose
    // hits are usually wrong is one people learn to wave through, so the omission is deliberate
    // and pinned rather than left to drift back in.
    const gateIds = new Set((RULES as { id: string }[]).map((rule) => rule.id));
    for (const id of [
      "high-entropy-string",
      "inline-password-assignment",
      "inline-api-key-assignment",
      "bearer-token",
    ]) {
      expect(gateIds, `${id} is too noisy for a whole-tree scan`).not.toContain(id);
    }
  });
});

/**
 * Every evasion spelling below is ASSEMBLED at run time from fragments and escapes, never written
 * out. Writing one literally would put a string into this file that normalizes to the reserved
 * name — and the gate scans this file like any other, so the suite proving the fold works would
 * be the leak the fold catches. The gate caught exactly that while this suite was being written.
 */
const HEAD = "tes";
const MID = "s";
const TAIL = "ity";
const ZWSP = "​";
const CYRILLIC_E = "е";
const FULLWIDTH = [0xff54, 0xff45, 0xff53, 0xff53, 0xff49, 0xff54, 0xff59].map((code) =>
  String.fromCharCode(code),
).join("");

describe("decoding and normalization, directly", () => {
  const RESERVED = `${HEAD}${MID}${TAIL}`;

  it("reads latin1 always and adds a UTF-16 view only when the bytes say so", () => {
    const ascii = decodeCandidates(Buffer.from("plain ascii\n")) as { label: string }[];
    expect(ascii.map((view) => view.label)).toEqual(["latin1"]);

    const wide = decodeCandidates(
      Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(RESERVED, "utf16le")]),
    ) as { label: string; text: string }[];
    expect(wide.map((view) => view.label)).toContain("utf16le");
    expect(wide.find((view) => view.label === "utf16le")?.text).toBe(RESERVED);
  });

  it("adds a UTF-8 view for multi-byte content, where latin1 sees only shredded bytes", () => {
    // The reason the UTF-8 view exists: latin1 splits a zero-width space into three separate
    // characters, so every fold the normalizer performs is invisible to it.
    const bytes = Buffer.from(`${HEAD}${ZWSP}${MID}${TAIL}\n`, "utf8");
    const views = decodeCandidates(bytes) as { label: string; text: string }[];

    expect(views.map((view) => view.label)).toEqual(["latin1", "utf8"]);
    expect(views[0]?.text).not.toContain(ZWSP);
    expect(views[1]?.text).toContain(ZWSP);
  });

  it("folds what a reader would read, and maps every character back to its source", () => {
    for (const spelling of [
      `${HEAD}${ZWSP}${MID}${TAIL}`, // zero-width space mid-word
      `t${CYRILLIC_E}${MID}${MID}${TAIL}`, // Cyrillic homoglyph
      FULLWIDTH, // NFKC-equivalent fullwidth forms
      `&#116;e${MID}${MID}${TAIL}`, // HTML numeric entity
      `%74e${MID}${MID}${TAIL}`, // percent-escape
    ]) {
      const { text, map } = normalizeWithMap(spelling) as { text: string; map: number[] };
      expect(text, spelling).toContain(RESERVED);
      // The map is what lets a hit found through the fold report a real byte offset.
      expect(map).toHaveLength(text.length);
      expect(Math.max(...map)).toBeLessThan(spelling.length);
    }
  });

  it("folds without lower-casing when the caller asks for the case-preserving pass", () => {
    // The fold that lower-cases preserves what a case-INSENSITIVE rule means and changes what a
    // case-sensitive one means, which is why the private layer's row identifiers — upper-case
    // rows, matched case-sensitively so a lower-case near-miss stays ordinary prose — were left
    // on the raw views and could not see a fullwidth spelling at all. This is the fold they read.
    const upper = [0xff21, 0xff24].map((code) => String.fromCharCode(code)).join("");

    expect((normalizeWithMap(upper) as { text: string }).text).toBe("ad");
    expect((normalizeWithMap(upper, { preserveCase: true }) as { text: string }).text).toBe("AD");
    // The same pass, minus the lower-casing: escapes, invisibles and NFKC all still reduce.
    const split = `A${ZWSP}D`;
    expect((normalizeWithMap(split, { preserveCase: true }) as { text: string }).text).toBe("AD");

    // The two folds on PLAIN ASCII, which is the overwhelming majority of every file scanned and
    // the path the normalizer short-cuts: NFKC is the identity on ASCII and no confusable key is
    // ASCII, so the only thing left for the case-folded pass to do there is lower-case a letter.
    // Left untested, that shortcut reads like dead work and the next reader deletes it — and the
    // fold silently stops being a fold, one encoding short of where the evasion suite looks.
    const plain = `Fo${String.fromCharCode(0x01)}oT`;
    expect((normalizeWithMap(plain) as { text: string }).text).toBe("foot");
    expect((normalizeWithMap(plain, { preserveCase: true }) as { text: string }).text).toBe("FooT");
  });

  it("leaves an ordinary string alone, so the fold is not doing the finding", () => {
    // The control: if normalization mangled everything into a match, every case above would
    // pass against a broken folder.
    const { text } = normalizeWithMap("a perfectly ordinary line") as { text: string };
    expect(text).toBe("a perfectly ordinary line");
    expect(normalizeWithMap("nothing reserved here")).toMatchObject({
      text: "nothing reserved here",
    });
  });
});
