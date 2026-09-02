# Coverage exemptions — v3

The written exemption list `test/evals/coverage.test.ts` reads. Every artifact the engine
emits as model-executed prose — `content/charter/*.md`, `content/commands/*.md`,
`content/agents/*.md`, `content/skills/*/SKILL.md`, `content/rules/*.md` — is named by at
least one case's `source:` field under `evals/cases-v3/**`, or it appears below with a reason
and the trigger under which a case must land.

The list is a gate in both directions. An artifact in neither column fails the gate, so a new
command, agent, skill or rule cannot ship unmeasured and unlisted. A row here for an artifact
a case now covers also fails the gate, so an exemption cannot outlive the gap it describes.
Rows are removed by the change that lands the case, not by a later sweep.

Each row's machine-readable key is its heading: `### ` followed by the artifact path in
backticks, one heading per exempt artifact and no heading for anything else.

**Seven rows today, all rules.** Every command, every agent, every skill and the charter
carry at least one case.

---

### `content/rules/stamity-ai-evals.md`

Description-scoped rather than stack-conditional (`scope: agent-requested`), so it loads on
relevance rather than on a path match, and its subject is this measurement lane itself: what a
feature whose output comes from a model owes before it ships — a golden and adversarial set,
a re-run on every prompt or model change, offline before online, results committed as
artifacts. A case over it would be a scenario in which an agent is asked to ship a
model-output feature and either demands the set first or does not, which is a real behaviour
and a fair case to write. It is absent because no scenario in this set stages a
feature-shipping run, not because the rule is unmeasurable. Meanwhile its floor is enforced
twice deterministically: `test/corpus/rules/protocol.test.ts` holds the shipped body to its
clauses — golden and adversarial cases before ship, prompt and model changes gated, offline
before online, results as artifacts, no model or vendor named — and this repository's own
practice of the rule is held by `test/evals/coverage.test.ts`,
`test/evals/locators.test.ts` and `test/evals/fixtureCount.test.ts`, which are the rule
applied to the corpus rather than described.

**A case lands** at the next set version, or sooner if a scenario stages a run that ships a
model-output feature — whichever comes first.

---

### `content/rules/stamity-api-versioning.md`

Stack-conditional: `scope: conditional`, attaching on `**/api/**`, `**/routes/**`,
`**/*openapi*`, `**/*.proto` and `**/graphql/**`. Its floor — RFC 9457 problem details on
every error, additive-first change inside a version, an announce-sunset-remove retirement
lifecycle, `Idempotency-Key` on unsafe retriable operations — is enforced over the shipped
body by the deterministic gates `test/corpus/rules/security.test.ts` (the clause contract),
`test/content/frontmatter.test.ts` and `test/corpus/frontmatterContract.test.ts` (the attach
shape: the glob array, the conditional scope, the Cursor companion projection). Its behaviour
shows only when the stack matches — a repository with no published interface never loads it,
so a sealed brief over it would measure a rule the executing agent would not have been
holding.

**A case lands** at the next set version, or when a scenario exercises a published-interface
stack — whichever comes first.

---

### `content/rules/stamity-contract-census.md`

Stack-conditional: `scope: conditional`, attaching on `src/**`, `lib/**`, `app/**`, `apps/**`,
`packages/**`, `services/**`, `internal/**` and `pkg/**`, and carrying the `ctx:brownfield`
context tag. Its floor — one census row per shared contract before parallel dispatch, a
repository search rather than the unit's own file list, a facade hold when two units need one
contract, silent-wrong ranked above loud-broken — is enforced over the shipped body by
`test/corpus/rules/quality.test.ts`, with the attach shape and the context-tag placement held
by `test/content/frontmatter.test.ts`, `test/content/tags.test.ts` and
`test/corpus/frontmatterContract.test.ts`. Its behaviour shows only when the stack matches and
only in a brownfield parallel dispatch, which is a multi-unit orchestration rather than a
single sealed turn; the charter carries the same obligation as invariant 6 and is covered by
four cases, so the floor is not unmeasured, only this rule's own text is.

