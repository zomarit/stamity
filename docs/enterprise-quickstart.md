---
title: Enterprise quickstart
---

<!-- HAND-WRITTEN PAGE — verified against the tree at the 1.16.0 release cut (2026-10-20). -->
<!-- Re-open when: a section this page links is renamed, moved or removed in `docs/enterprise-forks.md` or
     `docs/getting-started.md`. `test/docsPages.test.ts` holds this page to the hand-page contract and
     holds every link text here to a heading in the guide it names. Re-open it too when either guide
     gains a step between two sections this page names, which no check catches, or when a job moves
     between the admin, the platform team and the developers. -->

# Enterprise quickstart

This page is for the team that brings stamity into a company on a private fork. It puts the steps
in order, by day and by role, and sends you to the guide that owns each one.

It repeats no commands. Each step is one sentence, and its link is the section of the guide that
has the commands. The links go to the page, so find the section by its name there.

## Who does what

| Role | What they own |
|---|---|
| Admin | The prerequisites, the Actions and branch controls, and the release environment's reviewers. |
| Platform team | The fork, its identity, its customization and its releases, and the update lane. |
| Developers | Installing the fork's CLI from your registry, setting each repository up, and staying on the version the platform team pins. |

## Day 0: make the fork

The admin and the platform team do this once.

- Check the plan, the access and the network routes before anything else, as [Check the prerequisites before you import](enterprise-forks.md) lists.
- Copy the upstream history into a new private repository with Actions turned off, by following [Import the history into a private repository](enterprise-forks.md).
- Give the private package its own name, repository and publisher with one command, from [Set the private package's identity](enterprise-forks.md).
- Point the update lane at the upstream and name your integration branch in [Configure `.stamity/upstream.json`](enterprise-forks.md).
- Take the regenerate list, the generated paths and the gates from [Start from these values for a fork of this repository](enterprise-forks.md).
- Pick the cheapest place for each change you make, using [Choose where your customization lives](enterprise-forks.md).
- Put your own agents, rules, commands and skills where upstream never writes, as [Author in the fork layer](enterprise-forks.md) shows.
- Turn Actions back on last, once your changes are committed and your branch checks match your integration branch, as [Turn the workflows on last](enterprise-forks.md) explains.

## Day 1: release and roll out

The admin arms the release, the platform team tags it, then every developer installs it.

- Create the reviewed environment and set the variables and the token, as [Arm the workflow](enterprise-forks.md) shows.
- Push your first version tag, or rehearse it first with a dispatch, by following [Tag a release](enterprise-forks.md).
- Check what the run proved and what it did not, in [Know what proves a release](enterprise-forks.md).
- Map your scope to your registry on every developer's machine, as [Consume the release](enterprise-forks.md) shows.
- Give each repository its setup with your own package's `init`, the way [Set stamity up](getting-started.md) does it with the public one.
- Prove each new setup with one small change, as [Make your first real change](getting-started.md) walks through.

## Day 2: take updates

The platform team runs the update lane, and developers follow the version it pins.

- Opt in to the scheduled update run and decide on its token, through [Turn on the GitHub workflow](enterprise-forks.md).
- If your fork was set up before 1.15.0, drop the deleted routes' generators and paths first, as [Drop the deleted routes from a fork set up before 1.15.0](enterprise-forks.md) lists.
- See what the next upstream release touches and merge it on an update branch, as [Take the next release](enterprise-forks.md) shows.
- Act on what the lane reports, by its outcome and its exit code, from [Read the outcome and the exit code](enterprise-forks.md).
- Fix a merge conflict in the lane's own worktree rather than in your checkout, by following [Resolve a conflict](enterprise-forks.md).
- Let your own checks decide whether the merged fork still behaves, as [Write the gates that decide the upgrade](enterprise-forks.md) explains.
- Land the update with a merge commit so the next update still finds its base, as [Land the update branch](enterprise-forks.md) explains.
- Undo an attempt, or a release you already landed, with [Back out an attempt or a landed release](enterprise-forks.md).
- Recover a failed scheduled run and keep its evidence, as [Recover from a failed run](enterprise-forks.md) lists.
- Move each repository to the new version with your own package's `upgrade --to <version>`, which runs that release's `sync` and moves the `package.json` pin (a move to a release before 1.17.0 runs its `sync` instead), then run your install so the lockfile follows; or keep it where it is, the way [Keeping your setup current](getting-started.md) does it with the public one.

## Where to go next

- [Enterprise forks](enterprise-forks.md) — the whole fork guide, including the fork layer that keeps your changes out of upstream's way.
- [Customization](customization.md) — changing what the agents, rules, commands and skills say, before you reach for the fork layer.
- [Packs and trust](packs-and-trust.md) — shipping extra content behind a signature and an org policy.
