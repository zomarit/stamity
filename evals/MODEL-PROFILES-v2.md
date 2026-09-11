# Eval model profiles v2

This extends `SET-v5.md` with explicit model choices. The machine-readable source is
[`model-profiles-v2.json`](model-profiles-v2.json), committed at the run's repository sha.
The case roster, sealed briefs, expected criteria and thresholds remain those of `SET-v5`.
No profile starts a model call or changes Stamity's product-level `models.pins` settings.

| Profile | Model under test | Judge | Rubric |
|---|---|---|---|
| `claude` (default) | `claude-opus-5` | `claude-fable-5-1` | `rubric-v4.md` |
| `codex-astra` | `gpt-6-astra` | `gpt-5.6-sol` | `rubric-v6.md` |
| `codex-astra-judge` | `gpt-5.6-sol` | `gpt-6-astra` | `rubric-v5.md` |

Ask the runner to **run the full eval set with profile `codex-astra`** to measure Astra,
or select `codex-astra-judge` to have Astra grade Sol. With no profile named, `claude`
remains the default. A Codex session does not silently select a Codex profile: the harness
checks the selected profile's availability before spending calls. Both Codex roles declare
`high` reasoning effort. A null effort on the Claude profile means the harness default;
it does not claim a controllable or known effort value.

## Selection and isolation

Resolve one whole named profile before reading its rubric or dispatching any role. An
unknown profile, unavailable exact model or effort setting, or identical scenario and judge
model blocks the run with the unmet requirement named. A context-window suffix does not
make one model two different models. Never use a tier alias, change one role ad hoc, or fall
back to another profile. New pairs are declared in a reviewed profile document before a run.
The legacy scenario's reported `claude-opus-5[1m]` is the one accepted reporting variant of
`claude-opus-5`, preserving the existing run contract; record the suffix verbatim. No other
suffix or substitution is implicitly accepted. Codex model reports must match the selected
exact ID, including `gpt-6-astra` or `gpt-5.6-sol`, without normalization.

Each case/sample uses a fresh scenario context with no inherited conversation, previous case,
Expected block, rubric or answer labels. Native Codex agents use `fork_turns: "none"` and the
profile's explicit `model` and `reasoning_effort`; a follow-up is not fresh context. Native
dispatch additionally needs inspectable evidence that no ambient messages were injected,
unless the operator prospectively selected `session-native-v2.md` and its disclosed
ambient-context exception. The optional `scripts/eval-run.mjs` harness retains the v1
profile/rubric configuration for stateless Responses API calls with the same model pair
and effort: one exact Brief or four exact judge content blocks,
no instructions, conversation or previous response, and tools removed. This transport is a
new harness/isolation baseline; its results never inherit native calibration or scores.
The scenario prompt contains only the sealed Brief. The manual script appends no attestation
request and records attestation as unavailable. Do not prepend this profile document or
model-role instructions to the Brief.
Model and reasoning selection belong to the dispatch controls, not the sealed prompt.

The profiles declare tool-free scenarios, as `SET-v5` already does. If the harness can
remove tools and repository access, do so. If it exposes them despite the sealed Brief's
instruction to use none, record that as instruction-only isolation and inspect the tool
trace. Any scenario tool use or extra repository/context read invalidates that sample;
the selected native protocol stops the run and does not retry it. If fresh input isolation
or the tool trace cannot be established,
stop without scoring. Never describe tools as disabled when the harness only prohibits
their use through instructions. Record harness-enforced and instruction-only isolation
separately; measurements with different isolation controls are separate baselines.

Judges are separate fresh agents and receive only the selected rubric's grading core
(above `## Calibration protocol`), the case Brief, Expected and transcript. Calibration
labels and the rubric's calibration section are withheld on every call. If helper agents
load inputs, pin them to the selected scenario model/effort, record that role, and keep their
context separate from scenarios and judges. A loader's access to files never authorizes a
scenario to read them.

## Calibration and evidence

This prospective document changes only `codex-astra`'s rubric selection to `rubric-v6.md`.
The selected models/effort, `claude` default, set, and unselected `claude` and
`codex-astra-judge` profiles are unchanged. v1 documents and all historical results remain.
The v6 grading procedure, fixture transcripts and original Brief/Expected blocks are held;
its complete explicit keys correct C3 B1 prospectively, with the reason and honest label
provenance below its calibration boundary. No scoring criterion, grouping, floor or bar
moves. Profile availability and deterministic tests do not establish a calibration pass.

Calibrate the selected judge against every fixture in the selected rubric before scoring.
A calibration belongs to the exact judge model, effort, rubric bytes, harness and isolation
controls that produced it. Do not reuse calibration from another profile or configuration.
Changing the scenario model re-runs every adversarial case; a release still runs all cases.
Adding a profile does not claim that these live measurement gates have passed.

The run artifact records this profile version and JSON path/hash, the selected profile,
requested and resolved model IDs for every role, requested and effective reasoning effort,
decoding settings (or the precise controls not exposed), harness/version, isolation controls,
case/retrieval/tool inputs and the selected rubric path/hash. Record provider/harness model
metadata and agent attestation separately; attestation alone is a claim, not independent
proof. A reported model mismatch is discarded and retried under the runner's retry policy;
if the exact pin cannot be established, report the gap rather than passing the run.

Keep results and advisory-repeat tracking separate by the full model/rubric/harness/input
configuration. A new profile starts a new baseline; cross-profile numbers may be shown as
separate measurements, never pooled or presented as a regression against the Claude run.

Current-case selection is v5. Retained rubric calibration witnesses still resolve
against cases-v4, keeping their original Brief/Expected inputs intact. v6's prospective
key is separate from the unchanged v4/v5 keys; run 13 remains terminal with its original
valid disagreement, invalid attempts and zero scenario samples.

An explicitly authorized ambient-context run selects `session-native-v2.md`, which keeps
the disclosed `stamity-session-native-v1` baseline and empty wrapper. The new protocol/profile
and rubric hashes form a new configuration within it; do not pool configurations. The
optional stateless API script remains on model-profiles-v1 and does not select this v2
native configuration. No API credential is required for native evaluation.
