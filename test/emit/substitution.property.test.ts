import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  CI_PROVIDER_TOKEN,
  DETECTION_UNKNOWN,
  LINTER_TOKEN,
  MATURITY_TIER_TOKEN,
  REPO_SUBSTITUTION_TOKENS,
  TEST_FRAMEWORK_TOKEN,
  VERIFY_GATE_ALL_TOKEN,
  VERIFY_GATE_LINT_TOKEN,
  VERIFY_GATE_TEST_TOKEN,
  VERIFY_GATE_TYPECHECK_TOKEN,
  renderDetectionList,
  substituteRepoTokens,
  substituteVerificationGateTokens,
  type DetectedRepoContext,
  type VerificationGateSet,
} from "../../src/emit/substitution.ts";
import { DEFAULT_MATURITY_TIER, MATURITY_TIERS, type MaturityTier } from "../../src/types/core.ts";

/**
 * Property lane for emission-time substitution. `substitution.test.ts` pins the
 * value mapping with worked examples; this file generalises the STRUCTURAL
 * contract the module's header documents — one pass, replacement text never
 * rescanned, `$` inserted literally, unknown tokens left standing — over
 * generated documents that mix live tokens, decoy token-lookalikes and
 * arbitrary unicode prose.
 *
 * Pure and in-memory, so the house numRuns of 200 costs milliseconds.
 */

// Fixed seed: the suite must be deterministic run-to-run (CI contract). A
// counterexample replays with `fc.assert(..., { seed: 20260813, path: "<printed path>" })`.
const FC_PARAMS = { seed: 20260813, numRuns: 200 } as const;

/** The literal the module's fast path keys on; not exported, restated here as the wire format. */
const TOKEN_PREFIX = "${STAMITY:";

/**
 * Token-lookalikes that never carry the prefix, so the fast path returns the
 * document without scanning it at all.
 */
const PREFIX_FREE_DECOYS: readonly string[] = [
  "${STAMITY}",
  "${LINTER}",
  "$ {STAMITY:LINTER}",
  "{STAMITY:LINTER}",
  "${stamity:LINTER}",
  "$STAMITY:LINTER",
  "$${LINTER}",
];

/**
 * Lookalikes that DO carry the prefix, so the scan runs and must still decline
 * to replace them: an unwired-but-well-formed token (left standing so an
 * unwired token stays visible), a lower-case body outside the `[A-Z_]+`
 * grammar, an empty body, an unterminated brace, and a trailing space.
 */
const PREFIXED_DECOYS: readonly string[] = [
  "${STAMITY:UNWIRED_TOKEN}",
  "${STAMITY:linter}",
  "${STAMITY:}",
  "${STAMITY:LINTER",
  "${STAMITY:LINTER }",
];

const ALL_DECOYS: readonly string[] = [...PREFIX_FREE_DECOYS, ...PREFIXED_DECOYS];

/** Arbitrary prose that can neither contain nor complete a token. */
const proseArb = fc
  .string({ unit: "binary", maxLength: 60 })
  .filter((text) => !text.includes(TOKEN_PREFIX));

/**
 * Substitution values: printable ASCII free of the token prefix. The exclusion
 * is what makes idempotence assertable at all — a detection value that WAS a
 * live token would resolve on the second pass, which is the re-expansion the
 * single-pass design refuses within a pass (pinned separately below).
 */
const valueArb = fc
  .string({ unit: "grapheme-ascii", maxLength: 16 })
  .filter((value) => !value.includes(TOKEN_PREFIX));

const detectionListArb = fc.array(valueArb, { maxLength: 3 });

/** Shell commands whose `$` forms are exactly the ones a naive `replaceAll` would eat. */
const DOLLAR_COMMANDS: readonly string[] = [
  "pytest -k '$&'",
  "make $$ALL",
  "npm run check -- --filter=$`",
  "go test ./... # $'",
  "sh -c 'echo $0 $1'",
];

const commandArb = fc.oneof(valueArb, fc.constantFrom(...DOLLAR_COMMANDS));

const gatesArb: fc.Arbitrary<VerificationGateSet> = fc.record({
  test: commandArb,
  lint: commandArb,
  typecheck: commandArb,
  all: commandArb,
});

/**
 * A detection context, with the maturity dial present or absent. Absence is
 * spelled by omitting the key rather than assigning `undefined`, matching the
 * conditional spread in `detectionContextFromManifest` under
 * `exactOptionalPropertyTypes`.
 */
