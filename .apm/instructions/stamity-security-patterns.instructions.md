---
description: "Floor for caller-facing code: validation at every trust boundary, bound parameters instead of interpolation, server-side per-resource authorization, fail-closed defaults, an auth floor, and the lockfile and pinned-step supply-chain floor."
applyTo: "**/auth/**,**/api/**,**/server/**,**/middleware/**,**/*.env*"
---

# Security Patterns

Attaches on the surface that faces callers: routes and handlers, middleware,
server entry points, and the environment that configures them. The floor below
is the part a reviewer cannot confirm from a diff alone — a check is invisible
when it is present and silent when it is missing.

Credential handling is the secrets rule's subject and is not restated here.

## Floor

1. **Every trust boundary parses into a declared shape.** Request bodies, query
   and path parameters, headers, webhook payloads, queue messages, uploaded
   files, and responses from another service all cross one. Parsing means an
   allowlist of fields with types, length and range bounds, and unknown keys
   rejected. A compile-time type is erased before the first byte arrives, and a
   denylist enumerates the attacks already known.
2. **Uploads are validated by content, not by name.** Type from the leading
   bytes, a size cap enforced while reading rather than after, a server-chosen
   storage name, and a destination path that cannot escape its directory — a
   parent-directory segment, an absolute path, and a null byte are each
   rejected before the write.
3. **Interpolating caller data into an interpreter is the defect.** Database
   queries take bound parameters, sub-processes take an argument array, markup
   goes through a maintained sanitizer, and encoding matches the sink it lands
   in — markup, URL, script, style, and shell each escape differently.
   Hand-written escaping of caller data is the pattern that keeps failing.
4. **Authorization is checked server-side, per resource, per request.** The
   check loads the record being addressed and asks whether this caller may act
   on it. An identifier in a path is an argument, never a grant, so a check
   that passes on the route grants every record the route can reach. Anything
   decided in the client is presentation.
5. **Fail closed.** An absent grant denies. Configuration that will not parse
   takes the restrictive branch. An error raised inside an authorization check
   denies rather than falls through. Capabilities that must not reach
   production — debug routes, seed and reset commands, test-login paths, mock
   payment modes — are gated on an allowlist of named environments, and startup
   refuses to boot on an environment value outside that enum. The inverted form
   (`env !== "production"`) turns the capability ON in every environment nobody
   thought to name: a fresh container, a renamed stage, a misspelling.
6. **Responses and logs carry no internals.** No stack frames, query text, file
   paths, or dependency versions in a response body; a correlation identifier
   links the caller's error to the detail held server-side. Log fields are an
   allowlist, and caller-supplied text is escaped before it is written — a log
   line is an injection sink like any other.
7. **Auth floor.** Session identifiers rotate on login and are dropped on
   logout, with an idle timeout and an absolute timeout. Passwords are verified
   against a memory-hard hash whose work factor is tuned on the deployment
   target rather than left at the library default. A second factor gates
   privileged operations. Login, token, and reset endpoints are rate-limited
   per identity and per source address. Access credentials are short-lived,
   refresh credentials rotate on use, and a replayed refresh revokes the whole
   family. Protocol machinery past this floor — federation flows,
   sender-constrained tokens, passkey ceremonies — is specialist work: the
   `security` specialist agent reviews it on the surfaces that pull it in, and
   the verify skill's security axis routes the runnable checks.
8. **Supply chain.** The lockfile is committed and reviewed like source, and
   the pipeline install resolves nothing beyond it, so a build cannot pick up a
   version no reviewer saw. Third-party pipeline steps are pinned to an
   immutable revision, never a moving tag. A dependency or pack whose
   installation runs a script comes from a trusted, pinned source or is
   refused: an install script executes with the developer's privileges before a
   single test does. Each added dependency carries one line — what it does, and
   why not the standard library.
9. **Findings are named with their category.** The published web and agentic OWASP catalogues supply
   the vocabulary: broken access control, security misconfiguration, supply-chain failure,
   cryptographic failure, injection, insecure design, authentication failure, integrity failure,
   logging failure, goal hijack, tool misuse, privilege abuse. That list is closed — a finding takes
   one of those names or the nearest of them, never a coined label and never a floor item's number.
   A named class arrives with its known remediations; "this looks unsafe" arrives with none.

## Gates

- Every externally reachable handler parses its input before use. A raw field
  read straight into a query, a template, a file path, or a sub-process
  argument is a finding regardless of what the value looks like today.
- Every path that reads or mutates a record carries an ownership or role check
  against that record, covered by a test that acts as a non-owner and asserts a
  refusal. The test is the evidence, not the reviewer's reading.
- The environment allowlist is asserted at startup, and a test boots with an
  unrecognised environment value and asserts the gated capability stays off.
- Error responses carry a code and a correlation identifier and nothing else;
  a test asserts that no stack frame or query text reaches the body.
- The lockfile is committed, the pipeline install is lockfile-only, and every
  third-party step is pinned by digest. A dependency change carrying no
  justification line does not merge.
- Each finding is reported with a category name from item 9 and the request
  shape that triggers it, so the fix starts from a known remediation.
