# In-flow plan — the pack signing rehearsal's bounded input carries the corpus

Run `2026-10-06_rehearsal-bounded-content`. Base `c48bace2` (`main`) on branch `fix/rehearsal-bounded-content`.

Facts the unit rests on:
- **The workflow's bounded input** (`.github/workflows/pack-signing-rehearsal.yml`).
  - The `prepare` job checks out the source and runs `node source/scripts/pack-signing-rehearsal.mjs prepare`.
  - Its step "Archive only reviewed input paths" then tars `src node_modules package.json package-lock.json
    scripts/sign-pack.mjs scripts/native-typescript.mjs scripts/pack-signing-rehearsal.mjs rehearsal` into
    `signing-input.tgz`, and publishes the archive's sha256 as `input_sha256`.
  - The `sign` job (`id-token: write`) and the `verify` job each check that digest, then extract the archive into
    `source/`. Neither checks out the repository.
- **The receipt.** `prepare` (`scripts/pack-signing-rehearsal.mjs:55-63`) hashes
  `git ls-files -z src package.json package-lock.json scripts/sign-pack.mjs scripts/native-typescript.mjs` and the
  script itself into `rehearsal/inputs.json`.
- **The cause.** Since `1fa55344`, `planPackInstall` (`src/pack/install.ts:1218`) calls `collectNameClashes` (`:899`). It
  builds the content index (`src/content/catalog.ts:883`), and `resolveBundledContentRoot`
  (`src/content/contentRoot.ts:79`) throws when neither `<root>/content` nor `<root>/dist/content` exists. The `verify`
  job's tree has neither, so `verify` fails at revision 1's plan.
- **The proof of the fix.** The failing run's own artifacts, extracted as the job does, with `content/` from
  `1fa55344` added, pass `verify` against the real Sigstore bundles: revision 1 installs, five negatives are refused,
  revision 2 installs.
- **Requirement.** REQ-FINISH-005 (`docs/specs/implementation-finish.md:74`): the verify/install/update round-trip
  passes and the negatives are refused. This unit restores its push-run proof. The spec needs no edit.

## Units

### u1-rehearsal-content

| Cell | Value |
|---|---|
| `concern` | The rehearsal archives and receipts the corpus that the planning API it witnesses now reads |
| `requirements` | REQ-FINISH-005 |
| `files` | `.github/workflows/pack-signing-rehearsal.yml`, `scripts/pack-signing-rehearsal.mjs`, `test/ci/packSigningRehearsal.test.ts` |
| `interfaces` | No exported signature changes. The archive and `inputs.json` gain `content/**`. `verify(root, context, options)` is unchanged. |
| `change` | Add `content` to the archive step's `tar` path list, between `src` and `node_modules`, and to `prepare`'s `git ls-files` list, so `inputs.json` names every archived source path. Nothing else in the workflow moves: permissions, egress lists, digests and the `paths:` filter stay as they are. |
| `testCriteria` | **Given** a temporary tree holding only the paths the workflow's archive step names (read from the parsed workflow, never a second hand-written list), with `node_modules` linked and fixtures signed by the local witness the existing round-trip test uses, **when** that tree's own copy of the script runs `verify`, **then** it records 2 installs and 5 refusals. On `c48bace2` the same test fails with "Bundled content not found". **And** every source path `prepare` hashes is one the archive step carries, and the reverse, apart from `node_modules` and `rehearsal`. |
| `edgeCases` | Windows: the archive step is POSIX shell on `ubuntu-latest`, but the test runs on every CI leg, so build the tree with `node:fs` and `path.join`, not `tar`. Keep the copy small and the test fast (`content/` is about 0.6 MB). Reading the archive line must fail loudly if the step is renamed or its command reshaped. |
| `verify` | `npm run build`, then `npx vitest run test/ci/packSigningRehearsal.test.ts test/architecture`, `npm run lint`, `npm run typecheck`, `npx knip`, `node scripts/leak-gate.mjs` |
| `spec delta` | none expected; say so, or name it |

Contract census: one unit, no peer. The archive's path list is read by:
- the `prepare` job's own digest;
- the `sign` and `verify` jobs' extraction;
- this test.

The census closes `clean` when the implementer's grep finds no other reader.
