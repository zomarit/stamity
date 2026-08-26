#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { addCommand } from "./cli/commands/add.ts";
import { checkCommand } from "./cli/commands/check.ts";
import { cleanCommand } from "./cli/commands/clean.ts";
import { configCommand } from "./cli/commands/config.ts";
import { initCommand } from "./cli/commands/init.ts";
import { learnCommand } from "./cli/commands/learn.ts";
import { syncCommand } from "./cli/commands/sync.ts";
import { validateCommand } from "./cli/commands/validate.ts";
import { runCli, type CommandModule } from "./cli/kit/program.ts";
import {
  checkForUpdateNotice,
  noticeCacheDir,
  resolveOwnPackageFacts,
} from "./cli/notice/updateNotice.ts";

/**
 * The CLI entry — the single enumeration point of the command surface.
 *
 * Everything else is owned elsewhere: the exit-code contract, flag matrix and
 * JSON funnel live in `./cli/kit/program.ts`; each verb's behavior lives in its
 * own module under `./cli/commands/`. This file only (1) enumerates the eight
 * CommandModules in help order, (2) fires the update-notice probe early and
 * settles it non-blockingly after the run, and (3) records the exit code.
 *
 * Exit discipline: `process.exitCode` is assigned, `process.exit()` is never
 * called — stdout/stderr flush naturally and a piped reader always sees the
 * full output. The notice settles through `Promise.race` against an
 * already-resolved `null`, so a probe still in flight can never hold the
 * process open past the command it decorates.
 *
 * Module side effects are gated on being the executed script (`isMain`), so
 * tests import {@link COMMANDS} without running a command.
 */

/**
 * The advertised surface in help order — init, sync, check, validate, add,
 * config, clean — plus `learn`, the one hidden plumbing verb.
 */
export const COMMANDS: readonly CommandModule[] = [
  initCommand,
  syncCommand,
  checkCommand,
  validateCommand,
  addCommand,
  configCommand,
  cleanCommand,
  learnCommand,
];

/**
 * Startup guard: two modules registering one name would make dispatch
 * order-dependent, so a duplicate is a throw at load — before any argv is
 * parsed — rather than a command that quietly shadows its twin.
 */
export function assertUniqueCommandNames(commands: readonly CommandModule[]): void {
  const seen = new Set<string>();
  for (const command of commands) {
    if (seen.has(command.name)) {
      throw new Error(
        `duplicate command registration: "${command.name}" — every COMMANDS entry must have a unique name`,
      );
    }
    seen.add(command.name);
  }
}

assertUniqueCommandNames(COMMANDS);

/**
 * True when this module is the executed script. The raw compare covers direct
 * invocation (`node src/cli.ts`, `node dist/cli.js`); the realpath retry covers
 * the npm bin symlink, where `process.argv[1]` is the `.bin/` link and
 * `import.meta.url` is the real file it points at.
 */
function isMain(): boolean {
  const argv1 = process.argv[1];
  if (argv1 === undefined) return false;
  if (pathToFileURL(argv1).href === import.meta.url) return true;
  try {
    return pathToFileURL(realpathSync(argv1)).href === import.meta.url;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  // Fired before the command, awaited never: the probe caches under the XDG
  // cache root and resolves `null` on every failure — and on every registry
  // answer that is not strictly newer than this build — so it is invisible
  // unless it has something to say.
  const facts = resolveOwnPackageFacts();
  const notice = checkForUpdateNotice({
    packageName: facts.name,
    currentVersion: facts.version,
    isPrivate: facts.isPrivate,
    env: process.env,
    cacheDir: noticeCacheDir(process.env, homedir()),
  });

  // Bare `stamity` is a first touch, not a mistake: show help and exit 0. The
  // explicit rewrite (rather than commander's help-as-error default, which the
  // funnel maps to exit 2) is what makes that friendly contract deliberate.
  const argv = process.argv.slice(2);
  const code = await runCli(argv.length === 0 ? ["--help"] : argv, COMMANDS);

  // Settle without waiting: a resolved probe wins the race, a pending one
  // loses to the ready `null` and the process exits with no open handles.
  const banner = await Promise.race([notice, Promise.resolve<string | null>(null)]);
  if (banner !== null && process.stderr.isTTY) {
    process.stderr.write(`\n${banner}\n`);
  }

  process.exitCode = code;
}

if (isMain()) await main();
