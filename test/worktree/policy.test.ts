import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EngineError, type ErrorCode } from "../../src/types/errors.ts";
import {
  DEFAULT_WORKTREE_RULES,
  WORKTREE_FARM_DIR_NAME,
  WORKTREE_POLICY_FILE,
  assertRulesAdmissible,
  builtInWorktreePolicy,
  materializationRules,
  matchPolicyRule,
  parseWorktreePolicy,
  policyRules,
  readWorktreePolicy,
  resolveFarmDir,
  resolveStrategy,
  type GitPathClass,
  type WorktreePolicy,
} from "../../src/worktree/policy.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * REQ-WORKTREE-003 and REQ-WORKTREE-004, and the policy half of
 * REQ-WORKTREE-002.
 *
 * Pure except for {@link readWorktreePolicy}, which is exercised over a real
 * temp directory: the one behaviour worth proving there is that an ABSENT file
 * is not an error, and an in-memory volume would model the ENOENT branch
 * without modelling the read that produces it.
 *
 * Git facts arrive as an injected classifier rather than through a `git`
 * invocation, because admissibility is a rule ABOUT those facts. WT-U1b owns
 * the `check-ignore`/`ls-files` pass that produces them.
 */

/** An injected git classifier: anything unnamed is neither tracked nor ignored. */
function classifierFor(facts: Readonly<Record<string, GitPathClass>>): (relPath: string) => GitPathClass {
  return (relPath) => facts[relPath] ?? "untracked";
}

const POLICY_PATH = "/repo/.stamity/worktree.json";

/** The typed-refusal assertion: a classified throw, returned for message checks. */
function refuses(run: () => unknown, code: ErrorCode): EngineError {
  let caught: unknown = null;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught, "expected a refusal, none was thrown").toBeInstanceOf(EngineError);
  const error = caught as EngineError;
  expect(error.code).toBe(code);
  return error;
}

function policyText(document: unknown): string {
  return JSON.stringify(document);
}

