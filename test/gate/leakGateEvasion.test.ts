import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Evasions of the name-leak gate — the repository's only reserved-name control.
 *
 * Two classes of bypass are pinned here, both of which the gate PASSed with the
 * reserved name sitting in the repository, readable by `cat`, `strings` or `ls`:
 *
 *  1. The skip was decided by the file EXTENSION, so a plain-ASCII file named
 *     `*.png`, a readable name inside real image metadata, and a reserved name
 *     in a binary-extension FILENAME were all reported "not scanned" and exited
 *     0. The extension is chosen by whoever adds the file; it says nothing about
 *     what the bytes are.
 *  2. Content was read with `readFileSync`, which FOLLOWS symlinks. A committed
 *     symlink whose target STRING spells a reserved name — and git stores
 *     exactly that string as the blob — was read through to ENOENT and filed
 *     under "vanished mid-scan", which reads like a benign delete race rather
 *     than a file nobody inspected. `listFromGit` listed symlinks and
 *     `listFromDisk` skipped them, so the two listings disagreed as well.
 *
 * Every case runs the SHIPPED script — byte-copied into a scratch repository so
 * the gate's own `ROOT` (the parent of its `scripts/` directory) points at the
 * fixture tree. That keeps the suite hermetic: probes never touch the real
 * working tree, so a parallel test file running the gate cannot see them, and a
 * symlink or force-added build artifact can be planted without mutating the
 * repository under review. `test/ci/leakGate.test.ts` covers the
 * complementary property — that the gate passes on the repository as it stands.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const GATE_SOURCE = join(REPO_ROOT, "scripts", "leak-gate.mjs");

/**
 * Reserved tokens and their evasion spellings, ASSEMBLED at run time from fragments and escapes.
 *
 * Never written out, in any spelling. A literal here would put a string in this file that
 * normalizes to the reserved name, and the gate scans this file like any other — so the suite
 * proving the normalizing pass works would be the leak that pass exists to catch.
 */
const HEAD = "tes";
const MID = "s";
const TAIL = "ity";
const RESERVED = `${HEAD}${MID}${TAIL}`;
/** The name this repository was built under and shed at the rename. */
const RETIRED_HEAD = "nes";
const RETIRED_TAIL = "tor";
const RETIRED = `${RETIRED_HEAD}${RETIRED_TAIL}`;
/** Zero-width space, Cyrillic small letter IE (U+0435), and the fullwidth Latin letters. */
const ZWSP = "\u200b";
const CYRILLIC_E = "\u0435";
const FULLWIDTH = [0xff54, 0xff45, 0xff53, 0xff53, 0xff49, 0xff54, 0xff59]
  .map((code) => String.fromCharCode(code))
  .join("");

/**
 * Credential SHAPES, assembled the same way and for the same reason.
 *
 * The gate scans this file for credential shapes too, so a literal PEM header or connection
 * string written out here fails the repository's own gate — which is the control working, and
 * which is why every one of these is split across a join the pattern cannot span.
 */
const PEM_HEADER = ["-----BEGIN RSA PRIVATE", "KEY-----"].join(" ");
const OPENSSH_HEADER = ["-----BEGIN OPENSSH PRIVATE", "KEY-----"].join(" ");
const DSN = `postgres://admin:${["hunter", "2"].join("")}@db.internal/app`;
const GITHUB_TOKEN = `gh${"p"}_${"A".repeat(36)}`;

/** PNG's 8-byte magic — a real signature, so the sniff has something true to find. */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** An IHDR chunk: the NUL-heavy header every real PNG carries after the magic. */
const PNG_HEADER = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x0d]),
  Buffer.from("IHDR"),
  Buffer.from([0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00]),
]);

/** A `tEXt` chunk — the readable metadata `strings` pulls out of a real image. */
function pngTextChunk(comment: string): Buffer {
  return Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, comment.length + 8]),
    Buffer.from("tEXtComment"),
    Buffer.from([0x00]),
    Buffer.from(comment),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
  ]);
}

interface GateResult {
  status: number;
  stdout: string;
  stderr: string;
}

const scratches: string[] = [];

/** A throwaway repository holding a byte-identical copy of the shipped gate. */
class Scratch {
  readonly root: string;

