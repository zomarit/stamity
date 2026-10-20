**status: DONE**

I accept F8 and F12 and decline F15. All three claims are accurate about the code at `ae65b89e`. F15 declines only because the scenario it describes is already a named residual.

---

### F8: the credential helper is accepted by name only, not tied to the `gh` the REST reads run

- **decision:** ACCEPT
- **severity:** Warning
- **confidence:** high, `direct` for the code path. For impact: medium, `inferred`. Someone has to control git's config to plant the fake `gh`. That is the operator's own environment, or a repository-supplied cloud setup step.
- **applicability:** current
- **evidence:**
  - `src/runs/preflight.ts:560-571`: `isGhCredentialHelper` takes the program text out of `!<program> auth git-credential`. If it has no shell metacharacters it passes as a path. `/` and `.` are not in that set (`:557`). The check then accepts on the last path component alone: `name === "gh" || name === "gh.exe"` (`:569-570`). So `!./gh auth git-credential` and `!/tmp/x/gh auth git-credential` both pass.
  - `src/runs/preflight.ts:640` is the only helper check in `pushIdentityCheck`. The verdict then says the push goes "over https with gh's credential, the REST reads' identity" (`:651`).
  - The REST reads run a different `gh`, found separately: `ghProgram` → `resolveProgramOnPath("gh", …)` (`src/cli/engine/ghRunner.ts:184-193, 214`). `gate.ts` checks only that one exists (`ghFound`, `src/cli/commands/gate.ts:1894-1904`, a boolean) and passes nothing about its path into `runPreflight` (`gate.ts:1992-1998, 2003-2020`). Nothing compares the helper's path with the `gh` the reads run.
  - The tests lock in the current behaviour. `test/runs/preflight.test.ts:584-592` passes any path named `gh`. The integration fixture `test/cli/commands/gatePreflight.test.ts:54` uses helper `!/opt/tools/gh …`, while the verb's `PATH` `gh` is a temp `bin/gh` (`:111-122, 136`). Those are two different files, and the run still passes.
- **causal_chain:**
  1. The config sets `credential.helper = !./gh auth git-credential`, or any absolute path ending in `gh`. `readPushIdentity` reports it as the single helper (`gate.ts:1857-1863`).
  2. `isGhCredentialHelper` sees the last component is `gh` and returns true (`preflight.ts:569-570`). `pushIdentityCheck` returns `bound: true` (`:656`).
  3. `inspectDirectPush` reads protection through the `PATH`-found `gh`, whose login is account A (`ghRunner.ts:214`). It finds A blocked, and `direct-push` passes (`preflight.ts:710-714`).
  4. At push time git runs `./gh`. Git runs `!` helpers through the shell, from the directory git is working in, usually the top of the work tree; that part is `unverified` at this tier. That program can return account B's credential. The push goes out as B, whose restrictions were never read.
- **residual_named:** only partly. `SECURITY.md:502-503` names the bare form only ("a credential helper written as `!gh auth git-credential`… reads the helper's program name, not the binary it resolves to"). `docs/specs/everyday-flows.md:3795-3796` says "`PATH` decides which `gh` a credential helper naming `gh` runs". Neither names an explicit path, relative or absolute, to a program that is not GitHub CLI. `PATH` plays no part in that case.
- **smallest_fix:** Pass the REST runner's resolved `gh`, both its path and its realpath, from `gate.ts` into `PreflightDeps` (for example, have `ghFound` return the path). Then accept a helper only if it is bare `gh`/`gh.exe` (the named `PATH` residual) or its path equals one of those two, and refuse any other path, relative paths like `./gh` included.
- **proving test:** add to `test/runs/preflight.test.ts:600-612` the cases `!./gh auth git-credential` and `!/tmp/x/gh auth git-credential`, each with a different resolved REST `gh`. Each should come back `unknown` with the gh fix. Also add a pass case where the helper path equals the resolved `gh`.
  - Two existing tests need inline reasons when they change (testing rule 5): `gatePreflight.test.ts:54`, whose fixture must point at its own `ghBin()` file, and `preflight.test.ts:585-586`, whose path cases must match the injected path.
  - Add a `SECURITY.md` line after `:503` if the bare form stays a residual.