describe("worktree policy — document refusals (REQ-WORKTREE-003)", () => {
  it("names the file when the document is not JSON", () => {
    const error = refuses(() => parseWorktreePolicy("{ not json", POLICY_PATH), "VALIDATION_ERROR");
    expect(error.message).toContain(POLICY_PATH);
  });

  it("refuses a document that is not a JSON object, naming the file", () => {
    const error = refuses(() => parseWorktreePolicy("[]", POLICY_PATH), "VALIDATION_ERROR");
    expect(error.message).toContain(POLICY_PATH);
  });

  it("refuses an unsupported version, naming the file and the version field", () => {
    const error = refuses(
      () => parseWorktreePolicy(policyText({ version: 2, entries: [] }), POLICY_PATH),
      "VALIDATION_ERROR",
    );
    expect(error.message).toContain(POLICY_PATH);
    expect(error.message).toContain("version");
    expect(error.message).toContain("2");
  });

  it("refuses a missing version, naming the field", () => {
    const error = refuses(
      () => parseWorktreePolicy(policyText({ entries: [] }), POLICY_PATH),
      "VALIDATION_ERROR",
    );
    expect(error.message).toContain("version");
  });

  it("refuses an unknown top-level key, naming it", () => {
    const error = refuses(
      () => parseWorktreePolicy(policyText({ version: 1, entry: [] }), POLICY_PATH),
      "VALIDATION_ERROR",
    );
    expect(error.message).toContain(POLICY_PATH);
    expect(error.message).toContain("entry");
  });

  it("refuses a non-array entries list, naming the field", () => {
    const error = refuses(
      () => parseWorktreePolicy(policyText({ version: 1, entries: {} }), POLICY_PATH),
      "VALIDATION_ERROR",
    );
    expect(error.message).toContain("entries");
  });

  it("refuses a row that is not an object, naming the list and the index", () => {
    const error = refuses(
      () => parseWorktreePolicy(policyText({ version: 1, entries: ["x"] }), POLICY_PATH),
      "VALIDATION_ERROR",
    );
    expect(error.message).toContain("entries[0]");
  });

  it("refuses a row with no path, naming the field", () => {
    const error = refuses(
      () => parseWorktreePolicy(policyText({ version: 1, entries: [{ strategy: "copy" }] }), POLICY_PATH),
      "VALIDATION_ERROR",
    );
    expect(error.message).toContain("entries[0]");
    expect(error.message).toContain("path");
  });

  it("refuses an unknown row key, naming it", () => {
    const error = refuses(
      () =>
        parseWorktreePolicy(
          policyText({ version: 1, entries: [{ path: ".env.mcp", strategy: "copy", secrets: true }] }),
          POLICY_PATH,
        ),
      "VALIDATION_ERROR",
    );
    expect(error.message).toContain("secrets");
  });

  // REQ-WORKTREE-003: "A glob metacharacter (`*`, `?`, `[`, `{`) is refused,
  // naming the character." One case per character — a matrix that tested only
  // `*` would pass against an implementation that special-cased it.
  it.each([
    ["*", ".env.*"],
    ["?", ".env.mc?"],
    ["[", ".env.[mc]"],
    ["{", ".env.{mcp,local}"],
  ])("refuses the glob metacharacter %s, naming the character and the field", (character, path) => {
    const error = refuses(
      () => parseWorktreePolicy(policyText({ version: 1, entries: [{ path, strategy: "copy" }] }), POLICY_PATH),
      "VALIDATION_ERROR",
    );
    expect(error.message).toContain(POLICY_PATH);
    expect(error.message).toContain("path");
    expect(error.message).toContain(character);
  });

  it.each([
    ["an absolute path", "/etc/passwd"],
    ["a parent-directory segment", "../secrets"],
    ["a backslash", "state\\file"],
    ["a current-directory segment", "./.env.mcp"],
    ["an empty segment", "state//file"],
    // [secfix NEW-1] `.env.mcp::$DATA` names the credential's default NTFS
    // alternate-data-stream alias — `git check-ignore` matches `.env*` and
    // echoes it back, admitting it with `secret: false` (the identity check
    // is basename-only and never saw the colon). A colon is illegal in a
    // Windows filename regardless, so refusing it costs nothing on ANY
    // platform and closes the whole alias class structurally rather than by
    // enumerating known stream names.
    ["a colon (a Windows alternate-data-stream alias)", ".env.mcp::$DATA"],
  ])("refuses %s, naming the file and the path field", (_label, path) => {
    const error = refuses(
      () => parseWorktreePolicy(policyText({ version: 1, entries: [{ path, strategy: "copy" }] }), POLICY_PATH),
      "VALIDATION_ERROR",
    );
    expect(error.message).toContain(POLICY_PATH);
    expect(error.message).toContain("path");
  });

  it("refuses an unknown strategy, naming the field and the closed set", () => {
    const error = refuses(
      () =>
        parseWorktreePolicy(
          policyText({ version: 1, entries: [{ path: ".env.mcp", strategy: "hardlink" }] }),
          POLICY_PATH,
        ),
      "VALIDATION_ERROR",
    );
    expect(error.message).toContain("strategy");
    expect(error.message).toContain("copy");
    expect(error.message).toContain("symlink");
    expect(error.message).toContain("skip");
  });

  it("refuses a non-boolean secret, naming the field", () => {
    const error = refuses(
      () =>
        parseWorktreePolicy(
          policyText({ version: 1, entries: [{ path: ".env.mcp", strategy: "copy", secret: "yes" }] }),
          POLICY_PATH,
        ),
      "VALIDATION_ERROR",
    );
    expect(error.message).toContain("secret");
  });

  it("refuses a non-string farmDir, naming the field", () => {
    const error = refuses(
      () => parseWorktreePolicy(policyText({ version: 1, farmDir: 3 }), POLICY_PATH),
      "VALIDATION_ERROR",
    );
    expect(error.message).toContain("farmDir");
  });
});

