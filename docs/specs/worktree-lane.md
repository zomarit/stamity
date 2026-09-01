# The managed worktree lane

`stamity worktree setup <name>` creates a parallel-branch checkout with the
machine-local state a checkout cannot carry, records exactly what it wrote, and
`stamity worktree cleanup` inverts that record. This spec designs the lane the
published documentation has already promised and nothing implements.

Every claim about existing behaviour below carries a `path:line` citation taken
from the tree at the time of writing. Citations are code spans rather than
links: they address lines, which no link form can resolve, and a spec that
cannot be checked against the code is prose.

One input is not in this tree and is cited by name instead: the operator-session
memory record `stamity-worktree-reference-study`, a design-grade study of a
reference implementation of the same lane in a predecessor project. That record
lives outside the repository because it quotes identifiers the repository's leak
gate reserves (`scripts/leak-gate.mjs:382-388`, enforced by
`test/ci/leakGate.test.ts`). Nothing below spells those identifiers; where the
reference is cited it is cited as *the reference implementation*, and every
mechanism it contributed is re-designed in this project's own names.

## Intent

Let one clone hold several branches under work at once, each in its own
directory, each usable by an agent session immediately — without the operator
hand-copying machine-local files, and without a teardown that guesses at what
setup created.

`git worktree` already provides the checkout. What it does not provide is the
part of a working repository that is deliberately not committed, the record of
what was placed there, and a teardown that removes exactly that and nothing
else. Those three are the lane.

## Context

### The promise, and where it is written down

`docs/working-with-stamity.md:113-134`, as that page stood BEFORE this change,
was a published section titled "Two
changes at once". It states, in the present tense, that "there is no managed
parallel lane yet", teaches plain `git worktree` as the interim path, names
`.env.mcp` as "the one file that does not follow", and closes: "A managed
worktree lane — lifecycle, receipts, cross-session coordination — is a planned
feature. Until it ships, plain `git worktree` is the path, and this section
becomes a pointer once it does."

That page carries a machine-enforced re-open trigger naming this exact event
(`docs/working-with-stamity.md:5-9` as it then stood: "Re-open when: … the managed worktree lane
ships"), and the page is held to the hand-page contract by
`test/docsPages.test.ts`. So the lane is not a new promise; it is an outstanding
one with a documented closing condition.

Nothing in `src/` implements it. The single occurrence of the word in the engine
is a comment (`src/workspace/detect.ts:70`) recording the fact this spec's
receipt placement depends on: "A `.git` entry is present: a directory for a
clone, a **file** for a worktree or submodule."

### What this project commits, and why that shrinks the problem

The reference implementation gitignored most of its own state, so its
materialization set was large: a state directory symlinked whole, with per-file
copy overrides carved back out of it, plus every adapter's output tree, plus
secrets, plus dependencies. This project made the opposite choice, and it is
documented as a choice: `docs/getting-started.md:151-159` — "Commit it. The
manifest is the provenance record… Everything init writes outside that directory
commits for the same reason — `AGENTS.md`, `.agents/`, and the client trees
`.claude/`, `.cursor/`, `.github/prompts/` and `.codex/` … The one file that is
**not** committed is `.env.mcp`."

The consequence is the central design fact of this lane: **a `git worktree add`
already delivers the entire setup**, because the setup is tracked content and a
checkout carries tracked content. The state table
(`docs/getting-started.md:143-149`) lists five paths — the manifest, learnings,
handoffs, generated hooks, installed packs — and every one of them is committed.
`.gitignore` carries `node_modules/`, `dist/`, `coverage/`, `*.tsbuildinfo`, the
docs site's build output, and `.env*` (`.gitignore:1-13`), and
`REQUIRED_GITIGNORE_ENTRIES` has exactly one member, the credential file
(`src/mcp/env.ts:180`, `src/mcp/env.ts:110`).

So the materialization set here is not a re-derivation of the reference's; it is
two entries and a refusal rule. The reference's three-tier ordering model —
symlink the state directory, copy-override the files an in-worktree sync
rewrites, copy-seed the adapter trees and regenerate them — solves a problem
this project does not have.

### The exit-code contract this lane must be designed on

The reference implementation classified failures with BSD sysexits numbers
(64 usage, 74 I/O, 75 temporary). That contract does not port, and the reason is
recorded in this tree: `src/types/errors.ts:1-13` states that the sysexits
translation "was retired, and the map outlived it as exported public API plus a
nine-row column in the user-facing CLI reference — telling CI authors to branch
on statuses the binary never returns. Both are gone; what remains is the one
field that is real."

What is real: process status is `0` success, `1` failure, `2` command line
rejected before any command ran — "Three, and only three"
(`src/cli/kit/program.ts:29-44`, `src/cli/kit/output.ts:4-11`,
`docs/cli-reference.md:71-83`). Failure KIND travels as the `ErrorCode` string
in the JSON error document (`src/types/errors.ts:38-47`). Status `2` is
unreachable from inside a command body: it is produced only by commander's own
parse rejection before an action runs (`src/cli/kit/program.ts:338-348`), which
is why no refusal designed below claims it.

### The one seam that makes a partial success expressible

`src/cli/kit/program.ts:296-307` is the whole reason REQ-WORKTREE-011 has the
shape it does. A **thrown** failure is rendered by `failureEnvelope`, which
carries `ok`, `command`, `version` and `error` — and nothing the command
computed. A **returned** `{ exitCode: 1, json }` is rendered as
`{ ...result.json, ok: false, command, version }`, so the payload survives. The
type's own comment says a returned exit-1 result "OWES an `error` document"
(`src/cli/kit/program.ts:96-104`). A run that created a worktree and then failed
half way through materialization has something to report that only the second
form can carry.

### What the reference contributed, and what it got wrong

From `stamity-worktree-reference-study`, kept:

1. **Receipt-based cleanup inversion.** Write down what was created; invert from
   that record rather than replaying the patterns that produced it. The study
   records why: pattern replay missed glob-expanded copies and per-file trees,
   leaving residual secret material behind.
2. **Consent-gated destructive and secret operations, with structured
   non-interactive refusals naming the exact rerun.** This project already has
   the machinery and the posture — `promptGate`
   (`src/cli/kit/prompts.ts:63-74`), the module header's rule that a
   non-interactive run "refuses at this gate rather than proceeding on an
   assumed yes" (`src/cli/kit/prompts.ts:20-27`), and the `-y` semantics stated
   in the flag's own description (`src/cli/kit/program.ts:235-238`).
3. **TOCTOU-safe materialization through native EEXIST semantics.** The same
   discipline the write substrate already applies to its temp files —
   `O_EXCL | O_NOFOLLOW`, "the random suffix makes the plant unlikely; the flags
   make it impossible" (`src/merge/atomicWrite.ts:1037-1041`).

And three defects the study names, each of which this spec closes:

- **Order-sensitive strategy resolution.** Two hand-lockstepped parsers over a
  flat pattern file with last-matching-entry-wins semantics. Closed by
  REQ-WORKTREE-003: a structured document, literal paths, longest-prefix
  resolution, and a refusal on a contested path.
- **A dropped repo-global signal.** Per-worktree dirty badges that ignore the
  stash, which is one list for the whole clone and belongs to no worktree.
  Closed by REQ-WORKTREE-014.
- **Materialized-but-not-finished reported as a hard failure after a success
  box printed.** Closed by REQ-WORKTREE-011.

## Invariants

Floors for this lane. They hold whatever the verbs do.

1. **Nothing the lane creates lands inside the repository working tree.** Not
   the worktree directories, not a lock file, not the receipt. This is what lets
   the lane ship with no ignore rule, no `.git/info/exclude` block, and no
   managed-block machinery anywhere (REQ-WORKTREE-002, REQ-WORKTREE-006).
2. **Only ignored paths are materialized.** An entry naming a path git tracks,
   or a path git neither tracks nor ignores, is refused
   (REQ-WORKTREE-003). Tracked content arrives with the checkout; un-ignored
   content would dirty the new worktree on creation.
3. **The receipt is the only teardown authority.** Cleanup removes what the
   receipt names and nothing else. A worktree with no readable receipt is
   reported and left alone (REQ-WORKTREE-007).
4. **A branch is never deleted.** Not by `setup`, not by `cleanup`, not under
   `--force`. The lane manages directories and files; refs are the operator's.
5. **Fail closed, name the file and the flag.** Parity with the settled posture
   for a malformed override (`docs/specs/overlay-layers.md:136-138`): every
   refusal states what failed, why, and the exact next command — through
   `CliFailure`'s what/why/next document (`src/cli/kit/output.ts:13-34`).
6. **A repo that never runs these verbs is byte-identical.** No file created, no
   manifest key written, no `.gitignore` line, no emitted byte moved
   (REQ-WORKTREE-017).

## Requirements

Each requirement states the decision, why it was taken, and the alternative it
rules out. All eighteen were settled here; none is left open.

### REQ-WORKTREE-001 — One verb, three subcommands, positional dispatch

**Decision.** A ninth command module, `stamity worktree`, declaring
`mutating: true` and two optional positionals — `subcommand` and `name` —
dispatched by a `switch` exactly as `config` dispatches its five
(`src/cli/commands/config.ts:1086-1105`).

| Invocation | Effect |
|---|---|
| `stamity worktree` | the inventory, identical to `list`, on every stream |
| `stamity worktree list` | the inventory (reads only) |
| `stamity worktree setup <name>` | create one worktree |
| `stamity worktree cleanup <name>` / `cleanup --all` | tear down one, or every managed one |

Own flags, registered through `CommandModule.configure`
(`src/cli/kit/program.ts:118`): `--use-existing` / `--no-use-existing`,
`--track` / `--no-track`, `--copy-secrets`, `--all`, `--files-only`, `--force`.
`--json`, `-y/--yes` and `--dry-run` arrive from the shared matrix
(`src/cli/kit/program.ts:224-239`) and are not re-declared.

**Rationale.** The subcommand shape is the one this CLI already has, and reusing
it costs nothing: `config`'s registry is three positionals and a `switch`, its
unknown-subcommand failure names the closed set, and its arguments carry
descriptions that are copied verbatim into the generated CLI page
(`src/cli/commands/config.ts:1059-1063`). Lane D14 is designing `stamity
workspace` against the same shape; aligning here means the two read as one
surface. Bare `worktree` is the inventory on every stream rather than an
interactive picker, because unlike `config` there is no single key to settle —
every mutation this verb performs takes a name.

**Dropped.** Three top-level verbs (`worktree-setup`, `worktree-cleanup`,
`worktree-list`), the reference implementation's shape. It puts three rows in
the command table for one concern, and the shared flag matrix would be
registered three times.

### REQ-WORKTREE-002 — The farm sits outside the repository, and a farm inside it is refused

**Decision.** Worktrees are created under a *farm* directory that defaults to
`<parent-of-repo>/.stamity-worktrees/<repo-directory-name>/`, and one worktree's
path is `<farm>/<name>` with any `/` in the name preserved as nesting. The farm
is overridable by the `farmDir` key of the include manifest (REQ-WORKTREE-003),
resolved relative to the repo root. A `farmDir` that resolves inside the repo
root is refused, naming the resolved path.

**The repo root every subcommand resolves against is the MAIN checkout, derived
from the git common dir — not `--show-toplevel`.** Run from inside a linked
worktree, `git rev-parse --show-toplevel` answers with *that* worktree, so a
farm resolved from it would be a second farm nested beside the first, and
`cleanup --all` would sweep a set that does not contain the worktree the
operator is standing in. `resolveLane` therefore takes
`git rev-parse --git-common-dir` — one per clone, the same absolute path from
every linked worktree — and reads the repo root back off it, falling back to the
top level only for a layout whose common dir is not named `.git`
(`src/cli/commands/worktree.ts:100-136`, `src/worktree/git.ts:488-502`). One
lane, one farm, one policy file, whichever checkout the verb is invoked from.

**Rationale.** Three separate mechanisms in this tree walk the repository
recursively and none of them knows about a second checkout inside it: the orphan
temp-file sweep, whose skip list is a fixed set that unlinks matching files it
finds (`src/merge/atomicWrite.ts:1170-1180`, `src/merge/atomicWrite.ts:1232-1272`);
the leak gate, which scans "tracked + untracked-but-not-ignored files, so the
working tree is covered before it is staged" (`scripts/leak-gate.mjs:456-468`);
and the workspace sub-repo scan, which qualifies any directory carrying a `.git`
entry as a repository (`src/workspace/detect.ts:130-138`). A farm inside the repo
would put a full second tree in front of all three, and would additionally
require an ignore or exclude rule to keep it out of the repo's own status —
which is the machinery invariant 1 exists to avoid. The default's leading dot
also keeps the farm out of the workspace scan at the parent level, which skips
dot-directories at every level by construction (`src/workspace/detect.ts:125`,
documented `src/workspace/detect.ts:101-104`). The published documentation
already teaches a sibling layout (`docs/working-with-stamity.md:122-125`), so the
default is where a reader is already looking.

**Dropped.** An in-repo `.worktrees/` farm, the reference implementation's
layout, kept out of git status by a managed block in `.git/info/exclude`. It
buys `cd .worktrees/x` and costs an exclude-block writer with its own
idempotency, marker-repair and CRLF concerns, plus the three walks above. The
reference needed that block because its receipt lived in the tree; this design
has nothing in the tree to exclude.

### REQ-WORKTREE-003 — A structured include manifest, resolved by specificity, never by order

**Decision.** `.stamity/worktree.json`, absent by default, is the lane's policy
file. Shape:

```json
{
  "version": 1,
  "farmDir": "../.stamity-worktrees/myrepo",
  "entries": [
    { "path": ".env.mcp", "strategy": "copy", "secret": true, "reason": "MCP credentials" }
  ],
  "overrides": [
    { "path": "node_modules/.cache", "strategy": "skip" }
  ]
}
```

Rules, all of them refusals rather than resolutions:

- `path` is a **literal repo-relative POSIX path** naming a file or a directory.
  A glob metacharacter (`*`, `?`, `[`, `{`) is refused, naming the character. An
  absolute path, a `..` segment, or a backslash is refused.
- **A path carrying a control character is refused.** A newline or a NUL inside
  a declared path makes every message that quotes it unreadable and every
  NUL-delimited git invocation that carries it ambiguous, so the character is
  the defect rather than an escaping problem downstream. The refusing pattern is
  written as escapes rather than as literals in the source, because a literal
  control character would make that file binary to every tool that reads it, the
  leak gate's own walk included (`src/worktree/policy.ts:137-143`,
  `src/worktree/policy.ts:332-334`).
