import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { CLI_REFERENCE_DOC_PATH } from "../../../src/cli/docs/cliReference.ts";
import { CONFIG_REFERENCE_DOC_PATH } from "../../../src/cli/docs/configReference.ts";
import {
  LLMS_INDEX_DOC_PATH,
  LLMS_INDEX_SECTIONS,
  renderLlmsIndex,
  renderLlmsIndexFrom,
  type IndexSection,
} from "../../../src/cli/docs/llmsIndex.ts";
import { REFERENCE_PAGES, REGENERATE_COMMAND } from "../../../src/cli/docs/referencePages.ts";
import {
  CAPABILITY_MATRIX_DOC_PATH,
  REGENERATE_COMMAND as CAPABILITY_MATRIX_REGENERATE_COMMAND,
} from "../../../src/emit/capabilityMatrix.ts";
import { EngineError } from "../../../src/types/errors.ts";

/**
 * The drift gate on `llms.txt`, plus the two existence promises it carries.
 *
 * The index is the only page whose claims are about OTHER files, so being
 * byte-current is not enough: every path it lists is resolved on disk here.
 * The same case closes the wave-0 promise `test/docsPages.test.ts` deferred —
 * README links the four generated targets by path and defers their existence
 * to this unit, so those paths are resolved here too.
 */

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const MODULE_SOURCE_PATH = join(REPO_ROOT, "src/cli/docs/llmsIndex.ts");
const SCRIPT_PATH = join(REPO_ROOT, "scripts/generate-docs.mjs");

const STALE_MESSAGE =
  `${LLMS_INDEX_DOC_PATH} is stale — the render no longer matches the committed file. ` +
  `Regenerate it with \`${REGENERATE_COMMAND}\` and commit the diff.`;

const committedIndex = (): string => readFileSync(join(REPO_ROOT, LLMS_INDEX_DOC_PATH), "utf-8");

/** `[text](target)` — the only link form these pages use. */
const MARKDOWN_LINK = /\[[^\]]*\]\(([^)]+)\)/g;

const linkTargets = (text: string): string[] =>
  [...text.matchAll(MARKDOWN_LINK)].map((match) => match[1] ?? "");

const everyEntry = (): IndexSection["entries"] =>
  LLMS_INDEX_SECTIONS.flatMap((section) => section.entries);

/** The two shapes a runnable regeneration command takes in this repo. */
const NODE_SCRIPT = /^node (\S+\.mjs)$/;
const NPM_SCRIPT = /^npm run (\S+)$/;

/** The command an entry declares for `path`, or null when nothing generates it. */
const commandOf = (path: string): string | null =>
  everyEntry().find((entry) => entry.path === path)?.regenerateCommand ?? null;

/** The rendered bullet for `path` — the line a reader actually follows. */
const renderedLine = (path: string): string =>
  renderLlmsIndex()
    .split("\n")
    .find((line) => line.includes(`](${path})`)) ?? "";

/** A one-entry section, so a defect case differs from a valid one in one field. */
function sectionOf(patch: Partial<IndexSection["entries"][number]> = {}): IndexSection[] {
  return [
    {
      heading: "Probe",
      entries: [
        {
          path: "README.md",
          title: "Readme",
          description: "a probe entry.",
          regenerateCommand: null,
          ...patch,
        },
      ],
    },
  ];
}