describe("worktree policy — contested paths (REQ-WORKTREE-003)", () => {
  it("refuses one path claimed by an entry and an override, naming both lists and the file", () => {
    const error = refuses(
      () =>
        parseWorktreePolicy(
          policyText({
            version: 1,
            entries: [{ path: ".env.mcp", strategy: "copy" }],
            overrides: [{ path: ".env.mcp", strategy: "skip" }],
          }),
          POLICY_PATH,
        ),
      "VALIDATION_ERROR",
    );
    expect(error.message).toContain(POLICY_PATH);
    expect(error.message).toContain(".env.mcp");
    expect(error.message).toContain("entries");
    expect(error.message).toContain("overrides");
  });

  it("refuses one path claimed twice inside the same list", () => {
    const error = refuses(
      () =>
        parseWorktreePolicy(
          policyText({
            version: 1,
            entries: [
              { path: "node_modules", strategy: "symlink" },
              { path: "node_modules", strategy: "skip" },
            ],
          }),
          POLICY_PATH,
        ),
      "VALIDATION_ERROR",
    );
    expect(error.message).toContain("node_modules");
    expect(error.message).toContain("entries");
  });

  it("refuses a trailing-slash spelling that contests the same path", () => {
    // `node_modules/` and `node_modules` address one directory. Normalizing
    // before the contest check is what makes "two rows claiming the SAME path"
    // true of spellings rather than only of byte-identical strings.
    const error = refuses(
      () =>
        parseWorktreePolicy(
          policyText({
            version: 1,
            entries: [{ path: "node_modules/", strategy: "symlink" }],
            overrides: [{ path: "node_modules", strategy: "skip" }],
          }),
          POLICY_PATH,
        ),
      "VALIDATION_ERROR",
    );
    expect(error.message).toContain("node_modules");
  });

  it("admits two rows where one is a strict prefix of the other", () => {
    const policy = parseWorktreePolicy(
      policyText({
        version: 1,
        entries: [{ path: "node_modules", strategy: "symlink" }],
        overrides: [{ path: "node_modules/.cache", strategy: "skip" }],
      }),
      POLICY_PATH,
    );
    expect(policyRules(policy)).toHaveLength(2);
  });
});

describe("worktree policy — longest-prefix resolution (REQ-WORKTREE-003)", () => {
  /**
   * The order-independence criterion, asserted by building the SAME two rows in
   * both declaration orders and requiring identical answers. Declaration order
   * carrying no meaning is the whole fix this requirement makes, so a case that
   * built one order only would pass against a last-match-wins resolver.
   */
  const orders: readonly (readonly [string, WorktreePolicy])[] = [
    [
      "entry first",
      parseWorktreePolicy(
        policyText({
          version: 1,
          entries: [{ path: "node_modules", strategy: "symlink" }],
          overrides: [{ path: "node_modules/.cache", strategy: "skip" }],
        }),
        POLICY_PATH,
      ),
    ],
    [
      "override first",
      parseWorktreePolicy(
        policyText({
          version: 1,
          overrides: [{ path: "node_modules/.cache", strategy: "skip" }],
          entries: [{ path: "node_modules", strategy: "symlink" }],
        }),
        POLICY_PATH,
      ),
    ],
  ];

  it.each(orders)("resolves the deeper row for a contained path (%s)", (_label, policy) => {
    expect(resolveStrategy(policy, "node_modules/.cache")).toBe("skip");
    expect(resolveStrategy(policy, "node_modules/.cache/babel/file.json")).toBe("skip");
  });

  it.each(orders)("resolves the shallower row for a sibling path (%s)", (_label, policy) => {
    expect(resolveStrategy(policy, "node_modules/foo")).toBe("symlink");
    expect(resolveStrategy(policy, "node_modules")).toBe("symlink");
  });

  it("matches on a path SEGMENT boundary, never on a string prefix", () => {
    const policy = parseWorktreePolicy(
      policyText({ version: 1, entries: [{ path: "node_modules", strategy: "symlink" }] }),
      POLICY_PATH,
    );
    expect(matchPolicyRule(policy, "node_modules_backup")).toBeNull();
    expect(resolveStrategy(policy, "node_modules_backup")).toBe("skip");
  });

  it("resolves an unnamed path to skip with no matching rule", () => {
    const policy = parseWorktreePolicy(policyText({ version: 1, entries: [] }), POLICY_PATH);
    expect(matchPolicyRule(policy, "src/index.ts")).toBeNull();
    expect(resolveStrategy(policy, "src/index.ts")).toBe("skip");
  });

  it("reports the matched rule's declaring list, so a refusal can name it", () => {
    const [, policy] = orders[0] ?? [];
    expect(policy).toBeDefined();
    expect(matchPolicyRule(policy as WorktreePolicy, "node_modules/.cache")?.list).toBe("overrides");
    expect(matchPolicyRule(policy as WorktreePolicy, "node_modules/foo")?.list).toBe("entries");
  });

  it("lists only the rows that write something as the materialization set", () => {
    const policy = parseWorktreePolicy(
      policyText({
        version: 1,
        entries: [
          { path: ".env.mcp", strategy: "copy", secret: true },
          { path: "node_modules", strategy: "skip" },
          { path: ".venv", strategy: "symlink" },
        ],
      }),
      POLICY_PATH,
    );
    expect(materializationRules(policy).map((rule) => rule.path)).toEqual([".env.mcp", ".venv"]);
  });
});