const ctxArb: fc.Arbitrary<DetectedRepoContext> = fc
  .record({
    linters: detectionListArb,
    testFrameworks: detectionListArb,
    ciProviders: detectionListArb,
    tier: fc.option(fc.constantFrom<MaturityTier>(...MATURITY_TIERS), { nil: undefined }),
  })
  .map(({ linters, testFrameworks, ciProviders, tier }) => {
    // Built by conditional ASSIGNMENT rather than conditional spread: the
    // generated shape is identical (key absent when the dial is absent, as
    // `exactOptionalPropertyTypes` demands), but an in-place assignment states
    // it without spreading inside a `map` callback (oxc/no-map-spread).
    const generated: DetectedRepoContext = { linters, testFrameworks, ciProviders };
    if (tier !== undefined) generated.maturityTier = tier;
    return generated;
  });

/**
 * Document segments: prose, live tokens, decoys. Segments are joined with a
 * newline so no token can form across a boundary — a `}` opening one segment
 * cannot complete a `${STAMITY:LINTER` ending the previous one.
 */
const segmentArb = fc.oneof(
  { arbitrary: proseArb, weight: 3 },
  { arbitrary: fc.constantFrom(...REPO_SUBSTITUTION_TOKENS), weight: 3 },
  { arbitrary: fc.constantFrom(...ALL_DECOYS), weight: 2 },
);

const segmentsArb = fc.array(segmentArb, { maxLength: 12 });

/** Segments that cannot even reach the scan — the identity property's input. */
const tokenFreeSegmentsArb = fc.array(
  fc.oneof(proseArb, fc.constantFrom(...PREFIX_FREE_DECOYS)),
  { maxLength: 12 },
);

const join = (segments: readonly string[]): string => segments.join("\n");

/** Both passes, in emission order. */
const render = (
  document: string,
  ctx: DetectedRepoContext,
  gates: VerificationGateSet,
): string => substituteVerificationGateTokens(substituteRepoTokens(document, ctx), gates);

/**
 * What each live token must resolve to, composed from the module's own public
 * helpers rather than restating its internals. Every entry on the published
 * wire-format list must appear here — asserted below, so a token added to
 * `REPO_SUBSTITUTION_TOKENS` and wired into neither pass fails the suite.
 */
function expectedValues(
  ctx: DetectedRepoContext,
  gates: VerificationGateSet,
): ReadonlyMap<string, string> {
  return new Map<string, string>([
    [LINTER_TOKEN, renderDetectionList(ctx.linters)],
    [TEST_FRAMEWORK_TOKEN, renderDetectionList(ctx.testFrameworks)],
    [CI_PROVIDER_TOKEN, renderDetectionList(ctx.ciProviders)],
    [MATURITY_TIER_TOKEN, ctx.maturityTier ?? DEFAULT_MATURITY_TIER],
    [VERIFY_GATE_TEST_TOKEN, gates.test],
    [VERIFY_GATE_LINT_TOKEN, gates.lint],
    [VERIFY_GATE_TYPECHECK_TOKEN, gates.typecheck],
    [VERIFY_GATE_ALL_TOKEN, gates.all],
  ]);
}

describe("substitution — generator coverage", () => {
  /**
   * Guards the property space itself. Every property below is universally
   * quantified, so a generator that stopped emitting live tokens — or dropped
   * one decoy class — would keep all of them passing while asserting nothing.
   * Sampling the exact seed and run budget the properties use turns that
   * degeneration into a failure here rather than a silent hole there.
   */
  it("emits every live token and every decoy across the pinned run budget", () => {
    const samples = fc.sample(segmentsArb, FC_PARAMS);
    const seen = new Set(samples.flat());
    for (const token of REPO_SUBSTITUTION_TOKENS) expect(seen.has(token), token).toBe(true);
    for (const decoy of ALL_DECOYS) expect(seen.has(decoy), decoy).toBe(true);

    // A majority of documents carry at least one live token, so the
    // segment-exact property is exercising substitution rather than identity.
    const substantive = samples.filter((segments) =>
      segments.some((segment) => REPO_SUBSTITUTION_TOKENS.includes(segment)),
    );
    expect(substantive.length).toBeGreaterThan(samples.length / 2);
  });
});

