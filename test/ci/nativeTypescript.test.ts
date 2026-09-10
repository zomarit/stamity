import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
// @ts-expect-error — the import-safe bootstrap is intentionally native ESM.
import * as bootstrap from "../../scripts/native-typescript.mjs";

interface Runtime {
  argv: string[];
  execArgv: string[];
  execPath: string;
  version: string;
  features: { typescript: boolean };
  exit: (code: number) => void;
}
const { prepareNativeTypescriptCli } = bootstrap as {
  prepareNativeTypescriptCli: (url: string, options: {
    runtime: Runtime;
    spawn: (command: string, args: string[], options: unknown) => { status: number | null };
    failureCode?: number;
  }) => boolean;
};
const SCRIPT = new URL("../../scripts/generate-docs.mjs", import.meta.url);
const GENERATORS = ["generate-docs", "generate-capability-matrix", "generate-pack-manifests",
  "generate-apm-package", "generate-plugin-manifests"];

function fixture() {
  // Runtime injection is necessary to exercise unsupported Node states on a
  // supported test host, including child signals without terminating Vitest.
  const runtime: Runtime = {
    argv: [process.execPath, fileURLToPath(SCRIPT), "--page", "cli"],
    execArgv: ["--inspect=0", "--no-warnings"], execPath: process.execPath,
    version: "v22.12.0", features: { typescript: false }, exit: vi.fn(),
  };
  const spawn = vi.fn((): { status: number | null } => ({ status: 0 }));
  return { runtime, spawn };
}

describe("native TypeScript bootstrap", () => {
  it("forwards both Node controls and script arguments through a single reexec", () => {
    const f = fixture();
    expect(prepareNativeTypescriptCli(SCRIPT.href, f)).toBe(false);
    expect(f.spawn).toHaveBeenCalledWith(process.execPath, [
      "--inspect=0", "--no-warnings", "--experimental-strip-types",
      "--disable-warning=ExperimentalWarning", fileURLToPath(SCRIPT), "--page", "cli",
    ], { stdio: "inherit" });
    expect(f.runtime.exit).toHaveBeenCalledWith(0);
  });
  it("refuses unsupported flagged hosts without a second child", () => {
    const f = fixture();
    f.runtime.execArgv.push("--experimental-strip-types");
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(prepareNativeTypescriptCli(SCRIPT.href, { ...f, failureCode: 2 })).toBe(false);
      expect(f.spawn).not.toHaveBeenCalled();
      expect(f.runtime.exit).toHaveBeenCalledWith(2);
      expect(diagnostic).toHaveBeenCalledWith(expect.stringContaining("Node >=22.22.2"));
    } finally { diagnostic.mockRestore(); }
  });
  it("reports a signalled or unlaunchable child as incomplete", () => {
    const f = fixture(); f.spawn.mockReturnValue({ status: null });
    prepareNativeTypescriptCli(SCRIPT.href, { ...f, failureCode: 2 });
    expect(f.runtime.exit).toHaveBeenCalledWith(2);
  });
  it("never reexecutes or exits an importing process", () => {
    const f = fixture(); f.runtime.argv = [process.execPath, "/unrelated/test.mjs"];
    expect(prepareNativeTypescriptCli(SCRIPT.href, f)).toBe(false);
    expect(f.spawn).not.toHaveBeenCalled(); expect(f.runtime.exit).not.toHaveBeenCalled();
  });
  it("runs directly on a supported host without a child", () => {
    const f = fixture(); f.runtime.features.typescript = true;
    expect(prepareNativeTypescriptCli(SCRIPT.href, f)).toBe(true);
    expect(f.spawn).not.toHaveBeenCalled();
  });
});

describe("generator imports and direct invocation", () => {
  it.each([...GENERATORS, "advisory-check"])("importing %s ignores caller arguments and runs no CLI", (name) => {
    const url = new URL(`../../scripts/${name}.mjs`, import.meta.url).href;
    const source = `process.argv.push('/unrelated-caller', '--not-a-generator-flag'); await import(${JSON.stringify(url)}); console.log('import completed');`;
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", source], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("import completed\n");
  });
  it.each(GENERATORS)("direct %s still rejects unsupported arguments", (name) => {
    const path = fileURLToPath(new URL(`../../scripts/${name}.mjs`, import.meta.url));
    const result = spawnSync(process.execPath, [path, "--not-a-generator-flag"], { encoding: "utf8" });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Unknown argument");
  });
});
