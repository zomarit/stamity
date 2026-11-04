import { join } from "node:path";
import { InvalidArgumentError } from "commander";
import { isPlainObject } from "../../config/parse.ts";
import { contractFromItem, ITEM_BODY_MAX_BYTES, parseItemBody, planFiles, planHash } from "../../runs/itemContract.ts";
import { resolveRepo } from "../../runs/pullRequest.ts";
import { ghApi } from "../engine/ghRunner.ts";
import { gitWrite } from "../engine/gitWrite.ts";
import { Refused } from "../engine/landSetting.ts";
import type { CliContext, CommandResult } from "../kit/program.ts";
import { sanitizeLabel } from "../kit/prompts.ts";

/**
 * `stamity run contract` (REQ-FLOW-155): read a ready item over REST and write the run's contract
 * to `.stamity/runs/<id>/contract.yml`, creating the run folder if absent, so `plan check
 * --contract` can vouch for the run. Registered by `./run.ts`, from which it imports nothing.
 *
 * The body is data anyone with issue access could shape. It is trusted for `Plan:`, `Branch:` and
 * the criteria only, and the first two must hold here: the plan's text at `HEAD`, never the work
 * tree's, must hash to the item's `<hex12>`, and the checkout must be on the item's branch. Whether
 * the author may start a run is the pre-flight's `input-author`, not this verb's, and the author's
 * shape is the notice's to check: `contractFromItem` quotes any value safely.
 *
 * Exit 0 `written` or `would-write` (`--dry-run`); 1 `refused`, `notDone` naming every reason; 2 usage.
 */

interface ItemRef {
  owner: string;
  repo: string;
  number: number;
}

/** `owner/repo#n`, in GitHub's name alphabets; anything else exits 2. The same grammar as `gate preflight --item`. */
export function parseItemRef(value: string): ItemRef {
  const match = /^([A-Za-z0-9][A-Za-z0-9_-]{0,99})\/([A-Za-z0-9._-]{1,100})#([1-9][0-9]{0,8})$/.exec(value);
  if (match === null) throw new InvalidArgumentError("an item is owner/repo#<number>.");
  return { owner: match[1] ?? "", repo: match[2] ?? "", number: Number(match[3]) };
}

/** Standard output of a git read, or `null` where git answered non-zero. Reads only, so unattended's narrower environment costs nothing. */
async function gitRead(cwd: string, args: readonly string[]): Promise<string | null> {
  try {
    const read = await gitWrite(cwd, args, { unattended: true });
    return read.code === 0 ? read.stdout : null;
  } catch (cause) {
    throw new Refused(`git did not run: ${String(cause)}`);
  }
}

/** The issue's body and author, over REST on the host origin was matched on. */
async function readIssue(ctx: CliContext, ref: ItemRef, label: string): Promise<{ body: string; author: unknown }> {
  const { cwd } = ctx.app.runtime;
  const env: NodeJS.ProcessEnv = { ...ctx.app.runtime.env };
  const origin = await gitRead(cwd, ["remote", "get-url", "origin"]);
  const repo = origin === null ? null : resolveRepo(env, origin.trim());
  if (repo === null) throw new Refused("origin names no GitHub repository gh reaches");
  const reply = await ghApi({ method: "GET", path: `repos/${ref.owner}/${ref.repo}/issues/${ref.number}`, hostname: repo.host }, { cwd, env }).catch((cause: unknown) => {
    throw new Refused(`${label}: the read failed: ${String(cause)}`);
  });
  if (reply.status !== 200 || !isPlainObject(reply.json)) throw new Refused(`${label}: the read answered HTTP ${reply.status}`);
  const { body, pull_request: pullRequest, user } = reply.json;
  if (pullRequest !== undefined) throw new Refused(`${label} is a pull request`);
  const text = typeof body === "string" ? body : "";
  if (Buffer.byteLength(text) > ITEM_BODY_MAX_BYTES) throw new Refused(`${label}: the body is over ${ITEM_BODY_MAX_BYTES} bytes`);
  return { body: text, author: isPlainObject(user) ? user["login"] : undefined };
}

/** The contract's text, or a {@link Refused} naming every reason the item cannot have one here. The plan is read as a raw blob: the text the hash ties the item to. */
async function contractText(ctx: CliContext, ref: ItemRef, label: string): Promise<string> {
  const { cwd } = ctx.app.runtime;
  const base = (await gitRead(cwd, ["rev-parse", "--verify", "--quiet", "HEAD"]))?.trim();
  if (base === undefined) throw new Refused("no commit at HEAD");
  const { body, author } = await readIssue(ctx, ref, label);
  const item = parseItemBody(body);
  if (item.plan === null) throw new Refused(`${label} has no usable \`Plan:\` line`);
  if (typeof author !== "string") throw new Refused(`${label}: the author is unreadable`);

  const reasons: string[] = [];
  const symbolic = await gitRead(cwd, ["symbolic-ref", "--quiet", "HEAD"]);
  const branch = symbolic?.trim().replace(/^refs\/heads\//, "") ?? "a detached HEAD";
  if (item.branch === null) reasons.push(`${label} has no usable \`Branch:\` line`);
  else if (item.branch !== branch) reasons.push(`the current branch is ${branch}, and ${label} names ${item.branch}`);

  const { path, hash } = item.plan;
  const plan = await gitRead(cwd, ["cat-file", "blob", `HEAD:./${path}`]);
  const files = plan === null ? [] : planFiles(plan);
  if (plan === null) reasons.push(`the plan ${path} is not committed at HEAD`);
  else if (planHash(plan) !== hash) reasons.push(`the plan ${path} hashes to ${planHash(plan)}, and ${label} names ${hash}`);
  else if (files.length === 0) reasons.push(`the plan ${path} names no files for scope.in`);
  if (item.acceptance === "") reasons.push(`${label} has no acceptance criteria`);
  if (reasons.length > 0) throw new Refused(...reasons);
  return contractFromItem(item, { base, files, itemRef: label, author });
}

export async function runContract(ctx: CliContext, opts: Record<string, unknown>): Promise<CommandResult> {
  const run = String(opts["run"]);
  const ref = opts["item"] as ItemRef;
  const item = `${ref.owner}/${ref.repo}#${ref.number}`;
  const path = `${ctx.engine.runs.layout.runRelPath(run)}/contract.yml`;
  const finish = (outcome: string, reasons: readonly string[] = []): CommandResult => {
    const notDone = reasons.map((reason) => sanitizeLabel(reason));
    ctx.io.out([`run: ${run}`, `item: ${item}`, `contract: ${path}`, `outcome: ${outcome}`, ...notDone.map((entry) => `Not done: ${entry}`), ""].join("\n"));
    return { exitCode: outcome === "refused" ? 1 : 0, json: { subcommand: "contract", run, item, outcome, path, notDone, ...(ctx.dryRun ? { dryRun: true } : {}) } };
  };
  try {
    const text = await contractText(ctx, ref, item);
    if (ctx.dryRun) return finish("would-write");
    await ctx.engine.merge.atomicWrite.atomicWriteFile(join(ctx.app.runtime.cwd, path), text, { boundaryDir: ctx.app.runtime.cwd }).catch((cause: unknown) => {
      throw new Refused(`${path} could not be written: ${String(cause)}`);
    });
    return finish("written");
  } catch (cause) {
    if (cause instanceof Refused) return finish("refused", cause.reasons);
    throw cause;
  }
}
