/**
 * Emission-time token substitution.
 *
 * Canonical content keeps literal `${STAMITY:*}` tokens on disk and resolves
 * them on the way out to an adapter's output, never in place. That ordering is
 * what makes one corpus portable: the same source renders `run eslint` in a
 * JS repo and `run ruff` in a Python one, a repo that switches linters gets a
 * fresh setup from a plain regeneration, and the on-disk corpus stays
 * byte-identical across every project so drift detection compares like with
 * like.
 *
 * Two token families, two entry points, because they resolve from different
 * inputs: repo facts — detection lists plus the maturity dial — come off the
 * persisted manifest ({@link substituteRepoTokens}), while verification-gate
 * commands are resolved upstream from the project's language and package
 * manager and arrive here already computed
 * ({@link substituteVerificationGateTokens}).
 *
 * Unresolved values never leave a raw token in the output — an empty
 * detection list renders {@link DETECTION_UNKNOWN}, which generated content
 * can branch on, whereas a leaked `${STAMITY:LINTER}` would reach the runtime
 * agent as a broken template variable.
 */

import { DEFAULT_MATURITY_TIER, type MaturityTier } from "../types/core.ts";
import type { SetupManifest } from "../types/manifest.ts";

/**
 * Rendered in place of a detection list that resolved to nothing. Lower-case
 * and human-readable on purpose: it lands inside generated prose, and content
 * is written to branch on the literal word.
 */
export const DETECTION_UNKNOWN = "unknown";

/** Resolves to the project's detected linter(s). */
export const LINTER_TOKEN = "${STAMITY:LINTER}";

/** Resolves to the project's detected test framework(s). */
export const TEST_FRAMEWORK_TOKEN = "${STAMITY:TEST_FRAMEWORK}";

/** Resolves to the project's detected CI provider(s). */
export const CI_PROVIDER_TOKEN = "${STAMITY:CI_PROVIDER}";

/**
 * Resolves to the manifest's maturity tier. Not a detection fact but a
 * manifest dial ({@link SetupManifest.maturityTier}): the tier is live
 * configuration — `stamity config` changes it after init — so hard-coding a
 * tier into a template would misreport every repo that turned the dial. It
 * rides the same repo-facts pass as the detection tokens because both resolve
 * off the persisted manifest; absence renders {@link DEFAULT_MATURITY_TIER},
 * never the unknown sentinel, since the dial always has an effective value.
 */
export const MATURITY_TIER_TOKEN = "${STAMITY:MATURITY_TIER}";

/**
 * Verification-gate tokens. Generated agents that hard-code `npm run test`
 * fail open on a non-JS project — the command does not exist, the agent sees
 * no output and continues — so the gate commands are carried as tokens and
 * resolved per project instead.
 */
export const VERIFY_GATE_TEST_TOKEN = "${STAMITY:VERIFY_GATE_TEST}";
export const VERIFY_GATE_LINT_TOKEN = "${STAMITY:VERIFY_GATE_LINT}";
export const VERIFY_GATE_TYPECHECK_TOKEN = "${STAMITY:VERIFY_GATE_TYPECHECK}";
export const VERIFY_GATE_ALL_TOKEN = "${STAMITY:VERIFY_GATE_ALL}";

/**
 * Every token the emission layer resolves. Validators and content-authoring
 * gates read the wire format from here rather than restating the literals; a
 * token absent from this list is unwired by definition.
 */
export const REPO_SUBSTITUTION_TOKENS: readonly string[] = [
  LINTER_TOKEN,
  TEST_FRAMEWORK_TOKEN,
  CI_PROVIDER_TOKEN,
  MATURITY_TIER_TOKEN,
  VERIFY_GATE_TEST_TOKEN,
  VERIFY_GATE_LINT_TOKEN,
  VERIFY_GATE_TYPECHECK_TOKEN,
  VERIFY_GATE_ALL_TOKEN,
];

/** Detection facts that feed {@link substituteRepoTokens}. */
export interface DetectedRepoContext {
  linters: string[];
  testFrameworks: string[];
  ciProviders: string[];
  /**
   * Manifest maturity dial, carried alongside the detection facts because it
   * resolves in the same pass (see {@link MATURITY_TIER_TOKEN}). Optional so
   * every pre-existing context literal stays valid; absence renders
   * {@link DEFAULT_MATURITY_TIER}.
   */
  maturityTier?: MaturityTier;
}

