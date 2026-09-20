import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/**
 * The fork this fixture publishes AS when it is asked for its own identity: the owner
 * `test/ci/forkIdentity.test.ts` renames into, and never this repository's own owner. Only the
 * two keys `scripts/distribution-identity.mjs` admits are set — `stamity.publisher` and
 * `repository.url` — and no credential-shaped key is written at any depth, because that module
 * refuses one and a fixture that carried one would be proving the refusal, not the identity.
 */
export const FORK_PUBLISHER = "acme";
export const FORK_REPOSITORY_SLUG = "stamity-private";
export const FORK_REPOSITORY = `https://github.com/${FORK_PUBLISHER}/${FORK_REPOSITORY_SLUG}`;

/**
 * `globs:` on a rule, added 2026-09-15. The engine's rule-delivery default
 * demotes a rule that declares NO globs to a skill, because an APM instruction
 * attaches on `applyTo` and the value for "no globs" is `**` — every file, every
 * session. These fixtures exist to exercise the four fork operations across the
 * four PRIMITIVE HOMES, and a rule with no globs would move all four of them out
 * of the instruction home and leave that home untested downstream. The declared
 * scope is what keeps the rule class a rule here; the real corpus covers the
 * demoted half in `apmPackage.test.ts`.
 */
const document = (id: string, type: string, body: string): string =>
  `---\nid: ${id}\ntype: ${type}\ndescription: Fixture ${type}\ntags: [fixture]\nload: on-demand\n${
    type === "rule" ? 'globs: ["**/*.md"]\n' : ""
  }---\n\n${body}\n`;

/** Authoring inputs only. Expected delivered paths/bodies below are stated independently. */
function writeCustomization(root: string): void {
  for (const [type, dir, prefix] of [
    ["rule", "rules", "stamity-"],
    ["command", "commands", "st-"],
    ["agent", "agents", "stamity-"],
    ["skill", "skills", "st-"],
  ] as const) {
    const pathFor = (layer: string, id: string): string =>
      join(root, layer, dir, type === "skill" ? `${id}/SKILL.md` : `${id}.md`);
    for (const operation of ["source", "replace", "patch"]) {
      const id = `${operation}-${type}`;
      write(pathFor("content", `${prefix}${id}`), document(id, type, `Original ${id}.`));
    }
    // A direct edit remains an authoring route independently of the fork layer.
    write(pathFor("content", `${prefix}source-${type}`), document(`source-${type}`, type, `Source edit ${type}.`));
    for (const operation of ["add", "replace"]) {
      const id = `${operation}-${type}`;
      write(pathFor("fork", id), document(id, type, `Fork ${operation} ${type}.`));
    }
    const patch = pathFor("fork", `patch-${type}`).replace(/\.md$/, ".customize");
    write(`${patch}.md`, `Patch witness ${type}.\n`);
    write(`${patch}.yaml`, `description: Patched ${type}\n`);
  }
  write(join(root, "content/skills/st-replace-skill/references/upstream.txt"), "Must not survive full replacement.\n");
  write(join(root, "content/skills/st-patch-skill/references/base.txt"), "Retained patch companion.\n");
  write(join(root, "fork/skills/replace-skill/references/own.txt"), "Replacement companion.\n");
  write(join(root, "fork/skills/add-skill/references/own.txt"), "Addition companion.\n");
  write(join(root, "fork/skills/add-skill/assets/data.bin"), Buffer.from([0, 255, 128, 65, 10]));
  // Consumer overrides must never become package-authoring inputs.
  write(join(root, ".stamity/overrides/rules/source-rule.md"), document("source-rule", "rule", "Consumer-only body."));
}

