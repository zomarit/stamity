**Status: DONE.** All six findings hold at `ae65b89e`: ACCEPT ×6. I traced the code read-only and ran no commands. So the parser side of each claim is confirmed by reading. The tool side (git, cmd.exe and wget really behaving as the reviewer says) rests on the reviewer's reproductions and on documented behaviour.

Two of the reviewer's claims are wrong in part:
- **F1:** an unattended run is already refused.
- **F16:** the unattended part is right, so the bypass is attended only.

Three findings go further than the reviewer said and also get past the unattended rule: F3's root cause, F10's caret in the program word, and F11. Fix those first.

---

### F1: a JSON `ref` field naming a tag (`personOnly.ts:1046`)
- **decision:** ACCEPT
- **severity:** Warning
- **confidence:** high. Basis `direct`: the regex at `:1045` was read against the joined line text.
- **applicability:** current for attended sessions. The claim that an *unattended* session can create the tag is wrong.
- **evidence:**
  - `src/hooks/personOnly.ts:1045`: `/(^|[=\s])refs\/tags\//i.test(text)`. In `-d '{"ref":"refs/tags/v2",...}'` the character before `refs/tags/` is `"`, so the test fails.
  - `:900-903`: the JSON body *is* parsed into `bodyFields` (`ref` = `refs/tags/v2`), but `:1043-1053` never reads `fields("ref")`.
  - `:1048`: `forced([])` is false. `:1050`: the heads scan has the same delimiter gap. The verdict comes back `{deny:false}` at `:1091`.
  - Unattended: `:1556` plus `:1772` refuse any write on `git/refs`. Test rows `test/hooks/personOnly.test.ts:773-774` show this.
- **causal_chain:**
  1. `httpCall` reads path `git/refs` with method POST (`:582-645`).
  2. `httpVerdict` enters the `git/refs` branch (`:1043`). The path is not `git/refs/tags`, and the text regex needs `=` or whitespace before `refs/tags/`.
  3. JSON quoting puts `"` there. The already-parsed `ref` field is ignored, so the function returns null.
  4. The person-only table allows a tag-ref create from an attended session.
  - Only gh's `-f ref=…` form is tested (`personOnly.test.ts:397`), which is why the gap went unnoticed.
- **smallest_fix:** at `:1045`, add `|| fields("ref").some((ref) => ref === null || /^refs\/tags\//i.test(ref))`.
- **test rows:**
  - DENY `curl -X POST -d '{"ref":"refs/tags/v2","sha":"abc"}' https://api.github.com/repos/o/r/git/refs` → `push-tags`.
  - DENY the same body with `--json`.
  - ALLOW `curl -X POST -d '{"ref":"refs/heads/feat/y","sha":"abc"}' https://api.github.com/repos/o/r/git/refs`.
- **residual_named:** no. "A REST body read from a file" (`personOnly.ts:33-34`, `SECURITY.md:105` residual column) covers a body in a file, not one written inline on the line.

### F3: publish run through a package runner whose options come first (`personOnly.ts:1070`)
- **decision:** ACCEPT
- **severity:** Warning. This is one of the three that reach unattended.
- **confidence:** high. Basis `direct` for the verdict. That npm, pnpm and yarn accept these forms is `inferred`: the code already treats `--workspace`/`--filter` as runner options (`:231`), plus the reviewer's reading of the tools' help.
- **applicability:** current, in both modes.
- **evidence:**
  - `:433` and `:437`: a runner is recognised only when `<program> <next word>` is in `RUNNERS` (`:230`). `npm --workspace` is not.
  - `:1060-1068`: `publishVerdict` skips `--workspace mypkg`. The first positional is then `exec` (or `workspace` for yarn), so `:1070` returns null.
  - `unattendedPushVerdict` has no publish rule (`:1704-1776`).
- **causal_chain:**
  1. The program options before the subcommand hide the runner from `commandsOf` (`:433`).
  2. The whole line is read as one `npm` call, and `publishVerdict` checks only the *first* positional (`:1068-1070`).
  3. `exec`, `workspace` or `mypkg` sits there instead of `publish`, so the call is allowed in both modes.
