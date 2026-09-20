# Vendored plugin-manifest schemas

Vendor schemas, kept byte-for-byte as fetched. A test reads the RULES out of these files rather
than restating them, so a refresh of the bytes moves the assertions with it — which is the whole
point of vendoring instead of paraphrasing.

Nothing here is a runtime input: no generator, no emitted root and no published package reads this
directory. It exists so the suites can check a generated manifest against the vendor's own
document on a machine with no network and no JSON-Schema validator installed.

## `claude-code-plugin-manifest.schema.json`

- Source: <https://raw.githubusercontent.com/SchemaStore/schemastore/master/src/schemas/json/claude-code-plugin-manifest.json>
- Fetched: 2026-09-20
- sha256: `3f69938d71a47a72fa60050b2050dd620054708911defc1c1dcd7188dcb169f5`
- `$id`: `https://json.schemastore.org/claude-code-plugin-manifest.json` — the value the generated
  manifest declares as its own `$schema`.
- draft-07, `name` its one required key, no top-level `additionalProperties`, and no `rules`
  property at all (the absence the Claude container's `rule: repository-owned` ruling rests on).

Reading it back: `test/ci/pluginPackages.claude.test.ts` applies the subset of this schema that
binds the generated `.claude-plugin/plugin.json` — `required`, the `agents` and `commands` path
patterns, `author.required`, `homepage`'s `uri` format, `keywords`'s item type, and the hook event
enum under `properties.hooks` — by reading each rule out of these bytes. Refreshing the file is
therefore the supported way to re-point the test at a newer vendor document: replace the bytes,
update the fetch date and the digest above, and run the suite.