- **A single trailing slash is normalized away, not refused.** `node_modules/`
  and `node_modules` address one directory, and reducing them to one spelling is
  what makes the contested-path refusal below true of SPELLINGS rather than only
  of byte-identical strings — otherwise two rows could claim one path and pass
  (`src/worktree/policy.ts:309-354`). A path that is empty after normalization
  is refused.
- **An unknown key is refused, at both levels.** The document declares only
  `version`, `farmDir`, `entries`, `overrides`; a row declares only `path`,
  `strategy`, `secret`, `reason`. Ignoring an unknown key is indistinguishable
  from honouring it to the author who typed it, and `entry` for `entries` is the
  typo this catches — the whole policy would silently become the built-in
  defaults (`src/worktree/policy.ts:198-207`, `src/worktree/policy.ts:267-273`).
- `strategy` is one of `copy`, `symlink`, `skip`. A directory entry's strategy
  applies to its whole subtree.
- **Resolution is longest-prefix over `entries` ∪ `overrides`.** Declaration
  order carries no meaning anywhere. Two rows claiming the SAME path — in either
  list, or one in each — are a refusal naming both and the file.
- An entry naming a path git **tracks** is refused: the checkout already
  supplies it.
- An entry naming a path git neither tracks **nor ignores** is refused:
  materializing it would leave the new worktree dirty at creation. Both
  conditions are answered by one `git check-ignore` / `git ls-files` pass over
  the resolved set, and the message names the path and which condition it failed.
- **Both admissibility refusals apply to MATERIALIZING rows only.** A `skip` row
  is exempt, and so is a row whose own path is owned by a deeper rule — the
  checked set is exactly the paths whose longest-prefix answer is themselves
  (`src/worktree/policy.ts:405-416`). The carve-out is not a convenience: a
  `skip` row writes nothing, so it can neither be supplied twice by the checkout
  nor dirty the new worktree, and without the exemption the verb would refuse on
  its own built-in defaults in any repository that COMMITS `node_modules` —
  which is a supported choice, and one this lane has no business overruling
  (`src/worktree/policy.ts:418-428`). A refusal on a built-in row also names a
  next step the operator can take: there is no file to edit, so it says to write
  `.stamity/worktree.json` with a `skip` row rather than pointing at a row that
  does not exist (`src/worktree/policy.ts:436-442`).
- An absent `.stamity/worktree.json` means the built-in defaults of
  REQ-WORKTREE-004 apply. It is not an error.

**Where each refusal lands is part of the contract.** Everything above that is a
property of the DOCUMENT — JSON syntax, unknown keys, `version`, glob and
control characters, trailing slashes, a contested path — is decided by
`parseWorktreePolicy` when the file is read. The two admissibility rules need
git's answer about a path, so they run later, when `setup` resolves its plan
(`src/worktree/setup.ts:288-304`). The acceptance criteria below say which of
the two moments each refusal belongs to, because a criterion that asserts the
wrong one passes for the wrong reason.

**Rationale.** This is the study's first FIX, taken at the root rather than
patched. The reference's file was a gitignore-style pattern list whose strategy
came from a trailing marker comment, resolved LAST-MATCH-WINS across two parsers
that had to be kept in lockstep by hand, with a documented hole where a glob and
a symlink marker met. Every one of those properties is a consequence of ordering
being semantic. Remove ordering — literal paths, one longest-prefix answer, a
refusal when two rows contest a path — and the class is gone: there is no second
resolution path to drift, and no pattern expansion for a strategy to be lost in.
Refusing globs is what makes "literal path" true rather than aspirational; the
set of paths worth materializing here is two, so the expressiveness is not
missed. Refusing an absent-from-both-sets path is what makes invariant 2
checkable rather than a convention, and it is the same fail-closed posture the
overlay lane settled on for an orphan overlay
(`docs/specs/overlay-layers.md:368-381`).

**Dropped.** A gitignore-style pattern file resolved through
`git ls-files --others --ignored --exclude-from` — the reference's mechanism. It
inherits ordering semantics from gitignore itself, and the union-of-patterns
result cannot be enumerated ahead of the write, which is what made its receipt
necessary for correctness rather than merely useful. Also dropped: a
`worktree` section inside `.stamity/manifest.json` with a `nodeModules: "skip"`
key, the reference's spelling. The manifest is the provenance record and its key
set is closed and validated (`src/cli/commands/config.ts:397-594`,
`src/manifest/manifest.ts:73-89`); a policy document the operator authors is a
different artifact, and this project already places one outside the manifest for
exactly that reason (`src/workspace/model.ts:20-25`).

### REQ-WORKTREE-004 — The state tiers, settled against what this project commits

**Decision.** The built-in default entry set is two rows, and everything else is
absent by construction:

| Path | Strategy | Why |
|---|---|---|
| `.env.mcp` | `copy`, `secret: true` | gitignored (`.gitignore:11-12`), the single member of `REQUIRED_GITIGNORE_ENTRIES` (`src/mcp/env.ts:180`); consent-gated per REQ-WORKTREE-008 |
| `node_modules` | `skip` | present but deliberately not materialized; see below |

Everything the reference tiered is settled here as **arrives with the checkout,
no entry**:

- `.stamity/manifest.json` — committed. The worktree gets the branch's manifest,
  which is the correct answer: it is the provenance record *of that commit*
  (`docs/getting-started.md:145,151-152`).
- `.stamity/learnings/` and `.stamity/handoffs/` — committed, with `.gitkeep`
  placeholders so the empty directories survive a clone
  (`src/emit/stateScaffold.ts:32-45`). They diverge per branch automatically,
  because they are content and a branch is a version of content. Records that
  are written but **not committed** do not travel; that is stated as a fact of
  the lane, not worked around (REQ-WORKTREE-015).
- `.stamity/generated/`, `.stamity/packs/`, `AGENTS.md`, `.agents/`, and the
  client trees — committed (`docs/getting-started.md:148-155`).
- `.stamity/review-gate.json` — untracked and un-ignored, so REQ-WORKTREE-003
  refuses it as an entry. That is the right outcome: it is a per-run counter
  whose absence means "the gate is open" (`src/hooks/scripts.ts:153`, and the
  no-counter branch at `src/hooks/scripts.ts:1879`), and a review round counted
  in one worktree must not gate another.
- Build output (`dist/`, `coverage/`, `*.tsbuildinfo`, the docs site's build and
  cache, `.gitignore:1-9`) — regenerable, so not materialized and not listed.

`node_modules` ships as a `skip` row rather than as an omission so the operator
can see the decision and change it in one edit.

