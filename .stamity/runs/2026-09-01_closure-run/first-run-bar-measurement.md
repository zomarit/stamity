# First-run bar — first real measurement

Status of this bar before today: **UNMEASURED**. This is the first run that puts
real clock numbers against it. It measures one of the bar's two halves and says
plainly that it does not measure the other.

Measured 2026-09-02 (local) against the working tree at `2bbc5ad`.

---

## 1. The bar, as stated

Two places state it, and they state slightly different things.

**`content/skills/st-onboard/SKILL.md:4`** — the shipped contract, in the skill's
own description:

> Guides the first real change in a repository this setup was just installed
> into — orients on the actual code, settles on one small change with the
> operator, runs it through the touchpoints the install shipped, and closes on a
> passing verification gate.

**`content/skills/st-onboard/SKILL.md:28-30`** — the clock, carefully hedged:

> Fifteen minutes is what the six phases are SIZED for, not a claim about a
> particular repository.

followed by a per-phase budget: Orient 3 min, Pick 3 min, Name the proof 2 min,
Change 4 min, Prove 3 min, Note optional (`SKILL.md:32-39`).

**`docs/getting-started.md:13-14`** — the operator-facing promise, which drops
the hedge:

> From nothing to one proven change on your own code. Fifteen minutes for the
> guided first run, plus however long `npx` takes to fetch the package.

**`docs/getting-started.md:86-90`** repeats it as "six phases, sized for about
fifteen minutes, on your actual code".

The discrepancy matters for what can be measured. The skill says fifteen minutes
is a **sizing budget**. Getting-started says it is a **duration promise**. The
sizing claim is checkable by reading the phase table; the duration claim is a
claim about a human operator, and this run cannot settle it.

---

## 2. The two halves — and why only one is measurable here

| Half | What it is | Measurable now? |
|---|---|---|
| **Mechanical** | Clean repo → install the engine → `init` → setup present → its own verification gate passes | **Yes.** Measured below with real clock timings, n=4. |
| **Guided** | Six model-and-operator phases, each ending at a checkpoint the operator answers | **No.** See §7. |

These are not two parts of one number and are not summed anywhere in this
document. The mechanical half is the floor the guided half starts from.

---

## 3. Environment

| Item | Value |
|---|---|
| Host | macOS 26.6.1, arm64 |
| Node | v22.22.1 |
| npm | 10.9.4 |
| Engine version under test | `@zomarit/stamity` 1.1.0 |
| Engine artifact | `zomarit-stamity-1.1.0.tgz`, sha256 `0f12dbbb0f63210d…`, 843.8 kB packed / 2.6 MB unpacked, 75 files |
| Build provenance | **The already-built `dist/` was used, not a fresh build.** `package.json` declares no `prepack`, `prepare` or `prepublishOnly` script, so `npm pack` performed no build. `dist/cli.js` and `dist/index.js` sha256 were captured before and after the pack and were byte-identical — `npm pack` is read-only against `dist/`. `dist/cli.js` mtime: 2026-09-01T23:07:55+0200. |
| Timer | `/usr/bin/time -p`, `real` field, wall-clock seconds, 2 decimals |
| Network | Available; registry reachable |
| Scratch location | `/private/tmp/claude-501/-Users-denismasatovic-Projects-zomarit-stamity/c132da37-7cec-4274-9f5d-5f46348a4780/scratchpad/first-run-bar/` (outside this repository; see §9) |

---

## 4. Method

**The target repository.** A synthetic but plausible repo, `ledgerkit` — a
zero-runtime-dependency receipt-totalling library: `README.md`, four source files
under `src/`, three test files under `test/` (9 tests), `.gitignore`, and a
`package.json` whose `test` script is `vitest run`. It carries three real git
commits so history-derived detection has something to read, and `src/parse.js`
carries a `TODO` sitting beside the code that explains it, so the walk's phase-2
candidate sources are genuinely present. HEAD `dfceb44`.

**The install shape.** The engine was packed out of this repository with
`npm pack --pack-destination <scratch>` and installed into the scratch repo with
`npm install --no-save <tarball>`. `--no-save` matches what `npx` leaves behind:
the binary on `PATH`, nothing added to the target's `package.json`.

