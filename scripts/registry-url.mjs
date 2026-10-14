// The registry URLs a pinned CLI call may name, for the scripts that run under bare Node.
//
// `REGISTRY_URL` in `src/shared/cliCall.ts` is the rule; this is its restatement, because a
// source-checkout script runs with no TypeScript and imports nothing from `src/`. The two are held
// equal in `source` and `flags` by `test/ci/forkIdentityScript.test.ts`.

/**
 * Plain https, a host of letters, digits, `.` and `-`, an optional port from 1 to 65535 written
 * without a leading zero, and an optional path of letters, digits, `.`, `_`, `~`, `/` and `-`. No
 * userinfo, query, fragment, `%`, `$`, quote, backtick, space or `^`: the value enters sh, cmd,
 * PowerShell, JavaScript strings and JSON, so refusing beats escaping it for four dialects.
 */
export const REGISTRY_URL = /^https:\/\/[A-Za-z0-9.-]+(?::(?:[1-9]\d{0,3}|[1-5]\d{4}|6[0-4]\d{3}|65[0-4]\d{2}|655[0-2]\d|6553[0-5]))?(?:\/[A-Za-z0-9._~/-]*)?$/