### F15: an org ruleset that targets `refs/heads/<default>` counts as binding an admin

- **decision:** DECLINE
- **severity:** Warning, if it were open.
- **confidence:** high, `direct`. The accepting line, the guard rows, their tests and the residual text are all read at cited lines.
- **applicability:** already-addressed (named residual, plus the guard holds the act's known forms)
- **evidence:**
  - The claim's premise is true. `pinsDefaultBranch` accepts `entry === \`refs/heads/${branch}\`` (`src/runs/preflight.ts:285`). `test/runs/preflight.test.ts:308` asserts that an admin under `orgConditions(["refs/heads/main"])` is `blocked`.
  - An admin can change the default branch in principle. The pre-flight says so itself (`preflight.ts:20-23`).
  - The engine's own REST door cannot do it: writes go only to PR paths (`src/cli/engine/ghRunner.ts:99-104, 123-125`).
  - The shell guard refuses the known forms: `gh repo edit --default-branch` (`src/hooks/personOnly.ts:831-832`, tests `test/hooks/personOnly.test.ts:367-368`) and a REST PATCH on the repository (`personOnly.ts:1024-1025`, test `personOnly.test.ts:376`).
- **counter_argument:** The design choice is deliberate and tested.
  - A ruleset pinned to the explicit branch keeps that branch protected through a default-branch change. `~DEFAULT_BRANCH` would leave the old branch open after the change, which is why it is refused (`preflight.ts:274-276`; test `:316`).
  - The remaining gap is that the change itself makes an unprotected branch the default. That is exactly what `SECURITY.md:498-501` names: "a default-branch change — can take the default branch out of an organization ruleset's reach. The shell guard holds their known forms, and repository acts respelled past it are a residual, so the wall is strongest when the account … has no admin". REQ-FLOW-104 says the same (`docs/specs/everyday-flows.md:3793-3795`).
  - The reviewer's fix, accepting only `~ALL`, has a cost nobody has checked. A `~ALL` pull-request or update rule may also block the run's push of its own branch. That is `unverified`: nothing in the repo settles how GitHub applies it to a newly created branch. If it does block, an admin account could no longer pass at all, which changes the design rather than fixing a defect.
- **residual_named:** yes, `SECURITY.md:498-501`; `docs/specs/everyday-flows.md:3793-3795`.
- **smallest_fix:** none in code. Optionally, the reply can point to `SECURITY.md:498-501` and the guard tests `test/hooks/personOnly.test.ts:367-368, 376`.

### F12: `head.label` is compared to the owner case-sensitively

- **decision:** ACCEPT
- **severity:** Warning. `run end` loses the morning-list handoff and reports not-done. Nothing is pushed or merged wrongly.
- **confidence:** high, `direct`, for the comparison and the failure path. That GitHub returns the canonical login spelling in `head.label` is `unverified` at this tier: it comes from the reviewer's stub, not from anything in the repo.
- **applicability:** current
- **evidence:**
  - `src/runs/pullRequest.ts:145`: `label !== \`${owner}:${head}\`` is an exact string comparison.
  - `owner` keeps the spelling from the origin URL. `resolveRepo` → `parseGitRemote` lowercases only the host (`src/workspace/git.ts:198-210, 251-252`), and `run.ts:313, 318, 1087` passes it through unchanged.
  - The failure path:
    - The first lookup misses (`pullRequest.ts:249`).
    - The POST gets a 422 "already exists" (`:277`).
    - `relook` misses again and returns `notDone "…the second lookup found none open"` (`:265-266`).
  - No test covers this. Every fixture label is lowercase `acme:` (`test/runs/pullRequest.test.ts:68`). `:241-246` covers another *branch* but not another owner.
  - Elsewhere the codebase compares owners case-insensitively: `preflight.ts:600-602, 626-630, 690`, and logins at `:225, 237`.
- **causal_chain:**
  1. The origin is `https://github.com/acme/app` but the account's canonical login is `Acme`. `owner = "acme"` (`git.ts:252`).
  2. The lookup returns the run's own open PR with `head.label = "Acme:stamity/x"`. Line 145 skips it, so `openPrOnBranch` returns `null`.
  3. `ensureDraftPr` POSTs, GitHub answers 422 "already exists", `relook` misses on the same comparison, and the result is `notDone` (`pullRequest.ts:264-267, 277`).
  4. `run end` cannot replace the body, so the morning list never reaches the PR.
- **residual_named:** no (`SECURITY.md` has no row on owner casing; the grep for `label` found only board-label rows at `:206, :214`).
- **smallest_fix:** at `pullRequest.ts:145`, split `label` at the first `:`. Compare the owner part with `.toLowerCase()` on both sides and keep the branch part exact (git refs are case-sensitive).
- **proving test:** in `test/runs/pullRequest.test.ts`:
  - Owner `acme` with a lookup returning `head: { ref: BRANCH, label: \`Acme:${BRANCH}\` }` and this run's marker should give `how: "existing"`, with exactly one PATCH and no POST.
  - A fork guard: `label: \`other:${BRANCH}\`` should still be read as none, then `created`.
  - The first case fails at HEAD and passes after the fix.

---

### Breaking-change candidates

None. `src/runs/preflight.ts` and `src/runs/pullRequest.ts` are not re-exported: `package.json:34-39` exports only `.` → `dist/index.js`, and `src/index.ts` contains no `preflight`/`pullRequest`. Confidence high, `direct`. F8's fix adds a field to the internal `PreflightDeps`. Its readers are `gate.ts:2003` and the `greenDeps` test helper.

### Unanswerable at this tier

1. **Does GitHub's `head=` filter match the owner part regardless of case?** Probed: `pullRequest.ts:137-138, 247`, the tests and the docs in scope; nothing settles it. Why it matters: if a wrong-case filter returns an empty list rather than every open PR, the F12 label fix alone does not recover the PR, and the canonical owner (for example the repository read's `owner.login`) would be needed for the query. Smallest input that would settle it: one `gh api 'repos/<Owner>/<repo>/pulls?head=<owner-lowercased>:<branch>'` against a real repository. Confidence low, `unverified`.
2. **Can a run push its own branch under a `~ALL` pull-request rule?** Probed: `preflight.ts`, the tests, `SECURITY.md`; nothing in the repo answers it. It decides what F15's suggested fix would cost. Settled by: GitHub's ruleset docs on branch creation under a `pull_request` rule (`+web`), or a test push. Confidence low, `unverified`.
3. **Where does git run a `!./gh` helper from during `git push`?** Probed: `gate.ts:1720-1737, 1837-1863` (config is read, the helper is never run). Settled by: git's `run-command`/`setup_git_directory` docs, or one local run. This does not change F8's verdict, since the absolute-path case alone shows the gap. Confidence low, `unverified`.

### Sources consulted

- `src/runs/preflight.ts`
- `src/runs/pullRequest.ts`
- `src/cli/engine/ghRunner.ts`
- `src/cli/commands/gate.ts` (`:1690-2030`)
- `src/cli/commands/run.ts` (`:295-324, 1087`)
- `src/workspace/git.ts` (`:75-86, 198-252`)
- `src/hooks/personOnly.ts` (greps at `:91, 831-832, 1024-1025`)
- `test/runs/preflight.test.ts` (`:270-356, 570-640`)
- `test/cli/commands/gatePreflight.test.ts` (`:54, 85-144`)
- `test/runs/pullRequest.test.ts` (`:55-254`)
- `test/hooks/personOnly.test.ts` (grep at `:367-376`)
- `SECURITY.md` (`:155-173, 400-514`)
- `docs/specs/everyday-flows.md` (`:3717-3806`)
- `package.json` (`:30-39`)