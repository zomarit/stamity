---
id: maintainer-process
type: rule
description: "How work runs in this repository: lanes are worktrees with node_modules linked to the main checkout, stage by explicit path and never git add -A or git stash, stamity, git and gh commands take literal arguments one per line, every full suite runs under the machine lock, stop processes by PID, scratch repositories live outside the checkouts, read every gate by its exit code, stamp with date -u, and a Dependabot pull request gets its whole lockfile diff read and a dependency audit before it merges."
tags: [orchestration]
load: always
obsolete_when: the engine enforces each of these on every client
precedence: critical
---

# Maintainer process

The standing rules for any agent working in this repository, in a lane or in the main
checkout. Each one exists because breaking it cost a run once.

## Floor

1. **Lanes are worktrees that share the main checkout's packages.** A lane's `node_modules`
   is a link to the main checkout's. Never run `npm ci` or `npm install` in a lane: it
   empties the folder the main checkout and every other lane read.
2. **Stage by explicit path.** `git add <path>` for each file the change owns. Never
   `git add -A`, `git add .` or `git stash`: they sweep in or hide files another writer owns.
3. **`stamity`, `git` and `gh` commands take literal arguments.** One command per line,
   each argument written out. Never put one inside a loop, behind a variable, or inside a
   `$(…)`: the guard cannot read what those expand to, so it asks, and an unattended run
   stalls on that ask.
4. **Every full suite runs under the machine lock.** Prefix it with
   `lockf -k /tmp/stamity-machine.lock`, so two suites on one machine run one after the
   other instead of starving each other into false timeouts.
5. **Stop processes by PID.** Never stop a process by a name or a pattern: a pattern
   matches processes this work never started.
6. **Scratch repositories live outside the checkouts.** A throwaway `git init` goes under
   the system's temporary folder, never inside the main checkout or a lane, where the leak
   gate and git itself read it.
7. **Read every gate by its exit code.** Run the gate as written and read its status from
   the tool. Never read a verdict through `| tail`, `| head` or a grep of its output; a
   gate that did not run is reported as not run.
8. **Stamp with `date -u`.** A timestamp is taken by `date -u` in the same command that
   writes it, never typed from memory or from an earlier command.
9. **A Dependabot pull request is read before it merges.** Read the whole lockfile diff,
   not the summary, and run `st-dep-audit` against the pull request's base before the merge.

## Gates

- A lane that ran `npm ci` or `npm install`, a commit staged with `git add -A`, or a
  `git stash` in a shared checkout is reported as a process defect in the run's report.
- A gate result with no exit code behind it is reported as not run.
- A Dependabot merge with no audit against its base is not landed.
