#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * The `st` bin: the short alias, on its way out (REQ-FLOW-049). It says so once on stderr, then
 * runs the real CLI in this process, so stdout, `--json` and the exit code are `stamity`'s own.
 *
 * Node builtins only. The CLI is loaded through a computed specifier, so the bundler leaves
 * `dist/cli.js` whole rather than folding a second copy of it into `dist/st.js`. `process.argv[1]`
 * is pointed at that sibling first, because `src/cli.ts` runs only when it is the executed script
 * (its `isMain`). Beside a build the sibling is `cli.js`; in the source checkout it is `cli.ts`.
 * The guard keeps reading `st` as this CLI until the bin goes at 2.0.0.
 */
process.stderr.write("stamity: the st command is deprecated and is removed in 2.0.0; run stamity instead.\n");

const here = dirname(fileURLToPath(import.meta.url));
const built = join(here, "cli.js");
const entry = existsSync(built) ? built : join(here, "cli.ts");
process.argv[1] = entry;
await import(pathToFileURL(entry).href);
