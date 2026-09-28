---
id: maintainability
type: skill
description: Maintainability axis checks for the verify skill — duplication, size outliers, dead exports, dependency lag, and comment drift.
tags: [review]
load: reference
obsolete_when: duplication, dead-export and drift censuses ship as client-native reports carrying per-repo thresholds
---

# Maintainability axis

The cost of the next change to this code, measured on the surface this change
touched.

## Runnable checks

**`maint-duplication`** — repeated blocks across the changed surface.
How: run the repo's duplication detector when one is configured; otherwise
compare normalized blocks of 30 or more lines across the changed files and their
sibling modules.
Threshold: no duplicated block above 30 lines. The three largest pairs are cited
with `file:line` on both sides.

**`maint-size-outliers`** — files and functions far outside this repo's own
distribution.
How: measure lines per file and per function across the changed area, then
compare against the repo median rather than an absolute number.
Threshold: a file or function above three times the repo median is a hit, and
the median is reported alongside so the multiple is readable.

**`maint-dead-exports`** — exported symbols with no consumer.
How: cross the export inventory of the changed modules against references across
the repo; a test counts as a consumer only when it asserts behavior rather than
existence.
Threshold: 0 new dead exports. Pre-existing ones are reported as a census and
are not attributed to this change.

**`maint-dependency-lag`** — release lag of direct dependencies.
How: compare each direct dependency's resolved version against its latest
published release and report the lag in major, minor, and patch steps.
Threshold: no direct dependency more than one major behind. Advisories and
licences belong to the dep-audit skill; this row counts lag only.

**`maint-comment-drift`** — prose contradicted by the code it sits on.
How: census comments naming a symbol, path, parameter, or number absent from the
same file, plus doc blocks whose parameter list disagrees with the signature
beneath them.
Threshold: 0 in the changed files.

## Judgment checks

**`maint-naming-coherence`** — new names follow the naming this repo already
uses for the same concept. A second name for one concept is a finding, with both
names cited.

**`maint-boundary-leak`** — a module reaches past a boundary the repo maintains:
an internal path import, a cross-layer read, a transport type inside a domain
module.

**`maint-abstraction-timing`** — an abstraction introduced before a third call
site, or a third call site left un-abstracted; either way the sites are cited so
the judgment is checkable.

**`maint-decision-record`** — a decision that constrains later work (a chosen
library, a schema shape, a protocol) is written where the next reader looks,
together with the alternatives it closed off.

**`maint-comprehension-path`** — a reader new to this area can reach the changed
behavior from an entry point named in the charter or the spec, without reading
the whole module first.