**Rationale.** Every row above is decided by one question — is this path
committed? — and this project answered that question once, globally, and wrote
the answer down (`docs/getting-started.md:151-159`). The reference's tiering
existed to reconstruct, per worktree, state that its own design had excluded
from version control; reproducing the tiers here would be carrying a solution
across a boundary where the problem does not exist.

`node_modules` defaults to `skip` rather than to the reference's `symlink`
because a symlinked dependency tree is not a read-only convenience: a package
manager's install inside the new worktree writes THROUGH the link into the main
tree's modules, which is a destructive cross-tree effect on a directory the
operator never named. The same hazard is why the reference had to carve per-file
copy overrides out of its symlinked state directory in the first place — an
atomic temp+rename through a symlink either de-links the name or clobbers the
shared original — "temp+rename publishes a fresh inode, so the merge silently
converts this tree's name for the bytes into an INDEPENDENT copy of them"
(`src/merge/safeWrite.ts:205-215`), and the rename "replaces the link with a
regular file" rather than writing through it
(`src/merge/atomicWrite.ts:960-966`).
Disk space is the weaker consideration, and `symlink` remains one edit away for
an operator who has weighed it.

**Dropped.** Symlink-by-default for `node_modules` (the reference's choice), for
the reason above. Also dropped: copy-seeding the client trees and re-running
`sync` inside the new worktree to regenerate them — see REQ-WORKTREE-013.

### REQ-WORKTREE-005 — Materialization is TOCTOU-safe, and idempotent-skip is distinguishable from a race

**Decision.** Every entry is created with a flag combination that refuses an
existing name at the syscall, never with a check-then-write:

- `copy` → `copyFile(src, dest, COPYFILE_EXCL)`.
- `symlink` → `symlink(target, dest)`.
- Both refuse an existing destination with `EEXIST`, which is reported as
  `skipped (already present)` — a legitimate outcome for a re-run — and every
  other errno is a materialization FAILURE feeding REQ-WORKTREE-011.
- A copy carries the source's permission bits explicitly. A `secret: true` entry
  is created at `0600` regardless of the source's mode.
- Parent directories are created before the entry, and the destination is
  containment-checked against the worktree root before anything is written,
  through the substrate's own check (`src/merge/atomicWrite.ts:694-718`).
- **A `copy` row naming a directory is expanded to its files before anything is
  written**, and each file is placed and digested on its own
  (`src/worktree/materialize.ts:118-152`, `src/worktree/materialize.ts:159-188`).
  A single receipt row for a directory would carry no digest, and
  REQ-WORKTREE-007's gate would then have to keep the whole tree as
  unverifiable — the expansion is what makes a directory row invertible at all.
  The walk honours the same longest-prefix carve-outs the policy resolved, so a
  `skip` override under a copied directory is not copied; the carve-out arrives
  as an injected predicate rather than as a second read of the policy document,
  so there is no second resolution path to drift. A directory every one of whose
  paths is skipped produces one `skipped` row saying exactly that, rather than
  an empty result the report would have nothing to say about.
- **A source that is not present is `absent`, not a failure**, for both
  strategies (`src/worktree/materialize.ts:232-244`,
  `src/worktree/materialize.ts:271-294`). The default policy names `.env.mcp`,
  and a repository that has never configured an MCP server does not have one;
  that is a fact about the request, not a fault, so it cannot be allowed to
  make the run `partial` (REQ-WORKTREE-011). For a `symlink` the check is on the
  SOURCE and it is deliberate: `symlink(2)` will happily create a link to a path
  that does not exist, and a dangling link in a fresh worktree would report as
  `materialized` and work for nobody.
- **A destination that already exists still produces a receipt row.** The skip
  leaves the destination's bytes untouched and records the digest and mode of
  what is THERE (`src/worktree/materialize.ts:329-362`,
  `src/worktree/materialize.ts:418-435`). A re-run's receipt replaces its
  predecessor, so a skipped row that recorded nothing would silently drop the
  only teardown authority over a file the FIRST run placed — the second run
  would leave a credential copy behind that cleanup no longer knows about. For
  the same reason a `secret` entry is mode-hardened on the skip path too: an
  already-present credential file sitting at `0644` is world-readable to every
  other account on the host, and this lane is what put it there. `absent` and
  `failed` produce no row, because a receipt row is authority to remove and
  neither of those placed anything to remove.

**Rationale.** This is the study's third KEEP, and it is the discipline the write
substrate already applies to its own temp file: `O_EXCL` "refuses a pre-planted
file at the temp name; `O_NOFOLLOW` refuses a pre-planted SYMLINK there…the
random suffix makes the plant unlikely; the flags make it impossible, which is
the difference between hard and prevented"
(`src/merge/atomicWrite.ts:1037-1041`). Mode preservation is the same rule the
substrate learned the hard way — a `0600` file coming back `0644` after a write
is "world-readable to every other account on the host, with nothing said"
(`src/merge/atomicWrite.ts:943-956`) — and the credential file is exactly that
case, which this tree already hardens to `0600` at its own writer
(`src/mcp/env.ts:114-120`).

**Dropped.** `existsSync` before the write. It is the check-then-act the flags
exist to replace, and it cannot tell "this run already did it" from "another
process is doing it right now" — which is the distinction the report needs.

### REQ-WORKTREE-006 — The receipt lives in the worktree's own git administrative directory

**Decision.** After materialization, `setup` writes
`<git-dir-of-the-new-worktree>/stamity/worktree-receipt.json`, where the git dir
is what `git rev-parse --git-dir` resolves to from inside the new worktree — the
per-worktree administrative directory, not the shared common dir. Schema:

```json
{
  "version": 1,
  "createdAt": "<ISO-8601>",
  "engineVersion": "<stamity version that wrote it>",
  "worktree": { "path": "<absolute>", "branch": "<name>", "head": "<sha>" },
  "entries": [
    { "path": ".env.mcp", "strategy": "copy", "mode": "0600", "sha256": "<digest of the bytes written>" }
  ]
}
```

Written through `atomicWriteFile` (`src/merge/atomicWrite.ts:996-1015`) with the
git dir as `boundaryDir`. A receipt that cannot be written is a materialization
failure under REQ-WORKTREE-011 — not a silent degradation. A receipt that cannot
be READ at cleanup time, or whose `version` is not 1, leaves that worktree
untouched and reported (invariant 3). Malformed individual rows are dropped, and
the drop is reported per row.

**Rationale.** Git never lists, stages or reports a file inside the git
directory, so the receipt needs no ignore rule, no exclude block and no
protection from `git add -A` — which is the whole of invariant 1 delivered by
placement rather than by machinery. The per-worktree admin directory is also the
correct lifetime: `git worktree remove` takes it away with the tree, and `git
worktree prune` takes it away with an abandoned registration, so a receipt
cannot outlive the thing it describes. The existence of that directory is not an
assumption — this tree already records that a worktree's `.git` is "a file"
pointing at it (`src/workspace/detect.ts:70`), and REQ-WORKTREE-006's acceptance
criteria pin the resolution rather than trusting it.

Recording `sha256` of the bytes WRITTEN, rather than comparing against the
current source at cleanup time, answers the question cleanup actually has: did
anyone edit this copy since it was placed? The source is free to have moved on
for reasons that have nothing to do with this worktree.

**Dropped.** The reference's placement — a receipt inside the worktree's state
directory, kept out of git status by a managed block in the shared
`.git/info/exclude`. It costs an exclude-block writer (content-aware idempotent
union, START-without-END repair, CRLF safety on a file git parses, and a durable
twin entry for repositories with a committed `.gitignore`), and in this project
it would be worse than in the reference: `.stamity/` is committed here, so a
receipt there is not merely visible in status, it is one `git add -A` away from
being pushed as machine-local state on a shared branch.

### REQ-WORKTREE-007 — Cleanup inverts the receipt, digest-gated, and never touches a branch

**Decision.** `cleanup` enumerates with `git worktree list --porcelain -z` and
partitions every entry into: **managed** (inside the resolved farm AND carrying a
readable receipt), **managed-orphan** (inside the farm but with NO readable
receipt — absent, malformed, or a version this build cannot read),
**other** (a worktree OUTSIDE the farm this lane never created), **locked**,
**prunable**. Then:

1. If the process cwd is inside any candidate, the whole run refuses
   (`VALIDATION_ERROR`) naming the candidate and the directory to run from.
2. For each managed candidate, under that candidate's name lock
   (REQ-WORKTREE-010): read the receipt, then invert it —
   - a `copy` row is removed only when the file's current digest equals the
     recorded `sha256`; a diverged copy is KEPT and reported as `diverged`;
   - a `symlink` row is removed only while it is still a symbolic link (`lstat`,
     never `stat`);
   - a row whose path is already gone is reported `absent` and is not a failure;
   - ancestor directories the lane created are removed when they end up empty.
3. Unless `--files-only`, remove the checkout with `git worktree remove`. A
   worktree with uncommitted changes needs `--force`, which is consent-gated
   (REQ-WORKTREE-008).
4. Prunable registrations are always pruned.
5. **No branch is ever deleted.** The report names `git branch -d <name>` per
   worktree removed, as text the operator runs if they want to.
6. **A managed-orphan is cleanable, but only as a whole tree under `--force`.**
   With no receipt there is no pattern to replay and no way to tell an edited
   copy from a placed one, so nothing is inverted file-by-file: `git worktree
   remove --force` takes the entire tree and the report says exactly that. Under
   `--files-only` there is nothing to invert, so the orphan is left standing with
   its unreadable-receipt reason reported; without `--force` the removal is
   refused before anything is touched, naming the flag. This is the recovery for
   a partial setup whose receipt write failed (REQ-WORKTREE-011).
7. `other` and `locked` entries are listed and skipped, with the reason.
8. `cleanup` with neither a name nor `--all` is a `USAGE` failure naming both
   spellings — the shape `config get` with no key already has
   (`src/cli/commands/config.ts:842-849`). **This one criterion is met across
   two layers, and the split is a consequence of the code vocabulary rather than
   a design choice.** `USAGE` is a CLI-edge code (`src/cli/kit/output.ts`) that
   the engine cannot spell without importing the CLI, so the engine classifies
   the refusal as far as its own vocabulary reaches — `VALIDATION_ERROR`,
   carrying the sentence and a `next` naming both spellings
   (`src/worktree/cleanup.ts:245-258`) — and the verb re-raises it as
   `CliFailure { code: "USAGE" }` (`src/cli/commands/worktree.ts:678-706`). The
   verb still CALLS the engine for that sentence rather than keeping a second
   copy of it: the refusal is the engine's first statement, ahead of every read,
   so the call costs nothing and the two surfaces cannot drift apart. What the
   operator observes is unchanged — one `USAGE` failure naming `<name>` and
   `--all` — and the criterion is written against that, not against the layer.
9. **`cleanup <name>` for a name no cleanable worktree carries is refused**, not
   quietly treated as a sweep of nothing (`src/cli/commands/worktree.ts:713-722`).
   The refusal is `VALIDATION_ERROR`, it names the name and the resolved farm,
   its `why` states that cleanup inverts a receipt or force-removes a
   receipt-less orphan and a name matching neither is refused, and its `next`
   names `stamity worktree list` as the surface that
   answers which rows are managed. A no-op exit 0 here is the failure mode
   worth designing out: an operator who mistypes a name would read "cleanup
   complete" and believe a worktree was torn down.

**Rationale.** Inversion from a written record is the study's first KEEP, and its
recorded reason is a residual-secret class: pattern replay missed entries the
patterns had expanded, and what it missed included credential material. The
digest gate is what keeps inversion from becoming destruction — the one file
this lane copies by default is the one file in the repository whose contents are
irreplaceable if the operator edited it in the worktree
(`src/mcp/env.ts:16-36`). Keeping a diverged copy is the conservative half; the
FULL cleanup path removes the directory anyway, so the secret-hygiene outcome is
preserved and only `--files-only` leaves anything behind, loudly.

**Dropped.** Removing a diverged copy anyway for hygiene. It destroys the only
copy of bytes the operator typed, and the same operator can delete a directory.
Also dropped: deleting the branch under `--force`, the one thing the reference
also refused to do — a directory is reconstructible from a ref, and a ref is not
reconstructible from a directory.

### REQ-WORKTREE-008 — The consent gates, and the refusal matrix

**Decision.** Four gated operations. Consent is read through
`promptGate({stdinIsTTY, yes, json, env})` (`src/cli/kit/prompts.ts:63-74`), and
a gate that is CLOSED is never answered by `confirm`'s default — the command
branches on `gate.interactive` first.

| Operation | Interactive | `-y` | `--json` or non-TTY, no flag | Explicit flag |
|---|---|---|---|---|
| Attach to an existing LOCAL branch | prompt, default yes | proceeds | **refuses**, exit 1, `VALIDATION_ERROR`, `next` names `--use-existing` | `--use-existing` proceeds; `--no-use-existing` refuses with a rename hint |
| Track an existing REMOTE branch | prompt, default yes | proceeds | **refuses**, exit 1, `VALIDATION_ERROR`, `next` names `--track` | `--track` proceeds; `--no-track` creates a new local branch off HEAD |
| Copy a `secret: true` entry | prompt, default yes, after a line naming the file and what it holds | proceeds | **skips the entry**, exit 0, report names `--copy-secrets` | `--copy-secrets` proceeds |
| `cleanup` of a dirty worktree, or `cleanup --all` | prompt, default **no** | proceeds | **refuses**, exit 1, `VALIDATION_ERROR`, `next` names `--force` / `--all` | flag proceeds |

Every refusal carries the full rerun command line, including the name argument
and the flags already given.

**Rationale.** Rows one, two and four are irreversible or destructive and refuse
rather than default, which is what the prompt kit's own header requires of a
destructive confirmation on a closed gate (`src/cli/kit/prompts.ts:20-27`) and
what `-y`'s published description promises it overrides
(`src/cli/kit/program.ts:235-238`). Row three is the deliberate exception: a
worktree without MCP credentials is a working worktree, so skipping is a
legitimate outcome and refusing the whole run over it would be
disproportionate — but a *silent* skip is the failure mode the question-protocol
rule names ("a run that applied a default names it in its output"), so the skip
is a reported line carrying the flag that changes it. The interactive default
for row three is yes, because the operator is standing in front of a message
naming the file and its contents, and because `-y` must mean the same thing on
both paths.

**Dropped.** A pre-flight warning box with no gate at all for the secret copy —
the reference's shape. A warning nobody can answer is a warning that trains
people to scroll. Also dropped: folding `--json` into consent; it is the exact
mistake this CLI has already recorded and closed
(`src/cli/kit/program.ts:248-254`).

### REQ-WORKTREE-009 — Branch plan resolution: attach, track, or create

**Decision.** One resolution, in this order, before any write:

1. A local branch of that name exists → **attach** (consent-gated). If it is
   already checked out in another worktree, refuse (`VALIDATION_ERROR`) naming
   that worktree's path.
2. Otherwise, on a real run only, `git fetch origin <name>`; a remote branch of
   that name exists → **track** (`--track -b <name> origin/<name>`,
   consent-gated).
3. Otherwise → **create** off current HEAD (`-b <name>`).

A fetch that fails for transport reasons is `NETWORK_ERROR`, exit 1. A fetch
that succeeds and finds no such ref is not a failure — it falls through to
create. `--dry-run` performs no fetch and says so, printing the plan it would
resolve from local information alone plus the branch it would look for.

The name is validated before any of this by `git check-ref-format --branch`,
plus a path-safety pass refusing `..` segments, a leading `-`, a backslash, and
any control character.

**Rationale.** `NETWORK_ERROR` is declared in the `ErrorCode` union
(`src/types/errors.ts:38-47`) and the generated CLI page labelled it "Reserved,
never thrown: … no code path in this build produces it". This lane's fetch is
the first real transport operation in the CLI, so it is the code's first honest
use, and `fetchBranch` is the throw site (`src/worktree/git.ts:458-483`).
That made the page's note false the moment the code shipped, so the note is gone
and the table row names this producer instead
(`src/cli/docs/cliReference.ts:113-135`) — closed under REQ-WORKTREE-018.
Deferring the fetch on `--dry-run` is what keeps a preview free of network
state, matching the reference's behaviour and this CLI's rule that a dry run
touches nothing.

The classification that decides between a fall-through and a failure is one
sentence of stderr, so it is a named constant with a pure classifier over it
rather than an inline regex (`src/worktree/git.ts:443-456`): a git release that
reworded "couldn't find remote ref" would otherwise turn every missing branch
into a transport failure, silently.

**Dropped.** Fetching unconditionally, including on `--dry-run`. A preview that
mutates remote-tracking refs is a preview that changed something.

### REQ-WORKTREE-010 — One lock, scoped to close the same-name race

**Decision.** `setup` acquires a cross-process advisory lock BEFORE its existence
check and holds it through `git worktree add`, materialization and the receipt
write. The lock target is
`<git-common-dir>/stamity/worktree/<name>`, taken through the existing
`acquireWriteLock` (`src/merge/atomicWrite.ts:297-302`), which creates the
lockfile as a sibling directory of the target and refuses a symlink standing at
that name (`src/merge/atomicWrite.ts:336-358`). The common dir — one per clone,
shared by every linked worktree — is what makes the lock visible to a second
process running from a different worktree of the same repository.

`cleanup` takes the same lock per candidate, as it reaches that candidate, so a
cleanup of `a` never blocks a setup of `b`. Contention exhausts the existing
retry schedule (~3s, `src/merge/atomicWrite.ts:154-157`) and then fails as
`LOCK_TIMEOUT`, with the message the substrate already writes.

With `STAMITY_LOCK=0` (`src/merge/atomicWrite.ts:269-275`) the lock is not taken
and concurrent same-name setup is UNSUPPORTED — the same posture the substrate
publishes for concurrent writes under the same opt-out
(`src/merge/atomicWrite.ts:991-995`). The report says so when the opt-out is
live.

**Rationale.** This closes the study's one named unknown: whether two concurrent
setups of the same name can both pass a pre-add existence check that runs before
any lock is taken. The answer is designed away rather than measured — the check
and the `git worktree add` sit inside one critical section, so the loser of the
race finds the directory present and refuses. Name-scoped rather than
repo-scoped because independent worktrees are independent work, and charter
invariant 3 makes serialising them a cost that needs a dependency edge to
justify.

**Dropped.** A repo-wide lock. It would serialise the parallel work this lane
exists to enable. Also dropped: locking only the file writes and leaving the
`git worktree add` outside the critical section — the reference's scope, and the
exact shape of its unresolved race.

### REQ-WORKTREE-011 — Partial success is a returned exit-1 result carrying the payload, never a throw

**Decision.** `setup` reports one of three outcomes, and the status vocabulary is
part of the contract:

| `status` | Meaning | Exit | Channel |
|---|---|---|---|
| `complete` | tree created; every entry materialized, skipped-as-present, or deliberately skipped | 0 | success envelope, full payload |
| `partial` | tree created; **at least one entry failed** | 1 | RETURNED `{ exitCode: 1, json }` — payload plus an `error` document |
| — (refusal) | nothing was created | 1 | thrown `CliFailure` / `EngineError` |

A `partial` payload names, at minimum: the worktree path and branch (so the
operator knows a tree exists), each entry with its own `outcome`
(`materialized` | `skipped` | `absent` | `failed`) and, for a failure, its errno
and message, plus an `error` document whose `next` names the recovery. The tree
now exists, so the recovery is a cleanup and a fresh setup, NOT a re-run of
`setup` — a second `setup` refuses on the present directory. When the failure
was an entry (the receipt still landed), `stamity worktree cleanup <name>`
inverts what did land; when the receipt itself could not be written, the tree is
a receipt-less orphan that nothing scopes, so `stamity worktree cleanup <name>
--force` removes the whole tree (see REQ-WORKTREE-007's managed-orphan class).

Two outcomes are explicitly NOT `partial`: a consent-declined secret entry, and
a branch whose checkout carries no `.stamity/manifest.json` (REQ-WORKTREE-013).
Both are `notices` on a `complete` run.

**Rationale.** This is the study's third FIX, and this CLI's own funnel is what
makes it expressible. A thrown failure renders through `failureEnvelope` and
carries `ok`, `command`, `version` and `error` only, so everything the run
learned about what it created is dropped; a returned exit-1 result is rendered
as the payload with the envelope keys spread over it
(`src/cli/kit/program.ts:296-307`), and the result type's comment already states
that such a result "OWES an `error` document"
(`src/cli/kit/program.ts:96-104`). Printing a success panel and then throwing —
the reference's behaviour — leaves an operator with a worktree on disk and a
message that says the command failed, and no machine-readable way to tell the
two halves apart.

Reserving `partial` for an actual failure is what keeps it meaningful: a
declined secret and a setup-less branch are facts about the request, not faults,
and grading them as partial would train a reader to ignore the field.

**Dropped.** A distinct exit code for partial success. There is no code to
spend: statuses are 0/1/2 and 2 is unreachable from inside a command body
(`src/cli/kit/program.ts:338-348`). Also dropped, with the reason recorded in the
context section: the reference's 64/74/75 sysexits contract, retired from this
project deliberately (`src/types/errors.ts:1-13`).

### REQ-WORKTREE-012 — One JSON document, and a dry run that predicts the run

**Decision.** Every subcommand emits exactly one JSON document under `--json`,
with no prompt ever printed to stdout — the funnel's existing guarantee
(`src/cli/kit/program.ts:39-46`). `setup` carries `status`, `worktree`,
`branchPlan` (`attach` | `track` | `create`), `entries[]`, `notices[]`;
`cleanup` carries `removed[]`, `kept[]`, `skipped[]`, `pruned[]`, `branches[]`;
`list` carries `worktrees[]` and `stash`.

`--dry-run` stops before the first write — before the lock, before
`git worktree add`, before any fetch — and prints the plan: the resolved farm
path, the branch plan and how it was resolved, the full entry table with the
strategy each path resolved to, and every consent gate the real run would hit
with the answer it would get for this invocation. **The dry-run entry table and
the real run's entry table agree row for row and strategy for strategy**, which
is the parity property the merge engine already holds itself to
(`src/merge/safeWrite.ts:43-48`, `src/merge/safeWrite.ts:593-598`).

**A dry run never prompts, on any stream.** "Touches nothing" includes the
operator's attention: a preview that stops to ask about a branch it is not going
to create has already changed something, and an unanswerable question inside a
preview is the same defect as the warning-with-no-gate REQ-WORKTREE-008 drops.
So `--dry-run` reads the consent gate as CLOSED regardless of the stream, and
every gate in the plan carries the answer THIS invocation's flags give it —
`--use-existing` present shows as granted, absent shows as withheld — with one
line stating that an interactive run would have asked instead
(`src/cli/commands/worktree.ts:564-571`). The entry table does not depend on
consent at all, which is what keeps the parity property above true across the
two runs: a withheld secret is a marked row in BOTH tables, not an absence from
one.

**Rationale.** `--dry-run` is registered automatically for a `mutating: true`
module (`src/cli/kit/program.ts:239`), so the only question is what it promises;
a preview that can disagree with the run is worse than no preview, which is why
this project's most-used writer keeps a pure predictor beside its writer and
pins the two together.

**Dropped.** A dry run that resolves the branch plan over the network so the
preview is "accurate". See REQ-WORKTREE-009.

### REQ-WORKTREE-013 — No in-worktree sync; a setup-presence probe instead

**Decision.** `setup` does not run `stamity sync` in the new worktree, does not
re-spawn the CLI, and does not regenerate any client tree. After materialization
it performs one read-only probe: does `<worktree>/.stamity/manifest.json` exist
and parse? The result is reported as `setup: present | absent | unreadable`.
`absent` is a notice on a `complete` run whose text says the branch predates the
setup and names `stamity init` run inside the worktree; `unreadable` names
`stamity check` inside the worktree. Neither makes the run `partial`.

**Rationale.** The reference re-spawned its own binary inside the new worktree
because its client trees were gitignored and therefore genuinely absent after a
checkout. Here they are committed
(`docs/getting-started.md:151-155`), so the checkout is already
self-consistent — and running `sync` would be a CONTENT CHANGE on that branch:
it regenerates from whichever engine version ran it
(`docs/getting-started.md:167-169`), so a worktree created off an older branch
would come up with a dirty tree the operator never asked for, ahead of the first
edit of the work it was created for. The probe answers the question the sync was
really asked ("is this worktree usable by a session right now?") without writing
anything, and it catches the one case that genuinely matters: a branch from
before `init` landed.

**Dropped.** Auto-sync, and with it the entire re-spawn mechanism (resolving the
running binary, the argv reconstruction, and the platform-specific launcher
handling the reference needed for it). Also dropped: an opt-in `--sync` flag —
`stamity sync`, run in the new worktree, already is that flag, and the report
names it.

### REQ-WORKTREE-014 — The inventory, and the one repo-global stash warning

**Decision.** `stamity worktree list` prints one row per worktree known to
`git worktree list --porcelain -z`, whether or not this lane created it:

| Column | Content |
|---|---|
| path | absolute, marked when it is the current one |
| branch | branch name, or `(detached)` |
| head | short sha |
| dirty | counts of modified + untracked, or `clean` |
| ahead/behind | against the upstream, or `—` when there is none |
| managed | `yes (<n> entries)` when a readable receipt is present, else `no` |
| setup | `present` / `absent` — the REQ-WORKTREE-013 probe |
| handoffs | number of records in `.stamity/handoffs/` in that tree |
| flags | `locked`, `prunable` |

Above the table, when and only when the clone has stash entries, exactly one
line: the entry count, and the statement that a stash is one list for the whole
clone and belongs to no row below. In JSON it is a top-level `stash` object, not
a per-worktree field.

**Rationale.** This is the study's second FIX. The reference computed per-worktree
dirty badges and dropped the stash entirely, because a stash does not belong to a
worktree — so the signal that an operator has uncommitted work parked somewhere
disappeared from the one surface built to answer "where is my work?". Placing it
once, at the top, is the honest shape: it is repo-global, it is stated as
repo-global, and it cannot be misread as belonging to the row above or below it.

**Dropped.** A per-worktree stash column. Every cell would carry the same number,
which reads as a per-worktree fact and is not one.

### REQ-WORKTREE-015 — Cross-session coordination is inventory, and the boundary is named

**Decision.** What this lane gives a session resuming inside a worktree is
exactly two things: the receipt (what was placed here, by which engine version,
when) and the inventory (what other worktrees exist and what state they are in).
It does not orchestrate sessions. Specifically, and stated as non-goals so a
later change adds them deliberately:

- it does not create, move, merge, or resume handoff records — `.stamity/handoffs/`
  and the handoff skill are the session-state carrier, and they already have a
  lifecycle (`docs/getting-started.md:147`);
- it does not spawn, attach to, or terminate an agent session in any client;
- it does not synchronise learnings between worktrees;
- it does not coordinate the gates. A green gate in one worktree says nothing
  about another (`docs/working-with-stamity.md:179-182`).

One fact of the design is reported rather than compensated for: an uncommitted
handoff or learning does not travel to a new worktree, because a checkout
carries committed content. The inventory's `handoffs` column is what makes that
visible — a resuming session can see that records exist elsewhere without this
lane moving them.

**Rationale.** The decision this lane executes names cross-session coordination
as a scope item, and the smallest honest reading of it is the one this project
can hold: state that is already durable, made visible. Moving handoff records
between trees would need conflict semantics, ownership, and an expiry policy the
handoff store owns rather than this verb, and the first version that guessed at
them would be the version every later one had to stay compatible with.

**Dropped.** A worktree-aware handoff auto-carry. It writes into another
worktree's state directory — a directory a session in that tree may be reading
at that moment — with no lock spanning the two and no conflict rule.

### REQ-WORKTREE-016 — Windows posture, stated rather than assumed

**Decision.** Three named behaviours and one named residual:

1. **Symlink creation that fails with `EPERM` or `EACCES` falls back to a copy**,
   and the fallback is a reported notice naming the path and both strategies —
   not a silent substitution. Every other errno is a materialization failure.
   **The fallback does not apply when the source is a DIRECTORY**: that entry
   fails instead, carrying the errno and a message naming both usable strategies
   (`src/worktree/materialize.ts:305-317`). Copying in place of linking a
   directory would deep-copy a whole tree the operator never asked to duplicate
   — for the reference's own default row that is `node_modules`, silently turned
   from one shared tree into two on the platform least able to afford it. A
   fallback that changes the ORDER of a write is a convenience; one that changes
   its magnitude is a different operation, and it needs the operator to pick it.
2. **A `secret: true` copy is not mode-hardened on win32**, because
   `hardenEnvMcpMode` does not run there — "Windows has no POSIX mode… so the
   pass is skipped rather than made to report a tightening it did not perform"
   (`src/mcp/env.ts:544-548`). The copy is still made; the report names the file
   and states that its permissions are whatever the platform gave it.
3. **The locking and rename layers already carry win32 branches** and are reused
   unchanged: the wider rename retry schedule and its jitter
   (`src/merge/atomicWrite.ts:866-905`), and the lock's own retry and staleness
   budget (`src/merge/atomicWrite.ts:143-171`).
4. **The POSIX-mode mechanism has no Windows equivalent, and its tests are
   platform-gated.** A Windows CI job now runs the suite, and the properties that
   assert an exact POSIX mode — a `0600` secret, a `0700` farm, a preserved
   `0755`, a read-only-directory denial — cannot hold there: Node cannot set or
   read those bits on Windows (a writable file reads back `0o666`) and `chmod`
   does not restrict a directory. Those assertions are gated with `skipIf` (a
   `WINDOWS` const, or `CAN_TEST_PERMISSIONS` where a case also needs a non-root
   runner, in `test/worktree/engine.test.ts` and `test/worktree/materialize.test.ts`),
   so they keep running — and gating — on darwin and Linux while standing down on
   Windows. On Windows a copied secret's protection is the farm's LOCATION —
   outside the repository, under the user's own directory, with the ACL
   inheritance that location carries — not a chmod bit. The production copy path
   attempts no `chmod` on win32 (`src/worktree/materialize.ts` → `applyMode`) and
   the farm's own `chmod(0o700)` is a non-throwing no-op there, so a setup run does
   not fail on Windows; it reports the file's permissions as whatever the platform
   gave it (item 2). The path-composition and inventory behaviours (the farm path,
   the git-reported worktree paths) ARE now exercised on Windows and normalise to
   the native separator at their seams (`src/worktree/git.ts` → `worktreePathFor`,
   `listWorktrees`).

**Rationale.** The reference carried exactly two Windows accommodations and the
study flags both as under-verified. Naming the posture — including the part that
is not verified — is what lets a later Windows report be read as a gap in
evidence rather than as a surprise.

**Dropped.** Refusing `symlink` outright on win32. Developer Mode and elevated
shells create symlinks fine, and refusing a strategy the platform supports would
be a worse answer than attempting it and reporting the fallback.

### REQ-WORKTREE-017 — A repo that never runs these verbs is byte-identical

**Decision.** Registering this command changes no other command's behaviour and
writes nothing anywhere until `setup` runs. Specifically: no
`.stamity/worktree.json` is created by `init` or `sync`; no key is added to
`.stamity/manifest.json` or to the `config` key registry
(`src/cli/commands/config.ts:397-594`); no entry joins
`REQUIRED_GITIGNORE_ENTRIES` (`src/mcp/env.ts:180`); no directory joins
`STATE_SUBDIRS` (`src/emit/stateScaffold.ts:32`); no ledger row is added; the
emission plan is unchanged.

**Rationale.** The override layer is already held to exactly this property
(`test/content/catalog.test.ts:486`, cited by
`docs/specs/overlay-layers.md:430-446`), and a lane that touches disk only on a
verb nobody ran has an easier version of the same obligation. It is stated
because the two natural implementations of the include manifest — scaffolding an
empty one at `init`, or adding a `worktree.*` config key — both break it.

**Dropped.** Scaffolding a default `.stamity/worktree.json` at `init` so the
operator has something to edit. The built-in defaults are documented, and a
generated file whose contents equal the defaults is a file that drifts from them.

### REQ-WORKTREE-018 — The published promise closes in the same change

**Decision.** In the change that lands the lane:

- The "Two changes at once" section is rewritten — `113-134` before the change,
  `docs/working-with-stamity.md:113-182` after it. "There is no managed parallel
  lane yet" and "A managed worktree lane … is a planned feature" both go, the
  section becomes the three verbs, and the hand-copy instruction for `.env.mcp`
  (`124-126` as it stood) is replaced by the verb that does it. One line still
  acknowledges plain `git worktree add`, because the claim it rests on — the
  setup travels with any checkout, being committed — stays true and is what
  makes an unmanaged tree in `list` a normal row rather than a defect.
  The re-open trigger at `docs/working-with-stamity.md:5-9` loses the
  worktree-lane clause and gains the three that can now falsify the section: a
  `stamity worktree` subcommand joining or leaving, `.stamity/worktree.json`
  changing shape, and the receipt's `version` moving off 1. A trigger whose
  condition has fired is worth nothing, so it is repointed rather than deleted.
  The page's verified-at commit is restamped by whoever re-attests the page.
- `docs/cli-reference.md` is regenerated with `node scripts/generate-docs.mjs`
  (`docs/cli-reference.md:5`), which adds the ninth command and its flags. The
  "Reserved, never thrown" note does not come off the page by regeneration,
  though, and that is the part worth stating precisely: **the note is
  source-owned, not derived.** It was rendered from a `RESERVED_CODES` set
  declared in the renderer, so regenerating against the new command surface
  would have reproduced it verbatim over a code that now has a producer. The
  closure is a source change — `NETWORK_ERROR` leaves the reserved set (which
  empties, and goes with it rather than staying behind as a branch no render can
  reach), and its table row is reworded to name `worktree setup`'s branch-plan
  fetch and to keep the one distinction the classifier draws: a remote with no
  such branch is a fall-through to `create`, not this code
  (`src/cli/docs/cliReference.ts:113-135`). The page is regenerated after that,
  and the byte gate holds the two together.
- The suite case that asserted the negative is re-pointed rather than deleted.
  It carried a file-list census over `src` designed to fire the moment a
  producer appeared, and it fired: the assertion now names the five files and
  keeps the same firing property for a SECOND producer, which is what would make
  the row's single-producer wording false in turn. Its census runs with
  `git grep --untracked` so the answer is a property of the source tree rather
  than of git's index — the lane's own files are the reason that distinction
  became load-bearing (`test/cli/docs/cliReference.test.ts`).
- One further generated-page claim closes in the same change, and this lane is
  what falsified it: every mutating command's section read "Writes to the
  repository", which `worktree` does not do — `setup` materializes into the farm,
  OUTSIDE the working tree (invariant 1). The renderer cannot introspect where a
  command writes and a hand-kept table of destinations would be the second
  unversioned copy that page exists to retire, so the sentence now claims only
  what `mutating` asserts: that the command writes, and that `--dry-run` previews
  it (`src/cli/docs/cliReference.ts:377-395`).
- `docs/getting-started.md:139-159` gains one sentence pointing at the verb from
  the state table, since that table is where a reader learns `.env.mcp` does not
  travel.

**Rationale.** The page states its own closing condition and a suite holds it to
the hand-page contract (`test/docsPages.test.ts`), so shipping the lane without
the rewrite leaves a published page telling readers the feature does not exist.
The CLI page is generated and byte-checked, so it is not optional either.

**Dropped.** Landing the code first and the documentation in a follow-up. The
re-open trigger names this event; a trigger that fires and is not acted on is a
trigger nobody will trust the next time.

## Acceptance criteria

One set per requirement. Eighty-seven criteria; each is machine-checkable unless
tagged otherwise. (The count read "forty-seven" while the list held sixty-six,
and the riders of the build rounds then took it to eighty-seven: a hand-kept
number over a list several rounds have appended to. Restated here against the
current list — `grep -c "^- GIVEN"` between this heading and the next is how it
was derived, and is the check worth running the next time this section grows
rather than counting by eye.)

**REQ-WORKTREE-001**

- GIVEN `stamity worktree --help` WHEN it runs THEN the exit status is 0 and the
  output names `list`, `setup` and `cleanup`.
- GIVEN `stamity worktree bogus` WHEN it runs THEN it fails with `USAGE` and the
  message names the three subcommands.
- GIVEN a repo with no worktrees WHEN `stamity worktree` runs with stdin a TTY
  and again with stdin a pipe THEN both produce the identical inventory output
  and neither prompts.

**REQ-WORKTREE-002**

- GIVEN a repo at `<parent>/repo` with no `.stamity/worktree.json` WHEN
  `stamity worktree setup feat` runs THEN the worktree is created at
  `<parent>/.stamity-worktrees/repo/feat` and `git status --porcelain` in the
  repo is byte-identical to what it was before the run.
- GIVEN `.stamity/worktree.json` declaring `farmDir: ".worktrees"` WHEN any
  subcommand runs THEN it fails with `VALIDATION_ERROR`, the message contains
  the resolved absolute path, and no directory is created.
- GIVEN a name containing `/` (`feat/api`) WHEN setup runs THEN the worktree
  path is `<farm>/feat/api` and the run succeeds.
- GIVEN a clone with one linked worktree WHEN `list`, `setup` and `cleanup` are
  invoked with the cwd inside THAT worktree THEN each resolves the same repo
  root, the same farm and the same policy file as the identical invocation from
  the main checkout — no farm is created beneath the linked worktree, and the
  inventory the three read is one list.

**REQ-WORKTREE-003**

- GIVEN two rows claiming path `.env.mcp` — one in `entries`, one in
  `overrides` — WHEN any subcommand reads the file THEN it fails with
  `VALIDATION_ERROR` naming the path and the file's absolute path.
- GIVEN an entry whose `path` is `.env.*` WHEN the file is read THEN it fails
  with `VALIDATION_ERROR` naming the character `*`.
- GIVEN an entry for `node_modules` with `strategy: "symlink"` and an override
  for `node_modules/.cache` with `strategy: "skip"`, declared in EITHER order
  WHEN the entries resolve THEN `node_modules/.cache` resolves to `skip` and
  `node_modules/foo` resolves to `symlink`, identically for both orders.
- GIVEN an entry naming `README.md` (tracked) WHEN **setup resolves its plan**
  THEN it fails with `VALIDATION_ERROR` naming the path and stating the checkout
  already supplies it. *(The moment is part of the criterion: admissibility
  needs git's answer about a path, so it runs at plan resolution and not at the
  read that parses the file.)*
- GIVEN an entry naming `.stamity/review-gate.json` (neither tracked nor
  ignored) WHEN **setup resolves its plan** THEN it fails with
  `VALIDATION_ERROR` naming the path and both conditions.
- GIVEN a `skip` row naming a path git TRACKS — a repository that commits
  `node_modules`, under the built-in defaults — WHEN setup resolves its plan
  THEN it does NOT fail: the row writes nothing, so it is never checked, and the
  worktree is created with no `node_modules` materialized.
- GIVEN a row named `node_modules/` and a second row named `node_modules` WHEN
  the file is read THEN it fails with `VALIDATION_ERROR` as a contested path,
  because the trailing slash is normalized before the contest is decided.
- GIVEN a document carrying the top-level key `entry` WHEN the file is read THEN
  it fails with `VALIDATION_ERROR` naming `entry` and listing the four keys a
  document declares, and the built-in defaults are NOT silently used instead.
- GIVEN a row carrying the key `strategey` WHEN the file is read THEN it fails
  with `VALIDATION_ERROR` naming the key, the row's `list[index]` label, and the
  four keys a row declares.
- GIVEN a row whose `path` contains a newline WHEN the file is read THEN it
  fails with `VALIDATION_ERROR` stating that the path carries a control
  character, and the message itself is a single line.
- GIVEN no `.stamity/worktree.json` at all WHEN setup runs THEN it succeeds and
  the resolved entry set equals the REQ-WORKTREE-004 defaults.

**REQ-WORKTREE-004**

- GIVEN a repo with `.env.mcp` present and default policy WHEN setup runs with
  `--copy-secrets` THEN the new worktree holds `.env.mcp` with the same bytes,
  and holds no `node_modules`.
- GIVEN the same run WHEN the new worktree is inspected THEN
  `.stamity/manifest.json`, `.stamity/learnings/`, `.stamity/handoffs/`,
  `.stamity/generated/`, `AGENTS.md` and every selected client tree are present,
  and the receipt names none of them.
- GIVEN a repo whose `.stamity/handoffs/` holds one COMMITTED record and one
  UNCOMMITTED record WHEN setup runs THEN the new worktree holds the committed
  record and not the uncommitted one, and the report states that uncommitted
  records do not travel.

**REQ-WORKTREE-005**

- GIVEN a destination path that already exists WHEN an entry is materialized
  THEN the operation reports `skipped` with reason `already present`, the
  existing file's bytes are unchanged, and the run's status is not `partial`.
- GIVEN a `secret: true` entry on a POSIX platform WHEN it is copied THEN the
  destination's mode is `0600` regardless of the source's mode.
- GIVEN a copy whose destination directory is read-only WHEN materialization
  runs THEN the entry's outcome is `failed` carrying the errno, and no partial
  file is left at the destination.
- GIVEN a `copy` row naming a directory holding two files in two subdirectories
  WHEN materialization runs THEN the results carry one row PER FILE, each with
  its own `sha256`, and no row addresses the directory itself.
- GIVEN that same directory row with a `skip` override on one of its
  subdirectories WHEN materialization runs THEN the files under the override are
  not placed and no row names them, while the others are placed.
- GIVEN a `copy` row naming a directory every path under which is skipped WHEN
  materialization runs THEN exactly one row is produced, its outcome is
  `skipped`, and its reason states that every path under the directory is
  skipped by the policy.
- GIVEN a `symlink` row whose SOURCE does not exist WHEN materialization runs
  THEN the outcome is `absent`, no link is created at the destination, and the
  run's status is not `partial`.
- GIVEN a `secret: true` copy whose destination already exists at mode `0644` on
  a POSIX platform WHEN materialization runs THEN the outcome is `skipped`, the
  destination's bytes are unchanged, and its mode afterwards is `0600`.
- GIVEN a `skipped` (already present) entry WHEN the receipt is built THEN it
  carries a row for that path whose `sha256` is the digest of the bytes AT THE
  DESTINATION, and an `absent` or `failed` entry contributes no row.

**REQ-WORKTREE-006**

- GIVEN a completed setup WHEN `git rev-parse --git-dir` is run inside the new
  worktree THEN the receipt exists at `<that dir>/stamity/worktree-receipt.json`
  and parses as version 1.
- GIVEN a completed setup WHEN `git status --porcelain` runs inside the new
  worktree THEN the output is empty.
- GIVEN a receipt whose `version` is 2 WHEN cleanup runs THEN that worktree is
  reported as unmanaged, nothing under it is removed, and the run's status is
  not `partial`.
- GIVEN a receipt with one well-formed row and one row missing `strategy` WHEN
  cleanup runs THEN the well-formed row is inverted, the malformed row is
  reported as dropped with its index, and the run continues.

**REQ-WORKTREE-007**

- GIVEN a worktree created by setup with an untouched `.env.mcp` copy WHEN
  `stamity worktree cleanup <name>` runs THEN the worktree directory is gone,
  the branch still exists in `git branch --list`, and the report names
  `git branch -d <name>`.
- GIVEN the same worktree with the copy edited WHEN `cleanup <name>
  --files-only` runs THEN the copy is kept, its outcome is `diverged`, and the
  worktree directory still exists.
- GIVEN a process whose cwd is inside a cleanup candidate WHEN cleanup runs THEN
  it fails with `VALIDATION_ERROR` naming that candidate, and no worktree is
  removed.
- GIVEN a worktree registered outside the farm WHEN `cleanup --all` runs THEN it
  is listed as `other`, skipped, and still present afterwards.
- GIVEN `stamity worktree cleanup` with no name and no `--all` WHEN it runs THEN
  it fails with `USAGE` naming both spellings. *(Asserted at the observable
  surface. The engine raises `VALIDATION_ERROR` and the verb re-raises it as
  `USAGE`; the criterion is about what the operator gets, so it is unchanged by
  that split.)*
- GIVEN the same invocation WHEN the engine's `cleanup` is called directly THEN
  it throws `VALIDATION_ERROR` whose message and `next` name both spellings —
  the sentence the verb re-raises, asserted once so the two layers cannot drift
  into two different wordings.
- GIVEN `stamity worktree cleanup nosuchname` in a repo with one managed
  worktree named otherwise WHEN it runs THEN it fails with `VALIDATION_ERROR`
  naming `nosuchname` and the resolved farm, its `next` names
  `stamity worktree list`, the exit status is 1, and the existing worktree is
  still present.

**REQ-WORKTREE-008**

- GIVEN a local branch `feat` exists WHEN `stamity worktree setup feat --json`
  runs without `-y` and without `--use-existing` THEN the exit status is 1, the
  document's `error.code` is `VALIDATION_ERROR`, `error.next` contains
  `--use-existing`, and no worktree directory exists afterwards.
- GIVEN the same repo WHEN the same command runs with `--use-existing` THEN it
  succeeds and `branchPlan` is `attach`.
- GIVEN `--no-use-existing` and an existing local branch WHEN setup runs THEN it
  fails with `VALIDATION_ERROR` and the message suggests a different name.
- GIVEN a repo with `.env.mcp` WHEN `stamity worktree setup feat --json` runs
  without `-y` and without `--copy-secrets` THEN the exit status is 0, the
  `.env.mcp` entry's outcome is `skipped`, and a notice names `--copy-secrets`.
- GIVEN a dirty worktree WHEN `cleanup <name> --json` runs without `-y` or
  `--force` THEN the exit status is 1, `error.next` contains `--force`, and the
  worktree still exists.
- GIVEN any of the refusals above WHEN the message is read THEN it contains a
  complete rerun command line including the name argument.

**REQ-WORKTREE-009**

- GIVEN a name that is not a valid ref (`feat..x`) WHEN setup runs THEN it fails
  with `VALIDATION_ERROR` before any git write, naming the name.
- GIVEN a branch checked out in another worktree WHEN setup runs with
  `--use-existing` THEN it fails with `VALIDATION_ERROR` naming that worktree's
  path.
- GIVEN a fetch that fails at the transport WHEN setup runs THEN the failure
  carries `error.code` `NETWORK_ERROR` and no worktree directory exists.
- GIVEN `--dry-run` WHEN setup runs THEN no `git fetch` is invoked and the plan
  output states that the remote was not consulted.

**REQ-WORKTREE-010**

- GIVEN two setups of the SAME name started concurrently WHEN both complete THEN
  exactly one reports success and the other fails with `VALIDATION_ERROR`
  stating the target exists, and exactly one worktree directory is present.
- GIVEN two setups of DIFFERENT names started concurrently WHEN both complete
  THEN both succeed.
- GIVEN a held lock on `<name>` WHEN a second setup of that name runs THEN it
  fails with `error.code` `LOCK_TIMEOUT` after the substrate's retry budget.
- GIVEN `STAMITY_LOCK=0` WHEN setup runs THEN it proceeds and the report carries
  a notice that concurrent same-name setup is unsupported for this run.

**REQ-WORKTREE-011**

- GIVEN a run whose `git worktree add` succeeded and whose one entry failed WHEN
  `--json` is used THEN the exit status is 1, the document carries
  `"ok": false`, `"status": "partial"`, the worktree path, the per-entry
  outcomes, and an `error` object with `code`, `message` and `next`.
- GIVEN that same run WHEN the human output is read THEN it states that the
  worktree WAS created, names its path, and names both recovery paths.
- GIVEN a run refused before any write WHEN `--json` is used THEN the document
  carries `ok: false` and an `error` object, and NO `worktree` key.
- GIVEN a run whose only anomaly is a declined secret copy WHEN it completes
  THEN `status` is `complete` and the exit status is 0.

**REQ-WORKTREE-012**

- GIVEN `--json` on each of `list`, `setup` and `cleanup` WHEN each runs THEN
  stdout parses as exactly one JSON document and contains no prompt text.
- GIVEN a repo and a policy file WHEN `setup feat --dry-run` runs and then
  `setup feat` runs THEN the entry table of the first (path, strategy) equals
  the entry table of the second, row for row and in the same order.
- GIVEN `--dry-run` WHEN setup runs THEN no directory is created, no lock file
  appears, and `git worktree list` is unchanged.
- GIVEN an existing local branch `feat`, a TTY on stdin, and no `--use-existing`
  WHEN `setup feat --dry-run` runs THEN it exits 0 having asked NOTHING, and the
  plan lists the `attach` gate with the answer this invocation gives it
  (withheld) plus the statement that an interactive run would ask.
- GIVEN that same repo WHEN the dry run is repeated with `--use-existing` THEN
  the same gate is listed as granted, still with no prompt written to any
  stream.

**REQ-WORKTREE-013**

- GIVEN a branch whose tree carries `.stamity/manifest.json` WHEN setup runs
  THEN `setup` is reported `present` and no file in the new worktree differs
  from the branch's committed content.
- GIVEN a branch predating the setup WHEN setup runs THEN the status is
  `complete`, the exit status is 0, `setup` is `absent`, and a notice names
  `stamity init` and the worktree path.
- GIVEN any successful setup WHEN the new worktree is inspected THEN no client
  tree file was rewritten — `git status --porcelain` in it is empty
  (the same evidence as REQ-WORKTREE-006's criterion, asserted here for the
  no-sync claim specifically).

**REQ-WORKTREE-014**

- GIVEN a clone with two worktrees and two stash entries WHEN `list` runs THEN
  the stash line appears exactly once, above the table, and no row carries a
  stash column.
- GIVEN a clone with no stash entries WHEN `list` runs THEN no stash line is
  printed and the JSON `stash.entries` is 0.
- GIVEN a worktree created outside this lane WHEN `list` runs THEN it appears
  with `managed: no` and every other column populated.
- GIVEN a worktree whose registration is prunable WHEN `list` runs THEN its
  `flags` include `prunable`.

**REQ-WORKTREE-015**

- GIVEN any subcommand WHEN it completes THEN no file under
  `.stamity/handoffs/` or `.stamity/learnings/` in ANY worktree was created,
  modified or removed.
- GIVEN a worktree holding two handoff records WHEN `list` runs THEN its
  `handoffs` column reads 2.

**REQ-WORKTREE-016**

- GIVEN a `symlink` entry whose creation raises `EPERM` WHEN materialization
  runs THEN the entry is copied instead, its outcome is `materialized` with a
  `fallback: copy` notice naming the path, and the receipt records
  `strategy: "copy"`.
- GIVEN a `symlink` entry whose creation raises `ENOSPC` WHEN materialization
  runs THEN the entry's outcome is `failed` and no fallback is attempted.
- GIVEN a `symlink` entry whose SOURCE is a directory and whose creation raises
  `EPERM` WHEN materialization runs THEN the outcome is `failed` carrying
  `errno: "EPERM"`, the destination holds no copied tree, and the message names
  both `copy` and `skip` as the strategies that would work.
- GIVEN `process.platform === "win32"` WHEN a `secret: true` entry is copied
  THEN no `chmod` is attempted and the report states the permissions were left
  to the platform.

**REQ-WORKTREE-017**

- GIVEN a repository that has never run the verb WHEN `init`, `sync` and `check`
  run before and after this change THEN every written byte and every planned row
  is identical, with packs installed and without.
- GIVEN that repository WHEN the tree is inspected THEN no
  `.stamity/worktree.json` exists, `.gitignore` is unchanged, and
  `.stamity/manifest.json` carries no worktree key.
- GIVEN `stamity config list` WHEN it runs THEN its key set is unchanged from
  before this change.

**REQ-WORKTREE-018**

- GIVEN `docs/working-with-stamity.md` after the change WHEN it is read THEN it
  contains neither "there is no managed parallel lane yet" nor "is a planned
  feature", and its re-open note no longer names the lane SHIPPING as a pending
  condition. *(The note still names the worktree lane, and has to: its three new
  conditions — a subcommand joining or leaving, the policy file's shape, the
  receipt version — are what can falsify the rewritten section. What had to go
  is the fired condition, not the subject.)*
- GIVEN that page WHEN its parallel-branch section is read THEN it names
  `stamity worktree setup`, `stamity worktree list` and `stamity worktree
  cleanup`, states that the farm is outside the repository, states that a branch
  is never deleted, and still acknowledges that plain `git worktree` works.
- GIVEN `docs/cli-reference.md` after the change WHEN it is regenerated by
  `node scripts/generate-docs.mjs` THEN the file is byte-identical to the
  committed one, lists `stamity worktree`, and does not list `NETWORK_ERROR` as
  never thrown.
- GIVEN the rendered page WHEN its `NETWORK_ERROR` row is read THEN it names
  `worktree setup` and `origin` as the producer, and states that a remote with
  no such branch is not this code; and the strings "Reserved, never thrown" and
  "no code path in this build produces" appear nowhere on the page.
- GIVEN a census of `NETWORK_ERROR` across `src` — including untracked files, so
  the answer is a property of the source tree rather than of git's index — WHEN
  it runs THEN it returns exactly the declaration, the renderer, the transient
  classifier, and the two worktree files; a SIXTH file fails the case, because a
  second producer makes the row's single-producer wording false.
- GIVEN the rendered page WHEN every mutating command's section is read THEN
  none of them claims the write lands in the repository, and each carries the
  location-free sentence naming `--dry-run`.
- GIVEN the rewritten section WHEN a reader follows it THEN every command it
  names exists in the CLI reference table.
  *(judgment: reviewer — prose accuracy is not machine-checkable; the two
  assertions above cover the mechanical half.)*

## Non-goals for v1

Named so a later change adds them deliberately rather than discovers them:

- **A `--from-path` adoption mode** for an existing directory. The reference
  carried one as legacy; this lane has no legacy to carry.
- **Session orchestration of any kind** — spawning, attaching, resuming, or
  moving handoffs between worktrees (REQ-WORKTREE-015).
- **Gate coordination or a cross-worktree test runner.**
- **Automatic worktree creation from a plan, a board item, or a branch name in a
  handoff.** The verb takes a name from a person.
- **Glob or pattern entries** in the include manifest (REQ-WORKTREE-003).
- **Deleting branches** (invariant 4).
- **Worktrees of a submodule**, and worktrees of a repository that is itself a
  linked worktree.
- **A `worktree` section in `.stamity/manifest.json`**, or a `config` key
  (REQ-WORKTREE-017).

## Test plan sketch

The suites that extend, and what each takes:

- `test/cli/commands/worktree.test.ts` — new. Every refusal in the
  REQ-WORKTREE-008 matrix over injected `promptGate` facts; the dry-run/real
  parity of REQ-WORKTREE-012; the three statuses of REQ-WORKTREE-011 including
  the returned exit-1 payload shape; the `USAGE` rows of REQ-WORKTREE-001 and
  REQ-WORKTREE-007.
- `test/worktree/policy.test.ts` — new, pure. The include manifest: every
  refusal of REQ-WORKTREE-003, the order-independence criterion asserted by
  resolving the same rows in both declaration orders, and the built-in default
  set of REQ-WORKTREE-004.
- `test/worktree/receipt.test.ts` — new, pure. Receipt schema round trip,
  version rejection, per-row drop, and the digest gate of REQ-WORKTREE-007.
- `test/worktree/materialize.test.ts` — new. EEXIST idempotency, mode
  preservation, the win32 fallback of REQ-WORKTREE-016 over an injected errno
  (the platform branch is exercised by injection, not by a Windows runner).
- `test/cli/commands/worktree.integration.test.ts` — new, over a real temporary
  clone: `git worktree add`, the receipt's location proved through
  `git rev-parse --git-dir`, the empty `git status --porcelain` of
  REQ-WORKTREE-006 and REQ-WORKTREE-013, the concurrency pair of
  REQ-WORKTREE-010, and the round trip of REQ-WORKTREE-007.
- `test/docsPages.test.ts` and the CLI-reference byte gate — the two documents
  of REQ-WORKTREE-018.
- Whichever suite pins the emission plan and the `config` key set — the
  byte-identity criteria of REQ-WORKTREE-017, held to the shape
  `test/content/catalog.test.ts:486` already uses for the override layer.

## References

Cited as `path:line` against the tree at the time of writing; line numbers drift
and the surrounding symbol is the durable address.

| Pointer | Target | Why |
|---|---|---|
| `source` | `src/cli/kit/program.ts:29-44,96-104,296-307` | the exit contract, and the returned-exit-1 seam REQ-WORKTREE-011 is built on |
| `source` | `src/cli/kit/program.ts:224-243` | the shared flag matrix this verb inherits rather than re-declares |
| `source` | `src/cli/kit/output.ts:4-34` | `CliFailure`'s what/why/next document, the refusal shape |
| `source` | `src/types/errors.ts:1-13,38-47` | why 64/74/75 does not port, and the code set that replaced it |
| `source` | `src/cli/kit/prompts.ts:20-27,63-74,198-209` | the consent gate, and why a closed gate refuses rather than defaults |
| `source` | `src/cli/commands/config.ts:1049-1105` | the subcommand-dispatch shape REQ-WORKTREE-001 mirrors |
| `source` | `src/merge/atomicWrite.ts:143-171,297-358` | the cross-process lock REQ-WORKTREE-010 reuses, and its budgets |
| `source` | `src/merge/atomicWrite.ts:694-718,943-978,1024-1041` | containment, mode preservation, and the EEXIST discipline REQ-WORKTREE-005 copies |
| `source` | `src/merge/atomicWrite.ts:1170-1180,1232-1272` | the recursive sweep that must not meet a second checkout |
| `source` | `src/merge/safeWrite.ts:43-48,593-598` | the dry-run/apply parity property REQ-WORKTREE-012 adopts |
| `source` | `src/merge/safeWrite.ts:186-250` | the shared-name policy, and the de-linking harm behind the `node_modules` default |
| `source` | `src/mcp/env.ts:110-126,180,544-561` | the credential file, its ignore entry, and the win32 mode residual |
| `source` | `src/emit/stateScaffold.ts:20-45` | the committed state directories, and why they carry placeholders |
| `source` | `src/hooks/scripts.ts:153,1879` | the machine-local counter that must not travel between worktrees |
| `source` | `src/workspace/detect.ts:70,101-104,125-138` | a worktree's `.git` is a file; the dot-directory skip; the sub-repo scan |
| `source` | `src/workspace/model.ts:20-25` | the precedent for an operator-authored policy file outside the manifest |
| `source` | `scripts/leak-gate.mjs:382-388,456-468` | the reserved-name rule this page is written under, and the untracked-file walk |
| `doc` | `docs/getting-started.md:139-159` | the state table and the commit decision REQ-WORKTREE-004 is settled from |
| `doc` | `docs/working-with-stamity.md:5-9,113-182` | the published promise and its re-open trigger; the line spans are the post-rewrite ones, and the promise text they held is quoted in Context |
| `doc` | `docs/cli-reference.md:5,71-105` | the generated page, its exit table, and the reserved `NETWORK_ERROR` note |
| `spec` | `docs/specs/overlay-layers.md:118-145,368-381` | the sibling spec's fail-closed posture, adopted here |
| `memory` | `stamity-worktree-reference-study` | the reference implementation's lifecycle, receipts, state tiers, and the keep/fix list |
| `test` | `test/docsPages.test.ts` | the hand-page contract REQ-WORKTREE-018 must satisfy |
| `test` | `test/content/catalog.test.ts:486` | the byte-identity assertion shape REQ-WORKTREE-017 reuses |

## Risks

- **The receipt's placement depends on a git behaviour, not on this project's
  code.** If a future git changed what `rev-parse --git-dir` resolves to inside a
  linked worktree, the receipt would land somewhere else. Mitigated by making the
  resolution an assertion (REQ-WORKTREE-006's first criterion) rather than an
  assumption, so the day it changes is the day a test goes red rather than the
  day a receipt appears in someone's `git status`.
- **Windows is designed for and not verified.** No Windows CI job exists, so the
  symlink fallback and the un-hardened secret copy are covered by injected
  errnos only. The honest posture is that the first Windows report is evidence
  this project does not yet have, and REQ-WORKTREE-016 says so in the spec rather
  than in a commit message.
- **`node_modules: skip` makes a fresh worktree unable to run the gates until an
  install completes.** That is a real cost, taken deliberately over the
  alternative in which a package manager writes through a symlink into the main
  tree's modules. Mitigated by the row being visible in the default policy and
  changeable in one edit.
- **The lock closes the stamity-side race and not the git-side one.** A
  `git worktree add` run by hand, concurrently, at the same path, does not take
  this lock; git's own refusal is what covers that case. Stated so the guarantee
  is not read as wider than it is.
- **Refusing an entry that is neither tracked nor ignored will surprise
  someone.** It is the right refusal — materializing such a path dirties the new
  worktree at creation — but the first operator to hit it will have written a
  path they believe is machine-local. Mitigated by naming both conditions and the
  path in the message.
- **Two verbs, `workspace` and `worktree`, differ at the fifth character.** They
  are separate concerns (a workspace holds repositories; a worktree is a checkout
  of one), and lane D14 owns the other. Mitigated only by each verb's own help
  text; if it proves confusing in use, an alias is a cheap later change and a
  rename is not.

## Concerns

- **This spec assumes lane D14 lands `stamity workspace` with the same
  positional-dispatch shape.** Nothing here blocks on it and nothing here reads
  its code; if D14 chooses a different shape, REQ-WORKTREE-001's rationale loses
  one of its three supports and keeps the other two (`config`'s precedent and the
  shared flag matrix).
- **The `NETWORK_ERROR` change is a contract change on a generated public page.**
  Anything branching on "this code is never thrown" — the note exists precisely
  because a CI author might — becomes wrong when this lane ships. It is one line
  in a generated document and it is named in REQ-WORKTREE-018, but it is the one
  edit here that changes a promise already published to consumers outside this
  repository.
- **The include manifest is a new operator-authored file class**, and it is
  neither validated by `collectManifestErrors` nor covered by
  `stamity validate` as designed here. Routing it through `validate` would be a
  reasonable follow-up; it is not required by any criterion above, and the
  refusals of REQ-WORKTREE-003 fire at the verb, which is the only place the file
  is read.
- **`docs/specs/` is still not indexed in `llms.txt`**, and this page inherits
  that gap from its sibling (`docs/specs/overlay-layers.md:730-733`). Adding a
  specs section is the same follow-up for both pages.
- **Line-number citations drift.** Kept for the reason the sibling spec keeps
  them: much of the evidence here is a comment block or a branch rather than a
  named export, and a citation that cannot be spelled is a claim with no
  evidence. A reader who finds one off by a few lines should trust the named
  symbol.