/** Resolved verification commands that feed {@link substituteVerificationGateTokens}. */
export interface VerificationGateSet {
  test: string;
  lint: string;
  typecheck: string;
  all: string;
}

const TOKEN_PREFIX = "${STAMITY:";

/** Matches any well-formed token, including ones this build does not know. */
const TOKEN_PATTERN = /\$\{STAMITY:[A-Z_]+\}/g;

/**
 * Replace known tokens in one pass.
 *
 * Two properties the obvious implementations lack, both load-bearing:
 *
 * 1. **Replacement text is never rescanned.** Detection values are read off
 *    the repository, so a value that happens to look like another token would,
 *    under sequential per-token replacement, be substituted again by a later
 *    round. One pass makes the output a function of the input alone.
 * 2. **`$` in a replacement is literal.** `String.prototype.replaceAll` with a
 *    string replacement still expands `$&`, `` $` ``, `$'` and `$$`, which
 *    would corrupt a shell command like `pytest -k '$&'`. A replacer function
 *    is inserted verbatim, with no substitution pattern applied.
 *
 * An unknown token is left standing rather than blanked: emitting the literal
 * makes an unwired token visible, while silently deleting it would not.
 */
function substituteTokens(content: string, values: ReadonlyMap<string, string>): string {
  if (!content.includes(TOKEN_PREFIX)) return content;
  return content.replace(TOKEN_PATTERN, (token) => values.get(token) ?? token);
}

/**
 * Render a detection list as one substitution value: a bare value for a single
 * detection, a comma-separated list for several, {@link DETECTION_UNKNOWN}
 * when nothing usable is left. Blank entries are dropped first, so a
 * malformed `[""]` still renders the sentinel instead of collapsing the
 * sentence around it into an empty gap.
 */
export function renderDetectionList(values: readonly string[] | undefined): string {
  if (!values) return DETECTION_UNKNOWN;
  const named = values.map((value) => value.trim()).filter((value) => value.length > 0);
  return named.length === 0 ? DETECTION_UNKNOWN : named.join(", ");
}

/**
 * The detection context a manifest carries. A manifest written before
 * detection ran, or one hand-edited to drop the block, yields empty lists —
 * which render as {@link DETECTION_UNKNOWN} rather than failing emission over
 * a missing optional field. Lists are copied so a caller cannot mutate
 * persisted manifest state through the returned context.
 */
export function detectionContextFromManifest(manifest: SetupManifest): DetectedRepoContext {
  const detected = manifest.detected;
  return {
    linters: detected ? [...detected.linters] : [],
    testFrameworks: detected ? [...detected.testFrameworks] : [],
    ciProviders: detected ? [...detected.ciProviders] : [],
    // Conditional spread, not `maturityTier: manifest.maturityTier`: under
    // exactOptionalPropertyTypes an explicit `undefined` is not assignable to
    // the optional field, and an absent dial should leave the context shaped
    // exactly as before the field existed.
    ...(manifest.maturityTier === undefined ? {} : { maturityTier: manifest.maturityTier }),
  };
}

/**
 * Resolve the detection tokens in `content`. Idempotent — a body carrying no
 * token is returned unchanged, and a resolved body has none left to resolve.
 */
export function substituteRepoTokens(content: string, ctx: DetectedRepoContext): string {
  return substituteTokens(
    content,
    new Map([
      [LINTER_TOKEN, renderDetectionList(ctx.linters)],
      [TEST_FRAMEWORK_TOKEN, renderDetectionList(ctx.testFrameworks)],
      [CI_PROVIDER_TOKEN, renderDetectionList(ctx.ciProviders)],
      [MATURITY_TIER_TOKEN, ctx.maturityTier ?? DEFAULT_MATURITY_TIER],
    ]),
  );
}

/**
 * Resolve the verification-gate tokens in `content`. Gate commands are shell
 * strings and routinely contain `$`; they are inserted verbatim (see
 * {@link substituteTokens}). Detection tokens are left untouched here, and
 * vice versa, so the two passes compose in either order.
 */
export function substituteVerificationGateTokens(
  content: string,
  gates: VerificationGateSet,
): string {
  return substituteTokens(
    content,
    new Map([
      [VERIFY_GATE_TEST_TOKEN, gates.test],
      [VERIFY_GATE_LINT_TOKEN, gates.lint],
      [VERIFY_GATE_TYPECHECK_TOKEN, gates.typecheck],
      [VERIFY_GATE_ALL_TOKEN, gates.all],
    ]),
  );
}