  constructor(options: { git?: boolean } = {}) {
    this.root = mkdtempSync(join(realpathSync(tmpdir()), "stamity-gate-"));
    scratches.push(this.root);
    mkdirSync(join(this.root, "scripts"), { recursive: true });
    copyFileSync(GATE_SOURCE, join(this.root, "scripts", "leak-gate.mjs"));
    if (options.git !== false) {
      execFileSync("git", ["init", "-q", this.root], { stdio: "ignore" });
    }
  }

  write(relative: string, bytes: string | Buffer): string {
    const absolute = join(this.root, relative);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, bytes);
    return relative;
  }

  link(relative: string, target: string): string {
    const absolute = join(this.root, relative);
    mkdirSync(dirname(absolute), { recursive: true });
    symlinkSync(target, absolute);
    return relative;
  }

  git(...args: string[]): void {
    execFileSync("git", ["-C", this.root, ...args], { stdio: "ignore" });
  }

  run(...args: string[]): GateResult {
    const result = spawnSync(
      process.execPath,
      [join(this.root, "scripts", "leak-gate.mjs"), ...args],
      { encoding: "utf8" },
    );
    return {
      status: result.status ?? -1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  }
}

/** How many times `where`-prefixed hit lines name `file`, across both streams. */
function hitCount(result: GateResult, file: string): number {
  return `${result.stdout}\n${result.stderr}`
    .split("\n")
    .filter((line) => line.trimStart().startsWith(file)).length;
}

/** A directory OUTSIDE the scratch repository, for the read-through boundary case. */
function outsideDir(): string {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), "stamity-outside-"));
  scratches.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("leak-gate — scratch harness control", () => {
  it("passes a clean scratch repository holding only the gate itself", () => {
    const result = new Scratch().run();

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("PASS");
  });

  it("fails a plainly seeded leak, so a PASS below is a real refusal", () => {
    const scratch = new Scratch();
    const file = scratch.write("docs/note.md", `this file mentions ${RESERVED} plainly\n`);

    const result = scratch.run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(file);
  });

  it("fails the retired name, in a body and in a path, with no allowlist for either", () => {
    // The rename's standing guard. `retired-name` carries `allow: []`, so unlike the
    // predecessor project there is no path where this one is legal: a revert, a merge from a
    // stale branch, or a hand-written reference to the old repository brings back a second name
    // for one product — a dead identity readers search for and issues get filed against. The
    // whole tree was renamed once; this is what keeps it renamed.
    const scratch = new Scratch();
    const body = scratch.write("docs/history.md", `built under ${RETIRED} before the rename\n`);
    const path = scratch.write(`docs/${RETIRED}-notes.md`, "no reserved name in the bytes\n");

    const result = scratch.run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(body);
    expect(result.stderr).toContain(path);
    expect(result.stderr).toContain("[retired-name]");
    expect(result.stderr).toContain("(path)");
  });
});

describe("leak-gate — no exemption by file type", () => {
  it("scans a plain-text file that carries a binary extension", () => {
    const scratch = new Scratch();
    const file = scratch.write("assets/logo.png", `${RESERVED} inside, not really a png\n`);

    const result = scratch.run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(file);
  });

  it("scans the readable metadata of a genuinely binary file", () => {
    const scratch = new Scratch();
    const file = scratch.write(
      "assets/real.png",
      Buffer.concat([PNG_MAGIC, PNG_HEADER, pngTextChunk(`${RESERVED} is in the metadata`)]),
    );

    const result = scratch.run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(file);
  });

  it("scans the filename of a binary-extension file, not only its bytes", () => {
    const scratch = new Scratch();
    const file = scratch.write(`assets/${RESERVED}-brand.png`, Buffer.concat([PNG_MAGIC, PNG_HEADER]));

    const result = scratch.run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(file);
    expect(result.stderr).toContain("(path)");
  });

  it("reports a clean binary file as scanned rather than as an exemption", () => {
    const scratch = new Scratch();
    scratch.write("assets/clean.png", Buffer.concat([PNG_MAGIC, PNG_HEADER, pngTextChunk("no name here")]));

    const result = scratch.run();

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("not scanned");
    expect(result.stdout).toMatch(/\b1 binary\b/);
  });
});

