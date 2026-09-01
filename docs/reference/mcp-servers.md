---
title: MCP servers
---

<!-- GENERATED FILE — do not edit by hand. Rewrite it with `node scripts/generate-docs.mjs`. -->

# MCP servers

An MCP server is a tool endpoint a client launches beside the agent. The ids below are what `stamity config set mcp.servers` and `stamity config mcp add <id>` accept, and this is the whole curated set — any other id resolves only when an installed pack supplies it. A pack may ADD a server under a new id and can never redefine one of these: a curated id always resolves to its reviewed row, so a pack claiming one is refused at install rather than merged.

**Two ways a server runs, and each row says which.** A local child process runs with the editor's own privileges — no authentication and no encryption between the two, and the absence of a URL is not a security property. A remote endpoint is reached over TLS, but through a bridge process launched on the same machine, and that bridge sees every request.

**Every row pins an exact version.** npm forbids republishing a version with different bytes, so an exact pin is effectively content-addressed — a maintainer cannot reach a pinned consumer without a reviewable version bump. What a pin cannot give you is currency: a version that was clean on the day it was read stays byte-identical while the world learns it is vulnerable. That is why two dates appear below and mean different things. The sweep date covers the row SET — every row present, every row still wanted — and each row carries the day its own version was last read off its upstream. Reading the first as pin freshness is the specific misreading the split exists to prevent.

**No credential is written into a client config.** A row names the variables it needs, the emitted config carries a reference to each, and the literal values live in `.env.mcp` — gitignored, created private to the operator, and never committed. `stamity config mcp add <id>` writes the variable names that server needs into that file, with the value left blank for you to fill in.

10 servers. Row set last swept on `2026-08-16`.

### `github`

Repository management: code review, issues, pull requests, and project boards.

- **Runs as:** a remote endpoint, through a bridge launched locally
- **Published by:** the vendor of the service it fronts
- **Pin:** `mcp-remote@0.1.16`, fetched by `npx` at every launch — read off its registry on `2026-08-16`
- **Credentials:** `GITHUB_PAT` (Fine-grained token with Contents, Issues, and Pull requests read/write on the repositories the agent may touch)
- **Blast radius:** High — can merge pull requests, push code, and read private repository contents. The toolset header grants repos/issues/pull_requests only, excluding Actions, org admin, and secret scanning; widening it raises the radius. The remote endpoint is vendor-operated but is reached through the pinned community stdio bridge, which sees every request. Scope the token per-repository and rotate it on a 90-day maximum.

### `azure-devops`

Work items, repos, pipelines, and boards.

- **Runs as:** a local child process
- **Published by:** a community re-implementation, held to the same pin discipline
- **Pin:** `@tiberriver256/mcp-server-azure-devops@0.1.45`, fetched by `npx` at every launch — read off its registry on `2026-08-16`
- **Credentials:** `AZURE_DEVOPS_PAT` (Personal access token with Work Items, Code, and Build read/write), `AZURE_DEVOPS_ORG` (Organization name exactly as it appears in the project URL)
- **Blast radius:** High — can modify work items, trigger pipelines, and push code across every project the token reaches. Scope the token to the minimum permission set and prefer short expirations over standing access.

### `gitlab`

Issues, merge requests, pipelines, and project management.

- **Runs as:** a local child process
- **Published by:** the vendor of the service it fronts
- **Pin:** `glab` — a launcher you install yourself, so its version is yours to keep current; this row is verified against `1.99.0`, read on `2026-08-16`
- **Credentials:** `GITLAB_TOKEN` (Project or group access token with the api scope; read_api is enough for read-only use)
- **Blast radius:** High — can merge requests, modify code, and drive CI/CD; the api scope grants broad project access. Prefer a project-scoped token over a personal one and set an expiration date. The launcher is a host-installed binary, so its version is the operator's to keep current. Maturity: `glab mcp serve` is declared an experiment by its vendor — "not ready for production use and might be unstable or removed at any time" (docs.gitlab.com/cli/mcp/serve/, accessed 2026-08-22) — so this row can stop working on a glab upgrade with no deprecation window. Every other row here is a stable published interface; this one is not, and selecting it is accepting that.

