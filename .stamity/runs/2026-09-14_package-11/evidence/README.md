# Pack-signing rehearsal evidence

The pack-signing rehearsal (`.github/workflows/pack-signing-rehearsal.yml`) is the nonpublishing
witness that a pack can be signed with a real GitHub OIDC identity through Sigstore, that the
installer accepts the result, and that it refuses the tampered variants. Each run uploads three
workflow artifacts (`signing-input`, `signed-packs`, `signing-verification`) that GitHub deletes
after seven days. The three runs below are the ones the records cite, so their artifacts were moved
to the permanent evidence release before they expired: one archive per run on
[`evidence-archive-2026-09-15`](https://github.com/zomarit/stamity/releases/tag/evidence-archive-2026-09-15),
its pointer published beside it as `public-pack-signing-rehearsal-<run>.json`, and the same pointer
committed here as `pack-signing-rehearsal-<run>/ARCHIVE.json` (byte-identical to the published copy).

Each archive holds the 12 files exactly as `gh run download` delivered them:

- `signing-input/signing-input.tgz` — the bounded signing input (`src/`, `node_modules/`, the package
  files, three scripts and the unsigned rehearsal fixtures), taken from the fixed reviewed signing source
  `237c6ad915c01f47040e03fb94141c4ab86ffb0f` rather than from the run's own commit.
- `signed-packs/signed-packs.tgz` — the rehearsal directory after signing, both Sigstore bundles included.
- `signing-verification/` — `context.json`, `inputs.json`, `signing.json`, `verification.json`, and
  `packs/revision1`, `packs/revision2` (each `pack.json`, `pack.sigstore.json`, `rules/example.md`).

The pointers use `source.capture: "working-tree"`: the bytes are the downloaded artifacts, not committed
files, and `source.commit` is the run's head commit as candidate context. In every run the workflow
signed two pack revisions (1.0.0, then the 1.0.1 update), installed both at trust tier
`publisher-signed`, and refused all five negative controls (`changed-bytes`, `changed-payload`,
`wrong-identity`, `malformed-bundle`, `stale-update-signature`); `verification.json` records
`passed: true` and the signer identity, which is the workflow's own OIDC identity at the branch named
in the table.

| Run | Head sha | Event / branch | Date (UTC) | What it proved | Archive asset (bytes) | sha256 | Payload | Artifact expiry pre-empted |
|---|---|---|---|---|---|---|---|---|
| [34758487370](https://github.com/zomarit/stamity/actions/runs/34758487370) | `a81fa5a88ed5eb525fbdffa6e1f0d23f7401fbca` | `workflow_dispatch` on `feat/package-10-finish-implementation` | 2026-09-13 12:57 | The authenticated rehearsal on the 1.7.0 candidate: the first live signing with a real OIDC and Sigstore identity plus its negative controls, cited by the SECURITY.md row "Pack-author signing" | `public-pack-signing-rehearsal-34758487370.tar.gz` (4,198,175) | `2c62c3ebe4e7858df3df9319a6db1b954c6f3fd27b32873eee718ce6309fb700` | 12 files, 4,224,530 bytes | 2026-09-20 12:58 to 13:00 (artifacts 10318191325, 10318151663, 10317628647) |
| [35022756533](https://github.com/zomarit/stamity/actions/runs/35022756533) | `d1ac44cb7428a0d023c6e2f70fe8ffef74e19285` | `workflow_dispatch` on `feat/package-10-finish-implementation` | 2026-09-15 20:57 | The rehearsal on the 1.8.0 candidate, green on the candidate that was cut and released as 1.8.0; the workflow was still pinned to the deleted 1.7.0 branch name, so the candidate was pushed under that name for the run | `public-pack-signing-rehearsal-35022756533.tar.gz` (4,198,697) | `a3d913ee037a1bd63cdb9deb15d48a3e46b9571b6ec5df91184bd33b36e1a71a` | 12 files, 4,223,565 bytes | 2026-09-22 20:58 to 21:00 (artifacts 10417998558, 10418805523, 10418073512) |
| [35086254315](https://github.com/zomarit/stamity/actions/runs/35086254315) | `75aa86614e33c26adedd759ff78d5de3552c0bd1` | `push` to `main` | 2026-09-16 10:40 | The first rehearsal from `main` after PR #41 repointed the pin from the deleted branch to `main`: the identity witness is now "signed from main" | `public-pack-signing-rehearsal-35086254315.tar.gz` (4,198,973) | `7e822f83d1bcaff2b6b6f6d32abd9e77865b216ce48360562d933c5cd56691f1` | 12 files, 4,221,870 bytes | 2026-09-23 10:41 to 10:43 (artifacts 10442427441, 10442402725, 10441883010) |

Before upload each payload was screened for credential shapes (GitHub and npm tokens, private-key
blocks, bearer and OIDC token values): none found. The word hits inside `signing-input.tgz` are the
repository's own secret-scanner source under `src/mcp/` and the Sigstore and npm libraries under
`node_modules/`; the one hit in the plain files is a file path listed in `inputs.json`. After upload
each archive was downloaded back through GitHub, verified against its pointer, restored into a new
directory and compared with the staged originals: identical path set, per-file sha256 and modes.

## Restore

Same procedure as [`evals/EVIDENCE-STORAGE.md`](../../../../evals/EVIDENCE-STORAGE.md); shown for the
first run, substitute the other run ids for theirs. Restored files land at
`/tmp/stamity-evidence-restored/.stamity/_scratch/evidence/pack-signing-rehearsal-<run>/`.

```sh
mkdir -p /tmp/stamity-evidence-download
gh release download evidence-archive-2026-09-15 --repo zomarit/stamity --pattern public-pack-signing-rehearsal-34758487370.tar.gz --dir /tmp/stamity-evidence-download
python3 scripts/evidence-archive.py verify --archive /tmp/stamity-evidence-download/public-pack-signing-rehearsal-34758487370.tar.gz --manifest .stamity/runs/2026-09-14_package-11/evidence/pack-signing-rehearsal-34758487370/ARCHIVE.json
python3 scripts/evidence-archive.py restore --archive /tmp/stamity-evidence-download/public-pack-signing-rehearsal-34758487370.tar.gz --manifest .stamity/runs/2026-09-14_package-11/evidence/pack-signing-rehearsal-34758487370/ARCHIVE.json --destination /tmp/stamity-evidence-restored
```
