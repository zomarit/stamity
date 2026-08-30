## What this changes

What the change does and why it is worth landing. If it fixes a filed issue, link it —
`Fixes #123` closes it on merge.

## Type of change

- [ ] Fix — corrects behaviour that was wrong
- [ ] Feature — adds behaviour that did not exist
- [ ] Breaking — changes behaviour an existing setup depends on (say what breaks, and how a
      user migrates)
- [ ] Corpus — changes what the engine generates: an agent, command, skill, rule or pack
- [ ] Docs, tests, or repository maintenance

## Checklist

- [ ] Commits signed off — `git commit -s`. That trailer is the Developer Certificate of Origin.
      The `all-pr-checks` context fails naming any commit that lacks it; the box is here so you
      meet it before a red check rather than because of one. Missed it on a branch already:
      `git rebase --signoff origin/main`.
- [ ] PR title is a conventional-commit subject — `type(scope): message`. A release note is read
      out of it, and `all-pr-checks` matches it against the accepted types.
- [ ] `npm run check` exits 0 locally — leak gate, typecheck, lint, tests, build, unused-code
      scan, in that order.
- [ ] Tests ship with the change. A behaviour change without a test that fails before it is a
      change nothing holds in place. No test was weakened or deleted to get green; where one had
      to change, the diff says why in the test itself.
- [ ] Generated pages regenerated where a generator owns them, and the regenerated output is in
      this diff. CONTRIBUTING.md's regeneration table maps each artifact to its command.
- [ ] No hand edits inside a managed block. Anything between `<!-- STAMITY:BEGIN -->` and
      `<!-- STAMITY:END -->` is rewritten from the corpus — edit the source and run
      `stamity sync`. Content outside the markers is yours and is preserved.

## Notes for review

Anything a reviewer would otherwise have to reconstruct: a decision you went back and forth on,
a path you deliberately did not take, a follow-up you are leaving open.

One maintainer merges here, with **0 required approvals** — the mechanical review is CI, across
two required contexts (`all-ci-checks` on every event, `all-pr-checks` on pull requests) — and an
external pull request also gets a read through this project's own `/st-pr-resolve` command.
If that review is wrong, say so in the thread: a weak review is a defect in the corpus, and it
gets fixed there. `GOVERNANCE.md` at the repository root describes how a change lands;
`CONTRIBUTING.md` describes the loop. Both are named rather than linked — this text becomes a
pull-request body, where a repo-relative link no longer resolves from where it was written.