describe("worktree policy — the built-in defaults (REQ-WORKTREE-004)", () => {
  const getRoot = useTempDir("worktree-policy");

  it("is two rows: the credential copy and the node_modules skip", () => {
    expect(DEFAULT_WORKTREE_RULES.map((rule) => [rule.path, rule.strategy, rule.secret])).toEqual([
      [".env.mcp", "copy", true],
      ["node_modules", "skip", false],
    ]);
  });

  it("materializes exactly the credential file, and never node_modules", () => {
    const policy = builtInWorktreePolicy();
    expect(materializationRules(policy).map((rule) => rule.path)).toEqual([".env.mcp"]);
    expect(resolveStrategy(policy, "node_modules")).toBe("skip");
    expect(resolveStrategy(policy, "node_modules/.bin/vitest")).toBe("skip");
  });

  it("reads an absent policy file as the built-in defaults rather than as an error", async () => {
    const policy = await readWorktreePolicy(getRoot().dir);
    expect(policy.builtIn).toBe(true);
    expect(policyRules(policy)).toEqual(DEFAULT_WORKTREE_RULES);
  });

  it("reads a present policy file and records its absolute path as the source", async () => {
    const root = getRoot();
    await root.seedFiles({
      [WORKTREE_POLICY_FILE]: policyText({
        version: 1,
        entries: [{ path: ".env.local", strategy: "copy" }],
      }),
    });

    const policy = await readWorktreePolicy(root.dir);
    expect(policy.builtIn).toBe(false);
    expect(policy.source).toBe(join(root.dir, WORKTREE_POLICY_FILE));
    expect(policyRules(policy).map((rule) => rule.path)).toEqual([".env.local"]);
  });

  it("names the on-disk file when the present policy is malformed", async () => {
    const root = getRoot();
    await root.seedFiles({ [WORKTREE_POLICY_FILE]: "{ version: 1 }" });

    await expect(readWorktreePolicy(root.dir)).rejects.toThrow(join(root.dir, WORKTREE_POLICY_FILE));
  });
});

