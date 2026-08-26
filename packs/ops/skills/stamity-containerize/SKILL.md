---
id: containerize
type: skill
description: "Packages a service into a container image — multi-stage build, digest-pinned minimal base, unprivileged runtime user, local compose stack, orchestrator manifest with a hardened security context, and an image vulnerability gate. Triggers when a service has no image yet, when an image fails a hardening or scan review, or when a compose or orchestrator manifest is written."
tags: [devops]
load: on-demand
obsolete_when: build tooling emits a minimal, unprivileged, digest-pinned image and its orchestrator manifest from a project description alone
---

# Containerize

Package a service into an image small enough to reason about and locked down
enough to run unattended.

## Quick Start

1. Choose a minimal pinned base and plan the build/runtime split (Step 1).
2. Write the multi-stage build (Step 2).
3. Harden the runtime stage (Step 3).
4. Shrink the build context (Step 4).
5. Compose the local development stack (Step 5).
6. Write the orchestrator manifest (Step 6).
7. Scan the image and gate on findings (Step 7).

## Step 1 — Base and split

Pick the smallest base the application actually runs on: a slim variant, a
distroless image, or a musl-based one where the libc difference is acceptable.
Smaller means less to patch and less to pull.

Pin it. A digest pin (`@sha256:…`) is reproducible; a version tag is a
compromise; `latest` is not a pin at all. Plan two stages from the start: a
build stage carrying the toolchain, and a runtime stage carrying the built
artifact and its runtime dependencies only.

## Step 2 — Multi-stage build

```dockerfile
FROM node:22-slim@sha256:0000000000000000000000000000000000000000000000000000000000000000 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim@sha256:0000000000000000000000000000000000000000000000000000000000000000 AS runtime
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
```

Both stages pin the same digest. The all-zero value is a placeholder — a copy
made without resolving it fails at build time rather than pulling something
nobody chose — so resolve it with `docker buildx imagetools inspect
<image>:<tag>`, paste it into both stages, and re-resolve on every base bump.
The tag stays for readability; the digest is what resolves. A `FROM` carrying a
tag alone is the compromise Step 1 names, and an example that gets copied is the
last place it belongs.

- Order the instructions stalest first: manifest and lockfile before source, so
  a code edit does not invalidate the dependency layer.
- Copy only what runs. The source tree, the build cache, and development
  dependencies stay in the build stage.
- Build-time credentials go through a build secret mount, never a build
  argument and never a copied file — anything written into a layer is
  recoverable from the image, whether or not a later layer deletes it.
- Prefer `COPY` to `ADD`; the fetch-and-extract behaviour of `ADD` is a
  surprise nobody needs in a build.

## Step 3 — Harden the runtime stage

```dockerfile
RUN groupadd -r app --gid=10001 && useradd -r -g app --uid=10001 app
USER app
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD node ./dist/healthcheck.js || exit 1
```

- Run as an unprivileged user with an explicit numeric id, so the same identity
  survives a rebuild and maps onto the orchestrator's user setting. Running as
  root means a container escape starts as host root.
- A healthcheck is what lets the orchestrator notice and replace a wedged
  container; without one, a process that is up but not serving stays in
  rotation.
- Set the production environment variable so the runtime does not load
  development tooling, and leave privilege-elevation tools out of the image.

## Step 4 — Build context

Write `.dockerignore` beside the `Dockerfile`, covering the version-control
directory, installed dependencies, local build output, test artifacts, and any
local environment file. Two reasons, both practical: a smaller context uploads
faster, and files that never enter the context cannot leak into a layer by
accident.

Verify by building and reading the transferred-context size. Megabytes where
kilobytes were expected means the ignore file missed something.

## Step 5 — Local development stack

- One compose file — `compose.yaml`, or `docker-compose.yml` where the repo
  already uses that name — that builds the image and wires the backing services
  the application needs: database, cache, queue.
- Configuration arrives through environment variables sourced from an ignored
  local file; credentials are not written into the compose file.
- Give each service a healthcheck and make the application wait on the
  healthy condition rather than on start order.
- Pin backing-service images the same way the base image is pinned.
- Mount source as a volume in the development stack only. The production image
  contains its artifact.

## Step 6 — Orchestrator manifest

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 10001
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop: ["ALL"]
```

- Write it under `k8s/`, or the root the repo's deployment layout already uses,
  and restate the image's hardening there; the two together are what actually
  holds when one is misconfigured.
- Drop all Linux capabilities, then add back only what the workload proves it
  needs.
- Set CPU and memory requests and limits so one runaway workload cannot starve
  its neighbours.
- Map the image healthcheck onto readiness and liveness probes, so traffic
  gating and restarts read the same signal.
- Reference credentials through the platform's secret object or an external
  store; the manifest is version-controlled and carries none.
- When the read-only root filesystem breaks the application, mount a writable
  volume at the specific path it needs rather than turning the setting off.

## Step 7 — Scan and gate

Scan the built image before it is pushed. Block the push on any fixable
high-or-critical finding; for an unfixable one, record the identifier, the
affected package, why the workload is not exposed, and a re-check date — an
accepted risk with an expiry rather than a silent pass.

Re-scan after every base bump: a new base is a new finding set. Lint the
container definition too; most hardening regressions are visible statically
before an image is ever built.
