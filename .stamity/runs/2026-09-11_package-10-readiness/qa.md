# Stamity 1.7.0 human QA — unsigned

Candidate: `cae3fcdb9f76429144294d0f0bdebd541cd8b831`.
Draft [PR #34](https://github.com/zomarit/stamity/pull/34).
**Shippable: NO.** The [current handoff](handoff.md) records the separate unresolved
native task-transfer control and incomplete fresh behavioral evaluation. Automated
candidate/platform checks pass; they do not perform the human observations below.

Four fresh disposable repositories are prepared from the verified packed candidate,
one per native client. A fresh local documentation build is also bound to this
candidate. Use the maintainer's prepared client working directories and local site,
not the published 1.6.0 installation or an earlier fixture. The private preparation
recipe supplies their local locations; no private working path is exported here.
Record the actual client/OS/browser/reader versions and evidence for each walk.

Nine rows were derived, zero auto-proven, nine remain for a person; estimated total
60 minutes. Every checkbox is blank because no human has performed or signed these
walks. The rows are ordered by risk, then walking time.

For each H1 row, perform these eight actions:

1. Open that client's fresh fixture in the actual installed native client; record
   its version, OS and fixture identity.
2. Inspect native hook discovery/registration and the initial repository trust state.
3. Record what is visible before approval, then approve through the ordinary native
   trust UI after reviewing the hook.
4. Ask the client to read `qa-allowed.txt`; record the successful read and hook feedback.
5. Ask it to run `node -e "require('node:fs').writeFileSync('qa-denied.txt','witness')"`.
6. Record the refusal feedback and whether `qa-denied.txt` exists.
7. Request another permitted read and record whether normal work can continue.
8. Preserve the native evidence and `qa-hooks/observations.jsonl` decision log before
   resetting anything. A denied write that succeeds is a failure; do not repeat it
   until it happens to pass.

A direct shell invocation of the hook runner cannot substitute for these native
observations. The filename witness tests an ordinary supported tool route; it does
not establish enforcement on every hosted or specialized client tool.

For each H3 row, use only the keyboard for five actions: set the specified viewport
and theme; traverse header/menu/theme controls; navigate getting started,
customization, packs and trust, and the capability matrix; reach and scroll a wide
table; traverse back and close any open menu. Record lost focus, unreachable
controls, traps or unreadable overflow.

| # | Scenario | Steps | Expected | Risk | Minutes | Proof |
|---|---|---|---|---|---|---|
| H1a | Claude Code native discovery, trust and allow/deny | Perform the eight H1 actions in the prepared Claude fixture. | Registration/trust is visible, read succeeds, protected write is denied and absent, permitted follow-up succeeds. | H | 8 | [ ] UNPERFORMED |
| H1b | Cursor native discovery, trust and allow/deny | Perform the eight H1 actions in the prepared Cursor fixture. | The same allow/deny/continue behavior is observed. Record the documented native failClosed support and unavailable caller-identity limitation separately. | H | 8 | [ ] UNPERFORMED |
| H1c | Copilot native discovery, trust and allow/deny | Perform the eight H1 actions through the documented Copilot CLI/cloud route. | Read succeeds and write is denied. Record timeout-fail-open limitations; this does not prove editor support or timeout enforcement. | H | 8 | [ ] UNPERFORMED |
| H1d | Codex native discovery, trust and allow/deny | Perform the eight H1 actions in the prepared Codex fixture, using `/hooks` and a supported shell call. | Registration/trust and supported shell allowance/denial are visible. Hosted/specialized bypass and unavailable caller identity remain disclosed. | H | 8 | [ ] UNPERFORMED |
| H3a | Complete keyboard journey at 375px/light | Perform the five H3 actions at 375px in light theme. | Every rendered control/link is reachable and operable; focus stays visible and ordered; overflow is readable; no trap. | M | 5 | [ ] UNPERFORMED |
| H3b | Complete keyboard journey at 375px/dark | Perform the five H3 actions at 375px in dark theme. | The entire journey remains operable, readable and free of traps. | M | 5 | [ ] UNPERFORMED |
| H3c | Complete keyboard journey at 1440px/light | Perform the five H3 actions at 1440px in light theme. | The entire journey remains operable, readable and free of traps. | M | 5 | [ ] UNPERFORMED |
| H3d | Complete keyboard journey at 1440px/dark | Perform the five H3 actions at 1440px in dark theme. | The entire journey remains operable, readable and free of traps. | M | 5 | [ ] UNPERFORMED |
| H2 | Screen reader understands changed documentation | Record reader/browser versions; open getting started; navigate headings; follow customization links; read packs and trust; traverse a capability table by row/column; check announced headers/cells; traverse navigation for lost context or traps. | Meaningful names/headings, associated headers/cells, reachable links and retained reading context. | M | 8 | [ ] UNPERFORMED |

## Human sign-off

- Candidate SHA: `cae3fcdb9f76429144294d0f0bdebd541cd8b831`
- Human name and observation date:
- Client/OS/browser/screen-reader versions:
- Per-row PASS / FAIL / UNPERFORMED, actual observation and evidence locator:
- [ ] Every H1 row was actually walked and passed.
- [ ] Every H2/H3 screen-reader and complete keyboard journey was actually walked.
- [ ] No baseline security, correctness or accessibility violation remains; these
  block release regardless of H/M/L risk label.
- [ ] Every failing nonfloor M row has a filed follow-up, linked, and an explicit
  release disposition.
- Nonfloor L failures are recorded, not blocking.
- [ ] Separate evaluation, review and final candidate verification gaps are closed.
- Rollback: restore a disposable consumer to its prior verified package; correct the
  product through a reviewed PR. Preserve existing release tags/artifacts; an already
  published correction requires a new version.
- Shippable: **NO — H1a–H1d, H2 and H3a–H3d are unperformed; sign-off is blank;
  actual native task-transfer enforcement and the fresh behavioral pass remain open.**
- Human sign-off:
- Maintainer's final release go-ahead, separately after QA/sign-off:

This form authorizes no merge, tag, publication or protected deployment approval.
An automated or prior-version result cannot sign this checkpoint.