describe("leak-gate — symlinks", () => {
  it("scans a symlink's target string instead of filing the leak as vanished", () => {
    const scratch = new Scratch();
    const link = scratch.link("docs/pointer", `${RESERVED}-secret-name.md`);

    const result = scratch.run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(link);
    expect(result.stderr).toContain("symlink target");
    expect(result.stdout).not.toContain("vanished");
  });

  it("scans symlink targets under the disk listing too, so both listings agree", () => {
    const scratch = new Scratch({ git: false });
    const probe = spawnSync("git", ["-C", scratch.root, "rev-parse", "--is-inside-work-tree"], {
      encoding: "utf8",
    });
    expect(probe.status, "scratch dir must sit outside any git work tree").not.toBe(0);

    const link = scratch.link("docs/pointer", `${RESERVED}-secret-name.md`);

    const result = scratch.run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(link);
  });

  it("does not read through a symlink into content outside the repository", () => {
    const outside = outsideDir();
    writeFileSync(join(outside, "external.txt"), `${RESERVED} lives outside the repo\n`);
    const scratch = new Scratch();
    scratch.link("docs/outside-pointer", join(outside, "external.txt"));

    const result = scratch.run();

    // git stores only the link string, so the name is not repository content —
    // and pulling an out-of-tree file into the scan is a boundary the gate has
    // no business crossing.
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/\b1 symlink\b/);
  });
});

describe("leak-gate — exemptions stay reviewable", () => {
  it("keeps the no-content-exemption property a NUL prepend used to break", () => {
    const scratch = new Scratch();
    const file = scratch.write(
      "docs/nul.md",
      Buffer.concat([Buffer.from([0]), Buffer.from(`${RESERVED}\n`)]),
    );

    const result = scratch.run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(file);
  });

  it("names the build-directory drops instead of dropping them invisibly", () => {
    const scratch = new Scratch();
    scratch.write(".gitignore", "dist/\n");
    const file = scratch.write("dist/bundle.js", `${RESERVED} inside a build artifact\n`);
    scratch.git("add", "-f", "dist/bundle.js");

    const result = scratch.run();

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("not scanned");
    expect(result.stdout).toContain(file);
  });

  it("still scans the NAME of a build-directory path it does not read", () => {
    const scratch = new Scratch();
    scratch.write(".gitignore", "dist/\n");
    const file = scratch.write(`dist/${RESERVED}-bundle.js`, "no reserved name in the bytes\n");
    scratch.git("add", "-f", file);

    const result = scratch.run();

    // A path exemption exempts CONTENT. The path itself is repository text like
    // any other, and a directory nobody reads is no reason to stop reading it.
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(file);
    expect(result.stderr).toContain("(path)");
  });

  it("anchors the build exemption to the repository root", () => {
    // The skip matched any path SEGMENT at any depth, so tracked source under
    // `src/dist/`, `test/fixtures/coverage/` and `packs/ops/node_modules/` was
    // dropped unread — directories that merely share a name with build output.
    const scratch = new Scratch();
    const nested = [
      scratch.write("src/dist/bundled.ts", `const name = "${RESERVED}"\n`),
      scratch.write("test/fixtures/coverage/report.json", `{"name":"${RESERVED}"}\n`),
      scratch.write("packs/ops/node_modules/vendored.js", `// ${RESERVED}\n`),
    ];
    scratch.git("add", "-A");

    const result = scratch.run();

    expect(result.status).toBe(1);
    for (const file of nested) expect(result.stderr, file).toContain(file);
    expect(result.stderr).not.toContain("not scanned (build or vendor directory)");
  });

  it("names its exemptions on the FAILING run, not only when everything passed", () => {
    // The census printed on PASS and not on FAIL — i.e. not on the run a
    // maintainer reads closely, which is the only run where an unreviewed
    // exemption matters.
    const scratch = new Scratch();
    scratch.write(".gitignore", "dist/\n");
    scratch.write("dist/bundle.js", `${RESERVED} inside a build artifact\n`);
    scratch.git("add", "-f", "dist/bundle.js");
    const leak = scratch.write("docs/note.md", `plainly ${RESERVED}\n`);

    const result = scratch.run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(leak);
    expect(result.stderr).toContain("not scanned (build or vendor directory)");
    expect(result.stderr).toContain("dist/bundle.js");
    expect(result.stderr).toContain("scanned");
  });

  it("scans the build directory when told the build IS the payload", () => {
    // `--include-build` is what lets `tarball-smoke` run this gate over the
    // packed artifact, where `dist/` is not regenerated noise but everything the
    // package ships — and where an escaped spelling in source has already been
    // folded back to the plain name by the bundler.
    const scratch = new Scratch();
    scratch.write(".gitignore", "dist/\n");
    const artifact = scratch.write("dist/bundle.js", `${RESERVED} survived the bundler\n`);
    scratch.git("add", "-f", artifact);

    expect(scratch.run().status, "default run must keep the build exemption").toBe(0);

    const scanned = scratch.run("--include-build");

    expect(scanned.status).toBe(1);
    expect(scanned.stderr).toContain(artifact);
  });
});

