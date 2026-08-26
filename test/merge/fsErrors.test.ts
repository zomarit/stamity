import { writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { mapFsErrno } from "../../src/merge/fsErrors.ts";
import { EngineError } from "../../src/types/errors.ts";
import { useTempDir } from "../support/tempDir.ts";

const TARGET = "/repo/.agents/setup.md";

function errnoError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`synthetic ${code}`), { code });
}

describe("mapFsErrno mapped errnos", () => {
  const CASES: readonly [code: string, mustMention: RegExp][] = [
    ["ENOSPC", /disk space/i],
    ["EACCES", /permission denied/i],
    ["EDQUOT", /quota/i],
    ["EROFS", /read-only/i],
    ["EFBIG", /too large/i],
    ["EMFILE", /ulimit -n/],
    ["ENFILE", /system-wide/i],
    ["EIO", /i\/o error/i],
    ["ENOENT", /mkdir -p/],
  ];

  it.each(CASES)("%s maps to an actionable FS_ERROR naming the path", (code, mustMention) => {
    const original = errnoError(code);
    const mapped = mapFsErrno(original, TARGET);

    expect(mapped).toBeInstanceOf(EngineError);
    const err = mapped as EngineError;
    expect(err.code).toBe("FS_ERROR");
    expect(err.exitCode).toBe(1);
    expect(err.message).toContain(TARGET);
    expect(err.message).toMatch(mustMention);
    // The original error survives as the cause chain link.
    expect(err.cause).toBe(original);
  });

  it("ENOENT and EFBIG guidance names the parent directory", () => {
    for (const code of ["ENOENT", "EFBIG"]) {
      const mapped = mapFsErrno(errnoError(code), TARGET);
      expect(mapped?.message).toContain(dirname(TARGET));
    }
  });
});

describe("mapFsErrno unmapped inputs", () => {
  it("returns null for errnos outside the table", () => {
    expect(mapFsErrno(errnoError("EPERM"), TARGET)).toBeNull();
    expect(mapFsErrno(errnoError("EEXIST"), TARGET)).toBeNull();
  });

  it("returns null for non-errno inputs of every shape", () => {
    expect(mapFsErrno(new Error("no code"), TARGET)).toBeNull();
    expect(mapFsErrno(null, TARGET)).toBeNull();
    expect(mapFsErrno(undefined, TARGET)).toBeNull();
    expect(mapFsErrno("ENOSPC", TARGET)).toBeNull();
    expect(mapFsErrno(42, TARGET)).toBeNull();
    expect(mapFsErrno({}, TARGET)).toBeNull();
    // A code that is not a string never indexes the table.
    expect(mapFsErrno({ code: 28 }, TARGET)).toBeNull();
  });
});

describe("mapFsErrno against a real filesystem error", () => {
  const getDir = useTempDir("fs-errors");

  it("maps the ENOENT a write into a missing parent directory raises", async () => {
    const target = getDir().path("missing-parent", "out.md");

    let caught: unknown;
    try {
      await writeFile(target, "content", "utf8");
    } catch (err) {
      caught = err;
    }
    expect((caught as NodeJS.ErrnoException).code).toBe("ENOENT");

    const mapped = mapFsErrno(caught, target);
    expect(mapped).toBeInstanceOf(EngineError);
    expect(mapped?.message).toContain(dirname(target));
    expect(mapped?.cause).toBe(caught);
  });
});
