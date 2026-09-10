/** Read-only structural checks for the existing Markdown spec/plan format. Node 22+. */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const clean = (text) => text.replaceAll("`", "").replaceAll("**", "").trim();
const linesOf = (content) => {
  let fence = "";
  return content.split(/\r?\n/).map((text, index) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(text)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = "";
      return { text: "", line: index + 1 };
    }
    return { text: fence ? "" : text, line: index + 1 };
  });
};

/** Expand explicit IDs and the existing `REQ-AREA-001, -002–004` shorthand. */
function references(text) {
  const ids = [];
  for (const [token] of text.matchAll(/REQ-[^\s,;|.)]+/g)) {
    if (!/^REQ-[A-Za-z][A-Za-z0-9-]*-\d{3,}(?:[–-](?:REQ-[A-Za-z][A-Za-z0-9-]*-)?\d{3,})?$/.test(token)) {
      throw new Error(`Malformed requirement reference: ${token}`);
    }
  }
  let prefix;
  const tokens = /REQ-([A-Za-z][A-Za-z0-9-]*)-(\d{3,})(?:[–-](?:REQ-\1-)?(\d{3,}))?|(?<![\w-])-(\d{3,})(?:[–-](\d{3,}))?/g;
  for (const match of text.matchAll(tokens)) {
    if (match[1]) prefix = match[1];
    if (!prefix) throw new Error(`Requirement shorthand has no area: ${match[0]}`);
    const from = Number(match[2] ?? match[4]);
    const to = Number(match[3] ?? match[5] ?? from);
    if (to < from || to - from > 1000) throw new Error(`Invalid requirement range: ${match[0]}`);
    for (let value = from; value <= to; value += 1) {
      ids.push(`REQ-${prefix}-${String(value).padStart(3, "0")}`);
    }
  }
  return ids;
}

