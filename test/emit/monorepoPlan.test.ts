import { describe, expect, it } from "vitest";
import { emitsPerPackage, planPerPackageOutputs } from "../../src/emit/monorepoPlan.ts";
import { TOOLS, type Tool } from "../../src/types/core.ts";
import type { PackageEntry } from "../../src/types/detect.ts";
import { EngineError } from "../../src/types/errors.ts";

/** The tool whose load model reads per-directory files; see the module header. */
const NESTING_TOOL: Tool = "codex";
const TARGET = "AGENTS.md";

const pkg = (name: string, path: string): PackageEntry => ({ name, path });

const paths = (packages: readonly PackageEntry[], tool: Tool = NESTING_TOOL): string[] =>
  planPerPackageOutputs(packages, tool, TARGET).map((plan) => plan.outputPath);

describe("per-package tool scoping", () => {
  it("classifies every known tool, and only the nesting one opts in", () => {
    // Adding an adapter forces a decision here rather than defaulting it.
    expect(TOOLS.filter(emitsPerPackage)).toEqual([NESTING_TOOL]);
    expect(TOOLS.filter((tool) => !emitsPerPackage(tool)).toSorted()).toEqual(
      ["claude", "copilot", "cursor"].toSorted(),
    );
  });

  it("plans nothing for a tool that does not read per-directory files", () => {
    const packages = [pkg("web", "packages/web"), pkg("api", "apps/api")];

    for (const tool of TOOLS.filter((candidate) => !emitsPerPackage(candidate))) {
      expect(planPerPackageOutputs(packages, tool, TARGET), tool).toEqual([]);
    }
  });
});

describe("per-package planning", () => {
  it("plans one target per workspace package", () => {
    expect(planPerPackageOutputs([pkg("web", "packages/web")], NESTING_TOOL, TARGET)).toEqual([
      { packagePath: "packages/web", outputPath: "packages/web/AGENTS.md" },
    ]);
  });

  it("plans nothing for a repo with no workspace packages", () => {
    expect(planPerPackageOutputs([], NESTING_TOOL, TARGET)).toEqual([]);
  });

  it("skips the repository root package in every spelling", () => {
    // The root emission already covers the root; planning it again would
    // collide with that write.
    expect(paths([pkg("root", "."), pkg("root", ""), pkg("root", "./"), pkg("root", "./.")])).toEqual([]);
    expect(paths([pkg("root", "."), pkg("web", "packages/web")])).toEqual(["packages/web/AGENTS.md"]);
  });

  it("normalises windows separators and nested paths to posix", () => {
    expect(paths([pkg("core", "packages\\web\\core")])).toEqual(["packages/web/core/AGENTS.md"]);
    expect(paths([pkg("api", ".\\apps\\api\\")])).toEqual(["apps/api/AGENTS.md"]);
  });

  it("collapses redundant separators and leading './'", () => {
    expect(paths([pkg("web", "packages//web/")])).toEqual(["packages/web/AGENTS.md"]);
    expect(paths([pkg("web", "./packages/./web")])).toEqual(["packages/web/AGENTS.md"]);
  });

  it("deduplicates packages that spell the same directory differently", () => {
    expect(
      paths([
        pkg("web", "packages/web"),
        pkg("web-alias", "./packages/web/"),
        pkg("web-windows", "packages\\web"),
      ]),
    ).toEqual(["packages/web/AGENTS.md"]);
  });

  it("skips a package path that is not repo-relative and keeps the rest of the plan", () => {
    expect(
      paths([
        pkg("absolute", "/etc/packages"),
        pkg("drive", "C:\\repo\\packages\\win"),
        pkg("unc", "\\\\server\\share\\pkg"),
        pkg("escape", "../outside"),
        pkg("climb", "packages/../../etc"),
        pkg("web", "packages/web"),
      ]),
    ).toEqual(["packages/web/AGENTS.md"]);
  });

  it("orders the plan by package path regardless of detection order", () => {
    const shuffled = [pkg("web", "packages/web"), pkg("api", "apps/api"), pkg("cli", "packages/cli")];

    expect(paths(shuffled)).toEqual([
      "apps/api/AGENTS.md",
      "packages/cli/AGENTS.md",
      "packages/web/AGENTS.md",
    ]);
    expect(paths([...shuffled].toReversed())).toEqual(paths(shuffled));
  });

  it("supports a nested emission target inside the package", () => {
    expect(
      planPerPackageOutputs([pkg("web", "packages/web")], NESTING_TOOL, ".codex/agents/reviewer.toml"),
    ).toEqual([
      { packagePath: "packages/web", outputPath: "packages/web/.codex/agents/reviewer.toml" },
    ]);
  });

  it("rejects an emission target that is not a repo-relative file path", () => {
    // Engine-owned input: a bad value is a defect to surface, not a silent
    // empty plan (unlike a package path, which comes from repository data).
    for (const target of ["", ".", "./", "/etc/AGENTS.md", "../AGENTS.md", "C:\\AGENTS.md"]) {
      const plan = (): unknown => planPerPackageOutputs([pkg("web", "packages/web")], NESTING_TOOL, target);
      expect(plan, target).toThrow(EngineError);
      expect(plan, target).toThrow(/repo-relative file path/);
    }
  });

  it("checks the tool before the target, so a non-nesting tool never throws", () => {
    expect(planPerPackageOutputs([pkg("web", "packages/web")], "cursor", "/etc/AGENTS.md")).toEqual([]);
  });
});
