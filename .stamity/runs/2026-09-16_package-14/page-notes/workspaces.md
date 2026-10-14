# docs/workspaces.md (slug `workspaces`)

Page kind: EXPLANATION (one policy across several repositories: the manifest, the bridge, the cascade) plus REFERENCE (the subcommands, the status rows, the init offer). Its reader is the operator who runs stamity in more than one repository and wants one policy for all of them.

Pins (binding): every subcommand in `src/cli/commands/workspace.ts`'s `SUBCOMMANDS` appears twice — as `workspace <sub>` and as `stamity workspace <sub>` (backticked); the count sentence reads `three subcommands` if the count is three (check the code); frontmatter `title: Workspaces` equals the H1. The bridge's three-field set, what selection deltas and locked content do today (recorded and reported, not propagated into emission — verify in `src/workspace/`), and whether ordinary commands are workspace-aware — state exactly what the code does.

Sources: `src/cli/commands/workspace.ts`, `src/workspace/*.ts`, `src/cli/commands/init.ts` (the init offer), `docs/cli-reference.md`, `docs/specs/workspace-surface.md` only to check the shipped status (it reads shipped-with-1.1.0); do not link the spec (it is off the site).
