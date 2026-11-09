---
id: maintainer-process
type: rule
description: "How work runs in this repository: a local lane whose node_modules links to the main checkout never runs npm ci or npm install, stage by explicit path and never git add -A or git stash, stamity, git and gh commands take literal arguments one per line, a full suite runs alone under the machine's run lock where it has one, stop processes by PID, scratch repositories live outside the checkouts, read every gate by its exit code, a stamp comes from the clock in the step that writes it, and a Dependabot pull request gets its whole lockfile diff read and a dependency audit before it merges."
tags: [orchestration]
load: always
obsolete_when: the engine enforces each of these on every client
precedence: critical
---

# Maintainer process

The standing rules for any agent working in this repository, in a lane or in the main
checkout. Each one exists because breaking it cost a run once.

## Floor

1. **A local lane shares the main checkout's packages.** A lane made on this machine has a
   `node_modules` that is a link to the main checkout's; `test -L node_modules` says so.
   Where it is a link, never run `npm ci` or `npm install` in that lane: it empties the
   folder the main checkout and every other lane read. A cloud sandbox, or any lane whose
   `node_modules` is its own folder, has its own install and runs it as usual.
2. **Stage by explicit path.** `git add <path>` for each file the change owns. Never
   `git add -A`, `git add .` or `git stash`: they sweep in or hide files another writer owns.
3. **`stamity`, `git` and `gh` commands take literal arguments.** One command per line,
   each argument written out. Never put one inside a loop, behind a variable, or inside a
   `$(…)`: the guard cannot read what those expand to, so it asks, and an unattended run
   stalls on that ask.
4. **A full suite runs alone.** Two suites at once on one machine starve each other into
   false timeouts, so a full suite runs under the machine's run lock where the machine has
   one. On macOS that is a `lockf -k /tmp/stamity-machine.lock` prefix; on Linux, `flock`
   on the same file does the same. Where there is no lock tool, the suite runs with no
   prefix and no second suite starts beside it.
5. **Stop processes by PID.** Never stop a process by a name or a pattern: a pattern
   matches processes this work never started.
6. **Scratch repositories live outside the checkouts.** A throwaway `git init` goes under
   the system's temporary folder, never inside the main checkout or a lane, where the leak
   gate and git itself read it.
7. **Read every gate by its exit code.** Run the gate as written and read its status from
   the tool. Never read a verdict through `| tail`, `| head` or a grep of its output; a
   gate that did not run is reported as not run.
8. **A stamp comes from the clock.** A timestamp is read from the clock, in UTC, in the
   same step that writes it: by a stamping script or by the tool that writes the line.
   Never type one by hand or reuse one read earlier in the run.
9. **A Dependabot pull request is read before it merges.** Read the whole lockfile diff,
   not the summary, and run `st-dep-audit` against the pull request's base before the merge.

## Gates

- A lane with a linked `node_modules` that ran `npm ci` or `npm install`, a commit staged with `git add -A`, or a
  `git stash` in a shared checkout is reported as a process defect in the run's report.
- A gate result with no exit code behind it is reported as not run.
- A Dependabot merge with no audit against its base is not landed.