describe("worktree policy — admissibility against git facts (REQ-WORKTREE-003)", () => {
  it("admits a rule naming an ignored path", () => {
    const policy = parseWorktreePolicy(
      policyText({ version: 1, entries: [{ path: ".env.mcp", strategy: "copy", secret: true }] }),
      POLICY_PATH,
    );
    expect(() => assertRulesAdmissible(policy, classifierFor({ ".env.mcp": "ignored" }))).not.toThrow();
  });

  it("refuses a tracked path, naming it and stating the checkout supplies it", () => {
    const policy = parseWorktreePolicy(
      policyText({ version: 1, entries: [{ path: "README.md", strategy: "copy" }] }),
      POLICY_PATH,
    );
    const error = refuses(
      () => assertRulesAdmissible(policy, classifierFor({ "README.md": "tracked" })),
      "VALIDATION_ERROR",
    );
    expect(error.message).toContain(POLICY_PATH);
    expect(error.message).toContain("README.md");
    expect(error.message).toContain("checkout");
  });

  it("refuses a path git neither tracks nor ignores, naming both conditions", () => {
    const policy = parseWorktreePolicy(
      policyText({ version: 1, entries: [{ path: ".stamity/review-gate.json", strategy: "copy" }] }),
      POLICY_PATH,
    );
    const error = refuses(
      () => assertRulesAdmissible(policy, classifierFor({ ".stamity/review-gate.json": "untracked" })),
      "VALIDATION_ERROR",
    );
    expect(error.message).toContain(".stamity/review-gate.json");
    expect(error.message).toContain("tracks");
    expect(error.message).toContain("ignores");
  });

  /**
   * A `skip` row writes nothing, so it cannot dirty the new worktree and the
   * refusal has nothing to protect. It is also the row the built-in defaults
   * carry: refusing a skip row over a tracked path would brick the verb in a
   * repository that commits its `node_modules`.
   */
  it("admits a skip row over a tracked path, because a skip row writes nothing", () => {
    const policy = parseWorktreePolicy(
      policyText({ version: 1, entries: [{ path: "node_modules", strategy: "skip" }] }),
      POLICY_PATH,
    );
    expect(() => assertRulesAdmissible(policy, classifierFor({ node_modules: "tracked" }))).not.toThrow();
  });

  /**
   * A built-in row has no file to edit, so a refusal that said "remove the row
   * from <built-in worktree defaults>" would name a next step nobody can take.
   */
  it("points a built-in row's refusal at the policy file that overrides it", () => {
    const error = refuses(
      () => assertRulesAdmissible(builtInWorktreePolicy(), classifierFor({ ".env.mcp": "untracked" })),
      "VALIDATION_ERROR",
    );
    expect(error.next).toContain(WORKTREE_POLICY_FILE);
    expect(error.next).not.toContain("remove the row from <built-in");
  });

  it("checks every materializing row, not only the first", () => {
    const policy = parseWorktreePolicy(
      policyText({
        version: 1,
        entries: [
          { path: ".env.mcp", strategy: "copy", secret: true },
          { path: "docs", strategy: "symlink" },
        ],
      }),
      POLICY_PATH,
    );
    const error = refuses(
      () => assertRulesAdmissible(policy, classifierFor({ ".env.mcp": "ignored", docs: "tracked" })),
      "VALIDATION_ERROR",
    );
    expect(error.message).toContain("docs");
  });
});

describe("worktree policy — farm resolution (REQ-WORKTREE-002)", () => {
  it("defaults to a dot-directory sibling of the repository, keyed by the repo directory name", () => {
    const policy = builtInWorktreePolicy();
    // The farm is a real filesystem location, so the expected value is native,
    // resolve-anchored form — matching the drive `resolveFarmDir` resolves the
    // repo root onto on Windows. A `join("/home/dev/projects", …)` literal is
    // drive-less and only held off Windows, where `resolve` and `join` coincide.
    expect(resolveFarmDir(policy, "/home/dev/projects/myrepo")).toBe(
      resolve("/home/dev/projects", WORKTREE_FARM_DIR_NAME, "myrepo"),
    );
  });

  it("resolves a declared farmDir relative to the repository root", () => {
    const policy = parseWorktreePolicy(
      policyText({ version: 1, farmDir: "../worktrees/myrepo" }),
      POLICY_PATH,
    );
    // Native, resolve-anchored form: the farm is a real path, so the POSIX
    // string literal that only held off Windows is replaced with `resolve`.
    expect(resolveFarmDir(policy, "/home/dev/projects/myrepo")).toBe(
      resolve("/home/dev/projects/worktrees/myrepo"),
    );
  });

  it("refuses a farmDir inside the repository, naming the resolved absolute path", () => {
    const policy = parseWorktreePolicy(policyText({ version: 1, farmDir: ".worktrees" }), POLICY_PATH);
    const error = refuses(() => resolveFarmDir(policy, "/home/dev/projects/myrepo"), "VALIDATION_ERROR");
    expect(error.message).toContain(join("/home/dev/projects/myrepo", ".worktrees"));
    expect(error.message).toContain("farmDir");
  });

  it("refuses a farmDir that resolves to the repository root itself", () => {
    const policy = parseWorktreePolicy(policyText({ version: 1, farmDir: "." }), POLICY_PATH);
    const error = refuses(() => resolveFarmDir(policy, "/home/dev/projects/myrepo"), "VALIDATION_ERROR");
    // The refusal names the resolved repo root (a real path an operator reads),
    // so the expected substring is native, resolve-anchored — not the POSIX
    // literal, which the backslash-and-drive message never contains on Windows.
    expect(error.message).toContain(resolve("/home/dev/projects/myrepo"));
  });

  // [m2] `farmDir: ".."` resolves to the repository's OWN PARENT — the
  // directory the repository itself sits inside. That passes both existing
  // guards (it does not escape past the parent, and it is not inside the
  // repository), but it puts every OTHER sibling directory "inside the farm"
  // and makes the repository's own root a child of the farm setup would
  // `mkdir(..., { mode: 0o700 })` and `chmod` — tightening permissions on the
  // directory that holds the repository itself.
  it("refuses a farmDir that resolves to the repository's own parent directory", () => {
    const policy = parseWorktreePolicy(policyText({ version: 1, farmDir: ".." }), POLICY_PATH);
    const error = refuses(() => resolveFarmDir(policy, "/home/dev/projects/myrepo"), "VALIDATION_ERROR");
    expect(error.message).toContain(resolve("/home/dev/projects"));
  });
});