describe("renderLlmsIndex — drift gate", () => {
  it("byte-matches the committed index", () => {
    expect(STALE_MESSAGE).toContain(REGENERATE_COMMAND);
    expect(renderLlmsIndex(), STALE_MESSAGE).toBe(committedIndex());
  });

  it("ends with exactly one trailing newline and carries no CR", () => {
    const index = renderLlmsIndex();
    expect(index.endsWith("\n")).toBe(true);
    expect(index.endsWith("\n\n")).toBe(false);
    expect(index).not.toContain("\r");
  });

  it("renders byte-identically twice", () => {
    expect(renderLlmsIndex()).toBe(renderLlmsIndex());
  });

  it("reads no clock", () => {
    const source = readFileSync(MODULE_SOURCE_PATH, "utf-8");
    expect(source).not.toMatch(/\bnew Date\b/);
    expect(source).not.toMatch(/\bDate\.(now|UTC|parse)\(/);
    expect(source).not.toMatch(/toISOString\(/);
  });

  it("opens in the llms.txt shape: H1, one blockquote summary, then sections", () => {
    const lines = renderLlmsIndex().split("\n");
    expect(lines[0]).toBe("# stamity");
    expect(lines[1]).toBe("");
    expect(lines[2]?.startsWith("> ")).toBe(true);
    expect(renderLlmsIndex().split("\n").filter((line) => line.startsWith("## "))).toEqual(
      LLMS_INDEX_SECTIONS.map((section) => `## ${section.heading}`),
    );
  });
});

describe("every listed path resolves", () => {
  it("resolves every entry in the index on disk", () => {
    for (const entry of everyEntry()) {
      expect(existsSync(join(REPO_ROOT, entry.path)), `llms.txt lists missing ${entry.path}`).toBe(
        true,
      );
    }
  });

  it("resolves every link rendered into the file, not only the declared entries", () => {
    const targets = linkTargets(renderLlmsIndex());
    expect(targets.length).toBe(everyEntry().length);
    for (const target of targets) {
      expect(existsSync(join(REPO_ROOT, target)), `llms.txt links missing ${target}`).toBe(true);
    }
  });

  /**
   * The wave-0 promise `test/docsPages.test.ts` deferred: README links the
   * four generated targets by path and leaves their existence to this unit.
   */
  it("resolves every repo-relative link in README.md", () => {
    const readme = readFileSync(join(REPO_ROOT, "README.md"), "utf-8");
    const targets = linkTargets(readme).filter((target) => !target.startsWith("#"));
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(target, "README link is not repo-relative").not.toMatch(/^([a-z][a-z0-9+.-]*:|\/)/i);
      expect(existsSync(join(REPO_ROOT, target)), `README links missing ${target}`).toBe(true);
    }
  });

  it("lists every generated page, so nothing this repo renders goes unindexed", () => {
    const listed = new Set(everyEntry().map((entry) => entry.path));
    const generated = [
      CLI_REFERENCE_DOC_PATH,
      CONFIG_REFERENCE_DOC_PATH,
      CAPABILITY_MATRIX_DOC_PATH,
      ...REFERENCE_PAGES.map((page) => page.path),
    ];
    for (const path of generated) {
      expect(listed.has(path), `llms.txt does not index ${path}`).toBe(true);
    }
  });

  it("gives every entry a title and a one-line description", () => {
    for (const entry of everyEntry()) {
      expect(entry.title.trim().length, `${entry.path} has no title`).toBeGreaterThan(0);
      expect(entry.description.trim().length, `${entry.path} has no description`).toBeGreaterThan(
        0,
      );
      expect(entry.description, `${entry.path} description spans lines`).not.toContain("\n");
    }
  });

  it("links nothing outside the tree", () => {
    const index = renderLlmsIndex();
    expect(index).not.toContain("http");
    expect(index).not.toMatch(/[a-z][a-z0-9+.-]*:\/\//i);
    for (const target of linkTargets(index)) {
      expect(target).not.toMatch(/^([a-z][a-z0-9+.-]*:|\/)/i);
    }
  });
});

/**
 * The index used to carry ONE regeneration command in its preamble and
 * promise it for every page under the generated headings — while two
 * generators write those pages, each exporting a `REGENERATE_COMMAND`, and the
 * one interpolated was the docs script. A reader who ran it for the capability
 * matrix saw no diff, which reads as "already current" and is the failure mode
 * the whole index exists to prevent.
 */
describe("regeneration commands are per page", () => {
  it("names a command this repo can actually run for every generated entry", () => {
    const manifest: { scripts?: Record<string, string> } = JSON.parse(
      readFileSync(join(REPO_ROOT, "package.json"), "utf-8"),
    ) as { scripts?: Record<string, string> };
    const named = everyEntry().filter((entry) => entry.regenerateCommand !== null);
    expect(named.length).toBeGreaterThan(0);

    for (const entry of named) {
      const command = entry.regenerateCommand ?? "";
      const script = NODE_SCRIPT.exec(command)?.[1];
      const npmScript = NPM_SCRIPT.exec(command)?.[1];
      if (script !== undefined) {
        expect(existsSync(join(REPO_ROOT, script)), `${entry.path} names missing ${script}`).toBe(
          true,
        );
      } else if (npmScript !== undefined) {
        expect(Object.keys(manifest.scripts ?? {}), entry.path).toContain(npmScript);
      } else {
        expect.unreachable(`${entry.path} names an unrunnable command: ${command}`);
      }
    }
  });

  it("gives the capability matrix its own generator, not the docs script", () => {
    expect(commandOf(CAPABILITY_MATRIX_DOC_PATH)).toBe(CAPABILITY_MATRIX_REGENERATE_COMMAND);
    expect(commandOf(CAPABILITY_MATRIX_DOC_PATH)).not.toBe(REGENERATE_COMMAND);
    expect(renderedLine(CAPABILITY_MATRIX_DOC_PATH)).toContain(
      `\`${CAPABILITY_MATRIX_REGENERATE_COMMAND}\``,
    );
  });

  it("gives every page the docs script writes the docs script", () => {
    const written = [
      CLI_REFERENCE_DOC_PATH,
      CONFIG_REFERENCE_DOC_PATH,
      ...REFERENCE_PAGES.map((page) => page.path),
    ];
    for (const path of written) {
      expect(commandOf(path), path).toBe(REGENERATE_COMMAND);
      expect(renderedLine(path), path).toContain(`\`${REGENERATE_COMMAND}\``);
    }
  });

  it("names no command for a hand-written page or for corpus source", () => {
    for (const path of ["README.md", "CONTRIBUTING.md", "SECURITY.md"]) {
      expect(commandOf(path), path).toBeNull();
    }
    const corpus = everyEntry().filter((entry) => entry.path.startsWith("content/"));
    expect(corpus.length).toBeGreaterThan(0);
    for (const entry of corpus) {
      expect(entry.regenerateCommand, entry.path).toBeNull();
      expect(renderedLine(entry.path), entry.path).not.toContain("Regenerate with");
    }
  });

  it("promises no one command for everything under a generated heading", () => {
    const index = renderLlmsIndex();
    expect(index).not.toMatch(/regenerate them with/i);

    // Each command appears exactly as often as entries declare it — never once
    // more, which is what a surviving preamble promise would look like.
    const declared = everyEntry().map((entry) => entry.regenerateCommand);
    for (const named of new Set(declared.filter((entry) => entry !== null))) {
      const count = declared.filter((entry) => entry === named).length;
      expect(index.split(`\`${named}\``).length - 1, named).toBe(count);
    }
  });
});

describe("refuse-to-render", () => {
  it("refuses an index with no sections", () => {
    expect(() => renderLlmsIndexFrom([])).toThrowError(/would list nothing/);
  });

  it("refuses a section with no entries, naming the heading", () => {
    const empty: IndexSection = { heading: "Empty", entries: [] };
    const call = (): string => renderLlmsIndexFrom([empty]);
    expect(call).toThrowError(EngineError);
    expect(call).toThrowError(/"Empty"/);
  });

  it.each([
    ["a scheme-qualified target", "https://example.invalid/docs"],
    ["a protocol-relative target", "//example.invalid/docs"],
    ["a root-absolute target", "/etc/passwd"],
  ])("refuses %s as not repo-relative", (_label, path) => {
    const call = (): string => renderLlmsIndexFrom(sectionOf({ path }));
    expect(call).toThrowError(EngineError);
    expect(call).toThrowError(/not repo-relative/);
  });

  it("refuses an entry with no description, naming the path", () => {
    const call = (): string => renderLlmsIndexFrom(sectionOf({ description: "  " }));
    expect(call).toThrowError(/"README\.md" has no description/);
  });

  it("refuses an entry with no title, naming the path", () => {
    expect(() => renderLlmsIndexFrom(sectionOf({ title: "" }))).toThrowError(
      /"README\.md" has no title/,
    );
  });

  it("refuses an entry with no path", () => {
    expect(() => renderLlmsIndexFrom(sectionOf({ path: " " }))).toThrowError(/has no path/);
  });

  it("refuses a blank regeneration command, naming the path", () => {
    const call = (): string => renderLlmsIndexFrom(sectionOf({ regenerateCommand: "  " }));
    expect(call).toThrowError(EngineError);
    expect(call).toThrowError(/"README\.md" declares a blank regeneration command/);
  });

  it("refuses the same path listed twice", () => {
    const again: IndexSection[] = sectionOf().map((section) => ({
      heading: "Again",
      entries: section.entries,
    }));
    const call = (): string => renderLlmsIndexFrom([...sectionOf(), ...again]);
    expect(call).toThrowError(/lists "README\.md" twice/);
  });

  it("classifies every refusal as VALIDATION_ERROR", () => {
    try {
      renderLlmsIndexFrom([]);
      expect.unreachable("an empty index must refuse");
    } catch (err) {
      expect((err as EngineError).code).toBe("VALIDATION_ERROR");
    }
  });
});

describe("scripts/generate-docs.mjs", () => {
  const workspace = mkdtempSync(join(tmpdir(), "stamity-p6u03-llms-"));
  afterAll(() => rmSync(workspace, { recursive: true, force: true }));

  it("writes the index, and a second run produces zero diff", () => {
    const run = (): string => {
      execFileSync(process.execPath, [SCRIPT_PATH, "--page", "llms", "--out-dir", workspace], {
        encoding: "utf-8",
      });
      return readFileSync(join(workspace, LLMS_INDEX_DOC_PATH), "utf-8");
    };
    const first = run();
    expect(first).toBe(renderLlmsIndex());
    expect(run()).toBe(first);
  });

  it("writes every page under --page all, and a second run produces zero diff", () => {
    const all = join(workspace, "all");
    const paths = [
      CLI_REFERENCE_DOC_PATH,
      CONFIG_REFERENCE_DOC_PATH,
      ...REFERENCE_PAGES.map((page) => page.path),
      LLMS_INDEX_DOC_PATH,
    ];
    const run = (): string[] => {
      execFileSync(process.execPath, [SCRIPT_PATH, "--out-dir", all], { encoding: "utf-8" });
      return paths.map((path) => readFileSync(join(all, path), "utf-8"));
    };
    const first = run();
    expect(first).toEqual(run());
    // The committed tree is what the same run would have produced in place.
    expect(first).toEqual(paths.map((path) => readFileSync(join(REPO_ROOT, path), "utf-8")));
  });
});