### `context7`

Version-specific library documentation lookup.

- **Runs as:** a local child process
- **Published by:** the vendor of the service it fronts
- **Pin:** `@upstash/context7-mcp@2.1.1`, fetched by `npx` at every launch — read off its registry on `2026-08-16`
- **Credentials:** none — this server holds no credential
- **Blast radius:** Low — read-only lookups against public documentation, no credentials held. Unexpected outbound traffic is the only signal worth watching.

### `filesystem`

File reads, writes, and edits inside the project directory.

- **Runs as:** a local child process
- **Published by:** the vendor of the service it fronts
- **Pin:** `@modelcontextprotocol/server-filesystem@2026.1.14`, fetched by `npx` at every launch — read off its registry on `2026-08-16`
- **Credentials:** none — this server holds no credential
- **Blast radius:** Medium — can read, write, and delete anything under the directory it is given, including config files. Keep the allowed root at the project directory; never widen it to the home directory or a system path.

### `playwright`

Browser automation, web testing, and UI interaction.

- **Runs as:** a local child process
- **Published by:** the vendor of the service it fronts
- **Pin:** `@playwright/mcp@0.0.68`, fetched by `npx` at every launch — read off its registry on `2026-08-16`
- **Credentials:** none — this server holds no credential
- **Blast radius:** Medium — can navigate to any URL, submit data through a page, and screenshot whatever is on screen. Point it at localhost or staging, block external navigation in CI, and clear browser state between runs.

### `brave-search`

Web search for research, fact-checking, and current information.

- **Runs as:** a local child process
- **Published by:** the vendor of the service it fronts
- **Pin:** `@brave/brave-search-mcp-server@2.0.83`, fetched by `npx` at every launch — read off its registry on `2026-08-16`
- **Credentials:** `BRAVE_API_KEY` (Search API key; the free tier allows 2,000 queries per month)
- **Blast radius:** Low — read-only search. A leaked key exhausts the quota rather than exposing data; rate-limit the key and watch usage for unusual patterns.

### `sentry`

Error tracking and performance monitoring.

- **Runs as:** a local child process
- **Published by:** the vendor of the service it fronts
- **Pin:** `@sentry/mcp-server@0.29.0`, fetched by `npx` at every launch — read off its registry on `2026-08-16`
- **Credentials:** `SENTRY_AUTH_TOKEN` (Organization-scoped auth token, read-only where the workflow allows)
- **Blast radius:** Medium — stack traces carry variable values, user identifiers, and file paths into the agent's context. Turn on data scrubbing at the source and prefer a read-only token.

### `postgres`

Database queries and schema inspection.

- **Runs as:** a local child process
- **Published by:** a community re-implementation, held to the same pin discipline
- **Pin:** `@henkey/postgres-mcp-server@1.0.5`, fetched by `npx` at every launch — read off its registry on `2026-08-16`
- **Credentials:** `POSTGRES_URL` (Connection string for a non-production database, using a role limited to the schemas the agent needs)
- **Blast radius:** Critical — direct database access can read, change, or drop data, and the connection string itself is a credential. Enforce the limit at the database (a role granted only SELECT on named schemas) rather than trusting a server-side read-only flag, and never point it at production.

### `linear`

Issue tracking and project management.

- **Runs as:** a local child process
- **Published by:** a community re-implementation, held to the same pin discipline
- **Pin:** `@mkusaka/mcp-server-linear@1.0.15`, fetched by `npx` at every launch — read off its registry on `2026-08-16`
- **Credentials:** `LINEAR_API_KEY` (Workspace API key, ideally issued to a dedicated service account)
- **Blast radius:** Medium — can read and change issues, projects, and team configuration across the workspace the key belongs to. Use a dedicated account, restrict it to one team where possible, and watch the audit log. Maintenance: a single-maintainer community package with no release since the pinned version, so a defect or an advisory against it has no upstream to land a fix in — the pin will not move because nothing is moving. It holds a workspace read/write key, which is the combination that makes the staleness worth stating rather than merely recording: budget for removing the row, not for waiting on it.
