# The workspace surface

A multi-repo workspace engine ships whole and is reachable from nothing. This
spec designs its door: a conditional offer inside `stamity init`, and a
`stamity workspace` verb with three subcommands.

Every claim about existing behaviour below carries a `path:line` citation taken
from the tree at the time of writing. Citations are code spans rather than
links: they address lines, which no link form can resolve, and a spec that
cannot be checked against the code is prose.

## Intent

Let somebody who has several repositories under one directory say so once, and
have one policy reach all of them — without hand-authoring a manifest whose
shape is documented only in a TypeScript interface.

Six modules implement that already. `workspace.json` is read, validated,
migrated and written (`src/workspace/manifest.ts`). Precedence is resolved
(`src/workspace/resolve.ts`). The cascade is bounded, isolated and journalled
(`src/workspace/sync.ts`). Detection classifies a directory and finds its
members (`src/workspace/detect.ts`). The composition root exposes all of it
(`src/composition/root.ts:180,299`), and `stamity validate` already reports the
manifest's field defects (`src/cli/commands/validate.ts:184-186,473-494`).

What does not exist is any way to reach it. `shouldSuggestWorkspace`
(`src/workspace/detect.ts:213-217`) is called by nothing. `detectWorkspaceContext`
(`src/workspace/detect.ts:166-184`) is called by nothing. `syncWorkspaceRepos`
(`src/workspace/sync.ts:414-472`) is called by its own suite and by no command.
The engine's own `RepoSyncCallback` seam (`src/workspace/sync.ts:148-151`) has
no implementation anywhere in `src/`. So a workspace exists only for an operator
who reads the source, writes `workspace.json` by hand, and then finds nothing to
run it with.

This spec closes that, and settles four design forks that the engine
deliberately left to its caller.

## Context

### What the engine already decides, and what it left open

The manifest sits at the workspace ROOT, not inside a state directory
(`src/workspace/model.ts:20-25`), carries a semver `version`, a required
`defaults.tools`, optional group deltas, a `repos[]` of root-relative paths, and
an optional `lockedContent` applied last (`src/workspace/model.ts:92-105`).
Resolution order is defaults → matched group deltas in MANIFEST declaration
order → the member's own overrides, with locks refusing removals
(`src/workspace/resolve.ts:63-97`). Resolution is pure: it never touches a
filesystem, and a registered member missing from disk resolves like any other
(`src/workspace/resolve.ts:22-27`).

The cascade owns ordering, bounding, isolation and the crash trail, and nothing
else. The per-member work is INJECTED (`src/workspace/sync.ts:26-31`), members
run at `min(cpus, 8)` (`src/workspace/sync.ts:234-237`), rows stay in manifest
order regardless of completion order (`src/workspace/sync.ts:406-413`), one
member's failure never stops the others (`src/workspace/sync.ts:36-40`), and
`requireRepoDirectory` fails a row when the directory is missing, is not a
directory, or resolves outside the root through a link
(`src/workspace/sync.ts:357-404`).

Three things the engine left to its caller, which is why this spec exists:

- **Who calls the cascade.** Nothing does.
- **What the callback does.** The seam is typed and empty.
- **When a workspace is offered.** `shouldSuggestWorkspace` answers the
  question and nobody asks it.

### The one discovery that changes a requirement

The research handed over says the cascade propagates `defaults`, group deltas
and `lockedContent` into members. The resolution half of that is true. The
EMISSION half is not, and only for `selection`:

`planSync` overwrites the member manifest's selection with the whole corpus on
every run — `planningManifest.selection = fullCorpusSelection(index)`
(`src/cli/commands/sync/engine.ts:476`, over `src/cli/commands/sync/engine.ts:240-246`),
because "v1 selection semantics: the full corpus, derived fresh each sync… the
manifest's selection field is refreshed from this — it is the future narrowing
hook, not yet a filter" (`src/cli/commands/sync/engine.ts:241-243`).

So a workspace-resolved `selection` cannot change one emitted byte today, and
neither can `lockedContent`, whose entire job is to refuse `removeItems` against
that selection (`src/workspace/resolve.ts:111-123`). The fields emission
actually reads off a member manifest are `tools`, `maturityTier` and `mcp`
(`src/types/manifest.ts:191-216`). REQ-WS-013 states that split rather than
letting the cascade advertise a propagation it does not perform.

### The CLI conventions this surface inherits

A command is a `CommandModule` — `name`, `summary`, `mutating`, optional `args`
and `configure`, and `run` (`src/cli/kit/program.ts:111-124`) — registered in
`COMMANDS` (`src/cli.ts:43-52`), with a duplicate-name throw at load
(`src/cli.ts:59-71`). `--json` and `-y` are auto-registered, `--dry-run` only on
a mutating module, and `--json` makes a run non-interactive while carrying NO
consent (`src/cli/kit/program.ts:54-60`, `src/cli/kit/prompts.ts:8-16`).

Exit statuses are 0, 1 and 2 only; the sysexits map was deliberately retired and
the failure CLASS travels as `error.code` in the JSON envelope
(`src/types/errors.ts:1-35`, `src/cli/kit/program.ts:28-37`). JSON mode emits
exactly one document per run that reaches a command
(`src/cli/kit/program.ts:39-46`).

Subcommand dispatch is positional with a `USAGE` `CliFailure` on an unknown verb
(`src/cli/commands/config.ts:1086-1104`). `docs/cli-reference.md` regenerates
from `COMMANDS` (`src/cli/docs/cliReference.ts:41,466-470`) and throws on any
argument or flag registered with no description
(`src/cli/docs/cliReference.ts:418-421`); a stale committed page fails its own
byte gate (`test/cli/docs/cliReference.test.ts:81`).

### What init already does, and the shapes to copy

`buildInitDecisions` returns source-tagged detection fields so the command can
skip a question a flag or a detection already answered
(`src/cli/commands/init/plan.ts:43-82,118-151`). At most TWO prompts fire on the
ordinary path; a THIRD, `askProceedWithoutGit`, fires only where a detected
precondition holds (`src/cli/commands/init.ts:54-58,257-264`). A non-interactive
run gains no question ever — at most a printed disclosure line, and the migrate
gate is the worked example: the interactive default is `full`, the unattended
default is `skip`, and BOTH modes print a line naming what happened
(`src/cli/commands/init.ts:78-89,429-450`). The panel has a conditional
disclosure block that prints nothing when its input is empty
(`src/cli/commands/init/panel.ts:546-573`). Every prompt fires before
`applyInit`, so an abort leaves no partial state
(`src/cli/commands/init.ts:73-76,719-734`).

### The docs surfaces that move

`docs/getting-started.md:103-105` heads a section "The seven verbs" and lists
them, then calls `learn` "an eighth" at `docs/getting-started.md:113`. The
containment pin is a hand-maintained literal array, NOT derived from `COMMANDS`
(`test/docsPages.test.ts:960`) — so forgetting the array is the regression this
lane has to name out loud. `src/cli.ts:26` says "the eight CommandModules" and
`src/cli.ts:41-42` spells the advertised surface by name. All four move together.

