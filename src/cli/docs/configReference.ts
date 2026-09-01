/**
 * The configuration reference, rendered from the config command's key
 * registry.
 *
 * The drift class this closes: a hand-written settings page lists
 * keys someone remembered, spells accepted values from memory, and goes stale
 * the moment a key is added, renamed, or given a different default. Here the
 * rows ARE `KEY_SPECS` — the closed registry `config get` and `config set`
 * address — so the page lists exactly the keys that exist, quotes each key's
 * own `hint` as its accepted value, and derives what binds when nothing is
 * persisted by asking the key's own resolver.
 *
 * **Stored versus effective is the page's whole subject.** A key has two
 * readings: what the manifest carries (`read`, what `config get` prints) and
 * what actually binds once engine defaults apply (`resolve`, what `config
 * list` prints). The distinction is invisible in the manifest file itself —
 * an absent key looks like a key with no opinion, when in fact an engine
 * default is deciding — so the "when unset" column is the one thing this page
 * exists to publish.
 *
 * **The unset column is measured, not narrated.** Each row's value comes from
 * calling that key's own `resolve` against {@link UNSET_PROBE}, a manifest in
 * the state every optional key is in before anyone sets it. A key whose
 * resolver returns nothing readable refuses to render rather than printing an
 * empty cell — which is also what would catch a future resolver reading a
 * field the probe leaves blank.
 *
 * **Measured against a manifest a repo can actually have.** The probe used to
 * carry `tools: []`, which the manifest schema refuses outright, and three
 * cells were the consequence: `resolvePin` and `resolveEffort` iterate the
 * selected clients, so with none selected they answered from a no-clients
 * fallback instead of from the model ladder. The page published `(client
 * default)` for the three classes claude publishes an alias for, which every
 * claude repo's `config list` contradicts. The probe now selects every
 * supported client, so those columns render the ladder's per-client answer —
 * the same string the command prints — and the client-dependence a reader has
 * to know about is visible in the cell instead of being averaged away.
 *
 * Owns the markdown table primitives for the docs lane (`cell`, `table`,
 * `code`) on top of the base page primitives in `./referencePages.ts`; see
 * that module's header for why the four renderers layer this way. Pure and
 * clock-free: no wall clock is read, so two runs are byte-identical until a
 * key actually changes.
 */

import { KEY_SPECS, type ConfigKeySpec } from "../commands/config.ts";
import { MANIFEST_REPO_PATH } from "../../manifest/manifest.ts";
import { TOOLS } from "../../types/core.ts";
import { MANIFEST_VERSION, type SetupManifest } from "../../types/manifest.ts";
import { EngineError } from "../../types/errors.ts";
import { REGENERATE_COMMAND, frontmatterBlock, generatedBanner } from "./referencePages.ts";

/** Repo-relative path of the committed page this module renders. */
export const CONFIG_REFERENCE_DOC_PATH = "docs/configuration.md";

// ── Markdown table primitives (shared with ./cliReference.ts) ────

/**
 * One table cell. Newlines collapse (a wrapped hint is still one cell) and
 * pipes escape — GFM reads an unescaped `|` as a column break even inside a
 * code span, so a hint listing alternatives would otherwise shear the row
 * into extra columns.
 */
export function cell(value: string): string {
  return value.replace(/\s*\r?\n\s*/g, " ").replaceAll("|", "\\|").trim();
}