describe("substitution — identity on token-free content", () => {
  it("returns any document without the token prefix byte-identical, from both entry points", () => {
    fc.assert(
      fc.property(tokenFreeSegmentsArb, ctxArb, gatesArb, (segments, ctx, gates) => {
        const document = join(segments);
        expect(substituteRepoTokens(document, ctx)).toBe(document);
        expect(substituteVerificationGateTokens(document, gates)).toBe(document);
        expect(render(document, ctx, gates)).toBe(document);
      }),
      FC_PARAMS,
    );
  });
});

describe("substitution — segment-exact rendering", () => {
  it("replaces exactly the live tokens and leaves every other segment verbatim", () => {
    fc.assert(
      fc.property(segmentsArb, ctxArb, gatesArb, (segments, ctx, gates) => {
        const values = expectedValues(ctx, gates);
        const expected = join(segments.map((segment) => values.get(segment) ?? segment));
        expect(render(join(segments), ctx, gates)).toBe(expected);
      }),
      FC_PARAMS,
    );
  });

  it("leaves every decoy standing, including the well-formed but unwired token", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_DECOYS),
        segmentsArb,
        ctxArb,
        gatesArb,
        (decoy, segments, ctx, gates) => {
          const output = render(join([decoy, ...segments, decoy]), ctx, gates);
          expect(output.startsWith(decoy)).toBe(true);
          expect(output.endsWith(decoy)).toBe(true);
        },
      ),
      FC_PARAMS,
    );
  });
});

describe("substitution — no live token survives a full render", () => {
  it("resolves every token on the published wire-format list", () => {
    fc.assert(
      fc.property(segmentsArb, ctxArb, gatesArb, (segments, ctx, gates) => {
        const values = expectedValues(ctx, gates);
        // Wiring guard: a token published on the wire-format list but resolved
        // by neither pass would leak into generated content as a broken
        // template variable.
        for (const token of REPO_SUBSTITUTION_TOKENS) expect(values.has(token)).toBe(true);

        const output = render(join([...REPO_SUBSTITUTION_TOKENS, ...segments]), ctx, gates);
        for (const token of REPO_SUBSTITUTION_TOKENS) expect(output).not.toContain(token);
      }),
      FC_PARAMS,
    );
  });
});

describe("substitution — idempotence", () => {
  it("re-rendering a rendered document changes nothing", () => {
    fc.assert(
      fc.property(segmentsArb, ctxArb, gatesArb, (segments, ctx, gates) => {
        const once = render(join(segments), ctx, gates);
        expect(render(once, ctx, gates)).toBe(once);
      }),
      FC_PARAMS,
    );
  });

  it("holds per pass as well as for the pair", () => {
    fc.assert(
      fc.property(segmentsArb, ctxArb, gatesArb, (segments, ctx, gates) => {
        const document = join(segments);
        const repo = substituteRepoTokens(document, ctx);
        expect(substituteRepoTokens(repo, ctx)).toBe(repo);
        const gate = substituteVerificationGateTokens(document, gates);
        expect(substituteVerificationGateTokens(gate, gates)).toBe(gate);
      }),
      FC_PARAMS,
    );
  });
});

describe("substitution — determinism", () => {
  it("is a function of its inputs alone across repeats and structurally equal contexts", () => {
    fc.assert(
      fc.property(segmentsArb, ctxArb, gatesArb, (segments, ctx, gates) => {
        const document = join(segments);
        const first = render(document, ctx, gates);
        expect(render(document, ctx, gates)).toBe(first);
        // Fresh objects carrying the same values: no identity-keyed caching, no
        // mutation of the caller's arrays between calls.
        const clonedCtx: DetectedRepoContext = {
          linters: [...ctx.linters],
          testFrameworks: [...ctx.testFrameworks],
          ciProviders: [...ctx.ciProviders],
          ...(ctx.maturityTier === undefined ? {} : { maturityTier: ctx.maturityTier }),
        };
        expect(render(document, clonedCtx, { ...gates })).toBe(first);
        expect(ctx.linters).toEqual(clonedCtx.linters);
      }),
      FC_PARAMS,
    );
  });
});

