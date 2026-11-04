import { join } from "node:path";
import { InvalidArgumentError } from "commander";
import { isPlainObject } from "../../config/parse.ts";
import { printableText } from "../../learnings/validation.ts";
import { contractFromItem, CRITERIA_MAX_BYTES, criteriaHits, ITEM_BODY_MAX_BYTES, parseItemBody, planFiles, planHash } from "../../runs/itemContract.ts";
import { resolveRepo } from "../../runs/pullRequest.ts";
import { ghApi, type GhResponse } from "../engine/ghRunner.ts";
import { gitWrite } from "../engine/gitWrite.ts";
import { Refused } from "../engine/landSetting.ts";
import type { CliContext, CommandResult } from "../kit/program.ts";
import { sanitizeLabel } from "../kit/prompts.ts";

/**
 * `stamity run contract` (REQ-FLOW-155): read a ready item over REST and write the run's contract
 * to `.stamity/runs/<id>/contract.yml`, creating the run folder if absent, so `plan check
 * --contract` can vouch for the run. Registered by `./run.ts`, from which it imports nothing.
 *
 * The body is data anyone with issue access could shape, so the verb proves for itself who stands
 * behind it, by REST reads alone, before it reads a word of the body: the item is in origin's
 * repository, the issue is open, `stamity:ready` is on it, and the issue's author and the last
 * actor to apply that label each hold write or admin on origin. Anything unread refuses. Only then
 * are `Plan:`, `Branch:` and the criteria trusted, as that person's word.
 *
 * The plan must be committed on the current branch: its text is read at `HEAD`, never from the work
 * tree, and the checkout must be on the item's branch. The hash is drift detection only. The body
 * supplies both the path and the hash, so it is no stop against a body naming another committed
 * plan; the write-access check is, and a person with write access may name any plan committed on
 * the branch. The criteria come stripped from `parseItemBody` and pass the deny-scan before
 * anything is written, a hit refusing by pattern id, never by the text.
 *
 * A refusal's reason carries a class, never `String(cause)`, gh's stderr or a machine path: reasons
 * reach the record and the morning list, whose text becomes a pull request's body.
 *
 * The comment drop knows no code, so it fails closed. A comment quoted as code is dropped, and every
 * drop is counted in the strip report, so a person can see text was left out. An opener with no
 * closer refuses, since what it would drop has no end a person could check.
 *
 * Exit 0 `written` or `would-write` (`--dry-run`), with `stripped` and `strippedComments` where the
 * strip took anything, so the issue can be rewritten at its source; 1 `refused`, `notDone` naming
 * what refused it; 2 usage.
 */

interface ItemRef {
  owner: string;
  repo: string;
  number: number;
}

/** What left the item's text on its way to the contract. */
interface Strip {
  comments: number;
  characters: boolean;
}

type RestRead = (path: string) => Promise<GhResponse>;

/** The ready signal on a GitHub issue. */
const READY_LABEL = "stamity:ready";
const EVENTS_PER_PAGE = 100;
/** The most pages of an issue's events read; a longer history refuses, since the oldest come first and the last actor may stand past it. */
const MAX_EVENT_PAGES = 30;

/**
 * A failure by class (review/199, review/36): the code its throw site gave it, read through a wrapping error's `cause`,
 * or that it timed out; never its message, which carries gh's stderr or a machine path.
 */
function failureClass(cause: unknown): string {
  for (let at = cause, depth = 0; typeof at === "object" && at !== null && depth < 4; at = (at as { cause?: unknown }).cause, depth += 1) {
    const { code, killed } = at as { code?: unknown; killed?: unknown };
    if (killed === true) return "timed out";
    if (typeof code === "string" && /^[A-Za-z][A-Za-z0-9_]*$/.test(code)) return code;
  }
  return "no code";
}