**Replicates.** Four independent clean lanes. A pristine pre-init template was
built by `git clone` of the scratch repo plus its own `npm install`, then copied
per replicate. Every replicate ran engine install → `init` → `check` → repo gate
from a tree with no `.claude/` and no `.stamity/`.

**Non-interactivity.** `stamity init -y --tools claude`. §6 records what those
flags pre-answered.

---

## 5. Phase table — real seconds, real exit codes

Every number below is a measured `real` wall-clock value. No number in this
document is an estimate.

### The measured lane (n=4)

| Phase | Command | n | min | median | max | exit |
|---|---|---:|---:|---:|---:|---:|
| Engine install (warm cache) | `npm install --no-save zomarit-stamity-1.1.0.tgz` | 4 | 0.73 | **0.80** | 1.16 | 0 |
| Init | `npx stamity init -y --tools claude` | 4 | 1.06 | **1.21** | 1.27 | 0 |
| Diagnose | `npx stamity check` | 4 | 0.41 | **0.41** | 0.42 | 0 |
| Repo's own gate, post-init | `npm test` (vitest, 9 tests) | 4 | 0.63 | **1.16** | 1.44 | 0 |

**End-to-end wall clock, per replicate:** 3.26 s · 3.69 s · 3.82 s · 3.52 s.
**Sum of medians: 3.58 s.** All 16 phase invocations exited 0.

### Single-sample phases (n=1), reported separately because n=1