- **wider than reported:** the same adjacency gap at `:433` (and its copy at `:1327`) hides any inner command. For example, `npm -w x exec -- git push origin feat/x` or `pnpm --filter x exec git push` gets past **both** verdicts, the unattended raw-push rule included. This is `inferred`, from the same trace with `program === "npm"` falling through at `:1088` and `:1753-1767`.
- **smallest_fix:** in `publishVerdict`, deny any positional `publish` whose previous positional is `npm`, `pnpm`, `yarn` or `bun`, or that sits two words after yarn's `workspace`.
  - This keeps the ALLOW row `bun run publish` (`personOnly.test.ts:492`).
  - The wider push variant needs its own fix in `commandsOf`: skip the package manager's leading valued options before testing `RUNNERS`. That is inside `<shell-reading>`, so both copies must change.
- **test rows:**
  - DENY → `publish`: `npm --workspace mypkg exec -- npm publish`, `pnpm --filter mypkg exec npm publish`, `yarn workspace mypkg npm publish`, `yarn workspace mypkg publish`.
  - ALLOW: `bun run publish` (existing), `npm --workspace mypkg run build`.
  - If the wider fix lands: unattended deny `npm -w x exec -- git push origin feat/x`.
- **residual_named:** no.

### F9: shortened git push options (`personOnly.ts:706`)
- **decision:** ACCEPT
- **severity:** Warning
- **confidence:** high. Basis `direct` for the verdict. That git accepts a unique prefix is `inferred`: the module already honours it for `rebase --ex`/`--exe` "as git's option parser reads them" (`:512-518`), plus the reviewer's run against a scratch remote.
- **applicability:** current, attended only. Unattended refuses every raw `git push` (`:1708`).
- **evidence:** `:703-706` compare the whole option name with `includes`. `--force-w`, `--del`, `--mir`, `--ta` and `--rep=origin` match nothing, so `:766` returns null.
- **causal_chain:**
  1. `pushVerdict` lower-cases the name and tests exact membership (`:703-706`).
  2. A unique prefix that git expands (for example `--force-w` → `--force-with-lease`) sets neither `force`, `remove` nor `tags`.
  3. With a non-default refspec, every later check passes, so the push is allowed.
  4. `--rep=origin main` also leaves `repoGiven` unset, so `main` is taken as the remote and the push to `main` passes.
- **smallest_fix:** replace each `[...].includes(name)` at `:704-707` with `[...].some((o) => name.length > 3 && o.startsWith(name))` (and `name.length > 4` for `--repo`).
  - This still allows `--no-force-with-lease` and `--no-follow-tags` (`personOnly.test.ts:468-469`).
  - It refuses ambiguous prefixes, which git itself rejects anyway.
- **test rows:**
  - DENY `git push --force-w origin feat/x` → `force-push`.
  - DENY `git push --del origin feat/x` → `push-delete`.
  - DENY `git push --mir` → `push-tags`.
  - DENY `git push --rep=origin main` → `push-default`.
  - ALLOW `git push --dry-r origin feat/x`.
- **residual_named:** no. `SECURITY.md:417-428` names aliases, computed lines, push configuration and GraphQL read from a file. An abbreviation is visible in the text, so "respelling the text hides" does not cover it.

### F10: cmd.exe caret escapes (`personOnly.ts:510`)
- **decision:** ACCEPT
- **severity:** Warning. This is one of the three that reach unattended.
- **confidence:** high. Basis `direct` for the verdict. That cmd.exe strips `^` is `unverified` in this pass (codebase tier); it rests on the reviewer's reproduction.
- **applicability:** current, in both modes for the program-word variant.
- **evidence:**
  - `:509-510`: the text after `/c` or `/k` is re-read with `pwsh=true`, and through `:427` also with POSIX rules. Neither reading in `splitLine` (`:281-413`) treats `^` as an escape.
  - The word `--for^ce` reaches `pushVerdict` unchanged.
  - `SECURITY.md:543-545` describes the `cmd` line as read with PowerShell's escape rules (the backtick escape), which is not cmd's escape.