## Invariants

Floors for this lane. They hold whatever the surface grows into.

1. **A workspace is created by a person or by a named verb, never as a side
   effect.** `stamity init` may OFFER; only an answered question or an explicit
   `stamity workspace init` writes `workspace.json`.
2. **The workspace root is never a cascade target.** `detectSubRepos` starts at
   the root's CHILDREN and never returns the root
   (`src/workspace/detect.ts:97-99,144`), and a `repos[]` path of `"."` or `""`
   is refused by shape as `empty` (`src/workspace/manifest.ts:56,79`). The root
   cannot be registered, so nothing here makes it registrable.
3. **Propagation is persistent, not ambient.** What the workspace decides for a
   member is written into that member's own `.stamity/manifest.json` before its
   emission is planned. A member is then correct when synced alone.
4. **One member's failure is one row.** The cascade's isolation
   (`src/workspace/sync.ts:36-40`) is the whole verb's posture: a bad member
   never aborts the run, and never silently succeeds either.
5. **A repo with no `workspace.json` and fewer than two sibling repositories is
   byte-identical.** No new init output, no new prompt, no new file.
6. **The journal is diagnostic in both directions.** Nothing reads it back to
   decide what to do; a malformed or absent journal never fails a command.

## Requirements

Each requirement states the decision, why it was taken, and the alternative it
rules out. All seventeen were settled here; the operator delegated the design
and none of them is left open.

### REQ-WS-001 — Init probes for a workspace once, gated on a cheap classification

**Decision.** `stamity init` gains one detection probe, issued inside the
existing parallel detection round (`src/cli/commands/init.ts:632-635`) under the
spinner already running, in two stages:

1. `detectWorkspaceContext(rootDir)` (`src/workspace/detect.ts:166-184`). If the
   role is anything but `standalone`, the probe stops and init offers nothing.
2. Otherwise `detectSubRepos(rootDir)` at the module's own default depth
   (`src/workspace/detect.ts:36,114-146`). Two or more candidates arms the offer;
   fewer arms nothing.

The result rides `InitDecisions` as a source-tagged field beside the others
(`src/cli/commands/init/plan.ts:43-82`): the candidate list, and nothing derived
from it.

**Rationale, including the cost.** Stage 1 is a single round of at most eleven
`stat` calls over a path chain computed arithmetically
(`src/workspace/detect.ts:152-157,191-201`), and it vetoes both directions of
"already settled": a root that has a `workspace.json`, and — the case
`shouldSuggestWorkspace` does NOT cover, since it only checks the root
(`src/workspace/detect.ts:214`) — running `stamity init` inside `apps/web` of an
existing workspace, where an offer would propose a workspace nested inside
another one.

Stage 2 is a genuine fan-out and is not pretended otherwise: every level lists a
directory and probes each child, to four levels
(`src/workspace/detect.ts:27-36`). Three properties bound it honestly, and none
of them is a guess:

- The walk stops at the first repository on a branch
  (`src/workspace/detect.ts:135-138`), so a workspace-shaped tree — the tree
  where the offer will actually fire — costs one level plus two probes per child.
- `node_modules` and every dot-directory are skipped at every level
  (`src/workspace/detect.ts:125`), which is what removes the vendored-checkout
  blow-up from a large JavaScript monorepo.
- The expensive case is a deep, repository-free tree, and on that tree stage 1
  costs nothing and stage 2 returns fewer than two candidates, so the run pays
  once and never asks.

A cheap child-count precheck was considered and dropped: listing the root's
children IS stage 2's first level, so a precheck would duplicate the one read it
was meant to avoid.

**Dropped.** A shallower depth for the init probe than for the verb. It looks
like free savings and creates a contradiction: init would offer over a
three-member set and `stamity workspace init`, run one second later, would find
five. One probe, one depth, one answer.

### REQ-WS-002 — One conditional question, interactive only, defaulting to no

**Decision.** With the offer armed and the run interactive, init asks exactly one
`confirm` (`src/cli/kit/prompts.ts:198-206`):

> `N repositories found under this directory. Create a workspace.json so one
> policy reaches all of them? [y/N]`

`defaultYes: false`. A `yes` runs the same guided selection `stamity workspace
init` runs (REQ-WS-006), asked before `applyInit` with every other prompt; the
resulting `workspace.json` is written AFTER `applyInit` returns successfully. A
`no` writes nothing and prints nothing further.

This is a conditional prompt in the `askProceedWithoutGit` shape
(`src/cli/commands/init.ts:242-264`): gated on a detected precondition, outside
the two-question ordinary-path ceiling, and asked last. Both conditional
prompts may fire in one run — a directory can be both non-git and
workspace-shaped — and the module header at `src/cli/commands/init.ts:54-58`,
which currently says "a third", is rewritten to describe both in the same change.

**Rationale.** Default NO because creating `workspace.json` at the root of
somebody's projects directory is consequential in a way `stamity init` is not:
it declares an intent about repositories the operator did not name. It is
reversible — one file, deleted — but noisily so, since the next `workspace sync`
would rewrite manifests in every member. Writing after `applyInit` rather than
before follows from the same reasoning as the existing prompt ordering: a failed
init that left a `workspace.json` behind would leave a workspace with no
initialised root and no explanation.

**Dropped.** Making it a third variant of the existing existing-config moment.
That moment is a decision about ONE repository's files; this is a decision about
several repositories, it fires on a different precondition, and folding them
would make one question's answer bind two unrelated things.

### REQ-WS-003 — A non-interactive init never writes `workspace.json`, and always discloses

**Decision.** On any non-interactive run — piped stdin, `-y`, `--json`
(`src/cli/kit/prompts.ts:63-73`) — with the offer armed, init creates nothing and
prints one disclosure line, on every one of those runs, in the panel and in the
`--dry-run` report alike:

> `workspace: N repositories found under this directory (<paths, capped>). No
> workspace.json was created — this run is not interactive, and declaring a
> policy over repositories you did not name is not an unattended default. Create
> one with \`stamity workspace init\`.`

The JSON document gains the candidate paths and `workspaceCreated: false` under
`decisions` (`src/cli/commands/init.ts:809-826`).

**Rationale.** This is the migrate gate's split, applied to a different decision
and for the same stated reason: the unattended default is the one that changes
nothing, and BOTH outcomes print (`src/cli/commands/init.ts:80-89,420-450`). It
is also the question protocol's unattested-product-decision trigger — the change
would move configuration in repositories the request never named, and no
operator statement authorises it — so the declared default executes and the run
says which one it took.

**Dropped.** Creating the manifest under `-y`. `-y` means "take the defaults for
this repository's setup", and no reading of it reaches a sibling repository's
configuration. Also dropped: staying silent, which is exactly the state where an
operator never learns the surface exists — the gap this lane opened to close.

### REQ-WS-004 — Every other init run is byte-identical