| Phase | Command | seconds | exit | Note |
|---|---|---:|---:|---|
| Pack the engine | `npm pack --pack-destination <scratch>` | 0.45 | 0 | Maintainer-side, not on the user's path |
| Engine install, **cold** cache | `npm install --no-save --cache <fresh dir> <tarball>` | 1.91 | 0 | Genuine cold fetch: 61 packages, 9.9 MB written to a fresh cache dir |
| Version probe | `npx stamity --version` → `1.1.0` | 1.10 | 0 | |
| Init preview, **no flags at all** | `npx stamity init --dry-run` | 0.66 | 0 | Non-TTY; resolved to the same 57-file claude default |
| Repo baseline install | `npm install` (the repo's own vitest) | 4.86 | 0 | **Not attributable to this bar** — the repo's own deps |
| Repo baseline gate, **pre-init** | `npm test` | 0.91 | 0 | 9/9 pass; establishes the gate was green before the setup touched anything |

**Cold-cache variant of the mechanical total:** substituting the measured cold
install (1.91 s) for the warm median (0.80 s) gives **4.69 s**. That is
arithmetic over measured phases, not a separately observed end-to-end run, and
is labelled as such.

### What the run produced

- `init` wrote **57 files**, manifest `tools: ["claude"]`, 57 ledger rows.
- `stamity check`: **all green** — 9/9 doctor rows ok, `drift: clean`.
- `.claude/skills/st-onboard/SKILL.md` present on disk in every replicate.
- Every `${STAMITY:*}` placeholder resolved in the emitted tree. The only
  surviving `STAMITY:` strings are the intended managed-block markers in
  `CLAUDE.md` and one prose mention inside `stamity-test-runner.md`.
- `init` printed the correct client-specific next step: *"start here — inside
  Claude Code, type: `/st-onboard`"*.

---

## 6. The decision points the mechanical number does not contain

The mechanical lane is fast **because every question was pre-answered by a
flag**. A real operator meets these.

**Before the walk — one prompt, verified not assumed.** The pre-init tree was
checked and contained no `.claude/`, `.cursor/`, `.github/` or `.codex/`
directory, and no `AGENTS.md`, `CLAUDE.md` or `.cursorrules`. Per
`docs/getting-started.md:38-45` that means exactly **one** of init's two
questions would have fired interactively — *which clients* — and the second
(predecessor setup / existing agent config) would not. `-y --tools claude`
suppressed that one question. A `--dry-run` with **no flags at all** resolved to
the same 57-file claude default, so the flags changed the prompt count, not the
outcome, in this repository.

**During the walk — six checkpoints, none of them measured.** `SKILL.md:145-151`
is explicit that every phase ends on one question and waits: *"A phase that
answers its own question is a generator with extra steps."* Those six waits are
where the fifteen minutes actually live:

1. Phase 1 — which orientation facts to correct.
2. Phase 2 — which of the offered candidates to take.
3. Phase 3 — whether the red test is the proof to hold the change to.
4. Phase 4 — whether the diff is the change that was picked.
5. Phase 5 — keep, refine, or revert.
6. Phase 6 — accept or decline the orientation note.

**Excluded by the promise's own wording.** `docs/getting-started.md:14` says
"plus however long `npx` takes to fetch the package", so registry fetch latency
is outside the claim and is outside this measurement too. The cold-cache figure
in §5 is the closest measured proxy.

---

## 7. What was NOT measured, and why

Stated plainly, because the honest gap is the point of this document.

1. **The guided conversation.** The six phases are executed by a model in
   dialogue with an operator. This run installed the setup and confirmed the
   skill is on disk with its placeholders resolved; it did not walk the six
   phases. No number here describes them.
2. **A human's fifteen minutes.** Phases 1, 2, 4, 5 and 6 block on an operator
   reading output and deciding. That duration is a property of the person and the
   repository, not of the engine, and it cannot be produced by running commands
   in a scratch directory. Any number offered for it would be invented, so none
   is offered.
3. **Model latency across six phases.** Not measured — it depends on the client,
   the model and the repository size, none of which this lane varied.
4. **Real `npx` registry fetch.** A local tarball was installed instead, which is
   what makes the install number reproducible. The promise excludes this anyway.
5. **Repository scale.** One small repo (4 source files, 9 tests) was used.
   `SKILL.md:46-49` carves out "a repository too large to orient on in three
   minutes"; this run says nothing about that case.
6. **The other three clients.** Only `claude` was targeted. Cursor, Copilot and
   Codex reach the skill by plain-words request rather than `/st-onboard`
   (`docs/getting-started.md:95-97`), and that path is unmeasured.

---

## 8. Did the run surface a product defect?

**No failure.** Every one of the 22 command invocations exited 0. Nothing was
papered over, because nothing broke.

**One observation, and it is not a defect.** The scratch repo declares `vitest`
in `devDependencies` and `vitest run` as its `test` script, but has no
`vitest.config.*` file — a common and fully working vitest shape. Detection
therefore reported the generic fallback:

- Charter: `Test framework: test-script`
- Emitted `st-onboard` phase 3 renders as: *"the `test-script` test that reads
  it"*

`src/detect/repoAnalyzer.ts:217-218` keys vitest to a config **file**, and
`repoAnalyzer.ts:237-243` documents the fallback deliberately: *"The script body
is not parsed, so the name says what is known — something runs — without guessing
which tool it runs."* That is the charter's own no-invented-values rule being
honoured, not violated: it degrades to a truthful generic rather than a plausible
guess. The cost is only that one rendered sentence in the guided walk reads
awkwardly. Recorded as an observation for whoever owns detection breadth; **not**
filed as a defect, and nothing was changed in response to it.

Separately, the charter correctly reported `Linter: unknown` and
`CI provider: unknown` for a repo that has neither, and narrowed the full gate to
`npm run test` — the honest behaviour.

---

## 9. Scratch location

Left in place, not deleted, so the numbers can be re-derived:

```
/private/tmp/claude-501/-Users-denismasatovic-Projects-zomarit-stamity/
  c132da37-7cec-4274-9f5d-5f46348a4780/scratchpad/first-run-bar/
    ledgerkit/        the measured lane (post-init)
    ledgerkit-cold/   the cold-cache install lane
    pristine/         the pre-init template replicates were copied from
    rep2/ rep3/ rep4/ the three replicate lanes
    logs/             stdout+stderr of every timed command
    timings.tsv       label / exit code / real seconds, one row per invocation
    run.sh            the phase runner
```

Nothing was written inside this repository except this file.

---

## 10. Verdict

**mechanical floor: 3.58 seconds** (sum of per-phase medians, n=4; observed
end-to-end range 3.26–3.82 s warm-cache, 4.69 s with a cold cache; all phases
exit 0) **; the ~15-minute bar as WRITTEN is not established by this measurement
because the fifteen minutes describes the six-phase guided conversation between a
model and a human operator — six checkpoints that block on an operator's reading
and decision — and this run measured only the mechanical lane beneath it: install,
`init`, `check`, and the target repository's own gate. What is now established is
that the mechanical half costs under four seconds and is not where the budget
goes; the guided half remains unmeasured, and cannot be measured by running
commands.**