/** `owner/repo#n`, in GitHub's name alphabets; anything else exits 2. `gate preflight --item`'s grammar, less the `.` and `..` its `safeRepo` refuses later. */
export function parseItemRef(value: string): ItemRef {
  const match = /^([A-Za-z0-9][A-Za-z0-9_-]{0,99})\/((?!\.{1,2}#)[A-Za-z0-9._-]{1,100})#([1-9][0-9]{0,8})$/.exec(value);
  if (match === null) throw new InvalidArgumentError("an item is owner/repo#<number>.");
  return { owner: match[1] ?? "", repo: match[2] ?? "", number: Number(match[3]) };
}

/** Standard output of a git read, or `null` where git answered non-zero. Reads only, so unattended's narrower environment costs nothing. */
async function gitRead(cwd: string, args: readonly string[]): Promise<string | null> {
  try {
    const read = await gitWrite(cwd, args, { unattended: true });
    return read.code === 0 ? read.stdout : null;
  } catch (cause) {
    throw new Refused(`git did not run (${failureClass(cause)})`);
  }
}

/** Why `login` cannot stand behind an item on `repo`, or `null` where it holds write or admin there. */
async function rightGap(read: RestRead, repo: string, who: string, login: unknown): Promise<string | null> {
  if (typeof login !== "string") return `${who} is unreadable`;
  const reply = await read(`repos/${repo}/collaborators/${encodeURIComponent(login)}/permission`);
  const permission = reply.status === 200 && isPlainObject(reply.json) ? reply.json["permission"] : undefined;
  if (permission === "admin" || permission === "write") return null;
  if (typeof permission !== "string") return `${who} ${login}: the permission on ${repo} is unreadable (HTTP ${reply.status})`;
  return `${who} ${login} has ${permission === "read" ? "read" : "no write"} permission on ${repo}`;
}

/** The login that last applied the ready label, `undefined` where any page of the events did not read. The oldest come first, so every page is read. */
async function lastLabeler(read: RestRead, issue: string): Promise<unknown> {
  let actor: unknown;
  for (let page = 1; page <= MAX_EVENT_PAGES; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- a page past the last is not asked for; the length read so far decides
    const reply = await read(`${issue}/events?per_page=${EVENTS_PER_PAGE}&page=${page}`);
    if (reply.status !== 200 || !Array.isArray(reply.json)) return undefined;
    for (const event of reply.json as unknown[]) {
      if (!isPlainObject(event) || event["event"] !== "labeled" || !isPlainObject(event["label"]) || event["label"]["name"] !== READY_LABEL) continue;
      actor = isPlainObject(event["actor"]) ? event["actor"]["login"] : undefined;
    }
    if (reply.json.length < EVENTS_PER_PAGE) return actor;
  }
  return undefined;
}

/** Every gap in who stands behind the issue `json`, read on origin's `repo`. The body is not looked at. */
async function proofGaps(read: RestRead, repo: string, issue: string, label: string, json: Record<string, unknown>): Promise<string[]> {
  const { labels, state, user } = json;
  const ready = Array.isArray(labels) && (labels as unknown[]).some((entry) => isPlainObject(entry) && entry["name"] === READY_LABEL);
  const author = await rightGap(read, repo, `${label}'s author`, isPlainObject(user) ? user["login"] : undefined);
  const labeler = ready ? await rightGap(read, repo, `the last to apply \`${READY_LABEL}\` to ${label}`, await lastLabeler(read, issue)) : `${label} does not carry \`${READY_LABEL}\``;
  return [...(state === "open" ? [] : [`${label} is not open`]), ...[labeler, author].filter((gap) => gap !== null)];
}

/** The issue's body and author, over REST on the host origin was matched on, once the item is proven: see the file's header. */
async function readItem(ctx: CliContext, ref: ItemRef, label: string): Promise<{ body: string; author: string }> {
  const { cwd } = ctx.app.runtime;
  const env: NodeJS.ProcessEnv = { ...ctx.app.runtime.env };
  const origin = await gitRead(cwd, ["remote", "get-url", "origin"]);
  const repo = origin === null ? null : resolveRepo(env, origin.trim());
  if (repo === null) throw new Refused("origin names no GitHub repository gh reaches");
  const name = `${repo.owner}/${repo.repo}`;
  // GitHub's names ignore case. An item elsewhere is refused: who may edit it there says nothing of origin, which the run pushes to.
  if (`${ref.owner}/${ref.repo}`.toLowerCase() !== name.toLowerCase()) throw new Refused(`${label} is not in origin's repository, ${name}`);
  const read: RestRead = (path) =>
    ghApi({ method: "GET", path, hostname: repo.host }, { cwd, env }).catch((cause: unknown) => {
      throw new Refused(`${label}: a read failed (${failureClass(cause)})`);
    });
  const issue = `repos/${name}/issues/${ref.number}`;
  const reply = await read(issue);
  if (reply.status !== 200 || !isPlainObject(reply.json)) throw new Refused(`${label}: the read answered HTTP ${reply.status}`);
  if (reply.json["pull_request"] !== undefined) throw new Refused(`${label} is a pull request`);
  const gaps = await proofGaps(read, name, issue, label, reply.json);
  if (gaps.length > 0) throw new Refused(...gaps);
  const { body, user } = reply.json;
  const text = typeof body === "string" ? body : "";
  if (Buffer.byteLength(text) > ITEM_BODY_MAX_BYTES) throw new Refused(`${label}: the body is over ${ITEM_BODY_MAX_BYTES} bytes`);
  return { body: text, author: String(isPlainObject(user) ? user["login"] : "") };
}

/** Why the criteria cannot go into a contract, or `null`. The scan's hits by id alone; past the bound it is not run. */
function criteriaGap(acceptance: string, label: string): string | null {
  if (acceptance === "") return `${label} has no acceptance criteria`;
  if (Buffer.byteLength(acceptance) > CRITERIA_MAX_BYTES) return `${label}: the criteria are over ${CRITERIA_MAX_BYTES} bytes`;
  const hits = criteriaHits(acceptance);
  return hits.length === 0 ? null : `${label}: the criteria hit the deny-scan: ${hits.join(", ")}`;
}

/**
 * The contract's text and what the strip took, or a {@link Refused} naming why the item cannot have one here. The
 * plan is read as a raw blob: the text the hash ties the item to.
 */
async function contractText(ctx: CliContext, ref: ItemRef, label: string): Promise<{ text: string; strip: Strip }> {
  const { cwd } = ctx.app.runtime;
  const base = (await gitRead(cwd, ["rev-parse", "--verify", "--quiet", "HEAD"]))?.trim();
  if (base === undefined) throw new Refused("no commit at HEAD");
  const { body, author } = await readItem(ctx, ref, label);
  const item = parseItemBody(body);
  if (item.plan === null) throw new Refused(`${label} has no usable \`Plan:\` line`);

  const reasons: string[] = [];
  const symbolic = await gitRead(cwd, ["symbolic-ref", "--quiet", "HEAD"]);
  const branch = symbolic?.trim().replace(/^refs\/heads\//, "") ?? "a detached HEAD";
  if (item.branch === null) reasons.push(`${label} has no usable \`Branch:\` line`);
  else if (item.branch !== branch) reasons.push(`the current branch is ${branch}, and ${label} names ${item.branch}`);

  const { path, hash } = item.plan;
  const plan = await gitRead(cwd, ["cat-file", "blob", `HEAD:./${path}`]);
  const files = plan === null ? [] : planFiles(plan);
  if (plan === null) reasons.push(`the plan ${path} is not committed at HEAD`);
  // A checkout with `core.autocrlf` on holds the blob's text with CRLF line ends, and an item filed from it hashes that.
  else if (planHash(plan) !== hash && planHash(plan.replaceAll("\n", "\r\n")) !== hash) reasons.push(`the plan ${path} hashes to ${planHash(plan)}, and ${label} names ${hash}`);
  else if (files.length === 0) reasons.push(`the plan ${path} names no files for scope.in`);
  if (item.comments.unclosed) reasons.push(`${label}: a comment opener with no closer`);
  const gap = criteriaGap(item.acceptance, label);
  if (gap !== null) reasons.push(gap);
  if (reasons.length > 0) throw new Refused(...reasons);
  const strip = { comments: item.comments.dropped, characters: printableText(body, "\t\n\r") !== body };
  return { text: contractFromItem(item, { base, files, itemRef: label, author }), strip };
}

/** The strip report's words, empty where nothing left the text. Counts and kinds alone, never the text. */
function stripWords({ comments, characters }: Strip): string[] {
  return [...(comments > 0 ? [`${comments} HTML comment${comments === 1 ? "" : "s"}`] : []), ...(characters ? ["control or invisible characters"] : [])];
}

export async function runContract(ctx: CliContext, opts: Record<string, unknown>): Promise<CommandResult> {
  const run = String(opts["run"]);
  const ref = opts["item"] as ItemRef;
  const item = `${ref.owner}/${ref.repo}#${ref.number}`;
  const path = `${ctx.engine.runs.layout.runRelPath(run)}/contract.yml`;
  const finish = (outcome: string, reasons: readonly string[] = [], strip: Strip = { comments: 0, characters: false }): CommandResult => {
    const notDone = reasons.map((reason) => sanitizeLabel(reason));
    const words = stripWords(strip);
    const stripped = words.length > 0;
    const note = stripped ? [`stripped: ${words.join(" and ")} left out of the contract; rewrite ${item} without them`] : [];
    ctx.io.out([`run: ${run}`, `item: ${item}`, `contract: ${path}`, `outcome: ${outcome}`, ...note, ...notDone.map((entry) => `Not done: ${entry}`), ""].join("\n"));
    return { exitCode: outcome === "refused" ? 1 : 0, json: { subcommand: "contract", run, item, outcome, path, notDone, ...(stripped ? { stripped, strippedComments: strip.comments } : {}), ...(ctx.dryRun ? { dryRun: true } : {}) } };
  };
  try {
    const { text, strip } = await contractText(ctx, ref, item);
    if (ctx.dryRun) return finish("would-write", [], strip);
    await ctx.engine.merge.atomicWrite.atomicWriteFile(join(ctx.app.runtime.cwd, path), text, { boundaryDir: ctx.app.runtime.cwd }).catch((cause: unknown) => {
      throw new Refused(`${path} could not be written (${failureClass(cause)})`);
    });
    return finish("written", [], strip);
  } catch (cause) {
    if (cause instanceof Refused) return finish("refused", cause.reasons);
    throw cause;
  }
}
