import { describe, expect, it } from "vitest";
import { carriesScripts, CODE_EXTENSIONS, type ScriptScanFile } from "../../src/skills/scriptDetect.ts";

/**
 * REQ-FLOW-180: a skill carrying scripts is refused unless its source allows them. Pure: each case builds the file
 * rows a fetch would read (`git ls-tree` mode, path, the file's first bytes) and reads the reasons back.
 */
const plain = (path: string, head = "# A heading\n"): ScriptScanFile => ({ path, mode: "100644", head });

describe("carriesScripts", () => {
  it("finds no reason in a plain SKILL.md beside references/*.md", () => {
    const files = [
      plain("SKILL.md", "---\nname: house-style\ndescription: How we write.\n---\n"),
      plain("references/voice.md"),
      plain("references/examples.md", "Some text.\n"),
    ];

    expect(carriesScripts(files)).toEqual([]);
  });

  it("finds no reason in an empty list", () => {
    expect(carriesScripts([])).toEqual([]);
  });

  it("names a file under a scripts/ folder, and only that reason", () => {
    expect(carriesScripts([plain("SKILL.md"), plain("scripts/notes.txt")])).toEqual(["scripts/notes.txt: under a scripts/ folder"]);
    expect(carriesScripts([plain("tools/scripts/deep/readme.md")])).toEqual(["tools/scripts/deep/readme.md: under a scripts/ folder"]);
  });

  it("reads a scripts folder in any case, behind a backslash, and with a trailing dot or space Windows drops", () => {
    expect(carriesScripts([plain("SCRIPTS/notes.txt")])).toEqual(["SCRIPTS/notes.txt: under a scripts/ folder"]);
    expect(carriesScripts([plain("Scripts\\notes.txt")])).toEqual(["Scripts\\notes.txt: under a scripts/ folder"]);
    expect(carriesScripts([plain("scripts./notes.txt")])).toEqual(["scripts./notes.txt: under a scripts/ folder"]);
    expect(carriesScripts([plain("scripts /notes.txt")])).toEqual(["scripts /notes.txt: under a scripts/ folder"]);
  });

  it("does not read a file named like the folder, or a folder that only starts with it, as a scripts folder", () => {
    expect(carriesScripts([plain("scripts"), plain("scripts-notes/a.md"), plain("myscripts/a.md")])).toEqual([]);
  });

  it("names git mode 100755, and only that reason", () => {
    expect(carriesScripts([{ path: "tool", mode: "100755", head: "binary-ish" }])).toEqual(["tool: executable (git mode 100755)"]);
  });

  it("names any git mode other than a plain file's, failing closed", () => {
    expect(carriesScripts([{ path: "link", mode: "120000", head: "" }])).toEqual(["link: not a plain file (git mode 120000)"]);
    expect(carriesScripts([{ path: "sub", mode: "160000", head: "" }])).toEqual(["sub: not a plain file (git mode 160000)"]);
    expect(carriesScripts([{ path: "odd", mode: "", head: "" }])).toEqual(['odd: not a plain file (git mode "")']);
  });

  it("names a first line starting #!, and only that reason, a .md file's too", () => {
    expect(carriesScripts([plain("run", "#!/bin/sh\necho hi\n")])).toEqual(["run: first line starts with #!"]);
    expect(carriesScripts([plain("NOTES.md", "#!/usr/bin/env node\n")])).toEqual(["NOTES.md: first line starts with #!"]);
  });

  it("reads a shebang behind a byte-order mark or leading blanks, failing closed", () => {
    expect(carriesScripts([plain("a", "\uFEFF#!/bin/sh\n")])).toEqual(["a: first line starts with #!"]);
    expect(carriesScripts([plain("b", "  \t#!/bin/sh\n")])).toEqual(["b: first line starts with #!"]);
  });

  it("does not read #! past the first line", () => {
    expect(carriesScripts([plain("c.md", "# Title\n#!/bin/sh\n")])).toEqual([]);
  });

  it("names each code extension alone, in any case and with a trailing dot Windows drops", () => {
    for (const extension of CODE_EXTENSIONS) {
      expect(carriesScripts([plain(`tool${extension}`)]), extension).toEqual([`tool${extension}: code file (${extension})`]);
      const upper = `TOOL${extension.toUpperCase()}`;
      expect(carriesScripts([plain(upper)]), upper).toEqual([`${upper}: code file (${extension})`]);
    }
    expect(carriesScripts([plain("run.sh.")])).toEqual(["run.sh.: code file (.sh)"]);
  });

  it("pins the plan's extension list", () => {
    expect(CODE_EXTENSIONS).toEqual([
      ".sh", ".bash", ".zsh", ".fish", ".ps1", ".psm1", ".bat", ".cmd", ".py", ".js", ".mjs", ".cjs", ".ts", ".mts",
      ".cts", ".rb", ".pl", ".php", ".lua", ".exe", ".dll", ".so", ".dylib", ".jar", ".wasm",
    ]);
  });

  it("reads only the last extension, so a code word earlier in the name is not one", () => {
    expect(carriesScripts([plain("notes.sh.md"), plain("README"), plain(".bashrc.txt")])).toEqual([]);
  });

  it("names every reason a file carries, in a fixed order, and every file's, in input order", () => {
    const files: ScriptScanFile[] = [
      { path: "Scripts/install.SH", mode: "100755", head: "#!/bin/bash\n" },
      plain("SKILL.md"),
      plain("helper.py"),
    ];

    expect(carriesScripts(files)).toEqual([
      "Scripts/install.SH: under a scripts/ folder",
      "Scripts/install.SH: executable (git mode 100755)",
      "Scripts/install.SH: first line starts with #!",
      "Scripts/install.SH: code file (.sh)",
      "helper.py: code file (.py)",
    ]);
  });
});