/** UTF-16LE bytes for `text`, with the byte-order mark when asked. */
function utf16le(text: string, bom: boolean): Buffer {
  const body = Buffer.from(text, "utf16le");
  return bom ? Buffer.concat([Buffer.from([0xff, 0xfe]), body]) : body;
}

/** UTF-16BE bytes for `text`: the LE encoding with every pair swapped. */
function utf16be(text: string, bom: boolean): Buffer {
  const body = Buffer.from(text, "utf16le");
  body.swap16();
  return bom ? Buffer.concat([Buffer.from([0xfe, 0xff]), body]) : body;
}

describe("leak-gate — encodings", () => {
  it("fails a UTF-16LE file that renders as the plain name", () => {
    // The blind spot this closes: latin1 sees `t\0e\0s\0…`, so no token matched,
    // and the file was counted among those the gate had READ. A leak reported as
    // scanned is worse than a leak reported as skipped.
    const scratch = new Scratch();
    const file = scratch.write("docs/wide.md", utf16le(`${RESERVED}\n`, true));

    const result = scratch.run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(file);
    expect(result.stderr).toContain("utf16le");
  });

  it("fails the same file in UTF-16BE", () => {
    const scratch = new Scratch();
    const file = scratch.write("docs/wide-be.md", utf16be(`${RESERVED}\n`, true));

    const result = scratch.run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(file);
    expect(result.stderr).toContain("utf16be");
  });

  it("fails a BOM-less UTF-16 file, which is the one an evader writes", () => {
    // A BOM is optional and removable. The NUL-alternation pattern is not: ASCII
    // text in UTF-16 puts a NUL beside every character by construction.
    const scratch = new Scratch();
    const file = scratch.write("docs/nobom.md", utf16le(`the name is ${RESERVED} here\n`, false));

    const result = scratch.run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(file);
  });

  it("reports a UTF-16 leak once, not once per reading of the bytes", () => {
    const scratch = new Scratch();
    const file = scratch.write("docs/once.md", utf16le(`${RESERVED}\n`, true));

    expect(hitCount(scratch.run(), file)).toBe(1);
  });

  it("reads a clean UTF-16 file without inventing a hit", () => {
    // The control: the decoders must not turn arbitrary wide text into matches.
    const scratch = new Scratch();
    scratch.write("docs/clean-wide.md", utf16le("nothing reserved in this sentence\n", true));

    const result = scratch.run();

    expect(result.status, result.stderr).toBe(0);
  });
});

