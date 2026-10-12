#!/usr/bin/env node
import { $ as ENV_MCP_FILE, $n as needsRenderingProof, $r as TOOLS, $t as CLAUDE_SKILLS_DIR, A as planPackRemoval, An as NATIVE_SKILL_DIRS, Ar as PLUGIN_OWNED_CLASSES, At as CODEX_CONFIG_FILE, B as materializeClaudeSettings, Bn as collectManifestErrors, Br as slugOf, Bt as predictPreservedContentRefusal, C as suggestStackPacks, Ci as INJECTION_PATTERNS, Cn as withoutPolicyWarningPrint, Cr as pinnedCliCall, Ct as LEGACY_CURSOR_GUARD_PATHS, D as extractReadPaths, Di as CONTENT_CLASSES, Dn as PLATFORM_MCP_SERVER, Dr as MANIFEST_FILE, Dt as COPILOT_PROMPTS_DIR, E as scanAddedLines, Ei as normalizeForDenyScan, En as CURATED_MCP_SERVERS, Et as COPILOT_HOOKS_PATH, F as hookScriptReader, Fn as countSelectionItems, Fr as resolveBundledPackRoot, Ft as displayPath, G as reduceCoOwnedJson, Gn as readInstallMode, Gr as COMMUNICATION_STYLES, Gt as mcpReclaimReducers, H as materializeCoOwned, Hn as manifestPath, Hr as withoutControlCharacters, Ht as composeEmissionPlanner, I as describeCodexHooksOff, In as ORG_POLICY_REL_PATH, Ir as applyCommandPrefix, It as gitDiscoveryMeetsBareShape, J as render1110CursorGuards, Jn as readReviewCap, Jt as materializeUserMcpJson, K as CURSOR_1_11_0_GUARD_ENTRIES, Kn as readManifest$1, Kt as filterMcpJsonOnDisk, L as planCodexConfigToml, Ln as isPluginOwned, Lr as buildContentIndex, Lt as ledgerHashIndex, M as cursorHooksSpec, Mn as gateLanguageFor, Mr as isPackOwner, Mt as HOOK_TRUST_STEPS, N as describeCursorHookDefects, Nn as isPythonRunner, Nr as packOwner, Nt as codexConfigTableRendering, O as isTestSource, Oi as outputOwners, On as validateServerIds, Ot as COPILOT_SETUP_STEPS_PATH, P as directHookRendering, Pn as verificationCommandsFor, Pr as lookupCatalogEntry, Pt as bareShapeRefusal, Q as sweepReclaimCandidates, Qn as OWNED_PATHS, Qr as MODEL_CLASSES, Qt as CLAUDE_SETTINGS_PATH, R as reduceCodexConfigToml, Rn as pluginOwnedSummary, Rr as contentRootsOf, Rt as ledgerPathSet, S as persistLearning, Si as CONTENT_DENY_PATTERNS, Sn as packMcpServers, Sr as parseClassFile, St as CURSOR_HOOKS_CONFIG_PATH, T as linesPastCap, Ti as LEARNINGS_INJECTION_PATTERNS, Tn as receiptRelPath, Tr as INSTALL_MODES, Tt as SUBAGENT_GUARD_PATH, U as planCoOwnedJson, Un as readCommunicationStyle, Ur as composeFrontmatter, Ut as MERGED_MCP_JSON_PATHS, V as predictClaudeSettingsMerge, Vn as createManifest, Vr as toPosixDisplayPath, Vt as safeWriteFile, W as predictCoOwnedMerge, Wn as readGates, Wr as parseFrontmatter, Wt as engineOwnedServerIds, X as stateKeepPaths, Xn as writeManifest, Xr as IMPORT_MODES, Xt as predictMcpMergeRefusal, Y as ensureStateScaffold, Yn as readRuleDelivery, Yr as EFFORT_LEVELS, Yt as planUserMcpJson, Z as formatReclaimReport, Zn as IMPORT_TARGET, Zr as MATURITY_TIERS, Zt as CLAUDE_COMMANDS_DIR, _ as detectSubRepos, _i as STATE_DIR, _n as UNICODE_TAG_CHARS, _r as hasCodeExtension, _t as resolvePluginRoot, a as readWorktreeInventory, ai as VALID_TOOLS, an as resolveEffortValue, ar as memberPointer, at as computeReclaimCandidates, b as writeWorkspaceManifest, bn as discoverInstalledPacksWithPolicy, br as mergeRules, bt as ADAPTER_REGISTRY, c as probeSetupPresence, ci as resolveBundledForkRoot, cn as REQUIRED_LEARNING_SECTIONS, cr as isSharedRegularFile, ct as trustedInfraPaths, d as resolveFarmDir, dn as emitsPerPackage, dr as renderInvariantsVersion, dt as isGreenfield, ei as VALID_COMMUNICATION_STYLES, en as claudeUserHookEntries, er as extractManagedBlock, et as REQUIRED_GITIGNORE_ENTRIES, f as isDirty, fi as HOOKS_GENERATED_DIR, fn as describePackIntegrityFinding, fr as BUILT_IN_RULES, ft as summarizeDetection, g as detectRepoGitIdentity, gi as REVIEW_GATE_TEMP_INFIX, gn as programNotFound, gr as classifyChange, gt as readCapabilityFile, h as runGit$1, hi as REVIEW_GATE_STATE_FILE, hn as gitProgramFor, hr as CLASS_ORDER, ht as carriedClasses, i as isInside, in as nearestExpressibleEffort, ir as memberHash, it as assertLedgerContainment, j as codexHooksSpec, jn as SKILLS_PROJECTION_DIR, jr as RULE_DELIVERIES, jt as CODEX_HOOKS_FILE, k as selectTests, ki as EngineError, kn as readHookDefinitions, kr as PACK_OWNER_PREFIX, kt as CODEX_COMMANDS_DIR, l as runWorktreeSetup, li as findPackageRoot, ln as resolveLearningsCaps, lr as readCharterTemplate, lt as analyzeRepo, m as resolveGitCommonDir, mi as REVIEW_GATE_LOCK_SUFFIX, mn as verifyInstalledPacks, mr as CLASS_FILE, mt as PLUGIN_ROOT_VARIABLES, n as createApp, nn as MODEL_LADDER, nr as hasOwnerTextOutsideBlock, nt as getSourceEnvMcpCommand, o as runWorktreeCleanup, oi as effortRank, on as resolveModelValue, or as assertWriteTargetContained, ot as replaceAdapterEntries, p as readDirtyCounts, pn as packReinstallSteps, pr as CLASS_CHECKS, pt as CARRIABLE_CLASSES, q as CURSOR_1_11_0_RUNTIME_AGENT_IDS, qn as readMaturityTier, qr as DEFAULT_IMPORT_MODE, qt as filterMcpServers, r as createEngine, ri as VALID_MATURITY_TIERS, rn as isModelClass, rr as splitAtManagedBlock, rt as hardenEnvMcpMode, s as planWorktreeSetup, si as resolveBundledContentRoot, sn as LEARNING_CONFIDENCE_LEVELS, sr as atomicWriteFile, st as toLedgerEntries, tn as CLIENT_MODEL_PROJECTION, tr as hasManagedBlock, tt as ensureGitignoreEntry, u as readWorktreePolicy, ui as CONTENT_PREFIX, un as validateLearningContent, ut as detectMonorepoPackages, v as detectWorkspaceContext, vn as UNPRINTABLE_CHARS, vr as keepSecurityLens, vt as uncarriableClasses, w as SCAN_LINE_MAX_CHARS, wi as INVISIBLE_SMUGGLING_CHARS, wn as packDirRelPath, wr as scopeRegistryArg, wt as MCP_GUARD_PATH, x as WORKSPACE_MANIFEST_FILE, xn as ignoringPolicyDenialForProof, xr as outsideSecurityRule, xt as CURSOR_COMMANDS_DIR, y as createWorkspaceManifest, yn as discoverInstalledPacks, yr as lineRulesCover, yt as userContentRoot, z as claudeSettingsReclaimReducer, zn as applyPreservedManifestFields, zr as emittedIdFor, zt as predictMergeAction } from "./src.js";
import { accessSync, closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readFileSync, readSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { lstat, mkdir, open, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import pLimit from "p-limit";
import { parse } from "yaml";
import { createHash } from "node:crypto";
import { Argument, Command, CommanderError, InvalidArgumentError, Option } from "commander";
import semver from "semver";
import { execFile, execFileSync } from "node:child_process";
import { emitKeypressEvents } from "node:readline";
import { createInterface } from "node:readline/promises";
import { isDeepStrictEqual, styleText } from "node:util";
//#region src/cli/kit/output.ts
var CliFailure = class extends Error {
	doc;
	constructor(doc) {
		super(doc.message);
		this.doc = doc;
		this.name = "CliFailure";
	}
};
function successEnvelope(command, version, payload) {
	return {
		ok: true,
		command,
		version,
		...payload
	};
}
function failureEnvelope(command, version, failure) {
	return {
		ok: false,
		command,
		version,
		error: failure
	};
}
function failureFromError(err) {
	if (err instanceof CliFailure) return err.doc;
	if (err instanceof EngineError) return {
		code: err.code,
		message: err.message
	};
	if (err instanceof Error) return {
		code: "FAILURE",
		message: err.message
	};
	return {
		code: "FAILURE",
		message: String(err)
	};
}
function renderFailureHuman(failure, palette) {
	const lines = [`${palette.red(palette.bold("error:"))} ${failure.message}`];
	if (failure.why !== void 0) lines.push(`  ${palette.dim("why:")} ${failure.why}`);
	if (failure.next !== void 0) lines.push(`  ${palette.dim("next:")} ${failure.next}`);
	return lines.join("\n");
}
//#endregion
//#region src/cli/kit/packageName.ts
const OWN_DIR = dirname(fileURLToPath(import.meta.url));
const CANONICAL_PACKAGE_NAME = "@zomarit/stamity";
const UNKNOWN_PACKAGE_FACTS = {
	name: "",
	version: "",
	isPrivate: true,
	registry: null
};
function readOwnManifest() {
	try {
		const root = findPackageRoot(OWN_DIR);
		const parsed = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
		if (typeof parsed !== "object" || parsed === null) return null;
		return parsed;
	} catch {
		return null;
	}
}
function resolveOwnPackageFacts() {
	return factsOf(readOwnManifest());
}
function factsOf(parsed) {
	if (parsed === null) return UNKNOWN_PACKAGE_FACTS;
	const { name, version, private: isPrivate, publishConfig } = parsed;
	const registry = typeof publishConfig === "object" && publishConfig !== null ? publishConfig["registry"] : void 0;
	return {
		name: typeof name === "string" ? name : "",
		version: typeof version === "string" ? version : "",
		isPrivate: isPrivate === true || isPrivate === "true",
		registry: typeof registry === "string" && registry !== "" ? registry : null
	};
}
let cachedIdentity = null;
function ownCallIdentity() {
	if (cachedIdentity === null) {
		const { name, isPrivate, registry } = factsOf(readOwnManifest());
		cachedIdentity = name === "" ? {
			name: CANONICAL_PACKAGE_NAME,
			npmChannel: true,
			registry: null
		} : registry === null ? {
			name,
			npmChannel: !isPrivate,
			registry: null
		} : writableRegistry(name, registry) ? {
			name,
			npmChannel: true,
			registry
		} : {
			name,
			npmChannel: false,
			registry: null
		};
	}
	return cachedIdentity;
}
function writableRegistry(name, registry) {
	try {
		scopeRegistryArg(name, registry);
		return true;
	} catch {
		return false;
	}
}
function packageName() {
	return ownCallIdentity().name;
}
function hasNpmChannel() {
	return ownCallIdentity().npmChannel;
}
function npmRegistry() {
	return ownCallIdentity().registry;
}
function registryOption(opts) {
	const registry = opts.npmRegistry ?? (opts.packageName === void 0 ? npmRegistry() : null);
	return registry === null ? {} : { npmRegistry: registry };
}
const GITHUB_REPOSITORY_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)$/;
let cachedSlug;
function repositorySlug() {
	if (cachedSlug === void 0) {
		const repository = readOwnManifest()?.["repository"];
		const url = typeof repository === "object" && repository !== null ? repository["url"] : void 0;
		const normalized = typeof url === "string" ? url.replace(/^git\+/, "").replace(/\.git$/, "") : "";
		const match = GITHUB_REPOSITORY_URL.exec(normalized);
		cachedSlug = match === null ? null : `${match[1]}/${match[2]}`;
	}
	return cachedSlug;
}
let cachedVersion = null;
function packageCommand(verb) {
	cachedVersion ??= resolveOwnPackageFacts().version;
	return packageCommandAt(cachedVersion, verb);
}
function packageCommandAt(version, verb) {
	const { name, npmChannel, registry } = ownCallIdentity();
	const opts = {
		npmChannel,
		...registry === null ? {} : { registry }
	};
	if (version !== "") try {
		return pinnedCliCall(name, version, verb, opts);
	} catch {}
	return [
		"npx",
		npmChannel ? "" : "--no",
		scopeRegistryArg(name, opts.registry),
		name,
		verb
	].filter((word) => word !== "").join(" ");
}
//#endregion
//#region src/cli/commands/add.ts
const MANIFEST_REL_PATH = `${STATE_DIR}/${MANIFEST_FILE}`;
const MAX_LISTED_FILES = 10;
const PREVIEW_READ_CONCURRENCY = 8;
function isPathSpec(spec) {
	return spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("~") || spec.includes("\\") || /^[A-Za-z]:/.test(spec);
}
function resolveSpecThroughCatalog(spec) {
	if (isPathSpec(spec)) return { planSpec: spec };
	const entry = lookupCatalogEntry(spec);
	if (entry === void 0) return { planSpec: spec };
	return {
		planSpec: entry.source.kind === "bundled" ? resolveBundledPackRoot(entry.id) : entry.source.package,
		catalogPin: entry.pin,
		catalogEntry: entry
	};
}
const BYTE_UNITS = [
	"B",
	"KiB",
	"MiB"
];
function formatBytes(bytes) {
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
		value /= 1024;
		unit += 1;
	}
	const suffix = BYTE_UNITS[unit] ?? "B";
	return unit === 0 ? `${value} ${suffix}` : `${value.toFixed(1)} ${suffix}`;
}
function renderPlanHeader(ctx, plan, facts) {
	const { io, palette } = ctx;
	const gates = Object.entries(plan.checks);
	const width = Math.max(9, ...gates.map(([gate]) => gate.length));
	io.out(`\n${palette.bold(`pack ${plan.manifest.name}@${plan.manifest.version}`)} ${palette.dim(`(${plan.source.kind})`)}\n\n`);
	for (const [gate, outcome] of gates) {
		const mark = outcome === "pass" ? palette.green("pass") : palette.yellow("n/a");
		io.out(`  ${gate.padEnd(width)}  ${mark}\n`);
	}
	const tierMark = plan.trustTier === "pinned-unsigned" ? palette.yellow(plan.trustTier) : palette.green(plan.trustTier);
	io.out(`\n  ${"files".padEnd(width)}  ${plan.writeSet.length}\n`);
	io.out(`  ${"footprint".padEnd(width)}  ${formatBytes(facts.footprintBytes)} of ${formatBytes(facts.footprintCap)} allowed\n`);
	io.out(`  ${"target".padEnd(width)}  ${facts.targetDir}\n`);
	io.out(`  ${"trust".padEnd(width)}  ${tierMark} — ${plan.tierBasis}\n`);
	if (facts.untargetedTools.length > 0) io.out(`  ${palette.dim(`note: the pack also targets ${facts.untargetedTools.join(", ")}, which this project does not`)}\n`);
}
function renderInventory(ctx, plan) {
	const { io, palette } = ctx;
	io.out(`\n  ${palette.bold("will install")}\n`);
	if (plan.writeSet.length === 0) {
		io.out(`    ${palette.dim("no content files — only the install receipt is written")}\n`);
		return;
	}
	const groups = /* @__PURE__ */ new Map();
	for (const entry of plan.writeSet) {
		const group = groups.get(entry.contentClass);
		if (group === void 0) groups.set(entry.contentClass, [entry]);
		else group.push(entry);
	}
	const pathWidth = Math.max(...plan.writeSet.map((entry) => entry.relPath.length));
	for (const [contentClass, entries] of groups) {
		io.out(`    ${palette.dim(contentClass)}\n`);
		for (const entry of entries) {
			const size = formatBytes(entry.sizeBytes).padStart(9);
			const tokens = plan.tokensByPath[entry.targetPath] ?? 0;
			io.out(`      ${entry.relPath.padEnd(pathWidth)}  ${size}  ~${tokens} tok\n`);
		}
	}
	io.out(`\n  context cost  ~${plan.totalTokens} tokens across ${plan.writeSet.length} file(s)\n`);
}
function renderScope(ctx, plan) {
	const { io, palette } = ctx;
	const permissions = plan.manifest.permissions;
	const row = (label, values) => {
		const rendered = values === void 0 || values.length === 0 ? palette.dim("declares none") : values.join(", ");
		io.out(`    ${label.padEnd(14)}  ${rendered}\n`);
	};
	io.out(`\n  ${palette.bold("scope")}\n`);
	row("declared tools", plan.manifest.declaredTools);
	row("tool footprint", permissions?.toolFootprint);
	row("touched paths", permissions?.touchedPaths);
}
function renderExecutables(ctx, lines) {
	const { io, palette } = ctx;
	io.out(`\n  ${palette.bold("runs on this machine")}\n`);
	if (lines.length === 0) {
		io.out(`    ${palette.dim("no hook or MCP server definitions — this pack wires no commands")}\n`);
		return;
	}
	const labelWidth = Math.max(...lines.map((line) => line.label.length));
	for (const line of lines) {
		io.out(`    ${palette.yellow(line.label.padEnd(labelWidth))}  ${line.command}\n`);
		io.out(`      ${palette.dim(line.relPath)}\n`);
	}
}
function renderCaution(ctx) {
	const { io, palette } = ctx;
	io.out(`\n  ${palette.yellow("caution: unverified content — nothing attests who published these bodies,")}\n  ${palette.yellow("and a pack's hook and MCP server definitions are commands your client RUNS:")}\n  ${palette.yellow("a hook lands in your client's settings and runs on every matching tool call,")}\n  ${palette.yellow("an MCP server is a launcher your editor spawns at start-up. Both run as you.")}\n  ${palette.yellow("read the command lines above, and the full bodies with --preview, before installing.")}\n`);
}
function renderPreview(ctx, plan, bodies) {
	const { io, palette } = ctx;
	io.out(`\n  ${palette.bold("preview")}\n`);
	if (plan.writeSet.length === 0) {
		io.out(`    ${palette.dim("no content files to preview")}\n`);
		return;
	}
	for (const entry of plan.writeSet) {
		io.out(`\n${palette.dim(`──── ${entry.relPath} ────`)}\n`);
		const body = bodies.get(entry.targetPath) ?? "";
		io.out(body === "" || body.endsWith("\n") ? body : `${body}\n`);
	}
}
const EXECUTABLE_CLASSES = /* @__PURE__ */ new Set(["hooks", "mcp_servers"]);
const MAX_COMMAND_CHARS = 160;
function commandLine(parts) {
	const flat = parts.filter((part) => typeof part === "string").join(" ").replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim();
	if (flat === "") return "(declares no command)";
	return flat.length > MAX_COMMAND_CHARS ? `${flat.slice(0, 159)}…` : flat;
}
function declaredCommands(relPath, contentClass, document) {
	if (document === null || typeof document !== "object") return [{
		label: "unreadable",
		command: "not a JSON object — read the file",
		relPath
	}];
	if (contentClass === "hooks") {
		const declared = document.hooks;
		if (!Array.isArray(declared)) return [{
			label: "unreadable",
			command: "declares no `hooks` array — read the file",
			relPath
		}];
		return declared.map((entry) => {
			const row = entry ?? {};
			const argv = Array.isArray(row.command) ? row.command : [row.command];
			return {
				label: typeof row.event === "string" ? row.event : "(no event)",
				command: commandLine(argv),
				relPath
			};
		});
	}
	const server = document;
	return [{
		label: typeof server.id === "string" ? server.id : "(no id)",
		command: commandLine([server.command, ...Array.isArray(server.args) ? server.args : []]),
		relPath
	}];
}
async function readExecutableCommands(plan) {
	const entries = plan.writeSet.filter((entry) => EXECUTABLE_CLASSES.has(entry.contentClass));
	if (entries.length === 0) return [];
	return (await pLimit(PREVIEW_READ_CONCURRENCY).map(entries, async (entry) => {
		const absPath = join(plan.source.packRoot, ...entry.relPath.split("/"));
		try {
			return declaredCommands(entry.relPath, entry.contentClass, JSON.parse(await readFile(absPath, "utf8")));
		} catch {
			return [{
				label: "unreadable",
				command: "could not be parsed — read the file",
				relPath: entry.relPath
			}];
		}
	})).flat();
}
async function readPlannedBodies(plan) {
	const pairs = await pLimit(PREVIEW_READ_CONCURRENCY).map(plan.writeSet, async (entry) => {
		const absPath = join(plan.source.packRoot, ...entry.relPath.split("/"));
		return [entry.targetPath, await readFile(absPath, "utf8")];
	});
	return new Map(pairs);
}
function renderReasons(ctx, reasons, heading = "collisions") {
	ctx.io.out(`\n  ${ctx.palette.red(heading)}\n`);
	for (const reason of reasons) ctx.io.out(`    ${reason}\n`);
}
function refuse$2(ctx, payload, doc) {
	if (!ctx.json) ctx.io.err(`${renderFailureHuman(doc, ctx.palette)}\n`);
	return {
		exitCode: 1,
		json: {
			...payload,
			error: doc
		}
	};
}
function collisionPart(packId, spec, installed, reasons) {
	const claims = installed ? `pack "${packId}" is installed: to replace it, ${replaceSteps(packId, spec)}` : `pack "${packId}" is not installed: for a path or id a client copy still claims (left by an earlier sync or clean --pack), run \`${packageCommand("sync")}\`, then delete by hand each client copy it keeps and names, unless it is yours, then \`${packageCommand(`add ${spec}`)}\`, then \`${packageCommand("sync")}\``;
	return {
		message: `${reasons.length} path(s) it would write are not free`,
		why: "a pack never overwrites a file it does not own, and add has no --force",
		next: `resolve the collisions, then re-run — ${claims}; for a file no ledger row owns ("a file already exists there"), move it out of the way or delete it, then re-run`
	};
}
function nameClashPart(packId, spec, clashes) {
	const remedies = [`rename the listed artifact(s) in the incoming pack's source (pack "${packId}"), then re-run`, ...new Set(clashes.flatMap((clash) => clash.owners.flatMap((owner) => nameClashRemedyOf(packId, spec, owner, clash.name))))];
	const hidesCommand = clashes.some((clash) => clash.owners.some((owner) => owner.kind === "command"));
	return {
		message: `${clashes.length} name(s) it would emit are taken`,
		why: hidesCommand ? "a command and a skill of one name install into one folder — on Cursor and Codex they overwrite each other's files, and on Claude the skill hides the command" : "artifacts of one name share one skill folder wherever they are delivered as skills, and there they overwrite each other's files",
		next: remedies.join("; ")
	};
}
function nameClashRemedyOf(packId, spec, owner, name) {
	const shown = withoutControlCharacters(name);
	switch (owner.layer) {
		case "pack": {
			if (owner.packId === void 0 || owner.packId === packId) return [];
			const other = withoutControlCharacters(owner.packId);
			return [`pack "${other}" is installed and keeps ${shown}: remove it only to replace it with pack "${packId}" on purpose, which then takes the name — ${replaceSteps(other, spec)}`];
		}
		case "user": return [`or rename or remove your override at ${withoutControlCharacters(owner.path)}`];
		case "fork": return [`the fork-layer file at ${withoutControlCharacters(owner.path)} ships with this package and cannot move here: report the clash to the maintainers of pack "${packId}"`];
		default: return [`the core ${owner.kind === "rule-skill" ? "rule" : owner.kind} "${shown}" ships with this package and cannot move here: report the clash to the maintainers of pack "${packId}"`];
	}
}
function replaceSteps(removed, spec) {
	return `run \`${packageCommand(`clean --pack ${removed}`)}\`, then delete by hand each client copy it keeps and names, unless it is yours, then \`${packageCommand("sync")}\`, then \`${packageCommand(`add ${spec}`)}\`, then \`${packageCommand("sync")}\``;
}
function leftBehindPart(packId, spec, paths) {
	return {
		message: `${paths.length} file(s) of the installed copy would be left behind`,
		why: "add writes the new version over the installed one and deletes nothing, so a file this version dropped would stay on disk with no ledger row — sync would still read it, and clean --pack could no longer remove it",
		next: replaceSteps(packId, spec)
	};
}
function planRefusal(packId, parts) {
	const each = (pick) => parts.map(pick).join("; ");
	return {
		code: "VALIDATION_ERROR",
		message: `pack "${packId}" was not installed: ${each((part) => part.message)}`,
		why: each((part) => part.why),
		next: each((part) => part.next)
	};
}
function collisionRefusal(packId, spec, installed, reasons) {
	return planRefusal(packId, [collisionPart(packId, spec, installed, reasons)]);
}
const addCommand = {
	name: "add",
	summary: "install a content pack: run the gate chain, show every command it would wire, then write",
	mutating: true,
	args: [{
		name: "pack-spec",
		description: "catalog id (ops), pack directory (./packs/ops), or an installed package name (@acme/ops)",
		required: true
	}],
	configure(cmd) {
		cmd.option("--allow-untrusted", "install a pack with no trust basis at all — its hook and MCP definitions become commands your client runs as you (for packs you authored)");
		cmd.option("--preview", "print every planned file's full body (bounded by the pack's footprint cap)");
	},
	async run(ctx, opts, args) {
		const rootDir = ctx.app.runtime.cwd;
		const spec = args[0] ?? "";
		const allowUntrusted = opts["allowUntrusted"] === true;
		const preview = opts["preview"] === true;
		const packEngine = ctx.engine.pack;
		const manifestStore = ctx.engine.manifest.manifest;
		const projectManifest = await manifestStore.readManifest(rootDir);
		if (projectManifest === null) throw new CliFailure({
			code: "VALIDATION_ERROR",
			message: `this repo is not initialised — there is no ${MANIFEST_REL_PATH} to record pack ownership in`,
			why: "installed pack files are tracked as ledger rows, which only exist once the repo has a manifest",
			next: `run: ${packageCommand("init")}`
		});
		const resolved = resolveSpecThroughCatalog(spec);
		if (!(resolved.catalogPin !== void 0 && (resolved.catalogPin.tier === "scanned" || resolved.catalogPin.tier === "curator-verified"))) {
			const source = await packEngine.manifest.resolvePackSource(rootDir, resolved.planSpec);
			const packManifest = await packEngine.manifest.readPackManifest(source.packRoot);
			if (packManifest.signing === void 0 && !allowUntrusted) throw new CliFailure({
				code: "INTEGRITY_ERROR",
				message: `pack "${packManifest.name}" has no trust basis — no catalog pin, no signing declaration — and such packs are refused by default`,
				why: "pack bodies land directly in agent context, and its hook and MCP server definitions become commands your client runs as you — a hook on every matching tool call, an MCP launcher at editor start-up — so nothing attests who wrote the code you would be running",
				next: "install from the curated catalog or a signed build, or — for a pack you authored yourself — re-run with --allow-untrusted, reading the `runs on this machine` block before you accept"
			});
		}
		ctx.spinner.start(`checking pack ${resolved.catalogEntry?.id ?? spec}`);
		let plan;
		try {
			plan = await packEngine.install.planPackInstall(rootDir, resolved.planSpec, {
				allowUntrusted,
				...resolved.catalogPin === void 0 ? {} : { catalogPin: resolved.catalogPin }
			});
		} finally {
			ctx.spinner.stop();
		}
		const declaredCap = plan.manifest.maxFootprintBytes;
		const facts = {
			targetDir: packEngine.install.packLedgerRelPath(plan.manifest.name),
			footprintBytes: plan.writeSet.reduce((sum, entry) => sum + entry.sizeBytes, 0),
			footprintCap: declaredCap === void 0 ? packEngine.manifest.DEFAULT_MAX_FOOTPRINT_BYTES : Math.min(declaredCap, packEngine.manifest.DEFAULT_MAX_FOOTPRINT_BYTES),
			untargetedTools: (plan.manifest.declaredTools ?? []).filter((tool) => !projectManifest.tools.includes(tool))
		};
		const [bodies, executables] = await Promise.all([preview ? readPlannedBodies(plan) : Promise.resolve(null), readExecutableCommands(plan)]);
		const nameClashes = plan.nameClashes ?? [];
		const leftBehind = plan.leftBehind ?? [];
		const nameClashLines = nameClashes.map((clash) => ctx.engine.content.catalog.describeInvocableNameClash(clash));
		const payload = {
			packId: plan.manifest.name,
			planned: {
				files: plan.writeSet.map((entry) => entry.targetPath),
				checks: plan.checks,
				collisions: plan.collisions,
				nameClashes: nameClashLines,
				leftBehind
			},
			trustTier: plan.trustTier,
			tierBasis: plan.tierBasis,
			policy: plan.policy,
			totalTokens: plan.totalTokens,
			installed: false,
			written: [],
			receiptPath: null,
			executes: executables,
			...bodies === null ? {} : { preview: Object.fromEntries(bodies) }
		};
		renderPlanHeader(ctx, plan, facts);
		if (resolved.catalogEntry !== void 0 && resolved.catalogEntry.notAudited) ctx.io.out(`  ${ctx.palette.yellow(resolved.catalogEntry.disclaimer)}\n`);
		renderInventory(ctx, plan);
		renderScope(ctx, plan);
		renderExecutables(ctx, executables);
		if (plan.trustTier === "pinned-unsigned") renderCaution(ctx);
		if (bodies !== null) renderPreview(ctx, plan, bodies);
		const installed = packEngine.install.planPackRemoval(projectManifest, plan.manifest.name).length > 0;
		const parts = [];
		if (plan.collisions.length > 0) {
			renderReasons(ctx, plan.collisions);
			parts.push(collisionPart(plan.manifest.name, spec, installed, plan.collisions));
		}
		if (nameClashes.length > 0) {
			renderReasons(ctx, nameClashLines, "name clashes");
			parts.push(nameClashPart(plan.manifest.name, spec, nameClashes));
		}
		if (leftBehind.length > 0) {
			renderReasons(ctx, leftBehind.map(withoutControlCharacters), "left behind by this version");
			parts.push(leftBehindPart(plan.manifest.name, spec, leftBehind));
		}
		if (parts.length > 0) return refuse$2(ctx, payload, planRefusal(plan.manifest.name, parts));
		if (ctx.dryRun) {
			ctx.io.out(`\n  ${ctx.palette.dim("nothing written (--dry-run)")}\n`);
			ctx.io.out(`\n  next: re-run without --dry-run to install, then stamity sync to project it\n`);
			return {
				exitCode: 0,
				json: {
					...payload,
					dryRun: true
				}
			};
		}
		ctx.io.out("\n");
		ctx.spinner.start(`installing ${plan.writeSet.length} file(s)`);
		let applied;
		try {
			applied = await packEngine.install.applyPackInstall(rootDir, plan, projectManifest, { now: ctx.app.runtime.clock.now() });
		} finally {
			ctx.spinner.stop();
		}
		if (!applied.result.installed) {
			renderReasons(ctx, applied.result.errors);
			return refuse$2(ctx, {
				...payload,
				planned: {
					...payload.planned,
					collisions: applied.result.errors
				}
			}, collisionRefusal(plan.manifest.name, spec, installed, applied.result.errors));
		}
		await manifestStore.writeManifest(rootDir, applied.manifest, { now: ctx.app.runtime.clock.now() });
		const written = applied.result.written;
		const receiptPath = applied.result.receiptPath;
		ctx.io.out(`\n${ctx.palette.green(`installed ${written.length} file(s)`)} into ${facts.targetDir}\n`);
		for (const path of written.slice(0, MAX_LISTED_FILES)) ctx.io.out(`  ${ctx.palette.green("+")} ${path}\n`);
		if (written.length > MAX_LISTED_FILES) ctx.io.out(`  ${ctx.palette.dim(`... and ${written.length - MAX_LISTED_FILES} more`)}\n`);
		if (receiptPath !== null) ctx.io.out(`\n  receipt: ${receiptPath} (${plan.trustTier}, ${plan.writeSet.length} content file(s))\n`);
		const nextSteps = ["stamity sync — projects this pack into your tool directories; until it runs, nothing in the pack is reachable from a client", `review ${facts.targetDir}, then run stamity check — its pack-integrity row re-hashes every installed byte and reports any edit or deletion`];
		ctx.io.out("\n  next:\n");
		for (const [index, step] of nextSteps.entries()) ctx.io.out(`    ${index + 1}. ${step}\n`);
		ctx.io.out(`  ${ctx.palette.dim("pack content is installed, not generated — sync projects it into your tool directories and never rewrites the installed copy")}\n`);
		return {
			exitCode: 0,
			json: {
				...payload,
				installed: true,
				written,
				receiptPath,
				next: nextSteps
			}
		};
	}
};
//#endregion
//#region src/cli/engine/emission.ts
const OVERRIDE_EMITTING_CLASSES = Object.freeze([
	"agent",
	"rule",
	"command",
	"skill"
]);
function getEmissionPlanner() {
	const composed = composeEmissionPlanner(ADAPTER_REGISTRY);
	return {
		id: composed.id,
		plan: (ctx) => composed.plan(overlayContentRoots(ctx)),
		planWithWarnings: (ctx) => composed.planWithWarnings(overlayContentRoots(ctx))
	};
}
function overlayContentRoots(ctx) {
	const spec = contentRootsOf(ctx.contentRoot);
	if (spec.overrideRoot !== void 0) return ctx;
	return {
		...ctx,
		contentRoot: {
			...spec.root === void 0 ? {} : { root: spec.root },
			packRoots: spec.packRoots,
			...spec.forkRoot === void 0 ? {} : { forkRoot: spec.forkRoot },
			overrideRoot: userContentRoot(ctx.rootDir)
		}
	};
}
//#endregion
//#region src/cli/engine/gitStatus.ts
const GIT_FACT_TIMEOUT_MS = 5e3;
function parsePorcelainStatus(output) {
	const changedCount = output.split(/\r?\n/).filter((line) => line.trim() !== "").length;
	return {
		dirty: changedCount > 0,
		changedCount
	};
}
function readWorkingTreeStatus(cwd, runner = execGitCheck) {
	try {
		return {
			available: true,
			...parsePorcelainStatus(runner(["status", "--porcelain"], cwd))
		};
	} catch (error) {
		const unavailable = {
			available: false,
			dirty: false,
			changedCount: 0
		};
		return keptFromGit(error) ? {
			...unavailable,
			reason: "bare-layout"
		} : unavailable;
	}
}
function keptFromGit(error) {
	return error instanceof Error && error.keptFromGit === true;
}
function parseShortlogContributors(output) {
	return output.split(/\r?\n/).filter((line) => /^\s*\d+\s+\S/.test(line)).length;
}
function readHistoryFacts(cwd, runner = execGitCheck) {
	try {
		const countOutput = runner([
			"rev-list",
			"--count",
			"HEAD"
		], cwd).trim();
		if (!/^\d+$/.test(countOutput)) return null;
		return {
			commitCount: Number.parseInt(countOutput, 10),
			contributorCount: parseShortlogContributors(runner([
				"shortlog",
				"-sn",
				"HEAD"
			], cwd))
		};
	} catch {
		return null;
	}
}
function gitCheckEnv() {
	const env = {};
	for (const [key, value] of Object.entries(process.env)) if (!/^GIT_/i.test(key)) env[key] = value;
	env["GIT_OPTIONAL_LOCKS"] = "0";
	return env;
}
function gitCheckRunner(options = {}) {
	const timeout = options.timeoutMs ?? GIT_FACT_TIMEOUT_MS;
	const { maxBuffer } = options;
	return (args, cwd) => {
		if (gitDiscoveryMeetsBareShape(cwd)) throw Object.assign(new Error(bareShapeRefusal(cwd)), {
			status: 128,
			keptFromGit: true
		});
		const env = gitCheckEnv();
		const pinned = [
			"-c",
			"safe.bareRepository=explicit",
			"-c",
			"core.fsmonitor=false",
			...args
		];
		const git = gitProgramFor(cwd, env);
		if (git === null) throw programNotFound("git", "spawnSync", pinned);
		return execFileSync(git, pinned, {
			cwd,
			env,
			encoding: "utf8",
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			],
			timeout,
			...maxBuffer === void 0 ? {} : { maxBuffer },
			windowsHide: true
		});
	};
}
const execGitCheck = gitCheckRunner();
//#endregion
//#region src/cli/kit/terminal.ts
function detectTerminalFacts(streams) {
	const columns = (streams?.stdout ?? process.stdout).columns;
	return {
		stdoutIsTTY: (streams?.stdout ?? process.stdout).isTTY === true,
		stderrIsTTY: (streams?.stderr ?? process.stderr).isTTY === true,
		stdinIsTTY: (streams?.stdin ?? process.stdin).isTTY === true,
		...typeof columns === "number" && columns > 0 ? { stdoutColumns: columns } : {}
	};
}
const FORCE_COLOR_OFF = /* @__PURE__ */ new Set(["0", "false"]);
function resolveColorEnabled(opts) {
	if (opts.noColorFlag) return false;
	const noColor = opts.env["NO_COLOR"];
	if (noColor !== void 0 && noColor !== "") return false;
	const forceColor = opts.env["FORCE_COLOR"];
	if (forceColor !== void 0 && forceColor !== "") return !FORCE_COLOR_OFF.has(forceColor);
	if ((opts.env["TERM"] ?? "").toLowerCase() === "dumb") return false;
	return opts.stdoutIsTTY;
}
const MARK_ACCENT_RGB = [
	107,
	36,
	255
];
const MARK_ACCENT_SGR = {
	truecolor: `\u001B[38;2;${MARK_ACCENT_RGB[0]};${MARK_ACCENT_RGB[1]};${MARK_ACCENT_RGB[2]}m`,
	ansi256: "\x1B[38;5;57m",
	ansi16: "\x1B[35m"
};
const UI_ACCENT_RGB = [
	138,
	82,
	255
];
const UI_ACCENT_SGR = {
	truecolor: `\u001B[38;2;${UI_ACCENT_RGB[0]};${UI_ACCENT_RGB[1]};${UI_ACCENT_RGB[2]}m`,
	ansi256: "\x1B[38;5;99m"
};
const ACCENT_RESET = "\x1B[39m";
function resolveAccentDepth(opts) {
	if (!opts.colorEnabled) return "none";
	const colorterm = (opts.env["COLORTERM"] ?? "").toLowerCase();
	if (colorterm === "truecolor" || colorterm === "24bit") return "truecolor";
	if ((opts.env["TERM"] ?? "").toLowerCase().includes("256color") || colorterm !== "") return "ansi256";
	return "ansi16";
}
const identity = (s) => s;
const paint = (format) => (s) => styleText(format, s, { validateStream: false });
function makePalette(enabled, accent = "none") {
	const sgr = enabled && accent !== "none" && accent !== "ansi16" ? UI_ACCENT_SGR[accent] : null;
	const accentFn = sgr === null ? identity : (s) => `${sgr}${s}${ACCENT_RESET}`;
	if (!enabled) return {
		bold: identity,
		dim: identity,
		red: identity,
		green: identity,
		yellow: identity,
		cyan: identity,
		accent: accentFn
	};
	return {
		bold: paint("bold"),
		dim: paint("dim"),
		red: paint("red"),
		green: paint("green"),
		yellow: paint("yellow"),
		cyan: paint("cyan"),
		accent: accentFn
	};
}
const SPINNER_FRAMES = [
	"-",
	"\\",
	"|",
	"/"
];
function makeSpinner(opts) {
	const { enabled, write } = opts;
	let frame = 0;
	let width = 0;
	let active = false;
	const render = (text) => {
		const line = `${SPINNER_FRAMES[frame % SPINNER_FRAMES.length]} ${text}`;
		frame += 1;
		const pad = Math.max(0, width - line.length);
		write(`\r${line}${" ".repeat(pad)}`);
		width = Math.max(width, line.length);
		active = true;
	};
	return {
		start(text) {
			if (enabled) render(text);
			else write(`${text}\n`);
		},
		update(text) {
			if (enabled) render(text);
		},
		stop(finalLine) {
			if (enabled && active) {
				write(`\r${" ".repeat(width)}\r`);
				active = false;
				width = 0;
				frame = 0;
			}
			if (finalLine !== void 0) write(`${finalLine}\n`);
		}
	};
}
//#endregion
//#region src/cli/kit/prompts.ts
function promptGate(opts) {
	return {
		interactive: opts.stdinIsTTY && !opts.yes && !opts.json,
		...opts.env === void 0 ? {} : { env: opts.env },
		...opts.palette === void 0 ? {} : { palette: opts.palette }
	};
}
const IDENTITY_PALETTE = makePalette(false);
const sessions = /* @__PURE__ */ new WeakMap();
const abortedInputs = /* @__PURE__ */ new WeakSet();
const menuLeftovers = /* @__PURE__ */ new WeakSet();
const abortFailure = () => new CliFailure({
	code: "FAILURE",
	message: "aborted"
});
function sessionFor(io) {
	const existing = sessions.get(io.input);
	if (existing !== void 0) return existing;
	const rl = createInterface({
		input: io.input,
		output: io.output
	});
	const session = {
		rl,
		queue: [],
		pending: null,
		closed: false
	};
	rl.on("line", (line) => {
		const pending = session.pending;
		if (pending !== null) {
			session.pending = null;
			pending.resolve(line);
		} else session.queue.push(line);
	});
	rl.on("close", () => {
		session.closed = true;
		const pending = session.pending;
		if (pending !== null) {
			session.pending = null;
			pending.resolve(null);
		}
	});
	rl.on("SIGINT", () => {
		abortedInputs.add(io.input);
		const pending = session.pending;
		if (pending !== null) {
			session.pending = null;
			pending.reject(abortFailure());
			return;
		}
		rl.close();
	});
	sessions.set(io.input, session);
	return session;
}
function writePrompt(session, io, prompt) {
	if (session.closed) {
		io.output.write(prompt);
		return;
	}
	session.rl.setPrompt(prompt);
	session.rl.prompt();
}
async function ask(io, prompt) {
	if (abortedInputs.has(io.input)) throw abortFailure();
	if (menuLeftovers.delete(io.input)) await drainNow(io.input);
	const session = sessionFor(io);
	writePrompt(session, io, prompt);
	const queued = session.queue.shift();
	if (queued !== void 0) return queued;
	if (session.closed) return null;
	if (session.pending !== null) throw new Error("prompts: a question is already pending on this input stream");
	return await new Promise((resolve, reject) => {
		session.pending = {
			resolve,
			reject
		};
	});
}
function closePrompts(io) {
	const session = sessions.get(io.input);
	if (session === void 0) return;
	sessions.delete(io.input);
	session.rl.close();
}
async function confirm(gate, io, q) {
	if (!gate.interactive) return q.defaultYes;
	const answer = await ask(io, `${q.question} ${q.defaultYes ? "[Y/n]" : "[y/N]"} `);
	if (answer === null) {
		io.output.write(`no answer — keeping the default (${q.defaultYes ? "yes" : "no"})\n`);
		return q.defaultYes;
	}
	const normalized = answer.trim().toLowerCase();
	if (normalized === "y" || normalized === "yes") return true;
	if (normalized === "n" || normalized === "no") return false;
	return q.defaultYes;
}
async function selectOne(gate, io, q) {
	if (!gate.interactive) return q.defaultValue;
	const palette = gate.palette ?? IDENTITY_PALETTE;
	const defaultIndex = q.choices.findIndex((choice) => choice.value === q.defaultValue);
	const raw = rawMenuIo(gate, io, q.choices.length);
	if (q.choices.length === 0) return q.defaultValue;
	if (raw !== null) {
		const menu = await runMenu(io, raw, {
			question: q.question,
			hint: MOVE_HINT,
			labels: q.choices.map((choice) => choice.label),
			active: defaultIndex === -1 ? 0 : defaultIndex,
			selected: null
		}, palette);
		return q.choices[menu.active]?.value ?? q.defaultValue;
	}
	const rows = q.choices.map((choice, i) => numberedRow(i, q.choices.length, choice.label));
	const bracket = defaultIndex === -1 ? q.defaultValue : String(defaultIndex + 1);
	const prompt = `${palette.bold(q.question)}\n${rows.join("\n")}\nChoose 1-${q.choices.length} [${bracket}]: `;
	for (let attempt = 0; attempt < 2; attempt += 1) {
		const rawAnswer = await ask(io, prompt);
		if (rawAnswer === null) {
			io.output.write(`no answer — keeping the default (${bracket})\n`);
			return q.defaultValue;
		}
		const answer = rawAnswer.trim();
		if (answer === "") return q.defaultValue;
		if (/^\d+$/.test(answer)) {
			const picked = q.choices[Number.parseInt(answer, 10) - 1];
			if (picked !== void 0) return picked.value;
		}
		if (attempt === 0) io.output.write(`${palette.yellow(`not a valid choice: ${JSON.stringify(sanitizeLabel(answer))} — enter a number 1-${q.choices.length}`)}\n`);
	}
	io.output.write(`still not a valid choice — keeping the default (${bracket})\n`);
	return q.defaultValue;
}
async function selectMany(gate, io, q) {
	if (!gate.interactive) return [...q.defaultValues];
	const palette = gate.palette ?? IDENTITY_PALETTE;
	const defaultIndexes = q.choices.flatMap((choice, index) => q.defaultValues.includes(choice.value) ? [index] : []);
	const raw = rawMenuIo(gate, io, q.choices.length);
	if (raw !== null && q.choices.length > 0) {
		const picked = (await runMenu(io, raw, {
			question: q.question,
			hint: TOGGLE_HINT,
			labels: q.choices.map((choice) => choice.label),
			active: defaultIndexes[0] ?? 0,
			selected: new Set(defaultIndexes)
		}, palette)).selected ?? /* @__PURE__ */ new Set();
		return q.choices.filter((_choice, index) => picked.has(index)).map((choice) => choice.value);
	}
	return await selectManyTyped(io, q, defaultIndexes, palette);
}
function numberedRow(index, count, label) {
	return `  ${String(index + 1).padStart(String(count).length)}) ${sanitizeLabel(label)}`;
}
function parseChoiceNumbers(answer, count) {
	const trimmed = answer.trim();
	if (trimmed.toLowerCase() === "none") return "empty";
	const tokens = trimmed.split(",").map((token) => token.trim()).filter((token) => token !== "");
	if (tokens.length === 0) return "default";
	const invalid = tokens.filter((token) => {
		if (!/^\d+$/.test(token)) return true;
		const value = Number.parseInt(token, 10);
		return value < 1 || value > count;
	});
	if (invalid.length > 0) return { invalid };
	return { indexes: [...new Set(tokens.map((token) => Number.parseInt(token, 10) - 1))].toSorted((a, b) => a - b) };
}
async function selectManyTyped(io, q, defaultIndexes, palette) {
	const count = q.choices.length;
	if (count === 0) return [...q.defaultValues];
	const rows = q.choices.map((choice, i) => numberedRow(i, count, choice.label));
	const bracket = defaultIndexes.length === 0 ? "none" : defaultIndexes.map((index) => index + 1).join(",");
	const prompt = `${palette.bold(q.question)}\n${rows.join("\n")}\nChoose 1-${count}, comma-separated [${bracket}]: (type "none" to clear every box) `;
	for (let attempt = 0; attempt < 2; attempt += 1) {
		const raw = await ask(io, prompt);
		if (raw === null) {
			io.output.write(`no answer — keeping the defaults (${bracket})\n`);
			return [...q.defaultValues];
		}
		const parsed = parseChoiceNumbers(raw.trim(), count);
		if (parsed === "default") return [...q.defaultValues];
		if (parsed === "empty") return [];
		if ("indexes" in parsed) {
			const picked = new Set(parsed.indexes);
			return q.choices.filter((_choice, index) => picked.has(index)).map((choice) => choice.value);
		}
		if (attempt === 0) io.output.write(`${palette.yellow(`not a valid choice: ${parsed.invalid.map((token) => sanitizeLabel(token)).join(", ")} — enter numbers 1-${count} separated by commas`)}\n`);
	}
	io.output.write(`still not a valid choice — keeping the defaults (${bracket})\n`);
	return [...q.defaultValues];
}
async function textInput(gate, io, q) {
	if (!gate.interactive) return q.defaultValue;
	const raw = await ask(io, `${q.question} [${sanitizeLabel(q.defaultValue)}]: `);
	if (raw === null) {
		io.output.write(`no answer — keeping the default (${sanitizeLabel(q.defaultValue)})\n`);
		return q.defaultValue;
	}
	const answer = raw.trim();
	return answer === "" ? q.defaultValue : answer;
}
function rawMenuIo(gate, io, choiceCount) {
	if (!gate.interactive) return null;
	const input = io.input;
	const output = io.output;
	if (input.isTTY !== true || output.isTTY !== true) return null;
	if (typeof input.setRawMode !== "function") return null;
	if ((gate.env?.["TERM"] ?? "").toLowerCase() === "dumb") return null;
	if (typeof output.rows === "number" && output.rows > 0 && choiceCount + 2 > output.rows) return null;
	return {
		input,
		output: io.output
	};
}
const CURSOR_HIDE = "\x1B[?25l";
const CURSOR_SHOW = "\x1B[?25h";
const CLEAR_LINE = "\x1B[2K";
const rewind = (lines) => lines > 0 ? `\u001B[${lines}A` : "";
const MOVE_HINT = "(up/down to move, enter to accept, ctrl-c to cancel)";
const TOGGLE_HINT = "(up/down to move, space to toggle, enter to accept, ctrl-c to cancel)";
const DEFAULT_COLUMNS = 80;
const clampToWidth = (line, columns) => {
	const points = [...line];
	return points.length > columns ? points.slice(0, columns).join("") : line;
};
const LABEL_STRIP = new RegExp(`${UNPRINTABLE_CHARS.source}|${UNICODE_TAG_CHARS.source}|\\p{Default_Ignorable_Code_Point}`, "gu");
function sanitizeLabel(label) {
	return label.replace(/[\r\n\t]/gu, " ").replace(LABEL_STRIP, "");
}
function renderMenu(menu, columns, palette) {
	const rows = menu.labels.map((label, index) => {
		const active = index === menu.active;
		const checked = menu.selected !== null && menu.selected.has(index);
		const marker = active ? ">" : " ";
		const prefix = `${marker} ${menu.selected === null ? "" : `${checked ? "[x]" : "[ ]"} `}`;
		const budget = Math.max(0, columns - prefix.length);
		const clean = sanitizeLabel(label);
		const fitted = clean.length > budget ? clean.slice(0, budget) : clean;
		return `${active ? palette.accent(marker) : marker} ${menu.selected === null ? "" : `${checked ? palette.accent("[x]") : "[ ]"} `}${fitted}`;
	});
	return [
		palette.bold(clampToWidth(menu.question, columns)),
		palette.dim(clampToWidth(menu.hint, columns)),
		...rows
	].map((line) => `${CLEAR_LINE}${line}\n`).join("");
}
function menuAnswer(menu) {
	if (menu.selected === null) return sanitizeLabel(menu.labels[menu.active] ?? "");
	const kept = menu.labels.filter((_label, index) => menu.selected?.has(index) === true);
	return kept.length === 0 ? "none" : kept.map((label) => sanitizeLabel(label)).join(", ");
}
function menuDefaultDisclosure(menu) {
	return `no answer — keeping the ${menu.selected === null ? "default" : "defaults"} (${menuAnswer(menu)})`;
}
const ECHO_SEPARATOR = ">";
function reflowAnswer(answer, columns, rows) {
	const budget = Math.max(1, columns - 2);
	const lines = [];
	let rest = answer;
	while (lines.length < rows) {
		if (rest.length <= budget) return [...lines, rest];
		const breakAt = rest.slice(0, budget + 1).lastIndexOf(" ");
		if (breakAt > 0) {
			lines.push(rest.slice(0, breakAt));
			rest = rest.slice(breakAt + 1);
		} else {
			lines.push(rest.slice(0, budget));
			rest = rest.slice(budget);
		}
	}
	return lines;
}
function renderMenuEcho(menu, columns, palette) {
	const height = menu.labels.length + 2;
	const answer = menuAnswer(menu);
	const boldQuestion = (text) => text === "" ? "" : palette.bold(text);
	const lines = [];
	if (`${menu.question} ${ECHO_SEPARATOR} ${answer}`.length <= columns) lines.push(`${boldQuestion(menu.question)} ${palette.accent(ECHO_SEPARATOR)} ${answer}`);
	else {
		lines.push(boldQuestion(clampToWidth(menu.question, columns)));
		for (const [index, row] of reflowAnswer(answer, columns, height - 1).entries()) {
			const prefix = index === 0 ? `${palette.accent(ECHO_SEPARATOR)} ` : "  ";
			lines.push(`${prefix}${row}`);
		}
	}
	const rest = height - lines.length;
	const drawn = lines.map((line) => `${CLEAR_LINE}${line}\n`).join("");
	return `${rewind(height)}${drawn}${`${CLEAR_LINE}\n`.repeat(rest)}${rewind(rest)}`;
}
function quiesceSession(io) {
	const session = sessions.get(io.input);
	if (session === void 0) return null;
	sessions.delete(io.input);
	const carried = [...session.queue];
	session.rl.close();
	return carried;
}
function restoreSession(io, carried) {
	if (carried === null) return;
	sessionFor(io).queue.push(...carried);
}
function drainBufferedInput(input) {
	const read = input.read.bind(input);
	while (read() !== null);
}
function discardChunk() {}
async function drainNow(input) {
	await new Promise((resolve) => {
		input.on("data", discardChunk);
		input.resume();
		setImmediate(() => {
			input.removeListener("data", discardChunk);
			input.pause();
			resolve();
		});
	});
}
function installSignalGuards(raw) {
	let removed = false;
	const restore = () => {
		try {
			raw.input.setRawMode(false);
		} catch {}
		raw.output.write(CURSOR_SHOW);
	};
	function remove() {
		if (removed) return;
		removed = true;
		process.removeListener("exit", onExit);
		process.removeListener("SIGTERM", onSigterm);
		process.removeListener("SIGHUP", onSighup);
	}
	function onExit() {
		restore();
	}
	function onSigterm() {
		restore();
		remove();
		process.kill(process.pid, "SIGTERM");
	}
	function onSighup() {
		restore();
		remove();
		process.kill(process.pid, "SIGHUP");
	}
	process.once("SIGTERM", onSigterm);
	process.once("SIGHUP", onSighup);
	process.on("exit", onExit);
	return remove;
}
async function runMenu(io, raw, menu, palette) {
	if (abortedInputs.has(io.input)) throw abortFailure();
	const carried = quiesceSession(io);
	await drainNow(raw.input);
	const height = menu.labels.length + 2;
	const count = menu.labels.length;
	const reportedColumns = raw.output.columns;
	const columns = typeof reportedColumns === "number" && reportedColumns > 0 ? reportedColumns : DEFAULT_COLUMNS;
	emitKeypressEvents(raw.input);
	let listener = null;
	let onStreamEnd = null;
	let onStreamError = null;
	let aborted = false;
	let settled = false;
	const removeSignalGuards = installSignalGuards(raw);
	try {
		raw.input.setRawMode(true);
		raw.output.write(CURSOR_HIDE);
		return await new Promise((resolve, reject) => {
			let drawn = false;
			const draw = () => {
				raw.output.write(`${drawn ? rewind(height) : ""}${renderMenu(menu, columns, palette)}`);
				drawn = true;
			};
			onStreamEnd = () => {
				if (settled) return;
				settled = true;
				if (listener !== null) raw.input.removeListener("keypress", listener);
				listener = null;
				raw.output.write(`\n${menuDefaultDisclosure(menu)}\n`);
				resolve({
					question: menu.question,
					hint: menu.hint,
					labels: menu.labels,
					active: menu.active,
					selected: menu.selected === null ? null : new Set(menu.selected)
				});
			};
			onStreamError = (err) => {
				if (settled) return;
				settled = true;
				if (listener !== null) raw.input.removeListener("keypress", listener);
				listener = null;
				reject(err);
			};
			raw.input.on("end", onStreamEnd);
			raw.input.on("close", onStreamEnd);
			raw.input.on("error", onStreamError);
			listener = (_chunk, key) => {
				if (settled) return;
				try {
					handleKey(key);
				} catch (error) {
					settled = true;
					if (listener !== null) raw.input.removeListener("keypress", listener);
					listener = null;
					reject(error instanceof Error ? error : new Error(String(error)));
				}
			};
			const handleKey = (key) => {
				const name = key?.name;
				if (name === "c" && key?.ctrl === true) {
					settled = true;
					aborted = true;
					abortedInputs.add(io.input);
					if (listener !== null) raw.input.removeListener("keypress", listener);
					listener = null;
					reject(abortFailure());
					return;
				}
				if (name === "up") {
					menu.active = (menu.active + count - 1) % count;
					draw();
					return;
				}
				if (name === "down") {
					menu.active = (menu.active + 1) % count;
					draw();
					return;
				}
				if (name === "space" && menu.selected !== null) {
					if (!menu.selected.delete(menu.active)) menu.selected.add(menu.active);
					draw();
					return;
				}
				if (name === "return" || name === "enter") {
					settled = true;
					if (listener !== null) raw.input.removeListener("keypress", listener);
					listener = null;
					raw.output.write(renderMenuEcho(menu, columns, palette));
					resolve({
						question: menu.question,
						hint: menu.hint,
						labels: menu.labels,
						active: menu.active,
						selected: menu.selected === null ? null : new Set(menu.selected)
					});
					return;
				}
			};
			raw.input.on("keypress", listener);
			draw();
			raw.input.resume();
		});
	} finally {
		if (listener !== null) raw.input.removeListener("keypress", listener);
		if (onStreamEnd !== null) {
			raw.input.removeListener("end", onStreamEnd);
			raw.input.removeListener("close", onStreamEnd);
		}
		if (onStreamError !== null) raw.input.removeListener("error", onStreamError);
		removeSignalGuards();
		try {
			raw.input.setRawMode(false);
		} catch {}
		drainBufferedInput(raw.input);
		menuLeftovers.add(raw.input);
		try {
			raw.output.write(CURSOR_SHOW);
		} catch {}
		raw.input.pause();
		if (!aborted) restoreSession(io, carried);
	}
}
//#endregion
//#region src/cli/commands/plugin/probe.ts
const PLUGIN_LOCATOR_TIMEOUT_MS = 5e3;
const PLUGIN_LOCATOR_PATH = "runtime/locate.mjs";
function pluginRootVariable(env) {
	return PLUGIN_ROOT_VARIABLES.find((name) => (env[name] ?? "").trim() !== "");
}
function pluginLocatorPath(root) {
	return join(root, ...PLUGIN_LOCATOR_PATH.split("/"));
}
function runPluginLocator(locator, timeoutMs) {
	return new Promise((settle) => {
		let done = false;
		const finish = (run) => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			settle(run);
		};
		const child = execFile(process.execPath, [locator, "--print"], {
			timeout: timeoutMs,
			killSignal: "SIGKILL",
			windowsHide: true,
			encoding: "utf8"
		}, (error, stdout) => {
			if (error === null) {
				finish({
					status: 0,
					stdout,
					timedOut: false,
					failure: null
				});
				return;
			}
			const failed = error;
			finish({
				status: typeof failed.code === "number" ? failed.code : null,
				stdout,
				timedOut: failed.killed === true,
				failure: error.message
			});
		});
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			child.stdout?.destroy();
			child.stderr?.destroy();
			finish({
				status: null,
				stdout: "",
				timedOut: true,
				failure: "the locator was still running at the ceiling and was killed"
			});
		}, timeoutMs);
		timer.unref();
	});
}
const LOCATOR_RUNTIME_KINDS = /* @__PURE__ */ new Set([
	"companion",
	"bundled",
	"none"
]);
function isStringOrNull(value) {
	return value === null || typeof value === "string";
}
function parseLocatorReport(stdout) {
	try {
		const parsed = JSON.parse(stdout);
		if (typeof parsed !== "object" || parsed === null) return null;
		const { runtime, node } = parsed;
		if (typeof runtime !== "object" || runtime === null) return null;
		if (typeof node !== "object" || node === null) return null;
		const { kind, path, version, refusal } = runtime;
		if (typeof kind !== "string" || !LOCATOR_RUNTIME_KINDS.has(kind)) return null;
		if (!isStringOrNull(path) || !isStringOrNull(version) || !isStringOrNull(refusal)) return null;
		const { version: nodeVersion, floor, ok } = node;
		if (typeof ok !== "boolean") return null;
		if (typeof nodeVersion !== "string" || !isStringOrNull(floor)) return null;
		return parsed;
	} catch {
		return null;
	}
}
function majorOf(version) {
	if (typeof version !== "string") return null;
	const parsed = semver.valid(version) ?? semver.coerce(version)?.version ?? null;
	return parsed === null ? null : semver.major(parsed);
}
async function requiredNodeRange() {
	try {
		const root = findPackageRoot(dirname(fileURLToPath(import.meta.url)));
		const range = JSON.parse(await readFile(join(root, "package.json"), "utf8")).engines?.node;
		return typeof range === "string" && semver.validRange(range) !== null ? range : null;
	} catch {
		return null;
	}
}
function judgeNodeFloor(nodeVersion, range) {
	const parsed = semver.valid(nodeVersion) ?? semver.coerce(nodeVersion)?.version ?? null;
	if (parsed === null) return "unparseable";
	return semver.satisfies(parsed, range, { includePrerelease: true }) ? "satisfies" : "below";
}
function nodeFactsFor(nodeVersion, floor) {
	if (floor === null) return {
		version: nodeVersion,
		floor: null,
		ok: true
	};
	return {
		version: nodeVersion,
		floor,
		ok: judgeNodeFloor(nodeVersion, floor) !== "below"
	};
}
async function engineNodeFacts(nodeVersion) {
	return nodeFactsFor(nodeVersion, await requiredNodeRange());
}
async function probePluginRuntime(root, options = {}) {
	const locator = pluginLocatorPath(root);
	const timeoutMs = options.timeoutMs ?? PLUGIN_LOCATOR_TIMEOUT_MS;
	const run = await runPluginLocator(locator, timeoutMs);
	const base = {
		locator,
		kind: "none",
		path: null,
		version: null,
		node: null
	};
	if (run.timedOut) return {
		...base,
		outcome: "timeout",
		message: `${locator} did not answer within ${timeoutMs / 1e3}s and was stopped, so no runtime was resolved: ${run.failure ?? "no message"}`
	};
	const report = parseLocatorReport(run.stdout);
	if (run.status === 2) return {
		...base,
		outcome: "refused",
		node: report?.node ?? null,
		message: sanitizeLabel(report?.runtime.refusal ?? run.failure ?? "the locator refused without a message")
	};
	if (run.status !== 0 || report === null) return {
		...base,
		outcome: "unreadable",
		message: `${locator} reported no runtime (exit ${run.status ?? "none"}): ${run.failure ?? "stdout was not the locator's --print document"}`
	};
	const { kind, path, version } = report.runtime;
	return {
		locator,
		outcome: "resolved",
		kind,
		path,
		version,
		node: report.node,
		message: null
	};
}
function describeDuplicatePaths(paths) {
	const shown = paths.slice(0, 3).join(", ");
	const folded = paths.length - 3;
	return folded > 0 ? `${shown} +${folded} more` : shown;
}
const NATIVE_CONTENT_DIRS = {
	claude: [
		[".claude/agents", "agent"],
		[".claude/commands", "command"],
		[".claude/skills", "skill"]
	],
	cursor: [
		[".cursor/agents", "agent"],
		[".cursor/rules", "rule"],
		[".agents/skills", "skill"]
	],
	copilot: [
		[".github/agents", "agent"],
		[".github/prompts", "command"],
		[".agents/skills", "skill"]
	],
	codex: [[".codex/agents", "agent"], [".agents/skills", "skill"]]
};
const NATIVE_CONTENT_EXTENSIONS = [
	".agent.md",
	".prompt.md",
	".md",
	".mdc",
	".toml"
];
function nativeEntryId(name, isDirectory) {
	if (isDirectory) return name;
	const extension = NATIVE_CONTENT_EXTENSIONS.find((suffix) => name.endsWith(suffix));
	return extension === void 0 ? name : name.slice(0, -extension.length);
}
async function pluginCarriedIds(classes) {
	const index = await buildContentIndex();
	const byClass = /* @__PURE__ */ new Map();
	for (const item of index.items) {
		if (!classes.has(item.type)) continue;
		const ids = byClass.get(item.type) ?? /* @__PURE__ */ new Set();
		ids.add(emittedIdFor(item));
		byClass.set(item.type, ids);
	}
	return byClass;
}
function carriedIdsFor(index, classes) {
	const ids = /* @__PURE__ */ new Set();
	for (const cls of classes) for (const id of index.get(cls) ?? []) ids.add(id);
	return ids;
}
async function readDirEntries(path) {
	try {
		return await readdir(path, { withFileTypes: true });
	} catch {
		return [];
	}
}
async function readIfPresent$2(path) {
	try {
		return await readFile(path, "utf8");
	} catch {
		return null;
	}
}
async function unmanagedDuplicates(rootDir, tool, classes, ledgerPaths, carriedIds) {
	const scans = NATIVE_CONTENT_DIRS[tool].filter(([, cls]) => classes.has(cls)).map(async ([dir, cls]) => {
		const entries = await readDirEntries(join(rootDir, ...dir.split("/")));
		const paths = [];
		for (const entry of entries) {
			const isDirectory = entry.isDirectory();
			if (!carriedIds.has(nativeEntryId(entry.name, isDirectory))) continue;
			const path = `${dir}/${entry.name}`;
			if (!(isDirectory ? [...ledgerPaths].some((row) => row.startsWith(`${path}/`)) : ledgerPaths.has(path))) paths.push(path);
		}
		if (paths.length === 0) return [];
		return [{
			tool,
			cls,
			source: "unmanaged",
			files: paths.length,
			paths: paths.toSorted(),
			remedy: `not written by this engine; remove the file or keep it as an override under ${STATE_DIR}/overrides/`
		}];
	});
	return (await Promise.all(scans)).flat();
}
function escapeForRegExp(identity) {
	return identity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function matchedApmDependencies(apmYaml) {
	if (apmYaml === null) return [];
	let parsed;
	try {
		parsed = parse(apmYaml);
	} catch {
		return [];
	}
	const declared = parsed?.dependencies;
	const nested = declared?.apm;
	const list = Array.isArray(declared) ? declared : Array.isArray(nested) ? nested : [];
	const bounded = [repositorySlug(), packageName()].filter((identity) => identity !== null && identity !== "").map((identity) => new RegExp(`(?:^|[\\s"'/])${escapeForRegExp(identity)}(?:$|[#/\\s"'])`, "i"));
	const matched = [];
	for (const entry of list) {
		const text = typeof entry === "string" ? entry : typeof entry === "object" && entry !== null ? Object.values(entry).filter((value) => typeof value === "string").join(" ") : "";
		if (bounded.some((pattern) => pattern.test(text))) matched.push(sanitizeLabel(text));
	}
	return matched;
}
function apmDuplicates(matched, tool, classes) {
	if (matched.length === 0) return [];
	const deployable = [
		"agent",
		"skill",
		"command"
	].filter((cls) => classes.has(cls));
	const paths = matched.toSorted();
	return deployable.map((cls) => ({
		tool,
		cls,
		source: "apm",
		files: paths.length,
		paths,
		remedy: `the APM dependency ${matched.join(", ")} deploys the same classes; remove it from apm.yml and run apm install, or keep the plugin uninstalled`
	}));
}
function packSkillDirs(ledger) {
	const dirs = /* @__PURE__ */ new Set();
	for (const row of ledger) {
		if (!isPackOwner(row.adapter)) continue;
		const prefix = `${row.adapter.slice(PACK_OWNER_PREFIX.length)}/skills/`;
		if (!row.artifactId.startsWith(prefix)) continue;
		const rest = row.artifactId.slice(prefix.length);
		const slash = rest.indexOf("/");
		if (slash > 0) dirs.add(rest.slice(0, slash));
	}
	return dirs;
}
function isPackSkillRow(tool, path, packSkills) {
	return NATIVE_CONTENT_DIRS[tool].some(([dir, cls]) => {
		if (cls !== "skill" || !path.startsWith(`${dir}/`)) return false;
		const rest = path.slice(dir.length + 1);
		const slash = rest.indexOf("/");
		return slash > 0 && packSkills.has(rest.slice(0, slash));
	});
}
async function duplicatesForClient(rootDir, tool, classes, manifest, matchedApm, ledgerPaths, carriedIds, packSkills) {
	const findings = [];
	const ledgerRows = (manifest?.ledger ?? []).filter((row) => row.adapter === tool);
	const byClass = /* @__PURE__ */ new Map();
	for (const row of ledgerRows) {
		const cls = row.artifactType === "infra" ? row.path.startsWith(`${HOOKS_GENERATED_DIR}/${tool}/`) ? "hooks" : null : row.artifactType;
		if (cls === null || !classes.has(cls)) continue;
		if (cls === "skill" && isPackSkillRow(tool, row.path, packSkills)) continue;
		byClass.set(cls, [...byClass.get(cls) ?? [], row.path]);
	}
	for (const cls of PLUGIN_OWNED_CLASSES) {
		const paths = byClass.get(cls)?.toSorted();
		if (paths === void 0) continue;
		findings.push({
			tool,
			cls,
			source: "ledger",
			files: paths.length,
			paths,
			remedy: `${packageCommand("sync")}, then ${packageCommand("clean -y")}, then ${packageCommand(`plugin setup --client ${tool}`)}`
		});
	}
	if (tool === "claude" && classes.has("hooks")) findings.push(...await settingsHooksDuplicate(rootDir));
	findings.push(...apmDuplicates(matchedApm, tool, classes));
	findings.push(...await unmanagedDuplicates(rootDir, tool, classes, ledgerPaths, carriedIdsFor(carriedIds, classes)));
	return findings;
}
async function settingsHooksDuplicate(rootDir) {
	const raw = await readIfPresent$2(join(rootDir, ...CLAUDE_SETTINGS_PATH.split("/")));
	if (raw === null) return [];
	let parsed;
	try {
		parsed = JSON.parse(raw.startsWith("﻿") ? raw.slice(1) : raw);
	} catch {
		return [];
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return [];
	if (!Object.hasOwn(parsed, "hooks")) return [];
	return [{
		tool: "claude",
		cls: "hooks",
		source: "unmanaged",
		files: 1,
		paths: [CLAUDE_SETTINGS_PATH],
		remedy: `this client loads the file's own hooks key beside the plugin's hooks; remove the key — ${packageCommand("sync")} and ${packageCommand("clean")} both remove a stale repository-mode rendering by themselves, but clean also deletes every file this engine wrote and the whole .stamity/ directory, so sync is the one for this row — or keep personal rows in .claude/settings.local.json, the client's per-user project settings`
	}];
}
async function collectPluginDuplicates(rootDir, manifest) {
	const recorded = manifest?.plugin?.clients ?? {};
	const tools = TOOLS.filter((tool) => recorded[tool] !== void 0);
	if (tools.length === 0) return [];
	const ledgerPaths = new Set((manifest?.ledger ?? []).map((row) => row.path));
	const packSkills = packSkillDirs(manifest?.ledger ?? []);
	const [matchedApm, carriedIds] = await Promise.all([readIfPresent$2(join(rootDir, "apm.yml")).then(matchedApmDependencies), pluginCarriedIds(new Set(tools.flatMap((tool) => recorded[tool]?.classes ?? [])))]);
	return (await Promise.all(tools.map(async (tool) => {
		const classes = new Set(recorded[tool]?.classes ?? []);
		if (classes.size === 0) return [];
		return await duplicatesForClient(rootDir, tool, classes, manifest, matchedApm, ledgerPaths, carriedIds, packSkills);
	}))).flat();
}
//#endregion
//#region src/cli/engine/emissionWrite.ts
function sha256$1(content) {
	return createHash("sha256").update(content).digest("hex");
}
async function readIfExists(filePath) {
	try {
		return await readFile(filePath, "utf-8");
	} catch (err) {
		if (err?.code !== "ENOENT") throw err;
		return null;
	}
}
function outputWriteOptions(managedBody, engineVersion, force, rootDir, ledgerPaths, ledgerHashes) {
	const base = {
		version: engineVersion,
		force,
		backup: true,
		boundaryDir: rootDir,
		...ledgerPaths === void 0 ? {} : { ledgerPaths },
		...ledgerHashes === void 0 ? {} : { ledgerHashes }
	};
	return managedBody === null ? base : {
		...base,
		managedContent: managedBody,
		appendIfNoBlock: true
	};
}
function ledgerRowsForOutput(output, written, managedBody, engineVersion, coOwned) {
	const contentHash = sha256$1(written ?? output.content);
	const rows = [];
	for (const owner of outputOwners(output)) rows.push({
		path: output.path,
		adapter: owner.adapter,
		artifactId: owner.artifactId,
		artifactType: owner.artifactType,
		contentHash,
		...managedBody === null ? {} : { stampedVersion: engineVersion },
		...coOwned === void 0 ? {} : { coOwned: structuredClone(coOwned) }
	});
	return rows;
}
async function predictMcpDocumentMerge(absPath, relPath, emitted, selectedServers, packServers) {
	const refusal = await predictMcpMergeRefusal(absPath);
	if (refusal !== null) return {
		result: {
			path: absPath,
			action: "skipped",
			warning: refusal
		},
		refusal
	};
	const existing = await readIfExists(absPath);
	const { result } = planUserMcpJson(absPath, emitted, engineOwnedServerIds(relPath, selectedServers, existing, packServers), existing);
	return {
		result,
		refusal: null
	};
}
async function installedPackServers$1(rootDir, manifest) {
	return packMcpServers(await discoverInstalledPacks(rootDir, manifest), rootDir);
}
const CURSOR_GUARD_PATHS = [
	SUBAGENT_GUARD_PATH,
	MCP_GUARD_PATH,
	...LEGACY_CURSOR_GUARD_PATHS
];
function cursorGuardPathsFor(ledger, provenLegacy) {
	const recorded = new Set(ledger.map((row) => row.path));
	return [
		SUBAGENT_GUARD_PATH,
		MCP_GUARD_PATH,
		...LEGACY_CURSOR_GUARD_PATHS.filter((path) => recorded.has(path) && (provenLegacy === void 0 || provenLegacy.has(path)))
	];
}
const CURSOR_AGENT_ROW_DIR = ".cursor/agents/";
function releaseOneElevenGuardsFor(ledger, identity) {
	const agents = ledger.flatMap((row) => {
		const name = row.path.slice(15);
		return row.adapter === "cursor" && row.artifactType === "agent" && row.path.startsWith(CURSOR_AGENT_ROW_DIR) && !name.includes("/") && name.endsWith(".md") ? [name.slice(0, -3)] : [];
	});
	try {
		return render1110CursorGuards({
			agentIds: [...CURSOR_1_11_0_RUNTIME_AGENT_IDS, ...agents],
			...identity
		});
	} catch {
		return /* @__PURE__ */ new Map();
	}
}
const lineEndingSpellings = (text) => [text, text.replaceAll("\r\n", "\n")];
async function provenLegacyCursorGuards(rootDir, ledger, identity) {
	const recorded = LEGACY_CURSOR_GUARD_PATHS.filter((path) => ledger.some((row) => row.path === path));
	if (recorded.length === 0) return /* @__PURE__ */ new Set();
	const rendered = releaseOneElevenGuardsFor(ledger, identity);
	const proven = await Promise.all(recorded.map(async (path) => {
		let stats;
		try {
			stats = await lstat(resolve(rootDir, path));
		} catch (error) {
			return error.code === "ENOENT" ? path : null;
		}
		if (!stats.isFile()) return null;
		const expected = rendered.get(path);
		if (expected === void 0) return null;
		const text = await readFile(resolve(rootDir, path), "utf8").catch(() => null);
		return text !== null && lineEndingSpellings(text).includes(expected) ? path : null;
	}));
	return new Set(proven.filter((path) => path !== null));
}
function cursorEntryCommand(element) {
	if (element === null || typeof element !== "object" || Array.isArray(element)) return null;
	const command = element["command"];
	return typeof command === "string" ? command : null;
}
const RELEASE_ONE_ELEVEN_ENTRY_HASHES = new Set([...CURSOR_1_11_0_GUARD_ENTRIES.values()].map((pin) => memberHash(pin.entry)));
function withReleaseOneElevenGuardPins(spec) {
	const pinned = (claims) => (element, pointer) => {
		const command = cursorEntryCommand(element);
		const pin = command === null ? void 0 : [...CURSOR_1_11_0_GUARD_ENTRIES].find(([path]) => command.includes(path))?.[1];
		return (pin === void 0 || pointer === memberPointer(["hooks", pin.event]) && isDeepStrictEqual(element, pin.entry)) && claims(element, pointer);
	};
	return {
		...spec,
		elements: spec.elements.map((element) => ({
			...element,
			recognise: pinned((e, pointer) => element.recognise(e, pointer)),
			inBound: pinned((e, pointer) => element.inBound(e, pointer))
		}))
	};
}
function withoutReleaseOneElevenPinClaims(ownership) {
	const elements = ownership.record?.elements;
	if (ownership.record === null || elements === void 0) return ownership;
	const kept = Object.fromEntries(Object.entries(elements).map(([pointer, hashes]) => [pointer, hashes.filter((hash) => !RELEASE_ONE_ELEVEN_ENTRY_HASHES.has(hash))]));
	return {
		...ownership,
		record: {
			...ownership.record,
			elements: kept
		}
	};
}
function withoutPinClaims(lane) {
	return {
		...lane,
		predict: (absPath, emitted, ownership) => lane.predict(absPath, emitted, withoutReleaseOneElevenPinClaims(ownership)),
		materialize: (absPath, emitted, ownership) => lane.materialize(absPath, emitted, withoutReleaseOneElevenPinClaims(ownership)),
		reducer: (ownership, deleteWhenEngineOnly, rendered) => lane.reducer(withoutReleaseOneElevenPinClaims(ownership), deleteWhenEngineOnly, rendered)
	};
}
const sweepRefused = (entry) => entry.action === "skipped-unsafe-path" || entry.action === "skipped-user-content" && entry.refused === true;
function rowsCarriedThroughSweep(ledger, reclaimed, coOwned) {
	if (reclaimed === null) return [];
	const held = new Set(reclaimed.wiringKept?.flatMap((kept) => kept.scripts) ?? []);
	for (const entry of reclaimed.entries) if (coOwned.has(entry.path) && sweepRefused(entry) || entry.unproven === true) held.add(entry.path);
	return ledger.filter((row) => held.has(row.path) && VALID_TOOLS.has(row.adapter));
}
function hookDocumentLane(path, spec, rejects = () => null) {
	const plan = (absPath, emitted, ownership) => (existingRaw) => planCoOwnedJson(absPath, emitted, existingRaw, spec, ownership);
	return {
		path,
		noun: spec.noun,
		wiresHooks: true,
		predict: async (absPath, emitted, ownership) => {
			const prediction = await predictCoOwnedMerge(absPath, plan(absPath, emitted, ownership), spec.noun);
			const rejected = prediction.collision === null ? rejects(displayPath(absPath, ownership.boundaryDir), prediction.after ?? null) : null;
			return rejected === null ? prediction : {
				...prediction,
				rejected
			};
		},
		materialize: async (absPath, emitted, ownership) => {
			const result = await materializeCoOwned(absPath, plan(absPath, emitted, ownership), ownership, spec.noun);
			const rejected = rejects(displayPath(absPath, ownership.boundaryDir), result.writtenContent);
			return rejected === null ? result : {
				...result,
				warning: `${result.warning ?? ""} ${rejected}`.trim()
			};
		},
		reducer: (ownership, deleteWhenEngineOnly, rendered) => (content) => reduceCoOwnedJson(content, spec, {
			record: ownership.record,
			legacy: ownership.legacy,
			deleteWhenEngineOnly,
			...rendered === void 0 ? {} : { rendered }
		})
	};
}
function coOwnedDocumentLanes(manifest, packServers = [], ledger = manifest?.ledger ?? [], provenLegacy) {
	const claude = {
		path: CLAUDE_SETTINGS_PATH,
		noun: "settings document",
		wiresHooks: true,
		predict: predictClaudeSettingsMerge,
		materialize: materializeClaudeSettings,
		reducer: (ownership, deleteWhenEngineOnly, rendered) => claudeSettingsReclaimReducer({
			record: ownership.record,
			legacy: ownership.legacy,
			deleteWhenEngineOnly,
			...rendered === void 0 ? {} : { rendered }
		})
	};
	const cursorHooks = withoutPinClaims(hookDocumentLane(CURSOR_HOOKS_CONFIG_PATH, withReleaseOneElevenGuardPins(cursorHooksSpec({ guardPaths: cursorGuardPathsFor(ledger, provenLegacy) })), describeCursorHookDefects));
	const codexHooks = hookDocumentLane(CODEX_HOOKS_FILE, codexHooksSpec());
	const render = codexConfigTableRendering(packServers);
	const selected = manifest?.mcp?.servers ?? [];
	const codexNoun = "Codex configuration";
	const codexPlan = (absPath, emitted, ownership) => (existingRaw) => planCodexConfigToml(absPath, emitted, existingRaw, ownership, render, selected);
	const codexConfig = {
		path: CODEX_CONFIG_FILE,
		noun: codexNoun,
		wiresHooks: false,
		predict: async (absPath, emitted, ownership) => {
			const prediction = await predictCoOwnedMerge(absPath, codexPlan(absPath, emitted, ownership), codexNoun);
			const rejected = prediction.collision === null ? describeCodexHooksOff(displayPath(absPath, ownership.boundaryDir), prediction.after ?? null) : null;
			return rejected === null ? prediction : {
				...prediction,
				rejected
			};
		},
		materialize: (absPath, emitted, ownership) => materializeCoOwned(absPath, codexPlan(absPath, emitted, ownership), ownership, codexNoun),
		reducer: (ownership, deleteWhenEngineOnly) => (content) => reduceCodexConfigToml(content, {
			record: ownership.record,
			legacy: ownership.legacy,
			selected,
			render,
			deleteWhenEngineOnly
		})
	};
	return /* @__PURE__ */ new Map([
		[claude.path, claude],
		[cursorHooks.path, cursorHooks],
		[codexHooks.path, codexHooks],
		[codexConfig.path, codexConfig]
	]);
}
function unionRecords(a, b) {
	const members = {
		...a.members,
		...b.members
	};
	const elements = { ...a.elements };
	for (const [pointer, hashes] of Object.entries(b.elements ?? {})) elements[pointer] = [.../* @__PURE__ */ new Set([...elements[pointer] ?? [], ...hashes])];
	const preexisting = [.../* @__PURE__ */ new Set([...a.preexisting ?? [], ...b.preexisting ?? []])];
	return {
		...Object.keys(members).length > 0 ? { members } : {},
		...Object.keys(elements).length > 0 ? { elements } : {},
		...preexisting.length > 0 ? { preexisting } : {},
		...a.createdFile === true || b.createdFile === true ? { createdFile: true } : {}
	};
}
function coOwnedOwnershipOf(ledger, path, opts = {}) {
	const rows = ledger.filter((row) => row.path === path);
	const recorded = rows.flatMap((row) => row.coOwned === void 0 ? [] : [row.coOwned]);
	const owned = rows.length > 0;
	const legacy = owned && recorded.length === 0;
	return {
		owned,
		legacy,
		record: recorded.length === 0 ? null : recorded.reduce(unionRecords),
		deleteWhenEngineOnly: legacy || recorded.some((row) => row.createdFile === true),
		...opts.ledgerHashes === void 0 ? {} : { ledgerHashes: opts.ledgerHashes },
		...opts.boundaryDir === void 0 ? {} : { boundaryDir: opts.boundaryDir }
	};
}
function coOwnedRowsCarriedThroughRefusal(ledger, path) {
	return ledger.flatMap((row) => row.path === path && VALID_TOOLS.has(row.adapter) ? [{
		...row,
		adapter: row.adapter
	}] : []);
}
function coOwnedHookDocuments(manifest, packServers = []) {
	return new Set([...coOwnedDocumentLanes(manifest, packServers).values()].filter((lane) => lane.wiresHooks).map((lane) => lane.path));
}
function hookScriptRetention(manifest, packServers = []) {
	return {
		hookDocuments: /* @__PURE__ */ new Set([...coOwnedHookDocuments(manifest, packServers), COPILOT_HOOKS_PATH]),
		hookScripts: hookScriptReader(CURSOR_GUARD_PATHS)
	};
}
function coOwnedReclaimReducers(manifest, packServers = [], renderings = /* @__PURE__ */ new Map(), provenLegacy) {
	const reducers = mcpReclaimReducers(packServers);
	for (const lane of coOwnedDocumentLanes(manifest, packServers, manifest.ledger, provenLegacy).values()) {
		const ownership = coOwnedOwnershipOf(manifest.ledger, lane.path);
		reducers.set(lane.path, lane.reducer(ownership, ownership.deleteWhenEngineOnly, renderings.get(lane.path)));
	}
	return reducers;
}
const DEFAULT_USER_HOOKS_DIR$1 = `${STATE_DIR}/hooks`;
async function coOwnedReclaimRenderings(rootDir, manifest) {
	const rendered = [
		[
			"claude",
			CLAUDE_SETTINGS_PATH,
			(rows) => ({ hooks: claudeUserHookEntries(rows) })
		],
		[
			"cursor",
			CURSOR_HOOKS_CONFIG_PATH,
			(rows) => directHookRendering("cursor", rows)
		],
		[
			"codex",
			CODEX_HOOKS_FILE,
			(rows) => directHookRendering("codex", rows)
		]
	].filter(([tool]) => !isPluginOwned(manifest, tool, "hooks"));
	if (rendered.length === 0) return /* @__PURE__ */ new Map();
	let read;
	try {
		read = await readHookDefinitions(resolve(rootDir, manifest.hooks?.userHooksDir ?? DEFAULT_USER_HOOKS_DIR$1), rootDir);
	} catch {
		return /* @__PURE__ */ new Map();
	}
	const rows = read.hooks;
	return rows.length === 0 ? /* @__PURE__ */ new Map() : new Map(rendered.map(([, path, render]) => [path, render(rows)]));
}
function fullCorpusSelection(index) {
	const items = {
		agent: [],
		skill: [],
		rule: [],
		command: []
	};
	for (const item of index.items) items[item.type].push(item.id);
	return { items };
}
async function engineRenderingsFor(rootDir, manifest, paths, planFor, legacyCursor) {
	const renderings = /* @__PURE__ */ new Map();
	const wanted = new Set([...paths].filter(needsRenderingProof));
	const legacy = LEGACY_CURSOR_GUARD_PATHS.filter((path) => wanted.delete(path));
	if (legacy.length > 0 && legacyCursor !== void 0) {
		const guards = releaseOneElevenGuardsFor(manifest.ledger, legacyCursor);
		for (const path of legacy) {
			const bytes = guards.get(path);
			if (bytes !== void 0) renderings.set(path, /* @__PURE__ */ new Set([sha256$1(bytes)]));
		}
	}
	if (wanted.size === 0) return { renderings };
	const clients = TOOLS.filter((tool) => manifest.tools.includes(tool) || manifest.ledger.some((row) => row.adapter === tool));
	const nestedCharters = clients.some(emitsPerPackage) ? [...wanted].filter((path) => path.endsWith(`/${OWNED_PATHS.charterFileName}`)) : [];
	let outputs;
	let charter;
	try {
		const [index, repoInfo] = await Promise.all([buildContentIndex(), analyzeRepo(rootDir)]);
		const setupClients = structuredClone(manifest);
		setupClients.tools = clients;
		setupClients.selection = fullCorpusSelection(index);
		setupClients.detected = summarizeDetection(repoInfo);
		delete setupClients.plugin;
		const plan = (planned) => withoutPolicyWarningPrint(() => ignoringPolicyDenialForProof(() => planFor(planned, { monorepoPackages: repoInfo.monorepoPackages })));
		outputs = await plan(setupClients);
		charter = outputs.find((output) => output.path === OWNED_PATHS.charterFileName);
		const decisions = setupClients.importChoice ?? [];
		const otherDecisions = decisions.filter((choice) => choice.path !== OWNED_PATHS.charterFileName);
		if (nestedCharters.length > 0 && otherDecisions.length !== decisions.length) {
			const undecided = structuredClone(setupClients);
			undecided.importChoice = otherDecisions;
			charter = (await plan(undecided)).find((output) => output.path === OWNED_PATHS.charterFileName);
		}
	} catch (error) {
		return {
			renderings,
			renderingsUnbuilt: (error instanceof Error ? error.message : String(error)).split("\n")[0] ?? ""
		};
	}
	const add = (path, content) => {
		const hashes = renderings.get(path) ?? /* @__PURE__ */ new Set();
		hashes.add(sha256$1(content));
		renderings.set(path, hashes);
	};
	for (const output of outputs) if (wanted.has(output.path)) add(output.path, output.content);
	if (charter !== void 0) for (const path of nestedCharters) add(path, charter.content);
	return { renderings };
}
async function syncRenderingsFor(rootDir, manifest, paths, planFor) {
	const renderings = /* @__PURE__ */ new Map();
	const wanted = new Set([...paths].filter(needsRenderingProof));
	if (wanted.size === 0) return renderings;
	let outputs;
	try {
		const [index, repoInfo] = await Promise.all([buildContentIndex(), analyzeRepo(rootDir)]);
		const setup = structuredClone(manifest);
		setup.selection = fullCorpusSelection(index);
		setup.detected = summarizeDetection(repoInfo);
		outputs = await withoutPolicyWarningPrint(() => planFor(setup, { monorepoPackages: repoInfo.monorepoPackages }));
	} catch {
		return renderings;
	}
	for (const output of outputs) {
		if (!wanted.has(output.path)) continue;
		const hashes = renderings.get(output.path) ?? /* @__PURE__ */ new Set();
		hashes.add(sha256$1(output.content));
		renderings.set(output.path, hashes);
	}
	return renderings;
}
//#endregion
//#region src/cli/commands/sync/engine.ts
const PREDICT_CONCURRENCY = 8;
const ACTION_OF = {
	created: "create",
	updated: "update",
	unchanged: "unchanged",
	skipped: "collision"
};
async function readOnDiskManifestVersion(rootDir) {
	try {
		const raw = await readFile(manifestPath(rootDir), "utf8");
		const version = JSON.parse(raw.startsWith("﻿") ? raw.slice(1) : raw)?.version;
		return typeof version === "string" ? version : null;
	} catch {
		return null;
	}
}
function plannedRows(outputs) {
	return outputs.flatMap((output) => outputOwners(output).map((owner) => ({
		path: output.path,
		adapter: owner.adapter,
		artifactId: owner.artifactId,
		artifactType: owner.artifactType
	})));
}
async function isSharedNameTarget(absPath) {
	try {
		return isSharedRegularFile(await lstat(absPath));
	} catch {
		return false;
	}
}
function sharedNameDetail(path) {
	return `An existing file occupies ${path} and it is a hard link — its contents carry a second name this tree cannot see, which may sit outside it. Sync will not overwrite it, and --force does not help: it routes the write through the backup lane, which refuses to copy shared bytes into the tree. Replace it with a regular file — copy the contents to a new file and move that over this name — or delete it and re-run to regenerate it.`;
}
function importDecisionDetail(path, decisions) {
	const mode = (decisions ?? []).findLast((decision) => decision.path === path)?.mode;
	return `${path} holds your text outside the engine's managed block, the shape a \`supplement\` import leaves, but the manifest records ${mode === void 0 ? "no decision" : `\`${mode}\``} for it, so sync would replace your text. Restore \`supplement\` for this path in ${STATE_DIR}/${MANIFEST_FILE}, or run ${packageCommand("init --force --import-config replace")} to replace it behind a verified .bak.`;
}
async function planOutputEntries(rootDir, outputs, engineVersion, ledgerPaths, mcpServers, packServers, coOwned, importDecisions) {
	const lanes = coOwned?.lanes ?? coOwnedDocumentLanes(null);
	const ledger = coOwned?.ledger ?? [];
	const ledgerHashes = ledgerHashIndex(rootDir, ledger);
	return pLimit(PREDICT_CONCURRENCY).map([...outputs], async (output) => {
		const absPath = join(rootDir, output.path);
		const managedBody = extractManagedBlock(output.content, absPath);
		const base = {
			path: output.path,
			adapter: output.owner.adapter,
			artifactId: output.owner.artifactId
		};
		if (output.sourceRefusal !== void 0) return {
			...base,
			action: "collision",
			collisionKind: output.sourceRefusal.kind,
			detail: output.sourceRefusal.message,
			refusedAtSource: true
		};
		if (managedBody !== null) {
			const refusal = await predictPreservedContentRefusal(absPath);
			if (refusal !== null) return {
				...base,
				action: "collision",
				collisionKind: refusal.kind,
				detail: refusal.message
			};
		}
		if (MERGED_MCP_JSON_PATHS.has(output.path)) {
			const predicted = await predictMcpDocumentMerge(absPath, output.path, output.content, mcpServers ?? [], packServers ?? []);
			if (predicted.refusal !== null) return {
				...base,
				action: "collision",
				collisionKind: "shared-name",
				detail: predicted.refusal
			};
			return {
				...base,
				action: ACTION_OF[predicted.result.action]
			};
		}
		const lane = lanes.get(output.path);
		if (lane !== void 0) {
			const predicted = await lane.predict(absPath, output.content, coOwnedOwnershipOf(ledger, output.path, {
				boundaryDir: rootDir,
				ledgerHashes
			}));
			if (predicted.collision !== null) return {
				...base,
				action: "collision",
				collisionKind: predicted.collision.kind,
				detail: predicted.collision.detail
			};
			return {
				...base,
				action: ACTION_OF[predicted.result.action],
				...predicted.rejected === void 0 ? {} : { rejected: predicted.rejected }
			};
		}
		const existing = await readIfExists(absPath);
		if (managedBody === null && existing !== null && OWNED_PATHS.importTargets.includes(output.path) && hasOwnerTextOutsideBlock(existing, absPath)) return {
			...base,
			action: "collision",
			collisionKind: "import-decision",
			detail: importDecisionDetail(output.path, importDecisions)
		};
		const action = predictMergeAction(existing, output.content, outputWriteOptions(managedBody, engineVersion, false, rootDir, ledgerPaths), absPath);
		if (action === "skipped") {
			if (await isSharedNameTarget(absPath)) return {
				...base,
				action: "collision",
				collisionKind: "shared-name",
				detail: sharedNameDetail(output.path)
			};
			return {
				...base,
				action: "collision",
				collisionKind: "unmanaged-name",
				detail: `An existing file occupies ${output.path} without STAMITY:BEGIN/END markers and the engine does not own its name, so sync will not overwrite it. Re-run with --force to overwrite after a verified .bak, or move the file aside.`
			};
		}
		return {
			...base,
			action: ACTION_OF[action]
		};
	});
}
async function planSync(rootDir, engineVersion, opts = {}) {
	const manifest = await readManifest$1(rootDir);
	if (manifest === null) throw new EngineError(`This repository is not initialised — run: ${packageCommand("init")}. Sync regenerates from ${manifestPath(rootDir)}, which does not exist yet.`, { code: "VALIDATION_ERROR" });
	const onDiskVersion = await readOnDiskManifestVersion(rootDir);
	const manifestMigrated = onDiskVersion !== null && onDiskVersion !== manifest.version;
	const [index, repoInfo] = await Promise.all([buildContentIndex(), analyzeRepo(rootDir)]);
	const detected = summarizeDetection(repoInfo);
	const planningManifest = structuredClone(manifest);
	planningManifest.selection = fullCorpusSelection(index);
	planningManifest.detected = detected;
	const planner = getEmissionPlanner();
	const { outputs, warnings } = await planner.planWithWarnings({
		rootDir,
		manifest: planningManifest,
		engineVersion,
		packageName: opts.packageName ?? packageName(),
		npmChannel: opts.npmChannel ?? hasNpmChannel(),
		...registryOption(opts),
		facts: { monorepoPackages: repoInfo.monorepoPackages }
	});
	const rows = toLedgerEntries(plannedRows(outputs));
	assertLedgerContainment(rows, rootDir);
	const packServers = await installedPackServers$1(rootDir, manifest);
	const entries = await planOutputEntries(rootDir, outputs, engineVersion, ledgerPathSet(rootDir, manifest.ledger.map((row) => row.path)), manifest.mcp?.servers ?? [], packServers, {
		lanes: coOwnedDocumentLanes(manifest, packServers, manifest.ledger, await provenLegacyCursorGuards(rootDir, manifest.ledger, legacyCursorIdentity$1())),
		ledger: manifest.ledger
	}, manifest.importChoice);
	return {
		manifest: planningManifest,
		entries,
		collisions: entries.filter((entry) => entry.action === "collision").map((entry) => entry.path),
		reclaim: computeReclaimCandidates([...manifest.ledger, ...rows], new Set(outputs.map((output) => output.path)), new Set(manifest.tools)),
		dirty: readWorkingTreeStatus(rootDir, opts.runner),
		manifestMigrated,
		plannerId: planner.id,
		outputs,
		warnings,
		engineVersion
	};
}
function tally(entries, action) {
	return entries.filter((entry) => entry.action === action).length;
}
async function previewReclaim(rootDir, plan, now, engineVersion = plan.engineVersion, opts = {}) {
	if (plan.reclaim.length === 0) return null;
	const packMcpSupply = await installedPackServers$1(rootDir, plan.manifest);
	const retention = hookScriptRetention(plan.manifest, packMcpSupply);
	const provenLegacy = await provenLegacyCursorGuards(rootDir, plan.manifest.ledger, legacyCursorIdentity$1());
	return sweepReclaimCandidates(plan.reclaim, {
		rootDir,
		consent: false,
		trustedExactPaths: trustedInfraPaths(plan.manifest.ledger),
		coOwnedPaths: coOwnedReclaimReducers(plan.manifest, packMcpSupply, await coOwnedReclaimRenderings(rootDir, plan.manifest), provenLegacy),
		...retention,
		hookDocumentsAfterWrite: await hookDocumentsAfterWrite(rootDir, plan, retention.hookDocuments, coOwnedDocumentLanes(plan.manifest, packMcpSupply, plan.manifest.ledger, provenLegacy), opts.force === true),
		...await reclaimRenderings(rootDir, plan, engineVersion),
		...now === void 0 ? {} : { now }
	});
}
async function reclaimRenderings(rootDir, plan, engineVersion) {
	if (engineVersion === void 0) return { renderings: /* @__PURE__ */ new Map() };
	return engineRenderingsFor(rootDir, plan.manifest, plan.reclaim.map((candidate) => candidate.entry.path), renderingPlanner(rootDir, engineVersion), legacyCursorIdentity$1());
}
function legacyCursorIdentity$1() {
	return {
		packageName: packageName(),
		npmChannel: hasNpmChannel()
	};
}
function renderingPlanner(rootDir, engineVersion) {
	return (manifest, facts) => getEmissionPlanner().plan({
		rootDir,
		manifest,
		engineVersion,
		packageName: packageName(),
		npmChannel: hasNpmChannel(),
		...registryOption({}),
		facts
	});
}
async function hookDocumentsAfterWrite(rootDir, plan, hookDocuments, lanes, force) {
	const ledgerHashes = ledgerHashIndex(rootDir, plan.manifest.ledger);
	const planned = plan.outputs.filter((output) => hookDocuments.has(output.path));
	const lands = await Promise.all(planned.map(async (output) => {
		const entries = plan.entries.filter((entry) => entry.path === output.path);
		if (entries.some((entry) => entry.action !== "collision")) return true;
		return force && entries.some(forceClears) && await forcedWriteLands(rootDir, output.path);
	}));
	const written = planned.filter((_output, index) => lands[index]);
	const texts = await Promise.all(written.map(async (output) => {
		const lane = lanes.get(output.path);
		if (lane === void 0) return [output.path, output.content];
		const predicted = await lane.predict(join(rootDir, output.path), output.content, coOwnedOwnershipOf(plan.manifest.ledger, output.path, {
			boundaryDir: rootDir,
			ledgerHashes
		}));
		return [output.path, predicted.after];
	}));
	return new Map(texts.flatMap(([path, text]) => typeof text === "string" ? [[path, text]] : []));
}
function forceClears(entry) {
	return entry.action === "collision" && entry.refusedAtSource !== true && (entry.collisionKind ?? "unmanaged-name") === "unmanaged-name";
}
async function forcedWriteLands(rootDir, path) {
	const absPath = join(rootDir, path);
	try {
		const entry = await lstat(absPath);
		if (!entry.isFile() || isSharedRegularFile(entry)) return false;
		await assertWriteTargetContained(absPath, rootDir);
		return true;
	} catch {
		return false;
	}
}
async function rowsStillProvenOnDisk(rootDir, ledger, path) {
	const rows = ledger.filter((row) => row.path === path && row.contentHash !== void 0);
	if (rows.length === 0) return [];
	const absPath = join(rootDir, path);
	try {
		const entry = await lstat(absPath);
		if (!entry.isFile() || isSharedRegularFile(entry)) return [];
	} catch {
		return [];
	}
	const existing = await readIfExists(absPath);
	if (existing === null) return [];
	const hash = sha256$1(existing);
	const kept = [];
	for (const row of rows) {
		if (row.contentHash !== hash || !TOOLS.includes(row.adapter)) continue;
		kept.push({
			...row,
			adapter: row.adapter
		});
	}
	return kept;
}
const COLLISION_KIND_ORDER = [
	"unmanaged-name",
	"deny-scan",
	"shared-name",
	"linked-source",
	"import-decision",
	"co-owned-shape"
];
const COLLISION_REMEDY = {
	"unmanaged-name": () => `--force overwrites after a verified .bak, or move the file aside.`,
	"deny-scan": () => "A deny-scan collision is never force-overridable — fix the flagged text instead (see the plan entry's detail).",
	"shared-name": (paths) => `Hard link(s) at ${paths.join(", ")}: --force does not clear it and there is no flagged text to fix — the write is refused again either way, by the merge gate on a file the engine merges a managed block into, by the backup gate on one it writes whole, and the merged-MCP lane takes no backup at all, so force has nothing to unlock there. Replace each with a regular file (copy the contents to a new file and move that over the name), or delete it and re-run to regenerate it.`,
	"linked-source": (paths) => `${paths.join(", ")} repeat(s) another file that is a symbolic or hard link: --force does not clear it. Replace the linked file the plan entry's detail names with a regular file, then re-run.`,
	"import-decision": () => `An import-decision collision is never force-overridable — see the plan entry's detail.`,
	"co-owned-shape": (paths) => `${paths.join(", ")}: the engine adds its entries beside yours there and cannot read where they go; each plan entry's detail names the member and the fix. --force does not clear it.`
};
function refusalRemedyLines(plan, refused) {
	const lines = [];
	const atSource = new Set(plan.outputs.filter((output) => output.sourceRefusal !== void 0).map((output) => output.path));
	const byDecision = new Set(plan.entries.filter((entry) => entry.collisionKind === "import-decision").map((entry) => entry.path));
	const byShape = new Set(plan.entries.filter((entry) => entry.collisionKind === "co-owned-shape").map((entry) => entry.path));
	const unproven = refused.filter((path) => !atSource.has(path) && !byDecision.has(path) && !byShape.has(path));
	const sourceRefused = refused.filter((path) => atSource.has(path));
	const decisionRefused = refused.filter((path) => !atSource.has(path) && byDecision.has(path));
	const shapeRefused = refused.filter((path) => !atSource.has(path) && byShape.has(path));
	if (unproven.length > 0) lines.push(`${unproven.length} file(s) were NOT written — they collide with files the engine cannot prove it wrote (named above). Everything else in the plan is on disk. Move each aside and re-run, or re-run with --force to overwrite them after a verified .bak.`);
	if (sourceRefused.length > 0) lines.push(`${sourceRefused.length} file(s) were NOT written — ${sourceRefused.join(", ")} repeat(s) a file the engine refused to republish (the reason is named above). Everything else in the plan is on disk. --force does not clear this: repair that file as the warning says — a regular, unlinked file with no flagged text — then run sync.`);
	if (decisionRefused.length > 0) lines.push(`${decisionRefused.length} file(s) were NOT written — ${decisionRefused.join(", ")} hold(s) your text beside the engine's managed block, and the manifest's import decision would replace it (named above). Everything else in the plan is on disk. --force does not clear this: restore \`supplement\` for the path under importChoice in ${STATE_DIR}/${MANIFEST_FILE} and run sync, or run ${packageCommand("init --force --import-config replace")} to replace it behind a verified .bak.`);
	if (shapeRefused.length > 0) lines.push(`${shapeRefused.length} file(s) were NOT written — ${shapeRefused.join(", ")} hold(s) a member the engine writes its entries into with another type, or is not a JSON object it can merge beside (named above). Everything else in the plan is on disk. --force does not clear this: fix the member the warning names, or delete the file, then run sync.`);
	return lines;
}
function collisionRefusalMessage(plan) {
	const byKind = /* @__PURE__ */ new Map();
	for (const entry of plan.entries) {
		if (entry.action !== "collision") continue;
		const kind = entry.collisionKind ?? "unmanaged-name";
		byKind.set(kind, [...byKind.get(kind) ?? [], entry.path]);
	}
	const present = COLLISION_KIND_ORDER.filter((kind) => byKind.has(kind));
	const kinds = present.length > 0 ? present : ["unmanaged-name", "deny-scan"];
	return [`Sync refused: ${plan.collisions.length} existing file(s) would collide with generated output: ${plan.collisions.join(", ")}.`, ...kinds.map((kind) => COLLISION_REMEDY[kind](byKind.get(kind) ?? []))].join(" ");
}
async function applySync(rootDir, plan, opts) {
	const { engineVersion, force, dryRun } = opts;
	const now = opts.now ?? /* @__PURE__ */ new Date();
	const statePath = manifestPath(rootDir);
	const prospective = toLedgerEntries(plannedRows(plan.outputs));
	assertLedgerContainment(prospective, rootDir);
	if (dryRun) return {
		wrote: [],
		created: tally(plan.entries, "create"),
		updated: tally(plan.entries, "update"),
		unchanged: tally(plan.entries, "unchanged"),
		skipped: tally(plan.entries, "collision"),
		refused: [],
		gitignoreAdded: [],
		reclaimed: await previewReclaim(rootDir, plan, now, engineVersion, { force }),
		manifestPath: statePath,
		dryRun: true,
		manifest: null
	};
	const trustedPaths = trustedInfraPaths(plan.manifest.ledger);
	const packMcpSupply = await installedPackServers$1(rootDir, plan.manifest);
	const provenLegacy = await provenLegacyCursorGuards(rootDir, plan.manifest.ledger, legacyCursorIdentity$1());
	const coOwnedPaths = coOwnedReclaimReducers(plan.manifest, packMcpSupply, await coOwnedReclaimRenderings(rootDir, plan.manifest), provenLegacy);
	const refused = force ? /* @__PURE__ */ new Set([...plan.outputs.filter((output) => output.sourceRefusal !== void 0).map((output) => output.path), ...plan.entries.filter((entry) => entry.collisionKind === "import-decision" || entry.collisionKind === "co-owned-shape").map((entry) => entry.path)]) : new Set(plan.collisions);
	const refusalMessage = refused.size > 0 ? collisionRefusalMessage(plan) : null;
	const importDecisionDetails = new Map(plan.entries.filter((entry) => entry.collisionKind === "import-decision" || entry.collisionKind === "co-owned-shape").map((entry) => [entry.path, entry.detail]));
	const gitignoreAdded = await ensureGitignoreEntry(rootDir);
	const ownedPaths = ledgerPathSet(rootDir, plan.manifest.ledger.map((row) => row.path));
	const ownedHashes = ledgerHashIndex(rootDir, plan.manifest.ledger);
	const coOwnedLanes = coOwnedDocumentLanes(plan.manifest, packMcpSupply, plan.manifest.ledger, provenLegacy);
	const wrote = [];
	const emitted = [];
	const selectedMcpServers = plan.manifest.mcp?.servers ?? [];
	for (const output of plan.outputs) {
		if (refused.has(output.path)) {
			wrote.push({
				path: output.path,
				action: "skipped",
				warning: `Skipped ${output.path}. ${output.sourceRefusal?.message ?? importDecisionDetails.get(output.path) ?? refusalMessage ?? ""}`.trim()
			});
			if (output.sourceRefusal !== void 0) emitted.push(...await rowsStillProvenOnDisk(rootDir, plan.manifest.ledger, output.path));
			else if (coOwnedLanes.has(output.path)) emitted.push(...coOwnedRowsCarriedThroughRefusal(plan.manifest.ledger, output.path));
			continue;
		}
		const absPath = join(rootDir, output.path);
		const managedBody = extractManagedBlock(output.content, absPath);
		let result;
		let written = null;
		let coOwnedRecord;
		const coOwnedLane = coOwnedLanes.get(output.path);
		if (MERGED_MCP_JSON_PATHS.has(output.path)) {
			const existing = await readIfExists(absPath);
			const { writtenContent, ...merged } = await materializeUserMcpJson(absPath, output.content, engineOwnedServerIds(output.path, selectedMcpServers, existing, packMcpSupply));
			result = merged;
			if (writtenContent !== null) written = writtenContent;
		} else if (coOwnedLane !== void 0) {
			const { writtenContent, writtenRecord, ...merged } = await coOwnedLane.materialize(absPath, output.content, coOwnedOwnershipOf(plan.manifest.ledger, output.path, {
				boundaryDir: rootDir,
				ledgerHashes: ownedHashes
			}));
			result = merged;
			if (writtenContent !== null) written = writtenContent;
			if (writtenRecord !== null) coOwnedRecord = writtenRecord;
		} else result = await safeWriteFile(absPath, output.content, outputWriteOptions(managedBody, engineVersion, force, rootDir, ownedPaths, ownedHashes));
		wrote.push({
			...result,
			path: output.path
		});
		if (result.action === "skipped") {
			if (coOwnedLane !== void 0) emitted.push(...coOwnedRowsCarriedThroughRefusal(plan.manifest.ledger, output.path));
			continue;
		}
		emitted.push(...ledgerRowsForOutput(output, written, managedBody, engineVersion, coOwnedRecord));
	}
	const byTool = /* @__PURE__ */ new Map();
	for (const row of emitted) {
		const rows = byTool.get(row.adapter) ?? [];
		rows.push(row);
		byTool.set(row.adapter, rows);
	}
	let ledger = plan.manifest.ledger;
	for (const tool of TOOLS) ledger = replaceAdapterEntries(ledger, tool, toLedgerEntries(byTool.get(tool) ?? []));
	const reclaimed = plan.reclaim.length > 0 ? await sweepReclaimCandidates(plan.reclaim, {
		rootDir,
		consent: true,
		trustedExactPaths: trustedPaths,
		coOwnedPaths,
		...hookScriptRetention(plan.manifest, packMcpSupply),
		...await reclaimRenderings(rootDir, plan, engineVersion),
		now
	}) : null;
	ledger = [...ledger, ...rowsCarriedThroughSweep(plan.manifest.ledger, reclaimed, coOwnedPaths)];
	await ensureStateScaffold(rootDir);
	const manifest = {
		...plan.manifest,
		generatedBy: engineVersion,
		updatedAt: now.toISOString(),
		ledger
	};
	await writeManifest(rootDir, manifest, { now });
	const done = (action) => wrote.filter((result) => result.action === action).length;
	return {
		wrote,
		created: done("created"),
		updated: done("updated"),
		unchanged: done("unchanged"),
		skipped: done("skipped"),
		refused: [...refused],
		gitignoreAdded,
		reclaimed,
		manifestPath: statePath,
		dryRun: false,
		manifest
	};
}
//#endregion
//#region src/cli/commands/sync/report.ts
const MAX_FILE_LINES = 20;
const EMPTY_BUILD_LINE = "no generated outputs in this build yet — this manifest's content selection is empty, so there is nothing to emit; `stamity config` selects content";
function provenanceFromManifest(manifest) {
	const adapterRows = /* @__PURE__ */ new Map();
	const packRows = /* @__PURE__ */ new Map();
	for (const entry of manifest.ledger) {
		if (isPackOwner(entry.adapter)) {
			const packId = entry.adapter.slice(PACK_OWNER_PREFIX.length);
			packRows.set(packId, (packRows.get(packId) ?? 0) + 1);
			continue;
		}
		const rows = adapterRows.get(entry.adapter) ?? [];
		rows.push(entry);
		adapterRows.set(entry.adapter, rows);
	}
	const targetTools = new Set(manifest.tools);
	const perAdapter = [...manifest.tools, ...[...adapterRows.keys()].filter((owner) => !targetTools.has(owner))].map((adapter) => {
		const rows = adapterRows.get(adapter) ?? [];
		const stamps = new Set(rows.map((row) => row.stampedVersion));
		const [stamp] = stamps;
		return {
			adapter,
			files: rows.length,
			stampedVersion: stamps.size === 1 && stamp !== void 0 ? stamp : null
		};
	});
	return {
		generatedBy: manifest.generatedBy,
		updatedAt: manifest.updatedAt,
		manifestVersion: manifest.version,
		perAdapter,
		packs: [...packRows].map(([packId, files]) => ({
			packId,
			files
		}))
	};
}
function provenanceSource(plan, report) {
	return report.manifest ?? plan.manifest;
}
function isEmptyBuild(plan) {
	return plan.entries.length === 0 && countSelectionItems(plan.manifest.selection) === 0;
}
function paintAction(action, palette) {
	if (action === "create") return palette.green(action);
	if (action === "collision") return palette.yellow(action);
	if (action === "unchanged" || action === "skipped") return palette.dim(action);
	return palette.cyan(action);
}
const WROTE_TOKEN = {
	created: "create",
	updated: "update",
	unchanged: "unchanged",
	skipped: "skipped"
};
function fileLines(rows) {
	if (rows.length <= MAX_FILE_LINES) return [...rows];
	return [...rows.slice(0, MAX_FILE_LINES), `  … and ${rows.length - MAX_FILE_LINES} more`];
}
function salvagedEntries(report) {
	return (report.reclaimed?.entries ?? []).filter((entry) => entry.action === "skipped-user-content" || entry.action === "skipped-unsafe-path").map((entry) => entry.path);
}
function carriedPaths(plan, report) {
	const rows = rowsCarriedThroughSweep(plan.manifest.ledger, report.reclaimed, coOwnedReclaimReducers(plan.manifest));
	return new Set(rows.map((row) => row.path));
}
function salvageLines(plan, report, palette) {
	const kept = salvagedEntries(report);
	if (kept.length === 0) return [];
	const carried = carriedPaths(plan, report);
	const stays = kept.filter((path) => carried.has(path));
	const yours = kept.filter((path) => !carried.has(path));
	const group = (paths, heading) => paths.length === 0 ? [] : [palette.yellow(heading), ...fileLines(paths.map((path) => `    ${path}`))];
	return [...group(stays, report.dryRun ? `  ${stays.length} path(s) would stay on disk with their ledger rows kept — once you fix what each line above names, the next sync finishes the reclaim:` : `  ${stays.length} kept file(s) are still the engine's — their ledger rows stay, so once you fix what each line above names, the next sync finishes the reclaim:`), ...group(yours, report.dryRun ? `  ${yours.length} path(s) would stay on disk with their ledger rows dropped — nothing would reclaim them later:` : `  ${yours.length} kept file(s) are yours now — their ledger rows are dropped, so no sync or clean will touch them again:`)];
}
function pluginOwnedLines(manifest, palette) {
	return pluginOwnedSummary(manifest).map((row) => palette.dim(`plugin-owned  ${row.tool}: ${row.classes.join(", ")}`));
}
function provenanceLines(rollup, palette) {
	const lines = [palette.dim(`provenance (the manifest is the record): generated by ${rollup.generatedBy} · updated ${rollup.updatedAt} · schema ${rollup.manifestVersion}`)];
	for (const row of rollup.perAdapter) {
		const stamp = row.stampedVersion === null ? "" : ` (stamped v${row.stampedVersion})`;
		lines.push(palette.dim(`  ${row.adapter}: ${row.files} file(s)${stamp}`));
	}
	for (const pack of rollup.packs) lines.push(palette.dim(`  pack ${pack.packId}: ${pack.files} file(s)`));
	return lines;
}
function renderSyncReport(plan, report, palette) {
	const lines = [];
	if (isEmptyBuild(plan)) {
		lines.push(EMPTY_BUILD_LINE);
		lines.push(report.dryRun ? palette.dim("dry run: only the manifest refresh was previewed; nothing was written") : palette.dim(`manifest refreshed: ${report.manifestPath}`));
	} else if (report.dryRun) {
		lines.push(palette.bold(`plan: ${report.created} create, ${report.updated} update, ${report.unchanged} unchanged, ${report.skipped} collision`));
		const rows = plan.entries.filter((entry) => entry.action !== "unchanged").map((entry) => {
			const marker = entry.action === "collision" ? " (would refuse)" : "";
			const detail = entry.detail === void 0 ? "" : `\n      ${palette.dim(entry.detail)}`;
			return `  ${paintAction(entry.action, palette)}  ${entry.path}${marker}${detail}`;
		});
		lines.push(...fileLines(rows));
	} else {
		lines.push(palette.bold(`synced: ${report.created} created, ${report.updated} updated, ${report.unchanged} unchanged, ${report.skipped} skipped`));
		const rows = report.wrote.filter((result) => result.action !== "unchanged").map((result) => `  ${paintAction(WROTE_TOKEN[result.action], palette)}  ${result.path}`);
		lines.push(...fileLines(rows));
		for (const result of report.wrote) if (result.notice !== void 0) lines.push(`  ${result.notice}`);
		for (const result of report.wrote) if (result.warning !== void 0) lines.push(palette.yellow(`  warning: ${result.warning}`));
		const gitignoreAdded = report.gitignoreAdded ?? [];
		if (gitignoreAdded.length > 0) lines.push(`  .gitignore: added ${gitignoreAdded.join(", ")}`);
	}
	for (const warning of plan.warnings ?? []) lines.push(palette.yellow(`  warning: ${warning}`));
	if (report.reclaimed !== null) {
		const reclaimText = formatReclaimReport(report.reclaimed);
		if (reclaimText !== "") lines.push(reclaimText);
		lines.push(...salvageLines(plan, report, palette));
	}
	lines.push(...pluginOwnedLines(provenanceSource(plan, report), palette));
	lines.push(...provenanceLines(provenanceFromManifest(provenanceSource(plan, report)), palette));
	return lines.join("\n");
}
function syncJsonPayload(plan, report) {
	const reclaimed = report.reclaimed;
	return {
		dryRun: report.dryRun,
		plannerId: plan.plannerId,
		manifestMigrated: plan.manifestMigrated,
		manifestPath: report.manifestPath,
		emptyBuild: isEmptyBuild(plan),
		counts: {
			created: report.created,
			updated: report.updated,
			unchanged: report.unchanged,
			skipped: report.skipped,
			collisions: plan.collisions.length,
			reclaimCandidates: plan.reclaim.length,
			reclaimDeleted: reclaimed?.deletedCount ?? 0,
			reclaimStripped: reclaimed?.strippedCount ?? 0,
			reclaimSkipped: reclaimed?.skippedCount ?? 0,
			reclaimSalvaged: salvagedEntries(report).length
		},
		entries: plan.entries.map((entry) => ({ ...entry })),
		refused: [...report.refused],
		gitignoreAdded: [...report.gitignoreAdded ?? []],
		wrote: report.wrote.map((result) => ({ ...result })),
		warnings: [...plan.warnings ?? []],
		reclaim: structuredClone(reclaimed),
		provenance: provenanceFromManifest(provenanceSource(plan, report)),
		pluginOwned: pluginOwnedSummary(provenanceSource(plan, report)).map((row) => ({
			tool: row.tool,
			classes: [...row.classes]
		})),
		dirty: {
			available: plan.dirty.available,
			dirty: plan.dirty.dirty,
			changedCount: plan.dirty.changedCount
		}
	};
}
//#endregion
//#region src/cli/commands/check.ts
const STATE_SUBDIRS = ["learnings", "handoffs"];
const MANIFEST_DISPLAY = `${STATE_DIR}/${MANIFEST_FILE}`;
const MAX_DRIFT_LINES = 20;
const MAX_NAMES_INLINE = 5;
function checkNodeVersion(nodeVersion, range) {
	const id = "node-version";
	if (range === null) return {
		id,
		status: "warn",
		detail: `running on Node ${nodeVersion}; this build's package.json did not yield a readable engines.node range, so the version floor was not verified`
	};
	switch (judgeNodeFloor(nodeVersion, range)) {
		case "unparseable": return {
			id,
			status: "warn",
			detail: `Node reported the unparseable version ${nodeVersion}; expected a build in ${range}`
		};
		case "satisfies": return {
			id,
			status: "pass",
			detail: `Node ${nodeVersion} satisfies ${range}`
		};
		default: return {
			id,
			status: "fail",
			detail: `Node ${nodeVersion} is below the required ${range} — install a Node in that range (or switch to one with your version manager), then re-run`
		};
	}
}
function checkGit(rootDir) {
	const id = "git-available";
	const status = readWorkingTreeStatus(rootDir);
	if (!status.available && status.reason === "bare-layout") return {
		id,
		status: "warn",
		detail: "git was not started here — this folder, or a folder above it, has the layout of a bare repository (HEAD beside objects and refs, or beside commondir), met before any .git that git stops at, so the engine did not hand it to git. Look at the entries of this folder and of each folder above it by name to find that folder, and do not run git in it or in any folder under it, this one included. Two verbs need git: worktree refuses without it, and gate reads every change from it, so here gate scan exits 1 and /st-quick and /st-work list `secret scan: not run` under `Not done:`. Neither flow stops at this cause, and the git a flow's session and its sub-agents start is not set to refuse such a folder as the engine's is, so start no flow here until that folder is moved off this path. sync's dirty-tree warning simply stays silent while git does not answer."
	};
	if (!status.available && gitProgramFor(rootDir, process.env) === null) return {
		id,
		status: "warn",
		detail: "git did not answer here — the engine found no git to start. It takes git only from a PATH entry that is a full path to a folder other than this one, and no such entry holds a git binary: install git, or put the folder that holds it on PATH by its full path. Two verbs need git: worktree refuses without it, and gate reads every change from it, so here gate scan exits 1 and /st-quick and /st-work list `secret scan: not run` under `Not done:`. sync's dirty-tree warning simply stays silent while git does not answer."
	};
	if (!status.available) return {
		id,
		status: "warn",
		detail: "git did not answer here — the engine found a git binary on PATH, so this directory is not a repository, or git was only slow to answer this check. To tell which with no git command: a .git entry in this folder or in a folder above it, found by name, shows whether a repository is. Two verbs need git: worktree refuses without it, and gate reads every change from it, so with no repository gate scan exits 1 and /st-quick and /st-work list `secret scan: not run` under `Not done:`; where git was only slow, both verbs may still run. sync's dirty-tree warning simply stays silent while git does not answer."
	};
	return {
		id,
		status: "pass",
		detail: status.dirty ? `git reports ${status.changedCount} uncommitted change(s) — commit or stash first if you want the next sync's diff to stand alone` : "git reports a clean working tree"
	};
}
function checkManifest(state, app) {
	const id = "manifest";
	if (state.failure !== void 0) return {
		id,
		status: "fail",
		detail: state.failure
	};
	if (state.manifest === null) return {
		id,
		status: "fail",
		detail: `no ${MANIFEST_DISPLAY} — this repository is not initialised. Run: ${packageCommand("init")}`
	};
	const manifest = state.manifest;
	const skew = manifest.generatedBy === app.version ? "" : ` (last written by stamity ${manifest.generatedBy}; this build is ${app.version}, and the next sync restamps)`;
	const paths = new Set(manifest.ledger.map((row) => row.path)).size;
	return {
		id,
		status: "pass",
		detail: `${MANIFEST_DISPLAY} is valid — schema ${manifest.version}, tools ${manifest.tools.join(", ")}, ${paths} managed path(s) (${manifest.ledger.length} ledger rows across ${manifest.tools.length} client(s))${skew}`
	};
}
function checkStateDirs(rootDir) {
	const id = "state-dirs";
	const missing = STATE_SUBDIRS.filter((name) => !existsSync(join(rootDir, STATE_DIR, name)));
	if (missing.length === 0) return {
		id,
		status: "pass",
		detail: `${STATE_SUBDIRS.map((name) => `${STATE_DIR}/${name}`).join(", ")} are present`
	};
	return {
		id,
		status: "warn",
		detail: `missing ${missing.map((name) => `${STATE_DIR}/${name}`).join(", ")} — nothing is lost: the learnings and handoff stores recreate a directory on their first write, and ${packageCommand("sync")} rewrites them now`
	};
}
async function checkLearnings(rootDir, engine, manifest) {
	const id = "learnings";
	const { validation } = engine.learnings;
	const caps = validation.resolveLearningsCaps(manifest?.learnings?.maxCount);
	const result = await validation.validateLearningsDirectory(join(rootDir, STATE_DIR, "learnings"), caps);
	const total = result.valid.length + result.invalid.length + result.overCap.length;
	if (result.invalid.length === 0 && result.overCap.length === 0) return {
		id,
		status: "pass",
		detail: total === 0 ? "no learnings recorded yet" : `${total} learning(s), all valid`
	};
	const errorCount = result.invalid.reduce((sum, entry) => sum + entry.errors.length, 0);
	return {
		id,
		status: "warn",
		detail: `${result.invalid.length} of ${total} learning(s) carry ${errorCount} error(s), and ${result.overCap.length} sit past the ${caps.maxCount}-file cap (those will not load) — run ${packageCommand("validate")} for the per-file detail`
	};
}
async function checkChangeClasses(rootDir) {
	const id = "change-classes";
	let text;
	try {
		text = await readIfPresent$1(join(rootDir, CLASS_FILE));
	} catch (cause) {
		return {
			id,
			status: "warn",
			detail: `could not be checked: ${messageOf$1(cause)}`
		};
	}
	if (text === null) return null;
	const parsed = parseClassFile(text);
	if (parsed.ok) {
		const globs = parsed.rules.reduce((sum, rule) => sum + rule.paths.length, 0);
		return {
			id,
			status: "pass",
			detail: `${CLASS_FILE} is valid: ${globs} glob(s) across ${parsed.rules.length} class(es), ${parsed.testInputs.length} test-input entry(ies)`
		};
	}
	const [first = "refused", ...rest] = parsed.errors;
	const more = rest.length === 0 ? "" : ` (and ${rest.length} more)`;
	return {
		id,
		status: "fail",
		detail: `${CLASS_FILE} is invalid: ${sanitizeLabel(first)}${more} — from a base holding this copy, gate classify applies only its product, public-contract and security-sensitive entries, no lowering entry, and gives every change at least product; fix the entry the error names`
	};
}
async function checkTmpHygiene(rootDir, engine) {
	const id = "tmp-hygiene";
	const { atomicWrite } = engine.merge;
	const [risk, litter] = await Promise.all([atomicWrite.detectConcurrentWriteRisk(rootDir), atomicWrite.sweepOrphanTmpFiles(rootDir, { olderThanMs: Number.POSITIVE_INFINITY })]);
	if (risk !== null) return {
		id,
		status: "warn",
		detail: risk
	};
	if (litter.length === 0) return {
		id,
		status: "pass",
		detail: "no writer temp files left behind"
	};
	const names = litter.slice(0, MAX_NAMES_INLINE).map((entry) => repoPath$1(rootDir, entry.path));
	const overflow = litter.length > MAX_NAMES_INLINE ? `, and ${litter.length - MAX_NAMES_INLINE} more` : "";
	return {
		id,
		status: "warn",
		detail: `${litter.length} writer temp file(s) from interrupted writes are still on disk: ${names.join(", ")}${overflow} — check never deletes; remove them once no stamity run is in flight`
	};
}
async function checkEnvMcp(rootDir, engine, manifest) {
	const id = "env-mcp";
	const servers = manifest?.mcp?.servers ?? [];
	if (servers.length === 0) return {
		id,
		status: "pass",
		detail: "no MCP servers selected, so no credentials are required"
	};
	const file = engine.mcp.env.ENV_MCP_FILE;
	const raw = await readIfPresent$1(join(rootDir, file));
	if (raw === null) return {
		id,
		status: "warn",
		detail: `${servers.length} MCP server(s) selected but ${file} is absent — those servers start without credentials. ${packageCommand("config mcp add <id>")} recreates it with the names they need.`
	};
	const values = engine.mcp.env.parseEnvFile(raw);
	const reported = engine.mcp.env.reportEnvValues(values);
	const secrets = engine.mcp.secretScan.detectSecrets(values).findings.length;
	const held = secrets === 0 ? "" : `; ${secrets} value(s) match a known credential shape, as expected here`;
	const unfilled = reported.filter((value) => !value.set).map((value) => value.name);
	if (unfilled.length === 0) return {
		id,
		status: "pass",
		detail: `${file} fills all ${reported.length} credential(s) for ${servers.length} server(s)${held}`
	};
	const names = unfilled.slice(0, MAX_NAMES_INLINE).join(", ");
	const overflow = unfilled.length > MAX_NAMES_INLINE ? ", …" : "";
	return {
		id,
		status: "warn",
		detail: `${unfilled.length} of ${reported.length} credential(s) in ${file} are still empty (${names}${overflow}) — a server whose credential is blank fails at start-up${held}`
	};
}
function checkClaudeHookShell(manifest, host) {
	const id = "claude-hook-shell";
	if (host.platform !== "win32") return {
		id,
		status: "pass",
		detail: "not a Windows host: the client hands hook commands to sh, where the anchored commands parse (Git Bash is a Windows-only requirement)"
	};
	const targeted = (manifest?.tools ?? []).includes("claude");
	if (!targeted || isPluginOwned(manifest, "claude", "hooks")) return {
		id,
		status: "pass",
		detail: targeted ? "Claude's hooks are carried by its plugin, so no anchored hook row of this engine's is on disk" : "claude is not a target tool, so no anchored hook row is emitted"
	};
	const read = (pattern) => {
		const key = Object.keys(host.env).find((name) => pattern.test(name));
		return key === void 0 ? void 0 : host.env[key];
	};
	const pass = (where, note) => ({
		id,
		status: "pass",
		detail: `Git Bash at ${where}: the anchored hook commands parse there${note}`
	});
	const configured = (host.env["CLAUDE_CODE_GIT_BASH_PATH"] ?? "").trim();
	let ignored = "";
	if (configured !== "") {
		const kind = entryKind$1(configured);
		const name = (configured.split(/[\\/]/).at(-1) ?? "").toLowerCase();
		if (kind === "file" && HOOK_SHELL_NAMES.has(name)) return pass(`${configured}, named by CLAUDE_CODE_GIT_BASH_PATH`, "");
		ignored = ` (CLAUDE_CODE_GIT_BASH_PATH names ${configured}, which ${kind === "absent" ? "does not exist" : kind === "unreadable" ? "cannot be read" : kind === "other" ? "is not a file" : "is not named bash.exe, sh.exe, bash or sh"}, so the client ignores it and looks on as if it were unset — as does this row)`;
	}
	const programFiles = join(read(/^programfiles$/i) ?? "C:\\Program Files", "Git");
	const programFilesX86 = join(read(/^programfiles\(x86\)$/i) ?? "C:\\Program Files (x86)", "Git");
	for (const root of [programFiles, programFilesX86]) {
		const candidate = join(root, "bin", "bash.exe");
		if (existsSync(candidate)) return pass(`${candidate}, a default install location`, ignored);
	}
	const bare = [];
	const notes = [];
	for (const raw of (read(/^path$/i) ?? "").split(delimiter)) {
		const entry = raw.replace(/^"(.*)"$/, "$1");
		if (entry === "") continue;
		const git = join(entry, "git.exe");
		if (existsSync(git)) {
			const candidate = join(entry, "..", "bin", "bash.exe");
			if (existsSync(candidate)) return pass(`${candidate}, beside the git.exe on PATH at ${git}`, ignored);
			notes.push(`the git.exe on PATH at ${git}: this row found no bin\\bash.exe beside it (looked at ${candidate}); a shimmed or relocated git may still be resolved by the client — set CLAUDE_CODE_GIT_BASH_PATH to be sure`);
		}
		const bash = join(entry, "bash.exe");
		if (existsSync(bash)) bare.push(bash);
	}
	if (bare.length > 0) notes.unshift(`the client does not look for a bare bash.exe on PATH, so ${listed(bare)} ${bare.length === 1 ? "does" : "do"} not count`);
	return {
		id,
		status: "fail",
		detail: `the anchored hook commands need Git Bash on Windows; without it the pre-tool-use guard does not launch and the client does not block — the client falls back to PowerShell, which reads \${CLAUDE_PROJECT_DIR} as its own variable and does not parse the guard's fail-closed tail. Git Bash is in none of the three places the client looks, in its order: CLAUDE_CODE_GIT_BASH_PATH naming a file called bash.exe, sh.exe, bash or sh; bin\\bash.exe under the default install locations ${programFiles} and ${programFilesX86}; and bin\\bash.exe beside a git.exe on PATH. Install Git for Windows (Git Bash), or set CLAUDE_CODE_GIT_BASH_PATH to its bin\\bash.exe in the environment — this row reads the environment only, and a value in settings.json's env block reaches the client but not a shell that runs stamity check outside a Claude session. Then re-run check.${ignored}${notes.map((note) => ` (${note})`).join("")}`
	};
}
const HOOK_SHELL_NAMES = /* @__PURE__ */ new Set([
	"bash.exe",
	"sh.exe",
	"bash",
	"sh"
]);
function entryKind$1(path) {
	try {
		const stat = statSync(path, { throwIfNoEntry: false });
		if (stat === void 0) return "absent";
		return stat.isFile() ? "file" : "other";
	} catch {
		return "unreadable";
	}
}
function listed(items) {
	if (items.length <= 1) return items[0] ?? "";
	return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1] ?? ""}`;
}
function checkToolTraces(manifest) {
	const id = "tool-traces";
	const tools = manifest?.tools ?? [];
	if (tools.length === 0) return {
		id,
		status: "pass",
		detail: "no target tools recorded, so there is nothing to trace"
	};
	const emitted = new Set(manifest?.ledger.map((row) => row.adapter) ?? []);
	const unemitted = tools.filter((tool) => !emitted.has(tool));
	if (unemitted.length === 0) return {
		id,
		status: "pass",
		detail: `all ${tools.length} target tool(s) have emitted files recorded in the ledger`
	};
	return {
		id,
		status: "warn",
		detail: `nothing has been emitted for ${unemitted.join(", ")}, which the manifest targets — ${packageCommand("sync")} writes their files and records them`
	};
}
function normalizePreserved(content, start, end) {
	const chars = [];
	const lines = [];
	let line = 1;
	for (let i = 0; i < start; i++) if (content.charAt(i) === "\n") line++;
	let gap = false;
	for (let i = start; i < end; i++) {
		const ch = content.charAt(i);
		const at = line;
		if (ch === "\n") line++;
		if (/\s/.test(ch)) {
			gap = chars.length > 0;
			continue;
		}
		if (gap) {
			chars.push(" ");
			lines.push(at);
			gap = false;
		}
		chars.push(ch);
		lines.push(at);
	}
	return {
		text: chars.join(""),
		lines
	};
}
function findPreservedDuplicate(content, filePath, body) {
	const split = splitAtManagedBlock(content, filePath);
	if (split === null) return null;
	const needle = body.trim().replace(/\s+/g, " ");
	if (needle === "") return null;
	const afterStart = content.length - split.after.length;
	for (const slice of [normalizePreserved(content, 0, split.before.length), normalizePreserved(content, afterStart, content.length)]) {
		const at = slice.text.indexOf(needle);
		if (at !== -1) return slice.lines[at] ?? 1;
	}
	return null;
}
async function scanManagedFile(rootDir, path) {
	const content = await readIfPresent$1(join(rootDir, path));
	if (content === null || !hasManagedBlock(content, path)) return null;
	const body = extractManagedBlock(content, path);
	return {
		path,
		line: body === null ? null : findPreservedDuplicate(content, path, body)
	};
}
async function checkPreservedDuplicate(rootDir, manifest) {
	const id = "preserved-duplicate";
	const paths = [...new Set((manifest?.ledger ?? []).map((row) => row.path))];
	const scanned = (await Promise.all(paths.map((path) => scanManagedFile(rootDir, path)))).filter((entry) => entry !== null);
	const findings = scanned.flatMap((entry) => entry.line === null ? [] : [{
		path: entry.path,
		line: entry.line
	}]);
	const checked = scanned.length;
	if (checked === 0) return {
		id,
		status: "pass",
		detail: "no managed block is recorded in the ledger"
	};
	if (findings.length === 0) return {
		id,
		status: "pass",
		detail: `${checked} managed file(s) carry their block once`
	};
	const named = findings.slice(0, MAX_NAMES_INLINE).map((finding) => `${finding.path}:${finding.line}`).join(", ");
	const overflow = findings.length > MAX_NAMES_INLINE ? ` (and ${findings.length - MAX_NAMES_INLINE} more)` : "";
	return {
		id,
		status: "warn",
		detail: `${findings.length} of ${checked} managed file(s) repeat the managed block inside the preserved region, so this repository loads that content twice: ${named}${overflow} — delete the copy at each line; the block itself is regenerated on every sync`
	};
}
async function checkPackIntegrity(rootDir, manifest) {
	const id = "pack-integrity";
	if (manifest === null) return {
		id,
		status: "pass",
		detail: "no readable manifest, so no installed pack to verify"
	};
	const report = await verifyInstalledPacks(rootDir, manifest);
	if (report.checked === 0) return {
		id,
		status: "pass",
		detail: "no installed pack content is recorded in the ledger"
	};
	if (report.findings.length === 0) return {
		id,
		status: "pass",
		detail: `${report.checked} installed pack file(s) still match the hashes recorded at install`
	};
	await withReAddArgs(rootDir, manifest, report.findings);
	const shown = report.findings.slice(0, MAX_NAMES_INLINE).map(describePackIntegrityFinding);
	const overflow = report.findings.length > MAX_NAMES_INLINE ? ` (and ${report.findings.length - MAX_NAMES_INLINE} more)` : "";
	return {
		id,
		status: "fail",
		detail: `${report.findings.length} of ${report.checked} installed pack file(s) no longer match what was verified at install${overflow}: ${shown.join(" ")}`
	};
}
async function withReAddArgs(rootDir, manifest, findings) {
	const root = resolve(rootDir);
	const rows = manifest.ledger.filter((entry) => isPackOwner(entry.adapter) && entry.contentHash !== void 0);
	const packIds = [...new Set(findings.map((finding) => finding.packId))];
	const reAdds = new Map(await Promise.all(packIds.map(async (packId) => [packId, await readReAddArgs(root, packId, rows)])));
	for (const finding of findings) finding.reAdd = reAdds.get(finding.packId) ?? null;
}
const CATALOG_TIERS = /* @__PURE__ */ new Set(["curator-verified", "scanned"]);
async function readReAddArgs(root, packId, rows) {
	let rel;
	try {
		rel = receiptRelPath(packId);
	} catch {
		return null;
	}
	const row = rows.find((entry) => entry.path === rel);
	if (row === void 0) return null;
	let text;
	try {
		text = await readFile(join(root, ...rel.split("/")));
	} catch {
		return null;
	}
	if (createHash("sha256").update(text).digest("hex") !== row.contentHash?.toLowerCase()) return null;
	let receipt;
	try {
		receipt = JSON.parse(text.toString("utf8"));
	} catch {
		return null;
	}
	return reAddArgsOf(packId, receipt);
}
function reAddArgsOf(packId, receipt) {
	if (typeof receipt !== "object" || receipt === null) return null;
	const { source, trustTier } = receipt;
	if (typeof source !== "object" || source === null || typeof trustTier !== "string") return null;
	const { kind, spec } = source;
	if (typeof kind !== "string" || typeof spec !== "string" || spec === "") return null;
	if (CATALOG_TIERS.has(trustTier) || kind === "catalog-pinned") {
		const entry = lookupCatalogEntry(packId) ?? lookupCatalogEntry(spec);
		return entry === void 0 ? null : shellWord(entry.id);
	}
	if (kind !== "local-path" && kind !== "npm-package") return null;
	return `${shellWord(spec)}${trustTier === "pinned-unsigned" ? " --allow-untrusted" : ""}`;
}
function shellWord(word) {
	const clean = word.replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
	return /^[A-Za-z0-9@%+=:,./_-]+$/.test(clean) ? clean : `'${clean.replace(/'/g, "'\\''")}'`;
}
async function checkInvariants() {
	const id = "invariants";
	const charter = await readCharterTemplate();
	if (charter.invariants === null) return {
		id,
		status: "warn",
		detail: "the installed charter declares no `invariants_version`; it predates versioning"
	};
	return {
		id,
		status: "pass",
		detail: `invariants ${renderInvariantsVersion(charter.invariants)}`
	};
}
async function checkPluginRuntime(env, manifest) {
	const id = "plugin-runtime";
	const variable = pluginRootVariable(env);
	if (variable === void 0) {
		if (!(Object.keys(manifest?.plugin?.clients ?? {}).length > 0)) return {
			id,
			status: "pass",
			detail: "no plugin recorded and no plugin root in the environment"
		};
		return {
			id,
			status: "warn",
			detail: "no plugin root in the environment; run check through the installed root's locator (node <root>/runtime/locate.mjs -- check) or set PLUGIN_ROOT to that root"
		};
	}
	const root = (env[variable] ?? "").trim();
	const probe = await probePluginRuntime(root);
	if (probe.outcome === "timeout" || probe.outcome === "unreadable") return {
		id,
		status: "warn",
		detail: probe.message ?? "the locator answered nothing"
	};
	if (probe.outcome === "refused") return {
		id,
		status: Object.keys(manifest?.plugin?.clients ?? {}).length > 0 || readInstallMode(manifest) === "plugin-backed" ? "fail" : "warn",
		detail: `${variable}=${root}: ${probe.message ?? ""}`
	};
	const detail = `runtime ${probe.kind} ${probe.version ?? "unknown"} at ${probe.path ?? root}`;
	if (readInstallMode(manifest) === "plugin-backed") {
		const runtimeMajor = majorOf(probe.version);
		const stateMajor = majorOf(manifest?.generatedBy);
		if (runtimeMajor !== null && stateMajor !== null && runtimeMajor !== stateMajor) return {
			id,
			status: "fail",
			detail: `${detail}, but this repository's ${STATE_DIR}/ state was written by stamity ${manifest?.generatedBy ?? "an unrecorded version"} — major ${runtimeMajor} against major ${stateMajor}. Pin the plugin back to a ${stateMajor}.x release, or install the matching companion runtime, before the next sync rewrites anything.`
		};
	}
	return {
		id,
		status: "pass",
		detail
	};
}
async function checkPluginDuplicates(rootDir, manifest) {
	const id = "plugin-duplicates";
	const recorded = manifest?.plugin?.clients ?? {};
	if (TOOLS.every((tool) => recorded[tool] === void 0)) return {
		id,
		status: "pass",
		detail: "no client records a plugin, so nothing can duplicate"
	};
	const findings = await collectPluginDuplicates(rootDir, manifest);
	if (findings.length === 0) return {
		id,
		status: "pass",
		detail: "no duplicated classes"
	};
	const lines = findings.map((finding) => `${finding.tool}: ${finding.cls} (${finding.files} file(s), ${finding.source}) at ${describeDuplicatePaths(finding.paths)} — ${finding.remedy}`);
	return {
		id,
		status: readInstallMode(manifest) === "plugin-backed" ? "fail" : "warn",
		detail: lines.join("\n")
	};
}
async function checkPackReach(rootDir, manifest, engineVersion) {
	const id = "pack-reach";
	if (manifest === null) return {
		id,
		status: "pass",
		detail: "no readable manifest, so no installed pack to judge"
	};
	if (!manifest.ledger.some((row) => isPackOwner(row.adapter))) return {
		id,
		status: "pass",
		detail: "no installed pack is recorded in the ledger"
	};
	let reach;
	let denied = [];
	try {
		reach = (await withoutPolicyWarningPrint(() => getEmissionPlanner().planWithWarnings({
			rootDir,
			manifest,
			engineVersion,
			facts: { monorepoPackages: [] }
		}))).packReach ?? [];
		const resolved = new Set(reach.map((pack) => pack.packId));
		if (manifest.ledger.some((row) => isPackOwner(row.adapter) && !resolved.has(row.adapter.slice(5)))) denied = (await discoverInstalledPacksWithPolicy(rootDir, manifest)).denied;
	} catch (cause) {
		return {
			id,
			status: "warn",
			detail: `not evaluated: the emission plan could not be built (${sanitizeLabel(messageOf$1(cause).split("\n")[0] ?? "")}) — the drift gate below reports the cause in full`
		};
	}
	const silent = reach.filter((pack) => pack.artifacts.length > 0 && !pack.artifacts.some(reachesAClient));
	const failing = silent.filter((pack) => !pack.artifacts.some(isUnselected));
	const awaiting = silent.filter((pack) => pack.artifacts.some(isUnselected));
	const reaching = reach.filter((pack) => pack.artifacts.some(reachesAClient));
	const partial = reaching.flatMap((pack) => pack.artifacts.filter((artifact) => pluginDropsOf(artifact).length > 0).map((artifact) => describePartialDrop(pack.packId, artifact)));
	const unreached = reaching.flatMap((pack) => pack.artifacts.filter((artifact) => !reachesAClient(artifact) && pluginDropsOf(artifact).length === 0).map((artifact) => `pack "${sanitizeLabel(pack.packId)}": ${describeUnreached(artifact)}`));
	const inert = reach.filter((pack) => pack.artifacts.length === 0).map((pack) => `pack "${sanitizeLabel(pack.packId)}" ships nothing a client loads (no skill, agent, rule, command, accepted hook or MCP server)`);
	const warnings = [
		...denied.map(describeDeniedPack),
		...awaiting.map(describeAwaitingPack),
		...partial,
		...inert
	];
	const separator = "\n";
	if (failing.length > 0) return {
		id,
		status: "fail",
		detail: [
			...failing.map((pack) => describeSilentPack(pack, manifest.tools)),
			...warnings,
			...unreached
		].join(separator)
	};
	if (warnings.length > 0) return {
		id,
		status: "warn",
		detail: [...warnings, ...unreached].join(separator)
	};
	if (reaching.length === 0) return {
		id,
		status: "pass",
		detail: "no installed pack resolved for this plan"
	};
	const total = reaching.reduce((sum, pack) => sum + pack.artifacts.length, 0);
	const delivered = reaching.reduce((sum, pack) => sum + pack.artifacts.filter(reachesAClient).length, 0);
	return {
		id,
		status: "pass",
		detail: [delivered === total ? `${reaching.length} installed pack(s), ${total} artifact(s), each reaching a selected client` : `${reaching.length} installed pack(s), ${delivered} of ${total} artifact(s) reaching a selected client`, ...unreached].join("; ")
	};
}
function reachesAClient(artifact) {
	return artifact.reachedBy.length > 0;
}
function pluginDropsOf(artifact) {
	return artifact.dropped.flatMap((drop) => drop.reason === "plugin-owned" ? [drop.tool] : []);
}
function pluginOwnersPhrase(tools) {
	return tools.length === 1 ? `the ${tools[0]} plugin carries` : `the ${tools.slice(0, -1).join(", ")} and ${tools.at(-1)} plugins carry`;
}
function isUnselected(artifact) {
	return artifact.dropped.some((drop) => drop.reason === "not selected");
}
function describeUnreached(artifact) {
	const id = sanitizeLabel(artifact.id);
	const name = `${artifact.kind} ${id}`;
	const plugins = pluginDropsOf(artifact);
	if (plugins.length > 0) return `${name} — ${pluginOwnersPhrase(plugins)} the ${artifact.kind} class`;
	if (isUnselected(artifact)) return `${name} — not selected; ${packageCommand(`config mcp add ${id}`)} selects it`;
	return `${name} — its tools: list names only ${declaredToolsOf(artifact).join(", ")}`;
}
function declaredToolsOf(artifact) {
	return artifact.dropped.flatMap((drop) => drop.reason === "declares no selected client" ? drop.declared : []);
}
function describeSilentPack(pack, selected) {
	const packId = sanitizeLabel(pack.packId);
	const why = pack.artifacts.map(describeUnreached).join("; ");
	const declared = new Set(pack.artifacts.flatMap(declaredToolsOf));
	const widened = TOOLS.filter((tool) => selected.includes(tool) || declared.has(tool));
	const addClient = declared.size > 0 ? `, or add a client its tools: list names with ${packageCommand(`config set tools ${widened.join(",")}`)}, then ${packageCommand("sync")}` : "";
	const pluginNote = pack.artifacts.some((artifact) => pluginDropsOf(artifact).length > 0) ? ". While a client's plugin carries a class, this repository writes none of that class for it; only a pack's skills are exempt" : "";
	return `pack "${packId}" reaches no selected client: ${why}. Remove it with ${packageCommand(`clean --pack ${packId}`)}${addClient}${pluginNote}`;
}
function describeDeniedPack(pack) {
	const id = sanitizeLabel(pack.id);
	return `pack "${id}" is denied by the organisation's trust policy${pack.matchedRule === void 0 ? "" : ` (matched rule: ${sanitizeLabel(JSON.stringify(pack.matchedRule))})`}, so none of its content reaches a client. Remove it with ${packageCommand(`clean --pack ${id}`)}, or change ` + ORG_POLICY_REL_PATH;
}
function describeAwaitingPack(pack) {
	const why = pack.artifacts.map(describeUnreached).join("; ");
	return `pack "${sanitizeLabel(pack.packId)}" reaches no selected client until a server it supplies is selected: ${why}. Or remove it with ${packageCommand(`clean --pack ${sanitizeLabel(pack.packId)}`)}`;
}
function describePartialDrop(packId, artifact) {
	const plugins = pluginDropsOf(artifact);
	const reached = artifact.reachedBy.length > 0 ? `reaches ${artifact.reachedBy.join(", ")}` : "reaches no client";
	return `pack "${sanitizeLabel(packId)}": ${artifact.kind} ${sanitizeLabel(artifact.id)} is not written for ${plugins.join(", ")} (${pluginOwnersPhrase(plugins)} the ${artifact.kind} class); it ${reached}`;
}
async function runDoctor(rootDir, engine, app) {
	const state = await readManifestState$1(rootDir, engine);
	const { manifest } = state;
	const [range, learnings, tmpHygiene, envMcp, preservedDuplicate, packIntegrity, pluginRuntime, pluginDuplicates, packReach, changeClasses, invariants] = await Promise.all([
		requiredNodeRange(),
		guarded$1("learnings", () => checkLearnings(rootDir, engine, manifest)),
		guarded$1("tmp-hygiene", () => checkTmpHygiene(rootDir, engine)),
		guarded$1("env-mcp", () => checkEnvMcp(rootDir, engine, manifest)),
		guarded$1("preserved-duplicate", () => checkPreservedDuplicate(rootDir, manifest)),
		guarded$1("pack-integrity", () => checkPackIntegrity(rootDir, manifest)),
		guarded$1("plugin-runtime", () => checkPluginRuntime(app.runtime.env, manifest)),
		guarded$1("plugin-duplicates", () => checkPluginDuplicates(rootDir, manifest)),
		guarded$1("pack-reach", () => checkPackReach(rootDir, manifest, app.version)),
		checkChangeClasses(rootDir),
		guarded$1("invariants", checkInvariants)
	]);
	return [
		checkNodeVersion(process.versions.node, range),
		checkGit(rootDir),
		checkManifest(state, app),
		checkStateDirs(rootDir),
		learnings,
		tmpHygiene,
		envMcp,
		checkToolTraces(manifest),
		checkClaudeHookShell(manifest, {
			platform: process.platform,
			env: process.env
		}),
		preservedDuplicate,
		packIntegrity,
		pluginRuntime,
		pluginDuplicates,
		packReach,
		...changeClasses === null ? [] : [changeClasses],
		invariants
	];
}
async function runDriftGate(rootDir, engineVersion) {
	const plan = await planSync(rootDir, engineVersion);
	const preview = await previewReclaim(rootDir, plan);
	const changes = plan.entries.filter((entry) => entry.action !== "unchanged" || entry.rejected !== void 0);
	const missing = [];
	const seen = /* @__PURE__ */ new Set();
	for (const row of plan.manifest.ledger) {
		if (seen.has(row.path)) continue;
		seen.add(row.path);
		if (!existsSync(join(rootDir, row.path))) missing.push(row.path);
	}
	const reclaimPending = plan.reclaim.length;
	return {
		clean: changes.length === 0 && missing.length === 0 && reclaimPending === 0,
		changes,
		missing,
		reclaimPending,
		reclaim: (preview?.entries ?? []).map(reclaimPreviewOf)
	};
}
const PREVIEW_ACTION = {
	deleted: "delete",
	"managed-block-stripped": "strip",
	"co-owned-reduced": "reduce",
	"skipped-user-content": "keep",
	"skipped-unsafe-path": "refuse",
	"skipped-missing": "gone"
};
function reclaimPreviewOf(entry) {
	const acted = entry.action === "dry-run" ? entry.wouldBe ?? "deleted" : entry.action;
	return {
		path: entry.path,
		reason: entry.candidateReason,
		action: PREVIEW_ACTION[acted],
		...entry.proof === void 0 ? { why: entry.detail } : { proof: entry.proof }
	};
}
async function evaluateDrift(rootDir, engineVersion, manifestState) {
	if (manifestState.failure !== void 0) return {
		kind: "no-manifest",
		reason: manifestState.failure
	};
	if (manifestState.manifest === null) return {
		kind: "no-manifest",
		reason: `there is no ${MANIFEST_DISPLAY} to plan against — see the manifest row above`
	};
	try {
		return {
			kind: "evaluated",
			report: await runDriftGate(rootDir, engineVersion)
		};
	} catch (cause) {
		return {
			kind: "failed",
			code: cause instanceof EngineError ? cause.code : "FAILURE",
			reason: messageOf$1(cause)
		};
	}
}
function driftReportOf(outcome) {
	return outcome.kind === "evaluated" ? outcome.report : null;
}
const NOT_RUN_GATES = [
	"lint",
	"typecheck",
	"test"
];
const CHARTER_GATE_ROWS = [
	{
		key: "lint",
		kind: "lint"
	},
	{
		key: "typecheck",
		kind: "typecheck"
	},
	{
		key: "test",
		kind: "test"
	},
	{
		key: "all",
		kind: "full-gate"
	}
];
function resolveCharterGates(rootDir, manifest, gates, host) {
	const pinned = readGates(manifest);
	const detected = gates.verificationCommandsFor(manifest.detected);
	const values = gates.verificationGatesFor(manifest.detected, pinned);
	const absent = (key) => pinned[key] === void 0 && detected[key] === void 0;
	const unresolved = CHARTER_GATE_ROWS.filter(({ key }) => {
		return (key === "all" ? pinned.all === void 0 && NOT_RUN_GATES.every(absent) : absent(key)) || !commandResolves(values[key], rootDir, host);
	}).map(({ key, kind }) => ({
		kind,
		value: values[key]
	}));
	return {
		notRun: [...NOT_RUN_GATES],
		unresolved
	};
}
function commandResolves(command, rootDir, host) {
	const word = firstCommandWord(command);
	if (word === null) return false;
	const windows = host.platform === "win32";
	const extensions = (host.env["PATHEXT"] ?? ".COM;.EXE;.BAT;.CMD").split(";").filter((extension) => extension !== "").flatMap((extension) => [extension, extension.toLowerCase()]);
	const asWritten = /\.[^.]+$/.test(word) ? [word] : [];
	if (/[\\/]/.test(word)) {
		const target = resolve(rootDir, word);
		if (!windows) return isExecutableFile(target, constants.X_OK);
		return [...asWritten.length > 0 ? [target] : [], ...extensions.map((extension) => target + extension)].some((name) => isExecutableFile(name, constants.F_OK));
	}
	const pathKey = Object.keys(host.env).find((name) => windows ? /^path$/i.test(name) : name === "PATH");
	const pathEntries = (pathKey === void 0 ? "" : host.env[pathKey] ?? "").split(windows ? ";" : ":").map((entry) => entry.replace(/^"(.*)"$/, "$1")).filter((entry) => entry !== "");
	const nodeBin = join(rootDir, "node_modules", ".bin");
	const dirs = [
		nodeBin,
		join(rootDir, ".venv", "bin"),
		...pathEntries
	];
	if (!windows) return dirs.some((dir) => isExecutableFile(join(dir, word), constants.X_OK));
	return dirs.some((dir) => {
		return [
			...asWritten,
			...extensions.map((extension) => `${word}${extension}`),
			...dir === nodeBin ? [`${word}.cmd`] : []
		].some((name) => isExecutableFile(join(dir, name), constants.F_OK));
	});
}
function firstCommandWord(command) {
	const program = (command.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).find((word) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word));
	if (program === void 0) return null;
	const unquoted = program.replace(/^(["'])(.*)\1$/, "$2");
	return unquoted === "" ? null : unquoted;
}
function isExecutableFile(candidate, mode) {
	try {
		accessSync(candidate, mode);
		return statSync(candidate).isFile();
	} catch {
		return false;
	}
}
const STATUS_TOKEN = {
	pass: "ok  ",
	warn: "warn",
	fail: "fail"
};
function paintStatus(status, palette) {
	const token = STATUS_TOKEN[status];
	if (status === "pass") return palette.green(token);
	return status === "warn" ? palette.yellow(token) : palette.red(token);
}
function renderDoctor(ctx, doctor) {
	const width = Math.max(...doctor.map((row) => row.id.length));
	const continuation = `\n${" ".repeat(8 + width + 2)}`;
	ctx.io.out(`${ctx.palette.bold("doctor")}\n`);
	for (const row of doctor) ctx.io.out(`  ${paintStatus(row.status, ctx.palette)}  ${row.id.padEnd(width)}  ${row.detail.replaceAll("\n", continuation)}\n`);
}
function renderDrift(ctx, outcome) {
	const { palette } = ctx;
	if (outcome.kind === "no-manifest") {
		ctx.io.out(`\n${palette.yellow("drift: not evaluated")} — ${outcome.reason}\n`);
		return;
	}
	if (outcome.kind === "failed") {
		ctx.io.out(`\n${palette.red("drift: not evaluated")} — the plan could not be built, so nothing was compared and tampering with a generated file would NOT be detected by this run [${outcome.code}]: ${outcome.reason}\n`);
		return;
	}
	const drift = outcome.report;
	if (drift.clean) {
		ctx.io.out(`\n${palette.green("drift: clean")} — every generated file matches what a sync would write\n`);
		return;
	}
	ctx.io.out(`\n${palette.yellow("drift:")} ${drift.changes.length} file(s) would change, ${drift.missing.length} ledgered file(s) missing, ${drift.reclaimPending} queued for reclaim\n`);
	const rows = [
		...drift.changes.map((entry) => ({
			line: `  ${(entry.action === "unchanged" && entry.rejected !== void 0 ? "rejected" : entry.action).padEnd(9)} ${visibleText(entry.path)}`,
			bounded: true
		})),
		...drift.missing.map((path) => ({
			line: `  ${"missing".padEnd(9)} ${visibleText(path)}`,
			bounded: true
		})),
		...drift.reclaim.map((preview) => ({
			line: reclaimLine(preview),
			bounded: false
		}))
	];
	let shown = 0;
	let folded = 0;
	for (const row of rows) {
		if (row.bounded && shown >= MAX_DRIFT_LINES) {
			folded += 1;
			continue;
		}
		if (row.bounded) shown += 1;
		ctx.io.out(`${palette.dim(row.line)}\n`);
	}
	if (folded > 0) ctx.io.out(palette.dim(`  … and ${folded} more\n`));
}
function reclaimLine(preview) {
	const head = `  ${preview.action.padEnd(9)} ${visibleText(preview.path)}`;
	return preview.proof === void 0 ? `${head} — ${visibleText(preview.why ?? "")}` : `${head} (${preview.proof})`;
}
const BACKSLASH = "\\";
function visibleText(text) {
	return text.replace(UNPRINTABLE_CHARS, escapeCodePoint).replace(UNICODE_TAG_CHARS, escapeCodePoint);
}
function escapeCodePoint(char) {
	return `${BACKSLASH}u{${Number(char.codePointAt(0)).toString(16)}}`;
}
function renderProvenance(ctx, provenance) {
	const { palette } = ctx;
	if (provenance === null) {
		ctx.io.out(`\n${palette.dim("provenance: none — the manifest is the record, and there is no readable one")}\n`);
		return;
	}
	ctx.io.out(`\n${palette.dim(`provenance (the manifest is the record): generated by ${provenance.generatedBy} · updated ${provenance.updatedAt} · schema ${provenance.manifestVersion}`)}\n`);
	for (const row of provenance.perAdapter) {
		const stamp = row.stampedVersion === null ? "" : ` (stamped v${row.stampedVersion})`;
		ctx.io.out(palette.dim(`  ${row.adapter}: ${row.files} file(s)${stamp}\n`));
	}
	for (const pack of provenance.packs) ctx.io.out(palette.dim(`  pack ${pack.packId}: ${pack.files} file(s)\n`));
}
function collidingPaths(report) {
	return report.changes.filter((entry) => entry.action === "collision" && entry.refusedAtSource !== true && entry.collisionKind !== "import-decision" && entry.collisionKind !== "co-owned-shape").map((entry) => entry.path);
}
function coOwnedShapeSteps(report) {
	return report.changes.filter((entry) => entry.action === "collision" && entry.collisionKind === "co-owned-shape").map((entry) => `${entry.path}: ${entry.detail ?? ""}`);
}
function rejectedSteps(report) {
	return report.changes.flatMap((entry) => entry.rejected === void 0 ? [] : [entry.rejected]);
}
function importDecisionSteps(report) {
	return report.changes.filter((entry) => entry.action === "collision" && entry.collisionKind === "import-decision").map((entry) => entry.detail ?? "");
}
function sourceRefusedEntries(report) {
	return report.changes.filter((entry) => entry.action === "collision" && entry.refusedAtSource === true);
}
function sourceRefusalStep(entry) {
	return `${entry.path} is not written because the file it repeats was refused, so moving it aside or running ${packageCommand("sync --force")} does not clear it. ${entry.detail ?? ""} Once that file is repaired, run ${packageCommand("sync")}.`;
}
function hasNonCollisionDrift(report) {
	return report.changes.some((entry) => entry.action !== "collision" && entry.action !== "unchanged") || report.missing.length > 0 || report.reclaimPending > 0;
}
const MAX_COLLISIONS_INLINE = 3;
function collisionStep(paths) {
	const shown = paths.slice(0, MAX_COLLISIONS_INLINE).join(", ");
	const rest = paths.length - Math.min(paths.length, MAX_COLLISIONS_INLINE);
	const named = rest > 0 ? `${shown} (+${rest} more)` : shown;
	return `${paths.length} file(s) collide — the engine cannot prove it wrote ${named}, so a plain sync refuses them. Either move each aside and run ${packageCommand("sync")}, or run ${packageCommand("sync --force")} to overwrite them after a verified .bak. Running sync without one of those two changes nothing.`;
}
function renderNextSteps(ctx, doctor, outcome, ok, gates, leading = []) {
	const steps = [...leading];
	if (doctor.some((row) => row.id === "manifest" && row.status === "fail")) steps.push(`${packageCommand("init")} — this repository has no usable manifest`);
	if (doctor.some((row) => row.id === "pack-integrity" && row.status === "fail")) steps.push(`${packReinstallSteps("<id>", "any edited file the pack-integrity row names", "<source>", packageCommand)} — re-install the pack whose installed files no longer match, where <source> is the catalog id, local path or package name its install receipt records, as the row's finding line for that pack prints it; do not run sync first: it would carry the current bytes into the generated setup; clean --pack removes the pack's client copies itself and keeps and names any it cannot prove, and the sync after it regenerates the clients' files without the pack`);
	if (outcome.kind === "failed") steps.push(`fix what the drift line names, then re-run ${packageCommand("check")} — until the plan builds, no generated file is being compared against anything`);
	if (outcome.kind === "evaluated" && !outcome.report.clean) {
		const collisions = collidingPaths(outcome.report);
		steps.push(...collisions.length > 0 ? [collisionStep(collisions)] : [], ...sourceRefusedEntries(outcome.report).map(sourceRefusalStep), ...importDecisionSteps(outcome.report), ...coOwnedShapeSteps(outcome.report), ...rejectedSteps(outcome.report), ...hasNonCollisionDrift(outcome.report) ? [`${packageCommand("sync")} — regenerate the files that drifted`] : []);
	}
	if (steps.length === 0 && ok) {
		const unresolved = gates?.unresolved ?? [];
		if (unresolved.length > 0) ctx.io.out("\n");
		for (const gate of unresolved) ctx.io.out(`${ctx.palette.yellow(`warning: the ${gate.kind} gate cannot be resolved`)} — the charter says "${gate.value}"\n`);
		const warnings = doctor.filter((row) => row.status === "warn").length + unresolved.length;
		const notRun = `gates not run: ${NOT_RUN_GATES.join(", ")} (check runs no gate)`;
		ctx.io.out(warnings === 0 ? `\n${ctx.palette.green("setup green")} — ${notRun}\n` : `\n${ctx.palette.green("ok")} — ${warnings} advisory warning(s) above; ${notRun}\n`);
		return;
	}
	if (steps.length === 0) steps.push("read the failing row(s) above — this run is not green, so it exits 1 whatever the rows individually recommend");
	ctx.io.out("\nnext:\n");
	for (const [index, step] of steps.entries()) ctx.io.out(`  ${index + 1}. ${step}\n`);
}
async function readManifestState$1(rootDir, engine) {
	try {
		return { manifest: await engine.manifest.manifest.readManifest(rootDir) };
	} catch (cause) {
		return {
			manifest: null,
			failure: messageOf$1(cause)
		};
	}
}
async function readProvenance(rootDir, engine) {
	try {
		const manifest = await engine.manifest.manifest.readManifest(rootDir);
		return manifest === null ? null : provenanceFromManifest(manifest);
	} catch {
		return null;
	}
}
async function guarded$1(id, run) {
	try {
		return await run();
	} catch (cause) {
		return {
			id,
			status: "warn",
			detail: `could not be checked: ${messageOf$1(cause)}`
		};
	}
}
async function readIfPresent$1(path) {
	try {
		return await readFile(path, "utf8");
	} catch (cause) {
		const code = cause?.code;
		if (code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR") return null;
		throw cause;
	}
}
function repoPath$1(rootDir, absolute) {
	const rel = relative(rootDir, absolute);
	return rel === "" ? "." : rel.split(sep).join("/");
}
function messageOf$1(cause) {
	return cause instanceof Error ? cause.message : String(cause);
}
function evaluateExpectations(expected, manifest, runningVersion) {
	const report = { ok: true };
	if (expected.version !== void 0) {
		const generatedBy = manifest?.generatedBy ?? null;
		report.version = {
			expected: expected.version,
			running: runningVersion,
			generatedBy,
			ok: runningVersion === expected.version && generatedBy === expected.version
		};
	}
	if (expected.tools !== void 0) {
		const want = TOOLS.filter((tool) => expected.tools?.includes(tool));
		const recorded = manifest === null ? null : TOOLS.filter((tool) => manifest.tools.includes(tool));
		const missing = recorded === null ? [] : want.filter((tool) => !recorded.includes(tool));
		const extra = recorded === null ? [] : recorded.filter((tool) => !want.includes(tool));
		report.tools = {
			expected: want,
			recorded,
			missing,
			extra,
			ok: recorded !== null && missing.length === 0 && extra.length === 0
		};
	}
	if (expected.mode !== void 0) {
		const recorded = manifest === null ? null : readInstallMode(manifest);
		report.mode = {
			expected: expected.mode,
			recorded,
			ok: recorded === expected.mode
		};
	}
	report.ok = [
		report.version,
		report.tools,
		report.mode
	].every((field) => field?.ok !== false);
	return report;
}
function readExpectations(opts) {
	const expectations = {};
	const rawVersion = opts["expectVersion"];
	if (typeof rawVersion === "string") {
		const parsed = semver.parse(rawVersion);
		if (parsed === null) throw new CliFailure({
			code: "VALIDATION_ERROR",
			message: `--expect-version takes one exact version, got ${JSON.stringify(rawVersion)}`,
			why: "a range, a tag or an empty value names no single release, so no repository could match it",
			next: "pass the exact release, such as 1.12.0"
		});
		if (parsed.build.length > 0) throw new CliFailure({
			code: "VALIDATION_ERROR",
			message: `--expect-version takes one exact release without build metadata, got ${JSON.stringify(rawVersion)}`,
			why: "an expectation names one published release, and npm versions carry no build metadata",
			next: `pass the release without its build metadata, such as ${parsed.version}`
		});
		expectations.version = parsed.version;
	}
	const rawTools = opts["expectTools"];
	if (typeof rawTools === "string") expectations.tools = readExpectedTools(rawTools);
	const rawMode = opts["expectMode"];
	if (typeof rawMode === "string") expectations.mode = rawMode;
	return Object.keys(expectations).length === 0 ? null : expectations;
}
function readExpectedTools(raw) {
	const names = raw.split(",").map((name) => name.trim().toLowerCase()).filter((name) => name !== "");
	const unknown = [...new Set(names.filter((name) => !VALID_TOOLS.has(name)))];
	if (unknown.length > 0) throw new CliFailure({
		code: "VALIDATION_ERROR",
		message: `unknown tool(s) ${unknown.map((name) => JSON.stringify(name)).join(", ")}`,
		why: "--expect-tools names the clients the manifest must record, and this build ships no adapter for that id",
		next: `valid tools: ${TOOLS.join(", ")}`
	});
	const tools = TOOLS.filter((tool) => names.includes(tool));
	if (tools.length === 0) throw new CliFailure({
		code: "VALIDATION_ERROR",
		message: "--expect-tools named no tool",
		why: "a repository that targets no client is not one a caller can expect",
		next: `pass a comma-separated list of: ${TOOLS.join(", ")}`
	});
	return tools;
}
function expectationMismatches(report) {
	const lines = [];
	const { version, tools, mode } = report;
	if (version !== void 0 && version.generatedBy !== version.expected) lines.push(`generated by ${version.generatedBy ?? "nothing"}, expected ${version.expected}`);
	if (version !== void 0 && version.running !== version.expected) lines.push(`this check runs ${version.running}, expected ${version.expected}`);
	if (tools !== void 0 && !tools.ok) {
		const gaps = [...tools.missing.length > 0 ? [`${tools.missing.join(", ")} missing`] : [], ...tools.extra.length > 0 ? [`${tools.extra.join(", ")} not expected`] : []];
		lines.push(`clients ${(tools.recorded ?? []).join(", ") || "none"} — ${gaps.join(", ")}`);
	}
	if (mode !== void 0 && !mode.ok) lines.push(`mode ${mode.recorded ?? "none"}, expected ${mode.expected}`);
	return lines;
}
function expectationsRow(report, evaluated) {
	const id = "expectations";
	if (!evaluated) return {
		id,
		status: "fail",
		detail: "not evaluated: the manifest could not be read"
	};
	if (report.ok) return {
		id,
		status: "pass",
		detail: `${[
			...report.version === void 0 ? [] : [`release ${report.version.expected}`],
			...report.tools === void 0 ? [] : [`clients ${report.tools.expected.join(", ")}`],
			...report.mode === void 0 ? [] : [`mode ${report.mode.expected}`]
		].join(", ")} — as expected`
	};
	return {
		id,
		status: "fail",
		detail: expectationMismatches(report).join("; ")
	};
}
function pinnedCallAt(version, verb) {
	return packageCommandAt(version, verb);
}
function expectationSteps(report, manifestTools) {
	const steps = [];
	const { version, tools, mode } = report;
	const call = version === void 0 ? packageCommand : (verb) => pinnedCallAt(version.expected, verb);
	if (version !== void 0 && version.generatedBy !== version.expected) steps.push(`regenerate with the expected release in a reviewed pull request: ${pinnedCallAt(version.expected, "sync")}`);
	if (version !== void 0 && version.running !== version.expected) steps.push(`run this check with the expected release: ` + pinnedCallAt(version.expected, `check --expect-version ${version.expected}`));
	if (tools !== void 0 && !tools.ok) steps.push(`${call(`config set tools ${tools.expected.join(",")}`)}, then ${call("sync")}, in a reviewed pull request`);
	if (mode !== void 0 && !mode.ok) {
		const clients = (tools?.expected ?? manifestTools).join(",");
		const setup = mode.expected === "plugin-backed" ? call(`plugin setup --client ${clients}`) : call("init");
		steps.push(`a repository changes install mode only through ${call("sync")}, then ${call("clean -y")}, then ${setup}, in a reviewed pull request`);
	}
	return steps;
}
function expectationOutcome(expected, manifest, runningVersion) {
	const report = evaluateExpectations(expected, manifest, runningVersion);
	const evaluated = manifest !== null;
	const failed = evaluated && !report.ok;
	return {
		report,
		row: expectationsRow(report, evaluated),
		steps: failed ? expectationSteps(report, manifest.tools) : [],
		mismatches: failed ? expectationMismatches(report) : []
	};
}
const checkCommand = {
	name: "check",
	summary: "diagnose the environment and gate on drift between disk and the engine's output",
	mutating: false,
	configure(cmd) {
		cmd.option("--expect-version <semver>", "fail unless this exact release generated the repository and runs this check").option("--expect-tools <csv>", `fail unless the manifest's clients are exactly the listed ids, each one of ${TOOLS.join(", ")}`).addOption(new Option("--expect-mode <mode>", "fail unless the manifest records this install mode").choices([...INSTALL_MODES]));
	},
	async run(ctx, opts) {
		const rootDir = ctx.app.runtime.cwd;
		const expected = readExpectations(opts);
		const manifestState = await readManifestState$1(rootDir, ctx.engine);
		const [probes, drift, provenance] = await Promise.all([
			runDoctor(rootDir, ctx.engine, ctx.app),
			evaluateDrift(rootDir, ctx.app.version, manifestState),
			readProvenance(rootDir, ctx.engine)
		]);
		const expectations = expected === null ? null : expectationOutcome(expected, manifestState.manifest, ctx.app.version);
		const doctor = expectations === null ? probes : [...probes, expectations.row];
		const ok = !doctor.some((row) => row.status === "fail") && drift.kind === "evaluated" && drift.report.clean;
		const gates = manifestState.manifest === null ? null : resolveCharterGates(rootDir, manifestState.manifest, ctx.engine.detect.verificationGates, {
			platform: process.platform,
			env: ctx.app.runtime.env
		});
		renderDoctor(ctx, doctor);
		renderDrift(ctx, drift);
		renderProvenance(ctx, provenance);
		renderNextSteps(ctx, doctor, drift, ok, gates, expectations?.steps ?? []);
		const report = driftReportOf(drift);
		return {
			exitCode: ok ? 0 : 1,
			json: {
				doctor: [...doctor],
				drift: report === null ? null : {
					clean: report.clean,
					changes: report.changes.map((entry) => ({ ...entry })),
					missing: [...report.missing],
					reclaimPending: report.reclaimPending,
					reclaim: [...report.reclaim]
				},
				driftStatus: drift.kind,
				provenance,
				ownedPaths: OWNED_PATHS,
				...expectations === null ? {} : { expectations: expectations.report },
				...gates === null ? {} : { gates: {
					notRun: [...gates.notRun],
					unresolved: gates.unresolved.map((gate) => gate.kind)
				} },
				ok,
				...ok ? {} : { error: checkFailureDoc(doctor, drift, expectations) }
			}
		};
	}
};
function checkFailureDoc(doctor, drift, expectations = null) {
	if (expectations !== null && expectations.mismatches.length > 0) return {
		code: "EXPECTATION_ERROR",
		message: "check found the repository different from what its caller expects",
		why: expectations.mismatches.join("; "),
		next: expectations.steps.join("; ")
	};
	if (drift.kind === "failed") return {
		code: drift.code,
		message: "check could not evaluate drift: the sync plan failed to build",
		why: drift.reason,
		next: `fix the cause named in \`why\`, then re-run ${packageCommand("check")}`
	};
	const failing = doctor.filter((row) => row.status === "fail");
	const first = failing[0];
	if (first !== void 0) return {
		code: "VALIDATION_ERROR",
		message: `check failed ${failing.length} doctor probe(s): ${failing.map((row) => row.id).join(", ")}`,
		why: first.detail,
		next: "each failing row above states its own remedy"
	};
	const collisions = drift.kind === "evaluated" ? collidingPaths(drift.report) : [];
	const collisionSteps = [
		...collisions.length > 0 ? [collisionStep(collisions)] : [],
		...drift.kind === "evaluated" ? sourceRefusedEntries(drift.report).map(sourceRefusalStep) : [],
		...drift.kind === "evaluated" ? importDecisionSteps(drift.report) : [],
		...drift.kind === "evaluated" ? coOwnedShapeSteps(drift.report) : [],
		...drift.kind === "evaluated" ? rejectedSteps(drift.report) : []
	];
	return {
		code: "INTEGRITY_ERROR",
		message: "check found drift between the repository and what a sync would write",
		why: "one or more generated files differ from the engine's output, are missing, or are queued for reclaim",
		next: collisionSteps.length > 0 ? collisionSteps.join(" ") : `${packageCommand("sync")} — regenerate the files that drifted`
	};
}
//#endregion
//#region src/cli/commands/clean.ts
function cloneEntry(entry) {
	return { ...entry };
}
function planCleanCandidates(manifest) {
	return manifest.ledger.map((entry) => ({
		entry: cloneEntry(entry),
		reason: "adapter-removed"
	}));
}
async function cleanRenderings(rootDir, manifest, candidates, engineVersion) {
	const paths = candidates.map((candidate) => candidate.entry.path);
	const [proof, syncRenderings] = await Promise.all([engineRenderingsFor(rootDir, manifest, paths, cleanPlanner(rootDir, engineVersion), legacyCursorIdentity()), syncRenderingsFor(rootDir, manifest, paths, cleanPlanner(rootDir, engineVersion))]);
	return {
		...proof,
		syncRenderings
	};
}
function legacyCursorIdentity() {
	return {
		packageName: packageName(),
		npmChannel: hasNpmChannel()
	};
}
function cleanPlanner(rootDir, engineVersion, seen) {
	return async (setupClients, facts) => {
		const outputs = await getEmissionPlanner().plan({
			rootDir,
			manifest: setupClients,
			engineVersion,
			packageName: packageName(),
			npmChannel: hasNpmChannel(),
			...registryOption({}),
			facts
		});
		if (seen !== void 0) seen.paths = new Set(outputs.map((output) => output.path));
		return outputs;
	};
}
const PACK_CLASS_DIRS = {
	agents: "agent",
	skills: "skill",
	rules: "rule",
	commands: "command"
};
function packArtifactOf(relPath) {
	const segments = relPath.split("/");
	const type = PACK_CLASS_DIRS[segments[0] ?? ""];
	const name = segments[1];
	if (type === void 0 || name === void 0) return null;
	if (type === "skill") return segments.length >= 3 ? `${type}:${slugOf(name)}` : null;
	return segments.length === 2 && name.endsWith(".md") ? `${type}:${slugOf(name.slice(0, -3))}` : null;
}
async function packArtifacts(rootDir, manifest, packId) {
	const owner = packOwner(packId);
	const prefix = `${packId}/`;
	const rels = manifest.ledger.filter((row) => row.adapter === owner && row.artifactId.startsWith(prefix)).map((row) => row.artifactId.slice(prefix.length));
	const dir = join(rootDir, ...packDirRelPath(packId).split("/"));
	for (const classDir of Object.keys(PACK_CLASS_DIRS)) try {
		const entries = await readdir(join(dir, classDir), { withFileTypes: true });
		for (const entry of entries) rels.push(entry.isDirectory() ? `${classDir}/${entry.name}/SKILL.md` : `${classDir}/${entry.name}`);
	} catch {}
	return new Set(rels.map(packArtifactOf).filter((key) => key !== null));
}
function isPackArtifactRow(row, artifacts) {
	if (!CONTENT_CLASSES.includes(row.artifactType)) return false;
	const type = row.artifactType;
	const slug = slugOf(projectedNameOf(row.path));
	return applyCommandPrefix(slug, type) === row.artifactId && artifacts.has(`${type}:${slug}`);
}
function projectedNameOf(path) {
	const segments = path.split("/");
	const skillsAt = segments.indexOf("skills");
	return ((skillsAt >= 0 && skillsAt < segments.length - 1 ? segments[skillsAt + 1] : segments.at(-1)) ?? "").split(".")[0] ?? "";
}
async function findPackCopies(rootDir, manifest, packId, packRows, engineVersion) {
	const owner = packOwner(packId);
	const clientRows = manifest.ledger.filter((row) => TOOLS.includes(row.adapter) && needsRenderingProof(row.path));
	const installed = { paths: null };
	const proof = await engineRenderingsFor(rootDir, manifest, [...packRows.map((candidate) => candidate.entry.path), ...clientRows.map((row) => row.path)], cleanPlanner(rootDir, engineVersion, installed));
	const none = {
		rows: /* @__PURE__ */ new Set(),
		candidates: [],
		proof,
		unplanned: null,
		unexamined: null
	};
	if (clientRows.length === 0) return none;
	const removed = { paths: null };
	const withoutProof = await engineRenderingsFor(rootDir, {
		...manifest,
		ledger: manifest.ledger.filter((row) => row.adapter !== owner)
	}, clientRows.map((row) => row.path), cleanPlanner(rootDir, engineVersion, removed));
	const withoutPack = removed.paths;
	if (withoutPack === null) return {
		...none,
		unexamined: withoutProof.renderingsUnbuilt ?? "the plan could not be built"
	};
	const withPack = installed.paths;
	const artifacts = await packArtifacts(rootDir, manifest, packId);
	const rows = new Set(clientRows.filter((row) => !withoutPack.has(row.path) && (withPack?.has(row.path) === true || isPackArtifactRow(row, artifacts))));
	return {
		rows,
		candidates: [...rows].map((row) => ({
			entry: cloneEntry(row),
			reason: "deselected"
		})),
		proof,
		unplanned: withPack === null ? proof.renderingsUnbuilt ?? "the plan could not be built" : null,
		unexamined: null
	};
}
function installedPackIds(manifest) {
	const ids = /* @__PURE__ */ new Set();
	for (const entry of manifest.ledger) if (isPackOwner(entry.adapter)) ids.add(entry.adapter.slice(PACK_OWNER_PREFIX.length));
	return [...ids].toSorted();
}
async function exists(dir) {
	try {
		await stat(dir);
		return true;
	} catch {
		return false;
	}
}
const REINIT_OFFER = `start fresh: ${packageCommand("init")}`;
function pluginId() {
	return packageName().replace(/^@[^/]+\//, "");
}
function pluginUninstallCommands() {
	const id = pluginId();
	return {
		claude: `claude plugin uninstall ${id}@<your marketplace>`,
		cursor: `uninstall the ${id} plugin from Cursor's Customize view`,
		copilot: `copilot plugin uninstall ${id}`,
		codex: `codex plugin remove ${id}@<your marketplace>`
	};
}
function pluginUninstallLines(manifest) {
	const recorded = manifest.plugin?.clients ?? {};
	const commands = pluginUninstallCommands();
	return TOOLS.filter((tool) => recorded[tool] !== void 0).map((tool) => `  ${tool}: ${commands[tool]}`);
}
function nextSteps(ctx, steps) {
	ctx.io.out("\nnext:\n");
	for (const [index, step] of steps.entries()) ctx.io.out(`  ${index + 1}. ${step}\n`);
}
function nothingToClean(ctx) {
	ctx.io.out(`Nothing to clean — this repo has no ${STATE_DIR}/ manifest.\n`);
	nextSteps(ctx, [REINIT_OFFER]);
	return {
		exitCode: 0,
		json: {
			removed: 0,
			stripped: 0,
			skipped: 0,
			stateDirRemoved: false,
			entries: []
		}
	};
}
const STALE_NAMED = 3;
function refuseStaleRenderings(ctx, manifest, preview, rerun) {
	const stale = preview.entries.filter((entry) => entry.staleRendering === true).map((entry) => entry.path);
	if (stale.length === 0) return;
	const named = stale.slice(0, STALE_NAMED).join(", ") + (stale.length > STALE_NAMED ? ` and ${stale.length - STALE_NAMED} more` : "");
	const wroteBy = manifest.generatedBy === ctx.app.version ? "" : ` Version ${manifest.generatedBy} last wrote this setup.`;
	throw new CliFailure({
		code: "CLEAN_ERROR",
		message: `clean refused: ${stale.length} file(s) the ledger records as unedited differ from what this version renders there — ${named}`,
		why: `each still hashes to what the ledger records, but this version (${ctx.app.version}) renders other bytes at its path, so the delete cannot be proven and clean would leave the file behind.${wroteBy} Nothing was removed. A sync rewrites these paths, so if one of them is yours rather than the engine's, move it aside first.`,
		next: `run ${packageCommand("sync")} with this version first, then ${packageCommand(rerun)} — unless the pack-integrity row of ${packageCommand("check")} names an edited pack file, one that no longer hashes to what its install recorded: then do not run sync, which would carry the edited bytes into the clients' files; move that file out of the pack's directory first, as that row says, and run ${packageCommand(rerun)} again`
	});
}
async function confirmDestruction(ctx, strings) {
	if (ctx.yes) return;
	const gate = promptGate({
		stdinIsTTY: ctx.terminal.stdinIsTTY,
		yes: ctx.yes,
		json: ctx.json,
		env: ctx.app.runtime.env,
		palette: ctx.palette
	});
	if (!gate.interactive) throw new CliFailure({
		code: "CLEAN_ERROR",
		message: `clean refused: removing ${strings.refusedWhat} needs confirmation`,
		why: "stdin is not a terminal, so the confirmation prompt cannot be answered — and a destructive command never assumes yes",
		next: "re-run with -y to confirm, or run it from a terminal"
	});
	if (!await confirm(gate, ctx.promptIo, {
		question: strings.question,
		defaultYes: false
	})) throw new CliFailure({
		code: "CLEAN_ERROR",
		message: "clean cancelled — nothing was removed",
		why: "the confirmation was declined",
		next: "re-run and answer y, or pass -y to skip the prompt"
	});
}
async function removeStateDir(rootDir) {
	const target = join(rootDir, STATE_DIR);
	if (!await exists(target)) return false;
	try {
		await rm(target, {
			recursive: true,
			force: true
		});
	} catch (cause) {
		throw new CliFailure({
			code: "FS_ERROR",
			message: `generated files were removed, but ${STATE_DIR}/ could not be deleted`,
			why: cause instanceof Error ? cause.message : String(cause),
			next: `close anything holding ${STATE_DIR}/ open, then re-run stamity clean`
		});
	}
	return true;
}
async function installedPackMcpSupply(rootDir, manifest) {
	try {
		return await packMcpServers(await discoverInstalledPacks(rootDir, manifest), rootDir);
	} catch {
		return [];
	}
}
async function readTextOrNull(absPath) {
	try {
		return await readFile(absPath, "utf8");
	} catch (cause) {
		if (cause.code === "ENOENT") return null;
		throw cause;
	}
}
function sha256(content) {
	return createHash("sha256").update(content, "utf8").digest("hex");
}
const NOTHING_KEPT = /* @__PURE__ */ new Set();
function selectedServersOfPack(manifest, packId, supply) {
	const supplied = new Set(supply.filter((server) => server.sourcePackId === packId).map((server) => server.id));
	return (manifest.mcp?.servers ?? []).filter((id) => supplied.has(id));
}
async function removePackMcpEntries(rootDir, manifest, packId, supply, apply) {
	const deselected = selectedServersOfPack(manifest, packId, supply);
	const report = {
		deselected,
		rewritten: /* @__PURE__ */ new Map(),
		kept: [],
		refusals: []
	};
	if (deselected.length === 0) return report;
	const wanted = new Set(deselected);
	const perDoc = await Promise.all([...MERGED_MCP_JSON_PATHS].map(async (path) => {
		const absPath = join(rootDir, ...path.split("/"));
		try {
			const raw = await readTextOrNull(absPath);
			if (raw === null) return null;
			const owned = new Set([...engineOwnedServerIds(path, [], raw, supply)].filter((id) => wanted.has(id)));
			const result = apply ? await filterMcpJsonOnDisk(absPath, owned, NOTHING_KEPT) : filterMcpServers(raw, owned, NOTHING_KEPT);
			return result === null ? null : {
				path,
				result
			};
		} catch (cause) {
			return {
				path,
				refusal: `${path} could not be rewritten (${cause instanceof Error ? cause.message : String(cause)}), so it still holds ${deselected.join(", ")}. Remove the entry by hand.`
			};
		}
	}));
	const kept = /* @__PURE__ */ new Set();
	for (const outcome of perDoc) {
		if (outcome === null) continue;
		if ("refusal" in outcome) {
			report.refusals.push(outcome.refusal);
			continue;
		}
		const { path, result } = outcome;
		if (result.unparseable !== void 0) {
			report.refusals.push(`${path} is not valid JSON (${result.unparseable}), so which of its entries this repo wrote cannot be read — it was left untouched. Remove ${deselected.join(", ")} by hand.`);
			continue;
		}
		for (const id of result.preservedUserServers) if (wanted.has(id)) kept.add(id);
		if (apply && result.removed.length > 0) report.rewritten.set(path, result.content);
	}
	report.kept = [...kept].toSorted();
	return report;
}
function rehashRewritten(entry, rewritten) {
	const written = rewritten.get(entry.path);
	if (written === void 0 || entry.contentHash === void 0) return entry;
	return {
		...cloneEntry(entry),
		contentHash: sha256(written)
	};
}
function mcpSentence(mcp) {
	if (mcp.deselected.length === 0) return "";
	return `, takes its selected MCP server(s) (${mcp.deselected.join(", ")}) out of ${[...MERGED_MCP_JSON_PATHS].join(", ")} and out of the selection`;
}
async function runScopedClean(ctx, rootDir, manifest, packId) {
	const candidates = planPackRemoval(manifest, packId);
	if (candidates.length === 0) {
		const installed = installedPackIds(manifest);
		throw new CliFailure({
			code: "VALIDATION_ERROR",
			message: `no pack "${packId}" is installed — the ledger has no rows owned by ${packOwner(packId)}`,
			why: installed.length > 0 ? `installed pack(s): ${installed.join(", ")}` : "no packs are installed in this repo",
			next: installed.length > 0 ? "re-run with one of the installed pack ids" : "install one first: stamity add <pack-spec>"
		});
	}
	const packSupply = await installedPackMcpSupply(rootDir, manifest);
	const selectedFromPack = selectedServersOfPack(manifest, packId, packSupply);
	const copies = await findPackCopies(rootDir, manifest, packId, candidates, ctx.app.version);
	const alsoCopies = copies.rows.size === 0 ? "" : `, its ${copies.rows.size} client copy(ies)`;
	const swept = [...candidates, ...copies.candidates];
	const sweepOptions = {
		rootDir,
		trustedExactPaths: trustedInfraPaths(manifest.ledger),
		coOwnedPaths: coOwnedReclaimReducers(manifest, packSupply, await coOwnedReclaimRenderings(rootDir, manifest)),
		...hookScriptRetention(manifest, packSupply),
		...copies.proof,
		syncRenderings: await syncRenderingsFor(rootDir, manifest, copies.candidates.map((candidate) => candidate.entry.path), cleanPlanner(rootDir, ctx.app.version))
	};
	refuseStaleRenderings(ctx, manifest, await sweepReclaimCandidates(swept, {
		...sweepOptions,
		consent: false
	}), `clean --pack ${packId}`);
	if (!ctx.dryRun) {
		const alsoMcp = selectedFromPack.length === 0 ? "" : `, plus its selected MCP server(s) (${selectedFromPack.join(", ")}) in the client config files`;
		await confirmDestruction(ctx, {
			refusedWhat: `pack "${packId}" (${candidates.length} installed file(s)${alsoCopies})`,
			question: `Remove pack "${packId}" — ${candidates.length} installed file(s) under ${STATE_DIR}/${alsoCopies}, plus its ledger rows${alsoMcp}?`
		});
	}
	ctx.spinner.start(ctx.dryRun ? `Inspecting ${swept.length} path(s) of pack "${packId}"...` : `Removing ${swept.length} path(s) of pack "${packId}"...`);
	const mcp = await removePackMcpEntries(rootDir, manifest, packId, packSupply, !ctx.dryRun);
	const report = await sweepReclaimCandidates(swept, {
		...sweepOptions,
		consent: !ctx.dryRun
	});
	ctx.spinner.stop();
	const unproven = new Set(report.entries.filter((entry) => entry.unproven === true).map((entry) => entry.path));
	const droppedCopies = [...copies.rows].filter((row) => !unproven.has(row.path));
	let removedRows = 0;
	if (!ctx.dryRun) {
		const owner = packOwner(packId);
		const dropped = new Set(droppedCopies);
		const ledger = manifest.ledger.filter((entry) => entry.adapter !== owner && !dropped.has(entry)).map((entry) => rehashRewritten(entry, mcp.rewritten));
		removedRows = manifest.ledger.length - ledger.length;
		const mcpConfig = manifest.mcp === void 0 || mcp.deselected.length === 0 ? manifest.mcp : {
			...manifest.mcp,
			servers: manifest.mcp.servers.filter((id) => !mcp.deselected.includes(id))
		};
		await writeManifest(rootDir, {
			...manifest,
			ledger,
			...mcpConfig === void 0 ? {} : { mcp: mcpConfig }
		}, { now: ctx.app.runtime.clock.now() });
	}
	const formatted = formatReclaimReport(report);
	if (formatted !== "") ctx.io.out(`${formatted}\n`);
	const salvaged = report.entries.filter((entry) => (entry.action === "skipped-user-content" || entry.action === "skipped-unsafe-path") && entry.unproven !== true).length;
	const copyPaths = new Set(copies.candidates.map((candidate) => candidate.entry.path));
	const keptCopies = report.entries.filter((entry) => copyPaths.has(entry.path) && entry.action.startsWith("skipped")).map((entry) => entry.path);
	if (ctx.dryRun) {
		const copySentence = (droppedCopies.length === 0 ? "" : ` and the rows of its ${droppedCopies.length} client copy(ies)`) + (unproven.size === 0 ? "" : `, keeping the rows of the ${unproven.size} copy(ies) it could not judge`);
		ctx.io.out(`Dry run: nothing was written and the manifest still records the pack. A real run also drops its ${candidates.length} ledger row(s)${copySentence}${mcpSentence(mcp)} and leaves the rest of ${STATE_DIR}/ intact.\n`);
		nextSteps(ctx, [`apply it: ${packageCommand(`clean --pack ${packId}`)}`]);
	} else {
		ctx.io.out(`${ctx.palette.green(`Pack "${packId}" removed`)} — ${report.deletedCount} file(s) deleted, ${report.skippedCount} skipped, ${removedRows} ledger row(s) dropped.\n`);
		if (mcp.deselected.length > 0) ctx.io.out(`MCP: ${mcp.deselected.join(", ")} dropped from the selection${mcp.rewritten.size === 0 ? "" : ` and removed from ${[...mcp.rewritten.keys()].join(", ")}`}. Every entry those files hold that this repo did not write is untouched, and .env.mcp is yours — the credentials in it stay.\n`);
		if (mcp.kept.length > 0) ctx.io.out(`Kept your own definition of ${mcp.kept.join(", ")} — those entries no longer match what this repo renders for them, so they are yours now. Remove them by hand if you meant to.\n`);
		for (const refusal of mcp.refusals) ctx.io.out(`${refusal}\n`);
		if (salvaged > 0) ctx.io.out(`${salvaged} kept file(s) are user-owned now — their ledger rows are dropped, so no clean or sync will touch them again.\n`);
		if (copies.unplanned !== null && copies.rows.size > 0) {
			const unjudged = [...copies.rows].filter((row) => unproven.has(row.path)).length;
			ctx.io.out(`Pack "${packId}" could not be planned as installed (${copies.unplanned}), so none of its ${copies.rows.size} client copy(ies) can be proven the engine's: each is kept and named above. ${unjudged} of them, unedited since their recorded hash, keep their ledger rows; a copy you edited, or one whose row records no content hash, loses its row and is yours now.\n`);
		}
		if (copies.unexamined !== null) ctx.io.out(`The setup could not be planned without pack "${packId}" (${copies.unexamined}), so its client copies were not looked for: their rows stay.\n`);
		nextSteps(ctx, [...keptCopies.length === 0 ? [] : [`delete by hand each client copy kept above, unless it is yours: ${keptCopies.join(", ")}`], `regenerate the clients' files without the pack: ${packageCommand("sync")}`]);
	}
	return {
		exitCode: 0,
		json: {
			removed: report.deletedCount,
			stripped: report.strippedCount,
			skipped: report.skippedCount,
			stateDirRemoved: false,
			entries: report.entries,
			pack: packId,
			removedRows,
			mcpServersDeselected: mcp.deselected,
			mcpDocumentsRewritten: [...mcp.rewritten.keys()],
			mcpServersKept: mcp.kept
		}
	};
}
const cleanCommand = {
	name: "clean",
	summary: `remove every generated file and the ${STATE_DIR}/ state directory`,
	mutating: true,
	configure(cmd) {
		cmd.option("--pack <id>", "remove one installed pack — its files and ledger rows — and keep everything else");
	},
	async run(ctx, opts) {
		const rootDir = ctx.app.runtime.cwd;
		const packId = typeof opts["pack"] === "string" ? opts["pack"] : void 0;
		const manifest = await readManifest$1(rootDir);
		if (manifest === null) return nothingToClean(ctx);
		if (packId !== void 0) return await runScopedClean(ctx, rootDir, manifest, packId);
		const candidates = planCleanCandidates(manifest);
		const packSupply = await installedPackMcpSupply(rootDir, manifest);
		const sweepOptions = {
			rootDir,
			trustedExactPaths: trustedInfraPaths(manifest.ledger),
			coOwnedPaths: coOwnedReclaimReducers(manifest, packSupply, await coOwnedReclaimRenderings(rootDir, manifest), await provenLegacyCursorGuards(rootDir, manifest.ledger, legacyCursorIdentity())),
			...hookScriptRetention(manifest, packSupply),
			...await cleanRenderings(rootDir, manifest, candidates, ctx.app.version),
			setupRemoved: true
		};
		ctx.spinner.start(`Inspecting ${candidates.length} recorded path(s)...`);
		const preview = await sweepReclaimCandidates(candidates, {
			...sweepOptions,
			consent: false
		});
		ctx.spinner.stop();
		refuseStaleRenderings(ctx, manifest, preview, "clean -y");
		if (!ctx.dryRun) await confirmDestruction(ctx, {
			refusedWhat: `${candidates.length} generated file(s) and ${STATE_DIR}/`,
			question: `Remove ${candidates.length} generated file(s) and the ${STATE_DIR}/ state directory (learnings, handoffs and installed packs included)?`
		});
		let report = preview;
		if (!ctx.dryRun) {
			ctx.spinner.start(`Removing ${candidates.length} recorded path(s)...`);
			report = await sweepReclaimCandidates(candidates, {
				...sweepOptions,
				consent: true
			});
			ctx.spinner.stop();
		}
		const underStateDir = (path) => path.startsWith(`${STATE_DIR}/`);
		const wiringKept = (report.wiringKept ?? []).filter((doc) => doc.scripts.some(underStateDir));
		const stateDirKept = [...new Set(wiringKept.flatMap((doc) => doc.scripts.filter(underStateDir)))];
		const stateDirRemoved = ctx.dryRun || stateDirKept.length > 0 ? false : await removeStateDir(rootDir);
		const formatted = formatReclaimReport(report);
		if (formatted !== "") ctx.io.out(`${formatted}\n`);
		for (const doc of wiringKept) ctx.io.out(doc.unreadable === true ? `Kept ${STATE_DIR}/: ${doc.path} could not be read (a link, a hard link, or a file it cannot open), so nothing proves it no longer runs a hook script under it. Replace it with a regular file (or delete it), then re-run stamity clean.\n` : `Kept ${STATE_DIR}/: ${doc.path} still runs a hook script under it, so deleting it would leave that hook pointing at nothing. Remove that wiring, then re-run stamity clean.\n`);
		if (ctx.dryRun) {
			ctx.io.out(`Dry run: nothing was written and ${STATE_DIR}/ is untouched. A real run also deletes ${STATE_DIR}/ and everything in it.\n`);
			renderPluginUninstall(ctx, manifest);
			nextSteps(ctx, ["apply it: stamity clean"]);
		} else {
			ctx.io.out(`${ctx.palette.green("Clean complete")} — ${report.deletedCount} file(s) deleted, ${report.strippedCount} rewritten to keep user content, ${report.skippedCount} skipped${stateDirRemoved ? `, ${STATE_DIR}/ removed` : ""}.\n`);
			ctx.io.out("Left your .gitignore untouched — stale ignore lines are harmless.\n");
			renderPluginUninstall(ctx, manifest);
			nextSteps(ctx, [REINIT_OFFER]);
		}
		return {
			exitCode: 0,
			json: {
				removed: report.deletedCount,
				stripped: report.strippedCount,
				skipped: report.skippedCount,
				stateDirRemoved,
				...stateDirKept.length > 0 ? { stateDirKept } : {},
				entries: report.entries,
				pluginUninstall: pluginUninstallLines(manifest).map((line) => line.trim())
			}
		};
	}
};
function renderPluginUninstall(ctx, manifest) {
	const lines = pluginUninstallLines(manifest);
	if (lines.length === 0) return;
	ctx.io.out(`The plugin itself stays installed — it lives in your client, not in this repository, so this command neither removed it nor touched a file inside its root. Uninstall it with your client's own command:\n${lines.join("\n")}\n`);
}
//#endregion
//#region src/cli/commands/config/mcp.ts
const NEXT_SYNC_LINE = "next: run stamity sync to apply";
const NEXT_DRY_RUN_LINE = "next: re-run without --dry-run to apply, then run stamity sync";
async function requireSetupManifest(ctx, rootDir) {
	const manifest = await ctx.engine.manifest.manifest.readManifest(rootDir);
	if (manifest !== null) return manifest;
	throw new CliFailure({
		code: "CONFIG_ERROR",
		message: `no stamity setup found in ${rootDir}`,
		why: `${ctx.engine.manifest.manifest.manifestPath(rootDir)} does not exist`,
		next: "run stamity init to create one"
	});
}
function selectedServers(manifest) {
	return [...manifest.mcp?.servers ?? []];
}
function catalogIds(ctx) {
	return Object.keys(ctx.engine.mcp.catalog.CURATED_MCP_SERVERS);
}
async function installedPackServers(rootDir, manifest) {
	return packMcpServers(await discoverInstalledPacks(rootDir, manifest), rootDir);
}
function renderServers(servers) {
	return servers.length === 0 ? "none" : servers.join(", ");
}
async function readEnvValues(ctx, rootDir) {
	try {
		const raw = await readFile(join(rootDir, ctx.engine.mcp.env.ENV_MCP_FILE), "utf8");
		return ctx.engine.mcp.env.parseEnvFile(raw);
	} catch (error) {
		if (error.code === "ENOENT") return {};
		throw error;
	}
}
function envRowsFor(ctx, serverIds, values, packServers = []) {
	const required = ctx.engine.mcp.env.collectRequiredEnvVars(serverIds, packServers);
	const subset = {};
	for (const envVar of required) subset[envVar.name] = values[envVar.name] ?? "";
	return ctx.engine.mcp.env.reportEnvValues(subset).map((report) => ({
		name: report.name,
		set: report.set
	}));
}
function warnOnStoredSecrets(ctx, values) {
	const result = ctx.engine.mcp.secretScan.detectSecrets(values);
	if (result.clean) return;
	ctx.io.err(`${ctx.palette.yellow("warning:")} .env.mcp holds live credential values — it is gitignored; never commit it or inline a value into a client config.\n${ctx.engine.mcp.secretScan.formatSecretFindings(result)}\n`);
}
function packSupplyLine(packServers) {
	const ids = packServers.map((server) => server.id);
	return ids.length === 0 ? null : `installed packs: ${ids.join(", ")}`;
}
function labelFor(ctx, row) {
	if (row.curated) return row.id;
	if (row.pack !== null) return `${row.id} ${ctx.palette.dim(`(pack ${row.pack})`)}`;
	return `${row.id} ${ctx.palette.yellow("(not in catalog)")}`;
}
const MAX_LAUNCHER_CHARS = 160;
const RUNS_HEADING = "runs on this machine:";
const UNRESOLVED_LAUNCHER = "no command line — no curated row and no installed pack supplies this id";
const FULL_ARGV_LINE = "line elided — run with --json for the argv in full";
function launcherLine(command, args) {
	const flat = [command, ...args].join(" ").replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim();
	if (flat === "") return {
		text: "(declares no command)",
		elided: false
	};
	if (flat.length <= MAX_LAUNCHER_CHARS) return {
		text: flat,
		elided: false
	};
	return {
		text: `${flat.slice(0, 159)}…`,
		elided: true
	};
}
function transportNote(transport) {
	return transport === "stdio" ? "stdio — your editor spawns this argv as a child process, with your privileges" : "http — your editor spawns this argv locally as a bridge to a remote endpoint, with your privileges";
}
function packAuthoredNote(packId) {
	return `supplied by pack ${packId} — its description and blast-radius note are the pack author's words, not a review; the command line above is what runs`;
}
function renderLauncher(ctx, indent, meta, packId) {
	const { io, palette } = ctx;
	io.out(`${indent}${palette.bold(RUNS_HEADING)}\n`);
	if (meta === void 0) {
		io.out(`${indent}  ${palette.yellow(UNRESOLVED_LAUNCHER)}\n`);
		return;
	}
	const line = launcherLine(meta.command, meta.args);
	io.out(`${indent}  ${palette.yellow(line.text)}\n`);
	io.out(`${indent}  ${palette.dim(transportNote(meta.transport))}\n`);
	if (packId !== null) io.out(`${indent}  ${palette.dim(packAuthoredNote(packId))}\n`);
	if (line.elided) io.out(`${indent}  ${palette.dim(FULL_ARGV_LINE)}\n`);
}
function launcherPayload(meta) {
	if (meta === void 0) return null;
	return {
		command: meta.command,
		args: meta.args,
		transport: meta.transport
	};
}
async function runMcpList(ctx, rootDir) {
	const manifest = await requireSetupManifest(ctx, rootDir);
	const servers = selectedServers(manifest);
	const values = await readEnvValues(ctx, rootDir);
	const packServers = await installedPackServers(rootDir, manifest);
	const rows = servers.map((id) => {
		const meta = ctx.engine.mcp.catalog.resolveServerMeta(id, packServers);
		const supplier = packServers.find((server) => server.id === id);
		return {
			id,
			description: meta?.description ?? null,
			curated: meta !== void 0 && supplier === void 0,
			pack: supplier?.sourcePackId ?? null,
			meta,
			launcher: launcherPayload(meta),
			env: envRowsFor(ctx, [id], values, packServers)
		};
	});
	if (rows.length === 0) {
		ctx.io.out("mcp servers: none selected\n");
		ctx.io.out(`  ${ctx.palette.dim(`curated: ${catalogIds(ctx).join(", ")}`)}\n`);
		const supply = packSupplyLine(packServers);
		if (supply !== null) ctx.io.out(`  ${ctx.palette.dim(supply)}\n`);
		ctx.io.out("next: run stamity config mcp add <id> to select one\n");
	} else {
		ctx.io.out(`mcp servers (${rows.length} selected)\n`);
		for (const row of rows) {
			const label = labelFor(ctx, row);
			ctx.io.out(`  ${ctx.palette.bold(label)}  ${ctx.palette.dim(row.description ?? "")}\n`);
			renderLauncher(ctx, "    ", row.meta, row.pack);
			for (const envVar of row.env) {
				const verdict = envVar.set ? ctx.palette.green("set") : ctx.palette.yellow("missing");
				ctx.io.out(`    ${envVar.name}  ${verdict}\n`);
			}
		}
	}
	return {
		exitCode: 0,
		json: {
			servers: rows.map((row) => ({
				id: row.id,
				description: row.description,
				curated: row.curated,
				pack: row.pack,
				launcher: row.launcher,
				env: row.env
			})),
			catalog: catalogIds(ctx),
			packCatalog: packServers.map((server) => server.id)
		}
	};
}
async function runMcpAdd(ctx, rootDir, id) {
	const manifest = await requireSetupManifest(ctx, rootDir);
	const packServers = await installedPackServers(rootDir, manifest);
	const { unknown } = ctx.engine.mcp.catalog.validateServerIds([id], packServers);
	if (unknown.length > 0) {
		const supply = packSupplyLine(packServers);
		throw new CliFailure({
			code: "VALIDATION_ERROR",
			message: `unknown MCP server ${JSON.stringify(id)}`,
			why: "a server is selectable when the curated catalog pins it or an installed pack supplies it",
			next: `curated: ${catalogIds(ctx).join(", ")}` + (supply === null ? "; no installed pack supplies a server" : `; ${supply}`)
		});
	}
	const current = selectedServers(manifest);
	if (current.includes(id)) {
		ctx.io.out(`${id} is already selected — nothing to add.\n`);
		return {
			exitCode: 0,
			json: {
				id,
				added: false,
				servers: current
			}
		};
	}
	const meta = ctx.engine.mcp.catalog.resolveServerMeta(id, packServers);
	const packId = packServers.find((server) => server.id === id)?.sourcePackId ?? null;
	const launcher = launcherPayload(meta);
	const servers = [...current, id];
	if (ctx.dryRun) {
		ctx.io.out(`would add ${ctx.palette.bold(id)} to mcp.servers\n`);
		ctx.io.out(`  ${renderServers(current)} ${ctx.palette.cyan("->")} ${renderServers(servers)}\n`);
		renderLauncher(ctx, "  ", meta, packId);
		ctx.io.out(`${NEXT_DRY_RUN_LINE}\n`);
		return {
			exitCode: 0,
			json: {
				id,
				added: false,
				dryRun: true,
				servers,
				launcher
			}
		};
	}
	await ctx.engine.mcp.env.ensureEnvMcp(rootDir, servers, packServers);
	await ctx.engine.mcp.env.ensureGitignoreEntry(rootDir);
	await ctx.engine.manifest.manifest.writeManifest(rootDir, {
		...manifest,
		mcp: {
			...manifest.mcp,
			servers
		}
	});
	const values = await readEnvValues(ctx, rootDir);
	const env = envRowsFor(ctx, [id], values, packServers);
	ctx.io.out(`added ${ctx.palette.bold(id)} to mcp.servers\n`);
	ctx.io.out(`  ${renderServers(current)} ${ctx.palette.cyan("->")} ${renderServers(servers)}\n`);
	renderLauncher(ctx, "  ", meta, packId);
	if (env.length > 0) {
		ctx.io.out(`credentials (${ctx.engine.mcp.env.ENV_MCP_FILE}):\n`);
		for (const envVar of env) {
			const verdict = envVar.set ? ctx.palette.green("set") : ctx.palette.yellow("missing — fill it in");
			ctx.io.out(`  ${envVar.name}  ${verdict}\n`);
		}
		ctx.io.out("load them into your environment before starting the tool:\n");
		ctx.io.out(`  ${ctx.engine.mcp.env.getSourceEnvMcpCommand()}\n`);
	}
	warnOnStoredSecrets(ctx, values);
	ctx.io.out(`${NEXT_SYNC_LINE}\n`);
	return {
		exitCode: 0,
		json: {
			id,
			added: true,
			servers,
			env,
			launcher,
			envFile: ctx.engine.mcp.env.ENV_MCP_FILE
		}
	};
}
async function runMcpRemove(ctx, rootDir, id) {
	const manifest = await requireSetupManifest(ctx, rootDir);
	const current = selectedServers(manifest);
	if (!current.includes(id)) throw new CliFailure({
		code: "VALIDATION_ERROR",
		message: `${JSON.stringify(id)} is not a selected MCP server`,
		why: `selected: ${renderServers(current)}`,
		next: current.length === 0 ? "run stamity config mcp add <id> to select one" : "run stamity config mcp list to see the current selection"
	});
	const servers = current.filter((server) => server !== id);
	if (ctx.dryRun) {
		ctx.io.out(`would remove ${ctx.palette.bold(id)} from mcp.servers\n`);
		ctx.io.out(`  ${renderServers(current)} ${ctx.palette.cyan("->")} ${renderServers(servers)}\n`);
		ctx.io.out(`${NEXT_DRY_RUN_LINE}\n`);
		return {
			exitCode: 0,
			json: {
				id,
				removed: false,
				dryRun: true,
				servers
			}
		};
	}
	await ctx.engine.manifest.manifest.writeManifest(rootDir, {
		...manifest,
		mcp: {
			...manifest.mcp,
			servers
		}
	});
	ctx.io.out(`removed ${ctx.palette.bold(id)} from mcp.servers\n`);
	ctx.io.out(`  ${renderServers(current)} ${ctx.palette.cyan("->")} ${renderServers(servers)}\n`);
	ctx.io.out(`  ${ctx.palette.dim(`${ctx.engine.mcp.env.ENV_MCP_FILE} left untouched — the values in it are yours`)}\n`);
	ctx.io.out(`${NEXT_SYNC_LINE}\n`);
	return {
		exitCode: 0,
		json: {
			id,
			removed: true,
			servers
		}
	};
}
//#endregion
//#region src/cli/commands/config/policy.ts
const ACTIONS = [
	"list",
	"init",
	"allow",
	"deny",
	"remove"
];
function renderPatterns(patterns) {
	return patterns === void 0 || patterns.length === 0 ? "none" : patterns.join(", ");
}
function describeMode(policy) {
	if (policy === null) return "none — no policy file, so every pack source installs";
	if (policy.packs.allow === void 0) return "denylist — every source that matches no deny entry installs";
	return "allowlist — every source that matches no allow entry is REFUSED";
}
async function readPolicy(ctx, rootDir) {
	try {
		const policy = await ctx.engine.pack.orgPolicy.loadOrgPolicy(rootDir);
		return policy === null ? { kind: "absent" } : {
			kind: "valid",
			policy
		};
	} catch (error) {
		if (error instanceof EngineError) return {
			kind: "invalid",
			error
		};
		throw error;
	}
}
function policyDisplayPath(ctx, rootDir) {
	const absolute = ctx.engine.pack.orgPolicy.orgPolicyPath(rootDir);
	const rel = relative(rootDir, absolute);
	return rel === "" ? "." : rel.split(sep).join("/");
}
function invalidPolicy(ctx, rootDir, error) {
	return new CliFailure({
		code: error.code,
		message: error.message,
		why: `the policy is fail-closed: ${policyDisplayPath(ctx, rootDir)} exists and does not read as the documented shape, so no pack installs and no denied pack projects`,
		next: "edit the file to fix the defect above, or run stamity config policy init --force to replace it with an empty policy"
	});
}
async function requirePolicy(ctx, rootDir) {
	const read = await readPolicy(ctx, rootDir);
	if (read.kind === "invalid") throw invalidPolicy(ctx, rootDir, read.error);
	return read.kind === "absent" ? null : read.policy;
}
function assertPattern(ctx, action, pattern) {
	const defect = ctx.engine.pack.orgPolicy.orgPolicyPatternDefect(pattern);
	if (defect === null) return;
	throw new CliFailure({
		code: "VALIDATION_ERROR",
		message: `${JSON.stringify(pattern)} is not a valid policy pattern`,
		why: `the pattern ${defect}`,
		next: `${ctx.engine.pack.orgPolicy.ORG_POLICY_PATTERN_GRAMMAR} Run stamity config policy ${action} with one of those.`
	});
}
function withPattern(policy, list, pattern) {
	const packs = policy === null ? {} : structuredClone(policy.packs);
	return {
		version: 1,
		packs: {
			...packs,
			[list]: [...packs[list] ?? [], pattern]
		}
	};
}
function withoutPattern(policy, pattern) {
	const packs = {};
	for (const list of ["allow", "deny"]) {
		const current = policy.packs[list];
		if (current === void 0) continue;
		const kept = current.filter((entry) => entry !== pattern);
		if (kept.length > 0) packs[list] = kept;
	}
	return {
		version: 1,
		packs
	};
}
function listsHolding(policy, pattern) {
	return ["allow", "deny"].filter((list) => (policy.packs[list] ?? []).includes(pattern));
}
function renderLists(ctx, policy) {
	ctx.io.out(`  allow  ${renderPatterns(policy.packs.allow)}\n`);
	ctx.io.out(`  deny   ${renderPatterns(policy.packs.deny)}\n`);
}
function renderDocument(ctx, policy) {
	for (const line of ctx.engine.pack.orgPolicy.serializeOrgPolicy(policy).trimEnd().split("\n")) ctx.io.out(`  ${ctx.palette.dim(line)}\n`);
}
function payload(policy) {
	return {
		policy,
		mode: policy === null ? "none" : policy.packs.allow === void 0 ? "denylist" : "allowlist",
		allow: policy?.packs.allow ?? null,
		deny: policy?.packs.deny ?? null
	};
}
async function runPolicyList(ctx, rootDir) {
	await requireSetupManifest(ctx, rootDir);
	const path = policyDisplayPath(ctx, rootDir);
	const policy = await requirePolicy(ctx, rootDir);
	ctx.io.out(`${path}\n`);
	ctx.io.out(`mode: ${describeMode(policy)}\n`);
	if (policy === null) ctx.io.out(`${ctx.palette.dim("next: run stamity config policy init to start one, or config policy deny <pattern> to write the first rule")}\n`);
	else {
		renderLists(ctx, policy);
		ctx.io.out(`${ctx.palette.dim("next: run stamity config policy allow|deny|remove <pattern> to change one rule")}\n`);
	}
	return {
		exitCode: 0,
		json: {
			path,
			exists: policy !== null,
			...payload(policy)
		}
	};
}
async function runPolicyInit(ctx, rootDir, force) {
	await requireSetupManifest(ctx, rootDir);
	const path = policyDisplayPath(ctx, rootDir);
	const read = await readPolicy(ctx, rootDir);
	if (read.kind !== "absent" && !force) throw new CliFailure({
		code: "CONFIG_ERROR",
		message: `a policy already exists at ${path}`,
		why: read.kind === "valid" ? `it is a valid policy — ${describeMode(read.policy)}` : `it does not parse, so every pack install is already refused: ${read.error.message}`,
		next: "run stamity config policy list to read it, config policy allow|deny <pattern> to change one rule, or config policy init --force to replace it with an empty policy"
	});
	const policy = ctx.engine.pack.orgPolicy.emptyOrgPolicy();
	const replacing = read.kind !== "absent";
	if (ctx.dryRun) {
		ctx.io.out(`would ${replacing ? "replace" : "create"} ${path}\n`);
		renderDocument(ctx, policy);
		ctx.io.out(`${NEXT_DRY_RUN_LINE}\n`);
		return {
			exitCode: 0,
			json: {
				path,
				created: false,
				replaced: false,
				dryRun: true,
				...payload(policy)
			}
		};
	}
	await ctx.engine.pack.orgPolicy.writeOrgPolicy(rootDir, policy);
	ctx.io.out(`${replacing ? "replaced" : "created"} ${path}\n`);
	renderDocument(ctx, policy);
	ctx.io.out(`  ${ctx.palette.dim("an empty policy restricts nothing — every pack source still installs")}\n`);
	ctx.io.out(`${NEXT_SYNC_LINE}\n`);
	return {
		exitCode: 0,
		json: {
			path,
			created: !replacing,
			replaced: replacing,
			...payload(policy)
		}
	};
}
function modeShift(before, after) {
	const wasAllowlist = before !== null && before.packs.allow !== void 0;
	const isAllowlist = after !== null && after.packs.allow !== void 0;
	if (wasAllowlist === isAllowlist) return null;
	return isAllowlist ? "this repo is now in ALLOWLIST mode — every pack source that matches no allow entry is refused, including ones already installed, which stop projecting on the next sync" : "this repo is back in DENYLIST mode — every pack source that matches no deny entry installs again";
}
async function runPolicyAdd(ctx, rootDir, list, pattern) {
	await requireSetupManifest(ctx, rootDir);
	assertPattern(ctx, list, pattern);
	const path = policyDisplayPath(ctx, rootDir);
	const before = await requirePolicy(ctx, rootDir);
	if (before !== null && (before.packs[list] ?? []).includes(pattern)) {
		ctx.io.out(`${JSON.stringify(pattern)} is already in packs.${list} — nothing to add.\n`);
		return {
			exitCode: 0,
			json: {
				path,
				pattern,
				list,
				changed: false,
				...payload(before)
			}
		};
	}
	const after = withPattern(before, list, pattern);
	const shift = modeShift(before, after);
	const diff = `packs.${list}: ${renderPatterns(before?.packs[list])} ${ctx.palette.cyan("->")} ${renderPatterns(after.packs[list])}`;
	if (ctx.dryRun) {
		ctx.io.out(`would add ${ctx.palette.bold(pattern)} to packs.${list}\n`);
		ctx.io.out(`  ${diff}\n`);
		if (shift !== null) ctx.io.out(`  ${ctx.palette.yellow(shift)}\n`);
		renderDocument(ctx, after);
		ctx.io.out(`${NEXT_DRY_RUN_LINE}\n`);
		return {
			exitCode: 0,
			json: {
				path,
				pattern,
				list,
				changed: false,
				dryRun: true,
				...payload(after)
			}
		};
	}
	await ctx.engine.pack.orgPolicy.writeOrgPolicy(rootDir, after);
	ctx.io.out(`added ${ctx.palette.bold(pattern)} to packs.${list}\n`);
	ctx.io.out(`  ${diff}\n`);
	if (shift !== null) ctx.io.out(`  ${ctx.palette.yellow(shift)}\n`);
	ctx.io.out(`${NEXT_SYNC_LINE}\n`);
	return {
		exitCode: 0,
		json: {
			path,
			pattern,
			list,
			changed: true,
			...payload(after)
		}
	};
}
async function runPolicyRemove(ctx, rootDir, pattern) {
	await requireSetupManifest(ctx, rootDir);
	const path = policyDisplayPath(ctx, rootDir);
	const before = await requirePolicy(ctx, rootDir);
	const holding = before === null ? [] : listsHolding(before, pattern);
	if (before === null || holding.length === 0) throw new CliFailure({
		code: "VALIDATION_ERROR",
		message: `${JSON.stringify(pattern)} is not in the org trust policy`,
		why: before === null ? `there is no policy at ${path}` : `allow: ${renderPatterns(before.packs.allow)}; deny: ${renderPatterns(before.packs.deny)}`,
		next: before === null ? "run stamity config policy init to start one" : "run stamity config policy list to see the current rules"
	});
	const after = withoutPattern(before, pattern);
	const shift = modeShift(before, after);
	const from = holding.map((list) => `packs.${list}`).join(" and ");
	if (ctx.dryRun) {
		ctx.io.out(`would remove ${ctx.palette.bold(pattern)} from ${from}\n`);
		if (shift !== null) ctx.io.out(`  ${ctx.palette.yellow(shift)}\n`);
		renderDocument(ctx, after);
		ctx.io.out(`${NEXT_DRY_RUN_LINE}\n`);
		return {
			exitCode: 0,
			json: {
				path,
				pattern,
				lists: holding,
				changed: false,
				dryRun: true,
				...payload(after)
			}
		};
	}
	await ctx.engine.pack.orgPolicy.writeOrgPolicy(rootDir, after);
	ctx.io.out(`removed ${ctx.palette.bold(pattern)} from ${from}\n`);
	renderLists(ctx, after);
	if (shift !== null) ctx.io.out(`  ${ctx.palette.yellow(shift)}\n`);
	ctx.io.out(`${NEXT_SYNC_LINE}\n`);
	return {
		exitCode: 0,
		json: {
			path,
			pattern,
			lists: holding,
			changed: true,
			...payload(after)
		}
	};
}
async function runPolicy(ctx, rootDir, action, pattern, force) {
	if (action === void 0 || action === "list") return runPolicyList(ctx, rootDir);
	if (action === "init") return runPolicyInit(ctx, rootDir, force);
	if (action !== "allow" && action !== "deny" && action !== "remove") throw new CliFailure({
		code: "USAGE",
		message: `unknown policy action ${JSON.stringify(action)}`,
		why: `config policy takes one of ${ACTIONS.length} actions`,
		next: `use one of: ${ACTIONS.join(", ")}`
	});
	if (pattern === void 0) throw new CliFailure({
		code: "USAGE",
		message: `config policy ${action} needs a pattern`,
		why: "a rule is added or dropped by the pattern text itself",
		next: `run stamity config policy ${action} <pattern> — ${ctx.engine.pack.orgPolicy.ORG_POLICY_PATTERN_GRAMMAR}`
	});
	if (action === "remove") return runPolicyRemove(ctx, rootDir, pattern);
	return runPolicyAdd(ctx, rootDir, action, pattern);
}
//#endregion
//#region src/cli/commands/config.ts
const NONE = "none";
const PLATFORMS = Object.keys(PLATFORM_MCP_SERVER);
const CURATED_IDS = Object.keys(CURATED_MCP_SERVERS);
const NO_PACK_SUPPLY = { packServers: [] };
function parseCsv(raw) {
	const seen = /* @__PURE__ */ new Set();
	for (const token of raw.split(",")) {
		const value = token.trim();
		if (value !== "") seen.add(value);
	}
	return [...seen];
}
function renderList$1(values) {
	return values.length === 0 ? NONE : values.join(", ");
}
const CLIENT_DEFAULT = "(client default)";
const NOT_EXPRESSED = "(not expressed)";
function clampedMarker(emitted, requested) {
	return `${emitted} (clamped from ${requested})`;
}
const MODEL_HINT = "a model id your client accepts — passed through verbatim, shape-checked only (non-empty, one line)";
const EFFORT_CARRIERS = TOOLS.filter((tool) => CLIENT_MODEL_PROJECTION[tool].effortCarrier !== null);
const EFFORT_OMITTERS = TOOLS.filter((tool) => CLIENT_MODEL_PROJECTION[tool].effortCarrier === null);
const EFFORT_LEGACY_CLAUSES = EFFORT_LEVELS.flatMap((level) => {
	const clientsByWritten = /* @__PURE__ */ new Map();
	for (const tool of EFFORT_CARRIERS) {
		if (!CLIENT_MODEL_PROJECTION[tool].effortLegacy.includes(level)) continue;
		const written = nearestExpressibleEffort(level, tool);
		if (written === void 0) continue;
		clientsByWritten.set(written, [...clientsByWritten.get(written) ?? [], tool]);
	}
	return [...clientsByWritten].map(([written, tools]) => `${level} is written as ${written} on ${renderList$1(tools)}`);
});
const EFFORT_HINT = `one of ${EFFORT_LEVELS.join(" | ")} — carried on ${renderList$1(EFFORT_CARRIERS)}` + (EFFORT_OMITTERS.length === 0 ? "" : `, omitted on ${renderList$1(EFFORT_OMITTERS)}`) + "; the levels are the union of the clients' documented scales, so one a selected client cannot express is refused here" + (EFFORT_LEGACY_CLAUSES.length === 0 ? "" : `, except a legacy level, which is accepted and written as the nearest level that client documents: ${EFFORT_LEGACY_CLAUSES.join("; ")}`);
function readPin(manifest, modelClass) {
	return manifest.models?.pins?.[modelClass] ?? null;
}
function resolvePin(manifest, modelClass) {
	const pins = manifest.models?.pins ?? {};
	const efforts = manifest.models?.effort ?? {};
	const perTool = manifest.tools.map((tool) => ({
		tool,
		value: resolveModelValue(modelClass, tool, pins, efforts)
	}));
	const distinct = new Set(perTool.map((entry) => entry.value));
	if (distinct.size === 0) return CLIENT_DEFAULT;
	if (distinct.size === 1) return perTool[0]?.value ?? CLIENT_DEFAULT;
	return perTool.map((entry) => `${entry.tool}=${entry.value ?? CLIENT_DEFAULT}`).join(", ");
}
function applyPin(draft, modelClass, raw) {
	if (!isModelClass(modelClass)) throw new CliFailure({
		code: "VALIDATION_ERROR",
		message: `no ladder class named ${JSON.stringify(modelClass)}`,
		why: "a pin reaches an emitted file only through a class the model ladder assigns",
		next: `pin one of: ${MODEL_CLASSES.join(", ")}`
	});
	draft.models = {
		...draft.models,
		pins: {
			...draft.models?.pins,
			[modelClass]: raw
		}
	};
}
function readEffort(manifest, modelClass) {
	return manifest.models?.effort?.[modelClass] ?? null;
}
function expressesEffort(tool, modelClass, pins, efforts) {
	return new Set(EFFORT_LEVELS.map((level) => {
		const probe = {
			...efforts,
			[modelClass]: level
		};
		return JSON.stringify([resolveModelValue(modelClass, tool, pins, probe), resolveEffortValue(modelClass, tool, probe)]);
	})).size > 1;
}
function resolveEffort(manifest, modelClass) {
	const pins = manifest.models?.pins ?? {};
	const efforts = manifest.models?.effort ?? {};
	const level = efforts[modelClass] ?? MODEL_LADDER.find((row) => row.modelClass === modelClass)?.defaultEffort ?? NONE;
	const requested = EFFORT_LEVELS.includes(level) ? level : void 0;
	const perTool = manifest.tools.map((tool) => {
		if (!expressesEffort(tool, modelClass, pins, efforts)) return {
			tool,
			value: NOT_EXPRESSED
		};
		const emitted = requested === void 0 ? void 0 : nearestExpressibleEffort(requested, tool);
		if (emitted === void 0 || emitted === level) return {
			tool,
			value: level
		};
		return {
			tool,
			value: clampedMarker(emitted, level)
		};
	});
	const distinct = new Set(perTool.map((entry) => entry.value));
	if (distinct.size === 0) return level;
	if (distinct.size === 1) return perTool[0]?.value ?? NOT_EXPRESSED;
	return perTool.map((entry) => `${entry.tool}=${entry.value}`).join(", ");
}
function unexpressibleOn(tools, level) {
	for (const tool of tools) {
		const projection = CLIENT_MODEL_PROJECTION[tool];
		if (projection.effortCarrier === null) continue;
		if (projection.effortLegacy.includes(level)) continue;
		const nearest = nearestExpressibleEffort(level, tool);
		if (nearest === void 0 || nearest === level) continue;
		return {
			tool,
			edge: effortRank(nearest) < effortRank(level) ? "ends at" : "starts at",
			bound: nearest
		};
	}
	return null;
}
function applyEffort(draft, modelClass, raw) {
	if (EFFORT_LEVELS.includes(raw)) {
		const blocked = unexpressibleOn(draft.tools, raw);
		if (blocked !== null) {
			const remedy = blocked.edge === "ends at" ? "or lower" : "or higher";
			throw new CliFailure({
				code: "VALIDATION_ERROR",
				message: `effort.${modelClass} ${raw} is not expressible on ${blocked.tool} (its scale ${blocked.edge} ${blocked.bound})`,
				why: "a level a selected client cannot express reaches its emitted files only as a narrowed one",
				next: `set ${blocked.bound} ${remedy}, or deselect the client`
			});
		}
	}
	draft.models = {
		...draft.models,
		effort: {
			...draft.models?.effort,
			[modelClass]: raw
		}
	};
}
const GATE_HINT = "a shell command line, or `none` to clear";
function readGate(manifest, gate) {
	return manifest.gates?.[gate] ?? null;
}
function resolveGate(manifest, gate) {
	const pinned = manifest.gates?.[gate];
	if (pinned !== void 0) return pinned;
	return `detected: ${verificationCommandsFor(manifest.detected)[gate] ?? "unknown"}`;
}
function applyGate(draft, gate, raw) {
	if (raw !== NONE) {
		draft.gates = {
			...draft.gates,
			[gate]: raw
		};
		return;
	}
	if (draft.gates === void 0) return;
	const { [gate]: _cleared, ...rest } = draft.gates;
	if (Object.keys(rest).length === 0) delete draft.gates;
	else draft.gates = rest;
}
function gateSpec(gate) {
	return {
		key: `gates.${gate}`,
		hint: GATE_HINT,
		read: (manifest) => readGate(manifest, gate),
		resolve: (manifest) => resolveGate(manifest, gate),
		apply: (draft, raw) => applyGate(draft, gate, raw)
	};
}
const KEY_SPECS = [
	{
		key: "tools",
		hint: `a comma-separated subset of ${TOOLS.join(", ")}`,
		choices: TOOLS,
		multiple: true,
		read: (manifest) => manifest.tools.join(", "),
		resolve: (manifest) => renderList$1(manifest.tools),
		apply: (draft, raw) => {
			draft.tools = parseCsv(raw);
		}
	},
	{
		key: "platform",
		hint: `one of ${PLATFORMS.join(" | ")}`,
		choices: PLATFORMS,
		read: (manifest) => manifest.platform ?? null,
		resolve: (manifest) => manifest.platform ?? NONE,
		apply: (draft, raw) => {
			draft.platform = raw;
		}
	},
	{
		key: "maturityTier",
		hint: `one of ${MATURITY_TIERS.join(" | ")}`,
		choices: MATURITY_TIERS,
		read: (manifest) => manifest.maturityTier ?? null,
		resolve: (manifest) => readMaturityTier(manifest),
		apply: (draft, raw) => {
			draft.maturityTier = raw;
		}
	},
	{
		key: "ruleDelivery",
		hint: `one of ${RULE_DELIVERIES.join(" | ")}`,
		choices: RULE_DELIVERIES,
		read: (manifest) => manifest.ruleDelivery ?? null,
		resolve: (manifest) => readRuleDelivery(manifest),
		apply: (draft, raw) => {
			draft.ruleDelivery = raw;
		}
	},
	{
		key: "communicationStyle",
		hint: `one of ${COMMUNICATION_STYLES.join(" | ")}`,
		choices: COMMUNICATION_STYLES,
		read: (manifest) => manifest.communicationStyle ?? null,
		resolve: (manifest) => readCommunicationStyle(manifest),
		apply: (draft, raw) => {
			draft.communicationStyle = raw;
		}
	},
	{
		key: "learnings.maxCount",
		hint: "a positive integer",
		read: (manifest) => manifest.learnings?.maxCount === void 0 ? null : String(manifest.learnings.maxCount),
		resolve: (manifest) => String(resolveLearningsCaps(manifest.learnings?.maxCount).maxCount),
		apply: (draft, raw) => {
			draft.learnings = {
				...draft.learnings,
				maxCount: Number(raw)
			};
		}
	},
	{
		key: "hooks.userHooksDir",
		hint: "a repo-relative directory path",
		read: (manifest) => manifest.hooks?.userHooksDir ?? null,
		resolve: (manifest) => manifest.hooks?.userHooksDir ?? NONE,
		apply: (draft, raw) => {
			draft.hooks = {
				...draft.hooks,
				userHooksDir: raw
			};
		}
	},
	{
		key: "mcp.servers",
		hint: "a comma-separated list of server ids this repo can resolve — curated, or supplied by an installed pack",
		needsPackSupply: true,
		read: (manifest) => manifest.mcp === void 0 || manifest.mcp.servers.length === 0 ? null : manifest.mcp.servers.join(", "),
		resolve: (manifest) => renderList$1(manifest.mcp?.servers ?? []),
		apply: (draft, raw, context) => {
			const servers = parseCsv(raw);
			const { unknown } = validateServerIds(servers, context.packServers);
			if (unknown.length > 0) {
				const packIds = context.packServers.map((server) => server.id);
				throw new CliFailure({
					code: "VALIDATION_ERROR",
					message: `unknown MCP server(s): ${unknown.join(", ")}`,
					why: "only reviewed, version-pinned servers — from the curated catalog or an installed pack — can be selected",
					next: `use ids from — curated: ${CURATED_IDS.join(", ")}` + (packIds.length === 0 ? "; no installed pack supplies a server" : `; installed packs: ${packIds.join(", ")}`)
				});
			}
			draft.mcp = {
				...draft.mcp,
				servers
			};
		}
	},
	{
		key: "mcp.protocolVersion",
		hint: "an MCP protocol revision string",
		read: (manifest) => manifest.mcp?.protocolVersion ?? null,
		resolve: (manifest) => manifest.mcp?.protocolVersion ?? NONE,
		apply: (draft, raw) => {
			draft.mcp = {
				servers: [],
				...draft.mcp,
				protocolVersion: raw
			};
		}
	},
	{
		key: "model.frontier",
		hint: MODEL_HINT,
		read: (manifest) => readPin(manifest, "frontier"),
		resolve: (manifest) => resolvePin(manifest, "frontier"),
		apply: (draft, raw) => applyPin(draft, "frontier", raw)
	},
	{
		key: "model.advanced",
		hint: MODEL_HINT,
		read: (manifest) => readPin(manifest, "advanced"),
		resolve: (manifest) => resolvePin(manifest, "advanced"),
		apply: (draft, raw) => applyPin(draft, "advanced", raw)
	},
	{
		key: "model.standard",
		hint: MODEL_HINT,
		read: (manifest) => readPin(manifest, "standard"),
		resolve: (manifest) => resolvePin(manifest, "standard"),
		apply: (draft, raw) => applyPin(draft, "standard", raw)
	},
	{
		key: "model.economy",
		hint: MODEL_HINT,
		read: (manifest) => readPin(manifest, "economy"),
		resolve: (manifest) => resolvePin(manifest, "economy"),
		apply: (draft, raw) => applyPin(draft, "economy", raw)
	},
	{
		key: "effort.frontier",
		hint: EFFORT_HINT,
		choices: EFFORT_LEVELS,
		read: (manifest) => readEffort(manifest, "frontier"),
		resolve: (manifest) => resolveEffort(manifest, "frontier"),
		apply: (draft, raw) => applyEffort(draft, "frontier", raw)
	},
	{
		key: "effort.advanced",
		hint: EFFORT_HINT,
		choices: EFFORT_LEVELS,
		read: (manifest) => readEffort(manifest, "advanced"),
		resolve: (manifest) => resolveEffort(manifest, "advanced"),
		apply: (draft, raw) => applyEffort(draft, "advanced", raw)
	},
	{
		key: "effort.standard",
		hint: EFFORT_HINT,
		choices: EFFORT_LEVELS,
		read: (manifest) => readEffort(manifest, "standard"),
		resolve: (manifest) => resolveEffort(manifest, "standard"),
		apply: (draft, raw) => applyEffort(draft, "standard", raw)
	},
	{
		key: "effort.economy",
		hint: EFFORT_HINT,
		choices: EFFORT_LEVELS,
		read: (manifest) => readEffort(manifest, "economy"),
		resolve: (manifest) => resolveEffort(manifest, "economy"),
		apply: (draft, raw) => applyEffort(draft, "economy", raw)
	},
	{
		key: "review.maxIterations",
		hint: `a whole number of review rounds within 1..10`,
		read: (manifest) => manifest.models?.reviewCap === void 0 ? null : String(manifest.models.reviewCap),
		resolve: (manifest) => String(readReviewCap(manifest)),
		apply: (draft, raw) => {
			draft.models = {
				...draft.models,
				reviewCap: Number(raw)
			};
		}
	},
	gateSpec("test"),
	gateSpec("lint"),
	gateSpec("typecheck"),
	gateSpec("all")
];
const CONFIG_KEYS = KEY_SPECS.map((spec) => spec.key);
function specFor(key) {
	const spec = KEY_SPECS.find((candidate) => candidate.key === key);
	if (spec !== void 0) return spec;
	throw new CliFailure({
		code: "VALIDATION_ERROR",
		message: `unknown config key ${JSON.stringify(key)}`,
		why: "config addresses a closed key set",
		next: `use one of: ${CONFIG_KEYS.join(", ")}`
	});
}
function getConfigValue(manifest, key) {
	const spec = specFor(key);
	const value = spec.read(manifest);
	return {
		value,
		isDefault: value === null,
		resolved: spec.resolve(manifest)
	};
}
function setConfigValue(manifest, key, raw, context = NO_PACK_SUPPLY) {
	const spec = specFor(key);
	const draft = structuredClone(manifest);
	spec.apply(draft, raw.trim(), context);
	const errors = collectManifestErrors(draft);
	if (errors.length > 0) throw new CliFailure({
		code: "VALIDATION_ERROR",
		message: `${key} rejected the value ${JSON.stringify(raw)}`,
		why: errors.join("; "),
		next: `re-run with ${spec.hint}`
	});
	return draft;
}
async function runList$2(ctx, rootDir) {
	const manifest = await requireSetupManifest(ctx, rootDir);
	const rows = CONFIG_KEYS.map((key) => ({
		key,
		...getConfigValue(manifest, key)
	}));
	const width = Math.max(...rows.map((row) => row.key.length));
	ctx.io.out(`${ctx.engine.manifest.manifest.manifestPath(rootDir)}\n`);
	for (const row of rows) {
		const marker = row.isDefault ? ctx.palette.dim("(default)") : ctx.palette.green("(set)");
		ctx.io.out(`  ${row.key.padEnd(width)}  ${sanitizeLabel(row.resolved).padEnd(24)}  ${marker}\n`);
	}
	ctx.io.out(`${ctx.palette.dim("run stamity config set <key> <value> to change one")}\n`);
	return {
		exitCode: 0,
		json: { keys: rows }
	};
}
function keyChoices(manifest) {
	const rows = CONFIG_KEYS.map((key) => ({
		key,
		...getConfigValue(manifest, key)
	}));
	const width = Math.max(...rows.map((row) => row.key.length));
	return rows.map((row) => ({
		value: row.key,
		label: `${row.key.padEnd(width)}  ${row.resolved.padEnd(24)}  ${row.isDefault ? "(default)" : "(set)"}`
	}));
}
const KEEP_UNCHANGED = "\0keep-unchanged";
const KEEP_UNCHANGED_LABEL = "(keep unchanged)";
async function askValue(gate, promptIo, manifest, spec) {
	const current = spec.read(manifest);
	if (spec.choices === void 0) {
		const typed = await textInput(gate, promptIo, {
			question: `${spec.key} — ${spec.hint}\nnew value`,
			defaultValue: current ?? ""
		});
		return typed.trim() === "" ? null : typed;
	}
	const choices = spec.choices.map((value) => ({
		value,
		label: value
	}));
	if (spec.multiple === true) {
		const picked = await selectMany(gate, promptIo, {
			question: `${spec.key}?`,
			choices,
			defaultValues: current === null ? [] : parseCsv(current)
		});
		return picked.length === 0 ? null : picked.join(", ");
	}
	const picked = await selectOne(gate, promptIo, {
		question: `${spec.key}?`,
		choices: [{
			value: KEEP_UNCHANGED,
			label: KEEP_UNCHANGED_LABEL
		}, ...choices],
		defaultValue: KEEP_UNCHANGED
	});
	return picked === KEEP_UNCHANGED ? null : picked;
}
async function runPicker(ctx, rootDir, gate) {
	const manifest = await requireSetupManifest(ctx, rootDir);
	ctx.io.out(`${ctx.engine.manifest.manifest.manifestPath(rootDir)}\n`);
	const key = await selectOne(gate, ctx.promptIo, {
		question: "Which setting?",
		choices: keyChoices(manifest),
		defaultValue: CONFIG_KEYS[0] ?? ""
	});
	const value = await askValue(gate, ctx.promptIo, manifest, specFor(key));
	closePrompts(ctx.promptIo);
	if (value === null) {
		ctx.io.out(`no value chosen — ${key} is unchanged.\n`);
		return {
			exitCode: 0,
			json: {
				key,
				changed: false
			}
		};
	}
	return await applyKeyValue(ctx, rootDir, await requireSetupManifest(ctx, rootDir), key, value);
}
async function runGet(ctx, rootDir, key) {
	if (key === void 0) throw new CliFailure({
		code: "USAGE",
		message: "config get needs a key",
		why: "get reads exactly one key",
		next: `run stamity config get <key> — keys: ${CONFIG_KEYS.join(", ")}`
	});
	const read = getConfigValue(await requireSetupManifest(ctx, rootDir), key);
	ctx.io.out(read.value === null ? `${key}  ${ctx.palette.dim(`(default: ${read.resolved})`)}\n` : `${key}  ${read.value}\n`);
	return {
		exitCode: 0,
		json: {
			key,
			...read
		}
	};
}
async function applyContext(rootDir, manifest, key) {
	if (specFor(key).needsPackSupply !== true) return NO_PACK_SUPPLY;
	const packs = await discoverInstalledPacks(rootDir, manifest);
	return { packServers: await packMcpServers(packs, rootDir) };
}
async function runSet(ctx, rootDir, key, value) {
	if (key === void 0 || value === void 0) throw new CliFailure({
		code: "USAGE",
		message: key === void 0 ? "config set needs a key" : `config set needs a value for ${key}`,
		why: "set writes exactly one key",
		next: `run stamity config set <key> <value> — keys: ${CONFIG_KEYS.join(", ")}`
	});
	return await applyKeyValue(ctx, rootDir, await requireSetupManifest(ctx, rootDir), key, value);
}
async function applyKeyValue(ctx, rootDir, manifest, key, value) {
	const before = getConfigValue(manifest, key);
	const next = setConfigValue(manifest, key, value, await applyContext(rootDir, manifest, key));
	const after = getConfigValue(next, key);
	if (before.value === after.value) {
		ctx.io.out(`${key} is already ${JSON.stringify(after.resolved)} — no change.\n`);
		return {
			exitCode: 0,
			json: {
				key,
				changed: false,
				value: after.value
			}
		};
	}
	const diff = `${key}: ${before.value ?? before.resolved} ${ctx.palette.cyan("->")} ${after.resolved}`;
	if (ctx.dryRun) {
		ctx.io.out(`would set ${diff}\n`);
		ctx.io.out(`${NEXT_DRY_RUN_LINE}\n`);
		return {
			exitCode: 0,
			json: {
				key,
				changed: false,
				dryRun: true,
				previous: before.value,
				value: after.value
			}
		};
	}
	await ctx.engine.manifest.manifest.writeManifest(rootDir, next);
	ctx.io.out(`set ${diff}\n`);
	ctx.io.out(`${NEXT_SYNC_LINE}\n`);
	return {
		exitCode: 0,
		json: {
			key,
			changed: true,
			previous: before.value,
			value: after.value
		}
	};
}
function diffDetection(manifest, detected, platform) {
	const rows = [];
	for (const field of [
		"languages",
		"linters",
		"testFrameworks",
		"ciProviders"
	]) {
		const before = renderList$1(manifest.detected?.[field] ?? []);
		const after = renderList$1(detected[field]);
		if (before !== after) rows.push({
			field,
			before,
			after
		});
	}
	if (platform !== null && platform !== manifest.platform) rows.push({
		field: "platform",
		before: manifest.platform ?? NONE,
		after: platform
	});
	return rows;
}
async function runDetect(ctx, rootDir) {
	const manifest = await requireSetupManifest(ctx, rootDir);
	ctx.spinner.start("scanning the repo");
	const info = await ctx.engine.detect.repoAnalyzer.analyzeRepo(rootDir);
	const identity = ctx.engine.workspace.git.detectRepoGitIdentity(rootDir, gitCheckRunner());
	ctx.spinner.stop();
	const detected = summarizeDetection(info);
	const rows = diffDetection(manifest, detected, identity.platform);
	if (rows.length === 0) {
		ctx.io.out("detect: the manifest already matches this repo — nothing to refresh.\n");
		return {
			exitCode: 0,
			json: {
				changed: [],
				detected,
				platform: manifest.platform ?? null
			}
		};
	}
	const width = Math.max(...rows.map((row) => row.field.length));
	const render = () => {
		for (const row of rows) ctx.io.out(`  ${row.field.padEnd(width)}  ${row.before} ${ctx.palette.cyan("->")} ${row.after}\n`);
	};
	const platform = identity.platform ?? manifest.platform;
	if (ctx.dryRun) {
		ctx.io.out(`detect: ${rows.length} field(s) would change\n`);
		render();
		ctx.io.out(`${NEXT_DRY_RUN_LINE}\n`);
		return {
			exitCode: 0,
			json: {
				changed: rows,
				detected,
				platform: platform ?? null,
				dryRun: true
			}
		};
	}
	await ctx.engine.manifest.manifest.writeManifest(rootDir, {
		...manifest,
		...platform === void 0 ? {} : { platform },
		detected
	});
	ctx.io.out(`detect: refreshed ${rows.length} field(s)\n`);
	render();
	ctx.io.out(`${NEXT_SYNC_LINE}\n`);
	return {
		exitCode: 0,
		json: {
			changed: rows,
			detected,
			platform: platform ?? null
		}
	};
}
async function runMcp(ctx, rootDir, action, id) {
	if (action === void 0 || action === "list") return runMcpList(ctx, rootDir);
	if (action !== "add" && action !== "remove") throw new CliFailure({
		code: "USAGE",
		message: `unknown mcp action ${JSON.stringify(action)}`,
		why: "config mcp takes one of three actions",
		next: "use one of: list, add, remove"
	});
	if (id === void 0) throw new CliFailure({
		code: "USAGE",
		message: `config mcp ${action} needs a server id`,
		why: "a server is selected or deselected by id",
		next: `run stamity config mcp ${action} <id>, or stamity config mcp list to see the ids`
	});
	return action === "add" ? runMcpAdd(ctx, rootDir, id) : runMcpRemove(ctx, rootDir, id);
}
const configCommand = {
	name: "config",
	summary: "inspect and change the setup: keys, detection refresh, MCP servers",
	mutating: true,
	args: [
		{
			name: "subcommand",
			description: "list | get | set | detect | mcp | policy — omit on a terminal for the interactive picker",
			required: false
		},
		{
			name: "key",
			description: "config key, the mcp action (list | add | remove), or the policy action (list | init | allow | deny | remove)",
			required: false
		},
		{
			name: "value",
			description: "new value, the MCP server id, or the policy pattern",
			required: false
		}
	],
	configure(cmd) {
		cmd.option("--force", "config policy init: replace an existing .stamity/policy.json — including a defective one, which is the way out of a fail-closed policy");
	},
	run: async (ctx, opts, args) => {
		const rootDir = ctx.app.runtime.cwd;
		const [subcommand, first, second] = args;
		if (subcommand === void 0) {
			const gate = promptGate({
				stdinIsTTY: ctx.terminal.stdinIsTTY,
				yes: ctx.yes,
				json: ctx.json,
				env: ctx.app.runtime.env,
				palette: ctx.palette
			});
			return gate.interactive && ctx.terminal.stdoutIsTTY ? runPicker(ctx, rootDir, gate) : runList$2(ctx, rootDir);
		}
		switch (subcommand) {
			case "list": return runList$2(ctx, rootDir);
			case "get": return runGet(ctx, rootDir, first);
			case "set": return runSet(ctx, rootDir, first, second);
			case "detect": return runDetect(ctx, rootDir);
			case "mcp": return runMcp(ctx, rootDir, first, second);
			case "policy": return runPolicy(ctx, rootDir, first, second, opts["force"] === true);
			default: throw new CliFailure({
				code: "USAGE",
				message: `unknown config subcommand ${JSON.stringify(subcommand)}`,
				why: "config takes one of six subcommands",
				next: "use one of: list, get, set, detect, mcp, policy"
			});
		}
	}
};
//#endregion
//#region src/cli/commands/gate.ts
const CLASSIFY = "classify";
const SCAN = "scan";
const GATE_GIT_TIMEOUT_MS = 6e4;
const GATE_GIT_MAX_BUFFER = 67108864;
function parseBaseRef(value) {
	if (value.startsWith("-")) throw new InvalidArgumentError("a base ref never starts with '-'.");
	return value;
}
function toProjectPath(prefix, topLevelPath) {
	const root = prefix === "" || prefix.endsWith("/") ? prefix : `${prefix}/`;
	if (!topLevelPath.startsWith(root)) return null;
	const inside = topLevelPath.slice(root.length);
	return inside === "" ? null : inside;
}
var GitReadError = class extends Error {
	step;
	failure;
	cwd;
	constructor(step, failure, cwd) {
		super(`git ${step} failed`);
		this.step = step;
		this.failure = failure;
		this.cwd = cwd;
	}
};
function runGit(runner, cwd, step, args) {
	try {
		return runner(args, cwd);
	} catch (err) {
		throw new GitReadError(step, err, cwd);
	}
}
function describeGitFailure(err) {
	if (keptFromGit(err.failure)) return "git was not started here: this folder, or a folder above it, has the layout of a bare repository, so the engine did not hand it to git, and plain git run here or in any folder under that one would open it";
	const failure = err.failure;
	if (failure.code === "ENOENT" && !existsSync(err.cwd)) return `the directory git runs in, ${err.cwd}, does not exist`;
	if (failure.code === "ENOENT") return "git could not run (no git binary was found)";
	const firstRead = err.step === "rev-parse --show-prefix";
	const what = firstRead ? "git's search for a work tree here" : `git ${err.step}`;
	if (failure.code === "ETIMEDOUT") return `${what} did not finish within ${GATE_GIT_TIMEOUT_MS / 1e3} seconds`;
	if (failure.code === "ENOBUFS") return `${what} printed more than ${GATE_GIT_MAX_BUFFER / 1024 / 1024} MiB`;
	const status = typeof failure.status === "number" ? `, exit ${failure.status}` : "";
	if (firstRead) return `no git work tree was found here (the engine found a git binary, and git's search for one failed${status})`;
	return `git ${err.step} failed${status}`;
}
function parseNameStatus(output) {
	const fields = output.split("\0");
	const paths = [];
	const renames = [];
	const sections = [];
	let index = 0;
	while (index < fields.length) {
		const status = fields[index] ?? "";
		if (status === "") {
			index += 1;
			continue;
		}
		if (status.startsWith("R") || status.startsWith("C")) {
			const from = fields[index + 1];
			const to = fields[index + 2];
			if (from === void 0 || to === void 0) throw new GitReadError("diff --name-status", /* @__PURE__ */ new Error("truncated row"), "");
			renames.push({
				from,
				to
			});
			sections.push({
				from,
				to
			});
			index += 3;
		} else {
			const path = fields[index + 1];
			if (path === void 0) throw new GitReadError("diff --name-status", /* @__PURE__ */ new Error("truncated row"), "");
			paths.push(path);
			sections.push(...Array.from({ length: status.startsWith("T") ? 2 : 1 }, () => ({
				from: path,
				to: path
			})));
			index += 2;
		}
	}
	return {
		paths,
		renames,
		sections
	};
}
var PatchError = class extends Error {};
function parsePatch(output, sections) {
	const lines = output.split("\n");
	if (lines.at(-1) === "") lines.pop();
	const parsed = [];
	let at = 0;
	const next = () => lines[at] ?? "";
	while (at < lines.length) {
		const expected = sections[parsed.length];
		const header = next();
		if (expected === void 0 || !header.startsWith("diff --git ")) throw new PatchError("the patch holds more sections than the name list");
		if (!header.includes("\"") && header !== `diff --git a/${expected.from} b/${expected.to}`) throw new PatchError("a patch section's header does not name the file the name list gives in its place");
		const section = {
			hunks: [],
			deleted: false,
			unshown: false
		};
		for (at += 1; at < lines.length && !next().startsWith("@@ ") && !next().startsWith("diff --git "); at += 1) {
			if (next().startsWith("deleted file mode ")) section.deleted = true;
			if (next().startsWith("Binary files ")) section.unshown = true;
		}
		while (at < lines.length && next().startsWith("@@ ")) {
			const counts = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(next());
			if (counts === null) throw new PatchError("a hunk header did not parse");
			let oldLeft = Number(counts[1] ?? 1);
			let newLine = Number(counts[2]);
			let newLeft = Number(counts[3] ?? 1);
			const hunk = {
				added: [],
				removed: [],
				context: []
			};
			for (at += 1; oldLeft > 0 || newLeft > 0; at += 1) {
				if (at >= lines.length) throw new PatchError("a hunk ended before its header's line counts");
				const line = next();
				const text = line.slice(1);
				if (line.startsWith("\\")) continue;
				if ((line === "" || line.startsWith(" ")) && oldLeft > 0 && newLeft > 0) {
					hunk.context.push(text);
					oldLeft -= 1;
					newLeft -= 1;
					newLine += 1;
				} else if (line.startsWith("-") && oldLeft > 0) {
					hunk.removed.push(text);
					oldLeft -= 1;
				} else if (line.startsWith("+") && newLeft > 0) {
					hunk.added.push({
						line: newLine,
						text
					});
					newLeft -= 1;
					newLine += 1;
				} else throw new PatchError("a hunk line does not fit its header's line counts");
			}
			while (at < lines.length && next().startsWith("\\")) at += 1;
			section.hunks.push(hunk);
		}
		parsed.push(section);
	}
	if (parsed.length !== sections.length) throw new PatchError("the patch holds fewer sections than the name list");
	return parsed;
}
const SNIFF_BYTES = 8e3;
const HEAD_BYTES = 65536;
const UNTRACKED_MAX_BYTES = 1048576;
const UNTRACKED_TOTAL_BYTES = 16777216;
const UNTRACKED_COVERED_TOTAL_BYTES = 16777216;
const SHEBANG_BYTES = 1024;
function readRegular(file, limit, whole) {
	try {
		if (!lstatSync(file).isFile()) return void 0;
		const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
		try {
			const stat = fstatSync(fd);
			if (!stat.isFile() || whole !== void 0 && stat.size > whole) return void 0;
			const buffer = Buffer.alloc(Math.min(stat.size, limit));
			const read = readSync(fd, buffer, 0, buffer.length, 0);
			return buffer.subarray(0, read);
		} finally {
			closeSync(fd);
		}
	} catch {
		return;
	}
}
function isRegularFile(file) {
	try {
		return lstatSync(file).isFile();
	} catch {
		return false;
	}
}
function readsAsText(file) {
	const start = readRegular(file, SNIFF_BYTES);
	return start !== void 0 && !start.includes(0);
}
function decodeUtf16(body) {
	if (body[0] === 255 && body[1] === 254) return body.subarray(2).toString("utf16le");
	if (body[0] !== 254 || body[1] !== 255) return void 0;
	return Buffer.from(body.subarray(2, body.length - body.length % 2)).swap16().toString("utf16le");
}
function readUtf16(file) {
	const mark = readRegular(file, 2);
	if (mark === void 0 || decodeUtf16(mark) === void 0) return void 0;
	const body = readRegular(file, UNTRACKED_MAX_BYTES, UNTRACKED_MAX_BYTES);
	return body === void 0 ? void 0 : decodeUtf16(body);
}
function wholeFile(path, text) {
	const lines = text.split("\n");
	if (lines.at(-1) === "") lines.pop();
	return {
		path,
		added: lines.map((line, at) => ({
			line: at + 1,
			text: line
		})),
		removed: [],
		context: []
	};
}
function holdsNul(lines) {
	return lines.join("\n").slice(0, SNIFF_BYTES).includes("\0");
}
function parseNumstat(output) {
	const fields = output.split("\0");
	const rows = [];
	let index = 0;
	while (index < fields.length) {
		const field = fields[index] ?? "";
		if (field === "") {
			index += 1;
			continue;
		}
		const row = /^(-|\d+)\t(-|\d+)\t([\s\S]*)$/.exec(field);
		if (row === null) throw new GitReadError("diff --numstat", /* @__PURE__ */ new Error("a row did not parse"), "");
		const binary = row[1] === "-";
		const path = row[3] ?? "";
		if (path !== "") {
			rows.push({
				from: path,
				to: path,
				binary
			});
			index += 1;
			continue;
		}
		const from = fields[index + 1];
		const to = fields[index + 2];
		if (from === void 0 || to === void 0) throw new GitReadError("diff --numstat", /* @__PURE__ */ new Error("truncated row"), "");
		rows.push({
			from,
			to,
			binary
		});
		index += 3;
	}
	return rows;
}
const DIFF_PINS = [
	"--no-relative",
	"--no-ext-diff",
	"--no-color",
	"--no-textconv",
	"--ignore-submodules=none"
];
function readSide(runner, root, commit, side, workSections, inside, away) {
	const staged = side === "index" ? ["--staged"] : [];
	const label = side === "index" ? "diff --staged" : "diff";
	const binaries = parseNumstat(runGit(runner, root.dir, `${label} --numstat`, [
		"diff",
		...staged,
		"--numstat",
		"-M",
		"-z",
		...DIFF_PINS,
		commit,
		"--"
	])).filter((row) => row.binary && !readsAsText(join(root.topLevel, row.to)));
	const pathspec = [...new Set(binaries.flatMap((row) => [row.from, row.to]))].map((name) => `:(top,literal,exclude)${name}`);
	const sections = side === "work tree" && pathspec.length === 0 ? workSections : parseNameStatus(runGit(runner, root.dir, `${label} --name-status`, [
		"diff",
		...staged,
		"--name-status",
		"-M",
		"-z",
		...DIFF_PINS,
		commit,
		"--",
		...pathspec
	])).sections;
	const patch = runGit(runner, root.dir, `${label} --text`, [
		"-c",
		"core.quotePath=false",
		"diff",
		...staged,
		"-U3",
		"-W",
		"-M",
		"--text",
		"--no-relative",
		"--no-ext-diff",
		"--no-color",
		"--no-textconv",
		"--src-prefix=a/",
		"--dst-prefix=b/",
		"--inter-hunk-context=0",
		"--submodule=short",
		"--ignore-submodules=none",
		commit,
		"--",
		...pathspec
	]);
	const read = {
		hunks: [],
		outside: /* @__PURE__ */ new Set(),
		skipped: /* @__PURE__ */ new Set(),
		unscanned: [],
		unscannedCode: [],
		scan: {
			hunks: [],
			skipped: /* @__PURE__ */ new Set(),
			unscanned: /* @__PURE__ */ new Set()
		}
	};
	const executable = (name) => {
		return runGit(runner, root.dir, `${label} --raw`, [
			"diff",
			...staged,
			"--raw",
			"-z",
			...DIFF_PINS,
			commit,
			"--",
			`:(top,literal)${name}`
		]).split("\0").some((field) => field.startsWith(":") && field.slice(1).split(" ", 2).includes("100755"));
	};
	const script = (name, shown) => {
		const start = readRegular(join(root.topLevel, name), SHEBANG_BYTES);
		if (start === void 0) return executable(name);
		const first = start.toString("utf8").split("\n", 1)[0] ?? "";
		return first.startsWith("#!") && lineRulesCover(shown, "git", first);
	};
	const notRead = (name, path) => {
		const shown = path ?? away(name);
		const extension = hasCodeExtension(shown);
		const code = extension || script(name, shown);
		if (path !== null) {
			if (code) read.unscanned.push(path);
			else read.skipped.add(path);
			if (code && !extension) read.unscannedCode.push(path);
		}
		const text = side === "work tree" ? readUtf16(join(root.topLevel, name)) : void 0;
		if (text !== void 0) read.scan.hunks.push(wholeFile(shown, text));
		else if (code) read.scan.unscanned.add(shown);
		else read.scan.skipped.add(shown);
	};
	for (const row of binaries) {
		if (inside(row.to) === null) read.outside.add(row.to);
		notRead(row.to, inside(row.to));
	}
	parsePatch(patch, sections).forEach((section, index) => {
		const name = sections[index]?.to ?? "";
		const path = inside(name);
		if (path === null) read.outside.add(name);
		const file = section.deleted ? void 0 : readRegular(join(root.topLevel, name), HEAD_BYTES);
		const lines = section.hunks.flatMap((hunk) => section.deleted ? hunk.removed : hunk.added.map((line) => line.text));
		const sniffed = side === "work tree" ? file : void 0;
		if (section.unshown || (sniffed === void 0 ? holdsNul(lines) : sniffed.subarray(0, SNIFF_BYTES).includes(0))) {
			notRead(name, path);
			return;
		}
		if (path === null) {
			for (const hunk of section.hunks) read.scan.hunks.push({
				path: away(name),
				...hunk
			});
			return;
		}
		const head = file !== void 0 ? file.toString("utf8") : section.deleted ? lines.join("\n").slice(0, HEAD_BYTES) : void 0;
		for (const hunk of section.hunks) read.hunks.push({
			path,
			...hunk,
			...head === void 0 ? {} : { head }
		});
	});
	return read;
}
function readLines(runner, root, commit, sections, untracked, windows) {
	const inside = insideOf(root.prefix, windows);
	const away = awayFrom(root.prefix);
	const work = readSide(runner, root, commit, "work tree", sections, inside, away);
	const index = readSide(runner, root, commit, "index", sections, inside, away);
	const seen = (pick) => {
		const byPath = /* @__PURE__ */ new Map();
		for (const hunk of work.hunks) for (const text of pick(hunk)) byPath.set(hunk.path, (byPath.get(hunk.path) ?? /* @__PURE__ */ new Set()).add(text));
		return byPath;
	};
	const workAdded = seen((hunk) => hunk.added.map((line) => line.text));
	const workRemoved = seen((hunk) => hunk.removed);
	const indexOnly = index.hunks.flatMap((hunk) => {
		const added = hunk.added.filter((line) => workAdded.get(hunk.path)?.has(line.text) !== true);
		const removedAnew = hunk.removed.some((text) => workRemoved.get(hunk.path)?.has(text) !== true);
		return added.length === 0 && !removedAnew ? [] : [{
			...hunk,
			added
		}];
	});
	const hunks = [...work.hunks, ...indexOnly];
	const skipped = /* @__PURE__ */ new Set([...work.skipped, ...index.skipped]);
	const unscanned = [...work.unscanned, ...index.unscanned];
	const outsideAdded = new Set(work.scan.hunks.flatMap((hunk) => hunk.added.map((line) => `${hunk.path}\0${line.text}`)));
	const scanHunks = [...work.scan.hunks, ...index.scan.hunks.flatMap((hunk) => {
		const added = hunk.added.filter((line) => !outsideAdded.has(`${hunk.path}\0${line.text}`));
		return added.length === 0 ? [] : [{
			...hunk,
			added
		}];
	})];
	const scanSkipped = /* @__PURE__ */ new Set([...work.scan.skipped, ...index.scan.skipped]);
	const scanUnscanned = /* @__PURE__ */ new Set([...work.scan.unscanned, ...index.scan.unscanned]);
	const outside = /* @__PURE__ */ new Set([...work.outside, ...index.outside]);
	const unscannedCode = [...work.unscannedCode, ...index.unscannedCode];
	const notShown = (path, shown, code) => {
		if (path !== null) unscanned.push(path);
		if (path !== null && code && !hasCodeExtension(path)) unscannedCode.push(path);
		scanUnscanned.add(shown);
	};
	const source = windows ? "listed" : "git";
	const firstLine = (name) => {
		const start = readRegular(join(root.topLevel, name), SHEBANG_BYTES)?.toString("utf8");
		return start?.startsWith("#!") === true ? start.split("\n", 1)[0] : void 0;
	};
	const covered = new Set(untracked.filter((name) => {
		const path = inside(name);
		return path !== null && (lineRulesCover(path, source, void 0) || lineRulesCover(path, source, firstLine(name)));
	}));
	const spent = {
		covered: 0,
		rest: 0
	};
	for (const name of [...covered, ...untracked.filter((entry) => !covered.has(entry))]) {
		const path = inside(name);
		const shown = path ?? away(name);
		const pool = covered.has(name) ? "covered" : "rest";
		const total = pool === "covered" ? UNTRACKED_COVERED_TOTAL_BYTES : UNTRACKED_TOTAL_BYTES;
		const code = hasCodeExtension(shown) || pool === "covered";
		if (path === null) outside.add(name);
		if (spent[pool] >= total) {
			notShown(path, shown, code);
			continue;
		}
		const file = join(root.topLevel, name);
		const body = readRegular(file, UNTRACKED_MAX_BYTES, UNTRACKED_MAX_BYTES);
		const decoded = body === void 0 ? void 0 : decodeUtf16(body);
		if (body === void 0 || decoded === void 0 && body.subarray(0, SNIFF_BYTES).includes(0)) {
			if (code && isRegularFile(file)) {
				notShown(path, shown, code);
				continue;
			}
			if (path !== null) skipped.add(path);
			scanSkipped.add(shown);
			continue;
		}
		if (spent[pool] + body.length > total) {
			spent[pool] = total;
			notShown(path, shown, code);
			continue;
		}
		spent[pool] += body.length;
		if (decoded !== void 0) {
			if (path !== null && code) {
				unscanned.push(path);
				if (!hasCodeExtension(path)) unscannedCode.push(path);
			} else if (path !== null) skipped.add(path);
			scanHunks.push(wholeFile(shown, decoded));
			continue;
		}
		const text = body.toString("utf8");
		if (path === null) scanHunks.push(wholeFile(shown, text));
		else hunks.push({
			...wholeFile(path, text),
			head: text.slice(0, HEAD_BYTES)
		});
	}
	const read = new Set(scanHunks.map((hunk) => hunk.path));
	return {
		hunks,
		skipped: skipped.size,
		unscanned: [...new Set(unscanned)],
		unscannedCode: [...new Set(unscannedCode)],
		scan: {
			hunks: scanHunks,
			skipped: [...scanSkipped].filter((path) => !read.has(path)),
			unscanned: [.../* @__PURE__ */ new Set([...unscanned, ...scanUnscanned])].filter((path) => !read.has(path)),
			outside: outside.size
		}
	};
}
function insideOf(prefix, windows) {
	return (name) => toProjectPath(prefix, name) ?? (windows ? toProjectPath(prefix, name.replaceAll("\\", "/")) : null);
}
function awayFrom(prefix) {
	const up = "../".repeat(prefix.split("/").filter((part) => part !== "").length);
	return (name) => `${up}${name}`;
}
function readChange(runner, root, commit, windows) {
	const { dir: cwd, prefix } = root;
	const diff = parseNameStatus(runGit(runner, cwd, "diff --name-status", [
		"diff",
		"--name-status",
		"-M",
		"-z",
		"--no-relative",
		"--no-ext-diff",
		"--no-color",
		"--no-textconv",
		"--ignore-submodules=none",
		commit,
		"--"
	]));
	const untracked = runGit(runner, root.topLevel, "ls-files --others", [
		"ls-files",
		"--others",
		"--exclude-standard",
		"--full-name",
		"-z"
	]).split("\0").filter((path) => path !== "");
	const outside = /* @__PURE__ */ new Set();
	const project = (path) => {
		const inside = toProjectPath(prefix, path);
		if (inside !== null) return inside;
		outside.add(path);
		return windows ? toProjectPath(prefix, path.replaceAll("\\", "/")) : null;
	};
	const paths = [];
	const renames = [];
	for (const path of [...diff.paths, ...untracked]) {
		const inside = project(path);
		if (inside !== null) paths.push(inside);
	}
	for (const rename of diff.renames) {
		const from = project(rename.from);
		const to = project(rename.to);
		if (from !== null && to !== null) renames.push({
			from,
			to
		});
		else if (from !== null) paths.push(from);
		else if (to !== null) paths.push(to);
	}
	let lines;
	try {
		lines = readLines(runner, root, commit, diff.sections, untracked, windows);
	} catch (err) {
		if (err instanceof GitReadError) lines = { failed: describeGitFailure(err) };
		else if (err instanceof PatchError) lines = { failed: err.message };
		else throw err;
	}
	return {
		paths,
		renames,
		outside: [...outside],
		lines
	};
}
function gitSaidNo(err, status) {
	const { code, status: exit } = err;
	return code === void 0 && typeof exit === "number" && (status === void 0 || exit === status);
}
function baseEntryType(runner, cwd, treeish, path) {
	const output = runGit(runner, cwd, "ls-tree", [
		"--literal-pathspecs",
		"ls-tree",
		"-z",
		"--full-tree",
		treeish,
		"--",
		path
	]);
	for (const record of output.split("\0")) {
		const tab = record.indexOf("	");
		if (tab !== -1 && record.slice(tab + 1) === path) return record.slice(0, tab).split(" ")[1] ?? null;
	}
	return null;
}
function baseHoldsStateFolder(runner, cwd, treeish, prefix) {
	return baseEntryType(runner, cwd, treeish, `${prefix}.stamity`) === "tree";
}
function readCwdPrefix(runner, cwd) {
	return runGit(runner, cwd, "rev-parse --show-prefix", ["rev-parse", "--show-prefix"]).replace(/\r?\n$/, "");
}
function findProjectRoot(runner, cwd, cwdPrefix, treeish) {
	const segments = cwdPrefix.split("/").filter((segment) => segment !== "");
	let start = cwd;
	try {
		start = realpathSync(cwd);
	} catch {}
	const topLevel = resolve(start, ...Array.from({ length: segments.length }, () => ".."));
	for (let depth = segments.length; depth > 0; depth -= 1) {
		const prefix = `${segments.slice(0, depth).join("/")}/`;
		if (baseHoldsStateFolder(runner, cwd, treeish, prefix)) return {
			dir: resolve(start, ...Array.from({ length: segments.length - depth }, () => "..")),
			prefix,
			topLevel
		};
	}
	return {
		dir: topLevel,
		prefix: "",
		topLevel
	};
}
const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
function resolveBase(runner, cwd, ref) {
	let output;
	try {
		output = runner([
			"rev-parse",
			"--verify",
			"--quiet",
			`${ref}^{commit}`
		], cwd);
	} catch (err) {
		if (gitSaidNo(err, 1)) return null;
		throw new GitReadError("rev-parse --verify", err, cwd);
	}
	const id = output.trim();
	return OBJECT_ID.test(id) ? id : null;
}
function readBaseClassFile(runner, root, commit) {
	const path = `${root.prefix}${CLASS_FILE}`;
	const type = baseEntryType(runner, root.dir, commit, path);
	if (type === null) return { state: "absent" };
	const spec = `${commit}:${path}`;
	if (type !== "blob") return {
		state: "invalid",
		error: `the base holds a ${type} there, not a file`,
		raising: []
	};
	const parsed = parseClassFile(runGit(runner, root.dir, "cat-file blob", [
		"cat-file",
		"blob",
		spec
	]));
	if (parsed.ok) return {
		state: "valid",
		rules: parsed.rules,
		testInputs: parsed.testInputs,
		testGlobs: parsed.testGlobs
	};
	return {
		state: "invalid",
		error: parsed.errors[0] ?? "refused",
		raising: parsed.raising
	};
}
function rulesFrom(classFile) {
	if (classFile.state === "valid") return { rules: mergeRules(BUILT_IN_RULES, classFile.rules) };
	if (classFile.state === "absent") return {
		rules: BUILT_IN_RULES,
		reason: `the base holds no ${CLASS_FILE}, so only the built-in rules apply`
	};
	const invalid = `the base copy of ${CLASS_FILE} is invalid (${classFile.error})`;
	if (classFile.raising.length === 0) return {
		rules: BUILT_IN_RULES,
		reason: `${invalid}: no map was read from it, so the class is at least product`
	};
	return {
		rules: mergeRules(BUILT_IN_RULES, classFile.raising),
		reason: `${invalid}: only its product, public-contract and security-sensitive entries were read, so the class is at least product`
	};
}
const NO_MAP = {
	select: {},
	dir: null
};
const TEST_SOURCE_MAX_BYTES = 8388608;
const LITERAL_QUOTED = 60;
function readTestSources(runner, root, testGlobs, changed) {
	const tracked = runGit(runner, root.dir, "ls-files --cached", [
		"ls-files",
		"--cached",
		"-z"
	]).split("\0").filter((path) => path !== "");
	const known = /* @__PURE__ */ new Set([...tracked, ...changed]);
	const sources = [];
	for (const test of tracked.filter((path) => isTestSource(path, testGlobs))) {
		const file = join(root.dir, test);
		if (!existsSync(file)) continue;
		let text;
		try {
			const stat = lstatSync(file);
			if (stat.isFile() && stat.size <= TEST_SOURCE_MAX_BYTES) text = readFileSync(file, "utf8");
		} catch {
			text = void 0;
		}
		if (text === void 0) return { every: `the test source ${test} is not one readable file, so every test runs` };
		const reads = extractReadPaths(text, known);
		if (!Array.isArray(reads)) return { every: `the test source ${test} holds the glob literal ${JSON.stringify(reads.refused.slice(0, LITERAL_QUOTED))}${reads.refused.length > LITERAL_QUOTED ? ` (${reads.refused.length} characters)` : ""}, which ${reads.error}, so every test runs` };
		sources.push({
			test,
			reads
		});
	}
	return sources;
}
function selectFor(plan, result) {
	if ("every" in plan) return {
		full: true,
		files: [],
		reason: plan.every
	};
	const selection = selectTests({
		...plan.select,
		paths: result.byPath.map((entry) => entry.path),
		class: result.class
	});
	const { dir } = plan;
	const missing = dir === null ? [] : selection.files.filter((file) => !existsSync(join(dir, file)));
	if (missing.length === 0) return selection;
	return {
		full: true,
		files: [],
		reason: `the selected ${namePaths(missing)} is not in the work tree, so every test runs`
	};
}
function failClosed(reason) {
	return {
		class: "product",
		byPath: [],
		checks: [...CLASS_CHECKS.product],
		lenses: [],
		reason
	};
}
function withReasons(result, reasons) {
	if (reasons.length === 0) return result;
	return {
		...result,
		reason: [...reasons, result.reason].filter((part) => part !== "").join("; ")
	};
}
const SECURITY_LENS = "stamity-security";
function raiseTo(result, floor) {
	if (floor === "security-sensitive" && result.class === floor) return keepSecurityLens(result);
	if (CLASS_ORDER.indexOf(result.class) <= CLASS_ORDER.indexOf(floor)) return result;
	const lenses = floor === "security-sensitive" ? [SECURITY_LENS, ...result.lenses.filter((lens) => lens !== SECURITY_LENS)] : result.lenses;
	return {
		...result,
		class: floor,
		checks: [...CLASS_CHECKS[floor]],
		lenses
	};
}
const PATHS_NAMED = 5;
function namePaths(paths) {
	const named = paths.slice(0, PATHS_NAMED).join(", ");
	return paths.length > PATHS_NAMED ? `${named} and ${paths.length - PATHS_NAMED} more` : named;
}
function applyReadFloors(result, change, source) {
	let raised = result;
	const reasons = [];
	if (change.outside.length > 0) {
		const count = change.outside.length;
		reasons.push(`${count} changed path${count === 1 ? "" : "s"} outside the project left out, so the class is at least product`);
		raised = raiseTo(raised, "product");
		const byRule = /* @__PURE__ */ new Map();
		for (const path of change.outside) {
			const rule = outsideSecurityRule(path, source);
			if (rule !== void 0) byRule.set(rule, [...byRule.get(rule) ?? [], path]);
		}
		for (const [rule, paths] of byRule) {
			const verb = paths.length === 1 ? "matches" : "match";
			reasons.push(`${namePaths(paths)} outside the project ${verb} ${rule}, so the class is security-sensitive`);
			raised = raiseTo(raised, "security-sensitive");
		}
	}
	const unreadable = [...change.paths, ...change.renames.flatMap((rename) => [rename.from, rename.to])].filter((path) => path.includes("�"));
	if (unreadable.length > 0) {
		reasons.push(`not valid UTF-8, so unreadable by name and the class is at least product: ${namePaths(unreadable)}`);
		raised = raiseTo(raised, "product");
	}
	if ("failed" in change.lines) {
		reasons.push(`the changed lines could not be read (${change.lines.failed}), so the class is security-sensitive and its lens reads them`);
		raised = raiseTo(raised, "security-sensitive");
	} else if (change.lines.skipped > 0) {
		const { skipped } = change.lines;
		reasons.push(`${skipped} changed file${skipped === 1 ? "" : "s"} not read line by line (binary, over 1 MiB, or not a regular file)`);
	}
	return withReasons(raised, reasons);
}
function applyNameFloor(result) {
	const altered = result.byPath.map((entry) => entry.path).filter((path) => sanitizeLabel(path) !== path);
	if (altered.length === 0) return result;
	return withReasons(raiseTo(result, "product"), [`names the report cannot show as they are, so the class is at least product: ${namePaths(altered)}`]);
}
const NPM_LOCKFILE = "package-lock.json";
function readLockfiles(runner, root, commit, paths) {
	const lockfiles = [];
	for (const path of paths) {
		if (path.slice(path.lastIndexOf("/") + 1) !== NPM_LOCKFILE) continue;
		const head = readRegular(join(root.dir, path), GATE_GIT_MAX_BUFFER, GATE_GIT_MAX_BUFFER);
		if (head === void 0) continue;
		let base = null;
		let baseFailure;
		let staged = "unread";
		if (commit !== null) {
			try {
				base = runGit(runner, root.dir, "show", [
					"show",
					"--no-textconv",
					`${commit}:${root.prefix}${path}`
				]);
			} catch (err) {
				if (!(err instanceof GitReadError)) throw err;
				baseFailure = describeGitFailure(err);
			}
			try {
				const index = runGit(runner, root.dir, "show", [
					"show",
					"--no-textconv",
					`:${root.prefix}${path}`
				]);
				staged = !index.includes("�") && Buffer.from(index, "utf8").equals(head) ? "same" : "differs";
			} catch (err) {
				if (!(err instanceof GitReadError)) throw err;
			}
		}
		lockfiles.push({
			path,
			base,
			head: head.toString("utf8"),
			staged,
			...baseFailure === void 0 ? {} : { baseFailure }
		});
	}
	return lockfiles;
}
function classify(cwd, listed, ref) {
	if (listed !== void 0 && ref === void 0) return {
		result: classifyChange({
			paths: listed,
			base: "absent"
		}),
		base: null,
		tests: NO_MAP
	};
	const runner = gitCheckRunner({
		timeoutMs: GATE_GIT_TIMEOUT_MS,
		maxBuffer: GATE_GIT_MAX_BUFFER
	});
	try {
		const cwdPrefix = readCwdPrefix(runner, cwd);
		const commit = ref === void 0 ? null : resolveBase(runner, cwd, ref);
		if (ref !== void 0 && commit === null) return { failed: `the base ${ref} could not be read: it does not resolve to a commit here, so no class is given` };
		const baseState = commit === null ? "absent" : "given";
		const reasons = [];
		const treeish = commit ?? "HEAD";
		const root = findProjectRoot(runner, cwd, cwdPrefix, treeish);
		const classFile = commit === null ? void 0 : readBaseClassFile(runner, root, commit);
		const { rules, reason: fileReason } = classFile === void 0 ? { rules: BUILT_IN_RULES } : rulesFrom(classFile);
		if (fileReason !== void 0) reasons.push(fileReason);
		let result;
		if (listed !== void 0) result = classifyChange({
			paths: listed,
			base: baseState
		}, rules);
		else {
			const windows = process.platform === "win32";
			const source = windows ? "listed" : "git";
			const change = readChange(runner, root, treeish, windows);
			const lines = "failed" in change.lines ? {} : {
				hunks: change.lines.hunks,
				unscanned: change.lines.unscanned,
				unscannedCode: change.lines.unscannedCode
			};
			const lockfiles = readLockfiles(runner, root, commit, change.paths);
			result = floorUnclassified(runner, root.dir, commit, applyReadFloors(classifyChange({
				paths: change.paths,
				renames: change.renames,
				base: baseState,
				source,
				...lines,
				lockfiles
			}, rules), change, source));
		}
		if (classFile?.state === "invalid") result = raiseTo(result, "product");
		let tests = NO_MAP;
		if (classFile?.state === "valid" && classFile.testInputs.length > 0) {
			const { testGlobs, testInputs: map } = classFile;
			let sources;
			try {
				sources = readTestSources(runner, root, testGlobs, result.byPath.map((entry) => entry.path));
			} catch (err) {
				if (!(err instanceof GitReadError)) throw err;
				sources = { every: `${describeGitFailure(err)}, so every test runs` };
			}
			tests = Array.isArray(sources) ? {
				select: {
					map,
					testSources: sources
				},
				dir: root.dir
			} : sources;
		}
		return {
			result: withReasons(result, reasons),
			base: commit,
			tests
		};
	} catch (err) {
		if (!(err instanceof GitReadError)) throw err;
		return {
			result: failClosed(`the change could not be read (${describeGitFailure(err)}), so the class is product`),
			base: null,
			tests: { every: "the change could not be read, so every test runs" }
		};
	}
}
function list(values) {
	return values.length === 0 ? "none" : values.join(", ");
}
function runClassify(ctx, opts) {
	const listed = opts["paths"];
	const ref = opts["base"];
	const classified = classify(ctx.app.runtime.cwd, listed, ref);
	if ("failed" in classified) {
		const reason = sanitizeLabel(classified.failed);
		ctx.io.err(`classify failed: ${reason}\n`);
		return {
			exitCode: 1,
			json: {
				subcommand: CLASSIFY,
				base: null,
				reason
			}
		};
	}
	const { base } = classified;
	const result = applyNameFloor(classified.result);
	const tests = selectFor(classified.tests, result);
	const lines = [
		`class: ${result.class}`,
		`checks: ${list(result.checks)}`,
		`lenses: ${list(result.lenses)}`,
		sanitizeLabel(`tests: ${tests.full ? "all" : list(tests.files)} (${tests.reason})`),
		`reason: ${sanitizeLabel(result.reason)}`,
		...result.byPath.map((entry) => sanitizeLabel(`  ${entry.path}  ${entry.class}  (${entry.rule})`))
	];
	ctx.io.out(`${lines.join("\n")}\n`);
	return {
		exitCode: 0,
		json: {
			subcommand: CLASSIFY,
			base,
			paths: result.byPath.map((entry) => sanitizeLabel(entry.path)),
			class: result.class,
			checks: result.checks,
			lenses: result.lenses,
			reason: sanitizeLabel(result.reason),
			byPath: result.byPath.map((entry) => ({
				path: sanitizeLabel(entry.path),
				class: entry.class,
				rule: sanitizeLabel(entry.rule)
			})),
			tests: {
				full: tests.full,
				files: tests.files.map((file) => sanitizeLabel(file)),
				reason: sanitizeLabel(tests.reason)
			}
		}
	};
}
const SHORT_COMMIT = 12;
function readHistory(runner, root, base, windows) {
	const inside = insideOf(root.prefix, windows);
	const away = awayFrom(root.prefix);
	const commits = runGit(runner, root.dir, "rev-list", [
		"rev-list",
		"--reverse",
		"--no-merges",
		`${base}..HEAD`,
		"--"
	]).split("\n").filter((line) => line !== "");
	const history = {
		files: [],
		skipped: [],
		unscanned: []
	};
	for (const commit of commits) {
		const pins = [
			"-r",
			"--root",
			"--no-commit-id",
			"-M",
			...DIFF_PINS
		];
		const { sections } = parseNameStatus(runGit(runner, root.dir, "diff-tree --name-status", [
			"diff-tree",
			...pins,
			"--name-status",
			"-z",
			commit,
			"--"
		]));
		parsePatch(runGit(runner, root.dir, "diff-tree --text", [
			"-c",
			"core.quotePath=false",
			"diff-tree",
			...pins,
			"-p",
			"-U0",
			"--text",
			"--src-prefix=a/",
			"--dst-prefix=b/",
			"--inter-hunk-context=0",
			"--submodule=short",
			commit,
			"--"
		]), sections).forEach((section, index) => {
			const name = sections[index]?.to ?? "";
			const shown = inside(name) ?? away(name);
			const added = section.hunks.flatMap((hunk) => hunk.added);
			if (section.unshown || holdsNul(added.map((line) => line.text))) (hasCodeExtension(shown) ? history.unscanned : history.skipped).push(shown);
			else if (added.length > 0) history.files.push({
				path: shown,
				commit: commit.slice(0, SHORT_COMMIT),
				added
			});
		});
	}
	return history;
}
function scanChange(cwd, ref) {
	const scope = ref === void 0 ? "uncommitted" : "since-base";
	const runner = gitCheckRunner({
		timeoutMs: GATE_GIT_TIMEOUT_MS,
		maxBuffer: GATE_GIT_MAX_BUFFER
	});
	try {
		const cwdPrefix = readCwdPrefix(runner, cwd);
		const commit = ref === void 0 ? null : resolveBase(runner, cwd, ref);
		if (ref !== void 0 && commit === null) return {
			base: null,
			scope,
			failed: `the base ${ref} does not resolve to a commit here`
		};
		const treeish = commit ?? "HEAD";
		const root = findProjectRoot(runner, cwd, cwdPrefix, treeish);
		const windows = process.platform === "win32";
		const { lines } = readChange(runner, root, treeish, windows);
		if ("failed" in lines) return {
			base: commit,
			scope,
			failed: `the changed lines could not be read (${lines.failed})`
		};
		const current = [...lines.hunks, ...lines.scan.hunks];
		let history = {
			files: [],
			skipped: [],
			unscanned: []
		};
		try {
			if (commit !== null) history = readHistory(runner, root, commit, windows);
		} catch (err) {
			if (!(err instanceof GitReadError) && !(err instanceof PatchError)) throw err;
			return {
				base: commit,
				scope,
				failed: `the commits since the base could not be read (${err instanceof GitReadError ? describeGitFailure(err) : err.message})`
			};
		}
		const added = new Set(current.flatMap((file) => file.added.map((line) => `${file.path}\0${line.text}`)));
		const past = history.files.flatMap((file) => {
			const left = file.added.filter((line) => !added.has(`${file.path}\0${line.text}`));
			return left.length === 0 ? [] : [{
				...file,
				added: left
			}];
		});
		const files = [...current, ...past];
		const unread = linesPastCap(files).map((at) => `${at.path}:${at.line}${at.commit === void 0 ? "" : ` (commit ${at.commit})`}`);
		const one = unread.length === 1;
		return {
			...unread.length === 0 ? {} : { incomplete: `${unread.length} added line${one ? "" : "s"} longer than ${SCAN_LINE_MAX_CHARS} characters ${one ? "was" : "were"} not scanned: ${unread.join(", ")}` },
			base: commit,
			scope,
			hits: scanAddedLines(files),
			scanned: new Set(files.map((file) => file.path)).size,
			skipped: [.../* @__PURE__ */ new Set([...lines.scan.skipped, ...history.skipped])],
			outside: lines.scan.outside,
			unscanned: [.../* @__PURE__ */ new Set([...lines.scan.unscanned, ...history.unscanned])]
		};
	} catch (err) {
		if (!(err instanceof GitReadError)) throw err;
		return {
			base: null,
			scope,
			failed: describeGitFailure(err)
		};
	}
}
function runScan(ctx, opts) {
	const outcome = scanChange(ctx.app.runtime.cwd, opts["base"]);
	const { base, scope } = outcome;
	const scopeLine = scope === "uncommitted" ? "scope: uncommitted (no base given: committed work is not scanned)" : `scope: since-base ${base ?? ""}`;
	if ("failed" in outcome) {
		const reason = sanitizeLabel(outcome.failed);
		ctx.io.err(`${scopeLine}\nscan failed: ${reason}\n`);
		return {
			exitCode: 1,
			json: {
				subcommand: SCAN,
				base,
				scope,
				reason
			}
		};
	}
	const hits = outcome.hits.map((hit) => ({
		...hit,
		path: sanitizeLabel(hit.path)
	}));
	const skipped = outcome.skipped.map((path) => sanitizeLabel(path));
	const unscanned = outcome.unscanned.map((path) => sanitizeLabel(path));
	const incomplete = outcome.incomplete === void 0 ? void 0 : sanitizeLabel(outcome.incomplete);
	if (incomplete !== void 0) ctx.io.err(`scan incomplete: ${incomplete}\n`);
	ctx.io.out(`${[
		scopeLine,
		`hits: ${hits.length === 0 ? "none" : String(hits.length)}`,
		...hits.map((hit) => `  ${hit.path}:${hit.line}${hit.commit === void 0 ? "" : ` (commit ${hit.commit})`}  ${hit.rule}`),
		`scanned: ${outcome.scanned}; outside the project: ${outcome.outside}`,
		`skipped: ${list(skipped)}`,
		`unscanned: ${list(unscanned)}`
	].join("\n")}\n`);
	return {
		exitCode: hits.length === 0 && incomplete === void 0 ? 0 : 1,
		json: {
			subcommand: SCAN,
			base,
			scope,
			hits,
			scanned: outcome.scanned,
			skipped,
			outside: outcome.outside,
			unscanned,
			...incomplete === void 0 ? {} : { reason: incomplete }
		}
	};
}
const gateCommand = {
	name: "gate",
	summary: "classify a change by its paths, or scan its added lines for secrets (plumbing)",
	hidden: true,
	mutating: false,
	configure(cmd) {
		cmd.addArgument(new Argument("<subcommand>", "which gate action to run").choices([CLASSIFY, SCAN])).addOption(new Option("--base <ref>", "the base the change is read against (default: HEAD, reported as no base)").argParser(parseBaseRef)).option("--paths <path...>", "classify these paths by path rules instead of reading the change from git").hook("preAction", (command) => {
			if (command.processedArgs[0] === SCAN && command.opts()["paths"] !== void 0) command.error("error: --paths applies to classify only; scan reads the change from git", { exitCode: 2 });
		});
	},
	run(ctx, opts, args) {
		return Promise.resolve(args[0] === SCAN ? runScan(ctx, opts) : runClassify(ctx, opts));
	}
};
const POINT_TO_BASE = "pass --base <the commit the work started from> to classify it";
function shortRef(ref) {
	return ref.replace(/^refs\/(?:remotes|heads)\//, "");
}
function unclassifiedCommits(runner, cwd) {
	let reference = "its upstream";
	try {
		let branch = null;
		try {
			branch = runner([
				"symbolic-ref",
				"-q",
				"HEAD"
			], cwd).trim();
		} catch (err) {
			if (!gitSaidNo(err, 1)) throw new GitReadError("symbolic-ref", err, cwd);
		}
		let upstream = "";
		if (branch !== null && branch !== "") {
			const rows = runGit(runner, cwd, "for-each-ref", [
				"for-each-ref",
				"--format=%(refname)%00%(upstream)",
				branch
			]);
			for (const row of rows.split(/\r?\n/)) {
				const [name, merge] = row.split("\0");
				if (name === branch && merge !== void 0) upstream = merge;
			}
		}
		let range;
		if (upstream !== "") {
			reference = shortRef(upstream);
			const commit = resolveBase(runner, cwd, upstream);
			if (commit === null) return `its upstream ${reference} does not resolve, so the committed work HEAD holds could not be read and the class is at least product; ${POINT_TO_BASE}`;
			range = [`${commit}..HEAD`];
		} else {
			reference = "every remote-tracking ref";
			if (!hasRemoteTrackingRef(runner, cwd)) return void 0;
			range = [
				"HEAD",
				"--not",
				"--remotes"
			];
		}
		const count = Number.parseInt(runGit(runner, cwd, "rev-list", [
			"rev-list",
			"--count",
			...range,
			"--"
		]).trim(), 10);
		if (!Number.isInteger(count)) throw new GitReadError("rev-list", /* @__PURE__ */ new Error("no count"), cwd);
		if (count === 0) return void 0;
		return `HEAD holds ${`${count} commit${count === 1 ? "" : "s"}`} ${reference} lacks, committed work no base classified, so the class is at least product; ${POINT_TO_BASE}`;
	} catch (err) {
		if (!(err instanceof GitReadError)) throw err;
		return `the commits HEAD holds beyond ${reference} could not be read (${describeGitFailure(err)}), so the class is at least product; ${POINT_TO_BASE}`;
	}
}
function hasRemoteTrackingRef(runner, cwd) {
	if (runGit(runner, cwd, "for-each-ref", [
		"for-each-ref",
		"--count=1",
		"--format=%(refname)",
		"refs/remotes"
	]).trim() !== "") return true;
	return runGit(runner, cwd, "remote", ["remote"]).split(/\r?\n/).filter((name) => name !== "").some((name) => {
		try {
			runner([
				"symbolic-ref",
				"-q",
				`refs/remotes/${name}/HEAD`
			], cwd);
			return true;
		} catch (err) {
			if (gitSaidNo(err, 1)) return false;
			throw new GitReadError("symbolic-ref", err, cwd);
		}
	});
}
function floorUnclassified(runner, cwd, commit, result) {
	const unread = commit === null ? unclassifiedCommits(runner, cwd) : void 0;
	return unread === void 0 ? result : withReasons(raiseTo(result, "product"), [unread]);
}
//#endregion
//#region src/cli/commands/handoff.ts
const PREPARE = "prepare";
const RESUME = "resume";
const LIST = "list";
const COMPLETE = "complete";
const PRUNE = "prune";
const HANDOFFS_DIR = "handoffs";
const ARCHIVE_DIR = "archive";
const HANDOFF_FILE_EXTENSION = ".md";
const MS_PER_DAY = 864e5;
function beginFrame(id) {
	return `--- BEGIN HANDOFF DATA ${id} (user-tier, non-authoritative) ---`;
}
function endFrame(id) {
	return `--- END HANDOFF DATA ${id} ---`;
}
function handoffSlug(title) {
	return title.trim().toLowerCase().replace(/\s+/g, "-");
}
function serializeHandoff(ctx, frontmatter, body) {
	return ctx.engine.content.frontmatter.composeFrontmatter({
		id: frontmatter.id,
		status: frontmatter.status,
		created: frontmatter.created,
		expires: frontmatter.expires,
		summary: frontmatter.summary,
		fromTool: frontmatter.fromTool,
		toTool: frontmatter.toTool,
		gitRef: frontmatter.gitRef,
		integrity: frontmatter.integrity
	}, body);
}
function text$2(opts, key) {
	const value = opts[key];
	return typeof value === "string" ? value : "";
}
function optionalText$1(opts, key) {
	const value = opts[key];
	return typeof value === "string" && value !== "" ? value : void 0;
}
function toolFlag(opts, key) {
	const value = optionalText$1(opts, key);
	return value !== void 0 && VALID_TOOLS.has(value) ? value : void 0;
}
function missingFlag$1(mode, flag) {
	return new CliFailure({
		code: "VALIDATION_ERROR",
		message: `handoff ${mode} needs ${flag}`,
		why: `${flag} is required by ${mode} and unused by the other modes, so it is checked here rather than by the argument parser`,
		next: `re-run with ${flag} <value>`
	});
}
async function requireStateDir$2(rootDir) {
	try {
		await stat(join(rootDir, STATE_DIR));
	} catch {
		throw new CliFailure({
			code: "VALIDATION_ERROR",
			message: `this repo is not initialised — there is no ${STATE_DIR}/ directory to write a handoff into`,
			why: `handoff is invoked by generated agent content, so it refuses rather than minting ${STATE_DIR}/ in whatever directory the caller happened to be in`,
			next: `run: ${packageCommand("init")}`
		});
	}
}
async function resolveBody$1(ctx, bodyFile) {
	if (bodyFile !== void 0) {
		const path = isAbsolute(bodyFile) ? bodyFile : resolve(ctx.app.runtime.cwd, bodyFile);
		try {
			return await readFile(path, "utf8");
		} catch (cause) {
			throw new CliFailure({
				code: "FS_ERROR",
				message: `--body-file ${bodyFile} could not be read`,
				why: cause instanceof Error ? cause.message : String(cause),
				next: "point --body-file at a readable file, or drop the flag and pipe the body on stdin"
			});
		}
	}
	if (ctx.terminal.stdinIsTTY) return "";
	return await readAll$2(ctx.promptIo.input, ctx.engine.guard.promptGuard.MAX_USER_CONTENT_LENGTH);
}
async function readAll$2(input, maxBytes) {
	const chunks = [];
	let total = 0;
	for await (const chunk of input) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8");
		total += buffer.byteLength;
		if (total > maxBytes) throw new CliFailure({
			code: "VALIDATION_ERROR",
			message: `the body piped on stdin is over the ${maxBytes} byte input ceiling`,
			why: "a handoff is state, not a transcript; the store caps one body far below this ceiling",
			next: "compress the narrative, or split the work across separate handoffs"
		});
		chunks.push(buffer);
	}
	return Buffer.concat(chunks).toString("utf8");
}
function refuse$1(ctx, mode, subject, errors) {
	const doc = {
		code: "VALIDATION_ERROR",
		message: `handoff ${mode} refused ${JSON.stringify(subject)}`,
		why: errors.join(" "),
		next: `fix the part the rule above names, then re-run the handoff ${mode}`
	};
	if (!ctx.json) ctx.io.err(`${renderFailureHuman(doc, ctx.palette)}\n`);
	return {
		exitCode: 1,
		json: {
			error: doc,
			mode,
			subject,
			errors: [...errors]
		}
	};
}
const runGitCheck = gitCheckRunner();
function git(cwd, args) {
	try {
		return runGitCheck(args, cwd).trim();
	} catch {
		return null;
	}
}
function currentGitRef(cwd) {
	const branch = git(cwd, ["branch", "--show-current"]);
	const sha = git(cwd, [
		"rev-parse",
		"--short",
		"HEAD"
	]);
	if (branch === null || branch === "" || sha === null || sha === "") return null;
	return `${branch}@${sha}`;
}
function recordedBranch(ref) {
	const at = ref.lastIndexOf("@");
	const branch = at === -1 ? ref : ref.slice(0, at);
	return branch === "" ? null : branch;
}
function recordedBranchIsGone(cwd, ref) {
	if (ref === void 0) return false;
	const branch = recordedBranch(ref);
	if (branch === null) return false;
	return git(cwd, [
		"rev-parse",
		"--verify",
		"--quiet",
		`refs/heads/${branch}`
	]) === null;
}
async function runPrepare(ctx, opts) {
	const rootDir = ctx.app.runtime.cwd;
	await requireStateDir$2(rootDir);
	const title = text$2(opts, "title").trim();
	if (title === "") throw missingFlag$1(PREPARE, "--title");
	const summary = text$2(opts, "summary").trim();
	if (summary === "") throw missingFlag$1(PREPARE, "--summary");
	const fromTool = toolFlag(opts, "fromTool");
	if (fromTool === void 0) throw missingFlag$1(PREPARE, "--from-tool");
	const toTool = toolFlag(opts, "toTool");
	const { store, validation } = ctx.engine.handoffs;
	if (summary.length > validation.MAX_SUMMARY_LENGTH) return refuse$1(ctx, PREPARE, title, [`\`summary\` is ${summary.length} chars, over ${validation.MAX_SUMMARY_LENGTH}. Keep it to one line; the detail belongs in the body.`]);
	const body = await resolveBody$1(ctx, optionalText$1(opts, "bodyFile"));
	const now = ctx.app.runtime.clock.now();
	const gitRef = optionalText$1(opts, "gitRef") ?? currentGitRef(rootDir) ?? void 0;
	if (gitRef === void 0) ctx.io.err(`warning: no git ref could be resolved in ${rootDir}, so the handoff records none and a resume cannot measure drift against it.\n`);
	if (ctx.dryRun) return await dryRunPrepare(ctx, {
		title,
		summary,
		body,
		fromTool,
		toTool,
		gitRef,
		now
	});
	let written;
	try {
		written = await store.writeHandoff({
			rootDir,
			slug: handoffSlug(title),
			body,
			summary,
			fromTool,
			...toTool === void 0 ? {} : { toTool },
			...gitRef === void 0 ? {} : { gitRef },
			now
		});
	} catch (cause) {
		if (cause instanceof EngineError && cause.code === "VALIDATION_ERROR") return refuse$1(ctx, PREPARE, title, [cause.message]);
		throw cause;
	}
	const stored = await store.readHandoff(rootDir, written.id);
	if (stored === null || !validation.verifyHandoffIntegrity(stored)) throw new CliFailure({
		code: "INTEGRITY_ERROR",
		message: `the handoff written to ${written.path} did not read back with a verifying digest`,
		why: "the file changed between the write and the read-back, or it never landed",
		next: "inspect that file, then re-run the prepare"
	});
	ctx.io.out(`Prepared ${written.id} -> ${written.path}\n`);
	return {
		exitCode: 0,
		json: {
			id: written.id,
			path: written.path,
			handoff: stored.frontmatter
		}
	};
}
async function dryRunPrepare(ctx, draft) {
	const { validation } = ctx.engine.handoffs;
	const dir = join(ctx.app.runtime.cwd, STATE_DIR, HANDOFFS_DIR);
	const report = await validation.validateHandoffsDirectory(dir);
	if (report.activeCount >= validation.MAX_ACTIVE_HANDOFFS_PER_REPO) return refuse$1(ctx, PREPARE, draft.title, [`${dir} already holds ${report.activeCount} unfinished handoffs, the maximum of ${validation.MAX_ACTIVE_HANDOFFS_PER_REPO}. Archive the ones that are done before writing another.`]);
	const id = validation.generateHandoffId(handoffSlug(draft.title), draft.now);
	const body = `${draft.body.trim()}\n`;
	const expiryMs = draft.now.getTime() + validation.HANDOFF_DEFAULT_EXPIRY_DAYS * MS_PER_DAY;
	const document = serializeHandoff(ctx, {
		id,
		status: "active",
		created: draft.now.toISOString(),
		expires: new Date(expiryMs).toISOString(),
		summary: draft.summary,
		fromTool: draft.fromTool,
		...draft.toTool === void 0 ? {} : { toTool: draft.toTool },
		...draft.gitRef === void 0 ? {} : { gitRef: draft.gitRef },
		integrity: validation.computeHandoffIntegrity(draft.summary, body)
	}, body);
	const path = join(dir, `${id}${HANDOFF_FILE_EXTENSION}`);
	const result = validation.validateHandoffContent(document, path);
	if (!result.valid) return refuse$1(ctx, PREPARE, draft.title, result.errors);
	ctx.io.out("Dry run: the handoff passes every write gate. Nothing was written.\n");
	for (const warning of result.warnings) ctx.io.out(`  advisory: ${warning}\n`);
	return {
		exitCode: 0,
		json: {
			dryRun: true,
			id,
			path,
			warnings: result.warnings
		}
	};
}
function resumeDryRunAdvanceLine(id, status) {
	return `Dry run: ${id} would go ${status} → in-progress. Nothing was written.`;
}
async function runResume(ctx, id) {
	if (id === void 0 || id === "") throw missingFlag$1(RESUME, "<id>");
	const rootDir = ctx.app.runtime.cwd;
	const { schema, store, validation } = ctx.engine.handoffs;
	const dir = join(rootDir, STATE_DIR, HANDOFFS_DIR);
	const handoff = await store.readHandoff(rootDir, id);
	if (handoff === null) return refuse$1(ctx, RESUME, id, [`No handoff ${JSON.stringify(id)} under ${dir}. An id is <YYYY-MM-DD>_<slug>_<5 hex>; run "stamity handoff list" to see the ids the store holds.`]);
	if (!validation.verifyHandoffIntegrity(handoff)) return refuse$1(ctx, RESUME, id, [`${handoff.filePath}: \`integrity\` does not match the summary and body. The handoff was edited after it was written, so its content is unverified provenance and none of the body is printed. Read the file by hand and prepare a fresh handoff from the tree.`]);
	const now = ctx.app.runtime.clock.now();
	if (validation.isHandoffExpired(handoff, now)) return refuse$1(ctx, RESUME, id, [`${handoff.filePath}: expired at ${handoff.frontmatter.expires}. A stale file manifest resumes into fiction. Prune it into the archive, or read it as reference and prepare a new handoff from the tree as it stands.`]);
	const { status } = handoff.frontmatter;
	const advanceable = schema.isValidStatusTransition(status, "in-progress");
	if (!advanceable && status !== "in-progress") return refuse$1(ctx, RESUME, id, [`${handoff.filePath}: status is ${status}, and the resumable set is \`active\` and \`in-progress\` only. Finished work is not reopened — prepare a new handoff instead.`]);
	const currentRef = currentGitRef(rootDir);
	const drift = validation.detectGitRefDrift(handoff, currentRef);
	const readOnly = currentRef !== null && recordedBranchIsGone(rootDir, handoff.frontmatter.gitRef);
	if (drift !== null) ctx.io.err(`drift: ${drift}\n`);
	if (readOnly) ctx.io.err(`drift: the branch recorded in "${handoff.frontmatter.gitRef}" no longer exists. This resume is read-only — the body is history, no manifest path is edited on its strength, and the status is not advanced. Ask the operator where the work landed.\n`);
	ctx.io.out(`${beginFrame(id)}\n${handoff.body.trim()}\n${endFrame(id)}\n`);
	const advanced = advanceable && !readOnly && !ctx.dryRun;
	if (ctx.dryRun) ctx.io.out(advanceable && !readOnly ? `${resumeDryRunAdvanceLine(id, status)}\n` : `Dry run: ${id} stays ${status}; this resume advances nothing. Nothing was written.\n`);
	if (advanced) {
		const body = `${handoff.body.trim()}\n`;
		const rewritten = serializeHandoff(ctx, {
			...handoff.frontmatter,
			status: "in-progress",
			integrity: validation.computeHandoffIntegrity(handoff.frontmatter.summary, body)
		}, body);
		await ctx.engine.merge.atomicWrite.atomicWriteFile(handoff.filePath, rewritten);
	}
	return {
		exitCode: 0,
		json: {
			id,
			path: handoff.filePath,
			status: advanced ? "in-progress" : status,
			advanced,
			readOnly,
			...ctx.dryRun ? { dryRun: true } : {},
			...drift === null ? {} : { drift },
			frame: {
				begin: beginFrame(id),
				end: endFrame(id)
			},
			body: handoff.body.trim()
		}
	};
}
async function runList$1(ctx) {
	const rootDir = ctx.app.runtime.cwd;
	const { store, validation } = ctx.engine.handoffs;
	const dir = join(rootDir, STATE_DIR, HANDOFFS_DIR);
	const now = ctx.app.runtime.clock.now();
	const index = await store.buildHandoffIndex(rootDir, { now });
	const report = await validation.validateHandoffsDirectory(dir);
	const included = new Set(index.active.map((entry) => entry.id));
	const excluded = [...report.invalid.map(({ file, errors }) => ({
		file,
		reason: errors[0] ?? "not handoff-shaped."
	})), ...report.valid.filter((handoff) => !included.has(handoff.frontmatter.id)).map((handoff) => ({
		file: basename(handoff.filePath),
		reason: validation.isHandoffExpired(handoff, now) ? `expired at ${handoff.frontmatter.expires}; a prune sweeps it into the archive.` : `status is ${handoff.frontmatter.status}; the resumable set is \`active\` and \`in-progress\` only.`
	}))].toSorted((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
	if (index.count === 0) ctx.io.out(`No resumable handoffs in ${dir}.\n`);
	else ctx.io.out(`Resumable (${index.count}), soonest expiry first:\n`);
	for (const entry of index.active) {
		const from = entry.fromTool === void 0 ? "" : ` from ${entry.fromTool}`;
		ctx.io.out(`  ${entry.id}  expires ${entry.expires}${from}\n    ${entry.summary}\n`);
	}
	if (excluded.length > 0) ctx.io.out(`Excluded (${excluded.length}):\n`);
	for (const entry of excluded) ctx.io.out(`  ${entry.file} — ${entry.reason}\n`);
	if (report.overActiveCap) ctx.io.out(`The directory holds ${report.activeCount} unfinished handoffs, over the ${validation.MAX_ACTIVE_HANDOFFS_PER_REPO} cap. Complete or prune before preparing another.\n`);
	return {
		exitCode: 0,
		json: {
			dir,
			resumable: index.active,
			count: index.count,
			excluded,
			activeCount: report.activeCount,
			overActiveCap: report.overActiveCap
		}
	};
}
async function runComplete(ctx, id) {
	if (id === void 0 || id === "") throw missingFlag$1(COMPLETE, "<id>");
	const rootDir = ctx.app.runtime.cwd;
	const { schema, store } = ctx.engine.handoffs;
	const dir = join(rootDir, STATE_DIR, HANDOFFS_DIR);
	const handoff = await store.readHandoff(rootDir, id);
	if (handoff === null) return refuse$1(ctx, COMPLETE, id, [`No handoff ${JSON.stringify(id)} under ${dir}. An id is <YYYY-MM-DD>_<slug>_<5 hex>; run "stamity handoff list" to see the ids the store holds.`]);
	const { status } = handoff.frontmatter;
	if (!schema.isValidStatusTransition(status, "archived")) return refuse$1(ctx, COMPLETE, id, [`${handoff.filePath}: status is ${status}, and ${status} → archived is not a transition the table carries. Finished work is not closed twice — prepare a new handoff instead of reopening this one.`]);
	const closable = schema.isValidStatusTransition(status, "completed");
	const route = closable ? `${status} → completed → archived` : `${status} → archived`;
	if (ctx.dryRun) {
		ctx.io.out(`Dry run: ${id} would go ${route}. Nothing was written.\n`);
		return {
			exitCode: 0,
			json: {
				dryRun: true,
				id,
				path: handoff.filePath,
				status,
				route
			}
		};
	}
	if (closable) {
		const body = `${handoff.body.trim()}\n`;
		await ctx.engine.merge.atomicWrite.atomicWriteFile(handoff.filePath, serializeHandoff(ctx, {
			...handoff.frontmatter,
			status: "completed"
		}, body));
	}
	try {
		await store.archiveHandoff(rootDir, id);
	} catch (cause) {
		if (cause instanceof EngineError && cause.code === "VALIDATION_ERROR") return refuse$1(ctx, COMPLETE, id, [cause.message]);
		throw cause;
	}
	const archived = await store.readHandoff(rootDir, id);
	const path = archived?.filePath ?? join(dir, ARCHIVE_DIR, `${id}${HANDOFF_FILE_EXTENSION}`);
	ctx.io.out(`Completed ${id} -> ${path}\n`);
	return {
		exitCode: 0,
		json: {
			id,
			path,
			status: archived?.frontmatter.status ?? "archived"
		}
	};
}
async function runPrune(ctx) {
	const rootDir = ctx.app.runtime.cwd;
	const { store } = ctx.engine.handoffs;
	const dir = join(rootDir, STATE_DIR, HANDOFFS_DIR);
	const now = ctx.app.runtime.clock.now();
	const retentionDays = store.DEFAULT_ARCHIVE_RETENTION_DAYS;
	const { archivedExpired, deleted } = ctx.dryRun ? await dryRunPrune(ctx, now) : await store.pruneHandoffs(rootDir, { now });
	ctx.io.out(`Archived (${archivedExpired.length}), expired and swept out of the live set:\n`);
	for (const id of archivedExpired) ctx.io.out(`  ${id}\n`);
	ctx.io.out(`Deleted (${deleted.length}), archived over ${retentionDays} days past expiry:\n`);
	for (const id of deleted) ctx.io.out(`  ${id}\n`);
	if (ctx.dryRun) ctx.io.out("Dry run: nothing was moved or removed.\n");
	return {
		exitCode: 0,
		json: {
			dir,
			archivedExpired,
			deleted,
			retentionDays,
			...ctx.dryRun ? { dryRun: true } : {}
		}
	};
}
async function dryRunPrune(ctx, now) {
	const rootDir = ctx.app.runtime.cwd;
	const { schema, store, validation } = ctx.engine.handoffs;
	const archive = join(rootDir, STATE_DIR, HANDOFFS_DIR, ARCHIVE_DIR);
	const held = await store.listHandoffs(rootDir);
	const archived = held.filter((handoff) => dirname(handoff.filePath) === archive);
	const expired = held.filter((handoff) => dirname(handoff.filePath) !== archive && validation.isHandoffExpired(handoff, now) && schema.isValidStatusTransition(handoff.frontmatter.status, "archived"));
	const archiving = new Set(expired.map((handoff) => handoff.frontmatter.id));
	const cutoff = now.getTime() - store.DEFAULT_ARCHIVE_RETENTION_DAYS * MS_PER_DAY;
	const stale = archived.filter((handoff) => {
		if (archiving.has(handoff.frontmatter.id)) return false;
		const expires = Date.parse(handoff.frontmatter.expires);
		return !Number.isNaN(expires) && expires <= cutoff;
	});
	return {
		archivedExpired: expired.map((handoff) => handoff.frontmatter.id).toSorted(),
		deleted: stale.map((handoff) => handoff.frontmatter.id).toSorted()
	};
}
const handoffCommand = {
	name: "handoff",
	summary: "prepare, resume, list, complete and prune handoffs through the engine's gates (plumbing)",
	hidden: true,
	mutating: true,
	configure(cmd) {
		cmd.addArgument(new Argument("<mode>", "which handoff mode to run").choices([
			PREPARE,
			RESUME,
			LIST,
			COMPLETE,
			PRUNE
		])).addArgument(new Argument("[id]", "handoff id, for resume and complete")).option("--title <text>", "what the work is about; also the id's slug source").option("--summary <text>", "one line the next session reads first, under 200 characters").addOption(new Option("--from-tool <tool>", "the client writing the handoff").choices([...TOOLS])).addOption(new Option("--to-tool <tool>", "the client meant to resume it").choices([...TOOLS])).option("--git-ref <ref>", "the ref the work sat on, as <branch>@<sha>").option("--body-file <path>", "read the body from a file instead of stdin");
	},
	async run(ctx, opts, args) {
		const mode = args[0];
		if (mode === PREPARE) return await runPrepare(ctx, opts);
		if (mode === RESUME) return await runResume(ctx, args[1]);
		if (mode === LIST) return await runList$1(ctx);
		if (mode === COMPLETE) return await runComplete(ctx, args[1]);
		return await runPrune(ctx);
	}
};
//#endregion
//#region src/migration/detect.ts
const PREDECESSOR_STATE_DIR = ".hatch3r";
const PREDECESSOR_MANIFEST_FILE = "hatch.json";
const PREDECESSOR_LEARNINGS_DIR = "learnings";
const PREDECESSOR_OVERRIDES_DIR = "overrides";
const PREDECESSOR_ENV_MCP_FILE = ".env.mcp";
const BINARY_SNIFF_CHARS = 8192;
const NUL = "\0";
const PREDECESSOR_MARKER_VARIANTS = [
	{
		id: "html",
		begin: /^<!--[ \t]*HATCH3R:BEGIN(?:[ \t]+\S+)?[ \t]*-->$/,
		end: /^<!--[ \t]*HATCH3R:END(?:[ \t]+\S+)?[ \t]*-->$/
	},
	{
		id: "hash",
		begin: /^#[ \t]*HATCH3R:BEGIN(?:[ \t]+\S+)?$/,
		end: /^#[ \t]*HATCH3R:END(?:[ \t]+\S+)?$/
	},
	{
		id: "slash",
		begin: /^\/\/[ \t]*HATCH3R:BEGIN(?:[ \t]+\S+)?$/,
		end: /^\/\/[ \t]*HATCH3R:END(?:[ \t]+\S+)?$/
	}
];
const PREDECESSOR_MARKED_FILE_CANDIDATES = [
	"AGENTS.md",
	"CLAUDE.md",
	"GEMINI.md",
	".github/copilot-instructions.md",
	".cursor/rules/*.mdc",
	".cursor/rules/*.md"
];
async function detectPredecessorState(rootDir) {
	const root = resolve(rootDir);
	const stateDir = join(root, PREDECESSOR_STATE_DIR);
	const packages = await listWorkspacePackages(root);
	const [stateKind, markedFiles, packagesWithState] = await Promise.all([
		entryKind(stateDir),
		findMarkedFiles(root, packages),
		findPackagesWithState(root, packages)
	]);
	const hasStateDir = stateKind === "dir";
	if (!hasStateDir && markedFiles.length === 0 && packagesWithState.length === 0) return null;
	const manifest = hasStateDir ? await readManifest(join(stateDir, PREDECESSOR_MANIFEST_FILE)) : {
		path: null,
		raw: null
	};
	const [learnings, overridesDir, envMcpPath] = await Promise.all([
		hasStateDir ? readLearnings(join(stateDir, PREDECESSOR_LEARNINGS_DIR)) : Promise.resolve({
			dir: null,
			count: 0
		}),
		hasStateDir ? existingDir(join(stateDir, PREDECESSOR_OVERRIDES_DIR)) : Promise.resolve(null),
		existingFile(join(root, PREDECESSOR_ENV_MCP_FILE))
	]);
	return {
		stateDirPath: hasStateDir ? stateDir : null,
		manifestPath: manifest.path,
		manifestRaw: manifest.raw,
		learningsDir: learnings.dir,
		learningsCount: learnings.count,
		envMcpPath,
		overridesDir,
		markedFiles,
		packagesWithState
	};
}
function hasPredecessorMarker(content) {
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		for (const variant of PREDECESSOR_MARKER_VARIANTS) if (variant.begin.test(trimmed) || variant.end.test(trimmed)) return true;
	}
	return false;
}
async function readManifest(path) {
	if (await entryKind(path) !== "file") return {
		path: null,
		raw: null
	};
	let text;
	try {
		text = await readFile(path, "utf8");
	} catch {
		return {
			path,
			raw: null
		};
	}
	try {
		const parsed = JSON.parse(text);
		return {
			path,
			raw: isPlainRecord(parsed) ? parsed : null
		};
	} catch {
		return {
			path,
			raw: null
		};
	}
}
async function readLearnings(dir) {
	const names = await listDirFiles(dir);
	if (names === null) return {
		dir: null,
		count: 0
	};
	return {
		dir,
		count: names.filter((name) => name.endsWith(".md")).length
	};
}
async function listWorkspacePackages(root) {
	try {
		return (await detectMonorepoPackages(root)).map((entry) => entry.path);
	} catch {
		return [];
	}
}
async function findPackagesWithState(root, packages) {
	return (await Promise.all(packages.map(async (pkg) => {
		return await entryKind(join(root, ...pkg.split("/"), PREDECESSOR_STATE_DIR)) === "dir" ? pkg : null;
	}))).filter((entry) => entry !== null).toSorted();
}
async function findMarkedFiles(root, packages) {
	const scopes = ["", ...packages];
	const marked = await Promise.all(scopes.map((scope) => findMarkedFilesIn(root, scope)));
	return [...new Set(marked.flat())].toSorted();
}
async function findMarkedFilesIn(root, scope) {
	const base = scope === "" ? root : join(root, ...scope.split("/"));
	const candidates = await expandCandidates(base);
	return (await Promise.all(candidates.map(async (relative) => await isMarked(join(base, relative)) ? scope === "" ? relative : `${scope}/${relative}` : null))).filter((entry) => entry !== null);
}
async function expandCandidates(root) {
	const expanded = await Promise.all(PREDECESSOR_MARKED_FILE_CANDIDATES.map(async (candidate) => {
		const star = candidate.lastIndexOf("*");
		if (star === -1) return [candidate];
		const slash = candidate.lastIndexOf("/");
		const dir = candidate.slice(0, slash);
		const suffix = candidate.slice(star + 1);
		return (await listDirFiles(join(root, ...dir.split("/"))) ?? []).filter((name) => name.endsWith(suffix)).map((name) => `${dir}/${name}`);
	}));
	return [...new Set(expanded.flat())];
}
async function isMarked(path) {
	let content;
	try {
		content = await readFile(path, "utf8");
	} catch {
		return false;
	}
	if (content.slice(0, BINARY_SNIFF_CHARS).includes(NUL)) return false;
	return hasPredecessorMarker(content);
}
async function listDirFiles(dir) {
	try {
		return (await readdir(dir, { withFileTypes: true })).filter((entry) => entry.isFile()).map((entry) => entry.name);
	} catch {
		return null;
	}
}
async function entryKind(path) {
	try {
		const stats = await stat(path);
		if (stats.isFile()) return "file";
		if (stats.isDirectory()) return "dir";
		return "other";
	} catch (error) {
		const code = error.code;
		return code === "ENOENT" || code === "ENOTDIR" ? null : "other";
	}
}
async function existingDir(path) {
	return await entryKind(path) === "dir" ? path : null;
}
async function existingFile(path) {
	return await entryKind(path) === "file" ? path : null;
}
function isPlainRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
//#endregion
//#region src/migration/carry.ts
function mapPredecessorDefaults(manifestRaw) {
	if (manifestRaw === null) return {};
	const defaults = {};
	const tools = uniqueStrings(field(manifestRaw, "tools")).filter(isTool);
	if (tools.length > 0) defaults.tools = tools;
	const maturityTier = readEnum(field(manifestRaw, "maturity") ?? field(manifestRaw, "maturityTier"), VALID_MATURITY_TIERS);
	if (maturityTier !== void 0) defaults.maturityTier = maturityTier;
	const communicationStyle = readEnum(field(manifestRaw, "communicationStyle"), VALID_COMMUNICATION_STYLES);
	if (communicationStyle !== void 0) defaults.communicationStyle = communicationStyle;
	const mcp = field(manifestRaw, "mcp");
	const mcpServers = isRecord(mcp) ? uniqueStrings(field(mcp, "servers")) : [];
	if (mcpServers.length > 0) defaults.mcpServers = mcpServers;
	return defaults;
}
async function stripPredecessorBlocks(rootDir, markedFiles, opts) {
	const root = resolve(rootDir);
	const dryRun = opts?.dryRun ?? false;
	const results = [];
	for (const relative of markedFiles) results.push(await stripOne(root, relative, dryRun));
	return results;
}
async function stripOne(root, relative, dryRun) {
	const path = join(root, ...relative.split("/"));
	let content;
	try {
		content = await readFile(path, "utf8");
	} catch {
		return {
			path: relative,
			action: "unchanged"
		};
	}
	const stripped = removePredecessorBlocks(content);
	if (stripped === null || stripped === content) return {
		path: relative,
		action: "unchanged"
	};
	if (stripped.trim() === "") {
		if (!dryRun) await rm(path, { force: true });
		return {
			path: relative,
			action: "deleted"
		};
	}
	if (!dryRun) await atomicWriteFile(path, stripped);
	return {
		path: relative,
		action: "stripped"
	};
}
function removePredecessorBlocks(content) {
	const lines = scanLines(content);
	const spans = [];
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i];
		if (line === void 0) break;
		const variant = PREDECESSOR_MARKER_VARIANTS.find((candidate) => candidate.begin.test(line.trimmed));
		if (variant === void 0) continue;
		let close = -1;
		for (let j = i + 1; j < lines.length && close === -1; j += 1) if (variant.end.test(lines[j]?.trimmed ?? "")) close = j;
		if (close === -1) return null;
		spans.push({
			start: line.start,
			end: lines[close]?.next ?? content.length
		});
		i = close;
	}
	if (spans.length === 0) return content;
	let result = "";
	let cursor = 0;
	for (const span of spans) {
		result += content.slice(cursor, span.start);
		cursor = span.end;
	}
	return result + content.slice(cursor);
}
function scanLines(content) {
	const lines = [];
	let start = 0;
	for (;;) {
		const newline = content.indexOf("\n", start);
		const end = newline === -1 ? content.length : newline;
		const next = newline === -1 ? content.length : newline + 1;
		lines.push({
			start,
			end,
			next,
			trimmed: content.slice(start, end).trim()
		});
		if (newline === -1) return lines;
		start = next;
	}
}
async function carryPredecessorAssets(rootDir, state, opts) {
	const root = resolve(rootDir);
	const now = opts.now ?? /* @__PURE__ */ new Date();
	const { dryRun } = opts;
	const learnings = await carryLearnings(root, state.learningsDir, dryRun, now);
	const envMcpCarried = await carryEnvMcp(root, state.envMcpPath, dryRun);
	const strips = await stripPredecessorBlocks(root, state.markedFiles, { dryRun });
	return {
		learningsCarried: learnings.carried,
		learningsSkipped: learnings.skipped,
		envMcpCarried,
		overridesPresent: state.overridesDir !== null,
		strips,
		dryRun
	};
}
const ENGINE_LEARNINGS_DIR = "learnings";
const CARRY_EXCLUDED_NAMES = /* @__PURE__ */ new Set(["readme.md", "index.md"]);
function isExcludedLearningName(name) {
	return CARRY_EXCLUDED_NAMES.has(name.toLowerCase());
}
async function carryLearnings(root, sourceDir, dryRun, now) {
	if (sourceDir === null) return {
		carried: 0,
		skipped: 0
	};
	const sourceNames = (await listMarkdownNames(sourceDir)).toSorted();
	if (sourceNames.length === 0) return {
		carried: 0,
		skipped: 0
	};
	const caps = resolveLearningsCaps();
	const taken = new Set(await listMarkdownNames(join(root, STATE_DIR, ENGINE_LEARNINGS_DIR)));
	let carried = 0;
	let skipped = 0;
	for (const sourceName of sourceNames) {
		if (isExcludedLearningName(sourceName)) {
			skipped += 1;
			continue;
		}
		const mapped = await mapLearningFile(sourceDir, sourceName, now);
		if (mapped === null) {
			skipped += 1;
			continue;
		}
		if (dryRun) {
			if (!taken.has(mapped.fileName) && taken.size < caps.maxCount && validateLearningContent(mapped.fileName, mapped.content, {
				maxFileBytes: caps.maxFileBytes,
				now
			}).valid) {
				taken.add(mapped.fileName);
				carried += 1;
			} else skipped += 1;
			continue;
		}
		if ((await persistLearning({
			rootDir: root,
			fileName: mapped.fileName,
			content: mapped.content,
			caps,
			now
		})).written) carried += 1;
		else skipped += 1;
	}
	return {
		carried,
		skipped
	};
}
async function mapLearningFile(sourceDir, sourceName, now) {
	let raw;
	try {
		raw = await readFile(join(sourceDir, sourceName), "utf8");
	} catch {
		return null;
	}
	return mapPredecessorLearning(sourceName, raw, now);
}
const CARRIED_SECTION_NOTES = {
	Why: "Carried over from the predecessor setup. The note above is the finding as it was recorded there; its reasoning was not captured under a heading of its own.",
	"How to apply": "Re-verify this note against the current repo before acting on it, then fold the outcome into the artifact it belongs to."
};
const FALLBACK_SECTION_NOTE = "Carried over from the predecessor setup; not yet re-checked here.";
const PREDECESSOR_LEARNING_HEAD_KEYS = [
	"id",
	"topic",
	"applies-to",
	"confidence",
	"created"
];
function hasPredecessorLearningHead(head) {
	return PREDECESSOR_LEARNING_HEAD_KEYS.every((key) => Object.hasOwn(head, key));
}
function mapPredecessorLearning(sourceName, raw, now) {
	const fileName = carriedLearningName(sourceName);
	if (fileName === null) return null;
	let head = {};
	let body = raw;
	try {
		const parsed = parseFrontmatter(raw, `Predecessor learning "${sourceName}"`);
		head = parsed.frontmatter;
		body = parsed.body;
	} catch {}
	if (!hasPredecessorLearningHead(head)) return null;
	const core = body.trim();
	const title = firstHeading(core) ?? fileName.slice(0, -3);
	const summary = truncate(readText(head, "summary") ?? firstParagraph(core) ?? "", 200) || truncate(title, 200);
	const sections = [core];
	for (const section of REQUIRED_LEARNING_SECTIONS) {
		if (hasSection(core, section)) continue;
		sections.push(`## ${section}\n\n${CARRIED_SECTION_NOTES[section] ?? FALLBACK_SECTION_NOTE}`);
	}
	return {
		fileName,
		content: composeFrontmatter({
			id: fileName.slice(0, -3),
			title,
			date: calendarDate(readText(head, "date")) ?? calendarDate(readText(head, "created")) ?? isoDay(now),
			confidence: readConfidence(head),
			summary,
			carriedFrom: sourceName
		}, `\n${sections.join("\n\n")}\n`)
	};
}
function carriedLearningName(sourceName) {
	const stem = sourceName.endsWith(".md") ? sourceName.slice(0, -3) : sourceName;
	const slug = (stem.startsWith("hatch3r-") ? `${CONTENT_PREFIX}${stem.slice(8)}` : stem).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
	return slug === "" ? null : `${slug}.md`;
}
function readConfidence(head) {
	const declared = readText(head, "confidence")?.toLowerCase();
	return LEARNING_CONFIDENCE_LEVELS.find((level) => level === declared) ?? "medium";
}
function firstHeading(body) {
	const heading = /^[ \t]{0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/m.exec(body)?.[1]?.trim();
	return heading === void 0 || heading === "" ? null : heading;
}
function firstParagraph(body) {
	const collected = [];
	let fenced = false;
	for (const raw of body.split("\n")) {
		const line = raw.trim();
		const isFence = /^(?:`{3,}|~{3,})/.test(line);
		const isBreak = line === "" || /^#{1,6}[ \t]/.test(line) || /^(?:-{3,}|={3,}|\*{3,})$/.test(line);
		if (isFence) {
			if (collected.length > 0) break;
			fenced = !fenced;
			continue;
		}
		if (fenced) continue;
		if (isBreak) {
			if (collected.length > 0) break;
			continue;
		}
		collected.push(line);
	}
	const paragraph = collected.join(" ").replace(/\s+/g, " ").trim();
	return paragraph === "" ? null : paragraph;
}
function hasSection(body, section) {
	const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`^#{1,6}[ \\t]*${escaped}\\b`, "im").test(body);
}
async function carryEnvMcp(root, sourcePath, dryRun) {
	if (sourcePath === null) return false;
	if (dryRun) return true;
	const destination = join(root, ENV_MCP_FILE);
	if (resolve(sourcePath) !== destination) {
		const credentials = await readFile(sourcePath, "utf8");
		await atomicWriteFile(destination, credentials, { mode: SECRET_FILE_MODE });
	}
	await hardenEnvMcpMode(destination);
	await ensureGitignoreEntry(root);
	return true;
}
const SECRET_FILE_MODE = 384;
async function listMarkdownNames(dir) {
	try {
		return (await readdir(dir, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => entry.name);
	} catch {
		return [];
	}
}
function field(record, key) {
	return Object.hasOwn(record, key) ? record[key] : void 0;
}
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isTool(name) {
	return VALID_TOOLS.has(name);
}
function uniqueStrings(value) {
	if (!Array.isArray(value)) return [];
	const strings = value.filter((entry) => typeof entry === "string").map((entry) => entry.trim()).filter((entry) => entry !== "");
	return [...new Set(strings)];
}
function readEnum(value, allowed) {
	return typeof value === "string" && allowed.has(value) ? value : void 0;
}
function readText(record, key) {
	const value = field(record, key);
	if (typeof value !== "string") return void 0;
	const trimmed = value.trim();
	return trimmed === "" ? void 0 : trimmed;
}
function truncate(value, limit) {
	const collapsed = value.replace(/\s+/g, " ").trim();
	return collapsed.length > limit ? collapsed.slice(0, limit).trimEnd() : collapsed;
}
function calendarDate(value) {
	if (value === void 0 || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return void 0;
	const parsed = /* @__PURE__ */ new Date(`${value}T00:00:00Z`);
	return Number.isNaN(parsed.getTime()) || !parsed.toISOString().startsWith(value) ? void 0 : value;
}
function isoDay(now) {
	return now.toISOString().slice(0, 10);
}
const WORDMARK = [
	"           ###                             ###  ###",
	"           ###                             ###  ###",
	"           +++                                  ###",
	"  ####### ++++++   #########   #### ####   ### ###### ###  ###",
	" ######## ++++++  ##########  ###########  ### ###### ###  ###",
	"###        +++   ####  ##### ### ##### ### ###  ###   ###  ###",
	"#########  ###   ###    #### ###  ###  ### ###  ###   ###  ###",
	"#########  ###   ###    #### ###  ###  ### ###  ###   ###  ###",
	"      ###  ###   ####  ##### ###  ###  ### ###  ###   ########",
	"########   #####  ########## ###  ###  ### ###  #####  #######",
	"#######     ####   ######### ###  ###  ### ###   ####   ######",
	"                                                         #####",
	"                                                         ####",
	"                                                         ###"
];
WORDMARK.length / 2;
const BANNER_COLUMNS = Math.max(...WORDMARK.map((row) => row.length));
const BANNER_INDENT = "  ";
function pixelAt(row, column) {
	return row[column] ?? " ";
}
function renderWordmark(opts = {}) {
	const accent = opts.accent ?? "none";
	const indent = opts.indent ?? "";
	const sgr = accent === "none" ? null : MARK_ACCENT_SGR[accent];
	const lines = [];
	for (let row = 0; row < WORDMARK.length; row += 2) {
		const top = WORDMARK[row] ?? "";
		const bottom = WORDMARK[row + 1] ?? "";
		let line = "";
		let accentOpen = false;
		for (let column = 0; column < BANNER_COLUMNS; column += 1) {
			const upper = pixelAt(top, column);
			const lower = pixelAt(bottom, column);
			const upperInk = upper !== " ";
			const lowerInk = lower !== " ";
			const glyph = upperInk ? lowerInk ? "█" : "▀" : lowerInk ? "▄" : " ";
			const wantsAccent = sgr !== null && (upper === "+" || lower === "+");
			if (wantsAccent && !accentOpen) {
				line += sgr;
				accentOpen = true;
			} else if (!wantsAccent && accentOpen) {
				line += ACCENT_RESET;
				accentOpen = false;
			}
			line += glyph;
		}
		if (accentOpen) line += ACCENT_RESET;
		lines.push(`${indent}${line}`.replace(/[ ]+$/u, ""));
	}
	return lines.join("\n");
}
function bannerBlock(opts) {
	if (!opts.stdoutIsTTY) return "";
	if (opts.machineReadable) return "";
	const indent = opts.indent ?? BANNER_INDENT;
	if (typeof opts.columns === "number" && opts.columns > 0 && opts.columns <= BANNER_COLUMNS + indent.length) return "";
	return `${renderWordmark({
		accent: resolveAccentDepth({
			colorEnabled: resolveColorEnabled({
				noColorFlag: opts.noColorFlag ?? false,
				env: opts.env,
				stdoutIsTTY: opts.stdoutIsTTY
			}),
			env: opts.env
		}),
		indent
	})}\n`;
}
//#endregion
//#region src/cli/commands/init/plan.ts
const MIN_WORKSPACE_CANDIDATES = 2;
function workspaceOfferArmed(decisions) {
	return decisions.workspaceSource === "standalone" && decisions.workspaceCandidates.length >= MIN_WORKSPACE_CANDIDATES;
}
const DEFAULT_TOOLS = ["claude"];
const TEAM_CONTRIBUTOR_FLOOR = 2;
const AGENTS_MD = IMPORT_TARGET.agentsMd;
const AGENT_MD = IMPORT_TARGET.agentMd;
const CLAUDE_INSTRUCTIONS = IMPORT_TARGET.claudeMd;
const COPILOT_INSTRUCTIONS = IMPORT_TARGET.copilotInstructions;
const CROSS_TOOL_CONFIG_FILES = [AGENTS_MD, AGENT_MD];
const TOOL_INSTRUCTION_FILES = {
	claude: [CLAUDE_INSTRUCTIONS],
	cursor: [],
	copilot: [COPILOT_INSTRUCTIONS],
	codex: []
};
async function buildInitDecisions(rootDir, overrides, deps = {}) {
	const [info, workspace] = await Promise.all([analyzeRepo(rootDir), deps.skipWorkspaceProbe === true ? Promise.resolve({
		workspaceCandidates: [],
		workspaceSource: "standalone"
	}) : probeWorkspace(rootDir)]);
	const detectedTools = TOOLS.filter((tool) => info.existingTools.includes(tool));
	const { tools, toolsSource } = resolveTools(overrides.tools, detectedTools);
	const maturity = resolveMaturity(overrides, deps.history === void 0 ? readHistoryFacts(rootDir) : deps.history);
	const platform = detectPlatform(rootDir);
	const detected = summarizeDetection(info);
	const [existingConfigPaths, gatePins] = await Promise.all([collectExistingConfigPaths(rootDir, detectedTools), plainVenvGatePins(rootDir, detected)]);
	return {
		tools,
		toolsSource,
		detectedTools,
		greenfield: isGreenfield(info),
		monorepoPackages: info.monorepoPackages,
		...maturity,
		...platform === void 0 ? {} : { platform },
		existingConfigPaths,
		detected,
		...gatePins === void 0 ? {} : { gatePins },
		repoInfo: info,
		...workspace
	};
}
const VENV_DIRS = [".venv", "venv"];
async function plainVenvGatePins(rootDir, detected) {
	if (gateLanguageFor(detected) !== "python" || isPythonRunner(detected.packageManager)) return;
	const [present, hasSrc] = await Promise.all([Promise.all(VENV_DIRS.map((dir) => fileExists(join(rootDir, dir, "pyvenv.cfg")))), dirExists$1(join(rootDir, "src"))]);
	const venv = VENV_DIRS.find((_dir, index) => present[index] === true);
	if (venv === void 0) return void 0;
	const python = `${venv}/bin/python -m`;
	return {
		test: `${python} pytest`,
		lint: `${python} ruff check .`,
		typecheck: `${python} mypy ${hasSrc ? "src" : "."}`
	};
}
async function probeWorkspace(rootDir) {
	const context = await detectWorkspaceContext(rootDir);
	if (context.role !== "standalone") return {
		workspaceCandidates: [],
		workspaceSource: context.role
	};
	return {
		workspaceCandidates: await detectSubRepos(rootDir),
		workspaceSource: "standalone"
	};
}
function fullCoreSelection(index) {
	const items = Object.fromEntries(CONTENT_CLASSES.map((contentClass) => [contentClass, []]));
	const seen = /* @__PURE__ */ new Set();
	for (const item of index.items) {
		const key = `${item.type}\0${item.id}`;
		if (seen.has(key)) continue;
		seen.add(key);
		items[item.type].push(item.id);
	}
	return { items };
}
function resolveTools(flagged, detected) {
	if (flagged !== void 0 && flagged.length > 0) {
		const unknown = flagged.filter((name) => !VALID_TOOLS.has(name));
		if (unknown.length > 0) throw new EngineError(`Unknown tool${unknown.length > 1 ? "s" : ""} ${unknown.map((name) => JSON.stringify(name)).join(", ")}. Valid tools: ${TOOLS.join(", ")}.`, { code: "VALIDATION_ERROR" });
		return {
			tools: TOOLS.filter((tool) => flagged.includes(tool)),
			toolsSource: "flag"
		};
	}
	if (detected.length > 0) return {
		tools: [...detected],
		toolsSource: "detected"
	};
	return {
		tools: [...DEFAULT_TOOLS],
		toolsSource: "default"
	};
}
function resolveMaturity(overrides, history) {
	const seedIsTeam = history !== null && history.contributorCount >= TEAM_CONTRIBUTOR_FLOOR;
	const flagged = overrides.maturityTier !== void 0;
	return {
		maturityTier: overrides.maturityTier ?? (seedIsTeam ? "team" : "solo"),
		maturitySource: flagged ? "flag" : history !== null ? "git-history" : "default"
	};
}
function detectPlatform(rootDir) {
	return detectRepoGitIdentity(rootDir, gitCheckRunner()).platform ?? void 0;
}
async function collectExistingConfigPaths(rootDir, detectedTools) {
	const candidates = [...CROSS_TOOL_CONFIG_FILES, ...detectedTools.flatMap((tool) => TOOL_INSTRUCTION_FILES[tool])];
	const present = await Promise.all(candidates.map((relative) => fileExists(join(rootDir, ...relative.split("/")))));
	return candidates.filter((_candidate, index) => present[index] === true);
}
async function fileExists(path) {
	try {
		return (await stat(path)).isFile();
	} catch {
		return false;
	}
}
async function dirExists$1(path) {
	try {
		return (await stat(path)).isDirectory();
	} catch {
		return false;
	}
}
//#endregion
//#region src/cli/commands/init/apply.ts
const STATE_DIRS = [
	STATE_DIR,
	`${STATE_DIR}/learnings`,
	`${STATE_DIR}/handoffs`
];
async function applyInit(opts) {
	const { rootDir, decisions, defaults, importChoice, plugin, engineVersion, dryRun, force } = opts;
	const now = opts.now ?? /* @__PURE__ */ new Date();
	if (!force && await readManifest$1(rootDir) !== null) throw new EngineError(`This repo is already initialised: ${manifestPath(rootDir)} exists. Run \`stamity sync\` to regenerate outputs, \`stamity config\` to change settings, or \`stamity clean\` to remove the setup first. Re-run init with --force to replace the existing setup in place.`, { code: "VALIDATION_ERROR" });
	const manifest = await composeManifest(decisions, defaults, importChoice, plugin, engineVersion, now);
	const previous = force ? await readPreviousManifest(rootDir) : null;
	if (force) manifest.ledger = [...manifest.ledger, ...await carriedPackRows(rootDir, previous)];
	const createdDirs = (await Promise.all(STATE_DIRS.map(async (dir) => ({
		dir,
		exists: await dirExists(join(rootDir, dir))
	})))).filter((entry) => !entry.exists).map((entry) => entry.dir);
	const createdKeeps = (await Promise.all(stateKeepPaths().map(async (path) => ({
		path,
		exists: await pathExists(join(rootDir, path))
	})))).filter((entry) => !entry.exists).map((entry) => entry.path);
	if (!dryRun) {
		await Promise.all(createdDirs.map((dir) => mkdir(join(rootDir, dir), { recursive: true })));
		await ensureStateScaffold(rootDir);
	}
	const { outputs, warnings } = await getEmissionPlanner().planWithWarnings({
		rootDir,
		manifest,
		engineVersion,
		packageName: opts.packageName ?? packageName(),
		npmChannel: opts.npmChannel ?? hasNpmChannel(),
		...registryOption(opts),
		facts: { monorepoPackages: decisions.monorepoPackages }
	});
	const ownedPaths = ledgerPathSet(rootDir, manifest.ledger.map((row) => row.path));
	const ownedHashes = ledgerHashIndex(rootDir, manifest.ledger);
	const replacePaths = new Set((manifest.importChoice ?? []).filter((row) => row.mode === "replace").map((row) => row.path));
	const packServers = await installedPackServers$1(rootDir, manifest);
	const wrote = [];
	const skippedPaths = /* @__PURE__ */ new Set();
	const writtenByPath = /* @__PURE__ */ new Map();
	const writtenRecordByPath = /* @__PURE__ */ new Map();
	const previousLedger = previous?.ledger ?? [];
	const coOwnedLanes = coOwnedDocumentLanes(manifest, packServers, previousLedger, await provenLegacyCursorGuards(rootDir, previousLedger, {
		packageName: opts.packageName ?? packageName(),
		npmChannel: opts.npmChannel ?? hasNpmChannel()
	}));
	const previousHashes = ledgerHashIndex(rootDir, previousLedger);
	for (const output of outputs) {
		const coOwnedLane = coOwnedLanes.get(output.path);
		const target = join(rootDir, ...output.path.split("/"));
		let result;
		if (output.sourceRefusal !== void 0) result = {
			path: target,
			action: "skipped",
			warning: `Skipped ${output.path}. ${output.sourceRefusal.message}`
		};
		else if (MERGED_MCP_JSON_PATHS.has(output.path)) {
			const { writtenContent, ...merged } = await writeMcpDocument(target, output.content, manifest.mcp?.servers ?? [], output.path, dryRun, packServers);
			result = merged;
			if (writtenContent !== null) writtenByPath.set(output.path, writtenContent);
		} else if (coOwnedLane !== void 0) {
			const { writtenContent, writtenRecord, ...merged } = await writeCoOwnedDocument(coOwnedLane, target, output.content, dryRun, coOwnedOwnershipOf(previousLedger, output.path, {
				boundaryDir: rootDir,
				ledgerHashes: previousHashes
			}));
			result = merged;
			if (writtenContent !== null) writtenByPath.set(output.path, writtenContent);
			if (writtenRecord !== null) writtenRecordByPath.set(output.path, writtenRecord);
		} else result = await writeOutput(target, output.content, engineVersion, dryRun, force || replacePaths.has(output.path), ownedPaths, rootDir, ownedHashes);
		wrote.push(result);
		if (result.action === "skipped") skippedPaths.add(output.path);
	}
	const emittedByAdapter = /* @__PURE__ */ new Map();
	const add = (row) => {
		const rows = emittedByAdapter.get(row.adapter) ?? [];
		rows.push(row);
		emittedByAdapter.set(row.adapter, rows);
	};
	for (const output of outputs) {
		if (skippedPaths.has(output.path)) {
			if (coOwnedLanes.has(output.path)) for (const row of coOwnedRowsCarriedThroughRefusal(previousLedger, output.path)) add(row);
			continue;
		}
		const managedBody = extractManagedBlock(output.content, join(rootDir, ...output.path.split("/")));
		for (const row of ledgerRowsForOutput(output, writtenByPath.get(output.path) ?? null, managedBody, engineVersion, writtenRecordByPath.get(output.path))) add(row);
	}
	let ledger = manifest.ledger;
	for (const tool of manifest.tools) ledger = replaceAdapterEntries(ledger, tool, toLedgerEntries(emittedByAdapter.get(tool) ?? []));
	manifest.ledger = ledger;
	let gitignoreAdded = [];
	if (!dryRun) {
		gitignoreAdded = await ensureGitignoreEntry(rootDir);
		await writeManifest(rootDir, manifest, { now });
	}
	return {
		manifestPath: manifestPath(rootDir),
		createdDirs,
		createdKeeps,
		wrote,
		warnings,
		ledgerCount: ledger.length,
		gitignoreEnsured: !dryRun,
		gitignoreAdded,
		dryRun
	};
}
async function writeMcpDocument(target, content, selectedServers, relPath, dryRun, packServers) {
	if (dryRun) {
		const { result } = await predictMcpDocumentMerge(target, relPath, content, selectedServers, packServers);
		return {
			...result,
			writtenContent: null
		};
	}
	const existing = await readIfExists(target);
	return materializeUserMcpJson(target, content, engineOwnedServerIds(relPath, selectedServers, existing, packServers));
}
async function writeCoOwnedDocument(lane, target, content, dryRun, ownership) {
	if (dryRun) {
		const { result } = await lane.predict(target, content, ownership);
		return {
			...result,
			writtenContent: null,
			writtenRecord: null
		};
	}
	return lane.materialize(target, content, ownership);
}
async function writeOutput(target, content, engineVersion, dryRun, force, ledgerPaths, boundaryDir, ledgerHashes) {
	const writeOptions = outputWriteOptions(extractManagedBlock(content, target), engineVersion, force, boundaryDir, ledgerPaths, ledgerHashes);
	if (!dryRun) return safeWriteFile(target, content, writeOptions);
	const existing = await readIfExists(target);
	return {
		path: target,
		action: predictMergeAction(existing, content, writeOptions, target)
	};
}
async function readPreviousManifest(rootDir) {
	try {
		return await readManifest$1(rootDir);
	} catch {
		return null;
	}
}
async function carriedPackRows(rootDir, previous) {
	const rows = (previous?.ledger ?? []).filter((row) => isPackOwner(row.adapter));
	const present = /* @__PURE__ */ new Map();
	for (const row of rows) {
		const id = row.adapter.slice(PACK_OWNER_PREFIX.length);
		if (present.has(id)) continue;
		present.set(id, await packDirExists(rootDir, id));
	}
	return rows.filter((row) => present.get(row.adapter.slice(PACK_OWNER_PREFIX.length)) === true);
}
async function packDirExists(rootDir, packId) {
	try {
		return await dirExists(join(rootDir, ...packDirRelPath(packId).split("/")));
	} catch {
		return false;
	}
}
async function composeManifest(decisions, defaults, importChoice, plugin, engineVersion, now) {
	const selection = await loadFullSelection();
	const defaultTools = defaults?.tools;
	const tools = decisions.toolsSource === "flag" || defaultTools === void 0 || defaultTools.length === 0 ? decisions.tools : [...defaultTools];
	const maturityTier = decisions.maturitySource === "flag" ? decisions.maturityTier : defaults?.maturityTier ?? decisions.maturityTier;
	const mcp = defaults?.mcpServers !== void 0 && defaults.mcpServers.length > 0 ? { servers: [...defaults.mcpServers] } : void 0;
	const fresh = createManifest({
		tools,
		...decisions.platform !== void 0 ? { platform: decisions.platform } : {},
		selection,
		maturityTier,
		...mcp !== void 0 ? { mcp } : {},
		detected: decisions.detected,
		...importChoice === void 0 || importChoice.length === 0 ? {} : { importChoice },
		now,
		generatorVersion: engineVersion
	});
	const settled = {
		...defaults?.communicationStyle === void 0 ? {} : { communicationStyle: defaults.communicationStyle },
		...plugin === void 0 ? {} : { plugin },
		...decisions.gatePins === void 0 ? {} : { gates: decisions.gatePins }
	};
	return Object.keys(settled).length === 0 ? fresh : applyPreservedManifestFields(fresh, settled);
}
async function loadFullSelection() {
	let roots;
	try {
		const root = resolveBundledContentRoot();
		const forkRoot = resolveBundledForkRoot();
		roots = {
			root,
			...forkRoot === void 0 ? {} : { forkRoot }
		};
	} catch (error) {
		if (error instanceof EngineError && error.code === "CONFIG_ERROR") return fullCoreSelection({
			items: [],
			byKey: /* @__PURE__ */ new Map(),
			collisions: []
		});
		throw error;
	}
	return fullCoreSelection(await buildContentIndex(roots));
}
async function pathExists(path) {
	try {
		await lstat(path);
		return true;
	} catch {
		return false;
	}
}
async function dirExists(path) {
	try {
		return (await stat(path)).isDirectory();
	} catch {
		return false;
	}
}
function claudeSteps() {
	const open = "open a terminal in this repo and type: claude";
	if (CLAUDE_SKILLS_DIR === "") return [open, `inside Claude Code, type: /st-work — the touchpoint commands are installed in ${CLAUDE_COMMANDS_DIR}/ (no skills directory was emitted for this client)`];
	return [
		open,
		`the nine touchpoint commands are installed in ${CLAUDE_COMMANDS_DIR}/`,
		`start here — inside Claude Code, type: /st-onboard, the guided first change at ${CLAUDE_SKILLS_DIR}/st-onboard/SKILL.md`
	];
}
function codexSteps() {
	const open = "open a terminal in this repo and type: codex";
	const onboard = `then type: $st-onboard — the guided first change at ${SKILLS_PROJECTION_DIR}/st-onboard/SKILL.md`;
	return [
		...codexTrustStep("project-trust"),
		open,
		...codexTrustStep("hook-review"),
		...commandSurfaceStep(CODEX_COMMANDS_DIR, "$st-<id>"),
		onboard
	];
}
function codexTrustStep(id) {
	return HOOK_TRUST_STEPS.flatMap((step) => step.id === id && step.operatorStep !== null ? [step.operatorStep] : []);
}
function cursorSteps() {
	const open = "open this repo in Cursor and open the chat panel";
	const nativeSkills = NATIVE_SKILL_DIRS.cursor;
	const onboard = nativeSkills === void 0 ? `in the chat, type: /st-onboard, the guided first change at ${SKILLS_PROJECTION_DIR}/st-onboard/SKILL.md` : `in the chat, type: /st-onboard, the guided first change at ${nativeSkills}/st-onboard/SKILL.md`;
	return [
		open,
		...commandSurfaceStep(CURSOR_COMMANDS_DIR, "/<id>"),
		onboard
	];
}
function commandSurfaceStep(dir, invocation) {
	if (dir === null) return [];
	return [`the nine touchpoint commands are installed in ${dir}/ — invoke one as ${invocation}`];
}
const NEXT_STEPS = {
	claude: claudeSteps(),
	cursor: cursorSteps(),
	copilot: [
		"open VS Code Copilot chat in this repo",
		...commandSurfaceStep(COPILOT_PROMPTS_DIR, "/st-<id>"),
		"in the chat, type: @workspace run the st-onboard workflow"
	],
	codex: codexSteps()
};
function nextStepsForTool(tool) {
	return [...NEXT_STEPS[tool]];
}
const MAX_DETECTED_PARTS = 6;
function detectedLabel(input) {
	const { decisions } = input;
	const info = decisions.repoInfo;
	const parts = [
		...input.predecessorDetected === true ? ["a predecessor setup"] : [],
		...info.frameworks,
		...info.languages.length > 0 ? info.languages : decisions.detected.languages,
		...info.linters,
		...info.testFrameworks,
		...info.ciProviders,
		...info.packageManager === void 0 ? [] : [info.packageManager],
		...decisions.detectedTools.map((tool) => `${tool} traces`)
	];
	if (parts.length === 0) return "a fresh repo (no traces)";
	const shown = parts.slice(0, MAX_DETECTED_PARTS);
	const omitted = parts.length - shown.length;
	return omitted > 0 ? `${shown.join(", ")} +${omitted} more` : shown.join(", ");
}
function emissionSummary(report, dryRun = report.dryRun) {
	const generated = new Set(report.wrote.filter((row) => row.action !== "skipped").map((row) => row.path)).size;
	const skipped = new Set(report.wrote.filter((row) => row.action === "skipped").map((row) => row.path)).size;
	if (generated > 0) {
		const tail = skipped > 0 ? `, ${skipped} left alone (already yours)` : "";
		const keeps = report.createdKeeps.length;
		const total = generated + 1 + keeps;
		const parts = [
			`${generated} generated`,
			`the manifest (${STATE_DIR}/${MANIFEST_FILE})`,
			...keeps > 0 ? [`${keeps} state-directory keep file(s)`] : []
		].join(", ");
		const gitignore = report.gitignoreAdded.length > 0 ? "; .gitignore changed" : "";
		return dryRun ? `${total} file(s) would be written (${parts})${tail}` : `${total} file(s) on disk (${parts}${gitignore})${tail}`;
	}
	if (skipped > 0) return dryRun ? `no file would be written — all ${skipped} planned path(s) already exist and would be left alone` : `nothing installed — all ${skipped} planned path(s) already exist and were left alone; see the warnings below`;
	return "state + manifest only — this build planned no content files";
}
function gatePinLine(decisions) {
	const pins = decisions.gatePins;
	if (pins === void 0) return null;
	const pinned = [
		"test",
		"lint",
		"typecheck"
	].flatMap((gate) => {
		const command = pins[gate];
		return command === void 0 ? [] : [{
			gate,
			command
		}];
	});
	return `gates pinned to the project's virtual environment, so they run with none activated: ${pinned.map(({ gate, command }) => `${gate} \`${command}\``).join(", ")} (recorded as ${pinned.map(({ gate }) => `gates.${gate}`).join(", ")} in the manifest; sync never rewrites them). The pins use the POSIX interpreter path and will not run on Windows until those keys are changed.`;
}
function platformLine(decisions) {
	return decisions.platform === void 0 ? `platform: none detected — set it with ${packageCommand("config set platform <name>")}, <name> one of ${Object.keys(PLATFORM_MCP_SERVER).join(", ")}` : `platform: ${decisions.platform} (from the origin remote)`;
}
function installedLabel(decisions, report) {
	return `${decisions.tools.join(", ")} (${emissionSummary(report)})`;
}
function defaultClientsLine(decisions, dryRun) {
	if (decisions.toolsSource !== "default") return null;
	const all = TOOLS.join(",");
	const route = dryRun ? `add more with --tools ${all}` : `add more with ${packageCommand(`config set tools ${all}`)}, then ${packageCommand("sync")}`;
	return `clients: ${decisions.tools.join(", ")} (the default — no other client's files were found; ${route})`;
}
function copilotWorkflowStep(report, rootDir) {
	if (report.dryRun) return [];
	const target = join(rootDir, ...COPILOT_SETUP_STEPS_PATH.split("/"));
	const row = report.wrote.find((entry) => entry.path === target);
	if (row === void 0 || row.action === "skipped") return [];
	return [`the coding agent's setup workflow is at ${COPILOT_SETUP_STEPS_PATH} — GitHub runs it before the Copilot coding agent starts work on a task, on a push or pull request that changes the file, and by hand from the Actions tab`];
}
function nextStepsAfterRun(tool, report, rootDir) {
	const steps = nextStepsForTool(tool);
	if (tool === "copilot") steps.splice(-1, 0, ...copilotWorkflowStep(report, rootDir));
	return steps;
}
function refusedFolderSteps(gitReason) {
	if (gitReason !== "bare-layout") return [];
	return ["before you start a client or a flow here, move the folder that has the layout of a bare repository off this path, or work from a checkout that does not keep it there: git was not started here, because this folder, or a folder above it, has that layout (HEAD beside objects and refs, or beside commondir). Look at the entries of this folder and of each folder above it by name to find that folder, and do not run git in it or in any folder under it, this one included. A client's own tools, a flow's session and its sub-agents start git of their own, and only the git the engine itself starts is set to refuse such a folder. The steps after this one are for when that is done"];
}
function migrationLines(carry, residue, gitReason, gitAvailable = true) {
	const deleted = carry.strips.filter((row) => row.action === "deleted").map((row) => row.path);
	const stripped = carry.strips.filter((row) => row.action === "stripped").length;
	const verb = carry.dryRun ? "would be " : "";
	const parts = [
		`${carry.learningsCarried} learning(s) ${verb}carried` + (carry.learningsSkipped > 0 ? ` (${carry.learningsSkipped} skipped)` : ""),
		`${stripped} file(s) ${verb}stripped of old managed blocks`,
		`${deleted.length} file(s) ${verb}deleted`
	];
	if (carry.envMcpCarried) parts.push(`${ENV_MCP_FILE} ${verb}carried`);
	const tail = carry.overridesPresent ? " — old overrides were left in place for you to review by hand" : "";
	const lines = [`migrated: ${parts.join(", ")}${tail}`];
	if (deleted.length > 0) lines.push(`  deleted (held nothing but the old generated block): ${deleted.join(", ")}`);
	lines.push(...residueLines(residue, carry, gitReason, gitAvailable));
	return lines;
}
function residueLines(residue, carry, gitReason, gitAvailable) {
	if (residue === void 0 || residue.paths.length === 0) return [];
	const keepProse = gitReason === "bare-layout" ? "copy the files that hold it somewhere outside this folder before you run it, and use no git command for that: git was not started here, because this folder, or a folder above it, has the layout of a bare repository. " : gitAvailable ? "commit this repo before you run it. " : "copy the files that hold it somewhere outside this folder before you run it: git did not answer here, so the engine knows of no commit that holds them. ";
	const lines = [`  left in place: ${residue.paths.length} predecessor path(s) — ${residue.paths.join(", ")}. The migration carries learnings and credentials and strips old managed blocks; it removes nothing else, so predecessor-emitted agents, slash commands and CI workflows are still live. Removing them is the previous setup's own uninstall, run by you: this run knows the paths above but not that tool's verbs, so it names none — and each listed directory is a separate scope, so a workspace package holding its own state needs its own run. Then re-run \`${packageCommand("check")}\`.`, `  eyes open on that uninstall: it finds what to remove by DIRECTORY rather than by name, and this setup writes into the same directories at the same paths — so it takes THIS setup's generated files with it. Run it in its own preview mode first, if it has one, and read the list. Generated files come back afterwards: \`${packageCommand("check")}\` names each one and \`${packageCommand("sync")}\` writes it back from the corpus. Your own prose outside a managed block does not come back — nothing can regenerate it — so ${keepProse}And if it finishes by offering to reinstall the old setup, decline.`];
	if (residue.unownedSettingsPath !== void 0) lines.push(`  one of those paths is live wiring: ${residue.unownedSettingsPath} could not be merged: a member the engine writes into has another type, or the file is a link (the warning above names which), so this run installed none of its own hook or permission settings there — whatever that file wires is what still fires. Fix what the warning names and run \`${packageCommand("sync")}\`. If it is the previous setup's rather than yours, remove it and run \`${packageCommand("sync")}\` to get this setup's.`);
	if (carry.envMcpCarried) lines.push(`  before any of that: ${ENV_MCP_FILE} at the repo root is now THIS setup's credential file. The carry adopted the previous setup's file where it stood — no copy was made — so an uninstall that removes credentials would take the live tokens with it. Copy it somewhere outside the repo first.`);
	return lines;
}
function warningLines(report) {
	return [...report.wrote.flatMap((row) => row.warning === void 0 ? [] : [row.warning]), ...report.warnings];
}
function noticeLines(report) {
	return report.wrote.flatMap((row) => row.notice === void 0 ? [] : [row.notice]);
}
const GITIGNORE_REASONS = /* @__PURE__ */ new Map([
	[ENV_MCP_FILE, "MCP server credentials"],
	[REVIEW_GATE_STATE_FILE, "the review gate's per-run state"],
	[REVIEW_GATE_STATE_FILE + REVIEW_GATE_LOCK_SUFFIX, "the review gate's lock"],
	[`${REVIEW_GATE_STATE_FILE}${REVIEW_GATE_TEMP_INFIX}*`, "the review gate's temporary writes"]
]);
function gitignoreReason(entry) {
	return GITIGNORE_REASONS.get(entry) ?? "machine-local state this setup writes";
}
function gitignoreLine(input) {
	const { dryRun, entries } = input;
	const gitAvailable = input.gitAvailable ?? true;
	const tense = dryRun ? "would be added to" : entries.length === 1 ? "was added to" : "were added to";
	const where = dryRun ? " wherever it lacks them" : "";
	const named = entries.map((entry) => `${entry} (${gitignoreReason(entry)})`).join(", ");
	const credential = input.mcpConfigured && entries.includes(".env.mcp") ? `, the credential file this setup uses (${ENV_MCP_FILE}) among them` : "";
	const head = `security: ${entries.length === 1 ? "this line" : "these lines"} — ${named} — ${tense} your .gitignore${where}, so git leaves those files out of commits${credential}. Nothing else in your .gitignore is touched`;
	if (gitAvailable) return `${head}, and the rest of the ${STATE_DIR}/ state directory is committed on purpose.`;
	if (input.gitReason === "bare-layout") return `${head}. git was not started here: this folder, or a folder above it, has the layout of a bare repository, so the engine did not hand it to git and cannot say what is tracked or ignored here. The rule takes effect wherever a repository holds this folder in its working tree, and the ${STATE_DIR}/ state directory is meant to be committed there.`;
	if (input.gitFound === false) return `${head}. git did not answer here: the engine found no git to start, so it cannot say what is tracked or ignored here. The rule takes effect wherever a repository holds this folder in its working tree, and the ${STATE_DIR}/ state directory is meant to be committed there.`;
	return `${head}. git did not answer here though the engine found a git binary, so this directory is not a git repository yet, or git was only slow to answer: nothing is known to be tracked or ignored here. The rule takes effect once a repository holds this folder in its working tree, and the ${STATE_DIR}/ state directory is meant to be committed once there is somewhere to commit it.`;
}
function credentialLine(mcpServers) {
	return `credentials: ${ENV_MCP_FILE} holds the credentials for ${mcpServers.join(", ")}. Before starting your tool, load it by copy-pasting this into your terminal: ${getSourceEnvMcpCommand()}`;
}
function mostSpecificFirst(suggestions) {
	return [...suggestions.filter((row) => row.kind === "framework"), ...suggestions.filter((row) => row.kind !== "framework")];
}
function stackSuggestionLines(suggestions, palette) {
	if (suggestions.length === 0) return [];
	const ordered = mostSpecificFirst(suggestions);
	const shown = ordered.slice(0, 3);
	const omitted = ordered.length - shown.length;
	const lines = [palette.bold("detected stacks with no dedicated guidance yet:")];
	for (const row of shown) {
		const install = row.packId === void 0 ? "" : `: ${packageCommand(`add ${row.packId}`)}`;
		lines.push(`  ${row.name} (${row.kind}) — ${row.action}${install}`);
	}
	if (omitted > 0) lines.push(palette.dim(`  … and ${omitted} more in the same position.`));
	lines.push("");
	return lines;
}
function renderInitPanel(input) {
	const { decisions, report, carry, mcpServers, palette } = input;
	const stackSuggestions = input.stackSuggestions ?? [];
	const lines = [];
	lines.push(palette.bold(palette.green("stamity is ready.")));
	lines.push("");
	lines.push(`  detected ${detectedLabel(input)} -> installed ${installedLabel(decisions, report)} ` + palette.dim(`(tier: ${decisions.maturityTier}, change with \`${packageCommand("config")}\`)`));
	const defaulted = defaultClientsLine(decisions, false);
	if (defaulted !== null) lines.push(`  ${defaulted}`);
	lines.push(`  ${platformLine(decisions)}`);
	const pinLine = gatePinLine(decisions);
	if (pinLine !== null) lines.push(`  ${pinLine}`);
	if (carry !== null) for (const line of migrationLines(carry, input.residue, input.gitReason, input.gitAvailable ?? true)) lines.push(`  ${line}`);
	if (report.gitignoreEnsured && report.gitignoreAdded.length > 0) lines.push(`  ${gitignoreLine({
		dryRun: false,
		gitAvailable: input.gitAvailable ?? true,
		...input.gitReason === void 0 ? {} : { gitReason: input.gitReason },
		...input.gitFound === void 0 ? {} : { gitFound: input.gitFound },
		entries: report.gitignoreAdded,
		mcpConfigured: mcpServers.length > 0
	})}`);
	if (mcpServers.length > 0) lines.push(`  ${credentialLine(mcpServers)}`);
	for (const notice of noticeLines(report)) lines.push(`  ${notice}`);
	for (const warning of warningLines(report)) lines.push(`  ${palette.yellow(`warning: ${warning}`)}`);
	lines.push("");
	lines.push(...stackSuggestionLines(stackSuggestions, palette));
	for (const tool of decisions.tools) {
		const heading = decisions.tools.length > 1 ? `${palette.bold(`next steps (${tool}):`)}` : palette.bold("next steps:");
		lines.push(heading);
		const steps = [...refusedFolderSteps(input.gitReason), ...nextStepsAfterRun(tool, report, decisions.repoInfo.rootDir)];
		for (const [index, step] of steps.entries()) lines.push(`  ${index + 1}. ${step}`);
	}
	return `${lines.join("\n")}\n`;
}
//#endregion
//#region src/cli/commands/init.ts
const DEFAULT_TOOL = "claude";
const MIGRATE_MODES = ["full", "skip"];
const TOOLS_QUESTION = "Which tools?";
const TOOL_LABELS = {
	claude: "Claude Code",
	cursor: "Cursor",
	copilot: "GitHub Copilot",
	codex: "Codex CLI"
};
const TOOL_CHOICES = TOOLS.map((tool) => ({
	value: tool,
	label: `${tool} — ${TOOL_LABELS[tool]}`
}));
function stringOpt(opts, key) {
	const value = opts[key];
	return typeof value === "string" ? value : void 0;
}
function splitCsv(raw) {
	return raw.split(",").map((name) => name.trim().toLowerCase()).filter((name) => name !== "");
}
function readOverrides(opts) {
	const toolsCsv = stringOpt(opts, "tools");
	const maturity = stringOpt(opts, "maturity");
	return {
		...toolsCsv === void 0 ? {} : { tools: splitCsv(toolsCsv) },
		...maturity === void 0 ? {} : { maturityTier: maturity }
	};
}
async function askTools(gate, promptIo, ctx) {
	if (!gate.interactive) return null;
	const picked = await selectMany(gate, promptIo, {
		question: TOOLS_QUESTION,
		choices: TOOL_CHOICES,
		defaultValues: [DEFAULT_TOOL]
	});
	if (picked.length > 0) return picked;
	ctx.io.out(`no tool selected — using the default (${DEFAULT_TOOL})\n`);
	return [DEFAULT_TOOL];
}
async function askMigrate(gate, promptIo) {
	if (!gate.interactive) return "skip";
	return await selectOne(gate, promptIo, {
		question: "Previous setup detected (predecessor state dir). Migrate it?",
		choices: [{
			value: "full",
			label: "full — import its config as defaults, strip its old managed blocks, carry learnings + .env.mcp"
		}, {
			value: "skip",
			label: "skip — leave the previous setup untouched"
		}],
		defaultValue: "full"
	});
}
async function askProceedWithoutGit(gate, promptIo, reason, gitFound) {
	return await confirm(gate, promptIo, {
		question: reason === "bare-layout" ? "git was not started here: this folder, or a folder above it, has the layout of a bare repository, so the engine did not hand it to git. Files written now have no revert path the engine could check. Continue?" : gitFound ? "No git repository here (git did not answer, or this directory is not a repo). Files written now cannot be reverted with git. Continue?" : "git did not answer here: the engine found no git to start. Files written now cannot be reverted with git. Continue?",
		defaultYes: true
	});
}
function noGitNote(dryRun, reason, gitFound) {
	const tense = dryRun ? "would be written" : "were written";
	if (reason === "bare-layout") return `git was not started here, so the files that ${tense} have no revert path the engine could check: this folder, or a folder above it, has the layout of a bare repository (HEAD beside objects and refs, or beside commondir), met before any .git that git stops at, so the engine did not hand it to git. Look at the entries of this folder and of each folder above it by name to find that folder, and do not run git in it or in any folder under it, this one included. Two verbs need git: worktree refuses without it, and gate reads every change from it, so here gate scan exits 1 and /st-quick and /st-work list \`secret scan: not run\` under \`Not done:\`. Neither flow stops at this cause, and the git a flow's session and its sub-agents start is not set to refuse such a folder as the engine's is, so start no flow here until that folder is moved off this path.`;
	if (!gitFound) return `git did not answer here, so the files that ${tense} have no revert path: the engine found no git to start. It takes git only from a PATH entry that is a full path to a folder other than this one, and no such entry holds a git binary: install git, or put the folder that holds it on PATH by its full path. Two verbs need git: worktree refuses without it, and gate reads every change from it, so here gate scan exits 1 and /st-quick and /st-work list \`secret scan: not run\` under \`Not done:\`.`;
	return `no git repository: git did not answer in this directory, so the files that ${tense} have no revert path. The engine found a git binary on PATH, so this directory is not a repository, or git was only slow to answer. Two verbs need git: worktree refuses without it, and gate reads every change from it, so with no repository gate scan exits 1 and /st-quick and /st-work list \`secret scan: not run\` under \`Not done:\`.`;
}
async function askImport(gate, promptIo, targetPaths) {
	const pronoun = targetPaths.length > 1 ? "them" : "it";
	return await selectOne(gate, promptIo, {
		question: `Existing agent config found (${targetPaths.join(", ")}). Import ${pronoun}?`,
		choices: [
			{
				value: "supplement",
				label: "supplement — keep it, add generated guidance alongside it"
			},
			{
				value: "replace",
				label: "replace — back it up, then replace it with generated guidance"
			},
			{
				value: "skip",
				label: "skip — leave it alone"
			}
		],
		defaultValue: DEFAULT_IMPORT_MODE
	});
}
const MAX_DISCLOSED_CANDIDATES = 3;
async function askCreateWorkspace(gate, promptIo, count) {
	return await confirm(gate, promptIo, {
		question: `${String(count)} repositories found under this directory. Create a workspace.json so one policy reaches all of them?`,
		defaultYes: false
	});
}
function workspaceMarkers(repo) {
	return [...repo.hasGit ? [".git"] : [], ...repo.hasManifest ? [STATE_DIR] : []].join(", ");
}
async function askWorkspaceMembers(gate, promptIo, candidates) {
	const picked = await selectMany(gate, promptIo, {
		question: `Which repositories join this workspace? (${String(candidates.length)} found)`,
		choices: candidates.map((repo) => ({
			value: repo.path,
			label: `${sanitizeLabel(repo.path)} — ${workspaceMarkers(repo)}`
		})),
		defaultValues: candidates.map((repo) => repo.path)
	});
	const chosen = new Set(picked);
	return candidates.filter((repo) => chosen.has(repo.path));
}
async function workspaceMemberTools(memberDir) {
	try {
		return (await readManifest$1(memberDir))?.tools ?? [];
	} catch {
		return [];
	}
}
async function deriveWorkspaceTools(rootDir, selected) {
	const lists = await Promise.all(selected.map(async (repo) => repo.hasManifest ? workspaceMemberTools(join(rootDir, repo.path)) : []));
	const declared = new Set(lists.flat());
	const tools = TOOLS.filter((tool) => declared.has(tool));
	return tools.length === 0 ? [DEFAULT_TOOL] : tools;
}
async function createOfferedWorkspace(rootDir, selected, dryRun) {
	const tools = await deriveWorkspaceTools(rootDir, selected);
	const manifest = createWorkspaceManifest({ tools }, selected.map((repo) => ({ path: repo.path })));
	if (!dryRun) await writeWorkspaceManifest(rootDir, manifest);
	return {
		path: join(rootDir, WORKSPACE_MANIFEST_FILE),
		members: manifest.repos.map((entry) => entry.path),
		tools: [...manifest.defaults.tools]
	};
}
function candidateSummary(candidates) {
	const shown = candidates.slice(0, MAX_DISCLOSED_CANDIDATES).map((repo) => sanitizeLabel(repo.path));
	const omitted = candidates.length - shown.length;
	return omitted > 0 ? `${shown.join(", ")}, … and ${String(omitted)} more` : shown.join(", ");
}
function workspaceOfferNote(candidates) {
	return `workspace: ${String(candidates.length)} repositories found under this directory (${candidateSummary(candidates)}). No ${WORKSPACE_MANIFEST_FILE} was created — this run is not interactive, and declaring a policy over repositories you did not name is not an unattended default. Create one with \`stamity workspace init\`.`;
}
function workspaceCreatedNote(created, dryRun) {
	const tense = dryRun ? "would be created" : "was created";
	const members = created.members.map((member) => sanitizeLabel(member));
	return `workspace: ${created.path} ${tense}, registering ${String(created.members.length)} member${created.members.length === 1 ? "" : "s"} (${members.join(", ")}) with tools ${created.tools.join(", ")}. Run \`stamity workspace sync\` to apply this policy to every member.`;
}
function workspaceKeptNoneNote() {
	return `workspace: no repositories selected — no ${WORKSPACE_MANIFEST_FILE} was created. Run \`stamity workspace init\` to pick the repositories that join.`;
}
function effectiveView(decisions, defaults) {
	const tools = decisions.toolsSource === "flag" || defaults?.tools === void 0 || defaults.tools.length === 0 ? decisions.tools : [...defaults.tools];
	const maturityTier = decisions.maturitySource === "flag" ? decisions.maturityTier : defaults?.maturityTier ?? decisions.maturityTier;
	const toolsSource = tools === decisions.tools ? decisions.toolsSource : "detected";
	return {
		...decisions,
		tools,
		toolsSource,
		maturityTier
	};
}
function importNote(targetPath, choice, written, dryRun) {
	const tense = dryRun ? "would be" : "was";
	if (written === void 0 && choice !== "skip") return unwrittenImportNote(targetPath, choice, dryRun);
	switch (choice) {
		case "supplement": return `existing config: ${targetPath} ${outcomeToken(written?.action, dryRun, "kept")} — generated guidance ${tense} merged in as a STAMITY:BEGIN/END block and every other byte preserved (supplement)`;
		case "replace": return `existing config: ${targetPath} ${outcomeToken(written?.action, dryRun, "replaced")} — the previous file ${tense} copied to a verified .bak first (replace)`;
		case "skip": return `existing config: ${targetPath} is left alone — nothing is generated at that path, now or on any later sync (skip)`;
	}
}
function unwrittenImportNote(targetPath, choice, dryRun) {
	return `existing config: ${targetPath} ${dryRun ? "would not be written to" : "was not written to"} — no selected tool generates anything at that path, so nothing is merged in and nothing is replaced. If a migration runs, its strip ${dryRun ? "would still remove" : "may still have removed"} a previous setup's managed block from this file; that is the only edit it sees. Your \`${choice}\` answer is recorded and applies to the first run that does target the path.`;
}
function outcomeToken(action, dryRun, verb) {
	if (action === void 0) return dryRun ? `would be ${verb}` : "was not written to";
	if (action === "skipped") return dryRun ? "would be LEFT UNTOUCHED — the engine would refuse the write" : "was LEFT UNTOUCHED — the engine refused the write (see the warning below)";
	return dryRun ? `would be ${verb}` : `was ${verb}`;
}
function migrateNote(mode, rootDir, stateDir, interactive) {
	const where = stateDir === null ? "the previous setup (marker files only — no state directory)" : repoRelative(rootDir, stateDir);
	if (mode === "full") return `migrate: full — ${where} is being carried over`;
	return `migrate: skip — ${where} was left untouched (${interactive ? "you chose skip" : "this run is not interactive, and a full migration deletes files, so it is never the unattended default"}). Migrate it later by re-running \`stamity init --force --migrate full\`.`;
}
function renderDryRun(ctx, decisions, mcpServers, report, carry, residue, notes, git, gitFound) {
	const { io, palette } = ctx;
	io.out(`${palette.bold("Dry run")} — nothing was written. A real run would:\n`);
	io.out(report.createdDirs.length > 0 ? `  create: ${report.createdDirs.join(", ")}\n` : "  create: no new state directories (all present)\n");
	const defaulted = defaultClientsLine(decisions, true);
	if (defaulted !== null) io.out(`  ${defaulted}\n`);
	io.out(`  write: ${emissionSummary(report, true)}\n`);
	io.out(`  manifest: ${report.manifestPath}\n`);
	io.out(`  ${gitignoreLine({
		dryRun: true,
		gitAvailable: git.available,
		...git.reason === void 0 ? {} : { gitReason: git.reason },
		gitFound,
		entries: REQUIRED_GITIGNORE_ENTRIES,
		mcpConfigured: mcpServers.length > 0
	})}\n`);
	for (const warning of [...report.wrote.flatMap((row) => row.warning === void 0 ? [] : [row.warning]), ...report.warnings]) io.out(`  ${palette.yellow(`warning: ${warning}`)}\n`);
	if (carry !== null) for (const line of migrationLines(carry, residue, git.reason, git.available)) io.out(`  ${line}\n`);
	for (const note of notes) io.out(`  ${note}\n`);
	io.out("\nnext:\n  1. apply it: stamity init\n");
}
function migrationResidue(rootDir, state, carry, report) {
	const stateDir = state.stateDirPath;
	const settings = unownedSettings(rootDir, report);
	const paths = [
		...stateDir === null ? [] : [stateDir],
		...state.overridesDir === null ? [] : [state.overridesDir],
		...state.packagesWithState,
		...carry.strips.filter((row) => row.action === "unchanged").map((row) => row.path)
	].map((path) => repoRelative(rootDir, path));
	return {
		paths: settings === null ? paths : [...paths, settings],
		...settings === null ? {} : { unownedSettingsPath: settings }
	};
}
function unownedSettings(rootDir, report) {
	return report.wrote.some((row) => row.action === "skipped" && repoRelative(rootDir, row.path) === ".claude/settings.json") ? CLAUDE_SETTINGS_PATH : null;
}
function repoRelative(rootDir, path) {
	if (!isAbsolute(path)) return path;
	const rel = relative(rootDir, path);
	return rel === "" ? "." : rel.split(sep).join("/");
}
const initCommand = {
	name: "init",
	summary: "set up this repo: detect the stack, decide the defaults, write the state",
	mutating: true,
	configure(cmd) {
		cmd.option("--tools <csv>", `target tools, comma-separated (${TOOLS.join(", ")})`).addOption(new Option("--maturity <tier>", "investment-calibration tier").choices([
			"solo",
			"team",
			"scaleup",
			"enterprise"
		])).addOption(new Option("--migrate <mode>", "what to do with a detected predecessor setup").choices([...MIGRATE_MODES])).addOption(new Option("--import-config <mode>", "what to do with an existing agent config file").choices([...IMPORT_MODES])).option("--force", "replace an existing setup in place");
	},
	async run(ctx, opts) {
		const rootDir = ctx.app.runtime.cwd;
		const now = ctx.app.runtime.clock.now();
		const force = opts["force"] === true;
		ctx.spinner.start("scanning this repo");
		const history = readHistoryFacts(rootDir);
		const git = readWorkingTreeStatus(rootDir);
		const gitFound = git.available || git.reason === "bare-layout" || gitProgramFor(rootDir, process.env) !== null;
		const alreadyInitialised = !force && await readManifest$1(rootDir) !== null;
		const [decisions, predecessor] = await Promise.all([buildInitDecisions(rootDir, readOverrides(opts), {
			history,
			skipWorkspaceProbe: alreadyInitialised
		}), detectPredecessorState(rootDir)]);
		ctx.spinner.stop();
		const gate = promptGate({
			stdinIsTTY: ctx.terminal.stdinIsTTY,
			yes: ctx.yes,
			json: ctx.json,
			env: ctx.app.runtime.env,
			palette: ctx.palette
		});
		let settled = decisions;
		if (!alreadyInitialised && decisions.toolsSource === "default") {
			const answered = await askTools(gate, ctx.promptIo, ctx);
			if (answered !== null) settled = {
				...decisions,
				tools: answered,
				toolsSource: "flag"
			};
		}
		const migrateFlag = stringOpt(opts, "migrate");
		const importFlag = stringOpt(opts, "importConfig");
		const importTargets = settled.existingConfigPaths;
		let migrate = null;
		let importChoice = null;
		if (!alreadyInitialised) {
			if (predecessor !== null) {
				migrate = migrateFlag ?? await askMigrate(gate, ctx.promptIo);
				if (importTargets.length > 0) importChoice = importFlag ?? "supplement";
			} else if (importTargets.length > 0) importChoice = importFlag ?? await askImport(gate, ctx.promptIo, importTargets);
		}
		const importMode = importChoice;
		const importDecisions = importMode === null ? [] : importTargets.map((path) => ({
			path,
			mode: importMode
		}));
		const migrating = predecessor !== null && migrate === "full" ? predecessor : null;
		const defaults = migrating !== null ? mapPredecessorDefaults(migrating.manifestRaw) : void 0;
		if (!git.available && !alreadyInitialised && !await askProceedWithoutGit(gate, ctx.promptIo, git.reason, gitFound)) {
			closePrompts(ctx.promptIo);
			throw new CliFailure({
				code: "VALIDATION_ERROR",
				message: "init cancelled — nothing was written",
				...git.reason === "bare-layout" ? {
					why: "git was not started in this directory: it, or a folder above it, has the layout of a bare repository, so the engine did not hand it to git and the write would have no revert path it could check",
					next: "look at the entries of this folder and of each folder above it by name to find the one with that layout (HEAD beside objects and refs, or beside commondir), and do not run git in that folder or in any folder under it, this one included; move it off that path, or run from a checkout that does not keep it there, and re-run `stamity init`, or re-run with -y to accept a setup whose revert path the engine could not check"
				} : gitFound ? {
					why: "git does not answer in this directory, so the write would have no revert path",
					next: "re-run `stamity init` once this directory is in a repository, which a .git entry in it or in a folder above it shows by name, or re-run with -y to accept a setup you cannot git-revert"
				} : {
					why: "git did not answer in this directory: the engine found no git to start, so the write would have no revert path",
					next: "install git, or put the folder that holds it on PATH by its full path, and re-run `stamity init`, or re-run with -y to accept a setup you cannot git-revert"
				}
			});
		}
		const offerArmed = !alreadyInitialised && workspaceOfferArmed(settled);
		let workspaceMembers = null;
		if (offerArmed && gate.interactive) {
			if (await askCreateWorkspace(gate, ctx.promptIo, settled.workspaceCandidates.length)) workspaceMembers = await askWorkspaceMembers(gate, ctx.promptIo, settled.workspaceCandidates);
		}
		closePrompts(ctx.promptIo);
		const report = await applyInit({
			rootDir,
			decisions: settled,
			...defaults === void 0 ? {} : { defaults },
			...importDecisions.length === 0 ? {} : { importChoice: importDecisions },
			engineVersion: ctx.app.version,
			dryRun: ctx.dryRun,
			force,
			now
		});
		const carry = migrating !== null ? await carryPredecessorAssets(rootDir, migrating, {
			dryRun: ctx.dryRun,
			now
		}) : null;
		const workspaceCreation = workspaceMembers !== null && workspaceMembers.length > 0 ? await createOfferedWorkspace(rootDir, workspaceMembers, ctx.dryRun) : null;
		const effective = effectiveView(settled, defaults);
		const mcpServers = defaults?.mcpServers ?? [];
		const residue = migrating !== null && carry !== null ? migrationResidue(rootDir, migrating, carry, report) : void 0;
		const notes = [];
		if (!git.available) notes.push(noGitNote(ctx.dryRun, git.reason, gitFound));
		if (predecessor !== null && migrate !== null) notes.push(migrateNote(migrate, rootDir, predecessor.stateDirPath, gate.interactive));
		for (const decision of importDecisions) notes.push(importNote(decision.path, decision.mode, report.wrote.find((row) => row.path === join(rootDir, ...decision.path.split("/"))), ctx.dryRun));
		if (workspaceCreation !== null) notes.push(workspaceCreatedNote(workspaceCreation, ctx.dryRun));
		else if (workspaceMembers !== null) notes.push(workspaceKeptNoneNote());
		else if (offerArmed && !gate.interactive) notes.push(workspaceOfferNote(settled.workspaceCandidates));
		if (ctx.dryRun) renderDryRun(ctx, effective, mcpServers, report, carry, residue, notes, git, gitFound);
		else {
			for (const note of notes) ctx.io.out(`${note}\n`);
			const welcome = bannerBlock({
				stdoutIsTTY: ctx.terminal.stdoutIsTTY,
				machineReadable: ctx.json,
				env: ctx.app.runtime.env,
				noColorFlag: !ctx.colorEnabled,
				...ctx.terminal.stdoutColumns === void 0 ? {} : { columns: ctx.terminal.stdoutColumns }
			});
			if (welcome !== "") ctx.io.out(`${welcome}\n`);
			ctx.io.out(renderInitPanel({
				decisions: effective,
				report,
				carry,
				mcpServers,
				palette: ctx.palette,
				gitAvailable: git.available,
				...git.reason === void 0 ? {} : { gitReason: git.reason },
				gitFound,
				predecessorDetected: predecessor !== null,
				...residue === void 0 ? {} : { residue },
				stackSuggestions: suggestStackPacks(effective.repoInfo)
			}));
		}
		return {
			exitCode: 0,
			json: {
				decisions: {
					tools: effective.tools,
					toolsSource: settled.toolsSource,
					detectedTools: settled.detectedTools,
					greenfield: settled.greenfield,
					maturityTier: effective.maturityTier,
					maturitySource: settled.maturitySource,
					platform: settled.platform ?? null,
					predecessorDetected: predecessor !== null,
					migrate,
					importChoice,
					existingConfigPaths: settled.existingConfigPaths,
					...offerArmed ? {
						workspaceCandidates: settled.workspaceCandidates.map((repo) => repo.path),
						workspaceCreated: workspaceCreation !== null && !ctx.dryRun
					} : {}
				},
				report,
				carry,
				nextSteps: [...refusedFolderSteps(git.reason), ...effective.tools.flatMap((tool) => nextStepsAfterRun(tool, report, rootDir))]
			}
		};
	}
};
//#endregion
//#region src/cli/commands/learn.ts
const CAPTURE = "capture";
const LEARNINGS_DIR$1 = "learnings";
const WRITE_GATES = [
	"content",
	"append-only",
	"count-cap",
	"sanitizer",
	"stamped-form"
];
function draftLearning(input) {
	const slug = input.title.trim().toLowerCase().replace(/\s+/g, "-");
	const body = input.body.trim();
	return {
		fileName: `${slug}.md`,
		frontmatter: {
			id: slug,
			title: input.title.trim(),
			date: input.date,
			confidence: input.confidence,
			summary: input.summary
		},
		body: body === "" ? "" : `\n${body}\n`
	};
}
function isoDate(now) {
	return now.toISOString().slice(0, 10);
}
function text$1(opts, key) {
	const value = opts[key];
	return typeof value === "string" ? value : "";
}
function optionalText(opts, key) {
	const value = opts[key];
	return typeof value === "string" ? value : void 0;
}
async function requireStateDir$1(rootDir) {
	try {
		await stat(join(rootDir, STATE_DIR));
	} catch {
		throw new CliFailure({
			code: "VALIDATION_ERROR",
			message: `this repo is not initialised — there is no ${STATE_DIR}/ directory to capture a learning into`,
			why: `capture is invoked by generated agent content, so it refuses rather than minting ${STATE_DIR}/ in whatever directory the caller happened to be in`,
			next: `run: ${packageCommand("init")}`
		});
	}
}
async function resolveBody(ctx, bodyFile) {
	if (bodyFile !== void 0) {
		const path = isAbsolute(bodyFile) ? bodyFile : resolve(ctx.app.runtime.cwd, bodyFile);
		try {
			return await readFile(path, "utf8");
		} catch (cause) {
			throw new CliFailure({
				code: "FS_ERROR",
				message: `--body-file ${bodyFile} could not be read`,
				why: cause instanceof Error ? cause.message : String(cause),
				next: "point --body-file at a readable file, or drop the flag and pipe the body on stdin"
			});
		}
	}
	if (ctx.terminal.stdinIsTTY) return "";
	return await readAll$1(ctx.promptIo.input, ctx.engine.guard.promptGuard.MAX_USER_CONTENT_LENGTH);
}
async function readAll$1(input, maxBytes) {
	const chunks = [];
	let total = 0;
	for await (const chunk of input) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8");
		total += buffer.byteLength;
		if (total > maxBytes) throw new CliFailure({
			code: "VALIDATION_ERROR",
			message: `the body piped on stdin is over the ${maxBytes} byte input ceiling`,
			why: "a learning is a curated note; the store caps one file far below this ceiling",
			next: "pipe the finding alone, or split it across separate captures"
		});
		chunks.push(buffer);
	}
	return Buffer.concat(chunks).toString("utf8");
}
function refuse(ctx, fileName, errors, gatesRun) {
	const doc = {
		code: "VALIDATION_ERROR",
		message: `learn capture refused ${JSON.stringify(fileName)}`,
		why: errors.join(" "),
		next: "rewrite the part the rule above names, then re-run the capture"
	};
	if (!ctx.json) ctx.io.err(`${renderFailureHuman(doc, ctx.palette)}\n`);
	return {
		exitCode: 1,
		json: {
			error: doc,
			fileName,
			errors: [...errors],
			...gatesRun === void 0 ? {} : { gatesRun: [...gatesRun] }
		}
	};
}
async function listLearningFileNames(dir) {
	try {
		return (await readdir(dir, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => entry.name);
	} catch (cause) {
		if (cause.code === "ENOENT") return [];
		throw new CliFailure({
			code: "FS_ERROR",
			message: `the learnings directory ${dir} could not be read`,
			why: cause instanceof Error ? cause.message : String(cause),
			next: "fix that directory's permissions, then re-run the capture"
		});
	}
}
async function dryRunCapture(ctx, rootDir, fileName, document, now) {
	const { validation } = ctx.engine.learnings;
	const { frontmatter } = ctx.engine.content;
	const caps = validation.resolveLearningsCaps();
	const dir = join(rootDir, STATE_DIR, LEARNINGS_DIR$1);
	const gates = validation.validateLearningContent(fileName, document, {
		maxFileBytes: caps.maxFileBytes,
		now
	});
	if (!gates.valid) return refuse(ctx, fileName, gates.errors, WRITE_GATES.slice(0, 1));
	const existing = await listLearningFileNames(dir);
	if (existing.includes(fileName)) return refuse(ctx, fileName, [`Learning "${fileName}" already exists in ${dir}. Learnings are append-only: retire that file or write this note under a different slug.`], WRITE_GATES.slice(0, 2));
	if (existing.length >= caps.maxCount) return refuse(ctx, fileName, [`The learnings directory ${dir} holds ${existing.length} files, at the ${caps.maxCount} file cap. Retire or consolidate a learning before adding "${fileName}".`], WRITE_GATES.slice(0, 3));
	const sanitization = validation.sanitizeLearningsContent(document);
	if (sanitization.content.trim() === "") return refuse(ctx, fileName, [`Learning "${fileName}" could not be neutralized — the sanitizer dropped it (patterns: ${sanitization.strippedPatternIds.join(", ") || "none reported"}). Rewrite the note without the flagged spans.`], WRITE_GATES.slice(0, 4));
	let parsed;
	try {
		parsed = frontmatter.parseFrontmatter(sanitization.content, `Learning "${fileName}"`);
	} catch (cause) {
		return refuse(ctx, fileName, [cause instanceof Error ? cause.message : String(cause)], WRITE_GATES.slice(0, 4));
	}
	const stamped = frontmatter.composeFrontmatter({
		...parsed.frontmatter,
		integrity: validation.computeLearningIntegrity(parsed.body)
	}, parsed.body);
	const recheck = validation.validateLearningContent(fileName, stamped, {
		maxFileBytes: caps.maxFileBytes,
		now
	});
	if (!recheck.valid) return refuse(ctx, fileName, recheck.errors.map((error) => `Stamped form — ${error}`), WRITE_GATES);
	ctx.io.out(`Dry run: ${JSON.stringify(fileName)} passes every write gate (${WRITE_GATES.join(", ")}). Nothing was written.\n`);
	for (const warning of gates.warnings) ctx.io.out(`  advisory: ${warning}\n`);
	return {
		exitCode: 0,
		json: {
			dryRun: true,
			fileName,
			gatesRun: [...WRITE_GATES],
			warnings: gates.warnings
		}
	};
}
const learnCommand = {
	name: "learn",
	summary: "capture a learning through the engine's write gates (plumbing)",
	hidden: true,
	mutating: true,
	configure(cmd) {
		cmd.addArgument(new Argument("<subcommand>", "the only verb").choices([CAPTURE])).requiredOption("--title <text>", "what the learning is about; also its file-name slug").requiredOption("--summary <text>", "one index line, under 200 characters").addOption(new Option("--confidence <level>", "how much evidence backs the finding").choices([...LEARNING_CONFIDENCE_LEVELS]).default("medium")).option("--body-file <path>", "read the body from a file instead of stdin");
	},
	async run(ctx, opts) {
		const rootDir = ctx.app.runtime.cwd;
		await requireStateDir$1(rootDir);
		const now = ctx.app.runtime.clock.now();
		const draft = draftLearning({
			title: text$1(opts, "title"),
			summary: text$1(opts, "summary"),
			confidence: text$1(opts, "confidence"),
			date: isoDate(now),
			body: await resolveBody(ctx, optionalText(opts, "bodyFile"))
		});
		const document = ctx.engine.content.frontmatter.composeFrontmatter(draft.frontmatter, draft.body);
		if (ctx.dryRun) return await dryRunCapture(ctx, rootDir, draft.fileName, document, now);
		const result = await ctx.engine.learnings.store.persistLearning({
			rootDir,
			fileName: draft.fileName,
			content: document,
			now
		});
		if (!result.written) return refuse(ctx, draft.fileName, result.errors);
		ctx.io.out(`Captured ${JSON.stringify(draft.fileName)} -> ${result.path}\n`);
		if (result.sanitized) ctx.io.out("Flagged spans were neutralized before the digest was stamped — read the file back to see what landed.\n");
		return {
			exitCode: 0,
			json: {
				path: result.path,
				fileName: draft.fileName,
				sanitized: result.sanitized
			}
		};
	}
};
//#endregion
//#region src/cli/commands/ledger.ts
const APPEND = "append";
const CLOSE = "close";
const STATUS = "status";
const INBOX = "inbox";
const MANUAL_STATES = [
	"fixed",
	"rejected",
	"deferred"
];
const STDIN_SOURCE = "stdin";
const PROBLEMS_LISTED = 20;
function refuseWithProblems(ctx, doc, src, problems) {
	const listed = problems.slice(0, PROBLEMS_LISTED).map((problem) => ({
		line: problem.line,
		message: sanitizeLabel(problem.message)
	}));
	const omitted = problems.length - listed.length;
	if (!ctx.json) {
		const lines = listed.map((problem) => `${src}:${problem.line}: ${problem.message}`);
		if (omitted > 0) lines.push(`… +${omitted} more problem(s)`);
		ctx.io.err(`${renderFailureHuman(doc, ctx.palette)}\n${lines.join("\n")}\n`);
	}
	return {
		exitCode: 1,
		json: {
			error: doc,
			problems: listed,
			omitted
		}
	};
}
function text(opts, key) {
	const value = opts[key];
	return typeof value === "string" ? value : void 0;
}
function missingFlag(subcommand, flag) {
	return new CliFailure({
		code: "VALIDATION_ERROR",
		message: `ledger ${subcommand} needs ${flag}`,
		why: `${flag} is required by ${subcommand} and unused by the other subcommands, so it is checked here rather than by the argument parser`,
		next: `re-run with ${flag} <value>`
	});
}
const FOREIGN_FLAGS = {
	[APPEND]: [
		[
			"ids",
			"--ids",
			[CLOSE]
		],
		[
			"id",
			"--id",
			[CLOSE]
		],
		[
			"state",
			"--state",
			[CLOSE]
		],
		[
			"rationale",
			"--rationale",
			[CLOSE]
		],
		[
			"retired",
			"--retired",
			[CLOSE]
		],
		[
			"paths",
			"--paths",
			[INBOX]
		],
		[
			"plan",
			"--plan",
			[INBOX]
		],
		[
			"area",
			"--area",
			[INBOX]
		],
		[
			"due",
			"--due",
			[INBOX]
		]
	],
	[CLOSE]: [
		[
			"phase",
			"--phase",
			[APPEND]
		],
		[
			"source",
			"--source",
			[APPEND]
		],
		[
			"stdin",
			"--stdin",
			[APPEND]
		],
		[
			"paths",
			"--paths",
			[INBOX]
		],
		[
			"plan",
			"--plan",
			[INBOX]
		],
		[
			"area",
			"--area",
			[INBOX]
		],
		[
			"due",
			"--due",
			[INBOX]
		]
	],
	[STATUS]: [
		[
			"phase",
			"--phase",
			[APPEND]
		],
		[
			"source",
			"--source",
			[APPEND]
		],
		[
			"stdin",
			"--stdin",
			[APPEND]
		],
		[
			"report",
			"--report",
			[APPEND, CLOSE]
		],
		[
			"ids",
			"--ids",
			[CLOSE]
		],
		[
			"id",
			"--id",
			[CLOSE]
		],
		[
			"state",
			"--state",
			[CLOSE]
		],
		[
			"rationale",
			"--rationale",
			[CLOSE]
		],
		[
			"retired",
			"--retired",
			[CLOSE]
		],
		[
			"paths",
			"--paths",
			[INBOX]
		],
		[
			"plan",
			"--plan",
			[INBOX]
		],
		[
			"area",
			"--area",
			[INBOX]
		],
		[
			"due",
			"--due",
			[INBOX]
		]
	],
	[INBOX]: [
		[
			"run",
			"--run",
			[
				APPEND,
				CLOSE,
				STATUS
			]
		],
		[
			"phase",
			"--phase",
			[APPEND]
		],
		[
			"source",
			"--source",
			[APPEND]
		],
		[
			"stdin",
			"--stdin",
			[APPEND]
		],
		[
			"report",
			"--report",
			[APPEND, CLOSE]
		],
		[
			"ids",
			"--ids",
			[CLOSE]
		],
		[
			"id",
			"--id",
			[CLOSE]
		],
		[
			"state",
			"--state",
			[CLOSE]
		],
		[
			"rationale",
			"--rationale",
			[CLOSE]
		],
		[
			"retired",
			"--retired",
			[CLOSE]
		]
	]
};
function refuseForeignFlags(subcommand, opts) {
	for (const [key, flag, owners] of FOREIGN_FLAGS[subcommand] ?? []) {
		if (opts[key] === void 0) continue;
		const named = owners.map((owner) => `ledger ${owner}`);
		throw new CliFailure({
			code: "USAGE",
			message: `ledger ${subcommand} takes no ${flag}; it is a flag of ${named.join(" and ")}`,
			why: "each ledger subcommand reads only its own flags, so a flag of another is refused rather than silently ignored",
			next: `drop ${flag}, or run ${named.join(" or ")}`
		});
	}
}
async function requireStateDir(rootDir, purpose = "to write a ledger row into") {
	try {
		await stat(join(rootDir, STATE_DIR));
	} catch (cause) {
		throw new CliFailure({
			code: "VALIDATION_ERROR",
			message: `this repo is not initialised — there is no ${STATE_DIR}/ directory ${purpose}`,
			why: cause instanceof Error ? cause.message : String(cause),
			next: `run: ${packageCommand("init")}`
		});
	}
}
async function readAll(input, maxBytes) {
	const chunks = [];
	let total = 0;
	for await (const chunk of input) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8");
		total += buffer.byteLength;
		if (total > maxBytes) throw new CliFailure({
			code: "VALIDATION_ERROR",
			message: `the block piped on stdin is at least ${total} bytes, over the ${maxBytes} byte input ceiling`,
			why: "a findings block is one line per finding; a report is read by path, not piped",
			next: "pipe the stamity-findings block alone, or name the report with --report"
		});
		chunks.push(buffer);
	}
	return Buffer.concat(chunks).toString("utf8");
}
function warnIfUnlocked(ctx, writes) {
	if (ctx.engine.merge.atomicWrite.isCrossProcessLockingEnabled()) return;
	ctx.io.err(`warning: cross-process locking is off (STAMITY_LOCK=0); concurrent ${writes} are not serialized\n`);
}
function warnUnreadable(ctx, ledger, lines) {
	for (const line of lines) ctx.io.err(`warning: ${ledger} line ${line} is not a ledger row; it was left as it is\n`);
}
function warnTagsStripped(ctx, ledgerIds, field) {
	for (const ledgerId of ledgerIds) ctx.io.err(`warning: ${ledgerId} carried Unicode tag characters in its ${field}; they were stripped before the row was written\n`);
}
function requireRun(ctx, subcommand, opts) {
	const run = text(opts, "run");
	if (run === void 0) throw missingFlag(subcommand, "--run");
	const { layout } = ctx.engine.runs;
	if (!layout.isRunId(run)) throw new CliFailure({
		code: "VALIDATION_ERROR",
		message: `ledger: --run ${JSON.stringify(run)} is not a run id (YYYY-MM-DD_<lowercase-slug>)`,
		why: `a run id matches ${layout.RUN_ID_PATTERN.source}, the name of its folder under .stamity/runs/`,
		next: "pass the run folder's name exactly as it is on disk"
	});
	return run;
}
function rowLine(row) {
	return sanitizeLabel(`${row.ledgerId} ${row.severity} ${row.localId}${row.decisionNeeded ? " decision-needed" : ""}${row.alreadyFiled ? " already-filed" : ""}`);
}
async function runAppend(ctx, opts) {
	const rootDir = ctx.app.runtime.cwd;
	await requireStateDir(rootDir);
	const run = text(opts, "run");
	if (run === void 0) throw missingFlag(APPEND, "--run");
	const phase = text(opts, "phase");
	if (phase === void 0) throw missingFlag(APPEND, "--phase");
	const source = text(opts, "source");
	if (source === void 0) throw missingFlag(APPEND, "--source");
	requireRun(ctx, APPEND, opts);
	const { ledgerStore, blocks, layout } = ctx.engine.runs;
	for (const [flag, value] of [["--phase", phase], ["--source", source]]) if (!ledgerStore.LEDGER_SLUG_PATTERN.test(value)) throw new CliFailure({
		code: "VALIDATION_ERROR",
		message: `ledger: ${flag} ${JSON.stringify(value)} is not a lowercase slug ([a-z][a-z0-9-]*)`,
		why: `${flag} becomes part of every ledger id and row this append writes`,
		next: `re-run with ${flag} spelled in lowercase letters, digits and hyphens`
	});
	const reportFlag = text(opts, "report");
	const fromStdin = opts["stdin"] === true;
	if (reportFlag === void 0 === !fromStdin) throw new CliFailure({
		code: "VALIDATION_ERROR",
		message: "ledger append takes exactly one of --report and --stdin",
		why: "the findings block is read from one place, and a row records which report it came from",
		next: "name the report with --report <path>, or pipe the block with --stdin"
	});
	await ledgerStore.requireRunDir(rootDir, run);
	let blockText;
	let report = null;
	if (reportFlag !== void 0) {
		const resolved = await ledgerStore.resolveReportPath(rootDir, run, reportFlag);
		const role = layout.reportNameRole(resolved.relative.slice(resolved.relative.lastIndexOf("/") + 1));
		if (role !== source) throw new CliFailure({
			code: "VALIDATION_ERROR",
			message: `ledger: --source ${JSON.stringify(source)} is not ${role ?? "the role"}, the role the report name ${resolved.relative} carries`,
			why: "a report's rows are filed under the role that wrote it, so one role's findings never read as another's",
			next: `re-run with --source ${role ?? "<role>"}, or name that role's own report`
		});
		blockText = resolved.text;
		report = resolved.relative;
	} else blockText = ctx.terminal.stdinIsTTY ? "" : await readAll(ctx.promptIo.input, ctx.engine.guard.promptGuard.MAX_USER_CONTENT_LENGTH);
	const src = report ?? STDIN_SOURCE;
	const parsed = blocks.parseFindingsBlock(blockText);
	if (!parsed.ok) return refuseWithProblems(ctx, {
		code: "VALIDATION_ERROR",
		message: `ledger append refused ${src}`,
		why: "the stamity-findings block does not parse, so no row was appended",
		next: "fix every line named above in the report, then re-run the append"
	}, src, parsed.problems);
	if (parsed.items.length > 0) warnIfUnlocked(ctx, "appends");
	const result = await ledgerStore.appendFindings({
		rootDir,
		runId: run,
		phase,
		source,
		findings: parsed.items,
		report,
		dryRun: ctx.dryRun
	});
	warnUnreadable(ctx, result.ledger, result.unreadableLines);
	warnTagsStripped(ctx, result.tagsStripped, "locator or summary");
	if (result.rows.length === 0) ctx.io.err(`ledger append: no findings in ${src}; nothing appended\n`);
	for (const row of result.rows) ctx.io.out(`${rowLine(row)}\n`);
	if (ctx.dryRun) {
		const appending = result.rows.filter((row) => !row.alreadyFiled).length;
		ctx.io.out(`Dry run: ${appending} row(s) would be appended to ${result.ledger}. Nothing was written.\n`);
	}
	return {
		exitCode: 0,
		json: {
			run,
			ledger: result.ledger,
			source: src,
			rows: [...result.rows],
			dryRun: ctx.dryRun
		}
	};
}
function changeLine(change) {
	if (change.unchanged) return sanitizeLabel(`${change.ledgerId} unchanged (already recorded)`);
	const status = change.retired !== void 0 ? ` (retired: ${change.retired})` : change.status === null ? "" : ` (${change.status})`;
	return sanitizeLabel(`${change.ledgerId} ${change.from} -> ${change.to}${status}`);
}
function handedIds(value) {
	return [...new Set(value.split(",").map((item) => item.trim()).filter((item) => item !== ""))];
}
function closeUsage(message, why, next) {
	return new CliFailure({
		code: "VALIDATION_ERROR",
		message,
		why,
		next
	});
}
async function runClose(ctx, opts) {
	const rootDir = ctx.app.runtime.cwd;
	await requireStateDir(rootDir);
	const run = requireRun(ctx, CLOSE, opts);
	const reportFlag = text(opts, "report");
	const id = text(opts, "id");
	const state = text(opts, "state");
	const rationale = text(opts, "rationale");
	const idsFlag = text(opts, "ids");
	const retired = text(opts, "retired");
	if (reportFlag === void 0 === (id === void 0)) throw closeUsage("ledger close takes exactly one of --report and --id", "a close applies either a re-review's closures block or one manual transition", "name the re-review with --report <path> --ids <ids>, or one row with --id <ledger-id>");
	const { ledgerStore, blocks } = ctx.engine.runs;
	let result;
	let report = null;
	let tagField = "rationale";
	if (reportFlag !== void 0) {
		if (state !== void 0 || rationale !== void 0) throw closeUsage("ledger close --report takes no --state or --rationale; the closures block carries them", "each closure's status sets its row's state, and its note is the rationale", "drop --state and --rationale, or close one row with --id instead");
		if (retired !== void 0) throw closeUsage("ledger close --report takes no --retired; a retirement names its one row with --id", "a closures block moves the rows a re-review was handed, and a retirement records one deferred row's inbox exit", "drop --retired, or retire the row with --id <ledger-id> --retired <disposition>");
		const handed = idsFlag === void 0 ? [] : handedIds(idsFlag);
		if (handed.length === 0) throw closeUsage("ledger close --report needs --ids, the ledger ids handed to this re-review", "a closure is applied only to a row its re-review was handed, so no other row moves", "re-run with --ids <id>,<id> — the ids the re-review's dispatch named");
		await ledgerStore.requireRunDir(rootDir, run);
		const resolved = await ledgerStore.resolveReportPath(rootDir, run, reportFlag);
		report = resolved.relative;
		const parsed = blocks.parseClosuresBlock(resolved.text);
		if (!parsed.ok) return refuseWithProblems(ctx, {
			code: "VALIDATION_ERROR",
			message: `ledger close refused ${report}`,
			why: "the stamity-closures block does not parse, so no row changed",
			next: "fix every line named above in the re-review, then re-run the close"
		}, report, parsed.problems);
		if (parsed.items.length > 0) warnIfUnlocked(ctx, "closes");
		try {
			result = await ledgerStore.applyClosures({
				rootDir,
				runId: run,
				closures: parsed.items,
				handedIds: handed,
				report,
				dryRun: ctx.dryRun
			});
		} catch (error) {
			if (!(error instanceof ledgerStore.ClosuresRefused)) throw error;
			return refuseWithProblems(ctx, {
				code: "VALIDATION_ERROR",
				message: `ledger close refused ${report}`,
				why: "a closure cannot apply, so no row changed",
				next: "fix the closures named above, or the --ids handed, then re-run the close"
			}, report, error.problems);
		}
		if (parsed.items.length === 0) ctx.io.err(`ledger close: no closures in ${report}; nothing changed\n`);
	} else {
		if (idsFlag !== void 0) throw closeUsage("ledger close --id takes no --ids; it moves the one row it names", "--ids bounds a re-review's closures block, and a manual close has none", "drop --ids, or close a re-review's rows with --report <path> --ids <ids>");
		if (retired !== void 0) {
			if (state !== void 0 || rationale !== void 0) throw closeUsage("ledger close --retired takes no --state or --rationale; a retirement keeps the row's state", "a retired row stays deferred and gains the dated retired field, so there is no state to set and no rationale to append", "drop --state and --rationale, or move the row with --state and --rationale alone");
			await ledgerStore.requireRunDir(rootDir, run);
			warnIfUnlocked(ctx, "closes");
			result = await ledgerStore.retireRow({
				rootDir,
				runId: run,
				ledgerId: id,
				disposition: retired,
				now: ctx.app.runtime.clock.now(),
				dryRun: ctx.dryRun
			});
			tagField = "retired disposition";
		} else {
			if (state === void 0) throw missingFlag(CLOSE, "--state");
			if (rationale === void 0) throw missingFlag(CLOSE, "--rationale");
			await ledgerStore.requireRunDir(rootDir, run);
			warnIfUnlocked(ctx, "closes");
			result = await ledgerStore.closeRow({
				rootDir,
				runId: run,
				ledgerId: id,
				state,
				rationale,
				dryRun: ctx.dryRun
			});
		}
	}
	warnUnreadable(ctx, result.ledger, result.unreadableLines);
	warnTagsStripped(ctx, result.tagsStripped, tagField);
	for (const change of result.changes) ctx.io.out(`${changeLine(change)}\n`);
	if (ctx.dryRun) {
		const moving = result.changes.filter((change) => !change.unchanged).length;
		ctx.io.out(`Dry run: ${moving} row(s) would change in ${result.ledger}. Nothing was written.\n`);
	}
	return {
		exitCode: 0,
		json: {
			run,
			ledger: result.ledger,
			report,
			changes: [...result.changes],
			dryRun: ctx.dryRun
		}
	};
}
const NO_CARD = "stamity: no run in progress under .stamity/runs/ — no resume card.";
const NO_CARD_JSON = {
	run: null,
	inProgress: false,
	status: null,
	card: null,
	counts: {
		openRows: 0,
		unledgeredReports: 0,
		lanes: 0
	},
	ledgerStates: {
		fixed: 0,
		deferred: 0,
		rejected: 0,
		open: 0
	},
	debugRounds: [],
	withheld: null,
	listsWithheld: null,
	unreadableLedgerLines: 0,
	ledgerUnreadable: false,
	notReportNamed: 0
};
function statusJson(card) {
	const echo = card.withheld === null && card.listsWithheld === null;
	return {
		run: card.runId,
		inProgress: card.inProgress,
		status: echo ? card.status : null,
		card: [...card.lines],
		counts: {
			openRows: card.openRowIds.length,
			unledgeredReports: card.unledgeredReports.length,
			lanes: card.lanes.length
		},
		ledgerStates: { ...card.ledgerStates },
		debugRounds: echo ? [...card.debugRounds] : [],
		...echo ? {
			openRowIds: [...card.openRowIds],
			unledgeredReports: [...card.unledgeredReports],
			lanes: [...card.lanes]
		} : {},
		withheld: card.withheld,
		listsWithheld: card.listsWithheld,
		unreadableLedgerLines: card.unreadableLedgerLines,
		ledgerUnreadable: card.ledgerUnreadable,
		notReportNamed: card.notReportNamed
	};
}
async function runStatus$2(ctx, opts) {
	const rootDir = ctx.app.runtime.cwd;
	await requireStateDir(rootDir, "to read a resume card from");
	const { layout, ledgerStore, resumeCard } = ctx.engine.runs;
	let runId;
	if (opts["run"] !== void 0) {
		runId = requireRun(ctx, STATUS, opts);
		await ledgerStore.requireRunDir(rootDir, runId);
	}
	const card = resumeCard.collectResumeCard({
		rootDir,
		now: ctx.app.runtime.clock.now(),
		...runId === void 0 ? {} : { runId }
	});
	if (card === null) {
		ctx.io.out(`${NO_CARD}\n`);
		return {
			exitCode: 0,
			json: {
				...NO_CARD_JSON,
				counts: { ...NO_CARD_JSON.counts },
				ledgerStates: { ...NO_CARD_JSON.ledgerStates },
				debugRounds: []
			}
		};
	}
	if (card.runId !== null && card.ledgerUnreadable) ctx.io.err(`warning: ${layout.runRelPath(card.runId, layout.LEDGER_FILE)} exists but could not be read; its open rows are not counted\n`);
	if (card.runId !== null && card.unreadableLedgerLines > 0) ctx.io.err(`warning: ${layout.runRelPath(card.runId, layout.LEDGER_FILE)} has ${card.unreadableLedgerLines} line(s) that are not ledger rows\n`);
	ctx.io.out(`${card.lines.join("\n")}\n`);
	return {
		exitCode: 0,
		json: statusJson(card)
	};
}
const INBOX_READ_MAX_BYTES = 1048576;
const INBOX_SCREEN = [
	...LEARNINGS_INJECTION_PATTERNS,
	...CONTENT_DENY_PATTERNS,
	...INJECTION_PATTERNS
].filter((entry) => entry.severity === "block").map((entry) => ({
	id: entry.id,
	re: new RegExp(entry.pattern.source, entry.pattern.flags)
}));
const INBOX_OVER_LENGTH = "over-length";
function screenInboxLine(line, except) {
	const views = /* @__PURE__ */ new Set();
	for (const form of [line, sanitizeLabel(line)]) {
		const stripped = form.replace(INVISIBLE_SMUGGLING_CHARS, "");
		views.add(form).add(stripped).add(normalizeForDenyScan(stripped));
	}
	const copies = [...views];
	const hit = INBOX_SCREEN.find((entry) => except?.has(entry.id) !== true && copies.some((copy) => {
		entry.re.lastIndex = 0;
		return entry.re.test(copy);
	}));
	return hit === void 0 ? "" : hit.id;
}
function screenInboxPrinted(line, own) {
	const ownHits = /* @__PURE__ */ new Set();
	if (own !== "") for (let hit = screenInboxLine(own); hit !== ""; hit = screenInboxLine(own, ownHits)) ownHits.add(hit);
	return screenInboxLine(line, ownHits);
}
function screenInboxFields(fields) {
	for (const field of fields) {
		const pattern = screenInboxLine(field);
		if (pattern !== "") return pattern;
	}
	return "";
}
function screenInboxRow(row) {
	return screenInboxFields([
		`${row.severity} · ${row.location} · ${row.description}${row.tag === null ? "" : ` · ${row.tag}`}`,
		row.severity,
		row.location,
		row.description,
		row.source,
		row.ref ?? "",
		row.tag ?? "",
		row.by ?? "",
		row.when ?? "",
		...screenedFiles(row.files)
	]);
}
function screenedFiles(files) {
	return files.length === 0 ? [] : [files.join(", "), ...files];
}
function withheldCopy(row, alwaysShown) {
	const passes = (fields) => screenInboxFields(fields) === "";
	return {
		line: row.line,
		severity: row.severity,
		location: row.location,
		description: "",
		source: "",
		ref: null,
		tag: row.tag !== null && alwaysShown.includes(row.tag) && passes([row.tag]) ? row.tag : null,
		by: row.by !== null && passes([row.by]) ? row.by : null,
		when: null,
		files: passes(screenedFiles(row.files)) ? row.files : [],
		deferredOn: null,
		rationale: null,
		belowRule: row.belowRule
	};
}
function inboxDue(ctx, opts) {
	const value = opts["due"];
	if (value === void 0 || value === false) return null;
	if (value === true) return ctx.app.runtime.clock.now().toISOString().slice(0, 10);
	if (typeof value === "string" && ctx.engine.runs.disposition.isIsoDate(value)) return value;
	throw new CliFailure({
		code: "USAGE",
		message: "ledger inbox --due takes a day as YYYY-MM-DD",
		why: "the value given names no real calendar day in that form, and a row's `by:` day is compared against it",
		next: "re-run with --due <YYYY-MM-DD>, or with --due alone for today's date"
	});
}
function inboxRefusal(message, why) {
	return new CliFailure({
		code: "VALIDATION_ERROR",
		message,
		why,
		next: `do not read ${STATE_DIR}/inbox.md whole in this query's place, since a whole read is unscreened; report this refusal as a finding; the query runs again once the inbox is a regular file with one link, of at most ${INBOX_READ_MAX_BYTES} bytes, inside the repository`
	});
}
async function readInbox(rootDir, inboxPath, isShared) {
	let walked = rootDir;
	let leaf = null;
	for (const segment of inboxPath.split("/")) {
		walked = join(walked, segment);
		try {
			leaf = await lstat(walked);
		} catch (cause) {
			if (cause.code === "ENOENT") return null;
			throw inboxRefusal(`ledger inbox cannot read ${inboxPath}`, cause instanceof Error ? cause.message : String(cause));
		}
		if (leaf.isSymbolicLink()) throw inboxRefusal(`ledger inbox refused ${inboxPath}: ${segment} is a symbolic link`, "the inbox is read only as a regular file inside the repository, never through a link");
	}
	const tooLarge = (size) => inboxRefusal(`ledger inbox refused ${inboxPath}: it is ${typeof size === "number" ? size : `more than ${INBOX_READ_MAX_BYTES}`} bytes, over the ${INBOX_READ_MAX_BYTES} byte ceiling`, "the inbox's rows are printed into a run's context, so its size is bounded");
	const notFile = inboxRefusal(`ledger inbox refused ${inboxPath}: it is not a regular file`, "the inbox is one markdown file of rows");
	const hardLink = (links) => inboxRefusal(`ledger inbox refused ${inboxPath}: ${inboxPath.slice(inboxPath.lastIndexOf("/") + 1)} is a hard link`, `the inbox is read only as a file of its own inside the repository; this one has ${links} links, so its text is shared with another name, which may sit outside the repository`);
	if (leaf === null || !leaf.isFile()) throw notFile;
	if (isShared(leaf)) throw hardLink(leaf.nlink);
	if (leaf.size > INBOX_READ_MAX_BYTES) throw tooLarge(leaf.size);
	const handle = await open(walked, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
	try {
		const stats = await handle.stat();
		if (!stats.isFile()) throw notFile;
		if (isShared(stats)) throw hardLink(stats.nlink);
		if (stats.size > INBOX_READ_MAX_BYTES) throw tooLarge(stats.size);
		const bytes = Buffer.alloc(1048577);
		let filled = 0;
		while (filled < bytes.length) {
			const { bytesRead } = await handle.read(bytes, filled, bytes.length - filled, null);
			if (bytesRead === 0) break;
			filled += bytesRead;
		}
		if (filled > INBOX_READ_MAX_BYTES) throw tooLarge("more than the ceiling");
		return bytes.toString("utf8", 0, filled);
	} finally {
		await handle.close();
	}
}
function inboxRowJson(row, matchedBy, withheld) {
	return {
		line: row.line,
		severity: sanitizeLabel(row.severity),
		location: sanitizeLabel(row.location),
		description: withheld === null ? sanitizeLabel(row.description) : null,
		source: withheld === null ? sanitizeLabel(row.source) : null,
		ref: withheld === null && row.ref !== null ? sanitizeLabel(row.ref) : null,
		tag: row.tag === null ? null : sanitizeLabel(row.tag),
		by: row.by === null ? null : sanitizeLabel(row.by),
		when: row.when === null ? null : sanitizeLabel(row.when),
		files: row.files.map((file) => sanitizeLabel(file)),
		matchedBy,
		withheld
	};
}
function withheldBody(pattern) {
	return `withheld by the screen (${pattern}); read it by hand`;
}
function inboxRowLine(row, matchedBy, withheld) {
	const body = withheld === null ? row.description : withheldBody(withheld);
	return `${row.line} ${row.severity} · ${row.location} · ${body}${row.tag === null ? "" : ` · ${row.tag}`} (${matchedBy})`;
}
function listedLines(label, lines) {
	const more = lines.length - 50;
	return more > 0 ? [...lines.slice(0, 50), `${label}: … +${more} more`] : [...lines];
}
async function runInbox(ctx, opts) {
	const due = inboxDue(ctx, opts);
	const rootDir = ctx.app.runtime.cwd;
	await requireStateDir(rootDir, "to read the deferral inbox from");
	const { inboxStore } = ctx.engine.runs;
	const counts = Object.fromEntries(inboxStore.INBOX_SEVERITIES.map((severity) => [severity, 0]));
	const inboxText = await readInbox(rootDir, inboxStore.INBOX_PATH, ctx.engine.merge.atomicWrite.isSharedRegularFile);
	if (inboxText === null) {
		ctx.io.out("inbox: absent\n");
		return {
			exitCode: 0,
			json: {
				inbox: inboxStore.INBOX_PATH,
				total: 0,
				matched: [],
				counts,
				unmatched: 0,
				problems: [],
				skipped: [],
				truncated: {
					problems: 0,
					skipped: 0
				},
				due,
				triggers: 0
			}
		};
	}
	const bulletScreen = /* @__PURE__ */ new Map();
	inboxText.split("\n").forEach((raw, index) => {
		if (!raw.startsWith("- ")) return;
		bulletScreen.set(index + 1, raw.length > 4096 ? INBOX_OVER_LENGTH : screenInboxLine(raw));
	});
	const parsed = inboxStore.parseInbox(inboxText);
	const skipped = [];
	const withheld = /* @__PURE__ */ new Map();
	const alwaysShown = inboxStore.ALWAYS_SHOW_TAGS;
	const rows = [];
	for (const row of parsed.rows) {
		const bullet = bulletScreen.get(row.line) ?? "";
		const pattern = bullet === "" ? screenInboxRow(row) : bullet;
		if (pattern === "") {
			rows.push(row);
			continue;
		}
		skipped.push({
			line: row.line,
			pattern
		});
		if (pattern === "over-length") continue;
		if (screenInboxFields([
			row.severity,
			row.location,
			`${row.severity} · ${row.location}`
		]) !== "") continue;
		withheld.set(row.line, pattern);
		rows.push(withheldCopy(row, alwaysShown));
	}
	const problems = [];
	for (const problem of parsed.problems) {
		const bullet = bulletScreen.get(problem.line) ?? "";
		const pattern = bullet === "" ? screenInboxLine(problem.message) : bullet;
		if (pattern === "") problems.push(problem);
		else skipped.push({
			line: problem.line,
			pattern
		});
	}
	const paths = Array.isArray(opts["paths"]) ? opts["paths"] : [];
	const area = Array.isArray(opts["area"]) ? opts["area"] : void 0;
	const plan = text(opts, "plan");
	const result = inboxStore.matchInbox(rows, {
		paths,
		...plan === void 0 ? {} : { plan },
		...area === void 0 ? {} : { area },
		...due === null ? {} : { due }
	});
	const matched = [];
	for (const { row, matchedBy } of result.matched) {
		const by = withheld.get(row.line) ?? null;
		const line = inboxRowLine(row, matchedBy, by);
		const pattern = screenInboxPrinted(line, by === null ? "" : withheldBody(by));
		if (pattern === "") matched.push({
			row,
			matchedBy,
			line
		});
		else if (by === null) skipped.push({
			line: row.line,
			pattern
		});
	}
	skipped.sort((a, b) => a.line - b.line);
	for (const { row } of matched) counts[row.severity] = (counts[row.severity] ?? 0) + 1;
	const total = parsed.rows.length + parsed.problems.length;
	const withheldMatches = result.matched.filter(({ row }) => withheld.has(row.line)).length;
	const unmatched = result.unmatched - (withheld.size - withheldMatches);
	const shown = new Set(matched.filter(({ row }) => withheld.has(row.line)).map(({ row }) => row.line));
	const listed = skipped.filter((skip) => !shown.has(skip.line));
	const overdue = due === null ? 0 : matched.filter(({ row }) => row.by !== null && row.by <= due).length;
	const dueNote = due === null ? "" : ` · ${overdue} due by ${due} · ${result.triggers} triggers`;
	const lines = [
		`inbox: ${total} rows · ${matched.length} matched · ${unmatched} unmatched · ${problems.length} unparsed · ${skipped.length} skipped${dueNote}`,
		...matched.map(({ line }) => sanitizeLabel(line)),
		...listedLines("unparsed", problems.map((problem) => sanitizeLabel(`unparsed: ${problem.line}: ${problem.message}`))),
		...listedLines("skipped", listed.map((skip) => `skipped: ${skip.line} (${skip.pattern})`))
	];
	ctx.io.out(`${lines.join("\n")}\n`);
	return {
		exitCode: 0,
		json: {
			inbox: inboxStore.INBOX_PATH,
			total,
			matched: matched.map(({ row, matchedBy }) => inboxRowJson(row, matchedBy, withheld.get(row.line) ?? null)),
			counts,
			unmatched,
			problems: problems.slice(0, 50).map((problem) => ({
				line: problem.line,
				message: sanitizeLabel(problem.message)
			})),
			skipped: listed.slice(0, 50),
			truncated: {
				problems: Math.max(0, problems.length - 50),
				skipped: Math.max(0, listed.length - 50)
			},
			due,
			triggers: result.triggers
		}
	};
}
const ledgerCommand = {
	name: "ledger",
	summary: "append findings to a run's ledger, close its rows, print its resume card, and read the deferral inbox (plumbing)",
	hidden: true,
	mutating: true,
	configure(cmd) {
		cmd.addArgument(new Argument("<subcommand>", "which ledger action to run").choices([
			APPEND,
			CLOSE,
			STATUS,
			INBOX
		])).option("--run <run-id>", "the run folder's name under .stamity/runs/").option("--phase <phase>", "the phase the rows are filed under, a lowercase slug (review, build)").option("--source <role>", "the role whose findings these are, a lowercase slug (reviewer)").option("--report <path>", "a report inside the run's reports/ folder").option("--stdin", "read the findings block from stdin").option("--ids <ledger-ids>", "the comma-separated ledger ids handed to this re-review").option("--id <ledger-id>", "the one row a manual close or a retirement moves").addOption(new Option("--state <state>", "the state a manual close sets").choices([...MANUAL_STATES])).option("--rationale <text>", "why a manual close moves the row, recorded on it").option("--retired <disposition>", "retire a deferred row whose inbox row left: keeps its state and records the date and this disposition").option("--paths <paths...>", "the paths a change touches; the inbox rows naming them are printed").option("--plan <path>", "a plan path; the inbox rows whose Ref: or location names it are printed").option("--area <words...>", "whole words matched in an inbox row that names no path").option("--due [date]", "a day as YYYY-MM-DD, today when no value is given; the inbox rows whose by: day is on or before it are printed");
	},
	async run(ctx, opts, args) {
		const subcommand = args[0] === CLOSE || args[0] === STATUS || args[0] === INBOX ? args[0] : APPEND;
		refuseForeignFlags(subcommand, opts);
		if (subcommand === INBOX) return await runInbox(ctx, opts);
		if (subcommand === STATUS) return await runStatus$2(ctx, opts);
		return subcommand === CLOSE ? await runClose(ctx, opts) : await runAppend(ctx, opts);
	}
};
//#endregion
//#region src/cli/commands/plugin/setup.ts
async function planPluginSetup(input) {
	const { rootDir, roots } = input;
	if (roots.length === 0) throw new EngineError("Plugin setup needs at least one installed plugin root. Pass --plugin-root, or set CLAUDE_PLUGIN_ROOT, CURSOR_PLUGIN_ROOT, PLUGIN_ROOT or COPILOT_PLUGIN_ROOT.", { code: "CONFIG_ERROR" });
	const seen = /* @__PURE__ */ new Set();
	const clients = {};
	for (const entry of TOOLS.map((tool) => roots.find((row) => row.tool === tool)).filter((row) => row !== void 0)) {
		if (entry.file.client !== entry.tool) throw new EngineError(`The plugin root at ${entry.root} declares client ${entry.file.client}, but it was requested for ${entry.tool}. Set up each client from its own root.`, { code: "CONFIG_ERROR" });
		const uncarriable = uncarriableClasses(entry.file);
		if (uncarriable.length > 0) throw new EngineError(`The plugin root at ${entry.root} declares it carries ${uncarriable.join(", ")} for ${entry.tool}, which that client's plugin container has no surface for — it carries ${CARRIABLE_CLASSES[entry.tool].join(", ")}. This root was not built by a generator this engine can set up from.`, { code: "CONFIG_ERROR" });
		const classes = carriedClasses(entry.file);
		if (classes.length === 0) throw new EngineError(`The plugin root at ${entry.root} carries no class for ${entry.tool}: every class it declares is repository-owned or unsupported, so there is nothing for a plugin-backed setup to hand over. Run \`stamity init --tools ${entry.tool}\` instead.`, { code: "CONFIG_ERROR" });
		clients[entry.tool] = {
			version: entry.file.version,
			classes
		};
		seen.add(entry.tool);
	}
	if (seen.size !== roots.length) {
		const duplicated = TOOLS.filter((tool) => roots.filter((row) => row.tool === tool).length > 1);
		throw new EngineError(`Two plugin roots were given for ${duplicated.join(", ")}. One root per client.`, { code: "CONFIG_ERROR" });
	}
	return {
		decisions: await buildInitDecisions(rootDir, { tools: [...seen] }),
		plugin: {
			mode: "plugin-backed",
			clients
		}
	};
}
async function applyPluginSetup(input) {
	const { decisions, plugin } = await planPluginSetup(input);
	return applyInit({
		rootDir: input.rootDir,
		decisions,
		engineVersion: input.engineVersion,
		dryRun: input.dryRun,
		force: false,
		now: input.now,
		plugin
	});
}
//#endregion
//#region src/cli/commands/plugin/status.ts
const DETECTED_FACTS = [
	{
		fact: "linter",
		read: (detected) => detected.linters
	},
	{
		fact: "test framework",
		read: (detected) => detected.testFrameworks
	},
	{
		fact: "CI provider",
		read: (detected) => detected.ciProviders
	}
];
const GATE_KEYS = [
	"test",
	"lint",
	"typecheck",
	"all"
];
async function manifestExists(rootDir) {
	try {
		return (await stat(manifestPath(rootDir))).isFile();
	} catch {
		return false;
	}
}
async function readManifestOrNull(rootDir, engine) {
	try {
		return await engine.manifest.manifest.readManifest(rootDir);
	} catch {
		return null;
	}
}
function unconfiguredFacts(manifest) {
	if (manifest === null) return [];
	const rows = [];
	const detected = manifest.detected;
	if (detected !== void 0) {
		for (const { fact, read } of DETECTED_FACTS) if (read(detected).length === 0) rows.push({
			fact,
			command: packageCommand("config detect")
		});
	}
	const pinned = readGates(manifest);
	const resolved = verificationCommandsFor(detected);
	for (const gate of GATE_KEYS) {
		if (pinned[gate] !== void 0) continue;
		if (resolved[gate] === void 0) rows.push({
			fact: `gates.${gate}`,
			command: packageCommand(`config set gates.${gate} "<command>"`)
		});
	}
	return rows;
}
async function readRoot(root) {
	if (root === null) return null;
	try {
		return await readCapabilityFile(root);
	} catch {
		return null;
	}
}
function clientRows(manifest, file, only) {
	const recorded = manifest?.plugin?.clients ?? {};
	const selected = new Set(manifest?.tools ?? []);
	return (only.length === 0 ? TOOLS : TOOLS.filter((tool) => only.includes(tool))).map((tool) => {
		const rootFound = file?.client === tool;
		return {
			tool,
			recorded: recorded[tool] ?? null,
			rootFound,
			rootVersion: rootFound ? file.version : null,
			clientFloor: rootFound ? file.clientFloor.version : "unknown",
			selected: selected.has(tool)
		};
	});
}
function compatibilityOf(file, manifest) {
	const pluginVersion = file?.version ?? null;
	const manifestVersion = manifest?.generatedBy ?? null;
	const pluginMajor = majorOf(pluginVersion);
	const stateMajor = majorOf(manifestVersion);
	if (pluginMajor === null || stateMajor === null) return {
		state: "not-applicable",
		pluginVersion,
		manifestVersion
	};
	return {
		state: pluginMajor === stateMajor ? "compatible" : "mismatch",
		pluginVersion,
		manifestVersion
	};
}
async function buildPluginStatus(rootDir, engine, opts) {
	const root = resolvePluginRoot({
		...opts.pluginRoot === void 0 ? {} : { flag: opts.pluginRoot },
		env: opts.env
	});
	const [manifest, present, file] = await Promise.all([
		readManifestOrNull(rootDir, engine),
		manifestExists(rootDir),
		readRoot(root)
	]);
	const probe = root === null ? null : await probePluginRuntime(root);
	const findings = await collectPluginDuplicates(rootDir, manifest);
	const runtime = probe === null ? {
		kind: "none",
		path: null,
		version: null,
		message: `no plugin root: pass --plugin-root, or set ${PLUGIN_ROOT_VARIABLES.join(", ")}`
	} : {
		kind: probe.kind,
		path: probe.path,
		version: probe.version,
		message: probe.message
	};
	return {
		installMode: readInstallMode(manifest),
		runtime,
		node: probe?.node ?? await engineNodeFacts(opts.nodeVersion),
		clients: clientRows(manifest, file, opts.clients ?? []),
		compatibility: compatibilityOf(file, manifest),
		duplicates: findings.map((finding) => ({
			tool: finding.tool,
			class: finding.cls,
			source: finding.source,
			files: finding.files,
			paths: finding.paths,
			remedy: finding.remedy
		})),
		coexistence: findings.length > 0,
		setup: {
			needed: !present,
			unconfigured: unconfiguredFacts(manifest)
		}
	};
}
//#endregion
//#region src/cli/commands/plugin.ts
const SUBCOMMANDS$2 = ["status", "setup"];
function collectRoot(value, previous) {
	return [...previous ?? [], value];
}
const LABEL_WIDTH = Math.max(13, ...TOOLS.map((tool) => tool.length));
const CONTINUATION = `  ${" ".repeat(LABEL_WIDTH)}  `;
function cleanThenSetup(clients) {
	const csv = clients.length === 0 ? "<csv>" : clients.join(",");
	return `a generated setup exists; run ${packageCommand("sync")}, then ${packageCommand("clean -y")}, then ${packageCommand(`plugin setup --client ${csv}`)}`;
}
async function hasManifest(rootDir) {
	try {
		return (await stat(manifestPath(rootDir))).isFile();
	} catch {
		return false;
	}
}
function parseClients(raw) {
	if (typeof raw !== "string") return [];
	const names = raw.split(",").map((name) => name.trim()).filter((name) => name.length > 0);
	for (const name of names) if (!VALID_TOOLS.has(name)) throw new EngineError(`--client names ${JSON.stringify(name)}, which is not a client this engine sets up. Use one or more of: ${TOOLS.join(", ")}.`, { code: "CONFIG_ERROR" });
	return TOOLS.filter((tool) => names.includes(tool));
}
function parseRootFlags(raw) {
	if (!Array.isArray(raw)) return [];
	return raw.filter((value) => typeof value === "string").map((value) => value.trim()).filter((value) => value.length > 0);
}
async function resolveRoots(opts, env) {
	const flagged = parseRootFlags(opts["pluginRoot"]);
	const paths = flagged.length > 0 ? flagged : [resolvePluginRoot({ env })].filter((path) => path !== null);
	if (paths.length === 0) throw new EngineError(`No installed plugin root: pass --plugin-root, or set ${PLUGIN_ROOT_VARIABLES.join(", ")}.`, { code: "CONFIG_ERROR" });
	const read = await Promise.allSettled(paths.map(async (root) => {
		const file = await readCapabilityFile(root);
		return {
			tool: file.client,
			root,
			file
		};
	}));
	const refused = read.find((result) => result.status === "rejected");
	if (refused !== void 0) throw refused.reason;
	const roots = read.map((result) => result.value);
	const listed = parseClients(opts["client"]);
	if (listed.length === 0) return roots;
	for (const entry of roots) if (!listed.includes(entry.tool)) throw new EngineError(`The plugin root at ${entry.root} declares client ${entry.tool}, which --client does not name. Add ${entry.tool} to --client, or leave --client off and let the roots name the clients.`, { code: "CONFIG_ERROR" });
	for (const tool of listed) if (!roots.some((entry) => entry.tool === tool)) throw new EngineError(`--client names ${tool}, but no --plugin-root declares that client. Pass --plugin-root once per client, each naming that client's own root.`, { code: "CONFIG_ERROR" });
	return roots;
}
function wroteLine(report) {
	const counted = /* @__PURE__ */ new Map();
	for (const result of report.wrote) counted.set(result.action, (counted.get(result.action) ?? 0) + 1);
	const breakdown = [...counted.entries()].toSorted(([a], [b]) => a.localeCompare(b)).map(([action, count]) => `${count} ${action}`).join(", ");
	return `${report.dryRun ? "would write" : "wrote"} ${report.wrote.length} file(s)${breakdown === "" ? "" : `: ${breakdown}`}`;
}
async function ownedSummary(ctx, rootDir, roots, dryRun) {
	if (!dryRun) {
		const manifest = await ctx.engine.manifest.manifest.readManifest(rootDir);
		if (manifest !== null) return pluginOwnedSummary(manifest);
	}
	return TOOLS.flatMap((tool) => {
		const entry = roots.find((row) => row.tool === tool);
		if (entry === void 0) return [];
		const classes = carriedClasses(entry.file);
		return classes.length === 0 ? [] : [{
			tool,
			classes
		}];
	});
}
function renderStatus$1(ctx, report) {
	const { palette } = ctx;
	const row = (label, detail) => {
		ctx.io.out(`  ${palette.bold(label.padEnd(LABEL_WIDTH))}  ${detail}\n`);
	};
	ctx.io.out(`${palette.bold("plugin")} (${report.installMode})\n`);
	row("runtime", report.runtime.message === null ? `${report.runtime.kind} ${report.runtime.version ?? "unknown"} at ${report.runtime.path ?? "unknown"}` : `${report.runtime.kind} — ${report.runtime.message}`);
	row("node", `${report.node.version} (floor ${report.node.floor ?? "unstated"})` + (report.node.ok ? "" : " — below the floor"));
	for (const client of report.clients) {
		const parts = [
			client.recorded === null ? "no plugin recorded" : `records plugin ${client.recorded.version}: ${client.recorded.classes.join(", ")}`,
			client.rootFound ? `root ${client.rootVersion ?? "unknown"} (client floor ${client.clientFloor})` : "no root for this client",
			client.selected ? "selected" : "not selected"
		];
		row(client.tool, parts.join("; "));
	}
	row("compatibility", compatibilityLine(report));
	row("duplicates", report.duplicates.length === 0 ? "none" : report.duplicates.map((entry) => `${entry.tool}: ${entry.class} (${entry.files} file(s), ${entry.source}) at ${describeDuplicatePaths(entry.paths)} — ${entry.remedy}`).join(`\n${CONTINUATION}`));
	row("setup", setupLines(report).join(`\n${CONTINUATION}`));
}
function compatibilityLine(report) {
	const { state, pluginVersion, manifestVersion } = report.compatibility;
	if (state === "not-applicable") return pluginVersion === null ? "not applicable — no plugin root to compare" : "not applicable — this repository records no generated version";
	return `${state} — plugin ${pluginVersion ?? "unknown"}, state written by ${manifestVersion ?? "unknown"}`;
}
function setupLines(report) {
	return [report.setup.needed ? `needed — no setup here; run ${packageCommand("plugin setup --client <csv>")}` : "not needed — this repository already carries a setup", ...report.setup.unconfigured.map((entry) => `unconfigured ${entry.fact}: ${entry.command}`)];
}
async function runStatus$1(ctx, opts) {
	const [pluginRoot] = parseRootFlags(opts["pluginRoot"]);
	const clients = parseClients(opts["client"]);
	const report = await buildPluginStatus(ctx.app.runtime.cwd, ctx.engine, {
		...pluginRoot === void 0 ? {} : { pluginRoot },
		env: ctx.app.runtime.env,
		nodeVersion: process.versions.node,
		clients
	});
	renderStatus$1(ctx, report);
	return {
		exitCode: 0,
		json: { ...report }
	};
}
async function runSetup$1(ctx, opts) {
	const rootDir = ctx.app.runtime.cwd;
	const roots = await resolveRoots(opts, ctx.app.runtime.env);
	if (await hasManifest(rootDir)) throw new EngineError(cleanThenSetup(roots.map((entry) => entry.tool)), {
		code: "VALIDATION_ERROR",
		why: "a plugin-backed setup records ownership on a manifest it creates, and this repository already has one",
		next: `${packageCommand("clean -y")} deletes the whole ${STATE_DIR}/ directory (learnings, handoffs, overrides, run records, packs and user hooks included): copy out what you want to keep first and put it back after plugin setup, all but a pack; a pack copied back is not installed (no ledger row records it, and add refuses over the copied files), so install each pack again after plugin setup with ${packageCommand("add <source>")}, where <source> is the catalog id, local path or package name you installed it from; ${packageCommand("clean --dry-run")} lists what it removes`
	});
	const report = await applyPluginSetup({
		rootDir,
		roots,
		engineVersion: ctx.app.version,
		dryRun: ctx.dryRun,
		now: ctx.app.runtime.clock.now()
	});
	const owned = await ownedSummary(ctx, rootDir, roots, ctx.dryRun);
	ctx.io.out(`${ctx.palette.bold("plugin setup")}\n`);
	ctx.io.out(`  ${wroteLine(report)}\n`);
	for (const entry of owned) ctx.io.out(`  ${ctx.palette.dim(`plugin-owned  ${entry.tool}: ${entry.classes.join(", ")}`)}\n`);
	for (const result of report.wrote) {
		if (result.notice !== void 0) ctx.io.out(`  ${result.notice}\n`);
		if (result.warning !== void 0) ctx.io.out(`  ${ctx.palette.yellow(`warning: ${result.warning}`)}\n`);
	}
	for (const warning of report.warnings) ctx.io.out(`  ${ctx.palette.yellow(warning)}\n`);
	return {
		exitCode: 0,
		json: {
			dryRun: report.dryRun,
			manifestPath: report.manifestPath,
			wrote: report.wrote.map((result) => ({ ...result })),
			warnings: [...report.warnings],
			ledgerCount: report.ledgerCount,
			pluginOwned: owned.map((entry) => ({
				tool: entry.tool,
				classes: [...entry.classes]
			}))
		}
	};
}
const pluginCommand = {
	name: "plugin",
	summary: "run this repository on an installed stamity plugin: status, setup",
	mutating: true,
	args: [{
		name: "subcommand",
		description: "status (default), setup",
		required: false
	}],
	configure(cmd) {
		cmd.option("--client <csv>", `clients to act on (${TOOLS.join(", ")})`);
		cmd.option("--plugin-root <path>", `an installed plugin root; repeat once per client (${TOOLS.join(", ")}), each root naming its own client. One unflagged root is read from ${PLUGIN_ROOT_VARIABLES.join(", ")}`, collectRoot);
	},
	run: async (ctx, opts, args) => {
		const [subcommand] = args;
		if (subcommand === void 0) return runStatus$1(ctx, opts);
		switch (subcommand) {
			case "status": return runStatus$1(ctx, opts);
			case "setup": return runSetup$1(ctx, opts);
			default: throw new CliFailure({
				code: "USAGE",
				message: `unknown plugin subcommand ${JSON.stringify(subcommand)}`,
				why: "plugin takes one of two subcommands",
				next: `use one of: ${SUBCOMMANDS$2.join(", ")}`
			});
		}
	}
};
//#endregion
//#region src/cli/commands/sync.ts
function updatePathHelp() {
	if (!hasNpmChannel()) return `update = install the newer release into this project, then npx --no ${packageName()} sync — regenerating from the newest release is the update; no separate update command exists.`;
	return `update = ${[
		"npx -y",
		scopeRegistryArg(packageName(), npmRegistry() ?? void 0),
		`${packageName()}@<version> sync`
	].filter((word) => word !== "").join(" ")}, with <version> the release to move to — regenerating from that release is the update; no separate update command exists.`;
}
const NEXT_AFTER_WRITE_LINE = "next: git diff to review, stamity check to verify";
const NEXT_AFTER_WRITE_KEPT_FROM_GIT_LINE = "next: review without git, stamity check to verify — git was not started here: this folder, or a folder above it, has the layout of a bare repository, so do not run git in it or in any folder under it, this one included. To review, read the files listed above, and compare a file with the .bak a warning above names for it.";
const NEXT_AFTER_WRITE_NO_GIT_ANSWER_LINE = "next: review without git, stamity check to verify — git did not answer here, and the git-available row of stamity check says what the engine found. To review, read the files listed above, and compare a file with the .bak a warning above names for it.";
const LISTED_FILE_ROWS = 20;
function listCutShortLine(report) {
	const folded = report.wrote.filter((result) => result.action !== "unchanged").length - LISTED_FILE_ROWS;
	if (folded <= 0) return null;
	return `That list was cut short at \`… and ${folded} more\`, and the engine keeps no record of which files those are. The \`ledger\` in ${STATE_DIR}/${MANIFEST_FILE} names every file the engine manages, each file this run wrote among them, and does not say which of them changed; sync --json prints every row under \`wrote\`, but only for the run it is given on, and a run now reports the files this one wrote as unchanged.`;
}
function dirtyTreeWarning(dirty) {
	if (!dirty.available || !dirty.dirty) return null;
	return `warning: working tree has ${dirty.changedCount} uncommitted change(s) — sync writes into it; commit first for an easy git-revert restore path`;
}
function syncClosingLines(plan, report) {
	const lines = [];
	if (plan.manifestMigrated) lines.push(`manifest schema migrated to ${plan.manifest.version}`);
	if (!report.dryRun && report.created + report.updated > 0) {
		const withoutGit = plan.dirty.reason === "bare-layout" ? NEXT_AFTER_WRITE_KEPT_FROM_GIT_LINE : plan.dirty.available ? null : NEXT_AFTER_WRITE_NO_GIT_ANSWER_LINE;
		if (withoutGit === null) lines.push(NEXT_AFTER_WRITE_LINE);
		else {
			const cutShort = listCutShortLine(report);
			lines.push(cutShort === null ? withoutGit : `${withoutGit} ${cutShort}`);
		}
	}
	lines.push(...refusalRemedyLines(plan, report.refused));
	return lines;
}
const syncCommand = {
	name: "sync",
	summary: "regenerate every managed file from the manifest and bundled content",
	mutating: true,
	configure(cmd) {
		cmd.option("--force", "overwrite colliding unmanaged files after a verified .bak");
		cmd.addHelpText("after", `\n${updatePathHelp()}\n`);
	},
	async run(ctx, opts) {
		const rootDir = ctx.app.runtime.cwd;
		const engineVersion = ctx.app.version;
		const force = opts["force"] === true;
		ctx.spinner.start(ctx.dryRun ? "previewing sync…" : "syncing…");
		const plan = await planSync(rootDir, engineVersion);
		const warning = dirtyTreeWarning(plan.dirty);
		if (warning !== null) ctx.io.err(`${warning}\n`);
		const report = await applySync(rootDir, plan, {
			engineVersion,
			force,
			dryRun: ctx.dryRun,
			now: ctx.app.runtime.clock.now()
		});
		ctx.spinner.stop();
		ctx.io.out(`${renderSyncReport(plan, report, ctx.palette)}\n`);
		for (const line of syncClosingLines(plan, report)) ctx.io.out(`${line}\n`);
		return {
			exitCode: report.refused.length > 0 ? 1 : 0,
			json: syncJsonPayload(plan, report)
		};
	}
};
//#endregion
//#region src/cli/commands/validate.ts
const LEARNINGS_DIR = "learnings";
const DEFAULT_USER_HOOKS_DIR = `${STATE_DIR}/hooks`;
async function collectReport(rootDir, engine) {
	const state = await readManifestState(rootDir, engine);
	const hooksDir = configuredUserHooksDir(state.manifest);
	const sections = await Promise.all([
		guarded("user-content", rootDir, repoPath(rootDir, engine.content.userContent.userContentRoot(rootDir)), () => collectUserContent(rootDir, engine, state.manifest)),
		guarded("user-hooks", rootDir, hooksDir, () => collectUserHooks(rootDir, engine, state)),
		guarded("learnings", rootDir, join(STATE_DIR, LEARNINGS_DIR), () => collectLearnings(rootDir, engine, state.manifest)),
		guarded("env-mcp", rootDir, engine.mcp.env.ENV_MCP_FILE, () => collectEnvMcp(rootDir, engine)),
		guarded("workspace", rootDir, engine.workspace.model.WORKSPACE_MANIFEST_FILE, () => collectWorkspace(rootDir, engine))
	]);
	const findings = sections.flatMap((current) => [...current.findings]);
	return {
		sections,
		findings,
		errorCount: findings.filter(isError).length,
		warningCount: findings.filter((row) => !isError(row)).length,
		inspected: sections.reduce((total, current) => total + current.inspected, 0),
		shadows: sections.flatMap((current) => current.shadows ?? [])
	};
}
async function collectUserContent(rootDir, engine, manifest) {
	const { userContent } = engine.content;
	const forkRoot = bundledForkRoot(engine);
	const [artifacts, skipped, support, overlays, carrierExtras, forkOverlays] = await Promise.all([
		userContent.discoverUserContent(rootDir),
		userContent.discoverSkippedUserEntries(rootDir),
		userContent.scanUserSkillSupportFiles(rootDir),
		userContent.discoverUserOverlays(rootDir),
		userContent.discoverSkillOverlayCarrierExtras(rootDir),
		forkRoot === void 0 ? [] : userContent.discoverOverlaysUnder(forkRoot)
	]);
	const judged = await Promise.all(artifacts.map(async (artifact) => ({
		artifact,
		check: await userContent.checkUserArtifact(artifact)
	})));
	const customization = artifacts.length === 0 && overlays.length === 0 && forkRoot === void 0 ? EMPTY_SHADOWS : await collectCustomization(rootDir, engine, manifest, {
		overlays,
		forkOverlays,
		forkRoot
	});
	const findings = [
		...judged.flatMap(({ artifact, check }) => [...check.errors, ...check.warnings].map((violation) => ({
			source: "user-content",
			path: repoPath(rootDir, artifact.filePath),
			severity: violation.severity,
			message: violation.detail
		}))),
		...[...skipped, ...support.skipped].map((entry) => finding("user-content", repoPath(rootDir, entry.filePath), "warning", entry.reason)),
		...support.findings.map((row) => finding("user-content", repoPath(rootDir, row.filePath), row.severity, row.detail)),
		...carrierExtras.map((extra) => finding("user-content", repoPath(rootDir, extra.filePath), "warning", extra.count === 1 ? `sits beside overlay "${extra.slug}"'s halves but is not one of them, so it is never emitted: the skills projection walks the BASE artifact's own directory, not this carrier one. Move it into the base's pack or corpus source to ship it, or remove it.` : `is a directory of ${extra.count} files sitting beside overlay "${extra.slug}"'s halves — none of them one of the halves — so none of it is ever emitted: the skills projection walks the BASE artifact's own directory, not this carrier one. Move the directory into the base's pack or corpus source to ship it, or remove it.`)),
		...customization.findings
	];
	const artifactUnits = artifacts.length + skipped.length;
	const supportUnits = support.inspected + support.skipped.length;
	const overlayUnits = overlays.length;
	const carrierExtraUnits = carrierExtras.length;
	const summary = [
		...artifactUnits > 0 ? [plural(artifactUnits, "artifact")] : [],
		...overlayUnits > 0 ? [plural(overlayUnits, "overlay")] : [],
		...supportUnits > 0 ? [plural(supportUnits, "skill support file")] : [],
		...carrierExtraUnits > 0 ? [plural(carrierExtraUnits, "unemitted carrier file")] : []
	].join(" and ");
	return {
		...section("user-content", findings, artifactUnits + overlayUnits + supportUnits + carrierExtraUnits, summary),
		...customization.note === void 0 ? {} : { note: customization.note },
		shadows: customization.shadows
	};
}
const EMPTY_SHADOWS = {
	shadows: [],
	findings: []
};
function bundledForkRoot(engine) {
	try {
		return engine.content.contentRoot.resolveBundledForkRoot();
	} catch {
		return;
	}
}
function pathDisplayOf(rootDir, forkRoot) {
	return (absolute) => {
		if (forkRoot !== void 0) {
			const rel = relative(forkRoot, absolute);
			if (rel !== "" && !rel.startsWith("..") && !isAbsolute(rel)) return `fork/${rel.split(sep).join("/")}`;
		}
		return repoPath(rootDir, absolute);
	};
}
function layerPathOf(engine, item) {
	return engine.content.catalog.originOf(item) === "fork" ? `fork/${item.relativePath}` : item.relativePath;
}
function customizingLayerOf(origin) {
	return origin === "fork" ? "fork" : "user";
}
async function collectCustomization(rootDir, engine, manifest, inputs) {
	const { catalog, userContent } = engine.content;
	const packRoots = await installedPackRoots(rootDir, engine, manifest);
	const display = pathDisplayOf(rootDir, inputs.forkRoot);
	const overlays = [...inputs.forkOverlays, ...inputs.overlays];
	try {
		const index = await catalog.buildContentIndex({
			overrideRoot: userContent.userContentRoot(rootDir),
			packRoots,
			...inputs.forkRoot === void 0 ? {} : { forkRoot: inputs.forkRoot }
		});
		const forkOutcomes = classifyForkOverlays(engine, index, inputs.forkOverlays, display);
		const patched = await Promise.all([...forkOutcomes.judgeable.map((overlay) => judgePatched(engine, index, overlay, "fork", display)), ...inputs.overlays.map((overlay) => judgePatched(engine, index, overlay, "user", display))]);
		return {
			shadows: [...(index.shadows ?? []).map((shadow) => {
				const row = {
					outcome: "replaced",
					type: shadow.type,
					id: shadow.id,
					winner: customizingLayerOf(catalog.originOf(shadow.winner)),
					path: display(shadow.winner.filePath),
					replaced: shadow.shadowed.map((item) => layerPathOf(engine, item)),
					emits: OVERRIDE_EMITTING_CLASSES.includes(shadow.type)
				};
				const shadowedOverlays = forkOutcomes.shadowedByKey.get(catalog.typeIdKey(shadow.type, shadow.id));
				if (shadowedOverlays !== void 0) row.shadowedOverlays = shadowedOverlays;
				return row;
			}), ...patched.flatMap((result) => result.rows)],
			findings: [...patched.flatMap((result) => result.findings), ...forkOutcomes.waiting]
		};
	} catch (cause) {
		const named = overlayFailure(overlays, display, cause);
		if (named !== void 0) return {
			shadows: [],
			findings: [named]
		};
		return {
			shadows: [],
			findings: [],
			note: `could not report what these overrides replace until the tree indexes: ${messageOf(cause)}`
		};
	}
}
function overlayFailure(overlays, display, cause) {
	const message = messageOf(cause);
	const named = overlays.flatMap(halfPaths).find((path) => message.includes(toPosixDisplayPath(path)));
	return named === void 0 ? void 0 : finding("user-content", display(named), "error", message);
}
function halfPaths(overlay) {
	return [overlay.frontmatterPath, overlay.bodyPath].filter((path) => path !== void 0);
}
function classifyForkOverlays(engine, index, forkOverlays, display) {
	const { catalog } = engine.content;
	const forkHalves = new Set(forkOverlays.flatMap(halfPaths));
	const skipped = (index.skipped ?? []).filter((entry) => forkHalves.has(entry.filePath));
	const skippedPaths = new Set(skipped.map((entry) => entry.filePath));
	const judgeable = [];
	const shadowedByKey = /* @__PURE__ */ new Map();
	for (const overlay of forkOverlays) {
		const halves = halfPaths(overlay);
		if (halves.some((path) => skippedPaths.has(path))) continue;
		const key = catalog.typeIdKey(overlay.type, catalog.applyCommandPrefix(overlay.slug, overlay.type));
		const item = index.byKey.get(key);
		if (item !== void 0 && catalog.originOf(item) === "user") {
			shadowedByKey.set(key, [...shadowedByKey.get(key) ?? [], ...halves.map(display)]);
			continue;
		}
		judgeable.push(overlay);
	}
	return {
		judgeable,
		shadowedByKey,
		waiting: skipped.map((entry) => finding("user-content", display(entry.filePath), "warning", entry.reason))
	};
}
async function judgePatched(engine, index, overlay, layer, display) {
	const { catalog, userContent } = engine.content;
	const id = catalog.applyCommandPrefix(overlay.slug, overlay.type);
	const item = index.byKey.get(catalog.typeIdKey(overlay.type, id));
	if (item === void 0) return {
		rows: [],
		findings: []
	};
	const check = await userContent.checkUserArtifact({
		type: overlay.type,
		id: item.id,
		filePath: item.filePath,
		frontmatter: item.frontmatter,
		body: item.body,
		fileSlug: overlay.slug
	});
	const findings = [...check.errors, ...check.warnings].map((violation) => finding("user-content", display(addressOf(overlay, violation.kind)), violation.severity, violation.detail));
	return {
		rows: [{
			outcome: "patched",
			type: overlay.type,
			id: item.id,
			layer,
			base: layerPathOf(engine, item),
			origin: item.provenance?.pack ?? catalog.originOf(item),
			overlays: halfPaths(overlay).map(display),
			emits: OVERRIDE_EMITTING_CLASSES.includes(overlay.type)
		}],
		findings: [...findings, ...cappedBody(engine, overlay, display)]
	};
}
const BODY_JUDGED_KINDS = /* @__PURE__ */ new Set([
	"anti-slop",
	"lean-lines",
	"deny-pattern"
]);
function addressOf(overlay, kind) {
	const [preferred, fallback] = BODY_JUDGED_KINDS.has(kind) ? [overlay.bodyPath, overlay.frontmatterPath] : [overlay.frontmatterPath, overlay.bodyPath];
	return preferred ?? fallback;
}
function cappedBody(engine, overlay, display) {
	const cap = engine.guard.promptGuard.MAX_USER_CONTENT_LENGTH;
	if (overlay.bodyPath === void 0 || (overlay.bodyLength ?? 0) <= cap) return [];
	return [finding("user-content", display(overlay.bodyPath), "error", `body patch is ${overlay.bodyLength} characters, over the ${cap}-character ceiling on user-authored content — text past it is truncated where the artifact re-enters agent context, so split the patch or move the material into a skill support file`)];
}
async function installedPackRoots(rootDir, engine, manifest) {
	if (manifest === null) return [];
	try {
		const packs = await engine.pack.projection.discoverInstalledPacks(rootDir, manifest);
		return engine.pack.projection.packContentRoots(packs);
	} catch {
		return [];
	}
}
function configuredUserHooksDir(manifest) {
	const configured = manifest?.hooks?.userHooksDir?.trim();
	return configured === void 0 || configured === "" ? DEFAULT_USER_HOOKS_DIR : configured;
}
async function collectUserHooks(rootDir, engine, state) {
	const manifestFile = repoPath(rootDir, engine.manifest.manifest.manifestPath(rootDir));
	if (state.failure !== void 0) return section("user-hooks", [finding("user-hooks", manifestFile, "error", state.failure)], 0);
	if (state.manifest === null) return {
		source: "user-hooks",
		findings: [],
		inspected: 0,
		note: `skipped — this repo has no ${manifestFile}, so nothing emits hooks from it yet`
	};
	const configured = configuredUserHooksDir(state.manifest);
	const hooksDir = resolve(rootDir, configured);
	const { hooks, errors } = await engine.hooks.userHooks.readHookDefinitions(hooksDir, rootDir);
	const findings = errors.map((error) => finding("user-hooks", error.file, "error", error.message));
	const inspected = hooks.length + errors.length;
	if (inspected === 0 && !await isDirectory(hooksDir)) return {
		source: "user-hooks",
		findings: [],
		inspected: 0,
		note: `skipped — this repo has no ${configured}/ directory${configured === DEFAULT_USER_HOOKS_DIR ? " (the default hooks location)" : ""}, so there are no hook declarations to check`
	};
	return section("user-hooks", findings, inspected, plural(inspected, "hook"));
}
async function collectLearnings(rootDir, engine, manifest) {
	const { validation } = engine.learnings;
	const dir = join(rootDir, STATE_DIR, LEARNINGS_DIR);
	const caps = validation.resolveLearningsCaps(manifest?.learnings?.maxCount);
	const result = await validation.validateLearningsDirectory(dir, caps);
	const findings = [...result.invalid.flatMap((entry) => entry.errors.map((message) => finding("learnings", repoPath(rootDir, join(dir, entry.file)), "error", message))), ...result.overCap.map((file) => finding("learnings", repoPath(rootDir, join(dir, file)), "warning", `past the ${caps.maxCount}-file cap, so it was not validated and will not load — retire an older learning, or raise learnings.maxCount in the manifest`))];
	const inspected = result.valid.length + result.invalid.length + result.overCap.length;
	return section("learnings", findings, inspected, plural(inspected, "learning"));
}
async function collectEnvMcp(rootDir, engine) {
	const file = engine.mcp.env.ENV_MCP_FILE;
	const raw = await readIfPresent(join(rootDir, file));
	if (raw === null) return section("env-mcp", [], 0);
	const values = engine.mcp.env.parseEnvFile(raw);
	const detected = engine.mcp.secretScan.detectSecrets(values);
	const reported = engine.mcp.env.reportEnvValues(values);
	return section("env-mcp", [...detected.findings.map((secret) => finding("env-mcp", file, "warning", `${secret.varName ?? "(value)"} holds a literal matching \`${secret.patternId}\` (${secret.maskedValue}) — expected in this gitignored file; check it is the credential that name is meant to carry, and never inline it into a client config`)), ...reported.filter((value) => !value.set).map((value) => finding("env-mcp", file, "warning", `${value.name} has no value — fill it in, or drop the line if no selected server needs it; a server whose credential is blank fails at start-up`))], 1, file);
}
async function collectWorkspace(rootDir, engine) {
	const file = engine.workspace.model.WORKSPACE_MANIFEST_FILE;
	const raw = await readIfPresent(join(rootDir, file));
	if (raw === null) return section("workspace", [], 0);
	let document;
	try {
		document = engine.config.parse.parseJsonStrict(raw, file);
	} catch (cause) {
		return section("workspace", [finding("workspace", file, "error", messageOf(cause))], 1, file);
	}
	return section("workspace", engine.workspace.manifest.collectWorkspaceManifestErrors(document).map((message) => finding("workspace", file, "error", message)), 1, file);
}
async function readManifestState(rootDir, engine) {
	try {
		return { manifest: await engine.manifest.manifest.readManifest(rootDir) };
	} catch (cause) {
		return {
			manifest: null,
			failure: messageOf(cause)
		};
	}
}
function renderReport(ctx, report) {
	const { palette } = ctx;
	for (const current of report.sections) {
		if (current.findings.length === 0) continue;
		const errors = current.findings.filter(isError).length;
		const warnings = current.findings.length - errors;
		ctx.io.out(`${palette.bold(current.source)} — ${plural(errors, "error")}, ${plural(warnings, "warning")}\n`);
		for (const row of current.findings) {
			const label = row.severity === "error" ? palette.red("error  ") : palette.yellow("warning");
			ctx.io.out(`  ${label}  ${palette.dim(row.path)}  ${row.message}\n`);
		}
		ctx.io.out("\n");
	}
	renderShadows(ctx, report.shadows);
	for (const current of report.sections) if (current.note !== void 0) ctx.io.out(palette.dim(`note: ${current.source} ${current.note}\n`));
	if (report.findings.length === 0) {
		const checked = report.sections.map((current) => current.summary).filter((summary) => summary !== void 0);
		ctx.io.out(checked.length === 0 ? `${palette.green("nothing user-authored to validate")} — ok\n` : `${palette.green("ok")} — checked ${checked.join(", ")}, no findings\n`);
		return;
	}
	const sourceCount = report.sections.filter((current) => current.findings.length > 0).length;
	const verdict = `${plural(report.errorCount, "error")}, ${plural(report.warningCount, "warning")} across ${plural(sourceCount, "section")}`;
	ctx.io.out(`${report.errorCount > 0 ? palette.red(verdict) : palette.yellow(verdict)}\n`);
	ctx.io.out("next: fix the findings above, then re-run stamity validate\n");
}
function renderShadows(ctx, shadows) {
	if (shadows.length === 0) return;
	const { palette } = ctx;
	const count = (outcome, layer) => shadows.filter((row) => row.outcome === outcome && customizedBy(row) === layer).length;
	const takes = (n, noun) => `${plural(n, noun)} ${n === 1 ? "takes" : "take"} a bundled id`;
	const patches = (n, noun, saidId) => `${plural(n, noun)} ${n === 1 ? "patches" : "patch"} ${saidId ? "one" : "a bundled id"}`;
	const replacedUser = count("replaced", "user");
	const replacedFork = count("replaced", "fork");
	const patchedUser = count("patched", "user");
	const patchedFork = count("patched", "fork");
	const clauses = [
		...replacedUser > 0 ? [takes(replacedUser, "override")] : [],
		...replacedFork > 0 ? [takes(replacedFork, "fork replacement")] : [],
		...patchedUser > 0 ? [patches(patchedUser, "overlay", replacedUser + replacedFork > 0)] : [],
		...patchedFork > 0 ? [patches(patchedFork, "fork overlay", replacedUser + replacedFork + patchedUser > 0)] : []
	];
	ctx.io.out(`${palette.bold("shadowing")} — ${clauses.join(", ")}\n\n`);
	for (const row of shadows) {
		const [path, outcome] = row.outcome === "replaced" ? [row.path, row.emits ? `replaces ${row.replaced.join(", ")}` : `takes the id of ${row.replaced.join(", ")} — not emitted, the bundled ${row.type} body is still what ships`] : [row.overlays.join(", "), row.emits ? `patches ${row.base} (${row.origin})` : `patches ${row.base} (${row.origin}) — not emitted, the bundled ${row.type} body is still what ships`];
		const layer = customizedBy(row) === "fork" ? " — fork layer" : "";
		const shadowedOverlays = row.outcome === "replaced" && row.shadowedOverlays !== void 0 ? `; shadows the fork patch ${row.shadowedOverlays.join(", ")} — inert, the override replaced the artifact it would have patched` : "";
		ctx.io.out(`  ${row.type} ${palette.bold(row.id)}  ${palette.dim(path)}  ${outcome}${layer}${shadowedOverlays}\n`);
	}
	ctx.io.out("\n");
}
function customizedBy(row) {
	return row.outcome === "replaced" ? row.winner : row.layer;
}
function finding(source, path, severity, message) {
	return {
		source,
		path,
		severity,
		message
	};
}
function section(source, findings, inspected, summary) {
	return {
		source,
		findings,
		inspected,
		...inspected > 0 && summary !== void 0 ? { summary } : {}
	};
}
async function guarded(source, rootDir, fallbackPath, run) {
	try {
		return await run();
	} catch (cause) {
		const errno = cause;
		const at = typeof errno?.path === "string" ? repoPath(rootDir, errno.path) : fallbackPath;
		return section(source, [finding(source, at, "error", failureMessage(cause, errno, at))], 0);
	}
}
function failureMessage(cause, errno, at) {
	if (cause instanceof EngineError) return cause.message;
	if (typeof errno?.code === "string") {
		const syscall = typeof errno.syscall === "string" ? ` (${errno.syscall})` : "";
		return `cannot read ${at}: ${errno.code}${syscall}. Fix the path's permissions, or remove it, then re-run.`;
	}
	return `cannot read ${at}: ${messageOf(cause)}`;
}
async function isDirectory(path) {
	try {
		return (await stat(path)).isDirectory();
	} catch {
		return false;
	}
}
async function readIfPresent(path) {
	try {
		return await readFile(path, "utf8");
	} catch (cause) {
		const code = cause?.code;
		if (code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR") return null;
		throw cause;
	}
}
function repoPath(rootDir, absolute) {
	const rel = relative(rootDir, absolute);
	if (rel === "") return ".";
	return rel.split(sep).join("/");
}
function isError(candidate) {
	return candidate.severity === "error";
}
function plural(count, noun) {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
function messageOf(cause) {
	return cause instanceof Error ? cause.message : String(cause);
}
const validateCommand = {
	name: "validate",
	summary: "check the content, hooks, learnings and credentials this repo authored",
	mutating: false,
	async run(ctx) {
		const report = await collectReport(ctx.app.runtime.cwd, ctx.engine);
		renderReport(ctx, report);
		return {
			exitCode: report.errorCount > 0 ? 1 : 0,
			json: {
				findings: report.findings,
				errorCount: report.errorCount,
				warningCount: report.warningCount,
				shadows: report.shadows
			}
		};
	}
};
//#endregion
//#region src/cli/commands/workspace.ts
const SUBCOMMANDS$1 = [
	"status",
	"init",
	"sync"
];
const JOURNAL_TAIL_BYTES = 65536;
const STATE_WIDTH = Math.max(...[
	"ok",
	"unconfigured",
	"absent",
	"escaped",
	"unresolved"
].map((s) => s.length));
async function requireWorkspaceRoot(ctx, cwd) {
	const context = await ctx.engine.workspace.detect.detectWorkspaceContext(cwd);
	if (context.workspaceRoot !== null) return context.workspaceRoot;
	throw new CliFailure({
		code: "CONFIG_ERROR",
		message: `no workspace found at or above ${cwd}`,
		why: `no ${ctx.engine.workspace.model.WORKSPACE_MANIFEST_FILE} in that directory or any parent`,
		next: "run stamity workspace init in the directory holding your repositories"
	});
}
async function requireWorkspaceManifest(ctx, rootDir) {
	const manifest = await ctx.engine.workspace.manifest.readWorkspaceManifest(rootDir);
	if (manifest !== null) return manifest;
	throw new CliFailure({
		code: "CONFIG_ERROR",
		message: `no workspace manifest at ${rootDir}`,
		why: "it was present when the workspace root was resolved and gone when it was read",
		next: "re-run stamity workspace status"
	});
}
async function isFile(path) {
	try {
		return (await stat(path)).isFile();
	} catch {
		return false;
	}
}
async function resolveRootReal(rootDir) {
	try {
		return await realpath(rootDir);
	} catch {
		return null;
	}
}
async function classifyMemberDir(rootDir, rootReal, repoPath) {
	const dir = join(rootDir, repoPath);
	let entry;
	try {
		entry = await stat(dir);
	} catch {
		return "absent";
	}
	if (!entry.isDirectory()) return "absent";
	if (rootReal === null) return "escaped";
	let member;
	try {
		member = await realpath(dir);
	} catch {
		return "escaped";
	}
	if (member !== rootReal && !member.startsWith(join(rootReal, sep))) return "escaped";
	return await isFile(join(dir, ".stamity", "manifest.json")) ? "ok" : "unconfigured";
}
async function buildMemberRow(ctx, rootDir, rootReal, manifest, entry) {
	let resolved;
	try {
		resolved = ctx.engine.workspace.resolve.resolveRepoConfig(manifest, entry.path);
	} catch (err) {
		return {
			path: entry.path,
			state: "unresolved",
			error: {
				code: err instanceof EngineError ? err.code : "VALIDATION_ERROR",
				message: err instanceof Error ? err.message : String(err)
			}
		};
	}
	const groups = entry.groups ?? [];
	return {
		path: entry.path,
		state: await classifyMemberDir(rootDir, rootReal, entry.path),
		tools: [...resolved.tools],
		...groups.length === 0 ? {} : { groups: [...groups] },
		...resolved.lockedApplied.length === 0 ? {} : { lockedApplied: [...resolved.lockedApplied] }
	};
}
async function readJournalTail(rootDir, fileName) {
	const path = join(rootDir, STATE_DIR, fileName);
	if (!await isFile(path)) return null;
	let handle;
	try {
		handle = await open(path, "r");
	} catch {
		return null;
	}
	try {
		const { size } = await handle.stat();
		const start = Math.max(0, size - JOURNAL_TAIL_BYTES);
		const length = size - start;
		if (length <= 0) return null;
		const buffer = Buffer.alloc(length);
		await handle.read(buffer, 0, length, start);
		const text = buffer.toString("utf8");
		if (start === 0) return text;
		const firstBreak = text.indexOf("\n");
		return firstBreak === -1 ? "" : text.slice(firstBreak + 1);
	} catch {
		return null;
	} finally {
		await handle.close();
	}
}
function journalFields(line) {
	let value;
	try {
		value = JSON.parse(line);
	} catch {
		return null;
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
	const { ts, run, repo, event } = value;
	if (typeof ts !== "string" || typeof run !== "string" || typeof repo !== "string") return null;
	if (typeof event !== "string") return null;
	return {
		ts,
		run,
		repo,
		event
	};
}
function unterminatedFlights(text) {
	const lastByRepo = /* @__PURE__ */ new Map();
	for (const line of text.split("\n")) {
		if (line.trim() === "") continue;
		const fields = journalFields(line);
		if (fields === null) continue;
		if (fields.event === "started") lastByRepo.set(fields.repo, {
			repo: fields.repo,
			run: fields.run,
			ts: fields.ts
		});
		else if (fields.event === "finished" || fields.event === "skipped") lastByRepo.set(fields.repo, null);
	}
	return [...lastByRepo.values()].filter((flight) => flight !== null);
}
function paintState(state, palette) {
	const token = state.padEnd(STATE_WIDTH);
	if (state === "ok") return palette.green(token);
	if (state === "unconfigured") return palette.yellow(token);
	return palette.red(token);
}
function renderDetail(row) {
	if (row.error !== void 0) return sanitizeLabel(`[${row.error.code}] ${row.error.message}`);
	const parts = [`tools: ${(row.tools ?? []).join(", ")}`];
	if (row.groups !== void 0) parts.push(`groups: ${row.groups.join(", ")}`);
	if (row.lockedApplied !== void 0) parts.push(`locked: ${row.lockedApplied.join(", ")}`);
	return sanitizeLabel(parts.join("  "));
}
function renderStatus(ctx, report) {
	const { palette } = ctx;
	ctx.io.out(`${palette.bold("workspace")} ${sanitizeLabel(report.root.path)}\n`);
	ctx.io.out(`  ${palette.dim(`root: ${report.root.hasSetupManifest ? `carries its own ${STATE_DIR}/${MANIFEST_FILE}` : `no ${STATE_DIR}/${MANIFEST_FILE} of its own`} — informative; the root is never a cascade target`)}\n`);
	if (report.members.length === 0) ctx.io.out(`  ${palette.dim("no members registered — add repos[] entries to workspace.json")}\n`);
	else {
		const width = Math.max(...report.members.map((row) => sanitizeLabel(row.path).length));
		for (const row of report.members) ctx.io.out(`  ${paintState(row.state, palette)}  ${sanitizeLabel(row.path).padEnd(width)}  ${renderDetail(row)}\n`);
	}
	for (const flight of report.journal) ctx.io.out(`\n${palette.yellow("in flight:")} ${sanitizeLabel(flight.repo)} started at ${sanitizeLabel(flight.ts)} in run ${sanitizeLabel(flight.run)} and never finished — its tree may be half-written\n`);
	ctx.io.out(`${palette.dim("run stamity workspace sync to apply this policy to every member")}\n`);
}
async function runStatus(ctx, cwd) {
	const rootDir = await requireWorkspaceRoot(ctx, cwd);
	const manifest = await requireWorkspaceManifest(ctx, rootDir);
	const rootReal = await resolveRootReal(rootDir);
	const [members, journalText] = await Promise.all([Promise.all(manifest.repos.map((entry) => buildMemberRow(ctx, rootDir, rootReal, manifest, entry))), readJournalTail(rootDir, ctx.engine.workspace.sync.WORKSPACE_SYNC_JOURNAL_FILE)]);
	const report = {
		root: {
			path: rootDir,
			hasSetupManifest: await isFile(join(rootDir, STATE_DIR, MANIFEST_FILE))
		},
		members,
		journal: journalText === null ? [] : unterminatedFlights(journalText)
	};
	renderStatus(ctx, report);
	return {
		exitCode: 0,
		json: { ...report }
	};
}
const FALLBACK_TOOL = "claude";
async function assertCreatable(ctx, rootDir, force) {
	const context = await ctx.engine.workspace.detect.detectWorkspaceContext(rootDir);
	if (context.role === "standalone" || force) return;
	const file = ctx.engine.workspace.model.WORKSPACE_MANIFEST_FILE;
	if (context.role === "workspace-root") throw new CliFailure({
		code: "VALIDATION_ERROR",
		message: `a workspace manifest already exists at ${context.manifestPath ?? join(rootDir, file)}`,
		why: "workspace init composes a fresh manifest; it does not merge into one that is already there",
		next: `run stamity workspace status to see what it declares, edit ${file} by hand, or re-run with --force to overwrite it`
	});
	throw new CliFailure({
		code: "VALIDATION_ERROR",
		message: `${rootDir} is already inside the workspace rooted at ${context.workspaceRoot ?? "an outer directory"}`,
		why: `that workspace declares its members in ${context.manifestPath ?? file}`,
		next: `run stamity workspace status to see it, or re-run with --force to nest a second workspace here — the nearest ${file} wins for the directories below it`
	});
}
function noCandidates(ctx, rootDir) {
	const file = ctx.engine.workspace.model.WORKSPACE_MANIFEST_FILE;
	return new CliFailure({
		code: "VALIDATION_ERROR",
		message: `no repositories found under ${rootDir}`,
		why: `the scan descends ${String(4)} levels and counts a directory as a candidate when it carries a .git entry or a ${STATE_DIR}/${MANIFEST_FILE} of its own`,
		next: `run this in the directory that holds your repositories, or write ${file} by hand`
	});
}
function markersOf(repo) {
	return [...repo.hasGit ? [".git"] : [], ...repo.hasManifest ? [STATE_DIR] : []].join(", ");
}
async function askMembers(ctx, gate, candidates) {
	const picked = await selectMany(gate, ctx.promptIo, {
		question: `Which repositories join this workspace? (${String(candidates.length)} found)`,
		choices: candidates.map((repo) => ({
			value: repo.path,
			label: `${sanitizeLabel(repo.path)} — ${markersOf(repo)}`
		})),
		defaultValues: candidates.map((repo) => repo.path)
	});
	closePrompts(ctx.promptIo);
	const chosen = new Set(picked);
	return candidates.filter((repo) => chosen.has(repo.path));
}
function readToolsFlag(raw) {
	const names = raw.split(",").map((name) => name.trim().toLowerCase()).filter((name) => name !== "");
	const unknown = names.filter((name) => !VALID_TOOLS.has(name));
	if (unknown.length > 0) throw new CliFailure({
		code: "VALIDATION_ERROR",
		message: `unknown tool${unknown.length > 1 ? "s" : ""} ${unknown.map((name) => JSON.stringify(name)).join(", ")}`,
		why: "--tools names the clients every member inherits, and this build ships no adapter for that id",
		next: `valid tools: ${TOOLS.join(", ")}`
	});
	const tools = TOOLS.filter((tool) => names.includes(tool));
	if (tools.length === 0) throw new CliFailure({
		code: "VALIDATION_ERROR",
		message: "--tools named no tool",
		why: "a workspace whose defaults target nothing generates nothing in any member",
		next: `pass a comma-separated list of: ${TOOLS.join(", ")}`
	});
	return tools;
}
async function memberTools(ctx, memberDir) {
	try {
		return (await ctx.engine.manifest.manifest.readManifest(memberDir))?.tools ?? [];
	} catch {
		return [];
	}
}
async function deriveDefaultTools(ctx, rootDir, selected) {
	const lists = await Promise.all(selected.map(async (repo) => repo.hasManifest ? memberTools(ctx, join(rootDir, repo.path)) : []));
	const declared = new Set(lists.flat());
	const tools = TOOLS.filter((tool) => declared.has(tool));
	return tools.length === 0 ? [FALLBACK_TOOL] : tools;
}
function renderKeepNone(ctx, rootDir) {
	const { palette } = ctx;
	ctx.io.out(`${palette.bold("workspace")} ${sanitizeLabel(rootDir)}\n`);
	ctx.io.out(`  ${palette.yellow("no members selected")} — nothing was created\n`);
	ctx.io.out(`${palette.dim("run stamity workspace init again to pick the repositories that join")}\n`);
}
function renderCreated(ctx, report, manifest) {
	const { palette } = ctx;
	const count = manifest.repos.length;
	ctx.io.out(`${palette.bold("workspace")} ${sanitizeLabel(report.path)}\n`);
	ctx.io.out(`  ${report.dryRun ? "would register" : "registered"} ${String(count)} member${count === 1 ? "" : "s"}\n`);
	for (const entry of manifest.repos) ctx.io.out(`  ${palette.green("+")} ${sanitizeLabel(entry.path)}\n`);
	ctx.io.out(`  ${palette.dim(`tools: ${manifest.defaults.tools.join(", ")}`)}\n`);
	if (report.dryRun) {
		ctx.io.out(`\n${JSON.stringify(manifest, null, 2)}\n`);
		ctx.io.out(`${palette.dim("nothing was written — re-run without --dry-run to create it")}\n`);
		return;
	}
	ctx.io.out(`${palette.dim("run stamity workspace sync to apply this policy to every member")}\n`);
}
async function runInit(ctx, rootDir, opts) {
	const force = opts["force"] === true;
	const rawTools = opts["tools"];
	const flagTools = typeof rawTools === "string" ? readToolsFlag(rawTools) : null;
	await assertCreatable(ctx, rootDir, force);
	const candidates = await ctx.engine.workspace.detect.detectSubRepos(rootDir, { maxDepth: 4 });
	if (candidates.length === 0) throw noCandidates(ctx, rootDir);
	const selected = await askMembers(ctx, promptGate({
		stdinIsTTY: ctx.terminal.stdinIsTTY,
		yes: ctx.yes,
		json: ctx.json,
		env: ctx.app.runtime.env,
		palette: ctx.palette
	}), candidates);
	const path = join(rootDir, ctx.engine.workspace.model.WORKSPACE_MANIFEST_FILE);
	if (selected.length === 0) {
		renderKeepNone(ctx, rootDir);
		return {
			exitCode: 0,
			json: {
				path,
				created: false,
				dryRun: ctx.dryRun,
				members: [],
				defaults: null,
				manifest: null
			}
		};
	}
	const tools = flagTools ?? await deriveDefaultTools(ctx, rootDir, selected);
	const manifest = ctx.engine.workspace.manifest.createWorkspaceManifest({ tools }, selected.map((repo) => ({ path: repo.path })));
	if (!ctx.dryRun) await ctx.engine.workspace.manifest.writeWorkspaceManifest(rootDir, manifest);
	const report = {
		path,
		created: !ctx.dryRun,
		dryRun: ctx.dryRun,
		members: manifest.repos.map((entry) => entry.path),
		defaults: { tools: [...manifest.defaults.tools] },
		manifest
	};
	renderCreated(ctx, report, manifest);
	return {
		exitCode: 0,
		json: { ...report }
	};
}
function sameList(a, b) {
	return a.length === b.length && a.every((value, index) => value === b[index]);
}
function sameMcp(mine, theirs) {
	return mine !== void 0 && mine.protocolVersion === theirs.protocolVersion && sameList(mine.servers, theirs.servers);
}
function propagationPatch(manifest, resolved) {
	const patch = {};
	const fields = [];
	if (!sameList(manifest.tools, resolved.tools)) {
		patch.tools = [...resolved.tools];
		fields.push("tools");
	}
	if (resolved.maturityTier !== void 0 && resolved.maturityTier !== manifest.maturityTier) {
		patch.maturityTier = resolved.maturityTier;
		fields.push("maturityTier");
	}
	if (resolved.mcp !== void 0 && !sameMcp(manifest.mcp, resolved.mcp)) {
		patch.mcp = {
			servers: [...resolved.mcp.servers],
			...resolved.mcp.protocolVersion === void 0 ? {} : { protocolVersion: resolved.mcp.protocolVersion }
		};
		fields.push("mcp");
	}
	return {
		patch,
		fields
	};
}
function missingMemberManifest(ctx, repoPath, memberDir) {
	return new EngineError(`Workspace member "${repoPath}" has no setup manifest at ${join(memberDir, STATE_DIR, MANIFEST_FILE)}. Run \`stamity init\` in it, or drop the entry from repos[] in ${ctx.engine.workspace.model.WORKSPACE_MANIFEST_FILE}.`, { code: "VALIDATION_ERROR" });
}
function refusedPaths(repoPath, plan, refused) {
	return new EngineError(`Workspace member "${repoPath}" refused ${String(refused.length)} path(s): ${refused.join(", ")}. ${refusalRemedyLines(plan, refused).join(" ")}`, { code: "ADAPTER_ERROR" });
}
function createBridge(ctx, rootDir, opts, outcomes) {
	const engineVersion = ctx.app.version;
	return async (repo, resolved) => {
		const memberDir = join(rootDir, repo.path);
		const manifest = await ctx.engine.manifest.manifest.readManifest(memberDir);
		if (manifest === null) throw missingMemberManifest(ctx, repo.path, memberDir);
		const { patch, fields } = propagationPatch(manifest, resolved);
		const outcome = {
			patched: fields,
			lockedApplied: [...resolved.lockedApplied],
			gitignoreAdded: []
		};
		outcomes.set(repo.path, outcome);
		if (fields.length > 0 && !ctx.dryRun) await ctx.engine.manifest.manifest.writeManifest(memberDir, {
			...manifest,
			...patch
		}, { now: opts.now });
		const plan = await planSync(memberDir, engineVersion);
		const applied = await applySync(memberDir, plan, {
			engineVersion,
			force: opts.force,
			dryRun: ctx.dryRun,
			now: opts.now
		});
		outcome.gitignoreAdded = [...applied.gitignoreAdded ?? []];
		if (applied.refused.length > 0) throw refusedPaths(repo.path, plan, applied.refused);
	};
}
const SYNC_STATE_WIDTH = Math.max(...[
	"synced",
	"failed",
	"skipped"
].map((state) => state.length));
function paintSyncState(state, palette) {
	const token = state.padEnd(SYNC_STATE_WIDTH);
	if (state === "synced") return palette.green(token);
	if (state === "skipped") return palette.yellow(token);
	return palette.red(token);
}
function renderSyncDetail(row, dryRun) {
	if (row.error !== void 0) return sanitizeLabel(`[${row.error.code}] ${row.error.message}`);
	if (row.skipReason !== void 0) return sanitizeLabel(row.skipReason);
	const patched = row.patched ?? [];
	const parts = [patched.length === 0 ? "manifest already matched" : `${dryRun ? "would patch" : "patched"} ${patched.join(", ")}`];
	if ((row.lockedApplied ?? []).length > 0) parts.push(`locked: ${(row.lockedApplied ?? []).join(", ")}`);
	if ((row.gitignoreAdded ?? []).length > 0) parts.push(`.gitignore: added ${(row.gitignoreAdded ?? []).join(", ")}`);
	return sanitizeLabel(parts.join("  "));
}
function inertPolicyNotice(manifest, report) {
	if (!(manifest.lockedContent !== void 0 || manifest.defaults.selection !== void 0 || (manifest.groups ?? []).some((group) => group.addItems !== void 0 || group.removeItems !== void 0) || report.repos.some((row) => (row.lockedApplied ?? []).length > 0))) return null;
	return "selection deltas and locked content are resolved and reported above; they do not yet change an emitted file";
}
function printSyncPreflight(ctx, rootDir, memberCount) {
	const { palette } = ctx;
	ctx.io.out(`${palette.bold("workspace")} ${sanitizeLabel(rootDir)}\n`);
	ctx.io.out(`  ${palette.dim(`resolved root, ${String(memberCount)} member${memberCount === 1 ? "" : "s"} declared`)}\n`);
}
function renderSync(ctx, manifest, report) {
	const { palette } = ctx;
	if (report.repos.length === 0) ctx.io.out(`  ${palette.dim("no members registered — add repos[] entries to workspace.json")}\n`);
	else {
		const width = Math.max(...report.repos.map((row) => sanitizeLabel(row.repoPath).length));
		for (const row of report.repos) ctx.io.out(`  ${paintSyncState(row.state, palette)}  ${sanitizeLabel(row.repoPath).padEnd(width)}  ${renderSyncDetail(row, report.dryRun)}\n`);
	}
	const { total, succeeded, failed, skipped } = report.counts;
	const tally = [
		`${String(succeeded)} synced`,
		`${String(failed)} failed`,
		...skipped === 0 ? [] : [`${String(skipped)} skipped`]
	].join(", ");
	ctx.io.out(`  ${String(total)} member${total === 1 ? "" : "s"}: ${tally} — ${report.outcome === "passed" ? palette.green(report.outcome) : palette.red(report.outcome)}\n`);
	const notice = inertPolicyNotice(manifest, report);
	if (notice !== null) ctx.io.out(`${palette.dim(notice)}\n`);
	for (const warning of report.journalWarnings) ctx.io.err(`warning: ${warning}\n`);
	ctx.io.out(report.dryRun ? `${palette.dim("nothing was written — re-run without --dry-run to apply this policy")}\n` : `${palette.dim("run stamity workspace status to see what each member now declares")}\n`);
}
async function refuseRealpathAliases(rootDir, repos) {
	const resolved = await Promise.all(repos.map(async (entry) => {
		try {
			return {
				path: entry.path,
				real: await realpath(join(rootDir, entry.path))
			};
		} catch {
			return null;
		}
	}));
	const byReal = /* @__PURE__ */ new Map();
	for (const row of resolved) {
		if (row === null) continue;
		const existing = byReal.get(row.real);
		if (existing === void 0) byReal.set(row.real, [row.path]);
		else existing.push(row.path);
	}
	for (const paths of byReal.values()) {
		if (paths.length < 2) continue;
		throw new CliFailure({
			code: "VALIDATION_ERROR",
			message: `repos[] entries ${paths.map((p) => JSON.stringify(p)).join(" and ")} resolve to the same directory`,
			why: "a symlink alias passes the manifest's textual duplicate check, and two entries cascading into one real directory would race that directory's manifest write concurrently",
			next: "keep one entry and drop the other from repos[] in workspace.json, or replace the symlink with the real path it points at"
		});
	}
}
async function runSync(ctx, cwd, opts) {
	const rootDir = await requireWorkspaceRoot(ctx, cwd);
	const manifest = await requireWorkspaceManifest(ctx, rootDir);
	await refuseRealpathAliases(rootDir, manifest.repos);
	const now = ctx.app.runtime.clock.now();
	const outcomes = /* @__PURE__ */ new Map();
	printSyncPreflight(ctx, rootDir, manifest.repos.length);
	ctx.spinner.start(ctx.dryRun ? "previewing the cascade…" : "syncing every member…");
	const result = await ctx.engine.workspace.sync.syncWorkspaceRepos({
		rootDir,
		manifest,
		journal: !ctx.dryRun,
		syncRepo: createBridge(ctx, rootDir, {
			force: opts["force"] === true,
			now
		}, outcomes)
	});
	ctx.spinner.stop();
	const report = {
		root: rootDir,
		dryRun: ctx.dryRun,
		outcome: result.outcome,
		counts: result.counts,
		repos: result.repos.map((row) => {
			const seen = outcomes.get(row.repoPath);
			if (seen === void 0) return row;
			return {
				...row,
				patched: seen.patched,
				...seen.lockedApplied.length === 0 ? {} : { lockedApplied: seen.lockedApplied },
				...seen.gitignoreAdded.length === 0 ? {} : { gitignoreAdded: seen.gitignoreAdded }
			};
		}),
		journalWarnings: result.journalWarnings
	};
	renderSync(ctx, manifest, report);
	return {
		exitCode: report.outcome === "passed" ? 0 : 1,
		json: { ...report }
	};
}
const workspaceCommand = {
	name: "workspace",
	summary: "one policy across several repositories: status, guided creation, and the cascade",
	mutating: true,
	args: [{
		name: "subcommand",
		description: "status | init | sync — omit for status",
		required: false
	}],
	configure(cmd) {
		cmd.option("--tools <csv>", `defaults.tools for the created workspace, comma-separated (${TOOLS.join(", ")}) — workspace init only`);
		cmd.option("--force", "workspace init: overwrite a workspace.json already at this directory, or create one nested inside an outer workspace. workspace sync: in every member, overwrite colliding unmanaged files after a verified .bak");
	},
	run: async (ctx, opts, args) => {
		const cwd = ctx.app.runtime.cwd;
		const [subcommand] = args;
		if (subcommand === void 0) return runStatus(ctx, cwd);
		switch (subcommand) {
			case "status": return runStatus(ctx, cwd);
			case "init": return runInit(ctx, cwd, opts);
			case "sync": return runSync(ctx, cwd, opts);
			default: throw new CliFailure({
				code: "USAGE",
				message: `unknown workspace subcommand ${JSON.stringify(subcommand)}`,
				why: "workspace takes one of three subcommands",
				next: `use one of: ${SUBCOMMANDS$1.join(", ")}`
			});
		}
	}
};
//#endregion
//#region src/cli/commands/worktree.ts
const SUBCOMMANDS = [
	"list",
	"setup",
	"cleanup"
];
async function resolveLane(ctx) {
	const run = runGit$1;
	const cwd = ctx.app.runtime.cwd;
	const outcome = await run({
		args: ["rev-parse", "--show-toplevel"],
		cwd
	});
	if (outcome.keptFromGit === true) throw new CliFailure({
		code: "VALIDATION_ERROR",
		message: `git was not started in ${cwd}: this folder, or a folder above it, has the layout of a bare repository, and every worktree verb acts on a repository git opens.`,
		why: "That layout is HEAD beside objects and refs, or beside commondir, met before any .git that git stops at. The engine looks for it before it starts git, and did not hand this folder to git.",
		next: "Look at the entries of this folder and of each folder above it by name to find that folder, and do not run git in it or in any folder under it, this one included. Move it off that path, or run the command from a checkout that does not keep it there."
	});
	if (outcome.status !== 0 && gitProgramFor(cwd, process.env) === null) throw new CliFailure({
		code: "VALIDATION_ERROR",
		message: `git did not answer in ${cwd}: the engine found no git to start, and every worktree verb acts on a repository git opens.`,
		why: "The engine takes git only from a PATH entry that is a full path to a folder other than the one git runs in, and no such entry holds a git binary.",
		next: "Install git, or put the folder that holds it on PATH by its full path, and run the command again."
	});
	if (outcome.status !== 0) throw new CliFailure({
		code: "VALIDATION_ERROR",
		message: `${cwd} is not inside a git repository, and every worktree verb acts on one.`,
		why: sanitizeLabel(outcome.stderr.trim() || outcome.stdout.trim()),
		next: "Run the command from inside a clone. A .git entry in this folder or in a folder above it, found by name, shows whether this is one."
	});
	const topLevel = resolve(outcome.stdout.trim());
	const commonDir = await resolveGitCommonDir(run, cwd);
	const repoRoot = basename(commonDir) === ".git" ? dirname(commonDir) : topLevel;
	const policy = await readWorktreePolicy(repoRoot);
	return {
		repoRoot,
		policy,
		farmDir: resolveFarmDir(policy, repoRoot),
		run
	};
}
function rerunLine(subcommand, name, opts) {
	const parts = ["stamity worktree", subcommand];
	if (name !== null) parts.push(name);
	for (const [flag, key] of [
		["--all", "all"],
		["--files-only", "filesOnly"],
		["--copy-secrets", "copySecrets"],
		["--force", "force"],
		["--json", "json"],
		["--dry-run", "dryRun"]
	]) if (opts[key] === true) parts.push(flag);
	for (const [key, positive, negative] of [[
		"useExisting",
		"--use-existing",
		"--no-use-existing"
	], [
		"track",
		"--track",
		"--no-track"
	]]) {
		if (opts[key] === true) parts.push(positive);
		if (opts[key] === false) parts.push(negative);
	}
	return parts.join(" ");
}
async function answerGate(ctx, gate, opts) {
	if (opts.flag === true) return "granted";
	if (opts.flag === false) return "declined";
	if (ctx.yes) return "granted";
	if (!gate.interactive) return "unanswered";
	if (opts.preamble !== void 0) ctx.io.out(`${opts.preamble}\n`);
	return await confirm(gate, ctx.promptIo, {
		question: opts.question,
		defaultYes: opts.defaultYes
	}) ? "granted" : "declined";
}
async function readAheadBehind(run, worktreePath) {
	const outcome = await run({
		args: [
			"rev-list",
			"--left-right",
			"--count",
			"HEAD...@{upstream}"
		],
		cwd: worktreePath
	});
	if (outcome.status !== 0) return null;
	const [ahead, behind] = outcome.stdout.trim().split(/\s+/u).map(Number);
	if (ahead === void 0 || behind === void 0 || Number.isNaN(ahead) || Number.isNaN(behind)) return null;
	return {
		ahead,
		behind
	};
}
async function countHandoffs(worktreePath) {
	try {
		return (await readdir(resolve(worktreePath, STATE_DIR, "handoffs"))).filter((entry) => !entry.startsWith(".")).length;
	} catch {
		return 0;
	}
}
async function toListRow(run, row, cwd) {
	const { entry } = row;
	const reachable = !entry.prunable;
	return {
		path: entry.path,
		current: isInside(cwd, entry.path),
		branch: entry.branch,
		detached: entry.detached,
		head: entry.head,
		dirty: reachable ? row.dirty ?? await readDirtyCounts(run, entry.path) : null,
		upstream: reachable ? await readAheadBehind(run, entry.path) : null,
		managed: row.classification === "managed",
		receiptEntries: row.receipt?.entries.length ?? null,
		setup: reachable ? await probeSetupPresence(entry.path) : null,
		handoffs: reachable ? await countHandoffs(entry.path) : null,
		locked: entry.locked,
		prunable: entry.prunable,
		reason: row.reason
	};
}
function renderDirty(row) {
	if (row.dirty === null) return "—";
	if (!isDirty(row.dirty)) return "clean";
	return `${row.dirty.modified} modified, ${row.dirty.untracked} untracked`;
}
function renderUpstream(row) {
	if (row.upstream === null) return "no upstream";
	const { ahead, behind } = row.upstream;
	if (ahead === 0 && behind === 0) return "up to date";
	return `${ahead} ahead, ${behind} behind`;
}
function renderList(ctx, farmDir, rows, stash) {
	const { palette } = ctx;
	if (stash > 0) ctx.io.out(`${palette.yellow(`${stash} stash ${stash === 1 ? "entry" : "entries"}`)} — a stash is one list for the whole clone and belongs to none of the worktrees below.\n`);
	ctx.io.out(`${palette.bold("farm")} ${sanitizeLabel(farmDir)}\n`);
	for (const row of rows) {
		const flags = [row.locked ? "locked" : null, row.prunable ? "prunable" : null].filter((flag) => flag !== null);
		const managed = row.managed && row.receiptEntries !== null ? `managed: yes (${row.receiptEntries} ${row.receiptEntries === 1 ? "entry" : "entries"})` : "managed: no";
		ctx.io.out(`${row.current ? palette.cyan("*") : " "} ${sanitizeLabel(row.path)}  ${palette.bold(sanitizeLabel(row.branch ?? "(detached)"))}  ${palette.dim(sanitizeLabel(row.head ?? "—").slice(0, 7))}${flags.length === 0 ? "" : `  ${palette.yellow(`[${flags.join(", ")}]`)}`}\n`);
		ctx.io.out(`    ${palette.dim([
			renderDirty(row),
			renderUpstream(row),
			managed,
			`setup: ${row.setup ?? "—"}`,
			`handoffs: ${row.handoffs ?? "—"}`
		].join(" · "))}\n`);
		if (row.reason !== null && !row.managed) ctx.io.out(`    ${palette.dim(sanitizeLabel(row.reason))}\n`);
	}
	if (rows.length === 0) ctx.io.out(`  ${palette.dim("no worktrees registered — run stamity worktree setup <name> to create one")}\n`);
}
async function runList(ctx, lane) {
	const inventory = await readWorktreeInventory(lane);
	const rows = [];
	for (const row of inventory.worktrees) rows.push(await toListRow(lane.run, row, ctx.app.runtime.cwd));
	renderList(ctx, lane.farmDir, rows, inventory.stash.entries);
	return {
		exitCode: 0,
		json: {
			farm: lane.farmDir,
			worktrees: rows,
			stash: inventory.stash
		}
	};
}
async function resolveSetupConsent(ctx, gate, plan, name, opts) {
	const kind = plan?.branchPlan.kind ?? null;
	const branch = plan?.branchPlan.branch ?? name;
	const secretEntries = plan?.entries.filter((entry) => entry.secret) ?? [];
	const flagOf = (key) => typeof opts[key] === "boolean" ? opts[key] : void 0;
	return {
		attach: plan === null || kind === "attach" ? await answerGate(ctx, gate, {
			flag: flagOf("useExisting"),
			question: `Attach the new worktree to the existing local branch \`${sanitizeLabel(branch)}\`?`,
			defaultYes: true
		}) : "unanswered",
		track: plan === null || kind === "track" ? await answerGate(ctx, gate, {
			flag: flagOf("track"),
			question: `Track the remote branch \`origin/${sanitizeLabel(branch)}\`?`,
			defaultYes: true
		}) : "unanswered",
		secrets: plan === null || secretEntries.length > 0 ? await answerGate(ctx, gate, {
			flag: flagOf("copySecrets"),
			...secretEntries.length === 0 ? {} : { preamble: secretPreamble(secretEntries) },
			question: secretEntries.length === 0 ? "Copy the secret entries into the new worktree?" : `Copy ${secretEntries.map((entry) => sanitizeLabel(entry.path)).join(", ")} into the new worktree?`,
			defaultYes: true
		}) : "unanswered"
	};
}
function secretPreamble(entries) {
	return `${entries.map((entry) => `${sanitizeLabel(entry.path)}${entry.reason === null ? "" : ` (${sanitizeLabel(entry.reason)})`}`).join(", ")} ${entries.length === 1 ? "holds secret material and would be" : "hold secret material and would be"} copied into the new worktree at 0600.`;
}
function renderPlan(ctx, plan, wouldAsk) {
	const { palette } = ctx;
	ctx.io.out(`${palette.bold("worktree setup")} ${sanitizeLabel(plan.name)} ${palette.yellow("(dry run — nothing was written)")}\n`);
	ctx.io.out(`  ${palette.dim(`farm: ${sanitizeLabel(plan.farmDir)}`)}\n`);
	ctx.io.out(`  ${palette.dim(`worktree: ${sanitizeLabel(plan.worktreePath)}`)}\n`);
	ctx.io.out(`  ${palette.dim(`policy: ${sanitizeLabel(plan.policySource)}`)}\n`);
	ctx.io.out(`  branch: ${palette.bold(sanitizeLabel(plan.branchPlan.branch))} — ${plan.branchPlan.kind} (${sanitizeLabel(plan.branchPlan.reason)})\n`);
	for (const gate of plan.gates) ctx.io.out(`  gate ${gate.gate}: ${gate.answer} → ${gate.effect}\n`);
	if (wouldAsk && plan.gates.some((gate) => gate.answer === "unanswered")) ctx.io.out(`  ${palette.dim("a real run from this terminal would ASK each unanswered gate; this preview does not")}\n`);
	if (plan.entries.length === 0) ctx.io.out(`  ${palette.dim("no entries to place — the checkout supplies everything")}\n`);
	for (const entry of plan.entries) ctx.io.out(`  entry ${sanitizeLabel(entry.path)}  ${entry.strategy}${entry.secret ? " (secret)" : ""}\n`);
	ctx.io.out(`${palette.dim("the remote was NOT consulted for this preview — a preview that mutates remote-tracking refs changed something")}\n`);
}
function renderSetup(ctx, result) {
	const { palette } = ctx;
	const created = result.status === "partial" ? palette.yellow("created") : palette.green("created");
	ctx.io.out(`${palette.bold("worktree")} ${sanitizeLabel(result.worktree.path)} ${created} on ${palette.bold(sanitizeLabel(result.worktree.branch))} (${result.branchPlan})\n`);
	for (const entry of result.entries) {
		const detail = entry.reason === null ? "" : ` — ${sanitizeLabel(entry.reason)}`;
		ctx.io.out(`  ${sanitizeLabel(entry.path)}  ${entry.outcome}${detail}${entry.errno === null ? "" : ` [${entry.errno}]`}\n`);
	}
	ctx.io.out(`  ${palette.dim(`setup: ${result.setup}`)}\n`);
	for (const notice of result.notices) ctx.io.out(`  ${palette.dim(sanitizeLabel(notice))}\n`);
	if (result.error !== null) {
		ctx.io.err(`${palette.yellow("partial:")} ${sanitizeLabel(result.error.message)}\n  ${palette.dim("next:")} ${sanitizeLabel(result.error.next)}\n`);
		return;
	}
	ctx.io.out(`${palette.dim(`next: cd ${sanitizeLabel(result.worktree.path)}`)}\n`);
}
async function runSetup(ctx, lane, name, opts) {
	if (name === void 0) throw new CliFailure({
		code: "USAGE",
		message: "worktree setup needs a name",
		why: "the name is both the directory under the farm and the branch the worktree checks out",
		next: "run `stamity worktree setup <name>`"
	});
	const gate = promptGate({
		stdinIsTTY: ctx.terminal.stdinIsTTY,
		yes: ctx.yes,
		json: ctx.json,
		env: ctx.app.runtime.env,
		palette: ctx.palette
	});
	const rerun = rerunLine("setup", name, opts);
	const planOptions = {
		repoRoot: lane.repoRoot,
		name,
		run: lane.run,
		policy: lane.policy,
		fetch: !ctx.dryRun
	};
	const consent = await resolveSetupConsent(ctx, ctx.dryRun ? { interactive: false } : gate, gate.interactive || ctx.dryRun ? await planWorktreeSetup(planOptions) : null, name, opts);
	if (ctx.dryRun) {
		const planned = await planWorktreeSetup({
			...planOptions,
			consent
		});
		renderPlan(ctx, planned, gate.interactive);
		return {
			exitCode: 0,
			json: {
				dryRun: true,
				name: planned.name,
				farm: planned.farmDir,
				worktree: planned.worktreePath,
				policy: planned.policySource,
				branchPlan: planned.branchPlan,
				gates: planned.gates,
				entries: planned.entries
			}
		};
	}
	const result = await runWorktreeSetup({
		...planOptions,
		consent,
		engineVersion: ctx.app.version,
		rerun
	});
	renderSetup(ctx, result);
	const payload = {
		status: result.status,
		worktree: result.worktree,
		branchPlan: result.branchPlan,
		entries: result.entries,
		notices: result.notices,
		setup: result.setup,
		receiptPath: result.receiptPath,
		...result.error === null ? {} : { error: result.error }
	};
	return result.status === "partial" ? {
		exitCode: 1,
		json: payload
	} : {
		exitCode: 0,
		json: payload
	};
}
function partialCleanupErrorDocument(result, rerun) {
	const treeFailed = result.worktrees.some((report) => report.treeFailure !== null);
	const fileFailed = result.worktrees.some((report) => report.files.some((file) => file.outcome === "failed"));
	if (treeFailed && fileFailed) return {
		message: "One or more worktrees could not be fully removed, and one or more receipt rows could not be removed.",
		next: `Fix the cause and re-run \`${rerun}\`. The worktree failures need \`git worktree remove\` to succeed on their own; the receipt rows that failed are named above and may need removing by hand.`
	};
	if (treeFailed) return {
		message: "One or more worktrees could not be fully removed.",
		next: `Fix the cause \`git worktree remove\` reported above, then re-run \`${rerun}\` — there are no remaining receipt-row files to remove by hand for this failure.`
	};
	return {
		message: "One or more receipt rows could not be removed.",
		next: `Fix the cause and re-run \`${rerun}\`, or remove the remaining files by hand — the rows above name each one.`
	};
}
function renderCleanup(ctx, result) {
	const { palette } = ctx;
	for (const report of result.worktrees) {
		const state = report.treeFailure !== null ? palette.red("failed") : report.skipped !== null ? palette.dim(`skipped (${report.classification})`) : report.removed ? palette.green("removed") : palette.yellow("files only");
		ctx.io.out(`${state} ${sanitizeLabel(report.path)}\n`);
		if (report.skipped !== null) ctx.io.out(`    ${palette.dim(sanitizeLabel(report.skipped))}\n`);
		if (report.treeFailure !== null) ctx.io.out(`    ${palette.red(sanitizeLabel(report.treeFailure))}\n`);
		for (const file of report.files) {
			const detail = file.detail === null ? "" : ` — ${sanitizeLabel(file.detail)}`;
			ctx.io.out(`    ${sanitizeLabel(file.path)}  ${file.outcome} (${file.reason})${detail}\n`);
		}
		for (const dropped of report.droppedRows) ctx.io.out(`    ${palette.yellow(`receipt row ${dropped.index} dropped`)}: ${sanitizeLabel(dropped.reason)}\n`);
		if (report.branchCommand !== null) ctx.io.out(`    ${palette.dim(`the branch is untouched: ${report.branchCommand}`)}\n`);
	}
	if (result.pruned > 0) ctx.io.out(`${palette.dim(`pruned ${result.pruned} stale registration(s)`)}\n`);
	for (const notice of result.notices) ctx.io.out(`${palette.dim(sanitizeLabel(notice))}\n`);
}
async function runCleanup(ctx, lane, name, opts) {
	const all = opts["all"] === true;
	const names = name === void 0 ? [] : [name];
	const rerun = rerunLine("cleanup", name ?? null, opts);
	if (names.length === 0 && !all) {
		let message = "cleanup needs a name, or --all to sweep every worktree this lane manages.";
		try {
			await runWorktreeCleanup({
				repoRoot: lane.repoRoot,
				farmDir: lane.farmDir,
				run: lane.run,
				names,
				all,
				cwd: ctx.app.runtime.cwd,
				rerun
			});
		} catch (error) {
			if (error instanceof EngineError) message = error.message;
		}
		throw new CliFailure({
			code: "USAGE",
			message,
			why: "cleanup inverts one worktree's receipt, and a sweep of every managed worktree is a different request",
			next: "run `stamity worktree cleanup <name>`, or `stamity worktree cleanup --all`"
		});
	}
	const cleanable = (await readWorktreeInventory(lane)).worktrees.filter((row) => row.classification === "managed" || row.classification === "managed-orphan");
	const candidates = all ? cleanable : cleanable.filter((row) => resolve(row.entry.path) === resolve(lane.farmDir, name ?? ""));
	if (!all && candidates.length === 0) throw new CliFailure({
		code: "VALIDATION_ERROR",
		message: `No worktree this lane manages is named ${JSON.stringify(name ?? "")} under ${lane.farmDir}.`,
		why: "cleanup inverts a receipt or force-removes a receipt-less orphan, and a name that matches neither is refused rather than silently doing nothing",
		next: "run `stamity worktree list` to see what is registered and which rows are managed"
	});
	const gate = promptGate({
		stdinIsTTY: ctx.terminal.stdinIsTTY,
		yes: ctx.yes,
		json: ctx.json,
		env: ctx.app.runtime.env,
		palette: ctx.palette
	});
	const dirty = candidates.filter((row) => row.dirty !== null && isDirty(row.dirty));
	const orphans = candidates.filter((row) => row.classification === "managed-orphan");
	const needsConsent = all && candidates.length > 0 || dirty.length > 0 || orphans.length > 0;
	const dirtyList = dirty.map((row) => sanitizeLabel(row.entry.path)).join(", ");
	const preamble = all ? `--all would take down ${candidates.length} worktree${candidates.length === 1 ? "" : "s"}` + (dirty.length === 0 ? "." : `, ${dirty.length} carrying uncommitted changes: ${dirtyList}.`) : orphans.length > 0 ? `${sanitizeLabel(orphans[0]?.entry.path ?? "")} carries no readable receipt, so cleanup cannot verify what it placed and would remove the whole tree.` : `${sanitizeLabel(dirty[0]?.entry.path ?? "")} carries uncommitted changes.`;
	const force = needsConsent ? await answerGate(ctx, gate, {
		flag: opts["force"] === true ? true : void 0,
		preamble,
		question: "Remove them?",
		defaultYes: false
	}) : "not-required";
	if (force === "declined") throw new CliFailure({
		code: "VALIDATION_ERROR",
		message: "worktree cleanup cancelled — nothing was removed",
		why: "the confirmation was declined",
		next: `re-run and answer y, or re-run with the decision made: ${rerun} ${all ? "-y" : "--force"}`
	});
	const result = await runWorktreeCleanup({
		repoRoot: lane.repoRoot,
		farmDir: lane.farmDir,
		run: lane.run,
		names,
		all,
		...opts["filesOnly"] === true ? { filesOnly: true } : {},
		force,
		cwd: ctx.app.runtime.cwd,
		rerun
	});
	renderCleanup(ctx, result);
	const payload = {
		status: result.status,
		worktrees: result.worktrees,
		pruned: result.pruned,
		notices: result.notices,
		stash: result.stash
	};
	if (result.status !== "partial") return {
		exitCode: 0,
		json: payload
	};
	const errorDocument = partialCleanupErrorDocument(result, rerun);
	return {
		exitCode: 1,
		json: {
			...payload,
			error: {
				code: "FS_ERROR",
				message: errorDocument.message,
				next: errorDocument.next
			}
		}
	};
}
const worktreeCommand = {
	name: "worktree",
	summary: "parallel checkouts of this repository: the inventory, guided setup, and receipt-based teardown",
	mutating: true,
	args: [{
		name: "subcommand",
		description: "list | setup | cleanup — omit for list",
		required: false
	}, {
		name: "name",
		description: "the worktree name — its directory under the farm, and the branch it checks out",
		required: false
	}],
	configure(cmd) {
		cmd.option("--use-existing", "worktree setup: attach to an existing local branch of that name");
		cmd.option("--no-use-existing", "worktree setup: refuse rather than attach to an existing local branch");
		cmd.option("--track", "worktree setup: track the remote branch of that name");
		cmd.option("--no-track", "worktree setup: create a new local branch off HEAD instead of tracking");
		cmd.option("--copy-secrets", "worktree setup: copy entries marked `secret` in the policy — without it they are skipped and the report says so");
		cmd.option("--all", "worktree cleanup: sweep every worktree this lane manages");
		cmd.option("--files-only", "worktree cleanup: invert the receipt's files and leave the checkout in place");
		cmd.option("--force", "worktree cleanup: proceed on a worktree carrying uncommitted changes");
	},
	run: async (ctx, opts, args) => {
		const [subcommand, name] = args;
		const lane = await resolveLane(ctx);
		if (subcommand === void 0) return runList(ctx, lane);
		switch (subcommand) {
			case "list": return runList(ctx, lane);
			case "setup": return runSetup(ctx, lane, name, opts);
			case "cleanup": return runCleanup(ctx, lane, name, opts);
			default: throw new CliFailure({
				code: "USAGE",
				message: `unknown worktree subcommand ${JSON.stringify(subcommand)}`,
				why: "worktree takes one of three subcommands",
				next: `use one of: ${SUBCOMMANDS.join(", ")}`
			});
		}
	}
};
//#endregion
//#region src/cli/kit/program.ts
const defaultIo = () => ({
	out: (text) => {
		process.stdout.write(text);
	},
	err: (text) => {
		process.stderr.write(text);
	}
});
function failureDocFor(err) {
	const doc = failureFromError(err);
	if (!(err instanceof EngineError)) return doc;
	return {
		...doc,
		...err.why === void 0 ? {} : { why: err.why },
		...err.next === void 0 ? {} : { next: err.next }
	};
}
function noColorRequested(argv) {
	const operands = argv.indexOf("--");
	return (operands === -1 ? argv : argv.slice(0, operands)).includes("--no-color");
}
async function runCli(argv, commands, opts = {}) {
	const env = opts.env ?? process.env;
	const io = opts.io ?? defaultIo();
	const promptIo = opts.promptIo ?? {
		input: process.stdin,
		output: process.stdout
	};
	const terminal = opts.terminal ?? detectTerminalFacts();
	const app = createApp({
		env,
		...opts.cwd !== void 0 ? { cwd: opts.cwd } : {},
		...opts.clock !== void 0 ? { clock: opts.clock } : {}
	});
	const engine = createEngine();
	const noColorFlag = noColorRequested(argv);
	const program = new Command();
	program.name("stamity").description("Generates agentic coding setups from a single canonical source.").version(app.version, "-v, --version", "print the version and exit").helpOption("-h, --help", "print usage and exit").option("--no-color", "disable colored output").exitOverride().configureOutput({
		writeOut: (s) => io.out(s),
		writeErr: (s) => io.err(s),
		getOutHasColors: () => resolveColorEnabled({
			noColorFlag,
			env,
			stdoutIsTTY: terminal.stdoutIsTTY
		}),
		getErrHasColors: () => resolveColorEnabled({
			noColorFlag,
			env,
			stdoutIsTTY: terminal.stderrIsTTY
		})
	});
	program.addHelpText("beforeAll", (context) => {
		if (context.command !== program || context.error) return "";
		return bannerBlock({
			stdoutIsTTY: terminal.stdoutIsTTY,
			machineReadable: argv.includes("--json"),
			env,
			noColorFlag,
			...terminal.stdoutColumns === void 0 ? {} : { columns: terminal.stdoutColumns }
		});
	});
	let commandExit = 0;
	for (const module of commands) {
		const cmd = program.command(module.name, { hidden: module.hidden === true }).description(module.summary).option("--json", "machine-readable JSON output (non-interactive)").option("-y, --yes", "take the non-interactive path: every prompt resolves to its default, and a destructive confirmation proceeds instead of declining");
		if (module.mutating) cmd.option("--dry-run", "preview changes without writing");
		for (const arg of module.args ?? []) cmd.argument(arg.required ? `<${arg.name}>` : `[${arg.name}]`, arg.description);
		module.configure?.(cmd);
		cmd.action(async () => {
			const local = cmd.opts();
			const json = local["json"] === true;
			const yes = local["yes"] === true;
			const dryRun = local["dryRun"] === true;
			const colorEnabled = resolveColorEnabled({
				noColorFlag: noColorFlag || program.opts().color === false,
				env,
				stdoutIsTTY: terminal.stdoutIsTTY
			});
			const palette = makePalette(colorEnabled, resolveAccentDepth({
				colorEnabled,
				env
			}));
			const rawOut = io.out.bind(io);
			const commandIo = {
				out: json ? () => {} : rawOut,
				err: io.err.bind(io)
			};
			const spinner = makeSpinner({
				enabled: terminal.stdoutIsTTY && !json,
				write: commandIo.out
			});
			const ctx = {
				app,
				engine,
				io: commandIo,
				promptIo,
				terminal,
				palette,
				colorEnabled,
				spinner,
				json,
				yes,
				dryRun
			};
			const positional = cmd.processedArgs.filter((value) => typeof value === "string");
			try {
				const result = await module.run(ctx, local, positional);
				commandExit = result.exitCode;
				if (json) {
					const doc = result.exitCode === 0 ? successEnvelope(module.name, app.version, result.json ?? {}) : {
						...result.json,
						ok: false,
						command: module.name,
						version: app.version
					};
					rawOut(`${JSON.stringify(doc)}\n`);
				}
			} catch (err) {
				spinner.stop();
				if (err instanceof EngineError && err.exitCode === 0) {
					if (json) rawOut(`${JSON.stringify(successEnvelope(module.name, app.version, {
						cancelled: true,
						reason: err.message
					}))}\n`);
					else io.err(`${err.message}\n`);
					commandExit = 0;
					return;
				}
				const failure = failureDocFor(err);
				if (json) rawOut(`${JSON.stringify(failureEnvelope(module.name, app.version, failure))}\n`);
				else io.err(`${renderFailureHuman(failure, palette)}\n`);
				commandExit = 1;
			}
		});
	}
	try {
		await program.parseAsync([...argv], { from: "user" });
		return commandExit;
	} catch (err) {
		if (err instanceof CommanderError) {
			if (err.exitCode === 0) return 0;
			const known = new Set(commands.map((command) => command.name));
			const sub = argv.find((token) => known.has(token));
			io.err(`run stamity ${sub === void 0 ? "" : `${sub} `}--help for usage\n`);
			return 2;
		}
		io.err(`${renderFailureHuman(failureDocFor(err), makePalette(false))}\n`);
		return 1;
	} finally {
		closePrompts(promptIo);
	}
}
const CACHE_FILE_NAME = "update-check.json";
const CACHE_NAMESPACE = (".stamity".startsWith("."), STATE_DIR.slice(1));
function noticeOptionsFromFacts(facts, env, cacheDir) {
	return {
		packageName: facts.name,
		currentVersion: facts.version,
		isPrivate: facts.isPrivate,
		env,
		cacheDir,
		...facts.registry === null ? {} : {
			registryBaseUrl: facts.registry,
			packageRegistry: facts.registry
		}
	};
}
async function checkForUpdateNotice(opts) {
	try {
		if (isOptedOut(opts.env)) return null;
		if (opts.isPrivate) return null;
		const ttlMs = opts.ttlMs ?? 864e5;
		const now = opts.now?.() ?? /* @__PURE__ */ new Date();
		const cachePath = join(opts.cacheDir, CACHE_FILE_NAME);
		const cached = await readCache(cachePath);
		if (cached !== null && isFresh(cached.checkedAt, now, ttlMs)) return buildBanner(opts, cached.latest);
		const latest = await probeRegistry(opts);
		const banner = buildBanner(opts, latest);
		await writeCache(cachePath, {
			checkedAt: now.toISOString(),
			latest
		});
		return banner;
	} catch {
		return null;
	}
}
function noticeCacheDir(env, homeDir) {
	const xdg = env.XDG_CACHE_HOME;
	const base = xdg !== void 0 && xdg !== "" ? xdg : join(homeDir, ".cache");
	return join(base, CACHE_NAMESPACE);
}
function isOptedOut(env) {
	if (env.STAMITY_NO_UPDATE_CHECK === "1") return true;
	if ((env.NO_UPDATE_NOTIFIER ?? "") !== "") return true;
	return (env.CI ?? "") !== "";
}
function isFresh(checkedAt, now, ttlMs) {
	return now.getTime() - Date.parse(checkedAt) < ttlMs;
}
async function readCache(cachePath) {
	try {
		const parsed = JSON.parse(await readFile(cachePath, "utf8"));
		if (typeof parsed !== "object" || parsed === null) return null;
		const { checkedAt, latest } = parsed;
		if (typeof checkedAt !== "string") return null;
		return {
			checkedAt,
			latest: typeof latest === "string" ? latest : null
		};
	} catch {
		return null;
	}
}
async function writeCache(cachePath, stamp) {
	try {
		await mkdir(dirname(cachePath), { recursive: true });
		await writeFile(cachePath, `${JSON.stringify(stamp)}\n`, "utf8");
	} catch {}
}
async function probeRegistry(opts) {
	const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
	const url = `${(opts.registryBaseUrl ?? "https://registry.npmjs.org").replace(/\/+$/, "")}/${encodeURIComponent(opts.packageName)}/latest`;
	try {
		const response = await fetchImpl(url, {
			signal: AbortSignal.timeout(opts.timeoutMs ?? 1500),
			headers: { accept: "application/json" }
		});
		if (!response.ok) return null;
		const body = await response.json();
		if (typeof body !== "object" || body === null) return null;
		const { version } = body;
		return typeof version === "string" ? version : null;
	} catch {
		return null;
	}
}
function buildBanner(opts, latest) {
	if (latest === null) return null;
	const target = semver.valid(latest);
	if (target === null || semver.valid(opts.currentVersion) === null) return null;
	if (!semver.gt(target, opts.currentVersion)) return null;
	const callOpts = opts.packageRegistry === void 0 ? {} : { registry: opts.packageRegistry };
	return `Update available: ${opts.currentVersion} -> ${target}. To move: ${pinnedCliCall(opts.packageName, target, "sync", callOpts)}. To stay on ${opts.currentVersion}, do nothing.`;
}
//#endregion
//#region src/cli.ts
const COMMANDS = [
	initCommand,
	syncCommand,
	checkCommand,
	validateCommand,
	addCommand,
	configCommand,
	workspaceCommand,
	worktreeCommand,
	pluginCommand,
	cleanCommand,
	learnCommand,
	handoffCommand,
	ledgerCommand,
	gateCommand
];
function assertUniqueCommandNames(commands) {
	const seen = /* @__PURE__ */ new Set();
	for (const command of commands) {
		if (seen.has(command.name)) throw new Error(`duplicate command registration: "${command.name}" — every COMMANDS entry must have a unique name`);
		seen.add(command.name);
	}
}
assertUniqueCommandNames(COMMANDS);
function isMain() {
	const argv1 = process.argv[1];
	if (argv1 === void 0) return false;
	if (pathToFileURL(argv1).href === import.meta.url) return true;
	try {
		return pathToFileURL(realpathSync(argv1)).href === import.meta.url;
	} catch {
		return false;
	}
}
async function main() {
	const notice = checkForUpdateNotice(noticeOptionsFromFacts(resolveOwnPackageFacts(), process.env, noticeCacheDir(process.env, homedir())));
	const argv = process.argv.slice(2);
	const code = await runCli(argv.length === 0 ? ["--help"] : argv, COMMANDS);
	const banner = await Promise.race([notice, Promise.resolve(null)]);
	if (banner !== null && process.stderr.isTTY) process.stderr.write(`\n${banner}\n`);
	process.exitCode = code;
}
if (isMain()) await main();
//#endregion
export { COMMANDS, assertUniqueCommandNames };
