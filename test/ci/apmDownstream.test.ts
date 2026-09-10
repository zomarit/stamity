import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parseFrontmatter } from "../../src/content/frontmatter.ts";
import { downstreamCheckout, EXPECTED_PRIMITIVES, write } from "./downstreamFixture.ts";

const work = mkdtempSync(join(tmpdir(), "stamity-apm-downstream-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

function checkout(): string {
  const root = mkdtempSync(join(work, "checkout-"));
  downstreamCheckout(root);
  return root;
}

function generate(root: string, script = "generate-apm-package.mjs", args: string[] = []) {
  return spawnSync(process.execPath, [join(root, "scripts", script), ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function metadata(root: string, values: Record<string, unknown>): void {
  const path = join(root, "package.json");
  const pkg = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  writeFileSync(path, JSON.stringify({ ...pkg, ...values }));
}

describe("downstream APM content", () => {
  it("delivers source edits and every fork operation with independent expected identities and bodies", () => {
    const root = checkout();
    const result = generate(root);
    expect(result.status, result.stderr).toBe(0);
    for (const [path, body] of EXPECTED_PRIMITIVES) {
      const parsed = parseFrontmatter(readFileSync(join(root, ".apm", path), "utf8"), path);
      expect(parsed.body, path).toBe(body);
      if (path.includes("patch-")) expect(parsed.frontmatter["description"], path).toMatch(/^Patched /);
      if (path.endsWith("/SKILL.md")) expect(parsed.frontmatter["name"], path).toBe(path.split("/")[1]);
    }
    expect(existsSync(join(root, ".apm/skills/st-add-skill"))).toBe(false);
    expect(existsSync(join(root, ".apm/skills/replace-skill"))).toBe(false);
    expect(existsSync(join(root, ".apm/skills/st-replace-skill/references/upstream.txt"))).toBe(false);
    expect(readFileSync(join(root, ".apm/skills/st-replace-skill/references/own.txt"), "utf8"))
      .toBe("Replacement companion.\n");
    expect(readFileSync(join(root, ".apm/skills/st-patch-skill/references/base.txt"), "utf8"))
      .toBe("Retained patch companion.\n");
    expect(readFileSync(join(root, ".apm/skills/add-skill/references/own.txt"), "utf8"))
      .toBe("Addition companion.\n");
    expect(readFileSync(join(root, ".apm/skills/add-skill/assets/data.bin")))
      .toEqual(Buffer.from([0, 255, 128, 65, 10]));
    expect(generate(root, undefined, ["--check"]).status).toBe(0);
    write(join(root, ".apm/skills/add-skill/assets/data.bin"), Buffer.from([0, 255, 129, 65, 10]));
    const drift = generate(root, undefined, ["--check"]);
    expect(drift.status).toBe(1);
    expect(drift.stderr).toContain("assets/data.bin");
  });

  it("does not publish skill patch control files as companion files", () => {
    const root = checkout();
    write(join(root, "content/skills/st-source-skill/SKILL.customize.md"), "Author-only patch control.\n");
    write(join(root, "content/skills/st-source-skill/SKILL.customize.yaml"), "description: Author-only\n");
    const result = generate(root);
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(join(root, ".apm/skills/st-source-skill/SKILL.customize.md"))).toBe(false);
    expect(existsSync(join(root, ".apm/skills/st-source-skill/SKILL.customize.yaml"))).toBe(false);
  });

  it("refuses duplicate identity before writing even when the bodies are identical", () => {
    const root = checkout();
    const original = readFileSync(join(root, "content/rules/stamity-source-rule.md"));
    write(join(root, "content/rules/source-rule.md"), original);
    const result = generate(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("duplicate-id");
    expect(existsSync(join(root, ".apm"))).toBe(false);
  });

  it("refuses projected paths that collide on case-insensitive consumer filesystems", () => {
    const root = checkout();
    write(join(root, "fork/rules/SOURCE-RULE.md"), "---\nid: SOURCE-RULE\ndescription: Fixture\n---\nDifferent identity.\n");
    const result = generate(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("project onto");
    expect(existsSync(join(root, ".apm"))).toBe(false);
  });

  it("refuses a fork filename that disagrees with its declared identity", () => {
    const root = checkout();
    write(join(root, "fork/agents/wrong-name.md"), "---\nid: different\ndescription: Fixture\n---\nBody.\n");
    const result = generate(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("filename-mismatch");
    expect(existsSync(join(root, ".apm"))).toBe(false);
  });

  it("refuses prefixed fork identities instead of renaming them silently", () => {
    const root = checkout();
    write(join(root, "fork/skills/st-illegal/SKILL.md"), "---\nid: illegal\n---\nBody.\n");
    const result = generate(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("illegal");
    expect(existsSync(join(root, ".apm"))).toBe(false);
  });

  it("refuses a full fork replacement and patch of the same artifact", () => {
    const root = checkout();
    write(join(root, "fork/rules/replace-rule.customize.md"), "Conflicting patch.\n");
    const result = generate(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("replace-rule");
    expect(existsSync(join(root, ".apm"))).toBe(false);
  });

  // Windows does not support a literal backslash filename or unprivileged file symlinks.
  it.skipIf(process.platform === "win32")("rejects unsafe companion paths before writing", () => {
    const root = checkout();
    write(join(root, "fork/skills/add-skill/references/bad\\name.txt"), "Unsafe path.\n");
    const result = generate(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsafe content path");
    expect(existsSync(join(root, ".apm"))).toBe(false);
  });

  it.skipIf(process.platform === "win32")("does not import companions through file or directory symlinks", () => {
    const root = checkout();
    write(join(root, "outside/private.txt"), "Outside content.\n");
    symlinkSync(join(root, "outside/private.txt"), join(root, "fork/skills/add-skill/leak.txt"));
    symlinkSync(join(root, "outside"), join(root, "fork/skills/add-skill/leak-dir"));
    const result = generate(root);
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(join(root, ".apm/skills/add-skill/leak.txt"))).toBe(false);
    expect(existsSync(join(root, ".apm/skills/add-skill/leak-dir"))).toBe(false);
  });
});

describe.each(["generate-apm-package.mjs", "generate-plugin-manifests.mjs"])("%s downstream identity", (script) => {
  it("shares an explicit owner identity and retains the package metadata sources", () => {
    const root = checkout();
    metadata(root, {
      name: "@acme/stamity-internal", version: "2.3.4", stamity: { publisher: "Acme" },
      repository: { type: "git", url: "git+https://github.com/acme/stamity-internal.git" },
      homepage: "https://github.com/acme/stamity-internal#readme",
    });
    const result = generate(root, script);
    expect(result.status, result.stderr).toBe(0);
    if (script === "generate-apm-package.mjs") {
      const manifest = readFileSync(join(root, "apm.yml"), "utf8");
      expect(manifest).toContain("author: Acme\n");
      expect(manifest).toContain("name: stamity-internal\n");
      expect(manifest).toContain("version: 2.3.4\n");
    } else {
      const manifest = JSON.parse(readFileSync(join(root, ".claude-plugin/plugin.json"), "utf8")) as Record<string, unknown>;
      expect(manifest["author"]).toEqual({ name: "Acme" });
      expect(manifest["repository"]).toBe("https://github.com/acme/stamity-internal");
      expect(manifest["homepage"]).toBe("https://github.com/acme/stamity-internal");
      expect(manifest["name"]).toBe("stamity-internal");
      expect(manifest["version"]).toBe("2.3.4");
      // Plugin manifests address their own content/ source, including a bundled agent
      // replaced by the fork on the separate APM/CLI routes.
      expect(manifest["agents"]).toContain("./content/agents/stamity-replace-agent.md");
    }
  });

  it.each([
    ["wrong owner", { publisher: "someone-else" }],
    ["empty owner", { publisher: "" }],
    ["unsafe owner", { publisher: "acme/other" }],
    ["invalid owner punctuation", { publisher: "acme_name" }],
    ["invalid repeated hyphen", { publisher: "acme--group" }],
    ["invalid trailing hyphen", { publisher: "acme-" }],
    ["overlong owner", { publisher: "a".repeat(40) }],
    ["non-string publisher", { publisher: 123 }],
    ["unknown config key", { publisher: "acme", extra: true }],
    ["missing publisher", {}],
    ["array config", []],
    ["null config", null],
    ["string config", "acme"],
  ])("rejects %s before writing", (_label, stamity) => {
    const root = checkout();
    metadata(root, { stamity, repository: { url: "https://github.com/acme/stamity" } });
    const result = generate(root, script);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/stamity|publisher/);
    expect(existsSync(join(root, "apm.yml"))).toBe(false);
    expect(existsSync(join(root, "plugin.json"))).toBe(false);
  });

  it("retains the canonical default and asks a moved repository for explicit identity", () => {
    const root = checkout();
    const canonical = generate(root, script);
    expect(canonical.status, canonical.stderr).toBe(0);
    metadata(root, { repository: { url: "https://github.com/acme/stamity" } });
    const moved = generate(root, script);
    expect(moved.status).toBe(1);
    expect(moved.stderr).toContain("stamity.publisher");
  });

  it.each([
    "https://example.com/acme/stamity", "https://github.com/acme/stamity?token=redacted",
    "https://github.com/acme/stamity/extra", "https://github.com/acme/..",
  ])("refuses an unsupported repository URL %s", (url) => {
    const root = checkout();
    metadata(root, { stamity: { publisher: "acme" }, repository: { url } });
    const result = generate(root, script);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("repository.url");
    expect(existsSync(join(root, "apm.yml"))).toBe(false);
    expect(existsSync(join(root, "plugin.json"))).toBe(false);
  });
});
