import { cpSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/**
 * A downstream source checkout, isolated from the working tree: this checkout's `src/`,
 * `scripts/` and `assets/`, its `package.json` byte for byte, and its `node_modules` linked in.
 * The fork identity suites run `scripts/fork-identity.mjs` and its resolver inside one, so the
 * script's `ROOT` is the copy and nothing it writes can reach this tree.
 *
 * TEST CHANGE, justified (plan 020 file 1, unit d5-scripts-trees): the fixture also authored a
 * fork corpus (one source, replace, patch and add per class), could publish as a renamed owner or
 * carry a git commit, and exported the oracles of the APM package and the four plugin roots. Every
 * suite that used those halves proved an APM or plugin generator, and each is deleted with its
 * route in 1.15.0; the two remaining callers read the identity scripts only.
 */
export function downstreamCheckout(root: string): void {
  mkdirSync(root, { recursive: true });
  for (const path of ["src", "scripts", "assets"]) cpSync(join(ROOT, path), join(root, path), { recursive: true });
  writeFileSync(join(root, "package.json"), readFileSync(join(ROOT, "package.json")));
  symlinkSync(join(ROOT, "node_modules"), join(root, "node_modules"), "junction");
}
