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
