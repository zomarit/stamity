// Posts PR #112 round-1 replies, one per thread, each from a scanned file, then resolves the bot's threads.
// Usage: node post-replies.mjs <scratch dir> <repo checkout> [--dry-run]
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [dir, repo, flag] = process.argv.slice(2);
const dry = flag === "--dry-run";
const replies = JSON.parse(readFileSync(join(dir, "replies.json"), "utf8"));
const threads = JSON.parse(readFileSync(join(dir, "threads.json"), "utf8")).data.repository.pullRequest.reviewThreads.nodes;
const threadOf = new Map();
for (const t of threads) for (const c of t.comments.nodes) threadOf.set(String(c.databaseId), t.id);
const out = join(dir, "reply-bodies");
mkdirSync(out, { recursive: true });
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const results = [];

for (const [id, { conf, body }] of Object.entries(replies)) {
  const text = `${body}\n\n— st-pr-resolve (round: 1, confidence: ${conf})\n`;
  if (Buffer.byteLength(text) > 60000) throw new Error(`reply for ${id} is over the size cap`);
  if (/\/(Users|home)\/|[A-Z]:\\Users\\/.test(text)) throw new Error(`reply for ${id} names a machine-local path`);
  const file = join(out, `${id}.md`);
  writeFileSync(file, text);
  const scan = spawnSync("npx", ["--no", "stamity", "gate", "scan", "--text", file, "--label", "reply", "--json"], { cwd: repo, encoding: "utf8" });
  if (scan.status !== 0) { results.push({ id, posted: false, reason: `scan exit ${scan.status}` }); continue; }
  if (dry) { results.push({ id, posted: false, reason: "dry run", thread: threadOf.get(id) ?? null }); continue; }
  let posted = false; let last = "";
  for (const wait of [0, 2000, 8000]) {
    if (wait) sleep(wait);
    const r = spawnSync("gh", ["api", `repos/zomarit/stamity/pulls/112/comments/${id}/replies`, "-F", `body=@${file}`, "--jq", ".id"], { cwd: repo, encoding: "utf8" });
    if (r.status === 0) { posted = true; last = r.stdout.trim(); break; }
    last = (r.stderr || "").split("\n")[0];
  }
  results.push({ id, posted, reply: posted ? last : null, reason: posted ? null : last, thread: threadOf.get(id) ?? null });
}

if (!dry) {
  for (const r of results) {
    if (!r.posted || !r.thread) continue;
    const q = `mutation { resolveReviewThread(input: {threadId: "${r.thread}"}) { thread { isResolved } } }`;
    const res = spawnSync("gh", ["api", "graphql", "-f", `query=${q}`, "--jq", ".data.resolveReviewThread.thread.isResolved"], { cwd: repo, encoding: "utf8" });
    r.resolved = res.status === 0 && res.stdout.trim() === "true";
  }
}
writeFileSync(join(dir, "reply-results.json"), JSON.stringify(results, null, 2));
const ok = results.filter((r) => r.posted).length;
console.log(`replies posted: ${ok}/${results.length}; resolved: ${results.filter((r) => r.resolved).length}; scan or post failures: ${results.filter((r) => !r.posted && r.reason !== "dry run").length}`);
for (const r of results.filter((r) => !r.posted && r.reason !== "dry run")) console.log(`  not posted ${r.id}: ${r.reason}`);