export function write(path: string, bytes: string | Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

/**
 * What a caller may ask this checkout to be BESIDES a corpus. Both default to off, and that is a
 * contract rather than a convenience: `test/ci/apmDownstream.test.ts`'s moved-repository case
 * derives its "moved" owner from the canonical checkout's publisher and expects the generator to
 * refuse it, so a fixture that already published as `acme` would satisfy the refusal instead of
 * reaching it — measured red at `test/ci/apmDownstream.test.ts:211` (`expected +0 to be 1`, both
 * parameterized generators) on an unconditional rewrite, 2026-09-20.
 */
export interface DownstreamOptions {
  /** Publish as {@link FORK_PUBLISHER} at {@link FORK_REPOSITORY} instead of inheriting this repository's. */
  readonly identity?: boolean;
  /** `git init` plus one commit, so a generator that stamps provenance from HEAD resolves one here. */
  readonly git?: boolean;
}

/** A real source checkout with the real catalog/dependencies, isolated from the working tree. */
export function downstreamCheckout(root: string, options: DownstreamOptions = {}): void {
  mkdirSync(root, { recursive: true });
  for (const path of ["src", "scripts", "assets"]) cpSync(join(ROOT, path), join(root, path), { recursive: true });
  if (options.identity === true) {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as Record<string, unknown>;
    // The four edits `docs/enterprise-forks.md` prescribes, and no more: the scope, the publisher,
    // the source URL and the homepage. The scope is part of the identity rather than cosmetic —
    // `runtime.companion.package` in every root's capability file is the package NAME, so a fork
    // that kept the canonical scope would publish the canonical package as its own companion.
    pkg["name"] = `@${FORK_PUBLISHER}/stamity`;
    pkg["stamity"] = { ...((pkg["stamity"] ?? {}) as Record<string, unknown>), publisher: FORK_PUBLISHER };
    pkg["repository"] = { type: "git", url: `${FORK_REPOSITORY}.git` };
    pkg["homepage"] = FORK_REPOSITORY;
    write(join(root, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  } else {
    write(join(root, "package.json"), readFileSync(join(ROOT, "package.json")));
  }
  symlinkSync(join(ROOT, "node_modules"), join(root, "node_modules"), "junction");
  writeCustomization(root);
  if (options.git === true) gitInit(root);
}

/**
 * One commit, so `git rev-parse HEAD` and `git show -s --format=%cI HEAD` answer inside the
 * fixture. The commit is EMPTY on purpose: every generator reads the working tree, and what the
 * provenance stamp needs is a resolvable HEAD, not an index. Identity and signing are forced on
 * the command line so the machine's own git configuration cannot change the fixture.
 */
function gitInit(root: string): void {
  const git = (...args: string[]): void => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(`git ${args.join(" ")} exited ${String(result.status)}: ${result.stderr ?? ""}`);
    }
  };
  git("init", "--quiet", "--initial-branch", "fixture");
  git(
    "-c",
    "user.name=fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "--quiet",
    "--allow-empty",
    "--message",
    "fixture: the downstream checkout this proof builds from",
  );
}

/**
 * The fixture checkout's own provenance: the commit every root built from it must name as its
 * source, and that commit's date. Both are read with git rather than remembered from the write,
 * because the assertion is that the BUILD resolved the checkout's HEAD — a value the test kept
 * from the commit call would agree with itself.
 */
export function fixtureProvenance(root: string): { readonly commit: string; readonly date: string } {
  const fact = (args: string[]): string => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(`git ${args.join(" ")} exited ${String(result.status)} in ${root}`);
    }
    return result.stdout.trim();
  };
  return { commit: fact(["rev-parse", "HEAD"]), date: fact(["show", "-s", "--format=%cI", "HEAD"]) };
}

// No catalog, generator, or .apm reads produce this oracle. Each authored operation has a
// separately declared consumer identity and body, reusable by the real install proof.
export const EXPECTED_PRIMITIVES = [
  ["instructions/stamity-source-rule.instructions.md", "\nSource edit rule.\n"],
  ["instructions/stamity-add-rule.instructions.md", "\nFork add rule.\n"],
  ["instructions/stamity-replace-rule.instructions.md", "\nFork replace rule.\n"],
  ["instructions/stamity-patch-rule.instructions.md", "\nOriginal patch-rule.\n\nPatch witness rule.\n"],
  ["prompts/st-source-command.prompt.md", "\nSource edit command.\n"],
  ["prompts/st-add-command.prompt.md", "\nFork add command.\n"],
  ["prompts/st-replace-command.prompt.md", "\nFork replace command.\n"],
  ["prompts/st-patch-command.prompt.md", "\nOriginal patch-command.\n\nPatch witness command.\n"],
  ["agents/stamity-source-agent.agent.md", "\nSource edit agent.\n"],
  ["agents/stamity-add-agent.agent.md", "\nFork add agent.\n"],
  ["agents/stamity-replace-agent.agent.md", "\nFork replace agent.\n"],
  ["agents/stamity-patch-agent.agent.md", "\nOriginal patch-agent.\n\nPatch witness agent.\n"],
  ["skills/st-source-skill/SKILL.md", "\nSource edit skill.\n"],
  ["skills/add-skill/SKILL.md", "\nFork add skill.\n"],
  ["skills/st-replace-skill/SKILL.md", "\nFork replace skill.\n"],
  ["skills/st-patch-skill/SKILL.md", "\nOriginal patch-skill.\n\nPatch witness skill.\n"],
] as const;

