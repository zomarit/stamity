import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * v18-egress-pins (REQ-PROVE-045): the release network page's action pins match the workflows.
 *
 * `.github/release-egress.md` links the hardening action at a commit and describes what that build
 * of it does. The workflows moved to a later pin and the page kept the old one, so the page
 * described a hardener no job ran and nothing failed. Here every action the page names at a
 * 40-hex commit (a GitHub link at `tree`, `blob` or `commit`, or an `owner/repo@<sha>` mention) is
 * held against every `uses:` of that action in `.github/workflows/`: a differing pin fails naming
 * the action and both shas, and an action the page pins that no workflow uses fails naming it.
 *
 * The host checks on the same page stay in `test/ci/workflow.test.ts`; this file reads pins only.
 * The parsers are pure over their text, so the synthetic cases feed them strings, no double.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PAGE = ".github/release-egress.md";
const WORKFLOW_DIR = join(REPO_ROOT, ".github", "workflows");

/** One action the page pins: `owner/repo`, lower-cased, at the sha the page names, on a 1-based line. */
interface PagePin {
  readonly action: string;
  readonly sha: string;
  readonly line: number;
}

/** One `uses:` of a remote action in a workflow: `owner/repo`, lower-cased, the ref it pins, and `file:line`. */
interface WorkflowPin {
  readonly action: string;
  readonly ref: string;
  readonly at: string;
}

