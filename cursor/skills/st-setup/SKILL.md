---
name: st-setup
description: "Set this repository up for the stamity plugin: resolve facts and gates, write the repository-owned files, report duplicates."
disable-model-invocation: true
---

Set this repository up to run on the installed stamity plugin. Work the four steps in order and
stop at the one that asks for the operator.

1. Read the current state. Every step below reads from this report.

   ```bash
   node "${CURSOR_PLUGIN_ROOT}/runtime/locate.mjs" -- plugin status --json
   ```

2. When `setup.needed` is true, write the repository-owned files — the charter carrying this
   repository's facts and gates, and the client configuration the plugin does not carry:

   ```bash
   node "${CURSOR_PLUGIN_ROOT}/runtime/locate.mjs" -- plugin setup --client cursor -y
   ```

   When it is false, skip this step: a setup already exists, and replacing it is a job for the
   two commands in step 3, run deliberately.

3. When `duplicates` is non-empty, print every entry with the remedy beside it and STOP. A
   duplicate is a file two installs both claim, and which one goes is the operator's call. The
   three remedies below are what THE OPERATOR runs — they are reported, never performed here:

   - a file this engine wrote: the operator runs `node "${CURSOR_PLUGIN_ROOT}/runtime/locate.mjs" -- clean -y` and then
     `node "${CURSOR_PLUGIN_ROOT}/runtime/locate.mjs" -- plugin setup --client cursor -y` again. Do not run either yourself:
     `clean -y` takes no confirmation and removes ledger rows and the files they name;
   - a file an APM dependency installed: the operator removes that APM dependency;
   - a file nobody manages: the operator removes it, or the operator keeps it as an override
     under `.stamity/overrides/`.

   Stop at this step. Remove no file yourself and run none of the three remedies; report the
   duplicates with their remedies and let the operator choose. Step 4 runs once they have.

4. Finish by reporting the resolved state, as the table an operator reads:

   ```bash
   node "${CURSOR_PLUGIN_ROOT}/runtime/locate.mjs" -- plugin status
   ```

Report what changed, what stayed, and any duplicate you stopped on.
