---
id: ai-evals
type: rule
description: Floor for shipping a feature whose behaviour comes from a language model — a golden and adversarial eval set before ship, a regression run on every prompt or model change, offline measurement before traffic, and results committed as artifacts.
tags: [ai]
load: on-demand
obsolete_when: model providers ship per-feature regression measurement that gates deploys without a project-owned eval set
scope: agent-requested
---

# AI Evals

Applies to any feature whose output is produced by a language model. Model
output is not deterministic, so a diff review does not establish behaviour and
"it looked right in the console" is not evidence. Measurement is the only signal
that survives a prompt edit.

## Floor

1. **The eval set exists before the feature ships.** Two case classes, both
   required. *Golden* cases pin the behaviour the feature promises. *Adversarial*
   cases pin the failure modes it guards against — a refusal it should hold, an
   input that invites it off task, content it reads but did not author, an empty
   or malformed retrieval result.
2. **Cases are versioned in-repo artifacts.** The set lives beside the feature
   with a version in its name, and expected outputs change through a reviewed
   diff that states why the expectation moved. Overwriting a case in place
   erases the regression it encoded.
3. **Everything that shapes the output is a versioned input.** Prompt text,
   model identifier, decoding settings, tool schemas, and the retrieval corpus.
   Changing any one of them re-runs the set: a prompt edit is a behaviour
   change, and a model swap is a rewrite of every case at once.
4. **Thresholds are declared before the run.** One per metric, recorded next to
   the set. A threshold picked after the score is known measures nothing but the
   author's tolerance.
5. **Offline before online.** A change clears the set before traffic reaches it.
   A staged rollout then measures what offline cannot — real inputs, latency,
   spend — and confirms the result; it never stands in for the set.
6. **The judge is an instrument, not a participant.** When a model grades
   output, it is not the model under test, its rubric is written down, and it is
   calibrated against a human-labelled sample before its scores gate anything.
   Pairwise comparisons score both orders and average, because position
   preference alone can flip a verdict.
7. **Match the metric to the task class.** Classification: accuracy plus
   per-class precision and recall. Open-ended generation: rubric score against
   the written rubric. Retrieval-grounded answers: groundedness plus citation
   precision, each claim traced to the span that supports it. Refusal behaviour:
   refusal rate on prohibited inputs tracked separately from false refusals on
   benign ones.
8. **Results are artifacts, not chat.** A run records the set version, the
   versioned inputs from item 3, the per-metric scores, and the threshold each
   was measured against, committed with the change that caused the run.

## Gates

- A feature whose output comes from a model, with no eval set in the repository,
  is not done. The set ships in the same change as the feature.
- Every behaviour the feature claims to users or docs maps to at least one
  golden case, and every guardrail it claims maps to at least one adversarial
  case. A claim with no case is unmeasured, so either a case lands or the claim
  goes.
- A change touching prompts, model selection, decoding settings, tool schemas,
  or retrieval re-runs the set and carries the result artifact.
- A metric under its declared threshold fails the change the way a red test
  does. Advisory eval output trains everyone to scroll past it.
- Scores report the run count and decoding settings alongside the number. One
  sample from a sampling model is an anecdote with a decimal point.
- Adversarial cases are re-run on every model change, not only on prompt
  changes: guardrail behaviour is a property of the pair, not of the prompt.