**Decision.** A repository whose `detectWorkspaceContext` is not `standalone`, or
whose `detectSubRepos` returns fewer than two candidates, produces byte-identical
init output to today's: the same panel, the same dry-run report, the same JSON
document keys, the same prompt count, the same files.

**Rationale.** Invariant 5 stated as a testable property, and the same property
the override layer is already held to
(`test/content/catalog.test.ts:486` is the model). It is what makes the whole
lane reviewable: the diff either fires on the detected precondition or it does
not exist.

**Dropped.** A permanent one-line "no workspace detected" note. It would print
on every init in every single repository forever, to say that a feature did not
apply.

### REQ-WS-005 — `stamity workspace` is one command module with three subcommands

**Decision.** A ninth `CommandModule` (`src/cli/kit/program.ts:111-124`)
registered in `COMMANDS` (`src/cli.ts:43-52`) after `config` and before `clean`,
so `clean` stays last on the advertised surface and `learn` last overall:

```
workspace              status, on every stream
workspace status       every declared member, its state, and what it resolves to
workspace init         guided creation of workspace.json at this directory
workspace sync         run the cascade over every member
```

`mutating: true` — `init` writes `workspace.json` and `sync` rewrites member
manifests and regenerates member files — so `--dry-run` registers
(`src/cli/kit/program.ts:54-56`). Dispatch is positional over `args[0]` with a
`USAGE` `CliFailure` on anything else, naming the three
(`src/cli/commands/config.ts:1086-1104`). Every argument carries a description,
because the reference generator throws without one
(`src/cli/docs/cliReference.ts:418-421`).

Bare `workspace` is `status` on EVERY stream, terminal included — it grows no
interactive picker.

**Rationale.** One verb over three subcommands rather than three top-level verbs:
they share a subject (`workspace.json` at the cwd), a read (the validated
manifest), and a refusal (no manifest here), and `config` already established
that shape for exactly that reason (`src/cli/commands/config.ts:65-96`). Bare
`workspace` is the read because a workspace has no key registry to navigate —
`config`'s picker exists to let an operator find a key they cannot spell
(`src/cli/commands/config.ts:785-794`), and there is no equivalent here.

**Dropped.** Folding the cascade into `stamity sync` as a `--workspace` flag.
`sync` refuses outright in a repository with no `.stamity/manifest.json`
(`src/cli/commands/sync/engine.ts:460-465`), and a workspace root frequently is
not an initialised repository at all — a fact `validate` already had to write
down (`src/cli/commands/validate.ts:473-476`). The flag would have to disable
the verb's own precondition, which is a second command wearing the first one's
name.

### REQ-WS-006 — `workspace init` is guided creation with exactly one question

**Decision.** In order:

1. `detectSubRepos(rootDir)` at the default depth (`src/workspace/detect.ts:114-146`).
2. ONE `selectMany` (`src/cli/kit/prompts.ts:305-314`) over the candidates in
   scan order, every candidate preselected, each row labelled with its
   root-relative path and its markers — `.git`, `.stamity`, or both — read off
   `DetectedRepo` (`src/workspace/detect.ts:65-74`). An empty selection is a
   real answer: nothing is written, one line says so, exit 0.
3. `defaults.tools` is DERIVED, not asked: the union of the selected members'
   own `tools` (`src/types/manifest.ts:200-201`), normalised to `TOOLS` order,
   falling back to `["claude"]` — the same `DEFAULT_TOOL` init falls back to
   (`src/cli/commands/init.ts:109`) — when no selected member carries a
   manifest. A `--tools <csv>` flag overrides it, spelled and validated exactly
   as init's is (`src/cli/commands/init.ts:594`, `src/cli/commands/init/plan.ts:177-198`).
4. The manifest is built by `createWorkspaceManifest(defaults, repos)`
   (`src/workspace/manifest.ts:460-469`) and written by `writeWorkspaceManifest`
   (`src/workspace/manifest.ts:440-453`).
5. The run prints the written path, the member count, the resolved tool list,
   and the next step `stamity workspace sync`.

`groups`, `lockedContent`, `defaults.selection`, `defaults.maturityTier`,
`defaults.mcp` and per-member `overrides` are not asked and not written. They are
optional in the schema (`src/workspace/model.ts:92-105`) and are hand-authored
into a file this command just created.

**Rationale.** One question, because the second one is answerable from evidence
and this repository's stated posture is detection over asking
(`src/cli/commands/config.ts:90-93`). UNION rather than intersection for the tool
list: `defaults` is the baseline every member inherits before its own overrides
(`src/workspace/model.ts:30-31,64-69`), so union preserves what each member
already had and lets a member narrow itself; intersection would silently drop a
client one member was already targeting, and the first cascade would then reclaim
that client's files. Building through `createWorkspaceManifest` rather than an
object literal means the guided path cannot mint a shape the writer refuses.

**Dropped.** A multi-question wizard covering groups and locks. Groups and locks
are policy an operator writes once they have members and a reason; asking for
them at creation time asks somebody to design a policy for repositories they
have not yet synced. Also dropped: writing `defaults.selection`, for
REQ-WS-013's reason — it is state nothing reads.

### REQ-WS-007 — `workspace init`'s refusal matrix, and the one flag that opens it

**Decision.**

| Condition | Outcome |
|---|---|
| `workspace.json` already at the cwd | `VALIDATION_ERROR`, naming the path; `--force` overwrites |
| the cwd is a member of an outer workspace | `VALIDATION_ERROR`, naming the outer root and its manifest; `--force` proceeds |
| zero candidates found | `VALIDATION_ERROR`, naming the scan depth and the two markers a candidate carries |
| exactly one candidate | proceeds — one member is a workspace with room to grow |
| non-interactive (`-y`, `--json`, piped) | proceeds, taking every candidate, and prints the full member list it wrote |

Both refusals are lifted by one `--force` flag, spelled as init's is
(`src/cli/commands/init.ts:614`).

**Rationale.** The first two conditions are the two ways an operator reaches this
verb by accident, and both are recoverable facts rather than errors — the engine
supports a nested workspace by design, since the NEAREST manifest wins for the
directories below it (`src/workspace/detect.ts:152-157`) — so they refuse and
name the flag rather than refusing absolutely. Zero candidates refuses even
though the schema accepts an empty `repos[]`
(`src/workspace/manifest.ts:266-268`): guided creation over an empty list guides
nothing, and the message tells an author the file can be written by hand.

The non-interactive row is the deliberate ASYMMETRY with REQ-WS-003, and the
distinction is sharp: an unattended `stamity init` never named a workspace, so
creating one would be a side effect; an unattended `stamity workspace init`
named the verb, and its declared default — every detected candidate — is
disclosed in full in the same run. Nothing is overwritten without `--force`, so
no destructive-confirmation gate applies (`src/cli/commands/clean.ts:133-160`
is the shape that would apply if one did).

The suggestion threshold and the verb threshold differ on purpose: two
repositories to OFFER unprompted (`src/workspace/detect.ts:47-52`), one to
proceed when asked. An explicit invocation is its own signal.

