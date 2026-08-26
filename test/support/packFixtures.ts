import { createHash } from "node:crypto";
import {
  appendFile,
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CliFixture } from "./cliHarness.ts";

/**
 * Pack fixtures for the child-process install-smoke lane: stage a repo pack
 * into a fixture-local directory, tamper a named file, write an org trust
 * policy, and read the install receipt / ownership ledger back off disk.
 *
 * Lane discipline: like cliHarness.ts, this module imports nothing from
 * `src/` — every document is read structurally, exactly as a user inspecting
 * the repo would read it. Where an engine mapping must be known (the pack-id
 * -> install-directory flattening), it is mirrored here with a comment naming
 * the source of truth, so a drift shows up as a loud test failure rather than
 * as a support module that quietly imports the code under test.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** The checkout's first-party pack supply — read-only source for staging. */
const REPO_PACKS_DIR = join(REPO_ROOT, "packs");

/** Refuse a pack id that could escape the staging/read directories. */
function assertPlainPackId(packId: string): void {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(packId)) {
    throw new Error(
      `packFixtures: pack id ${JSON.stringify(packId)} is not a plain bundled-pack directory name`,
    );
  }
}

/**
 * Repo-relative POSIX directory an installed pack lands in. Mirrors
 * `src/pack/receipt.ts::packDirRelPath` (scoped ids flatten to one segment:
 * `@acme/ops` -> `acme__ops`) — mirrored, not imported, per the lane
 * discipline above; a mapping change in the engine fails the smoke suite's
 * receipt reads, which is the drift alarm working.
 */
export function packInstallDir(packId: string): string {
  return `.stamity/packs/${packId.replace("@", "").replace("/", "__")}`;
}

/**
 * Copy the checkout's `packs/<packId>` into a fixture-local staging directory
 * and return its absolute path (usable directly as a `stamity add` path spec).
 *
 * The stage lands INSIDE the fixture's temp tree but OUTSIDE its repo dir
 * (`<tree>/staged/<id>` beside `<tree>/repo` — the harness layout contract in
 * cliHarness.ts): it is cleaned up with the fixture, while repo-tree digests
 * keep seeing only what the engine wrote. The checkout's own packs/ tree is
 * never touched — it is the read-only supply this suite's isolation guard
 * asserts unchanged.
 */
export async function stagePack(fixture: CliFixture, packId: string): Promise<string> {
  assertPlainPackId(packId);
  const staged = join(dirname(fixture.repoDir), "staged", packId);
  await mkdir(dirname(staged), { recursive: true });
  await cp(join(REPO_PACKS_DIR, packId), staged, { recursive: true, force: true });
  return staged;
}

/**
 * Stage a pack this repo does not ship: write `files` (pack-relative POSIX
 * paths) plus a `pack.json` whose integrity map is computed over them, into
 * the same fixture-local staging area {@link stagePack} uses. Returns the
 * absolute directory, usable as a `stamity add` path spec.
 *
 * Synthetic packs exist for the classes no first-party pack ships — the
 * content classes whose consuming seam (or refusal) would otherwise never be
 * exercised through the real bin. `omitFromIntegrity` leaves named files OUT
 * of the map, which is how a class-level ingress refusal is reached: a file
 * listed under a non-live class is refused by manifest validation before
 * enumeration ever runs, so the class refusal needs an unlisted file.
 */
export async function stageSyntheticPack(
  fixture: CliFixture,
  packId: string,
  files: Record<string, string>,
  opts: { omitFromIntegrity?: readonly string[] } = {},
): Promise<string> {
  assertPlainPackId(packId);
  const omitted = new Set(opts.omitFromIntegrity ?? []);
  const staged = join(dirname(fixture.repoDir), "staged", packId);

  const integrity: Record<string, string> = {};
  for (const [relPath, content] of Object.entries(files)) {
    if (omitted.has(relPath)) continue;
    integrity[relPath] = createHash("sha256").update(content, "utf8").digest("hex");
  }
  const manifest = `${JSON.stringify({ name: packId, version: "1.0.0", integrity }, null, 2)}\n`;

  const all = { ...files, "pack.json": manifest };
  await Promise.all(
    Object.entries(all).map(async ([relPath, content]) => {
      const absPath = join(staged, ...relPath.split("/"));
      await mkdir(dirname(absPath), { recursive: true });
      await writeFile(absPath, content, "utf8");
    }),
  );
  return staged;
}

/**
 * Corrupt one staged pack file by appending bytes, so its content no longer
 * hashes to the digest the pack's own `pack.json` integrity map declares.
 */
export async function tamperFile(packDir: string, relPath: string): Promise<void> {
  await appendFile(join(packDir, ...relPath.split("/")), "\ntampered by packFixtures\n", "utf8");
}

/**
 * Write the org trust policy artifact at `.stamity/policy.json`. An object is
 * serialized as JSON; a string is written verbatim — which is how the
 * malformed-policy fail-closed cases stage syntactically broken documents.
 */
export async function writeOrgPolicy(fixture: CliFixture, policy: unknown): Promise<void> {
  const text = typeof policy === "string" ? policy : `${JSON.stringify(policy, null, 2)}\n`;
  await fixture.seed({ ".stamity/policy.json": text });
}

