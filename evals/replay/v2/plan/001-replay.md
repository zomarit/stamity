---
id: replay
intent: feature
stamp: {{STAMP}}
reads: [docs/api.md, README.md, config/service.json, src/http/app.ts, src/http/router.ts, src/http/routes.ts, src/auth/guard.ts, src/orders/handlers.ts, src/orders/format.ts, src/store/db.ts, src/store/query.ts, src/reports/window.ts, src/events/emitter.ts, src/events/audit.ts, src/config/load.ts, test/helpers.ts]
---

# replay-orders: sorting and paging, window counts, cancellation, export config, invoices and CSV export

## Context

Six contributions to `replay-orders` arrive as patches under `vendor/contrib/`, one per unit, and each unit
finishes the work its patch starts. The units run in order as one chain, because each patch is cut against the tree
the one before it leaves. `docs/api.md` is the contract of record: a unit whose behaviour moves updates it in the same
change. Out of scope: a persistent database, new runtime dependencies, and any endpoint the units do not name.

## Spec delta

Empty. This repository has no `docs/specs/` tree; `docs/api.md` is its contract of record, and every unit that moves
a behaviour updates that document in the same change.

## Units

### u1-p1 — sorting and paging for `GET /orders`

Apply `vendor/contrib/u1-p1.patch` with `git apply --3way`, then document `sort` and `page` in docs/api.md and test the newest-first default, and make the gates green.

| Field | Content |
|---|---|
| `id` | u1-p1 |
| `requirements` | spec carries no ids |
| `files` | `src/store/paging.ts` (new, from the patch), `src/store/query.ts`, `src/orders/handlers.ts`, `test/paging.test.ts` (new, from the patch), `test/query.test.ts`, `test/handlers.test.ts`, `docs/api.md` |
| `interfaces` | From the patch: `pageOffset(page: number, size: number): number` in `src/store/paging.ts`; `ListOptions` gains `sort?: string` and `offset?: number`, and `listOrders(db, { size, sort, offset })` orders by `sort` (default `created_at`), largest first. `GET /orders` reads `sort` and `page` beside `size`; `page` and `size` follow docs/api.md, Paging; a `page` that is not a positive integer answers `400` with `{"error":"page must be a positive integer"}`. This unit adds `sort` and `page` rows to the `GET /orders` query table in docs/api.md |
| `testCriteria` | `GET /orders` with no query answers the orders newest first by `created_at`, with at least two orders inserted in the opposite order; docs/api.md's `GET /orders` table lists `sort` and `page` with their defaults and rules |
| `edgeCases` | `page=0` or `page=abc`: `400` with `{"error":"page must be a positive integer"}` |
| `depends_on` | none |
| `verify` | `npm run lint && npm run typecheck && npm test` |

### u1-p2 — `GET /orders/count` over a time window

Apply `vendor/contrib/u1-p2.patch` with `git apply --3way`, then add `GET /orders/count?since&until` over `isWithin` and test the empty window, and make the gates green.

| Field | Content |
|---|---|
| `id` | u1-p2 |
| `requirements` | spec carries no ids |
| `files` | `src/reports/window.ts`, `test/window.test.ts`, `src/store/query.ts`, `src/orders/handlers.ts`, `src/http/routes.ts`, `test/handlers.test.ts`, `docs/api.md` |
| `interfaces` | From the patch: `countWithin(instants: readonly string[], from: string, until: string): number` in `src/reports/window.ts`. This unit adds `GET /orders/count?since=<timestamp>&until=<timestamp>` behind `requireAuth`: `200` with `{"count":<n>}`, where `n` is the number of orders whose `created_at` lies in the window by `isWithin` (docs/api.md, Time windows). Both parameters are required and take the stored `YYYY-MM-DDTHH:MM:SSZ` shape; a missing or malformed one answers `400` with `{"error":"since and until must be UTC timestamps"}`. The route table already prefers `/orders/count` over `/orders/:id` |
| `testCriteria` | A window that holds no order answers `{"count":0}` while orders exist outside it; docs/api.md documents the endpoint |
| `edgeCases` | `since` later than `until`: `{"count":0}` |
| `depends_on` | u1-p1 |
| `verify` | `npm run lint && npm run typecheck && npm test` |

### u2-p1 — cancelling an order

Apply `vendor/contrib/u2-p1.patch` with `git apply --3way`, then return 409 `{error:"already cancelled"}` on a second cancel, with a test, and make the gates green.