/**
 * The same oracle for the four PLUGIN ROOTS, one distribution-relative path per delivered file.
 *
 * Declared the way {@link EXPECTED_PRIMITIVES} is declared, and for the same reason: no catalog,
 * layout module or generator read produces it, so a home that moves or a body that stops being
 * substituted is a red test rather than a table agreeing with itself. The four clients disagree
 * about homes and about which classes a container carries at all, and every difference below was
 * read off the vendor contracts in `.github/client-contracts.md` rather than off a build:
 *
 *   claude    `agents/`, `commands/`, `skills/`; rules are repository-owned (no `rules/` here).
 *   cursor    `agents/`, `rules/`, `skills/`, and COMMANDS as skill directories — the client's
 *             own conversion, so `st-<id>` appears under `skills/` and not under a command home.
 *   copilot   `com.github.copilot/agents/` with the `.agent.md` suffix the reference states,
 *             `com.github.copilot/commands/` as `<id>.md`, and `skills/` fixed at the root.
 *   codex     `skills/` only: agents, commands and rules are outside the Agent Plugins v1
 *             format, so a rule ships as a skill directory under its rule id.
 *
 * TEXT PAIRS ONLY. `fork/skills/add-skill/assets/data.bin` is delivered to every root with its
 * bytes corrupted (0xFF 0x80 arrive as the UTF-8 replacement character), which the APM lane does
 * not do — a pre-existing engine defect, carried on the inbox as build/28 and outside this
 * unit. Its PRESENCE is asserted by the suite; its bytes are deliberately not an oracle here,
 * because pinning the corrupted bytes would make the defect the contract.
 */
