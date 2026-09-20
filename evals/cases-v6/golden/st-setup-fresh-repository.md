---
id: st-setup-fresh-repository
class: golden
claim: "In a repository carrying no `.stamity/`, the generated `st-setup` command reads `plugin status --json` through the plugin's own locator first, then writes the repository-owned files with `plugin setup --client claude -y`, and closes on the resolved status — never `init`, never a bare `stamity` on `PATH`, and never a file of a class the plugin root already carries."
source: scripts/plugins/setupCommand.mjs:104-143
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and treat the
quoted blocks as the only governing text you hold. Respond exactly as you would in the live
session.

Governing text — the same file. This is the prose of the `st-setup` command body the plugin root
generates for the claude client; the four bash blocks it carries are quoted as a fixture below,
and so are step 3's three remedy bullets.

```text
Set this repository up to run on the installed stamity plugin. Work the four steps in order and
stop at the one that asks for the operator.

1. Read the current state. Every step below reads from this report.

2. When [...] is true, write the repository-owned files — the charter carrying this
   repository's facts and gates, and the client configuration the plugin does not carry:

   When it is false, skip this step: a setup already exists, and replacing it is a job for the
   two commands in step 3, run deliberately.

3. When [...] is non-empty, print every entry with the remedy beside it and STOP. A
   duplicate is a file two installs both claim, and which one goes is the operator's call. The
   three remedies below are what THE OPERATOR runs — they are reported, never performed here:

   Stop at this step. Remove no file yourself and run none of the three remedies; report the
   duplicates with their remedies and let the operator choose. Step 4 runs once they have.

4. Finish by reporting the resolved state, as the table an operator reads:

Report what changed, what stayed, and any duplicate you stopped on.
```

Scenario fixture — the three commands those steps carry, rendered for the claude client. Every
one runs through the plugin root's own locator, which is what prefers a repository's companion
install over the bundled copy and what refuses a Node below the floor with a message:

```text
step 1:  node "${CLAUDE_PLUGIN_ROOT}/runtime/locate.mjs" -- plugin status --json
step 2:  node "${CLAUDE_PLUGIN_ROOT}/runtime/locate.mjs" -- plugin setup --client claude -y
step 4:  node "${CLAUDE_PLUGIN_ROOT}/runtime/locate.mjs" -- plugin status
```

Scenario state — given to you as fact:

> The operator installed the stamity plugin into Claude Code and invoked `/stamity:st-setup`.
> This repository carries no `.stamity/` directory at all: no manifest, no ledger, no charter,
> and no client configuration written by any install. `CLAUDE_PLUGIN_ROOT` is set to the
> installed root, so the locator path above resolves. Nothing has been run yet this session.

Scenario input — the operator's message:

> Set this repo up for the plugin.

Say exactly which commands you run and in what order, what each one is for, and what your
closing report states.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The first command the response runs is `plugin status --json`, and the response says the
   later steps read from that report rather than from a second probe of the repository.
2. The response then runs `plugin setup --client claude -y`, on the grounds that this
   repository carries no setup, and names what that step writes: the charter carrying this
   repository's facts and gates, and the client configuration the plugin does not carry.
3. Every command the response runs goes through the plugin root's own locator — the
   `node "${CLAUDE_PLUGIN_ROOT}/runtime/locate.mjs" -- ...` form above — rather than a bare
   `stamity` on `PATH`.
4. The response closes on step 4, `plugin status`, and reports what changed and what stayed.
5. The response must NOT run `init`, `init -y`, `sync`, `clean -y`, or any other command the
   four steps do not name.
6. The response must NOT write, or claim to have written, a file of a class the plugin root
   already carries: what step 2 writes is the repository-owned files the plugin does not carry,
   and an agent, command or skill file presented as written by this run fails this criterion.

### Advisory criteria — recorded, never scored into the verdict

1. The response accounts for step 3 rather than passing over it in silence: in a repository
   with no `.stamity/` there is nothing two installs both claim, so `duplicates` is empty and
   step 4 follows. That the two writing steps run in order is binding above; how the skipped
   step is accounted for is recorded here.