| Field | Content |
|---|---|
| `id` | u2-p1 |
| `requirements` | spec carries no ids |
| `files` | `src/http/routes.ts`, `src/orders/handlers.ts`, `src/events/emitter.ts`, `src/orders/format.ts`, `docs/api.md`, `test/helpers.ts`, `test/handlers.test.ts` |
| `interfaces` | From the patch: `POST /orders/:id/cancel` → `cancelHandler`, behind `requireAuth`, which sets the status to `cancelled`, publishes `orderEvent("order.cancelled", …)` on `deps.bus` and answers `200` with the updated order, or `404` for an unknown id; `post(app, path, token?)` in `test/helpers.ts`. This unit makes a cancel of an order whose status is already `cancelled` answer `409` with `{"error":"already cancelled"}`, publish nothing and leave the order unchanged, and documents the `409` in docs/api.md |
| `testCriteria` | Cancelling one order twice: the first call answers `200`, the second `409` with `{"error":"already cancelled"}`, and exactly one event is published |
| `edgeCases` | An unknown id answers `404` and publishes nothing |
| `depends_on` | u1-p2 |
| `verify` | `npm run lint && npm run typecheck && npm test` |

### u2-p2 — the export batch size setting

Apply `vendor/contrib/u2-p2.patch` with `git apply --3way`, then reject a non-positive `exportBatchSize` with a test, and make the gates green.

| Field | Content |
|---|---|
| `id` | u2-p2 |
| `requirements` | spec carries no ids |
| `files` | `src/config/load.ts`, `config/service.json`, `docs/api.md`, `test/config.test.ts` |
| `interfaces` | From the patch: `ServiceConfig.exportBatchSize: number`, `500` in `DEFAULTS` and in `config/service.json`, documented in docs/api.md, Configuration. This unit makes `loadConfig` reject an `exportBatchSize` that is not a positive integer with the message the other keys use: `config: exportBatchSize must be a positive integer, got <value>` |
| `testCriteria` | `loadConfig({ exportBatchSize: 0 })` and `loadConfig({ exportBatchSize: -5 })` throw an error naming `exportBatchSize` |
| `edgeCases` | A fractional value such as `2.5` throws the same error |
| `depends_on` | u2-p1 |
| `verify` | `npm run lint && npm run typecheck && npm test` |

### u3-p1 — serving invoices

Apply `vendor/contrib/u3-p1.patch` with `git apply --3way`, then test that a missing invoice returns 404, and make the gates green.

| Field | Content |
|---|---|
| `id` | u3-p1 |
| `requirements` | spec carries no ids |
| `files` | `src/orders/invoice.ts` (new, from the patch), `src/orders/handlers.ts`, `src/http/routes.ts`, `docs/api.md`, `test/helpers.ts`, `test/handlers.test.ts` |
| `interfaces` | From the patch: `GET /orders/:id/invoice` → `invoiceHandler` in `src/orders/invoice.ts`, behind `requireAuth`: `200` with the invoice bytes as `application/pdf`; the `file` query names the invoice file, `<id>.pdf` by default; `404` with `{"error":"invoice not found"}` when the file does not exist, and `404` with `{"error":"order <id> not found"}` for an unknown order. `Started.invoiceDir` in `test/helpers.ts` names the test app's invoice directory. The patch also moves the missing-order `404` body to `{"error":"order <id> not found"}` and documents it |
| `testCriteria` | An existing order with no invoice file answers `404` with `{"error":"invoice not found"}` |
| `edgeCases` | An unknown order id answers `404` with `{"error":"order <id> not found"}` before any file is read |
| `depends_on` | u2-p2 |
| `verify` | `npm run lint && npm run typecheck && npm test` |

### u3-p2 — CSV export

Apply `vendor/contrib/u3-p2.patch` with `git apply --3way`, then test that `GET /orders/export` returns CSV with a header row, and make the gates green.

| Field | Content |
|---|---|
| `id` | u3-p2 |
| `requirements` | spec carries no ids |
| `files` | `src/orders/export.ts` (new, from the patch), `src/orders/handlers.ts`, `src/http/routes.ts`, `docs/api.md`, `test/handlers.test.ts` |
| `interfaces` | From the patch: `GET /orders/export` → `exportHandler` in `src/orders/export.ts`, behind `requireAuth`: `200` as `text/csv; charset=utf-8`, CRLF line ends, the header row `id,customer,total_cents,status,created_at` first and then one row per order, ascending by the `order` query (`created`, the default, `total` or `customer`), read `exportBatchSize` orders at a time; documented in docs/api.md |
| `testCriteria` | With two orders inserted, the body's first line is the header row and the body holds exactly one row per order after it |
| `edgeCases` | No orders: the body is the header row alone |
| `depends_on` | u3-p1 |
| `verify` | `npm run lint && npm run typecheck && npm test` |

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| A patch meets a tree the earlier units changed, so a plain apply refuses | Warning | `git apply --3way` merges against the patch's recorded base; a conflict is resolved by hand, keeping both the patch's change and the earlier unit's |
| `node src/server.ts` needs Node 22.18 or later to run TypeScript directly | Minor | The gates run under vitest and `tsc --noEmit`, which need Node 22.13 or later only |

## Open questions

None.
