---
id: incident-response
type: skill
description: "Executes the on-call runbook for an open production event — severity table, telemetry reading, upstream and downstream topology capture, mitigation verification, and the blameless post-mortem template. Triggers when an incident is open and unstabilized, when a severity call rests on confirmed impact, or when a post-mortem follows recovery."
tags: [devops]
load: on-demand
obsolete_when: on-call tooling derives severity, topology, and post-mortem structure from live telemetry without a written runbook
---

# Incident response

The runbook an open incident runs on. Stabilize, verify, then explain — a
permanent fix authored mid-incident extends the incident.

## Quick Start

1. Read telemetry before naming a severity (Step 1).
2. Map what the failing component talks to (Step 2).
3. Classify severity from confirmed impact (Step 3).
4. Mitigate reversibly and verify against telemetry (Step 4).
5. Write the blameless post-mortem and file follow-ups (Step 5).

An unconfirmed blast radius rounds severity up. Downgrade only on evidence.

## Step 1 — Read the signal

Read the project's own observability stack; assume no vendor. Each class
answers a different question, and a missing class is an action item rather than
an assumption:

| Class | What it answers |
|---|---|
| Traces | which hop in the request path is failing, with latency percentiles per span |
| Metrics | request rate, error ratio, and duration per route; utilization and saturation per resource |
| Logs | the structured error with its correlation id, service, version, and environment |
| Error tracking | grouped exceptions with release and environment tags — first-seen tells you which deploy |
| Change history | deploys, flag flips, config edits, and dependency bumps inside the incident window |

Change history is the highest-yield source in the first minutes: most incidents
start when something changed, and the window bounds the search.

## Step 2 — Capture the topology

Blast radius is a property of the graph, not of the failing node.

1. Name the impacted node from the signal above.
2. Trace upstream: which callers depend on it. These define user-facing impact
   — a shared dependency fans out to every caller.
3. Trace downstream: which dependencies it calls. These are root-cause
   candidates, not symptom sites.
4. Record the edges. When no service map exists, reconstruct it from trace
   spans and record its absence as a follow-up.

Summarize in one line — impacted node, upstream callers, downstream
dependencies — and carry it into severity and into the post-mortem.

## Step 3 — Classify severity

| Severity | Definition | Examples |
|---|---|---|
| P0 | complete outage, data loss, or confirmed exposure | sign-in down, data readable across tenants, writes lost |
| P1 | major degradation with wide impact | checkout failing, error ratio above 1%, sync stalled |
| P2 | partial degradation, contained | one flow broken, latency past budget on one route |
| P3 | minor, with a workaround | cosmetic defect, rare edge case |

Severity drives the clock, the autonomy bound, and who is told. Recompute it as
impact is confirmed; a severity assigned from the first symptom and never
revisited is a guess with a label.

## Step 4 — Mitigate and verify

Reversible mitigations first, in rough order of preference: flip the flag,
revert the config, roll back the deploy, scale the resource, then apply a
narrow hotfix. Anything that writes data or changes a schema is irreversible
and needs an explicit human decision regardless of severity.

- Emit the exact command, flag, or config delta before applying it.
- State confidence — high only when telemetry confirms both the symptom and
  the causal path; medium when the topology and correlation support it without
  reproduction; low when it is inference from a similar past incident.
- Verify recovery in telemetry: error ratio falls, the affected flow completes,
  saturation returns to band. A mitigation nobody confirmed is a hypothesis.
- A mitigation that creates a new symptom is rolled back immediately, and both
  the original event and the mitigation regression go in the timeline.

Record every action — automatic or gated — with actor, timestamp, and the gate
decision. The timeline is written during the incident; reconstructed
afterwards, it is fiction with good intentions.

Notify on the severity clock: P0 pages on-call within 5 minutes of detection,
P1 within 15, P2 within the hour, P3 next business day. Tune per organization,
then hold to the tuned numbers.

## Step 5 — Blameless post-mortem

Written for every P0 and P1, and for any recurrence-prone failure mode, into
`docs/incidents/` unless the repository already keeps them elsewhere.

| Section | Content |
|---|---|
| Summary | one paragraph: what broke, for whom, for how long |
| Timeline | detection, each action with actor and gate decision, mitigation, recovery — timestamps throughout |
| Root cause | the causal chain, with a confidence rating; contributing conditions belong here too |
| Impact | users, flows, duration, and any data effect |
| Action items | one line each, owner named, prevention over detection over documentation |
| Lessons | what the response itself got wrong, including what the telemetry could not answer |

Blameless means assuming every responder acted on the best information
available, and naming conditions rather than people: an operator who could
apply a change with no preview is a missing gate, not a careless operator. A
low-confidence root cause keeps the post-mortem open — closing it declares an
answer that does not exist yet.

Keep credentials, personal data, and proprietary source out of the document
and out of the incident channel; incident artifacts circulate more widely than
the systems they describe.

## Step 6 — Follow-ups

File one issue per action item, each with an owner and a link back to the
post-mortem, and label them so the set is countable later. Write the
alert-linked runbook for the failure mode into `docs/runbooks/` while the detail
is fresh: symptom, first check, known mitigations, escalation path.

Permanent fixes are ordinary changes and go through the normal change flow with
tests and review. An incident is not a licence to skip the gates that would
have caught it.
