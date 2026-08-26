/**
 * The typed adapter registry: every residue planner the product ships, keyed
 * by the closed {@link Tool} union.
 *
 * This is deliberately a STATIC table, not a mutable registration surface.
 * `Record<Tool, ResiduePlanner>` makes it complete by construction — adding a
 * fifth tool to {@link TOOLS} without an adapter here is a compile error, and
 * so is a registry row whose planner does not exist. Side-effect registration
 * (an `registerAdapter()` mutating a map at import time) would trade that
 * type-checker-verified wiring for runtime discovery, which is the failure
 * mode the composition root exists to rule out (`src/composition/root.ts`
 * header) — so it is rejected, not merely omitted.
 *
 * Import discipline: this module imports the four adapter modules plus
 * planner/types TYPE surfaces only. It never imports the CLI seam
 * (`src/cli/engine/emission.ts`) — the seam imports THIS module, and a
 * back-edge would be a runtime cycle. The registry suite asserts that
 * discipline against the module source.
 *
 * Named `registry.ts`, never `index.ts`: this repo bans every internal barrel
 * import but the public entry (`test/architecture/boundaries.test.ts` rule 1),
 * and the ban is about the *name* — a file called `index.ts` reads as a
 * re-export surface whose contents are whatever its directory happens to hold.
 * This table is the opposite: a closed, hand-declared row set. The name says so.
 */

import type { ResiduePlanner } from "../emit/planner.ts";
import type { Tool } from "../types/core.ts";
import { claudeResiduePlanner } from "./claude.ts";
import { codexResiduePlanner } from "./codex.ts";
import { copilotResiduePlanner } from "./copilot.ts";
import { cursorResiduePlanner } from "./cursor.ts";

/**
 * All four shipped residue planners, in {@link Tool}-key form for
 * `composeEmissionPlanner`. Frozen: the registry is data, and a caller that
 * could swap a row at runtime would bypass the completeness guarantee the
 * type gives.
 */
export const ADAPTER_REGISTRY: Readonly<Record<Tool, ResiduePlanner>> = Object.freeze({
  claude: claudeResiduePlanner,
  cursor: cursorResiduePlanner,
  copilot: copilotResiduePlanner,
  codex: codexResiduePlanner,
});
