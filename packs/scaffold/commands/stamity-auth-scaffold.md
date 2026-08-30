---
id: auth-scaffold
type: command
description: "Builds the first authentication layer for a service that has none — session cookie, bearer credential, or authorization-code-with-PKCE — with its storage posture, environment template, and test scaffold; the security lens gates the result."
tags: [implementation]
load: on-demand
obsolete_when: target frameworks ship an authorization-code-with-PKCE default whose generated storage and validation posture passes the security axis unchanged
spawns: [researcher, implementer, reviewer]
---

# /stamity-auth-scaffold

Builds an authentication layer for a service that does not yet have one. The command
resolves the shape, delegates every write, and gates what came back. It authors nothing
itself.

## Generator contract

1. **Plan first.** Resolve the inputs below into one written spec — pattern, client type,
   file set, test cases — and confirm it once. That confirmation is the only interactive
   step; after it the run is autonomous through the report.
2. **The implementer writes.** Every file lands through an `implementer` spawn: one per
   auth mode, disjoint paths, tests shipping with the code they prove.
3. **The reviewer gates.** A `reviewer` spawn reads the generated set through the Security
   lens and returns a graded verdict with path:line evidence.
4. **One regeneration, then stop.** A failed gate buys exactly one corrective implementer
   pass, scoped to the failing findings. A second failure ends the run: the findings go to
   the operator verbatim and the scaffold is reported not-merge-ready. The cap is
   fail-closed — this loop has no third round and no operator flag that adds one.
5. **The floor is the repo's, not this command's.** Gate criteria are the security axis of
   the `st-verify` skill, read from `.stamity/verify/security-<sha>.json`, where
   `<sha>` carries the producer's `-dirty` suffix whenever the worktree is unclean. The
   run reads the artifact for the CURRENT key: a clean-tree artifact does not answer for a
   dirty tree, and the gate runs after the implementer has written, so the tree is unclean
   by construction and the `-dirty` key is the normal one here. No artifact for that key
   means invoke the skill for the axis first and gate on what that run wrote. This
   generator builds to that floor and cites it; it does not define one.
6. **The Gate rows below are this generator's acceptance criteria, not a second floor.**
   They state what the generated set must look like for this run to report merge-ready,
   and they are evaluated against the axis artifact as evidence. Where a row names an axis
   check id, that check's own threshold decides it and this table adds nothing.

## Ask before writing

Each trigger stops the run before the first write and asks one question with numbered
options and a declared default, per the core `stamity-question-protocol` rule.

| Trigger | Why it stops |
|---|---|
| An auth layer already exists — an auth module, an identity dependency, a credential table, or a session middleware in the tree | Generating over a working layer is irreversible in the way that matters: the options are extend the existing layer, generate beside it under a new path, or stop. This command overwrites nothing it did not write. |
| The stack is not detectable — no dependency manifest, or a framework the tree does not evidence | Auth idiom is framework-specific; a guess produces plausible code wired to nothing. |
| Client type undeclared | A public client holds no client secret and needs the sender-constrained path; a confidential one does not. The wrong branch ships a flow that is exploitable rather than merely wrong. |

## Inputs

| Input | Default | Notes |
|---|---|---|
| Pattern | authorization code with PKCE | session cookie · bearer credential · authorization code with PKCE |
| Client type | confidential | public clients (browser, mobile) hold no client secret |
| Identity source | ask | issuer for a delegated flow; the local user store otherwise |
| Access lifetime | 30 minutes, refresh 14 days with rotation | both land in the generated configuration under `config/`, not in source constants |
| Credential storage | memory-hard hash (Argon2id, bcrypt fallback) | applies to passwords and to long-lived issued credentials alike |
| Output tree | `src/auth/` and its mirror under the repo's test root | existing layout conventions win: `lib/` or `app/` where the repo already roots source there, `test/`, `tests/` or `spec/` for the mirror |
| Environment template | `.env.example`, one placeholder line per required variable, committed | values stay outside the repo |

## Patterns

| Pattern | What the scaffold must carry |
|---|---|
| Session cookie | Server-side session record; cookie flags for transport, script access, and cross-site posture; identifier rotation on privilege change; cross-site request forgery defence on every state-changing route. |
| Bearer credential | Short access lifetime; refresh rotation with reuse detection that revokes the whole family; signature verification against a pinned algorithm allowlist; the credential travels in a header, not in a query string. |
| Authorization code with PKCE | Proof key on every client, public and confidential; exact-string redirect matching with no wildcard; no implicit and no password grant; issuer, audience, expiry, and nonce validated before a session exists. |

## Storage posture

- Configuration values are referenced by environment variable. The committed template
  carries placeholder values only, and no live value is written into source.
- Long-lived issued credentials are stored as a memory-hard hash, returned to the caller
  once at issue time, and compared in constant time on verification.
- A failed verification returns one generic message. The distinguishing reason goes to the
  log, not to the response body.
- Signing material and issuer configuration are read at startup and fail loudly when
  absent — a missing value takes the deny branch rather than a permissive default.

## Test scaffold

The implementer ships these cases with the code. Each is a named test, not a comment.

| Case | Expected |
|---|---|
| Valid credential on a protected route | accepted, identity resolved |
| Expired credential | rejected, no session created |
| Wrong audience or wrong issuer | rejected |
| Unsigned credential, or one naming a disabled algorithm | rejected |
| Replayed authorization code | rejected on the second exchange |
| Reused refresh credential | family revoked, both credentials dead |
| No credential on a protected route | rejected before handler logic runs |
| Stored credential shape | hash present, plaintext absent from the record |

## Flow

1. **Detect and resolve.** Read the dependency manifest, the route table, and any existing
   auth surface. A `researcher` spawn takes this when the read spans more than the
   manifest — for example a framework whose routes are declared across several trees.
2. **Plan.** Write the resolved spec and confirm it once.
3. **Build.** One `implementer` per auth mode, file-disjoint, tests included.
4. **Gate.** One `reviewer` on the Security lens over the generated set, with the axis
   artifact as its evidence input.
5. **Regenerate at most once**, scoped to the failing findings, then re-gate those rows.
6. **Report.** Files written, cases covered, gate verdict, and every placeholder the
   operator has to fill before the layer runs.

## Gate rows

| Row | Passing condition |
|---|---|
| Grant hygiene | proof key present on every client; no implicit and no password grant; redirect matching is exact-string |
| Credential validation | issuer, audience, expiry, and nonce checked before a session exists; algorithm pinned per issuer; unsigned credentials rejected |
| Rotation | refresh rotation with reuse detection, family revocation on a reused credential |
| Storage | every long-lived credential stored as a memory-hard hash; no plaintext in the record, the log, or a fixture |
| Route posture | every non-public route rejects an unauthenticated caller, and rejects an authenticated caller outside its scope |
| Configuration | no live value in source; the committed template lists every required variable |
| Tests | the case table above is present and green |

## Report and boundaries

- The run writes source, tests, and the environment template. It creates no branch, no
  commit, and no pull request; the change is left staged for a human read.
- Wiring the generated module into the running service, and choosing the identity
  provider, stay operator decisions. The scaffold names both in its report.
- A run that ends after the second gate failure reports `not-merge-ready` with the open
  findings attached. Reporting it as complete is a contract breach.