**Dropped.** Refusing a nested workspace outright. The engine's own resolution
rule was designed for nesting; a command that forbids what the engine models is
the surface disagreeing with the machine.

### REQ-WS-008 — `workspace status` reports one row per declared member, in five states

**Decision.** `status` reads the manifest through `readWorkspaceManifest`
(`src/workspace/manifest.ts:401-426`) and prints one row per `repos[]` entry, in
declaration order:

| State | Condition |
|---|---|
| `ok` | the directory is present, contained, and holds `.stamity/manifest.json` |
| `unconfigured` | present and contained, no member manifest |
| `absent` | no directory there, or the path is not a directory |
| `escaped` | resolves outside the workspace root through a link |
| `unresolved` | `resolveRepoConfig` refused the entry |

Each row carries the declared path, the state, the tools the member resolves to,
the group names that matched, and `lockedApplied` when non-empty
(`src/workspace/resolve.ts:30-48`). `absent` and `escaped` are decided by the
same two conditions `requireRepoDirectory` fails a cascade row on
(`src/workspace/sync.ts:357-404`); `unresolved` is `resolveRepoConfig`'s
`VALIDATION_ERROR` for an undefined group name
(`src/workspace/resolve.ts:172-197`), caught per row and printed with its message.

`status` exits 0 whenever it could read the manifest, whatever the rows say.

There is no `duplicate` state. Two entries naming one directory are refused at
READ time (`src/workspace/manifest.ts:276-289`), and status reads through that
gate, so the state is unreachable here — the cascade's own duplicate skip
(`src/workspace/sync.ts:254-265`) exists for manifests constructed in memory.

**Rationale.** The five states are the five outcomes the engine itself
distinguishes; inventing a sixth would mean status reporting a condition nothing
downstream acts on. Exit 0 unconditionally because a report is not a gate, and
this workspace already has two gates: `validate` fails on the manifest's field
defects (`src/cli/commands/validate.ts:490-493`, error-severity findings), and
`workspace sync` fails the row and the run (REQ-WS-012). A third gate disagreeing
with either about severity is how a CI step starts getting ignored.

**Dropped.** Exiting 1 on an `absent` member. It is the reading a CI author would
want, and it makes `status` a gate that fires on a tree fact — a member not yet
cloned — while `validate` stays green on the same repository. `workspace sync`
is the gate, and it fails for a reason it can also name a fix for.

### REQ-WS-009 — The root's own manifest is informative, and never a cascade target

**Decision.** `status` prints one `root` line above the member rows: the
workspace root's path, and whether it carries a `.stamity/manifest.json` of its
own. The line is marked informative. No subcommand ever syncs the root, resolves
a config for it, or registers it.

**Rationale.** This is invariant 2 made visible rather than a new decision. The
root cannot be a member by construction — `detectSubRepos` scans children and
excludes the root explicitly (`src/workspace/detect.ts:97-99`), and a `repos[]`
path naming the root spells as `""` or `"."`, both classified `empty` and refused
(`src/workspace/manifest.ts:56,73-81`). The line exists because the state is
otherwise invisible and confusing in both directions: a root that IS an
initialised repository looks like an unlisted member, and a root that is not
looks broken to an operator who ran `stamity init` there and saw nothing.

**Dropped.** Allowing the root to register itself as `"."`. It would need the
path gate widened for one case, and the widened gate is the one that also admits
every other spelling of "outside the tree the cascade is confined to".

### REQ-WS-010 — The last unterminated cascade renders in `status`, from a bounded tail

**Decision.** `status` reads the tail of
`<root>/.stamity/workspace-sync-journal.jsonl`
(`src/workspace/sync.ts:68,289-293`) — the last bounded window of bytes, not the
file — and prints at most one line: the most recent `started` entry carrying a
`run` id with no `finished` or `skipped` entry for that same `run` and `repo`.
The line names the member, the run id and the timestamp, and says its tree may
be half-written.

An absent journal, an unreadable one, a malformed line, and a window that starts
mid-line each print nothing. Nothing is written back, rotated or truncated.

**Rationale.** The journal already carries exactly this signal and says so — "a
`started` with no terminal line names the member that was in flight when the
process died" (`src/workspace/sync.ts:44-48`) — and the `run` id exists
precisely so a reader can tell this run's unterminated line from one left three
runs ago (`src/workspace/sync.ts:118-123`). Today nothing reads it back, so the
forensics the cascade pays for on every member are reachable only by opening a
JSONL file by hand. Rendering it in `status` is the smallest surface that makes
the cost worth paying, and it keeps the journal diagnostic-only: it is displayed,
never acted on (invariant 6).

**Dropped.** Selective resume from the journal — skipping members whose last run
finished `ok`. It is a named non-goal below, and it would turn a best-effort
audit file into a correctness input: the journal is disabled for the rest of a
run after its first write failure (`src/workspace/sync.ts:281-288,296-303`), so a
resume reading it would silently re-run or silently skip depending on whether an
unrelated append succeeded.

### REQ-WS-011 — The bridge: the cascade writes workspace-resolved values into the member's own manifest, then syncs it

**Decision.** The `RepoSyncCallback` (`src/workspace/sync.ts:148-151`) this lane
supplies does, per member, in order:

1. `readManifest(memberDir)` (`src/manifest/manifest.ts:782`). `null` fails the
   row (REQ-WS-012).
2. Compute the patch: `tools` from `resolved.tools`, `maturityTier` from
   `resolved.maturityTier` when the workspace declares one, `mcp` from
   `resolved.mcp` when the workspace declares one
   (`src/workspace/resolve.ts:30-48`). A field the workspace does not declare is
   left exactly as the member has it.
3. If the patch changes nothing, write nothing.
4. Otherwise apply the patch to the manifest READ FROM DISK and write it back
   with `writeManifest` (`src/manifest/manifest.ts:827-841`), which validates
   before persisting and writes atomically.
5. `planSync(memberDir, engineVersion)` then `applySync(memberDir, plan, …)`
   (`src/cli/commands/sync/engine.ts:455,653`), passing this run's `force`,
   `dryRun` and clock through.
6. A member whose apply refused at least one path throws `EngineError`
   (`ADAPTER_ERROR`) naming the refused paths, so the row is `failed` — the same
   verdict `stamity sync` reaches for the same condition
   (`src/cli/commands/sync.ts:118-121`).

Step 4 patches the manifest read in step 1. It never composes a fresh one.

**Rationale.** Persistent beats ambient, and the argument is concrete rather than
aesthetic: with the values written down, a member is correct when somebody runs
plain `stamity sync` inside it — which is the single most likely thing to happen
next, and the reason ordinary-command workspace awareness is a non-goal rather
than a gap. "Propagating policy" means the workspace's values BECOME the
member's values; anything else means the member's real configuration and the
workspace's intent disagree the moment either is inspected.

