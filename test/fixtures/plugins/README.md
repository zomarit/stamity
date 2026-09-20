# Vendored vendor facts

Vendor schemas and hand-transcribed vendor pages, kept byte-for-byte as fetched or as read. A
test reads the RULES out of these files rather than restating them, so a refresh of the bytes
moves the assertions with it — which is the whole point of vendoring instead of paraphrasing.

Nothing here is a runtime input: no generator, no emitted root and no published package reads this
directory. It exists so the suites can check a generated manifest against the vendor's own
document on a machine with no network and no JSON-Schema validator installed.

Two of these are SCHEMAS the vendor publishes and four are TRANSCRIPTIONS of a page that
publishes none. The distinction matters: a transcription cannot be re-fetched, so its digest
records what a human read on a stated day, and the failure a wrong name produces there is silent
— an unknown manifest key is ignored and an unknown hook event parses and never fires. The
transcription IS the detector.

Every digest below is `shasum -a 256 <file>`. Refreshing a file means replacing the bytes and
updating the fetch date and the digest in the same change.

## `claude-code-plugin-manifest.schema.json`

- Source: <https://raw.githubusercontent.com/SchemaStore/schemastore/master/src/schemas/json/claude-code-plugin-manifest.json>
- Fetched: 2026-09-20
- sha256: `3f69938d71a47a72fa60050b2050dd620054708911defc1c1dcd7188dcb169f5`
- `$id`: `https://json.schemastore.org/claude-code-plugin-manifest.json` — the value the generated
  manifest declares as its own `$schema`.
- draft-07, `name` its one required key, no top-level `additionalProperties`, and no `rules`
  property at all (the absence the Claude container's `rule: repository-owned` ruling rests on).

Read by: `test/ci/pluginPackages.claude.test.ts`, which applies the subset of this schema that
binds the generated `.claude-plugin/plugin.json` — `required`, `author.required`, `homepage`'s
`uri` format, `keywords`'s item type, the hook event enum under `properties.hooks`, and the
`"in addition to"` description on each of `agents`, `commands`, `skills` and `hooks`, which is
what the Claude container's decision to declare NO component field rests on — by reading each
rule out of these bytes.

## `agent-plugins-1.0.0.schema.json`

- Source: <https://agent-plugins.org/schemas/1.0.0/plugin.schema.json>
- Fetched: 2026-09-20
- sha256: `0a4aad95ce337878ad38802ebf0daa3fde76abe3f65400c86bcbb1ec0b3ab883`
- `$id`: `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json` — the value both Agent
  Plugins manifests declare as their own `$schema`.
- `$schema` and `name` are its two required keys, and `additionalProperties` is `false`: the key
  set is CLOSED, which is why those two roots declare exactly the nine keys it names and no more.

Read by: `test/ci/pluginPackages.copilot.test.ts` and `test/ci/pluginPackages.codex.test.ts`.
The one fixture two clients share, because the two containers ship the same manifest shape.

## `cursor-plugin-fields.json`

- Source: <https://cursor.com/docs/reference/plugins>
- Fetched: 2026-09-20
- sha256: `a6e7030582ce63b4aef1b7cbf8629ed292c9b090f42afaa03de546795644b743`
- A TRANSCRIPTION, not a schema: this vendor publishes none for the plugin manifest. `required`
  is `["name"]` and `fields` is the sixteen documented keys, so an invented key in the generated
  `.cursor-plugin/plugin.json` has this list and nothing else to be caught by.

Read by: `test/ci/pluginPackages.cursor.test.ts`.

## `cursor-hook-events.json`

- Source: <https://cursor.com/docs/agent/hooks>
- Fetched: 2026-08-22
- sha256: `d09917f3bea769b0722f92638371a89653cbdd5532b6adaed574f58f75ab2e96`
- A TRANSCRIPTION: the eighteen documented hook events. An event name this list does not carry
  parses into `hooks.json` and then never fires, which is the silent failure the list detects.

Read by: `test/ci/pluginPackages.cursor.test.ts`.

## `copilot-hook-events.json`

- Source: <https://docs.github.com/en/copilot/reference/hooks-reference>
- Fetched: 2026-09-20
- sha256: `12d709e99ddf1acb068dc022aa4a02072a10ff5468f2956a9a82a2a9af5f2471`
- A TRANSCRIPTION, and the one that carries TWO spellings: `camelCase` holds the fourteen event
  names the reference documents, and `pascalCaseAliases` maps the ten PascalCase forms the same
  client also accepts. Both are here because a generated document that picked the wrong casing
  would be accepted and ignored.

Read by: `test/ci/pluginPackages.copilot.test.ts`.

## `codex-hook-events.json`

- Source: <https://learn.chatgpt.com/docs/hooks>
- Fetched: 2026-09-20
- sha256: `b834b20e4e836cf1bc1b41580ad6e8dcfc77e45cdb33451861defdedcbfc2aa4`
- A TRANSCRIPTION: the twelve documented hook events, with `groups` recording how the page
  arranges them. Same silent failure as the other two event lists.

Read by: `test/ci/pluginPackages.codex.test.ts`.