- **causal_chain:**
  1. `cmd /c git push --for^ce origin feat/x` is split, and the rest goes to `commandsOf(…, true)` (`:510`).
  2. Both readings keep the caret, so `pushVerdict` sees `--for^ce` and `--del^ete` as unknown options (`:704-706`). The call is allowed.
  3. cmd.exe removes the carets, and git receives `--force` or `--delete`.
- **wider than reported:** `cmd /c g^it push origin feat/x` leaves the program word `g^it` (`:260-263`), which is not `git`. It therefore gets past the unattended raw-push rule too (`:1706`), not only the person-only table. This is `inferred` from the same trace.
- **smallest_fix:** at `:510` and its copy at `:1404`, also push `commandsOf(rest.replace(/\^([\s\S])/g, "$1"), depth + 1, true)`. That is an added reading, so it only adds denials. Both `<shell-reading>` copies must change, and `personOnly.test.ts:1174` holds them equal.
- **test rows:**
  - DENY `cmd /c git push --for^ce origin feat/x` → `force-push`.
  - DENY `cmd /c git push --del^ete origin feat/x` → `push-delete`.
  - DENY `cmd /c g^it push --force origin feat/x` → `force-push`.
  - Unattended deny `cmd /c g^it push origin feat/x`.
  - ALLOW `cmd /c git status` (existing, `:514`).
- **residual_named:** no. `SECURITY.md:537-546` claims `cmd /c` lines are read; there is no caret residual. `:424` ("program word is computed") does not cover a literal caret.

### F11: shortened wget `--method` (`personOnly.ts:602`)
- **decision:** ACCEPT
- **severity:** Warning. This is one of the three that reach unattended.
- **confidence:** high. Basis `direct` for the verdict. That wget's getopt accepts the prefix is `unverified` here; it rests on the reviewer's Wget 1.21.4 run.
- **applicability:** current, in both modes.
- **evidence:**
  - `:598-602`: the method is read only from `-X`, `--method` and `--request`, matched exactly.
  - `--met` falls through to `:627`, and `DELETE` is recorded as a target. The method stays GET (`:631`), so `write` is false.
  - `httpVerdict` then does `continue` at `:1008`, and the unattended `MOVES` check needs `write` (`:1772`).
- **causal_chain:**
  1. `--met` (or `--meth=DELETE`) is not recognised.
  2. With no method set and no body, the call is classed as GET, so `write` is false.
  3. Both verdicts skip every path. A DELETE on `git/refs/heads/…`, `releases/…` or the repository passes.
- **same family:** wget's body flags `--post-d`, `--body-d` and the file forms have the same prefix gap at `:605-609`, so their POST is also read as GET.
- **smallest_fix:** in `httpCall` (both copies), when the tool is wget and the word starts with `--`, expand a name of at least 5 characters that is a prefix of `--method`, `--post-data`, `--post-file`, `--body-data` or `--body-file` before the checks at `:598-609`. Only expand to these method and body flags, so a mis-expansion can only add a denial.
- **test rows:**
  - DENY `wget --meth=DELETE https://api.github.com/repos/o/r/git/refs/heads/feat/x` → `push-delete`.
  - DENY `wget --meth DELETE https://api.github.com/repos/o/r/releases/1` → `release`.
  - Unattended deny `wget --meth=PATCH https://api.github.com/repos/o/r/pulls/3`.
  - ALLOW `wget https://api.github.com/repos/o/r/releases`.
  - Use `--meth`, not `--met`: on a Wget built with metalink, `--met` is ambiguous.
- **residual_named:** no.

### F16: `git send-pack` (`personOnly.ts:1080`)
- **decision:** ACCEPT
- **severity:** Warning. Its reach is narrower than the others: attended only, and only where `send-pack` can connect (ssh or file).
- **confidence:** high. Basis `direct` for the verdict. That `send-pack` with no `<ref>` pushes the branches both sides have, and that it does not speak https, is `unverified` (git-send-pack(1) was not read in this pass).
- **applicability:** current, attended only. The reviewer is right that unattended already refuses it (`:1708`, test rows `personOnly.test.ts:733`, `:739`).
- **evidence:** `:1077-1085` send only `push`, `tag` and `subtree` to a verdict. `send-pack` is left null and `:1091` returns `{deny:false}`.
- **causal_chain:**
  1. `gitParts` gives sub `send-pack` (`:544-559`), and there is no branch for it at `:1078-1085`.
  2. `send-pack` takes `--force`, `--all`, `--mirror` and `+`/`:` refspecs, using the same positional layout as `push`.
  3. A force push, a push to `main` or a tag push gets past the attended table.
