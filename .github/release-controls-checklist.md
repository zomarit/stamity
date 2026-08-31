# Release controls — arming checklist

A prepared checklist for arming the three platform-side release controls the security page
names as **not yet in force**. Each is repository or registry settings, not code: nothing in
this tree can create them, which is exactly why they need a human at a console.

`SECURITY.md` ("Publishing this package") states the boundary this checklist closes:

> What no file here can do is the platform half, and it is maintainer setup rather than code: a
> required reviewer on the `npm-publish` deployment environment, a `v*` tag ruleset, and the
> trusted-publisher entry on the registry naming this repository, this workflow file and that
> environment. Until each of those exists, the control it represents is not in force.

This checklist is **prepare-only**. An operator performs the console steps and confirms each
control is armed; only after all three are confirmed does the one reserved documentation edit at
the end get made. Nothing here flips `SECURITY.md`.

## What the workflow already does (the code half)

`.github/workflows/release.yml` already carries every control it can hold in-file. The three
platform controls below sit on top of these; they do not replace them.

- **Job split, credential isolation.** A `gates` job runs the build, the suite, the leak gate
  and the packed-artifact smoke on the shipping commit and holds **no** `id-token`; a separate
  `publish` job holds `id-token: write` and runs only npm, the GitHub CLI and three SHA-pinned
  actions. A compromised build-time dependency runs in the job that has no credential.
- **OIDC trusted publishing, no stored token.** `publish` authenticates through a per-run OIDC
  token (`npm publish --provenance`), so there is no long-lived npm credential in the repository
  to leak or rotate. See the `Publish to npm with provenance` step and the `permissions` block on
  the `publish` job.
- **Ancestry and version proofs.** Before the pack step, `gates` proves the run is a `v*` tag
  whose name equals the `package.json` version and whose commit is reachable from `origin/main`.
  These run on a tag push and on a real-publish dispatch alike; a dispatch from a branch fails
  there.
- **Fail-closed publish condition.** The `publish` job starts only on a `v*` tag push or a
  dispatch that set `dry_run` to literally `false`, re-asserted by an in-job backstop step.

The platform controls below are the durable closures the in-file guards explicitly cannot be:
the release guard lives inside the artifact it guards, so someone with write access who tags a
branch carrying an edited `release.yml` is stopped only by the repository/registry settings, not
by the file.

---

## Control 1 — Required reviewer on the `npm-publish` environment

**What it closes.** A human approval gate in front of every real publish. The `publish` job
declares `environment: npm-publish`; without a required reviewer configured on that environment,
the job runs unattended and the approval the release design assumes does not exist. The
seven-day artifact retention in `release.yml` exists precisely so the artifact outlives this
human approval.

**Steps (GitHub).**

1. Repository → **Settings → Environments**.
2. Open the **`npm-publish`** environment (create it with exactly that name if it does not exist
   — the job's `environment: npm-publish` must match).
3. Under **Deployment protection rules**, enable **Required reviewers** and add the maintainer(s)
   who must approve a publish.
4. Optionally set a **wait timer** of 0 (the reviewer gate is the control; a timer is not).
5. Save.

**Verify it is armed.**

- The `npm-publish` environment lists at least one required reviewer.
- Dispatch the release workflow as a rehearsal (`dry_run` left at its `true` default): the
  `publish` job does not run, so no approval prompt appears — expected, a rehearsal never
  publishes.
- On the next real tag push, the `publish` job shows **Waiting** with a **Review deployments**
  prompt before any npm interaction. That prompt is the armed control.

---

## Control 2 — `v*` tag ruleset

**What it closes.** Who may create, move, or delete a `v*` tag. The publish arms both require a
`v*` tag that already exists and is an ancestor of `main`; a ruleset makes tag creation itself a
governed action rather than anything a write-capable actor can do silently, and blocks a tag from
being force-moved onto a different commit after the gates passed.

**Steps (GitHub).**

1. Repository → **Settings → Rules → Rulesets → New ruleset → New tag ruleset**.
2. Name it (e.g. `release-tags`).
3. **Enforcement status: Active.**
4. **Target tags → Add target →** pattern **`v*`** (matches `v1.0.0`, `v1.2.3`, …).
5. Under **Rules**, restrict tag mutation: enable **Restrict creations**, **Restrict updates**,
   and **Restrict deletions**, so only the roles you grant a bypass may create, move, or delete a
   release tag.
6. Under **Bypass list**, add only the maintainer role (or the release automation) that is
   permitted to cut a tag.
7. Save.

**Verify it is armed.**

- **Settings → Rules → Rulesets** shows `release-tags` as **Active**, targeting `v*`.
- As a non-bypass actor, attempting to push a `v9.9.9` tag is rejected by the ruleset.
- Moving an existing `v*` tag to a different commit is rejected.

---

## Control 3 — npm trusted-publisher entry

**What it closes.** The authentication path for the publish. Trusted publishing lets the
`publish` job mint a short-lived credential from its OIDC token instead of a stored npm token —
but only once the registry knows which repository, which workflow file, and which environment to
trust. Until this entry exists, the publish fails with an authentication error (the correct
failure; it is never a reason to add a stored token).

**Steps (npmjs.com).**

1. Sign in to npmjs.com as a maintainer of **`@zomarit/stamity`**.
2. Package → **`@zomarit/stamity`** → **Settings** → **Trusted Publisher** (GitHub Actions).
3. Add a trusted publisher with these three fields, matching the workflow exactly:
   - **Repository:** `zomarit/stamity`
   - **Workflow file:** `.github/workflows/release.yml`
   - **Environment:** `npm-publish`
4. Save.

**Verify it is armed.**

- The package's trusted-publisher list shows the entry with all three fields above.
- A real publish (or a maintainer's controlled test publish) authenticates over OIDC with no
  `NODE_AUTH_TOKEN` / `NPM_TOKEN` present, and npm records provenance for the published version.
- The published version page on npm shows the provenance/attestation badge.

---

## After all three are confirmed — the one reserved documentation edit

Once, and only once, an operator has confirmed **all three** controls are armed (each "Verify it
is armed" block above passes), the `SECURITY.md` wording that currently states the controls are
**not** in force should be updated to assert they are.

**This edit is NOT made by this checklist and NOT made in the same change that prepares it.** It
is reserved for the operator after arming is confirmed, because a page that claims a control is in
force before the console step exists is a false claim in the security document.

**Exact current sentence in `SECURITY.md` ("Publishing this package" section):**

> Until each of those exists, the control it represents is not in force. Every step that depends
> on one says so where it depends on it.

**Draft replacement (apply only after all three are confirmed armed):**

> Each of those is now in force: a required reviewer gates the `npm-publish` environment, a `v*`
> tag ruleset governs release-tag creation, and the registry's trusted-publisher entry names this
> repository, this workflow file and that environment. Every step that depends on one says so
> where it depends on it.

**Before making that edit, re-read the docs-page test.** `test/docsPages.test.ts` reads
`SECURITY.md` structurally (the "Publishing this package" section and its control claims), so the
flip must be checked against that suite in the same change that makes it — the wording change may
interact with an assertion there. Do not edit `SECURITY.md` or `test/docsPages.test.ts` as part
of preparing this checklist.
