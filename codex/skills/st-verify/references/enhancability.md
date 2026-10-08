---
id: enhancability
type: skill
description: Enhancability axis checks for the verify skill — extension seams, feature-flag wiring, config-versus-code split, and migration paths.
tags: [review]
load: reference
obsolete_when: extension seams and rollout controls are generated and verified by client tooling without a check list
---

# Enhancability axis

The cost of the change after this one: what can be swapped, toggled, or reversed
without editing the modules around it.

## Runnable checks

**`enh-boundary-interface`** — module boundaries name a type, not a concrete
implementation.
How: census cross-module imports in the changed area and classify each target as
an interface, an abstract type, or a concrete class or function.
Threshold: every cross-cutting concern the repo declares — persistence,
transport, notification, authentication, telemetry — is reached through a named
type. Concrete reaches are cited `file:line`.

**`enh-flag-wiring`** — user-visible behavior changes sit behind a toggle when
the repo has a toggle mechanism.
How: detect a flag client or a configuration switch, then cross flag reads
against the behavior-changing hunks of the diff.
Threshold: 100% of user-visible behavior changes when a mechanism exists. Where
none is detected, report not-applicable and name that absence — the row is a
finding about the repo, not about the change.

**`enh-config-externalized`** — environment-dependent values live in
configuration rather than in source.
How: census literal endpoints, timeouts, retry counts, batch sizes, and limits
in the changed source against the repo's configuration schema.
Threshold: 0 environment-dependent literals in source. A literal identical in
every environment is not a hit.

**`enh-migration-path`** — schema and contract changes ship all four phases, each
with its own reverse.
How: for each migration or contract change in the diff, check for an expand
step, a backfill or dual-write step, a switch step that moves reads behind a
flag, and a contract step — the four the migrations floor names — then check for
one reversal line per phase naming the exact reversal and its cost.
Threshold: all four phases present or ruled out with their reason, and four
reversal lines. A destructive single-step change with no reverse is a hit, and
so is a four-phase plan carrying a single reverse for the set: a reversal that
does not name its phase cannot be run from the phase that needs it.

**`enh-extension-registry`** — pluggable behavior has one place to register.
How: where the repo declares pluggable behavior, locate the registry or wiring
that binds an implementation to its type, plus the lifecycle entry points it
calls.
Threshold: present, and singular — a second registration path for one concern is
a hit.

## Judgment checks

**`enh-default-preserves-behavior`** — a new toggle's default reproduces what
shipped before it, so an outage of the flag service is not a behavior change.

**`enh-flag-retirement`** — each toggle carries an owner and a retirement
condition. A permanent toggle is configuration and is named as such.

**`enh-seam-stability`** — an interface offered to callers states whether it is
settled or provisional, so a caller knows what it is depending on.

**`enh-reversibility`** — the change states how it is undone: revert, toggle, or
a named migration step. "Not reversible" is a valid answer only when it is
written down before the change lands.