// A present policy replaces DEFAULT_WORKTREE_RULES wholesale, so a committed
// policy naming `.env.mcp` without `secret` would strip the consent gate and the
// 0600 if `secret` were a plain untrusted boolean. Secrecy is resolved by
// IDENTITY: a known-credential basename is always secret, and the policy may
// raise secrecy, never lower it.
describe("known-credential paths are secret by identity, not by the boolean [secfix C1]", () => {
  it("forces `secret` true on a .env.mcp copy row that omits it [secfix]", () => {
    const policy = parseWorktreePolicy(
      policyText({ version: 1, entries: [{ path: ".env.mcp", strategy: "copy" }] }),
      POLICY_PATH,
    );
    expect(policy.entries[0]?.secret).toBe(true);
  });

  it("refuses to LOWER secrecy on a .env.mcp row declaring secret:false [secfix]", () => {
    const policy = parseWorktreePolicy(
      policyText({ version: 1, entries: [{ path: ".env.mcp", strategy: "copy", secret: false }] }),
      POLICY_PATH,
    );
    expect(policy.entries[0]?.secret).toBe(true);
  });

  it("keys on the basename, so a nested .env.mcp is still secret [secfix]", () => {
    const policy = parseWorktreePolicy(
      policyText({ version: 1, entries: [{ path: "sub/.env.mcp", strategy: "copy" }] }),
      POLICY_PATH,
    );
    expect(policy.entries[0]?.secret).toBe(true);
  });

  it("leaves a non-credential row's declared secrecy alone [secfix]", () => {
    const policy = parseWorktreePolicy(
      policyText({ version: 1, entries: [{ path: "some.file", strategy: "copy" }] }),
      POLICY_PATH,
    );
    expect(policy.entries[0]?.secret).toBe(false);
  });

  // A case-insensitive filesystem (macOS APFS default) makes `.ENV.MCP` and
  // `.env.mcp` address the ONE file on disk; `git check-ignore` honors
  // `core.ignorecase` too, so an exact-string Set lookup that skips the
  // variant leaves it admitted, copied without the --copy-secrets gate, and
  // mislabeled non-secret in the receipt. The identity check must raise
  // secrecy for the variant the same way it does for the true spelling.
  it.each([
    ["upper-case", ".ENV.MCP"],
    ["mixed-case", ".Env.Mcp"],
    ["trailing dot (Windows drops it)", ".env.mcp."],
    // [secfix A3] Windows strips ALL trailing dots AND spaces from a filename,
    // not just one of each — `.env.mcp..` and `.env.mcp ` both address the
    // SAME file on disk as `.env.mcp` there, and both are admissible spellings
    // (`.env*` still matches the ignore glob, `git check-ignore` echoes them
    // back), so a normalizer stripping only one trailing dot let these two
    // evade the known-credential identity check entirely.
    ["two trailing dots (Windows drops both)", ".env.mcp.."],
    ["trailing space (Windows drops it)", ".env.mcp "],
    ["mixed case with trailing dot and space", ".ENV.MCP. ."],
  ])("forces `secret` true on a case/dot/space variant of the credential basename: %s [secfix C1]", (_label, path) => {
    const policy = parseWorktreePolicy(policyText({ version: 1, entries: [{ path, strategy: "copy" }] }), POLICY_PATH);
    expect(policy.entries[0]?.secret).toBe(true);
  });

  // [secfix A3] A basename that normalizes to the EMPTY string (all dots and
  // spaces) must not be swept into the credential set — the strip is bounded
  // to trailing dots/spaces of an otherwise-matching name, not a rule that
  // makes an empty string match everything.
  it("a basename reducing to empty after normalization matches nothing [secfix]", () => {
    const policy = parseWorktreePolicy(
      policyText({ version: 1, entries: [{ path: "... .", strategy: "copy" }] }),
      POLICY_PATH,
    );
    expect(policy.entries[0]?.secret).toBe(false);
  });

  // A basename that merely CONTAINS the credential name is a different file
  // and must not be swept in by the normalization — raising secrecy widens
  // correctly only for the credential's own spelling, not for any superstring.
  it("does not force `secret` on a basename that only contains the credential name [secfix]", () => {
    const policy = parseWorktreePolicy(
      policyText({ version: 1, entries: [{ path: "my.env.mcp.backup", strategy: "copy" }] }),
      POLICY_PATH,
    );
    expect(policy.entries[0]?.secret).toBe(false);
  });
});