export function checkCoverage(plan, specs, options = {}) {
  const findings = [];
  const add = (code, path, line, message) => findings.push({ code, path, line, message });
  const refs = (text, path, line) => {
    try { return references(clean(text)); }
    catch (error) { add("invalid-reference", path, line, error.message); return []; }
  };
  const definitions = new Map();
  for (const spec of specs) {
    let inRequirements = false;
    for (const row of linesOf(spec.text)) {
      if (/^## Requirements\s*$/i.test(row.text)) inRequirements = true;
      else if (row.text.startsWith("## ")) inRequirements = false;
      if (!inRequirements || !/^(?:#{3,6}\s+|[-*]\s+\*\*)REQ-/.test(row.text)) continue;
      const id = refs(row.text, spec.path, row.line)[0];
      if (!id) continue;
      if (definitions.has(id)) add("duplicate-requirement", spec.path, row.line, `${id} is already defined at ${definitions.get(id)}.`);
      else definitions.set(id, `${spec.path}:${row.line}`);
    }
  }
  const scoped = new Set();
  const removed = new Set();
  const units = [];
  let section = "";
  let unit;
  let field;
  for (const row of linesOf(plan.text)) {
    const heading = /^## (.+?)\s*$/.exec(row.text);
    if (heading) { section = heading[1].toLowerCase(); unit = undefined; field = undefined; continue; }
    if (section === "spec delta") {
      const ids = refs(row.text, plan.path, row.line);
      if (/\bREMOVED\b/.test(row.text)) {
        if (ids.length && !/\b(?:retired|superseded by|disposition:)\b/i.test(row.text)) {
          add("missing-retirement", plan.path, row.line, "Removed requirements need a retirement disposition or superseded-by pointer.");
        }
        const retired = refs(row.text.split(/—|superseded by|disposition:|retired/i)[0], plan.path, row.line);
        for (const id of retired) removed.add(id);
      } else for (const id of ids) scoped.add(id);
    }
    if (section !== "units") continue;
    const unitHeading = /^###\s+(\S+)(?:\s|$)/.exec(clean(row.text));
    if (unitHeading) {
      unit = { id: unitHeading[1], line: row.line, fields: new Map() };
      units.push(unit); field = undefined; continue;
    }
    if (!unit) continue;
    const bullet = /^[-*]\s+(?:\*\*|`)?([A-Za-z_]+)(?:\*\*|`)?\s*:\s*(.*)$/.exec(row.text);
    const table = /^\|\s*([^|]+)\|\s*(.*?)\s*\|\s*$/.exec(row.text);
    const key = bullet?.[1] ?? (table ? clean(table[1]) : undefined);
    const value = bullet?.[2] ?? table?.[2];
    if (key && ["id", "requirements", "depends_on"].includes(key)) {
      if (unit.fields.has(key)) add("duplicate-field", plan.path, row.line, `${unit.id} repeats ${key}.`);
      field = key; unit.fields.set(key, { text: clean(value), line: row.line });
    } else if (/^\s+\S/.test(row.text) && field) {
      unit.fields.get(field).text += ` ${clean(row.text)}`;
    } else if (bullet || table) field = undefined;
  }
  if (!units.length) add("missing-units", plan.path, 1, "No Units section with ### unit headings was found; normalize the plan's unit headings before checking.");
  const known = new Set();
  for (const item of units) {
    const explicit = item.fields.get("id")?.text;
    if (explicit) item.id = explicit;
    if (known.has(item.id)) add("duplicate-unit", plan.path, item.line, `Unit ${item.id} is defined twice.`);
    known.add(item.id);
  }
  const covered = new Set();
  const graph = new Map();
  for (const item of units) {
    const requirement = item.fields.get("requirements");
    const ids = refs(requirement?.text ?? "", plan.path, requirement?.line ?? item.line);
    if (!ids.length && !/^spec carries no ids\b/i.test(requirement?.text ?? "")) {
      add("missing-requirements", plan.path, item.line, `${item.id} needs requirement IDs or the literal spec carries no ids.`);
    }
    const local = new Set();
    for (const id of ids) {
      if (local.has(id)) add("duplicate-reference", plan.path, requirement.line, `${item.id} cites ${id} twice.`);
      local.add(id); covered.add(id);
      if (!definitions.has(id)) add("dangling-requirement", plan.path, requirement.line, `${item.id} cites undefined ${id}; supply its spec or correct the ID.`);
    }
    const dependencies = item.fields.get("depends_on");
    const text = dependencies?.text ?? "";
    const edges = [];
    if (!text) add("missing-dependencies", plan.path, item.line, `${item.id} needs depends_on, using none when empty.`);
    else if (!/^none\b/i.test(text)) {
      // Commas separate references; a semicolon starts an explanatory note.
      // Parenthesized explanations and the two legacy unmarked qualifiers remain
      // readable. Never select only U-number matches and discard adjacent tokens.
      const declaration = text.split(";")[0].replace(/\([^)]*\)/g, "");
      const candidates = declaration.split(/,|\s+and\s+/).map((part) => part
        .replace(/\s+(?:contract delta|ownership of changed case inputs)\.?$/, "")
        .replace(/\s+[—–]\s+.*$/, "").replace(/\.$/, "").trim()).filter(Boolean);
      const seen = new Set();
      for (const dependency of candidates) {
        if (seen.has(dependency)) add("duplicate-dependency", plan.path, dependencies.line, `${item.id} repeats dependency ${dependency}.`);
        seen.add(dependency);
        if (known.has(dependency)) edges.push(dependency);
        else if (!/\bowner:\s*\S/i.test(dependency) && !(options.exists ?? existsSync)(resolve(options.cwd ?? process.cwd(), dependency))) {
          add("dangling-dependency", plan.path, dependencies.line, `${item.id} depends on unknown ${dependency}; name a unit, existing path, or external prerequisite with owner:.`);
        }
      }
    }
    graph.set(item.id, edges);
  }
  for (const id of scoped) {
    if (!definitions.has(id)) add("dangling-requirement", plan.path, 1, `The spec delta cites undefined ${id}; supply its spec or correct the ID.`);
    if (!covered.has(id) && !removed.has(id)) add("missing-coverage", plan.path, 1, `${id} is in the spec delta but no unit covers it.`);
  }
  for (const id of removed) if (!definitions.has(id)) add("dangling-requirement", plan.path, 1, `Retired ${id} must retain a definition and disposition in its spec.`);
  const visit = (id, trail) => {
    if (trail.includes(id)) { add("dependency-cycle", plan.path, 1, `Dependency cycle: ${[...trail, id].join(" -> ")}.`); return; }
    for (const target of graph.get(id) ?? []) visit(target, [...trail, id]);
  };
  for (const id of graph.keys()) visit(id, []);
  return { status: findings.length ? "fail" : "pass", semanticReview: "required", scope: [...scoped], units: units.map((item) => item.id), findings };
}

export function main(args) {
  if (args.length < 2) {
    process.stderr.write("Usage: node spec-plan-coverage.mjs <plan.md> <spec.md|spec-directory> [...]\nRead-only structural coverage; semantic review remains required.\n");
    return 2;
  }
  try {
    const [planPath, ...inputs] = args;
    const paths = inputs.flatMap((path) => statSync(path).isDirectory()
      ? readdirSync(path).filter((name) => name.endsWith(".md") && name !== "manifest.md").toSorted().map((name) => join(path, name))
      : [path]);
    const report = checkCoverage({ path: planPath, text: readFileSync(planPath, "utf8") }, paths.map((path) => ({ path, text: readFileSync(path, "utf8") })));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "pass" ? 0 : 1;
  } catch (error) {
    process.stderr.write(`Cannot check spec/plan coverage: ${error.message}\nCorrect the input paths and rerun the command.\n`);
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
