---
title: Enterprise quickstart
---

<!-- HAND-WRITTEN PAGE — verified against the tree at commit 6bf8725b. Re-attested 2026-09-26 against the section headings of the fork guide and the plugins guide. -->
<!-- Re-open when: a section this page links is renamed, moved or removed in `docs/enterprise-forks.md` or
     `docs/plugins.md`. `test/docsPages.test.ts` holds this page to the hand-page contract and holds
     every link text here to a heading in the guide it names. Re-open it too when a job moves between
     the admin, the platform team and the developers. -->

# Enterprise quickstart

This page is for the team that brings stamity into a company on a private fork. It puts the steps
in order, by day and by role, and sends you to the guide that owns each one.

It repeats no commands. Each step is one sentence, and its link is the section of the guide that
has the commands. The links go to the page, so find the section by its name there.

## Who does what

| Role | What they own |
|---|---|
| Admin | The prerequisites, the Actions and branch controls, and the rollout of the plugin to every developer's client. |
| Platform team | The fork, its identity and its releases, and the catalog repository developers install from. |
| Developers | Installing the plugin, setting each repository up, and staying on the version the platform team pins. |

## Day 0: make the fork

The admin and the platform team do this once.

- Check the plan, the access and the network routes before anything else, as [Check the prerequisites before you import](enterprise-forks.md) lists.
- Copy the upstream history into a new private repository with Actions turned off, by following [Import the history into a private repository](enterprise-forks.md).
- Give the private package its own name, repository and publisher with one command, from [Set the private package's identity](enterprise-forks.md).
- Point the update lane at the upstream and name your integration branch in [Configure `.stamity/upstream.json`](enterprise-forks.md).
- Turn Actions back on last, once your changes are committed and your branch checks match your integration branch, as [Turn the workflows on last](enterprise-forks.md) explains.

## Day 1: release and roll out

The platform team releases first, then the admin rolls out, then every developer installs.

- Arm the release workflow and push your first version tag, as [Release your fork](enterprise-forks.md) shows.
- Publish your customized content as a package your other repositories install, through [Ship your fork through APM](enterprise-forks.md).
- Turn the plugin on in every developer's Claude Code at once with the managed-settings file from [Roll the plugin out to your organization](enterprise-forks.md).
- Install the plugin in each client, or find that client's organization route, under [Install](plugins.md).
- Give each repository its charter and manifest with the one setup command in [Set the repository up](plugins.md).

## Day 2: take updates

The platform team runs the update lane, and developers follow the version it pins.

- See what the next upstream release touches and merge it on an update branch, as [Take the next release](enterprise-forks.md) shows.
- Fix a merge conflict in the lane's own worktree rather than in your checkout, by following [Resolve a conflict](enterprise-forks.md).
- Land the update with a merge commit so the next update still finds its base, as [Land the update branch](enterprise-forks.md) explains.
- Undo an attempt, or a release you already landed, with [Back out an attempt or a landed release](enterprise-forks.md).
- Move developers to the new version, or back to the old one, client by client in [Pin, update, roll back](plugins.md).
- Keep a repository that also depends on the package on the same engine as its plugin, as [Keep the runtime in step](plugins.md) describes.
- Serve the release from your own catalog repository, where Renovate opens a pull request you review for each new version, through [Private catalogs and Renovate](plugins.md).

## Where to go next

- [Enterprise forks](enterprise-forks.md) — the whole fork guide, including the fork layer that keeps your changes out of upstream's way.
- [Plugins](plugins.md) — every client's install, pin and rollback, and which files the plugin carries.
- [Customization](customization.md) — changing what the agents, rules, commands and skills say, before you reach for the fork layer.
- [Packs and trust](packs-and-trust.md) — shipping extra content behind a signature and an org policy.
