---
description: "Set this repository up for the stamity plugin: resolve facts and gates, write the repository-owned files, report duplicates."
---

Set this repository up to run on the installed stamity plugin. Work the four steps in order and
stop at the one that asks for the operator.

Before step 1, find the installed root. This client passes no plugin-root variable to a command's
shell — `${PLUGIN_ROOT}` expands to nothing here, so do not use it. Ask the client where this
plugin's skills live:

   ```bash
   copilot skill list --json
   ```

Take every entry whose `source` is `plugin` and whose `name` starts with `st-` or `stamity-`.
The listing carries this root's SKILLS and its PROMPT entries alike, and their `path` values
take two shapes: `<root>/skills/<name>` for a skill, and `<root>/com.github.copilot/...` for a
command or agent. The rule for both: `<root>` is the part of `path` before `/skills/` when the
path contains it, otherwise the part before `/com.github.copilot/`. Apply it to every entry and
collect the distinct results. (Not `plugin list --json`'s `installedFrom`: that names the
marketplace the plugin was added from, not the root.) Two stops before anything else runs:

- No such entry: the plugin is not loaded in this session — the folder is not trusted, or the
  plugin is not installed. Report that in those words and STOP. Write nothing, and do not search
  the filesystem for a root.
- More than one distinct `<root>` after that rule: two stamity-derived plugins are installed
  (a canonical root beside a fork, or two marketplaces). List every root and STOP, asking the
  operator which one this repository should run on.

With exactly one root, substitute `<root>` literally, quotes kept, wherever it appears below.

1. Read the current state. Every step below reads from this report.

   ```bash
   node "<root>/runtime/locate.mjs" -- plugin status --json --plugin-root "<root>"
   ```

2. When `setup.needed` is true, write the repository-owned files — the charter carrying this
   repository's facts and gates, and the client configuration the plugin does not carry:

   ```bash
   node "<root>/runtime/locate.mjs" -- plugin setup --client copilot -y --plugin-root "<root>"
   ```

   When it is false, skip this step: a setup already exists, and replacing it is a job for the
   two commands in step 3, run deliberately.

3. When `duplicates` is non-empty, print every entry with the remedy beside it and STOP. A
   duplicate is a file two installs both claim, and which one goes is the operator's call. The
   three remedies below are what THE OPERATOR runs — they are reported, never performed here:

   - a file this engine wrote: the operator runs `node "<root>/runtime/locate.mjs" -- clean -y` and then
     `node "<root>/runtime/locate.mjs" -- plugin setup --client copilot -y --plugin-root "<root>"` again. Do not run either yourself:
     `clean -y` takes no confirmation and removes ledger rows and the files they name;
   - a file an APM dependency installed: the operator removes that APM dependency;
   - a file nobody manages: the operator removes it, or the operator keeps it as an override
     under `.stamity/overrides/`.

   Stop at this step. Remove no file yourself and run none of the three remedies; report the
   duplicates with their remedies and let the operator choose. Step 4 runs once they have.

4. Finish by reporting the resolved state, as the table an operator reads:

   ```bash
   node "<root>/runtime/locate.mjs" -- plugin status --plugin-root "<root>"
   ```

Report what changed, what stayed, and any duplicate you stopped on.