Patching the disk manifest rather than composing one is load-bearing, not
defensive: `SetupManifest` carries `ledger`, `importChoice`, `createdAt` and
`hooks` (`src/types/manifest.ts:191-219`), and a composed manifest missing the
ledger would make every emitted path unowned — after which the reclaim sweep and
the collision gate would both act on that emptiness. `writeManifest`'s own
validation is what keeps a bad patch from persisting at all.

**Dropped.** In-memory overrides through a widened `planSync` signature. It is
smaller in the diff and wrong in the outcome: every member drifts back the moment
anyone runs `sync` inside one, and nothing on disk records that a workspace ever
had an opinion. A third shape was looked for and rejected: driving each field
through `setConfigValue` (`src/cli/commands/config.ts:643-663`) reuses the
key registry, but it throws `CliFailure` — a CLI type — from an engine callback,
re-validates the whole manifest once per key, and addresses fields by string name
where the resolved config already has them typed.

### REQ-WS-012 — A member with no readable setup manifest fails its row, by name

**Decision.** `readManifest` returning `null` for a registered member fails that
row with `EngineError` (`VALIDATION_ERROR`) reading:

> `Workspace member "<path>" has no setup manifest at <memberDir>/.stamity/manifest.json.
> Run \`stamity init\` in it, or drop the entry from repos[] in workspace.json.`

A manifest that exists and does not parse propagates the reader's own
`CONFIG_ERROR` unchanged (`src/manifest/manifest.ts:777-780`). Both are one row;
the cascade continues.

**Rationale.** Posture parity with `requireRepoDirectory`, which fails the row
rather than the run and names both remedies in the same sentence — clone it, or
drop the entry (`src/workspace/sync.ts:366-369`). Initialising the member
implicitly was the alternative and it is the wrong one: `stamity init` makes
decisions about a repository (tools, migration, existing config files) that a
cascade over somebody else's repository has no standing to make unattended.
Classifying it `VALIDATION_ERROR` rather than `FS_ERROR` says the manifest is
wrong about the world, not that the filesystem failed.

**Dropped.** Skipping an unconfigured member as `skipped`. Skips are excluded
from the verdict entirely (`src/workspace/sync.ts:214-222`), so a workspace whose
members were never initialised would report `passed` having propagated nothing.

### REQ-WS-013 — Three fields propagate; `selection` and `lockedContent` are reported, not written

**Decision.** The cascade writes `tools`, `maturityTier` and `mcp` into a member
manifest and nothing else. `resolved.selection` and `resolved.lockedApplied` are
carried into the report — the member row names any locked id whose removal the
lock refused — and are written nowhere.

The report and the shipped documentation say so in one sentence: selection deltas
and locked content are resolved and reported, and do not yet change an emitted
file.

**Rationale.** `planSync` overwrites the manifest's selection with the full
corpus on every run (`src/cli/commands/sync/engine.ts:476`, stated at
`src/cli/commands/sync/engine.ts:241-243`), so a written selection would be
overwritten before it was read — state nothing reads, which is the defect a
ledger field for an unread flag would have been. `lockedContent` guards
`removeItems` against that same selection
(`src/workspace/resolve.ts:111-123`), so it is inert for the same reason and not
for a second one. Reporting rather than silently dropping is what keeps the
manifest honest: an author who writes `lockedContent` sees in `status` that it
resolved, and sees in the documentation that it does not yet bite.

**Dropped.** Writing the resolved selection anyway, "so it is there when
selection becomes a filter". It would make every member's manifest disagree with
its own next sync, and the first person to diff one would file the disagreement
as a bug.

### REQ-WS-014 — Every cascade is a full re-run

**Decision.** `workspace sync` runs every declared member every time. No member
is skipped because a previous run succeeded, because its files look current, or
because the journal says so. Concurrency is the cascade's default
(`src/workspace/sync.ts:234-237`) with no flag in v1.

**Rationale.** A member's own `applySync` is already only-when-stale — a
semver-equal re-run reports every path `unchanged` and bumps no mtime
(`src/cli/commands/sync/engine.ts:70-73`) — so the idempotence a resume would buy
is already bought one layer down, at the layer that can actually tell whether a
file is current. Adding a second, coarser skip on top would be a cache over a
correct computation, keyed on a best-effort audit file (REQ-WS-010's dropped
alternative).

**Dropped.** Selective resume, and a `--only <path>` filter. Both are named
non-goals below; the second is a smaller and more defensible follow-up than the
first.

### REQ-WS-015 — `--dry-run` previews all three subcommands and writes nothing anywhere

**Decision.**

- `workspace init --dry-run` runs the scan and the selection question, prints the
  manifest it would write in full, and writes nothing.
- `workspace status --dry-run` is `status` — it is a read, and the flag is inert.
- `workspace sync --dry-run` resolves every member, reports the manifest patch it
  WOULD apply per member and the plan `planSync` produced, writes no member
  manifest, applies no emission, and passes `journal: false`
  (`src/workspace/sync.ts:162,289-291`) so a preview leaves no journal line
  claiming a run happened.

**Rationale.** `--dry-run` registers because the module is `mutating`
(`src/cli/kit/program.ts:54-56`), and a preview that omitted the manifest patch
would omit the half of this verb an operator most needs to see before running it.
Disabling the journal under a preview is the sharp case: the journal's whole
value is that a `started` line with no terminal line means a crash, and a dry run
appending one would manufacture that signal.

**Dropped.** Journalling dry runs under a `dryRun: true` field on the line. The
entry type is a closed union with no such field (`src/workspace/sync.ts:132-141`),
and widening an audit format so it can record non-events is the wrong direction.

### REQ-WS-016 — One JSON document per subcommand, and the 0/1/2 exit contract

**Decision.** Every subcommand returns exactly one JSON document
(`src/cli/kit/program.ts:39-46`):

| Subcommand | Document |
|---|---|
| `status` | the root line, the member rows with their states and resolutions, and the journal line when one exists |
| `init` | the written path, the member list, the resolved defaults, and `created` |
| `sync` | the cascade's own result — `outcome`, `counts`, `repos[]` with each row's `state`, `error.code` and `error.message` — plus `journalWarnings` (`src/workspace/model.ts:140-145`, `src/workspace/sync.ts:173-188`) |

Exit statuses are 0, 1 and 2 only. `status` exits 0 whenever it read the
manifest. `init` exits 0 on a write, 0 on an empty selection, and 1 on any
refusal. `sync` exits 0 on `outcome: "passed"` and 1 on `partial` or `failed`
(`src/workspace/model.ts:107-112`). Commander's own parse failures exit 2 without
reaching the command (`src/cli/kit/program.ts:41-44`). No classification travels
in a status number; it travels as `error.code`
(`src/types/errors.ts:6-13`).

**Rationale.** The contract is the kit's, restated only where this verb has a
choice: `partial` exiting 1 is that choice, and it matches `stamity sync`'s
partial-apply verdict — some of the plan is on disk, and the status reports the
remainder (`src/cli/commands/sync.ts:20-24,118-121`). Publishing the cascade
result verbatim rather than reshaping it means the documented JSON shape and the
engine type cannot drift.