describe("untrusted policy keys are quoted, never emitted raw [secfix W5]", () => {
  it("renders an unknown top-level key with a control byte quoted/stripped [secfix]", () => {
    const esc = String.fromCharCode(0x1b);
    const key = `ev${esc}il`;
    const error = refuses(
      () => parseWorktreePolicy(policyText({ version: 1, [key]: 1 }), POLICY_PATH),
      "VALIDATION_ERROR",
    );
    // The raw ESC byte must not reach the message; JSON.stringify escapes it.
    expect(error.message).not.toContain(esc);
    expect(error.message).toContain("\\u001b");
  });

  it("renders an unknown rule key with a control byte quoted/stripped [secfix]", () => {
    const esc = String.fromCharCode(0x1b);
    const key = `ev${esc}il`;
    const error = refuses(
      () =>
        parseWorktreePolicy(
          policyText({ version: 1, entries: [{ path: "x", strategy: "copy", [key]: 1 }] }),
          POLICY_PATH,
        ),
      "VALIDATION_ERROR",
    );
    expect(error.message).not.toContain(esc);
    expect(error.message).toContain("\\u001b");
  });
});

describe("farmDir must be a sibling-ish location [secfix W2]", () => {
  it("refuses an absolute farmDir, naming the field [secfix]", () => {
    const policy = parseWorktreePolicy(policyText({ version: 1, farmDir: "/etc/evil" }), POLICY_PATH);
    const error = refuses(() => resolveFarmDir(policy, "/home/dev/projects/myrepo"), "VALIDATION_ERROR");
    expect(error.message).toContain("farmDir");
  });

  it("refuses a farmDir escaping beyond the repository's parent via .. [secfix]", () => {
    const policy = parseWorktreePolicy(
      policyText({ version: 1, farmDir: "../../../../tmp/evil" }),
      POLICY_PATH,
    );
    const error = refuses(() => resolveFarmDir(policy, "/home/dev/projects/myrepo"), "VALIDATION_ERROR");
    expect(error.message).toContain("farmDir");
  });

  it("still accepts a sibling farmDir under the repository's parent [secfix]", () => {
    const policy = parseWorktreePolicy(
      policyText({ version: 1, farmDir: "../worktrees/myrepo" }),
      POLICY_PATH,
    );
    // Native, resolve-anchored form — see the farm-resolution cases above.
    expect(resolveFarmDir(policy, "/home/dev/projects/myrepo")).toBe(
      resolve("/home/dev/projects/worktrees/myrepo"),
    );
  });
});
