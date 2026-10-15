---
id: chains
type: skill
description: Chain runs for the unattended skill — how the chain check admits a plan chain, one branch and one draft pull request for the whole chain, and the run base its freshness guard reads.
tags: [orchestration]
load: reference
obsolete_when: every supported client enforces an unattended mode natively, plan chains included, so no run follows these floors from text
---

# Unattended chains

The chain check is the call the skill's `## Chains` line names, run in the form its Running-the-CLI paragraph gives.
It admits a chain when each file's head `depends_on` names the file before it; otherwise the blocker `chain-order`
refuses. One unattended invocation then runs the chain on one branch, each file its own run and record, stopping at
the first `BLOCKED_*`, with one draft pull request and one morning list for the chain. `--since` is the chain's run
base — the HEAD sha the first record's `Base:` carries — never the plans' stamp: a `reads` path that only commits
after that base moved is exempt from the freshness guard, and a path a commit between the stamp and the base moved
stays stale.