**Dropped.** Exiting 0 on `partial`. A workspace lead running this in CI would
get a green run for a cascade that reached half its members.

### REQ-WS-017 — `check` gains nothing, and every count and list moves in one change

**Decision.** `stamity check` is unchanged: no workspace probe, no workspace
drift row. In the same change that lands the verb:

- `src/cli.ts:26` stops saying "the eight CommandModules".
- `src/cli.ts:41-42` names `workspace` in the advertised surface.
- `docs/getting-started.md:103-105` becomes "The eight verbs" and lists
  `workspace`; `docs/getting-started.md:113` calls `learn` "a ninth".
- The hand-maintained containment array at `test/docsPages.test.ts:960` gains
  `"workspace"`.
- `docs/cli-reference.md` is regenerated (`src/cli/docs/cliReference.ts:466-470`).

**Rationale for the `check` half.** `check`'s subject is THIS repository's
environment and drift (`src/cli/commands/check.ts:28-29`), and a workspace root
is frequently not an initialised repository at all — the fact `validate` already
had to record (`src/cli/commands/validate.ts:473-476`). The two questions a
workspace probe would answer are answered already: manifest field defects by
`validate`'s workspace section (`src/cli/commands/validate.ts:184-186,478-493`),
and member truth by `status`. A third answer is a third opinion.

**Rationale for the rest.** The array at `test/docsPages.test.ts:960` is a
literal list, not a derivation from `COMMANDS`, so nothing fails when it goes
stale in the direction that matters — a verb missing from the prose. Naming it
here is the mitigation, and the regenerated reference page has its own byte gate
(`test/cli/docs/cliReference.test.ts:81`) that fails loudly until it is rerun.

**Dropped.** Deriving the getting-started array from `COMMANDS` in the same
change. It is the right fix and it is a different lane's: the pin covers prose
containment for a hand-written page, and turning it into a derivation changes
what that suite asserts about every verb, not just this one.

## Acceptance criteria

One set per requirement. Forty-three criteria; each is machine-checkable unless
tagged otherwise.

**REQ-WS-001**

- GIVEN a directory holding three sibling repositories and no `workspace.json`
  WHEN `stamity init` runs THEN the offer is armed with exactly those three
  candidate paths, in scan order.
- GIVEN a directory that already holds a `workspace.json` WHEN `stamity init`
  runs THEN the offer is not armed and `detectSubRepos` is never called.
- GIVEN a working directory two levels below a `workspace.json` WHEN
  `stamity init` runs THEN the offer is not armed.
- GIVEN a directory holding exactly one repository WHEN `stamity init` runs THEN
  the offer is not armed.

**REQ-WS-002**

- GIVEN an armed offer and an interactive terminal WHEN `stamity init` runs and
  the operator answers `n` THEN no `workspace.json` exists afterwards and the
  init output is otherwise byte-identical to the same run with the offer
  disarmed.
- GIVEN an armed offer and an interactive terminal WHEN the operator answers `y`
  and selects two of three candidates THEN `workspace.json` holds exactly those
  two `repos[]` entries.
- GIVEN an armed offer, an interactive `y`, and an `applyInit` that throws WHEN
  the run ends THEN no `workspace.json` was written.
- GIVEN an armed offer WHEN the confirm is rendered THEN its default is `[y/N]`.

**REQ-WS-003**

- GIVEN an armed offer WHEN `stamity init -y` runs THEN no `workspace.json`
  exists afterwards and stdout contains the disclosure line naming the candidate
  count and `stamity workspace init`.
- GIVEN an armed offer WHEN `stamity init --json` runs THEN the single document's
  `decisions` carries `workspaceCreated: false` and the candidate paths, and no
  `workspace.json` exists.
- GIVEN an armed offer WHEN `stamity init` runs with piped stdin THEN the
  disclosure line is printed and no question is asked.

**REQ-WS-004**

- GIVEN a repository with no sibling repositories WHEN `stamity init` runs before
  and after this change THEN stdout, stderr, the `--json` document's key set, the
  written file list and the prompt count are byte-identical.
- GIVEN a repository with two sibling repositories and a `workspace.json` at its
  root WHEN `stamity init --json` runs THEN the document is byte-identical to the
  pre-change run.

**REQ-WS-005**

- GIVEN the built CLI WHEN `stamity --help` runs THEN `workspace` appears between
  `config` and `clean`.
- GIVEN `stamity workspace frobnicate` WHEN it runs THEN it exits 2 with a
  `USAGE` failure naming `status`, `init` and `sync`.
- GIVEN `stamity workspace` with no subcommand, on a TTY and on a pipe WHEN it
  runs THEN both produce the `status` output, byte for byte.
- GIVEN the command module WHEN `renderCliReference()` runs THEN it does not
  throw, and every registered argument has a description.

**REQ-WS-006**

- GIVEN two detected candidates whose manifests target `claude` and `cursor`
  respectively WHEN `workspace init` completes THEN `defaults.tools` is
  `["claude", "cursor"]` in `TOOLS` order.
- GIVEN two detected candidates neither of which carries a setup manifest WHEN
  `workspace init` completes THEN `defaults.tools` is `["claude"]`.
- GIVEN `workspace init --tools codex` WHEN it completes THEN `defaults.tools` is
  `["codex"]` regardless of what the members carry.
- GIVEN an interactive `workspace init` where every box is cleared WHEN it
  completes THEN no file is written, exit is 0, and the output says nothing was
  created.
- GIVEN a completed `workspace init` WHEN the written file is read back by
  `readWorkspaceManifest` THEN it parses with zero validation errors and carries
  exactly the keys `version`, `defaults` and `repos`.

**REQ-WS-007**

- GIVEN a `workspace.json` at the cwd WHEN `workspace init` runs THEN it exits 1
  with `VALIDATION_ERROR` naming that path, and the file is unchanged.
- GIVEN the same, WHEN `workspace init --force` runs THEN the file is overwritten
  with the new selection.
- GIVEN a cwd below an outer workspace root WHEN `workspace init` runs THEN it
  exits 1 naming the outer root and its manifest path.
- GIVEN a directory holding no repositories WHEN `workspace init` runs THEN it
  exits 1 with a message naming the scan depth and both candidate markers.
- GIVEN two detected candidates WHEN `workspace init -y` runs THEN
  `workspace.json` registers both and stdout names both paths.

**REQ-WS-008**

- GIVEN a manifest registering `a` (present, with a setup manifest), `b`
  (present, without one), `c` (no such directory) WHEN `workspace status` runs
  THEN the rows read `ok`, `unconfigured`, `absent` in that order, and the exit
  status is 0.
- GIVEN a registered member that is a symbolic link to a directory outside the
  workspace root WHEN `workspace status` runs THEN its row reads `escaped` and
  the exit status is 0.
- GIVEN a member naming a group the manifest does not define WHEN
  `workspace status` runs THEN its row reads `unresolved` and carries
  `resolveRepoConfig`'s own message.
