---
title: Packs
---

<!-- GENERATED FILE — do not edit by hand. Rewrite it with `node scripts/generate-docs.mjs`. -->

# Packs

A pack is content installed on top of the corpus behind the trust ladder. Packs ship across several classes at once, so they get one inventory rather than a row on each class page. Authored in `packs/`; each entry below is read from that pack's `pack.json` and its class directories.

**Updating a pack means adding it again.** There is no auto-update path for any pack source — not for the first-party packs below, and not for a source your organization allowlisted — and nothing checks for a newer version in the background. Re-running the install line for a pack you already have re-runs every trust gate on the new content and replaces what it landed, so re-add is the update, and it is also the only way to pick up a change.

3 packs.

## `ops`

Operate in production — cut releases fail-closed, run incidents to blameless post-mortems.

- **Version:** `1.16.0`
- **Ships:** `agents` (2), `skills` (5), `commands` (2)
- **Install:** `stamity add ops`

Skills:

- `st-ci-pipeline` — Designs and tunes a continuous-integration pipeline — stage graph, job parallelism, dependency and build caches, test sharding, artifact retention, and a wall-clock budget per stage. Triggers when a pipeline is authored or restructured, when a gate run has grown too slow to wait for, or when caching and sharding want rebalancing.
- `st-containerize` — Packages a service into a container image — multi-stage build, digest-pinned minimal base, unprivileged runtime user, local compose stack, orchestrator manifest with a hardened security context, and an image vulnerability gate. Triggers when a service has no image yet, when an image fails a hardening or scan review, or when a compose or orchestrator manifest is written.
- `st-gh-agentic-workflows` — Wires agent-run automation into the hosting platform's workflow runner — scheduled maintenance jobs, issue labelling and routing, documentation follow-ups — under least-privilege permissions, a cost ceiling, and a disable path. Triggers when unattended agent runs join a repository, when an existing automation wants its permissions or spend bounded, or when agent-authored output needs a human review seam.
- `st-incident-runbook` — Executes the on-call runbook for an open production event — severity table, telemetry reading, upstream and downstream topology capture, mitigation verification, and the blameless post-mortem template. Triggers when an incident is open and unstabilized, when a severity call rests on confirmed impact, or when a post-mortem follows recovery.
- `st-release-runbook` — Executes the release procedure for a single version — version bump, changelog section, gate run, SBOM and provenance emission, and the typed confirmation each irreversible publish step takes. Triggers when a version is cut, when supply-chain artifacts precede a publish, or when the irreversible steps want their gates stated.

Commands:

- `/st-incident-response` — Runs a live production incident: severity classification, blast-radius mapping, reversible-first mitigation under a human gate, stakeholder updates, and a blameless post-mortem with filed follow-ups.
- `/st-release` — Cuts a versioned release: preflight, SemVer decision, changelog, gates, supply-chain artifacts — assembled on a release branch and stopped before tag push, registry publish, and production deploy.

## `product-audit`

Point-in-time whole-product assessment — proposes an epic set and writes a report; assesses, never modifies.

- **Version:** `1.16.0`
- **Ships:** `skills` (1), `rules` (1), `commands` (2)
- **Install:** `stamity add product-audit`

Skills:

- `st-perf-audit` — Profiles a slow product surface against its declared performance budgets, names the hot paths behind each violation with measured evidence, and hands the optimization plan to the work pipeline. For investigating why something is slow — bundle weight, render cost, memory growth, cold start, query cost.

Commands:

- `/st-benchmark` — Measures the product against stored baselines: runs the suite under a controlled environment, compares each metric to the recorded baseline, and returns a per-metric regression verdict with its statistical confidence; it reports, and leaves the optimizing to the work pipeline.
- `/st-product-audit` — Whole-product assessment at one commit along a named axis — security, health, or all: reads the per-axis verify artifacts, writes one report proposing an epic with a sub-issue per module, and routes every fix back out.

## `scaffold`

Greenfield generators built to the repo's quality floor — the implementer writes, a specialist lens gates, and a failed gate buys exactly one regeneration.

- **Version:** `1.16.0`
- **Ships:** `commands` (3)
- **Install:** `stamity add scaffold`

Commands:

- `/st-auth-scaffold` — Builds the first authentication layer for a service that has none — session cookie, bearer credential, or authorization-code-with-PKCE — with its storage posture, environment template, and test scaffold; the security lens gates the result.
- `/st-design-system-create` — Generates a design system from the recorded inventory and an intake dialog — three-tier tokens, perceptual colour ramps, theme sets, and the design document — with the interface and interaction lenses gating contrast, parity, and alias integrity.
- `/st-slo-scaffold` — Turns a service with no reliability targets into a versioned objective set — indicator selection, availability and latency targets, error budget, and multi-window burn-rate alert rules; the reliability lens gates the result.