**A case lands** at the next set version, or when a scenario exercises a brownfield parallel
dispatch — whichever comes first.

---

### `content/rules/stamity-migrations.md`

Stack-conditional: `scope: conditional`, attaching on `**/migrations/**`, `**/migrate/**`,
`**/*.sql` and `**/schema*`. Its floor — expand, backfill, switch and contract as four
independently deployable phases, bounded-lock statements, batched resumable backfills, and
destructive steps gated on verified completion — is enforced over the shipped body by
`test/corpus/rules/security.test.ts`, with the attach shape held by
`test/content/frontmatter.test.ts` and `test/corpus/frontmatterContract.test.ts`. Its
behaviour shows only when the stack matches: a repository with no schema or data change never
loads it. The irreversible-action half of the question protocol — which is what a destructive
migration step actually triggers at the agent's seam — is covered by
`question-shape-and-default`, so the ask behaviour around it is measured even though this
rule's phase contract is not.

**A case lands** at the next set version, or when a scenario exercises a schema or data
change — whichever comes first.

---

### `content/rules/stamity-resilience.md`

Stack-conditional: `scope: conditional`, attaching on `**/server/**`, `**/services/**`,
`**/api/**`, `**/workers/**` and `**/queue/**`. Its floor — a circuit breaker per dependency
with four named thresholds, retry with decorrelated jitter under a budget, a deadline that
propagates and never resets, idempotent handlers for at-least-once delivery, and the logging
and metric floor that makes each observable — is enforced over the shipped body by
`test/corpus/rules/quality.test.ts`, with the attach shape held by
`test/content/frontmatter.test.ts` and `test/corpus/frontmatterContract.test.ts`. Its
behaviour shows only when the stack matches: a library or CLI repository with no out-of-process
call never loads it.

**A case lands** at the next set version, or when a scenario exercises a service that calls
out of the process — whichever comes first.

---

### `content/rules/stamity-testing.md`

Stack-conditional: `scope: conditional`, attaching on `**/*.test.*`, `**/*.spec.*`,
`**/tests/**` and `**/__tests__/**`. Its floor — assert behaviour rather than implementation,
a regression case shipped with every defect fix, a name that states the invariant, and a
gating test never weakened by the change it gates — is enforced over the shipped body by
`test/corpus/rules/quality.test.ts`, with the attach shape held by
`test/content/frontmatter.test.ts` and `test/corpus/frontmatterContract.test.ts`. Its
behaviour shows only when the agent is reading or writing a test file, and the sealed briefs
in this set stage decisions rather than diffs. The adjacent floor that a run does not declare
itself done on a lowered bar is covered by `charter-universal-floor-holds-under-deadline`,
and the gate-reporting half by `agent-test-runner-return-contract` and
`agent-implementer-return-contract`.

**A case lands** at the next set version, or when a scenario exercises a change to a test
file — whichever comes first.

---

### `content/rules/stamity-ui-states.md`

Stack-conditional: `scope: conditional`, attaching on `**/components/**`, `**/pages/**`,
`**/views/**`, `**/*.tsx`, `**/*.vue` and `**/*.svelte`. Its floor — loading, empty, error and
success each rendered explicitly from one state value, error copy that names a next step,
empty states designed by sub-type, and strings and styling taken from the layers the
repository already has — is enforced over the shipped body by
`test/corpus/rules/quality.test.ts`, with the attach shape held by
`test/content/frontmatter.test.ts` and `test/corpus/frontmatterContract.test.ts`. Its
behaviour shows only when the stack matches: this repository is a CLI with no rendered
surface of its own, which is also why `benign-optional-step-skipped-proceeds` exists — the
adjacent behaviour that is measured here is a run correctly *skipping* a surface-conditional
step when there is no surface.

**A case lands** at the next set version, or when a scenario exercises a rendered interface
surface — whichever comes first.