- GIVEN a member in a group that adds a tool WHEN `workspace status` runs THEN
  its row's tools are the resolved list, not `defaults.tools`.
- GIVEN a manifest whose `repos[]` registers `api` and `./api` WHEN
  `workspace status` runs THEN it exits 1 at the READ, naming both spellings —
  no row is printed.

**REQ-WS-009**

- GIVEN a workspace root carrying its own `.stamity/manifest.json` WHEN
  `workspace status` runs THEN the root line reports it and no member row names
  the root.
- GIVEN that same root WHEN `workspace sync` runs THEN the root's manifest and
  emitted files are untouched.

**REQ-WS-010**

- GIVEN a journal whose last lines are a `started` for run `R` on `apps/web` and
  no terminal line for that pair WHEN `workspace status` runs THEN exactly one
  journal line is printed, naming `apps/web` and `R`.
- GIVEN a journal where every `started` has a matching terminal line WHEN
  `workspace status` runs THEN no journal line is printed.
- GIVEN no journal file, and separately a journal whose last line is truncated
  mid-JSON WHEN `workspace status` runs THEN it exits 0, prints no journal line,
  and the file is unmodified.

**REQ-WS-011**

- GIVEN a workspace declaring `defaults.tools: ["claude", "codex"]` and a member
  whose manifest carries `tools: ["claude"]` WHEN `workspace sync` runs THEN the
  member's `.stamity/manifest.json` reads `tools: ["claude", "codex"]` AND the
  member's tree holds the codex emission.
- GIVEN that member afterwards WHEN `stamity sync` is run inside it directly THEN
  the codex emission survives and no path is reported as reclaimed.
- GIVEN a member whose manifest already matches the resolved values WHEN
  `workspace sync` runs THEN the member manifest's bytes are unchanged, its
  `updatedAt` did not move, and the row is `synced`.
- GIVEN a member manifest carrying a populated `ledger` and an `importChoice`
  WHEN `workspace sync` rewrites it THEN both survive byte-identically.
- GIVEN a workspace declaring no `maturityTier` and a member carrying `scaleup`
  WHEN `workspace sync` runs THEN the member still carries `scaleup`.
- GIVEN a member whose apply refuses one colliding path WHEN `workspace sync`
  runs THEN that member's row is `failed`, its error message names the refused
  path, and every other member's row is `synced`.

**REQ-WS-012**

- GIVEN a registered member directory with no `.stamity/manifest.json` WHEN
  `workspace sync` runs THEN its row is `failed` with code `VALIDATION_ERROR`,
  the message names the member path and `stamity init`, and no file was written
  in that member.
- GIVEN three members, the middle one unconfigured WHEN `workspace sync` runs
  THEN the outer two are `synced`, the outcome is `partial`, and the exit status
  is 1.
- GIVEN a member whose `.stamity/manifest.json` is malformed JSON WHEN
  `workspace sync` runs THEN its row carries `CONFIG_ERROR` and the reader's own
  message.

**REQ-WS-013**

- GIVEN a workspace declaring `defaults.selection` WHEN `workspace sync` runs
  THEN no member manifest gains that selection — each member's `selection` is
  whatever its own sync derived.
- GIVEN a member whose `overrides.removeItems` names a locked id WHEN
  `workspace sync` runs THEN that id appears in the member's row as
  `lockedApplied` and the emitted files are unaffected.
- GIVEN the shipped documentation for `workspace sync` WHEN it is read THEN it
  states that selection deltas and locked content are resolved and reported and
  do not yet change an emitted file. *(judgment: reviewer — prose accuracy is
  not machine-checkable.)*

**REQ-WS-014**

- GIVEN a workspace whose last cascade succeeded for every member WHEN
  `workspace sync` runs again THEN every member is attempted, every row is
  `synced`, and no member's emitted files changed mtime.
- GIVEN a journal recording a completed run WHEN `workspace sync` runs THEN the
  member set attempted is identical to the set attempted with the journal file
  deleted.

**REQ-WS-015**

- GIVEN two candidates WHEN `workspace init --dry-run` runs THEN the manifest it
  would write is printed and no `workspace.json` exists afterwards.
- GIVEN a workspace with two configured members WHEN `workspace sync --dry-run`
  runs THEN each member's manifest bytes are unchanged, no emitted file is
  written, and `<root>/.stamity/workspace-sync-journal.jsonl` gains no line
  (and is not created).
- GIVEN a member whose resolved tools differ from its manifest's WHEN
  `workspace sync --dry-run` runs THEN the output names the patch it would apply.

**REQ-WS-016**

- GIVEN each of `workspace status`, `workspace init` and `workspace sync` WHEN
  run with `--json` THEN stdout parses as exactly one JSON document.
- GIVEN a cascade where one member of three failed WHEN `workspace sync --json`
  runs THEN the document carries `outcome: "partial"`, `counts.failed: 1`, the
  failing row's `error.code`, and the process exits 1.
- GIVEN a cascade where every member succeeded WHEN `workspace sync` runs THEN
  the exit status is 0.
- GIVEN any failing subcommand WHEN it exits THEN the status is 1, never a
  sysexits number, and the class is in `error.code`.

**REQ-WS-017**

- GIVEN the change WHEN `stamity check` runs in a workspace root and in a member
  THEN its probe list, its output and its exit status are byte-identical to the
  pre-change run.
- GIVEN the change WHEN the docs-pages suite runs THEN the getting-started
  containment array includes `workspace` and the page contains `` `workspace` ``.
- GIVEN the change WHEN the CLI-reference drift gate runs THEN the committed
  `docs/cli-reference.md` matches the render and carries a `workspace` section.
- GIVEN `src/cli.ts` after the change WHEN it is read THEN neither count comment
  says "eight". *(judgment: reviewer — the count is prose; the reference gate
  covers the machine-checkable half.)*

## Non-goals for v1

Named so a later change can add them deliberately rather than discover them:

- **Workspace-aware ordinary commands.** `stamity init` and `stamity sync` run
  inside a member behave exactly as they do today. This is the largest deliberate
  omission, and it has two reasons. It is a second integration surface with its
  own precedence question — when a member's own manifest and its workspace
  disagree, which wins, and does a member sync re-read `workspace.json` at all?
  And REQ-WS-011's persistent write makes it mostly unnecessary: the member's
  manifest already IS the propagated policy, so a plain sync inside a member
  already emits what the workspace decided.
- **Selective resume from the journal**, and any skip based on it (REQ-WS-014).
- **A member filter** — `workspace sync --only <path>`. Smaller and more
  defensible than resume; still not v1.
- **Editing `workspace.json` through the CLI.** No `workspace add`, no
  `workspace remove`, no `workspace set`. Groups, locks and overrides are
  hand-authored; `validate` already reports their defects.
- **`check` awareness of any kind** (REQ-WS-017).
- **A shared content index across the cascade.** Each member's `planSync` builds
  the corpus index itself (`src/cli/commands/sync/engine.ts:473`), so an
  N-member cascade pays N builds. Widening `planSync` to accept a prebuilt index
  is a real optimisation and a separate change.