/** One installed file as the receipt records it (`src/pack/receipt.ts` shape). */
interface ObservedReceiptFile {
  path: string;
  class: string;
  sha256: string;
  bytes: number;
  tokens: number;
}

/** The install receipt as observed on disk — structural, never imported. */
export interface ObservedReceipt {
  packId: string;
  version: string;
  source: { kind: string; spec: string };
  trustTier: string;
  tierBasis: string;
  checks: Record<string, string>;
  policy: { decision: string; matchedRule?: string };
  files: ObservedReceiptFile[];
  contextCost: { totalTokens: number };
  engineVersion: string;
  installedAt: string;
}

/** Parse the engine-written receipt of an installed pack out of the fixture repo. */
export async function readReceipt(fixture: CliFixture, packId: string): Promise<ObservedReceipt> {
  const relPath = `${packInstallDir(packId)}/receipt.json`;
  const raw = await readFile(join(fixture.repoDir, ...relPath.split("/")), "utf8");
  return JSON.parse(raw) as ObservedReceipt;
}

/** One ownership-ledger row as persisted in `.stamity/manifest.json`. */
export interface ObservedLedgerRow {
  path: string;
  adapter: string;
  artifactId: string;
  artifactType: string;
  contentHash?: string;
}

/**
 * The manifest's ledger rows whose owner starts with `ownerPrefix` — pass an
 * exact owner (`pack:ops`) for one pack's rows, or `pack:` for every pack row.
 */
export async function readLedgerRows(
  fixture: CliFixture,
  ownerPrefix: string,
): Promise<ObservedLedgerRow[]> {
  const raw = await readFile(join(fixture.repoDir, ".stamity", "manifest.json"), "utf8");
  const manifest = JSON.parse(raw) as { ledger: ObservedLedgerRow[] };
  return manifest.ledger.filter((row) => row.adapter.startsWith(ownerPrefix));
}

/** SHA-256 hex of the bytes at `path` — the check the receipts are held to. */
export async function fileSha256(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

/** What one tree entry contributes to the digest, before it is framed. */
interface DigestRow {
  /** Relative POSIX path from the digested root. */
  rel: string;
  /** `f` file, `d` directory, `l` symlink, `o` anything else (fifo, socket). */
  kind: "f" | "d" | "l" | "o";
  /** Permission bits (`mode & 0o777`). Constant on Windows, which is harmless:
   *  a digest is only ever compared with another taken on the same machine. */
  mode: number;
  /** File bytes, the link target as UTF-8, or empty for a directory. */
  payload: Buffer;
}

/**
 * One digest over every entry under `dir` (`.git/` excluded): sorted relative
 * POSIX paths, each length-framed with its TYPE, permission bits and payload,
 * hashed in order.
 *
 * Two trees digest equal exactly when they hold the same entries, at the same
 * paths, of the same type, with the same permission bits, and — for files —
 * the same bytes, for symlinks the same target. That is the claim the "zero
 * filesystem delta" and "supply tree untouched" assertions rest on, so it is
 * the claim this function has to actually make: an earlier version hashed only
 * regular files and their bytes, which read a tree that gained a symlink, an
 * empty directory, or an executable bit as untouched — and those are precisely
 * the deltas a refused pack install could leave behind while the assertion
 * said it wrote nothing.
 *
 * Length-framing keeps the serialization injective (a path cannot absorb the
 * bytes that follow it), same rationale as the engine's aggregate content SHA.
 *
 * Symlinks are never followed: the entry type comes from the directory listing
 * (lstat semantics), and `readdir({ recursive: true })` does not descend
 * through a link, so a link to an ancestor cannot loop this walk.
 */
export async function treeDigest(dir: string): Promise<string> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const listed = entries
    .map((entry) => {
      const absPath = join(entry.parentPath, entry.name);
      return { absPath, rel: absPath.slice(dir.length + 1).split("\\").join("/") };
    })
    .filter(({ rel }) => rel !== ".git" && !rel.startsWith(".git/"))
    .toSorted((a, b) => (a.rel < b.rel ? -1 : 1));

  // Read in parallel, then fold sequentially: hash.update order is the digest.
  const rows: DigestRow[] = await Promise.all(
    listed.map(async ({ absPath, rel }): Promise<DigestRow> => {
      // Kind comes from the lstat, not from the Dirent: on filesystems that do
      // not carry a type in the directory entry, a Dirent can report UNKNOWN
      // while the stat is definitive, and one source keeps the two from
      // disagreeing about the same path.
      const stats = await lstat(absPath);
      const mode = stats.mode & 0o777;
      if (stats.isSymbolicLink()) {
        return { rel, kind: "l", mode, payload: Buffer.from(await readlink(absPath), "utf8") };
      }
      if (stats.isDirectory()) return { rel, kind: "d", mode, payload: Buffer.alloc(0) };
      if (stats.isFile()) return { rel, kind: "f", mode, payload: await readFile(absPath) };
      return { rel, kind: "o", mode, payload: Buffer.alloc(0) };
    }),
  );

  const hash = createHash("sha256");
  for (const row of rows) {
    hash.update(
      `${Buffer.byteLength(row.rel, "utf8")}:${row.rel}` +
        `${row.kind}${row.mode.toString(8)}:${row.payload.byteLength}:`,
      "utf8",
    );
    hash.update(row.payload);
  }
  return hash.digest("hex");
}