- **smallest_fix:** at `:1078`, use `if (sub === "push" || sub === "send-pack") verdict = pushVerdict(args, sub === "send-pack" ? [...config, "push.default=matching"] : config)`. This also denies `send-pack` with no refs.
- **test rows:**
  - DENY `git send-pack --force git@github.com:o/r.git feat/x` → `force-push`.
  - DENY `git send-pack git@github.com:o/r.git main` → `push-default`.
  - DENY `git send-pack git@github.com:o/r.git refs/tags/v1` → `push-tags`.
  - DENY `git send-pack git@github.com:o/r.git` → `push-default`.
  - DENY `git-send-pack -f git@github.com:o/r.git feat/x` → `force-push`.
  - ALLOW `git send-pack git@github.com:o/r.git feat/x`.
- **residual_named:** no.

---

### Findings that share a fix
- **F9 and F11** have the same root cause: an option shortened to a unique prefix is not recognised. The fixes go in two places, though: `pushVerdict` (outside `<shell-reading>`, one copy) and `httpCall` (inside it, two copies). One small "unique prefix" helper idea, two diffs.
- **F3** has one fix only for the publish forms. Its root cause (`:433`, runner options before the subcommand) needs a `<shell-reading>` change in both copies, and only that covers the push variant.
- **F10** is its own `<shell-reading>` change (both copies).
- **F1** and **F16** are one-line, independent changes outside the shared block.
- **Every fix** reaches the emitted guard, because `src/hooks/scripts.ts:3187-3189` embeds both functions via `.toString()`. After any of them:
  - Refresh `test/emit/__snapshots__/crossClientGoldens.test.ts.snap` and `test/corpus/__snapshots__/emissionGoldens.test.ts.snap`.
  - Re-check the guard's size budget (`scripts.ts:228`, 124 928 bytes / 3 210 lines).
  - Edits at `:433` (F3's root-cause variant), `:510` (F10) and `:598` (F11) shift every line below them, so REQ-FLOW-120's line citations (`everyday-flows.md:3833`, `:3839-3848`) would drift.

### Breaking-change candidates
None. No exported signature or type changes. The verdicts only deny more.

### Unanswerable (confidence low, basis `unverified`)
1. **How much budget headroom the guard has at HEAD.** Probed: `scripts.ts:202-228`. Its last measurement is older than later guard rounds. Smallest input: run `test/hooks/scriptBudget.test.ts` after the fix.
2. **Whether curl accepts shortened long options** (for example `--req`). Not probed: codebase tier, and I ran no commands. Smallest input: `curl --req DELETE …` against a local server.
3. **Whether a test pins the line numbers that specs cite.** Not searched. Smallest input: grep `test/` for `personOnly.ts:` citations.
4. **Tool-side behaviour of F9, F10, F11 and F16.** Not reproduced here. These rest on the reviewer's runs plus the code's own abbreviation precedent at `:512-518`.

### Related doc drift, not one of the six (Minor, confidence high, basis `direct`)
`SECURITY.md:528-530` (repeated in `everyday-flows.md:3798-3800`) says the GraphQL tag-ref create, the GraphQL ref delete and a ref path with a percent-encoded letter all pass in attended sessions. The code refuses all three (`personOnly.ts:996-1005`, `:639`), and so do the tests (`personOnly.test.ts:235-237`, `:263`, `:293`). Since that page text is pinned by a test, fixing it is its own change.

**Sources consulted:**
- `src/hooks/personOnly.ts`
- `src/hooks/scripts.ts`
- `test/hooks/personOnly.test.ts`
- `test/hooks/personOnlyGuard.test.ts`
- `test/hooks/scriptBudget.test.ts`
- `SECURITY.md`
- `docs/specs/everyday-flows.md`
- `brief-R1.txt`