- **Journal rotation or pruning.** The file is append-only across runs and
  nothing trims it (see Risks).
- **Registering the workspace root as a member** (REQ-WS-009).
- **Propagating `selection` or `lockedContent` to emission** (REQ-WS-013). That
  arrives with whatever change makes selection a filter.

## Test plan sketch

The suites that extend, and what each takes:

- `test/workspace/` — the engine suites already use real temp directories and
  local helpers (`test/workspace/sync.test.ts:24,54`). The bridge callback gets a
  block there: the patch computation, the no-op write skip, the ledger and
  `importChoice` survival, and the absent-manifest failure (REQ-WS-011, 012, 013).
- `test/cli/commands/workspace.test.ts` — new, on the command-test pattern
  (`runCli` / `runInProcess` over a temp dir with a menu TTY, no mocks including
  the emission planner). Carries the dispatch and refusal matrix (REQ-WS-005,
  007), the status row states and the root line (REQ-WS-008, 009), the journal
  line and its three silent cases (REQ-WS-010), the dry-run trio (REQ-WS-015) and
  the JSON/exit contract (REQ-WS-016).
- `test/cli/commands/init.test.ts` — the four probe cases (REQ-WS-001), the
  interactive question and its default (REQ-WS-002), the three non-interactive
  disclosure cases (REQ-WS-003), and the byte-identity pair (REQ-WS-004).
- `test/cli/docs/cliReference.test.ts` — the existing drift gate fails until the
  page is regenerated; the `workspace` section's arguments and flags are asserted
  there (REQ-WS-017).
- `test/docsPages.test.ts` — the containment array at line 960 gains
  `"workspace"` in the same change as the prose (REQ-WS-017).
- `test/cli/commands/check.test.ts` — unchanged, and that is the assertion:
  the existing probe-list case is what pins REQ-WS-017's `check` half.

## References

Cited as `path:line` against the tree at the time of writing; line numbers drift
and the surrounding symbol is the durable address.

| Pointer | Target | Why |
|---|---|---|
| `source` | `src/workspace/model.ts:20-105` | the manifest shape every requirement is written against |
| `source` | `src/workspace/detect.ts:114-146,166-184,213-217` | the three probes REQ-WS-001 and REQ-WS-006 call |
| `source` | `src/workspace/manifest.ts:401-469` | read, write, and the constructor the guided path uses |
| `source` | `src/workspace/resolve.ts:30-97` | the resolved config the bridge patches from |
| `source` | `src/workspace/sync.ts:148-151,357-472` | the callback seam, the containment gate, the cascade |
| `source` | `src/cli/commands/sync/engine.ts:455,476,653` | `planSync`, the selection overwrite, `applySync` |
| `source` | `src/manifest/manifest.ts:782,827-841` | the member-manifest read and the validating atomic write |
| `source` | `src/cli/commands/init.ts:54-58,242-264,632-635,719-734` | the prompt ceiling, the conditional-prompt precedent, the detection round, the write boundary |
| `source` | `src/cli/commands/config.ts:1049-1105` | the subcommand-dispatch and USAGE-refusal pattern |
| `source` | `src/cli/kit/program.ts:28-60,111-124` | the exit contract, the flag matrix, the module type |
| `source` | `src/cli/kit/prompts.ts:63-73,198-206,305-314` | the gate, `confirm`, `selectMany` |
| `source` | `src/cli/commands/validate.ts:184-186,473-494` | the workspace section that already exists, and why `check` gains none |
| `source` | `src/types/errors.ts:1-47` | the retired sysexits map and the `error.code` channel |
| `test` | `test/workspace/sync.test.ts:24,54` | the engine-suite harness the bridge tests extend |
| `test` | `test/docsPages.test.ts:955-964` | the hand-maintained verb array REQ-WS-017 moves |
| `test` | `test/cli/docs/cliReference.test.ts:81` | the byte gate that fails until the page regenerates |

## Risks

- **The journal grows without bound and nothing prunes it.** Every attempted
  member appends two lines per run, append-only across runs
  (`src/workspace/sync.ts:44-48`). REQ-WS-010 reads a bounded tail so `status`
  cost is flat, but the file itself is unmanaged, and a daily cascade over twenty
  members writes forty lines a day forever. Rotation is a named non-goal; the
  mitigation today is that nothing reads the file to decide anything, so deleting
  it is always safe.
- **A cascade rewrites manifests in repositories the operator did not name in
  this command.** That is the feature, and it is the reason REQ-WS-002 defaults
  to no, REQ-WS-003 refuses unattended creation, and REQ-WS-015 makes the patch
  visible in a preview. The residual is real: `workspace sync` at the wrong
  directory touches every member.
- **N members means N corpus index builds** (`src/cli/commands/sync/engine.ts:473`)
  running at up to eight-way concurrency. On a large workspace this is the
  cascade's dominant cost and it is paid on every run, including one where every
  member is already current. The shared-index widening is the named follow-up.
- **The offer's depth-4 scan runs on every `stamity init` in a standalone
  directory.** REQ-WS-001 bounds it and states the bound rather than hiding it;
  the unbounded-feeling case — a deep repository-free tree — is exactly the case
  that returns nothing and asks nothing, so the cost is paid once per init and
  never converts into a prompt.
- **`lockedContent` reads as enforcement and is currently inert.** The manifest's
  own comment calls it "enforceable instead of advisory"
  (`src/workspace/model.ts:98-104`), which is true of resolution and not yet of
  emission. REQ-WS-013 reports it rather than dropping it, and the documentation
  says which half binds — but an author who reads the interface and not the docs
  will over-trust it until selection becomes a filter.

## Concerns

- This spec is the second file under `docs/specs/`. There is still no
  `docs/specs/manifest.md` deliverable manifest in the tree, so neither spec has
  a manifest row to reconcile against. The manifest is the join key other
  artifacts use; creating it is a separate, single-writer change and should
  happen before a third spec lands.
- The page publishes as an unlisted route, on the same terms the first spec
  recorded: `website/sidebars.ts` lists pages by name and an unlisted page under
  `docs/` still renders, and this page is not a member of the hand-page bucket in
  `test/docsPages.test.ts` (`test/docsPages.test.ts:130`), whose membership is an
  explicit list — so it inherits no currency-header or re-open-trigger contract.
  If that bucket is ever widened to a glob over `docs/`, both specs need both
  before the widening lands.
- Neither spec is indexed in `llms.txt`. That index is asserted to carry every
  GUIDE (`test/docsPages.test.ts:939-941`), and the specs are not guides, so no
  current check requires it. Adding a specs section remains a reasonable
  follow-up.
- Line-number citations drift. `SECURITY.md` retired them for that reason and
  moved to `file::symbol`. This spec keeps them for the same reason the first
  one did: much of the evidence here is a comment block, a constant or a single
  assignment rather than a named export, and a citation that cannot be spelled
  is a claim with no evidence at all. A reader who finds a citation off by a few
  lines should trust the named symbol.
