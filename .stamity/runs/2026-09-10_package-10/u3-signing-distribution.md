# Signing and distribution implementation

Baseline: released `v1.6.0`, `99c1094953346ef19a8aaab3ee0bd7d292c36ba6`.
This record describes an implementation slice, not final package QA or release approval.

The author helper reuses the existing framed payload and signer declaration. It
verifies integrity before contacting the signing service, checks the returned bundle
through the production verifier, rechecks source inputs, and writes with the existing
atomic containment boundary. The source-checkout script accepts no credential argument.
The real-cryptography fixture covers signing, verification, installation, stale-signature
refusal, a newly signed update, wrong identity, malformed output and unsafe paths.
Its Fulcio/OIDC/TUF/transparency boundary is substituted: these tests establish no
authenticated public Sigstore signature. That live proof remains separately required.

All five generators and the advisory probe share direct-invocation detection and one
native-TypeScript reexec. Imports execute no command body. Node flags, script arguments,
child failure and the probe's distinct failure status survive. The retained
[red/green import experiment](bootstrap-red-green.json) runs the released five scripts
and the candidate in isolated processes: every released import exits 2 on its caller's
arguments; every candidate import exits 0 and prints only its completion witness.

The existing JavaScript package export stays at `dist/index.js`, with declarations at
`dist/types/index.d.ts`. Declarations are emitted by the supported TypeScript compiler
CLI in the build hook. Trying the bundler's declaration plugin produced its unconditional
TypeScript 7 unstable-API warning and exit 1 under `failOnWarn`; the compiler CLI avoids
that API path without suppressing warnings or changing the gate. JavaScript and `.d.ts`,
`.d.mts`, `.d.cts` bytes count against the existing 2 MiB logic budget.

The packed consumer is installed outside the checkout and typechecked with
`skipLibCheck: false`, standard Node types, and no source paths. It checks representative
reachable types, a deliberate invalid client assignment, JavaScript imports and ordinary
init/check. This exposed two missing upstream Sigstore declaration dependencies:
`@sigstore/rekor-types@5.0.0` and `@types/make-fetch-happen@10.0.4`. They are explicitly
shipped to complete that graph; their Knip exceptions cover transitive declaration use.
Neither change substitutes a runtime implementation or migrates a dependency API.

Release egress is narrowed from all Azure blob accounts to the twenty storage accounts
currently enumerated by GitHub's official endpoint contract. The APM job's already
restricted Python/fallback endpoints were separately audited. Observed process traffic
from two prior runs, the distinction from DNS pre-resolution and remaining runner-service
behavior are recorded in [.github/release-egress.md](../../../.github/release-egress.md).
No rehearsal or publication of the changed candidate has been claimed here.

Dated dependency disposition: Docusaurus stable remains 3.10.2 with no v4 GA; image-size
remains archived at 2.0.2 and both published advisories have no patched version. SECURITY
links the primary sources and retains the exact re-open trigger. No speculative site
dependency replacement was made.

Focused verification: typecheck passes; ten test files pass 312 tests with the existing
opt-in live Sigstore test skipped; Knip passes. The first packed type smoke exposed the
two declaration dependencies above; its repaired run passed TypeScript/JavaScript and
init/check. Build logic including declarations measured 1,257,136 bytes, corpus 538,818
bytes on the latest local build. Scoped source/script lint passed. Shared lint at this
checkpoint reports three in-progress findings in the independent structural-helper lane;
no U3 file caused them. Final integrated gates, generators, review and actual CI remain
the integration lane's work.

Contract census closure: signing payload/schema unchanged, new author consumer reconciled;
bootstrap helper and all six callers reconciled; package export/declaration/size/smoke
consumers reconciled; release permissions/digest/identity facade held. The composition
registry and architecture map add `pack.sign`, with `SignPackOptions` named publicly.
The same single-writer pass registered the client lane's `hooks.portableRunner` and its
architecture row at that lane's request. Generated surfaces remain integration-owned.

Independent review found a P1 author-output alias defect: `PACK.JSON` could replace the
manifest on a case-insensitive filesystem, and an internal ancestor symlink could redirect
a nested bundle path onto manifest/content inputs. The fix applies case-folded normalized
reservations, rejects ambiguous portable path spellings and all bundle ancestor symlinks,
compares destination filesystem identity with protected inputs, and repeats that check
after signing. [Before-fix regressions](signing-alias-red.log) retain ten failing cases;
[the repaired suite](signing-alias-green.log) passes 24 cases, including an ordinary
nested-output positive, service-not-called/source-preserved refusals and a directory
replaced by a symlink during signing. Typecheck and scoped oxlint pass. The exact final
source SHA-256 is `e29bd80e9903bc88d5e109e55768356977eda627cd4095505862ccaf14c9d856`;
test SHA-256 is `052595033f784307d45ae2ca7369df8d781217b17acbe2ee19d8264a54df4517`.
Independent re-review of this correction remains required.

Not done: changed-candidate non-publishing rehearsal; actual authenticated sign → verify →
install/update; final credential-bearing publish-path evidence; integrated full gates,
independent review/fixes and human/platform controls. Prior releases do not perform them.
