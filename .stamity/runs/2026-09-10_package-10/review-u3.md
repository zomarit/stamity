# Independent U3 review

Reviewed on 2026-09-10 against `99c1094953346ef19a8aaab3ee0bd7d292c36ba6`.
Scope: signing and its composition/public API, native TypeScript bootstrap and
six migrated scripts, declarations and packed-consumer accounting, release
egress and retained permission boundaries, signing/security documentation.
This review writes no product files and is not release approval.

## Findings

### U3-R1 — P1: bundle aliases can replace the pack manifest

Initial location: `src/pack/sign.ts:31` (destination exclusions) and
`src/pack/sign.ts:81` (final atomic write).

The exclusions compare only the declared path spelling. Containment protects
the pack boundary, and the leaf check rejects a symlink or shared regular file,
but neither prevents another path spelling from naming a protected source.

Two independent temporary-pack reproductions returned success and replaced the
original `pack.json` with bundle JSON:

1. `bundlePath: "PACK.JSON"` on this host's case-insensitive filesystem.
2. `bundlePath: "signatures/pack.json"` with `signatures` an internal directory
   symlink to `.`. This mechanism also applies on case-sensitive POSIX filesystems.

Both fixtures used a normal manifest with an empty integrity map, and replaced
only the external sign/verify service seams. After `signPack` returned success,
reading `pack.json` produced the bundle's `mediaType` key and no manifest `name`.
The temporary directories were removed. These are destination-write proofs,
not authenticated signature proofs. Equivalent aliases into content classes or
integrity-map sources can corrupt source content or invalidate the signed map.

Acceptance: reject manifest, integrity and content destinations reached through
case variants or filesystem aliases before contacting the signing provider;
repeat the destination safety checks after the awaited signing flow. Regression
fixtures must preserve source bytes and assert zero signing calls for an unsafe
initial destination, and reject an ancestor alias introduced during signing.
Normal detached-bundle signing and signed update must remain green.

Status: closed after independent recheck. The writer reserves normalized case
aliases and ambiguous Windows path spellings, refuses symlink ancestors and
filesystem-identical protected inputs, resolves the root, and repeats destination
checks after signing. Ordinary nested detached output remains supported.

The writer retained ten failing cases against the earlier implementation in
`signing-alias-red.log`, followed by 24 passing cases in `signing-alias-green.log`.
The independent reviewer reran `npm exec vitest run test/pack/sign.test.ts`:
24 tests passed. Both original temporary-pack reproductions were rerun separately:
`PACK.JSON` refused with `VALIDATION_ERROR`; the internal parent symlink refused
with `INTEGRITY_ERROR`. Both made zero signing calls and preserved manifest bytes.
The new suite also covers aliases into content/integrity inputs, hard links,
ordinary nested output and an ancestor replaced during the signing call.

## Reviewed controls and focused evidence

- `trust.ts` changes only comments; the framing and aggregate payload remain
  the existing verifier contract. The new helper uses the production identity
  comparison and install/update path. Its real-cryptography fixtures explicitly
  substitute Fulcio/OIDC/TUF/transparency service trust and claim no live proof.
- Release changes retain job conditions, canonical public destination checks,
  isolated APM interpreter, absent build/APM publishing identity, the protected
  publish environment and independent digest handoff. The upload/download jobs
  replace the broad Azure wildcard with the twenty result-storage accounts.
  An independent read of [GitHub metadata](https://api.github.com/meta) confirmed
  the current `productionresultssa0` through `productionresultssa19` roster.
- Script bodies are gated by direct invocation, with a shared bounded reexec
  preserving Node controls, script arguments and failure status. Independently
  importing the signing script printed only an explicit completion witness;
  its direct `--help` invocation exited successfully.
- The package retains its JavaScript entry and adds a declaration export. The
  external smoke installs the packed artifact outside the checkout, compiles
  with `skipLibCheck: false` and no source paths, and rejects a deliberate invalid
  client type. Build accounting includes declaration extensions under the held
  logic ceiling. No existing dependency version changed in the lockfile.
- Reviewer command: `npm exec vitest run test/pack/sign.test.ts
  test/ci/nativeTypescript.test.ts test/ci/workflow.test.ts
  test/support/support.test.ts` — four files, 166 tests passed on Node 22.22.3.
  These existing tests did not detect U3-R1.

No additional confirmed implementation finding in the reviewed U3 scope.

Not done: integrated full gates and candidate-bound packed
consumer verification; changed-policy release rehearsal; actual authenticated
sign/verify/install/update; credential-bearing publication evidence and existing
human/platform approvals. Earlier runs, skipped jobs and substituted service
fixtures cannot close those proof gaps.