const SHA = "[0-9a-f]{40}";
const SEGMENT = "[A-Za-z0-9_.-]+";
/** A GitHub link at a commit: `https://github.com/<owner>/<repo>/(tree|blob|commit)/<sha>`. */
const LINK_PIN = new RegExp(`https://github\\.com/(${SEGMENT})/(${SEGMENT})/(?:tree|blob|commit)/(${SHA})(?![0-9a-f])`, "g");
/** An `owner/repo[/path]@<sha>` mention, as a workflow spells it. */
const AT_PIN = new RegExp(`(?<![\\w./-])(${SEGMENT})/(${SEGMENT})(?:/${SEGMENT})*@(${SHA})(?![0-9a-f])`, "g");
/** A `uses:` key on a step or a job, with or without the list dash; a commented line never starts this way. */
const USES = /^\s*(?:-\s+)?uses:\s*["']?([^\s"'#]+)/;

function actionOf(owner: string, repo: string): string {
  return `${owner}/${repo}`.toLowerCase();
}

/** Every action the page pins at a commit, in page order. */
function pagePins(text: string): PagePin[] {
  const pins: PagePin[] = [];
  text.split("\n").forEach((content, index) => {
    for (const pattern of [LINK_PIN, AT_PIN]) {
      for (const match of content.matchAll(pattern)) {
        pins.push({ action: actionOf(match[1] ?? "", match[2] ?? ""), sha: match[3] ?? "", line: index + 1 });
      }
    }
  });
  return pins;
}

/** Every remote action a workflow uses; local (`./`) and container (`docker://`) uses name no pin. */
function workflowPins(file: string, text: string): WorkflowPin[] {
  const pins: WorkflowPin[] = [];
  text.split("\n").forEach((content, index) => {
    const reference = USES.exec(content)?.[1];
    if (reference === undefined || reference.startsWith("./") || reference.startsWith("docker://")) return;
    const at = reference.lastIndexOf("@");
    const [owner = "", repo = ""] = (at === -1 ? reference : reference.slice(0, at)).split("/");
    pins.push({ action: actionOf(owner, repo), ref: at === -1 ? "" : reference.slice(at + 1), at: `${file}:${index + 1}` });
  });
  return pins;
}

/** One line per drift: a page pin no workflow uses, or a workflow pin that differs from the page's. */
function pinDrift(page: readonly PagePin[], uses: readonly WorkflowPin[]): string[] {
  const drift: string[] = [];
  for (const pin of page) {
    const using = uses.filter((use) => use.action === pin.action);
    if (using.length === 0) {
      drift.push(`${pin.action}: ${PAGE}:${pin.line} pins ${pin.sha}, and no workflow uses ${pin.action}`);
      continue;
    }
    for (const use of using) {
      if (use.ref === pin.sha) continue;
      drift.push(`${pin.action}: ${PAGE}:${pin.line} pins ${pin.sha}, ${use.at} pins ${use.ref || "no ref"}`);
    }
  }
  return drift;
}

const HARDENER_OLD = "351661ca32ac09a36dc5ee2d536e3128f2a3c8ed";
const HARDENER_NEW = "ccd8616d44fd3846e67624a50d5aad6d37bf2d25";
const CHECKOUT_PAGE = "1".repeat(40);
const CHECKOUT_WORKFLOW = "2".repeat(40);

describe("pinDrift over synthetic text", () => {
  const page = [
    "# Release network policy",
    `The [pinned hardener](https://github.com/step-security/harden-runner/tree/${HARDENER_NEW})`,
    `and checkout, pinned as \`actions/checkout@${CHECKOUT_PAGE}\`.`,
  ].join("\n");
  const release = [
    "jobs:",
    "  gates:",
    "    steps:",
    `      - uses: step-security/harden-runner@${HARDENER_NEW} # v2.22.1`,
    `      - uses: actions/checkout@${CHECKOUT_PAGE}`,
    "      - uses: ./.github/actions/local",
    "      - uses: docker://alpine:3",
    `      # uses: step-security/harden-runner@${HARDENER_OLD}`,
  ].join("\n");

  it("reads a linked pin and an @-mention, and no local, container or commented use", () => {
    expect(pagePins(page)).toEqual([
      { action: "step-security/harden-runner", sha: HARDENER_NEW, line: 2 },
      { action: "actions/checkout", sha: CHECKOUT_PAGE, line: 3 },
    ]);
    expect(workflowPins("release.yml", release)).toEqual([
      { action: "step-security/harden-runner", ref: HARDENER_NEW, at: "release.yml:4" },
      { action: "actions/checkout", ref: CHECKOUT_PAGE, at: "release.yml:5" },
    ]);
  });

  it("finds no drift when every workflow pins the page's sha", () => {
    expect(pinDrift(pagePins(page), workflowPins("release.yml", release))).toEqual([]);
  });

  it("names the action and both shas when one workflow's pin differs, across two workflows", () => {
    const rehearsal = [
      "jobs:",
      "  sign:",
      `    steps:\n      - uses: step-security/harden-runner@${HARDENER_NEW}`,
      `      - uses: actions/checkout@${CHECKOUT_WORKFLOW} # v7.0.1`,
    ].join("\n");
    const uses = [...workflowPins("release.yml", release), ...workflowPins("rehearsal.yml", rehearsal)];
    expect(pinDrift(pagePins(page), uses)).toEqual([
      `actions/checkout: ${PAGE}:3 pins ${CHECKOUT_PAGE}, rehearsal.yml:5 pins ${CHECKOUT_WORKFLOW}`,
    ]);
  });

  it("names the stale hardener link the page carried before the re-point", () => {
    const stale = `The [pinned hardener](https://github.com/step-security/harden-runner/tree/${HARDENER_OLD})`;
    expect(pinDrift(pagePins(stale), workflowPins("release.yml", release))).toEqual([
      `step-security/harden-runner: ${PAGE}:1 pins ${HARDENER_OLD}, release.yml:4 pins ${HARDENER_NEW}`,
    ]);
  });

  it("names an action the page pins that no workflow uses", () => {
    const extra = `${page}\nSee [the scanner](https://github.com/example/scanner/commit/${"3".repeat(40)}).`;
    expect(pinDrift(pagePins(extra), workflowPins("release.yml", release))).toEqual([
      `example/scanner: ${PAGE}:4 pins ${"3".repeat(40)}, and no workflow uses example/scanner`,
    ]);
  });

  it("reads a tag-pinned use as a differing ref, never as a match", () => {
    const tagged = "      - uses: actions/checkout@v7";
    expect(pinDrift(pagePins(page), workflowPins("ci.yml", tagged))).toEqual([
      `step-security/harden-runner: ${PAGE}:2 pins ${HARDENER_NEW}, and no workflow uses step-security/harden-runner`,
      `actions/checkout: ${PAGE}:3 pins ${CHECKOUT_PAGE}, ci.yml:1 pins v7`,
    ]);
  });
});

describe(`${PAGE} against .github/workflows`, () => {
  const page = pagePins(readFileSync(join(REPO_ROOT, PAGE), "utf8"));
  const uses = readdirSync(WORKFLOW_DIR)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .toSorted()
    .flatMap((name) => workflowPins(`.github/workflows/${name}`, readFileSync(join(WORKFLOW_DIR, name), "utf8")));

  it("pins at least the hardener, so the check is never vacuous", () => {
    expect(page.map((pin) => pin.action)).toContain("step-security/harden-runner");
    expect(uses.filter((use) => use.action === "step-security/harden-runner").length).toBeGreaterThan(1);
  });

  it("pins every linked action at the sha each workflow using it pins", () => {
    expect(pinDrift(page, uses)).toEqual([]);
  });
});