describe("leak-gate — spellings that render as the name", () => {
  const VARIANTS: readonly [string, string][] = [
    ["zero-width", `${HEAD}${ZWSP}${MID}${TAIL}`],
    ["soft-hyphen", `${HEAD}\u00ad${MID}${TAIL}`],
    ["homoglyph", `t${CYRILLIC_E}${MID}${MID}${TAIL}`],
    ["fullwidth", FULLWIDTH],
    ["html-entity", `&#116;e${MID}${MID}${TAIL}`],
    ["hex-entity", `&#x74;e${MID}${MID}${TAIL}`],
    ["percent-escape", `%74e${MID}${MID}${TAIL}`],
    ["control-byte", `${HEAD}\u0001${MID}${TAIL}`],
  ];

  for (const [label, spelling] of VARIANTS) {
    it(`fails a ${label} spelling`, () => {
      // Every one of these renders as the plain name in a browser, a terminal or
      // an editor. Matching raw bytes and nothing else let all of them through.
      const scratch = new Scratch();
      const file = scratch.write(`docs/${label}.md`, `the product is ${spelling} today\n`);

      const result = scratch.run();

      expect(result.status, `${label}: ${result.stdout}`).toBe(1);
      expect(result.stderr).toContain(file);
    });
  }

  it("reports a plain ASCII hit once, not once per view", () => {
    // Dedupe by (rule, file, byte offset). An ordinary file produces a latin1
    // view and its normalized twin, and both find the same token at the same
    // offset — one finding, or the report is noise on every real leak.
    const scratch = new Scratch();
    const file = scratch.write("docs/plain.md", `plainly ${RESERVED}\n`);

    expect(hitCount(scratch.run(), file)).toBe(1);
  });

  it("does not fold an unrelated word into the reserved name", () => {
    // The false-positive control. NFKC and the confusable table can only ADD
    // matches, so a case that never fails against a broken folder proves nothing.
    const scratch = new Scratch();
    scratch.write("docs/ordinary.md", "density, testability, and identity are all fine words\n");

    expect(scratch.run().status).toBe(0);
  });
});

describe("leak-gate — credential shapes", () => {
  it("fails a credential shape in a tracked file", () => {
    // The tree had no secret detection of any kind: no scan lane, no secretlint,
    // no push-protection assertion — while the traversal a shape pass needs was
    // already running here on every push.
    const scratch = new Scratch();
    const file = scratch.write("src/config.ts", `const token = "${GITHUB_TOKEN}"\n`);

    const result = scratch.run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(file);
    expect(result.stderr).toContain("github-token");
    // The remedy has to lead with rotation: the credential is already in the
    // working tree and may already be in history, so deleting it is second.
    expect(result.stderr).toContain("rotate the credential FIRST");
  });

  it("catches a private key header and a credentialed connection string", () => {
    const scratch = new Scratch();
    const pem = scratch.write("keys/id.pem", `${PEM_HEADER}\nnot real\n`);
    const url = scratch.write("src/db.ts", `const dsn = "${DSN}"\n`);

    const result = scratch.run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(pem);
    expect(result.stderr).toContain(url);
  });

  it("leaves ordinary source alone, so the shapes are not matching everything", () => {
    const scratch = new Scratch();
    scratch.write("src/app.ts", `const url = "postgres://localhost:5432/app"\nconst sha = "${"a".repeat(40)}"\n`);

    expect(scratch.run().status, scratch.run().stderr).toBe(0);
  });

  it("exempts the scanner's own corpus by PATH, and says so", () => {
    // A shape scanner cannot scan its own definitions without reporting every
    // one of them. The exemption is by path and is printed — there is no in-file
    // opt-out marker, because that would be an exemption by CONTENT written by
    // whoever is committing the credential.
    const scratch = new Scratch();
    scratch.write("src/mcp/secretScan.ts", `const example = "ghp_${"A".repeat(36)}"\n`);

    const result = scratch.run();

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("not scanned (rule github-token allowlisted)");
    expect(result.stdout).toContain("src/mcp/secretScan.ts");
  });

  it("still scans a shape-fixture file for every OTHER shape", () => {
    // Per rule, not per file. `test/merge/bakEscape.test.ts` holds a deliberate
    // OpenSSH header canary and is exempt from THAT shape alone — a suite that
    // legitimately carries one example is not thereby licensed to carry a real
    // credential of a different shape.
    const scratch = new Scratch();
    const file = scratch.write(
      "test/merge/bakEscape.test.ts",
      `const SECRET = "${OPENSSH_HEADER}"\nconst token = "${GITHUB_TOKEN}"\n`,
    );

    const result = scratch.run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(file);
    expect(result.stderr).toContain("github-token");
    // The canary it IS exempt from stays exempt, and the exemption is printed.
    expect(result.stderr).not.toContain("pem-private-key]");
    expect(result.stderr).toContain("not scanned (rule pem-private-key allowlisted)");
  });
});