export const EXPECTED_PLUGIN_FILES = [
  // ── claude ───────────────────────────────────────────────────────
  ["claude/agents/stamity-source-agent.md", "\nSource edit agent.\n"],
  ["claude/agents/stamity-add-agent.md", "\nFork add agent.\n"],
  ["claude/agents/stamity-replace-agent.md", "\nFork replace agent.\n"],
  ["claude/agents/stamity-patch-agent.md", "\nOriginal patch-agent.\n\nPatch witness agent.\n"],
  ["claude/commands/st-source-command.md", "\nSource edit command.\n"],
  ["claude/commands/st-add-command.md", "\nFork add command.\n"],
  ["claude/commands/st-replace-command.md", "\nFork replace command.\n"],
  ["claude/commands/st-patch-command.md", "\nOriginal patch-command.\n\nPatch witness command.\n"],
  ["claude/skills/st-source-skill/SKILL.md", "\nSource edit skill.\n"],
  ["claude/skills/add-skill/SKILL.md", "\nFork add skill.\n"],
  ["claude/skills/add-skill/references/own.txt", "Addition companion.\n"],
  ["claude/skills/st-replace-skill/SKILL.md", "\nFork replace skill.\n"],
  ["claude/skills/st-replace-skill/references/own.txt", "Replacement companion.\n"],
  ["claude/skills/st-patch-skill/SKILL.md", "\nOriginal patch-skill.\n\nPatch witness skill.\n"],
  ["claude/skills/st-patch-skill/references/base.txt", "Retained patch companion.\n"],
  // ── cursor ───────────────────────────────────────────────────────
  ["cursor/agents/stamity-source-agent.md", "\nSource edit agent.\n"],
  ["cursor/agents/stamity-add-agent.md", "\nFork add agent.\n"],
  ["cursor/agents/stamity-replace-agent.md", "\nFork replace agent.\n"],
  ["cursor/agents/stamity-patch-agent.md", "\nOriginal patch-agent.\n\nPatch witness agent.\n"],
  ["cursor/rules/stamity-source-rule.mdc", "\nSource edit rule.\n"],
  ["cursor/rules/stamity-add-rule.mdc", "\nFork add rule.\n"],
  ["cursor/rules/stamity-replace-rule.mdc", "\nFork replace rule.\n"],
  ["cursor/rules/stamity-patch-rule.mdc", "\nOriginal patch-rule.\n\nPatch witness rule.\n"],
  ["cursor/skills/st-source-command/SKILL.md", "\nSource edit command.\n"],
  ["cursor/skills/st-add-command/SKILL.md", "\nFork add command.\n"],
  ["cursor/skills/st-replace-command/SKILL.md", "\nFork replace command.\n"],
  ["cursor/skills/st-patch-command/SKILL.md", "\nOriginal patch-command.\n\nPatch witness command.\n"],
  ["cursor/skills/st-source-skill/SKILL.md", "\nSource edit skill.\n"],
  ["cursor/skills/add-skill/SKILL.md", "\nFork add skill.\n"],
  ["cursor/skills/add-skill/references/own.txt", "Addition companion.\n"],
  ["cursor/skills/st-replace-skill/SKILL.md", "\nFork replace skill.\n"],
  ["cursor/skills/st-replace-skill/references/own.txt", "Replacement companion.\n"],
  ["cursor/skills/st-patch-skill/SKILL.md", "\nOriginal patch-skill.\n\nPatch witness skill.\n"],
  ["cursor/skills/st-patch-skill/references/base.txt", "Retained patch companion.\n"],
  // ── copilot ──────────────────────────────────────────────────────
  ["copilot/com.github.copilot/agents/stamity-source-agent.agent.md", "\nSource edit agent.\n"],
  ["copilot/com.github.copilot/agents/stamity-add-agent.agent.md", "\nFork add agent.\n"],
  ["copilot/com.github.copilot/agents/stamity-replace-agent.agent.md", "\nFork replace agent.\n"],
  ["copilot/com.github.copilot/agents/stamity-patch-agent.agent.md", "\nOriginal patch-agent.\n\nPatch witness agent.\n"],
  ["copilot/com.github.copilot/commands/st-source-command.md", "\nSource edit command.\n"],
  ["copilot/com.github.copilot/commands/st-add-command.md", "\nFork add command.\n"],
  ["copilot/com.github.copilot/commands/st-replace-command.md", "\nFork replace command.\n"],
  ["copilot/com.github.copilot/commands/st-patch-command.md", "\nOriginal patch-command.\n\nPatch witness command.\n"],
  ["copilot/skills/st-source-skill/SKILL.md", "\nSource edit skill.\n"],
  ["copilot/skills/add-skill/SKILL.md", "\nFork add skill.\n"],
  ["copilot/skills/add-skill/references/own.txt", "Addition companion.\n"],
  ["copilot/skills/st-replace-skill/SKILL.md", "\nFork replace skill.\n"],
  ["copilot/skills/st-replace-skill/references/own.txt", "Replacement companion.\n"],
  ["copilot/skills/st-patch-skill/SKILL.md", "\nOriginal patch-skill.\n\nPatch witness skill.\n"],
  ["copilot/skills/st-patch-skill/references/base.txt", "Retained patch companion.\n"],
  // ── codex ────────────────────────────────────────────────────────
  ["codex/skills/stamity-source-rule/SKILL.md", "\nSource edit rule.\n"],
  ["codex/skills/stamity-add-rule/SKILL.md", "\nFork add rule.\n"],
  ["codex/skills/stamity-replace-rule/SKILL.md", "\nFork replace rule.\n"],
  ["codex/skills/stamity-patch-rule/SKILL.md", "\nOriginal patch-rule.\n\nPatch witness rule.\n"],
  ["codex/skills/st-source-skill/SKILL.md", "\nSource edit skill.\n"],
  ["codex/skills/add-skill/SKILL.md", "\nFork add skill.\n"],
  ["codex/skills/add-skill/references/own.txt", "Addition companion.\n"],
  ["codex/skills/st-replace-skill/SKILL.md", "\nFork replace skill.\n"],
  ["codex/skills/st-replace-skill/references/own.txt", "Replacement companion.\n"],
  ["codex/skills/st-patch-skill/SKILL.md", "\nOriginal patch-skill.\n\nPatch witness skill.\n"],
  ["codex/skills/st-patch-skill/references/base.txt", "Retained patch companion.\n"],
] as const;

/**
 * The fork-only ids, per client, exactly as {@link EXPECTED_PLUGIN_FILES} spells their homes —
 * the entries that must appear ONCE each and nowhere else, so a generator that also left the
 * addition under a prefixed twin (`st-add-skill/`) or under the replaced skill's directory is
 * caught by the count rather than by the body.
 */
export const FORK_ONLY_IDS = [
  "claude/agents/stamity-add-agent.md",
  "claude/commands/st-add-command.md",
  "claude/skills/add-skill/SKILL.md",
  "cursor/agents/stamity-add-agent.md",
  "cursor/rules/stamity-add-rule.mdc",
  "cursor/skills/st-add-command/SKILL.md",
  "cursor/skills/add-skill/SKILL.md",
  "copilot/com.github.copilot/agents/stamity-add-agent.agent.md",
  "copilot/com.github.copilot/commands/st-add-command.md",
  "copilot/skills/add-skill/SKILL.md",
  "codex/skills/stamity-add-rule/SKILL.md",
  "codex/skills/add-skill/SKILL.md",
] as const;
