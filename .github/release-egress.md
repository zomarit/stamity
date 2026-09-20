# Release network policy

Rechecked 2026-09-10 against [published release 34509238734](https://github.com/zomarit/stamity/actions/runs/34509238734),
[rehearsal 34500672177](https://github.com/zomarit/stamity/actions/runs/34500672177),
the [GitHub metadata endpoint](https://api.github.com/meta), and the
[official runner endpoint contract](https://docs.github.com/en/actions/reference/runners/github-hosted-runners#communication-requirements-for-github-hosted-runners).
These are historical observations of the preceding policy, not proof of the changed policy.

| Job | Process-associated destinations observed |
|---|---|
| gates, both runs | git: github.com; node: registry.npmjs.org, results-receiver.actions.githubusercontent.com, productionresultssa0.blob.core.windows.net |
| apm-route, both runs | git: github.com; python: api.github.com, pypi.org, files.pythonhosted.org |
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
APM job retains setup-python's documented raw manifest fallback. The publish job retains
OIDC and Sigstore TUF endpoints, including paths a warmed cache may not contact.
No npm or signing endpoints are added to the isolated APM job; no signing endpoints or
publishing identity are added to the build job.

The [pinned hardener](https://github.com/step-security/harden-runner/tree/e14015d583714f6e62063499dc959a02595150a1)
also manages its telemetry and GitHub runner/cache endpoints using the current service
metadata. Thus the YAML workload list is not a claim that the runner itself contacts
only those hosts. [StepSecurity recommendations](https://docs.stepsecurity.io/harden-runner/workflow-runs)
aggregate observations across runs; they are evidence to review, not proof that an
unobserved fallback can safely be removed.

A changed-candidate `dry_run=true` rehearsal must exercise gates and apm-route. It cannot
exercise the credential-bearing publish job. That path still requires the final release
candidate, protected environment approval, immutable tag/version/ancestry proofs and
digest-verified handoff. Record the actual rehearsal and publish run IDs in the candidate
evidence; prior runs and a skipped job cannot close those proofs.

## The plugin distribution's destinations

Added 2026-09-20 with the plugin distribution the release now publishes. **No destination is
added to any job by it**; what changes is how many things depend on the ones already listed, and
that is the fact this section exists to record — a later edit that removes npm provenance would
otherwise read these Sigstore hosts as removable with it.

| Step (publish job) | Destination | Already listed for |
|---|---|---|
| `Attest plugin archives` | `token.actions.githubusercontent.com` | the OIDC token `npm publish --provenance` already mints |
| `Attest plugin archives` | `fulcio.sigstore.dev` | the signing certificate npm's provenance is issued under |
| `Attest plugin archives` | `rekor.sigstore.dev` | the transparency log entry npm's provenance writes |
| `Attest plugin archives` | `tuf-repo-cdn.sigstore.dev` | the Sigstore TUF root both clients verify against |
| `Attest plugin archives` | `api.github.com` | `gh release create`; the attestation is persisted through the same API |
| `Push plugin distribution` | `github.com` | the git remote `gh release create` already resolves |
| `Download plugin distribution` | artifact storage (`results-receiver`, the twenty result accounts) | `Download release artifacts` |

The attestation uses Sigstore's **public-good instance**, which is what
[`actions/attest-build-provenance`](https://github.com/actions/attest-build-provenance) documents
for a public repository; a private or internal repository would use GitHub's own Sigstore
instance and a different set of hosts, which this repository never reaches.

`egress-policy: block` is unchanged on all three jobs, so any of these going missing stops the
release at the step rather than leaking past it. The `gates` job, which builds the distribution,
holds no signing host and no token: it reaches `github.com` and `registry.npmjs.org` for the pack
and the runtime install it already made, and nothing else.

**What the rehearsal cannot prove, and why these rows carry no observed-run evidence.** A
`dry_run=true` dispatch exercises `gates` and `apm-route` only — it builds the distribution and
uploads it — and the rehearsal never reaches the publish job, which is where the attestation, the
`plugin-dist` branch push and the tag live. So the observed-endpoint evidence for every row above
lands at the FIRST REAL RELEASE and not before. Record that run's ID here beside the two above
when it happens; until then these rows are the documented requirement, not an observation.

## Dependency recheck

On 2026-09-10, [Docusaurus's supported versions](https://docusaurus.io/versions) and
[latest release](https://github.com/facebook/docusaurus/releases/tag/v3.10.2) still
identify 3.10.2; no v4 GA migration is available. The
[image-size upstream](https://github.com/image-size/image-size) remains archived.
Both [ICNS](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) and
[JXL/HEIF](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq) advisories list no patched
release through current 2.0.2. The website retains its existing accepted dependency
condition; a supported upstream fix, dependency removal or new unauthored-image input
path triggers re-evaluation. No third-party replacement was selected to silence alerts.