describe("substitution — one pass, replacement text never rescanned", () => {
  it("emits a value that is itself a live token verbatim", () => {
    fc.assert(
      fc.property(fc.constantFrom(...REPO_SUBSTITUTION_TOKENS), gatesArb, (target, gates) => {
        // A repo whose linter is literally named after another token: the value
        // is inserted, never re-expanded by a later round.
        const ctx: DetectedRepoContext = {
          linters: [target],
          testFrameworks: ["vitest"],
          ciProviders: ["github-actions"],
        };
        expect(substituteRepoTokens(LINTER_TOKEN, ctx)).toBe(target);
        // The gate pass is a separate call, so a gate token DOES resolve there —
        // the guarantee is single-pass, not permanent immunity.
        const gateValues = new Map<string, string>([
          [VERIFY_GATE_TEST_TOKEN, gates.test],
          [VERIFY_GATE_LINT_TOKEN, gates.lint],
          [VERIFY_GATE_TYPECHECK_TOKEN, gates.typecheck],
          [VERIFY_GATE_ALL_TOKEN, gates.all],
        ]);
        expect(substituteVerificationGateTokens(target, gates)).toBe(
          gateValues.get(target) ?? target,
        );
      }),
      FC_PARAMS,
    );
  });

  it("inserts `$&`, `$$`, backtick and `$'` replacement patterns literally", () => {
    fc.assert(
      fc.property(gatesArb, proseArb, (gates, prose) => {
        const document = join([prose, VERIFY_GATE_TEST_TOKEN, VERIFY_GATE_ALL_TOKEN]);
        expect(substituteVerificationGateTokens(document, gates)).toBe(
          join([prose, gates.test, gates.all]),
        );
      }),
      FC_PARAMS,
    );
  });
});

describe("substitution — pass independence", () => {
  it("each pass leaves the other family's tokens standing and the two commute", () => {
    fc.assert(
      fc.property(segmentsArb, ctxArb, gatesArb, (segments, ctx, gates) => {
        const document = join(segments);
        const gateTokens = [
          VERIFY_GATE_TEST_TOKEN,
          VERIFY_GATE_LINT_TOKEN,
          VERIFY_GATE_TYPECHECK_TOKEN,
          VERIFY_GATE_ALL_TOKEN,
        ];
        const repoTokens = [
          LINTER_TOKEN,
          TEST_FRAMEWORK_TOKEN,
          CI_PROVIDER_TOKEN,
          MATURITY_TIER_TOKEN,
        ];
        const seeded = join([...gateTokens, ...repoTokens, document]);

        const afterRepo = substituteRepoTokens(seeded, ctx);
        for (const token of gateTokens) expect(afterRepo).toContain(token);
        const afterGates = substituteVerificationGateTokens(seeded, gates);
        for (const token of repoTokens) expect(afterGates).toContain(token);

        // Either order composes to the same bytes.
        expect(substituteVerificationGateTokens(afterRepo, gates)).toBe(
          substituteRepoTokens(afterGates, ctx),
        );
      }),
      FC_PARAMS,
    );
  });
});

describe("renderDetectionList", () => {
  /**
   * `unknown` is excluded from the generated values on purpose: the sentinel is
   * a bare word, so a repo that genuinely detects a tool named `unknown` is
   * indistinguishable from a repo that detected nothing. The iff below is
   * asserted over the space where that ambiguity cannot arise.
   *
   * Commas are excluded for the same reason on the separator axis: `", "` is
   * the join separator, so an entry containing one is indistinguishable from
   * two entries once rendered.
   */
  const entryArb = fc
    .string({ unit: "grapheme-ascii", maxLength: 10 })
    .filter((value) => value.trim() !== DETECTION_UNKNOWN && !value.includes(","));

  it("renders the sentinel exactly when nothing usable is left", () => {
    fc.assert(
      fc.property(fc.option(fc.array(entryArb, { maxLength: 5 }), { nil: undefined }), (values) => {
        const nothingUsable = values === undefined || values.every((v) => v.trim() === "");
        expect(renderDetectionList(values) === DETECTION_UNKNOWN).toBe(nothingUsable);
      }),
      FC_PARAMS,
    );
  });

  it("keeps every usable entry, trimmed, in order, with no empty comma slot", () => {
    fc.assert(
      fc.property(fc.array(entryArb, { maxLength: 5 }), (values) => {
        const usable = values.map((value) => value.trim()).filter((value) => value.length > 0);
        fc.pre(usable.length > 0);
        const rendered = renderDetectionList(values);
        expect(rendered.split(", ")).toEqual(usable);
        expect(rendered.startsWith(", ")).toBe(false);
        expect(rendered.endsWith(", ")).toBe(false);
      }),
      FC_PARAMS,
    );
  });

  it("is stable under repeated rendering of its own output for single entries", () => {
    fc.assert(
      fc.property(entryArb, (value) => {
        fc.pre(value.trim().length > 0);
        const rendered = renderDetectionList([value]);
        expect(renderDetectionList([rendered])).toBe(rendered);
      }),
      FC_PARAMS,
    );
  });
});
