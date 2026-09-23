---
id: claude-code-refuses-sub-agent-report-file-names
title: claude code refuses sub-agent report file names
date: 2026-09-23
confidence: high
summary: Claude Code refuses a sub-agent's Write whose basename matches /^(REPORT|SUMMARY|FINDINGS|ANALYSIS).*\.md$/i (2.1.278, 2.1.280); name persisted reports <pass>-<role>-r<N>.md
reviewBy: 2026-12-01
validatedAgainst: "six refused Write results in the plan-008 session-3 sub-agent transcripts, a refused write on Claude Code 2.1.280 on 2026-09-23, and the Write validateInput rule read from the 2.1.280 client binary"
integrity: sha256:65afc694d8a95450629c3e57dfb99322944bd0bd75af4b259976be851d2449c0
---

Claude Code refuses a sub-agent's `Write` when the file's basename matches
`/^(REPORT|SUMMARY|FINDINGS|ANALYSIS).*\.md$/i`, with the tool error "Subagents should
return findings as text, not write report files. Include this content in your final
response instead." The check sits in the client's own `Write` input validation, applies
only when the caller is a sub-agent (the call carries an agent id), and ignores the
directory: `scratchpad/lanes/v1/report.md` is refused exactly like `REPORT.md` in the
repository root, while `u2p1-reviewer-r1.md` or a `.cjs` file in the same folder is
written. The orchestrating session itself is not affected. So a lane brief that asks a
sub-agent to "write your full report to `report.md`" silently falls back to an inline
return on Claude Code, and any design that persists sub-agent reports must name them so
the basename does not start with one of those four words.

## Why

Measured on 2026-09-23. Plan 008 session 3's orchestrator (Claude Code 2.1.278) briefed
six lanes to write `report.md` under their scratch folders; all six `Write` calls came
back with that tool error, so the session's hand-built two-tier return never persisted a
report. A research agent of this session (Claude Code 2.1.280) was refused the same way
for `…/r1-measurement/report.md` while its nine `.cjs` writes in the same folder
succeeded. The rule was then read from the 2.1.280 client binary: in the `Write` tool's
`validateInput`, `if(s.agentId && /^(REPORT|SUMMARY|FINDINGS|ANALYSIS).*\.md$/i.test(<basename>))`
returns error code 5 and logs `tengu_subagent_md_report_blocked`. The client's own
sub-agent documentation still recommends that detailed results go to files the main
conversation can reference, so the refusal is a naming guard against stray report files,
not a ban on persisted results. Validated against: the six refused `Write` results in the
session-3 sub-agent transcripts, this session's refused write, and the binary's
`validateInput`. Review horizon: re-check on the next client minor; retire this learning if
the rule is removed or its pattern changes (then re-measure the new pattern).

## How to apply

Name a persisted sub-agent report by what it is — plan 009 uses
`.stamity/runs/<run-id>/reports/<pass>-<role>-r<N>.md`, and a unit id that begins with
`report`, `summary`, `findings` or `analysis` takes a `u-` prefix — and never ask a
sub-agent for `report.md`, `SUMMARY.md`, `findings.md` or `analysis.md`. When a brief does
ask for a report file, also tell the agent to return the full result inline if the write is
refused, so nothing is lost when the client says no. A refused write is not a permission
problem: bypass mode does not lift it, and retrying under the same name fails the same way.