/** Fixed-width markdown table: header, delimiter, then the given rows. */
export function table(headers: readonly string[], rows: readonly (readonly string[])[]): string[] {
  return [
    `| ${headers.join(" | ")} |`,
    `|${headers.map(() => "---").join("|")}|`,
    ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`),
  ];
}

/** Inline code — ids, flags, keys, enum values. */
export function code(value: string): string {
  return `\`${value}\``;
}

// ── The unset probe ──────────────────────────────────────────────

/**
 * A manifest with no optional key set — the state every one of them is in
 * before anyone sets it.
 *
 * `tools` names every supported client, and that is the one field here chosen
 * for realism rather than emptiness. It is a selection a real repo can carry
 * (the schema refuses an empty one), and the model and effort rows resolve per
 * selected client, so a narrower selection would publish one client's answer as
 * the engine's: a claude-only probe prints `opus` where a cursor repo resolves
 * to nothing. Every client selected means every client's answer is in the cell,
 * and a reader finds their own.
 *
 * The placeholder strings are deliberate and load-bearing for the opposite
 * reason: no key's resolver reads `generatedBy`, `createdAt` or `updatedAt`, so
 * leaving them blank is how a future resolver that DOES read one gets caught.
 * It would resolve to an empty string, and {@link renderConfigReferenceFrom}
 * refuses to render an empty cell — a compile-clean change that would have
 * quietly published a blank default fails the generator instead. Those three
 * are why the probe is not simply a schema-valid manifest.
 */
export const UNSET_PROBE: SetupManifest = {
  version: MANIFEST_VERSION,
  generatedBy: "",
  createdAt: "",
  updatedAt: "",
  tools: [...TOOLS],
  selection: { items: { agent: [], skill: [], rule: [], command: [] } },
  ledger: [],
};

/** Rendering for a key the manifest always carries, so "unset" cannot happen. */
const ALWAYS_SET = "always set — the manifest schema requires it";

function fail(message: string): never {
  throw new EngineError(message, { code: "VALIDATION_ERROR" });
}

/**
 * What binds when nothing is persisted. A key whose `read` returns non-null
 * on the probe is one the schema requires, so it has no unset state to
 * describe; every other key reports its own resolver's answer.
 */
function unsetBehaviour(spec: ConfigKeySpec): string {
  if (spec.read(UNSET_PROBE) !== null) return ALWAYS_SET;
  const resolved = spec.resolve(UNSET_PROBE);
  if (resolved.trim() === "") {
    fail(
      `Config key "${spec.key}" resolves to an empty value on a manifest that carries only the ` +
        `schema-required fields, so ${CONFIG_REFERENCE_DOC_PATH} would publish a blank default. ` +
        `Its resolver reads a field the unset probe does not fill.`,
    );
  }
  return code(resolved);
}

// ── Render ───────────────────────────────────────────────────────

/**
 * Render the page from an explicit key registry. Deterministic: rows follow
 * the registry's own display order, which is the order `config list` prints.
 *
 * Throws `EngineError` (`VALIDATION_ERROR`) on a key with no name or hint, a
 * duplicated key, or a key whose unset resolution renders empty.
 */
export function renderConfigReferenceFrom(specs: readonly ConfigKeySpec[]): string {
  if (specs.length === 0) {
    fail(
      `The config key registry is empty, so ${CONFIG_REFERENCE_DOC_PATH} would document a ` +
        `command that addresses nothing. Check \`KEY_SPECS\` in src/cli/commands/config.ts.`,
    );
  }

  const seen = new Set<string>();
  for (const spec of specs) {
    if (spec.key.trim() === "") fail("A config key spec declares an empty key name.");
    if (spec.hint.trim() === "") {
      fail(
        `Config key "${spec.key}" declares no value hint, so the page could not say what a ` +
          `valid value looks like — and neither could the failure \`config set\` prints.`,
      );
    }
    if (seen.has(spec.key)) fail(`Config key "${spec.key}" is declared twice in the registry.`);
    seen.add(spec.key);
  }

  const rows = specs.map((spec) => [code(spec.key), spec.hint, unsetBehaviour(spec)]);

  const lines = [
    // Frontmatter first, banner second: the site generator parses the block only
    // at byte 0, so the banner cannot lead the file without unpublishing the title.
    frontmatterBlock("Configuration reference"),
    "",
    generatedBanner(),
    "",
    "# Configuration reference",
    "",
    `Every key \`stamity config\` addresses, rendered from the closed registry the command reads.`,
    `The registry is the whole surface: \`config set\` refuses any key not listed here by name,`,
    `so a key absent from this table cannot be written even if the manifest would accept it.`,
    "",
    `Values live in \`${MANIFEST_REPO_PATH}\`. Editing that file by hand is not the supported`,
    `path — \`config set\` validates the result against the manifest schema before it writes,`,
    `and prints the same refusal the writer would have produced.`,
    "",
    "On a terminal, `stamity config` with no subcommand opens a navigable picker over the same",
    "rows `config list` prints, and applies the one key it settles per run through the validation",
    "and write path `config set` uses. Scripts, pipes and CI see no prompt — there, bare `config`",
    "is `config list`.",
    "",
    "## Stored and effective",
    "",
    "A key reads two ways, and they disagree whenever a key is unset.",
    "",
    ...table(
      ["Reading", "What it is", "Where you see it"],
      [
        [
          "Stored",
          "the value the manifest carries, or nothing at all",
          `${code("stamity config get <key>")} — an unset key prints its default in parentheses`,
        ],
        [
          "Effective",
          "what binds after engine defaults are applied",
          `${code("stamity config list")} — every key, marked ${code("(set)")} or ${code("(default)")}`,
        ],
      ],
    ),
    "",
    "An unset key is not an absent opinion: an engine default is deciding, and the third",
    "column below is that decision. Setting a key to the same value it already resolves to",
    "changes nothing except that the choice becomes yours and survives a default change.",
    "",
    "Some of those decisions are per client, because the model and effort rows resolve through",
    "each selected client's own projection. The column is measured against a manifest that",
    "selects every supported client and persists nothing else, so where the clients disagree the",
    `cell names each one — and ${code("stamity config list")} prints that same shape for whichever`,
    "clients your own manifest selects.",
    "",
    "## Keys",
    "",
    ...table(["Key", "Accepted value", "Effective when unset"], rows),
    "",
    // The one row whose stored value reaches nothing. `communicationStyle` is
    // settable, validated, persisted and carried across a migration, and no
    // emission path reads it: its only renderer, `communicationStyleDirective`
    // in src/manifest/manifest.ts, has no caller outside that module's own
    // suite. The source already says so at src/types/core.ts, which is a file
    // no operator opens — and a table row that looks exactly like the fifteen
    // rows around it is precisely how a reader concludes that setting the key
    // does something. Published here so the page states it where the decision
    // to set it is actually made. The key stays: removing it is a manifest
    // migration, not a documentation change.
    "One row is recorded but not yet consumed. `communicationStyle` is validated, persisted and",
    "carried through migrations, and no generated file reads it, so setting it changes what the",
    "manifest records rather than how any emitted file asks an agent to write.",
    "",
    "## Changing one",
    "",
    `Config edits state; it never regenerates output. Apply a change with ${code("stamity sync")}.`,
    `The verbs, their flags and the exit model are in [the CLI reference](cli-reference.md).`,
    "",
    `Regenerate this page with \`${REGENERATE_COMMAND}\`.`,
  ];

  return `${lines.join("\n")}\n`;
}

/** The shipped page: {@link renderConfigReferenceFrom} over the live registry. */
export function renderConfigReference(): string {
  return renderConfigReferenceFrom(KEY_SPECS);
}
