# Release network policy

Rechecked 2026-09-10 against [published release 34509238734](https://github.com/zomarit/stamity/actions/runs/34509238734),
[rehearsal 34500672177](https://github.com/zomarit/stamity/actions/runs/34500672177),
the [GitHub metadata endpoint](https://api.github.com/meta), and the
[official runner endpoint contract](https://docs.github.com/en/actions/reference/runners/github-hosted-runners#communication-requirements-for-github-hosted-runners).
These are historical observations of the preceding policy, not proof of the changed policy.

| Job | Process-associated destinations observed |
|---|---|
| gates, both runs | git: github.com; node: registry.npmjs.org, results-receiver.actions.githubusercontent.com, productionresultssa0.blob.core.windows.net |
| publish, release only | gh: api.github.com, uploads.github.com; node: registry.npmjs.org, results-receiver.actions.githubusercontent.com, productionresultssa0.blob.core.windows.net, fulcio.sigstore.dev, rekor.sigstore.dev, run-actions-2-azure-eastus.actions.githubusercontent.com |

Runner-service traffic also contacted results-receiver. DNS pre-resolution is excluded
from this table: the hardener resolves all official storage accounts at startup, which
does not establish that a build process connected to each one.

GitHub currently enumerates `productionresultssa0` through `productionresultssa19` under
`domains.actions`; both observed runs resolved that roster. The upload/download policies
now list those twenty exact hosts instead of admitting every Azure blob account. This
deliberately preserves the official multi-account service contract rather than pinning
the single account contacted by these two runs. Recheck the metadata roster before a
release; a newly required unlisted destination must fail closed pending review.

Setup-node's Node download and GitHub manifest/CDN hosts remain for a cold runner. The
publish job retains OIDC and Sigstore TUF endpoints, including paths a warmed cache may
not contact. No signing endpoints or publishing identity are added to the build job.

The [pinned hardener](https://github.com/step-security/harden-runner/tree/351661ca32ac09a36dc5ee2d536e3128f2a3c8ed)
also manages its telemetry and GitHub runner/cache endpoints using the current service
metadata. Thus the YAML workload list is not a claim that the runner itself contacts
only those hosts. [StepSecurity recommendations](https://docs.stepsecurity.io/harden-runner/workflow-runs)
aggregate observations across runs; they are evidence to review, not proof that an
unobserved fallback can safely be removed.

A changed-candidate `dry_run=true` rehearsal must exercise gates. It cannot exercise the
credential-bearing publish job. That path still requires the final release candidate,
protected environment approval, immutable tag/version/ancestry proofs and digest-verified
handoff. Record the actual rehearsal and publish run IDs in the candidate evidence; prior
runs and a skipped job cannot close those proofs.

## The provenance hosts

The publish job reaches the OIDC and Sigstore hosts for one consumer: the provenance
attestation `npm publish --provenance` writes over trusted publishing. Each host is
listed for it, and a later edit that drops npm provenance is the one that may remove them.

| Destination | What reaches it |
|---|---|
| `token.actions.githubusercontent.com` | the OIDC token the `id-token: write` grant mints for `npm publish` |
| `fulcio.sigstore.dev` | the signing certificate npm's provenance is issued under |
| `rekor.sigstore.dev` | the transparency log entry npm's provenance writes |
| `tuf-repo-cdn.sigstore.dev` | the Sigstore TUF root the npm client verifies against |

Until 1.15.0 the release also published the plugin route's client roots and proved the APM
route, in a third job with its own Python hosts. Both routes were deleted in 1.15.0: the job, its
`pypi.org`, `files.pythonhosted.org` and `raw.githubusercontent.com` allowances, the
archive attestation and the distribution branch push went with them, and no destination
was added in their place.

## Dependency recheck

On 2026-09-28, both [ICNS](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) and
[JXL/HEIF](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq) advisories name 2.0.3 as the
first patched `image-size` release: the supported upstream fix the 2026-09-10 recheck named
as its re-evaluation trigger. The project moved from its archived
[GitHub repository](https://github.com/image-size/image-size) to
[Codeberg](https://codeberg.org/image-size/image-size), where the fix and the 2.0.3 and 2.0.4
version commits follow the `v2.0.2` tag, and the npm maintainer who published 2.0.2 published
both. The website's lockfile moved to 2.0.4 ([#56](https://github.com/zomarit/stamity/pull/56)),
which closes the accepted dependency condition. No third-party replacement was used.
