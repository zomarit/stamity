import { constants, existsSync, lstatSync, readFileSync, statSync } from "node:fs";
import { cpus, homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { chmod, copyFile, lstat, mkdir, open, readFile, readdir, readlink, realpath, rename, rm, rmdir, stat, symlink, unlink, writeFile } from "node:fs/promises";
import path, { basename, dirname, extname, isAbsolute, join, normalize, posix, relative, resolve, sep } from "node:path";
import pLimit from "p-limit";
import { parse, stringify } from "yaml";
import { createHash, createHmac, randomBytes } from "node:crypto";
import semver from "semver";
import { lock } from "proper-lockfile";
import { execFileSync, spawn } from "node:child_process";
import { setTimeout as setTimeout$1 } from "node:timers/promises";
//#region \0rolldown/runtime.js
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
//#endregion
//#region src/types/errors.ts
const FAILURE_EXIT_CODE = 1;
var EngineError = class extends Error {
	code;
	exitCode;
	constructor(message, opts) {
		super(message, opts.cause === void 0 ? void 0 : { cause: opts.cause });
		this.code = opts.code;
		this.exitCode = opts.exitCode ?? FAILURE_EXIT_CODE;
		if (opts.why !== void 0) this.why = opts.why;
		if (opts.next !== void 0) this.next = opts.next;
		this.name = "EngineError";
	}
};
//#endregion
//#region src/shared/paths.ts
function hasPackageJson(dir) {
	try {
		return statSync(join(dir, "package.json"), { throwIfNoEntry: false })?.isFile() === true;
	} catch {
		return false;
	}
}
function findPackageRoot(startDir) {
	const start = resolve(startDir);
	let dir = start;
	for (;;) {
		if (hasPackageJson(dir)) return dir;
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	throw new EngineError(`No package.json found in ${start} or any parent directory. Run inside an installed package, or pass a directory below one.`, { code: "FS_ERROR" });
}
//#endregion
//#region src/pack/catalogPins.ts
var catalogPins_exports = /* @__PURE__ */ __exportAll({ CATALOG_PINS: () => CATALOG_PINS });
const CATALOG_PINS = {
	"ops": "90f6a36e3c9684069831071fa252d0603dc7dacbb0f60c9ff4a148f5881fb1ae",
	"product-audit": "42367889d11d31dfc8fd1e585ee8cc9e61f427ae294bdd9622b326aa40edce9d",
	"scaffold": "85016f7438a0fee7502593879155558a6514f425382d835d438701d9fddd6eba"
};
//#endregion
//#region src/pack/curated.ts
var curated_exports = /* @__PURE__ */ __exportAll({
	CURATED_PACKS: () => CURATED_PACKS,
	lookupCatalogEntry: () => lookupCatalogEntry,
	resolveBundledPackRoot: () => resolveBundledPackRoot,
	validateCatalogFormat: () => validateCatalogFormat
});
const CATALOG_ID_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const BUNDLED_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const SHA256_HEX_PATTERN$1 = /^[0-9a-f]{64}$/;
const CATALOG_GRANTABLE_TIERS = /* @__PURE__ */ new Set(["scanned", "curator-verified"]);
function validateCatalogFormat(entries, pins) {
	const problems = [];
	const seen = /* @__PURE__ */ new Set();
	for (const entry of entries) {
		const label = `entry ${JSON.stringify(entry.id)}`;
		if (!CATALOG_ID_PATTERN.test(entry.id)) problems.push(`${label}: id must be a lower-case package name (optionally @scope/name)`);
		if (seen.has(entry.id)) problems.push(`duplicate catalog id ${JSON.stringify(entry.id)}`);
		seen.add(entry.id);
		if (entry.description.trim() === "") problems.push(`${label}: description must not be empty`);
		if (entry.disclaimer.trim() === "") problems.push(`${label}: disclaimer must state the entry's audit status`);
		if (!CATALOG_GRANTABLE_TIERS.has(entry.pin.tier)) problems.push(`${label}: pin tier "${entry.pin.tier}" is not catalog-grantable (${[...CATALOG_GRANTABLE_TIERS].join(", ")})`);
		if (!SHA256_HEX_PATTERN$1.test(entry.pin.sha256)) problems.push(`${label}: pin sha256 must be a 64-character lower-case hex digest — run node scripts/generate-pack-manifests.mjs`);
		if (entry.source.kind === "bundled") {
			if (!BUNDLED_ID_PATTERN.test(entry.id)) problems.push(`${label}: a bundled id must be a plain directory name (no scope, no slash)`);
			const pinned = pins[entry.id];
			if (pinned === void 0) problems.push(`${label}: no pin in catalogPins.ts — run node scripts/generate-pack-manifests.mjs`);
			else if (pinned !== entry.pin.sha256) problems.push(`${label}: pin ${entry.pin.sha256.slice(0, 12)}… disagrees with catalogPins.ts ${pinned.slice(0, 12)}… — run node scripts/generate-pack-manifests.mjs`);
		} else if (!CATALOG_ID_PATTERN.test(entry.source.package)) problems.push(`${label}: npm source package must be a lower-case package name`);
	}
	for (const id of Object.keys(pins)) if (!entries.some((entry) => entry.source.kind === "bundled" && entry.id === id)) problems.push(`pin ${JSON.stringify(id)} has no catalog entry`);
	if (problems.length > 0) throw new EngineError(`Curated catalog failed its format self-check:\n${problems.map((p) => `  - ${p}`).join("\n")}`, { code: "CONFIG_ERROR" });
	return Object.freeze(entries.map((entry) => Object.freeze({ ...entry })));
}
const FIRST_PARTY_DISCLAIMER = "First-party pack: authored, reviewed and pinned in this package at tier curator-verified.";
function firstParty(id, description) {
	return {
		id,
		description,
		source: { kind: "bundled" },
		pin: {
			sha256: CATALOG_PINS[id] ?? "",
			tier: "curator-verified"
		},
		notAudited: false,
		disclaimer: FIRST_PARTY_DISCLAIMER
	};
}
const CURATED_PACKS = validateCatalogFormat([
	firstParty("ops", "Operate in production — cut releases fail-closed, run incidents to blameless post-mortems."),
	firstParty("product-audit", "Point-in-time whole-product assessment — proposes an epic set and writes a report; assesses, never modifies."),
	firstParty("scaffold", "Greenfield generators built to the repo's quality floor — the implementer writes, a specialist lens gates, and a failed gate buys exactly one regeneration.")
], CATALOG_PINS);
function lookupCatalogEntry(idOrName) {
	return CURATED_PACKS.find((entry) => entry.id === idOrName) ?? CURATED_PACKS.find((entry) => entry.source.kind === "npm" && entry.source.package === idOrName);
}
function isDirectory$3(path) {
	try {
		return statSync(path, { throwIfNoEntry: false })?.isDirectory() === true;
	} catch {
		return false;
	}
}
function resolveBundledPackRoot(id) {
	if (!BUNDLED_ID_PATTERN.test(id)) throw new EngineError(`Invalid bundled pack id ${JSON.stringify(id)}: expected a plain lower-case directory name.`, { code: "VALIDATION_ERROR" });
	const packageRoot = findPackageRoot(dirname(fileURLToPath(import.meta.url)));
	const probed = [join(packageRoot, "packs", id), join(packageRoot, "dist", "packs", id)];
	const found = probed.find(isDirectory$3);
	if (found === void 0) throw new EngineError(`Bundled pack "${id}" not found under ${packageRoot}. Probed ${probed.join(" and ")}. Reinstall the package, or run the build in a source checkout to stage packs under dist/packs/.`, { code: "CONFIG_ERROR" });
	return found;
}
//#endregion
//#region src/types/manifest.ts
const MANIFEST_FILE = "manifest.json";
const MANIFEST_VERSION = "1.0.0";
const PACK_OWNER_PREFIX = "pack:";
function packOwner(packId) {
	return `${PACK_OWNER_PREFIX}${packId}`;
}
function isPackOwner(owner) {
	return owner.startsWith(PACK_OWNER_PREFIX);
}
const RULE_DELIVERIES = ["always-on", "on-demand"];
const RULE_DELIVERY_DEFAULT = "on-demand";
const INSTALL_MODES = ["generated", "plugin-backed"];
const INSTALL_MODE_DEFAULT = "generated";
const PLUGIN_OWNED_CLASSES = Object.keys({
	agent: true,
	skill: true,
	command: true,
	rule: true,
	hooks: true
});
//#endregion
//#region src/types/markers.ts
const HTML_MARKERS = {
	start: "<!-- STAMITY:BEGIN -->",
	end: "<!-- STAMITY:END -->"
};
const HASH_MARKERS = {
	start: "# STAMITY:BEGIN",
	end: "# STAMITY:END"
};
const SLASH_MARKERS = {
	start: "// STAMITY:BEGIN",
	end: "// STAMITY:END"
};
const MANAGED_BLOCK_VARIANTS = [
	HTML_MARKERS,
	HASH_MARKERS,
	SLASH_MARKERS
];
const HASH_EXTENSIONS = [
	".yml",
	".yaml",
	".toml"
];
const SLASH_EXTENSIONS = [
	".js",
	".mjs",
	".ts",
	".jsonc"
];
const COMMENTLESS_EXTENSIONS = [".json"];
function canHostManagedBlock(filePath) {
	const lower = filePath.toLowerCase();
	return !COMMENTLESS_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
function getMarkersForPath(filePath) {
	if (filePath) {
		const lower = filePath.toLowerCase();
		if (HASH_EXTENSIONS.some((ext) => lower.endsWith(ext))) return HASH_MARKERS;
		if (SLASH_EXTENSIONS.some((ext) => lower.endsWith(ext))) return SLASH_MARKERS;
	}
	return HTML_MARKERS;
}
function stampMarkerVersion(startMarker, version) {
	if (startMarker.endsWith("-->")) return `${startMarker.slice(0, -3).trimEnd()} v${version} -->`;
	return `${startMarker.trimEnd()} v${version}`;
}
const STAMP_TOKEN_PATTERN = /STAMITY:BEGIN[ \t]+(\S+)/;
function parseMarkerVersion(line) {
	const token = STAMP_TOKEN_PATTERN.exec(line)?.[1];
	if (token === void 0) return null;
	const bare = token.endsWith("-->") ? token.slice(0, -3) : token;
	if (bare === "") return null;
	return bare.startsWith("v") && bare.length > 1 ? bare.slice(1) : bare;
}
const STATE_DIR = ".stamity";
const GENERATED_DIR = `${STATE_DIR}/generated`;
const HOOKS_GENERATED_DIR = `${GENERATED_DIR}/hooks`;
const CONTENT_PREFIX = "stamity-";
const INVOCABLE_CONTENT_PREFIX = "st-";
const ENGINE_CONTENT_PREFIXES = [CONTENT_PREFIX, "st-"];
function contentPrefixFor(artifact) {
	return artifact.type === "command" || artifact.type === "skill" ? "st-" : CONTENT_PREFIX;
}
function carriesEngineContentPrefix(name) {
	return ENGINE_CONTENT_PREFIXES.some((prefix) => name.startsWith(prefix));
}
function stripEngineContentPrefix(name) {
	const prefix = ENGINE_CONTENT_PREFIXES.find((candidate) => name.startsWith(candidate));
	return prefix === void 0 ? name : name.slice(prefix.length);
}
//#endregion
//#region src/config/parse.ts
var parse_exports = /* @__PURE__ */ __exportAll({
	isPlainObject: () => isPlainObject$2,
	parseJsonStrict: () => parseJsonStrict,
	parseYamlStrict: () => parseYamlStrict,
	readEnvBool: () => readEnvBool,
	readEnvInt: () => readEnvInt,
	rejectUnknownFields: () => rejectUnknownFields,
	requireBoolean: () => requireBoolean,
	requireEnum: () => requireEnum,
	requireString: () => requireString,
	requireStringArray: () => requireStringArray,
	unknownFields: () => unknownFields
});
function describeValue$3(value) {
	if (value === null) return "null";
	if (value === void 0) return "undefined";
	if (Array.isArray(value)) return "an array";
	if (typeof value === "string") return `string ${JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value)}`;
	if (typeof value === "object") return "an object";
	if (typeof value === "function") return "a function";
	return `${typeof value} ${String(value)}`;
}
function firstLine(cause) {
	const message = cause instanceof Error ? cause.message : String(cause);
	return message.split("\n")[0] ?? message;
}
function isPlainObject$2(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function requireDocumentRoot(parsed, format, source) {
	if (isPlainObject$2(parsed)) return parsed;
	throw new EngineError(`Malformed ${format} in ${source}: expected an object at the document root, got ${describeValue$3(parsed)}.`, { code: "CONFIG_ERROR" });
}
function parseJsonStrict(raw, source) {
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch (cause) {
		throw new EngineError(`Malformed JSON in ${source}: ${firstLine(cause)}. Fix the JSON syntax and re-run.`, {
			code: "CONFIG_ERROR",
			cause
		});
	}
	return requireDocumentRoot(parsed, "JSON", source);
}
function parseYamlStrict(raw, source) {
	let parsed;
	try {
		parsed = parse(raw, { merge: true });
	} catch (cause) {
		throw new EngineError(`Malformed YAML in ${source}: ${firstLine(cause)}. Fix the YAML syntax and re-run.`, {
			code: "CONFIG_ERROR",
			cause
		});
	}
	if (parsed === null) return {};
	return requireDocumentRoot(parsed, "YAML", source);
}
function requireField$1(obj, field, opts, expected, guard) {
	const value = Object.hasOwn(obj, field) ? obj[field] : void 0;
	if (value === void 0) {
		if (opts.optional === true) return void 0;
		throw new EngineError(`${opts.source}: \`${field}\` is required (${expected}).`, { code: "VALIDATION_ERROR" });
	}
	if (guard(value)) return value;
	throw new EngineError(`${opts.source}: \`${field}\` must be ${expected} (got ${describeValue$3(value)}).`, { code: "VALIDATION_ERROR" });
}
function requireString(obj, field, opts) {
	return requireField$1(obj, field, opts, "a string", (value) => typeof value === "string");
}
function requireBoolean(obj, field, opts) {
	return requireField$1(obj, field, opts, "a boolean", (value) => typeof value === "boolean");
}
function requireStringArray(obj, field, opts) {
	return requireField$1(obj, field, opts, "an array of strings", (value) => Array.isArray(value) && value.every((entry) => typeof entry === "string"));
}
function requireEnum(obj, field, allowed, opts) {
	return requireField$1(obj, field, opts, `one of ${allowed.map((entry) => JSON.stringify(entry)).join(" | ")}`, (value) => typeof value === "string" && allowed.includes(value));
}
function unknownFields(obj, known) {
	const allowed = new Set(known);
	return Object.keys(obj).filter((key) => !allowed.has(key)).toSorted();
}
function rejectUnknownFields(obj, known, source) {
	const unknown = unknownFields(obj, known);
	if (unknown.length === 0) return;
	throw new EngineError(`${source}: unknown field(s) ${unknown.map((key) => JSON.stringify(key)).join(", ")}. Allowed: ${known.toSorted().map((key) => JSON.stringify(key)).join(", ")}.`, { code: "VALIDATION_ERROR" });
}
function readEnvInt(name, env = process.env) {
	const raw = env[name]?.trim();
	if (raw === void 0 || raw === "") return void 0;
	const parsed = Number(raw);
	if (!Number.isFinite(parsed)) return void 0;
	return Math.trunc(parsed);
}
const TRUE_TOKENS = /* @__PURE__ */ new Set([
	"1",
	"true",
	"yes",
	"on"
]);
const FALSE_TOKENS = /* @__PURE__ */ new Set([
	"0",
	"false",
	"no",
	"off"
]);
function readEnvBool(name, env = process.env) {
	const raw = env[name]?.trim().toLowerCase();
	if (raw === void 0) return void 0;
	if (TRUE_TOKENS.has(raw)) return true;
	if (FALSE_TOKENS.has(raw)) return false;
}
//#endregion
//#region src/types/content.ts
const CONTENT_CLASSES = [
	"agent",
	"skill",
	"rule",
	"command"
];
function outputOwners(output) {
	const owners = [];
	const seen = /* @__PURE__ */ new Set();
	for (const owner of [output.owner, ...output.coOwners ?? []]) {
		if (seen.has(owner.adapter)) continue;
		seen.add(owner.adapter);
		owners.push({
			adapter: owner.adapter,
			artifactId: owner.artifactId,
			artifactType: owner.artifactType
		});
	}
	return owners;
}
//#endregion
//#region src/denyscan/denyScan.ts
var denyScan_exports = /* @__PURE__ */ __exportAll({
	ANTI_SLOP_WORDLIST: () => ANTI_SLOP_WORDLIST,
	CONTENT_DENY_PATTERNS: () => CONTENT_DENY_PATTERNS,
	INJECTION_PATTERNS: () => INJECTION_PATTERNS,
	INVISIBLE_SMUGGLING_CHARS: () => INVISIBLE_SMUGGLING_CHARS,
	LEARNINGS_INJECTION_PATTERNS: () => LEARNINGS_INJECTION_PATTERNS,
	MCP_POISONING_PATTERNS: () => MCP_POISONING_PATTERNS,
	NO_HONEST_SHAPE_INJECTION_ROWS: () => NO_HONEST_SHAPE_INJECTION_ROWS,
	byIndexThenId: () => byIndexThenId,
	foldConfusables: () => foldConfusables,
	joinMaskedWords: () => joinMaskedWords,
	normalizeForDenyScan: () => normalizeForDenyScan,
	sanitizeContent: () => sanitizeContent,
	scanAntiSlop: () => scanAntiSlop,
	scanForDeniedPatterns: () => scanForDeniedPatterns,
	scanNormalized: () => scanNormalized
});
const DEFAULT_IGNORABLE_RANGES = [
	[173, 173],
	[847, 847],
	[1564, 1564],
	[4447, 4448],
	[6068, 6069],
	[6155, 6159],
	[8203, 8207],
	[8234, 8238],
	[8288, 8303],
	[12644, 12644],
	[65024, 65039],
	[65279, 65279],
	[65440, 65440],
	[65520, 65528],
	[113824, 113827],
	[119155, 119162],
	[917504, 921599]
];
const FORMAT_ONLY_RANGES = [
	[1536, 1541],
	[1757, 1757],
	[1807, 1807],
	[2192, 2193],
	[2274, 2274],
	[65529, 65531],
	[69821, 69821],
	[69837, 69837],
	[78896, 78911]
];
const NONSPACING_MARK_RANGES = [
	[768, 879],
	[1155, 1159],
	[1425, 1469],
	[1471, 1471],
	[1473, 1474],
	[1476, 1477],
	[1479, 1479],
	[1552, 1562],
	[1611, 1631],
	[1648, 1648],
	[1750, 1756],
	[1759, 1764],
	[1767, 1768],
	[1770, 1773],
	[1809, 1809],
	[1840, 1866],
	[1958, 1968],
	[2027, 2035],
	[2045, 2045],
	[2070, 2073],
	[2075, 2083],
	[2085, 2087],
	[2089, 2093],
	[2137, 2139],
	[2199, 2207],
	[2250, 2273],
	[2275, 2306],
	[2362, 2362],
	[2364, 2364],
	[2369, 2376],
	[2381, 2381],
	[2385, 2391],
	[2402, 2403],
	[2433, 2433],
	[2492, 2492],
	[2497, 2500],
	[2509, 2509],
	[2530, 2531],
	[2558, 2558],
	[2561, 2562],
	[2620, 2620],
	[2625, 2626],
	[2631, 2632],
	[2635, 2637],
	[2641, 2641],
	[2672, 2673],
	[2677, 2677],
	[2689, 2690],
	[2748, 2748],
	[2753, 2757],
	[2759, 2760],
	[2765, 2765],
	[2786, 2787],
	[2810, 2815],
	[2817, 2817],
	[2876, 2876],
	[2879, 2879],
	[2881, 2884],
	[2893, 2893],
	[2901, 2902],
	[2914, 2915],
	[2946, 2946],
	[3008, 3008],
	[3021, 3021],
	[3072, 3072],
	[3076, 3076],
	[3132, 3132],
	[3134, 3136],
	[3142, 3144],
	[3146, 3149],
	[3157, 3158],
	[3170, 3171],
	[3201, 3201],
	[3260, 3260],
	[3263, 3263],
	[3270, 3270],
	[3276, 3277],
	[3298, 3299],
	[3328, 3329],
	[3387, 3388],
	[3393, 3396],
	[3405, 3405],
	[3426, 3427],
	[3457, 3457],
	[3530, 3530],
	[3538, 3540],
	[3542, 3542],
	[3633, 3633],
	[3636, 3642],
	[3655, 3662],
	[3761, 3761],
	[3764, 3772],
	[3784, 3790],
	[3864, 3865],
	[3893, 3893],
	[3895, 3895],
	[3897, 3897],
	[3953, 3966],
	[3968, 3972],
	[3974, 3975],
	[3981, 3991],
	[3993, 4028],
	[4038, 4038],
	[4141, 4144],
	[4146, 4151],
	[4153, 4154],
	[4157, 4158],
	[4184, 4185],
	[4190, 4192],
	[4209, 4212],
	[4226, 4226],
	[4229, 4230],
	[4237, 4237],
	[4253, 4253],
	[4957, 4959],
	[5906, 5908],
	[5938, 5939],
	[5970, 5971],
	[6002, 6003],
	[6068, 6069],
	[6071, 6077],
	[6086, 6086],
	[6089, 6099],
	[6109, 6109],
	[6155, 6157],
	[6159, 6159],
	[6277, 6278],
	[6313, 6313],
	[6432, 6434],
	[6439, 6440],
	[6450, 6450],
	[6457, 6459],
	[6679, 6680],
	[6683, 6683],
	[6742, 6742],
	[6744, 6750],
	[6752, 6752],
	[6754, 6754],
	[6757, 6764],
	[6771, 6780],
	[6783, 6783],
	[6832, 6845],
	[6847, 6877],
	[6880, 6891],
	[6912, 6915],
	[6964, 6964],
	[6966, 6970],
	[6972, 6972],
	[6978, 6978],
	[7019, 7027],
	[7040, 7041],
	[7074, 7077],
	[7080, 7081],
	[7083, 7085],
	[7142, 7142],
	[7144, 7145],
	[7149, 7149],
	[7151, 7153],
	[7212, 7219],
	[7222, 7223],
	[7376, 7378],
	[7380, 7392],
	[7394, 7400],
	[7405, 7405],
	[7412, 7412],
	[7416, 7417],
	[7616, 7679],
	[8400, 8412],
	[8417, 8417],
	[8421, 8432],
	[11503, 11505],
	[11647, 11647],
	[11744, 11775],
	[12330, 12333],
	[12441, 12442],
	[42607, 42607],
	[42612, 42621],
	[42654, 42655],
	[42736, 42737],
	[43010, 43010],
	[43014, 43014],
	[43019, 43019],
	[43045, 43046],
	[43052, 43052],
	[43204, 43205],
	[43232, 43249],
	[43263, 43263],
	[43302, 43309],
	[43335, 43345],
	[43392, 43394],
	[43443, 43443],
	[43446, 43449],
	[43452, 43453],
	[43493, 43493],
	[43561, 43566],
	[43569, 43570],
	[43573, 43574],
	[43587, 43587],
	[43596, 43596],
	[43644, 43644],
	[43696, 43696],
	[43698, 43700],
	[43703, 43704],
	[43710, 43711],
	[43713, 43713],
	[43756, 43757],
	[43766, 43766],
	[44005, 44005],
	[44008, 44008],
	[44013, 44013],
	[64286, 64286],
	[65024, 65039],
	[65056, 65071],
	[66045, 66045],
	[66272, 66272],
	[66422, 66426],
	[68097, 68099],
	[68101, 68102],
	[68108, 68111],
	[68152, 68154],
	[68159, 68159],
	[68325, 68326],
	[68900, 68903],
	[68969, 68973],
	[69291, 69292],
	[69370, 69375],
	[69446, 69456],
	[69506, 69509],
	[69633, 69633],
	[69688, 69702],
	[69744, 69744],
	[69747, 69748],
	[69759, 69761],
	[69811, 69814],
	[69817, 69818],
	[69826, 69826],
	[69888, 69890],
	[69927, 69931],
	[69933, 69940],
	[70003, 70003],
	[70016, 70017],
	[70070, 70078],
	[70089, 70092],
	[70095, 70095],
	[70191, 70193],
	[70196, 70196],
	[70198, 70199],
	[70206, 70206],
	[70209, 70209],
	[70367, 70367],
	[70371, 70378],
	[70400, 70401],
	[70459, 70460],
	[70464, 70464],
	[70502, 70508],
	[70512, 70516],
	[70587, 70592],
	[70606, 70606],
	[70608, 70608],
	[70610, 70610],
	[70625, 70626],
	[70712, 70719],
	[70722, 70724],
	[70726, 70726],
	[70750, 70750],
	[70835, 70840],
	[70842, 70842],
	[70847, 70848],
	[70850, 70851],
	[71090, 71093],
	[71100, 71101],
	[71103, 71104],
	[71132, 71133],
	[71219, 71226],
	[71229, 71229],
	[71231, 71232],
	[71339, 71339],
	[71341, 71341],
	[71344, 71349],
	[71351, 71351],
	[71453, 71453],
	[71455, 71455],
	[71458, 71461],
	[71463, 71467],
	[71727, 71735],
	[71737, 71738],
	[71995, 71996],
	[71998, 71998],
	[72003, 72003],
	[72148, 72151],
	[72154, 72155],
	[72160, 72160],
	[72193, 72202],
	[72243, 72248],
	[72251, 72254],
	[72263, 72263],
	[72273, 72278],
	[72281, 72283],
	[72330, 72342],
	[72344, 72345],
	[72544, 72544],
	[72546, 72548],
	[72550, 72550],
	[72752, 72758],
	[72760, 72765],
	[72767, 72767],
	[72850, 72871],
	[72874, 72880],
	[72882, 72883],
	[72885, 72886],
	[73009, 73014],
	[73018, 73018],
	[73020, 73021],
	[73023, 73029],
	[73031, 73031],
	[73104, 73105],
	[73109, 73109],
	[73111, 73111],
	[73459, 73460],
	[73472, 73473],
	[73526, 73530],
	[73536, 73536],
	[73538, 73538],
	[73562, 73562],
	[78912, 78912],
	[78919, 78933],
	[90398, 90409],
	[90413, 90415],
	[92912, 92916],
	[92976, 92982],
	[94031, 94031],
	[94095, 94098],
	[94180, 94180],
	[113821, 113822],
	[118528, 118573],
	[118576, 118598],
	[119143, 119145],
	[119163, 119170],
	[119173, 119179],
	[119210, 119213],
	[119362, 119364],
	[121344, 121398],
	[121403, 121452],
	[121461, 121461],
	[121476, 121476],
	[121499, 121503],
	[121505, 121519],
	[122880, 122886],
	[122888, 122904],
	[122907, 122913],
	[122915, 122916],
	[122918, 122922],
	[123023, 123023],
	[123184, 123190],
	[123566, 123566],
	[123628, 123631],
	[124140, 124143],
	[124398, 124399],
	[124643, 124643],
	[124646, 124646],
	[124654, 124655],
	[124661, 124661],
	[125136, 125142],
	[125252, 125258],
	[917760, 917999]
];
const TAG_BLOCK = [917504, 917631];
function mergeRanges(ranges) {
	const merged = [];
	for (const [first, last] of [...ranges].toSorted((a, b) => a[0] - b[0])) {
		const previous = merged.at(-1);
		if (previous !== void 0 && first <= previous[1] + 1) merged[merged.length - 1] = [previous[0], Math.max(previous[1], last)];
		else merged.push([first, last]);
	}
	return merged;
}
function withoutRange(ranges, [cutFirst, cutLast]) {
	const kept = [];
	for (const [first, last] of ranges) {
		if (last < cutFirst || first > cutLast) {
			kept.push([first, last]);
			continue;
		}
		if (first < cutFirst) kept.push([first, cutFirst - 1]);
		if (last > cutLast) kept.push([cutLast + 1, last]);
	}
	return kept;
}
function escapeUnit(unit) {
	return `\\u${unit.toString(16).toUpperCase().padStart(4, "0")}`;
}
function classMember(first, last) {
	return first === last ? escapeUnit(first) : `${escapeUnit(first)}-${escapeUnit(last)}`;
}
const highSurrogate = (cp) => 55296 + (cp - 65536 >> 10);
const lowSurrogate = (cp) => 56320 + (cp - 65536 & 1023);
const isFullLow = (span) => span.lowFirst === 56320 && span.lowLast === 57343;
function surrogateAlternatives([first, last]) {
	const spans = [];
	for (let cursor = first; cursor <= last;) {
		const high = highSurrogate(cursor);
		const blockLast = Math.min(last, 65536 + (high - 55296 + 1 << 10) - 1);
		spans.push({
			high,
			lowFirst: lowSurrogate(cursor),
			lowLast: lowSurrogate(blockLast)
		});
		cursor = blockLast + 1;
	}
	const alternatives = [];
	for (let index = 0; index < spans.length;) {
		const span = spans[index];
		if (!isFullLow(span)) {
			const low = span.lowFirst === span.lowLast ? escapeUnit(span.lowFirst) : `[${classMember(span.lowFirst, span.lowLast)}]`;
			alternatives.push(`${escapeUnit(span.high)}${low}`);
			index += 1;
			continue;
		}
		let end = index;
		while (end + 1 < spans.length && isFullLow(spans[end + 1]) && spans[end + 1].high === spans[end].high + 1) end += 1;
		alternatives.push(`[${classMember(span.high, spans[end].high)}][${classMember(56320, 57343)}]`);
		index = end + 1;
	}
	return alternatives;
}
function codePointClassSource(ranges) {
	const basic = [];
	const alternatives = [];
	for (const [first, last] of ranges) {
		if (first <= 65535) basic.push(classMember(first, Math.min(last, 65535)));
		if (last > 65535) alternatives.push(...surrogateAlternatives([Math.max(first, 65536), last]));
	}
	if (basic.length > 0) alternatives.unshift(`[${basic.join("")}]`);
	return alternatives.length === 1 ? alternatives[0] : `(?:${alternatives.join("|")})`;
}
const INVISIBLE_RANGES = mergeRanges([...DEFAULT_IGNORABLE_RANGES, ...FORMAT_ONLY_RANGES]);
const INVISIBLE_SMUGGLING_CHARS = new RegExp(codePointClassSource(withoutRange(INVISIBLE_RANGES, TAG_BLOCK)), "g");
const INVISIBLE_CHAR_SIGNAL = new RegExp(codePointClassSource(INVISIBLE_RANGES));
const OVERRIDE_KEYWORD_SOURCE = "(?:ignore|system|instructions?|you\\s+are|disregard|override)";
const NONSPACING_MARK_CLASS = codePointClassSource(NONSPACING_MARK_RANGES);
const COMBINING_MARK_MASK = new RegExp(`${NONSPACING_MARK_CLASS}[\\s\\S]{0,20}${OVERRIDE_KEYWORD_SOURCE}|${OVERRIDE_KEYWORD_SOURCE}[\\s\\S]{0,20}${NONSPACING_MARK_CLASS}`, "i");
const CONFUSABLE_BY_CODE = new Map(Object.entries({
	a: [
		1072,
		945,
		593
	],
	b: [
		1074,
		1100,
		1068,
		946
	],
	c: [1089, 962],
	d: [1281, 1386],
	e: [
		1077,
		949,
		603
	],
	g: [
		1293,
		609,
		1409
	],
	h: [1211, 1392],
	i: [
		1110,
		953,
		305,
		617
	],
	j: [
		1112,
		1011,
		1397
	],
	k: [1082, 954],
	l: [1231, 1388],
	m: [1084],
	n: [951, 1400],
	o: [
		1086,
		959,
		1413
	],
	p: [1088, 961],
	q: [
		1307,
		1379,
		1382
	],
	r: [1075],
	s: [1109],
	t: [1090, 964],
	u: [965, 1405],
	v: [
		1141,
		957,
		651
	],
	w: [1309, 969],
	x: [1093, 967],
	y: [
		1091,
		947,
		611
	],
	z: [950],
	A: [1040, 913],
	B: [
		1042,
		914,
		665
	],
	C: [1057],
	D: [1280],
	E: [1045, 917],
	G: [1292],
	H: [
		1053,
		1210,
		919,
		668
	],
	I: [
		1030,
		921,
		1216,
		304,
		618
	],
	J: [1032, 895],
	K: [1050, 922],
	L: [1340, 671],
	M: [1052, 924],
	N: [925, 628],
	O: [
		1054,
		927,
		1365
	],
	P: [1056, 929],
	Q: [1306],
	R: [640],
	S: [1029],
	T: [1058, 932],
	U: [1357],
	V: [1140],
	W: [1308],
	X: [1061, 935],
	Y: [
		1059,
		1198,
		933,
		655
	],
	Z: [918]
}).flatMap(([ascii, codePoints]) => codePoints.map((codePoint) => [codePoint, ascii])));
const CONFUSABLE_MIN_CODE = Math.min(...CONFUSABLE_BY_CODE.keys());
const CONFUSABLE_MAX_CODE = Math.max(...CONFUSABLE_BY_CODE.keys());
function isAsciiOnly(text) {
	for (let index = 0; index < text.length; index += 1) if (text.charCodeAt(index) > 127) return false;
	return true;
}
function foldConfusables(text) {
	if (isAsciiOnly(text)) return text;
	const normalized = text.normalize("NFKC");
	let folded = "";
	let cursor = 0;
	for (let index = 0; index < normalized.length; index += 1) {
		const code = normalized.charCodeAt(index);
		if (code < CONFUSABLE_MIN_CODE || code > CONFUSABLE_MAX_CODE) continue;
		const ascii = CONFUSABLE_BY_CODE.get(code);
		if (ascii === void 0) continue;
		folded += normalized.slice(cursor, index) + ascii;
		cursor = index + 1;
	}
	return cursor === 0 ? normalized : folded + normalized.slice(cursor);
}
const WORD_ADJACENT_MASK = /(?<=[A-Za-z])[\u0080-\uFFFF]+|[\u0080-\uFFFF]+(?=[A-Za-z])/g;
function joinMaskedWords(text) {
	if (isAsciiOnly(text)) return text;
	return text.normalize("NFKD").replace(WORD_ADJACENT_MASK, "");
}
function normalizeForDenyScan(text) {
	return joinMaskedWords(foldConfusables(text));
}
const CONTENT_DENY_PATTERNS = [
	{
		id: "skip-security-review",
		pattern: /skip\s+(?:security|review|audit)/i,
		severity: "block",
		description: "instruction to skip a security, review, or audit step"
	},
	{
		id: "ignore-findings",
		pattern: /ignore\s+(?:all\s+)?(?:findings|errors|warnings|vulnerabilities)/i,
		severity: "block",
		description: "instruction to ignore findings, errors, warnings, or vulnerabilities"
	},
	{
		id: "disable-security-controls",
		pattern: /disable\s+(?:security|review|audit|test)/i,
		severity: "block",
		description: "instruction to disable security, review, audit, or test controls"
	},
	{
		id: "exfiltrate",
		pattern: /exfiltrate/i,
		severity: "block",
		description: "data exfiltration vocabulary"
	},
	{
		id: "send-data-external",
		pattern: /send\s+(?:to|data|code)\s+(?:external|remote|http)/i,
		severity: "block",
		description: "sending data or code to an external destination"
	},
	{
		id: "bypass-security",
		pattern: /bypass\s+(?:security|auth|permission|review)/i,
		severity: "block",
		description: "bypassing security, auth, permission, or review"
	},
	{
		id: "delete-everything",
		pattern: /delete\s+(?:all|everything|repo)/i,
		severity: "block",
		description: "bulk-destructive delete instruction"
	},
	{
		id: "never-verify",
		pattern: /never\s+(?:review|test|check|audit|scan)/i,
		severity: "block",
		description: "blanket ban on review, test, check, audit, or scan activity"
	},
	{
		id: "override-security",
		pattern: /override\s+(?:all\s+)?security/i,
		severity: "block",
		description: "overriding security controls"
	},
	{
		id: "encoded-eval",
		pattern: /(?:atob|Buffer\.from)\s*\([^)]*(?:eval|exec|require)/i,
		severity: "block",
		description: "decode-then-execute chain (atob/Buffer.from into eval/exec/require)"
	},
	{
		id: "permission-mutation",
		pattern: /(?:chmod|chown)\s+[0-7]{3,4}/i,
		severity: "block",
		description: "chmod/chown filesystem permission mutation"
	},
	{
		id: "inline-secret-assignment",
		pattern: /(?:api[_-]?key|password|token|secret)\s*[:=]\s*.{8,}/i,
		severity: "block",
		description: "inline secret assignment (api key, password, token, secret)"
	},
	{
		id: "ignore-previous-instructions",
		pattern: /ignore\s+(?:all\s+)?previous\s+instructions/i,
		severity: "block",
		description: "override of previous instructions"
	},
	{
		id: "disregard-previous",
		pattern: /disregard\s+(?:all\s+)?(?:previous|prior|above)/i,
		severity: "block",
		description: "disregard of previous, prior, or above context"
	},
	{
		id: "role-reassignment",
		pattern: /you\s+are\s+now\s+(?:a|an|the)\s/i,
		severity: "block",
		description: "role reassignment (you are now ...)"
	},
	{
		id: "new-instructions-header",
		pattern: /new\s+instructions\s*:/i,
		severity: "block",
		description: "injected new-instructions header"
	},
	{
		id: "system-prompt-header",
		pattern: /system\s+prompt\s*:/i,
		severity: "block",
		description: "injected system-prompt header"
	},
	{
		id: "forget-previous",
		pattern: /forget\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions|rules|context)/i,
		severity: "block",
		description: "instruction to forget previous instructions, rules, or context"
	},
	{
		id: "act-as-jailbroken",
		pattern: /act\s+as\s+(?:a|an)\s+(?:unrestricted|unfiltered|jailbroken)/i,
		severity: "block",
		description: "act-as unrestricted/unfiltered/jailbroken persona"
	},
	{
		id: "do-not-follow-previous",
		pattern: /do\s+not\s+follow\s+(?:any|the|your)\s+(?:previous|prior|above|original)\s/i,
		severity: "block",
		description: "instruction to not follow previous or original instructions"
	},
	{
		id: "remote-exec-pipe",
		pattern: /(?:curl|wget|fetch)\s+.*\|\s*(?:bash|sh|eval)/i,
		severity: "block",
		description: "remote fetch piped into a shell"
	},
	{
		id: "remove-safety-checks",
		pattern: /remove\s+(?:all\s+)?(?:security|safety)\s+(?:checks|guards|measures)/i,
		severity: "block",
		description: "removal of security or safety checks"
	},
	{
		id: "execute-untrusted-code",
		pattern: /(?:execute|run)\s+(?:arbitrary|untrusted|remote)\s+(?:code|commands?)/i,
		severity: "block",
		description: "execution of arbitrary, untrusted, or remote code"
	},
	{
		id: "phone-home",
		pattern: /(?:connect|phone)\s+home/i,
		severity: "block",
		description: "phone-home behavior"
	},
	{
		id: "reverse-shell",
		pattern: /(?:reverse|bind)\s+shell/i,
		severity: "block",
		description: "reverse or bind shell"
	},
	{
		id: "upload-exfil",
		pattern: /(?:upload|exfil)\s+(?:to|data|credentials|keys)/i,
		severity: "block",
		description: "upload or exfiltration of data, credentials, or keys"
	},
	{
		id: "disable-logging",
		pattern: /(?:disable|turn\s+off|remove)\s+(?:logging|monitoring|audit)/i,
		severity: "block",
		description: "disabling logging, monitoring, or audit"
	},
	{
		id: "hardcoded-credentials",
		pattern: /(?:hardcoded|embedded)\s+(?:credentials?|secrets?|passwords?)/i,
		severity: "block",
		description: "hardcoded or embedded credentials"
	},
	{
		id: "from-now-on-ignore",
		pattern: /(?:from\s+now\s+on|going\s+forward),?\s+(?:ignore|disregard|forget)\s/i,
		severity: "block",
		description: "temporal override (from now on, ignore/disregard/forget)"
	},
	{
		id: "pretend-role",
		pattern: /pretend\s+(?:you\s+are|to\s+be)\s+(?:a|an|the)\s/i,
		severity: "block",
		description: "pretend-to-be persona switch"
	},
	{
		id: "reveal-system-prompt",
		pattern: /(?:reveal|show|display|output)\s+(?:your|the)\s+(?:system\s+)?(?:prompt|instructions|rules)/i,
		severity: "block",
		description: "request to reveal prompt, instructions, or rules"
	},
	{
		id: "jailbreak-mode",
		pattern: /(?:jailbreak|dan\s+mode|developer\s+mode)/i,
		severity: "block",
		description: "jailbreak / DAN mode / developer mode vocabulary"
	},
	{
		id: "print-system-prompt",
		pattern: /(?:output|print|write)\s+(?:the|your)\s+(?:initial|original|system)\s+(?:prompt|instructions)/i,
		severity: "block",
		description: "request to print the original or system prompt"
	},
	{
		id: "authority-tier-escalation",
		pattern: /(?:takes?\s+precedence\s+over|overrides?|supersedes?|superc[ei]des?)\s+(?:the\s+|all\s+|any\s+|your\s+)*(?:system|developer|project|framework|security|agent|prior|above|previous)\s+(?:instruction|rule|prompt|polic|setting|requirement|directive|config|context)/i,
		severity: "block",
		description: "content claiming precedence over system/developer/security authority"
	},
	{
		id: "treat-as-system-authority",
		pattern: /treat\s+(?:this|that|the\s+following|it|these)\s+(?:as\s+)?(?:a\s+|an\s+)?(?:system|developer|higher[\s-]?(?:tier|priority|authority|trust)|elevated|privileged)\s+(?:instruction|prompt|rule|command|message|directive|authority|tier)/i,
		severity: "block",
		description: "re-tiering content as a system or privileged instruction"
	},
	{
		id: "role-must-always",
		pattern: /\b(?:implementer|reviewer|planner|orchestrator|fixer|researcher|loader|the\s+(?:agent|assistant|model|llm|ai|bot|system))\b[^.\n]{0,40}\bmust\s+always\b/i,
		severity: "block",
		description: "agent role bound to an unconditional behavioral imperative"
	},
	{
		id: "cross-agent-directive",
		pattern: /\bwhen\s+(?:the\s+)?(?:implementer|reviewer|planner|orchestrator|fixer|researcher|agent|assistant|model|llm|ai)\b[^.\n]{0,30}\b(?:runs?|reads?|loads?|sees?|processes?|executes?)\b[^.\n]{0,40}\b(?:ignore|skip|disable|bypass|delete|remove|overrides?|exfiltrate|reveal|forget|disregard|never|do\s+not|must\s+always)\b/i,
		severity: "block",
		description: "directive keyed to another agent's execution"
	}
];
const INJECTION_PATTERNS = [
	{
		id: "role-colon-injection",
		pattern: /(?:^|\n)\s*(?:system|assistant|user)\s*:\s*$/im,
		severity: "block",
		description: "conversation role header (system/assistant/user colon line)"
	},
	{
		id: "chat-template-tokens",
		pattern: /\[INST\]|\[\/INST\]|<\|im_start\|>|<\|im_end\|>/i,
		severity: "block",
		description: "chat template control tokens"
	},
	{
		id: "template-injection",
		pattern: /<%[-=]?\s|%>(?!%)|\{\{[^{}]*\}\}/,
		severity: "block",
		description: "template-literal injection (ERB/Handlebars)"
	},
	{
		id: "html-comment-role-escalation",
		pattern: /<!--\s*(?:SYSTEM|ADMIN|ROOT)\s*-->/i,
		severity: "block",
		description: "HTML comment role escalation"
	},
	{
		id: "control-char-injection",
		pattern: /\x00|\x1b\[/,
		severity: "block",
		description: "null byte or ANSI escape sequence injection"
	},
	{
		id: "tool-call-injection",
		pattern: /(?:tool_call|function_call)\s*\(/i,
		severity: "block",
		description: "tool/function call invocation attempt"
	},
	{
		id: "tool-delimiter-token",
		pattern: /<\|(?:tool|function|plugin)\|>/i,
		severity: "block",
		description: "tool delimiter injection token"
	},
	{
		id: "unicode-tag-smuggling",
		pattern: /\uDB40[\uDC00-\uDC7F]/,
		severity: "block",
		description: "Unicode tag characters U+E0000-U+E007F (invisible payload)"
	},
	{
		id: "invisible-chars",
		pattern: new RegExp(INVISIBLE_CHAR_SIGNAL.source),
		severity: "warn",
		description: "default-ignorable or format character (possible keyword-splitting smuggling)"
	},
	{
		id: "base64-instruction-override",
		pattern: /(?:SWdub3JlIGFsbCBwcmV2aW91cyBpbnN0cnVjdGlvbnM|aWdub3JlIGFsbCBwcmV2aW91cyBpbnN0cnVjdGlvbnM|SWdub3JlIHByZXZpb3VzIGluc3RydWN0aW9ucw|aWdub3JlIHByZXZpb3VzIGluc3RydWN0aW9ucw|RGlzcmVnYXJkIHByZXZpb3VzIGluc3RydWN0aW9ucw|ZGlzcmVnYXJkIHByZXZpb3VzIGluc3RydWN0aW9ucw|U3lzdGVtIHByb21wdDo|c3lzdGVtIHByb21wdDo|WW91IGFyZSBub3c|eW91IGFyZSBub3c|Rm9yZ2V0IGFsbCBwcmV2aW91cw|Zm9yZ2V0IGFsbCBwcmV2aW91cw|QWN0IGFzIGFu|YWN0IGFzIGFu)/,
		severity: "block",
		description: "base64-encoded instruction-override phrase"
	},
	{
		id: "homoglyph-instruction-mask",
		pattern: /[\u0400-\u04FF\u0370-\u03FF\u0530-\u058F\u13A0-\u13FF\u10A0-\u10FF\u2C80-\u2CFF][\s\S]{0,20}(?:ignore|system|instructions?|you\s+are|disregard|override)|(?:ignore|system|instructions?|you\s+are|disregard|override)[\s\S]{0,20}[\u0400-\u04FF\u0370-\u03FF\u0530-\u058F\u13A0-\u13FF\u10A0-\u10FF\u2C80-\u2CFF]/i,
		severity: "warn",
		description: "non-ASCII confusable adjacent to an override keyword"
	},
	{
		id: "combining-mark-instruction-mask",
		pattern: COMBINING_MARK_MASK,
		severity: "warn",
		description: "nonspacing mark adjacent to an override keyword (possible keyword-masking smuggling)"
	},
	{
		id: "image-url-exfiltration",
		pattern: /!\[[^\]]{0,200}\]\(\s*(?:https?:|data:|file:)|<img[^>]+src\s*=\s*["']\s*(?:https?:|data:)/i,
		severity: "block",
		description: "markdown/HTML image URL exfiltration attempt"
	},
	{
		id: "error-frame-override",
		pattern: /(?:error|exception|warning|debug|stderr|traceback|panic)[\s:=-]{1,4}[^\n]{0,80}(?:reveal|print|output|dump|show|leak|expose|display)\s+(?:the\s+|your\s+)?(?:system\s+prompt|prompt|instructions?|context|secrets?|tokens?|keys?)/i,
		severity: "block",
		description: "error/debug frame wrapping an instruction override"
	}
];
const NO_HONEST_SHAPE_INJECTION_ROWS = /* @__PURE__ */ new Set(["unicode-tag-smuggling"]);
const LEARNINGS_INJECTION_PATTERNS = [
	{
		id: "fake-instruction-header",
		pattern: /^#{1,2}\s*(?:system\s+prompt|instructions|you\s+are|role)\s*:/im,
		severity: "block",
		description: "markdown header impersonating system instructions"
	},
	{
		id: "frontmatter-config-override",
		pattern: /^---[ \t]*\n[\s\S]{0,2000}?(?:protected|scope|model)\s*:/m,
		severity: "block",
		description: "embedded frontmatter head impersonating engine config (protected/scope/model)"
	},
	{
		id: "cross-agent-override",
		pattern: /(?:override|replace|ignore)\s+(?:agent|rule|skill)\s+/i,
		severity: "block",
		description: "override/replace/ignore of another agent, rule, or skill"
	},
	{
		id: "managed-block-forgery",
		pattern: /STAMITY:(?:BEGIN|END)/,
		severity: "block",
		description: "forged managed-block marker"
	},
	{
		id: "tool-invocation-markup",
		pattern: /<(?:tool_use|function_call|antml\x3ainvoke)\b/i,
		severity: "block",
		description: "embedded tool-invocation markup"
	}
];
const MCP_POISONING_PATTERNS = [
	{
		id: "hidden-instruction-tag",
		pattern: /<(?:IMPORTANT|SYSTEM|INSTRUCTIONS?|HIDDEN|SECRET)[\s>]/i,
		severity: "block",
		description: "hidden-instruction tag concealing directives from the operator"
	},
	{
		id: "conceal-from-user",
		pattern: /(?:do\s+not|don['’]t|never)\s+(?:mention|tell|inform|notify|show|display|reveal|report)\s+(?:this|it|the)?\s*(?:to\s+)?(?:the\s+)?user/i,
		severity: "block",
		description: "directive to conceal tool behaviour from the user"
	},
	{
		id: "tool-preamble-data-access",
		pattern: /before\s+(?:using|calling|invoking|executing|running)\s+(?:this\s+)?tool[^.]{0,80}?(?:read|access|fetch|load|send|transmit|include)/i,
		severity: "block",
		description: "pre-invocation preamble instructing a read or transmit"
	},
	{
		id: "sensitive-path-access",
		pattern: /(?:read|access|cat|open|load|send|transmit|include)\s+[^.]{0,60}?(?:~\/\.ssh|\/\.ssh\/|id_rsa|\.env\b|\.aws\/credentials|\/etc\/passwd|\/etc\/shadow|\.kube\/config|\.netrc)/i,
		severity: "block",
		description: "instruction to read or transmit a credential path"
	},
	{
		id: "cross-tool-hijack",
		pattern: /when\s+(?:this\s+)?tool\s+is\s+(?:available|loaded|present)[^.]{0,80}?(?:other|another|the\s+\w+)\s+tool\s+(?:must|should|will|has\s+to)/i,
		severity: "block",
		description: "metadata binding the behaviour of another server's tools"
	},
	{
		id: "failure-coercion",
		pattern: /(?:application|system|agent|tool|call)\s+will\s+(?:crash|fail|error|break|malfunction)\s+(?:if|unless)/i,
		severity: "warn",
		description: "coercion framed as a threatened failure"
	},
	{
		id: "unnoticed-action",
		pattern: /(?:without|while)\s+(?:the\s+user|them|anyone)\s+(?:noticing|knowing|seeing|being\s+aware)/i,
		severity: "block",
		description: "instruction to act without the user noticing"
	},
	{
		id: "tool-gated-side-effect",
		pattern: /tool\s+(?:will\s+not|won['’]t|can\s?not)\s+work\s+(?:unless|until|without)[^.]{0,80}?(?:read|access|send|transmit|include)/i,
		severity: "block",
		description: "tool function withheld until a read or transmit is performed"
	}
];
const ANTI_SLOP_WORDLIST = [
	"best possible",
	"best-in-class",
	"world-class",
	"comprehensive and thorough",
	"exhaustive",
	"robust and resilient",
	"high-quality",
	"ensure",
	"properly",
	"correctly",
	"as needed",
	"scalable"
];
const SNIPPET_MAX$1 = 160;
function maskedSnippet(length) {
	return `[redacted ${length} chars]`;
}
const REDACTION_MARKER = "[REDACTED]";
const MAX_SANITIZE_PASSES = 20;
const MAX_SANITIZE_GROWTH = 16;
const MIN_SANITIZE_BUDGET = 65536;
const INVISIBLE_CHARS_ID$1 = "invisible-chars";
function asGlobal(pattern) {
	return new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
}
function* eachMatch(pattern, text) {
	const re = asGlobal(pattern);
	let match;
	while ((match = re.exec(text)) !== null) {
		yield match;
		if (match[0].length === 0) re.lastIndex += 1;
	}
}
function byIndexThenId(a, b) {
	if (a.index !== b.index) return a.index - b.index;
	if (a.patternId < b.patternId) return -1;
	return a.patternId > b.patternId ? 1 : 0;
}
function scanForDeniedPatterns(content, patterns = CONTENT_DENY_PATTERNS) {
	const hits = [];
	for (const { id, pattern, severity } of patterns) for (const match of eachMatch(pattern, content)) {
		const matched = match[0];
		hits.push({
			patternId: id,
			index: match.index,
			snippet: severity === "block" ? maskedSnippet(matched.length) : matched.slice(0, SNIPPET_MAX$1),
			matchLength: matched.length,
			severity
		});
	}
	hits.sort(byIndexThenId);
	return hits;
}
function hitKey(hit) {
	return `${hit.patternId}\u0000${hit.index}`;
}
function scanNormalized(content, patterns = CONTENT_DENY_PATTERNS) {
	const rawHits = scanForDeniedPatterns(content, patterns);
	const normalized = normalizeForDenyScan(content);
	if (normalized === content) return rawHits;
	const seen = new Set(rawHits.map(hitKey));
	const added = scanForDeniedPatterns(normalized, patterns).filter((hit) => !seen.has(hitKey(hit)));
	if (added.length === 0) return rawHits;
	return [...rawHits, ...added].toSorted(byIndexThenId);
}
function redactMatches(input, pattern, budget) {
	let out = "";
	let cursor = 0;
	let count = 0;
	for (const match of eachMatch(pattern, input)) {
		if (match[0].length === 0) continue;
		out += input.slice(cursor, match.index) + REDACTION_MARKER;
		cursor = match.index + match[0].length;
		count += 1;
		if (out.length > budget) return {
			text: "",
			count,
			overflowed: true
		};
	}
	if (count === 0) return {
		text: input,
		count: 0,
		overflowed: false
	};
	return {
		text: out + input.slice(cursor),
		count,
		overflowed: false
	};
}
function hasRedactableMatch(pattern, text) {
	for (const match of eachMatch(pattern, text)) if (match[0].length > 0) return true;
	return false;
}
function sanitizeContent(content, patterns = INJECTION_PATTERNS) {
	const counts = /* @__PURE__ */ new Map();
	let sanitized = content.replace(INVISIBLE_SMUGGLING_CHARS, "");
	if (sanitized.length !== content.length) counts.set(INVISIBLE_CHARS_ID$1, content.length - sanitized.length);
	const budget = Math.max(sanitized.length * MAX_SANITIZE_GROWTH, MIN_SANITIZE_BUDGET);
	let overflowedId;
	const redacting = patterns.filter(({ severity }) => severity === "block");
	for (let pass = 0; pass < MAX_SANITIZE_PASSES && overflowedId === void 0; pass += 1) {
		let changed = false;
		for (const { id, pattern } of redacting) {
			const redaction = redactMatches(sanitized, pattern, budget);
			if (redaction.count === 0) continue;
			counts.set(id, (counts.get(id) ?? 0) + redaction.count);
			changed = true;
			if (redaction.overflowed) {
				overflowedId = id;
				break;
			}
			sanitized = redaction.text;
		}
		if (!changed) break;
	}
	const unresolved = redacting.filter(({ id, pattern }) => id === overflowedId || hasRedactableMatch(pattern, sanitized));
	if (unresolved.length > 0) {
		for (const { id } of unresolved) counts.set(id, (counts.get(id) ?? 0) + 1);
		sanitized = "";
	}
	return {
		sanitized,
		removed: [...counts.entries()].map(([patternId, count]) => ({
			patternId,
			count
		})),
		modified: sanitized !== content
	};
}
function scanAntiSlop(content) {
	const lower = content.toLowerCase();
	const hits = [];
	for (const phrase of ANTI_SLOP_WORDLIST) {
		const patternId = `anti-slop-${phrase.replace(/[^a-z0-9]+/g, "-")}`;
		let from = 0;
		for (;;) {
			const index = lower.indexOf(phrase, from);
			if (index === -1) break;
			hits.push({
				patternId,
				index,
				snippet: content.slice(index, index + phrase.length),
				matchLength: phrase.length,
				severity: "warn"
			});
			from = index + 1;
		}
	}
	hits.sort(byIndexThenId);
	return hits;
}
//#endregion
//#region src/shared/runId.ts
let cachedRunId = null;
function getRunId() {
	cachedRunId ??= randomBytes(4).toString("hex");
	return cachedRunId;
}
//#endregion
//#region src/guard/outputBounds.ts
var outputBounds_exports = /* @__PURE__ */ __exportAll({
	compactOutput: () => compactOutput,
	truncateAt: () => truncateAt
});
const DEFAULT_BOUNDS = {
	maxArrayItems: 50,
	maxStringLength: 500,
	maxDepth: 8
};
const TRUNCATION_MARK = "…";
function truncateAt(text, max) {
	if (max <= 0) return "";
	if (text.length <= max) return text;
	const lastKept = text.charCodeAt(max - 1);
	const splitsPair = lastKept >= 55296 && lastKept <= 56319;
	return text.slice(0, splitsPair ? max - 1 : max);
}
function compactOutput(value, opts) {
	return bound(value, 1, {
		maxArrayItems: opts?.maxArrayItems ?? DEFAULT_BOUNDS.maxArrayItems,
		maxStringLength: opts?.maxStringLength ?? DEFAULT_BOUNDS.maxStringLength,
		maxDepth: opts?.maxDepth ?? DEFAULT_BOUNDS.maxDepth
	}, /* @__PURE__ */ new Set());
}
function isPlainObject$1(value) {
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}
function bound(value, depth, bounds, ancestors) {
	if (typeof value === "string") {
		if (value.length <= bounds.maxStringLength) return value;
		return truncateAt(value, bounds.maxStringLength) + TRUNCATION_MARK;
	}
	if (value === null || typeof value !== "object") return value;
	if (!Array.isArray(value) && !isPlainObject$1(value)) return value;
	if (ancestors.has(value)) throw new EngineError("cannot bound a circular value: a container references one of its own ancestors", { code: "VALIDATION_ERROR" });
	if (depth > bounds.maxDepth) return `${TRUNCATION_MARK} max depth ${bounds.maxDepth}`;
	ancestors.add(value);
	try {
		if (Array.isArray(value)) {
			const kept = value.slice(0, bounds.maxArrayItems).map((item) => bound(item, depth + 1, bounds, ancestors));
			const omitted = value.length - bounds.maxArrayItems;
			if (omitted > 0) kept.push(`${TRUNCATION_MARK} ${omitted} more ${omitted === 1 ? "item" : "items"}`);
			return kept;
		}
		const copy = {};
		for (const [key, item] of Object.entries(value)) copy[key] = bound(item, depth + 1, bounds, ancestors);
		return copy;
	} finally {
		ancestors.delete(value);
	}
}
//#endregion
//#region src/guard/promptGuard.ts
var promptGuard_exports = /* @__PURE__ */ __exportAll({
	MAX_AGENT_OUTPUT_LENGTH: () => MAX_AGENT_OUTPUT_LENGTH,
	MAX_PHASE_INPUT_LENGTH: () => MAX_PHASE_INPUT_LENGTH,
	MAX_USER_CONTENT_LENGTH: () => MAX_USER_CONTENT_LENGTH,
	extractBoundedContent: () => extractBoundedContent,
	generateBoundaryMarkers: () => generateBoundaryMarkers,
	guardInput: () => guardInput,
	validateAgentOutput: () => validateAgentOutput,
	wrapWithBoundary: () => wrapWithBoundary
});
const MAX_PHASE_INPUT_LENGTH = 5e5;
const MAX_AGENT_OUTPUT_LENGTH = 1e6;
const MAX_USER_CONTENT_LENGTH = 25e4;
const LENGTH_CAP_ID = "input-length-cap";
const INVISIBLE_CHARS_ID = "invisible-chars";
const GUARD_PATTERNS = [...CONTENT_DENY_PATTERNS, ...INJECTION_PATTERNS];
const RAW_ONLY_PATTERNS = GUARD_PATTERNS.filter((entry) => entry.id === INVISIBLE_CHARS_ID);
const NORMALIZED_PATTERNS = GUARD_PATTERNS.filter((entry) => entry.id !== INVISIBLE_CHARS_ID);
const PATTERN_DESCRIPTIONS$2 = new Map(GUARD_PATTERNS.map((entry) => [entry.id, entry.description]));
const MARKER_TOKEN = "STAMITY_BOUNDARY";
const MARKER_SOURCE = `<!-- ${MARKER_TOKEN}:([A-Za-z0-9._-]{1,64}):(BEGIN|END):([0-9a-f]{16}):([0-9a-f]{16}) -->`;
const MARKER_EXACT = new RegExp(`^${MARKER_SOURCE}$`);
const LABEL_UNSAFE = /[^A-Za-z0-9._-]+/g;
const LABEL_EDGE_DASHES = /^-+|-+$/g;
const MAX_LABEL_LENGTH = 64;
let cachedGuardKey = null;
function guardKey() {
	cachedGuardKey ??= randomBytes(32);
	return cachedGuardKey;
}
function markerTag(label, nonce) {
	return createHmac("sha256", guardKey()).update(`${getRunId()}:${label}:${nonce}`).digest("hex").slice(0, 16);
}
function normalizeLabel(label) {
	const normalized = label.slice(0, MAX_LABEL_LENGTH).replace(LABEL_UNSAFE, "-").replace(LABEL_EDGE_DASHES, "");
	if (normalized === "") throw new EngineError(`boundary label ${JSON.stringify(label)} has no characters usable in a marker; pass a label containing letters, digits, '.', '_' or '-'`, { code: "VALIDATION_ERROR" });
	return normalized;
}
function parseMarker(marker) {
	const match = MARKER_EXACT.exec(marker);
	if (match === null) return null;
	const [, label, kind, nonce, tag] = match;
	if (label === void 0 || kind === void 0 || nonce === void 0 || tag === void 0) return null;
	return {
		label,
		kind,
		nonce,
		tag
	};
}
function markersAreAuthentic(markers) {
	const open = parseMarker(markers.open);
	const close = parseMarker(markers.close);
	if (open === null || close === null) return false;
	if (open.kind !== "BEGIN" || close.kind !== "END") return false;
	if (open.label !== close.label || open.nonce !== close.nonce || open.tag !== close.tag) return false;
	return open.tag === markerTag(open.label, open.nonce);
}
function generateBoundaryMarkers(label) {
	const safeLabel = normalizeLabel(label);
	const nonce = randomBytes(8).toString("hex");
	const tag = markerTag(safeLabel, nonce);
	return {
		open: `<!-- ${MARKER_TOKEN}:${safeLabel}:BEGIN:${nonce}:${tag} -->`,
		close: `<!-- ${MARKER_TOKEN}:${safeLabel}:END:${nonce}:${tag} -->`
	};
}
function wrapWithBoundary(content, label) {
	const markers = generateBoundaryMarkers(label);
	return {
		wrapped: `${markers.open}\n${content}\n${markers.close}`,
		markers
	};
}
function extractBoundedContent(wrapped, markers) {
	if (!markersAreAuthentic(markers)) return null;
	const openIndex = wrapped.indexOf(markers.open);
	if (openIndex === -1) return null;
	if (wrapped.indexOf(markers.open, openIndex + 1) !== -1) return null;
	const bodyStart = openIndex + markers.open.length;
	const closeIndex = wrapped.indexOf(markers.close, bodyStart);
	if (closeIndex === -1) return null;
	if (wrapped.indexOf(markers.close, closeIndex + 1) !== -1) return null;
	let body = wrapped.slice(bodyStart, closeIndex);
	if (body.startsWith("\n")) body = body.slice(1);
	if (body.endsWith("\n")) body = body.slice(0, -1);
	return body;
}
function guardInput(content, opts) {
	const maxLength = opts?.maxLength ?? 5e5;
	const violations = [];
	const capped = truncateAt(content, maxLength);
	if (capped.length !== content.length) violations.push({
		patternId: LENGTH_CAP_ID,
		index: capped.length,
		snippet: `${content.length} characters over the ${maxLength} cap`,
		matchLength: 0,
		severity: "block"
	});
	violations.push(...scanForDeniedPatterns(capped, RAW_ONLY_PATTERNS));
	const stripped = capped.replace(INVISIBLE_SMUGGLING_CHARS, "");
	violations.push(...scanNormalized(stripped, NORMALIZED_PATTERNS));
	const { sanitized } = sanitizeContent(stripped, GUARD_PATTERNS);
	return {
		ok: !violations.some((hit) => hit.severity === "block"),
		content: sanitized,
		violations
	};
}
function validateAgentOutput(output, opts) {
	const maxLength = opts?.maxLength ?? 1e6;
	const required = opts?.requiredMarkers ?? [];
	const errors = [];
	if (output.length > maxLength) errors.push(`output is ${output.length} characters, over the ${maxLength} cap`);
	const blocked = /* @__PURE__ */ new Map();
	for (const hit of scanForDeniedPatterns(output, GUARD_PATTERNS)) {
		if (hit.severity !== "block") continue;
		const seen = blocked.get(hit.patternId);
		if (seen === void 0) blocked.set(hit.patternId, {
			index: hit.index,
			count: 1
		});
		else seen.count += 1;
	}
	for (const [patternId, { index, count }] of blocked) {
		const occurrences = count > 1 ? ` (${count} occurrences)` : "";
		errors.push(`injection pattern ${patternId} at index ${index}${occurrences}: ${PATTERN_DESCRIPTIONS$2.get(patternId) ?? "denied pattern"}`);
	}
	const allowed = new Set(required);
	for (const marker of required) if (!output.includes(marker)) errors.push(`required boundary marker is missing: ${marker}`);
	for (const match of output.matchAll(new RegExp(MARKER_SOURCE, "g"))) if (!allowed.has(match[0])) errors.push(`output carries an undeclared boundary marker: ${match[0]}`);
	return {
		ok: errors.length === 0,
		errors
	};
}
//#endregion
//#region src/content/contentRoot.ts
var contentRoot_exports = /* @__PURE__ */ __exportAll({
	__resetContentRootCacheForTests: () => __resetContentRootCacheForTests,
	__setContentRootForTests: () => __setContentRootForTests,
	__setForkRootForTests: () => __setForkRootForTests,
	resolveBundledContentRoot: () => resolveBundledContentRoot,
	resolveBundledForkRoot: () => resolveBundledForkRoot
});
const CONTENT_CANDIDATES = [["content"], ["dist", "content"]];
const FORK_DIR = "fork";
let cached = null;
let forkCache = null;
function isDirectory$2(path) {
	try {
		return statSync(path, { throwIfNoEntry: false })?.isDirectory() === true;
	} catch {
		return false;
	}
}
function resolveBundledContentRoot() {
	if (cached !== null) return cached;
	const packageRoot = findPackageRoot(dirname(fileURLToPath(import.meta.url)));
	const probed = CONTENT_CANDIDATES.map((segments) => join(packageRoot, ...segments));
	const found = probed.find(isDirectory$2);
	if (found === void 0) throw new EngineError(`Bundled content not found under ${packageRoot}. Probed ${probed.join(" and ")}. Reinstall the package, or run \`npm run build\` in a source checkout to stage the corpus under dist/content/.`, { code: "CONFIG_ERROR" });
	cached = found;
	return found;
}
function resolveBundledForkRoot() {
	if (forkCache !== null) return forkCache.root;
	const candidate = join(dirname(resolveBundledContentRoot()), FORK_DIR);
	forkCache = { root: isDirectory$2(candidate) ? candidate : void 0 };
	return forkCache.root;
}
function __resetContentRootCacheForTests() {
	cached = null;
	forkCache = null;
}
function __setContentRootForTests(dir) {
	cached = dir;
	forkCache = null;
}
function __setForkRootForTests(dir) {
	forkCache = { root: dir };
}
//#endregion
//#region src/types/core.ts
const TOOLS = [
	"claude",
	"cursor",
	"copilot",
	"codex"
];
const VALID_TOOLS = new Set(TOOLS);
const MATURITY_TIERS = [
	"solo",
	"team",
	"scaleup",
	"enterprise"
];
const VALID_MATURITY_TIERS = new Set(MATURITY_TIERS);
const DEFAULT_MATURITY_TIER = "solo";
const COMMUNICATION_STYLES = ["plain", "technical"];
const VALID_COMMUNICATION_STYLES = new Set(COMMUNICATION_STYLES);
const DEFAULT_COMMUNICATION_STYLE = "plain";
const IMPORT_MODES = [
	"supplement",
	"replace",
	"skip"
];
const VALID_IMPORT_MODES = new Set(IMPORT_MODES);
const DEFAULT_IMPORT_MODE = "supplement";
const MODEL_CLASSES = [
	"frontier",
	"advanced",
	"standard",
	"economy"
];
const VALID_MODEL_CLASSES = new Set(MODEL_CLASSES);
const EFFORT_LEVELS = [
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max"
];
const VALID_EFFORT_LEVELS = new Set(EFFORT_LEVELS);
function effortRank(level) {
	return EFFORT_LEVELS.indexOf(level);
}
//#endregion
//#region src/content/frontmatter.ts
var frontmatter_exports = /* @__PURE__ */ __exportAll({
	composeFrontmatter: () => composeFrontmatter,
	extractToolsFrontmatter: () => extractToolsFrontmatter,
	frontmatterField: () => frontmatterField,
	parseFrontmatter: () => parseFrontmatter,
	parseFrontmatterBlock: () => parseFrontmatterBlock
});
const FRONTMATTER_PATTERN = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n([\s\S]*))?$/;
const BOM$4 = 65279;
const TOOLS_FIELD = "tools";
const LEAD_KEYS = [
	"id",
	"type",
	"description",
	"tags"
];
function parseFrontmatter(raw, source) {
	const text = raw.charCodeAt(0) === BOM$4 ? raw.slice(1) : raw;
	const match = FRONTMATTER_PATTERN.exec(text);
	if (match === null) return {
		frontmatter: {},
		body: text,
		hadFrontmatter: false
	};
	const [, block = "", body = ""] = match;
	return {
		frontmatter: parseFrontmatterBlock(block, source),
		body,
		hadFrontmatter: true
	};
}
function parseFrontmatterBlock(block, source) {
	let parsed;
	try {
		parsed = parseYamlStrict(block, `${source} frontmatter`);
	} catch (cause) {
		throw new EngineError(cause instanceof Error ? cause.message : String(cause), {
			code: "VALIDATION_ERROR",
			cause
		});
	}
	return isPlainObject$2(parsed) ? parsed : {};
}
function composeFrontmatter(frontmatter, body) {
	const ordered = orderedEntries(frontmatter);
	if (ordered.length === 0) return `---\n---\n${body}`;
	return `---\n${stringify(new Map(ordered), { lineWidth: 0 }).trimEnd()}\n---\n${body}`;
}
function orderedEntries(frontmatter) {
	const remaining = new Map(Object.entries(frontmatter).filter(([, value]) => value !== void 0));
	const ordered = [];
	for (const key of LEAD_KEYS) {
		if (!remaining.has(key)) continue;
		ordered.push([key, remaining.get(key)]);
		remaining.delete(key);
	}
	ordered.push(...remaining);
	return ordered;
}
function extractToolsFrontmatter(raw, source = "frontmatter") {
	const declared = requireStringArray(parseFrontmatter(raw, source).frontmatter, TOOLS_FIELD, {
		source,
		optional: true
	});
	if (declared === void 0) return void 0;
	const unknown = declared.filter((name) => !isTool(name));
	if (unknown.length > 0) throw new EngineError(`${source}: unknown ${unknown.length === 1 ? "tool" : "tools"} ${unknown.map((name) => JSON.stringify(name)).join(", ")} in \`${TOOLS_FIELD}\`. Valid tools: ${TOOLS.join(", ")}.`, { code: "VALIDATION_ERROR" });
	return [...new Set(declared.filter(isTool))];
}
function isTool(name) {
	return VALID_TOOLS.has(name);
}
function frontmatterField(parsed, field) {
	return Object.hasOwn(parsed.frontmatter, field) ? parsed.frontmatter[field] : void 0;
}
//#endregion
//#region src/content/catalog.ts
var catalog_exports$1 = /* @__PURE__ */ __exportAll({
	COMMAND_ID_PREFIX: () => COMMAND_ID_PREFIX,
	applyCommandPrefix: () => applyCommandPrefix,
	assertSafePath: () => assertSafePath,
	buildContentIndex: () => buildContentIndex,
	contentRootsOf: () => contentRootsOf,
	emittedIdFor: () => emittedIdFor,
	getAllItemsById: () => getAllItemsById,
	layerRankOf: () => layerRankOf,
	originOf: () => originOf,
	replacedClaimantOf: () => replacedClaimantOf,
	resolveArtifactFilePath: () => resolveArtifactFilePath,
	slugOf: () => slugOf,
	toPosixDisplayPath: () => toPosixDisplayPath,
	typeIdKey: () => typeIdKey
});
const LAYER_RANK = {
	corpus: 0,
	pack: 1,
	fork: 2,
	user: 3
};
function layerRankOf(subject) {
	return LAYER_RANK[originOf(subject)];
}
function contentRootsOf(contentRoot) {
	if (contentRoot === void 0 || typeof contentRoot === "string") return {
		root: contentRoot,
		packRoots: [],
		forkRoot: void 0,
		overrideRoot: void 0
	};
	return {
		root: contentRoot.root,
		packRoots: contentRoot.packRoots ?? [],
		forkRoot: contentRoot.forkRoot,
		overrideRoot: contentRoot.overrideRoot
	};
}
const COMMAND_ID_PREFIX = "cmd-";
const CLASS_LAYOUT$1 = {
	agent: {
		dir: "agents",
		layout: "file"
	},
	skill: {
		dir: "skills",
		layout: "directory"
	},
	rule: {
		dir: "rules",
		layout: "file"
	},
	command: {
		dir: "commands",
		layout: "file"
	}
};
const SKILL_FILE$5 = "SKILL.md";
const ARTIFACT_EXTENSION$2 = ".md";
const OVERLAY_FRONTMATTER_SUFFIX$1 = ".customize.yaml";
const OVERLAY_BODY_SUFFIX$1 = ".customize.md";
const OVERLAY_OPENING_FENCE = /^---[ \t]*(?:\r?\n|$)/;
const BOM$3 = 65279;
const TRAILING_NEWLINES = /(?:\r?\n)+$/;
const OVERLAY_IDENTITY_KEYS = ["id", "type"];
const READ_CONCURRENCY$8 = 8;
const RULE_PRECEDENCES = [
	"critical",
	"high",
	"normal",
	"low"
];
const defaultFs$1 = {
	readdir,
	readFile
};
function toPosixDisplayPath(p) {
	return p.replaceAll("\\", "/");
}
function assertSafePath(relativePath, label) {
	const refuse = (why) => {
		throw new EngineError(`Unsafe content path in ${label}: ${JSON.stringify(relativePath)} (${why}). Content paths are plain relative POSIX paths contained in the content root.`, { code: "VALIDATION_ERROR" });
	};
	if (relativePath === "") refuse("empty path");
	if (relativePath.includes("\0")) refuse("null byte");
	if (relativePath.includes("\\")) refuse("backslash separator");
	if (isAbsolute(relativePath) || relativePath.startsWith("/") || /^[A-Za-z]:/.test(relativePath)) refuse("absolute path");
	if (relativePath.split("/").includes("..")) refuse("`..` segment");
	const normalized = normalize(relativePath);
	if (normalized.startsWith("..") || isAbsolute(normalized)) refuse("normalises outside the content root");
}
function typeIdKey(type, id) {
	return `${type}:${id}`;
}
function applyCommandPrefix(id, type) {
	if (type !== "command" || id.startsWith("cmd-")) return id;
	return `${COMMAND_ID_PREFIX}${id}`;
}
function emittedIdFor(item) {
	const bare = item.type === "command" && item.id.startsWith("cmd-") ? item.id.slice(4) : item.id;
	const prefix = contentPrefixFor(item);
	return bare.startsWith(prefix) ? bare : `${prefix}${bare}`;
}
async function buildContentIndex(contentRoot, options = {}) {
	const spec = contentRootsOf(contentRoot);
	const root = spec.root ?? resolveBundledContentRoot();
	const forkRoot = spec.forkRoot ?? (spec.root === void 0 ? resolveBundledForkRoot() : void 0);
	const fs = options.fs ?? defaultFs$1;
	const packRoots = mergePackRoots(spec.packRoots, options.packRoots ?? []);
	const overrideRoot = spec.overrideRoot;
	const [scanned, packScanned, forkScanned, overrideScanned, forkOverlays, userOverlays] = await Promise.all([
		Promise.all(CONTENT_CLASSES.map((type) => scanClass$1(fs, root, type, { origin: "corpus" }))),
		Promise.all(packRoots.map((packRoot) => Promise.all(CONTENT_CLASSES.map((type) => scanClass$1(fs, packRoot.root, type, {
			origin: "pack",
			provenance: {
				pack: packRoot.pack,
				declaredTools: packRoot.declaredTools ?? []
			}
		}))))),
		forkRoot === void 0 ? [] : Promise.all(CONTENT_CLASSES.map((type) => scanClass$1(fs, forkRoot, type, { origin: "fork" }))),
		overrideRoot === void 0 ? [] : Promise.all(CONTENT_CLASSES.map((type) => scanClass$1(fs, overrideRoot, type, { origin: "user" }))),
		forkRoot === void 0 ? [] : discoverOverlays(fs, forkRoot),
		overrideRoot === void 0 ? [] : discoverOverlays(fs, overrideRoot)
	]);
	const shippedItems = [...scanned.flatMap((result) => result.items), ...packScanned.flat().flatMap((result) => result.items)];
	const forkItems = forkScanned.flatMap((result) => result.items);
	const userItems = overrideScanned.flatMap((result) => result.items);
	const collisions = [
		...scanned.flatMap((result) => result.collisions),
		...packScanned.flat().flatMap((result) => result.collisions),
		...forkScanned.flatMap((result) => result.collisions),
		...overrideScanned.flatMap((result) => result.collisions)
	];
	const byKey = /* @__PURE__ */ new Map();
	const holders = /* @__PURE__ */ new Map();
	const duplicates = /* @__PURE__ */ new Map();
	const shadowedKeys = /* @__PURE__ */ new Set();
	resolveLayerInto({
		byKey,
		holders,
		duplicates,
		shadowedKeys
	}, [...shippedItems, ...forkItems]);
	const forkPatched = await applyOverlays(fs, forkOverlays, byKey, "fork");
	resolveLayerInto({
		byKey,
		holders,
		duplicates,
		shadowedKeys
	}, userItems);
	const userPatched = await applyOverlays(fs, userOverlays, byKey, "user");
	for (const [key, paths] of duplicates) collisions.push({
		key,
		paths,
		kind: "duplicate-id"
	});
	const survives = (item) => {
		const key = typeIdKey(item.type, item.id);
		if (!shadowedKeys.has(key)) return true;
		const holder = holders.get(key);
		return holder !== void 0 && layerRankOf(item) === layerRankOf(holder);
	};
	const resolved = [
		...shippedItems,
		...forkItems,
		...userItems
	].filter(survives);
	return {
		items: forkPatched.patched.size === 0 && userPatched.patched.size === 0 ? resolved : resolved.map((item) => {
			const afterFork = forkPatched.patched.get(item) ?? item;
			return userPatched.patched.get(afterFork) ?? afterFork;
		}),
		byKey,
		collisions,
		shadows: buildShadows([
			...shippedItems,
			...forkItems,
			...userItems
		], holders, shadowedKeys),
		skipped: [
			...scanned.flatMap((result) => result.skipped),
			...packScanned.flat().flatMap((result) => result.skipped),
			...forkScanned.flatMap((result) => result.skipped),
			...overrideScanned.flatMap((result) => result.skipped),
			...forkPatched.skipped
		]
	};
}
function originOf(item) {
	return item.origin ?? "corpus";
}
function resolveLayerInto(state, claimants) {
	const { byKey, holders, duplicates, shadowedKeys } = state;
	for (const item of claimants) {
		const key = typeIdKey(item.type, item.id);
		const existing = byKey.get(key);
		if (existing === void 0) {
			byKey.set(key, item);
			holders.set(key, item);
			continue;
		}
		if (item.provenance !== void 0) refusePackShadow(item, existing);
		if (existing.provenance !== void 0 && originOf(item) === "fork") refusePackShadow(existing, item);
		if (layerRankOf(item) > layerRankOf(existing)) {
			byKey.set(key, item);
			holders.set(key, item);
			shadowedKeys.add(key);
			continue;
		}
		duplicates.set(key, [...duplicates.get(key) ?? [existing.relativePath], item.relativePath]);
	}
}
function refusePackShadow(packItem, other) {
	const pack = packItem.provenance?.pack ?? "<pack-id>";
	const supplies = `Installed pack "${pack}" supplies ${packItem.type} "${packItem.id}" (${packItem.relativePath}), but that id is already ${claimantOf(other)}. Packs must not shadow existing content`;
	if (originOf(other) === "fork") {
		const patch = `fork/${other.relativePath.slice(0, -3)}`;
		throw new EngineError(`${supplies}, and a pack and the fork layer never share an id: the pack is refused on contact whichever arrived first, so a fork file that came with a package upgrade refuses a pack that was installed before it. From this repository, remove the pack (clean --pack ${pack}) or ask the pack's author to rename the artifact. From the fork, patch the pack's artifact with ${patch}${OVERLAY_FRONTMATTER_SUFFIX$1} or ${patch}${OVERLAY_BODY_SUFFIX$1} instead of replacing it, or ship the fork's artifact under another id.`, { code: "VALIDATION_ERROR" });
	}
	throw new EngineError(`${supplies} — \`add\` refuses this at install time, deriving the pack's ids by the same rule this walk uses, and this walk refuses it again as defence in depth for state assembled some other way. Remove the pack (clean --pack ${pack}) or rename the artifact in the pack.`, { code: "VALIDATION_ERROR" });
}
function buildShadows(claimants, holders, shadowedKeys) {
	if (shadowedKeys.size === 0) return [];
	const contested = /* @__PURE__ */ new Map();
	for (const item of claimants) {
		const key = typeIdKey(item.type, item.id);
		if (!shadowedKeys.has(key)) continue;
		const list = contested.get(key);
		if (list === void 0) contested.set(key, [item]);
		else list.push(item);
	}
	return claimants.flatMap((winner) => {
		if (layerRankOf(winner) < LAYER_RANK.fork) return [];
		const key = typeIdKey(winner.type, winner.id);
		if (holders.get(key) !== winner) return [];
		const rank = layerRankOf(winner);
		const shadowed = (contested.get(key) ?? []).filter((item) => layerRankOf(item) < rank);
		return shadowed.length === 0 ? [] : [{
			type: winner.type,
			id: winner.id,
			winner,
			shadowed
		}];
	});
}
function replacedClaimantOf(index, item) {
	return (index.shadows ?? []).find((row) => row.type === item.type && row.id === item.id)?.shadowed[0];
}
function claimantOf(existing) {
	if (existing.provenance !== void 0) return `claimed by installed pack "${existing.provenance.pack}" (${existing.relativePath})`;
	return originOf(existing) === "fork" ? `claimed by the fork-layer artifact at fork/${existing.relativePath}` : `claimed by the corpus artifact at ${existing.relativePath}`;
}
function overlayHalfOf$1(name) {
	if (name.endsWith(OVERLAY_FRONTMATTER_SUFFIX$1)) return {
		base: name.slice(0, -15),
		half: "frontmatter"
	};
	if (name.endsWith(OVERLAY_BODY_SUFFIX$1)) return {
		base: name.slice(0, -13),
		half: "body"
	};
	return null;
}
function overlayHalfName(base, half) {
	return `${base}${half === "frontmatter" ? OVERLAY_FRONTMATTER_SUFFIX$1 : OVERLAY_BODY_SUFFIX$1}`;
}
function isOverlayFileName$1(name) {
	return overlayHalfOf$1(name) !== null;
}
function mergeOverlay(base, halves) {
	const patch = halves.frontmatter === void 0 ? {} : readOverlayFrontmatter(halves.frontmatter);
	const appended = halves.body === void 0 ? void 0 : readOverlayBody(halves.body);
	const frontmatter = mergeOverlayFrontmatter(base.frontmatter, patch);
	const body = appended === void 0 ? base.body : appendOverlayBody(base.body, appended);
	const applied = [halves.frontmatter?.path, halves.body?.path].filter((path) => path !== void 0);
	return {
		frontmatter,
		body,
		raw: composeFrontmatter(frontmatter, body),
		source: `${toPosixDisplayPath(base.filePath)} (patched by ${applied.map(toPosixDisplayPath).join(", ")})`
	};
}
function readOverlayFrontmatter(half) {
	const patch = parseFrontmatterBlock(half.text, toPosixDisplayPath(half.path));
	for (const key of OVERLAY_IDENTITY_KEYS) {
		if (!Object.hasOwn(patch, key)) continue;
		throw new EngineError(`${toPosixDisplayPath(half.path)}: an overlay must not declare \`${key}\`. That is the identity the overlay is addressed BY — a patch that moved it would re-target itself and orphan its own base. Remove the \`${key}\` key.`, { code: "VALIDATION_ERROR" });
	}
	return patch;
}
function readOverlayBody(half) {
	if (half.text.length > 25e4) throw new EngineError(`${toPosixDisplayPath(half.path)}: the body patch is ${half.text.length} characters, over the ${MAX_USER_CONTENT_LENGTH}-character ceiling on user-authored content. Text past it is truncated where the artifact re-enters agent context, so the patch on disk stops being the patch the client gets — split the patch, or move the material into a skill support file.`, { code: "VALIDATION_ERROR" });
	const text = half.text.charCodeAt(0) === BOM$3 ? half.text.slice(1) : half.text;
	if (OVERLAY_OPENING_FENCE.test(text)) throw new EngineError(`${toPosixDisplayPath(half.path)}: a body overlay carries a body and nothing else, but this one opens with a \`---\` frontmatter fence. Frontmatter is patched by the other half of the pair — move those keys into the matching \`${OVERLAY_FRONTMATTER_SUFFIX$1}\` file.`, { code: "VALIDATION_ERROR" });
	return text;
}
function mergeOverlayFrontmatter(base, patch) {
	const merged = Object.create(null);
	for (const [key, value] of Object.entries(base)) {
		if (!Object.hasOwn(patch, key)) {
			merged[key] = value;
			continue;
		}
		if (patch[key] !== null) merged[key] = patch[key];
	}
	for (const [key, value] of Object.entries(patch)) {
		if (Object.hasOwn(base, key) || value === null) continue;
		merged[key] = value;
	}
	return merged;
}
function appendOverlayBody(base, appended) {
	const trimmed = base.replace(TRAILING_NEWLINES, "");
	return trimmed === "" ? appended : `${trimmed}\n\n${appended}`;
}
function refuseOrphanOverlay(paths, type, id) {
	throw new EngineError(`Overlay ${paths.map(toPosixDisplayPath).join(" and ")} patches ${type} "${id}", but no artifact of that id exists in any layer the patch can reach — not the corpus, not an installed pack, not the fork layer, not the override tree. An overlay is addressed by its filename, so this is usually a typo in it. Correct the filename, or remove the file.`, { code: "VALIDATION_ERROR" });
}
function forkOrphanSkipReason(type, id) {
	return `waits for an artifact no installed layer supplies — neither the corpus, an installed pack nor the fork layer holds ${type} "${id}", so this fork patch is skipped and nothing in it reaches emission; it applies when a pack supplies ${type} "${id}". If no pack ever will, the filename is a typo in the fork: correct it there, or remove the file.`;
}
function refusePrefixedOverlaySpelling(path, base, halfPaths = []) {
	const bare = stripEngineContentPrefix(base);
	const halves = halfPaths.length > 0 ? ` (${halfPaths.map(toPosixDisplayPath).join(" and ")})` : "";
	throw new EngineError(`${toPosixDisplayPath(path)}${halves}: an overlay filename carries the engine content prefix, which names the generated corpus, not a repo's own patch. Save it under the bare spelling ${JSON.stringify(bare)} instead — the canonical form the save gate's own reserved-prefix rule also requires.`, { code: "VALIDATION_ERROR" });
}
function refuseOverlayExclusivity(overridePath, overlayPaths) {
	const overlays = overlayPaths.map(toPosixDisplayPath).join(" and ");
	const override = toPosixDisplayPath(overridePath);
	throw new EngineError(`The override at ${override} and the overlay ${overlays} claim one identity. An artifact is either REPLACED by a full override or PATCHED by an overlay, never both — a full override is your own file, so patch it by editing it. Remove ${overlays}, or remove ${override}.`, { code: "VALIDATION_ERROR" });
}
async function discoverOverlays(fs, root) {
	return (await Promise.all(CONTENT_CLASSES.map(async (type) => {
		const { dir, layout } = CLASS_LAYOUT$1[type];
		const entries = await listDir$1(fs, join(root, dir));
		if (entries === null) return [];
		return layout === "directory" ? scanSkillOverlays(fs, root, type, entries) : fileOverlays(root, type, entries);
	}))).flat();
}
function fileOverlays(root, type, entries) {
	const { dir } = CLASS_LAYOUT$1[type];
	const found = /* @__PURE__ */ new Map();
	const overrides = /* @__PURE__ */ new Map();
	for (const entry of entries) {
		if (!entry.isFile()) continue;
		const path = join(root, dir, entry.name);
		const half = overlayHalfOf$1(entry.name);
		if (half === null) {
			if (entry.name.endsWith(ARTIFACT_EXTENSION$2)) overrides.set(slugOf(basename$1(entry.name)), path);
			continue;
		}
		if (carriesEngineContentPrefix(half.base)) refusePrefixedOverlaySpelling(path, half.base);
		const slug = slugOf(half.base);
		const existing = found.get(slug);
		const pair = existing ?? {
			type,
			slug
		};
		if (half.half === "frontmatter") pair.frontmatterPath = path;
		else pair.bodyPath = path;
		if (existing === void 0) found.set(slug, pair);
	}
	const pairs = [...found.values()];
	for (const pair of pairs) {
		const overridePath = overrides.get(pair.slug);
		if (overridePath !== void 0) pair.overridePath = overridePath;
	}
	return pairs;
}
async function scanSkillOverlays(fs, root, type, entries) {
	const { dir } = CLASS_LAYOUT$1[type];
	const skillDirs = entries.filter((entry) => entry.isDirectory());
	const listings = await pLimit(READ_CONCURRENCY$8).map(skillDirs, (entry) => listDir$1(fs, join(root, dir, entry.name)));
	const skillBase = basename$1(SKILL_FILE$5);
	return skillDirs.flatMap((entry, index) => {
		const inner = listings[index] ?? [];
		const pathOf = (name) => inner.some((candidate) => candidate.name === name && candidate.isFile()) ? join(root, dir, entry.name, name) : void 0;
		const frontmatterPath = pathOf(overlayHalfName(skillBase, "frontmatter"));
		const bodyPath = pathOf(overlayHalfName(skillBase, "body"));
		if (frontmatterPath === void 0 && bodyPath === void 0) return [];
		if (carriesEngineContentPrefix(entry.name)) refusePrefixedOverlaySpelling(join(root, dir, entry.name), entry.name, [frontmatterPath, bodyPath].filter((p) => p !== void 0));
		const overridePath = pathOf(SKILL_FILE$5);
		return [{
			type,
			slug: slugOf(entry.name),
			...frontmatterPath === void 0 ? {} : { frontmatterPath },
			...bodyPath === void 0 ? {} : { bodyPath },
			...overridePath === void 0 ? {} : { overridePath }
		}];
	});
}
async function applyOverlays(fs, overlays, byKey, layer) {
	const patched = /* @__PURE__ */ new Map();
	const skipped = [];
	if (overlays.length === 0) return {
		patched,
		skipped
	};
	const paths = overlays.flatMap(overlayPathsOf);
	const texts = await pLimit(READ_CONCURRENCY$8).map(paths, (path) => readArtifact(fs, path));
	const textByPath = new Map(paths.map((path, index) => [path, texts[index] ?? null]));
	for (const overlay of overlays) {
		const overlayPaths = overlayPathsOf(overlay);
		if (overlay.overridePath !== void 0) refuseOverlayExclusivity(overlay.overridePath, overlayPaths);
		const id = applyCommandPrefix(overlay.slug, overlay.type);
		const key = typeIdKey(overlay.type, id);
		const base = byKey.get(key);
		if (base === void 0) {
			if (layer === "user") refuseOrphanOverlay(overlayPaths, overlay.type, id);
			const reason = forkOrphanSkipReason(overlay.type, id);
			skipped.push(...overlayPaths.map((filePath) => ({
				type: overlay.type,
				filePath,
				reason
			})));
			continue;
		}
		if (originOf(base) === layer) refuseOverlayExclusivity(base.filePath, overlayPaths);
		const halves = halvesOf(overlay, textByPath);
		if (halves === null) continue;
		const merged = mergeOverlay(base, halves);
		const built = buildItem({
			type: overlay.type,
			slug: base.id,
			raw: merged.raw,
			relativePath: base.relativePath,
			filePath: base.filePath,
			source: merged.source,
			frontmatter: merged.frontmatter,
			body: merged.body,
			origin: originOf(base),
			...base.provenance === void 0 ? {} : { provenance: base.provenance }
		});
		byKey.set(key, built.item);
		patched.set(base, built.item);
	}
	return {
		patched,
		skipped
	};
}
function overlayPathsOf(overlay) {
	return [overlay.frontmatterPath, overlay.bodyPath].filter((path) => path !== void 0);
}
function halvesOf(overlay, textByPath) {
	const halfAt = (path) => {
		if (path === void 0) return void 0;
		const text = textByPath.get(path);
		return text === null || text === void 0 ? void 0 : {
			path,
			text
		};
	};
	const frontmatter = halfAt(overlay.frontmatterPath);
	const body = halfAt(overlay.bodyPath);
	if (frontmatter === void 0 && body === void 0) return null;
	return {
		...frontmatter === void 0 ? {} : { frontmatter },
		...body === void 0 ? {} : { body }
	};
}
function mergePackRoots(a, b) {
	const byPack = /* @__PURE__ */ new Map();
	for (const candidate of [...a, ...b]) {
		const existing = byPack.get(candidate.pack);
		if (existing === void 0) {
			byPack.set(candidate.pack, {
				pack: candidate.pack,
				root: candidate.root,
				...candidate.declaredTools === void 0 ? {} : { declaredTools: candidate.declaredTools }
			});
			continue;
		}
		if (existing.root !== candidate.root) throw new EngineError(`Pack "${candidate.pack}" was handed to the content walk with two different roots (${existing.root} and ${candidate.root}). One installed pack has one content root; fix the caller assembling the pack-root list.`, { code: "VALIDATION_ERROR" });
	}
	return [...byPack.values()].toSorted((x, y) => x.pack < y.pack ? -1 : x.pack > y.pack ? 1 : 0);
}
function getAllItemsById(index, id) {
	return index.items.filter((item) => item.id === id);
}
function resolveArtifactFilePath(index, type, id) {
	return index.byKey.get(typeIdKey(type, applyCommandPrefix(id, type)))?.filePath ?? null;
}
const SYMLINK_SKIP_REASON$1 = "is a symlink, and the content walk reads regular files and real directories only — this SKILL.md is not indexed, so the skill contributes nothing to emission or validate. Replace the link with the file itself.";
async function skillArtifactEntry(fs, root, dir, skillDir) {
	const entry = (await listDir$1(fs, join(root, dir, skillDir)))?.find((candidate) => candidate.name === SKILL_FILE$5);
	if (entry === void 0) return "file";
	return entry.isSymbolicLink() ? "symlink" : "file";
}
function refusePrefixedForkSpelling(path, name, layout) {
	const bare = stripEngineContentPrefix(name);
	const noun = layout === "directory" ? "skill directory" : "filename";
	throw new EngineError(`${toPosixDisplayPath(path)}: a fork-layer ${noun} carries the engine content prefix, which names the generated corpus, not the fork's own artifact. Save it under the bare spelling ${JSON.stringify(bare)} instead — a bare slug that matches a bundled artifact's id replaces it, prefix and all.`, { code: "VALIDATION_ERROR" });
}
async function scanClass$1(fs, root, type, options) {
	const { provenance } = options;
	const { dir, layout } = CLASS_LAYOUT$1[type];
	const entries = await listDir$1(fs, join(root, dir));
	const result = {
		items: [],
		collisions: [],
		skipped: []
	};
	if (entries === null) return result;
	const named = entries.filter((entry) => layout === "directory" ? entry.isDirectory() : entry.isFile()).filter((entry) => layout === "directory" || entry.name.endsWith(ARTIFACT_EXTENSION$2) && !isOverlayFileName$1(entry.name));
	const probes = layout === "directory" ? await Promise.all(named.map((entry) => skillArtifactEntry(fs, root, dir, entry.name))) : named.map(() => "file");
	const candidates = [];
	for (const [index, entry] of named.entries()) {
		const segments = layout === "directory" ? [
			dir,
			entry.name,
			SKILL_FILE$5
		] : [dir, entry.name];
		const relativePath = posix.join(...segments);
		assertSafePath(relativePath, `${dir} content walk`);
		const filePath = join(root, ...segments);
		if (options.origin === "fork" && carriesEngineContentPrefix(entry.name)) refusePrefixedForkSpelling(layout === "directory" ? join(root, dir, entry.name) : filePath, entry.name, layout);
		if (probes[index] === "symlink") {
			result.skipped.push({
				type,
				filePath,
				reason: SYMLINK_SKIP_REASON$1
			});
			continue;
		}
		candidates.push({
			relativePath,
			filePath,
			slug: slugOf(layout === "directory" ? entry.name : basename$1(entry.name))
		});
	}
	const raws = await pLimit(READ_CONCURRENCY$8).map(candidates, (candidate) => readArtifact(fs, candidate.filePath));
	for (const [index, candidate] of candidates.entries()) {
		const raw = raws[index];
		if (raw === null || raw === void 0) continue;
		const parsed = parseFrontmatter(raw, toPosixDisplayPath(candidate.filePath));
		if (!parsed.hadFrontmatter) continue;
		const built = buildItem({
			type,
			slug: candidate.slug,
			raw,
			relativePath: candidate.relativePath,
			filePath: candidate.filePath,
			frontmatter: parsed.frontmatter,
			body: parsed.body,
			origin: options.origin,
			...provenance === void 0 ? {} : { provenance }
		});
		result.items.push(built.item);
		if (built.collision !== null) result.collisions.push(built.collision);
	}
	return result;
}
function buildItem(input) {
	const { frontmatter, relativePath, slug, type } = input;
	const source = toPosixDisplayPath(input.source ?? input.filePath);
	const declared = requireString(frontmatter, "id", {
		source,
		optional: true
	})?.trim();
	const bareId = declared === void 0 || declared === "" ? slug : declared;
	assertSafePath(bareId, `${source} \`id\``);
	const id = applyCommandPrefix(bareId, type);
	const precedence = requireEnum(frontmatter, "precedence", RULE_PRECEDENCES, {
		source,
		optional: true
	});
	const tools = extractToolsFrontmatter(input.raw, source);
	return {
		item: {
			type,
			id,
			filePath: input.filePath,
			relativePath,
			description: requireString(frontmatter, "description", {
				source,
				optional: true
			}) ?? "",
			tags: requireStringArray(frontmatter, "tags", {
				source,
				optional: true
			}) ?? [],
			...precedence === void 0 ? {} : { precedence },
			...tools === void 0 ? {} : { tools },
			body: input.body,
			frontmatter,
			origin: input.origin,
			...input.provenance === void 0 ? {} : { provenance: input.provenance }
		},
		collision: id === applyCommandPrefix(slug, type) ? null : {
			key: typeIdKey(type, id),
			paths: [relativePath],
			kind: "filename-mismatch"
		}
	};
}
async function listDir$1(fs, dirPath) {
	try {
		return (await fs.readdir(dirPath, { withFileTypes: true })).toSorted(byName$1);
	} catch (error) {
		return isMissing$3(error) ? null : rethrow(error);
	}
}
async function readArtifact(fs, filePath) {
	try {
		return await fs.readFile(filePath, "utf8");
	} catch (error) {
		return isMissing$3(error) ? null : rethrow(error);
	}
}
function isMissing$3(error) {
	const code = error?.code;
	return code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR";
}
function rethrow(error) {
	throw error;
}
function byName$1(a, b) {
	if (a.name < b.name) return -1;
	return a.name > b.name ? 1 : 0;
}
function basename$1(name) {
	return name.slice(0, -3);
}
function slugOf(name) {
	return stripEngineContentPrefix(name);
}
//#endregion
//#region src/content/tags.ts
var tags_exports = /* @__PURE__ */ __exportAll({
	facetOf: () => facetOf,
	filterByLanguages: () => filterByLanguages,
	isContextTag: () => isContextTag,
	isFloorTag: () => isFloorTag,
	isLanguageTag: () => isLanguageTag,
	languageOf: () => languageOf,
	primaryTag: () => primaryTag,
	tagsByFacet: () => tagsByFacet
});
const CONTEXT_PREFIX = "ctx:";
const FLOOR_PREFIX = "floor:";
const LANGUAGE_PREFIX = "lang:";
function isContextTag(tag) {
	return tag.startsWith(CONTEXT_PREFIX);
}
function isFloorTag(tag) {
	return tag.startsWith(FLOOR_PREFIX);
}
function isLanguageTag(tag) {
	return tag.startsWith(LANGUAGE_PREFIX);
}
function facetOf(tag) {
	if (isContextTag(tag)) return "context";
	if (isFloorTag(tag)) return "floor";
	if (isLanguageTag(tag)) return "language";
	return "capability";
}
function languageOf(tag) {
	if (!isLanguageTag(tag)) return null;
	const value = tag.slice(5).trim().toLowerCase();
	return value.length > 0 ? value : null;
}
function primaryTag(tags) {
	return tags.find((tag) => facetOf(tag) === "capability") ?? tags[0] ?? null;
}
function tagsByFacet(tags) {
	const grouped = {
		capability: [],
		context: [],
		floor: [],
		language: []
	};
	for (const tag of tags) grouped[facetOf(tag)].push(tag);
	return grouped;
}
function normaliseLanguages(languages) {
	const wanted = /* @__PURE__ */ new Set();
	for (const language of languages) {
		const value = language.trim().toLowerCase();
		if (value.length > 0) wanted.add(value);
	}
	return wanted;
}
function filterByLanguages(items, languages) {
	const wanted = normaliseLanguages(languages);
	if (wanted.size === 0) return [...items];
	return items.filter((item) => {
		let hasLanguage = false;
		for (const tag of item.tags) {
			const language = languageOf(tag);
			if (language === null) continue;
			if (wanted.has(language)) return true;
			hasLanguage = true;
		}
		return !hasLanguage;
	});
}
//#endregion
//#region src/content/ruleDelivery.ts
var ruleDelivery_exports = /* @__PURE__ */ __exportAll({
	NO_DEMOTED_RULES: () => NO_DEMOTED_RULES,
	RULE_SKILL_DIR_PREFIX: () => RULE_SKILL_DIR_PREFIX,
	SHARED_SKILLS_TREE_READERS: () => SHARED_SKILLS_TREE_READERS,
	declaredRuleGlobs: () => declaredRuleGlobs,
	demotedRuleIds: () => demotedRuleIds,
	ruleAnchor: () => ruleAnchor,
	ruleDeliveryInputOf: () => ruleDeliveryInputOf
});
const SHARED_SKILLS_TREE_READERS = new Set(TOOLS.filter((tool) => tool !== "claude"));
const RULE_SKILL_DIR_PREFIX = "stamity-";
const NO_DEMOTED_RULES = Object.freeze({
	claude: /* @__PURE__ */ new Set(),
	cursor: /* @__PURE__ */ new Set(),
	copilot: /* @__PURE__ */ new Set(),
	codex: /* @__PURE__ */ new Set()
});
function demotedRuleIds(tool, rules, mode, sharedTreeReaders = /* @__PURE__ */ new Set()) {
	if (mode === "always-on" || tool === "cursor") return /* @__PURE__ */ new Set();
	const projectable = (rule) => rule.tools === void 0 || [...sharedTreeReaders].every((reader) => rule.tools.includes(reader));
	const demotes = tool === "codex" ? (rule) => !rule.critical && !rule.floorTagged && !rule.anchored && projectable(rule) : (rule) => !rule.critical && !rule.floorTagged && !rule.globScoped && projectable(rule);
	return new Set(rules.filter((rule) => demotes(rule)).map((rule) => rule.id));
}
function ruleDeliveryInputOf(item) {
	const globs = declaredRuleGlobs(item);
	return {
		id: item.id,
		globScoped: globs.length > 0,
		critical: item.precedence === "critical",
		floorTagged: item.tags.some(isFloorTag),
		anchored: ruleAnchor(globs) !== null,
		...item.tools === void 0 ? {} : { tools: item.tools }
	};
}
function declaredRuleGlobs(item) {
	const declared = item.frontmatter.globs;
	return (Array.isArray(declared) ? declared : typeof declared === "string" ? declared.split(",") : []).filter((value) => typeof value === "string").map((value) => value.trim()).filter((value) => value !== "");
}
const WILDCARD_PATTERN = /[*?[\]{}!]/;
function ruleAnchor(globs) {
	let common = null;
	for (const glob of globs) {
		const anchor = anchorOfGlob(glob);
		if (anchor === null) return null;
		const segments = anchor.split("/");
		if (common === null) {
			common = segments;
			continue;
		}
		const shared = [];
		for (const [index, segment] of common.entries()) {
			if (segments[index] !== segment) break;
			shared.push(segment);
		}
		common = shared;
		if (common.length === 0) return null;
	}
	return common === null || common.length === 0 ? null : common.join("/");
}
function anchorOfGlob(glob) {
	const normalized = glob.replaceAll("\\", "/").replace(/^\.\//, "");
	if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) return null;
	const segments = normalized.split("/");
	const dirs = [];
	for (const [index, segment] of segments.entries()) {
		if (index === segments.length - 1) break;
		if (WILDCARD_PATTERN.test(segment)) break;
		if (segment === "" || segment === ".") continue;
		if (segment === "..") return null;
		if (dirs.length === 0 && segment === ".stamity") return null;
		dirs.push(segment);
	}
	return dirs.length === 0 ? null : dirs.join("/");
}
//#endregion
//#region src/content/selection.ts
var selection_exports = /* @__PURE__ */ __exportAll({
	buildSelectionAllowlist: () => buildSelectionAllowlist,
	classifySelection: () => classifySelection,
	countSelectionItems: () => countSelectionItems,
	getAllContentIds: () => getAllContentIds,
	isIdInSelection: () => isIdInSelection,
	resolveSelection: () => resolveSelection,
	selectionSummary: () => selectionSummary
});
function buildSelectionAllowlist(selection) {
	const allowlist = {};
	for (const type of CONTENT_CLASSES) {
		const ids = selection.items[type];
		if (!Array.isArray(ids)) continue;
		allowlist[type] = new Set(ids);
	}
	return allowlist;
}
function isIdInSelection(allowlist, type, id) {
	const selected = allowlist[type];
	if (selected === void 0) return true;
	if (selected.has(id)) return true;
	if (type !== "command") return false;
	return selected.has(applyCommandPrefix(id, type)) || selected.has(stripCommandPrefix(id));
}
function classifySelection(item, allowlist) {
	const origin = originOf(item);
	if (origin === "user" || origin === "fork") return "keep";
	if (isIdInSelection(allowlist, item.type, item.id)) return "keep";
	return item.tags.some(isFloorTag) ? "keep-protected-missing" : "drop";
}
function resolveSelection(index, opts) {
	const requested = buildRequestedAllowlist(opts.ids);
	assertKnownIds(index, opts.ids);
	const include = normaliseTags(opts.includeTags);
	const exclude = normaliseTags(opts.excludeTags);
	const selected = filterByLanguages(index.items.filter((item) => {
		if (item.tags.some(isFloorTag)) return true;
		if (!isIdInSelection(requested, item.type, item.id)) return false;
		if (include.size > 0 && !item.tags.some((tag) => include.has(tag))) return false;
		return !item.tags.some((tag) => exclude.has(tag));
	}), opts.languages ?? []);
	const items = emptyItems();
	for (const item of selected) items[item.type].push(item.id);
	return { items };
}
function countSelectionItems(selection) {
	return CONTENT_CLASSES.reduce((total, type) => total + (selection.items[type]?.length ?? 0), 0);
}
function selectionSummary(selection) {
	const parts = CONTENT_CLASSES.flatMap((type) => {
		const count = selection.items[type]?.length ?? 0;
		return count === 0 ? [] : [`${count} ${type}${count === 1 ? "" : "s"}`];
	});
	return parts.length === 0 ? "nothing selected" : parts.join(", ");
}
function getAllContentIds(selection) {
	const ids = /* @__PURE__ */ new Set();
	for (const type of CONTENT_CLASSES) for (const id of selection.items[type] ?? []) ids.add(id);
	return ids;
}
function buildRequestedAllowlist(ids) {
	const requested = {};
	if (ids === void 0) return requested;
	for (const type of CONTENT_CLASSES) {
		const list = ids[type];
		if (list === void 0) continue;
		requested[type] = new Set(list.map((id) => applyCommandPrefix(id.trim(), type)));
	}
	return requested;
}
function assertKnownIds(index, ids) {
	if (ids === void 0) return;
	const unknown = [];
	for (const type of CONTENT_CLASSES) for (const id of ids[type] ?? []) {
		const resolved = applyCommandPrefix(id.trim(), type);
		if (index.byKey.has(typeIdKey(type, resolved))) continue;
		unknown.push(`${type} ${JSON.stringify(id)}`);
	}
	if (unknown.length === 0) return;
	throw new EngineError(`Unknown content ${unknown.length === 1 ? "id" : "ids"} in the selection: ${unknown.join(", ")}. Every selected id must exist in the installed content corpus — correct the ids or drop them from the selection.`, { code: "VALIDATION_ERROR" });
}
function normaliseTags(tags) {
	const wanted = /* @__PURE__ */ new Set();
	for (const tag of tags ?? []) {
		const value = tag.trim();
		if (value !== "") wanted.add(value);
	}
	return wanted;
}
function stripCommandPrefix(id) {
	return id.startsWith("cmd-") ? id.slice(4) : id;
}
function emptyItems() {
	return {
		agent: [],
		skill: [],
		rule: [],
		command: []
	};
}
//#endregion
//#region src/emit/substitution.ts
var substitution_exports = /* @__PURE__ */ __exportAll({
	CI_PROVIDER_TOKEN: () => CI_PROVIDER_TOKEN,
	DETECTION_UNKNOWN: () => DETECTION_UNKNOWN,
	INVARIANTS_VERSION_TOKEN: () => INVARIANTS_VERSION_TOKEN,
	LINTER_TOKEN: () => LINTER_TOKEN,
	MATURITY_TIER_TOKEN: () => MATURITY_TIER_TOKEN,
	REPO_SUBSTITUTION_TOKENS: () => REPO_SUBSTITUTION_TOKENS,
	TEST_FRAMEWORK_TOKEN: () => TEST_FRAMEWORK_TOKEN,
	VERIFY_GATE_ALL_TOKEN: () => VERIFY_GATE_ALL_TOKEN,
	VERIFY_GATE_LINT_TOKEN: () => VERIFY_GATE_LINT_TOKEN,
	VERIFY_GATE_TEST_TOKEN: () => VERIFY_GATE_TEST_TOKEN,
	VERIFY_GATE_TYPECHECK_TOKEN: () => VERIFY_GATE_TYPECHECK_TOKEN,
	detectionContextFromManifest: () => detectionContextFromManifest,
	renderDetectionList: () => renderDetectionList,
	renderInvariantsVersion: () => renderInvariantsVersion,
	substituteCharterTokens: () => substituteCharterTokens,
	substituteRepoTokens: () => substituteRepoTokens,
	substituteVerificationGateTokens: () => substituteVerificationGateTokens
});
const DETECTION_UNKNOWN = "unknown";
const LINTER_TOKEN = "${STAMITY:LINTER}";
const TEST_FRAMEWORK_TOKEN = "${STAMITY:TEST_FRAMEWORK}";
const CI_PROVIDER_TOKEN = "${STAMITY:CI_PROVIDER}";
const MATURITY_TIER_TOKEN = "${STAMITY:MATURITY_TIER}";
const VERIFY_GATE_TEST_TOKEN = "${STAMITY:VERIFY_GATE_TEST}";
const VERIFY_GATE_LINT_TOKEN = "${STAMITY:VERIFY_GATE_LINT}";
const VERIFY_GATE_TYPECHECK_TOKEN = "${STAMITY:VERIFY_GATE_TYPECHECK}";
const VERIFY_GATE_ALL_TOKEN = "${STAMITY:VERIFY_GATE_ALL}";
const INVARIANTS_VERSION_TOKEN = "${STAMITY:INVARIANTS_VERSION}";
const REPO_SUBSTITUTION_TOKENS = [
	LINTER_TOKEN,
	TEST_FRAMEWORK_TOKEN,
	CI_PROVIDER_TOKEN,
	MATURITY_TIER_TOKEN,
	VERIFY_GATE_TEST_TOKEN,
	VERIFY_GATE_LINT_TOKEN,
	VERIFY_GATE_TYPECHECK_TOKEN,
	VERIFY_GATE_ALL_TOKEN,
	INVARIANTS_VERSION_TOKEN
];
const TOKEN_PREFIX = "${STAMITY:";
const TOKEN_PATTERN = /\$\{STAMITY:[A-Z_]+\}/g;
function substituteTokens(content, values) {
	if (!content.includes(TOKEN_PREFIX)) return content;
	return content.replace(TOKEN_PATTERN, (token) => values.get(token) ?? token);
}
function renderDetectionList(values) {
	if (!values) return DETECTION_UNKNOWN;
	const named = values.map((value) => value.trim()).filter((value) => value.length > 0);
	return named.length === 0 ? DETECTION_UNKNOWN : named.join(", ");
}
function detectionContextFromManifest(manifest) {
	const detected = manifest.detected;
	return {
		linters: detected ? [...detected.linters] : [],
		testFrameworks: detected ? [...detected.testFrameworks] : [],
		ciProviders: detected ? [...detected.ciProviders] : [],
		...manifest.maturityTier === void 0 ? {} : { maturityTier: manifest.maturityTier }
	};
}
function substituteRepoTokens(content, ctx) {
	return substituteTokens(content, /* @__PURE__ */ new Map([
		[LINTER_TOKEN, renderDetectionList(ctx.linters)],
		[TEST_FRAMEWORK_TOKEN, renderDetectionList(ctx.testFrameworks)],
		[CI_PROVIDER_TOKEN, renderDetectionList(ctx.ciProviders)],
		[MATURITY_TIER_TOKEN, ctx.maturityTier ?? "solo"]
	]));
}
function substituteVerificationGateTokens(content, gates) {
	return substituteTokens(content, /* @__PURE__ */ new Map([
		[VERIFY_GATE_TEST_TOKEN, gates.test],
		[VERIFY_GATE_LINT_TOKEN, gates.lint],
		[VERIFY_GATE_TYPECHECK_TOKEN, gates.typecheck],
		[VERIFY_GATE_ALL_TOKEN, gates.all]
	]));
}
function renderInvariantsVersion(invariants) {
	return `${invariants.version} · ratified ${invariants.ratified} · last amended ${invariants.amended}`;
}
function substituteCharterTokens(content, invariants) {
	return substituteTokens(content, /* @__PURE__ */ new Map([[INVARIANTS_VERSION_TOKEN, renderInvariantsVersion(invariants)]]));
}
//#endregion
//#region src/content/charter.ts
var charter_exports = /* @__PURE__ */ __exportAll({
	ALWAYS_ON_BUDGET_LINES: () => ALWAYS_ON_BUDGET_LINES,
	ALWAYS_ON_SHARED_BYTES_WITHOUT_CODEX: () => ALWAYS_ON_SHARED_BYTES_WITHOUT_CODEX,
	ALWAYS_ON_SHARED_BYTES_WITH_CODEX: () => ALWAYS_ON_SHARED_BYTES_WITH_CODEX,
	CHARTER_MAX_LINES: () => 150,
	CHARTER_RELATIVE_PATH: () => CHARTER_RELATIVE_PATH,
	DESCRIPTION_PULL_TOOLS: () => DESCRIPTION_PULL_TOOLS,
	RULE_APPENDIX_TOOLS: () => RULE_APPENDIX_TOOLS,
	composeAlwaysOnLoad: () => composeAlwaysOnLoad,
	readCharterTemplate: () => readCharterTemplate
});
const CHARTER_RELATIVE_PATH = "charter/stamity-charter.md";
const DESCRIPTION_PULL_TOOLS = /* @__PURE__ */ new Set(["cursor"]);
const RULE_APPENDIX_TOOLS = /* @__PURE__ */ new Set(["codex"]);
const ALWAYS_ON_BUDGET_LINES = {
	cursor: 95,
	claude: 95,
	copilot: 95,
	codex: 407
};
const ALWAYS_ON_SHARED_BYTES_WITH_CODEX = 24952;
const ALWAYS_ON_SHARED_BYTES_WITHOUT_CODEX = 5192;
function composeAlwaysOnLoad(tool, plan, mode = RULE_DELIVERY_DEFAULT) {
	const demoted = demotedRuleIds(tool, plan.rules, mode, SHARED_SKILLS_TREE_READERS);
	return plan.rules.filter((rule) => {
		if (demoted.has(rule.id)) return false;
		if (RULE_APPENDIX_TOOLS.has(tool)) return true;
		if (DESCRIPTION_PULL_TOOLS.has(tool)) return false;
		return !rule.globScoped;
	}).reduce((total, rule) => total + rule.lineCount, plan.charterLines);
}
async function readCharterTemplate(contentRoot) {
	const root = contentRoot ?? resolveBundledContentRoot();
	const filePath = join(root, CHARTER_RELATIVE_PATH);
	let raw;
	try {
		raw = await readFile(filePath, "utf8");
	} catch (error) {
		if (isMissing$2(error)) throw new EngineError(`Charter template not found at ${filePath}. The charter is the single always-on artifact; a corpus without it cannot emit a setup. Reinstall the package, or restore ${CHARTER_RELATIVE_PATH} under the content root.`, {
			code: "VALIDATION_ERROR",
			cause: error
		});
		throw new EngineError(`Cannot read the charter template at ${filePath}: ${messageOf$3(error)}`, {
			code: "FS_ERROR",
			cause: error
		});
	}
	const lineCount = countLines$2(raw);
	if (lineCount > 150) throw new EngineError(`Charter template ${filePath} is ${lineCount} lines; the always-on budget caps it at 150 physical lines, frontmatter included. Cut content or demote it to the conditional layer (rules/skills).`, { code: "VALIDATION_ERROR" });
	const parsed = parseFrontmatter(raw, filePath);
	return {
		frontmatter: parsed.frontmatter,
		invariants: readInvariants(parsed.frontmatter, parsed.body, filePath),
		body: parsed.body,
		lineCount,
		relativePath: CHARTER_RELATIVE_PATH
	};
}
const INVARIANTS_KEYS = [
	"invariants_version",
	"invariants_ratified",
	"invariants_amended"
];
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const ISO_DATE_PATTERN$1 = /^\d{4}-\d{2}-\d{2}$/;
function readInvariants(frontmatter, body, filePath) {
	if (!INVARIANTS_KEYS.some((key) => Object.hasOwn(frontmatter, key)) && !body.includes("${STAMITY:INVARIANTS_VERSION}")) return null;
	const version = requireField(frontmatter, "invariants_version", SEMVER_PATTERN, filePath);
	const ratified = requireField(frontmatter, "invariants_ratified", ISO_DATE_PATTERN$1, filePath);
	const amended = requireField(frontmatter, "invariants_amended", ISO_DATE_PATTERN$1, filePath);
	if (amended < ratified) throw new EngineError(`Charter template ${filePath}: invariants_amended (${amended}) is earlier than invariants_ratified (${ratified}). An amendment cannot predate the ratification it amends; fix whichever date is wrong.`, { code: "VALIDATION_ERROR" });
	return {
		version,
		ratified,
		amended
	};
}
function requireField(frontmatter, key, pattern, filePath) {
	const value = Object.hasOwn(frontmatter, key) ? frontmatter[key] : void 0;
	if (value === void 0) throw new EngineError(`Charter template ${filePath} declares no \`${key}\`. The invariants version is rendered into every client's always-on file, so the key is required; add it to the frontmatter and record the amendment in docs/doctrine.md.`, { code: "VALIDATION_ERROR" });
	const text = typeof value === "string" ? value : String(value);
	if (!pattern.test(text)) throw new EngineError(`Charter template ${filePath}: \`${key}\` is \`${text}\`, which does not match ${pattern.source}. Fix the frontmatter value.`, { code: "VALIDATION_ERROR" });
	return text;
}
function countLines$2(raw) {
	if (raw === "") return 0;
	const lines = raw.split(/\r?\n/);
	return lines.at(-1) === "" ? lines.length - 1 : lines.length;
}
function isMissing$2(error) {
	const code = error?.code;
	return code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR";
}
function messageOf$3(error) {
	return error instanceof Error ? error.message : String(error);
}
//#endregion
//#region src/detect/verificationGates.ts
var verificationGates_exports = /* @__PURE__ */ __exportAll({
	DEFAULT_GATE_COMMANDS: () => DEFAULT_GATE_COMMANDS,
	unresolvedGate: () => unresolvedGate,
	verificationCommandsFor: () => verificationCommandsFor,
	verificationGatesFor: () => verificationGatesFor
});
const RUN_PREFIX = {
	npm: "npm run",
	pnpm: "pnpm run",
	yarn: "yarn",
	bun: "bun run"
};
const NODE_LANGUAGES$1 = /* @__PURE__ */ new Set(["typescript", "javascript"]);
function nodeGate(prefix, typed) {
	return {
		test: `${prefix} test`,
		lint: `${prefix} lint`,
		...typed ? { typecheck: `${prefix} typecheck` } : {}
	};
}
const LANGUAGE_GATES = {
	typescript: nodeGate("npm run", true),
	javascript: nodeGate("npm run", false),
	python: {
		test: "pytest",
		lint: "ruff check .",
		typecheck: "mypy ."
	},
	go: {
		test: "go test ./...",
		lint: "golangci-lint run",
		typecheck: "go vet ./..."
	},
	rust: {
		test: "cargo test",
		lint: "cargo clippy -- -D warnings",
		typecheck: "cargo check"
	},
	java: {
		test: "mvn test",
		lint: "mvn checkstyle:check",
		typecheck: "mvn -q compile"
	},
	kotlin: {
		test: "gradle test",
		lint: "gradle ktlintCheck"
	},
	ruby: {
		test: "bundle exec rspec",
		lint: "bundle exec rubocop"
	},
	php: {
		test: "vendor/bin/phpunit",
		lint: "vendor/bin/phpstan analyse"
	},
	swift: {
		test: "swift test",
		lint: "swiftlint",
		typecheck: "swift build"
	},
	dart: {
		test: "dart test",
		lint: "dart analyze"
	},
	elixir: {
		test: "mix test",
		lint: "mix credo",
		typecheck: "mix dialyzer"
	},
	csharp: {
		test: "dotnet test",
		lint: "dotnet format --verify-no-changes",
		typecheck: "dotnet build --no-restore"
	},
	scala: {
		test: "sbt test",
		lint: "sbt scalafmtCheckAll",
		typecheck: "sbt compile"
	},
	zig: {
		test: "zig build test",
		lint: "zig fmt --check ."
	},
	ocaml: {
		test: "dune test",
		lint: "dune build @fmt",
		typecheck: "dune build"
	},
	haskell: {
		test: "stack test",
		lint: "hlint .",
		typecheck: "stack build"
	},
	clojure: {
		test: "lein test",
		lint: "clj-kondo --lint src"
	},
	lua: {
		test: "busted",
		lint: "luacheck ."
	}
};
const GATE_LANGUAGE_PRECEDENCE = [
	"rust",
	"go",
	"java",
	"kotlin",
	"scala",
	"csharp",
	"swift",
	"dart",
	"elixir",
	"haskell",
	"ocaml",
	"clojure",
	"zig",
	"lua",
	"ruby",
	"php",
	"python",
	"typescript",
	"javascript"
];
const GATE_SCRIPTS = [
	"test",
	"lint",
	"typecheck"
];
const NODE_TEST_BINARIES = [
	["vitest", "vitest run"],
	["jest", "jest"],
	["mocha", "mocha"],
	["playwright", "playwright test"],
	["cypress", "cypress run"]
];
const NODE_LINT_BINARIES = [
	["eslint", "eslint ."],
	["biome", "biome check ."],
	["oxlint", "oxlint"],
	["prettier", "prettier --check ."]
];
const DEFAULT_GATE_COMMANDS = filled(commandsFrom(nodeGate("npm run", true)));
const EXEC_PREFIX = {
	npm: "npx --no",
	pnpm: "pnpm exec",
	yarn: "yarn exec",
	bun: "bunx"
};
function verificationCommandsFor(detected) {
	if (detected === void 0) return DEFAULT_GATE_COMMANDS;
	const languages = stringList$1(detected.languages) ?? [];
	const scripts = stringList$1(detected.packageScripts);
	const found = rankedLanguage(languages, scripts);
	if (found !== null && !NODE_LANGUAGES$1.has(found.language)) return commandsFrom(found.gate);
	const name = detected.packageManager;
	if (found === null && name === void 0 && scripts === void 0) return {};
	return nodeCommands(typeof name === "string" && Object.hasOwn(RUN_PREFIX, name) ? name : "npm", found?.language ?? null, detected, scripts);
}
function verificationGatesFor(detected, configured = {}) {
	return filled(withConfigured(verificationCommandsFor(detected), configured));
}
function withConfigured(commands, configured) {
	const { test, lint, typecheck, all } = configured;
	if (test === void 0 && lint === void 0 && typecheck === void 0 && all === void 0) return commands;
	const merged = compose(test ?? commands.test, lint ?? commands.lint, typecheck ?? commands.typecheck);
	return all === void 0 ? merged : {
		...merged,
		all
	};
}
function filled(commands) {
	return {
		test: commands.test ?? unresolvedGate("test"),
		lint: commands.lint ?? unresolvedGate("lint"),
		typecheck: commands.typecheck ?? unresolvedGate("typecheck"),
		all: commands.all ?? unresolvedGate("full-gate")
	};
}
function unresolvedGate(kind) {
	return `${DETECTION_UNKNOWN} — no ${kind} command detected; ask the user`;
}
function rankedLanguage(languages, scripts) {
	const detected = new Set(languages);
	if (scripts !== void 0 && GATE_SCRIPTS.some((script) => scripts.includes(script))) for (const node of NODE_LANGUAGES$1) {
		const gate = LANGUAGE_GATES[node];
		if (detected.has(node) && gate !== void 0) return {
			language: node,
			gate
		};
	}
	for (const language of GATE_LANGUAGE_PRECEDENCE) {
		const gate = LANGUAGE_GATES[language];
		if (detected.has(language) && gate !== void 0) return {
			language,
			gate
		};
	}
	return null;
}
function nodeCommands(manager, language, detected, scripts) {
	const run = RUN_PREFIX[manager];
	const exec = EXEC_PREFIX[manager];
	const gate = (script, binary) => {
		if (scripts === void 0 || scripts.includes(script)) return `${run} ${script}`;
		return binary === void 0 ? void 0 : `${exec} ${binary}`;
	};
	const test = gate("test", firstBinary(NODE_TEST_BINARIES, detected.testFrameworks));
	const lint = gate("lint", firstBinary(NODE_LINT_BINARIES, detected.linters));
	return compose(test, lint, scripts?.includes("typecheck") === true ? `${run} typecheck` : language === "typescript" ? gate("typecheck", "tsc --noEmit") : language === "javascript" ? lint : void 0);
}
function firstBinary(table, detected) {
	const names = stringList$1(detected);
	if (names === void 0) return void 0;
	const found = new Set(names);
	for (const [name, command] of table) if (found.has(name)) return command;
}
function commandsFrom(gate) {
	return compose(gate.test, gate.lint, gate.typecheck ?? gate.lint);
}
function compose(test, lint, typecheck) {
	const chain = [...new Set([
		lint,
		typecheck,
		test
	].filter((step) => step !== void 0))];
	return {
		...test === void 0 ? {} : { test },
		...lint === void 0 ? {} : { lint },
		...typecheck === void 0 ? {} : { typecheck },
		...chain.length === 0 ? {} : { all: chain.join(" && ") }
	};
}
function stringList$1(value) {
	if (!Array.isArray(value)) return void 0;
	return value.every((entry) => typeof entry === "string") ? value : void 0;
}
//#endregion
//#region src/merge/fsErrors.ts
var fsErrors_exports = /* @__PURE__ */ __exportAll({ mapFsErrno: () => mapFsErrno });
const FS_ERRNO_MESSAGE = {
	ENOSPC: (p) => `Not enough disk space to write ${p}. Free up space and re-run the command.`,
	EACCES: (p) => `Permission denied writing ${p}. Check file/directory permissions and confirm the current user has write access.`,
	EDQUOT: (p) => `Filesystem quota exceeded writing ${p}. Free space under your quota or ask an admin to raise it, then re-run.`,
	EROFS: (p) => `Read-only filesystem at ${p}. The mount may be in recovery/snapshot mode — remount read-write and re-run.`,
	EFBIG: (p) => `File too large for the filesystem at ${p}. Move ${dirname(p)} to a filesystem that supports larger files (ext4/APFS/NTFS instead of FAT32).`,
	EMFILE: (p) => `Too many open files writing ${p}. Raise the file-descriptor limit (\`ulimit -n\`) or close other tools holding descriptors, then re-run.`,
	ENFILE: (p) => `System-wide open-file limit reached writing ${p}. Close other processes or raise the system fd limit, then re-run.`,
	EIO: (p) => `Low-level I/O error writing ${p}. The disk may be failing — check kernel logs (dmesg / Console.app) and consider running fsck.`,
	ENOENT: (p) => `Cannot write ${p}: the parent directory ${dirname(p)} does not exist (or a path component was removed mid-operation). Create it with \`mkdir -p ${dirname(p)}\` and re-run the command.`
};
function mapFsErrno(err, filePath) {
	const code = err?.code;
	const messageFor = typeof code === "string" ? FS_ERRNO_MESSAGE[code] : void 0;
	return messageFor === void 0 ? null : new EngineError(messageFor(filePath), {
		code: "FS_ERROR",
		cause: err
	});
}
//#endregion
//#region src/merge/atomicWrite.ts
var atomicWrite_exports = /* @__PURE__ */ __exportAll({
	LOCK_RETRY_TOTAL_BACKOFF_MS: () => LOCK_RETRY_TOTAL_BACKOFF_MS,
	RENAME_RETRY_CEILING_MS: () => RENAME_RETRY_CEILING_MS,
	RENAME_RETRY_COUNT: () => RENAME_RETRY_COUNT,
	acquireWriteLock: () => acquireWriteLock,
	assertWriteTargetContained: () => assertWriteTargetContained,
	atomicWriteFile: () => atomicWriteFile,
	atomicWriteFileUnlocked: () => atomicWriteFileUnlocked,
	detectConcurrentWriteRisk: () => detectConcurrentWriteRisk,
	disableCrossProcessLocking: () => disableCrossProcessLocking,
	enableDefaultCrossProcessLocking: () => enableDefaultCrossProcessLocking,
	formatOrphanTmpSweepDiagnostic: () => formatOrphanTmpSweepDiagnostic,
	isCrossProcessLockingEnabled: () => isCrossProcessLockingEnabled,
	isSharedRegularFile: () => isSharedRegularFile,
	readDirectoryIdentity: () => readDirectoryIdentity,
	resetCrossProcessLocking: () => resetCrossProcessLocking,
	resolveNonClobberingBakPath: () => resolveNonClobberingBakPath,
	sameDirectoryIdentity: () => sameDirectoryIdentity,
	sweepOrphanTmpFiles: () => sweepOrphanTmpFiles,
	syncParentDirectory: () => syncParentDirectory,
	verifyBackup: () => verifyBackup
});
function errnoCode$3(err) {
	const code = err?.code;
	return typeof code === "string" ? code : void 0;
}
function describeError$5(err) {
	return err instanceof Error ? err.message : String(err);
}
async function fileExists$1(path) {
	try {
		await lstat(path);
		return true;
	} catch (err) {
		if (errnoCode$3(err) !== "ENOENT") throw err;
		return false;
	}
}
function isSharedRegularFile(entry) {
	return entry.isFile() && entry.nlink > 1;
}
const LOCK_RETRIES = 5;
const LOCK_RETRY_MIN_MS = 100;
const LOCK_RETRY_MAX_MS = 1500;
const LOCK_RETRY_FACTOR = 2;
const LOCK_RETRY_TOTAL_BACKOFF_MS = Array.from({ length: LOCK_RETRIES }, (_, attempt) => Math.min(LOCK_RETRY_MIN_MS * LOCK_RETRY_FACTOR ** attempt, LOCK_RETRY_MAX_MS)).reduce((sum, wait) => sum + wait, 0);
const LOCK_STALE_DEFAULT_MS = 15e3;
const LOCK_STALE_MIN_MS = 2e3;
function resolveLockStaleMs() {
	const parsed = readEnvInt("STAMITY_LOCK_STALE_MS");
	if (parsed === void 0 || parsed <= 0) return LOCK_STALE_DEFAULT_MS;
	return Math.max(parsed, LOCK_STALE_MIN_MS);
}
const LOCK_REFRESH_DIVISOR = 3;
const LOCK_REFRESH_CAP_MS = 3e3;
function resolveLockRefreshMs(staleMs) {
	return Math.min(Math.floor(staleMs / LOCK_REFRESH_DIVISOR), LOCK_REFRESH_CAP_MS);
}
const HELD_LOCKS = /* @__PURE__ */ new Map();
const IN_PROCESS_LOCK_WAIT_MS = 5e3;
async function reserveInProcessLock(filePath, kind) {
	const deadline = Date.now() + IN_PROCESS_LOCK_WAIT_MS;
	for (;;) {
		const held = HELD_LOCKS.get(filePath);
		if (held === void 0) {
			HELD_LOCKS.set(filePath, {
				kind,
				waiters: []
			});
			return;
		}
		const remainingMs = deadline - Date.now();
		if (!(remainingMs > 0 && await new Promise((resolveWake) => {
			const timer = setTimeout(() => resolveWake(false), remainingMs);
			held.waiters.push(() => {
				clearTimeout(timer);
				resolveWake(true);
			});
		}))) throw new EngineError(`Timed out waiting for the in-process write lock on ${filePath} after ~${Math.round(IN_PROCESS_LOCK_WAIT_MS / 1e3)}s. Another task in this process is writing to the same file; await same-path writes sequentially, or retry once it finishes.`, { code: "LOCK_TIMEOUT" });
	}
}
function releaseInProcessLock(filePath) {
	const entry = HELD_LOCKS.get(filePath);
	HELD_LOCKS.delete(filePath);
	if (entry) for (const wake of entry.waiters) wake();
}
let lockingDisabledForProcess = false;
function disableCrossProcessLocking() {
	lockingDisabledForProcess = true;
}
function enableDefaultCrossProcessLocking() {
	lockingDisabledForProcess = false;
}
function resetCrossProcessLocking() {
	lockingDisabledForProcess = false;
}
function isLockingEnabled() {
	const env = readEnvBool("STAMITY_LOCK");
	if (env !== void 0) return env;
	return !lockingDisabledForProcess;
}
function isCrossProcessLockingEnabled() {
	return isLockingEnabled();
}
async function acquireWriteLock(filePath, boundaryDir) {
	return acquireWriteLockImpl(filePath, "external", boundaryDir);
}
async function acquireWriteLockImpl(filePath, kind, boundaryDir) {
	filePath = resolve(filePath);
	if (!isLockingEnabled()) return async () => {};
	const held = HELD_LOCKS.get(filePath);
	if (held !== void 0 && kind === "internal-write" && held.kind === "external") return async () => {};
	await reserveInProcessLock(filePath, kind);
	const lockfilePath = `${filePath}.lock`;
	try {
		await assertWriteTargetContained(filePath, boundaryDir);
		await mkdir(dirname(filePath), { recursive: true });
		if ((await probeComponent(lockfilePath, filePath))?.isLink === true) throw new EngineError(`Refusing to take the write lock for ${filePath}: ${lockfilePath} is a symbolic link. The lock is a directory this process creates and removes, so a link standing in its place blocks every write to this file. Remove ${lockfilePath} and re-run.`, { code: "FS_ERROR" });
		const staleMs = resolveLockStaleMs();
		const release = await lock(filePath, {
			lockfilePath,
			realpath: false,
			stale: staleMs,
			update: resolveLockRefreshMs(staleMs),
			onCompromised: (err) => {
				console.error(`The write lock on ${filePath} was compromised before it was released: ${describeError$5(err)}. Another process may have taken ${lockfilePath} as stale and written concurrently — re-check the file, and re-run once no other process is active.`);
			},
			retries: {
				retries: LOCK_RETRIES,
				minTimeout: LOCK_RETRY_MIN_MS,
				maxTimeout: LOCK_RETRY_MAX_MS,
				factor: LOCK_RETRY_FACTOR
			}
		});
		let released = false;
		return async () => {
			if (released) return;
			released = true;
			try {
				await release();
			} finally {
				releaseInProcessLock(filePath);
			}
		};
	} catch (err) {
		releaseInProcessLock(filePath);
		if (errnoCode$3(err) === "ELOCKED") throw new EngineError(`Timed out acquiring the write lock on ${filePath} after ~${Math.round(LOCK_RETRY_TOTAL_BACKOFF_MS / 1e3)}s of retries. Another process is writing to the same file. Re-run once it finishes, or remove a stale ${lockfilePath} if no other process is active.`, {
			code: "LOCK_TIMEOUT",
			cause: err
		});
		throw mapFsErrno(err, filePath) ?? err;
	}
}
const DIR_SYNC_TOLERATED_ERRNOS = /* @__PURE__ */ new Set([
	"EPERM",
	"ENOTSUP",
	"EINVAL",
	"EISDIR",
	"EBADF"
]);
async function syncParentDirectory(filePath) {
	const dir = dirname(filePath);
	let dh;
	try {
		dh = await open(dir, "r");
	} catch (err) {
		const code = errnoCode$3(err);
		if (code !== void 0 && DIR_SYNC_TOLERATED_ERRNOS.has(code)) return;
		throw err;
	}
	try {
		await dh.datasync();
	} catch (err) {
		const code = errnoCode$3(err);
		if (code === void 0 || !DIR_SYNC_TOLERATED_ERRNOS.has(code)) throw err;
	} finally {
		await dh.close();
	}
}
function sameDirectoryIdentity(a, b) {
	return a.dev === b.dev && a.ino === b.ino;
}
async function readDirectoryIdentity(dir) {
	const info = await stat(dir);
	return {
		dev: info.dev,
		ino: info.ino
	};
}
function isWithinDir(candidate, root) {
	return candidate === root || candidate.startsWith(join(root, sep));
}
function pathEscapedBoundary(filePath, boundaryDir) {
	return new EngineError(`Refusing to write ${filePath}: its parent directory resolves outside ${boundaryDir}. A directory on the path is a symbolic link pointing out of the tree this write is confined to. Remove the link (or re-run against the real directory) — the engine never follows one out of the repository it was pointed at.`, { code: "FS_ERROR" });
}
function pathRedirectedByLink(filePath, linkPath, target) {
	return new EngineError(`Refusing to write ${filePath}: the directory ${linkPath} on its path is a symbolic link pointing at ${target}, outside the directory that holds it, so the file would land in a tree its own path does not name. Remove the link (or re-run against the real directory) — the engine never follows one out of the tree it was pointed at. If the link is your own relocation (a home or projects directory moved to another volume), re-run against ${target} instead.`, { code: "FS_ERROR" });
}
async function realpathOrNull(path) {
	try {
		return await realpath(path);
	} catch {
		return null;
	}
}
const COMPONENT_ABSENT_ERRNOS = /* @__PURE__ */ new Set(["ENOENT", "ENOTDIR"]);
function pathComponentUninspectable(filePath, component, err) {
	const code = errnoCode$3(err);
	const actionable = mapFsErrno(err, filePath);
	return new EngineError(`Refusing to write ${filePath}: the path ${component} could not be inspected${code === void 0 ? "" : ` (${code})`}, so whether a symbolic link stands in its place is unknown. Reading that refusal as "nothing is there" would resolve the rest of the write path by its spelling alone and clear a write that lands somewhere else. ` + (actionable === null ? "" : `${actionable.message} `) + `Nothing was written; restore access to ${component} and re-run.`, {
		code: "FS_ERROR",
		cause: err
	});
}
async function probeComponent(path, filePath) {
	try {
		return { isLink: (await lstat(path)).isSymbolicLink() };
	} catch (err) {
		const code = errnoCode$3(err);
		if (code !== void 0 && COMPONENT_ABSENT_ERRNOS.has(code)) return null;
		throw pathComponentUninspectable(filePath, path, err);
	}
}
async function resolveLinkTarget(linkPath, realParent) {
	const real = await realpathOrNull(linkPath);
	if (real !== null) return real;
	return resolve(realParent, await readlink(linkPath));
}
function pathWalkPlan(dir) {
	const names = [];
	let cur = resolve(dir);
	while (dirname(cur) !== cur) {
		names.push(basename(cur));
		cur = dirname(cur);
	}
	names.reverse();
	return {
		root: cur,
		names
	};
}
async function resolveWriteLanding(parentDir, filePath, confineToOwnDirectory) {
	const absoluteParent = resolve(parentDir);
	const plan = pathWalkPlan(absoluteParent);
	let lexical = plan.root;
	let real = plan.root;
	for (const name of plan.names) {
		const next = join(lexical, name);
		const info = await probeComponent(next, filePath);
		if (info === null) break;
		if (info.isLink) {
			const target = await resolveLinkTarget(next, real);
			if (confineToOwnDirectory && !isWithinDir(target, real)) throw pathRedirectedByLink(filePath, next, target);
			real = target;
		} else real = join(real, name);
		lexical = next;
	}
	return join(real, relative(lexical, absoluteParent));
}
async function assertWriteTargetContained(filePath, boundaryDir) {
	const parentDir = resolve(dirname(filePath));
	if (boundaryDir === void 0) {
		if (await realpathOrNull(parentDir) === parentDir) return;
		await resolveWriteLanding(parentDir, filePath, true);
		return;
	}
	const boundary = await resolveWriteLanding(boundaryDir, filePath, false);
	if (!isWithinDir(await resolveWriteLanding(parentDir, filePath, false), boundary)) throw pathEscapedBoundary(filePath, boundaryDir);
}
function directorySwappedError(filePath) {
	return new EngineError(`Refusing to complete the write of ${filePath}: its parent directory was replaced while the write was in flight, so the file would land in a different directory than the one that was checked. Nothing was written. Re-run once no other process is rewriting this tree.`, { code: "FS_ERROR" });
}
async function pinDirectoryIdentity(dir) {
	let dh;
	try {
		dh = await open(dir, "r");
	} catch (err) {
		if (errnoCode$3(err) === "ENOENT") throw err;
		return await readDirectoryIdentity(dir);
	}
	try {
		const info = await dh.stat();
		return {
			dev: info.dev,
			ino: info.ino
		};
	} finally {
		await dh.close();
	}
}
async function pinWriteParent(parentDir, filePath, boundaryDir) {
	let pinned;
	try {
		pinned = await pinDirectoryIdentity(parentDir);
	} catch (err) {
		if (errnoCode$3(err) === "ENOENT") await assertWriteTargetContained(filePath, boundaryDir);
		throw err;
	}
	await assertWriteTargetContained(filePath, boundaryDir);
	if (!sameDirectoryIdentity(await readDirectoryIdentity(parentDir), pinned)) throw directorySwappedError(filePath);
	return pinned;
}
async function assertParentUnchanged(parentDir, pinned, filePath) {
	let current;
	try {
		current = await readDirectoryIdentity(parentDir);
	} catch {
		throw directorySwappedError(filePath);
	}
	if (!sameDirectoryIdentity(current, pinned)) throw directorySwappedError(filePath);
}
const RENAME_RETRY_ERRNOS = process.platform === "win32" ? /* @__PURE__ */ new Set([
	"EBUSY",
	"EPERM",
	"EACCES"
]) : /* @__PURE__ */ new Set(["EBUSY", "EPERM"]);
const RENAME_RETRY_DELAYS_MS = process.platform === "win32" ? [
	50,
	100,
	200,
	400,
	600,
	800,
	800,
	800,
	800,
	800,
	800,
	800
] : [
	50,
	100,
	200,
	400
];
const RENAME_RETRY_JITTER = process.platform === "win32" ? .25 : 0;
const RENAME_RETRY_CEILING_MS = RENAME_RETRY_DELAYS_MS.reduce((total, wait) => total + wait * (1 + RENAME_RETRY_JITTER), 0);
function renameRetryWaitMs(attempt) {
	const wait = RENAME_RETRY_DELAYS_MS[attempt];
	if (wait === void 0) return void 0;
	return wait + Math.random() * wait * RENAME_RETRY_JITTER;
}
const RENAME_RETRY_COUNT = RENAME_RETRY_DELAYS_MS.length;
const TMP_ENGINE_TOKEN = CONTENT_PREFIX;
async function existingFileMode(filePath) {
	try {
		const entry = await lstat(filePath);
		return entry.isFile() ? entry.mode & 511 : void 0;
	} catch {
		return;
	}
}
async function atomicWriteFile(filePath, content, opts) {
	filePath = resolve(filePath);
	const release = await acquireWriteLockImpl(filePath, "internal-write", opts?.boundaryDir);
	try {
		await atomicWriteFileUnlocked(filePath, content, opts);
	} finally {
		try {
			await release();
		} catch (releaseErr) {
			console.error(`Failed to release the write lock on ${filePath}: ${describeError$5(releaseErr)}`);
		}
	}
}
async function atomicWriteFileUnlocked(filePath, content, opts) {
	filePath = resolve(filePath);
	const parentDir = dirname(filePath);
	const tmpPath = `${filePath}.tmp.${TMP_ENGINE_TOKEN}${randomBytes(4).toString("hex")}`;
	const TMP_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;
	let modeToKeep;
	const preservedMode = () => modeToKeep ??= opts?.mode === void 0 ? existingFileMode(filePath) : Promise.resolve(void 0);
	const writeTmp = async () => {
		const keep = await preservedMode();
		const createMode = opts?.mode ?? keep;
		const handle = createMode === void 0 ? await open(tmpPath, TMP_FLAGS) : await open(tmpPath, TMP_FLAGS, createMode);
		try {
			if (keep !== void 0) await handle.chmod(keep);
			await handle.writeFile(content, "utf-8");
		} finally {
			await handle.close();
		}
	};
	let pinnedParent;
	try {
		try {
			pinnedParent = await pinWriteParent(parentDir, filePath, opts?.boundaryDir);
			await writeTmp();
		} catch (err) {
			if (errnoCode$3(err) !== "ENOENT") throw err;
			await mkdir(parentDir, { recursive: true });
			pinnedParent = await pinWriteParent(parentDir, filePath, opts?.boundaryDir);
			await writeTmp();
		}
		const fh = await open(tmpPath, "r+");
		try {
			await fh.datasync();
		} catch (err) {
			const code = errnoCode$3(err);
			if (code !== "EPERM" && code !== "ENOTSUP" && code !== "EINVAL") throw err;
		} finally {
			await fh.close();
		}
		await assertParentUnchanged(parentDir, pinnedParent, filePath);
		for (let attempt = 0;; attempt++) try {
			await rename(tmpPath, filePath);
			break;
		} catch (err) {
			const code = errnoCode$3(err);
			const wait = code !== void 0 && RENAME_RETRY_ERRNOS.has(code) ? renameRetryWaitMs(attempt) : void 0;
			if (wait !== void 0) {
				await new Promise((resolveWait) => setTimeout(resolveWait, wait));
				continue;
			}
			throw err;
		}
		await syncParentDirectory(filePath);
	} catch (err) {
		throw mapFsErrno(err, filePath) ?? err;
	} finally {
		try {
			await unlink(tmpPath);
		} catch (unlinkErr) {
			if (errnoCode$3(unlinkErr) !== "ENOENT") console.error(`Failed to remove the temp file ${tmpPath}: ${describeError$5(unlinkErr)}. Run the orphan temp-file sweep or remove it manually.`);
		}
	}
}
const TMP_TOKEN_PATTERN = TMP_ENGINE_TOKEN.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
const TMP_SUFFIX_RE = new RegExp(String.raw`[^/\\]\.tmp\.${TMP_TOKEN_PATTERN}[0-9a-f]{8}$`);
const ORPHAN_TMP_MIN_AGE_MS = 6e4;
const SWEEP_SKIP_DIRS = /* @__PURE__ */ new Set([
	"node_modules",
	".git",
	".hg",
	".svn",
	"dist",
	"coverage",
	".next",
	".turbo",
	".cache"
]);
async function walkTmpCandidates(dir) {
	const candidates = [];
	const stack = [{
		path: dir,
		top: true
	}];
	for (let frame = stack.pop(); frame !== void 0; frame = stack.pop()) {
		let dirents;
		try {
			dirents = await readdir(frame.path, { withFileTypes: true });
		} catch (err) {
			if (frame.top) throw err;
			console.error(`Orphan temp-file scan could not read ${frame.path}: ${describeError$5(err)}`);
			continue;
		}
		for (const ent of dirents) {
			if (ent.isDirectory()) {
				if (!SWEEP_SKIP_DIRS.has(ent.name)) stack.push({
					path: join(frame.path, ent.name),
					top: false
				});
				continue;
			}
			if (ent.isFile() && TMP_SUFFIX_RE.test(ent.name)) candidates.push(join(frame.path, ent.name));
		}
	}
	return candidates;
}
async function sweepOrphanTmpFiles(dir, opts = {}) {
	const olderThanMs = opts.olderThanMs ?? ORPHAN_TMP_MIN_AGE_MS;
	const nowMs = Date.now();
	let candidates;
	try {
		candidates = await walkTmpCandidates(dir);
	} catch (err) {
		if (errnoCode$3(err) !== "ENOENT") console.error(`Orphan temp-file sweep could not read ${dir}: ${describeError$5(err)}`);
		return [];
	}
	const entries = [];
	for (const path of candidates) {
		let fileStat;
		try {
			fileStat = await stat(path);
		} catch {
			continue;
		}
		const ageMs = nowMs - fileStat.mtimeMs;
		if (ageMs < olderThanMs) {
			entries.push({
				path,
				ageMs,
				removed: false
			});
			continue;
		}
		try {
			await unlink(path);
			entries.push({
				path,
				ageMs,
				removed: true
			});
		} catch (unlinkErr) {
			console.error(`Failed to remove the orphan temp file ${path}: ${describeError$5(unlinkErr)}. Remove it manually.`);
			entries.push({
				path,
				ageMs,
				removed: false
			});
		}
	}
	return entries;
}
function formatOrphanTmpSweepDiagnostic(entries) {
	if (entries.length === 0) return "";
	const removed = entries.filter((entry) => entry.removed);
	const kept = entries.filter((entry) => !entry.removed);
	const parts = [];
	if (removed.length > 0) parts.push(`Removed ${removed.length} orphan temp file(s) left behind by interrupted writes: ` + removed.map((entry) => entry.path).join(", "));
	if (kept.length > 0) parts.push(`Left ${kept.length} temp file(s) in place (young enough to be a live write, or not removable): ${kept.map((entry) => entry.path).join(", ")}`);
	return parts.join(". ");
}
async function detectConcurrentWriteRisk(dir) {
	if (isLockingEnabled()) return null;
	const nowMs = Date.now();
	let candidates;
	try {
		candidates = await walkTmpCandidates(dir);
	} catch (err) {
		if (errnoCode$3(err) !== "ENOENT") console.error(`Concurrent-write check could not read ${dir}: ${describeError$5(err)}`);
		return null;
	}
	for (const path of candidates) {
		let fileStat;
		try {
			fileStat = await stat(path);
		} catch {
			continue;
		}
		if (nowMs - fileStat.mtimeMs < ORPHAN_TMP_MIN_AGE_MS) return `Another write appears to be in flight (fresh temp file ${path}). Cross-process locking is disabled for this run (STAMITY_LOCK=0 or an explicit opt-out), so concurrent runs can clobber the same files last-writer-wins. Re-enable locking or wait for the other run to finish.`;
	}
	return null;
}
async function verifyBackup(filePath, bakPath, sourceContent, operation) {
	const sourceBytes = Buffer.byteLength(sourceContent, "utf-8");
	const bakStat = await stat(bakPath);
	if (bakStat.size !== sourceBytes) throw new EngineError(`Backup verification failed for ${filePath}: source=${sourceBytes} bytes, backup=${bakStat.size} bytes. Aborting ${operation} to prevent data loss.`, { code: "FS_ERROR" });
	const sourceHash = createHash("sha256").update(sourceContent, "utf-8").digest("hex");
	const bakHash = createHash("sha256").update(await readFile(bakPath)).digest("hex");
	if (sourceHash !== bakHash) throw new EngineError(`Backup verification failed for ${filePath}: SHA-256 mismatch (source=${sourceHash.slice(0, 12)}…, backup=${bakHash.slice(0, 12)}…). Aborting ${operation} to prevent data loss.`, { code: "FS_ERROR" });
}
async function resolveNonClobberingBakPath(filePath) {
	const canonical = `${filePath}.bak`;
	if (!await fileExists$1(canonical)) return canonical;
	for (;;) {
		const candidate = `${filePath}.bak.${randomBytes(4).toString("hex")}`;
		if (!await fileExists$1(candidate)) return candidate;
	}
}
//#endregion
//#region src/roster/reviewCaps.ts
var reviewCaps_exports = /* @__PURE__ */ __exportAll({
	DEFAULT_MAX_REVIEW_ITERATIONS: () => 4,
	HARD_MAX_REVIEW_ITERATIONS: () => 10,
	MIN_MAX_REVIEW_ITERATIONS: () => 1,
	clampReviewIterations: () => clampReviewIterations
});
function clampReviewIterations(requested) {
	if (Number.isNaN(requested)) return 1;
	return Math.min(Math.max(Math.floor(requested), 1), 10);
}
//#endregion
//#region src/manifest/manifest.ts
var manifest_exports$2 = /* @__PURE__ */ __exportAll({
	MANIFEST_MIGRATIONS: () => MANIFEST_MIGRATIONS,
	MANIFEST_REPO_PATH: () => MANIFEST_REPO_PATH,
	applyPreservedManifestFields: () => applyPreservedManifestFields,
	collectManifestErrors: () => collectManifestErrors,
	communicationStyleDirective: () => communicationStyleDirective,
	createManifest: () => createManifest,
	extractPreservedManifestFields: () => extractPreservedManifestFields,
	manifestPath: () => manifestPath,
	maturityDirective: () => maturityDirective,
	migrateManifest: () => migrateManifest,
	pluginOwnedClasses: () => pluginOwnedClasses,
	readCommunicationStyle: () => readCommunicationStyle,
	readGates: () => readGates,
	readInstallMode: () => readInstallMode,
	readManifest: () => readManifest$1,
	readMaturityTier: () => readMaturityTier,
	readReviewCap: () => readReviewCap,
	readRuleDelivery: () => readRuleDelivery,
	validateManifest: () => validateManifest,
	writeManifest: () => writeManifest
});
function manifestPath(rootDir) {
	return join(rootDir, STATE_DIR, MANIFEST_FILE);
}
const MANIFEST_REPO_PATH = `${STATE_DIR}/${MANIFEST_FILE}`;
const MANIFEST_MIGRATIONS = [];
function migrateManifest(raw) {
	let current = structuredClone(raw);
	const visited = /* @__PURE__ */ new Set();
	for (;;) {
		const version = typeof current.version === "string" ? current.version : "";
		if (visited.has(version)) return current;
		visited.add(version);
		const step = MANIFEST_MIGRATIONS.find((entry) => entry.fromVersion === version);
		if (step === void 0) return current;
		current = step.migrate(current);
	}
}
function createManifest(options) {
	const timestamp = (options.now ?? /* @__PURE__ */ new Date()).toISOString();
	return structuredClone({
		version: MANIFEST_VERSION,
		generatedBy: options.generatorVersion,
		createdAt: timestamp,
		updatedAt: timestamp,
		tools: options.tools,
		...options.platform !== void 0 ? { platform: options.platform } : {},
		...options.maturityTier !== void 0 ? { maturityTier: options.maturityTier } : {},
		selection: options.selection,
		ledger: [],
		...options.mcp !== void 0 ? { mcp: options.mcp } : {},
		...options.importChoice !== void 0 ? { importChoice: options.importChoice } : {},
		...options.detected !== void 0 ? { detected: options.detected } : {}
	});
}
const MANIFEST_FIELDS = Object.keys({
	version: true,
	generatedBy: true,
	createdAt: true,
	updatedAt: true,
	tools: true,
	platform: true,
	maturityTier: true,
	communicationStyle: true,
	ruleDelivery: true,
	selection: true,
	ledger: true,
	mcp: true,
	learnings: true,
	hooks: true,
	models: true,
	plugin: true,
	gates: true,
	importChoice: true,
	toolOptions: true,
	detected: true
});
const VALID_PLATFORMS = new Set(Object.keys({
	github: true,
	"azure-devops": true,
	gitlab: true
}));
const VALID_RULE_DELIVERIES = new Set(RULE_DELIVERIES);
const VALID_INSTALL_MODES = new Set(INSTALL_MODES);
const VALID_PLUGIN_OWNED_CLASSES = new Set(PLUGIN_OWNED_CLASSES);
const VALID_ARTIFACT_TYPES = /* @__PURE__ */ new Set([...CONTENT_CLASSES, "infra"]);
function describeRoot$1(value) {
	if (value === null) return "null";
	if (Array.isArray(value)) return "an array";
	return typeof value;
}
function isStringArray$2(value) {
	return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
function isNonEmptyString$2(value) {
	return typeof value === "string" && value !== "";
}
const WINDOWS_ABSOLUTE_PATTERN$3 = /^(?:[A-Za-z]:|\\\\)/;
function repoPathDefect(value) {
	if (value === "") return "is empty";
	if (value.includes("\0")) return "contains a NUL byte";
	if (value.startsWith("/") || value.startsWith("\\")) return "is an absolute path";
	if (WINDOWS_ABSOLUTE_PATTERN$3.test(value)) return "is an absolute path";
	if (value.includes("\\")) return "uses a backslash separator (emitted paths are POSIX)";
	const segments = value.split("/");
	if (segments.includes("..")) return "climbs out of the repo root with a `..` segment";
	if (segments.includes(".")) return "carries a `.` segment — an emitted path is already repo-relative, so drop the `./`";
	return null;
}
function collectSelectionErrors(value, errors) {
	if (!isPlainObject$2(value) || !isPlainObject$2(value.items)) {
		errors.push("`selection` must be an object with an `items` object");
		return;
	}
	const items = value.items;
	for (const contentClass of CONTENT_CLASSES) if (!isStringArray$2(items[contentClass])) errors.push(`\`selection.items.${contentClass}\` must be an array of strings`);
	for (const key of unknownFields(items, CONTENT_CLASSES)) errors.push(`\`selection.items.${key}\` is not a content class (known: ${CONTENT_CLASSES.join(", ")})`);
}
function ledgerOwnerDefect(value) {
	if (typeof value !== "string") return "must be a string";
	if (VALID_TOOLS.has(value)) return null;
	if (value.startsWith("pack:")) return value.length > 5 ? null : `is a pack owner with no pack id after \`${PACK_OWNER_PREFIX}\``;
	return `names neither a known tool (${TOOLS.join(", ")}) nor a \`${PACK_OWNER_PREFIX}<id>\` pack`;
}
function collectLedgerEntryErrors(entry, index, errors) {
	if (!isPlainObject$2(entry)) {
		errors.push(`\`ledger[${index}]\` must be an object`);
		return null;
	}
	if (!isNonEmptyString$2(entry.artifactId)) errors.push(`\`ledger[${index}].artifactId\` must be a non-empty string`);
	const ownerDefect = ledgerOwnerDefect(entry.adapter);
	if (ownerDefect !== null) errors.push(`\`ledger[${index}].adapter\` ${JSON.stringify(entry.adapter)} ${ownerDefect}`);
	if (typeof entry.artifactType !== "string" || !VALID_ARTIFACT_TYPES.has(entry.artifactType)) errors.push(`\`ledger[${index}].artifactType\` must be one of ${[...VALID_ARTIFACT_TYPES].join(", ")}`);
	if (entry.contentHash !== void 0 && typeof entry.contentHash !== "string") errors.push(`\`ledger[${index}].contentHash\` must be a string`);
	if (entry.stampedVersion !== void 0 && typeof entry.stampedVersion !== "string") errors.push(`\`ledger[${index}].stampedVersion\` must be a string`);
	if (typeof entry.path !== "string") {
		errors.push(`\`ledger[${index}].path\` must be a string`);
		return null;
	}
	const defect = repoPathDefect(entry.path);
	if (defect !== null) {
		errors.push(`\`ledger[${index}].path\` ${JSON.stringify(entry.path)} ${defect}`);
		return null;
	}
	return entry.path;
}
function collectLedgerErrors(value, errors) {
	if (!Array.isArray(value)) {
		errors.push("`ledger` must be an array");
		return;
	}
	const seen = /* @__PURE__ */ new Map();
	for (const [index, entry] of value.entries()) {
		const path = collectLedgerEntryErrors(entry, index, errors);
		if (path === null) continue;
		const key = `${String(entry.adapter)}\u0000${path}`;
		const prior = seen.get(key);
		if (prior === void 0) {
			seen.set(key, index);
			continue;
		}
		errors.push(`\`ledger[${prior}]\` and \`ledger[${index}]\` both claim ${JSON.stringify(path)} for the same owner — one row per (adapter, path) pair, so drop one row`);
	}
}
function collectMcpErrors(value, errors) {
	if (!isPlainObject$2(value)) {
		errors.push("`mcp` must be an object");
		return;
	}
	if (!isStringArray$2(value.servers)) errors.push("`mcp.servers` must be an array of strings");
	if (value.protocolVersion !== void 0 && typeof value.protocolVersion !== "string") errors.push("`mcp.protocolVersion` must be a string");
}
function modelPinDefect(value) {
	if (typeof value !== "string") return "must be a string";
	if (value.trim() === "") return "is empty";
	if (/[\r\n]/.test(value)) return "spans more than one line";
	return null;
}
function modelClassEntries(value, field, errors) {
	const entries = [];
	for (const [modelClass, entry] of Object.entries(value)) {
		if (!VALID_MODEL_CLASSES.has(modelClass)) {
			errors.push(`\`${field}.${modelClass}\` names unknown model class (known: ${MODEL_CLASSES.join(", ")})`);
			continue;
		}
		entries.push([modelClass, entry]);
	}
	return entries;
}
function collectModelsErrors(value, errors) {
	if (!isPlainObject$2(value)) {
		errors.push("`models` must be an object");
		return;
	}
	if (value.pins !== void 0) {
		if (!isPlainObject$2(value.pins)) errors.push("`models.pins` must be an object keyed by model class");
		else for (const [modelClass, pin] of modelClassEntries(value.pins, "models.pins", errors)) {
			const defect = modelPinDefect(pin);
			if (defect !== null) errors.push(`\`models.pins.${modelClass}\` ${JSON.stringify(pin)} ${defect}`);
		}
	}
	if (value.effort !== void 0) {
		if (!isPlainObject$2(value.effort)) errors.push("`models.effort` must be an object keyed by model class");
		else for (const [modelClass, level] of modelClassEntries(value.effort, "models.effort", errors)) {
			if (level === void 0) {
				errors.push(`\`models.effort.${modelClass}\` must be one of ${EFFORT_LEVELS.join(" | ")} (got undefined) — drop the class to fall back to the ladder`);
				continue;
			}
			collectEnumError(level, VALID_EFFORT_LEVELS, `models.effort.${modelClass}`, errors);
		}
	}
	if (value.reviewCap !== void 0) {
		const cap = value.reviewCap;
		if (!Number.isInteger(cap) || cap < 1 || cap > 10) errors.push(`\`models.reviewCap\` must be a whole number of rounds within 1..10 (got ${JSON.stringify(cap)})`);
	}
	for (const key of unknownFields(value, [
		"pins",
		"effort",
		"reviewCap"
	])) errors.push(`unknown field \`models.${key}\``);
}
const PLUGIN_CLIENT_FIELDS = ["version", "classes"];
function collectPluginClientErrors(tool, value, errors) {
	const field = `plugin.clients.${tool}`;
	if (!isPlainObject$2(value)) {
		errors.push(`\`${field}\` must be an object with \`version\` and \`classes\``);
		return;
	}
	if (typeof value.version !== "string" || semver.valid(value.version) === null) errors.push(`\`${field}.version\` must be the plugin's semantic version (got ${JSON.stringify(value.version)})`);
	if (!Array.isArray(value.classes)) errors.push(`\`${field}.classes\` must be an array of ${PLUGIN_OWNED_CLASSES.join(", ")}`);
	else if (value.classes.length === 0) errors.push(`\`${field}.classes\` must name at least one class — a client that owns nothing is spelled by dropping its record, not by an empty list`);
	else {
		const seen = /* @__PURE__ */ new Set();
		for (const entry of value.classes) {
			if (typeof entry !== "string" || !VALID_PLUGIN_OWNED_CLASSES.has(entry)) {
				errors.push(`\`${field}.classes\` names unknown class ${JSON.stringify(entry)} (known: ${PLUGIN_OWNED_CLASSES.join(", ")})`);
				continue;
			}
			if (seen.has(entry)) {
				errors.push(`\`${field}.classes\` lists ${JSON.stringify(entry)} twice — one entry per class`);
				continue;
			}
			seen.add(entry);
		}
	}
	for (const key of unknownFields(value, PLUGIN_CLIENT_FIELDS)) errors.push(`unknown field \`${field}.${key}\``);
}
function collectPluginErrors(value, errors) {
	if (!isPlainObject$2(value)) {
		errors.push("`plugin` must be an object");
		return;
	}
	collectEnumError(value.mode, VALID_INSTALL_MODES, "plugin.mode", errors);
	if (value.mode === void 0) errors.push(`\`plugin.mode\` is required (one of ${INSTALL_MODES.join(" | ")})`);
	if (value.clients !== void 0) {
		if (!isPlainObject$2(value.clients)) errors.push("`plugin.clients` must be an object keyed by tool");
		else for (const [tool, record] of Object.entries(value.clients)) {
			if (!VALID_TOOLS.has(tool)) {
				errors.push(`\`plugin.clients.${tool}\` names unknown tool (known: ${TOOLS.join(", ")})`);
				continue;
			}
			collectPluginClientErrors(tool, record, errors);
		}
	}
	for (const key of unknownFields(value, ["mode", "clients"])) errors.push(`unknown field \`plugin.${key}\``);
}
const GATE_FIELDS = [
	"test",
	"lint",
	"typecheck",
	"all"
];
const MAX_GATE_COMMAND_LENGTH = 512;
function gateCommandDefect(value) {
	if (typeof value !== "string") return "must be a string";
	if (value.trim() === "") return "is empty";
	if (/[\r\n]/.test(value)) return "spans more than one line";
	if (value.includes("`")) return "carries a backtick, which closes the code span the charter and the skills render it inside — name a script file instead";
	if (value.includes("${STAMITY:")) return "carries a `${STAMITY:` token, which substitution has already passed by the time this value is rendered, so it would ship as a literal placeholder";
	if (value.length > MAX_GATE_COMMAND_LENGTH) return `is longer than ${MAX_GATE_COMMAND_LENGTH} characters — put a script in a file and name it here`;
	return null;
}
function collectGatesErrors(value, errors) {
	if (!isPlainObject$2(value)) {
		errors.push("`gates` must be an object");
		return;
	}
	for (const field of GATE_FIELDS) {
		const command = value[field];
		if (command === void 0) continue;
		const defect = gateCommandDefect(command);
		if (defect !== null) errors.push(`\`gates.${field}\` ${JSON.stringify(command)} ${defect}`);
	}
	for (const key of unknownFields(value, GATE_FIELDS)) errors.push(`unknown field \`gates.${key}\` (known: ${GATE_FIELDS.join(", ")})`);
}
function collectImportChoiceErrors(value, errors) {
	if (!Array.isArray(value)) {
		errors.push("`importChoice` must be an array of { path, mode } decisions");
		return;
	}
	for (const [index, entry] of value.entries()) {
		const field = `importChoice[${index}]`;
		if (!isPlainObject$2(entry)) {
			errors.push(`\`${field}\` must be an object`);
			continue;
		}
		if (typeof entry.path !== "string") errors.push(`\`${field}.path\` must be a repo-relative POSIX path string`);
		else {
			const defect = repoPathDefect(entry.path);
			if (defect !== null) errors.push(`\`${field}.path\` ${JSON.stringify(entry.path)} ${defect}`);
		}
		collectEnumError(entry.mode, VALID_IMPORT_MODES, `${field}.mode`, errors);
		if (entry.mode === void 0) errors.push(`\`${field}.mode\` is required`);
		for (const key of unknownFields(entry, ["path", "mode"])) errors.push(`unknown field \`${field}.${key}\``);
	}
}
function collectToolOptionsErrors(value, errors) {
	if (!isPlainObject$2(value)) {
		errors.push("`toolOptions` must be an object keyed by tool");
		return;
	}
	for (const [key, bag] of Object.entries(value)) {
		if (!VALID_TOOLS.has(key)) {
			errors.push(`\`toolOptions.${key}\` names unknown tool (known: ${TOOLS.join(", ")})`);
			continue;
		}
		if (!isPlainObject$2(bag)) errors.push(`\`toolOptions.${key}\` must be an object`);
	}
}
const DETECTED_FIELDS = Object.keys({
	languages: true,
	linters: true,
	testFrameworks: true,
	ciProviders: true,
	packageManager: true,
	packageScripts: true
});
const DETECTED_REQUIRED_LISTS = [
	"languages",
	"linters",
	"testFrameworks",
	"ciProviders"
];
function collectDetectedErrors(value, errors) {
	if (!isPlainObject$2(value)) {
		errors.push("`detected` must be an object");
		return;
	}
	for (const field of DETECTED_REQUIRED_LISTS) if (!isStringArray$2(value[field])) errors.push(`\`detected.${field}\` must be an array of strings`);
	if (value.packageManager !== void 0 && !isNonEmptyString$2(value.packageManager)) errors.push("`detected.packageManager` must be a non-empty package-manager name");
	if (value.packageScripts !== void 0 && !isStringArray$2(value.packageScripts)) errors.push("`detected.packageScripts` must be an array of strings");
	for (const key of unknownFields(value, DETECTED_FIELDS)) errors.push(`unknown field \`detected.${key}\` (known: ${DETECTED_FIELDS.join(", ")})`);
}
function collectEnumError(value, valid, field, errors) {
	if (value === void 0) return;
	if (typeof value !== "string" || !valid.has(value)) errors.push(`\`${field}\` must be one of ${[...valid].join(" | ")} (got ${JSON.stringify(value)})`);
}
function isTimestamp(value) {
	return typeof value === "string" && !Number.isNaN(Date.parse(value));
}
function collectManifestErrors(data) {
	if (!isPlainObject$2(data)) return [`the manifest root must be a JSON object (got ${describeRoot$1(data)})`];
	const errors = [];
	if (typeof data.version !== "string" || semver.valid(data.version) === null) errors.push(`\`version\` must be a semantic version string (e.g. "${MANIFEST_VERSION}")`);
	if (!isNonEmptyString$2(data.generatedBy)) errors.push("`generatedBy` must be a non-empty engine version string");
	for (const field of ["createdAt", "updatedAt"]) if (!isTimestamp(data[field])) errors.push(`\`${field}\` must be an ISO-8601 timestamp`);
	if (!Array.isArray(data.tools)) errors.push("`tools` must be an array");
	else if (data.tools.length === 0) errors.push("`tools` must name at least one target tool");
	else for (const tool of data.tools) {
		if (VALID_TOOLS.has(tool)) continue;
		errors.push(`\`tools\` names unknown tool ${JSON.stringify(tool)} (known: ${TOOLS.join(", ")})`);
	}
	collectEnumError(data.platform, VALID_PLATFORMS, "platform", errors);
	collectEnumError(data.maturityTier, VALID_MATURITY_TIERS, "maturityTier", errors);
	collectEnumError(data.communicationStyle, VALID_COMMUNICATION_STYLES, "communicationStyle", errors);
	collectEnumError(data.ruleDelivery, VALID_RULE_DELIVERIES, "ruleDelivery", errors);
	collectSelectionErrors(data.selection, errors);
	collectLedgerErrors(data.ledger, errors);
	if (data.mcp !== void 0) collectMcpErrors(data.mcp, errors);
	if (data.learnings !== void 0) {
		if (!isPlainObject$2(data.learnings)) errors.push("`learnings` must be an object");
		else if (data.learnings.maxCount !== void 0 && (!Number.isInteger(data.learnings.maxCount) || data.learnings.maxCount < 1)) errors.push("`learnings.maxCount` must be a positive integer");
	}
	if (data.hooks !== void 0) {
		if (!isPlainObject$2(data.hooks)) errors.push("`hooks` must be an object");
		else if (data.hooks.userHooksDir !== void 0) {
			if (typeof data.hooks.userHooksDir !== "string") errors.push("`hooks.userHooksDir` must be a string");
			else {
				const defect = repoPathDefect(data.hooks.userHooksDir);
				if (defect !== null) errors.push(`\`hooks.userHooksDir\` ${JSON.stringify(data.hooks.userHooksDir)} ${defect}`);
			}
		}
	}
	if (data.models !== void 0) collectModelsErrors(data.models, errors);
	if (data.plugin !== void 0) collectPluginErrors(data.plugin, errors);
	if (data.gates !== void 0) collectGatesErrors(data.gates, errors);
	if (data.importChoice !== void 0) collectImportChoiceErrors(data.importChoice, errors);
	if (data.toolOptions !== void 0) collectToolOptionsErrors(data.toolOptions, errors);
	if (data.detected !== void 0) collectDetectedErrors(data.detected, errors);
	for (const key of unknownFields(data, MANIFEST_FIELDS)) errors.push(`unknown field \`${key}\``);
	return errors;
}
function validateManifest(data) {
	return collectManifestErrors(data).length === 0;
}
function canonicalize(value) {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (!isPlainObject$2(value)) return value;
	const out = {};
	for (const key of Object.keys(value).toSorted()) out[key] = canonicalize(value[key]);
	return out;
}
function serializeManifest(manifest) {
	const ordered = {};
	for (const field of MANIFEST_FIELDS) {
		const value = manifest[field];
		if (value !== void 0) ordered[field] = canonicalize(value);
	}
	return `${JSON.stringify(ordered, null, 2)}\n`;
}
const READ_ERRNO_MESSAGE$1 = {
	EISDIR: (p) => `Cannot read the manifest at ${p}: that path is a directory, not a file. Remove or rename it, then re-run.`,
	EACCES: (p) => `Permission denied reading ${p}. Check the file's permissions and confirm the current user can read it.`
};
function readFailure$2(cause, path) {
	const code = cause?.code;
	const messageFor = typeof code === "string" ? READ_ERRNO_MESSAGE$1[code] : void 0;
	if (messageFor !== void 0) return new EngineError(messageFor(path), {
		code: "FS_ERROR",
		cause
	});
	return mapFsErrno(cause, path) ?? cause;
}
function assertReadableGeneration$1(document, path) {
	const declared = document.version;
	if (typeof declared !== "string" || semver.valid(declared) === null) return;
	const major = semver.major(declared);
	if (major <= semver.major("1.0.0")) return;
	throw new EngineError(`The manifest at ${path} declares schema version ${declared}, newer than the ${MANIFEST_VERSION} this build reads. Upgrade to a release that understands schema ${major}.x, then re-run.`, { code: "CONFIG_ERROR" });
}
const BOM$2 = "﻿";
async function readManifest$1(rootDir) {
	const path = manifestPath(rootDir);
	let raw;
	try {
		raw = await readFile(path, "utf8");
	} catch (cause) {
		if (cause?.code === "ENOENT") return null;
		throw readFailure$2(cause, path);
	}
	const document = parseJsonStrict(raw.startsWith(BOM$2) ? raw.slice(1) : raw, path);
	assertReadableGeneration$1(document, path);
	const migrated = migrateManifest(document);
	const errors = collectManifestErrors(migrated);
	if (errors.length > 0) throw new EngineError(`Invalid manifest in ${path}: ${errors.join("; ")}. Fix the field(s) named above, or delete the file and re-initialise the repo.`, { code: "CONFIG_ERROR" });
	return migrated;
}
async function writeManifest(rootDir, manifest, opts = {}) {
	const path = manifestPath(rootDir);
	const stamped = {
		...manifest,
		updatedAt: (opts.now ?? /* @__PURE__ */ new Date()).toISOString()
	};
	const errors = collectManifestErrors(stamped);
	if (errors.length > 0) throw new EngineError(`Refusing to write an invalid manifest to ${path}: ${errors.join("; ")}.`, { code: "CONFIG_ERROR" });
	await atomicWriteFile(path, serializeManifest(stamped));
}
function extractPreservedManifestFields(manifest) {
	const preserved = {};
	if (manifest.selection !== void 0) preserved.selection = structuredClone(manifest.selection);
	if (manifest.mcp !== void 0) preserved.mcp = structuredClone(manifest.mcp);
	if (manifest.maturityTier !== void 0) preserved.maturityTier = manifest.maturityTier;
	if (manifest.communicationStyle !== void 0) preserved.communicationStyle = manifest.communicationStyle;
	if (manifest.learnings !== void 0) preserved.learnings = structuredClone(manifest.learnings);
	if (manifest.toolOptions !== void 0) preserved.toolOptions = structuredClone(manifest.toolOptions);
	if (manifest.plugin !== void 0) preserved.plugin = structuredClone(manifest.plugin);
	if (manifest.gates !== void 0) preserved.gates = structuredClone(manifest.gates);
	return preserved;
}
function applyPreservedManifestFields(fresh, preserved) {
	const merged = structuredClone(fresh);
	if (preserved.selection !== void 0) merged.selection = structuredClone(preserved.selection);
	if (preserved.mcp !== void 0) merged.mcp = structuredClone(preserved.mcp);
	if (preserved.maturityTier !== void 0) merged.maturityTier = preserved.maturityTier;
	if (preserved.communicationStyle !== void 0) merged.communicationStyle = preserved.communicationStyle;
	if (preserved.learnings !== void 0) merged.learnings = structuredClone(preserved.learnings);
	if (preserved.toolOptions !== void 0) merged.toolOptions = structuredClone(preserved.toolOptions);
	if (preserved.plugin !== void 0) merged.plugin = structuredClone(preserved.plugin);
	if (preserved.gates !== void 0) merged.gates = structuredClone(preserved.gates);
	return merged;
}
function readMaturityTier(manifest) {
	const value = manifest?.maturityTier;
	return value !== void 0 && VALID_MATURITY_TIERS.has(value) ? value : DEFAULT_MATURITY_TIER;
}
function readRuleDelivery(manifest) {
	const value = manifest?.ruleDelivery;
	return value !== void 0 && VALID_RULE_DELIVERIES.has(value) ? value : RULE_DELIVERY_DEFAULT;
}
function readInstallMode(manifest) {
	const value = manifest?.plugin?.mode;
	return value !== void 0 && VALID_INSTALL_MODES.has(value) ? value : INSTALL_MODE_DEFAULT;
}
function pluginOwnedClasses(manifest, tool) {
	if (readInstallMode(manifest) !== "plugin-backed") return /* @__PURE__ */ new Set();
	const record = manifest?.plugin?.clients?.[tool];
	if (record === void 0) return /* @__PURE__ */ new Set();
	if (!Array.isArray(record.classes)) return /* @__PURE__ */ new Set();
	return new Set(record.classes.filter((entry) => VALID_PLUGIN_OWNED_CLASSES.has(entry)));
}
function readGates(manifest) {
	return manifest?.gates === void 0 ? {} : { ...manifest.gates };
}
function maturityDirective(tier) {
	return `Right-size to maturity=${tier}: invest exactly as deep as this tier needs, no deeper. The universal floor — security, correctness, accessibility basics, tests on every changed surface — binds at every tier.`;
}
function readCommunicationStyle(manifest) {
	const value = manifest?.communicationStyle;
	return value !== void 0 && VALID_COMMUNICATION_STYLES.has(value) ? value : DEFAULT_COMMUNICATION_STYLE;
}
function readReviewCap(manifest) {
	const value = manifest?.models?.reviewCap;
	return value === void 0 ? 4 : clampReviewIterations(value);
}
const COMMUNICATION_STYLE_EFFECT = {
	plain: "define jargon on first use and lead with outcomes",
	technical: "use precise domain terminology and lead with implementation detail"
};
function communicationStyleDirective(style) {
	return `Communication style=${style}: ${COMMUNICATION_STYLE_EFFECT[style]}.`;
}
//#endregion
//#region src/emit/monorepoPlan.ts
var monorepoPlan_exports = /* @__PURE__ */ __exportAll({
	emitsPerPackage: () => emitsPerPackage,
	planPerPackageOutputs: () => planPerPackageOutputs
});
const PER_PACKAGE_TOOLS = /* @__PURE__ */ new Set(["codex"]);
const ROOT = ".";
function emitsPerPackage(tool) {
	return PER_PACKAGE_TOOLS.has(tool);
}
function planPerPackageOutputs(packages, tool, fileName) {
	if (!emitsPerPackage(tool)) return [];
	if (packages.length === 0) return [];
	const target = normalizeRelative(fileName);
	if (target === null || target === ROOT) throw new EngineError(`Per-package emission target ${JSON.stringify(fileName)} is not a repo-relative file path. Pass a path inside the package, such as "AGENTS.md".`, { code: "VALIDATION_ERROR" });
	const dirs = /* @__PURE__ */ new Set();
	for (const pkg of packages) {
		const dir = normalizeRelative(pkg.path);
		if (dir === null || dir === ROOT) continue;
		dirs.add(dir);
	}
	return [...dirs].toSorted().map((packagePath) => ({
		packagePath,
		outputPath: `${packagePath}/${target}`
	}));
}
function normalizeRelative(path) {
	const posix = path.replaceAll("\\", "/");
	if (posix.startsWith("/")) return null;
	if (/^[A-Za-z]:/.test(posix)) return null;
	const segments = [];
	for (const segment of posix.split("/")) {
		if (segment === "" || segment === ROOT) continue;
		if (segment === "..") return null;
		segments.push(segment);
	}
	return segments.length === 0 ? ROOT : segments.join("/");
}
//#endregion
//#region src/emit/agentsMd.ts
var agentsMd_exports = /* @__PURE__ */ __exportAll({
	AGENTS_MD_FILE: () => AGENTS_MD_FILE,
	renderAgentsMd: () => renderAgentsMd,
	verificationGatesFromManifest: () => verificationGatesFromManifest
});
const AGENTS_MD_FILE = "AGENTS.md";
async function renderAgentsMd(ctx) {
	const template = await readCharterTemplate(ctx.contentRoot);
	const content = withSingleTrailingNewline(substituteVerificationGateTokens(substituteRepoTokens(template.invariants === null ? template.body : substituteCharterTokens(template.body, template.invariants), detectionContextFromManifest(ctx.manifest)), verificationGatesFromManifest(ctx.manifest)));
	const root = {
		content,
		byteLength: Buffer.byteLength(content, "utf8"),
		lineCount: countTerminatedLines(content)
	};
	const packages = [...ctx.facts.monorepoPackages];
	return {
		root,
		nestedFor: (tool) => planPerPackageOutputs(packages, tool, AGENTS_MD_FILE).map(({ outputPath }) => ({
			outputPath,
			content
		}))
	};
}
function verificationGatesFromManifest(manifest) {
	return verificationGatesFor(manifest.detected, readGates(manifest));
}
function withSingleTrailingNewline(text) {
	return `${text.replace(/(?:\r?\n)+$/, "")}\n`;
}
function countTerminatedLines(text) {
	return text.split(/\r?\n/).length - 1;
}
//#endregion
//#region src/handoffs/schema.ts
var schema_exports = /* @__PURE__ */ __exportAll({
	HANDOFF_STATUSES: () => HANDOFF_STATUSES,
	VALID_STATUS_TRANSITIONS: () => VALID_STATUS_TRANSITIONS,
	isHandoffStatus: () => isHandoffStatus,
	isValidStatusTransition: () => isValidStatusTransition
});
const HANDOFF_STATUSES = [
	"active",
	"in-progress",
	"completed",
	"archived",
	"expired"
];
const VALID_HANDOFF_STATUSES = new Set(HANDOFF_STATUSES);
const VALID_STATUS_TRANSITIONS = {
	"active": [
		"in-progress",
		"completed",
		"archived",
		"expired"
	],
	"in-progress": [
		"completed",
		"archived",
		"expired"
	],
	"completed": ["archived"],
	"expired": ["archived"],
	"archived": []
};
function isValidStatusTransition(from, to) {
	return VALID_STATUS_TRANSITIONS[from].includes(to);
}
function isHandoffStatus(value) {
	return typeof value === "string" && VALID_HANDOFF_STATUSES.has(value);
}
//#endregion
//#region src/handoffs/validation.ts
var validation_exports$1 = /* @__PURE__ */ __exportAll({
	HANDOFF_DEFAULT_EXPIRY_DAYS: () => 30,
	HANDOFF_ID_PATTERN: () => HANDOFF_ID_PATTERN,
	MAX_ACTIVE_HANDOFFS_PER_REPO: () => 25,
	MAX_HANDOFF_BODY_BYTES: () => MAX_HANDOFF_BODY_BYTES,
	MAX_HANDOFF_FILE_BYTES: () => MAX_HANDOFF_FILE_BYTES,
	MAX_SUMMARY_LENGTH: () => 200,
	REQUIRED_BODY_SECTIONS: () => REQUIRED_BODY_SECTIONS,
	computeHandoffIntegrity: () => computeHandoffIntegrity,
	detectGitRefDrift: () => detectGitRefDrift,
	generateHandoffId: () => generateHandoffId,
	isHandoffExpired: () => isHandoffExpired,
	validateHandoffContent: () => validateHandoffContent,
	validateHandoffsDirectory: () => validateHandoffsDirectory,
	verifyHandoffIntegrity: () => verifyHandoffIntegrity
});
const MAX_HANDOFF_BODY_BYTES = 51200;
const MAX_HANDOFF_FILE_BYTES = 61440;
const REQUIRED_BODY_SECTIONS = [
	"Problem",
	"Decisions",
	"Work Done",
	"Work Remaining",
	"Blockers",
	"Next Steps",
	"Build & Test Status",
	"File Manifest"
];
const HANDOFF_ID_PATTERN = /^[12][0-9]{3}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])_[a-z0-9][a-z0-9-]{0,59}_[0-9a-f]{5}$/;
const INTEGRITY_PATTERN$1 = /^sha256:[0-9a-f]{64}$/;
const INTEGRITY_PREFIX$1 = "sha256:";
const HANDOFF_FILE_EXTENSION$1 = ".md";
const READ_CONCURRENCY$7 = 8;
const KNOWN_FRONTMATTER_FIELDS = [
	"id",
	"status",
	"created",
	"expires",
	"summary",
	"fromTool",
	"toTool",
	"gitRef",
	"integrity"
];
const ACTIVE_STATUSES = /* @__PURE__ */ new Set(["active", "in-progress"]);
const HANDOFF_DENY_PATTERNS = [
	...LEARNINGS_INJECTION_PATTERNS,
	...CONTENT_DENY_PATTERNS,
	...INJECTION_PATTERNS
];
const BINARY_CONTENT_PATTERN = /\0/;
function computeHandoffIntegrity(summary, body) {
	const covered = `${summary.trim()}\n${body.trim()}`;
	return `${INTEGRITY_PREFIX$1}${createHash("sha256").update(covered, "utf8").digest("hex")}`;
}
function verifyHandoffIntegrity(handoff) {
	const declared = handoff.frontmatter.integrity;
	if (!INTEGRITY_PATTERN$1.test(declared)) return false;
	return computeHandoffIntegrity(handoff.frontmatter.summary, handoff.body) === declared;
}
const HANDOFF_ID_HASH_SPACE = 1048576;
let handoffIdCounter = randomBytes(4).readUInt32BE(0) % HANDOFF_ID_HASH_SPACE;
function generateHandoffId(slug, now = /* @__PURE__ */ new Date()) {
	const date = [
		now.getUTCFullYear().toString().padStart(4, "0"),
		(now.getUTCMonth() + 1).toString().padStart(2, "0"),
		now.getUTCDate().toString().padStart(2, "0")
	].join("-");
	handoffIdCounter = (handoffIdCounter + 1) % HANDOFF_ID_HASH_SPACE;
	const hash = handoffIdCounter.toString(16).padStart(5, "0");
	return `${date}_${normalizeSlug(slug)}_${hash}`;
}
const SLUG_FALLBACK = "handoff";
const SLUG_MAX_LENGTH = 60;
function normalizeSlug(slug) {
	const trimmed = slug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, SLUG_MAX_LENGTH).replace(/-+$/g, "");
	return trimmed === "" ? SLUG_FALLBACK : trimmed;
}
function isHandoffExpired(handoff, now = /* @__PURE__ */ new Date()) {
	const expiresMs = Date.parse(handoff.frontmatter.expires);
	if (Number.isNaN(expiresMs)) return false;
	return expiresMs <= now.getTime();
}
function detectGitRefDrift(handoff, currentRef) {
	const recorded = handoff.frontmatter.gitRef;
	if (recorded === void 0 || recorded === "") return null;
	if (currentRef === null) return `Handoff records git ref "${recorded}", and the current ref could not be resolved. Confirm the working tree matches that ref before resuming.`;
	if (recorded !== currentRef) return `Handoff records git ref "${recorded}", but the tree is now at "${currentRef}". Re-read the files in the manifest before acting on it.`;
	return null;
}
function validateHandoffContent(raw, filePath) {
	return parseHandoff(raw, filePath).result;
}
function rejected(errors, warnings) {
	return {
		handoff: null,
		result: {
			valid: false,
			errors,
			warnings
		}
	};
}
function collect(errors, read) {
	try {
		return read();
	} catch (cause) {
		errors.push(cause instanceof Error ? cause.message : String(cause));
		return;
	}
}
function fileCapMessage(source, bytes) {
	return `${source}: handoff file is ${bytes} bytes, over the ${MAX_HANDOFF_FILE_BYTES} byte limit. Summarize the state instead of pasting a transcript.`;
}
function screenDocument(raw, source) {
	const errors = [];
	const warnings = [];
	const stripped = raw.replace(INVISIBLE_SMUGGLING_CHARS, "");
	if (stripped.length !== raw.length) warnings.push(`${source}: ${raw.length - stripped.length} invisible character(s) present. They were removed before screening; rewrite the handoff without them.`);
	const bySeverity = /* @__PURE__ */ new Map();
	for (const hit of scanNormalized(stripped, HANDOFF_DENY_PATTERNS)) {
		const seen = bySeverity.get(hit.patternId);
		if (seen === void 0) bySeverity.set(hit.patternId, {
			severity: hit.severity,
			count: 1
		});
		else seen.count += 1;
	}
	for (const [patternId, { severity, count }] of bySeverity) {
		const message = `${source}: handoff matches injection pattern "${patternId}" (${count}x). A handoff is read straight into another agent's context; sanitize it before resuming.`;
		if (severity === "block") errors.push(message);
		else warnings.push(message);
	}
	return {
		errors,
		warnings
	};
}
function parseHandoff(raw, filePath) {
	const errors = [];
	const warnings = [];
	const rawBytes = Buffer.byteLength(raw, "utf8");
	if (rawBytes > 61440) return rejected([fileCapMessage(filePath, rawBytes)], warnings);
	const screened = screenDocument(raw, filePath);
	errors.push(...screened.errors);
	warnings.push(...screened.warnings);
	const parsed = collect(errors, () => parseFrontmatter(raw, filePath));
	if (parsed === void 0) return rejected(errors, warnings);
	if (!parsed.hadFrontmatter) return rejected([`${filePath}: handoff has no \`---\` frontmatter block. Every handoff declares one.`], warnings);
	const fm = parsed.frontmatter;
	const opts = { source: filePath };
	const id = collect(errors, () => requireString(fm, "id", opts));
	const status = collect(errors, () => requireEnum(fm, "status", HANDOFF_STATUSES, opts));
	const created = collect(errors, () => requireString(fm, "created", opts));
	const expires = collect(errors, () => requireString(fm, "expires", opts));
	const summary = collect(errors, () => requireString(fm, "summary", opts));
	const integrity = collect(errors, () => requireString(fm, "integrity", opts));
	const fromTool = collect(errors, () => requireEnum(fm, "fromTool", TOOLS, {
		...opts,
		optional: true
	}));
	const toTool = collect(errors, () => requireEnum(fm, "toTool", TOOLS, {
		...opts,
		optional: true
	}));
	const gitRef = collect(errors, () => requireString(fm, "gitRef", {
		...opts,
		optional: true
	}));
	if (id !== void 0 && !HANDOFF_ID_PATTERN.test(id)) errors.push(`${filePath}: \`id\` must be <YYYY-MM-DD>_<slug>_<5 hex> (got ${JSON.stringify(id)}).`);
	const createdMs = checkTimestamp(errors, filePath, "created", created);
	const expiresMs = checkTimestamp(errors, filePath, "expires", expires);
	if (createdMs !== null && expiresMs !== null && expiresMs < createdMs) errors.push(`${filePath}: \`expires\` is before \`created\`; the handoff can never be fresh.`);
	if (summary !== void 0) {
		if (summary.trim() === "") errors.push(`${filePath}: \`summary\` is blank. It is the first thing the next agent reads.`);
		else if (summary.length > 200) warnings.push(`${filePath}: \`summary\` is ${summary.length} chars, over 200. Keep it to one line; the detail belongs in the body.`);
	}
	const unknown = unknownFields(fm, KNOWN_FRONTMATTER_FIELDS);
	if (unknown.length > 0) warnings.push(`${filePath}: unknown frontmatter field(s) ${unknown.map((key) => JSON.stringify(key)).join(", ")}. They are ignored.`);
	checkBody$1(errors, filePath, parsed.body);
	if (integrity !== void 0 && summary !== void 0) checkIntegrity$1(errors, filePath, integrity, summary, parsed.body);
	const frontmatter = buildFrontmatter({
		id,
		status,
		created,
		expires,
		summary,
		integrity,
		fromTool,
		toTool,
		gitRef
	});
	if (frontmatter === null || errors.length > 0) return rejected(errors, warnings);
	return {
		handoff: {
			frontmatter,
			body: parsed.body,
			filePath
		},
		result: {
			valid: true,
			errors,
			warnings
		}
	};
}
function checkTimestamp(errors, source, field, value) {
	if (value === void 0) return null;
	const ms = Date.parse(value);
	if (Number.isNaN(ms)) {
		errors.push(`${source}: \`${field}\` must be an ISO-8601 timestamp (got ${JSON.stringify(value)}).`);
		return null;
	}
	return ms;
}
function checkBody$1(errors, source, body) {
	if (body.trim() === "") {
		errors.push(`${source}: handoff body is empty. There is no state to resume from.`);
		return;
	}
	if (BINARY_CONTENT_PATTERN.test(body)) {
		errors.push(`${source}: handoff body contains a null byte. Only UTF-8 text is accepted.`);
		return;
	}
	const bodyBytes = Buffer.byteLength(body, "utf8");
	if (bodyBytes > 51200) errors.push(`${source}: handoff body is ${bodyBytes} bytes, over the ${MAX_HANDOFF_BODY_BYTES} byte limit. Split the work or compact the narrative.`);
	const present = extractSectionHeadings(body);
	const missing = REQUIRED_BODY_SECTIONS.filter((heading) => !present.has(heading));
	if (missing.length > 0) errors.push(`${source}: handoff body is missing required section(s) ${missing.map((heading) => `"## ${heading}"`).join(", ")}.`);
}
function checkIntegrity$1(errors, source, declared, summary, body) {
	if (!INTEGRITY_PATTERN$1.test(declared)) {
		errors.push(`${source}: \`integrity\` must be "sha256:<64 hex>" (got ${JSON.stringify(declared)}).`);
		return;
	}
	const computed = computeHandoffIntegrity(summary, body);
	if (computed !== declared) errors.push(`${source}: \`integrity\` does not match the summary and body (declared ${declared}, computed ${computed}). The handoff was edited after it was written.`);
}
function buildFrontmatter(parts) {
	const { id, status, created, expires, summary, integrity } = parts;
	if (id === void 0 || status === void 0 || created === void 0 || expires === void 0 || summary === void 0 || integrity === void 0) return null;
	return {
		id,
		status,
		created,
		expires,
		summary,
		integrity,
		...parts.fromTool === void 0 ? {} : { fromTool: parts.fromTool },
		...parts.toTool === void 0 ? {} : { toTool: parts.toTool },
		...parts.gitRef === void 0 ? {} : { gitRef: parts.gitRef }
	};
}
function extractSectionHeadings(body) {
	const headings = /* @__PURE__ */ new Set();
	for (const match of body.matchAll(/^##[ \t]+(.+)$/gm)) {
		const heading = match[1]?.trim();
		if (heading !== void 0 && heading !== "") headings.add(heading);
	}
	return headings;
}
async function validateHandoffsDirectory(dir) {
	const valid = [];
	const invalid = [];
	const files = await listHandoffFiles$1(dir);
	const contents = await pLimit(READ_CONCURRENCY$7).map(files, (file) => readHandoffFile$1(join(dir, file)));
	for (const [index, file] of files.entries()) {
		const raw = contents[index];
		if (typeof raw !== "string") {
			invalid.push({
				file,
				errors: [raw.error]
			});
			continue;
		}
		const { handoff, result } = parseHandoff(raw, join(dir, file));
		if (handoff === null) invalid.push({
			file,
			errors: result.errors
		});
		else valid.push(handoff);
	}
	const activeCount = valid.filter((handoff) => ACTIVE_STATUSES.has(handoff.frontmatter.status)).length;
	return {
		valid,
		invalid,
		activeCount,
		overActiveCap: activeCount > 25
	};
}
async function listHandoffFiles$1(dir) {
	try {
		return (await readdir(dir)).filter((name) => name.endsWith(HANDOFF_FILE_EXTENSION$1)).toSorted();
	} catch (cause) {
		if (cause.code === "ENOENT") return [];
		throw new EngineError(`Cannot read the handoff directory ${dir}: ${cause instanceof Error ? cause.message : String(cause)}. Check the path and its permissions.`, {
			code: "FS_ERROR",
			cause
		});
	}
}
async function readHandoffFile$1(path) {
	try {
		const stats = await stat(path);
		if (!stats.isFile()) return { error: `${path}: not a regular file.` };
		if (stats.size > 61440) return { error: fileCapMessage(path, stats.size) };
		return await readFile(path, "utf8");
	} catch (cause) {
		return { error: `${path}: cannot be read (${cause instanceof Error ? cause.message : String(cause)}).` };
	}
}
//#endregion
//#region src/learnings/validation.ts
var validation_exports = /* @__PURE__ */ __exportAll({
	DEFAULT_LEARNING_FILE_COUNT: () => 150,
	LEARNINGS_SCREEN_PATTERNS: () => LEARNINGS_SCREEN_PATTERNS,
	LEARNING_CONFIDENCE_LEVELS: () => LEARNING_CONFIDENCE_LEVELS,
	MAX_LEARNING_FILE_BYTES: () => MAX_LEARNING_FILE_BYTES,
	MAX_LEARNING_FILE_COUNT: () => MAX_LEARNING_FILE_COUNT,
	MAX_LEARNING_SUMMARY_LENGTH: () => 200,
	MIN_LEARNING_FILE_COUNT: () => 50,
	REQUIRED_LEARNING_SECTIONS: () => REQUIRED_LEARNING_SECTIONS,
	computeLearningIntegrity: () => computeLearningIntegrity,
	resolveLearningsCaps: () => resolveLearningsCaps,
	sanitizeLearningsContent: () => sanitizeLearningsContent,
	validateLearningContent: () => validateLearningContent,
	validateLearningFileName: () => validateLearningFileName,
	validateLearningsDirectory: () => validateLearningsDirectory,
	verifyLearningIntegrity: () => verifyLearningIntegrity
});
const MAX_LEARNING_FILE_BYTES = 65536;
const MAX_LEARNING_FILE_COUNT = 1500;
const LEARNING_CONFIDENCE_LEVELS = [
	"low",
	"medium",
	"high"
];
const REQUIRED_LEARNING_SECTIONS = ["Why", "How to apply"];
function resolveLearningsCaps(configuredMaxCount) {
	return {
		maxCount: clampCount(configuredMaxCount),
		maxFileBytes: MAX_LEARNING_FILE_BYTES
	};
}
function clampCount(configured) {
	if (typeof configured !== "number" || !Number.isFinite(configured)) return 150;
	const floored = Math.floor(configured);
	if (floored < 50) return 50;
	return Math.min(floored, MAX_LEARNING_FILE_COUNT);
}
const FILE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const SLUG_PATTERN$1 = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const INTEGRITY_PATTERN = /^sha256:[0-9a-fA-F]{64}$/;
const INTEGRITY_PREFIX = "sha256:";
const NUL = "\0";
const READ_CONCURRENCY$6 = 8;
const LEARNINGS_SCREEN_PATTERNS = [
	...LEARNINGS_INJECTION_PATTERNS,
	...CONTENT_DENY_PATTERNS,
	...INJECTION_PATTERNS
];
function validateLearningContent(fileName, raw, options = {}) {
	const nameErrors = validateLearningFileName(fileName);
	if (nameErrors.length > 0) return {
		valid: false,
		errors: nameErrors,
		warnings: []
	};
	const source = `Learning "${fileName}"`;
	const maxFileBytes = options.maxFileBytes ?? 65536;
	const byteLength = Buffer.byteLength(raw, "utf8");
	if (byteLength > maxFileBytes) return fail$1(`${source} is ${byteLength} bytes, over the ${maxFileBytes} byte per-file cap (${byteLength - maxFileBytes} bytes over). Split it into separate learnings.`);
	if (raw.includes(NUL)) return fail$1(`${source} contains a null byte, so it is not UTF-8 text. Learnings are markdown.`);
	if (raw.trim() === "") return fail$1(`${source} is empty.`);
	let parsed;
	try {
		parsed = parseFrontmatter(raw, source);
	} catch (error) {
		return fail$1(messageOf$2(error));
	}
	if (!parsed.hadFrontmatter) return fail$1(`${source} has no frontmatter block. Open the file with a \`---\` fenced YAML head declaring id, date, confidence and summary.`);
	const errors = [];
	const warnings = [];
	checkFrontmatter(parsed.frontmatter, source, options.now ?? /* @__PURE__ */ new Date(), errors, warnings);
	checkBody(parsed.body, source, errors);
	const screened = screen(raw, source);
	errors.push(...screened.errors);
	warnings.push(...screened.warnings);
	checkIntegrity(parsed, source, errors);
	return {
		valid: errors.length === 0,
		errors,
		warnings
	};
}
function validateLearningFileName(fileName) {
	if (FILE_NAME_PATTERN.test(fileName)) return [];
	const errors = [];
	if (/[/\\]/.test(fileName) || fileName.includes("..")) errors.push(`Learning file name ${JSON.stringify(fileName)} must be a bare file name — no directory separators and no ".." segments.`);
	if (!fileName.endsWith(".md")) errors.push(`Learning file name ${JSON.stringify(fileName)} must end in ".md".`);
	const stem = fileName.endsWith(".md") ? fileName.slice(0, -3) : fileName;
	if (errors.length === 0 || !SLUG_PATTERN$1.test(stem)) errors.push(`Learning file name ${JSON.stringify(fileName)} must be a kebab-case slug plus ".md" (lower-case letters and digits, single hyphens between them), e.g. "cache-warmup-order.md".`);
	return errors;
}
function checkFrontmatter(frontmatter, source, now, errors, warnings) {
	const id = read(errors, () => requireString(frontmatter, "id", { source }));
	if (id !== void 0 && !SLUG_PATTERN$1.test(id)) errors.push(`${source}: \`id\` must be a kebab-case slug (got ${JSON.stringify(id)}).`);
	const date = read(errors, () => requireString(frontmatter, "date", { source }));
	if (date !== void 0 && !isCalendarDate(date)) errors.push(`${source}: \`date\` must be an ISO calendar date (YYYY-MM-DD), got ${JSON.stringify(date)}.`);
	read(errors, () => requireEnum(frontmatter, "confidence", LEARNING_CONFIDENCE_LEVELS, { source }));
	const summary = read(errors, () => requireString(frontmatter, "summary", { source }));
	if (summary !== void 0 && summary.trim() === "") errors.push(`${source}: \`summary\` must not be blank — it is the learning's index line.`);
	else if (summary !== void 0 && summary.length > 200) errors.push(`${source}: \`summary\` is ${summary.length} characters, over the 200 character cap. Move the detail into the body.`);
	checkTrustFields(frontmatter, source, now, errors, warnings);
}
function checkTrustFields(frontmatter, source, now, errors, warnings) {
	const reviewBy = read(errors, () => requireString(frontmatter, "reviewBy", {
		source,
		optional: true
	}));
	if (reviewBy === void 0) warnings.push(`${source}: no \`reviewBy\` date. A learning without a review horizon goes stale unnoticed.`);
	else if (!isCalendarDate(reviewBy)) errors.push(`${source}: \`reviewBy\` must be an ISO calendar date (YYYY-MM-DD), got ${JSON.stringify(reviewBy)}.`);
	else if (Date.parse(`${reviewBy}T23:59:59.999Z`) < now.getTime()) warnings.push(`${source}: \`reviewBy\` ${reviewBy} has passed. Re-verify the learning or retire it.`);
	const validatedAgainst = read(errors, () => requireString(frontmatter, "validatedAgainst", {
		source,
		optional: true
	}));
	if (validatedAgainst === void 0) warnings.push(`${source}: no \`validatedAgainst\` field. Record the command, test or path the learning was checked against in this repo.`);
	else if (validatedAgainst.trim() === "") errors.push(`${source}: \`validatedAgainst\` must name what the learning was checked against.`);
}
function checkBody(body, source, errors) {
	if (body.trim() === "") {
		errors.push(`${source}: the body is empty. A learning is the finding, not its frontmatter.`);
		return;
	}
	const missing = REQUIRED_LEARNING_SECTIONS.filter((section) => !hasSection(body, section));
	if (missing.length > 0) errors.push(`${source}: the body is missing the ${missing.map((s) => `"${s}"`).join(" and ")} ${missing.length === 1 ? "section" : "sections"}. Required sections: ${REQUIRED_LEARNING_SECTIONS.map((s) => `## ${s}`).join(", ")}.`);
}
function hasSection(body, section) {
	return new RegExp(`^#{1,6}[ \\t]*${escapeRegExp(section)}\\b`, "im").test(body);
}
function escapeRegExp(literal) {
	return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function screen(text, source) {
	const errors = [];
	const warnings = [];
	const stripped = text.replace(INVISIBLE_SMUGGLING_CHARS, "");
	if (stripped.length !== text.length) warnings.push(`${source}: ${text.length - stripped.length} invisible character(s) present. They were removed before screening; persist the sanitized body.`);
	const seen = /* @__PURE__ */ new Set();
	for (const hit of scanNormalized(stripped, LEARNINGS_SCREEN_PATTERNS)) {
		if (seen.has(hit.patternId)) continue;
		seen.add(hit.patternId);
		const message = `${source}: matches injection pattern \`${hit.patternId}\` at index ${hit.index} (${hit.matchLength} characters). Rewrite or remove the span.`;
		if (hit.severity === "block") errors.push(message);
		else warnings.push(message);
	}
	return {
		errors,
		warnings
	};
}
function checkIntegrity(parsed, source, errors) {
	const declared = frontmatterField(parsed, "integrity");
	if (declared === void 0) return;
	if (typeof declared !== "string" || !INTEGRITY_PATTERN.test(declared)) {
		errors.push(`${source}: \`integrity\` must be "${INTEGRITY_PREFIX}" followed by 64 hex characters.`);
		return;
	}
	if (!verifyLearningIntegrity(declared, parsed.body)) errors.push(`${source}: \`integrity\` does not match the body — declared ${declared}, computed ${computeLearningIntegrity(parsed.body)}. The body changed after it was stamped.`);
}
function sanitizeLearningsContent(raw) {
	const result = sanitizeContent(raw, LEARNINGS_SCREEN_PATTERNS);
	return {
		content: result.sanitized,
		modified: result.modified,
		strippedPatternIds: result.removed.map((entry) => entry.patternId).toSorted()
	};
}
function computeLearningIntegrity(body) {
	return INTEGRITY_PREFIX + createHash("sha256").update(body.trim(), "utf8").digest("hex");
}
function verifyLearningIntegrity(frontmatterHash, body) {
	if (typeof frontmatterHash !== "string" || !INTEGRITY_PATTERN.test(frontmatterHash)) return false;
	return frontmatterHash.toLowerCase() === computeLearningIntegrity(body);
}
async function validateLearningsDirectory(dir, caps) {
	const ordered = await orderOldestFirst(dir, await listLearningFiles(dir));
	const overCap = ordered.slice(caps.maxCount);
	const results = await pLimit(READ_CONCURRENCY$6).map(ordered.slice(0, caps.maxCount), async (file) => ({
		file,
		errors: await validateFile(dir, file, caps)
	}));
	const valid = [];
	const invalid = [];
	for (const result of results) if (result.errors.length === 0) valid.push(result.file);
	else invalid.push(result);
	return {
		valid,
		invalid,
		overCap
	};
}
async function listLearningFiles(dir) {
	try {
		return (await readdir(dir, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => entry.name);
	} catch (error) {
		if (error.code === "ENOENT") return [];
		throw new EngineError(`Cannot read the learnings directory ${dir}: ${messageOf$2(error)}`, {
			code: "FS_ERROR",
			cause: error
		});
	}
}
async function orderOldestFirst(dir, names) {
	const stamped = await pLimit(READ_CONCURRENCY$6).map(names, async (name) => ({
		name,
		day: await orderingDay(dir, name)
	}));
	stamped.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
	return stamped.map((entry) => entry.name);
}
const HEAD_BYTES = 4096;
async function orderingDay(dir, name) {
	const path = join(dir, name);
	const declared = declaredDate(await readHead(path));
	if (declared !== null) return declared;
	return new Date(await modifiedAt(path)).toISOString().slice(0, 10);
}
async function readHead(path) {
	let handle;
	try {
		handle = await open(path, "r");
		const buffer = Buffer.alloc(HEAD_BYTES);
		const { bytesRead } = await handle.read(buffer, 0, HEAD_BYTES, 0);
		return buffer.subarray(0, bytesRead).toString("utf8");
	} catch {
		return "";
	} finally {
		await handle?.close();
	}
}
function declaredDate(head) {
	if (!head.startsWith("---")) return null;
	const fenceEnd = head.indexOf("\n---", 3);
	const frontmatter = fenceEnd === -1 ? head : head.slice(0, fenceEnd);
	return /^[ \t]*date[ \t]*:[ \t]*["']?(\d{4}-\d{2}-\d{2})/m.exec(frontmatter)?.[1] ?? null;
}
async function modifiedAt(path) {
	try {
		return (await stat(path)).mtimeMs;
	} catch {
		return 0;
	}
}
async function validateFile(dir, file, caps) {
	let raw;
	try {
		raw = await readFile(join(dir, file), "utf8");
	} catch (error) {
		return [`Learning "${file}" could not be read: ${messageOf$2(error)}`];
	}
	return validateLearningContent(file, raw, { maxFileBytes: caps.maxFileBytes }).errors;
}
function fail$1(message) {
	return {
		valid: false,
		errors: [message],
		warnings: []
	};
}
function read(errors, reader) {
	try {
		return reader();
	} catch (error) {
		errors.push(messageOf$2(error));
		return;
	}
}
function messageOf$2(error) {
	return error instanceof Error ? error.message : String(error);
}
function isCalendarDate(value) {
	if (!ISO_DATE_PATTERN.test(value)) return false;
	const parsed = /* @__PURE__ */ new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}
//#endregion
//#region src/tools/categories.ts
var categories_exports = /* @__PURE__ */ __exportAll({
	ALL_TOOL_CATEGORIES: () => ALL_TOOL_CATEGORIES,
	FUNCTIONAL_TOOL_CATEGORIES: () => FUNCTIONAL_TOOL_CATEGORIES,
	RESERVED_TOOL_CATEGORIES: () => RESERVED_TOOL_CATEGORIES,
	buildToolCategoryMap: () => buildToolCategoryMap,
	isReservedToolCategory: () => isReservedToolCategory,
	isToolCategory: () => isToolCategory
});
const FUNCTIONAL_TOOL_CATEGORIES = [
	"read",
	"edit",
	"execute",
	"network",
	"spawn",
	"planning"
];
const RESERVED_TOOL_CATEGORIES = ["git", "board"];
const ALL_TOOL_CATEGORIES = [...FUNCTIONAL_TOOL_CATEGORIES, ...RESERVED_TOOL_CATEGORIES];
const VALID_TOOL_CATEGORIES = new Set(ALL_TOOL_CATEGORIES);
const RESERVED_LOOKUP = new Set(RESERVED_TOOL_CATEGORIES);
function isToolCategory(value) {
	return typeof value === "string" && VALID_TOOL_CATEGORIES.has(value);
}
function isReservedToolCategory(value) {
	return typeof value === "string" && RESERVED_LOOKUP.has(value);
}
function buildToolCategoryMap(names) {
	const map = Object.create(null);
	for (const category of ALL_TOOL_CATEGORIES) for (const tool of names[category] ?? []) {
		if (tool === "" || map[tool] !== void 0) continue;
		map[tool] = category;
	}
	return map;
}
//#endregion
//#region src/tools/allowlist.ts
var allowlist_exports = /* @__PURE__ */ __exportAll({
	AGENT_TOOL_POLICIES_FILE: () => AGENT_TOOL_POLICIES_FILE,
	AGENT_TOOL_POLICIES_SCHEMA: () => AGENT_TOOL_POLICIES_SCHEMA,
	ALLOWLIST_FAILURE_PHASE: () => ALLOWLIST_FAILURE_PHASE,
	buildAgentToolPoliciesJson: () => buildAgentToolPoliciesJson,
	checkToolAccess: () => checkToolAccess,
	deriveUserAgentPolicy: () => deriveUserAgentPolicy,
	getAgentToolPolicy: () => getAgentToolPolicy,
	onAllowlistDenial: () => onAllowlistDenial,
	toFailureLogEntry: () => toFailureLogEntry,
	validateToolPolicies: () => validateToolPolicies
});
const ALLOWLIST_FAILURE_PHASE = "tool-allowlist";
const AGENT_TOOL_POLICIES_SCHEMA = "stamity/agent-tool-policies/v1";
const AGENT_TOOL_POLICIES_FILE = "agent-tool-policies.json";
const denialListeners = /* @__PURE__ */ new Set();
function onAllowlistDenial(listener) {
	denialListeners.add(listener);
	let released = false;
	return () => {
		if (released) return;
		released = true;
		denialListeners.delete(listener);
	};
}
function emitDenial(event) {
	for (const listener of denialListeners) try {
		listener(event);
	} catch {
		continue;
	}
}
function deny(agentId, tool, category, reason, message) {
	emitDenial({
		agentId,
		tool,
		reason
	});
	return {
		allowed: false,
		category,
		reason: message
	};
}
function getAgentToolPolicy(roster, agentId) {
	return roster.find((policy) => policy.agentId === agentId);
}
function checkToolAccess(roster, agentId, tool, toolCategoryMap) {
	const policy = getAgentToolPolicy(roster, agentId);
	if (policy === void 0) return deny(agentId, tool, null, "unknown-agent", `No tool policy for agent "${agentId}": an agent absent from the roster may use nothing. Add a policy for "${agentId}", or delegate to a rostered agent.`);
	const mapped = Object.hasOwn(toolCategoryMap, tool) ? toolCategoryMap[tool] : void 0;
	const category = isToolCategory(mapped) ? mapped : null;
	if (policy.denyTools?.includes(tool) === true) return deny(agentId, tool, category, "tool-denied", `Agent "${agentId}" is denied tool "${tool}" by name; its policy lists the tool in denyTools.`);
	if (category === null) return deny(agentId, tool, null, "tool-denied", `Tool "${tool}" maps to no category on this client, so it cannot be authorized. Add "${tool}" to the client's tool-category map under the capability it grants.`);
	if (isReservedToolCategory(category)) return deny(agentId, tool, category, "reserved-category", `Tool "${tool}" maps to reserved category "${category}", which no policy can grant. Map "${tool}" to the functional category it actually uses.`);
	if (!policy.allow.includes(category)) return deny(agentId, tool, category, "category-denied", `Agent "${agentId}" may not use tool "${tool}": it grants no "${category}" access. Granted: ${policy.allow.length > 0 ? policy.allow.join(", ") : "(none)"}.`);
	return {
		allowed: true,
		category,
		reason: `Agent "${agentId}" may use tool "${tool}" through its "${category}" grant.`
	};
}
function validateToolPolicies(roster) {
	const issues = [];
	const seen = /* @__PURE__ */ new Set();
	for (const policy of roster) {
		const id = policy.agentId;
		if (id.trim() === "") issues.push(`A roster entry has a blank agentId; every policy must name the agent it governs.`);
		else if (seen.has(id)) issues.push(`Duplicate policy for agent "${id}": only the first is ever consulted. Merge the rows into one grant.`);
		seen.add(id);
		if (policy.rationale.trim() === "") issues.push(`Agent "${id}" has a grant with no rationale; state why it holds these categories.`);
		if (policy.allow.length === 0) issues.push(`Agent "${id}" allows no tool category, so it can invoke nothing. Grant what its role needs.`);
		if (policy.source !== void 0) {
			const source = policy.source;
			const packId = source.packId;
			if (source.kind !== "core" && source.kind !== "pack") issues.push(`Agent "${id}" declares policy source ${JSON.stringify(source.kind) ?? typeof source.kind}, which names no origin, so the emitted row would carry no provenance at all. Use "core" for a shipped roster row, or "pack" with the installing pack's id.`);
			else if (source.kind === "pack" && (typeof packId !== "string" || packId.trim() === "")) issues.push(`Agent "${id}" declares a pack source with no pack id, so the emitted row cannot say which installed pack the grant came from. Name the pack that supplies the agent.`);
		}
		for (const granted of policy.allow) {
			const category = granted;
			if (!isToolCategory(category)) issues.push(`Agent "${id}" allows unknown tool category "${category}", which matches no tool. Valid categories: ${ALL_TOOL_CATEGORIES.join(", ")}.`);
			else if (isReservedToolCategory(category)) issues.push(`Agent "${id}" allows reserved tool category "${category}", which grants nothing. Remove it, or grant the functional category the agent actually needs.`);
		}
	}
	return issues;
}
function emittedSource(source) {
	if (source === void 0) return void 0;
	if (source.kind === "core") return { kind: "core" };
	if (source.kind === "pack") {
		const packId = source.packId;
		return packId.trim() === "" ? void 0 : {
			kind: "pack",
			packId
		};
	}
}
function emittedRow(policy) {
	const allow = ALL_TOOL_CATEGORIES.filter((category) => !isReservedToolCategory(category) && policy.allow.includes(category));
	const denyTools = [...new Set(policy.denyTools ?? [])].toSorted();
	const source = emittedSource(policy.source);
	return {
		agentId: policy.agentId,
		allow,
		...denyTools.length > 0 ? { denyTools } : {},
		rationale: policy.rationale,
		...source === void 0 ? {} : { source }
	};
}
function buildAgentToolPoliciesJson(roster) {
	const byId = /* @__PURE__ */ new Map();
	for (const policy of roster) if (!byId.has(policy.agentId)) byId.set(policy.agentId, policy);
	const policies = [...byId.values()].toSorted((a, b) => a.agentId < b.agentId ? -1 : a.agentId > b.agentId ? 1 : 0).map(emittedRow);
	return JSON.stringify({
		schema: AGENT_TOOL_POLICIES_SCHEMA,
		categories: ALL_TOOL_CATEGORIES,
		policies
	}, null, 2);
}
function deriveUserAgentPolicy(base, userAdditions) {
	const allow = [];
	for (const candidate of [...base.allow, ...userAdditions]) {
		const category = candidate;
		if (!isToolCategory(category)) continue;
		if (isReservedToolCategory(category)) continue;
		if (allow.includes(category)) continue;
		allow.push(category);
	}
	const added = allow.filter((category) => !base.allow.includes(category));
	return {
		agentId: base.agentId,
		allow,
		...base.denyTools !== void 0 ? { denyTools: base.denyTools } : {},
		rationale: added.length > 0 ? `${base.rationale} User-granted: ${added.join(", ")}.` : base.rationale,
		...base.source !== void 0 ? { source: base.source } : {}
	};
}
function toFailureLogEntry(event, at = /* @__PURE__ */ new Date()) {
	return {
		timestamp: at.toISOString(),
		phase: ALLOWLIST_FAILURE_PHASE,
		agentId: event.agentId,
		errorType: "AllowlistDenial",
		message: `Agent "${event.agentId}" was denied tool "${event.tool}" (${event.reason}).`,
		context: {
			tool: event.tool,
			reason: event.reason
		}
	};
}
//#endregion
//#region src/tools/translator.ts
var translator_exports = /* @__PURE__ */ __exportAll({
	ADAPTER_ALLOWLIST_COVERAGE: () => ADAPTER_ALLOWLIST_COVERAGE,
	PLATFORM_TOOL_MARKER: () => PLATFORM_TOOL_MARKER,
	buildAllowlistCoverageTable: () => buildAllowlistCoverageTable,
	buildAskUserPlatformTable: () => buildAskUserPlatformTable,
	getAskUserToolEntry: () => getAskUserToolEntry,
	substituteCanonicalPlatformMarker: () => substituteCanonicalPlatformMarker,
	toClaudeToolsFrontmatter: () => toClaudeToolsFrontmatter,
	toCodexToolsFrontmatter: () => toCodexToolsFrontmatter,
	toCopilotToolsFrontmatter: () => toCopilotToolsFrontmatter,
	toCursorReadonlyFrontmatter: () => toCursorReadonlyFrontmatter
});
const CLAUDE_TOOL_NAMES = {
	read: [
		"Read",
		"Grep",
		"Glob",
		"Skill"
	],
	edit: [
		"Edit",
		"Write",
		"NotebookEdit"
	],
	execute: ["Bash", "PowerShell"],
	network: ["WebFetch", "WebSearch"],
	spawn: ["Agent", "Task"],
	planning: ["TodoWrite"]
};
const CODEX_TOOL_NAMES = CLAUDE_TOOL_NAMES;
const COPILOT_TOOL_NAMES = {
	read: ["read", "search"],
	edit: ["edit"],
	execute: ["execute"],
	network: ["web"],
	spawn: ["agent"],
	planning: ["todo"]
};
const CURSOR_MUTATING_CATEGORIES = /* @__PURE__ */ new Set(["edit", "execute"]);
function resolveGrant(categories) {
	for (const granted of categories) {
		const category = granted;
		if (!isToolCategory(category)) throw new EngineError(`Unknown tool category "${category}" in a client tool-dialect transform. Known categories: ${ALL_TOOL_CATEGORIES.join(", ")}.`, { code: "VALIDATION_ERROR" });
	}
	return ALL_TOOL_CATEGORIES.filter((category) => !isReservedToolCategory(category) && categories.includes(category));
}
function renderToolNames(categories, names) {
	const out = [];
	for (const category of resolveGrant(categories)) for (const name of names[category] ?? []) if (!out.includes(name)) out.push(name);
	return out;
}
function toClaudeToolsFrontmatter(categories) {
	return renderToolNames(categories, CLAUDE_TOOL_NAMES).join(", ");
}
function toCopilotToolsFrontmatter(categories) {
	return `[${renderToolNames(categories, COPILOT_TOOL_NAMES).map((alias) => `"${alias}"`).join(", ")}]`;
}
function toCodexToolsFrontmatter(categories) {
	return renderToolNames(categories, CODEX_TOOL_NAMES).join(", ");
}
function toCursorReadonlyFrontmatter(categories) {
	const granted = resolveGrant(categories);
	if (granted.length === 0) return categories.length === 0 ? true : null;
	return !granted.some((category) => CURSOR_MUTATING_CATEGORIES.has(category));
}
const ADAPTER_ALLOWLIST_COVERAGE = [
	{
		tool: "claude",
		mechanism: "`tools:` sub-agent frontmatter allowlist (comma-separated names); an omitted field inherits every tool, and a list resolving to nothing refuses the spawn",
		strength: "hard"
	},
	{
		tool: "cursor",
		mechanism: "`readonly:` boolean — blocks file edits and state-changing shell commands, but cannot name individual tools, so network and delegation grants are unexpressed",
		strength: "soft"
	},
	{
		tool: "copilot",
		mechanism: "`tools:` alias list where `[]` grants nothing; tool-level only, with no sub-tool (per-shell-command) granularity",
		strength: "hard"
	},
	{
		tool: "codex",
		mechanism: "no documented native per-agent `tools` key in `.codex/agents/*.toml`; the role grant is developer-instruction prose, while `sandbox_mode` supplies the supported filesystem boundary",
		strength: "soft",
		provisional: true
	}
];
function buildAllowlistCoverageTable() {
	return [
		"| Client | Mechanism | Strength |",
		"|---|---|---|",
		...ADAPTER_ALLOWLIST_COVERAGE.map((row) => {
			const strength = row.provisional === true ? `${row.strength} (provisional)` : row.strength;
			return `| \`${row.tool}\` | ${row.mechanism} | ${strength} |`;
		})
	].join("\n");
}
const ASK_USER_TOOLS = {
	claude: {
		tool: "claude",
		toolName: "AskUserQuestion",
		note: "**Platform:** Ask through the `AskUserQuestion` tool. A delegated sub-agent cannot call it — the tool is stripped from every sub-agent context — so a sub-agent returns its question as a blocked result and the delegating agent runs the ask."
	},
	cursor: {
		tool: "cursor",
		toolName: null,
		note: "**Platform:** Cursor documents no native question tool. Use the plain-text fallback below for every ASK checkpoint, and stop for the answer instead of assuming one."
	},
	copilot: {
		tool: "copilot",
		toolName: null,
		note: "**Platform:** GitHub Copilot documents no native question tool. Use the plain-text fallback below for every ASK checkpoint, and stop for the answer instead of assuming one."
	},
	codex: {
		tool: "codex",
		toolName: null,
		note: "**Platform:** Codex documents no native question tool. Use the plain-text fallback below for every ASK checkpoint, and stop for the answer instead of assuming one."
	}
};
function getAskUserToolEntry(tool) {
	const name = tool;
	if (!VALID_TOOLS.has(name)) throw new EngineError(`Unknown target tool "${name}" has no ask-user entry. Known tools: ${TOOLS.join(", ")}.`, { code: "VALIDATION_ERROR" });
	return ASK_USER_TOOLS[tool];
}
const PLATFORM_TOOL_MARKER = "<!-- STAMITY:PLATFORM-TOOL -->";
function buildAskUserPlatformTable() {
	return [
		"| Client | Native question tool | Guidance |",
		"|---|---|---|",
		...TOOLS.map((tool) => {
			const entry = getAskUserToolEntry(tool);
			return `| \`${tool}\` | ${entry.toolName === null ? "_none documented_" : `\`${entry.toolName}\``} | ${entry.note} |`;
		})
	].join("\n");
}
function substituteCanonicalPlatformMarker(content, tool) {
	if (!content.includes("<!-- STAMITY:PLATFORM-TOOL -->")) return content;
	return content.split(PLATFORM_TOOL_MARKER).join(getAskUserToolEntry(tool).note);
}
//#endregion
//#region src/hooks/model.ts
var model_exports$1 = /* @__PURE__ */ __exportAll({
	CANONICAL_HOOK_EVENTS: () => CANONICAL_HOOK_EVENTS,
	CLAUDE_EVENT_NAMES: () => CLAUDE_EVENT_NAMES,
	CLIENT_EXTENSION_EVENTS: () => CLIENT_EXTENSION_EVENTS,
	CLIENT_HOOK_GUARANTEES: () => CLIENT_HOOK_GUARANTEES,
	isCanonicalHookEvent: () => isCanonicalHookEvent
});
const CANONICAL_HOOK_EVENTS = [
	"session_start",
	"pre_tool_use",
	"post_tool_use",
	"user_prompt_submit",
	"stop",
	"session_end"
];
const CLAUDE_EVENT_NAMES = {
	session_start: "SessionStart",
	pre_tool_use: "PreToolUse",
	post_tool_use: "PostToolUse",
	user_prompt_submit: "UserPromptSubmit",
	stop: "Stop",
	session_end: "SessionEnd"
};
const CANONICAL_HOOK_EVENT_SET = new Set(CANONICAL_HOOK_EVENTS);
function isCanonicalHookEvent(v) {
	return CANONICAL_HOOK_EVENT_SET.has(v);
}
const CLIENT_HOOK_GUARANTEES = [
	{
		tool: "claude",
		failMode: "fail-closed",
		blockingExitCode: 2,
		notes: "Exit 2 blocks the pending action and returns stderr to the agent; exit 0 with structured stdout feeds the session instead."
	},
	{
		tool: "codex",
		failMode: "fail-closed",
		blockingExitCode: 2,
		notes: "Exit-2 denies supported tool calls after native /hooks trust. PreToolUse carries no agent identity, so the core role guard is telemetry; hosted tools and specialized paths may bypass hooks."
	},
	{
		tool: "copilot",
		failMode: "fail-closed",
		blockingExitCode: 2,
		notes: "preToolUse exit 2, errors and JSON deny block. Timeouts always fail-open; other events are advisory unless documented. The identity-free core role guard is telemetry. sessionStart output reaches the session: it is injected as additionalContext (docs.github.com hooks reference, 2026-09-17)."
	},
	{
		tool: "cursor",
		failMode: "opt-in-fail-closed",
		blockingExitCode: 2,
		notes: "Exit 2 denies the action. failClosed opts supported events into denial on hook errors and timeouts; the identity-free core role guard remains telemetry."
	}
];
const CLIENT_EXTENSION_EVENTS = [
	{
		tool: "claude",
		event: "ConfigChange",
		portable: false,
		note: "Fires the configuration-change notice per change. Every other client runs the same script on session start instead, where it reads as drift guidance rather than as an alert.",
		citation: {
			url: "https://code.claude.com/docs/en/hooks",
			accessDate: "2026-08-17"
		}
	},
	{
		tool: "claude",
		event: "TaskCompleted",
		portable: false,
		note: "Carries the work-scoped review gate's blocking decision: exit 2 prevents the task from being marked completed, and the client shows the message to the operator rather than to the model. Elsewhere work's review ladder is prose the agent follows, and no adapter claims a gate it cannot fire.",
		citation: {
			url: "https://code.claude.com/docs/en/hooks",
			accessDate: "2026-08-17"
		}
	},
	{
		tool: "claude",
		event: "SubagentStop",
		portable: false,
		note: "Carries the review gate's round counter — a finishing sub-agent is what the counter counts, and the payload's `last_assistant_message` is where a finishing reviewer's verdict travels, since no documented field carries one. It never blocks: exit 2 here would hold the sub-agent open with a message only the operator sees, which is neither this gate's decision nor a signal the loop could act on. Elsewhere the round accounting stays prompt-carried.",
		citation: {
			url: "https://code.claude.com/docs/en/hooks",
			accessDate: "2026-08-17"
		}
	}
];
//#endregion
//#region src/hooks/scripts.ts
var scripts_exports = /* @__PURE__ */ __exportAll({
	DEFAULT_MAX_INDEX_LINES: () => 20,
	IDENTITY_FREE_PRE_TOOL_USE_PAYLOADS: () => IDENTITY_FREE_PRE_TOOL_USE_PAYLOADS,
	MAX_POLICY_FILE_BYTES: () => MAX_POLICY_FILE_BYTES,
	MAX_REVIEW_GATE_STATE_BYTES: () => MAX_REVIEW_GATE_STATE_BYTES,
	REVIEW_GATE_FILE: () => REVIEW_GATE_FILE,
	REVIEW_GATE_STATE_FILE: () => REVIEW_GATE_STATE_FILE,
	SESSION_START_SCREEN_PATTERN_IDS: () => SESSION_START_SCREEN_PATTERN_IDS,
	buildConfigTamperNoticeScript: () => buildConfigTamperNoticeScript,
	buildPreToolUseGuardScript: () => buildPreToolUseGuardScript,
	buildReviewGateScript: () => buildReviewGateScript,
	buildSessionStartScript: () => buildSessionStartScript,
	planCoreHookScripts: () => planCoreHookScripts,
	unionToolCategoryMap: () => unionToolCategoryMap
});
const SESSION_START_FILE = "stamity-session-start.mjs";
const GUARD_FILE = "stamity-pre-tool-use-guard.mjs";
const TAMPER_NOTICE_FILE = "stamity-config-tamper-notice.mjs";
const REVIEW_GATE_FILE = "stamity-review-gate.mjs";
const BLOCKING_EXIT_CODE = 2;
const MAX_POLICY_FILE_BYTES = 262144;
const REVIEW_GATE_STATE_FILE = `${STATE_DIR}/review-gate.json`;
const MAX_REVIEW_GATE_STATE_BYTES = 131072;
const RESUMABLE_STATUSES = ["active", "in-progress"];
const MCP_TOOL_PREFIX$1 = "mcp__";
const NETWORK_VOCABULARY = /https?|curl|wget|fetch/i;
const SESSION_START_SCREEN = [
	...LEARNINGS_INJECTION_PATTERNS,
	...CONTENT_DENY_PATTERNS,
	...INJECTION_PATTERNS
].filter((entry) => entry.severity === "block" && !NETWORK_VOCABULARY.test(entry.pattern.source));
const SESSION_START_SCREEN_PATTERN_IDS = SESSION_START_SCREEN.map((entry) => entry.id);
const NORMALIZE_FOR_SCREEN = `const CONFUSABLES = ${json((() => {
	const table = {};
	for (let code = 128; code <= 65535; code += 1) {
		const composed = String.fromCharCode(code).normalize("NFKC");
		if (composed.length !== 1) continue;
		const folded = foldConfusables(composed);
		if (folded.length !== 1 || folded === composed || folded.charCodeAt(0) > 127) continue;
		table[String(composed.charCodeAt(0))] = folded;
	}
	return table;
})())};
const NON_ASCII = /[\\u0080-\\uFFFF]/;
const WORD_ADJACENT_MASK = /(?<=[A-Za-z])[\\u0080-\\uFFFF]+|[\\u0080-\\uFFFF]+(?=[A-Za-z])/g;

/** Cross-script lookalikes mapped to ASCII, over the NFKC form. */
function foldConfusables(text) {
  if (!NON_ASCII.test(text)) return text;
  const normalized = text.normalize("NFKC");
  let out = "";
  let cursor = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    const key = String(normalized.charCodeAt(index));
    if (!Object.hasOwn(CONFUSABLES, key)) continue;
    out += normalized.slice(cursor, index) + CONFUSABLES[key];
    cursor = index + 1;
  }
  return cursor === 0 ? normalized : out + normalized.slice(cursor);
}

/** Rejoin a keyword split by a mask the fold table does not carry. */
function joinMaskedWords(text) {
  if (!NON_ASCII.test(text)) return text;
  return text.normalize("NFKD").replace(WORD_ADJACENT_MASK, "");
}

/** Fold first, then join: the join inherits the fold's substitutions. */
function normalizeForScreen(text) {
  return joinMaskedWords(foldConfusables(text));
}`;
function repoRelativeSegments(value, field) {
	const segments = value.split(/[\\/]+/).map((segment) => segment.trim()).filter((segment) => segment !== "" && segment !== ".");
	if (segments.length === 0 || segments.includes("..") || /^([A-Za-z]:|[\\/])/.test(value)) throw new EngineError(`${field} must be a repo-relative directory (got ${JSON.stringify(value)}). A generated hook reads inside the repo it was generated for, so an absolute path or a ".." segment is refused rather than normalized.`, { code: "VALIDATION_ERROR" });
	return segments;
}
function policyPathExpression(value) {
	if (value.trim() === "") throw new EngineError("policiesJsonPath must name the emitted policy document; it was empty. Pass the path the adapter writes it to, relative to the guard script.", { code: "VALIDATION_ERROR" });
	if (/^([A-Za-z]:[\\/]|[\\/])/.test(value)) return json(value);
	return `join(dirname(fileURLToPath(import.meta.url)), ${value.split(/[\\/]+/).filter((segment) => segment !== "" && segment !== ".").map((segment) => json(segment)).join(", ")})`;
}
function positiveInteger(value, field) {
	if (!Number.isInteger(value) || value <= 0) throw new EngineError(`${field} must be a positive whole number of lines (got ${JSON.stringify(value)}).`, { code: "VALIDATION_ERROR" });
	return value;
}
function bandedIterations(value) {
	if (!Number.isInteger(value) || value < 1 || value > 10) throw new EngineError(`maxIterations must be a whole number of rounds within 1..10 (got ${JSON.stringify(value)}). Pass it through clampReviewIterations before building the gate.`, { code: "VALIDATION_ERROR" });
	return value;
}
function json(value) {
	return JSON.stringify(value);
}
function header(summary, posture) {
	return [
		"#!/usr/bin/env node",
		...summary.map((line) => line === "" ? "//" : `// ${line}`),
		"//",
		"// Generated file — regenerate it rather than editing; local edits are overwritten.",
		"// Trust posture: exec form, repo-committed, no dynamic evaluation, no network reach.",
		...posture.map((line) => `// ${line}`)
	].join("\n");
}
const GENERATED_ANCHOR_SEGMENTS = [
	".stamity",
	"generated",
	"hooks"
];
function resolveRepoRoot(layout) {
	const derived = layout === "container" ? "" : `
  const derived = derivedRoot();
  if (derived !== "") return derived;`;
	const helper = layout === "container" ? "" : `/**
 * The repository root this script was emitted into, or "" when the script is not
 * sitting where emission puts one. Shape-checked rather than assumed: four levels
 * up from any directory is some directory, and only the emitted layout's own
 * parent segments make it a repository root.
 */
function derivedRoot() {
  let dir = dirname(HERE);
  for (const segment of ANCHOR_SEGMENTS) {
    if (basename(dir) !== segment) return "";
    dir = dirname(dir);
  }
  return dir;
}

`;
	return `${layout === "container" ? "" : `const HERE = dirname(fileURLToPath(import.meta.url));
const ANCHOR_SEGMENTS = ${json(GENERATED_ANCHOR_SEGMENTS.toReversed())};

`}${helper}function repoRoot() {
  const cwd = resolve(process.cwd());${derived}
  const declared = process.env.STAMITY_REPO_ROOT;
  if (typeof declared !== "string" || declared === "") return cwd;
  const candidate = resolve(cwd, declared);
  const prefix = candidate.endsWith(sep) ? candidate : candidate + sep;
  if (candidate !== cwd && !cwd.startsWith(prefix)) return cwd;
  try {
    if (!statSync(join(candidate, STATE_SEGMENTS[0])).isDirectory()) return cwd;
  } catch {
    return cwd;
  }
  return candidate;
}`;
}
function repoRootImports(layout) {
	return layout === "container" ? {
		path: [],
		url: ""
	} : {
		path: ["basename", "dirname"],
		url: "import { fileURLToPath } from \"node:url\";\n"
	};
}
function namedImport(names, module) {
	return `import { ${[...new Set(names)].toSorted().join(", ")} } from "${module}";`;
}
const READ_STDIN = `function readPayload() {
  let raw = "";
  try {
    raw = readFileSync(0, "utf8");
  } catch {
    return {};
  }
  if (raw.trim() === "") return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" ? parsed : {};
  } catch {
    // An unparseable payload names no agent and no tool, so it attributes to
    // nothing this script governs — treated as out of scope, never as a
    // finding, so a client's payload change cannot brick a session.
    return {};
  }
}`;
const READ_FIELD = `function field(payload, names) {
  for (const name of names) {
    const value = Object.hasOwn(payload, name) ? payload[name] : undefined;
    if (typeof value === "string" && value !== "") return value;
  }
  return "";
}`;
function buildSessionStartScript(opts = {}) {
	const segments = repoRelativeSegments(opts.stateDir ?? ".stamity", "stateDir");
	const maxLines = positiveInteger(opts.maxIndexLines ?? 20, "maxIndexLines");
	const layout = opts.layout ?? "generated";
	const extra = repoRootImports(layout);
	const screen = SESSION_START_SCREEN.map((entry) => `  { id: ${json(entry.id)}, re: new RegExp(${json(entry.pattern.source)}, ${json(entry.pattern.flags)}) },`).join("\n");
	return `${header([
		"stamity — session-start context load.",
		"",
		"Prints the learnings index and the resumable handoffs for this repo by",
		"reading the state directory directly: no agent is spawned and nothing is",
		"written. Every file clears a size, injection, integrity and review screen",
		"before it is LISTED; a file that fails one is named in a skip line with its",
		"reason, and every field printed — the file name included — is flattened to",
		"one bounded line first. Bodies and matched spans are never printed."
	], [
		"Reads outside repo state: the wall clock, which decides whether a learning's",
		"review horizon has passed and whether a handoff has expired. Same repo, two",
		"different days, two different banners."
	])}

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
${namedImport([
		"join",
		"resolve",
		"sep",
		...extra.path
	], "node:path")}
${extra.url}
const STATE_SEGMENTS = ${json(segments)};
const MAX_ITEM_LINES = ${maxLines};
const MAX_LEARNING_BYTES = ${MAX_LEARNING_FILE_BYTES};
const MAX_HANDOFF_BYTES = ${MAX_HANDOFF_FILE_BYTES};
const MAX_FIELD_CHARS = 200;
const RESUMABLE = ${json([...RESUMABLE_STATUSES])};
const INVISIBLE = new RegExp(${json(INVISIBLE_SMUGGLING_CHARS.source)}, "g");
const SCREEN = [
${screen}
];

${NORMALIZE_FOR_SCREEN}

const NOW = Date.now();

${resolveRepoRoot(layout)}

const STATE_ROOT = join(repoRoot(), ...STATE_SEGMENTS);

/** \`.md\` entries in a directory. Absent or unreadable both read as empty. */
function listMarkdown(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/**
 * One document, screened. Checks run in the order that keeps a refusal
 * attributable: size before read, injection before shape, then shape, then
 * integrity — so a poisoned file reports as poisoned rather than as malformed.
 */
function inspect(dir, name, maxBytes, coversSummary) {
  let stats;
  try {
    stats = statSync(join(dir, name));
  } catch {
    return null;
  }
  if (!stats.isFile()) return null;
  const doc = { name, size: stats.size, mtime: stats.mtimeMs, skip: "", head: null };
  if (stats.size > maxBytes) return { ...doc, skip: "over-size" };

  let raw;
  try {
    raw = readFileSync(join(dir, name), "utf8");
  } catch {
    return { ...doc, skip: "invalid-frontmatter" };
  }
  if (screened(raw)) return { ...doc, skip: "injection-detected" };
  const parsed = parseDocument(raw);
  if (parsed === null) return { ...doc, skip: "invalid-frontmatter" };
  const covered = coversSummary
    ? String(parsed.head.summary ?? "").trim() + "\\n" + parsed.body.trim()
    : parsed.body.trim();
  if (!integrityHolds(parsed.head.integrity, covered)) {
    return { ...doc, skip: "integrity-mismatch" };
  }
  return { ...doc, head: parsed.head };
}

/**
 * The screen, run over every copy the engine's own gates run it over: the raw
 * text, the invisible-stripped copy, and the composed normalization of that
 * copy. A union, never a replacement — the normalized copy adds the refusals a
 * lookalike or a combining mark hid, and the raw copy keeps the ones NFKC
 * destroys by composing a trailing mark into the letter before it.
 */
function screened(raw) {
  const stripped = raw.replace(INVISIBLE, "");
  const copies = [raw, stripped];
  const normalized = normalizeForScreen(stripped);
  if (normalized !== stripped) copies.push(normalized);
  return SCREEN.some((entry) =>
    copies.some((copy) => {
      // A \`g\`-flagged row carries \`lastIndex\` between calls, and this now tests
      // three copies per row: without the reset the second copy would resume
      // mid-string and a hit could fall through.
      entry.re.lastIndex = 0;
      return entry.re.test(copy);
    }),
  );
}

/**
 * Fenced head plus body. Top-level scalars only — nested keys are indented and
 * ignored — but every SCALAR SHAPE the engine's own writer emits is read, not
 * just the bare one.
 *
 * The writer serializes through a YAML library, so a value carrying a newline
 * comes back as a block scalar and a value carrying a quote or a leading
 * indicator comes back double-quoted with escapes. A per-line regex that took
 * the raw remainder read a block scalar's own indicator (\`|-\`) as the value:
 * a garbage banner line for a learning, and for a handoff a SILENT DROP,
 * because the summary is inside the span the integrity digest covers and the
 * mis-parse failed it.
 */
function parseDocument(raw) {
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const match = /^---[ \\t]*\\r?\\n(?:([\\s\\S]*?)\\r?\\n)?---[ \\t]*(?:\\r?\\n([\\s\\S]*))?$/.exec(text);
  if (match === null) return null;
  const head = Object.create(null);
  const lines = (match[1] ?? "").split(/\\r?\\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const pair = /^([A-Za-z][A-Za-z0-9_-]*)[ \\t]*:[ \\t]*(.*)$/.exec(lines[index]);
    if (pair === null) continue;
    const rest = pair[2].trim();
    const block = /^([|>])([0-9]*)([-+]?)$|^([|>])([-+]?)([0-9]*)$/.exec(rest);
    if (block === null) {
      head[pair[1]] = unquote(rest);
      continue;
    }
    const style = block[1] ?? block[4];
    const chomp = block[3] || block[5] || "";
    const collected = [];
    while (index + 1 < lines.length) {
      const next = lines[index + 1];
      // A blank line belongs to the block; anything at column 0 ends it.
      if (next.trim() !== "" && !/^[ \\t]/.test(next)) break;
      collected.push(next);
      index += 1;
    }
    head[pair[1]] = blockScalar(collected, style, chomp);
  }
  return { head, body: match[2] ?? "" };
}

/**
 * A block scalar's value: strip the block's own indentation (the first
 * non-empty line sets it), join literal style with newlines and folded style by
 * the fold rule, then apply chomping — strip, keep, or the default clip.
 */
function blockScalar(collected, style, chomp) {
  const first = collected.find((line) => line.trim() !== "");
  if (first === undefined) return "";
  const indent = (/^[ \\t]*/.exec(first) ?? [""])[0].length;
  const rows = collected.map((line) => (line.trim() === "" ? "" : line.slice(indent)));
  let value = "";
  if (style === "|") {
    value = rows.join("\\n");
  } else {
    // Folded: a single break between two non-empty lines becomes a space; a
    // blank line stays a break.
    for (let index = 0; index < rows.length; index += 1) {
      if (index === 0) value = rows[index];
      else if (rows[index] === "" || rows[index - 1] === "") value += "\\n" + rows[index];
      else value += " " + rows[index];
    }
  }
  if (chomp === "-") return value.replace(/\\n+$/, "");
  if (chomp === "+") return value + "\\n";
  return value.replace(/\\n+$/, "") + "\\n";
}

/** One quoted scalar, unescaped the way the writer escaped it. */
function unquote(value) {
  if (value.length > 1 && value.startsWith('"') && value.endsWith('"')) {
    return value
      .slice(1, -1)
      .replace(/\\\\u([0-9a-fA-F]{4})/g, (whole, code) => String.fromCharCode(parseInt(code, 16)))
      .replace(/\\\\([\\s\\S])/g, (whole, char) =>
        char === "n" ? "\\n" : char === "t" ? "\\t" : char === "r" ? "\\r" : char === "0" ? "\\u0000" : char,
      );
  }
  if (value.length > 1 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  return value;
}

/**
 * The digest vouches for the bytes it covers; an absent or stale one is a
 * refusal. The covered span arrives already trimmed and assembled, because the
 * two document kinds cover different spans: a handoff's digest includes its
 * summary (the first line the resuming agent reads is content, not metadata),
 * a learning's does not.
 */
function integrityHolds(declared, covered) {
  if (typeof declared !== "string" || !/^sha256:[0-9a-f]{64}$/i.test(declared)) return false;
  return (
    declared.toLowerCase() === "sha256:" + createHash("sha256").update(covered, "utf8").digest("hex")
  );
}

/**
 * One field as a single index-safe line: control characters and newlines
 * collapse, so a forged summary cannot manufacture index lines of its own.
 */
function text(value, fallback) {
  if (typeof value !== "string") return fallback;
  const flat = value.replace(/[\\u0000-\\u001f\\u007f]+/g, " ").replace(/\\s+/g, " ").trim();
  if (flat === "") return fallback;
  return flat.length > MAX_FIELD_CHARS ? flat.slice(0, MAX_FIELD_CHARS - 1) + "…" : flat;
}

function stem(name) {
  return name.slice(0, -3);
}

/** Appends at most MAX_ITEM_LINES items, then one line accounting for the rest. */
function append(out, items, noun) {
  for (const item of items.slice(0, MAX_ITEM_LINES)) out.push(item);
  const rest = items.length - MAX_ITEM_LINES;
  if (rest > 0) {
    out.push("- … and " + rest + " more " + noun + (rest === 1 ? "" : "s") + " not listed.");
  }
}

const learningsDir = join(STATE_ROOT, "learnings");
const learnings = listMarkdown(learningsDir)
  .map((name) => inspect(learningsDir, name, MAX_LEARNING_BYTES, false))
  .filter((doc) => doc !== null)
  // Newest first — a learning written today outranks one from six months ago —
  // with a name tiebreak so equal timestamps still order deterministically.
  .sort((a, b) => b.mtime - a.mtime || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

for (const doc of learnings) {
  if (doc.skip !== "") continue;
  const reviewBy = doc.head.reviewBy;
  // The write gate only warns on a passed horizon; reading refuses. Nobody
  // re-verified the claim, and the digest vouches for the bytes, not the finding.
  if (typeof reviewBy === "string" && Date.parse(reviewBy + "T23:59:59.999Z") < NOW) {
    doc.skip = "expired-review";
  }
}

const loaded = learnings.filter((doc) => doc.skip === "");
const skipped = learnings.filter((doc) => doc.skip !== "");

const handoffsDir = join(STATE_ROOT, "handoffs");
const handoffDocs = listMarkdown(handoffsDir)
  .map((name) => inspect(handoffsDir, name, MAX_HANDOFF_BYTES, true))
  .filter((doc) => doc !== null);

// Partitioned, not filtered away. A refusal and a handoff that is merely
// finished or expired are different facts: the first is a file that failed a
// trust screen and has to be reported, the second is ordinary lifecycle and is
// silent. Folding both into the selection expression left two poisoned handoffs
// reported as "none in this repo".
const refusedHandoffs = handoffDocs.filter((doc) => doc.skip !== "");
const handoffs = handoffDocs
  .filter(
    (doc) => doc.skip === "" && RESUMABLE.includes(doc.head.status) && Date.parse(doc.head.expires) > NOW,
  )
  .map((doc) => ({
    id: text(doc.head.id, text(stem(doc.name), "(unnamed)")),
    summary: text(doc.head.summary, "(no summary)"),
    expires: text(doc.head.expires, ""),
    from: text(doc.head.fromTool, ""),
  }))
  // Soonest expiry first: the entry that goes stale next is the one to resume.
  .sort((a, b) => Date.parse(a.expires) - Date.parse(b.expires) || (a.id < b.id ? -1 : 1));

function render() {
  if (learnings.length === 0 && handoffDocs.length === 0) {
    return ["stamity: no learnings and no resumable handoffs in this repo yet."];
  }

  const bytes = loaded.reduce((total, doc) => total + doc.size, 0);
  // The file name is payload too: it is attacker-chosen on any file that
  // reached the directory, and it is concatenated into a line an agent reads.
  const ids = loaded.map((doc) => text(doc.head.id, text(stem(doc.name), "(unnamed)")));
  const duplicated = new Set(ids.filter((id, index) => ids.indexOf(id) !== index));
  const out = [
    "Learnings: " + loaded.length + " loaded, " + skipped.length + " skipped, " + bytes + " bytes.",
  ];

  append(
    out,
    loaded.map((doc, index) => {
      const id = ids[index];
      const confidence = text(doc.head.confidence, "unrated");
      const summary = text(doc.head.summary, "(no summary)");
      const flag = duplicated.has(id) ? " [duplicate id]" : "";
      return "- [" + confidence + "] " + id + " — " + summary + " (" + fileName(doc) + ")" + flag;
    }),
    "learning",
  );
  append(out, skipped.map(skipLine), "skipped file");

  out.push(
    "Handoffs: " + handoffs.length + " active, " + refusedHandoffs.length + " skipped.",
  );
  append(
    out,
    handoffs.map((entry) => {
      const origin = entry.from === "" ? "" : "from " + entry.from + ", ";
      return "- " + entry.id + " — " + entry.summary + " (" + origin + "expires " + entry.expires + ")";
    }),
    "handoff",
  );
  append(out, refusedHandoffs.map(skipLine), "skipped file");

  return out;
}

/** One skip line: the file by name, the reason by id. The span is never echoed. */
function skipLine(doc) {
  return "- skipped " + fileName(doc) + ": " + doc.skip;
}

/** A file name as one bounded, control-character-free line. */
function fileName(doc) {
  return text(doc.name, "(unnamed file)");
}

// Written once, then the process ends on its own. \`process.exit\` would race
// the write: stdout is asynchronous when it is a pipe on macOS and the BSDs,
// which is exactly how a client runs a hook.
process.stdout.write(render().join("\\n") + "\\n");
`;
}
const IDENTITY_FREE_PRE_TOOL_USE_PAYLOADS = /* @__PURE__ */ new Set([
	"cursor",
	"codex",
	"copilot"
]);
function buildPreToolUseGuardScript(opts) {
	const identityBearing = opts.identityBearing ?? true;
	const blocking = opts.failMode !== "fail-open" && identityBearing;
	const categories = Object.entries(unionToolCategoryMap()).map(([name, category]) => `  ${json(name)}: ${json(category)},`).join("\n");
	return `${header([
		"stamity — pre-tool-use allowlist guard.",
		"",
		"Rules on the pending tool call against the emitted policy document.",
		"Deny-by-default within scope: only agents carrying the generated-content",
		"prefix are governed, and inside that scope an unrostered agent, a denied",
		"tool name, an unknown tool and an ungranted category all refuse.",
		"",
		...blocking ? [`Blocking client: a refusal exits ${BLOCKING_EXIT_CODE} and the action stops.`] : identityBearing ? [
			"Reporting-only client: this client never blocks on a hook exit status,",
			"so a refusal is reported and the call proceeds. The gate that binds here",
			"is the client's own permission rules."
		] : [
			"Telemetry only on this client: its hook payload carries no calling-agent",
			"identity, so the role scope test cannot match a documented tool call.",
			"Native permissions and the agent definition remain the role boundary;",
			"this script does not enforce a role grant on identity-free payloads."
		]
	], [
		"Reads outside repo state: the pending call's payload on stdin. Output is a",
		"function of that payload and ONE policy document — the one emitted beside",
		"this script in a container, or the repository's own at the climb, chosen",
		"when this script was rendered — and of nothing else. No environment",
		"variable and no second candidate."
	])}

import { lstatSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const POLICY_FILE = ${policyPathExpression(opts.policiesJsonPath)};
const POLICY_SCHEMA = ${json(AGENT_TOOL_POLICIES_SCHEMA)};
const MAX_POLICY_BYTES = ${MAX_POLICY_FILE_BYTES};
const GOVERNED_PREFIX = ${json(CONTENT_PREFIX)};
const BLOCKING = ${blocking};
const BLOCK_EXIT = ${BLOCKING_EXIT_CODE};
const MCP_PREFIX = ${json(MCP_TOOL_PREFIX$1)};

/**
 * The policy document THIS run reads — fixed when this script was RENDERED.
 *
 * There is exactly ONE candidate, \`POLICY_FILE\`: the copy emitted beside this
 * script in a vendor plugin container, or the repository's own at the climb
 * above this script. Emission chose which, so run time chooses nothing. No
 * environment variable and no second path enter the resolution, which is what
 * stops an \`${AGENT_TOOL_POLICIES_FILE}\` that some workspace writer drops near
 * an installed guard from re-judging the next call from a policy set nobody
 * emitted.
 *
 * An ORDERED PAIR of candidates is what this replaced, and the order itself was
 * the defect. Inside a container the guard sits at \`<root>/hooks/<name>\` and the
 * repository climb resolved to the PARENT of the plugin root — a marketplace
 * clone, a client's plugin cache, a \`--plugin-dir\` project directory — so a file
 * in a user-writable directory outranked the container's own emitted copy. One
 * candidate per mode has no such rank to lose.
 *
 * The single path is probed with \`lstatSync\`, not \`existsSync\`: a SYMBOLIC LINK
 * named \`${AGENT_TOOL_POLICIES_FILE}\` is content that some other path owns, and
 * following it would let a link swap the governing document while the directory
 * entry a reviewer reads never moves. A linked document is REFUSED as
 * \`POLICY_INVALID\` in BOTH modes — the repository's own document is a ledgered
 * regular file, so a link standing where it should be is as much a swap as one
 * in a container — which is the posture \`src/hooks/userHooks.ts\` already takes
 * for a linked hook script. A real-file document that is missing, oversized or
 * unparseable is refused by the checks below for the same reason: answering a
 * call from a policy set nobody selected is the one outcome worse than a
 * refusal.
 *
 * NO environment variable enters this. Reading one
 * (\`CLAUDE_PLUGIN_ROOT\`/\`CURSOR_PLUGIN_ROOT\`/\`PLUGIN_ROOT\`) let a value
 * belonging to some unrelated tool redirect a repository-mode guard at a
 * document nobody in this repository wrote, and it contradicted the header
 * above: the output is a function of the payload and the emitted document, and
 * an ambient variable is neither. The runner takes the same posture — see
 * \`src/hooks/portableRunner.ts\`, where an unexpanded root variable resolves the
 * script to its own sibling.
 */
function policyDocumentPath() {
  let entry;
  try {
    entry = lstatSync(POLICY_FILE);
  } catch {
    // Absent is not decided here: the size probe below reports
    // POLICY_UNREADABLE and names the one path this script was rendered for.
    return { path: POLICY_FILE, linked: false };
  }
  return { path: POLICY_FILE, linked: entry.isSymbolicLink() };
}

// Client-native tool name → category, unioned across the client dialects the
// engine emits. A name listed under two categories resolves to the narrower
// one, so a dialect collision can only under-grant.
const TOOL_CATEGORY = {
${categories}
};

${READ_STDIN}

${READ_FIELD}

/** The refusal this call earns, or null when nothing here governs it. */
function evaluate() {
  const payload = readPayload();
  const agentId = field(payload, ["agent_type", "subagent_type", "agentType", "subagentType"]);
  // Out of scope: the main thread and the client's own agents are not this
  // setup's to govern, and denying them would brick the session.
  if (!agentId.startsWith(GOVERNED_PREFIX)) return null;

  const agentInstance = field(payload, ["agent_id", "subagent_id"]);
  const tool = field(payload, ["tool_name", "toolName", "tool"]);
  const subject = { agentId, agentInstance, tool };
  const { path: policyFile, linked: policyLinked } = policyDocumentPath();

  try {
    if (tool === "") {
      return {
        ...subject,
        reasonCode: "UNKNOWN_TOOL",
        message: "The payload named no tool, so the call cannot be authorized.",
      };
    }
    // A linked document is not the emitted one: refused before it is read, so
    // no link decides what this call may do.
    if (policyLinked) {
      return {
        ...subject,
        reasonCode: "POLICY_INVALID",
        message: \`Policy document \${policyFile} is a symbolic link, not the emitted file; nothing here authorizes this call.\`,
      };
    }

    let size = -1;
    try {
      const stats = statSync(policyFile);
      if (stats.isFile()) size = stats.size;
    } catch {
      size = -1;
    }
    if (size < 0) {
      return {
        ...subject,
        reasonCode: "POLICY_UNREADABLE",
        message: \`No readable policy document at \${policyFile}; nothing authorizes this call.\`,
      };
    }
    // Sized before it is read: an unbounded document is refused on its size
    // alone rather than parsed to discover it was unreasonable.
    if (size > MAX_POLICY_BYTES) {
      return {
        ...subject,
        reasonCode: "POLICY_TOO_LARGE",
        message: \`Policy document \${policyFile} is \${size} bytes, past the \${MAX_POLICY_BYTES} byte cap.\`,
      };
    }

    const document = JSON.parse(readFileSync(policyFile, "utf8"));
    if (
      document === null ||
      typeof document !== "object" ||
      document.schema !== POLICY_SCHEMA ||
      !Array.isArray(document.policies)
    ) {
      return {
        ...subject,
        reasonCode: "POLICY_INVALID",
        message: \`Policy document \${policyFile} does not declare schema "\${POLICY_SCHEMA}".\`,
      };
    }

    const policy = document.policies.find(
      (entry) => entry !== null && typeof entry === "object" && entry.agentId === agentId,
    );
    if (policy === undefined) {
      return {
        ...subject,
        reasonCode: "NO_POLICY",
        message: \`No policy is registered for agent "\${agentId}", so it may use nothing. Add a grant for it to the roster and regenerate the setup.\`,
      };
    }
    // A name on the deny list outranks whatever its category resolves to.
    if (Array.isArray(policy.denyTools) && policy.denyTools.includes(tool)) {
      return {
        ...subject,
        reasonCode: "TOOL_DENIED",
        message: \`Agent "\${agentId}" is denied tool "\${tool}" by name.\`,
      };
    }

    // Own-property read: a plain object inherits \`constructor\` and \`toString\`,
    // and a tool named after one of those would otherwise resolve to a function.
    let category = Object.hasOwn(TOOL_CATEGORY, tool) ? TOOL_CATEGORY[tool] : "";
    if (category === "" && tool.startsWith(MCP_PREFIX)) category = "network";
    if (category === "") {
      return {
        ...subject,
        reasonCode: "UNKNOWN_TOOL",
        message: \`Tool "\${tool}" maps to no category on this client, so it cannot be authorized.\`,
      };
    }
    if (!Array.isArray(policy.allow) || !policy.allow.includes(category)) {
      return {
        ...subject,
        category,
        reasonCode: "CATEGORY_DENIED",
        message: \`Agent "\${agentId}" may not use tool "\${tool}": it grants no "\${category}" access.\`,
      };
    }

    return null;
  } catch (error) {
    // Any unexpected throw is a refusal too: the guard's whole job is the
    // decision, and one it could not make is not one that authorizes.
    return {
      ...subject,
      reasonCode: "POLICY_EVALUATION_FAILED",
      message: \`Policy evaluation failed for agent "\${agentId}": \${error && error.message ? error.message : String(error)}.\`,
    };
  }
}

const refusal = evaluate();
if (refusal !== null) {
  // Reported, then the process ends on its own. \`process.exit\` would race the
  // write: stderr is asynchronous when it is a pipe on macOS and the BSDs,
  // which is exactly how a client runs a hook — and a denial nobody can read
  // is a denial nobody can act on.
  process.stderr.write(
    JSON.stringify({ hook: "stamity-pre-tool-use-guard", blocked: BLOCKING, ...refusal }) + "\\n",
  );
  process.exitCode = BLOCKING ? BLOCK_EXIT : 0;
}
`;
}
function unionToolCategoryMap() {
	const map = {};
	const render = [
		toClaudeToolsFrontmatter,
		toCodexToolsFrontmatter,
		toCopilotToolsFrontmatter
	];
	for (const category of FUNCTIONAL_TOOL_CATEGORIES) for (const dialect of render) for (const name of renderedNames(dialect([category]))) if (!Object.hasOwn(map, name)) map[name] = category;
	return map;
}
function renderedNames(rendered) {
	return (rendered.startsWith("[") ? [...rendered.matchAll(/"([^"]*)"/g)].map((match) => match[1] ?? "") : rendered.split(",").map((name) => name.trim())).filter((name) => name !== "");
}
function buildConfigTamperNoticeScript() {
	return `${header([
		"stamity — configuration-change notice.",
		"",
		"Prints a review reminder when agent configuration changes, and never",
		"blocks: every path exits 0. On a client with a native configuration-change",
		"event this fires per change; elsewhere it rides session start and reads as",
		"drift guidance."
	], [
		"Reads outside repo state: the changing file's path off the payload on stdin.",
		"Nothing on disk is read, so the same repo prints two different lines for two",
		"different payloads."
	])}

import { readFileSync } from "node:fs";

const MAX_PATH_CHARS = 200;

${READ_STDIN}

${READ_FIELD}

/** One bounded, control-character-free line: the path came from a payload. */
function clean(value) {
  const flat = value.replace(/[\\u0000-\\u001f\\u007f]+/g, " ").replace(/\\s+/g, " ").trim();
  return flat.length > MAX_PATH_CHARS ? flat.slice(0, MAX_PATH_CHARS - 1) + "…" : flat;
}

const payload = readPayload();
const changed = clean(
  field(payload, ["file_path", "filePath", "path", "config_path", "settings_path"]),
);

const lines =
  changed === ""
    ? [
        "stamity: agent configuration is generated and managed. Run \`stamity check\` to diff the on-disk files against the engine's own output.",
      ]
    : [
        "stamity: agent configuration changed — " + changed + ".",
        "That file is generated and managed. Run \`stamity check\` to diff it against the engine's own output before trusting the change.",
      ];

process.stdout.write(lines.join("\\n") + "\\n");
`;
}
const REVIEW_GATE_STATE_SCHEMA = "stamity/review-gate/v1";
const REVIEW_GATE_RUN_TTL_MS = 6048e5;
const REVIEW_GATE_MAX_RUNS = 200;
const REVIEWER_AGENT_ID = `${CONTENT_PREFIX}reviewer`;
const REVIEW_GATE_COMPLETION_EVENTS = ["TaskCompleted"];
const REVIEW_MESSAGE_FIELDS = ["last_assistant_message", "lastAssistantMessage"];
const MAX_REVIEW_MESSAGE_CHARS = 65536;
const REVIEW_VERDICTS = [
	"approve",
	"request-changes",
	"blocked"
];
const REVIEW_CONFIDENCES = [
	"high",
	"medium",
	"low"
];
const VERDICT_LABEL = /verdict[^A-Za-z0-9]{0,4}[:=—–-][^A-Za-z]{0,4}([A-Za-z][A-Za-z-]{0,31})/gi;
const CONFIDENCE_LABEL = /confidence[^A-Za-z0-9]{0,4}[:=—–-][^A-Za-z]{0,4}([A-Za-z][A-Za-z-]{0,31})/gi;
function buildReviewGateScript(opts) {
	const segments = repoRelativeSegments(opts.statePath, "statePath");
	const maxRounds = bandedIterations(opts.maxIterations);
	const blocking = opts.failMode !== "fail-open";
	const layout = opts.layout ?? "generated";
	const extra = repoRootImports(layout);
	return `${header([
		"stamity — work-scoped review gate.",
		"",
		"Holds a run's completion while its review loop has an open round, up to",
		`round ${maxRounds}. At the cap the gate opens: the run's ladder ends it as`,
		"BLOCKED_FAILURE with the open findings attached, and a hook that kept",
		"blocking past its own cap would be the unbounded gate this design avoids.",
		"",
		"Round count and last verdict, keyed by run, live in one JSON file under",
		"the state directory — the only thing this script writes. Read, modify and",
		"write happen while this process holds an exclusive lock file beside it, so",
		"two sub-agents finishing at once serialize instead of losing a round; the",
		"write itself is temp+rename, which buys a reader whole bytes and is NOT a",
		"substitute for the lock. A round this script cannot count is a round the",
		"gate does not hold, so an undercount opens a loop that had not converged.",
		"",
		"The verdict comes off the reviewer's own final text, which is what the",
		"client sends with a sub-agent stop: a structured payload field wins where",
		"one exists, and otherwise the labelled verdict and confidence are read out",
		"of that text and narrowed to the reviewer contract's vocabulary. Text that",
		"names none, or names two different ones, reads as unrecorded and the round",
		"stays open — a missed release costs one round, a wrong one costs a review.",
		"That coupling is load-bearing: this gate releases an approved run only when",
		"the reviewer's final text carries a labelled `verdict:` line, and a review",
		"that returns its verdict some other way is held to the cap and ends as",
		"BLOCKED_FAILURE with nothing open. Read the reviewer's return contract",
		"beside this file before changing either side.",
		"",
		"Fail-open: a counter file that is missing, oversized, unreadable or",
		"unparseable opens the gate and says so on stderr. A gate that cannot read",
		"its own state must not wedge a run. A run with no recorded round is not",
		"this gate's to hold either — it exits 0 untouched.",
		"",
		...blocking ? [`Blocking client: a refusal exits ${BLOCKING_EXIT_CODE} and the completion stops.`] : [
			"Reporting-only client: this client never blocks on a hook exit status,",
			"so a refusal is reported and the completion proceeds. The ladder that",
			"binds here is the one work's own prompt carries."
		]
	], [
		"Reads outside repo state: the payload on stdin, the wall clock, and the",
		"round counter this script owns. Every outcome — held, opened, or recorded —",
		"goes to stderr on exit 0 unless the completion is actually blocked; whether",
		"an operator SEES that line is the client's choice, so treat it as a record",
		"the client may keep, never as a notification this script can promise."
	])}

import { randomBytes } from "node:crypto";
import { closeSync, constants as FS, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, utimesSync, writeSync } from "node:fs";
${namedImport([
		"dirname",
		"join",
		"resolve",
		"sep",
		...extra.path
	], "node:path")}
${extra.url}
const STATE_SEGMENTS = ${json(segments)};
const MAX_STATE_BYTES = ${MAX_REVIEW_GATE_STATE_BYTES};
const MAX_ROUNDS = ${maxRounds};
const MAX_RUN_AGE_MS = ${REVIEW_GATE_RUN_TTL_MS};
const MAX_RUNS = ${REVIEW_GATE_MAX_RUNS};
const MAX_ID_CHARS = 128;
const MAX_WORD_CHARS = 32;
const SCHEMA = ${json(REVIEW_GATE_STATE_SCHEMA)};
const REVIEWER_AGENT = ${json(REVIEWER_AGENT_ID)};
const GOVERNED_PREFIX = ${json(CONTENT_PREFIX)};
const COMPLETION_EVENTS = ${json(REVIEW_GATE_COMPLETION_EVENTS)};
const MESSAGE_FIELDS = ${json(REVIEW_MESSAGE_FIELDS)};
const MAX_MESSAGE_CHARS = ${MAX_REVIEW_MESSAGE_CHARS};
const VERDICTS = ${json(REVIEW_VERDICTS)};
const CONFIDENCES = ${json(REVIEW_CONFIDENCES)};
const VERDICT_LABEL = new RegExp(${json(VERDICT_LABEL.source)}, ${json(VERDICT_LABEL.flags)});
const CONFIDENCE_LABEL = new RegExp(${json(CONFIDENCE_LABEL.source)}, ${json(CONFIDENCE_LABEL.flags)});
const APPROVAL_VERDICT = "approve";
const UNTRUSTED_CONFIDENCE = "low";
const BLOCKING = ${blocking};
const BLOCK_EXIT = ${BLOCKING_EXIT_CODE};

/*
 * Waiting for the counter's lock.
 *
 * The budget used to be 50 attempts x a flat 20 ms sleep — one second of wall
 * clock, whatever was ahead in the queue. That conflates the two reasons a lock
 * is not free. A holder AHEAD of this process in a queue is progress and must be
 * waited out; the wait is bounded by the queue, not by a constant. A holder that
 * died still holding it is not progress and no amount of waiting helps. One
 * second bounded the first case at a number picked for the second, so thirty
 * reviewers finishing together on a filesystem where each critical section costs
 * more than ~33 ms (NTFS create+delete, an on-access scanner, a runner
 * oversubscribed thirty ways) exhausted it before their turn came, and the round
 * they were holding the lock to count was dropped on a path that still exits 0.
 * Measured against the emitted script with the critical section padded to 40 ms:
 * 27 of 30 rounds landed, the other three reported STATE_LOCKED and exited 0.
 *
 * So the wait watches for PROGRESS instead of counting ticks: every observed
 * change of holder re-arms the idle window, and the process gives up only after
 * LOCK_IDLE_POLLS consecutive looks that saw the same holder AND LOCK_IDLE_MS of
 * wall clock with no hand-off. Both conditions, because either alone is wrong on
 * a loaded machine — a process descheduled past the wall-clock window would
 * otherwise give up having looked exactly once, which is the starvation case
 * this is most likely to meet. LOCK_CEILING_MS bounds the whole wait regardless,
 * so a pathological hand-off storm still terminates.
 *
 * That ceiling is the one constant here that is NOT queue-shaped, and it is
 * checked unconditionally — it overrides the progress detector, so a wait that
 * is demonstrably draining gives up anyway once it fires. At 10s it was
 * therefore still the binding constraint on the exact case the progress
 * detector was added for. Thirty reviewers finishing together serialise; the
 * tail one needs twenty-nine critical sections' worth of wall clock; 10s split
 * twenty-nine ways is ~330ms per section, which an NTFS
 * create+read+rename+unlink cycle behind an on-access scanner on an
 * oversubscribed runner reaches. It did reach it — the herd case dropped one
 * round of thirty on the windows leg with no source change between runs, on
 * the same STATE_LOCKED path that still exits 0.
 *
 * 25s instead, derived from the budget rather than from a guess about how long
 * a queue is. This script rides SubagentStop and TaskCompleted, and it is
 * wired with no per-entry timeout, so it inherits the client default for those
 * events: 600s (code.claude.com/docs/en/hooks-guide, Limitations, accessed
 * 2026-09-01). What the number buys is ~860ms per critical section at thirty
 * writers instead of ~330ms.
 *
 * Read the margin as the ceiling PLUS the retry budgets, not as the ceiling.
 * The ceiling bounds the wait for the lock and nothing after it, and the
 * reviewer's path spends four more budgets inside one invocation: the ceiling
 * itself plus a final jittered pause (25,024 ms), the counter read under the
 * lock (a stat and a read, 300 ms each), the publish rename (win32 6,950 ms of
 * base delay at up to a quarter of jitter = 8,687.5 ms; 750 ms on POSIX) and
 * the unlock (300 ms). That totals ~34.6s on win32 and ~26.7s on POSIX against
 * the 600s the wired events allow — 5.8% of it, with no breach anywhere on the
 * shipped surface. What it does rule out is the earlier claim here that the
 * wait also fits the 30s the same client allows its tightest hook class:
 * re-wiring this gate onto that class now needs LOCK_CEILING_MS lowered first,
 * because the compound worst case has overtaken that budget even though the
 * ceiling alone still sits inside it.
 *
 * That same list is a constraint on the WAITERS and not only on the client's
 * budget, which is what it used to be read as. The four in-section budgets
 * (the stat, the read, the rename and the unlink) are wall clock a LIVE holder
 * spends without handing the lock to anybody, and the idle detector reads "no
 * hand-off" as "the holder died". So the invariant the two halves have to keep
 * is: the idle window is never shorter than the critical section these budgets
 * sanction. Held, it says nothing about a live holder and everything about a
 * dead one; broken, a holder inside its own retry budget is read as dead by
 * every waiter queued behind it and each of them drops its round on a path
 * that exits 0 — 1 stored round of 30, measured both with a holder five
 * attempts into the win32 rename schedule and with a holder whose counter read
 * was merely 1.3s slow. LOCK_IDLE_MS is therefore derived from those budgets
 * below rather than set here, and the heartbeat in beat() carries the part of
 * the section a sum of pauses cannot see.
 *
 * Raising the ceiling costs nothing on the failure it does not govern. A
 * holder that DIED holding the lock produces no hand-off and no heartbeat, so
 * the idle detector returns after its own window — LOCK_IDLE_MS, not the
 * ceiling — and the ceiling is never consulted; the ceiling only ever fires
 * while the lock is genuinely changing hands, and waiting longer for a queue
 * that is visibly draining is the whole point of watching for progress. The
 * fail-open drop is unchanged either way: a wait that does expire still
 * reports STATE_LOCKED and exits 0, because a counter is not worth wedging a
 * run over.
 */
const LOCK_IDLE_POLLS = 24;
const LOCK_CEILING_MS = 25_000;
const LOCK_WAIT_MIN_MS = 4;
const LOCK_WAIT_MAX_MS = 24;
const LOCK_STALE_MS = 30_000;

/*
 * Errnos this script waits out rather than reads as an answer.
 *
 * Every one of them means the same thing on Windows: somebody else is holding
 * the name for a moment. ERROR_ACCESS_DENIED and ERROR_SHARING_VIOLATION reach
 * node as EPERM and EBUSY, EACCES is the third code that family of access
 * refusals arrives under, and a name being unlinked stays delete-pending until
 * the last handle on it closes. An on-access scanner opens every freshly
 * written file on a CI runner without FILE_SHARE_DELETE, and this script
 * creates, reads, renames and unlinks three names in the same directory.
 *
 * None of the three is an answer about whether the lock is free or whether the
 * counter is readable, and every site that read one as an answer dropped a
 * round while exiting 0. On POSIX none of them can come from contention at all:
 * open(O_CREAT|O_EXCL) answers EEXIST, rename(2) is defined on the inode and
 * never loses to a reader, and unlink is atomic. So the same set applies on
 * both platforms, and what it costs on POSIX is the wait budget on a durable
 * fault the gate already fails open on.
 */
const SHARING_FAULTS = ["EACCES", "EBUSY", "EPERM"];
const IS_WINDOWS = process.platform === "win32";

/*
 * Rename retries for a destination held across the publish, carried from the
 * engine's own writer rather than re-derived: see RENAME_RETRY_DELAYS_MS in
 * src/merge/atomicWrite.ts, where the concurrent-reader case took ~790 ms on
 * the runs it passed and spent the whole 750 ms four-retry budget on the runs
 * it failed. This script shipped that pre-fix budget; it now carries the same
 * schedule the engine settled on — 6950 ms of base delay on win32, flattened at
 * 800 ms so a quarter of jitter keeps the ceiling near 8.7 s, and the original
 * 750 ms on POSIX where a longer budget buys a slower failure rather than a
 * landed write. Unretried, a held destination lands as STATE_UNWRITABLE: the
 * round is reported but never stored, which is the same lost round the lock
 * exists to prevent, reached by the other door.
 *
 * 2026-09-15: the four extra 800 ms steps arrived with the engine's, for the
 * same evidence — CI run 34771471163 spent the 4,687 ms ceiling in full and
 * still lost the rename. Carried rather than re-decided: the schedule is one
 * decision with two sites, and test/hooks/scripts.test.ts pins this branch's
 * length against the engine's own compiled RENAME_RETRY_COUNT so the pair
 * cannot drift.
 */
const RENAME_WAITS_MS = IS_WINDOWS ? [50, 100, 200, 400, 600, 800, 800, 800, 800, 800, 800, 800] : [50, 100, 200, 400];
const RENAME_JITTER = IS_WINDOWS ? 0.25 : 0;

/* Retries for a read or an unlink that lost to the same family of holds. Both
 * are short operations on a name this process is racing its own peers for, so
 * the budget is 20+40+80+160 = 300 ms rather than the rename's: past that the
 * hold is not the millisecond-scale one this waits out. */
const RETRY_ATTEMPTS = 4;
const RETRY_BACKOFF_MS = 20;

/*
 * The idle window, derived from the budgets above rather than chosen beside
 * them. It is the wall clock a waiter watches an unchanging lock for before it
 * reads the holder as dead, and the invariant it has to keep is the one the
 * ceiling comment states: never shorter than the critical section these
 * budgets sanction.
 *
 * The section is four budgets long — the counter's stat and its read
 * (RETRY_BUDGET_MS each), the publish rename (RENAME_WAITS_MS with its jitter)
 * and the unlink that releases (RETRY_BUDGET_MS again) — which is 1,650 ms on
 * POSIX and 9,588 ms on win32 as these constants stand. Derived, so widening a
 * retry schedule cannot leave the window behind it the way a typed 1,000 did:
 * that constant was correct against a 750 ms rename budget and wrong the
 * moment the win32 schedule reached 4,687 ms, and nothing in the tree went red
 * to say so. The 2026-09-15 widening to 8,687.5 ms moved this window with it
 * for free, which is the property that paragraph was bought for.
 *
 * The sum is of PAUSES, and a holder spends syscall time on top of them, so on
 * its own this would be a lower bound wearing a ceiling's clothes. beat() is
 * what closes that gap: it re-stamps the lock before every one of these pauses,
 * so a holder actually spending its retries re-arms each waiter's window
 * instead of consuming it, and the derived number only has to cover a holder
 * that is slow inside a single call — the case with no errno and no retry,
 * where no heartbeat can fire.
 *
 * What it costs is the dead-holder verdict: a lock whose holder died is now
 * given up on after this window rather than after a flat second. The round is
 * dropped fail-open either way, and LOCK_STALE_MS is still the only path that
 * CLEARS a lock, so nothing here forces one.
 */
const RETRY_BUDGET_MS = RETRY_BACKOFF_MS * (2 ** RETRY_ATTEMPTS - 1);
const RENAME_BUDGET_MS =
  RENAME_WAITS_MS.reduce((total, wait) => total + wait, 0) * (1 + RENAME_JITTER);
const LOCK_IDLE_MS = Math.ceil(3 * RETRY_BUDGET_MS + RENAME_BUDGET_MS);

/** Whether an errno is one of the momentary holds above, rather than an answer. */
function sharing(error) {
  return error !== null && error !== undefined && SHARING_FAULTS.includes(error.code);
}

const NOW = Date.now();

${resolveRepoRoot(layout)}

const STATE_FILE = join(repoRoot(), ...STATE_SEGMENTS);
const LOCK_FILE = STATE_FILE + ".lock";

${READ_STDIN}

${READ_FIELD}

/** One payload value as an object key: id characters only, and bounded. */
function identifier(value) {
  return value.replace(/[^A-Za-z0-9._-]/g, "").slice(0, MAX_ID_CHARS);
}

/** One payload value as a vocabulary word: lower-case letters and hyphens, bounded. */
function word(value) {
  return value.toLowerCase().replace(/[^a-z-]/g, "").slice(0, MAX_WORD_CHARS);
}

/**
 * One word narrowed to a closed vocabulary. Anything outside it is unrecorded
 * rather than stored: the counter file holds what the review loop returned, and
 * a value no verdict can equal is more honest there than a stray token.
 */
function term(value, vocabulary) {
  const normalized = word(value);
  return vocabulary.includes(normalized) ? normalized : "";
}

/**
 * The one value a label carries in the reviewer's final text.
 *
 * Every labelled occurrence is read, not the first or the last: a text that
 * names two different verdicts has not returned one, and picking either would
 * be a guess in a place where guessing wrong releases a completion the loop
 * never approved. Disagreement and absence both read as unrecorded, which holds
 * the round open — bounded by the cap, so the cost is a round.
 */
function labelled(text, pattern, vocabulary) {
  let found = "";
  for (const match of text.matchAll(pattern)) {
    const candidate = term(match[1], vocabulary);
    if (candidate === "") continue;
    if (found !== "" && found !== candidate) return "";
    found = candidate;
  }
  return found;
}

/**
 * One field of the reviewer's structured return.
 *
 * A payload field wins wherever a client carries one — that is the reading
 * nobody has to parse. What the documented payload does carry on a sub-agent
 * stop is the agent's final text, so that is the fallback, scanned only up to
 * the cap: past it the payload is a transcript rather than a return block, and
 * an unbounded scan on every stop is a stall this gate should not offer.
 */
function returned(payload, names, pattern, vocabulary) {
  const direct = term(field(payload, names), vocabulary);
  if (direct !== "") return direct;
  const message = field(payload, MESSAGE_FIELDS);
  if (message === "" || message.length > MAX_MESSAGE_CHARS) return "";
  return labelled(message, pattern, vocabulary);
}

/**
 * The counter document, or the fault that makes it untrustworthy. Sized before
 * it is read, exactly as the sibling guard sizes its policy document: past the
 * cap the file is refused on its size rather than parsed to discover it was
 * unreasonable.
 */
function load() {
  // Absence and a fault are different answers, and the stat is where they used
  // to be collapsed: every errno mapped to "no file", which the caller reads as
  // "no runs yet". Under the lock that publishes a one-round document over every
  // round counted so far — the silent reset the fault guard below exists to
  // prevent, reached through the one door it did not cover. So only ENOENT, and
  // a name that is not a regular file, is absence; a momentary hold is waited
  // out on the same 20/40/80/160 ms schedule the read uses, and any other errno
  // is STATE_UNREADABLE, which drops the round rather than resetting it.
  let size = -1;
  for (let attempt = 0; ; attempt += 1) {
    try {
      const stats = statSync(STATE_FILE);
      size = stats.isFile() ? stats.size : 0;
      break;
    } catch (error) {
      if (error !== null && error !== undefined && error.code === "ENOENT") break;
      if (!sharing(error) || attempt >= RETRY_ATTEMPTS) return { fault: "STATE_UNREADABLE", runs: null };
      beat();
      pause(RETRY_BACKOFF_MS * 2 ** attempt);
    }
  }
  if (size <= 0) return { fault: "STATE_ABSENT", runs: null };
  if (size > MAX_STATE_BYTES) return { fault: "STATE_TOO_LARGE", runs: null };

  // Retried on a momentary hold and on nothing else. The publish is
  // temp+rename, so a reader is never handed partial bytes: a parse that fails
  // or a size past the cap is what the file SAYS, and waiting cannot change it.
  // A read that loses to a hold has been told nothing yet, and reading that as
  // STATE_UNREADABLE drops the round this invocation came to count.
  let raw = "";
  for (let attempt = 0; ; attempt += 1) {
    try {
      raw = readFileSync(STATE_FILE, "utf8");
      break;
    } catch (error) {
      if (!sharing(error) || attempt >= RETRY_ATTEMPTS) return { fault: "STATE_UNREADABLE", runs: null };
      beat();
      pause(RETRY_BACKOFF_MS * 2 ** attempt);
    }
  }
  let document = null;
  try {
    document = JSON.parse(raw);
  } catch {
    return { fault: "STATE_INVALID", runs: null };
  }
  if (
    document === null ||
    typeof document !== "object" ||
    document.schema !== SCHEMA ||
    document.runs === null ||
    typeof document.runs !== "object"
  ) {
    return { fault: "STATE_INVALID", runs: null };
  }
  return { fault: "", runs: document.runs };
}

/**
 * One run's record, or null when the run has no countable round. Read
 * own-property only: a plain object inherits \`constructor\` and \`toString\`, and
 * a run id named after one of those would otherwise resolve to a function.
 */
function entryOf(runs, runId) {
  const value = Object.hasOwn(runs, runId) ? runs[runId] : undefined;
  if (value === null || typeof value !== "object") return null;
  if (!Number.isInteger(value.rounds) || value.rounds < 1) return null;
  return {
    rounds: value.rounds,
    verdict: typeof value.verdict === "string" ? value.verdict : "",
    confidence: typeof value.confidence === "string" ? value.confidence : "",
  };
}

/**
 * Synchronous wait. A hook is a short-lived process with nothing else to do,
 * and there is no event loop here to yield to.
 */
function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/*
 * Whether THIS process is inside the critical section. The heartbeat below
 * must never re-stamp a lock another process holds: an unlocked reader waiting
 * out its own hold would otherwise vouch for a holder that has already died.
 */
let holding = false;

/**
 * Say the holder is still alive, on the one channel the waiters read.
 *
 * A waiter's progress signal is the lock file's (mtime, ino) pair, and nothing
 * a holder does to the COUNTER moves it — so a holder waiting out a held name
 * was indistinguishable from a holder that died, and the waiters queued behind
 * it dropped their rounds while it was still working. Touching the lock before
 * each retry pause moves the pair, so a holder spending its retry budget
 * re-arms every waiter's idle window instead of consuming it.
 *
 * Best-effort in both directions, and silent when it fails: a filesystem that
 * stamps in whole seconds (exFAT, the same one the file index covers for) may
 * not move the pair at all, and the touch can lose to the same family of holds
 * it is reporting through. Either way the wait falls back to the derived
 * LOCK_IDLE_MS, which is the whole critical section — never below it.
 */
function beat() {
  if (!holding) return;
  try {
    const stamp = new Date();
    utimesSync(LOCK_FILE, stamp, stamp);
  } catch {
    // The lock is gone, or the touch lost to a hold. The derived window still
    // bounds the wait, so there is nothing to report and nothing to retry.
  }
}

/**
 * Take the counter's exclusive lock, or give up.
 *
 * The lock is what makes the round count correct. Temp+rename replaces the
 * document whole, which is atomic VISIBILITY and nothing more: two sub-agents
 * finishing at once both read round N, both write N+1, and one round is gone.
 * That is not a rounding error — an undercounted loop keeps holding a run it
 * should have released, or reaches the cap a round late.
 *
 * Created O_EXCL, so exactly one process wins the create. A lock older than the
 * stale window belonged to a process that died holding it and is cleared; every
 * other failure gives up rather than forcing, because forcing a live lock is the
 * defect this exists to prevent.
 *
 * Who holds it is the progress signal, read as the (mtime, file index) pair the
 * stat already fetched: both are set when the lock is created, so a pair that
 * differs from the last look means the lock changed hands and the queue ahead of
 * this process is draining. The directory is created once, before the loop,
 * rather than on every attempt — under contention that syscall ran on every tick
 * of every waiter, lengthening the poll cycle it was competing in.
 */
function lock() {
  try {
    mkdirSync(dirname(STATE_FILE), { recursive: true });
  } catch {
    return false;
  }
  const ceiling = Date.now() + LOCK_CEILING_MS;
  let idleDeadline = Date.now() + LOCK_IDLE_MS;
  let idlePolls = 0;
  let holder = -1;
  let holderNode = -1;
  for (;;) {
    try {
      closeSync(openSync(LOCK_FILE, FS.O_WRONLY | FS.O_CREAT | FS.O_EXCL | FS.O_NOFOLLOW, 0o600));
      holding = true;
      return true;
    } catch (error) {
      // EEXIST is the answer "somebody holds it", and a sharing fault is no
      // answer at all — the name was momentarily unopenable, most often because
      // the previous holder's unlink left it delete-pending. Both go round the
      // loop; every other errno is this filesystem's own refusal and gives up.
      //
      // Windows-only here, unlike the counter's own sites. This is the one
      // place the whole idle window sits behind the tolerance, and the set
      // above says why POSIX cannot need it: open(O_CREAT|O_EXCL) answers
      // EEXIST for contention there, so EACCES/EBUSY/EPERM on this call is a
      // durable refusal — an unwritable state directory — and polling it out
      // cost 1.05s per hook event on darwin against 60ms for an answer that
      // never changes. The counter's sites keep the cross-platform set: their
      // POSIX cost is 300ms, and it is spent only on the same durable fault.
      const momentary = IS_WINDOWS && sharing(error);
      if (!error || (error.code !== "EEXIST" && !momentary)) return false;
    }

    // Who holds it now, and since when. A stat that raises is a lock released
    // between the open and the look, which is itself a hand-off. Identity is
    // the pair, not the timestamp alone: mtime carries it on any filesystem
    // that stamps sub-second, and the file index carries it on one that does
    // not (exFAT stamps in whole seconds, and two holders inside one tick would
    // otherwise read as one). Either half moving is a hand-off; if a filesystem
    // supplies neither, this degrades to the flat budget it replaced and never
    // below it.
    let seen = -1;
    let node = -1;
    try {
      const held = statSync(LOCK_FILE);
      seen = held.mtimeMs;
      node = Number(held.ino);
    } catch {
      seen = -1;
      node = -1;
    }
    if (seen !== holder || node !== holderNode) {
      holder = seen;
      holderNode = node;
      idleDeadline = Date.now() + LOCK_IDLE_MS;
      idlePolls = 0;
    } else {
      idlePolls += 1;
    }

    // A holder older than the stale window died holding it. Clearing it is the
    // only path that forces a lock, and it is gated on age for that reason.
    if (seen !== -1 && Date.now() - seen > LOCK_STALE_MS) {
      try {
        unlinkSync(LOCK_FILE);
        continue;
      } catch {
        // Another process cleared it first; the next attempt takes it.
      }
    }

    const now = Date.now();
    if (now >= ceiling) return false;
    if (idlePolls >= LOCK_IDLE_POLLS && now >= idleDeadline) return false;
    // Jittered, so a herd woken by the same release does not re-collide on the
    // same tick every round and starve its own tail.
    pause(LOCK_WAIT_MIN_MS + Math.floor(Math.random() * (LOCK_WAIT_MAX_MS - LOCK_WAIT_MIN_MS + 1)));
  }
}

/**
 * Release the lock, retrying the holds that are not a refusal.
 *
 * A swallowed unlink is not one round: it strands the name for the stale window
 * (LOCK_STALE_MS), and no waiter already in the herd can clear it, because
 * LOCK_STALE_MS is longer than LOCK_CEILING_MS and every waiter's ceiling is
 * armed from its own start. So the sweep only ever rescues a LATER invocation,
 * and one dropped unlink costs every remaining round in this run rather than
 * this one. Anything else — the file already gone to a stale sweep in another
 * process — is the same outcome as a release and returns.
 */
function unlock() {
  for (let attempt = 0; ; attempt += 1) {
    try {
      unlinkSync(LOCK_FILE);
      break;
    } catch (error) {
      if (!sharing(error) || attempt >= RETRY_ATTEMPTS) break;
      beat();
      pause(RETRY_BACKOFF_MS * 2 ** attempt);
    }
  }
  // Released, or given up on: either way this process is no longer the holder
  // and must stop vouching for whoever takes the name next.
  holding = false;
}

/**
 * Prune by age, then by count, then replace the file whole through temp+rename.
 * Called only while this process holds the lock, so the read this write is
 * based on is still current.
 *
 * The temp name is random and the file is created O_EXCL | O_NOFOLLOW. The old
 * name was the process id in base 36 — a few thousand values, guessable in
 * advance — and it was opened through whatever the name already pointed at, so
 * a symlink planted there redirected the write out of the repo and the rename
 * then made the redirection permanent. A write that cannot land is reported,
 * never raised: the counter is not worth holding a run for.
 */
function save(runs) {
  const kept = Object.entries(runs)
    .filter((pair) => pair[1] !== null && typeof pair[1] === "object" && NOW - pair[1].updated < MAX_RUN_AGE_MS)
    .sort((a, b) => b[1].updated - a[1].updated || (a[0] < b[0] ? -1 : 1))
    .slice(0, MAX_RUNS);
  const temp = STATE_FILE + ".tmp-" + randomBytes(8).toString("hex");
  let handle = -1;
  try {
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    handle = openSync(temp, FS.O_WRONLY | FS.O_CREAT | FS.O_EXCL | FS.O_NOFOLLOW, 0o600);
    writeSync(handle, JSON.stringify({ schema: SCHEMA, runs: Object.fromEntries(kept) }));
    closeSync(handle);
    handle = -1;
    // The rename is retried on the errnos Windows raises when something else
    // holds a handle to the destination for a moment — a concurrent reader, or
    // an on-access scanner that opened it without FILE_SHARE_DELETE. The
    // schedule runs out when RENAME_WAITS_MS does, so the budget is the array
    // and there is no second count to drift from it. Every other failure is
    // raised on the first try and reported by the catch below, because a write
    // that cannot land is not worth holding a run for.
    for (let attempt = 0; ; attempt += 1) {
      try {
        renameSync(temp, STATE_FILE);
        break;
      } catch (error) {
        const wait = RENAME_WAITS_MS[attempt];
        if (!sharing(error) || wait === undefined) throw error;
        beat();
        pause(wait + Math.floor(Math.random() * wait * RENAME_JITTER));
      }
    }
    return true;
  } catch {
    if (handle !== -1) {
      try {
        closeSync(handle);
      } catch {
        // Already closed by the failing branch.
      }
    }
    try {
      unlinkSync(temp);
    } catch {
      // Nothing to clean up: the temp file never landed.
    }
    return false;
  }
}

const payload = readPayload();
const runId = identifier(field(payload, ["session_id", "run_id", "sessionId", "runId"]));
const agentId = field(payload, ["agent_type", "subagent_type", "agentType", "subagentType"]);
const eventName = field(payload, ["hook_event_name", "hookEventName", "event"]);

/**
 * Whether this event is a run declaring itself finished — the only kind this
 * gate holds. The client's own event name answers it wherever the payload
 * carries one; otherwise the completing identity does, since a governed
 * sub-agent finishing is a step inside the run rather than the end of it.
 */
function isCompletion() {
  if (eventName !== "") return COMPLETION_EVENTS.includes(eventName);
  return !agentId.startsWith(GOVERNED_PREFIX);
}

/**
 * Count this reviewer's round, under the lock.
 *
 * The counter is read again INSIDE the lock rather than reused from the read
 * that opened this invocation: that earlier copy is exactly the stale read that
 * made this a lock-free read-modify-write, and thirty parallel reviewer stops
 * against it recorded a single round.
 *
 * A lock this process cannot take is reported and the gate opens. Refusing the
 * completion instead would wedge a run over a counter, which is the one thing
 * every other fault path here already refuses to do.
 */
function record() {
  const verdict = returned(payload, ["verdict", "review_verdict", "reviewVerdict"], VERDICT_LABEL, VERDICTS);
  const confidence = returned(
    payload,
    ["confidence", "review_confidence", "reviewConfidence"],
    CONFIDENCE_LABEL,
    CONFIDENCES,
  );

  if (!lock()) {
    return {
      blocked: false,
      runId,
      maxRounds: MAX_ROUNDS,
      reasonCode: "STATE_LOCKED",
      message:
        "The review-gate counter at " + STATE_FILE + " stayed locked, so this round was not counted " +
        "and the gate is open. Remove " + LOCK_FILE + " if no run is in flight.",
    };
  }

  let rounds = 0;
  let stored = false;
  try {
    const current = load();
    // A fault under the lock is not "no runs". Treating it as one makes
    // \`rounds\` 1 and publishes a one-round document over a file this script was
    // told not to repair — every round counted so far, gone, on a path that
    // exits 0. So the round is dropped instead and the fault is named. The
    // return sits inside the try, so the finally below still releases the lock.
    //
    // The wording is the unlocked path's, deliberately: this branch is the only
    // report a reviewer ever sees, since the round is counted before the
    // unlocked read that used to carry it. "Cannot be trusted" rather than
    // "could not be read" because STATE_INVALID parsed a file it did read, and
    // the delete sentence is what the operator needs — one remedy for one
    // fault, whichever path names it.
    if (current.fault !== "" && current.fault !== "STATE_ABSENT") {
      return {
        blocked: false,
        runId,
        maxRounds: MAX_ROUNDS,
        reasonCode: current.fault,
        message:
          "The review-gate counter at " + STATE_FILE + " cannot be trusted, so this round was not " +
          "counted and the gate is open. Deleting the file restarts the counter; it is not " +
          "overwritten from here.",
      };
    }
    // Null prototype for the same reason the completion path uses one: a run id
    // of "__proto__" would otherwise reach the inherited setter and vanish.
    const runs = Object.assign(Object.create(null), current.runs === null ? {} : current.runs);
    const previous = entryOf(runs, runId);
    rounds = (previous === null ? 0 : previous.rounds) + 1;
    runs[runId] = { rounds, verdict, confidence, updated: NOW };
    stored = save(runs);
  } finally {
    unlock();
  }

  return {
    blocked: false,
    runId,
    round: rounds,
    maxRounds: MAX_ROUNDS,
    reasonCode: stored ? "ROUND_RECORDED" : "STATE_UNWRITABLE",
    message: stored
      ? standing(rounds, verdict) + " recorded for this run."
      : standing(rounds, verdict) + " could not be written to " + STATE_FILE + ", so the gate is open.",
  };
}

/** How many rounds this run has left to spend, phrased for the operator. */
function standing(rounds, verdict) {
  return (
    "Review round " + rounds + " of " + MAX_ROUNDS + " (verdict: " + (verdict === "" ? "unrecorded" : verdict) + ")"
  );
}

/** The outcome this event earns, or null when nothing here governs it. */
function decide() {
  // A payload naming no run cannot be attributed to a review loop, and a gate
  // that held it would hold every run this setup never opened.
  if (runId === "") return null;

  // A finishing reviewer IS a review round: count it, record what it returned,
  // and let it go — the round has already happened. Answered BEFORE the read
  // below, because \`record()\` re-reads the counter under the lock and never
  // looks at this one: on the reviewer's path the unlocked read decided
  // nothing and could only lose the round, since a read that momentarily lost
  // to another writer's publish returned here instead of reaching the lock.
  // The fault it used to shield \`record()\` from is handled under the lock now.
  if (agentId === REVIEWER_AGENT) return record();

  const state = load();
  if (state.fault !== "" && state.fault !== "STATE_ABSENT") {
    return {
      blocked: false,
      runId,
      reasonCode: state.fault,
      message:
        "The review-gate counter at " + STATE_FILE + " cannot be trusted, so the gate is open. " +
        "Deleting the file restarts the counter; it is not overwritten from here.",
    };
  }

  if (!isCompletion()) return null;

  if (state.fault === "STATE_ABSENT") {
    return {
      blocked: false,
      runId,
      reasonCode: "STATE_ABSENT",
      message:
        "No review-gate counter at " + STATE_FILE + ", so the gate is open. " +
        "The file is created when this run records its first review round.",
    };
  }

  // Copied onto a null prototype before anything is read out of it: run ids come
  // from a payload, and a run named after a prototype member would otherwise
  // resolve to an inherited value instead of this run's record.
  const runs = Object.assign(Object.create(null), state.runs === null ? {} : state.runs);
  const entry = entryOf(runs, runId);
  // Work-scoped: a run with no recorded round has no review loop to gate on.
  if (entry === null) return null;
  // An approval closes the loop. Confidence is the flow's own gate and the
  // operator sets where it sits, so the one combination refused here is the one
  // no setting accepts: an approval the reviewer itself called low-confidence.
  if (entry.verdict === APPROVAL_VERDICT && entry.confidence !== UNTRUSTED_CONFIDENCE) return null;

  if (entry.rounds >= MAX_ROUNDS) {
    return {
      blocked: false,
      runId,
      round: entry.rounds,
      maxRounds: MAX_ROUNDS,
      verdict: entry.verdict,
      reasonCode: "CAP_REACHED",
      message:
        standing(entry.rounds, entry.verdict) +
        " is the cap, so the gate is open. The run ends here as BLOCKED_FAILURE with the open findings attached.",
    };
  }
  return {
    blocked: BLOCKING,
    runId,
    round: entry.rounds,
    maxRounds: MAX_ROUNDS,
    verdict: entry.verdict,
    reasonCode: "REVIEW_ROUND_OPEN",
    message:
      standing(entry.rounds, entry.verdict) +
      " left this run without an approval. Next: the open findings go to a fixer and the change re-enters review; " +
      "completion opens on an approval or at round " + MAX_ROUNDS + ".",
  };
}

const outcome = decide();
if (outcome !== null) {
  // Reported, then the process ends on its own. \`process.exit\` would race the
  // write: stderr is asynchronous when it is a pipe on macOS and the BSDs,
  // which is exactly how a client runs a hook.
  //
  // Every outcome goes to stderr, blocking or not. On a blocking refusal that is
  // a channel the client's own guarantee row names: exit 2 returns stderr to the
  // agent. On an exit-0 outcome — a round recorded, a cap reached, a counter
  // fault — it is NOT: no guarantee row documents a channel for stderr on exit
  // 0, so whether anyone reads these lines is the client's choice. They are kept
  // because a record the client may surface beats no record at all, and because
  // stdout is what feeds a session and a gate decision is not session context.
  // Read them as a log this script emits, never as a notification it delivers.
  process.stderr.write(JSON.stringify({ hook: "stamity-review-gate", ...outcome }) + "\\n");
  process.exitCode = outcome.blocked ? BLOCK_EXIT : 0;
}
`;
}
function planCoreHookScripts(policiesJsonPath, tool) {
	const failMode = CLIENT_HOOK_GUARANTEES.find((guarantee) => guarantee.tool === tool)?.failMode ?? "fail-closed";
	return [
		{
			fileName: SESSION_START_FILE,
			content: buildSessionStartScript({ layout: layoutFor(policiesJsonPath) }),
			event: "session_start"
		},
		{
			fileName: GUARD_FILE,
			content: buildPreToolUseGuardScript({
				policiesJsonPath,
				failMode,
				identityBearing: !IDENTITY_FREE_PRE_TOOL_USE_PAYLOADS.has(tool)
			}),
			event: "pre_tool_use"
		},
		{
			fileName: TAMPER_NOTICE_FILE,
			content: buildConfigTamperNoticeScript(),
			event: "session_start"
		}
	];
}
function layoutFor(policiesJsonPath) {
	return policiesJsonPath.startsWith("../") ? "generated" : "container";
}
//#endregion
//#region src/shared/launcherAllowlist.ts
const ALLOWED_LAUNCHERS = /* @__PURE__ */ new Set([
	"node",
	"bun",
	"deno",
	"python3",
	"ruby"
]);
const RUN_FILE_SUBCOMMANDS = /* @__PURE__ */ new Map([["deno", /* @__PURE__ */ new Set(["run"])], ["bun", /* @__PURE__ */ new Set(["run"])]]);
const CODE_EVAL_FLAGS = /* @__PURE__ */ new Set([
	"-",
	"-e",
	"--eval",
	"-c",
	"--command",
	"-p",
	"--print",
	"-r",
	"--require",
	"-m",
	"--import",
	"--loader",
	"--experimental-loader",
	"--preload"
]);
const SCRIPT_EXTENSIONS$1 = [
	".mjs",
	".cjs",
	".js",
	".ts",
	".mts",
	".cts",
	".sh",
	".bash",
	".py",
	".rb"
];
function refuse$5(code, reason) {
	return {
		ok: false,
		code,
		reason
	};
}
function launcherName(argument) {
	const base = posix.basename(argument.replaceAll("\\", "/")).toLowerCase();
	return base.endsWith(".exe") ? base.slice(0, -4) : base;
}
function flagToken(argument) {
	if (!argument.startsWith("-")) return "";
	const separator = argument.indexOf("=");
	return separator === -1 ? argument : argument.slice(0, separator);
}
function isAttachedShortOption(argument) {
	return argument.startsWith("-") && !argument.startsWith("--") && argument.length > 2;
}
function programArgument(launcher, rest) {
	const subcommands = RUN_FILE_SUBCOMMANDS.get(launcher);
	let subcommandTaken = false;
	for (const argument of rest) {
		if (argument.startsWith("-")) continue;
		if (!subcommandTaken && subcommands !== void 0 && subcommands.has(argument)) {
			subcommandTaken = true;
			continue;
		}
		return argument;
	}
}
function pathCandidate$1(argument) {
	if (!argument.startsWith("-")) return argument;
	const separator = argument.indexOf("=");
	return separator === -1 ? "" : argument.slice(separator + 1);
}
function hasScriptExtension$1(candidate) {
	const lower = candidate.toLowerCase();
	return SCRIPT_EXTENSIONS$1.some((extension) => lower.endsWith(extension));
}
function escapesRepo$1(candidate) {
	const unified = candidate.replaceAll("\\", "/");
	if (unified.startsWith("/") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(unified)) return true;
	const normalized = posix.normalize(unified);
	return normalized === ".." || normalized.startsWith("../");
}
function checkLauncherArgv(argv, repoRoot) {
	const launcher = argv[0];
	if (launcher === void 0 || launcher === "") return refuse$5("LAUNCHER_NOT_ALLOWED", "the command is empty, so it names no launcher to check.");
	const name = launcherName(launcher);
	if (!ALLOWED_LAUNCHERS.has(name)) return refuse$5("LAUNCHER_NOT_ALLOWED", `${JSON.stringify(name)} is not an allowed launcher. Allowed: ${[...ALLOWED_LAUNCHERS].join(", ")} — and each of them must be handed a committed script as the first argument that is not a flag. A package runner (npm, npx, pnpm, yarn) is not on that list: its first argument names a package it fetches, not a file this repo commits.`);
	const rest = argv.slice(1);
	const inline = rest.find((argument) => CODE_EVAL_FLAGS.has(flagToken(argument)));
	if (inline !== void 0) return refuse$5("INLINE_CODE_FLAG", `${JSON.stringify(inline)} passes the program on the command line, which runs code no reviewer can read in a diff. Commit the script and name its path instead.`);
	const attached = rest.find((argument) => isAttachedShortOption(argument));
	if (attached !== void 0) return refuse$5("INLINE_CODE_FLAG", `${JSON.stringify(attached)} is a short option carrying its value attached, so this gate cannot tell where the flag ends and what it points at begins — ${JSON.stringify("-r/tmp/evil")} preloads and runs a file exactly as ${JSON.stringify("-r")} ${JSON.stringify("/tmp/evil")} does. Write the option and its value as two arguments.`);
	const program = programArgument(name, rest);
	if (program === void 0) return refuse$5("NO_SCRIPT_ARGUMENT", `${name} is given no program to run. Name one committed, repo-relative script file (for example ${JSON.stringify(".stamity/hooks/guard.mjs")}).`);
	if (!hasScriptExtension$1(program)) return refuse$5("NO_SCRIPT_ARGUMENT", `${name} runs ${JSON.stringify(program)} — the first argument that is not a flag — and that is not a script file. A package name, a subcommand, or an option value standing where the program goes all mean the code that runs is not the one this repo commits. Name the script first (for example ${JSON.stringify(".stamity/hooks/guard.mjs")}) and write option values in --option=value form so nothing else lands in that position.`);
	const scripts = rest.map(pathCandidate$1).filter((candidate) => hasScriptExtension$1(candidate));
	if (scripts.length > 1) return refuse$5("NO_SCRIPT_ARGUMENT", `${name} is given ${scripts.length} script arguments (${scripts.map((s) => JSON.stringify(s)).join(", ")}); exactly one names the code that runs, and the rest are ambiguous about what executes.`);
	const script = program;
	if (escapesRepo$1(script)) return refuse$5("SCRIPT_OUTSIDE_REPO", `${JSON.stringify(script)} resolves outside the repository. The code a declaration runs lives in the repo and is committed with it.`);
	let stats;
	try {
		stats = lstatSync(resolve(repoRoot, script));
	} catch {
		return refuse$5("SCRIPT_MISSING", `${JSON.stringify(script)} could not be read. Commit the script before wiring the command.`);
	}
	if (stats.isSymbolicLink()) return refuse$5("SCRIPT_OUTSIDE_REPO", `${JSON.stringify(script)} is a symbolic link, whose target is not reviewable in this repo.`);
	if (!stats.isFile()) return refuse$5("SCRIPT_MISSING", `${JSON.stringify(script)} is not a regular file.`);
	return {
		ok: true,
		script
	};
}
//#endregion
//#region src/hooks/userHooks.ts
var userHooks_exports = /* @__PURE__ */ __exportAll({ readHookDefinitions: () => readHookDefinitions });
const LAUNCHER_DEFECT = {
	LAUNCHER_NOT_ALLOWED: "LAUNCHER_NOT_ALLOWED",
	INLINE_CODE_FLAG: "INLINE_CODE_FLAG",
	NO_SCRIPT_ARGUMENT: "NO_SCRIPT_ARGUMENT",
	SCRIPT_OUTSIDE_REPO: "UNSAFE_PATH",
	SCRIPT_MISSING: "MISSING_SCRIPT"
};
const HOOK_FILE_EXTENSION = ".json";
const DOCUMENT_FIELDS = ["hooks"];
const HOOK_FIELDS = [
	"event",
	"matcher",
	"command",
	"timeoutMs"
];
const SHELL_CONTROL_PATTERN = /[;|&`<>]|\$\(|\$\{/;
const NETWORK_PATTERNS = [
	/(?:^|[\s/\\])curl\s/i,
	/(?:^|[\s/\\])wget\s/i,
	/\bfetch\(/,
	/\bhttps?:\/\//i
];
const SCRIPT_EXTENSIONS = [
	".mjs",
	".cjs",
	".js",
	".ts",
	".sh",
	".bash",
	".py",
	".rb"
];
async function readHookDefinitions(hooksDir, rootDir) {
	const dir = resolve(hooksDir);
	const repoRoot = rootDir === void 0 ? resolve(dir, "..", "..") : resolve(rootDir);
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch (cause) {
		if (cause.code === "ENOENT") return {
			hooks: [],
			errors: []
		};
		throw new EngineError(`Cannot read the hooks directory ${dir}: ${describeErrno$1(cause)}. Make it a readable directory, or remove it to run without user hooks.`, {
			code: "FS_ERROR",
			cause
		});
	}
	const sorted = entries.toSorted((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
	const loaded = await Promise.all(sorted.map((entry) => {
		const absolute = join(dir, entry.name);
		const file = repoRelative(repoRoot, absolute);
		if (entry.isSymbolicLink()) return {
			hooks: [],
			errors: [{
				file,
				code: "UNSAFE_PATH",
				message: `${entry.name} is a symbolic link. Commit the hook file itself so its contents are reviewable.`
			}]
		};
		if (!entry.isFile() || !entry.name.endsWith(HOOK_FILE_EXTENSION)) return {
			hooks: [],
			errors: []
		};
		return readHookFile(absolute, file, repoRoot);
	}));
	return {
		hooks: loaded.flatMap((result) => result.hooks),
		errors: loaded.flatMap((result) => result.errors)
	};
}
async function readHookFile(absolute, file, repoRoot) {
	let raw;
	try {
		raw = await readFile(absolute, "utf8");
	} catch (cause) {
		if (cause.code === "ENOENT") return {
			hooks: [],
			errors: []
		};
		return {
			hooks: [],
			errors: [{
				file,
				code: "UNREADABLE_FILE",
				message: `${file} could not be read (${describeErrno$1(cause)}), so the hooks it declares are skipped. Make it readable, or remove it to run without those hooks.`
			}]
		};
	}
	const declared = readDocument$1(raw, file);
	if (!declared.ok) return {
		hooks: [],
		errors: [{
			file,
			code: declared.code,
			message: declared.message
		}]
	};
	const outcomes = await Promise.all(declared.entries.map((value, index) => validateEntry(value, `hooks[${index}]`, repoRoot)));
	const hooks = [];
	const errors = [];
	for (const outcome of outcomes) if (outcome.ok) hooks.push({
		...outcome.hook,
		sourceFile: file
	});
	else errors.push({
		file,
		code: outcome.code,
		message: outcome.message
	});
	return {
		hooks,
		errors
	};
}
function reject(code, message) {
	return {
		ok: false,
		code,
		message
	};
}
function readDocument$1(raw, file) {
	let document;
	try {
		document = parseJsonStrict(raw, file);
	} catch (cause) {
		return reject("INVALID_JSON", cause instanceof Error ? cause.message : String(cause));
	}
	if (!isPlainObject$2(document)) return reject("INVALID_JSON", `${file}: expected an object at the document root.`);
	const stray = unknownFields(document, DOCUMENT_FIELDS);
	if (stray.length > 0) return reject("INVALID_JSON", `unknown field(s) ${stray.join(", ")}; a hook file declares only \`hooks\`.`);
	const declared = document.hooks;
	if (!Array.isArray(declared)) return reject("INVALID_JSON", "`hooks` is required and must be an array of hook objects.");
	return {
		ok: true,
		entries: declared
	};
}
async function validateEntry(value, label, repoRoot) {
	if (!isPlainObject$2(value)) return reject("INVALID_JSON", `${label} must be an object.`);
	const stray = unknownFields(value, HOOK_FIELDS);
	if (stray.length > 0) return reject("INVALID_JSON", `${label} carries unknown field(s) ${stray.join(", ")}; supported: ${HOOK_FIELDS.join(", ")}.`);
	const event = value.event;
	if (typeof event !== "string") return reject("INVALID_JSON", `${label}.event is required and must be a string.`);
	if (!isCanonicalHookEvent(event)) return reject("UNKNOWN_EVENT", `${label}.event "${event}" is not a portable hook event. Use one of: ${CANONICAL_HOOK_EVENTS.join(", ")}.`);
	const rawCommand = value.command;
	const commandLine = flattenCommand(rawCommand);
	if (NETWORK_PATTERNS.some((pattern) => pattern.test(commandLine))) return reject("NETWORK_FETCH", `${label}.command reaches the network. Commit the code the hook runs and invoke it from the repo instead.`);
	if (typeof rawCommand === "string") return reject("SHELL_FORM_COMMAND", `${label}.command is a shell string. Use exec form — an argv array such as ["node", ".stamity/hooks/guard.mjs"].`);
	if (!isStringArray$1(rawCommand) || rawCommand.length === 0) return reject("INVALID_JSON", `${label}.command must be a non-empty array of strings.`);
	const launcher = checkLauncherArgv(rawCommand, repoRoot);
	if (!launcher.ok) return reject(LAUNCHER_DEFECT[launcher.code], `${label}.command ${launcher.reason}`);
	const shellish = rawCommand.find((argument) => SHELL_CONTROL_PATTERN.test(argument));
	if (shellish !== void 0) return reject("SHELL_FORM_COMMAND", `${label}.command argument ${JSON.stringify(shellish)} carries a shell operator, which exec form never interprets.`);
	const matcher = value.matcher;
	if (matcher !== void 0 && typeof matcher !== "string") return reject("INVALID_JSON", `${label}.matcher must be a string when present.`);
	const timeoutMs = value.timeoutMs;
	if (timeoutMs !== void 0 && !isPositiveInteger(timeoutMs)) return reject("INVALID_JSON", `${label}.timeoutMs must be a positive whole number of milliseconds.`);
	const pathDefect = await checkPaths(rawCommand, label, repoRoot);
	if (pathDefect) return pathDefect;
	return {
		ok: true,
		hook: {
			event,
			command: rawCommand,
			...matcher === void 0 ? {} : { matcher },
			...timeoutMs === void 0 ? {} : { timeoutMs }
		}
	};
}
async function checkPaths(command, label, repoRoot) {
	const candidates = command.map((argument, index) => ({
		index,
		candidate: pathCandidate(argument)
	})).filter(({ candidate }) => isPathShaped(candidate));
	const escaping = candidates.find(({ candidate }) => escapesRepo(candidate));
	if (escaping !== void 0) return reject("UNSAFE_PATH", `${label}.command references ${JSON.stringify(escaping.candidate)}, which resolves outside the repository. Hook scripts live in the repo and are committed with it.`);
	const executed = candidates.filter(({ index, candidate }) => index === 0 || hasScriptExtension(candidate));
	const probes = await Promise.all(executed.map(async ({ candidate }) => ({
		candidate,
		state: await probeScript(resolve(repoRoot, candidate))
	})));
	for (const { candidate, state } of probes) {
		if (state === "missing") return reject("MISSING_SCRIPT", `${label}.command references ${JSON.stringify(candidate)}, which does not exist. Commit the script before wiring the hook.`);
		if (state === "symlink") return reject("UNSAFE_PATH", `${label}.command references ${JSON.stringify(candidate)}, a symbolic link whose target is not reviewable in this repo.`);
		if (state === "not-a-file") return reject("MISSING_SCRIPT", `${label}.command references ${JSON.stringify(candidate)}, which is not a regular file.`);
	}
	return null;
}
async function probeScript(absolute) {
	try {
		const stats = await lstat(absolute);
		if (stats.isSymbolicLink()) return "symlink";
		return stats.isFile() ? "file" : "not-a-file";
	} catch (cause) {
		if (cause.code === "ENOENT") return "missing";
		throw new EngineError(`Cannot stat the hook script ${absolute}: ${describeErrno$1(cause)}.`, {
			code: "FS_ERROR",
			cause
		});
	}
}
function flattenCommand(value) {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value.filter((part) => typeof part === "string").join(" ");
	return "";
}
function pathCandidate(argument) {
	if (!argument.startsWith("-")) return argument;
	const separator = argument.indexOf("=");
	return separator === -1 ? "" : argument.slice(separator + 1);
}
function isPathShaped(candidate) {
	if (candidate === "") return false;
	return candidate.includes("/") || candidate.includes("\\") || hasScriptExtension(candidate);
}
function hasScriptExtension(candidate) {
	const lower = candidate.toLowerCase();
	return SCRIPT_EXTENSIONS.some((extension) => lower.endsWith(extension));
}
function escapesRepo(candidate) {
	const unified = candidate.replaceAll("\\", "/");
	if (unified.startsWith("/") || /^[A-Za-z]:/.test(unified)) return true;
	const normalized = posix.normalize(unified);
	return normalized === ".." || normalized.startsWith("../");
}
function isStringArray$1(value) {
	return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
function isPositiveInteger(value) {
	return typeof value === "number" && Number.isInteger(value) && value > 0;
}
function repoRelative(repoRoot, absolute) {
	return relative(repoRoot, absolute).split(sep).join("/");
}
function describeErrno$1(cause) {
	return cause.code ?? (cause instanceof Error ? cause.message : String(cause));
}
//#endregion
//#region src/roster/agentPolicies.ts
var agentPolicies_exports = /* @__PURE__ */ __exportAll({
	AGENT_POLICY_ROSTER: () => AGENT_POLICY_ROSTER,
	GRANTABLE_TOOL_CATEGORIES: () => GRANTABLE_TOOL_CATEGORIES,
	RUNTIME_AGENT_IDS: () => RUNTIME_AGENT_IDS
});
const GRANTABLE_TOOL_CATEGORIES = [
	"read",
	"edit",
	"execute",
	"network",
	"spawn",
	"planning"
];
const AGENT_POLICY_ROSTER = [
	{
		agentId: "stamity-researcher",
		allow: ["read", "network"],
		rationale: "Answers briefs against the codebase and, at its widest tool tier, vendor docs and the web, so it reads and it fetches. It creates no files — every artifact belongs to the flow that spawned it — which is why no edit grant appears here."
	},
	{
		agentId: "stamity-implementer",
		allow: [
			"read",
			"edit",
			"execute"
		],
		rationale: "Builds one planned unit: reads the surrounding code, writes the unit's files and their tests, and runs the gate commands whose output it must return as evidence. Execute covers that gate run and nothing further; it is not a path to another agent."
	},
	{
		agentId: "stamity-reviewer",
		allow: ["read"],
		rationale: "Returns a verdict on a change set it must not touch, citing path:line for every behavior claim it makes. Withholding edit is what keeps the following round reviewing the author's work instead of the reviewer's own."
	},
	{
		agentId: "stamity-fixer",
		allow: [
			"read",
			"edit",
			"execute"
		],
		rationale: "Applies the minimal fix for one review round's Critical and Warning findings, then re-runs the gates that fix has to clear. Same surface as the implementer, bounded by a finding list rather than by a unit brief."
	},
	{
		agentId: "stamity-test-runner",
		allow: ["read", "execute"],
		rationale: "Runs the declared gate commands and returns their structured results. Independence from whoever wrote the change is the entire point of the role, so it inspects the tree and executes commands but never edits what it is grading."
	},
	{
		agentId: "stamity-spec-author",
		allow: ["read", "edit"],
		rationale: "Writes specs, plans, decision records and docs after reading the code and history they describe. No execute: authoring needs no shell, and a spec pass able to run commands drifts into the implementation it exists to specify."
	},
	{
		agentId: "stamity-creator",
		allow: ["read", "edit"],
		rationale: "Authors one user artifact per invocation under the overrides tree, reading the bundled corpus to match its shape. The engine owns the save gates, so clearing them costs no shell — inspecting and writing are the whole job."
	},
	{
		agentId: "stamity-security",
		allow: ["read"],
		rationale: "Judges authentication, cryptography, trust boundaries and the dependency set on triggered paths, quoting locations for each defect it names. No write grant: those surfaces are where an unexamined edit costs most, and the repair belongs to a later pass under its own review."
	},
	{
		agentId: "stamity-design-quality",
		allow: ["read"],
		rationale: "Measures rendered surfaces against named success criteria and the project's token source, so its output is numbers rather than preferences. Inspection alone — nudging a spacing value while judging it would make one pass both author and judge of the same pixel."
	},
	{
		agentId: "stamity-performance",
		allow: ["read"],
		rationale: "Weighs cost per operation against declared budgets across data-access, background-work and cache paths. Nothing beyond inspection: an agent tuning what it measures forfeits the independence that makes the measurement worth reading, and tuning is the implementer's lane."
	}
];
const RUNTIME_AGENT_IDS = AGENT_POLICY_ROSTER.map((row) => row.agentId);
//#endregion
//#region src/roster/agentGrants.ts
var agentGrants_exports = /* @__PURE__ */ __exportAll({
	NEVER_DERIVABLE_CATEGORIES: () => NEVER_DERIVABLE_CATEGORIES,
	grantableFootprint: () => grantableFootprint,
	parseCapabilities: () => parseCapabilities,
	resolveAgentGrant: () => resolveAgentGrant
});
const NEVER_DERIVABLE_CATEGORIES = /* @__PURE__ */ new Set(["spawn"]);
const CAPABILITIES_FIELD$1 = "capabilities";
const GRANTABLE_LOOKUP = new Set(GRANTABLE_TOOL_CATEGORIES);
const NEVER_DERIVABLE_LOOKUP = NEVER_DERIVABLE_CATEGORIES;
const DERIVABLE_CATEGORIES = GRANTABLE_TOOL_CATEGORIES.filter((category) => !NEVER_DERIVABLE_LOOKUP.has(category));
const MAX_QUOTED_VALUE = 60;
function grantableFootprint(declared) {
	if (declared === void 0 || declared.length === 0) return [];
	const set = new Set(declared);
	return GRANTABLE_TOOL_CATEGORIES.filter((category) => set.has(category));
}
function list(values) {
	return values.map((value) => JSON.stringify(value)).join(", ");
}
function describeCategories(values) {
	return values.length === 0 ? "no categories" : values.join(", ");
}
function describeValue$2(value) {
	const rendered = JSON.stringify(value) ?? typeof value;
	return rendered.length <= MAX_QUOTED_VALUE ? rendered : `${rendered.slice(0, MAX_QUOTED_VALUE)}…`;
}
function describeRejected(entry) {
	if (typeof entry !== "string") return describeValue$2(entry);
	const trimmed = entry.trim();
	return GRANTABLE_LOOKUP.has(trimmed) && trimmed !== entry ? `${JSON.stringify(entry)} (did you mean ${JSON.stringify(trimmed)}? ids match exactly — no case folding, no surrounding whitespace)` : JSON.stringify(entry);
}
function readCapabilities(frontmatter) {
	const diagnostics = [];
	const raw = Object.hasOwn(frontmatter, CAPABILITIES_FIELD$1) ? frontmatter[CAPABILITIES_FIELD$1] : void 0;
	if (raw === void 0) {
		diagnostics.push(`declares no \`${CAPABILITIES_FIELD$1}:\` frontmatter, so no grant can be derived from it.`);
		return {
			categories: [],
			claimed: [],
			diagnostics
		};
	}
	if (!Array.isArray(raw)) {
		diagnostics.push(`\`${CAPABILITIES_FIELD$1}:\` must be an array of tool categories (got ${describeValue$2(raw)}); nothing is derived from a field that cannot be read.`);
		return {
			categories: [],
			claimed: [],
			diagnostics
		};
	}
	const entries = raw;
	if (entries.length === 0) {
		diagnostics.push(`declares an empty \`${CAPABILITIES_FIELD$1}:\` list — an explicit empty grant, not a missing one.`);
		return {
			categories: [],
			claimed: [],
			diagnostics
		};
	}
	const granted = /* @__PURE__ */ new Set();
	const rejected = [];
	const refused = /* @__PURE__ */ new Set();
	for (const entry of entries) {
		if (typeof entry !== "string" || !GRANTABLE_LOOKUP.has(entry)) {
			rejected.push(describeRejected(entry));
			continue;
		}
		if (NEVER_DERIVABLE_LOOKUP.has(entry)) {
			refused.add(entry);
			continue;
		}
		granted.add(entry);
	}
	if (rejected.length > 0) diagnostics.push(`dropped ${rejected.join(", ")} — not a grantable tool category. Grantable: ${DERIVABLE_CATEGORIES.join(", ")}.`);
	if (refused.size > 0) diagnostics.push(`dropped ${list([...refused])} — never derivable from frontmatter, because a delegated agent carries its own grant rather than this one. Delegation depth stays 1.`);
	return {
		categories: GRANTABLE_TOOL_CATEGORIES.filter((category) => granted.has(category)),
		claimed: GRANTABLE_TOOL_CATEGORIES.filter((category) => granted.has(category) || refused.has(category)),
		diagnostics
	};
}
function parseCapabilities(frontmatter) {
	return readCapabilities(frontmatter).categories;
}
function resolveAgentGrant(input) {
	const { runtimeId, frontmatter, roster = AGENT_POLICY_ROSTER, declaredTools } = input;
	const note = (message) => `${runtimeId}: ${message}`;
	const row = roster.find((candidate) => candidate.agentId === runtimeId);
	if (row !== void 0) {
		const declared = readCapabilities(frontmatter);
		const rowGrant = new Set(row.allow);
		const diagnostics = Object.hasOwn(frontmatter, CAPABILITIES_FIELD$1) && (declared.claimed.length !== rowGrant.size || declared.claimed.some((category) => !rowGrant.has(category))) ? [...declared.diagnostics.map((message) => note(message)), note(`resolved from the agent policy roster (${describeCategories(row.allow)}); the supplied \`${CAPABILITIES_FIELD$1}:\` frontmatter claims ${describeCategories(declared.claimed)} and was ignored, because a pack cannot widen — or narrow — a core agent's grant by shipping a file under its id.`)] : [];
		return {
			runtimeId,
			allow: row.allow,
			source: "roster",
			diagnostics
		};
	}
	const declared = readCapabilities(frontmatter);
	const diagnostics = declared.diagnostics.map((message) => note(message));
	if (declared.categories.length === 0) return {
		runtimeId,
		allow: [],
		source: "none",
		diagnostics
	};
	if (declaredTools === void 0) {
		diagnostics.push(note("has no roster row and no declared tool footprint, so nothing is granted. A pack agent reaches this resolver with its pack's footprint; resolving one without it is a caller defect, not an unbounded grant."));
		return {
			runtimeId,
			allow: [],
			source: "none",
			diagnostics
		};
	}
	const ceiling = new Set(declaredTools);
	const allow = declared.categories.filter((category) => ceiling.has(category));
	const dropped = declared.categories.filter((category) => !ceiling.has(category));
	if (dropped.length > 0) {
		const footprint = GRANTABLE_TOOL_CATEGORIES.filter((category) => ceiling.has(category));
		diagnostics.push(note(`dropped ${list(dropped)} — outside the pack's declared tool footprint (${footprint.length === 0 ? "the pack declares none" : footprint.join(", ")}). An agent holds no capability its pack did not disclose at install.`));
	}
	return {
		runtimeId,
		allow,
		source: "frontmatter",
		diagnostics
	};
}
//#endregion
//#region src/emit/hooksInfra.ts
var hooksInfra_exports = /* @__PURE__ */ __exportAll({
	AGENT_TOOL_POLICIES_PATH: () => AGENT_TOOL_POLICIES_PATH,
	GENERATED_DIR: () => GENERATED_DIR,
	HOOKS_GENERATED_DIR: () => HOOKS_GENERATED_DIR,
	planHooksInfra: () => planHooksInfra
});
const AGENT_TOOL_POLICIES_PATH = `${GENERATED_DIR}/${AGENT_TOOL_POLICIES_FILE}`;
const POLICIES_PATH_FROM_SCRIPT = `../../${AGENT_TOOL_POLICIES_FILE}`;
function policiesPathFor(hookScriptsRoot) {
	return hookScriptsRoot === void 0 ? POLICIES_PATH_FROM_SCRIPT : AGENT_TOOL_POLICIES_FILE;
}
const DEFAULT_USER_HOOKS_DIR = `${STATE_DIR}/hooks`;
const HOOK_CONFIG_CAPABLE_TOOLS = new Set(TOOLS);
function composePackPolicyRows(declarations) {
	const rows = [];
	const warnings = [];
	for (const declaration of declarations) {
		const grant = resolveAgentGrant({
			runtimeId: declaration.runtimeId,
			frontmatter: declaration.frontmatter,
			declaredTools: declaration.declaredTools
		});
		const lane = `pack agent grant [${declaration.packId}]`;
		for (const diagnostic of grant.diagnostics) warnings.push(`${lane}: ${diagnostic}`);
		if (grant.source === "roster") continue;
		if (grant.allow.length === 0) {
			warnings.push(`${lane}: ${declaration.runtimeId} resolved to no tool categories, so the emitted policy document carries no row for it and the generated guard denies every tool it requests. Declare what the agent needs in its \`capabilities:\` frontmatter, inside the pack's \`permissions.toolFootprint\`.`);
			continue;
		}
		rows.push({
			agentId: grant.runtimeId,
			allow: [...grant.allow],
			rationale: `Supplied by installed pack "${declaration.packId}". Granted the intersection of the agent's declared \`capabilities:\` and the pack's declared tool footprint — the same footprint the install preview disclosed before any byte landed.`,
			source: {
				kind: "pack",
				packId: declaration.packId
			}
		});
	}
	return {
		rows,
		warnings
	};
}
async function planHooksInfra(ctx) {
	const tools = TOOLS.filter((tool) => ctx.manifest.tools.includes(tool));
	const packPolicies = composePackPolicyRows(ctx.packAgents ?? []);
	const policies = [...AGENT_POLICY_ROSTER, ...packPolicies.rows];
	const warnings = [
		...validateToolPolicies(AGENT_POLICY_ROSTER).map((issue) => `agent-tool-policy roster: ${issue}`),
		...validateToolPolicies(packPolicies.rows).map((issue) => `agent-tool-policy pack rows: ${issue}`),
		...packPolicies.warnings
	];
	const policyContent = `${buildAgentToolPoliciesJson(policies)}\n`;
	const policyBytes = Buffer.byteLength(policyContent, "utf8");
	if (policyBytes > 262144) warnings.push(`agent-tool-policy document: ${policyBytes} bytes over the ${MAX_POLICY_FILE_BYTES}-byte cap the generated guard parses, so the guard refuses the whole file and denies every agent — the ${packPolicies.rows.length} installed-pack row(s) included. Uninstall a pack, or trim the rationales the document carries.`);
	const scripts = [];
	const rowsByTool = /* @__PURE__ */ new Map();
	const pluginOwnedHooks = new Set(ctx.pluginOwnedHooks ?? []);
	for (const tool of tools) {
		if (pluginOwnedHooks.has(tool)) continue;
		const rows = [];
		for (const script of planCoreHookScripts(policiesPathFor(ctx.hookScriptsRoot), tool)) {
			const path = `${HOOKS_GENERATED_DIR}/${tool}/${script.fileName}`;
			scripts.push({
				path,
				content: script.content,
				tool
			});
			rows.push({
				event: script.event,
				command: ["node", ctx.hookScriptsRoot === void 0 ? path : `${ctx.hookScriptsRoot}/${script.fileName}`]
			});
		}
		rowsByTool.set(tool, rows);
	}
	const userHooksDir = ctx.manifest.hooks?.userHooksDir ?? DEFAULT_USER_HOOKS_DIR;
	const read = await readHookDefinitions(resolve(ctx.rootDir, userHooksDir), ctx.rootDir);
	let acceptedHookRows = 0;
	for (const [label, lane] of [["user hook", read], ["pack hook", ctx.packHooks ?? {
		hooks: [],
		errors: []
	}]]) {
		for (const error of lane.errors) warnings.push(`${label} ${error.file} [${error.code}]: ${error.message}`);
		for (const hook of lane.hooks) {
			const row = {
				event: hook.event,
				command: hook.command,
				...hook.matcher === void 0 ? {} : { matcher: hook.matcher },
				...hook.timeoutMs === void 0 ? {} : { timeoutMs: hook.timeoutMs }
			};
			acceptedHookRows += 1;
			for (const rows of rowsByTool.values()) rows.push(row);
		}
	}
	const skipped = tools.filter((tool) => pluginOwnedHooks.has(tool));
	if (skipped.length > 0 && acceptedHookRows > 0) warnings.push(`hook wiring: ${acceptedHookRows} accepted hook row(s) from this repo and its installed packs are not wired into ${skipped.join(", ")} — that client's hooks come from its installed plugin, whose configuration this repository does not write. They still run on every other selected client.`);
	if (tools.length === 0 && acceptedHookRows > 0) {
		const wirable = TOOLS.filter((tool) => HOOK_CONFIG_CAPABLE_TOOLS.has(tool)).join(", ");
		warnings.push(`hook wiring: ${acceptedHookRows} accepted hook row(s) from this repo and its installed packs have no selected client to be wired into, so none of them will ever run. No per-client notice covers this — those are raised once per selected tool, and this build selects none. Select a client that takes hook configuration (${wirable}) for these hooks to be registered.`);
	}
	return {
		scripts,
		policyDocument: {
			path: AGENT_TOOL_POLICIES_PATH,
			content: policyContent,
			owners: tools
		},
		interchangeFor: (tool) => structuredClone(rowsByTool.get(tool) ?? []),
		warnings
	};
}
//#endregion
//#region src/emit/ownership.ts
var ownership_exports = /* @__PURE__ */ __exportAll({
	isPluginOwned: () => isPluginOwned,
	pluginOwnedSummary: () => pluginOwnedSummary,
	sharedProjectionOwners: () => sharedProjectionOwners,
	withoutPluginOwnedRows: () => withoutPluginOwnedRows
});
function isPluginOwned(manifest, tool, cls) {
	return pluginOwnedClasses(manifest, tool).has(cls);
}
function sharedProjectionOwners(manifest, readers) {
	return readers.filter((tool) => !isPluginOwned(manifest, tool, "skill"));
}
function pluginOwnedSummary(manifest) {
	const selected = new Set(manifest?.tools ?? []);
	const summary = [];
	for (const tool of TOOLS) {
		if (!selected.has(tool)) continue;
		const owned = pluginOwnedClasses(manifest, tool);
		if (owned.size === 0) continue;
		summary.push({
			tool,
			classes: PLUGIN_OWNED_CLASSES.filter((cls) => owned.has(cls))
		});
	}
	return summary;
}
function ownedClassOfRow(owner, hookInfraArtifactIds) {
	if (owner.artifactType !== "infra") return owner.artifactType;
	return hookInfraArtifactIds.has(owner.artifactId) ? "hooks" : null;
}
function withoutPluginOwnedRows(manifest, tool, rows, hookInfraArtifactIds, exemptPaths = /* @__PURE__ */ new Set()) {
	const owned = pluginOwnedClasses(manifest, tool);
	if (owned.size === 0) return [...rows];
	return rows.filter((row) => {
		if (exemptPaths.has(row.path)) return true;
		const cls = ownedClassOfRow(row.owner, hookInfraArtifactIds);
		return cls === null || !owned.has(cls);
	});
}
//#endregion
//#region src/emit/skillsProjection.ts
var skillsProjection_exports = /* @__PURE__ */ __exportAll({
	NATIVE_SKILL_DIRS: () => NATIVE_SKILL_DIRS,
	SKILLS_PROJECTION_DIR: () => SKILLS_PROJECTION_DIR,
	nativeSkillRows: () => nativeSkillRows,
	projectSkills: () => projectSkills,
	retargetProjection: () => retargetProjection,
	toSpecFrontmatter: () => toSpecFrontmatter
});
const SKILLS_PROJECTION_DIR = ".agents/skills";
const NATIVE_SKILL_DIRS = { claude: ".claude/skills" };
const defaultFs = {
	readdir,
	readFile
};
const SKILL_FILE$4 = "SKILL.md";
async function projectSkills(ctx, options = {}) {
	const fs = options.fs ?? defaultFs;
	const index = await buildContentIndex(options.contentRoot, { fs });
	const allowlist = buildSelectionAllowlist(ctx.manifest.selection);
	const admitted = index.items.filter((item) => item.type === "skill" && index.byKey.get(typeIdKey(item.type, item.id)) === item && classifySelection(item, allowlist) !== "drop");
	const detection = detectionContextFromManifest(ctx.manifest);
	const gates = verificationGatesFor(ctx.manifest.detected, readGates(ctx.manifest));
	const perSkill = await Promise.all(admitted.map((item) => projectOneSkill(fs, item, skillDirOf(replacedClaimantOf(index, item) ?? item), (raw, skillDir) => renderSkillBody(raw, skillDir, item.relativePath, detection, gates))));
	const demoted = options.demotedRules ?? NO_DEMOTED_RULES;
	const ruleRows = (options.ruleItems ?? []).flatMap((item) => {
		const tools = TOOLS.filter((tool) => demoted[tool].has(item.id));
		if (tools.length === 0) return [];
		if (item.tools !== void 0 && ![...SHARED_SKILLS_TREE_READERS].every((tool) => item.tools.includes(tool))) return [];
		return [projectRuleAsSkill(item, tools, detection, gates)];
	});
	return [...perSkill.flat(), ...ruleRows].toSorted((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
function projectRuleAsSkill(item, tools, detection, gates) {
	const skillDir = `${RULE_SKILL_DIR_PREFIX}${item.id}`;
	assertSafePath(posix.join(skillDir, SKILL_FILE$4), `rule "${item.id}" projection`);
	const head = {
		name: skillDir.toLowerCase().replaceAll(SPEC_NAME_PATTERN, "-").slice(0, 64),
		description: item.description,
		metadata: { stamity: {
			id: item.id,
			type: item.type,
			tags: item.tags,
			load: item.frontmatter["load"],
			obsolete_when: item.frontmatter["obsolete_when"],
			delivery: "on-demand",
			tools: [...tools]
		} }
	};
	return {
		path: posix.join(SKILLS_PROJECTION_DIR, skillDir, SKILL_FILE$4),
		content: composeFrontmatter(head, substituteBody(item.body, detection, gates)),
		artifactId: item.id,
		artifactType: item.type,
		artifactPath: item.relativePath,
		origin: item.origin ?? "corpus"
	};
}
function skillDirOf(item) {
	return posix.basename(posix.dirname(item.relativePath));
}
function retargetProjection(rows, dir) {
	assertSafePath(dir, "native skills projection root");
	const prefix = `${SKILLS_PROJECTION_DIR}/`;
	return rows.map((row) => {
		if (!row.path.startsWith(prefix)) throw new EngineError(`Cannot re-target ${JSON.stringify(row.path)}: it is not under ${prefix}. retargetProjection maps rows produced by the ${SKILLS_PROJECTION_DIR} projection.`, { code: "VALIDATION_ERROR" });
		return {
			...row,
			path: posix.join(dir, row.path.slice(prefix.length))
		};
	}).toSorted((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
function nativeSkillRows(rows, tool, demotedRules = NO_DEMOTED_RULES) {
	const dir = NATIVE_SKILL_DIRS[tool];
	if (dir === void 0 || dir === "") return [];
	const demoted = demotedRules[tool];
	return retargetProjection(rows.filter((row) => row.artifactType !== "rule" || demoted.has(row.artifactId)), dir);
}
const SPEC_FRONTMATTER_KEYS = [
	"name",
	"description",
	"license",
	"compatibility",
	"allowed-tools",
	"metadata"
];
const SPEC_NAME_PATTERN = /[^a-z0-9-]+/g;
function toSpecFrontmatter(raw, skillDir, source) {
	const parsed = parseFrontmatter(raw, source);
	if (!parsed.hadFrontmatter) return raw;
	const authored = parsed.frontmatter;
	const head = { name: skillDir.toLowerCase().replaceAll(SPEC_NAME_PATTERN, "-").slice(0, 64) };
	for (const key of SPEC_FRONTMATTER_KEYS) if (key !== "name" && key !== "metadata" && authored[key] !== void 0) head[key] = authored[key];
	const authoredMetadata = authored["metadata"];
	const hoisted = {};
	for (const [key, value] of Object.entries(authored)) {
		if (SPEC_FRONTMATTER_KEYS.includes(key)) continue;
		hoisted[key] = value;
	}
	const metadata = {
		...hoisted,
		...typeof authoredMetadata === "object" && authoredMetadata !== null && !Array.isArray(authoredMetadata) ? authoredMetadata : {}
	};
	if (Object.keys(metadata).length > 0) head["metadata"] = metadata;
	return composeFrontmatter(head, parsed.body);
}
function renderSkillBody(raw, skillDir, source, detection, gates) {
	return substituteBody(toSpecFrontmatter(raw, skillDir, source), detection, gates);
}
function substituteBody(raw, detection, gates) {
	const substituted = substituteVerificationGateTokens(substituteRepoTokens(raw, detection), gates);
	if (!substituted.includes("<!-- STAMITY:PLATFORM-TOOL -->")) return substituted;
	return substituted.split(PLATFORM_TOOL_MARKER).join(buildAskUserPlatformTable());
}
async function projectOneSkill(fs, item, skillDir, renderSkill) {
	const sourceDir = dirname(item.filePath);
	const files = await walkRegularFiles$1(fs, sourceDir, "");
	return Promise.all(files.map(async (relative) => {
		assertSafePath(posix.join(skillDir, relative), `skill "${item.id}" projection`);
		const content = relative === SKILL_FILE$4 ? renderSkill(composeFrontmatter(item.frontmatter, item.body), skillDir) : await fs.readFile(join(sourceDir, ...relative.split("/")), "utf8");
		return {
			path: posix.join(SKILLS_PROJECTION_DIR, skillDir, relative),
			content,
			artifactId: item.id,
			artifactType: item.type,
			artifactPath: item.relativePath,
			origin: item.origin ?? "corpus"
		};
	}));
}
async function walkRegularFiles$1(fs, dir, prefix) {
	const entries = (await fs.readdir(dir, { withFileTypes: true })).toSorted((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
	return (await Promise.all(entries.map((entry) => {
		const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
		if (entry.isDirectory()) return walkRegularFiles$1(fs, join(dir, entry.name), relative);
		return Promise.resolve(entry.isFile() ? [relative] : []);
	}))).flat();
}
//#endregion
//#region src/hooks/portableRunner.ts
var portableRunner_exports = /* @__PURE__ */ __exportAll({
	PORTABLE_RUNNER_FILE: () => PORTABLE_RUNNER_FILE,
	ROOT_VARIABLE_PATH: () => ROOT_VARIABLE_PATH,
	buildPortableHookRunner: () => buildPortableHookRunner,
	portableHookCommand: () => portableHookCommand
});
const PORTABLE_RUNNER_FILE = "stamity-portable-hook.mjs";
const ROOT_VARIABLE_PATH = /^\$\{[A-Z_][A-Z0-9_]*\}(?:\/[A-Za-z0-9_@%+=:,.-]+)+$/;
function portableHookCommand(tool, row) {
	const path = `.stamity/generated/hooks/${tool}/${PORTABLE_RUNNER_FILE}`;
	const data = Buffer.from(JSON.stringify(row)).toString("base64url");
	const script = row.command[1] ?? "";
	const lastSlash = script.lastIndexOf("/");
	if (ROOT_VARIABLE_PATH.test(script)) return `node "${script.slice(0, lastSlash)}/${PORTABLE_RUNNER_FILE}" ${data}`;
	if (tool !== "codex") return `node ${path} ${data}`;
	return `node -e "${`const fs=require('node:fs'),p=require('node:path'),cp=require('node:child_process');let d=process.cwd();for(;;){if(fs.existsSync(p.join(d,'.codex','hooks.json'))){const f=p.join(d,'${path}');if(!fs.existsSync(f)){process.stderr.write('Stamity hook script missing beside .codex/hooks.json; run stamity sync');process.exitCode=1;break;}const r=cp.spawnSync(process.execPath,[f,...process.argv.slice(1)],{stdio:'inherit'});process.exitCode=r.status??1;break;}const up=p.dirname(d);if(up===d){process.stderr.write('Stamity hook project root not found');process.exitCode=1;break;}d=up;}`}" ${data}`;
}
function buildPortableHookRunner(tool) {
	return `#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const TOOL = ${JSON.stringify(tool)};
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
// A script addressed through a client's plugin root variable, e.g.
// \${CLAUDE_PLUGIN_ROOT}/hooks/stamity-session-start.mjs. The client expands
// that variable in its config's command string ALONE — never inside the
// base64url row below — so the literal reaches this runner and this is where
// it is resolved.
const PLUGIN_ROOT_REF = /^\\$\\{([A-Za-z_][A-Za-z0-9_]*)\\}\\/(.+)$/;
const CORE_GUARD_FILE = "stamity-pre-tool-use-guard.mjs";
// PascalCase wire names. Codex reads this set natively and Copilot accepts it
// as its matcher aliases; Cursor's adapter renames them at its own boundary.
// https://learn.chatgpt.com/docs/hooks (accessed 2026-09-17)
// https://docs.github.com/en/copilot/reference/hooks-reference (accessed 2026-09-17)
// https://cursor.com/docs/hooks (accessed 2026-09-17)
const NAMES = { session_start: "SessionStart", pre_tool_use: "PreToolUse", post_tool_use: "PostToolUse", user_prompt_submit: "UserPromptSubmit", stop: "Stop", session_end: "SessionEnd" };
const warn = (message) => process.stderr.write("stamity hook [" + TOOL + "]: " + message + "\\n");
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const write = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
const safeError = (message) => Object.assign(new Error(message), { safe: true });
const parse = (raw, label) => { try { return JSON.parse(raw); } catch { throw safeError(label); } };
let failureExit = 1;

function main() {
  const row = parse(Buffer.from(process.argv[2] ?? "", "base64url").toString(), "Invalid hook registration");
  if (!object(row) || !Object.hasOwn(NAMES, row.event)) throw safeError("Invalid hook registration");
  if (!Array.isArray(row.command) || row.command.length === 0 || !row.command.every((arg) => typeof arg === "string")) throw safeError("Invalid hook argv");
  // The core pre-tool-use guard is telemetry on every identity-free client, so
  // a fault INSIDE this runner must not decide the pending call for it. Codex
  // blocks on exit 2 only, so exit 1 already lets it through; Copilot rejects
  // every nonzero exit, so the same posture there is exit 0 with the warning.
  // https://learn.chatgpt.com/docs/hooks (accessed 2026-09-17)
  // https://docs.github.com/en/copilot/reference/hooks-reference (accessed 2026-09-17)
  // Identified by WHICH SCRIPT the row runs, not by where that script sits: the
  // path used to be matched whole against the repository layout, so a row under
  // a plugin root matched nothing and each client's posture above silently
  // flipped — Codex to a blocking exit 2, Copilot to a call-rejecting exit 1.
  // The SCRIPT is argv[1] and nothing else: matching any argv position would
  // let a launcher or an option value named after the guard claim the guard's
  // telemetry posture for a row that runs an authored script.
  const coreGuard = row.event === "pre_tool_use" && basename(row.command[1] ?? "") === CORE_GUARD_FILE;
  if (TOOL === "codex" && row.event === "pre_tool_use" && !coreGuard) failureExit = 2;
  if (TOOL === "copilot" && coreGuard) failureExit = 0;
  if (row.timeoutMs !== undefined && (!Number.isSafeInteger(row.timeoutMs) || row.timeoutMs <= 0)) throw safeError("Invalid hook timeout");
  const raw = readFileSync(0, "utf8");
  const payload = raw.trim() === "" ? {} : parse(raw, "Invalid hook input JSON");
  if (!object(payload)) throw safeError("Invalid hook input object");
  const input = { ...payload, hook_event_name: NAMES[row.event] };
  // Copilot sends camelCase payload keys and may serialize the tool arguments;
  // Cursor spells the edited path filePath. Both normalize to the interchange
  // snake_case names the authored hook reads.
  // https://docs.github.com/en/copilot/reference/hooks-reference (accessed 2026-09-17)
  // https://cursor.com/docs/hooks (accessed 2026-09-17)
  if (input.session_id === undefined && typeof payload.sessionId === "string") input.session_id = payload.sessionId;
  if (input.tool_name === undefined && typeof payload.toolName === "string") input.tool_name = payload.toolName;
  if (input.tool_input === undefined && payload.toolArgs !== undefined) input.tool_input = typeof payload.toolArgs === "string" ? parse(payload.toolArgs, "Invalid serialized tool input") : payload.toolArgs;
  if (object(input.tool_input) && input.tool_input.file_path === undefined && typeof input.tool_input.filePath === "string") input.tool_input = { ...input.tool_input, file_path: input.tool_input.filePath };
  // Resolved here, once: the row's script, and the directory the child runs in.
  // A plugin-rooted row's repository is the SESSION's working directory — the
  // four-level climb below locates the repository a runner was synced into, and
  // under a vendor container it would name the container instead. With the
  // variable unset there is still one right answer rather than a guess: a
  // container places every hook script in the single \`hooks/\` directory this
  // runner ships in, so the script is its sibling.
  const pluginRef = PLUGIN_ROOT_REF.exec(row.command[1] ?? "");
  const command = [...row.command];
  if (pluginRef !== null) {
    const supplied = process.env[pluginRef[1]];
    command[1] = typeof supplied === "string" && supplied !== ""
      ? join(supplied, ...pluginRef[2].split("/"))
      : join(HERE, basename(command[1]));
  }
  const child = spawnSync(command[0], command.slice(1), {
    cwd: pluginRef === null ? ROOT : process.cwd(), input: JSON.stringify(input), encoding: "utf8", shell: false,
    maxBuffer: 1024 * 1024,
    ...(row.timeoutMs === undefined ? {} : { timeout: row.timeoutMs }),
  });
  if (child.stderr) process.stderr.write(child.stderr);
  if (child.error) {
    // Copilot hook timeouts always fail open, so the runner reports and yields
    // rather than manufacturing a denial the client would not have made.
    // https://docs.github.com/en/copilot/reference/hooks-reference (accessed 2026-09-17)
    if (child.error.code === "ETIMEDOUT" && TOOL === "copilot") {
      warn("timeout: Copilot proceeds through its normal permission flow");
      return;
    }
    throw safeError("Hook process failed (" + (child.error.code ?? "unknown") + ")");
  }
  if (child.status !== 0) { process.exitCode = child.status ?? 1; return; }
  const output = (child.stdout ?? "").trim();
  // A child that wrote nothing decided nothing. On Cursor that is not a
  // pass-through: its failClosed clause counts "no output" as a hook failure,
  // so a pre-tool-use row has to say allow out loud.
  // https://cursor.com/docs/hooks (accessed 2026-09-17)
  if (output === "") { if (TOOL === "cursor" && row.event === "pre_tool_use") write({ permission: "allow" }); return; }
  let parsed;
  try { parsed = JSON.parse(output); } catch {
    // Codex injects a UserPromptSubmit hook's plain stdout into the prompt.
    // https://learn.chatgpt.com/docs/hooks (accessed 2026-09-17)
    if (TOOL === "codex" && row.event === "user_prompt_submit") { process.stdout.write(output + "\\n"); return; }
    if (row.event === "session_start") {
      // Each client's own session-start context channel, so a script that just
      // prints the learning index reaches the session on all three.
      // https://cursor.com/docs/hooks (accessed 2026-09-17)
      // https://docs.github.com/en/copilot/reference/hooks-reference (accessed 2026-09-17)
      if (TOOL === "cursor") write({ additional_context: output });
      else if (TOOL === "codex") process.stdout.write(output + "\\n");
      else write({ additionalContext: output });
      return;
    }
    throw safeError("Hook stdout is not a JSON object");
  }
  if (!object(parsed)) throw safeError("Hook stdout is not a JSON object");
  const specific = parsed.hookSpecificOutput;
  if (specific !== undefined && (!object(specific) || specific.hookEventName !== NAMES[row.event])) throw safeError("Mismatched hookSpecificOutput event");
  if (specific && specific.permissionDecision !== undefined && (row.event !== "pre_tool_use" || !["allow", "deny", "ask"].includes(specific.permissionDecision))) throw safeError("Unsupported permission decision");
  if (specific && specific.permissionDecisionReason !== undefined && typeof specific.permissionDecisionReason !== "string") throw safeError("Invalid permission reason");
  if (specific && specific.additionalContext !== undefined && typeof specific.additionalContext !== "string") throw safeError("Invalid additional context");
  if (parsed.continue !== undefined && typeof parsed.continue !== "boolean") throw safeError("Invalid continuation decision");
  // The legacy vocabulary is exactly \`approve\` and \`block\`, and the value is
  // validated HERE, beside \`permissionDecision\`, rather than at any client's
  // branch. A key this runner knows never reads as \`<unrecognized>\`, so an
  // unreadable value on it would otherwise set no decision and reach Cursor's
  // explicit allow below — turning a child that meant to refuse into an
  // approval. Faulting hands each client its own fail-closed exit instead.
  if (parsed.decision !== undefined && !["approve", "block"].includes(parsed.decision)) throw safeError("Unsupported decision");
  // Codex accepts the canonical schema, except unsupported PreToolUse controls
  // fail open natively. Convert requests to stop/ask into a supported denial.
  // https://learn.chatgpt.com/docs/hooks (accessed 2026-09-17)
  if (TOOL === "codex") {
    if (row.event === "pre_tool_use") {
      if (specific?.permissionDecision === "ask" || parsed.continue === false) {
        warn("unsupported PreToolUse stop/ask control; denied pending manual permission review");
        parsed.hookSpecificOutput = { ...specific, hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: (parsed.continue === false ? parsed.stopReason : specific?.permissionDecisionReason) ?? "Hook requires manual permission review" };
        delete parsed.hookSpecificOutput.updatedInput;
        delete parsed.continue;
        delete parsed.stopReason;
      }
      // Legacy \`decision: "approve"\` is ignored with a warning, exactly as the
      // other clients' branch below ignores it: it carries no denial, and
      // turning a hook that meant to allow into a runner fault was this
      // client's alone.
      if (parsed.decision === "approve") {
        warn("legacy approve is unsupported and ignored; use hookSpecificOutput.permissionDecision");
        delete parsed.decision;
      }
      const nativeSpecific = parsed.hookSpecificOutput;
      if (nativeSpecific?.updatedInput !== undefined && (nativeSpecific.permissionDecision !== "allow" || !object(nativeSpecific.updatedInput))) throw safeError("Invalid updatedInput permission or shape");
      // Codex's shell and patch tools take their rewrite on \`command\`.
      // https://learn.chatgpt.com/docs/hooks (accessed 2026-09-17)
      if (nativeSpecific?.updatedInput !== undefined && ["Bash", "apply_patch"].includes(input.tool_name) && typeof nativeSpecific.updatedInput.command !== "string") throw safeError("Invalid command rewrite");
      if (parsed.stopReason !== undefined) { warn("unsupported output field: stopReason"); delete parsed.stopReason; }
    }
    for (const key of ["suppressOutput", "updatedMCPToolOutput"]) {
      if (parsed[key] !== undefined) { warn("unsupported output field: " + key); delete parsed[key]; }
      if (parsed.hookSpecificOutput?.[key] !== undefined) { warn("unsupported output field: hookSpecificOutput." + key); delete parsed.hookSpecificOutput[key]; }
    }
    write(parsed);
    return;
  }
  const value = specific ?? parsed;
  const publicFields = new Set(["updatedInput", "updatedToolOutput", "modifiedArgs", "modifiedResponse", "suppressOutput"]);
  const fieldName = (key) => publicFields.has(key) ? key : "<unrecognized>";
  const supported = new Set(["hookSpecificOutput", "hookEventName", "permissionDecision", "permissionDecisionReason", "additionalContext", "decision", "reason", "continue", "stopReason", "systemMessage"]);
  // A key the runner KNOWS (supported, or a named public field) is diagnosed and
  // dropped. A key it cannot name at all may be carrying the child's verdict in
  // a spelling this boundary does not read, which is a different class.
  let undecidable = false;
  const note = (prefix, key) => { const name = fieldName(key); if (name === "<unrecognized>") undecidable = true; warn("unsupported output field: " + prefix + name); };
  for (const key of Object.keys(parsed)) if (!supported.has(key)) note("", key);
  if (specific) for (const key of Object.keys(specific)) if (!supported.has(key)) note("hookSpecificOutput.", key);
  const out = {};
  if (row.event === "pre_tool_use") {
    // The canonical global stop overrides every event-specific decision.
    const stopped = parsed.continue === false;
    const decision = stopped ? "deny" : value.permissionDecision ?? (parsed.decision === "block" ? "deny" : undefined);
    if (decision !== undefined) {
      if (!["allow", "deny", "ask"].includes(decision)) throw safeError("Unsupported permission decision");
      const reason = stopped ? parsed.stopReason ?? "Hook requested a stop" : value.permissionDecisionReason ?? parsed.reason ?? "Hook permission decision";
      if (TOOL === "cursor") {
        // Cursor's verdict document: permission is allow | deny | ask and
        // user_message is the message shown when denied. It documents no ask,
        // so an ask becomes a denial pending manual review.
        // https://cursor.com/docs/hooks (accessed 2026-09-17)
        out.permission = decision === "allow" ? "allow" : "deny";
        if (decision === "ask") warn("Cursor has no ask decision; denied pending manual permission review");
        out.user_message = reason;
      } else {
        out.permissionDecision = decision;
        out.permissionDecisionReason = reason;
      }
    } else if (TOOL === "cursor") {
      // A child that wrote an unreadable key alongside no decision may have
      // MEANT to deny — Cursor's own native document spells the verdict
      // \`permission\`, and a misspelled canonical key lands here too. Writing
      // the allow for it would convert that denial into an approval, so the
      // runner faults instead and failClosed denies.
      if (undecidable) throw safeError("Undecidable hook output");
      // Otherwise the child made no decision. On this client "no output" is a
      // failClosed FAILURE, so silence would block every call the guard meant
      // to allow — the allow is written explicitly instead, which is also
      // correct under the reading where silence merely passes through.
      // https://cursor.com/docs/hooks (accessed 2026-09-17)
      out.permission = "allow";
    }
  } else if (row.event === "stop" && TOOL === "copilot" && parsed.decision === "block") {
    // Copilot's Stop hook takes decision: "block" with a reason.
    // https://docs.github.com/en/copilot/reference/hooks-reference (accessed 2026-09-17)
    out.decision = "block";
    out.reason = parsed.reason ?? "Hook requested another turn";
  } else if (row.event === "user_prompt_submit" && TOOL === "cursor" && parsed.continue === false) {
    // Cursor stops a submission with continue: false plus user_message.
    // https://cursor.com/docs/hooks (accessed 2026-09-17)
    out.continue = false;
    out.user_message = parsed.stopReason ?? "Hook prevented prompt submission";
  } else if (parsed.decision === "block" || parsed.continue === false) {
    warn("blocking output is unsupported for this event; use the client's permission controls");
  }
  // Each client's context-injection field, and the events that carry it.
  // Copilot injects on sessionStart as well as postToolUse.
  // https://cursor.com/docs/hooks (accessed 2026-09-17)
  // https://docs.github.com/en/copilot/reference/hooks-reference (accessed 2026-09-17)
  if (typeof value.additionalContext === "string") {
    if (TOOL === "cursor" && ["session_start", "post_tool_use"].includes(row.event)) out.additional_context = value.additionalContext;
    else if (TOOL === "copilot" && ["session_start", "post_tool_use"].includes(row.event)) out.additionalContext = value.additionalContext;
    else warn("additionalContext is unsupported for this event");
  }
  if (parsed.systemMessage !== undefined) warn("systemMessage is unsupported by this client's portable output");
  if (Object.keys(out).length > 0) write(out);
}
try { main(); } catch (error) {
  warn(error instanceof Error && error.safe === true ? error.message : "Hook invocation failed");
  process.exitCode = failureExit;
}
`;
}
//#endregion
//#region src/merge/managedBlocks.ts
var managedBlocks_exports = /* @__PURE__ */ __exportAll({
	extractCustomContent: () => extractCustomContent,
	extractManagedBlock: () => extractManagedBlock,
	getStampedVersion: () => getStampedVersion,
	hasManagedBlock: () => hasManagedBlock,
	insertManagedBlock: () => insertManagedBlock,
	isHealableManagedPrefix: () => isHealableManagedPrefix,
	isManagedBlockStale: () => isManagedBlockStale,
	splitAfterManagedBlock: () => splitAfterManagedBlock,
	splitAtManagedBlock: () => splitAtManagedBlock,
	wouldChangeMarkerVariant: () => wouldChangeMarkerVariant,
	wrapInManagedBlock: () => wrapInManagedBlock
});
function computeFencedLineRanges(content) {
	const ranges = [];
	let open = null;
	let lineStart = 0;
	while (lineStart <= content.length) {
		const nlIdx = content.indexOf("\n", lineStart);
		const lineEnd = nlIdx === -1 ? content.length : nlIdx;
		const trimmed = content.slice(lineStart, lineEnd).trim();
		if (open === null) {
			const fence = /^(`{3,}|~{3,})/.exec(trimmed)?.[1];
			if (fence !== void 0) open = {
				char: fence.charAt(0),
				len: fence.length,
				rangeStart: lineStart
			};
		} else if (new RegExp(`^${open.char}{${open.len},}$`).test(trimmed)) {
			ranges.push({
				start: open.rangeStart,
				end: lineEnd
			});
			open = null;
		}
		if (nlIdx === -1) break;
		lineStart = nlIdx + 1;
	}
	return open === null ? ranges : void 0;
}
function insideFencedRange(ranges, idx) {
	return ranges.some((r) => idx >= r.start && idx < r.end);
}
function isMarkdownHost(filePath) {
	if (filePath === void 0) return true;
	return /\.(md|mdc|markdown)$/i.test(filePath);
}
function isStartMarkerLine(trimmed, variant) {
	if (trimmed === variant.start) return true;
	if (variant.start.endsWith("-->")) {
		if (!trimmed.endsWith("-->")) return false;
		const head = variant.start.slice(0, -3).trimEnd();
		if (!trimmed.startsWith(head)) return false;
		const tail = trimmed.slice(head.length, -3);
		if (!/^[ \t]/.test(tail)) return false;
		const stamp = tail.trim();
		return stamp !== "" && !/\s/.test(stamp);
	}
	if (!trimmed.startsWith(variant.start)) return false;
	return /^[ \t]+\S+$/.test(trimmed.slice(variant.start.length));
}
function findAnchoredLine(content, matches, fromIdx = 0, fenced) {
	let lineStart = content.lastIndexOf("\n", fromIdx > 0 ? fromIdx - 1 : 0) + 1;
	while (lineStart <= content.length) {
		const nlIdx = content.indexOf("\n", lineStart);
		const lineEnd = nlIdx === -1 ? content.length : nlIdx;
		if (!(fenced !== void 0 && insideFencedRange(fenced, lineStart))) {
			const line = content.slice(lineStart, lineEnd);
			const trimmed = line.trim();
			if (matches(trimmed)) {
				const tokenIdx = lineStart + (line.length - line.trimStart().length);
				if (tokenIdx >= fromIdx) return {
					tokenIdx,
					lineEnd,
					trimmed
				};
			}
		}
		if (nlIdx === -1) break;
		lineStart = nlIdx + 1;
	}
	return null;
}
function countAnchoredLines(content, matches, fenced) {
	let count = 0;
	let lineStart = 0;
	while (lineStart <= content.length) {
		const nlIdx = content.indexOf("\n", lineStart);
		const lineEnd = nlIdx === -1 ? content.length : nlIdx;
		if (!(fenced !== void 0 && insideFencedRange(fenced, lineStart))) {
			if (matches(content.slice(lineStart, lineEnd).trim())) count++;
		}
		if (nlIdx === -1) break;
		lineStart = nlIdx + 1;
	}
	return count;
}
function fencedRangesFor(content, filePath) {
	return isMarkdownHost(filePath) ? computeFencedLineRanges(content) : void 0;
}
function detectBlock(content, filePath) {
	const preferred = filePath === void 0 ? void 0 : getMarkersForPath(filePath);
	const ordered = preferred === void 0 ? MANAGED_BLOCK_VARIANTS : [preferred, ...MANAGED_BLOCK_VARIANTS.filter((v) => v.start !== preferred.start)];
	const fenced = fencedRangesFor(content, filePath);
	for (const variant of ordered) {
		const start = findAnchoredLine(content, (l) => isStartMarkerLine(l, variant), 0, fenced);
		if (start === null) continue;
		const end = findAnchoredLine(content, (l) => l === variant.end, start.lineEnd, fenced);
		if (end === null) continue;
		if (start.tokenIdx >= end.tokenIdx) continue;
		return {
			variant,
			startIdx: start.tokenIdx,
			startLineEnd: start.lineEnd,
			endIdx: end.tokenIdx,
			endTokenEnd: end.tokenIdx + variant.end.length,
			startLine: start.trimmed
		};
	}
	return null;
}
function locationSuffix(filePath) {
	return filePath === void 0 ? "" : ` in ${filePath}`;
}
function insertManagedBlock(existingContent, managedContent, filePath, version) {
	const detected = detectBlock(existingContent, filePath);
	if (detected === null) throw new EngineError(`Managed block markers not found${locationSuffix(filePath)}. Expected a STAMITY:BEGIN/STAMITY:END pair on their own lines; restore both markers or regenerate the file, then retry.`, { code: "VALIDATION_ERROR" });
	const fenced = fencedRangesFor(existingContent, filePath);
	const startCount = countAnchoredLines(existingContent, (l) => isStartMarkerLine(l, detected.variant), fenced);
	if (startCount > 1) throw new EngineError(`Corrupted managed block${locationSuffix(filePath)}: ${startCount} STAMITY:BEGIN markers found. Delete the extra start-marker lines so exactly one remains, then retry.`, { code: "VALIDATION_ERROR" });
	const endCount = countAnchoredLines(existingContent, (l) => l === detected.variant.end, fenced);
	if (endCount > 1) throw new EngineError(`Corrupted managed block${locationSuffix(filePath)}: ${endCount} STAMITY:END markers found. Delete the extra end-marker lines so exactly one remains, then retry.`, { code: "VALIDATION_ERROR" });
	const output = getMarkersForPath(filePath);
	const block = `${version === void 0 ? output.start : stampMarkerVersion(output.start, version)}\n${managedContent.trim()}\n${output.end}`;
	const result = `${existingContent.substring(0, detected.startIdx)}${block}${existingContent.substring(detected.endTokenEnd)}`;
	return result.endsWith("\n") ? result : `${result}\n`;
}
function extractManagedBlock(content, filePath) {
	const detected = detectBlock(content, filePath);
	if (detected === null) return null;
	return content.substring(detected.startLineEnd, detected.endIdx).trim();
}
function splitAtManagedBlock(content, filePath) {
	const detected = detectBlock(content, filePath);
	if (detected === null) return null;
	return {
		before: content.substring(0, detected.startIdx),
		block: content.substring(detected.startIdx, detected.endTokenEnd),
		after: content.substring(detected.endTokenEnd)
	};
}
function splitAfterManagedBlock(content, filePath) {
	const detected = detectBlock(content, filePath);
	if (detected === null) return null;
	return {
		prefix: content.substring(0, detected.endTokenEnd),
		rest: content.substring(detected.endTokenEnd)
	};
}
function isHealableManagedPrefix(prefix) {
	const fenced = computeFencedLineRanges(prefix);
	for (const variant of MANAGED_BLOCK_VARIANTS) {
		const start = findAnchoredLine(prefix, (l) => isStartMarkerLine(l, variant), 0, fenced);
		if (start === null) continue;
		if (findAnchoredLine(prefix, (l) => l === variant.end, start.lineEnd, fenced) === null) return true;
	}
	return false;
}
function extractCustomContent(content, filePath) {
	const detected = detectBlock(content, filePath);
	if (detected === null) return content;
	return [content.substring(0, detected.startIdx).trim(), content.substring(detected.endTokenEnd).trim()].filter((part) => part !== "").join("\n\n");
}
function wrapInManagedBlock(content, filePath, version) {
	const markers = getMarkersForPath(filePath);
	return `${version === void 0 ? markers.start : stampMarkerVersion(markers.start, version)}\n${content.trim()}\n${markers.end}\n`;
}
function hasManagedBlock(content, filePath) {
	return detectBlock(content, filePath) !== null;
}
function wouldChangeMarkerVariant(existingContent, filePath) {
	const detected = detectBlock(existingContent, filePath);
	if (detected === null) return false;
	const output = getMarkersForPath(filePath);
	return detected.variant.start !== output.start || detected.variant.end !== output.end;
}
function getStampedVersion(content, filePath) {
	const detected = detectBlock(content, filePath);
	if (detected === null) return null;
	return parseMarkerVersion(detected.startLine);
}
function isManagedBlockStale(existingContent, currentVersion, filePath) {
	const stamped = getStampedVersion(existingContent, filePath);
	if (stamped === null) return true;
	if (semver.valid(stamped) === null || semver.valid(currentVersion) === null) return true;
	return !semver.eq(stamped, currentVersion);
}
//#endregion
//#region src/roster/modelLadder.ts
var modelLadder_exports = /* @__PURE__ */ __exportAll({
	CLIENT_MODEL_PROJECTION: () => CLIENT_MODEL_PROJECTION,
	EFFORT_PLACEHOLDER: () => EFFORT_PLACEHOLDER,
	MODEL_LADDER: () => MODEL_LADDER,
	effortDisclosures: () => effortDisclosures,
	isModelClass: () => isModelClass,
	nearestExpressibleEffort: () => nearestExpressibleEffort,
	resolveEffortValue: () => resolveEffortValue,
	resolveModelValue: () => resolveModelValue
});
const MODEL_LADDER = [
	{
		modelClass: "frontier",
		roles: ["reviewer"],
		defaultEffort: "high",
		rationale: "The whole-branch pass at deep intensity: the one review that reads a finished branch end to end, where a missed cross-unit defect costs a rework cycle instead of a round. No agent file declares this class — it is an escalation the flow applies to the reviewer, whose default sits one rung down."
	},
	{
		modelClass: "advanced",
		roles: [
			"design-quality",
			"implementer",
			"reviewer",
			"security",
			"spec-author"
		],
		defaultEffort: "high",
		rationale: "The roles the rest of the flow is built on: the per-round review verdict, implementation on novel or cross-cutting units, the spec text later units are planned against, and the two specialist lenses whose misses ship — an authorization gap or an unmet success criterion, where a missed budget only slows something down."
	},
	{
		modelClass: "standard",
		roles: [
			"creator",
			"fixer",
			"performance",
			"researcher"
		],
		defaultEffort: "medium",
		rationale: "The default working class: units with a known shape, research briefs answered against the codebase, fix rounds that still need judgement, cost review against budgets the repository already declared, and authoring one user artifact to a shape the corpus already fixes."
	},
	{
		modelClass: "economy",
		roles: ["fixer", "test-runner"],
		defaultEffort: "low",
		rationale: "Bounded work with a checkable answer: running the declared gates and reporting them verbatim, and the mechanical fix rounds — lint, format, rename sweeps. `fixer` also sits at `standard`, its default; the drop to this class is the flow's call once a round carries no judgement."
	}
];
const LADDER_BY_CLASS = new Map(MODEL_LADDER.map((row) => [row.modelClass, row]));
function isModelClass(value) {
	return typeof value === "string" && LADDER_BY_CLASS.has(value);
}
const EFFORT_PLACEHOLDER = "{effort}";
const CLIENT_MODEL_PROJECTION = {
	claude: {
		tool: "claude",
		modelKey: "model",
		effortCarrier: "key",
		effortKey: "effort",
		effortTemplate: null,
		acceptsConcreteIds: true,
		aliases: {
			advanced: "opus",
			standard: "sonnet",
			economy: "haiku"
		},
		effortScale: [
			"low",
			"medium",
			"high",
			"xhigh",
			"max"
		],
		effortScaleNote: null,
		effortScaleCitation: {
			url: "https://code.claude.com/docs/en/sub-agents",
			accessDate: "2026-09-17"
		},
		citation: {
			url: "https://code.claude.com/docs/en/sub-agents",
			accessDate: "2026-08-17"
		}
	},
	cursor: {
		tool: "cursor",
		modelKey: "model",
		effortCarrier: "model-suffix",
		effortKey: null,
		effortTemplate: `[effort=${EFFORT_PLACEHOLDER}]`,
		acceptsConcreteIds: true,
		aliases: {},
		effortScale: [...EFFORT_LEVELS],
		effortScaleNote: "pass-through — parameter ids and values vary by model",
		effortScaleCitation: {
			url: "https://cursor.com/docs/sdk/typescript",
			accessDate: "2026-09-17"
		},
		citation: {
			url: "https://cursor.com/docs/agent/subagents",
			accessDate: "2026-08-17"
		}
	},
	copilot: {
		tool: "copilot",
		modelKey: "model",
		effortCarrier: null,
		effortKey: null,
		effortTemplate: null,
		acceptsConcreteIds: true,
		aliases: {},
		effortScale: [],
		effortScaleNote: null,
		effortScaleCitation: null,
		citation: {
			url: "https://docs.github.com/en/copilot/reference/custom-agents-configuration",
			accessDate: "2026-08-17"
		}
	},
	codex: {
		tool: "codex",
		modelKey: "model",
		effortCarrier: "key",
		effortKey: "model_reasoning_effort",
		effortTemplate: null,
		acceptsConcreteIds: true,
		aliases: {},
		effortScale: [
			"minimal",
			"low",
			"medium",
			"high",
			"xhigh"
		],
		effortScaleNote: null,
		effortScaleCitation: {
			url: "https://learn.chatgpt.com/docs/config-file/config-reference",
			accessDate: "2026-09-17"
		},
		citation: {
			url: "https://learn.chatgpt.com/docs/agent-configuration/subagents",
			accessDate: "2026-08-17"
		}
	}
};
function stated(value) {
	if (value === void 0) return void 0;
	const trimmed = value.trim();
	return trimmed === "" ? void 0 : trimmed;
}
function valueForKey(key, operator, declared) {
	if (key === null) return void 0;
	return operator ?? declared;
}
function baseModelValue(projection, modelClass, pins) {
	return valueForKey(projection.modelKey, stated(pins[modelClass]), projection.aliases[modelClass]);
}
function requestedEffort(modelClass, efforts) {
	const asked = stated(efforts[modelClass]) ?? LADDER_BY_CLASS.get(modelClass)?.defaultEffort;
	return asked !== void 0 && EFFORT_LEVELS.includes(asked) ? asked : void 0;
}
function nearestExpressibleEffort(level, tool) {
	const { effortScale } = CLIENT_MODEL_PROJECTION[tool];
	if (effortScale.length === 0) return void 0;
	if (effortScale.includes(level)) return level;
	const wanted = effortRank(level);
	const below = effortScale.findLast((entry) => effortRank(entry) < wanted);
	const above = effortScale.find((entry) => effortRank(entry) > wanted);
	return below ?? above;
}
function emittedEffort(tool, modelClass, efforts) {
	const asked = requestedEffort(modelClass, efforts);
	return asked === void 0 ? void 0 : nearestExpressibleEffort(asked, tool);
}
function withEffortParameter(projection, model, effort) {
	if (projection.effortCarrier !== "model-suffix") return model;
	if (projection.effortTemplate === null || effort === void 0) return model;
	if (model.includes("[")) return model;
	return model + projection.effortTemplate.replace(EFFORT_PLACEHOLDER, effort);
}
function resolveModelValue(modelClass, tool, pins = {}, efforts = {}) {
	if (!isModelClass(modelClass)) return void 0;
	const projection = CLIENT_MODEL_PROJECTION[tool];
	const model = baseModelValue(projection, modelClass, pins);
	if (model === void 0) return void 0;
	return withEffortParameter(projection, model, emittedEffort(tool, modelClass, efforts));
}
function resolveEffortValue(modelClass, tool, efforts = {}) {
	if (!isModelClass(modelClass)) return void 0;
	if (CLIENT_MODEL_PROJECTION[tool].effortKey === null) return void 0;
	return emittedEffort(tool, modelClass, efforts);
}
function effortDisclosures(manifest) {
	const efforts = manifest.models?.effort ?? {};
	const lines = [];
	for (const tool of manifest.tools) {
		if (CLIENT_MODEL_PROJECTION[tool].effortCarrier === null) continue;
		for (const row of MODEL_LADDER) {
			const asked = requestedEffort(row.modelClass, efforts);
			if (asked === void 0) continue;
			const emitted = nearestExpressibleEffort(asked, tool);
			if (emitted === void 0 || emitted === asked) continue;
			const edge = effortRank(emitted) < effortRank(asked) ? "ends at" : "starts at";
			lines.push(`effort [${tool}]: ${row.modelClass} asks for ${asked}; this client's scale ${edge} ${emitted}, emitted ${emitted}`);
		}
	}
	return lines;
}
//#endregion
//#region src/adapters/claude.ts
var claude_exports = /* @__PURE__ */ __exportAll({
	CLAUDE_COMMANDS_DIR: () => CLAUDE_COMMANDS_DIR,
	CLAUDE_DIALECT_FACTS: () => CLAUDE_DIALECT_FACTS,
	CLAUDE_MD_PATH: () => CLAUDE_MD_PATH,
	CLAUDE_REVIEW_GATE_PATH: () => CLAUDE_REVIEW_GATE_PATH,
	CLAUDE_SETTINGS_PATH: () => CLAUDE_SETTINGS_PATH,
	CLAUDE_SKILLS_DIR: () => CLAUDE_SKILLS_DIR,
	claudeResiduePlanner: () => claudeResiduePlanner,
	claudeSettingsOwnedKeys: () => claudeSettingsOwnedKeys
});
const TOOL$2 = "claude";
const CLAUDE_MD_PATH = "CLAUDE.md";
const RULES_DIR = ".claude/rules";
const AGENTS_DIR$1 = ".claude/agents";
const CLAUDE_SKILLS_DIR = NATIVE_SKILL_DIRS[TOOL$2] ?? "";
const CLAUDE_COMMANDS_DIR = ".claude/commands";
const CLAUDE_SETTINGS_PATH = ".claude/settings.json";
function claudeSettingsOwnedKeys(manifest) {
	return isPluginOwned(manifest, TOOL$2, "hooks") ? ["permissions"] : ["permissions", "hooks"];
}
const CLAUDE_REVIEW_GATE_PATH = `${HOOKS_GENERATED_DIR}/${TOOL$2}/${REVIEW_GATE_FILE}`;
const CONFIG_CHANGE_EVENT = "ConfigChange";
const REVIEW_GATE_EVENTS = CLIENT_EXTENSION_EVENTS.filter((row) => row.tool === TOOL$2 && row.event !== CONFIG_CHANGE_EVENT).map((row) => row.event);
const TAMPER_NOTICE_SCRIPT_FILE = "stamity-config-tamper-notice.mjs";
const CLAUDE_GUARD_PATH = `${HOOKS_GENERATED_DIR}/${TOOL$2}/stamity-pre-tool-use-guard.mjs`;
const PROJECT_DIR_VARIABLE = "${CLAUDE_PROJECT_DIR}";
const GUARD_FAIL_CLOSED_TAIL = "|| { s=$?; [ \"$s\" -eq 2 ] && exit 2; echo 'stamity: the pre-tool-use guard could not run; run stamity sync' >&2; exit 2; }";
const ACCESS_DATE$1 = "2026-09-10";
const GUARD_MAP_ONLY_NAMES = /* @__PURE__ */ new Set(["Task", "Skill"]);
const SESSION_PREAPPROVED_CATEGORIES = /* @__PURE__ */ new Set(["read"]);
const CLAUDE_PERMISSION_ROWS = toClaudeToolsFrontmatter(AGENT_POLICY_ROSTER.flatMap((row) => row.allow).filter((category) => SESSION_PREAPPROVED_CATEGORIES.has(category))).split(", ").filter((name) => name !== "" && !GUARD_MAP_ONLY_NAMES.has(name));
const HOOK_GUARANTEE$1 = CLIENT_HOOK_GUARANTEES.find((row) => row.tool === TOOL$2);
const EFFORT_SCALE_CAP$2 = `${CLIENT_MODEL_PROJECTION.claude.effortScale.join(", ")} — the levels this client's \`effort:\` key accepts; available levels depend on the model, so a level the chosen model does not offer falls back to that model's own default (code.claude.com/docs/en/sub-agents, accessed 2026-09-17). A level below this scale is raised to \`low\` rather than dropped, and the emission discloses it`;
const CLAUDE_DIALECT_FACTS = {
	tool: TOOL$2,
	ruleShape: "`.claude/rules/<id>.md` with frontmatter `paths:` — a YAML glob list, matched when Claude reads a file; a rule with no `paths` is loaded unconditionally at launch, at CLAUDE.md priority. Also read by VS Code Copilot",
	hooksConfigPath: CLAUDE_SETTINGS_PATH,
	readsAgentsSkillsDir: false,
	agentsFormat: "`.claude/agents/<id>.md` — frontmatter (`name`, `description`, `tools:` comma list, `model:` alias or pinned id, `effort:` level) over a markdown system prompt",
	mcpDialect: "claude-json",
	entryFile: CLAUDE_MD_PATH,
	caps: [
		{
			name: "entry-file-budget",
			value: "~200-line CLAUDE.md working target; the bridge emits one managed import block, leaving the budget to the user"
		},
		{
			name: "permission-rows",
			value: String(CLAUDE_PERMISSION_ROWS.length)
		},
		{
			name: "hook-enforcement",
			value: HOOK_GUARANTEE$1 === void 0 ? "undeclared" : `${HOOK_GUARANTEE$1.failMode} — blocking exit code: ${HOOK_GUARANTEE$1.blockingExitCode ?? "none"}`
		},
		{
			name: "skills-access",
			value: CLAUDE_SKILLS_DIR === "" ? "no native location is declared for this client, so no copy is emitted and a skill is used by naming its `SKILL.md` path in the chat" : `native — the projection is copied to \`${CLAUDE_SKILLS_DIR}/<skill>/SKILL.md\`, this client's project-level skills location, so the client loads a skill when it is relevant and \`/<skill>\` invokes one directly`
		},
		{
			name: "command-surface",
			value: `native — one file per touchpoint command at \`${CLAUDE_COMMANDS_DIR}/<id>.md\`, invoked as \`/<id>\`; description-only frontmatter, so nothing is pre-approved that the permissions chain does not already grant`
		},
		{
			name: "review-gate",
			value: `work-scoped gate on \`${REVIEW_GATE_EVENTS.join("` + `")}\` — Claude-only extensions, non-portable. ${HOOK_GUARANTEE$1?.failMode ?? "undeclared"}: a completion with an open review round is refused, and the gate opens at the round cap so it can never wedge a run`
		},
		{
			name: "config-change-event",
			value: "`ConfigChange` tamper wiring — Claude-only extension, non-portable"
		},
		{
			name: "effort-scale",
			value: EFFORT_SCALE_CAP$2
		}
	],
	citations: [
		{
			url: "https://code.claude.com/docs/en/memory",
			accessDate: ACCESS_DATE$1
		},
		{
			url: "https://code.claude.com/docs/en/skills",
			accessDate: ACCESS_DATE$1
		},
		{
			url: "https://code.claude.com/docs/en/sub-agents",
			accessDate: ACCESS_DATE$1
		},
		{
			url: "https://code.claude.com/docs/en/hooks",
			accessDate: ACCESS_DATE$1
		},
		{
			url: "https://code.claude.com/docs/en/settings",
			accessDate: ACCESS_DATE$1
		}
	]
};
const HOOK_INFRA_ARTIFACT_IDS$3 = /* @__PURE__ */ new Set(["claude-review-gate"]);
const claudeResiduePlanner = {
	tool: TOOL$2,
	facts: CLAUDE_DIALECT_FACTS,
	async planResidue(core, ctx) {
		const items = await selectedItems$2(ctx);
		const render = bodyRenderers(ctx);
		const rows = [buildClaudeMd(ctx.engineVersion)];
		const skillsArePluginOwned = isPluginOwned(ctx.manifest, TOOL$2, "skill");
		const packSkillPaths = /* @__PURE__ */ new Set();
		for (const file of nativeSkillRows(core.skills, TOOL$2, core.demotedRules)) {
			if (skillsArePluginOwned) {
				if (file.origin !== "pack") continue;
				packSkillPaths.add(file.path);
			}
			rows.push({
				path: file.path,
				content: file.content,
				owner: owner$1(file.artifactId, file.artifactType)
			});
		}
		const demoted = core.demotedRules[TOOL$2];
		for (const item of items) if (item.type === "rule") {
			if (!demoted.has(item.id)) rows.push(buildRuleFile(item, render.rule));
		} else if (item.type === "command") rows.push(buildCommandFile(item, render.command));
		else rows.push(buildAgentFile$1(item, grantFor$2(item), modelFrontmatter(item, ctx), render.agent));
		rows.push({
			path: CLAUDE_SETTINGS_PATH,
			content: buildSettingsJson(core, ctx.facts.hookScriptsRoot, { hooks: !isPluginOwned(ctx.manifest, TOOL$2, "hooks") }),
			owner: owner$1("claude-settings", "infra")
		});
		rows.push(buildReviewGate(ctx));
		for (const emission of core.mcpFor(TOOL$2)) rows.push(mcpRow$1(emission));
		return { outputs: withoutPluginOwnedRows(ctx.manifest, TOOL$2, rows, HOOK_INFRA_ARTIFACT_IDS$3, packSkillPaths) };
	}
};
async function selectedItems$2(ctx) {
	const index = await buildContentIndex(ctx.contentRoot);
	const allowlist = buildSelectionAllowlist(ctx.manifest.selection);
	return index.items.filter((item) => item.type !== "skill" && index.byKey.get(typeIdKey(item.type, item.id)) === item && classifySelection(item, allowlist) !== "drop" && (item.tools === void 0 || item.tools.includes(TOOL$2)));
}
function grantFor$2(item) {
	const pack = item.provenance;
	return resolveAgentGrant({
		runtimeId: emittedId$1(item),
		frontmatter: item.frontmatter,
		...pack === void 0 ? {} : { declaredTools: grantableFootprint(pack.declaredTools) }
	});
}
function modelFrontmatter(item, ctx) {
	const modelClass = item.frontmatter["model_class"];
	if (typeof modelClass !== "string") return [];
	const models = ctx.manifest.models;
	const model = resolveModelValue(modelClass, TOOL$2, models?.pins);
	const effort = resolveEffortValue(modelClass, TOOL$2, models?.effort);
	return [...model === void 0 ? [] : [`model: ${yamlScalar$1(model)}`], ...effort === void 0 ? [] : [`effort: ${yamlScalar$1(effort)}`]];
}
function buildClaudeMd(engineVersion) {
	return {
		path: CLAUDE_MD_PATH,
		content: wrapInManagedBlock(`@${AGENTS_MD_FILE}`, CLAUDE_MD_PATH, engineVersion),
		owner: owner$1("claude-md-bridge", "infra")
	};
}
function buildRuleFile(item, render) {
	const globs = declaredGlobs$1(item);
	const head = [`description: ${yamlScalar$1(item.description)}`];
	if (globs.length > 0) head.push(`paths: [${globs.map((glob) => JSON.stringify(glob)).join(", ")}]`);
	return {
		path: `${RULES_DIR}/${emittedId$1(item)}.md`,
		content: frontmatterDocument$1(head, bodyOf$1(render(item.body))),
		owner: owner$1(item.id, item.type)
	};
}
function buildAgentFile$1(item, grant, model, render) {
	const tools = toClaudeToolsFrontmatter(grant.allow);
	const head = [
		`name: ${emittedId$1(item)}`,
		`description: ${yamlScalar$1(item.description)}`,
		`tools: ${tools === "" ? "\"\"" : tools}`,
		...model
	];
	return {
		path: `${AGENTS_DIR$1}/${emittedId$1(item)}.md`,
		content: frontmatterDocument$1(head, bodyOf$1(render(item.body))),
		owner: owner$1(item.id, item.type)
	};
}
function buildCommandFile(item, render) {
	return {
		path: `${CLAUDE_COMMANDS_DIR}/${emittedId$1(item)}.md`,
		content: frontmatterDocument$1([`description: ${yamlScalar$1(item.description)}`], bodyOf$1(render(item.body))),
		owner: owner$1(item.id, item.type)
	};
}
function buildReviewGate(ctx) {
	return {
		path: CLAUDE_REVIEW_GATE_PATH,
		content: buildReviewGateScript({
			statePath: REVIEW_GATE_STATE_FILE,
			maxIterations: readReviewCap(ctx.manifest),
			failMode: HOOK_GUARANTEE$1?.failMode ?? "fail-closed",
			layout: ctx.facts.hookScriptsRoot === void 0 ? "generated" : "container"
		}),
		owner: owner$1("claude-review-gate", "infra")
	};
}
function buildSettingsJson(core, hookScriptsRoot, emit = { hooks: true }) {
	if (!emit.hooks) return `${JSON.stringify({ permissions: { allow: CLAUDE_PERMISSION_ROWS } }, null, 2)}\n`;
	const rows = core.hooks.interchangeFor(TOOL$2);
	const reviewGate = hookScriptsRoot === void 0 ? CLAUDE_REVIEW_GATE_PATH : `${hookScriptsRoot}/${REVIEW_GATE_FILE}`;
	const hooks = {};
	for (const event of CANONICAL_HOOK_EVENTS) {
		const entries = rows.filter((row) => row.event === event).map(hookEntry);
		if (entries.length > 0) hooks[CLAUDE_EVENT_NAMES[event]] = entries;
	}
	const tamper = rows.find((row) => row.event === "session_start" && argvTail(row) === TAMPER_NOTICE_SCRIPT_FILE);
	if (tamper !== void 0) hooks[CONFIG_CHANGE_EVENT] = [hookEntry({
		event: tamper.event,
		command: tamper.command
	})];
	for (const event of REVIEW_GATE_EVENTS) hooks[event] = [{ hooks: [commandHook(["node", reviewGate])] }];
	return `${JSON.stringify({
		permissions: { allow: CLAUDE_PERMISSION_ROWS },
		hooks
	}, null, 2)}\n`;
}
function hookEntry(row) {
	return {
		...row.matcher === void 0 ? {} : { matcher: row.matcher },
		hooks: [commandHook(row.command, row.timeoutMs, failsClosedOnLaunchFailure(row))]
	};
}
function failsClosedOnLaunchFailure(row) {
	return row.event === "pre_tool_use" && row.command[1] === CLAUDE_GUARD_PATH;
}
function commandHook(argv, timeoutMs, failClosed = false) {
	const line = anchorScriptArgument(argv).map(shellWord).join(" ");
	return {
		type: "command",
		command: failClosed ? `${line} ${GUARD_FAIL_CLOSED_TAIL}` : line,
		...timeoutMs === void 0 ? {} : { timeout: Math.max(1, Math.ceil(timeoutMs / 1e3)) }
	};
}
function anchorScriptArgument(argv) {
	for (const [index, word] of argv.entries()) {
		if (index === 0) continue;
		const anchored = anchoredOnProjectDir(word);
		if (anchored !== void 0) return [
			...argv.slice(0, index),
			anchored,
			...argv.slice(index + 1)
		];
	}
	return argv;
}
function anchoredOnProjectDir(word) {
	if (word.startsWith("-")) return void 0;
	if (!word.includes("/") && !/\.[A-Za-z0-9]+$/.test(word)) return void 0;
	if (word.startsWith("/") || word.startsWith("~") || word.startsWith("$")) return void 0;
	if (word.startsWith("../") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(word)) return void 0;
	const anchored = `${PROJECT_DIR_VARIABLE}/${word}`;
	return ROOT_VARIABLE_PATH.test(anchored) ? anchored : void 0;
}
const SHELL_SAFE$1 = /^[A-Za-z0-9_@%+=:,./-]+$/;
function shellWord(word) {
	if (SHELL_SAFE$1.test(word)) return word;
	if (ROOT_VARIABLE_PATH.test(word)) return `"${word}"`;
	return `'${word.replaceAll("'", `'\\''`)}'`;
}
function argvTail(row) {
	const script = row.command[1] ?? "";
	return script.slice(script.lastIndexOf("/") + 1);
}
function bodyRenderers(ctx) {
	const detection = detectionContextFromManifest(ctx.manifest);
	const gates = verificationGatesFromManifest(ctx.manifest);
	const withGates = (raw) => substituteCanonicalPlatformMarker(substituteVerificationGateTokens(substituteRepoTokens(raw, detection), gates), TOOL$2);
	return {
		rule: (raw) => substituteCanonicalPlatformMarker(substituteRepoTokens(raw, detection), TOOL$2),
		agent: withGates,
		command: withGates
	};
}
function mcpRow$1(emission) {
	return {
		path: emission.path,
		content: emission.content,
		owner: owner$1(`mcp-${emission.dialect}`, "infra")
	};
}
function emittedId$1(item) {
	return emittedIdFor(item);
}
function owner$1(artifactId, artifactType) {
	return {
		adapter: TOOL$2,
		artifactId,
		artifactType
	};
}
function declaredGlobs$1(item) {
	return [...new Set(declaredRuleGlobs(item))];
}
function frontmatterDocument$1(lines, body) {
	return `---\n${lines.join("\n")}\n---\n\n${body}\n`;
}
function bodyOf$1(rendered) {
	return rendered.replace(/^(?:[ \t]*\r?\n)+/, "").replace(/(?:\r?\n[ \t]*)+$/, "");
}
function yamlScalar$1(value) {
	return JSON.stringify(value.replace(/\s*[\r\n]+\s*/g, " ").trim());
}
//#endregion
//#region src/pack/verifyInstalled.ts
var verifyInstalled_exports = /* @__PURE__ */ __exportAll({
	describePackIntegrityFinding: () => describePackIntegrityFinding,
	verifyInstalledPacks: () => verifyInstalledPacks
});
const READ_CONCURRENCY$5 = 8;
async function verifyInstalledPacks(rootDir, manifest) {
	const root = resolve(rootDir);
	const rows = manifest.ledger.filter((entry) => isPackOwner(entry.adapter) && entry.contentHash !== void 0);
	const results = await pLimit(READ_CONCURRENCY$5).map(rows, async (entry) => {
		const expected = entry.contentHash.toLowerCase();
		const actual = await hashIfPresent(join(root, ...entry.path.split("/")));
		if (actual === expected) return null;
		return {
			packId: entry.adapter.slice(5),
			relPath: entry.path,
			expected,
			actual
		};
	});
	return {
		checked: rows.length,
		findings: results.filter((finding) => finding !== null)
	};
}
async function hashIfPresent(absPath) {
	try {
		return createHash("sha256").update(await readFile(absPath)).digest("hex");
	} catch (cause) {
		const code = cause.code;
		if (code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR") return null;
		throw new EngineError(`Cannot read installed pack file ${absPath}: ${code ?? (cause instanceof Error ? cause.message : String(cause))}.`, {
			code: "FS_ERROR",
			cause
		});
	}
}
function describePackIntegrityFinding(finding) {
	const state = finding.actual === null ? "is missing from the repo" : `hashes to ${finding.actual.slice(0, 12)}…, not the ${finding.expected.slice(0, 12)}… the install recorded`;
	return `${finding.relPath} ${state} — installed pack "${finding.packId}" no longer matches what was verified at install. This is not regeneration drift: \`sync\` would carry the current bytes into the generated setup. Re-install the pack (\`clean --pack ${finding.packId}\`, then \`add\`) or restore the file.`;
}
//#endregion
//#region src/plugins/capabilityFile.ts
var capabilityFile_exports = /* @__PURE__ */ __exportAll({
	CAPABILITY_FILE: () => CAPABILITY_FILE,
	CAPABILITY_SCHEMA_VERSION: () => 1,
	CARRIABLE_CLASSES: () => CARRIABLE_CLASSES,
	PLUGIN_CAPABILITY_CLASSES: () => PLUGIN_CAPABILITY_CLASSES,
	PLUGIN_ROOT_VARIABLES: () => PLUGIN_ROOT_VARIABLES,
	carriedClasses: () => carriedClasses,
	invocationForms: () => invocationForms,
	readCapabilityFile: () => readCapabilityFile,
	resolvePluginRoot: () => resolvePluginRoot,
	uncarriableClasses: () => uncarriableClasses
});
const CAPABILITY_FILE = "stamity-plugin.json";
const PLUGIN_CAPABILITY_CLASSES = [...PLUGIN_OWNED_CLASSES, "mcp"];
const CLASS_STATUS_LIST = "carried, repository-owned or unsupported";
const CLASS_STATUSES = /* @__PURE__ */ new Set([
	"carried",
	"repository-owned",
	"unsupported"
]);
const TOP_KEYS = [
	"schemaVersion",
	"client",
	"version",
	"sourceCommit",
	"invocation",
	"clientFloor",
	"prerequisites",
	"classes",
	"runtime",
	"distribution"
];
const INVOCATION_NOTE_KEYS = /* @__PURE__ */ new Set(["citation"]);
const CLIENT_FLOOR_KEYS = [
	"version",
	"citation",
	"reason"
];
const CITATION_KEYS = ["url", "accessDate"];
const CLASS_KEYS = [
	"status",
	"count",
	"reason"
];
const RUNTIME_KEYS = [
	"path",
	"locator",
	"companion"
];
const COMPANION_KEYS = ["package", "compatible"];
const DISTRIBUTION_KEYS = ["note"];
const COMMIT_SHA = /^[0-9a-f]{40}$/;
function isPlainObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString$1(value) {
	return typeof value === "string" && value.length > 0;
}
function unsupportedKeys(value, supported, prefix) {
	return Object.keys(value).filter((key) => !supported.includes(key)).toSorted().map((key) => `${prefix}${key}: is not a key this engine understands`);
}
function checkString(value, path, requirement, defects) {
	if (!isNonEmptyString$1(value)) defects.push(`${path}: ${requirement}`);
}
function checkInvocation(value, defects) {
	if (!isPlainObject(value)) {
		defects.push("invocation: must be an object naming at least one invocation form");
		return;
	}
	if (Object.keys(value).every((key) => INVOCATION_NOTE_KEYS.has(key))) {
		defects.push("invocation: must be an object naming at least one invocation form");
		return;
	}
	for (const key of Object.keys(value).toSorted()) {
		const requirement = INVOCATION_NOTE_KEYS.has(key) ? "must be the note this key reserves: where the forms beside it were read from" : "must be the literal form an operator types";
		checkString(value[key], `invocation.${key}`, requirement, defects);
	}
}
function checkClientFloor(value, defects) {
	if (!isPlainObject(value)) {
		defects.push("clientFloor: must be an object carrying the client's version floor");
		return;
	}
	defects.push(...unsupportedKeys(value, CLIENT_FLOOR_KEYS, "clientFloor."));
	checkString(value.version, "clientFloor.version", "must be a version or the word unknown", defects);
	if (value.citation !== void 0) {
		if (!isPlainObject(value.citation)) defects.push("clientFloor.citation: must be an object carrying url and accessDate");
		else {
			defects.push(...unsupportedKeys(value.citation, CITATION_KEYS, "clientFloor.citation."));
			checkString(value.citation.url, "clientFloor.citation.url", "must be the vendor page the floor was read from", defects);
			checkString(value.citation.accessDate, "clientFloor.citation.accessDate", "must be the ISO date the page was read on", defects);
		}
	}
	if (value.reason !== void 0) checkString(value.reason, "clientFloor.reason", "must say why no floor is stated", defects);
}
function checkPrerequisites(value, defects) {
	if (!isPlainObject(value)) {
		defects.push("prerequisites: must be an object carrying node and git");
		return;
	}
	checkString(value.node, "prerequisites.node", "must be the Node floor the root needs", defects);
	if (value.git !== "optional" && value.git !== "required") defects.push("prerequisites.git: must be optional or required");
	for (const key of Object.keys(value).toSorted()) {
		if (key === "node" || key === "git") continue;
		checkString(value[key], `prerequisites.${key}`, "must be the command that installs the tool", defects);
	}
}
function checkClasses(value, defects) {
	if (!isPlainObject(value)) {
		defects.push(`classes: must be an object carrying one entry per class in ${PLUGIN_CAPABILITY_CLASSES.join(", ")}`);
		return;
	}
	defects.push(...unsupportedKeys(value, PLUGIN_CAPABILITY_CLASSES, "classes."));
	for (const name of PLUGIN_CAPABILITY_CLASSES) {
		const at = `classes.${name}`;
		const entry = value[name];
		if (!isPlainObject(entry)) {
			defects.push(`${at}: must declare a status of ${CLASS_STATUS_LIST}`);
			continue;
		}
		defects.push(...unsupportedKeys(entry, CLASS_KEYS, `${at}.`));
		if (typeof entry.status !== "string" || !CLASS_STATUSES.has(entry.status)) {
			defects.push(`${at}.status: must be ${CLASS_STATUS_LIST}`);
			continue;
		}
		if (entry.status === "carried") {
			if (!(typeof entry.count === "number" && Number.isSafeInteger(entry.count) && entry.count >= 0)) defects.push(`${at}.count: must be the number of files the root carries for a carried class`);
			continue;
		}
		if (!isNonEmptyString$1(entry.reason)) defects.push(`${at}.reason: must say why the class is not carried`);
	}
}
function checkRuntime(value, defects) {
	if (!isPlainObject(value)) {
		defects.push("runtime: must be an object carrying path, locator and companion");
		return;
	}
	defects.push(...unsupportedKeys(value, RUNTIME_KEYS, "runtime."));
	checkString(value.path, "runtime.path", "must be the directory the bundled runtime sits in", defects);
	checkString(value.locator, "runtime.locator", "must be the path of the locator script inside the root", defects);
	if (!isPlainObject(value.companion)) {
		defects.push("runtime.companion: must be an object carrying package and compatible");
		return;
	}
	defects.push(...unsupportedKeys(value.companion, COMPANION_KEYS, "runtime.companion."));
	checkString(value.companion.package, "runtime.companion.package", "must be the npm package a repository may install instead", defects);
	checkString(value.companion.compatible, "runtime.companion.compatible", "must be a range over the plugin version", defects);
}
function checkDistribution(value, defects) {
	if (!isPlainObject(value)) {
		defects.push("distribution: must be an object carrying a note, or be absent");
		return;
	}
	defects.push(...unsupportedKeys(value, DISTRIBUTION_KEYS, "distribution."));
	checkString(value.note, "distribution.note", "must state the route an organization serves this root through", defects);
}
function collectCapabilityErrors(value) {
	const defects = unsupportedKeys(value, TOP_KEYS, "");
	if (value.schemaVersion !== 1) defects.push(`schemaVersion: must be 1, the only schema this engine reads, not ${JSON.stringify(value.schemaVersion)}`);
	if (typeof value.client !== "string" || !VALID_TOOLS.has(value.client)) defects.push(`client: must be one of ${TOOLS.join(", ")}, not ${JSON.stringify(value.client)}`);
	if (typeof value.version !== "string" || semver.valid(value.version) === null) defects.push("version: must be the semver version this root was built at, such as 1.9.0");
	if (!(typeof value.sourceCommit === "string" && COMMIT_SHA.test(value.sourceCommit))) defects.push("sourceCommit: must be a 40-character lowercase hex commit sha");
	checkInvocation(value.invocation, defects);
	checkClientFloor(value.clientFloor, defects);
	checkPrerequisites(value.prerequisites, defects);
	checkClasses(value.classes, defects);
	checkRuntime(value.runtime, defects);
	if (value.distribution !== void 0) checkDistribution(value.distribution, defects);
	return defects;
}
async function readCapabilityFile(pluginRoot) {
	const file = join(pluginRoot, CAPABILITY_FILE);
	let raw;
	try {
		raw = await readFile(file, "utf8");
	} catch (cause) {
		const code = cause.code;
		throw new EngineError(`Cannot read the plugin capability file ${file}: ${code === "ENOENT" ? "no such file — the path is not a generated plugin root, or the root is incomplete" : `it could not be read (${String(code ?? "unknown error")})`}.`, {
			code: "CONFIG_ERROR",
			cause
		});
	}
	const parsed = parseJsonStrict(raw, file);
	const defects = collectCapabilityErrors(parsed);
	if (defects.length > 0) throw new EngineError(`The plugin capability file ${file} is not one this engine can read:\n` + defects.map((defect) => `  - ${defect}`).join("\n"), { code: "CONFIG_ERROR" });
	return parsed;
}
function carriedClasses(file) {
	return PLUGIN_OWNED_CLASSES.filter((name) => file.classes[name]?.status === "carried");
}
const CARRIABLE_CLASSES = {
	claude: [
		"agent",
		"skill",
		"command",
		"hooks"
	],
	cursor: [
		"agent",
		"skill",
		"command",
		"rule",
		"hooks"
	],
	copilot: [
		"agent",
		"skill",
		"command",
		"hooks"
	],
	codex: ["skill", "hooks"]
};
function uncarriableClasses(file) {
	const carriable = CARRIABLE_CLASSES[file.client];
	return carriedClasses(file).filter((name) => !carriable.includes(name));
}
function invocationForms(file) {
	return Object.fromEntries(Object.entries(file.invocation).filter(([key]) => !INVOCATION_NOTE_KEYS.has(key)));
}
const PLUGIN_ROOT_VARIABLES = [
	"CLAUDE_PLUGIN_ROOT",
	"CURSOR_PLUGIN_ROOT",
	"PLUGIN_ROOT",
	"COPILOT_PLUGIN_ROOT"
];
function namedRoot(value) {
	const trimmed = value?.trim() ?? "";
	return trimmed.length === 0 ? null : trimmed;
}
function resolvePluginRoot(opts) {
	const flagged = namedRoot(opts.flag);
	if (flagged !== null) return flagged;
	for (const variable of PLUGIN_ROOT_VARIABLES) {
		const found = namedRoot(opts.env[variable]);
		if (found !== null) return found;
	}
	return null;
}
//#endregion
//#region src/detect/packageManager.ts
var packageManager_exports = /* @__PURE__ */ __exportAll({ detectPackageManager: () => detectPackageManager });
const LOCKFILES = [
	{
		file: "pnpm-lock.yaml",
		name: "pnpm"
	},
	{
		file: "yarn.lock",
		name: "yarn"
	},
	{
		file: "bun.lock",
		name: "bun"
	},
	{
		file: "bun.lockb",
		name: "bun"
	},
	{
		file: "package-lock.json",
		name: "npm"
	},
	{
		file: "npm-shrinkwrap.json",
		name: "npm"
	}
];
const PACKAGE_MANAGER_NAMES = [
	"bun",
	"pnpm",
	"yarn",
	"npm"
];
const PIN_NAME = /^([a-z]+)(?:@|$)/;
async function detectPackageManager(rootDir) {
	const [pinned, lockfile] = await Promise.all([readPinnedName(rootDir), findLockfile(rootDir)]);
	return {
		name: pinned ?? lockfile?.name ?? "npm",
		lockfile: lockfile?.file ?? null,
		fromPackageJsonField: pinned !== null
	};
}
async function readPinnedName(rootDir) {
	const pin = (await readManifest(join(rootDir, "package.json")))?.packageManager;
	if (typeof pin !== "string") return null;
	const name = PIN_NAME.exec(pin.trim().toLowerCase())?.[1];
	if (name === void 0) return null;
	return PACKAGE_MANAGER_NAMES.includes(name) ? name : null;
}
async function findLockfile(rootDir) {
	return (await Promise.all(LOCKFILES.map(async (entry) => await isFile(join(rootDir, entry.file)) ? entry : null))).find((entry) => entry !== null) ?? null;
}
async function isFile(path) {
	try {
		return (await stat(path)).isFile();
	} catch (error) {
		if (typeof error.code === "string") return false;
		throw error;
	}
}
async function readManifest(path) {
	let raw;
	try {
		raw = await readFile(path, "utf8");
	} catch (error) {
		if (typeof error.code === "string") return null;
		throw error;
	}
	try {
		const parsed = JSON.parse(raw);
		return isPlainObject$2(parsed) ? parsed : null;
	} catch {
		return null;
	}
}
//#endregion
//#region src/detect/repoAnalyzer.ts
var repoAnalyzer_exports = /* @__PURE__ */ __exportAll({
	DETECTABLE_LANGUAGES: () => DETECTABLE_LANGUAGES,
	LANGUAGE_INDICATORS: () => LANGUAGE_INDICATORS,
	analyzeRepo: () => analyzeRepo,
	detectCIProviders: () => detectCIProviders,
	detectDataArtifacts: () => detectDataArtifacts,
	detectDockerfile: () => detectDockerfile,
	detectLanguages: () => detectLanguages,
	detectLinters: () => detectLinters,
	detectMonorepoPackages: () => detectMonorepoPackages,
	detectTestFrameworks: () => detectTestFrameworks,
	formatRepoSummary: () => formatRepoSummary,
	isGreenfield: () => isGreenfield,
	summarizeDetection: () => summarizeDetection
});
const LANGUAGE_INDICATORS = {
	typescript: [
		"tsconfig.json",
		"tsconfig.base.json",
		"tsconfig.app.json"
	],
	javascript: [
		"jsconfig.json",
		".babelrc",
		"babel.config.js",
		"babel.config.json"
	],
	python: [
		"pyproject.toml",
		"setup.py",
		"requirements.txt",
		"Pipfile",
		"setup.cfg",
		"tox.ini"
	],
	rust: ["Cargo.toml", "Cargo.lock"],
	go: ["go.mod", "go.sum"],
	java: ["pom.xml", "build.gradle"],
	kotlin: ["build.gradle.kts"],
	ruby: ["Gemfile", ".ruby-version"],
	php: ["composer.json", "artisan"],
	swift: ["Package.swift"],
	dart: ["pubspec.yaml"],
	elixir: ["mix.exs"],
	scala: ["build.sbt"],
	zig: ["build.zig"],
	ocaml: ["dune-project"],
	haskell: ["stack.yaml", "cabal.project"],
	clojure: ["deps.edn", "project.clj"],
	lua: [".luacheckrc", "rockspec"]
};
const DETECTABLE_LANGUAGES = [...Object.keys(LANGUAGE_INDICATORS), "csharp"];
const FRAMEWORK_CONFIG_INDICATORS = [
	{
		name: "next",
		files: [
			"next.config.js",
			"next.config.mjs",
			"next.config.ts"
		]
	},
	{
		name: "angular",
		files: ["angular.json"]
	},
	{
		name: "svelte",
		files: ["svelte.config.js", "svelte.config.ts"]
	},
	{
		name: "nuxt",
		files: ["nuxt.config.js", "nuxt.config.ts"]
	},
	{
		name: "astro",
		files: ["astro.config.mjs", "astro.config.ts"]
	}
];
const FRAMEWORK_DEP_INDICATORS = [
	{
		framework: "next",
		deps: ["next"]
	},
	{
		framework: "angular",
		deps: ["@angular/core"]
	},
	{
		framework: "sveltekit",
		deps: ["@sveltejs/kit"]
	},
	{
		framework: "svelte",
		deps: ["svelte"]
	},
	{
		framework: "nuxt",
		deps: ["nuxt"]
	},
	{
		framework: "remix",
		deps: ["@remix-run/react"]
	},
	{
		framework: "astro",
		deps: ["astro"]
	},
	{
		framework: "vue",
		deps: ["vue"]
	},
	{
		framework: "tanstack-start",
		deps: ["@tanstack/start", "@tanstack/react-start"]
	},
	{
		framework: "solid-start",
		deps: ["@solidjs/start", "solid-start"]
	},
	{
		framework: "qwik",
		deps: ["@builder.io/qwik", "@qwik.dev/core"]
	},
	{
		framework: "react",
		deps: ["react"]
	},
	{
		framework: "express",
		deps: ["express"]
	},
	{
		framework: "fastify",
		deps: ["fastify"]
	},
	{
		framework: "hono",
		deps: ["hono"]
	},
	{
		framework: "nestjs",
		deps: ["@nestjs/core"]
	}
];
const NON_JS_FRAMEWORK_INDICATORS = [
	{
		name: "django",
		files: ["manage.py"]
	},
	{
		name: "rails",
		files: [join("config", "routes.rb"), join("bin", "rails")]
	},
	{
		name: "laravel",
		files: ["artisan"]
	}
];
const NON_JS_FRAMEWORK_DEP_INDICATORS = [
	{
		framework: "fastapi",
		manifest: "pyproject.toml",
		deps: ["fastapi"]
	},
	{
		framework: "fastapi",
		manifest: "requirements.txt",
		deps: ["fastapi"]
	},
	{
		framework: "flask",
		manifest: "pyproject.toml",
		deps: ["flask", "Flask"]
	},
	{
		framework: "flask",
		manifest: "requirements.txt",
		deps: ["flask", "Flask"]
	},
	{
		framework: "axum",
		manifest: "Cargo.toml",
		deps: ["axum"]
	},
	{
		framework: "actix",
		manifest: "Cargo.toml",
		deps: ["actix-web", "actix_web"]
	},
	{
		framework: "phoenix",
		manifest: "mix.exs",
		deps: [":phoenix"]
	},
	{
		framework: "spring",
		manifest: "pom.xml",
		deps: ["spring-boot", "springframework.boot"]
	},
	{
		framework: "spring",
		manifest: "build.gradle",
		deps: ["spring-boot", "springframework.boot"]
	},
	{
		framework: "spring",
		manifest: "build.gradle.kts",
		deps: ["spring-boot", "springframework.boot"]
	}
];
const FRAMEWORK_SUPPRESSION = [
	["next", "react"],
	["remix", "react"],
	["tanstack-start", "react"],
	["nuxt", "vue"],
	["sveltekit", "svelte"]
];
const LINTER_INDICATORS = [
	{
		name: "eslint",
		files: [
			".eslintrc",
			".eslintrc.js",
			".eslintrc.json",
			".eslintrc.yml",
			".eslintrc.cjs",
			"eslint.config.js",
			"eslint.config.mjs",
			"eslint.config.ts"
		]
	},
	{
		name: "prettier",
		files: [
			".prettierrc",
			".prettierrc.js",
			".prettierrc.json",
			".prettierrc.yml",
			".prettierrc.cjs",
			"prettier.config.js",
			"prettier.config.mjs"
		]
	},
	{
		name: "biome",
		files: ["biome.json", "biome.jsonc"]
	},
	{
		name: "oxlint",
		files: [".oxlintrc.json"]
	},
	{
		name: "ruff",
		files: ["ruff.toml", ".ruff.toml"]
	},
	{
		name: "rubocop",
		files: [".rubocop.yml"]
	},
	{
		name: "golangci-lint",
		files: [
			".golangci.yml",
			".golangci.yaml",
			".golangci.toml",
			".golangci.json"
		]
	},
	{
		name: "clippy",
		files: [".clippy.toml", "clippy.toml"]
	},
	{
		name: "checkstyle",
		files: ["checkstyle.xml"]
	},
	{
		name: "stylelint",
		files: [
			".stylelintrc",
			".stylelintrc.json",
			".stylelintrc.yml",
			"stylelint.config.js"
		]
	},
	{
		name: "deno-lint",
		files: ["deno.json", "deno.jsonc"]
	}
];
const PYPROJECT_LINTER_SECTIONS = [{
	name: "ruff",
	section: "[tool.ruff"
}, {
	name: "black",
	section: "[tool.black]"
}];
const LINTER_MANIFEST_KEYS = [{
	name: "eslint",
	key: "eslintConfig"
}, {
	name: "prettier",
	key: "prettier"
}];
const TEST_FRAMEWORK_INDICATORS = [
	{
		name: "vitest",
		files: [
			"vitest.config.ts",
			"vitest.config.js",
			"vitest.config.mts"
		]
	},
	{
		name: "jest",
		files: [
			"jest.config.js",
			"jest.config.ts",
			"jest.config.mjs",
			"jest.config.json"
		]
	},
	{
		name: "mocha",
		files: [
			".mocharc.yml",
			".mocharc.json",
			".mocharc.js"
		]
	},
	{
		name: "pytest",
		files: ["pytest.ini", "conftest.py"]
	},
	{
		name: "rspec",
		files: [".rspec", join("spec", "spec_helper.rb")]
	},
	{
		name: "junit",
		files: [join("src", "test", "java")]
	},
	{
		name: "go-test",
		files: ["go.mod"]
	},
	{
		name: "cargo-test",
		files: ["Cargo.toml"]
	},
	{
		name: "phpunit",
		files: ["phpunit.xml", "phpunit.xml.dist"]
	},
	{
		name: "playwright",
		files: ["playwright.config.ts", "playwright.config.js"]
	},
	{
		name: "cypress",
		files: [
			"cypress.config.ts",
			"cypress.config.js",
			"cypress.json"
		]
	}
];
const TEST_MANIFEST_KEYS = [{
	name: "jest",
	key: "jest"
}];
const LINT_SCRIPT_FALLBACK = "lint-script";
const TEST_SCRIPT_FALLBACK = "test-script";
const ENGINE_EMITTED_WORKFLOWS = /* @__PURE__ */ new Set(["copilot-setup-steps.yml"]);
const WORKFLOW_EXTENSIONS = [".yml", ".yaml"];
const GITHUB_WORKFLOWS_DIR = join(".github", "workflows");
const CI_PROVIDER_INDICATORS = [
	{
		name: "gitlab-ci",
		files: [".gitlab-ci.yml"]
	},
	{
		name: "circleci",
		files: [join(".circleci", "config.yml")]
	},
	{
		name: "travis",
		files: [".travis.yml"]
	},
	{
		name: "jenkins",
		files: ["Jenkinsfile"]
	},
	{
		name: "azure-pipelines",
		files: ["azure-pipelines.yml"]
	},
	{
		name: "bitbucket-pipelines",
		files: ["bitbucket-pipelines.yml"]
	},
	{
		name: "buildkite",
		files: [join(".buildkite", "pipeline.yml")]
	},
	{
		name: "drone",
		files: [".drone.yml"]
	},
	{
		name: "woodpecker",
		files: [".woodpecker.yml", ".woodpecker"]
	}
];
const CONTAINER_INDICATORS = [
	"Dockerfile",
	"docker-compose.yml",
	"docker-compose.yaml",
	"compose.yml",
	"compose.yaml",
	".devcontainer",
	".devcontainer.json"
];
const AGENT_TOOL_INDICATORS = [
	{
		name: "claude",
		files: ["CLAUDE.md", ".claude"]
	},
	{
		name: "cursor",
		files: [".cursor"]
	},
	{
		name: "copilot",
		files: [join(".github", "copilot-instructions.md")]
	},
	{
		name: "codex",
		files: [".codex"]
	},
	{
		name: "agents",
		files: ["AGENTS.md", "AGENT.md"]
	}
];
const NON_PACKAGE_DIRS = /* @__PURE__ */ new Set(["node_modules"]);
async function analyzeRepo(rootDir) {
	const [languages, packageManager, frameworks, linters, testFrameworks, ciProviders, monorepoPackages, packageScripts, hasDockerfile, hasDataArtifacts, existingTools, hasOwnState] = await Promise.all([
		detectLanguages(rootDir),
		detectPackageManager(rootDir),
		detectFrameworks(rootDir),
		detectLinters(rootDir),
		detectTestFrameworks(rootDir),
		detectCIProviders(rootDir),
		detectMonorepoPackages(rootDir),
		detectPackageScripts(rootDir),
		detectDockerfile(rootDir),
		detectDataArtifacts(rootDir),
		presentIndicators(rootDir, AGENT_TOOL_INDICATORS),
		dirExists(join(rootDir, STATE_DIR))
	]);
	return {
		rootDir,
		languages,
		frameworks,
		linters,
		testFrameworks,
		ciProviders,
		...packageManager.lockfile !== null || packageManager.fromPackageJsonField ? { packageManager: packageManager.name } : {},
		...packageScripts === null ? {} : { packageScripts },
		monorepoPackages,
		hasDockerfile,
		hasDataArtifacts,
		hasExistingAgents: hasOwnState || existingTools.length > 0,
		existingTools
	};
}
function isGreenfield(info) {
	return info.languages.length === 0 && info.existingTools.length === 0;
}
async function detectLanguages(rootDir) {
	const [byConfig, rootEntries, nodeManifest] = await Promise.all([
		presentIndicators(rootDir, Object.entries(LANGUAGE_INDICATORS).map(([name, files]) => ({
			name,
			files
		}))),
		readDirEntries$2(rootDir),
		readJsonObject(join(rootDir, "package.json"))
	]);
	const found = new Set(byConfig);
	if (rootEntries.some((entry) => entry.isFile() && (entry.name.endsWith(".csproj") || entry.name.endsWith(".sln")))) found.add("csharp");
	const nodeFallback = nodeLanguage(nodeManifest, rootEntries, found);
	if (nodeFallback !== null) found.add(nodeFallback);
	return [...found];
}
const TYPESCRIPT_EXTENSIONS = [
	".ts",
	".tsx",
	".mts",
	".cts"
];
function nodeLanguage(manifest, rootEntries, alreadyFound) {
	if (manifest === null) return null;
	if (alreadyFound.has("typescript") || alreadyFound.has("javascript")) return null;
	const extensions = new Set(rootEntries.filter((entry) => entry.isFile()).map((entry) => entry.name.slice(entry.name.lastIndexOf("."))));
	return dependencyNames(manifest).has("typescript") || TYPESCRIPT_EXTENSIONS.some((extension) => extensions.has(extension)) ? "typescript" : "javascript";
}
async function detectMonorepoPackages(rootDir) {
	const patterns = await collectWorkspaceGlobs(rootDir);
	if (patterns.length === 0) return [];
	const exact = /* @__PURE__ */ new Set();
	const wildcardParents = /* @__PURE__ */ new Set();
	for (const pattern of patterns) {
		const normalized = normalizeGlob(pattern);
		if (normalized === null) continue;
		if (normalized.includes("*")) wildcardParents.add(wildcardFreePrefix(normalized));
		else exact.add(normalized);
	}
	const enumerated = await Promise.all([...wildcardParents].map((parent) => listChildDirectories(rootDir, parent)));
	const candidates = [.../* @__PURE__ */ new Set([...exact, ...enumerated.flat()])].toSorted(comparePaths);
	const resolved = await Promise.all(candidates.map(async (path) => {
		const dir = join(rootDir, path);
		const [physical, manifest] = await Promise.all([physicalPath(dir), readJsonObject(join(dir, "package.json"))]);
		return {
			path,
			physical,
			manifest
		};
	}));
	const seen = /* @__PURE__ */ new Set([await physicalPath(rootDir)]);
	const packages = [];
	for (const { path, physical, manifest } of resolved) {
		if (seen.has(physical)) continue;
		seen.add(physical);
		if (manifest === null) continue;
		const declared = manifest.name;
		const name = typeof declared === "string" && declared.length > 0 ? declared : basenameOf$1(path);
		packages.push({
			name,
			path
		});
	}
	return packages;
}
async function detectLinters(rootDir) {
	const [byConfig, manifest, pyproject] = await Promise.all([
		presentIndicators(rootDir, LINTER_INDICATORS),
		readJsonObject(join(rootDir, "package.json")),
		readText(join(rootDir, "pyproject.toml"))
	]);
	const detected = new Set(byConfig);
	for (const { name, section } of PYPROJECT_LINTER_SECTIONS) if (pyproject?.includes(section) === true) detected.add(name);
	if (manifest !== null) {
		for (const { name, key } of LINTER_MANIFEST_KEYS) if (manifest[key] !== void 0) detected.add(name);
		if (detected.size === 0 && hasWiredScript(manifest, "lint")) detected.add(LINT_SCRIPT_FALLBACK);
	}
	return [...detected];
}
async function detectTestFrameworks(rootDir) {
	const [byConfig, manifest] = await Promise.all([presentIndicators(rootDir, TEST_FRAMEWORK_INDICATORS), readJsonObject(join(rootDir, "package.json"))]);
	const detected = new Set(byConfig);
	if (manifest !== null) {
		for (const { name, key } of TEST_MANIFEST_KEYS) if (manifest[key] !== void 0) detected.add(name);
		if (detected.size === 0 && hasWiredScript(manifest, "test")) detected.add(TEST_SCRIPT_FALLBACK);
	}
	return [...detected];
}
async function detectCIProviders(rootDir) {
	const [githubActions, others] = await Promise.all([hasForeignWorkflow(rootDir), presentIndicators(rootDir, CI_PROVIDER_INDICATORS)]);
	return githubActions ? ["github-actions", ...others] : others;
}
async function hasForeignWorkflow(rootDir) {
	return (await readDirEntries$2(join(rootDir, GITHUB_WORKFLOWS_DIR))).some((entry) => entry.isFile() && WORKFLOW_EXTENSIONS.some((ext) => entry.name.toLowerCase().endsWith(ext)) && !ENGINE_EMITTED_WORKFLOWS.has(entry.name));
}
async function detectDockerfile(rootDir) {
	return anyExists(rootDir, CONTAINER_INDICATORS);
}
async function detectDataArtifacts(rootDir) {
	const [hasDataDir, entries] = await Promise.all([dirExists(join(rootDir, "data")), readDirEntries$2(rootDir)]);
	return hasDataDir || entries.some((entry) => entry.isFile() && (entry.name.endsWith(".csv") || entry.name.endsWith(".parquet")));
}
function formatRepoSummary(info) {
	const rows = [];
	const add = (label, values) => {
		if (values.length > 0) rows.push(`${label}: ${values.join(", ")}`);
	};
	add("Languages", info.languages);
	if (info.packageManager !== void 0) rows.push(`Package manager: ${info.packageManager}`);
	add("Frameworks", info.frameworks);
	add("Linters", info.linters);
	add("Test frameworks", info.testFrameworks);
	add("CI", info.ciProviders);
	if (info.monorepoPackages.length > 0) rows.push(`Workspace packages: ${summarizePackages(info.monorepoPackages)}`);
	add("Existing tool configs", info.existingTools);
	if (info.hasDockerfile) rows.push("Container build: yes");
	if (info.hasDataArtifacts) rows.push("Data artifacts: yes");
	return rows.length === 0 ? "No stack signals detected." : rows.join("\n");
}
function summarizePackages(packages) {
	const shown = packages.slice(0, 3).map((entry) => entry.path);
	const rest = packages.length - shown.length;
	const listed = rest > 0 ? `${shown.join(", ")}, +${rest} more` : shown.join(", ");
	return `${packages.length} (${listed})`;
}
async function detectFrameworks(rootDir) {
	const [byConfig, byNonJsConfig, manifest, manifestBodies] = await Promise.all([
		presentIndicators(rootDir, FRAMEWORK_CONFIG_INDICATORS),
		presentIndicators(rootDir, NON_JS_FRAMEWORK_INDICATORS),
		readJsonObject(join(rootDir, "package.json")),
		readNonJsManifests(rootDir)
	]);
	const detected = /* @__PURE__ */ new Set([...byConfig, ...byNonJsConfig]);
	const deps = dependencyNames(manifest);
	for (const row of FRAMEWORK_DEP_INDICATORS) if (row.deps.some((dep) => deps.has(dep))) detected.add(row.framework);
	for (const row of NON_JS_FRAMEWORK_DEP_INDICATORS) {
		const body = manifestBodies.get(row.manifest);
		if (body != null && row.deps.some((dep) => body.includes(dep))) detected.add(row.framework);
	}
	for (const [meta, base] of FRAMEWORK_SUPPRESSION) if (detected.has(meta)) detected.delete(base);
	return [...detected];
}
async function readNonJsManifests(rootDir) {
	const files = [...new Set(NON_JS_FRAMEWORK_DEP_INDICATORS.map((row) => row.manifest))];
	const bodies = await Promise.all(files.map((file) => readText(join(rootDir, file))));
	return new Map(files.map((file, index) => [file, bodies[index] ?? null]));
}
function dependencyNames(manifest) {
	const names = /* @__PURE__ */ new Set();
	for (const field of ["dependencies", "devDependencies"]) {
		const block = manifest?.[field];
		if (isPlainObject$2(block)) for (const name of Object.keys(block)) names.add(name);
	}
	return names;
}
async function detectPackageScripts(rootDir) {
	const manifest = await readJsonObject(join(rootDir, "package.json"));
	if (manifest === null) return null;
	const scripts = manifest["scripts"];
	return isPlainObject$2(scripts) ? Object.keys(scripts) : [];
}
function hasWiredScript(manifest, name) {
	const scripts = manifest.scripts;
	if (!isPlainObject$2(scripts)) return false;
	const script = scripts[name];
	return typeof script === "string" && script.trim().length > 0 && !/no test specified/i.test(script);
}
async function presentIndicators(rootDir, table) {
	const present = await Promise.all(table.map((row) => anyExists(rootDir, row.files)));
	return table.filter((_row, index) => present[index] === true).map((row) => row.name);
}
async function collectWorkspaceGlobs(rootDir) {
	const [workspaceYaml, manifest, lerna] = await Promise.all([
		readText(join(rootDir, "pnpm-workspace.yaml")),
		readJsonObject(join(rootDir, "package.json")),
		readJsonObject(join(rootDir, "lerna.json"))
	]);
	const workspaces = manifest?.workspaces;
	return [
		...stringList(workspaceYamlPackages(workspaceYaml)),
		...stringList(Array.isArray(workspaces) ? workspaces : nestedPackages(workspaces)),
		...stringList(lerna?.packages)
	];
}
function nestedPackages(value) {
	return isPlainObject$2(value) ? value.packages : null;
}
function workspaceYamlPackages(raw) {
	if (raw === null) return null;
	try {
		const document = parseYamlStrict(raw, "pnpm-workspace.yaml");
		return isPlainObject$2(document) ? document.packages : null;
	} catch (error) {
		if (error instanceof EngineError) return null;
		throw error;
	}
}
function stringList(value) {
	if (!Array.isArray(value)) return [];
	return value.filter((entry) => typeof entry === "string").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}
function normalizeGlob(pattern) {
	const unified = pattern.trim().replaceAll("\\", "/");
	if (unified.length === 0 || unified.startsWith("/") || unified.startsWith("!")) return null;
	const segments = unified.split("/").filter((segment) => segment !== "" && segment !== ".");
	if (segments.length === 0 || segments.includes("..")) return null;
	return segments.join("/");
}
function wildcardFreePrefix(pattern) {
	const segments = pattern.split("/");
	const wildcardAt = segments.findIndex((segment) => segment.includes("*"));
	return segments.slice(0, wildcardAt).join("/");
}
async function listChildDirectories(rootDir, parentRel) {
	const parent = parentRel.length > 0 ? join(rootDir, parentRel) : rootDir;
	const entries = await readDirEntries$2(parent);
	return (await Promise.all(entries.map(async (entry) => {
		if (entry.name.startsWith(".") || NON_PACKAGE_DIRS.has(entry.name)) return null;
		if (!(entry.isDirectory() || entry.isSymbolicLink() && await dirExists(join(parent, entry.name)))) return null;
		return parentRel.length > 0 ? `${parentRel}/${entry.name}` : entry.name;
	}))).filter((path) => path !== null);
}
async function physicalPath(path) {
	return probe$2(() => realpath(path), path);
}
function basenameOf$1(path) {
	return path.split("/").findLast((segment) => segment.length > 0) ?? path;
}
function comparePaths(a, b) {
	return a < b ? -1 : a > b ? 1 : 0;
}
async function probe$2(read, fallback) {
	try {
		return await read();
	} catch (error) {
		if (typeof error.code === "string") return fallback;
		throw error;
	}
}
async function anyExists(rootDir, relatives) {
	return (await Promise.all(relatives.map((relative) => pathExists$3(join(rootDir, relative))))).includes(true);
}
async function pathExists$3(path) {
	return probe$2(async () => {
		await stat(path);
		return true;
	}, false);
}
async function dirExists(path) {
	return probe$2(async () => (await stat(path)).isDirectory(), false);
}
async function readDirEntries$2(path) {
	return probe$2(() => readdir(path, { withFileTypes: true }), []);
}
async function readText(path) {
	return probe$2(() => readFile(path, "utf8"), null);
}
async function readJsonObject(path) {
	const raw = await readText(path);
	if (raw === null) return null;
	try {
		const parsed = JSON.parse(raw);
		return isPlainObject$2(parsed) ? parsed : null;
	} catch {
		return null;
	}
}
function summarizeDetection(info) {
	return {
		languages: [...info.languages],
		linters: [...info.linters],
		testFrameworks: [...info.testFrameworks],
		ciProviders: [...info.ciProviders],
		...info.packageManager === void 0 ? {} : { packageManager: info.packageManager },
		...info.packageScripts === void 0 ? {} : { packageScripts: [...info.packageScripts] }
	};
}
//#endregion
//#region src/manifest/ledger.ts
var ledger_exports = /* @__PURE__ */ __exportAll({
	assertLedgerContainment: () => assertLedgerContainment,
	computeReclaimCandidates: () => computeReclaimCandidates,
	diffLedgers: () => diffLedgers,
	ledgerUnionPaths: () => ledgerUnionPaths,
	ownersOfPath: () => ownersOfPath,
	replaceAdapterEntries: () => replaceAdapterEntries,
	toLedgerEntries: () => toLedgerEntries,
	trustedInfraPaths: () => trustedInfraPaths
});
function rowKey(entry) {
	return `${entry.adapter}\u0000${entry.path}`;
}
function artifactKey(entry) {
	return `${entry.adapter}\u0000${entry.artifactId}`;
}
function cloneEntry$1(entry) {
	return {
		path: entry.path,
		adapter: entry.adapter,
		artifactId: entry.artifactId,
		artifactType: entry.artifactType,
		...entry.contentHash !== void 0 ? { contentHash: entry.contentHash } : {},
		...entry.stampedVersion !== void 0 ? { stampedVersion: entry.stampedVersion } : {}
	};
}
function byPath(a, b) {
	if (a.path < b.path) return -1;
	if (a.path > b.path) return 1;
	return 0;
}
function toLedgerEntries(emitted) {
	return emitted.map(cloneEntry$1);
}
function replaceAdapterEntries(ledger, adapter, entries) {
	return [...ledger.filter((entry) => entry.adapter !== adapter), ...entries].map(cloneEntry$1).toSorted(byPath);
}
function ledgerUnionPaths(ledger) {
	return new Set(ledger.map((entry) => entry.path));
}
function trustedInfraPaths(ledger) {
	return new Set(ledger.filter((entry) => entry.artifactType === "infra").map((entry) => entry.path.startsWith("./") ? entry.path.slice(2) : entry.path));
}
function diffLedgers(prev, next) {
	const prevKeys = new Set(prev.map(rowKey));
	const nextKeys = new Set(next.map(rowKey));
	const added = [];
	const retained = [];
	for (const entry of next) (prevKeys.has(rowKey(entry)) ? retained : added).push(cloneEntry$1(entry));
	return {
		added,
		removed: prev.filter((entry) => !nextKeys.has(rowKey(entry))).map(cloneEntry$1),
		retained
	};
}
function computeReclaimCandidates(ledger, currentEmission, activeAdapters) {
	const survivingArtifacts = new Set(ledger.filter((entry) => currentEmission.has(entry.path)).map(artifactKey));
	const candidates = [];
	for (const entry of ledger) {
		const owner = entry.adapter;
		if (isPackOwner(owner)) continue;
		if (currentEmission.has(entry.path)) continue;
		let reason;
		if (!activeAdapters.has(owner)) reason = "adapter-removed";
		else if (survivingArtifacts.has(artifactKey(entry))) reason = "path-renamed";
		else reason = "deselected";
		candidates.push({
			entry: cloneEntry$1(entry),
			reason
		});
	}
	return candidates;
}
const WINDOWS_ABSOLUTE_PATTERN$2 = /^(?:[A-Za-z]:|\\\\)/;
function containmentDefect(path) {
	if (path === "") return "is empty";
	if (path.includes("\0")) return "contains a NUL byte";
	if (path.startsWith("/") || path.startsWith("\\")) return "is an absolute path";
	if (WINDOWS_ABSOLUTE_PATTERN$2.test(path)) return "is an absolute path";
	if (path.includes("\\")) return "uses a backslash separator (ledger paths are POSIX)";
	if (path.split("/").includes("..")) return "climbs toward the repo root with a `..` segment";
	return null;
}
function assertLedgerContainment(ledger, rootDir) {
	const defects = [];
	for (const [index, entry] of ledger.entries()) {
		const defect = containmentDefect(entry.path);
		if (defect !== null) defects.push(`\`ledger[${index}].path\` ${JSON.stringify(entry.path)} ${defect}`);
	}
	if (defects.length > 0) throw new EngineError(`Ledger containment check failed for the repo at ${rootDir}: ${defects.join("; ")}. A ledger row authorises the reclaim sweep to act on its path, so every path must be repo-relative POSIX with no \`..\` segment. Fix or drop the row(s) named above.`, { code: "VALIDATION_ERROR" });
}
function ownersOfPath(ledger, path) {
	return ledger.filter((entry) => entry.path === path).map(cloneEntry$1);
}
//#endregion
//#region src/merge/safeWrite.ts
var safeWrite_exports = /* @__PURE__ */ __exportAll({
	backupBeforeOverwrite: () => backupBeforeOverwrite,
	displayPath: () => displayPath,
	hasLedgerDrift: () => hasLedgerDrift,
	isManagedPath: () => isManagedPath,
	ledgerHashIndex: () => ledgerHashIndex,
	ledgerPathSet: () => ledgerPathSet,
	predictDenyRefusal: () => predictDenyRefusal,
	predictMergeAction: () => predictMergeAction,
	predictPreservedContentRefusal: () => predictPreservedContentRefusal,
	readPrefixFrontmatterField: () => readPrefixFrontmatterField,
	safeWriteFile: () => safeWriteFile,
	toLedgerKey: () => toLedgerKey
});
function atomicOptions(boundaryDir) {
	return boundaryDir === void 0 ? void 0 : { boundaryDir };
}
function errnoCode$2(err) {
	const code = err?.code;
	return typeof code === "string" ? code : void 0;
}
function describeError$4(err) {
	return err instanceof Error ? err.message : String(err);
}
async function readIfExists$1(filePath) {
	try {
		return await readFile(filePath, "utf-8");
	} catch (err) {
		if (errnoCode$2(err) !== "ENOENT") throw err;
		return null;
	}
}
async function entryStat(filePath) {
	try {
		return await lstat(filePath);
	} catch (err) {
		throw mapFsErrno(err, filePath) ?? err;
	}
}
function blockingDenyHits$1(userContent) {
	const stripped = userContent.replace(INVISIBLE_SMUGGLING_CHARS, "");
	const folded = foldConfusables(stripped);
	const joined = joinMaskedWords(folded);
	const scanned = [
		...scanForDeniedPatterns(stripped),
		...folded === stripped ? [] : scanForDeniedPatterns(folded),
		...joined === folded ? [] : scanForDeniedPatterns(joined),
		...scanForDeniedPatterns(userContent, INJECTION_PATTERNS).filter((hit) => NO_HONEST_SHAPE_INJECTION_ROWS.has(hit.patternId))
	];
	const seen = /* @__PURE__ */ new Set();
	const hits = [];
	for (const hit of scanned.filter((candidate) => candidate.severity === "block")) {
		const key = `${hit.patternId}\u0000${hit.index}`;
		if (seen.has(key)) continue;
		seen.add(key);
		hits.push(hit);
	}
	return hits.toSorted(byIndexThenId);
}
function denyRefusalMessage(filePath, userContent) {
	const hits = blockingDenyHits$1(userContent);
	if (hits.length === 0) return null;
	const findings = hits.map((hit) => `${hit.patternId} at offset ${hit.index} (${JSON.stringify(hit.snippet)})`).join("; ");
	return `Refusing to write ${filePath}: ${hits.length} prompt-injection pattern(s) found in the content outside the managed block, which this write would preserve next to engine-authored output: ${findings}. Remove or rewrite the flagged text, then re-run. Do not move it inside the STAMITY:BEGIN/END markers — the managed block is regenerated on every sync, which deletes whatever is placed inside it.`;
}
function refuseMergeIntoLink(filePath) {
	return new EngineError(`Refusing to merge into ${filePath}: it is a symbolic link, so the content this merge would keep beside the generated block is not this file's — it is whatever the link points at, including a file outside this tree that was never yours to publish. Merging would write those bytes into the tree as a regular file, where the next commit picks them up. Nothing was written. Replace the link with a regular file, or delete it and re-run to regenerate the file.`, { code: "FS_ERROR" });
}
function refuseMergeIntoSharedFile(filePath) {
	return new EngineError(`Refusing to merge into ${filePath}: it is a hard link — this file shares its contents with another name, which this tree cannot see and which may sit outside it, so the content this merge would keep beside the generated block is not this file's alone. Git reads a hard link as an ordinary file, so these bytes are already committable under this name; what merging adds is a rewrite of them as a fresh independent file, so this name stops being the same file as the other one and starts being a copy of it. Nothing was written. Replace it with a regular file before syncing — copy the contents to a new file and move that over this name — or delete it and re-run to regenerate the file.`, { code: "FS_ERROR" });
}
async function refusePreservedContent(filePath, userContent) {
	const entry = await entryStat(filePath);
	if (entry.isSymbolicLink()) throw refuseMergeIntoLink(filePath);
	if (isSharedRegularFile(entry)) throw refuseMergeIntoSharedFile(filePath);
	const message = denyRefusalMessage(filePath, userContent);
	if (message !== null) throw new EngineError(message, { code: "INTEGRITY_ERROR" });
}
async function predictPreservedContentRefusal(filePath) {
	const existing = await readIfExists$1(filePath);
	if (existing === null) return null;
	const entry = await entryStat(filePath);
	if (entry.isSymbolicLink()) return null;
	if (isSharedRegularFile(entry)) return {
		kind: "shared-name",
		message: refuseMergeIntoSharedFile(filePath).message
	};
	const message = denyRefusalMessage(filePath, extractCustomContent(existing, filePath));
	return message === null ? null : {
		kind: "deny-scan",
		message
	};
}
async function predictDenyRefusal(filePath) {
	return (await predictPreservedContentRefusal(filePath))?.message ?? null;
}
function prependManagedBlock(incoming, existingContent) {
	const tail = existingContent.trimStart();
	const joined = tail === "" ? incoming.trim() : [
		incoming.trim(),
		"",
		tail
	].join("\n");
	return joined.endsWith("\n") ? joined : `${joined}\n`;
}
function stripBlockVersionStamp(content, filePath) {
	const split = splitAtManagedBlock(content, filePath);
	if (split === null) return content;
	const nlIdx = split.block.indexOf("\n");
	if (nlIdx === -1) return content;
	const bare = getMarkersForPath(filePath).start;
	return `${split.before}${bare}${split.block.slice(nlIdx)}${split.after}`;
}
function isMergeUnchanged(existingContent, merged, filePath, version) {
	if (merged === existingContent) return true;
	if (version === void 0) return false;
	if (isManagedBlockStale(existingContent, version, filePath)) return false;
	if (wouldChangeMarkerVariant(existingContent, filePath)) return false;
	return stripBlockVersionStamp(merged, filePath) === stripBlockVersionStamp(existingContent, filePath);
}
function terminateHealablePrefix(existingContent, filePath) {
	const base = existingContent.endsWith("\n") ? existingContent : `${existingContent}\n`;
	for (const variant of MANAGED_BLOCK_VARIANTS) {
		const candidate = `${base}${variant.end}\n`;
		if (!hasManagedBlock(candidate, filePath)) continue;
		try {
			insertManagedBlock(candidate, "", filePath);
		} catch {
			continue;
		}
		return candidate;
	}
	return null;
}
function predictMergeAction(existingContent, incoming, options = {}, filePath) {
	const skipIfUnchanged = options.skipIfUnchanged ?? true;
	if (existingContent === null) return "created";
	if (options.managedContent !== void 0) {
		if (!hasManagedBlock(existingContent, filePath)) {
			if (isHealableManagedPrefix(existingContent)) return "updated";
			if (options.appendIfNoBlock !== true) return "skipped";
			const prepended = prependManagedBlock(incoming, existingContent);
			return skipIfUnchanged && prepended === existingContent ? "unchanged" : "updated";
		}
		let merged;
		try {
			merged = insertManagedBlock(existingContent, options.managedContent, filePath, options.version);
		} catch {
			return "updated";
		}
		return skipIfUnchanged && isMergeUnchanged(existingContent, merged, filePath, options.version) ? "unchanged" : "updated";
	}
	if (skipIfUnchanged && incoming === existingContent) return "unchanged";
	return isManagedPath(filePath ?? "", options.ledgerPaths, existingContent) || options.force === true ? "updated" : "skipped";
}
function toLedgerKey(filePath) {
	return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}
function displayPath(filePath, boundaryDir) {
	if (boundaryDir === void 0) return filePath;
	const rel = relative(boundaryDir, filePath);
	if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return filePath;
	return rel.split(sep).join("/");
}
function isManagedPath(filePath, ledgerPaths, existingContent) {
	if (ledgerPaths?.has(toLedgerKey(filePath)) === true) return true;
	return existingContent !== void 0 && existingContent !== null && hasManagedBlock(existingContent, filePath);
}
function ledgerKeyUnder(rootDir, path) {
	return toLedgerKey(join(rootDir, ...path.split("/")));
}
function ledgerPathSet(rootDir, paths) {
	return new Set(paths.map((path) => ledgerKeyUnder(rootDir, path)));
}
function ledgerHashIndex(rootDir, rows) {
	const index = /* @__PURE__ */ new Map();
	for (const row of rows) {
		if (row.contentHash === void 0) continue;
		const key = ledgerKeyUnder(rootDir, row.path);
		const hashes = index.get(key) ?? /* @__PURE__ */ new Set();
		hashes.add(row.contentHash);
		index.set(key, hashes);
	}
	return index;
}
function hasLedgerDrift(filePath, existingContent, ledgerHashes) {
	const recorded = ledgerHashes?.get(toLedgerKey(filePath));
	if (recorded === void 0) return false;
	if (recorded.has(ledgerHash(existingContent))) return false;
	const folded = existingContent.replaceAll("\r\n", "\n");
	return folded === existingContent || !recorded.has(ledgerHash(folded));
}
function ledgerHash(content) {
	return createHash("sha256").update(content).digest("hex");
}
function readPrefixFrontmatterField(content, field) {
	const lines = content.split("\n");
	let open = 0;
	while (open < lines.length && (lines[open] ?? "").trim() === "") open++;
	if ((lines[open] ?? "").trim() !== "---") return null;
	let close = open + 1;
	while (close < lines.length && (lines[close] ?? "").trim() !== "---") close++;
	if (close >= lines.length) return null;
	const fieldRe = new RegExp(`^${field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*(.+)$`);
	for (let i = open + 1; i < close; i++) {
		const value = fieldRe.exec((lines[i] ?? "").replace(/\r$/, ""))?.[1]?.trim();
		if (value !== void 0 && value !== "") return value;
	}
	return null;
}
const BAK_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;
function refuseBackupOfLink(filePath) {
	return new EngineError(`Refusing to back up ${filePath}: it is a symbolic link, so the backup would copy whatever the link points at into this directory rather than the file's own contents — including a file outside this tree that was never yours to publish. Nothing was written. Replace the link with a regular file, or delete it and re-run to regenerate the file.`, { code: "FS_ERROR" });
}
function refuseBackupOfSharedFile(filePath) {
	return new EngineError(`Refusing to back up ${filePath}: it is a hard link — this file shares its contents with another name, which this tree cannot see and which may sit outside it, so the backup would copy bytes that are not this file's alone into this directory, where the next commit picks them up. Nothing was written. Replace it with a regular file before syncing — copy the contents to a new file and move that over this name — or delete it and re-run to regenerate the file.`, { code: "FS_ERROR" });
}
const BAK_COLLISION_ERRNOS = /* @__PURE__ */ new Set(["EEXIST", "ELOOP"]);
function refuseBackupDestination(filePath, bakPath, code, err) {
	return new EngineError(`Cannot back up ${filePath}: the backup destination ${bakPath} could not be created (${code}) — another entry now stands at that name, or a symbolic link does. Nothing was overwritten. Remove or rename ${bakPath} and re-run.`, {
		code: "FS_ERROR",
		cause: err
	});
}
async function backupBeforeOverwrite(filePath, existingContent, operation, boundaryDir) {
	const source = await entryStat(filePath);
	if (source.isSymbolicLink()) throw refuseBackupOfLink(filePath);
	if (isSharedRegularFile(source)) throw refuseBackupOfSharedFile(filePath);
	const bakPath = await resolveNonClobberingBakPath(filePath);
	await assertWriteTargetContained(bakPath, boundaryDir);
	try {
		const handle = await open(bakPath, BAK_FLAGS, source.mode & 511);
		try {
			await handle.writeFile(existingContent, "utf-8");
		} finally {
			await handle.close();
		}
	} catch (err) {
		const code = errnoCode$2(err) ?? "";
		if (BAK_COLLISION_ERRNOS.has(code)) throw refuseBackupDestination(filePath, bakPath, code, err);
		throw mapFsErrno(err, bakPath) ?? err;
	}
	await verifyBackup(filePath, bakPath, existingContent, operation);
	return bakPath;
}
async function safeWriteFile(filePath, content, options = {}) {
	filePath = resolve(filePath);
	await assertWriteTargetContained(filePath, options.boundaryDir);
	try {
		await mkdir(dirname(filePath), { recursive: true });
	} catch (err) {
		throw mapFsErrno(err, filePath) ?? err;
	}
	const release = await acquireWriteLock(filePath, options.boundaryDir);
	try {
		return await safeWriteFileLocked(filePath, content, options);
	} finally {
		try {
			await release();
		} catch (releaseErr) {
			console.error(`Failed to release the write lock on ${filePath}: ${describeError$4(releaseErr)}`);
		}
	}
}
async function safeWriteFileLocked(filePath, content, options) {
	const skipIfUnchanged = options.skipIfUnchanged ?? true;
	const writeOpts = atomicOptions(options.boundaryDir);
	const existingContent = await readIfExists$1(filePath);
	if (existingContent === null) {
		await atomicWriteFileUnlocked(filePath, content, writeOpts);
		return {
			path: filePath,
			action: "created"
		};
	}
	if (options.managedContent !== void 0) return await mergeManagedContent(filePath, content, existingContent, options, options.managedContent, skipIfUnchanged);
	if (skipIfUnchanged && content === existingContent) return {
		path: filePath,
		action: "unchanged"
	};
	const managed = isManagedPath(filePath, options.ledgerPaths, existingContent);
	if (!managed && options.force !== true) return {
		path: filePath,
		action: "skipped",
		warning: `Skipped ${filePath}: it already exists with different content and the engine cannot prove it wrote it — the file is in no ownership ledger and carries no STAMITY:BEGIN/END markers, so a matching filename is not enough to claim it. It was left untouched. Re-run with force to overwrite it (the existing file is backed up first), or delete it and re-run.`
	};
	const drifted = managed && hasLedgerDrift(filePath, existingContent, options.ledgerHashes);
	if (managed && !drifted || options.backup === false) {
		await atomicWriteFileUnlocked(filePath, content, writeOpts);
		return {
			path: filePath,
			action: "updated"
		};
	}
	const bakPath = await backupBeforeOverwrite(filePath, existingContent, drifted ? "drifted overwrite" : "force overwrite", options.boundaryDir);
	await atomicWriteFileUnlocked(filePath, content, writeOpts);
	return {
		path: filePath,
		action: "updated",
		warning: drifted ? `Overwrote ${displayPath(filePath, options.boundaryDir)}: the engine owns this file, but its contents no longer match what it last wrote there — it was edited by hand since. This output is written whole rather than merged, so the file was regenerated in full. Your previous file is at ${bakPath}. To keep the change, move it into the source the engine generates from.` : `Force-overwrote ${filePath}: it carries no STAMITY:BEGIN/END markers, so the whole file was replaced with generated output. Your previous file is at ${bakPath}.`
	};
}
async function mergeManagedContent(filePath, content, existingContent, options, managedContent, skipIfUnchanged) {
	const writeOpts = atomicOptions(options.boundaryDir);
	if (!hasManagedBlock(existingContent, filePath)) {
		if (isHealableManagedPrefix(existingContent)) return await repairTruncatedBlock(filePath, content, existingContent, managedContent, options.version, writeOpts);
		if (options.appendIfNoBlock !== true) return {
			path: filePath,
			action: "skipped",
			warning: `Skipped ${filePath}: its STAMITY:BEGIN/END markers are missing, so there is nowhere to merge generated content without guessing which bytes are yours. Restore the markers around the generated section, or move your content elsewhere and re-run.`
		};
		await refusePreservedContent(filePath, existingContent);
		const prepended = prependManagedBlock(content, existingContent);
		if (skipIfUnchanged && prepended === existingContent) return {
			path: filePath,
			action: "unchanged"
		};
		await atomicWriteFileUnlocked(filePath, prepended, writeOpts);
		if (!(options.ledgerPaths?.has(toLedgerKey(filePath)) === true)) return {
			path: filePath,
			action: "updated",
			notice: `adopted ${displayPath(filePath, options.boundaryDir)}: it is now a co-owned file — generated content sits inside STAMITY:BEGIN/END markers at the top and every byte you had is preserved below them. Edit freely outside the markers; the block is rewritten on each sync.`
		};
		return {
			path: filePath,
			action: "updated",
			warning: `Restored the managed block in ${displayPath(filePath, options.boundaryDir)}: this file is engine-owned and its STAMITY:BEGIN/END markers were absent, so generated content was prepended and your existing content preserved below it. To detach this file from the engine, remove it from the manifest instead of deleting the markers.`
		};
	}
	await refusePreservedContent(filePath, extractCustomContent(existingContent, filePath));
	const variantChanged = wouldChangeMarkerVariant(existingContent, filePath);
	let merged;
	try {
		merged = insertManagedBlock(existingContent, managedContent, filePath, options.version);
	} catch (mergeErr) {
		const bakPath = await backupBeforeOverwrite(filePath, existingContent, "block repair", options.boundaryDir);
		await atomicWriteFileUnlocked(filePath, content, writeOpts);
		return {
			path: filePath,
			action: "updated",
			warning: `Rebuilt ${filePath}: its STAMITY:BEGIN/END markers were structurally corrupted (${describeError$4(mergeErr)}), so the file was regenerated from the corpus. Your previous file, including anything outside the markers, is at ${bakPath}.`
		};
	}
	if (skipIfUnchanged && isMergeUnchanged(existingContent, merged, filePath, options.version)) return {
		path: filePath,
		action: "unchanged"
	};
	await atomicWriteFileUnlocked(filePath, merged, writeOpts);
	if (!variantChanged) return {
		path: filePath,
		action: "updated"
	};
	return {
		path: filePath,
		action: "updated",
		warning: `Rewrote the marker syntax in ${filePath}: its STAMITY:BEGIN/END markers used a comment style this file type cannot parse and were replaced with the matching one. Your content outside the block is unchanged.`
	};
}
async function repairTruncatedBlock(filePath, content, existingContent, managedContent, version, writeOpts) {
	const terminated = terminateHealablePrefix(existingContent, filePath);
	if (terminated === null) {
		await refusePreservedContent(filePath, extractCustomContent(existingContent, filePath));
		const bakPath = await backupBeforeOverwrite(filePath, existingContent, "block repair", writeOpts?.boundaryDir);
		await atomicWriteFileUnlocked(filePath, content, writeOpts);
		return {
			path: filePath,
			action: "updated",
			warning: `Rebuilt ${filePath}: it opens a STAMITY:BEGIN marker that no END marker can close without duplicating one the file already carries, so the file was regenerated from the corpus instead of repaired. Your previous file, including anything outside the markers, is at ${bakPath}.`
		};
	}
	await refusePreservedContent(filePath, extractCustomContent(terminated, filePath));
	const merged = insertManagedBlock(terminated, managedContent, filePath, version);
	const bakPath = await backupBeforeOverwrite(filePath, existingContent, "block repair", writeOpts?.boundaryDir);
	await atomicWriteFileUnlocked(filePath, merged, writeOpts);
	return {
		path: filePath,
		action: "updated",
		warning: `Repaired the managed block in ${filePath}: its STAMITY:BEGIN marker had no closing STAMITY:END, so the block was rewritten and terminated. Content above the marker was kept; your previous file is at ${bakPath}.`
	};
}
//#endregion
//#region src/manifest/mcpFilter.ts
var mcpFilter_exports = /* @__PURE__ */ __exportAll({
	describeValue: () => describeValue$1,
	filterMcpJsonOnDisk: () => filterMcpJsonOnDisk,
	filterMcpServers: () => filterMcpServers,
	jsonDocument: () => jsonDocument$1,
	materializeUserMcpJson: () => materializeUserMcpJson,
	parseMcpJsonDocument: () => parseMcpJsonDocument,
	planUserMcpJson: () => planUserMcpJson,
	predictMcpMergeRefusal: () => predictMcpMergeRefusal,
	readFailure: () => readFailure$1,
	readTextOrNull: () => readTextOrNull$1,
	reduceMcpDocumentToUserContent: () => reduceMcpDocumentToUserContent
});
const SERVER_KEYS = ["mcpServers", "servers"];
const SERVER_KEY_SET = new Set(SERVER_KEYS);
const INPUTS_KEY = "inputs";
const INPUT_REFERENCE = /\$\{input:([^}]+)\}/g;
function serversKeysOf(doc) {
	return SERVER_KEYS.filter((key) => isPlainObject$2(doc[key]));
}
function serversKeyOf(doc) {
	return serversKeysOf(doc)[0] ?? SERVER_KEYS[0];
}
function serversUnder(doc, key) {
	const map = doc[key];
	return isPlainObject$2(map) ? { ...map } : {};
}
function parseMcpJsonDocument(raw) {
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
	if (!isPlainObject$2(parsed)) return {
		ok: false,
		error: `top-level value is ${describeValue$1(parsed)}, expected a JSON object`
	};
	const maps = serversKeysOf(parsed);
	const servers = {};
	for (const key of maps.toReversed()) Object.assign(servers, serversUnder(parsed, key));
	return {
		ok: true,
		doc: parsed,
		servers,
		maps
	};
}
function describeValue$1(value) {
	if (value === null) return "null";
	if (Array.isArray(value)) return "an array";
	return `a ${typeof value}`;
}
function sharedNameMcpRefusal(filePath) {
	return new EngineError(`An existing file occupies ${filePath} and it is a hard link — its contents carry a second name this tree cannot see, which may sit outside it. This document is merged rather than overwritten, so every top-level field already in it is kept verbatim beside the generated mcpServers block and republished through temp+rename: on a shared name that lands a fresh inode holding bytes that were never this file's alone, so a credentials document stops being the same file as its other name and becomes an independent copy of it inside the repo, which the next commit picks up. Nothing was written, and --force does not help: this lane takes no .bak, so there is nothing for force to unlock. Replace it with a regular file — copy the contents to a new file and move that over this name — or delete it and re-run to regenerate it.`, { code: "FS_ERROR" });
}
function linkedMcpRefusal(filePath) {
	return new EngineError(`Refusing to merge into ${filePath}: it is a symbolic link, so the top-level fields this merge would keep beside the generated mcpServers block are not this file's — they are whatever the link points at, including a credentials file outside this tree that was never yours to publish. This document is merged rather than overwritten, and the merge writes through temp+rename: the link would be replaced by a regular file inside the repo holding those fields, where the next commit picks them up. Nothing was written. Replace the link with a regular file, or delete it and re-run to regenerate it.`, { code: "FS_ERROR" });
}
async function refuseLinkedMcpTarget(filePath) {
	let entry;
	try {
		entry = await lstat(filePath);
	} catch (error) {
		if (error.code === "ENOENT") return;
		throw readFailure$1(error, filePath);
	}
	if (entry.isSymbolicLink()) throw linkedMcpRefusal(filePath);
	if (isSharedRegularFile(entry)) throw sharedNameMcpRefusal(filePath);
}
const READ_ERRNO_MESSAGE = {
	EACCES: (p, d) => `Permission denied reading ${p}. The ${d} is merged rather than overwritten, so it has to be read before anything can be written. Check the file's permissions and confirm the current user can read it, then re-run.`,
	EISDIR: (p, d) => `Cannot read the ${d} at ${p}: that path is a directory, not a file. Remove or rename it, then re-run to regenerate the document.`,
	ENOTDIR: (p, d) => `Cannot reach the ${d} at ${p}: a parent path component is a file, not a directory. Remove or rename that file, then re-run.`
};
const MCP_DOCUMENT = "MCP document";
function readFailure$1(cause, path, document = MCP_DOCUMENT) {
	const code = cause?.code;
	const messageFor = typeof code === "string" ? READ_ERRNO_MESSAGE[code] : void 0;
	if (messageFor !== void 0) return new EngineError(messageFor(path, document), {
		code: "FS_ERROR",
		cause
	});
	return mapFsErrno(cause, path) ?? cause;
}
async function predictMcpMergeRefusal(filePath) {
	try {
		return isSharedRegularFile(await lstat(filePath)) ? sharedNameMcpRefusal(filePath).message : null;
	} catch {
		return null;
	}
}
function filterMcpServers(raw, managedIds, selectedIds) {
	const parsed = parseMcpJsonDocument(raw);
	if (!parsed.ok) return {
		content: raw,
		removed: [],
		preservedUserServers: [],
		unparseable: parsed.error
	};
	const kept = {};
	const dropped = {};
	const removed = [];
	const preservedUserServers = [];
	for (const [name, entry] of Object.entries(parsed.servers)) if (!managedIds.has(name)) {
		kept[name] = entry;
		preservedUserServers.push(name);
	} else if (selectedIds.has(name)) kept[name] = entry;
	else {
		dropped[name] = entry;
		removed.push(name);
	}
	return {
		content: jsonDocument$1(withFilteredServers(pruneOrphanedInputs(parsed.doc, kept, dropped), parsed.maps, kept)),
		removed,
		preservedUserServers
	};
}
function pruneOrphanedInputs(doc, kept, dropped) {
	const inputs = doc[INPUTS_KEY];
	if (!Array.isArray(inputs) || Object.keys(dropped).length === 0) return doc;
	const orphaned = referencedInputIds(dropped);
	for (const id of referencedInputIds(kept)) orphaned.delete(id);
	if (orphaned.size === 0) return doc;
	const pruned = inputs.filter((row) => {
		const id = inputIdOf(row);
		return id === null || !orphaned.has(id);
	});
	return {
		...doc,
		[INPUTS_KEY]: pruned
	};
}
async function filterMcpJsonOnDisk(filePath, managedIds, selectedIds) {
	await refuseLinkedMcpTarget(filePath);
	const raw = await readTextOrNull$1(filePath);
	if (raw === null) return null;
	const result = filterMcpServers(raw, managedIds, selectedIds);
	if (result.removed.length === 0) return {
		...result,
		content: raw
	};
	await atomicWriteFile(filePath, result.content);
	return result;
}
const NOTHING_SELECTED = /* @__PURE__ */ new Set();
function reduceMcpDocumentToUserContent(raw, managedIds) {
	const filtered = filterMcpServers(raw, managedIds, NOTHING_SELECTED);
	if (filtered.unparseable !== void 0) return {
		kind: "untouched",
		detail: `This MCP document is not valid JSON (${filtered.unparseable}), so which of its entries the engine wrote cannot be read. Nothing was removed and nothing was deleted — fix or delete the file by hand.`
	};
	if (filtered.removed.length === 0) return {
		kind: "untouched",
		detail: "Co-owned MCP document holding no entry this repo can prove it wrote — every entry is either one the ledger never claimed or one whose bytes no longer match what the engine renders for that id — so the file is left exactly as it is."
	};
	const removed = filtered.removed.join(", ");
	if (holdsOnlyEngineContent(filtered.content)) return {
		kind: "engine-only",
		detail: `Co-owned MCP document that proved to be engine-only: removing ${removed} left no server entry and no top-level field the operator authored, so nothing in it is theirs to keep.`
	};
	return {
		kind: "reduced",
		content: filtered.content,
		detail: `Co-owned MCP document: the ${filtered.removed.length} entry(ies) the engine can prove it wrote (${removed}) were removed, and the ${filtered.preservedUserServers.length} entry(ies) the ledger does not claim plus every top-level field are preserved verbatim, so the file stays.`
	};
}
function holdsOnlyEngineContent(content) {
	const parsed = parseMcpJsonDocument(content);
	if (!parsed.ok || Object.keys(parsed.servers).length > 0) return false;
	return Object.entries(parsed.doc).every(([field, value]) => SERVER_KEY_SET.has(field) || field === INPUTS_KEY && Array.isArray(value) && value.length === 0);
}
async function materializeUserMcpJson(filePath, emitted, managedIds) {
	await refuseLinkedMcpTarget(filePath);
	const existingRaw = await readTextOrNull$1(filePath);
	const plan = planUserMcpJson(filePath, emitted, managedIds, existingRaw);
	if (plan.content !== null) await atomicWriteFile(filePath, plan.content);
	return {
		...plan.result,
		writtenContent: plan.content ?? (plan.result.action === "skipped" ? null : existingRaw)
	};
}
function planUserMcpJson(filePath, emitted, managedIds, existingRaw) {
	const emittedDoc = parseMcpJsonDocument(emitted);
	if (!emittedDoc.ok) throw new EngineError(`Refusing to write ${filePath}: the emitted MCP document is not valid JSON (${emittedDoc.error}).`, { code: "ADAPTER_ERROR" });
	if (existingRaw === null) return {
		result: {
			path: filePath,
			action: "created"
		},
		content: emitted
	};
	const existing = parseMcpJsonDocument(existingRaw);
	if (!existing.ok) return {
		result: {
			path: filePath,
			action: "skipped",
			warning: `${filePath} is not valid JSON (${existing.error}) — left untouched, so the MCP server selection was not applied. Fix or delete it, then re-run.`
		},
		content: null
	};
	const { servers, collisions } = mergeServers(existing.servers, emittedDoc.servers, managedIds);
	const maps = existing.maps.length > 0 ? existing.maps : [serversKeyOf(emittedDoc.doc)];
	const frame = Object.fromEntries(Object.entries({
		...emittedDoc.doc,
		...existing.doc
	}).filter(([field]) => !SERVER_KEY_SET.has(field)));
	const inputs = mergeInputs(existing.doc[INPUTS_KEY], emittedDoc.doc[INPUTS_KEY], servers);
	if (inputs !== void 0) frame[INPUTS_KEY] = inputs;
	const content = jsonDocument$1(withMergedServers(frame, existing.doc, maps, servers));
	const warning = collisions.length > 0 ? `${filePath}: kept your own definition of ${collisions.join(", ")} — the generated definition was not applied because the ownership ledger does not claim ${collisions.length === 1 ? "that entry" : "those entries"}.` : void 0;
	if (content === existingRaw) return {
		result: {
			path: filePath,
			action: "unchanged",
			...warning === void 0 ? {} : { warning }
		},
		content: null
	};
	return {
		result: {
			path: filePath,
			action: "updated",
			...warning === void 0 ? {} : { warning }
		},
		content
	};
}
function mergeServers(existing, emitted, managedIds) {
	const servers = {};
	const collisions = [];
	for (const [name, entry] of Object.entries(existing)) if (!managedIds.has(name)) {
		servers[name] = entry;
		if (Object.hasOwn(emitted, name)) collisions.push(name);
	} else if (Object.hasOwn(emitted, name)) servers[name] = emitted[name];
	for (const [name, entry] of Object.entries(emitted)) if (!Object.hasOwn(servers, name)) servers[name] = entry;
	return {
		servers,
		collisions
	};
}
function mergeInputs(existingInputs, emittedInputs, servers) {
	if (!Array.isArray(emittedInputs)) return void 0;
	const referenced = referencedInputIds(servers);
	const emittedById = /* @__PURE__ */ new Map();
	for (const row of emittedInputs) {
		const id = inputIdOf(row);
		if (id !== null) emittedById.set(id, row);
	}
	const merged = [];
	const taken = /* @__PURE__ */ new Set();
	for (const row of Array.isArray(existingInputs) ? existingInputs : []) {
		const id = inputIdOf(row);
		if (id === null) {
			merged.push(row);
			continue;
		}
		if (!referenced.has(id) || taken.has(id)) continue;
		taken.add(id);
		merged.push(emittedById.get(id) ?? row);
	}
	for (const [id, row] of emittedById) {
		if (!referenced.has(id) || taken.has(id)) continue;
		taken.add(id);
		merged.push(row);
	}
	return merged;
}
function referencedInputIds(servers) {
	const ids = /* @__PURE__ */ new Set();
	for (const match of JSON.stringify(servers).matchAll(INPUT_REFERENCE)) {
		const id = match[1];
		if (id !== void 0) ids.add(id);
	}
	return ids;
}
function inputIdOf(row) {
	if (!isPlainObject$2(row)) return null;
	const id = row["id"];
	return typeof id === "string" ? id : null;
}
function withServers(doc, key, servers) {
	return {
		...doc,
		[key]: servers
	};
}
function withMergedServers(frame, existingDoc, maps, merged) {
	const primary = maps[0];
	const owner = /* @__PURE__ */ new Map();
	for (const key of maps) for (const name of Object.keys(serversUnder(existingDoc, key))) if (!owner.has(name)) owner.set(name, key);
	const byKey = new Map(maps.map((key) => [key, {}]));
	for (const [name, entry] of Object.entries(merged)) byKey.get(owner.get(name) ?? primary)[name] = entry;
	let result = frame;
	for (const key of maps) result = withServers(result, key, byKey.get(key));
	return result;
}
function withFilteredServers(doc, maps, kept) {
	let result = doc;
	for (const key of maps) {
		const survivors = {};
		for (const name of Object.keys(serversUnder(doc, key))) if (Object.hasOwn(kept, name)) survivors[name] = kept[name];
		result = withServers(result, key, survivors);
	}
	return result;
}
function jsonDocument$1(value) {
	return `${JSON.stringify(value, null, 2)}\n`;
}
async function readTextOrNull$1(path, document = MCP_DOCUMENT) {
	try {
		return await readFile(path, "utf8");
	} catch (error) {
		if (error.code === "ENOENT") return null;
		throw readFailure$1(error, path, document);
	}
}
//#endregion
//#region src/manifest/claudeSettings.ts
var claudeSettings_exports = /* @__PURE__ */ __exportAll({
	claudeSettingsReclaimReducer: () => claudeSettingsReclaimReducer,
	materializeClaudeSettings: () => materializeClaudeSettings,
	planClaudeSettings: () => planClaudeSettings,
	predictClaudeSettingsMerge: () => predictClaudeSettingsMerge,
	reduceClaudeSettingsToForeignContent: () => reduceClaudeSettingsToForeignContent
});
const DOCUMENT = "settings document";
const HOOKS_KEY = "hooks";
const PER_USER_SETTINGS = ".claude/settings.local.json";
const CRLF = "\r\n";
const BOM$1 = "﻿";
const PARSE_LOCATION = /at position \d+(?: \(line \d+ column \d+\))?/;
function parseObject(raw) {
	let parsed;
	try {
		parsed = JSON.parse(raw.startsWith(BOM$1) ? raw.slice(1) : raw);
	} catch (error) {
		const location = PARSE_LOCATION.exec(error instanceof Error ? error.message : "")?.[0];
		return {
			ok: false,
			error: location === void 0 ? "syntax error" : `syntax error ${location}`
		};
	}
	if (!isPlainObject$2(parsed)) return {
		ok: false,
		error: `top-level value is ${describeValue$1(parsed)}, expected a JSON object`
	};
	return {
		ok: true,
		doc: parsed
	};
}
function lineEndingOf(raw) {
	return raw.includes(CRLF) ? CRLF : "\n";
}
function serialise(value, eol) {
	const text = jsonDocument$1(value);
	return eol === "\n" ? text : text.replaceAll("\n", eol);
}
function safeName(name) {
	return name.replace(/[\r\n\t]/gu, " ").replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/gu, "");
}
function listNames(names) {
	return names.map(safeName).join(", ");
}
function sameJson(left, right) {
	return JSON.stringify(left) === JSON.stringify(right);
}
function isRepositoryHooksRendering(value) {
	if (!isPlainObject$2(value)) return false;
	return Object.values(value).some((entries) => Array.isArray(entries) && entries.some((entry) => {
		if (!isPlainObject$2(entry) || !Array.isArray(entry["hooks"])) return false;
		return entry["hooks"].some((hook) => isPlainObject$2(hook) && typeof hook["command"] === "string" && hook["command"].includes(`${HOOKS_GENERATED_DIR}/`));
	}));
}
async function refuseLinkedSettingsTarget(filePath) {
	let entry;
	try {
		entry = await lstat(filePath);
	} catch (error) {
		if (error.code === "ENOENT") return;
		throw error;
	}
	if (entry.isSymbolicLink()) throw new EngineError(`Refusing to merge into ${filePath}: it is a symbolic link, so the top-level keys this merge would keep beside the generated ones are not this file's — they are whatever the link points at, which may sit outside this tree. The merge writes through temp+rename, so the link would be replaced by a regular file inside the repository holding those keys. Nothing was written. Replace the link with a regular file, or delete it and re-run to regenerate it.`, { code: "FS_ERROR" });
	if (isSharedRegularFile(entry)) throw new EngineError(`An existing file occupies ${filePath} and it is a hard link — its contents carry a second name this tree cannot see, which may sit outside it. This document is merged rather than overwritten, so every top-level key already in it is kept and republished through temp+rename: on a shared name that lands a fresh inode holding bytes that were never this file's alone. Nothing was written, and force does not help: this lane's backup refuses the same file. Replace it with a regular file — copy the contents to a new file and move that over this name — or delete it and re-run to regenerate it.`, { code: "FS_ERROR" });
}
function parseEmitted(filePath, emitted) {
	const parsed = parseObject(emitted);
	if (!parsed.ok) throw new EngineError(`Refusing to write ${filePath}: the emitted settings document is not valid JSON (${parsed.error}).`, { code: "ADAPTER_ERROR" });
	return parsed.doc;
}
function skipped(filePath, reason) {
	return {
		result: {
			path: filePath,
			action: "skipped",
			warning: reason
		},
		content: null,
		backup: null,
		collision: reason
	};
}
function replacedWhole(filePath, emitted, existingRaw, warning) {
	return {
		result: {
			path: filePath,
			action: "updated",
			warning
		},
		content: emitted,
		backup: existingRaw,
		collision: null
	};
}
function isUnedited(filePath, existingRaw, ownership) {
	const hashes = ownership.ledgerHashes;
	if (!ownership.owned || hashes === void 0 || !hashes.has(toLedgerKey(filePath))) return false;
	return !hasLedgerDrift(filePath, existingRaw, hashes);
}
function planClaudeSettings(filePath, emitted, existingRaw, ownership) {
	const emittedDoc = parseEmitted(filePath, emitted);
	const shown = displayPath(filePath, ownership.boundaryDir);
	if (existingRaw === null) return {
		result: {
			path: filePath,
			action: "created"
		},
		content: emitted,
		backup: null,
		collision: null
	};
	const existing = parseObject(existingRaw);
	if (!existing.ok) {
		if (!ownership.force) return skipped(filePath, `Skipped ${shown}: it is not valid JSON (${existing.error}), so nothing in it can be kept beside the generated keys and the engine will not guess. It was left untouched. Fix or delete it and re-run, or re-run with force to replace it after a verified .bak.`);
		return replacedWhole(filePath, emitted, existingRaw, `Force-overwrote ${shown}: it was not valid JSON (${existing.error}), so nothing in it could be kept beside the generated keys and the whole file was replaced.`);
	}
	const eol = lineEndingOf(existingRaw);
	const emittedKeys = Object.keys(emittedDoc);
	const ownedNames = /* @__PURE__ */ new Set([...ownership.ownedKeys ?? emittedKeys, ...emittedKeys]);
	const unedited = isUnedited(filePath, existingRaw, ownership);
	const entries = [];
	const foreign = [];
	const engineKeys = [];
	let content;
	try {
		for (const [key, value] of Object.entries(existing.doc)) {
			const recognised = key === HOOKS_KEY && isRepositoryHooksRendering(value);
			if (!ownedNames.has(key) && !recognised) {
				foreign.push(key);
				entries.push([key, value]);
				continue;
			}
			const rendered = Object.hasOwn(emittedDoc, key);
			const changed = !rendered || !sameJson(value, emittedDoc[key]);
			engineKeys.push({
				key,
				rendered,
				changed,
				proven: !changed || unedited,
				recognised
			});
			if (rendered) entries.push([key, emittedDoc[key]]);
		}
		for (const [key, value] of Object.entries(emittedDoc)) if (!Object.hasOwn(existing.doc, key)) entries.push([key, value]);
		content = serialise(Object.fromEntries(entries), eol);
	} catch (error) {
		if (!(error instanceof RangeError)) throw error;
		const why = `not a settings document this engine can merge (${error.message})`;
		if (!ownership.force) return skipped(filePath, `Skipped ${shown}: ${why}, so nothing in it can be kept beside the generated keys. It was left untouched. Fix or delete it and re-run, or re-run with force to replace it after a verified .bak.`);
		return replacedWhole(filePath, emitted, existingRaw, `Force-overwrote ${shown}: ${why}, so the whole file was replaced.`);
	}
	const contested = [...ownedNames].filter((key) => engineKeys.some((entry) => entry.key === key && entry.changed && !entry.proven && !entry.recognised));
	if (contested.length > 0 && !ownership.owned && !ownership.force) return skipped(filePath, `Skipped ${shown}: it carries a ${contested.join(", ")} key this engine renders, with different content, and no ownership ledger row proves the engine wrote it — the key is hand-written or a previous setup's, and replacing it would silently change live wiring. The engine owns only its own top-level keys (${[...ownedNames].join(", ")}); every other key is kept, so the collision is that key alone. Remove or rename it and re-run, or re-run with force to replace it after a verified .bak of the file.`);
	if (content === existingRaw) return {
		result: {
			path: filePath,
			action: "unchanged"
		},
		content: null,
		backup: null,
		collision: null
	};
	const warnings = [];
	let backup = null;
	const personal = `Personal rows belong in ${PER_USER_SETTINGS}, the client's per-user project settings, which this engine never writes.`;
	const hooks = engineKeys.find((entry) => entry.key === HOOKS_KEY && entry.recognised && entry.changed && (!entry.rendered || !entry.proven));
	if (hooks !== void 0) {
		if (!hooks.proven) backup = existingRaw;
		warnings.push(hooks.rendered ? `Replaced the hooks key of ${shown}: its content differs from the engine's rendering and the engine cannot prove it wrote every row in it, so rows of yours may have been inside it. The previous file was backed up first. ${personal}` : `Removed the repository-mode hooks wiring (hooks) from ${shown}: its commands run scripts under ${HOOKS_GENERATED_DIR}, which a plugin-backed setup does not write — the plugin carries the hooks, and a wiring pointing at scripts that are not there fails closed on every tool call.` + (hooks.proven ? "" : ` The previous file was backed up first: if it carried rows of yours, they are there. ${personal}`));
	}
	if (contested.length > 0) {
		backup = existingRaw;
		warnings.push(ownership.owned ? `Replaced the ${contested.join(", ")} key(s) of ${shown}: the file has changed since the engine last wrote it (or its row records no hash) and that key no longer matches the engine's rendering, so it may have been edited by hand. The previous file was backed up first. ${personal}` : `Force-replaced the ${contested.join(", ")} key(s) of ${shown}: no ownership ledger row proved the engine wrote them, so the previous file was backed up first. Every other top-level key (${foreign.length === 0 ? "none" : listNames(foreign)}) was kept.`);
	}
	const notice = !ownership.owned && foreign.length > 0 ? `Adopted ${shown}: kept its ${foreign.length} other top-level key(s) (${listNames(foreign)}) beside the generated ${emittedKeys.join(", ")}; the engine owns only those.` + (foreign.includes(HOOKS_KEY) ? ` Its own hooks key stays too, and this client loads it beside the plugin's hooks — remove it, or keep personal rows in ${PER_USER_SETTINGS}, if that is not what you want.` : "") : void 0;
	return {
		result: {
			path: filePath,
			action: "updated",
			...warnings.length === 0 ? {} : { warning: warnings.join(" ") },
			...notice === void 0 ? {} : { notice }
		},
		content,
		backup,
		collision: null
	};
}
async function predictClaudeSettingsMerge(filePath, emitted, ownership) {
	try {
		await refuseLinkedSettingsTarget(filePath);
	} catch (error) {
		if (!(error instanceof EngineError)) throw error;
		return {
			result: {
				path: filePath,
				action: "skipped",
				warning: error.message
			},
			collision: {
				kind: "shared-name",
				detail: error.message
			}
		};
	}
	const plan = planClaudeSettings(filePath, emitted, await readTextOrNull$1(filePath, DOCUMENT), ownership);
	return {
		result: plan.result,
		collision: plan.collision === null ? null : {
			kind: "unmanaged-name",
			detail: plan.collision
		}
	};
}
async function materializeClaudeSettings(filePath, emitted, ownership) {
	await assertWriteTargetContained(filePath, ownership.boundaryDir);
	try {
		await mkdir(dirname(filePath), { recursive: true });
	} catch (error) {
		throw mapFsErrno(error, filePath) ?? error;
	}
	const release = await acquireWriteLock(filePath, ownership.boundaryDir);
	try {
		await refuseLinkedSettingsTarget(filePath);
		const existingRaw = await readTextOrNull$1(filePath, DOCUMENT);
		const plan = planClaudeSettings(filePath, emitted, existingRaw, ownership);
		let result = plan.result;
		if (plan.backup !== null) {
			const bakPath = await backupBeforeOverwrite(filePath, plan.backup, "verified backup", ownership.boundaryDir);
			result = {
				...result,
				warning: `${result.warning ?? ""} Your previous file is at ${bakPath}.`.trim()
			};
		}
		if (plan.content !== null) await atomicWriteFileUnlocked(filePath, plan.content, ownership.boundaryDir === void 0 ? void 0 : { boundaryDir: ownership.boundaryDir });
		return {
			...result,
			writtenContent: plan.content ?? (result.action === "skipped" ? null : existingRaw)
		};
	} finally {
		try {
			await release();
		} catch (releaseError) {
			console.error(`Failed to release the write lock on ${filePath}: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`);
		}
	}
}
function reduceClaudeSettingsToForeignContent(raw, ownedKeys) {
	const parsed = parseObject(raw);
	if (!parsed.ok) return {
		kind: "untouched",
		detail: `This settings document is not valid JSON (${parsed.error}), so which of its keys the engine wrote cannot be read. Nothing was removed and nothing was deleted — fix or delete the file by hand.`
	};
	const owned = new Set(ownedKeys);
	const present = [];
	const kept = [];
	for (const [key, value] of Object.entries(parsed.doc)) if (owned.has(key)) present.push(key);
	else kept.push([key, value]);
	if (present.length === 0) return {
		kind: "untouched",
		detail: `Co-owned settings document holding none of the keys this engine writes (${ownedKeys.join(", ")}) — every key in it is the client's or the operator's, so the file is left exactly as it is.`
	};
	const removed = present.join(", ");
	if (kept.length === 0) return {
		kind: "engine-only",
		detail: `Co-owned settings document that proved to be engine-only: removing ${removed} left no other top-level key, so nothing else in it is the client's or the operator's to keep.`
	};
	return {
		kind: "reduced",
		content: serialise(Object.fromEntries(kept), lineEndingOf(raw)),
		detail: `Co-owned settings document: the engine's ${present.length} key(s) (${removed}) were removed and the ${kept.length} other key(s) (${listNames(kept.map(([key]) => key))}) are kept verbatim, so the file stays.`
	};
}
function claudeSettingsReclaimReducer(ownedKeys) {
	return (content) => reduceClaudeSettingsToForeignContent(content, ownedKeys);
}
//#endregion
//#region src/mcp/descriptionScan.ts
var descriptionScan_exports = /* @__PURE__ */ __exportAll({
	detectToolManifestDrift: () => detectToolManifestDrift,
	hashToolManifest: () => hashToolManifest,
	scanMcpEntry: () => scanMcpEntry,
	scanMcpServers: () => scanMcpServers
});
const SCAN_PATTERNS = [
	...CONTENT_DENY_PATTERNS,
	...INJECTION_PATTERNS,
	...MCP_POISONING_PATTERNS
];
const PATTERN_DESCRIPTIONS$1 = new Map(SCAN_PATTERNS.map((entry) => [entry.id, entry.description]));
const SNIPPET_MAX = 80;
function elementSurfacesOf(target) {
	const surfaces = [];
	if (target.description !== void 0 && target.description !== "") surfaces.push({
		label: "description",
		text: target.description
	});
	if (target.command !== void 0 && target.command !== "") surfaces.push({
		label: "command",
		text: target.command
	});
	target.args?.forEach((arg, index) => {
		if (arg !== "") surfaces.push({
			label: `args[${index}]`,
			text: arg
		});
	});
	return surfaces;
}
function joinedSurfacesOf(target) {
	const args = (target.args ?? []).filter((arg) => arg !== "");
	const surfaces = [];
	if (args.length > 1) surfaces.push({
		label: "args[*]",
		text: args.join(" ")
	});
	if (target.description !== void 0 && target.description !== "" && args.length > 0) surfaces.push({
		label: "description+args",
		text: [target.description, ...args].join(" ")
	});
	return surfaces;
}
function oneLine$1(snippet) {
	const flat = snippet.replace(/\s+/g, " ").trim();
	return flat.length > SNIPPET_MAX ? `${flat.slice(0, 77)}...` : flat;
}
function formatFinding(id, label, hit) {
	return `${id}.${label}: ${PATTERN_DESCRIPTIONS$1.get(hit.patternId) ?? "denied pattern"} (${hit.patternId}) at index ${hit.index}: "${oneLine$1(hit.snippet)}"`;
}
function scanMcpEntry(target) {
	const findings = [];
	const reported = /* @__PURE__ */ new Set();
	for (const { label, text } of elementSurfacesOf(target)) for (const hit of scanNormalized(text, SCAN_PATTERNS)) {
		reported.add(hit.patternId);
		findings.push(formatFinding(target.id, label, hit));
	}
	for (const { label, text } of joinedSurfacesOf(target)) for (const hit of scanNormalized(text, SCAN_PATTERNS)) {
		if (reported.has(hit.patternId)) continue;
		reported.add(hit.patternId);
		findings.push(formatFinding(target.id, label, hit));
	}
	return findings;
}
function scanMcpServers(servers) {
	const findings = {};
	for (const [id, target] of Object.entries(servers)) {
		const entryFindings = scanMcpEntry({
			...target,
			id
		});
		if (entryFindings.length > 0) findings[id] = entryFindings;
	}
	return findings;
}
function stableStringify(value, seen) {
	if (value === null || value === void 0) return "null";
	if (typeof value === "bigint") return JSON.stringify(value.toString());
	if (typeof value !== "object") return JSON.stringify(value) ?? "null";
	if (seen.has(value)) throw new EngineError("Tool manifest contains a circular reference and cannot be hashed", { code: "VALIDATION_ERROR" });
	seen.add(value);
	const encoded = Array.isArray(value) ? `[${value.map((item) => stableStringify(item, seen)).join(",")}]` : `{${Object.entries(value).filter(([, item]) => item !== void 0).toSorted(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item, seen)}`).join(",")}}`;
	seen.delete(value);
	return encoded;
}
function canonicalTool(tool) {
	return stableStringify({
		name: tool.name,
		description: tool.description ?? "",
		inputSchema: tool.inputSchema ?? null
	}, /* @__PURE__ */ new Set());
}
function hashToolManifest(tools) {
	const canonical = tools.map(canonicalTool).toSorted();
	return createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
}
function detectToolManifestDrift(pinned, current) {
	const drift = [];
	for (const serverId of Object.keys(pinned).toSorted()) {
		const expectedHash = pinned[serverId];
		const actualHash = Object.hasOwn(current, serverId) ? current[serverId] : void 0;
		if (expectedHash === void 0 || actualHash === void 0) continue;
		if (expectedHash !== actualHash) drift.push({
			serverId,
			expectedHash,
			actualHash
		});
	}
	return drift;
}
//#endregion
//#region src/mcp/catalog.ts
var catalog_exports = /* @__PURE__ */ __exportAll({
	CATALOG_VERIFIED_ON: () => CATALOG_VERIFIED_ON,
	CURATED_MCP_SERVERS: () => CURATED_MCP_SERVERS,
	PLATFORM_MCP_SERVER: () => PLATFORM_MCP_SERVER,
	assertNoCuratedCollision: () => assertNoCuratedCollision,
	getServerMeta: () => getServerMeta,
	pinnedPackageSpec: () => pinnedPackageSpec,
	resolveServerMeta: () => resolveServerMeta,
	validateServerIds: () => validateServerIds
});
const CATALOG_VERIFIED_ON = "2026-08-16";
const CURATED_MCP_SERVERS = {
	github: {
		id: "github",
		description: "Repository management: code review, issues, pull requests, and project boards.",
		command: "npx",
		args: [
			"-y",
			"mcp-remote@0.1.16",
			"https://api.githubcopilot.com/mcp/",
			"--header",
			"Authorization: Bearer ${env:GITHUB_PAT}",
			"--header",
			"X-MCP-Toolsets: repos,issues,pull_requests"
		],
		transport: "http",
		requiresEnv: [{
			name: "GITHUB_PAT",
			comment: "Fine-grained token with Contents, Issues, and Pull requests read/write on the repositories the agent may touch",
			url: "https://github.com/settings/tokens/new"
		}],
		pinnedVersion: "0.1.16",
		pinReviewedOn: "2026-08-16",
		packageNameLock: "mcp-remote",
		firstParty: true,
		blastRadius: "High — can merge pull requests, push code, and read private repository contents. The toolset header grants repos/issues/pull_requests only, excluding Actions, org admin, and secret scanning; widening it raises the radius. The remote endpoint is vendor-operated but is reached through the pinned community stdio bridge, which sees every request. Scope the token per-repository and rotate it on a 90-day maximum.",
		docsUrl: "https://github.com/github/github-mcp-server"
	},
	"azure-devops": {
		id: "azure-devops",
		description: "Work items, repos, pipelines, and boards.",
		command: "npx",
		args: ["-y", "@tiberriver256/mcp-server-azure-devops@0.1.45"],
		transport: "stdio",
		requiresEnv: [{
			name: "AZURE_DEVOPS_PAT",
			comment: "Personal access token with Work Items, Code, and Build read/write",
			url: "https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate"
		}, {
			name: "AZURE_DEVOPS_ORG",
			comment: "Organization name exactly as it appears in the project URL",
			url: "https://dev.azure.com/"
		}],
		pinnedVersion: "0.1.45",
		pinReviewedOn: "2026-08-16",
		packageNameLock: "@tiberriver256/mcp-server-azure-devops",
		firstParty: false,
		blastRadius: "High — can modify work items, trigger pipelines, and push code across every project the token reaches. Scope the token to the minimum permission set and prefer short expirations over standing access.",
		docsUrl: "https://www.npmjs.com/package/@tiberriver256/mcp-server-azure-devops"
	},
	gitlab: {
		id: "gitlab",
		description: "Issues, merge requests, pipelines, and project management.",
		command: "glab",
		args: ["mcp", "serve"],
		transport: "stdio",
		requiresEnv: [{
			name: "GITLAB_TOKEN",
			comment: "Project or group access token with the api scope; read_api is enough for read-only use",
			url: "https://gitlab.com/-/user_settings/personal_access_tokens"
		}],
		pinnedVersion: "1.99.0",
		pinReviewedOn: "2026-08-16",
		packageNameLock: "glab",
		firstParty: true,
		blastRadius: "High — can merge requests, modify code, and drive CI/CD; the api scope grants broad project access. Prefer a project-scoped token over a personal one and set an expiration date. The launcher is a host-installed binary, so its version is the operator's to keep current. Maturity: `glab mcp serve` is declared an experiment by its vendor — \"not ready for production use and might be unstable or removed at any time\" (docs.gitlab.com/cli/mcp/serve/, accessed 2026-08-22) — so this row can stop working on a glab upgrade with no deprecation window. Every other row here is a stable published interface; this one is not, and selecting it is accepting that.",
		docsUrl: "https://gitlab.com/gitlab-org/cli"
	},
	context7: {
		id: "context7",
		description: "Version-specific library documentation lookup.",
		command: "npx",
		args: ["-y", "@upstash/context7-mcp@2.1.1"],
		transport: "stdio",
		pinnedVersion: "2.1.1",
		pinReviewedOn: "2026-08-16",
		packageNameLock: "@upstash/context7-mcp",
		firstParty: true,
		blastRadius: "Low — read-only lookups against public documentation, no credentials held. Unexpected outbound traffic is the only signal worth watching.",
		docsUrl: "https://github.com/upstash/context7"
	},
	filesystem: {
		id: "filesystem",
		description: "File reads, writes, and edits inside the project directory.",
		command: "npx",
		args: [
			"-y",
			"@modelcontextprotocol/server-filesystem@2026.1.14",
			"."
		],
		transport: "stdio",
		pinnedVersion: "2026.1.14",
		pinReviewedOn: "2026-08-16",
		packageNameLock: "@modelcontextprotocol/server-filesystem",
		firstParty: true,
		blastRadius: "Medium — can read, write, and delete anything under the directory it is given, including config files. Keep the allowed root at the project directory; never widen it to the home directory or a system path.",
		docsUrl: "https://github.com/modelcontextprotocol/servers"
	},
	playwright: {
		id: "playwright",
		description: "Browser automation, web testing, and UI interaction.",
		command: "npx",
		args: ["-y", "@playwright/mcp@0.0.68"],
		transport: "stdio",
		pinnedVersion: "0.0.68",
		pinReviewedOn: "2026-08-16",
		packageNameLock: "@playwright/mcp",
		firstParty: true,
		blastRadius: "Medium — can navigate to any URL, submit data through a page, and screenshot whatever is on screen. Point it at localhost or staging, block external navigation in CI, and clear browser state between runs.",
		docsUrl: "https://github.com/microsoft/playwright-mcp"
	},
	"brave-search": {
		id: "brave-search",
		description: "Web search for research, fact-checking, and current information.",
		command: "npx",
		args: [
			"-y",
			"@brave/brave-search-mcp-server@2.0.83",
			"--transport",
			"stdio"
		],
		transport: "stdio",
		requiresEnv: [{
			name: "BRAVE_API_KEY",
			comment: "Search API key; the free tier allows 2,000 queries per month",
			url: "https://brave.com/search/api/"
		}],
		pinnedVersion: "2.0.83",
		pinReviewedOn: "2026-08-16",
		packageNameLock: "@brave/brave-search-mcp-server",
		firstParty: true,
		blastRadius: "Low — read-only search. A leaked key exhausts the quota rather than exposing data; rate-limit the key and watch usage for unusual patterns.",
		docsUrl: "https://github.com/brave/brave-search-mcp-server"
	},
	sentry: {
		id: "sentry",
		description: "Error tracking and performance monitoring.",
		command: "npx",
		args: ["-y", "@sentry/mcp-server@0.29.0"],
		transport: "stdio",
		requiresEnv: [{
			name: "SENTRY_AUTH_TOKEN",
			comment: "Organization-scoped auth token, read-only where the workflow allows",
			url: "https://sentry.io/settings/account/api/auth-tokens/"
		}],
		pinnedVersion: "0.29.0",
		pinReviewedOn: "2026-08-16",
		packageNameLock: "@sentry/mcp-server",
		firstParty: true,
		blastRadius: "Medium — stack traces carry variable values, user identifiers, and file paths into the agent's context. Turn on data scrubbing at the source and prefer a read-only token.",
		docsUrl: "https://github.com/getsentry/sentry-mcp"
	},
	postgres: {
		id: "postgres",
		description: "Database queries and schema inspection.",
		command: "npx",
		args: ["-y", "@henkey/postgres-mcp-server@1.0.5"],
		transport: "stdio",
		requiresEnv: [{
			name: "POSTGRES_URL",
			comment: "Connection string for a non-production database, using a role limited to the schemas the agent needs",
			url: "https://www.postgresql.org/docs/current/libpq-connect.html"
		}],
		pinnedVersion: "1.0.5",
		pinReviewedOn: "2026-08-16",
		packageNameLock: "@henkey/postgres-mcp-server",
		firstParty: false,
		blastRadius: "Critical — direct database access can read, change, or drop data, and the connection string itself is a credential. Enforce the limit at the database (a role granted only SELECT on named schemas) rather than trusting a server-side read-only flag, and never point it at production.",
		docsUrl: "https://www.npmjs.com/package/@henkey/postgres-mcp-server"
	},
	linear: {
		id: "linear",
		description: "Issue tracking and project management.",
		command: "npx",
		args: ["-y", "@mkusaka/mcp-server-linear@1.0.15"],
		transport: "stdio",
		requiresEnv: [{
			name: "LINEAR_API_KEY",
			comment: "Workspace API key, ideally issued to a dedicated service account",
			url: "https://linear.app/settings/api"
		}],
		pinnedVersion: "1.0.15",
		pinReviewedOn: "2026-08-16",
		packageNameLock: "@mkusaka/mcp-server-linear",
		firstParty: false,
		blastRadius: "Medium — can read and change issues, projects, and team configuration across the workspace the key belongs to. Use a dedicated account, restrict it to one team where possible, and watch the audit log. Maintenance: a single-maintainer community package with no release since the pinned version, so a defect or an advisory against it has no upstream to land a fix in — the pin will not move because nothing is moving. It holds a workspace read/write key, which is the combination that makes the staleness worth stating rather than merely recording: budget for removing the row, not for waiting on it.",
		docsUrl: "https://www.npmjs.com/package/@mkusaka/mcp-server-linear"
	}
};
const PLATFORM_MCP_SERVER = {
	github: "github",
	"azure-devops": "azure-devops",
	gitlab: "gitlab"
};
const FETCH_LAUNCHERS = /* @__PURE__ */ new Set([
	"npx",
	"bunx",
	"uvx",
	"pipx"
]);
function getServerMeta(id) {
	return Object.hasOwn(CURATED_MCP_SERVERS, id) ? CURATED_MCP_SERVERS[id] : void 0;
}
function resolveServerMeta(id, packServers = []) {
	const curated = getServerMeta(id);
	if (curated !== void 0) return curated;
	return packServers.find((server) => server.id === id);
}
function assertNoCuratedCollision(packServers) {
	const seen = /* @__PURE__ */ new Set();
	const colliding = [];
	for (const server of packServers) {
		if (getServerMeta(server.id) === void 0 || seen.has(server.id)) continue;
		seen.add(server.id);
		colliding.push(`${JSON.stringify(server.id)} (pack ${JSON.stringify(server.sourcePackId)})`);
	}
	if (colliding.length === 0) return;
	throw new EngineError(`Pack-supplied MCP server id(s) collide with the curated catalog: ${colliding.join(", ")}. A curated id always resolves to its reviewed row, so a pack definition under that name could never be launched. Rename the pack's server and re-publish the pack.`, { code: "VALIDATION_ERROR" });
}
function pinnedPackageSpec(meta) {
	if (!FETCH_LAUNCHERS.has(meta.command)) return void 0;
	return `${meta.packageNameLock}@${meta.pinnedVersion}`;
}
function validateServerIds(ids, packServers = []) {
	const valid = [];
	const unknown = [];
	const seen = /* @__PURE__ */ new Set();
	for (const id of ids) {
		if (seen.has(id)) continue;
		seen.add(id);
		if (resolveServerMeta(id, packServers) === void 0) unknown.push(id);
		else valid.push(id);
	}
	return {
		valid,
		unknown
	};
}
//#endregion
//#region src/mcp/emit.ts
var emit_exports = /* @__PURE__ */ __exportAll({
	MERGED_MCP_JSON_PATHS: () => MERGED_MCP_JSON_PATHS,
	emitClaudeMcpJson: () => emitClaudeMcpJson,
	emitCodexToml: () => emitCodexToml,
	emitCopilotMcpEnv: () => emitCopilotMcpEnv,
	emitCursorMcpJson: () => emitCursorMcpJson,
	emitVsCodeServersJson: () => emitVsCodeServersJson,
	engineOwnedServerIds: () => engineOwnedServerIds,
	envPlaceholder: () => envPlaceholder,
	mcpReclaimReducers: () => mcpReclaimReducers,
	planMcpEmissions: () => planMcpEmissions
});
const DIALECT_PATH = {
	"claude-json": ".mcp.json",
	"cursor-json": ".cursor/mcp.json",
	"vscode-json": ".vscode/mcp.json",
	"copilot-env": `${STATE_DIR}/mcp/copilot-repo-settings.env`,
	"codex-toml": ".codex/config.toml"
};
const MERGED_JSON_DIALECTS = [
	"claude-json",
	"cursor-json",
	"vscode-json"
];
const MERGED_MCP_JSON_PATHS = new Set(MERGED_JSON_DIALECTS.map((dialect) => DIALECT_PATH[dialect]));
function engineOwnedServerIds(path, selectedIds, existingRaw, packServers = []) {
	const owned = new Set(selectedIds);
	const dialect = MERGED_JSON_DIALECTS.find((candidate) => DIALECT_PATH[candidate] === path);
	if (dialect === void 0 || existingRaw === null) return owned;
	const existing = parseServersMap(existingRaw);
	if (existing === null) return owned;
	const renderableIds = [...Object.keys(CURATED_MCP_SERVERS), ...packServers.map((server) => server.id)];
	const candidateIds = [...new Set(renderableIds)].filter((id) => id in existing);
	if (candidateIds.length === 0) return owned;
	const canonical = parseServersMap(renderDialect(dialect, candidateIds, { packServers }, "probe"));
	if (canonical === null) return owned;
	for (const id of candidateIds) {
		const mine = canonical[id];
		if (mine !== void 0 && JSON.stringify(existing[id]) === JSON.stringify(mine)) owned.add(id);
	}
	return owned;
}
function mcpReclaimReducers(packServers = []) {
	return new Map([...MERGED_MCP_JSON_PATHS].map((path) => [path, (content) => reduceMcpDocumentToUserContent(content, engineOwnedServerIds(path, [], content, packServers))]));
}
function parseServersMap(raw) {
	const parsed = parseMcpJsonDocument(raw);
	return parsed.ok ? parsed.servers : null;
}
const TOOL_DIALECTS = {
	claude: ["claude-json"],
	cursor: ["cursor-json"],
	copilot: ["vscode-json", "copilot-env"],
	codex: ["codex-toml"]
};
const COPILOT_SECRET_PREFIX = "COPILOT_MCP_";
const ENV_TOKEN_PATTERN = /\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g;
const FLOATING_SPEC_PATTERN = /@(?:latest|next|beta|canary|\*|\^|~|>=?|<=?)/;
function envPlaceholder(dialect, varName) {
	switch (dialect) {
		case "claude-json": return `\${${varName}}`;
		case "cursor-json": return `\${env:${varName}}`;
		case "vscode-json": return `\${input:${inputId(varName)}}`;
		case "copilot-env": return `$${COPILOT_SECRET_PREFIX}${upperSnake(varName)}`;
		case "codex-toml": return `$${varName}`;
	}
}
function inputId(varName) {
	return varName.toLowerCase().replaceAll("_", "-");
}
function upperSnake(value) {
	return value.replaceAll(/[^A-Za-z0-9]+/g, "_").toUpperCase();
}
function retarget(value, dialect) {
	return value.replaceAll(ENV_TOKEN_PATTERN, (_match, name) => envPlaceholder(dialect, name));
}
const ENV_TOKEN_OPENER = /\$\{env:/g;
function assertEveryEnvTokenRewritten(meta, original) {
	if ((original.match(ENV_TOKEN_OPENER) ?? []).length === referencedVars(original, { collapse: false }).length) return;
	throw new EngineError(`MCP server "${meta.id}" argument ${JSON.stringify(original)} carries a \${env:…} reference no client dialect can rewrite. Only \${env:NAME} with NAME matching [A-Za-z_][A-Za-z0-9_]* is rewritten, so this one would be written to disk verbatim and passed to the server as text rather than as a credential. Fix the catalog row's variable name, and declare it in that row's requiresEnv.`, { code: "VALIDATION_ERROR" });
}
function resolveServers(serverIds, packServers = [], mode = "emit") {
	const seen = /* @__PURE__ */ new Set();
	const resolved = [];
	const unknown = [];
	for (const id of serverIds) {
		if (seen.has(id)) continue;
		seen.add(id);
		const meta = resolveServerMeta(id, packServers);
		if (meta === void 0) unknown.push(id);
		else resolved.push(meta);
	}
	if (mode === "probe") return resolved;
	if (unknown.length > 0) throw new EngineError(`Unknown MCP server id(s): ${unknown.join(", ")}. Nothing resolves them — neither the curated catalog nor any installed pack — so no client document can be written. Run ${unknown.map((id) => `\`config mcp remove ${id}\``).join(" ")} to drop ${unknown.length === 1 ? "it" : "them"} from the selection, re-install the pack that supplied ${unknown.length === 1 ? "it" : "them"}, or add a reviewed, version-pinned row to the curated catalog.`, { code: "VALIDATION_ERROR" });
	for (const meta of resolved) assertExactPin(meta);
	for (const finding of scanResolvedDescriptions(resolved)) console.error(finding);
	return resolved;
}
function scanResolvedDescriptions(servers) {
	const reported = [];
	for (const meta of servers) {
		const findings = scanMcpEntry({
			id: meta.id,
			description: meta.description,
			command: meta.command,
			args: [...meta.args]
		});
		for (const finding of findings) reported.push(`MCP description scan: ${finding}. The server is still emitted — review the row in the catalog before trusting what it tells an agent to do.`);
	}
	return reported;
}
function assertExactPin(meta) {
	const spec = pinnedPackageSpec(meta);
	if (spec === void 0) {
		if (meta.command !== meta.packageNameLock) throw pinError(meta, `launches "${meta.command}" but its package name lock is "${meta.packageNameLock}"`);
		return;
	}
	if (!meta.args.includes(spec)) throw pinError(meta, `arguments do not carry the pinned package spec "${spec}"`);
	const floating = meta.args.find((arg) => FLOATING_SPEC_PATTERN.test(arg));
	if (floating !== void 0) throw pinError(meta, `argument "${floating}" is a floating version spec`);
}
function pinError(meta, detail) {
	return new EngineError(`MCP server "${meta.id}" ${detail}. Emission refuses an unpinned launch: fix the catalog row so its arguments reference ${meta.packageNameLock}@${meta.pinnedVersion} exactly.`, { code: "VALIDATION_ERROR" });
}
function args(meta, dialect) {
	return meta.args.map((arg) => {
		assertEveryEnvTokenRewritten(meta, arg);
		return retarget(arg, dialect);
	});
}
function referencedVars(value, opts = {}) {
	const names = [...value.matchAll(ENV_TOKEN_PATTERN)].map(([, name]) => name);
	return opts.collapse === false ? names : [...new Set(names)];
}
function envMap(meta, dialect) {
	if (meta.requiresEnv === void 0 || meta.requiresEnv.length === 0) return void 0;
	return Object.fromEntries(meta.requiresEnv.map((requirement) => [requirement.name, envPlaceholder(dialect, requirement.name)]));
}
function requiredEnv(servers) {
	const byName = /* @__PURE__ */ new Map();
	for (const meta of servers) for (const requirement of meta.requiresEnv ?? []) if (!byName.has(requirement.name)) byName.set(requirement.name, requirement.comment);
	return [...byName].map(([name, comment]) => ({
		name,
		comment
	}));
}
function jsonDocument(value) {
	return `${JSON.stringify(value, null, 2)}\n`;
}
function oneLine(value) {
	return value.replaceAll(/[\r\n]+/g, " ").trim();
}
function emitClaudeMcpJson(serverIds, opts, mode = "emit") {
	const servers = resolveServers(serverIds, opts?.packServers, mode);
	return jsonDocument({
		...opts?.protocolVersion === void 0 ? {} : { protocolVersion: opts.protocolVersion },
		mcpServers: stdioEntries(servers, "claude-json")
	});
}
function emitCursorMcpJson(serverIds, opts, mode = "emit") {
	return jsonDocument({ mcpServers: stdioEntries(resolveServers(serverIds, opts?.packServers, mode), "cursor-json") });
}
function emitVsCodeServersJson(serverIds, opts, mode = "emit") {
	const servers = resolveServers(serverIds, opts?.packServers, mode);
	return jsonDocument({
		inputs: requiredEnv(servers).map((requirement) => ({
			type: "promptString",
			id: inputId(requirement.name),
			description: oneLine(requirement.comment),
			password: true
		})),
		servers: stdioEntries(servers, "vscode-json", { type: "stdio" })
	});
}
function emitCopilotMcpEnv(serverIds, opts, mode = "emit") {
	return resolveServers(serverIds, opts?.packServers, mode).map((meta) => {
		const env = envMap(meta, "copilot-env");
		return {
			name: `${COPILOT_SECRET_PREFIX}${upperSnake(meta.id)}`,
			value: JSON.stringify({
				type: "local",
				command: meta.command,
				args: args(meta, "copilot-env"),
				...env === void 0 ? {} : { env },
				tools: ["*"]
			})
		};
	});
}
function emitCodexToml(serverIds, opts, mode = "emit") {
	const servers = resolveServers(serverIds, opts?.packServers, mode);
	if (servers.length === 0) return "# No MCP servers selected.\n[mcp_servers]\n";
	return `${servers.map(codexTable).join("\n\n")}\n`;
}
function codexArgVector(meta) {
	const rendered = args(meta, "codex-toml");
	const emitted = [];
	const withheld = [];
	for (const [index, original] of meta.args.entries()) {
		const vars = referencedVars(original);
		const value = rendered[index];
		if (vars.length === 0) {
			emitted.push(value);
			continue;
		}
		const flag = emitted.at(-1);
		if (flag !== void 0 && flag.startsWith("-") && !flag.includes("=")) {
			emitted.pop();
			withheld.push({
				rendered: `${flag} ${tomlString(value)}`,
				vars
			});
		} else withheld.push({
			rendered: tomlString(value),
			vars
		});
	}
	return {
		emitted,
		withheld
	};
}
function codexTable(meta) {
	const lines = [`# ${meta.id} — ${oneLine(meta.description)}`];
	const required = (meta.requiresEnv ?? []).map((requirement) => requirement.name);
	const { emitted, withheld } = codexArgVector(meta);
	if (required.length > 0) lines.push(`# Requires ${required.join(", ")} in the shell that starts the CLI. Codex expands nothing in this file, and a stdio server's environment is an allowlist rather than an inheritance — env_vars below names the variable so Codex forwards the value your shell holds, and the value itself never enters this file. Source .env.mcp before running codex.`);
	if (withheld.length > 0) lines.push("# Withheld from args, because Codex passes arguments to the server verbatim and these would arrive as literal text rather than as the credential they reference:", ...withheld.map((entry) => `#   ${entry.rendered}   (needs ${entry.vars.join(", ")})`), "# env_vars cannot cover them — it fills the process environment, not the argument vector. Supply them from a launcher script that builds the argument at start-up, or drive this server from a client that expands config references (.mcp.json, .cursor/mcp.json).");
	lines.push(`[mcp_servers.${tomlKey(meta.id)}]`);
	lines.push(`command = ${tomlString(meta.command)}`);
	lines.push(`args = [${emitted.map(tomlString).join(", ")}]`);
	if (required.length > 0) lines.push(`env_vars = [${required.map(tomlString).join(", ")}]`);
	return lines.join("\n");
}
function stdioEntries(servers, dialect, extra = {}) {
	const entries = {};
	for (const meta of servers) {
		const env = envMap(meta, dialect);
		entries[meta.id] = {
			...extra,
			command: meta.command,
			args: args(meta, dialect),
			...env === void 0 ? {} : { env }
		};
	}
	return entries;
}
const TOML_BARE_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;
function tomlKey(key) {
	return TOML_BARE_KEY_PATTERN.test(key) ? key : tomlString(key);
}
function tomlString(value) {
	return `"${value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"").replaceAll("\n", "\\n").replaceAll("\r", "\\r").replaceAll("	", "\\t")}"`;
}
function planMcpEmissions(serverIds, tools, opts) {
	const requested = TOOLS.filter((tool) => tools.includes(tool));
	return [...new Set(requested.flatMap((tool) => TOOL_DIALECTS[tool]))].map((dialect) => ({
		dialect,
		path: DIALECT_PATH[dialect],
		content: renderDialect(dialect, serverIds, opts)
	}));
}
function renderDialect(dialect, serverIds, opts, mode = "emit") {
	switch (dialect) {
		case "claude-json": return emitClaudeMcpJson(serverIds, opts, mode);
		case "cursor-json": return emitCursorMcpJson(serverIds, opts, mode);
		case "vscode-json": return emitVsCodeServersJson(serverIds, opts, mode);
		case "copilot-env": return renderCopilotEnvFile(serverIds, opts, mode);
		case "codex-toml": return emitCodexToml(serverIds, opts, mode);
	}
}
function renderCopilotEnvFile(serverIds, opts, mode = "emit") {
	const secrets = requiredEnv(resolveServers(serverIds, opts?.packServers, mode)).map((requirement) => `${COPILOT_SECRET_PREFIX}${upperSnake(requirement.name)}`);
	const header = ["# GitHub Copilot coding agent — MCP configuration, one entry per selected server.", "# Paste each value into repository Settings → Copilot → MCP servers."];
	if (secrets.length > 0) header.push("# Credentials resolve from Agents secrets or variables, which must be named:", ...secrets.map((name) => `#   ${name}`), "# Agents, not Actions: only Agents secrets and variables prefixed COPILOT_MCP_ are", "# available to MCP configuration, so an Actions secret of the same name is never read.", "# Never put a secret VALUE in this file — it is not gitignored.");
	const entries = emitCopilotMcpEnv(serverIds, opts, mode).map((entry) => `${entry.name}=${entry.value}`);
	return `${[...header, ...entries].join("\n")}\n`;
}
//#endregion
//#region src/merge/reclaim.ts
var reclaim_exports = /* @__PURE__ */ __exportAll({
	formatReclaimReport: () => formatReclaimReport,
	sweepReclaimCandidates: () => sweepReclaimCandidates
});
const WINDOWS_ABSOLUTE_PATTERN$1 = /^(?:[A-Za-z]:|\\\\)/;
const ORDERING_PREFIX_PATTERN = /^\d{2}-/;
const REASON_RANK = {
	"adapter-removed": 0,
	"path-renamed": 1,
	deselected: 2
};
function shapeDefect(path) {
	if (path === "") return "is empty";
	if (path.includes("\0")) return "contains a NUL byte";
	if (path.startsWith("/") || path.startsWith("\\")) return "is an absolute path";
	if (WINDOWS_ABSOLUTE_PATTERN$1.test(path)) return "is an absolute path";
	if (path.includes("\\")) return "uses a backslash separator (ledger paths are POSIX)";
	if (path.split("/").includes("..")) return "climbs out of the repo with a `..` segment";
	return null;
}
function ledgerKey(path) {
	return path.startsWith("./") ? path.slice(2) : path;
}
function carriesEnginePrefix(name) {
	return carriesEngineContentPrefix(ORDERING_PREFIX_PATTERN.test(name) ? name.slice(3) : name);
}
const ENGINE_PREFIX_LIST = ENGINE_CONTENT_PREFIXES.map((prefix) => `\`${prefix}\``).join(" or ");
const SKILL_CONTAINER_SEGMENT = "skills";
function isEngineNamedPath(path) {
	return carriesEnginePrefix(basename(path));
}
function isEngineMintedSkillPath(path) {
	const segments = path.split("/");
	return segments.slice(0, -1).some((segment, index) => segments[index - 1] === SKILL_CONTAINER_SEGMENT && carriesEnginePrefix(segment));
}
function isStateDirPath(path) {
	return path.startsWith(`${STATE_DIR}/`);
}
function isHashProvable(path, hashes, trusted) {
	if (hashes.size === 0) return false;
	return isStateDirPath(path) || trusted.has(path);
}
function sha256(content) {
	return createHash("sha256").update(content).digest("hex");
}
function matchesRecordedHash(recorded, bytes, content) {
	if (recorded.has(sha256(bytes))) return true;
	const folded = content.replaceAll("\r\n", "\n");
	return folded !== content && recorded.has(sha256(folded));
}
function isWithin(candidate, root) {
	return candidate === root || candidate.startsWith(root + sep);
}
function isEngineAuthoredPrefix(before) {
	if (before.trim() === "") return true;
	const lines = before.split("\n").map((line) => line.replace(/\r$/, "").trim());
	let index = 0;
	while (index < lines.length && lines[index] === "") index++;
	if (lines[index] !== "---") return false;
	index++;
	while (index < lines.length && lines[index] !== "---") index++;
	if (index >= lines.length) return false;
	return lines.slice(index + 1).every((line) => line === "");
}
function groupByPath(candidates) {
	const groups = /* @__PURE__ */ new Map();
	for (const candidate of candidates) {
		const path = ledgerKey(candidate.entry.path);
		const label = `${candidate.reason} (${candidate.entry.adapter})`;
		const hash = candidate.entry.contentHash;
		const existing = groups.get(path);
		if (existing === void 0) {
			groups.set(path, {
				path,
				reason: candidate.reason,
				owners: [label],
				recordedHashes: new Set(hash === void 0 ? [] : [hash])
			});
			continue;
		}
		if (!existing.owners.includes(label)) existing.owners.push(label);
		if (hash !== void 0) existing.recordedHashes.add(hash);
		if (REASON_RANK[candidate.reason] < REASON_RANK[existing.reason]) existing.reason = candidate.reason;
	}
	return [...groups.values()];
}
const CO_OWNED_SHARED_NAME_REFUSAL = "The path is a hard link, so the entries this document holds carry a second name this tree cannot see and which may sit outside it. Removing the engine's own entries means rewriting what is left, which would publish it as an independent copy rather than editing the file both names share, so nothing was touched. Replace it with a regular file — copy the contents to a new file and move that over this name — or edit it by hand.";
function errnoCode$1(err) {
	return err?.code;
}
function describeError$3(err) {
	return err instanceof Error ? err.message : String(err);
}
function skip$1(action, detail) {
	return {
		kind: "skip",
		action,
		detail
	};
}
async function planFor(group, ctx) {
	const path = group.path;
	const defect = shapeDefect(path);
	if (defect !== null) return skip$1("skipped-unsafe-path", `The recorded path ${defect}, so the sweep will not resolve it against the repo root.`);
	const engineNamed = isEngineNamedPath(path) || isEngineMintedSkillPath(path);
	const prefixedAncestor = path.split("/").slice(0, -1).some(carriesEnginePrefix);
	const hashProvable = isHashProvable(path, group.recordedHashes, ctx.trusted);
	if (!engineNamed && !prefixedAncestor && !hashProvable && !ctx.trusted.has(path)) return skip$1("skipped-unsafe-path", `\`${basename(path)}\` carries no ${ENGINE_PREFIX_LIST} ownership marker on itself or on an engine-minted skill directory above it, records no content hash admissible for its location, and is not on the trusted allowlist, so the engine cannot claim to have written it.`);
	const recordedTarget = resolve(ctx.root, path);
	let parentReal;
	let parentIdentity;
	try {
		parentReal = await realpath(dirname(recordedTarget));
		parentIdentity = await readDirectoryIdentity(parentReal);
	} catch (err) {
		if (errnoCode$1(err) === "ENOENT") return skip$1("skipped-missing", "The parent directory is already gone.");
		return skip$1("skipped-unsafe-path", `The parent directory could not be resolved: ${describeError$3(err)}.`);
	}
	if (!isWithin(parentReal, ctx.root)) return skip$1("skipped-unsafe-path", `The parent directory resolves to ${parentReal}, outside the repo root — a symlinked directory on the path.`);
	const target = join(parentReal, path.slice(path.lastIndexOf("/") + 1));
	let stats;
	try {
		stats = await lstat(target);
	} catch (err) {
		if (errnoCode$1(err) === "ENOENT") return skip$1("skipped-missing", "Already absent from disk.");
		return skip$1("skipped-unsafe-path", `The file could not be inspected: ${describeError$3(err)}.`);
	}
	if (stats.isDirectory()) return skip$1("skipped-unsafe-path", "A directory occupies the recorded path; the sweep unlinks files only and never removes a tree.");
	if (stats.isSymbolicLink()) return skip$1("skipped-unsafe-path", "The path is a symbolic link; the engine emits regular files, so this is not the file that was recorded.");
	if (!stats.isFile()) return skip$1("skipped-unsafe-path", "The path is not a regular file.");
	const pin = {
		parentReal,
		parentIdentity,
		fileIdentity: {
			dev: stats.dev,
			ino: stats.ino
		}
	};
	let bytes;
	try {
		bytes = await readFile(target);
	} catch (err) {
		if (errnoCode$1(err) === "ENOENT") return skip$1("skipped-missing", "Removed between the inspection and the read.");
		return skip$1("skipped-unsafe-path", `The file could not be read, so its ownership stayed unproven: ${describeError$3(err)}.`);
	}
	const content = bytes.toString("utf-8");
	const reduce = ctx.coOwned.get(path);
	if (reduce !== void 0) {
		const reduction = reduce(content);
		if (reduction.kind === "untouched") return skip$1("skipped-user-content", reduction.detail);
		const drifted = group.recordedHashes.size > 0 && !matchesRecordedHash(group.recordedHashes, bytes, content);
		const driftDetail = drifted ? " The bytes no longer hash to what the ledger recorded writing here, so the engine's keys may carry rows of yours; the previous file is backed up first." : "";
		if (reduction.kind === "engine-only") return {
			kind: "delete",
			target,
			pin,
			detail: reduction.detail + driftDetail,
			...drifted ? { backup: content } : {}
		};
		if (isSharedRegularFile(stats)) return skip$1("skipped-unsafe-path", CO_OWNED_SHARED_NAME_REFUSAL);
		return {
			kind: "strip",
			action: "co-owned-reduced",
			target,
			pin,
			keep: reduction.content,
			detail: reduction.detail + driftDetail,
			...drifted ? { backup: content } : {}
		};
	}
	const hashMismatchDetail = "The bytes no longer hash to what the ledger recorded writing here, so the file has been edited since and is left in place with its changes.";
	const hashMatched = group.recordedHashes.size > 0 && matchesRecordedHash(group.recordedHashes, bytes, content);
	const hashVetoed = group.recordedHashes.size > 0 && !hashMatched;
	if (hashProvable && hashMatched) return {
		kind: "delete",
		target,
		pin,
		detail: "Whole-file engine output: the bytes still hash to what the ledger recorded writing here, so nothing in the file is user-authored."
	};
	const split = splitAtManagedBlock(content, target);
	if (split === null) {
		if (hashVetoed) return skip$1("skipped-user-content", hashMismatchDetail);
		if (engineNamed) return {
			kind: "delete",
			target,
			pin,
			detail: "Whole-file engine output: the name is engine-minted and there is no managed block whose surroundings could be user-authored."
		};
		return skip$1("skipped-user-content", prefixedAncestor ? `\`${basename(path)}\` sits under a directory carrying an engine prefix (${ENGINE_PREFIX_LIST}), but its own name does not and it holds no managed block, so what the engine can claim to have minted is the directory, not this file.` : "Trusted shared file with no managed block to strip. The engine never deletes a co-owned file wholesale, so its engine-written entries are left to the class-specific filter.");
	}
	if (!(!isEngineAuthoredPrefix(split.before) || split.after.trim() !== "")) {
		if (hashVetoed) return skip$1("skipped-user-content", hashMismatchDetail);
		return {
			kind: "delete",
			target,
			pin,
			detail: "The managed block spans the whole file — there are no user bytes outside it."
		};
	}
	if (isSharedRegularFile(stats)) return skip$1("skipped-unsafe-path", "The path is a hard link, so the bytes outside its managed block carry a second name this tree cannot see and which may sit outside it. Stripping the block would rewrite them as an independent copy rather than removing the block from the file both names share, so nothing was touched. Replace it with a regular file — copy the contents to a new file and move that over this name — or remove the file by hand.");
	const keep = split.before + split.after;
	return {
		kind: "strip",
		action: "managed-block-stripped",
		target,
		pin,
		keep,
		detail: `User content outside the managed block vetoes deletion, so only the block is removed and the remaining ${keep.length} byte(s) are preserved verbatim.`
	};
}
async function verifyPinStillHolds(target, pin, ctx) {
	const changed = {
		kind: "refused",
		detail: "The path changed under the sweep between the safety check and the write, so it is no longer provably the file the gates cleared. Nothing was touched; re-run once no other process is rewriting this tree."
	};
	try {
		const parentReal = await realpath(dirname(target));
		if (parentReal !== pin.parentReal || !isWithin(parentReal, ctx.root)) return changed;
		if (!sameDirectoryIdentity(await readDirectoryIdentity(parentReal), pin.parentIdentity)) return changed;
		const stats = await lstat(target);
		if (!stats.isFile() || stats.isSymbolicLink()) return changed;
		if (!sameDirectoryIdentity({
			dev: stats.dev,
			ino: stats.ino
		}, pin.fileIdentity)) return changed;
		return { kind: "holds" };
	} catch (err) {
		if (errnoCode$1(err) === "ENOENT") return { kind: "missing" };
		return {
			kind: "refused",
			detail: `The path could not be re-checked before the write, so nothing was done: ${describeError$3(err)}.`
		};
	}
}
async function pruneEmptyParents(target, ctx) {
	let dir = dirname(target);
	while (dir !== ctx.stateDir && isWithin(dir, ctx.root) && dir !== ctx.root) {
		try {
			await rmdir(dir);
		} catch {
			return;
		}
		dir = dirname(dir);
	}
}
async function sweepReclaimCandidates(candidates, opts) {
	const entries = [];
	const groups = groupByPath(candidates);
	if (groups.length === 0) return {
		entries,
		consent: opts.consent,
		deletedCount: 0,
		strippedCount: 0,
		skippedCount: 0
	};
	let root;
	try {
		root = await realpath(opts.rootDir);
	} catch (err) {
		throw new EngineError(`The reclaim sweep cannot resolve the repo root ${opts.rootDir}: ${describeError$3(err)}. Pass the path of an existing repository root — every ledger path resolves against it, and a sweep with no root to contain it will not run.`, {
			code: "VALIDATION_ERROR",
			cause: err
		});
	}
	const ctx = {
		root,
		stateDir: resolve(root, STATE_DIR),
		trusted: opts.trustedExactPaths ?? /* @__PURE__ */ new Set(),
		coOwned: opts.coOwnedPaths ?? /* @__PURE__ */ new Map()
	};
	const stamp = (opts.now ?? /* @__PURE__ */ new Date()).toISOString();
	for (const group of groups) {
		const plan = await planFor(group, ctx);
		const provenance = group.owners.length > 1 ? ` Recorded by ${group.owners.join(" and ")}.` : "";
		const base = {
			path: group.path,
			candidateReason: group.reason
		};
		if (plan.kind === "skip") {
			entries.push({
				...base,
				action: plan.action,
				detail: plan.detail + provenance
			});
			continue;
		}
		if (!opts.consent) {
			const verb = plan.kind === "delete" ? "delete this path" : plan.action === "co-owned-reduced" ? "remove the engine's own content from this path and keep the rest" : "strip the managed block from this path";
			entries.push({
				...base,
				action: "dry-run",
				detail: `Consent would ${verb}. ${plan.detail}${provenance}`
			});
			continue;
		}
		const verdict = await verifyPinStillHolds(plan.target, plan.pin, ctx);
		if (verdict.kind === "refused") {
			entries.push({
				...base,
				action: "skipped-unsafe-path",
				detail: verdict.detail + provenance
			});
			continue;
		}
		if (verdict.kind === "missing" && plan.kind === "strip") {
			entries.push({
				...base,
				action: "skipped-missing",
				detail: `Removed between the safety check and the write, so there was nothing to ${plan.action === "co-owned-reduced" ? "reduce" : "strip"}; the file was not re-created.${provenance}`
			});
			continue;
		}
		let backedUp = "";
		if (plan.backup !== void 0) try {
			backedUp = ` Your previous file is at ${await backupBeforeOverwrite(plan.target, plan.backup, "reclaim", ctx.root)}.`;
		} catch (err) {
			entries.push({
				...base,
				action: "skipped-unsafe-path",
				detail: `The previous file could not be backed up, so nothing was removed: ${describeError$3(err)}.${provenance}`
			});
			continue;
		}
		if (plan.kind === "delete") {
			try {
				await unlink(plan.target);
			} catch (err) {
				entries.push(errnoCode$1(err) === "ENOENT" ? {
					...base,
					action: "skipped-missing",
					detail: `Removed by another process before the sweep reached it.${provenance}`
				} : {
					...base,
					action: "skipped-unsafe-path",
					detail: `The unlink failed and the file is still on disk: ${describeError$3(err)}.${provenance}`
				});
				continue;
			}
			await pruneEmptyParents(plan.target, ctx);
			entries.push({
				...base,
				action: "deleted",
				detail: `${plan.detail}${backedUp} Deleted at ${stamp}.${provenance}`
			});
			continue;
		}
		try {
			await atomicWriteFile(plan.target, plan.keep, { boundaryDir: ctx.root });
		} catch (err) {
			const failure = plan.action === "co-owned-reduced" ? "The engine's own content could not be removed" : "The managed block could not be stripped";
			entries.push({
				...base,
				action: "skipped-unsafe-path",
				detail: `${failure} and the file is unchanged: ${describeError$3(err)}.${provenance}`
			});
			continue;
		}
		entries.push({
			...base,
			action: plan.action,
			detail: `${plan.detail}${backedUp} ${plan.action === "co-owned-reduced" ? "Reduced" : "Stripped"} at ${stamp}.${provenance}`
		});
	}
	return {
		entries,
		consent: opts.consent,
		deletedCount: entries.filter((entry) => entry.action === "deleted").length,
		strippedCount: entries.filter((entry) => entry.action === "managed-block-stripped" || entry.action === "co-owned-reduced").length,
		skippedCount: entries.filter((entry) => entry.action.startsWith("skipped-")).length
	};
}
function formatReclaimReport(report) {
	if (report.entries.length === 0) return "";
	const rows = report.entries.map((entry) => `  ${entry.action}  ${entry.path} — ${entry.detail}`);
	if (report.consent) return [`Reclaim sweep: ${report.deletedCount} deleted, ${report.strippedCount} rewritten to keep user content, ${report.skippedCount} skipped.`, ...rows].join("\n");
	const planned = report.entries.filter((entry) => entry.action === "dry-run").length;
	const refused = report.entries.length - planned;
	const refusedClause = refused === 0 ? "" : ` ${planned} would be acted on, ${refused} refused by a safety gate.`;
	return [`Reclaim dry run: ${report.entries.length} orphaned path(s) inspected, nothing written.${refusedClause} Re-run with consent to apply.`, ...rows].join("\n");
}
//#endregion
//#region src/emit/stateScaffold.ts
var stateScaffold_exports = /* @__PURE__ */ __exportAll({
	STATE_KEEP_FILE: () => STATE_KEEP_FILE,
	STATE_SUBDIRS: () => STATE_SUBDIRS,
	ensureStateScaffold: () => ensureStateScaffold,
	stateKeepPaths: () => stateKeepPaths
});
const STATE_SUBDIRS = ["learnings", "handoffs"];
const STATE_KEEP_FILE = ".gitkeep";
const STATE_KEEP_CONTENT = "# Keeps this directory in git, which tracks files rather than directories.\n# The setup writes learnings and handoffs here; remove this file and the\n# directory disappears from a fresh clone.\n";
function stateDirPath(name) {
	return `${STATE_DIR}/${name}`;
}
function stateKeepPaths() {
	return STATE_SUBDIRS.map((name) => `${stateDirPath(name)}/${STATE_KEEP_FILE}`);
}
async function ensureStateScaffold(rootDir, opts = {}) {
	if (opts.dryRun === true) return STATE_SUBDIRS.map(stateDirPath);
	return (await Promise.all(STATE_SUBDIRS.map(async (name) => {
		const dir = join(rootDir, STATE_DIR, name);
		const madeDir = await mkdir(dir, { recursive: true });
		try {
			await writeFile(join(dir, STATE_KEEP_FILE), STATE_KEEP_CONTENT, { flag: "wx" });
		} catch (err) {
			if (err?.code !== "EEXIST") throw err;
		}
		return madeDir === void 0 ? null : stateDirPath(name);
	}))).filter((row) => row !== null);
}
//#endregion
//#region src/mcp/secretScan.ts
var secretScan_exports = /* @__PURE__ */ __exportAll({
	SECRET_PATTERNS: () => SECRET_PATTERNS,
	detectSecrets: () => detectSecrets,
	formatSecretFindings: () => formatSecretFindings,
	maskValue: () => maskValue,
	scanValueForSecrets: () => scanValueForSecrets
});
const SECRET_PATTERNS = [
	{
		id: "aws-access-key-id",
		description: "Cloud provider access key ID (AKIA-prefixed)",
		pattern: /(?:^|[^A-Za-z0-9])AKIA[0-9A-Z]{16}(?![A-Za-z0-9])/
	},
	{
		id: "github-token",
		description: "Source-forge personal, OAuth, or app token (gh*_ prefixed)",
		pattern: /\bgh[pousr]_[A-Za-z0-9]{36}\b/
	},
	{
		id: "github-fine-grained-token",
		description: "Source-forge fine-grained personal access token",
		pattern: /\bgithub_pat_[A-Za-z0-9_]{82}\b/
	},
	{
		id: "gitlab-access-token",
		description: "Source-forge personal or project access token (glpat- prefixed)",
		pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/
	},
	{
		id: "slack-token",
		description: "Chat platform bot, user, or app token (xox*- prefixed)",
		pattern: /\bxox[abporas]-[A-Za-z0-9-]{10,}\b/
	},
	{
		id: "stripe-api-key",
		description: "Payment provider live or test API key (sk_/pk_ prefixed)",
		pattern: /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/
	},
	{
		id: "sk-prefixed-api-key",
		description: "Provider API key using the sk- secret-key prefix",
		pattern: /\bsk-(?:[A-Za-z0-9]{1,12}-)?[A-Za-z0-9_-]{20,}\b/
	},
	{
		id: "pem-private-key",
		description: "PEM-encoded private key block",
		pattern: /-----BEGIN (?:[A-Z0-9]+ ){0,3}PRIVATE KEY-----/
	},
	{
		id: "bearer-token",
		description: "Authorization bearer token stored as a value",
		pattern: /^Bearer\s+[A-Za-z0-9\-._~+/]+=*$/i
	},
	{
		id: "inline-api-key-assignment",
		description: "API key assigned inline inside the value",
		pattern: /(?:api[_-]?key|apikey|api[_-]?secret|access[_-]?key)\s*[:=]\s*\S+/i
	},
	{
		id: "inline-password-assignment",
		description: "Password assigned inline inside the value",
		pattern: /(?:password|passwd|pwd)\s*[:=]\s*\S+/i
	},
	{
		id: "credentialed-connection-string",
		description: "Database or broker URL with embedded credentials",
		pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqps?):\/\/[^:@/\s]+:[^@/\s]+@/i
	},
	{
		id: "azure-devops-pat",
		description: "Cloud DevOps personal access token",
		pattern: /^[A-Za-z0-9]{75}AZDO[A-Za-z0-9]{5}$/
	},
	{
		id: "linear-api-key",
		description: "Issue tracker API key (lin_api_ prefixed)",
		pattern: /\blin_api_[A-Za-z0-9]{40,}\b/
	},
	{
		id: "sentry-auth-token",
		description: "Error monitoring auth token (sntrys_ prefixed)",
		pattern: /\bsntrys_[A-Za-z0-9]{40,}\b/
	},
	{
		id: "high-entropy-string",
		description: "Long base64-shaped run that may be an encoded credential",
		pattern: /[A-Za-z0-9+/]{40,}={0,2}/
	}
];
const CONTEXT_REQUIRED_PATTERN_IDS = /* @__PURE__ */ new Set(["high-entropy-string"]);
const CREDENTIAL_NAME_PATTERN = /KEY|SECRET|TOKEN|PASSWORD|PASSWD|PWD|AUTH|CREDENTIAL/i;
const PADDED_BASE64_CREDENTIAL_LENGTH = 60;
function hasCredentialContext(varName, value) {
	if (CREDENTIAL_NAME_PATTERN.test(varName)) return true;
	return value.endsWith("=") && value.length >= PADDED_BASE64_CREDENTIAL_LENGTH;
}
const MASK_MIN_LENGTH = 7;
const MASK_HEAD_LENGTH = 4;
const MASK_RUN = "*".repeat(8);
function printable(fragment) {
	return fragment.replace(/[\s\p{C}]/gu, " ");
}
function maskValue(value) {
	if (value.length < MASK_MIN_LENGTH) return MASK_RUN;
	const head = printable(value.slice(0, MASK_HEAD_LENGTH));
	const tail = printable(value.slice(-2));
	return `${head}${MASK_RUN}${tail}`;
}
function scanValueForSecrets(name, value) {
	if (value.trim() === "") return [];
	const direct = [];
	const contextual = [];
	for (const { id, pattern } of SECRET_PATTERNS) {
		if (!pattern.test(value)) continue;
		if (CONTEXT_REQUIRED_PATTERN_IDS.has(id)) contextual.push(id);
		else direct.push(id);
	}
	const matchedIds = direct.length > 0 || hasCredentialContext(name, value) ? [...direct, ...contextual] : direct;
	if (matchedIds.length === 0) return [];
	const maskedValue = maskValue(value);
	const seen = /* @__PURE__ */ new Set();
	const findings = [];
	for (const patternId of matchedIds) {
		if (seen.has(patternId)) continue;
		seen.add(patternId);
		findings.push({
			patternId,
			varName: name,
			maskedValue
		});
	}
	return findings;
}
function detectSecrets(vars) {
	const findings = [];
	for (const [name, value] of Object.entries(vars)) findings.push(...scanValueForSecrets(name, value));
	return {
		findings,
		clean: findings.length === 0
	};
}
const PATTERN_DESCRIPTIONS = new Map(SECRET_PATTERNS.map((secretPattern) => [secretPattern.id, secretPattern.description]));
function formatSecretFindings(result) {
	if (result.findings.length === 0) return "No secret-shaped values detected.";
	const lines = [`Detected ${result.findings.length} secret-shaped value(s):`];
	for (const finding of result.findings) {
		const label = PATTERN_DESCRIPTIONS.get(finding.patternId) ?? finding.patternId;
		lines.push(`  ${finding.varName ?? "(value)"}: ${label} [${finding.patternId}] ${finding.maskedValue}`);
	}
	lines.push("Move these values to a secrets manager and reference them by name, not by literal.");
	return lines.join("\n");
}
//#endregion
//#region src/pack/permissions.ts
var permissions_exports = /* @__PURE__ */ __exportAll({
	assertSafePackRelPath: () => assertSafePackRelPath,
	checkAgentCapabilities: () => checkAgentCapabilities,
	checkPermissions: () => checkPermissions,
	readPermissions: () => readPermissions
});
const PERMISSIONS_SOURCE = "pack.json `permissions`";
const PERMISSIONS_FIELDS = ["toolFootprint", "touchedPaths"];
const GLOB_SUFFIX = "/**";
function firstControlChar(value) {
	for (const char of value) {
		const code = char.codePointAt(0) ?? 0;
		if (code < 32 || code === 127) return `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
	}
}
function assertSafePackRelPath(relPath, context) {
	const refuse = (why) => {
		throw new EngineError(`Unsafe pack path in ${context}: ${JSON.stringify(relPath)} (${why}). Pack-declared paths are plain relative POSIX paths.`, { code: "VALIDATION_ERROR" });
	};
	if (relPath === "") refuse("empty path");
	if (relPath.includes("\0")) refuse("null byte");
	const control = firstControlChar(relPath);
	if (control !== void 0) refuse(`control character ${control}`);
	if (relPath.includes("\\")) refuse("backslash separator");
	if (isAbsolute(relPath) || relPath.startsWith("/") || /^[A-Za-z]:/.test(relPath)) refuse("absolute path");
	if (relPath.split("/").includes("..")) refuse("`..` segment");
	const normalized = normalize(relPath);
	if (normalized.startsWith("..") || isAbsolute(normalized)) refuse("normalises outside the pack root");
}
function assertTouchedPathDeclaration(entry) {
	const base = entry.endsWith(GLOB_SUFFIX) ? entry.slice(0, -3) : entry;
	if (base.includes("*")) throw new EngineError(`\`touchedPaths\` entry ${JSON.stringify(entry)}: glob support is limited to a single trailing "${GLOB_SUFFIX}".`, { code: "VALIDATION_ERROR" });
	assertSafePackRelPath(base, "`permissions.touchedPaths`");
}
function readPermissions(raw) {
	const value = Object.hasOwn(raw, "permissions") ? raw.permissions : void 0;
	if (value === void 0) return void 0;
	if (!isPlainObject$2(value)) throw new EngineError(`${PERMISSIONS_SOURCE}: must be an object with optional \`toolFootprint\` and \`touchedPaths\` arrays.`, { code: "VALIDATION_ERROR" });
	const problems = [];
	const attempt = (read) => {
		try {
			return read();
		} catch (cause) {
			problems.push(cause instanceof Error ? cause.message : String(cause));
			return;
		}
	};
	attempt(() => rejectUnknownFields(value, PERMISSIONS_FIELDS, PERMISSIONS_SOURCE));
	const footprint = attempt(() => requireStringArray(value, "toolFootprint", {
		source: PERMISSIONS_SOURCE,
		optional: true
	}));
	if (footprint !== void 0) {
		const unknown = [...new Set(footprint.filter((entry) => !isToolCategory(entry)))];
		if (unknown.length > 0) problems.push(`\`toolFootprint\` names unknown tool categor${unknown.length === 1 ? "y" : "ies"} ${unknown.map((entry) => JSON.stringify(entry)).join(", ")}. Valid categories: ${ALL_TOOL_CATEGORIES.join(", ")}.`);
	}
	const declaredPaths = attempt(() => requireStringArray(value, "touchedPaths", {
		source: PERMISSIONS_SOURCE,
		optional: true
	}));
	for (const entry of declaredPaths ?? []) attempt(() => assertTouchedPathDeclaration(entry));
	if (problems.length > 0) throw new EngineError(`Invalid ${PERMISSIONS_SOURCE}:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`, { code: "VALIDATION_ERROR" });
	return {
		...footprint === void 0 ? {} : { toolFootprint: [...new Set(footprint)] },
		...declaredPaths === void 0 ? {} : { touchedPaths: [...new Set(declaredPaths)] }
	};
}
function checkPermissions(manifest, _files) {
	return manifest.permissions === void 0 ? "n/a" : "pass";
}
const AGENT_DIR = "agents/";
const MARKDOWN_EXTENSION = ".md";
const CAPABILITIES_FIELD = "capabilities";
const SPAWN_CATEGORY = "spawn";
const GRANTABLE_AGENT_CATEGORIES = FUNCTIONAL_TOOL_CATEGORIES.filter((category) => category !== SPAWN_CATEGORY);
function isAgentFile(relPath) {
	return relPath.startsWith(AGENT_DIR) && relPath.toLowerCase().endsWith(MARKDOWN_EXTENSION);
}
function checkAgentCapabilities(files, permissions) {
	const footprint = (permissions?.toolFootprint ?? []).filter((entry) => GRANTABLE_AGENT_CATEGORIES.includes(entry));
	const declared = new Set(footprint);
	const footprintLabel = footprint.length === 0 ? "the pack declares none" : footprint.join(", ");
	const problems = /* @__PURE__ */ new Set();
	for (const file of files) {
		if (!isAgentFile(file.relPath)) continue;
		let capabilities;
		try {
			capabilities = requireStringArray(file.frontmatter, CAPABILITIES_FIELD, {
				source: file.relPath,
				optional: true
			});
		} catch (cause) {
			problems.add(cause instanceof Error ? cause.message : String(cause));
			continue;
		}
		for (const capability of capabilities ?? []) {
			const quoted = JSON.stringify(capability);
			if (capability === SPAWN_CATEGORY) problems.add(`${file.relPath}: \`${SPAWN_CATEGORY}\` is never granted to a pack agent — a spawned agent carries its own grant, so delegation is the one capability the footprint cannot bound. Orchestrate from a command instead.`);
			else if (!isToolCategory(capability)) problems.add(`${file.relPath}: unknown capability ${quoted}. Grantable categories: ${GRANTABLE_AGENT_CATEGORIES.join(", ")}.`);
			else if (isReservedToolCategory(capability)) problems.add(`${file.relPath}: capability ${quoted} is a reserved category that grants nothing on any client today. Name the functional category the agent actually needs.`);
			else if (!declared.has(capability)) problems.add(`${file.relPath}: capability ${quoted} is outside the pack's declared tool footprint (${footprintLabel}). Add it to \`permissions.toolFootprint\` — where the operator reads it before installing — or drop it from the agent.`);
		}
	}
	if (problems.size > 0) throw new EngineError(`Pack agent capabilities refused:\n${[...problems].map((problem) => `  - ${problem}`).join("\n")}`, { code: "VALIDATION_ERROR" });
	return "pass";
}
//#endregion
//#region src/pack/manifest.ts
var manifest_exports$1 = /* @__PURE__ */ __exportAll({
	BANNED_LIFECYCLE_SCRIPTS: () => BANNED_LIFECYCLE_SCRIPTS,
	DEFAULT_MAX_FOOTPRINT_BYTES: () => DEFAULT_MAX_FOOTPRINT_BYTES,
	MAX_PACK_FILE_COUNT: () => 500,
	PACK_CONTENT_CLASSES: () => PACK_CONTENT_CLASSES,
	PACK_MANIFEST_FILE: () => PACK_MANIFEST_FILE,
	PACK_SOURCE_KINDS: () => PACK_SOURCE_KINDS,
	SIGNER_GRAMMAR: () => SIGNER_GRAMMAR,
	SIGSTORE_SIGNING_METHOD: () => SIGSTORE_SIGNING_METHOD,
	assertSafePackRelPath: () => assertSafePackRelPath,
	assertUniquePackServerIds: () => assertUniquePackServerIds,
	checkDeclaredTools: () => checkDeclaredTools,
	checkFootprint: () => checkFootprint,
	checkLifecycleScripts: () => checkLifecycleScripts,
	checkMcpServerDefinitions: () => checkMcpServerDefinitions,
	checkRuleActivation: () => checkRuleActivation,
	enumeratePackContent: () => enumeratePackContent,
	packNameMatchesSource: () => packNameMatchesSource,
	parseSignerPin: () => parseSignerPin,
	readPackManifest: () => readPackManifest,
	resolvePackSource: () => resolvePackSource,
	scanPackBodies: () => scanPackBodies,
	validatePackManifest: () => validatePackManifest,
	validatePackMcpServer: () => validatePackMcpServer,
	verifyIntegrityMap: () => verifyIntegrityMap,
	verifySigningDeclaration: () => verifySigningDeclaration
});
const PACK_MANIFEST_FILE = "pack.json";
const BANNED_LIFECYCLE_SCRIPTS = [
	"preinstall",
	"install",
	"postinstall",
	"prepare",
	"prepack",
	"postpack",
	"prepublish",
	"prepublishOnly",
	"publish",
	"postpublish",
	"preuninstall",
	"uninstall",
	"postuninstall",
	"preversion",
	"version",
	"postversion",
	"prestart",
	"start",
	"poststart",
	"prerestart",
	"restart",
	"postrestart",
	"prestop",
	"stop",
	"poststop",
	"pretest",
	"test",
	"posttest",
	"dependencies"
];
const BANNED_LIFECYCLE_SCRIPT_SET = new Set(BANNED_LIFECYCLE_SCRIPTS);
const PACK_CONTENT_CLASSES = [
	"agents",
	"skills",
	"rules",
	"commands",
	"hooks",
	"mcp_servers"
];
const LIVE_CLASS_LOOKUP = new Set(PACK_CONTENT_CLASSES);
const UNCONSUMED_CONTENT_DIRS = { prompts: "the engine emits no prompts class, so its files could never be read after install" };
const TEXT_CONTENT_EXTENSIONS = /* @__PURE__ */ new Set([
	".md",
	".mdc",
	".txt",
	".yaml",
	".yml",
	".json"
]);
const ARTIFACT_EXTENSIONS = /* @__PURE__ */ new Set([".md"]);
const CLASS_CONTENT_EXTENSIONS = {
	agents: ARTIFACT_EXTENSIONS,
	skills: TEXT_CONTENT_EXTENSIONS,
	rules: /* @__PURE__ */ new Set([".md", ".mdc"]),
	commands: ARTIFACT_EXTENSIONS,
	hooks: /* @__PURE__ */ new Set([
		".json",
		".yaml",
		".yml"
	]),
	mcp_servers: /* @__PURE__ */ new Set([".json"])
};
const FRONTMATTER_EXTENSIONS = /* @__PURE__ */ new Set([".md", ".mdc"]);
const SKILL_ARTIFACT_FILE = "SKILL.md";
function classExtensionsFor(contentClass, relPath) {
	if (contentClass !== "skills") return CLASS_CONTENT_EXTENSIONS[contentClass];
	return relPath.split("/").length === 3 ? ARTIFACT_EXTENSIONS : TEXT_CONTENT_EXTENSIONS;
}
const READ_CONCURRENCY$4 = 8;
const PACK_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i;
const DEFAULT_MAX_FOOTPRINT_BYTES = 5242880;
const PACK_BODY_PROMOTED_ROWS = /* @__PURE__ */ new Set(["homoglyph-instruction-mask", "combining-mark-instruction-mask"]);
const asBlockSeverity = (row) => row.severity === "block" ? row : {
	id: row.id,
	pattern: row.pattern,
	severity: "block",
	description: row.description
};
const PACK_BODY_PROXIMITY_WINDOW = 400;
const BOUNDED_REPEAT = /\{0,(\d+)\}/g;
function widenProximityWindows(row) {
	const source = row.pattern.source.replaceAll(BOUNDED_REPEAT, (whole, bound) => Number(bound) >= PACK_BODY_PROXIMITY_WINDOW ? whole : `{0,${PACK_BODY_PROXIMITY_WINDOW}}`);
	if (source === row.pattern.source) return row;
	return {
		id: row.id,
		pattern: new RegExp(source, row.pattern.flags),
		severity: row.severity,
		description: row.description
	};
}
const PACK_BODY_DENY_PATTERNS = [
	...CONTENT_DENY_PATTERNS,
	...INJECTION_PATTERNS,
	...MCP_POISONING_PATTERNS
].filter((row) => row.severity === "block" || PACK_BODY_PROMOTED_ROWS.has(row.id)).map(asBlockSeverity).map(widenProximityWindows);
const PACK_MANIFEST_FIELDS = [
	"name",
	"version",
	"description",
	"signing",
	"integrity",
	"declaredTools",
	"permissions",
	"maxFootprintBytes"
];
const SIGNING_FIELDS = [
	"method",
	"signer",
	"bundlePath"
];
const SIGSTORE_SIGNING_METHOD = "sigstore";
const SIGNER_GRAMMAR = "`signing.signer` must read \"<oidc-issuer> <certificate-identity>\": the OIDC issuer URL, one space, then the identity in the certificate's subject alternative name (an email address or a URI). Neither field may contain a space.";
function parseSignerPin(signer) {
	const parts = signer.split(" ");
	if (parts.length !== 2) return null;
	const [issuer, identity] = parts;
	if (issuer === void 0 || identity === void 0) return null;
	if (issuer === "" || identity === "") return null;
	return {
		issuer,
		identity
	};
}
const PACK_SOURCE_KINDS = [
	"local-path",
	"npm-package",
	"catalog-pinned"
];
function describeErrno(cause) {
	return cause.code ?? (cause instanceof Error ? cause.message : String(cause));
}
function resolveInside(root, relPath, context) {
	const resolved = resolve(root, relPath);
	if (resolved !== root && !resolved.startsWith(root + sep)) throw new EngineError(`Unsafe pack path in ${context}: ${JSON.stringify(relPath)} resolves outside ${root}.`, { code: "VALIDATION_ERROR" });
	return resolved;
}
function looksLikePathSpec(spec) {
	return spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("~") || spec.includes("\\") || /^[A-Za-z]:/.test(spec);
}
function expandHome(spec) {
	if (spec === "~") return homedir();
	if (spec.startsWith("~/") || spec.startsWith("~\\")) return join(homedir(), spec.slice(2));
	return spec;
}
async function isDirectory$1(path) {
	try {
		return (await stat(path)).isDirectory();
	} catch (cause) {
		const code = cause.code;
		if (code === "ENOENT" || code === "ENOTDIR") return false;
		throw new EngineError(`Cannot stat ${path}: ${describeErrno(cause)}.`, {
			code: "FS_ERROR",
			cause
		});
	}
}
async function resolvePackSource(projectRoot, spec) {
	const trimmed = spec.trim();
	if (trimmed === "") throw new EngineError("Empty pack spec. Pass a pack directory (./packs/ops) or the name of an installed pack package.", { code: "VALIDATION_ERROR" });
	if (looksLikePathSpec(trimmed)) {
		const packRoot = resolve(projectRoot, expandHome(trimmed));
		if (!await isDirectory$1(packRoot)) throw new EngineError(`No pack directory at ${packRoot}. A local pack is a directory containing ${PACK_MANIFEST_FILE}.`, { code: "CONFIG_ERROR" });
		return {
			kind: "local-path",
			packRoot
		};
	}
	if (!PACK_NAME_PATTERN.test(trimmed)) throw new EngineError(`Invalid pack spec ${JSON.stringify(trimmed)}. Expected a directory path (./packs/ops) or a lower-case package name (optionally @scope/name).`, { code: "VALIDATION_ERROR" });
	const packRoot = join(projectRoot, "node_modules", ...trimmed.split("/"));
	if (!await isDirectory$1(packRoot)) throw new EngineError(`Pack package "${trimmed}" is not installed under node_modules/. Install it yourself first — \`npm install --ignore-scripts ${trimmed}\` — then re-run. Packs are never fetched over the network here.`, { code: "CONFIG_ERROR" });
	return {
		kind: "npm-package",
		packRoot,
		sourceName: trimmed
	};
}
function packNameMatchesSource(declaredName, sourceName) {
	if (declaredName === sourceName) return true;
	return declaredName === sourceName.replace("@", "").replace("/", "__");
}
function manifestError(problems) {
	const list = problems.map((problem) => `  - ${problem}`).join("\n");
	return new EngineError(`Invalid ${PACK_MANIFEST_FILE}:\n${list}`, { code: "VALIDATION_ERROR" });
}
function requiredString(raw, field) {
	return requireString(raw, field, { source: PACK_MANIFEST_FILE });
}
function readName(raw) {
	const name = requiredString(raw, "name");
	if (!PACK_NAME_PATTERN.test(name)) throw new EngineError(`${PACK_MANIFEST_FILE}: \`name\` ${JSON.stringify(name)} must be a lower-case package name (optionally @scope/name) with no path characters.`, { code: "VALIDATION_ERROR" });
	return name;
}
function readVersion(raw) {
	const version = requiredString(raw, "version");
	if (semver.valid(version) === null) throw new EngineError(`${PACK_MANIFEST_FILE}: \`version\` ${JSON.stringify(version)} must be a semver version (1.2.3).`, { code: "VALIDATION_ERROR" });
	return version;
}
function readSigning(raw) {
	const value = Object.hasOwn(raw, "signing") ? raw.signing : void 0;
	if (value === void 0) return void 0;
	const source = `${PACK_MANIFEST_FILE} \`signing\``;
	if (!isPlainObject$2(value)) throw new EngineError(`${source}: must be an object declaring a \`method\`.`, { code: "VALIDATION_ERROR" });
	rejectUnknownFields(value, SIGNING_FIELDS, source);
	const method = requireString(value, "method", { source });
	if (method.trim() === "") throw new EngineError(`${source}: \`method\` must name a signing method.`, { code: "VALIDATION_ERROR" });
	const signer = requireString(value, "signer", {
		source,
		optional: true
	});
	if (method === "sigstore") {
		if (signer === void 0) throw new EngineError(`${source}: \`method\` "${SIGSTORE_SIGNING_METHOD}" requires a \`signer\`. An unpinned signature claim is satisfied by ANY Sigstore identity, so it is refused rather than resolved as publisher-signed. ${SIGNER_GRAMMAR}`, { code: "VALIDATION_ERROR" });
		if (parseSignerPin(signer) === null) throw new EngineError(`${source}: \`signer\` ${JSON.stringify(signer)} names no verifiable identity. ${SIGNER_GRAMMAR} A signer that cannot be pinned is refused rather than ignored.`, { code: "VALIDATION_ERROR" });
	}
	const bundlePath = requireString(value, "bundlePath", {
		source,
		optional: true
	});
	if (bundlePath !== void 0) assertSafePackRelPath(bundlePath, "`signing.bundlePath`");
	return {
		method,
		...signer === void 0 ? {} : { signer },
		...bundlePath === void 0 ? {} : { bundlePath }
	};
}
function readIntegrity(raw) {
	const value = Object.hasOwn(raw, "integrity") ? raw.integrity : void 0;
	if (value === void 0) throw new EngineError(`${PACK_MANIFEST_FILE}: \`integrity\` is required (pack-relative path -> SHA-256 hex digest; use {} for a pack that ships no content).`, { code: "VALIDATION_ERROR" });
	if (!isPlainObject$2(value)) throw new EngineError(`${PACK_MANIFEST_FILE}: \`integrity\` must be an object mapping pack-relative paths to SHA-256 digests.`, { code: "VALIDATION_ERROR" });
	const problems = [];
	const map = {};
	for (const [relPath, digest] of Object.entries(value)) {
		try {
			assertSafePackRelPath(relPath, `\`integrity\` key`);
		} catch (cause) {
			problems.push(cause instanceof Error ? cause.message : String(cause));
			continue;
		}
		const slash = relPath.indexOf("/");
		if (slash !== -1 && !LIVE_CLASS_LOOKUP.has(relPath.slice(0, slash))) {
			problems.push(`\`integrity\` entry ${JSON.stringify(relPath)} sits outside the live content classes (${PACK_CONTENT_CLASSES.join(", ")}); only class content and pack-root metadata are listed.`);
			continue;
		}
		if (typeof digest !== "string" || !SHA256_HEX_PATTERN.test(digest)) {
			problems.push(`\`integrity\` entry ${JSON.stringify(relPath)} must carry a 64-character SHA-256 hex digest.`);
			continue;
		}
		map[relPath] = digest.toLowerCase();
	}
	if (problems.length > 0) throw manifestError(problems);
	return map;
}
function readDeclaredTools(raw) {
	const declared = requireStringArray(raw, "declaredTools", {
		source: PACK_MANIFEST_FILE,
		optional: true
	});
	if (declared === void 0) return void 0;
	const unknown = declared.filter((name) => !VALID_TOOLS.has(name));
	if (unknown.length > 0) throw new EngineError(`${PACK_MANIFEST_FILE}: \`declaredTools\` names unknown tool(s) ${unknown.map((name) => JSON.stringify(name)).join(", ")}. Valid tools: ${TOOLS.join(", ")}.`, { code: "VALIDATION_ERROR" });
	return [...new Set(declared)];
}
function readMaxFootprintBytes(raw) {
	const value = Object.hasOwn(raw, "maxFootprintBytes") ? raw.maxFootprintBytes : void 0;
	if (value === void 0) return void 0;
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new EngineError(`${PACK_MANIFEST_FILE}: \`maxFootprintBytes\` must be a non-negative whole number of bytes.`, { code: "VALIDATION_ERROR" });
	return value;
}
function validatePackManifest(raw) {
	if (!isPlainObject$2(raw)) throw manifestError(["expected a JSON object at the document root."]);
	const problems = [];
	const attempt = (read) => {
		try {
			return read();
		} catch (cause) {
			problems.push(cause instanceof Error ? cause.message : String(cause));
			return;
		}
	};
	const name = attempt(() => readName(raw));
	const version = attempt(() => readVersion(raw));
	const description = attempt(() => requireString(raw, "description", {
		source: PACK_MANIFEST_FILE,
		optional: true
	}));
	const signing = attempt(() => readSigning(raw));
	const integrity = attempt(() => readIntegrity(raw));
	const declaredTools = attempt(() => readDeclaredTools(raw));
	const permissions = attempt(() => readPermissions(raw));
	const maxFootprintBytes = attempt(() => readMaxFootprintBytes(raw));
	attempt(() => rejectUnknownFields(raw, PACK_MANIFEST_FIELDS, PACK_MANIFEST_FILE));
	if (name === void 0 || version === void 0 || integrity === void 0) throw manifestError(problems.length > 0 ? problems : ["`name`, `version` and `integrity` are required."]);
	if (problems.length > 0) throw manifestError(problems);
	return {
		name,
		version,
		...description === void 0 ? {} : { description },
		...signing === void 0 ? {} : { signing },
		integrity,
		...declaredTools === void 0 ? {} : { declaredTools },
		...permissions === void 0 ? {} : { permissions },
		...maxFootprintBytes === void 0 ? {} : { maxFootprintBytes }
	};
}
async function readPackManifest(packRoot) {
	const manifestPath = join(resolve(packRoot), PACK_MANIFEST_FILE);
	let raw;
	try {
		raw = await readFile(manifestPath, "utf8");
	} catch (cause) {
		if (cause.code === "ENOENT") throw new EngineError(`No ${PACK_MANIFEST_FILE} at ${manifestPath}. A pack declares its name, version and integrity map there.`, {
			code: "CONFIG_ERROR",
			cause
		});
		throw new EngineError(`Cannot read ${manifestPath}: ${describeErrno(cause)}.`, {
			code: "FS_ERROR",
			cause
		});
	}
	return validatePackManifest(parseJsonStrict(raw, PACK_MANIFEST_FILE));
}
const PACK_MCP_SERVER_FIELDS = [
	"id",
	"description",
	"command",
	"args",
	"transport",
	"requiresEnv",
	"pinnedVersion",
	"packageNameLock",
	"blastRadius",
	"docsUrl",
	"firstParty"
];
const PACK_MCP_ENV_FIELDS = ["name", "description"];
const VALUE_BEARING_ENV_KEYS = /* @__PURE__ */ new Set([
	"value",
	"default",
	"env",
	"secret"
]);
const SERVER_TRANSPORTS = ["stdio", "http"];
const SERVER_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const ENV_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const LAUNCHER_COMMAND_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;
const SHELL_LAUNCHERS = /* @__PURE__ */ new Set([
	"sh",
	"bash",
	"zsh",
	"dash",
	"ash",
	"ksh",
	"csh",
	"tcsh",
	"fish",
	"busybox",
	"cmd",
	"command",
	"powershell",
	"pwsh",
	"env",
	"wsl"
]);
const INTERPOLATION_PATTERN = /\$\{[^}]*\}/g;
const ENV_PLACEHOLDER_PATTERN = /^\$\{env:([A-Z][A-Z0-9_]*)\}$/;
const FLOATING_VERSION_SPEC = /@(?:latest|next|beta|canary|nightly|rc\b|\*|\^|~|[<>=])/i;
const LAUNCHER_PREFIX_ARGS = /* @__PURE__ */ new Map([
	["npx", /* @__PURE__ */ new Set(["-y", "--yes"])],
	["bunx", /* @__PURE__ */ new Set()],
	["uvx", /* @__PURE__ */ new Set()],
	["pipx", /* @__PURE__ */ new Set(["run"])]
]);
const NO_PREFIX_ARGS = /* @__PURE__ */ new Set();
const PACKAGE_INJECTION_FLAGS = /* @__PURE__ */ new Set([
	"-p",
	"--package",
	"--with",
	"--with-editable",
	"--with-requirements",
	"--from",
	"--spec",
	"--pip-args",
	"--registry",
	"--index",
	"--index-url",
	"--extra-index-url",
	"--default-index",
	"-c",
	"--call",
	"--node-options"
]);
function flagName(arg) {
	return arg.split("=", 1)[0];
}
const FIXED_SUBCOMMAND_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
function assertHostLauncherArgv(command, args, relPath) {
	const inline = args.find((arg) => CODE_EVAL_FLAGS.has(flagName(arg)));
	if (inline !== void 0) throw new EngineError(`${relPath}: \`args\` carries ${JSON.stringify(inline)}, which passes a program on the command line. ${JSON.stringify(command)} is a host-installed launcher, so the argument vector is the only thing that decides what runs — and this one runs code no reviewer sees before the editor starts the server.`, { code: "VALIDATION_ERROR" });
	if (args.length === 0) throw new EngineError(`${relPath}: \`args\` is empty. A host-installed launcher is named by the server's own subcommand (the curated shape is \`glab\` + \`["mcp", "serve"]\`); with no subcommand the definition says only which binary to start, which is not a server definition.`, { code: "VALIDATION_ERROR" });
	const stray = args.find((arg) => !FIXED_SUBCOMMAND_PATTERN.test(arg));
	if (stray !== void 0) throw new EngineError(`${relPath}: \`args\` carries ${JSON.stringify(stray)}; for the host-installed launcher ${JSON.stringify(command)} every argument is a fixed subcommand word (letters, digits, single hyphens), as in \`glab mcp serve\`. Nothing here pins what an option or a path argument would reach, so a program, a script or a redirected endpoint is refused rather than emitted into the client's start-up config.`, { code: "VALIDATION_ERROR" });
}
const END_OF_OPTIONS = "--";
function serverError(relPath, problems) {
	return new EngineError(`Invalid MCP server definition ${relPath}:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`, { code: "VALIDATION_ERROR" });
}
function requiredNonEmpty(raw, field, relPath) {
	const value = requireString(raw, field, { source: relPath });
	if (value.trim() === "") throw new EngineError(`${relPath}: \`${field}\` must not be empty.`, { code: "VALIDATION_ERROR" });
	return value;
}
function readServerId(raw, relPath) {
	const id = requiredNonEmpty(raw, "id", relPath);
	if (!SERVER_ID_PATTERN.test(id)) throw new EngineError(`${relPath}: \`id\` ${JSON.stringify(id)} must be a lower-case kebab slug (letters, digits, single hyphens) — it becomes a config key and an emitted table name.`, { code: "VALIDATION_ERROR" });
	if (getServerMeta(id) !== void 0) throw new EngineError(`${relPath}: \`id\` ${JSON.stringify(id)} is a curated catalog id. A curated id always resolves to its reviewed row, so this definition could never be launched — rename it.`, { code: "VALIDATION_ERROR" });
	return id;
}
function readServerCommand(raw, relPath) {
	const command = requiredNonEmpty(raw, "command", relPath);
	if (!LAUNCHER_COMMAND_PATTERN.test(command)) throw new EngineError(`${relPath}: \`command\` ${JSON.stringify(command)} must be a bare launcher name — no path segments, whitespace, or shell metacharacters.`, { code: "VALIDATION_ERROR" });
	const base = command.toLowerCase().replace(/\.(?:exe|cmd|bat|com)$/, "");
	if (SHELL_LAUNCHERS.has(base)) throw new EngineError(`${relPath}: \`command\` ${JSON.stringify(command)} names a shell. Pack content never executes, and a shell launcher would carry the shell line the ban exists to close — name the server's own executable instead.`, { code: "VALIDATION_ERROR" });
	return command;
}
function readServerArgs(raw, relPath) {
	return requireStringArray(raw, "args", { source: relPath });
}
function readPinnedVersion(raw, relPath) {
	const version = requiredNonEmpty(raw, "pinnedVersion", relPath);
	if (semver.valid(version) === null) throw new EngineError(`${relPath}: \`pinnedVersion\` ${JSON.stringify(version)} must be an exact semver version (1.2.3) — a tag or a range is not a pin.`, { code: "VALIDATION_ERROR" });
	return version;
}
function readDocsUrl(raw, relPath) {
	const docsUrl = requiredNonEmpty(raw, "docsUrl", relPath);
	if (!docsUrl.startsWith("https://")) throw new EngineError(`${relPath}: \`docsUrl\` ${JSON.stringify(docsUrl)} must be an https:// URL — it is what the operator reads the server's own documentation from before approving the install.`, { code: "VALIDATION_ERROR" });
	return docsUrl;
}
function readEnvRequirements(raw, relPath) {
	const value = Object.hasOwn(raw, "requiresEnv") ? raw.requiresEnv : void 0;
	if (value === void 0) return void 0;
	if (!Array.isArray(value)) throw new EngineError(`${relPath}: \`requiresEnv\` must be an array of { name, description } rows.`, { code: "VALIDATION_ERROR" });
	return value.map((row, index) => {
		const source = `${relPath} \`requiresEnv[${index}]\``;
		if (!isPlainObject$2(row)) throw new EngineError(`${source}: must be an object with \`name\` and \`description\`.`, { code: "VALIDATION_ERROR" });
		for (const key of Object.keys(row)) {
			if (!VALUE_BEARING_ENV_KEYS.has(key)) continue;
			throw new EngineError(`${source}: \`${key}\` declares a credential value. A pack never carries the value — declare the variable here and reference it from \`args\` as \${env:NAME}, so the literal stays in the operator's environment file.`, { code: "VALIDATION_ERROR" });
		}
		rejectUnknownFields(row, PACK_MCP_ENV_FIELDS, source);
		const name = requireString(row, "name", { source });
		if (!ENV_NAME_PATTERN.test(name)) throw new EngineError(`${source}: \`name\` ${JSON.stringify(name)} must be an upper-case environment variable name.`, { code: "VALIDATION_ERROR" });
		const description = requireString(row, "description", { source });
		if (description.trim() === "") throw new EngineError(`${source}: \`description\` must say what the operator has to create and at what scope.`, { code: "VALIDATION_ERROR" });
		return {
			name,
			description
		};
	});
}
function assertPinnedArgs(draft, relPath) {
	const floating = draft.args.find((arg) => FLOATING_VERSION_SPEC.test(arg));
	if (floating !== void 0) throw new EngineError(`${relPath}: \`args\` carries the floating spec ${JSON.stringify(floating)}. A tag or a range resolves to different bytes on different days; pin the exact version.`, { code: "VALIDATION_ERROR" });
	const spec = pinnedPackageSpec(draft);
	if (spec === void 0) {
		assertHostLauncherArgv(draft.command, draft.args, relPath);
		return;
	}
	const bare = draft.args.find((arg) => arg === draft.packageNameLock || arg.startsWith(`${draft.packageNameLock}@`) && arg !== spec);
	if (bare !== void 0) throw new EngineError(`${relPath}: \`args\` names the package as ${JSON.stringify(bare)} rather than the pin ${JSON.stringify(spec)}. A bare name resolves to whatever the registry serves today.`, { code: "VALIDATION_ERROR" });
	const specIndex = draft.args.indexOf(spec);
	if (specIndex === -1) throw new EngineError(`${relPath}: \`args\` must carry the exact package token ${JSON.stringify(spec)} — ${JSON.stringify(draft.command)} fetches at start-up, so the argument vector is the only thing that decides which bytes run.`, { code: "VALIDATION_ERROR" });
	const allowed = LAUNCHER_PREFIX_ARGS.get(draft.command) ?? NO_PREFIX_ARGS;
	const smuggled = draft.args.slice(0, specIndex).find((arg) => !allowed.has(arg));
	if (smuggled !== void 0) {
		const permitted = allowed.size === 0 ? "no argument may precede it" : `only ${[...allowed].map((arg) => JSON.stringify(arg)).join(" and ")} may precede it`;
		throw new EngineError(`${relPath}: \`args\` carries ${JSON.stringify(smuggled)} before the package token ${JSON.stringify(spec)}; for ${JSON.stringify(draft.command)}, ${permitted}. A launcher option there can fetch a second package the pin says nothing about, which is a registry-mutable code channel beside the reviewed one.`, { code: "VALIDATION_ERROR" });
	}
	const trailing = draft.args.slice(specIndex + 1);
	const endOfOptions = trailing.indexOf(END_OF_OPTIONS);
	const injected = (endOfOptions === -1 ? trailing : trailing.slice(0, endOfOptions)).find((arg) => PACKAGE_INJECTION_FLAGS.has(flagName(arg)));
	if (injected !== void 0) throw new EngineError(`${relPath}: \`args\` carries ${JSON.stringify(injected)} after the package token, where ${JSON.stringify(draft.command)} still reads its own options — so it can fetch a second, unpinned package. If it is the server's own flag, put it behind a ${JSON.stringify(END_OF_OPTIONS)} separator.`, { code: "VALIDATION_ERROR" });
}
function assertEnvReferences(args, requiresEnv, relPath) {
	const declared = new Set(requiresEnv.map((requirement) => requirement.name));
	for (const arg of args) for (const [occurrence] of arg.matchAll(INTERPOLATION_PATTERN)) {
		const match = ENV_PLACEHOLDER_PATTERN.exec(occurrence);
		if (match === null) throw new EngineError(`${relPath}: \`args\` carries ${JSON.stringify(occurrence)}. Environment values are referenced as \${env:NAME} only.`, { code: "VALIDATION_ERROR" });
		const name = match[1];
		if (!declared.has(name)) throw new EngineError(`${relPath}: \`args\` references \${env:${name}} but \`requiresEnv\` does not declare ${name}, so the operator would never be asked for it.`, { code: "VALIDATION_ERROR" });
	}
}
function assertNoLiteralSecrets(args, requiresEnv, relPath) {
	const scanned = [...args.map((arg) => ({
		field: "args",
		value: arg.replaceAll(INTERPOLATION_PATTERN, "")
	})), ...requiresEnv.map((requirement) => ({
		field: `requiresEnv[${requirement.name}].description`,
		value: requirement.description
	}))];
	for (const { field, value } of scanned) {
		const findings = scanValueForSecrets(field, value);
		if (findings.length === 0) continue;
		const [first] = findings;
		throw new EngineError(`${relPath}: \`${field}\` carries a literal credential (${findings.map((finding) => finding.patternId).join(", ")}: ${first?.maskedValue}). Declare the variable in \`requiresEnv\` and reference it as \${env:NAME} instead.`, { code: "VALIDATION_ERROR" });
	}
}
function validatePackMcpServer(raw, relPath) {
	if (!isPlainObject$2(raw)) throw serverError(relPath, ["expected a JSON object at the document root."]);
	const problems = [];
	const attempt = (read) => {
		try {
			return read();
		} catch (cause) {
			problems.push(cause instanceof Error ? cause.message : String(cause));
			return;
		}
	};
	const id = attempt(() => readServerId(raw, relPath));
	const description = attempt(() => requiredNonEmpty(raw, "description", relPath));
	const command = attempt(() => readServerCommand(raw, relPath));
	const args = attempt(() => readServerArgs(raw, relPath));
	const transport = attempt(() => requireEnum(raw, "transport", SERVER_TRANSPORTS, { source: relPath }));
	const requiresEnv = attempt(() => readEnvRequirements(raw, relPath));
	const pinnedVersion = attempt(() => readPinnedVersion(raw, relPath));
	const packageNameLock = attempt(() => requiredNonEmpty(raw, "packageNameLock", relPath));
	const blastRadius = attempt(() => requiredNonEmpty(raw, "blastRadius", relPath));
	const docsUrl = attempt(() => readDocsUrl(raw, relPath));
	attempt(() => rejectUnknownFields(raw, PACK_MCP_SERVER_FIELDS, relPath));
	if (args !== void 0) {
		if (command !== void 0 && packageNameLock !== void 0 && pinnedVersion !== void 0) attempt(() => {
			assertPinnedArgs({
				command,
				packageNameLock,
				pinnedVersion,
				args
			}, relPath);
		});
		attempt(() => {
			assertEnvReferences(args, requiresEnv ?? [], relPath);
		});
		attempt(() => {
			assertNoLiteralSecrets(args, requiresEnv ?? [], relPath);
		});
	}
	if (id === void 0 || description === void 0 || command === void 0 || args === void 0 || transport === void 0 || pinnedVersion === void 0 || packageNameLock === void 0 || blastRadius === void 0 || docsUrl === void 0) throw serverError(relPath, problems.length > 0 ? problems : [`every field but \`requiresEnv\` is required (${PACK_MCP_SERVER_FIELDS.join(", ")}).`]);
	if (problems.length > 0) throw serverError(relPath, problems);
	return {
		id,
		description,
		command,
		args,
		transport,
		...requiresEnv === void 0 ? {} : { requiresEnv },
		pinnedVersion,
		packageNameLock,
		blastRadius,
		docsUrl
	};
}
function assertUniquePackServerIds(files) {
	const sources = /* @__PURE__ */ new Map();
	for (const file of files) {
		const id = file.definition.id;
		sources.set(id, [...sources.get(id) ?? [], file.relPath]);
	}
	const duplicates = [...sources].filter(([, paths]) => paths.length > 1).toSorted(([a], [b]) => a < b ? -1 : 1).map(([id, paths]) => `${JSON.stringify(id)} in ${paths.toSorted().join(", ")}`);
	if (duplicates.length > 0) throw new EngineError(`Pack declares the same MCP server id more than once: ${duplicates.join("; ")}. The id is the key the server is emitted under, so one definition would silently replace the other.`, { code: "VALIDATION_ERROR" });
}
const MCP_CLASS_PREFIX = "mcp_servers/";
async function checkMcpServerDefinitions(manifest, files) {
	const definitions = files.filter((file) => file.relPath.startsWith(MCP_CLASS_PREFIX));
	if (definitions.length === 0) return "n/a";
	const validated = await pLimit(READ_CONCURRENCY$4).map(definitions, async (file) => ({
		relPath: file.relPath,
		definition: validatePackMcpServer(parseJsonStrict(await readTextFile(file.absPath), file.relPath), file.relPath)
	}));
	try {
		assertUniquePackServerIds(validated);
	} catch (cause) {
		throw new EngineError(`Pack "${manifest.name}": ${cause instanceof Error ? cause.message : String(cause)}`, {
			code: "VALIDATION_ERROR",
			cause
		});
	}
	return "pass";
}
function verifySigningDeclaration(manifest, allowUntrusted) {
	if (manifest.signing !== void 0) return "pass";
	if (allowUntrusted) return "n/a";
	throw new EngineError(`Pack "${manifest.name}" declares no signing method. Unsigned packs are refused by default. For a pack you authored, re-run with the untrusted override; otherwise obtain a signed pack.`, { code: "INTEGRITY_ERROR" });
}
async function checkLifecycleScripts(packRoot) {
	const pkgPath = join(resolve(packRoot), "package.json");
	let raw;
	try {
		raw = await readFile(pkgPath, "utf8");
	} catch (cause) {
		if (cause.code === "ENOENT") return "n/a";
		throw new EngineError(`Cannot read ${pkgPath}: ${describeErrno(cause)}.`, {
			code: "FS_ERROR",
			cause
		});
	}
	const parsed = parseJsonStrict(raw, `${pkgPath}`);
	const scripts = Object.hasOwn(parsed, "scripts") ? parsed.scripts : void 0;
	if (scripts === void 0) return "pass";
	if (!isPlainObject$2(scripts)) throw new EngineError(`Pack package.json declares a non-object \`scripts\` field, so the lifecycle-script ban cannot be verified. Refusing the pack.`, { code: "INTEGRITY_ERROR" });
	const banned = Object.keys(scripts).filter((name) => BANNED_LIFECYCLE_SCRIPT_SET.has(name)).toSorted();
	if (banned.length > 0) throw new EngineError(`Pack package.json declares banned lifecycle script(s): ${banned.join(", ")}. npm runs these with your credentials on install, so packs ship without them.`, { code: "INTEGRITY_ERROR" });
	return "pass";
}
async function readDirEntries$1(dir) {
	try {
		return (await readdir(dir, { withFileTypes: true })).toSorted((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
	} catch (cause) {
		throw new EngineError(`Cannot read the pack directory ${dir}: ${describeErrno(cause)}.`, {
			code: "FS_ERROR",
			cause
		});
	}
}
function refuseContent(relPath, why) {
	throw new EngineError(`Refusing pack content ${JSON.stringify(relPath)}: ${why}.`, { code: "VALIDATION_ERROR" });
}
async function fileSize(absPath) {
	try {
		return (await stat(absPath)).size;
	} catch (cause) {
		throw new EngineError(`Cannot stat pack file ${absPath}: ${describeErrno(cause)}.`, {
			code: "FS_ERROR",
			cause
		});
	}
}
async function collectClassFiles(packRoot, contentClass, limit) {
	const found = [];
	let level = [contentClass];
	while (level.length > 0) {
		const listings = await limit.map(level, async (relDir) => ({
			relDir,
			entries: await readDirEntries$1(join(packRoot, relDir))
		}));
		const nextLevel = [];
		for (const { relDir, entries } of listings) for (const entry of entries) {
			const relPath = `${relDir}/${entry.name}`;
			if (entry.isSymbolicLink()) refuseContent(relPath, "symlinks can address files outside the pack");
			if (entry.isDirectory()) {
				nextLevel.push(relPath);
				continue;
			}
			if (!entry.isFile()) refuseContent(relPath, "not a regular file");
			assertSafePackRelPath(relPath, "pack content");
			if (contentClass === "skills" && relPath.split("/").length === 2) refuseContent(relPath, `a skill is a directory holding ${SKILL_ARTIFACT_FILE}; a loose file under skills/ is read by no engine path`);
			const extension = extname(entry.name).toLowerCase();
			const allowed = classExtensionsFor(contentClass, relPath);
			if (!allowed.has(extension)) refuseContent(relPath, `${contentClass}/ carries ${[...allowed].join(", ")} files only`);
			found.push({
				relPath,
				absPath: resolveInside(packRoot, relPath, "pack content")
			});
		}
		level = nextLevel;
	}
	return (await limit.map(found, async ({ relPath, absPath }) => ({
		relPath,
		contentClass,
		absPath,
		sizeBytes: await fileSize(absPath)
	}))).toSorted((a, b) => a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0);
}
async function enumeratePackContent(packRoot) {
	const root = resolve(packRoot);
	const entries = new Map((await readDirEntries$1(root)).map((entry) => [entry.name, entry]));
	for (const [dir, why] of Object.entries(UNCONSUMED_CONTENT_DIRS)) {
		const entry = entries.get(dir);
		if (entry !== void 0 && !entry.isFile()) refuseContent(`${dir}/`, `${why} (live-emission invariant); a pack ships only ${PACK_CONTENT_CLASSES.join(", ")}`);
	}
	const limit = pLimit(READ_CONCURRENCY$4);
	return (await Promise.all(PACK_CONTENT_CLASSES.map(async (contentClass) => {
		const entry = entries.get(contentClass);
		if (entry === void 0) return [];
		if (entry.isSymbolicLink()) refuseContent(`${contentClass}/`, "symlinks can address directories outside the pack");
		if (!entry.isDirectory()) refuseContent(`${contentClass}/`, "content classes must be directories");
		return collectClassFiles(root, contentClass, limit);
	}))).flat();
}
async function readTextFile(path) {
	try {
		return await readFile(path, "utf8");
	} catch (cause) {
		throw new EngineError(`Cannot read pack file ${path}: ${describeErrno(cause)}.`, {
			code: "FS_ERROR",
			cause
		});
	}
}
async function verifyIntegrityMap(packRoot, manifest, files) {
	const root = resolve(packRoot);
	const listed = Object.entries(manifest.integrity).toSorted(([a], [b]) => a < b ? -1 : 1);
	const checks = await pLimit(READ_CONCURRENCY$4).map(listed, async ([relPath, expected]) => {
		assertSafePackRelPath(relPath, "`integrity` key");
		const absPath = resolveInside(root, relPath, "`integrity` key");
		let content;
		try {
			content = await readFile(absPath);
		} catch (cause) {
			if (cause.code === "ENOENT") return `${relPath} is listed in \`integrity\` but is missing from the pack`;
			throw new EngineError(`Cannot read pack file ${absPath}: ${describeErrno(cause)}.`, {
				code: "FS_ERROR",
				cause
			});
		}
		const actual = createHash("sha256").update(content).digest("hex");
		if (actual !== expected.toLowerCase()) return `${relPath} does not match its digest (declared ${expected.slice(0, 12)}…, actual ${actual.slice(0, 12)}…)`;
		return null;
	});
	const listedPaths = new Set(listed.map(([relPath]) => relPath));
	const unlisted = files.filter((file) => !listedPaths.has(file.relPath)).map((file) => `${file.relPath} ships in the pack but is absent from \`integrity\``);
	const problems = [...checks.filter((problem) => problem !== null), ...unlisted];
	if (problems.length > 0) throw new EngineError(`Pack "${manifest.name}" failed integrity verification:\n${problems.map((p) => `  - ${p}`).join("\n")}\nThe pack does not match its manifest; re-obtain it from the author.`, { code: "INTEGRITY_ERROR" });
	return "pass";
}
async function scanPackBodies(files) {
	const problems = (await pLimit(READ_CONCURRENCY$4).map(files, async (file) => {
		const stripped = (await readTextFile(file.absPath)).replace(INVISIBLE_SMUGGLING_CHARS, "");
		const folded = foldConfusables(stripped);
		const joined = joinMaskedWords(folded);
		return {
			relPath: file.relPath,
			hits: [
				...scanForDeniedPatterns(stripped, PACK_BODY_DENY_PATTERNS),
				...folded === stripped ? [] : scanForDeniedPatterns(folded, PACK_BODY_DENY_PATTERNS),
				...joined === folded ? [] : scanForDeniedPatterns(joined, PACK_BODY_DENY_PATTERNS)
			]
		};
	})).filter(({ hits }) => hits.length > 0).map(({ relPath, hits }) => `${relPath}: ${[...new Set(hits.map((hit) => hit.patternId))].join(", ")}`);
	if (problems.length > 0) throw new EngineError(`Deny-pattern scan refused pack content:\n${problems.map((p) => `  - ${p}`).join("\n")}\nThese bodies match known injection or exfiltration patterns; do not install the pack.`, { code: "VALIDATION_ERROR" });
	return "pass";
}
function checkFootprint(manifest, files) {
	const declared = manifest.maxFootprintBytes;
	const cap = declared === void 0 ? DEFAULT_MAX_FOOTPRINT_BYTES : Math.min(declared, DEFAULT_MAX_FOOTPRINT_BYTES);
	const total = files.reduce((sum, file) => sum + file.sizeBytes, 0);
	if (total > cap) throw new EngineError(`Pack "${manifest.name}" ships ${total} bytes of content, over its ${cap}-byte footprint cap (${files.length} file(s)). Refusing rather than installing more than the pack declares.`, { code: "VALIDATION_ERROR" });
	if (files.length > 500) throw new EngineError(`Pack "${manifest.name}" ships ${files.length} content files, over the 500-file ceiling (${total} bytes, within the byte cap). Every installed file becomes a ledger row that every later command re-reads, so file count is bounded on its own. Split the pack, or ship fewer, larger artifacts.`, { code: "VALIDATION_ERROR" });
	return "pass";
}
const PACK_RULE_SCOPES = /* @__PURE__ */ new Set(["conditional", "agent-requested"]);
const RULE_CLASS_PREFIX = "rules/";
async function checkRuleActivation(manifest, files) {
	const rules = files.filter((file) => file.relPath.startsWith(RULE_CLASS_PREFIX) && FRONTMATTER_EXTENSIONS.has(extname(file.relPath).toLowerCase()));
	if (rules.length === 0) return "n/a";
	const problems = (await pLimit(READ_CONCURRENCY$4).map(rules, async (file) => {
		const parsed = parseFrontmatter(await readTextFile(file.absPath), file.relPath);
		const scope = parsed.hadFrontmatter ? parsed.frontmatter["scope"] : void 0;
		return {
			relPath: file.relPath,
			scope
		};
	})).filter(({ scope }) => scope !== void 0 && !PACK_RULE_SCOPES.has(String(scope))).map(({ relPath, scope }) => String(scope) === "always" ? `${relPath} declares \`scope: always\`, which no client honours the same way: the cursor adapter refuses it outright (so every later sync fails) and the other three cannot read the field and would emit the rule on every turn` : `${relPath} declares \`scope: ${String(scope)}\`, which is not one of ${[...PACK_RULE_SCOPES].join(", ")} — an activation nothing recognises emits as an unconditional rule`);
	if (problems.length > 0) throw new EngineError(`Pack "${manifest.name}" declares rule activations this engine cannot honour:\n${problems.map((problem) => `  - ${problem}`).join("\n")}\nScope the rule with \`scope: conditional\` plus \`globs:\`, or \`scope: agent-requested\`.`, { code: "VALIDATION_ERROR" });
	return "pass";
}
async function checkDeclaredTools(manifest, files) {
	const declared = new Set(manifest.declaredTools ?? []);
	const candidates = files.filter((file) => FRONTMATTER_EXTENSIONS.has(extname(file.relPath).toLowerCase()));
	const targeted = await pLimit(READ_CONCURRENCY$4).map(candidates, async (file) => ({
		relPath: file.relPath,
		tools: extractToolsFrontmatter(await readTextFile(file.absPath), file.relPath) ?? []
	}));
	const undeclared = /* @__PURE__ */ new Map();
	for (const { relPath, tools } of targeted) for (const tool of tools) {
		if (declared.has(tool)) continue;
		undeclared.set(tool, [...undeclared.get(tool) ?? [], relPath]);
	}
	if (undeclared.size > 0) {
		const listed = [...undeclared].toSorted(([a], [b]) => a < b ? -1 : 1).map(([tool, sources]) => `${tool} (${sources.join(", ")})`);
		throw new EngineError(`Pack "${manifest.name}" targets tool(s) missing from \`declaredTools\`: ${listed.join("; ")}. The manifest must declare every tool its content addresses.`, { code: "VALIDATION_ERROR" });
	}
	return "pass";
}
//#endregion
//#region src/pack/orgPolicy.ts
var orgPolicy_exports = /* @__PURE__ */ __exportAll({
	ORG_POLICY_PATTERN_GRAMMAR: () => ORG_POLICY_PATTERN_GRAMMAR,
	ORG_POLICY_REL_PATH: () => ORG_POLICY_REL_PATH,
	emptyOrgPolicy: () => emptyOrgPolicy,
	evaluatePackSource: () => evaluatePackSource,
	loadOrgPolicy: () => loadOrgPolicy,
	orgPolicyPath: () => orgPolicyPath,
	orgPolicyPatternDefect: () => orgPolicyPatternDefect,
	serializeOrgPolicy: () => serializeOrgPolicy,
	writeOrgPolicy: () => writeOrgPolicy
});
const ORG_POLICY_REL_PATH = `${STATE_DIR}/policy.json`;
const BOM = "﻿";
const NAME_SEGMENT = /^[a-z0-9][a-z0-9._-]*$/;
const KIND_TOKENS = [
	"local-path",
	"npm-package",
	"catalog-pinned"
];
const NOT_IN_ALLOW_LIST = "not in allow list";
const ROOT_FIELDS = ["version", "packs"];
const PACKS_FIELDS = ["allow", "deny"];
const ORG_POLICY_PATTERN_GRAMMAR = `Patterns are an exact pack id, "@scope/*", "*", or a source kind (${KIND_TOKENS.join(", ")}).`;
function describeValue(value) {
	if (value === void 0) return "absent";
	if (value === null) return "null";
	if (Array.isArray(value)) return "an array";
	if (typeof value === "object") return "an object";
	const text = JSON.stringify(value) ?? String(value);
	return text.length > 48 ? `${text.slice(0, 48)}…` : text;
}
function policyError(path, defect) {
	return new EngineError(`Invalid org trust policy in ${path}: ${defect} All pack installs are refused until the policy file is fixed (fail-closed).`, { code: "CONFIG_ERROR" });
}
function isKindToken(pattern) {
	return KIND_TOKENS.includes(pattern);
}
function patternDefect(pattern) {
	if (pattern === "*" || isKindToken(pattern)) return null;
	if (pattern.includes("\0")) return "contains a null byte.";
	if (pattern.includes("\\")) return "contains a backslash; patterns use \"/\" only in the \"@scope/…\" form.";
	const segments = pattern.split("/");
	if (segments.length > 2) return "carries more than the single \"@scope/\" slash a pack id can have.";
	if (segments.length === 2) {
		const [scope = "", name = ""] = segments;
		if (!scope.startsWith("@") || !NAME_SEGMENT.test(scope.slice(1))) return "puts \"/\" outside the \"@scope/name\" form.";
		if (name !== "*" && !NAME_SEGMENT.test(name)) return name.includes("*") ? "uses \"*\" outside the two wildcard forms (\"*\" alone, or \"@scope/*\")." : "is not \"@scope/*\" or an exact \"@scope/name\" pack id.";
		return null;
	}
	if (pattern.includes("*")) return "uses \"*\" outside the two wildcard forms (\"*\" alone, or \"@scope/*\").";
	if (!NAME_SEGMENT.test(pattern)) return `is not an exact pack id, "@scope/*", "*", or a source kind (${KIND_TOKENS.join(", ")}).`;
	return null;
}
function readPatternList(packs, list, path) {
	const value = Object.hasOwn(packs, list) ? packs[list] : void 0;
	if (value === void 0) return void 0;
	if (!Array.isArray(value)) throw policyError(path, `\`packs.${list}\` must be an array of patterns (got ${describeValue(value)}).`);
	return value.map((entry, index) => {
		if (typeof entry !== "string") throw policyError(path, `packs.${list}[${index}] must be a string pattern (got ${describeValue(entry)}).`);
		const defect = patternDefect(entry);
		if (defect !== null) throw policyError(path, `packs.${list}[${index}] ${JSON.stringify(entry)} ${defect} ${ORG_POLICY_PATTERN_GRAMMAR}`);
		return entry;
	});
}
function parseOrgPolicy(raw, path) {
	const document = parseJsonStrict(raw.startsWith(BOM) ? raw.slice(1) : raw, path);
	const strayRoot = unknownFields(document, ROOT_FIELDS);
	if (strayRoot.length > 0) throw policyError(path, `unknown field(s) ${strayRoot.map((key) => JSON.stringify(key)).join(", ")}. Allowed: ${[...ROOT_FIELDS].toSorted().map((key) => JSON.stringify(key)).join(", ")}.`);
	const version = Object.hasOwn(document, "version") ? document.version : void 0;
	if (version !== 1) throw policyError(path, `\`version\` must be the number 1 (got ${describeValue(version)}); this engine reads only policy version 1.`);
	const packs = Object.hasOwn(document, "packs") ? document.packs : void 0;
	if (!isPlainObject$2(packs)) throw policyError(path, `\`packs\` must be an object with optional "allow"/"deny" pattern arrays (got ${describeValue(packs)}).`);
	const strayPacks = unknownFields(packs, PACKS_FIELDS);
	if (strayPacks.length > 0) throw policyError(path, `unknown field(s) under \`packs\`: ${strayPacks.map((key) => JSON.stringify(key)).join(", ")}. Allowed: ${[...PACKS_FIELDS].toSorted().map((key) => JSON.stringify(key)).join(", ")}.`);
	const allow = readPatternList(packs, "allow", path);
	const deny = readPatternList(packs, "deny", path);
	const parsed = {};
	if (allow !== void 0) parsed.allow = allow;
	if (deny !== void 0) parsed.deny = deny;
	return {
		version: 1,
		packs: parsed
	};
}
async function loadOrgPolicy(rootDir) {
	const path = join(rootDir, ORG_POLICY_REL_PATH);
	let raw;
	try {
		raw = await readFile(path, "utf8");
	} catch (cause) {
		const code = cause?.code;
		if (code === "ENOENT" || code === "ENOTDIR") return null;
		throw mapFsErrno(cause, path) ?? new EngineError(`Cannot read ${path}: ${cause instanceof Error ? cause.message : String(cause)}.`, {
			code: "FS_ERROR",
			cause
		});
	}
	return parseOrgPolicy(raw, path);
}
function orgPolicyPath(rootDir) {
	return join(rootDir, ORG_POLICY_REL_PATH);
}
function orgPolicyPatternDefect(pattern) {
	return patternDefect(pattern);
}
function emptyOrgPolicy() {
	return {
		version: 1,
		packs: {}
	};
}
function serializeOrgPolicy(policy) {
	return `${JSON.stringify(policy, null, 2)}\n`;
}
async function writeOrgPolicy(rootDir, policy) {
	const path = orgPolicyPath(rootDir);
	const serialized = serializeOrgPolicy(policy);
	parseOrgPolicy(serialized, path);
	await atomicWriteFile(path, serialized);
}
function patternMatches(pattern, packName, sourceKind) {
	if (pattern === "*") return true;
	if (isKindToken(pattern)) return pattern === sourceKind;
	if (pattern.startsWith("@") && pattern.endsWith("/*")) {
		const scopePrefix = pattern.slice(0, -1);
		return packName.startsWith(scopePrefix) && packName.length > scopePrefix.length;
	}
	return packName === pattern;
}
function evaluatePackSource(policy, packName, sourceKind) {
	if (policy === null) return { decision: "allow" };
	const { allow, deny } = policy.packs;
	const denied = deny?.find((pattern) => patternMatches(pattern, packName, sourceKind));
	if (denied !== void 0) return {
		decision: "deny",
		matchedRule: denied
	};
	if (allow !== void 0) {
		const allowed = allow.find((pattern) => patternMatches(pattern, packName, sourceKind));
		if (allowed !== void 0) return {
			decision: "allow",
			matchedRule: allowed
		};
		return {
			decision: "deny",
			matchedRule: NOT_IN_ALLOW_LIST
		};
	}
	return { decision: "allow" };
}
//#endregion
//#region src/pack/receipt.ts
var receipt_exports$1 = /* @__PURE__ */ __exportAll({
	RECEIPT_FILE: () => RECEIPT_FILE,
	buildReceipt: () => buildReceipt,
	packDirRelPath: () => packDirRelPath,
	receiptRelPath: () => receiptRelPath,
	serializeReceipt: () => serializeReceipt
});
const RECEIPT_FILE = "receipt.json";
const PACKS_DIR = "packs";
const PACK_ID_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
function assertPackId(packId) {
	if (PACK_ID_PATTERN.test(packId)) return;
	throw new EngineError(`Invalid pack id ${JSON.stringify(packId)}. A pack id is a lower-case package name (optionally @scope/name) with no path separators, so it maps to exactly one directory under ${STATE_DIR}/${PACKS_DIR}/.`, { code: "VALIDATION_ERROR" });
}
function packDirRelPath(packId) {
	assertPackId(packId);
	return `${STATE_DIR}/${PACKS_DIR}/${packId.replace("@", "").replace("/", "__")}`;
}
function receiptRelPath(packId) {
	return `${packDirRelPath(packId)}/${RECEIPT_FILE}`;
}
function buildReceipt(plan, clockNow, engineVersion) {
	const toolFootprint = grantableFootprint(plan.manifest.permissions?.toolFootprint);
	return {
		packId: plan.manifest.name,
		version: plan.manifest.version,
		source: {
			kind: plan.source.kind,
			spec: plan.spec
		},
		trustTier: plan.trustTier,
		tierBasis: plan.tierBasis,
		checks: { ...plan.checks },
		policy: {
			decision: plan.policy.decision,
			...plan.policy.matchedRule === void 0 ? {} : { matchedRule: plan.policy.matchedRule }
		},
		...toolFootprint.length === 0 ? {} : { permissions: { toolFootprint } },
		files: plan.writeSet.map((entry) => ({
			path: entry.targetPath,
			class: entry.contentClass,
			sha256: entry.contentHash,
			bytes: entry.sizeBytes,
			tokens: plan.tokensByPath[entry.targetPath] ?? 0
		})),
		contextCost: { totalTokens: plan.totalTokens },
		engineVersion,
		installedAt: clockNow.toISOString()
	};
}
function serializeReceipt(receipt) {
	return `${JSON.stringify(receipt, null, 2)}\n`;
}
//#endregion
//#region src/pack/projection.ts
var projection_exports = /* @__PURE__ */ __exportAll({
	describeDeniedPacks: () => describeDeniedPacks,
	discoverInstalledPacks: () => discoverInstalledPacks,
	discoverInstalledPacksWithPolicy: () => discoverInstalledPacksWithPolicy,
	packContentRoots: () => packContentRoots,
	packHookDefinitions: () => packHookDefinitions,
	packMcpServers: () => packMcpServers,
	resolveInstalledPackContent: () => resolveInstalledPackContent,
	selectionWithInstalledPacks: () => selectionWithInstalledPacks
});
const CANONICAL_PACK_CLASSES = /* @__PURE__ */ new Set([
	"agents",
	"skills",
	"rules",
	"commands"
]);
async function discoverInstalledPacks(rootDir, manifest) {
	return (await discoverInstalledPacksWithPolicy(rootDir, manifest)).packs;
}
async function discoverInstalledPacksWithPolicy(rootDir, manifest) {
	const rowsByPack = /* @__PURE__ */ new Map();
	for (const entry of manifest.ledger) {
		if (!isPackOwner(entry.adapter)) continue;
		const id = entry.adapter.slice(5);
		rowsByPack.set(id, [...rowsByPack.get(id) ?? [], entry.artifactId]);
	}
	const policy = rowsByPack.size === 0 ? null : await loadOrgPolicy(rootDir);
	const packs = [];
	const denied = [];
	for (const id of [...rowsByPack.keys()].toSorted()) {
		const relDir = packDirRelPath(id);
		const root = join(rootDir, ...relDir.split("/"));
		const classesPresent = classesOf(id, rowsByPack.get(id) ?? []);
		const provenance = policy !== null || classesPresent.includes("agents") ? await readRecordedProvenance(root) : {
			declaredTools: [],
			sourceKind: "unknown"
		};
		const decision = evaluatePackSource(policy, id, provenance.sourceKind);
		if (decision.decision === "deny") {
			denied.push({
				id,
				...decision.matchedRule === void 0 ? {} : { matchedRule: decision.matchedRule }
			});
			continue;
		}
		if (classesPresent.length > 0 && !await isDirectory(root)) throw new EngineError(`The ledger records installed pack "${id}", but its content directory ${relDir}/ is missing from the repo — the files were removed outside the engine. Run \`clean --pack ${id}\` to drop the pack's ledger rows, then re-install the pack if you still want it.`, { code: "CONFIG_ERROR" });
		packs.push({
			id,
			root,
			classesPresent,
			declaredTools: provenance.declaredTools
		});
	}
	return {
		packs,
		denied
	};
}
function describeDeniedPacks(denied) {
	return denied.map((pack) => {
		const rule = pack.matchedRule === void 0 ? "" : ` (matched rule: ${JSON.stringify(pack.matchedRule)})`;
		return `Installed pack "${pack.id}" is denied by the org trust policy${rule}, so none of its content was projected into this setup. Its files are still on disk — run \`clean --pack ${pack.id}\` to uninstall it, or change ${ORG_POLICY_REL_PATH}.`;
	});
}
async function readRecordedProvenance(packRoot) {
	const empty = {
		declaredTools: [],
		sourceKind: "unknown"
	};
	let raw;
	try {
		raw = await readFile(join(packRoot, RECEIPT_FILE), "utf8");
	} catch {
		return empty;
	}
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return empty;
	}
	if (typeof parsed !== "object" || parsed === null) return empty;
	const permissions = parsed.permissions;
	const declaredRaw = typeof permissions === "object" && permissions !== null ? permissions.toolFootprint : void 0;
	const declaredTools = Array.isArray(declaredRaw) ? grantableFootprint(declaredRaw.filter((entry) => typeof entry === "string")) : [];
	const source = parsed.source;
	const kind = typeof source === "object" && source !== null ? source.kind : void 0;
	return {
		declaredTools,
		sourceKind: typeof kind === "string" && PACK_SOURCE_KINDS.includes(kind) ? kind : "unknown"
	};
}
function packContentRoots(packs) {
	return packs.filter((pack) => pack.classesPresent.some((cls) => CANONICAL_PACK_CLASSES.has(cls))).map((pack) => ({
		pack: pack.id,
		root: pack.root,
		declaredTools: pack.declaredTools
	}));
}
function classesOf(packId, artifactIds) {
	const present = /* @__PURE__ */ new Set();
	const prefix = `${packId}/`;
	for (const artifactId of artifactIds) {
		if (!artifactId.startsWith(prefix)) continue;
		const relPath = artifactId.slice(prefix.length);
		const slash = relPath.indexOf("/");
		if (slash === -1) continue;
		present.add(relPath.slice(0, slash));
	}
	return PACK_CONTENT_CLASSES.filter((cls) => present.has(cls));
}
async function isDirectory(path) {
	try {
		return (await stat(path)).isDirectory();
	} catch (cause) {
		const code = cause.code;
		if (code === "ENOENT" || code === "ENOTDIR") return false;
		throw new EngineError(`Cannot stat ${path}: ${describeError$2(cause)}.`, {
			code: "FS_ERROR",
			cause
		});
	}
}
function describeError$2(cause) {
	return cause instanceof Error ? cause.message : String(cause);
}
async function resolveInstalledPackContent(rootDir, manifest, corpusRoot) {
	const { packs, denied } = await discoverInstalledPacksWithPolicy(rootDir, manifest);
	const packRoots = packContentRoots(packs);
	const policyWarnings = describeDeniedPacks(denied);
	for (const warning of policyWarnings) console.warn(warning);
	const [mcpServers, canonical] = await Promise.all([packMcpServers(packs, rootDir), packRoots.length === 0 ? void 0 : resolveCanonicalClasses(packRoots, corpusRoot)]);
	if (canonical === void 0) return {
		packs,
		packRoots,
		items: [],
		skillRows: [],
		agents: [],
		mcpServers,
		policyWarnings
	};
	return {
		packs,
		packRoots,
		...canonical,
		mcpServers,
		policyWarnings
	};
}
async function resolveCanonicalClasses(packRoots, corpusRoot) {
	const items = (await buildContentIndex(corpusRoot, { packRoots: [...packRoots] })).items.filter((item) => item.provenance !== void 0);
	return {
		items,
		skillRows: await projectPackSkills(items.filter((item) => item.type === "skill")),
		agents: packAgentDeclarations(items)
	};
}
function packAgentDeclarations(items) {
	return items.filter((item) => item.type === "agent" && item.provenance !== void 0).map((item) => ({
		runtimeId: runtimeAgentId$2(item.id),
		packId: item.provenance.pack,
		frontmatter: item.frontmatter,
		declaredTools: grantableFootprint(item.provenance.declaredTools)
	}));
}
function runtimeAgentId$2(id) {
	return id.startsWith("stamity-") ? id : `${CONTENT_PREFIX}${id}`;
}
function selectionWithInstalledPacks(manifest, packItems) {
	const items = { ...manifest.selection.items };
	for (const type of CONTENT_CLASSES) {
		const current = items[type];
		if (!Array.isArray(current)) continue;
		const missing = packItems.filter((item) => item.type === type && !current.includes(item.id)).map((item) => item.id);
		if (missing.length > 0) items[type] = [...current, ...missing];
	}
	return {
		...manifest,
		selection: {
			...manifest.selection,
			items
		}
	};
}
const SKILL_FILE$3 = "SKILL.md";
async function projectPackSkills(items) {
	return (await Promise.all(items.map((item) => projectOnePackSkill(item)))).flat().toSorted((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
async function projectOnePackSkill(item) {
	const skillDir = posix.basename(posix.dirname(item.relativePath));
	const sourceDir = dirname(item.filePath);
	const files = await walkRegularFiles(sourceDir, "");
	return Promise.all(files.map(async (relative) => {
		assertSafePath(posix.join(skillDir, relative), `pack skill "${item.id}" projection`);
		const raw = await readFile(join(sourceDir, ...relative.split("/")), "utf8");
		const content = relative === SKILL_FILE$3 ? toSpecFrontmatter(raw, skillDir, item.relativePath) : raw;
		return {
			path: posix.join(SKILLS_PROJECTION_DIR, skillDir, relative),
			content,
			artifactId: item.id,
			artifactType: "skill"
		};
	}));
}
async function walkRegularFiles(dir, prefix) {
	const entries = (await readdir(dir, { withFileTypes: true })).toSorted((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
	return (await Promise.all(entries.map((entry) => {
		const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
		if (entry.isDirectory()) return walkRegularFiles(join(dir, entry.name), relative);
		return Promise.resolve(entry.isFile() ? [relative] : []);
	}))).flat();
}
async function packHookDefinitions(packs, rootDir) {
	const results = await Promise.all(packs.filter((pack) => pack.classesPresent.includes("hooks")).map((pack) => readHookDefinitions(join(pack.root, "hooks"), rootDir)));
	return {
		hooks: results.flatMap((result) => result.hooks),
		errors: results.flatMap((result) => result.errors)
	};
}
async function packMcpServers(packs, rootDir) {
	const repoRoot = resolve(rootDir);
	const servers = (await Promise.all(packs.filter((pack) => pack.classesPresent.includes("mcp_servers")).map((pack) => readPackServerDir(pack, repoRoot)))).flat().toSorted((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
	assertNoCrossPackServerIds(servers);
	assertNoCuratedCollision(servers);
	return servers;
}
async function readPackServerDir(pack, repoRoot) {
	const dir = join(pack.root, "mcp_servers");
	let listing;
	try {
		listing = await readdir(dir, { withFileTypes: true });
	} catch (cause) {
		const code = cause.code;
		if (code === "ENOENT" || code === "ENOTDIR") return [];
		throw new EngineError(`Cannot read ${dir}: ${describeError$2(cause)}.`, {
			code: "FS_ERROR",
			cause
		});
	}
	const entries = listing.toSorted((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
	return Promise.all(entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map(async (entry) => {
		const absolute = join(dir, entry.name);
		const relPath = relative(repoRoot, absolute).split(sep).join("/");
		return toSuppliedServer(validatePackMcpServer(parseJsonStrict(await readFile(absolute, "utf8"), relPath), relPath), pack.id);
	}));
}
function toSuppliedServer(definition, sourcePackId) {
	const { requiresEnv, ...rest } = definition;
	return {
		...rest,
		...requiresEnv === void 0 ? {} : { requiresEnv: requiresEnv.map((requirement) => ({
			name: requirement.name,
			comment: requirement.description,
			url: ""
		})) },
		firstParty: false,
		sourcePackId
	};
}
function assertNoCrossPackServerIds(servers) {
	const byId = /* @__PURE__ */ new Map();
	for (const server of servers) byId.set(server.id, [...byId.get(server.id) ?? [], server.sourcePackId]);
	const contested = [...byId].filter(([, packIds]) => packIds.length > 1);
	if (contested.length === 0) return;
	const sameP = contested.filter(([, packIds]) => new Set(packIds).size === 1);
	if (sameP.length > 0) throw new EngineError(`One installed pack defines the same MCP server id more than once: ${sameP.map(([id, packIds]) => `${JSON.stringify(id)} (${packIds.length}x in pack ${packIds[0]})`).join("; ")}. The id is the key the server is emitted under, so one of its own definitions would silently replace the other. Ingress refuses this shape, so these bytes were edited after the install: restore them by re-installing the pack, or delete the duplicate definition file under its \`mcp_servers/\` directory.`, { code: "VALIDATION_ERROR" });
	throw new EngineError(`Two installed packs supply the same MCP server id: ${contested.map(([id, packIds]) => `${JSON.stringify(id)} (packs ${packIds.toSorted().join(", ")})`).join("; ")}. The id is the key the server is emitted under, so one pack's definition would silently launch in place of the other's. Uninstall one of the packs (\`clean --pack <id>\`), or ask its author to rename the server.`, { code: "VALIDATION_ERROR" });
}
//#endregion
//#region src/emit/planner.ts
var planner_exports = /* @__PURE__ */ __exportAll({
	CHARTER_ARTIFACT_ID: () => CHARTER_ARTIFACT_ID,
	POLICY_DOCUMENT_ARTIFACT_ID: () => POLICY_DOCUMENT_ARTIFACT_ID,
	buildCoreEmissionPlan: () => buildCoreEmissionPlan,
	composeEmissionPlanner: () => composeEmissionPlanner
});
const CHARTER_ARTIFACT_ID = "charter";
const POLICY_DOCUMENT_ARTIFACT_ID = "agent-tool-policies";
function hookScriptArtifactId(path) {
	const base = path.slice(path.lastIndexOf("/") + 1);
	const dot = base.lastIndexOf(".");
	return dot > 0 ? base.slice(0, dot) : base;
}
async function buildCoreEmissionPlan(ctx, packs) {
	const roots = contentRootsOf(ctx.contentRoot);
	const corpusRoot = roots.root;
	const contentRoot = corpusRoot === void 0 ? {} : { contentRoot: corpusRoot };
	const skillsContentRootBase = {
		...corpusRoot === void 0 ? {} : { root: corpusRoot },
		...roots.forkRoot === void 0 ? {} : { forkRoot: roots.forkRoot },
		...roots.overrideRoot === void 0 ? {} : { overrideRoot: roots.overrideRoot }
	};
	const packsPromise = packs === void 0 ? resolveInstalledPackContent(ctx.rootDir, ctx.manifest, corpusRoot) : Promise.resolve(packs);
	const [agentsMd, skillsPass, hooks, resolvedPacks] = await Promise.all([
		renderAgentsMd({
			manifest: ctx.manifest,
			facts: { monorepoPackages: ctx.facts.monorepoPackages },
			...contentRoot
		}),
		packsPromise.then(async (resolved) => {
			const skillsRoots = {
				...skillsContentRootBase,
				...resolved.packRoots.length === 0 ? {} : { packRoots: resolved.packRoots }
			};
			const delivery = await planRuleDelivery(ctx, skillsRoots);
			return {
				delivery,
				rows: await projectSkills({
					manifest: ctx.manifest,
					engineVersion: ctx.engineVersion
				}, {
					contentRoot: skillsRoots,
					ruleItems: delivery.ruleItems,
					demotedRules: delivery.demotedRules
				})
			};
		}),
		packsPromise.then(async (resolved) => planHooksInfra({
			rootDir: ctx.rootDir,
			manifest: ctx.manifest,
			packHooks: await packHookDefinitions(resolved.packs, ctx.rootDir),
			packAgents: resolved.agents,
			...ctx.facts.hookScriptsRoot === void 0 ? {} : { hookScriptsRoot: ctx.facts.hookScriptsRoot },
			pluginOwnedHooks: TOOLS.filter((tool) => isPluginOwned(ctx.manifest, tool, "hooks"))
		})),
		packsPromise
	]);
	const skills = mergeSkillProjections(skillsPass.rows.filter((row) => row.artifactType !== "skill" || row.origin !== "pack"), resolvedPacks);
	const serverIds = [...ctx.manifest.mcp?.servers ?? []];
	const protocolVersion = ctx.manifest.mcp?.protocolVersion;
	return {
		agentsMd,
		skills,
		demotedRules: skillsPass.delivery.demotedRules,
		hooks,
		packMcpServers: resolvedPacks.mcpServers,
		mcpFor: (tool) => {
			if (serverIds.length === 0 || tool === "codex") return [];
			return planMcpEmissions(serverIds, [tool], {
				...protocolVersion === void 0 ? {} : { protocolVersion },
				packServers: resolvedPacks.mcpServers
			});
		}
	};
}
async function planRuleDelivery(ctx, contentRoot) {
	const mode = readRuleDelivery(ctx.manifest);
	if (mode === "always-on") return {
		ruleItems: [],
		demotedRules: NO_DEMOTED_RULES
	};
	const index = await buildContentIndex(contentRoot);
	const allowlist = buildSelectionAllowlist(ctx.manifest.selection);
	const ruleItems = index.items.filter((item) => item.type === "rule" && index.byKey.get(typeIdKey(item.type, item.id)) === item && classifySelection(item, allowlist) !== "drop");
	const selected = new Set(ctx.manifest.tools);
	return {
		ruleItems,
		demotedRules: Object.fromEntries(TOOLS.map((tool) => [tool, selected.has(tool) ? demotedRuleIds(tool, ruleItems.filter((item) => item.tools === void 0 || item.tools.includes(tool)).map(ruleDeliveryInputOf), mode, SHARED_SKILLS_TREE_READERS) : /* @__PURE__ */ new Set()]))
	};
}
function mergeSkillProjections(corpusSkills, packs) {
	refuseOverrideDirectoryClash(corpusSkills);
	const corpusByPath = new Map(corpusSkills.map((row) => [row.path, row]));
	for (const row of packs.skillRows) {
		const corpusRow = corpusByPath.get(row.path);
		if (corpusRow === void 0) continue;
		const packId = packSupplierOf(packs.items, row.artifactId);
		if (isCustomizingRow(corpusRow)) {
			const overridePath = customizingSkillFilePath(corpusRow);
			throw new EngineError(`Pack-skill overrides are unsupported today: the ${customizingNounOf(corpusRow)} at "${overridePath}" ${corpusRow.artifactId === row.artifactId ? `takes the catalog id ("${row.artifactId}") of ${packId === void 0 ? "an installed pack" : `installed pack "${packId}"`}'s skill, and so projects into that skill's directory` : `shares its directory with the pack skill "${row.artifactId}"'s`} (both would project to the client). Remove or rename ${overridePath}, or remove the pack (\`clean --pack ${packId ?? "<pack-id>"}\`).`, { code: "VALIDATION_ERROR" });
		}
		throw new EngineError(`${packId === void 0 ? "An installed pack" : `Installed pack "${packId}"`} supplies skill "${row.artifactId}" under a directory the corpus skill "${corpusRow.artifactId}" already projects into: both emit "${corpusRow.path}". One ${SKILLS_PROJECTION_DIR} directory holds one skill — projecting both would write each skill's files over the other's. Rename the skill's directory inside the pack, or remove the pack (\`clean --pack ${packId ?? "<pack-id>"}\`).`, { code: "VALIDATION_ERROR" });
	}
	return [...corpusSkills, ...packs.skillRows].toSorted((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
function projectionDirOf(path) {
	return path.slice(`.agents/skills/`.length).split("/")[0] ?? "";
}
function refuseOverrideDirectoryClash(corpusSkills) {
	const lowestByDir = /* @__PURE__ */ new Map();
	for (const row of corpusSkills) {
		const dir = projectionDirOf(row.path);
		const held = lowestByDir.get(dir);
		if (held === void 0 || layerRankOf(row) < layerRankOf(held)) lowestByDir.set(dir, row);
	}
	for (const row of corpusSkills) {
		if (!isCustomizingRow(row)) continue;
		const other = lowestByDir.get(projectionDirOf(row.path));
		if (other === void 0 || layerRankOf(other) >= layerRankOf(row) || other.artifactId === row.artifactId) continue;
		const overridePath = customizingSkillFilePath(row);
		const noun = customizingNounOf(row);
		throw new EngineError(`The ${noun} at "${overridePath}" declares id "${row.artifactId}" but sits in a directory the skill "${other.artifactId}" already projects into: both emit "${other.path}". One ${SKILLS_PROJECTION_DIR} directory holds one skill — projecting both would write each skill's files over the other's. Rename the ${noun}'s directory to match its own id ("${row.artifactId}"), or change the id to override "${other.artifactId}" outright.`, { code: "VALIDATION_ERROR" });
	}
}
function isCustomizingRow(row) {
	return row.origin === "user" || row.origin === "fork";
}
function customizingNounOf(row) {
	return row.origin === "fork" ? "fork skill" : "override";
}
function packSupplierOf(items, skillId) {
	return items.find((item) => item.type === "skill" && item.id === skillId)?.provenance?.pack;
}
function customizingSkillFilePath(row) {
	return row.origin === "fork" ? `fork/${row.artifactPath}` : `${STATE_DIR}/overrides/${row.artifactPath}`;
}
function composeEmissionPlanner(residues) {
	const registered = TOOLS.filter((tool) => residues[tool] !== void 0);
	const planWithWarnings = async (ctx) => {
		const packs = await resolveInstalledPackContent(ctx.rootDir, ctx.manifest, contentRootsOf(ctx.contentRoot).root);
		const core = await buildCoreEmissionPlan(ctx, packs);
		const residueCtx = residueContext(ctx, packs);
		const tools = TOOLS.filter((tool) => ctx.manifest.tools.includes(tool));
		const rows = /* @__PURE__ */ new Map();
		const sharedPaths = /* @__PURE__ */ new Set();
		const replacedPaths = /* @__PURE__ */ new Set();
		const sharedOwners = (artifactId, artifactType) => tools.map((tool) => ({
			adapter: tool,
			artifactId,
			artifactType
		}));
		const projectionReaders = tools.filter((tool) => residues[tool]?.facts.readsAgentsSkillsDir !== false);
		if (tools.length > 0) {
			addRow(rows, AGENTS_MD_FILE, core.agentsMd.root.content, sharedOwners(CHARTER_ARTIFACT_ID, "infra"));
			const projectionOwners = sharedProjectionOwners(ctx.manifest, projectionReaders);
			for (const file of core.skills) {
				const owners = file.origin === "pack" ? projectionReaders : projectionOwners;
				if (owners.length === 0) continue;
				addRow(rows, file.path, file.content, owners.map((tool) => ({
					adapter: tool,
					artifactId: file.artifactId,
					artifactType: file.artifactType
				})));
			}
			const policy = core.hooks.policyDocument;
			if (policy.owners.length > 0) addRow(rows, policy.path, policy.content, policy.owners.map((tool) => ({
				adapter: tool,
				artifactId: POLICY_DOCUMENT_ARTIFACT_ID,
				artifactType: "infra"
			})));
			for (const path of rows.keys()) sharedPaths.add(path);
		}
		for (const script of core.hooks.scripts) addRow(rows, script.path, script.content, [{
			adapter: script.tool,
			artifactId: hookScriptArtifactId(script.path),
			artifactType: "infra"
		}]);
		for (const tool of tools) for (const nested of core.agentsMd.nestedFor(tool)) addRow(rows, nested.outputPath, nested.content, [{
			adapter: tool,
			artifactId: CHARTER_ARTIFACT_ID,
			artifactType: "infra"
		}]);
		const settled = await Promise.allSettled(tools.map((tool) => residues[tool]?.planResidue(core, residueCtx) ?? Promise.resolve({ outputs: [] })));
		const residueWarnings = [];
		for (const [index, tool] of tools.entries()) {
			const outcome = settled[index];
			if (outcome.status === "rejected") {
				const reason = outcome.reason;
				throw new EngineError(`The "${tool}" residue planner failed while planning its per-client output: ${reason instanceof Error ? reason.message : String(reason)}. No files were written. Fix the adapter defect (or deselect the tool) and re-run.`, {
					code: "ADAPTER_ERROR",
					cause: reason
				});
			}
			for (const output of outcome.value.outputs) mergeResidueRow(rows, sharedPaths, replacedPaths, tool, output);
			residueWarnings.push(...outcome.value.warnings ?? []);
		}
		applyImportDecisions(rows, importDecisionsOf(ctx.manifest), ctx.engineVersion);
		return {
			outputs: [...rows.values()].toSorted((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0).map((row) => {
				const output = {
					path: row.path,
					content: row.content,
					owner: row.owners[0]
				};
				if (row.owners.length > 1) output.coOwners = row.owners.slice(1);
				return output;
			}),
			warnings: [
				...core.hooks.warnings,
				...effortDisclosures(ctx.manifest),
				...residueWarnings
			]
		};
	};
	return {
		id: `core+residue[${registered.join(",")}]`,
		plan: async (ctx) => (await planWithWarnings(ctx)).outputs,
		planWithWarnings
	};
}
function residueContext(ctx, packs) {
	if (packs.items.length === 0) return ctx;
	const spec = contentRootsOf(ctx.contentRoot);
	return {
		...ctx,
		contentRoot: {
			...spec.root === void 0 ? {} : { root: spec.root },
			packRoots: [...spec.packRoots, ...packs.packRoots],
			...spec.forkRoot === void 0 ? {} : { forkRoot: spec.forkRoot },
			...spec.overrideRoot === void 0 ? {} : { overrideRoot: spec.overrideRoot }
		},
		manifest: selectionWithInstalledPacks(ctx.manifest, packs.items)
	};
}
function importDecisionsOf(manifest) {
	return manifest.importChoice ?? [];
}
function applyImportDecisions(rows, decisions, engineVersion) {
	for (const decision of decisions) applyImportDecision(rows, decision, engineVersion);
}
function applyImportDecision(rows, decision, engineVersion) {
	const row = rows.get(decision.path);
	if (row === void 0) return;
	if (decision.mode === "skip") {
		rows.delete(decision.path);
		return;
	}
	if (decision.mode !== "supplement") return;
	if (!canHostManagedBlock(decision.path)) throw new EngineError(`The recorded import decision for "${decision.path}" is "supplement", but that file has no comment syntax to carry a managed block — the markers would make it unparseable for the client that reads it. Record "skip" (leave the file alone) or "replace" (write over it behind a verified .bak) for this path in ${STATE_DIR}/${MANIFEST_FILE}, or remove the decision so the file is emitted normally.`, { code: "VALIDATION_ERROR" });
	if (!hasManagedBlock(row.content, decision.path)) row.content = wrapInManagedBlock(row.content, decision.path, engineVersion);
}
function addRow(rows, path, content, owners) {
	const existing = rows.get(path);
	if (existing === void 0) {
		rows.set(path, {
			path,
			content,
			owners: dedupeOwners([], owners)
		});
		return;
	}
	if (existing.content !== content) throw new EngineError(`Two planners emitted different content for "${path}" (owners: ${[...existing.owners, ...owners].map((owner) => owner.adapter).join(", ")}). One path has one writer: make the emissions byte-identical, or flag the overriding row with replacesSharedPath for a shared core path.`, { code: "VALIDATION_ERROR" });
	existing.owners = dedupeOwners(existing.owners, owners);
}
function mergeResidueRow(rows, sharedPaths, replacedPaths, tool, output) {
	const owners = outputOwners(output);
	if (output.replacesSharedPath !== true) {
		addRow(rows, output.path, output.content, owners);
		return;
	}
	if (!sharedPaths.has(output.path)) throw new EngineError(`The "${tool}" residue planner flagged "${output.path}" with replacesSharedPath, but the core plan does not emit that path as a shared row. Replacement substitutes a co-owned core emission (e.g. the root ${AGENTS_MD_FILE}); emit any other path as a plain residue row instead.`, { code: "VALIDATION_ERROR" });
	if (replacedPaths.has(output.path)) throw new EngineError(`Two residue planners replaced the shared path "${output.path}" (second: "${tool}"). A shared row takes at most one replacement per plan — one path, one writer.`, { code: "VALIDATION_ERROR" });
	replacedPaths.add(output.path);
	const target = rows.get(output.path);
	target.content = output.content;
	target.owners = dedupeOwners(target.owners, owners);
}
function dedupeOwners(base, extra) {
	const merged = [];
	const seen = /* @__PURE__ */ new Set();
	for (const owner of [...base, ...extra]) {
		if (seen.has(owner.adapter)) continue;
		seen.add(owner.adapter);
		merged.push({
			adapter: owner.adapter,
			artifactId: owner.artifactId,
			artifactType: owner.artifactType
		});
	}
	return merged;
}
//#endregion
//#region src/adapters/toml.ts
var toml_exports = /* @__PURE__ */ __exportAll({
	serializeTomlDocument: () => serializeTomlDocument,
	tomlBasicString: () => tomlBasicString,
	tomlMultilineBasicString: () => tomlMultilineBasicString
});
const BARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;
const SHORT_ESCAPES = {
	"\b": "\\b",
	"	": "\\t",
	"\n": "\\n",
	"\f": "\\f",
	"\r": "\\r"
};
function serializeTomlDocument(doc) {
	const blocks = [];
	const comments = doc.comments ?? [];
	if (comments.length > 0) blocks.push(renderComments(comments));
	const seenHeaders = /* @__PURE__ */ new Set();
	let sawHeader = false;
	for (const table of doc.tables) {
		const lines = [];
		if (table.header === null) {
			if (sawHeader) throw new EngineError(`A top-level TOML block follows the table [${[...seenHeaders].join("], [")}]. TOML binds bare keys to the most recent table, so top-level keys must be emitted before the first header — move the null-header table to the front.`, { code: "VALIDATION_ERROR" });
		} else {
			const header = renderHeader(table.header);
			if (seenHeaders.has(header)) throw new EngineError(`TOML table [${header}] is defined twice in one document. A repeated header is a redefinition, not a merge — emit one table with every key.`, { code: "VALIDATION_ERROR" });
			seenHeaders.add(header);
			sawHeader = true;
			lines.push(`[${header}]`);
		}
		const seenKeys = /* @__PURE__ */ new Set();
		for (const [key, value] of table.entries) {
			if (seenKeys.has(key)) throw new EngineError(`TOML key "${key}" is emitted twice in ${table.header === null ? "the top-level block" : `[${renderHeader(table.header)}]`}. A repeated key is a redefinition — emit one entry per key.`, { code: "VALIDATION_ERROR" });
			seenKeys.add(key);
			lines.push(`${renderKey(key)} = ${renderValue$1(key, value)}`);
		}
		if (lines.length > 0) blocks.push(lines.join("\n"));
	}
	return blocks.length === 0 ? "" : `${blocks.join("\n\n")}\n`;
}
function renderComments(comments) {
	return comments.flatMap((comment) => comment.split("\n")).map((line) => line === "" ? "#" : `# ${line}`).join("\n");
}
function renderHeader(header) {
	if (header.trim() === "") throw new EngineError("A TOML table header is empty. Name the table, or pass header: null for the document's top-level key block.", { code: "VALIDATION_ERROR" });
	return header.split(".").map((segment) => renderKey(segment)).join(".");
}
function renderKey(key) {
	return BARE_TOKEN_PATTERN.test(key) ? key : tomlBasicString(key);
}
function renderValue$1(key, value) {
	if (typeof value === "boolean") return value ? "true" : "false";
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new EngineError(`TOML key "${key}" carries the non-finite number ${String(value)}. Emit a finite number, or omit the key — a placeholder value in a config file reads as a real one.`, { code: "VALIDATION_ERROR" });
		return String(value);
	}
	return value.includes("\n") ? tomlMultilineBasicString(value) : tomlBasicString(value);
}
function tomlBasicString(value) {
	let out = "";
	for (const char of value) if (char === "\"") out += "\\\"";
	else out += escapeCommon(char) ?? char;
	return `"${out}"`;
}
function tomlMultilineBasicString(value) {
	let out = "";
	let quoteRun = 0;
	const flushQuotes = (atEnd) => {
		if (quoteRun === 0) return;
		out += (quoteRun >= 3 || atEnd ? "\\\"" : "\"").repeat(quoteRun);
		quoteRun = 0;
	};
	for (const char of value) {
		if (char === "\"") {
			quoteRun += 1;
			continue;
		}
		flushQuotes(false);
		if (char === "\n" || char === "	") out += char;
		else out += escapeCommon(char) ?? char;
	}
	flushQuotes(true);
	return `"""\n${out}"""`;
}
function escapeCommon(char) {
	if (char === "\\") return "\\\\";
	const short = SHORT_ESCAPES[char];
	if (short !== void 0) return short;
	const code = char.codePointAt(0) ?? 0;
	if (code < 32 || code === 127) return `\\u${code.toString(16).padStart(4, "0")}`;
	return null;
}
//#endregion
//#region src/adapters/codex.ts
var codex_exports = /* @__PURE__ */ __exportAll({
	CODEX_AGENTS_DIR: () => CODEX_AGENTS_DIR,
	CODEX_AGENTS_MD_BUDGET_BYTES: () => CODEX_AGENTS_MD_BUDGET_BYTES,
	CODEX_COMMANDS_DIR: () => null,
	CODEX_CONFIG_FILE: () => CODEX_CONFIG_FILE,
	CODEX_HOOKS_FILE: () => CODEX_HOOKS_FILE,
	CODEX_SKILLS_LIST_BUDGET_CHARS: () => CODEX_SKILLS_LIST_BUDGET_CHARS,
	buildAgentToml: () => buildAgentToml,
	buildHooksJson: () => buildHooksJson$1,
	codexResiduePlanner: () => codexResiduePlanner,
	composeConfigToml: () => composeConfigToml,
	downConvertRules: () => downConvertRules,
	skillsListCharacters: () => skillsListCharacters
});
const CODEX_DIR = ".codex";
const CODEX_HOOKS_FILE = `${CODEX_DIR}/hooks.json`;
const CODEX_CONFIG_FILE = `${CODEX_DIR}/config.toml`;
const CODEX_AGENTS_DIR = `${CODEX_DIR}/agents`;
const CODEX_AGENTS_MD_BUDGET_BYTES = 32768;
const CODEX_SKILLS_LIST_BUDGET_CHARS = 8e3;
const LOSSY_GAP = "open codex#34002";
const HOOK_TRUST_STEPS = [
	"Three steps stand between this file and a hook the client runs.",
	"1. Feature flag: `features.hooks = true`. The client defaults it OFF (deprecated alias",
	`   \`features.codex_hooks\`), so this file is not read until it is on. ${CODEX_CONFIG_FILE}`,
	"   carries it; the per-invocation equivalent is `codex exec --enable hooks`, which is",
	"   shorthand for `-c features.hooks=true`.",
	"2. Project trust: a project `.codex/` layer loads only when it is trusted. Record",
	"   `projects.<path>.trust_level = \"trusted\"` in the Codex home config (`~/.codex/config.toml`),",
	"   which is the operator's file and not one this engine writes.",
	"3. Per-hook review: each hook is trusted by hash through the interactive `/hooks` command.",
	"   Automation that cannot take that step runs `--dangerously-bypass-hook-trust`, which runs",
	"   enabled hooks with no persisted trust.",
	`Key set and default: learn.chatgpt.com/docs/config-file/config-reference (accessed 2026-09-15).`
];
const SKILL_FILE$2 = "SKILL.md";
const APPENDIX_TITLE = "Conditional rules (Codex down-conversion)";
const TOOL$1 = "codex";
const HOOKS_ARTIFACT_ID = "codex-hooks";
const CONFIG_ARTIFACT_ID = "codex-config";
const HOOK_INFRA_ARTIFACT_IDS$2 = /* @__PURE__ */ new Set([HOOKS_ARTIFACT_ID, "codex-portable-hook"]);
const RULES_APPENDIX_ARTIFACT_ID = "codex-rules-appendix";
const EFFORT_SCALE_CAP$1 = `${CLIENT_MODEL_PROJECTION.codex.effortScale.join(", ")} — the levels this client's \`model_reasoning_effort\` key accepts; xhigh is model-dependent, so a model that does not offer it falls back to that model's own default (learn.chatgpt.com/docs/config-file/config-reference, accessed 2026-09-17). This is the only supported client documenting \`minimal\`, and the only one that cannot be asked for \`max\`: a \`max\` request is emitted as \`xhigh\` with a disclosure, never dropped`;
const codexResiduePlanner = {
	tool: TOOL$1,
	facts: {
		tool: TOOL$1,
		ruleShape: `no glob-scoped rule layer; conditional rules down-convert into nested AGENTS.md files (documented lossy — upstream gap: ${LOSSY_GAP})`,
		hooksConfigPath: CODEX_HOOKS_FILE,
		readsAgentsSkillsDir: true,
		agentsFormat: `TOML subagent definitions under ${CODEX_AGENTS_DIR}/`,
		mcpDialect: "codex-toml",
		entryFile: null,
		caps: [
			{
				name: "AGENTS.md budget",
				value: `${CODEX_AGENTS_MD_BUDGET_BYTES} bytes (32 KiB)`
			},
			{
				name: "hook enforcement",
				value: "exit 2 denies supported tool calls after native /hooks trust; the core role guard is telemetry because PreToolUse has no agent identity. Hosted tools and specialized paths may bypass hooks; use native sandbox/permissions for enforcement. Three steps stand between the emitted hooks.json and a hook that runs — `features.hooks = true`, which this engine writes into .codex/config.toml and the client defaults OFF; `projects.<path>.trust_level = \"trusted\"` in the operator's own Codex home config; and a per-hook hash review through the interactive /hooks command, or --dangerously-bypass-hook-trust for automation that cannot take that step — and with all three in place headless `codex exec` on codex-cli 0.154.0 still loaded no project hook layer at all in this repository's 2026-09-15 measurement, so a hook is enforcement in the interactive client and nothing in that lane."
			},
			{
				name: "per-agent tool allowlist",
				value: "no native per-agent tools list is documented as of 2026-09-10; no placeholder key is emitted. sandbox_mode carries the supported filesystem boundary; the policy grant remains a prompt-level restriction."
			},
			{
				name: "command-surface",
				value: "none — custom prompts live in the user's Codex home directory, not the repository, and are deprecated in favour of skills, so the nine touchpoint bodies are not emitted here; the charter's touchpoint index still names them"
			},
			{
				name: "effort-scale",
				value: EFFORT_SCALE_CAP$1
			}
		],
		citations: [
			{
				url: "https://learn.chatgpt.com/docs/agent-configuration/subagents",
				accessDate: "2026-09-10"
			},
			{
				url: "https://learn.chatgpt.com/docs/hooks",
				accessDate: "2026-09-17"
			},
			{
				url: "https://learn.chatgpt.com/docs/config-file/config-reference",
				accessDate: "2026-09-15"
			},
			{
				url: "https://learn.chatgpt.com/docs/custom-prompts",
				accessDate: "2026-09-10"
			}
		]
	},
	async planResidue(core, ctx) {
		const skillsListChars = skillsListCharacters(core.skills);
		if (skillsListChars > 8e3) throw new EngineError(`codex skills list is ${skillsListChars} characters; this setup caps it at ${CODEX_SKILLS_LIST_BUDGET_CHARS}. Every skill's name and description sits in the client's context for the whole session, and nothing here can choose which skill to leave out of that listing, so the run refuses instead of shipping a list past the bound. Narrow the content selection, or set \`ruleDelivery: "always-on"\` to deliver rules as instruction text instead of as skills.`, { code: "VALIDATION_ERROR" });
		const { agents, rules } = await selectedItems$1(ctx);
		const render = bodyRenderer$1(ctx);
		const models = {
			...ctx.manifest.models?.pins === void 0 ? {} : { pins: ctx.manifest.models.pins },
			...ctx.manifest.models?.effort === void 0 ? {} : { efforts: ctx.manifest.models.effort }
		};
		const rows = [
			emissionRow(CODEX_HOOKS_FILE, buildHooksJson$1(core, ctx.facts.hookScriptsRoot), HOOKS_ARTIFACT_ID, "infra"),
			emissionRow(`.stamity/generated/hooks/codex/${PORTABLE_RUNNER_FILE}`, buildPortableHookRunner("codex"), "codex-portable-hook", "infra"),
			emissionRow(CODEX_CONFIG_FILE, composeConfigToml(core, ctx), CONFIG_ARTIFACT_ID, "infra")
		];
		for (const agent of agents) rows.push(emissionRow(`${CODEX_AGENTS_DIR}/${runtimeAgentId$1(agent.id)}.toml`, buildAgentToml(agent, grantFor$1(agent), render(agent.body), models), agent.id, "agent"));
		const demoted = core.demotedRules[TOOL$1];
		const renderedRules = [];
		for (const rule of rules) {
			if (demoted.has(rule.id)) continue;
			renderedRules.push({
				...rule,
				body: render(rule.body)
			});
		}
		const downConverted = downConvertRules(renderedRules, core.agentsMd.root.content, core.agentsMd.nestedFor(TOOL$1).map((target) => target.outputPath), ruleSkillIds(core.skills));
		for (const file of downConverted.nested) rows.push(emissionRow(file.path, file.content, RULES_APPENDIX_ARTIFACT_ID, "infra"));
		const warnings = [commandSurfaceWarning()];
		if (downConverted.rootReplacement !== null) {
			rows.push({
				...emissionRow(AGENTS_MD_FILE, downConverted.rootReplacement, CHARTER_ARTIFACT_ID, "infra"),
				replacesSharedPath: true
			});
			warnings.push(sharedCharterWarning(ctx.manifest.tools, Buffer.byteLength(core.agentsMd.root.content, "utf8"), Buffer.byteLength(downConverted.rootReplacement, "utf8")));
		}
		if (downConverted.dropped.length > 0) warnings.push(droppedRulesWarning(downConverted.dropped));
		return {
			outputs: withoutPluginOwnedRows(ctx.manifest, TOOL$1, rows, HOOK_INFRA_ARTIFACT_IDS$2).toSorted((a, b) => compareText(a.path, b.path)),
			warnings
		};
	}
};
function commandSurfaceWarning() {
	return `touchpoints [${TOOL$1}]: this client documents no project-scoped command directory, so none of the nine touchpoint workflow bodies is written for it. What ships is the charter's one-line index of the nine; a user who names one gets the index entry, not the workflow the other clients run. Select another client alongside it to get the bodies on disk.`;
}
function sharedCharterWarning(tools, beforeBytes, afterBytes) {
	const others = tools.filter((tool) => tool !== TOOL$1);
	if (others.length === 0) return `charter [${TOOL$1}]: the root ${AGENTS_MD_FILE} carries this client's inlined rules appendix — ${beforeBytes} bytes of charter became ${afterBytes}. That is this client's own always-on budget being spent; nothing else reads the file in this setup.`;
	return `charter [${TOOL$1}]: this client has no glob-scoped rule layer, so its rules are inlined into the SHARED root ${AGENTS_MD_FILE} — ${beforeBytes} bytes became ${afterBytes}. That file is read always-on by ${others.join(", ")} too, and those clients already attach the same rules natively, so they now carry the text twice. Deselecting ${TOOL$1} restores the shared charter to its ${beforeBytes}-byte form.`;
}
function droppedRulesWarning(dropped) {
	return `rules budget [${TOOL$1}]: ${dropped.length} rule(s) did not fit this client's ${CODEX_AGENTS_MD_BUDGET_BYTES}-byte instruction budget and were dropped, lowest risk first: ${dropped.join(", ")}. They are named again in the emitted ${AGENTS_MD_FILE}. Narrow the content selection to bring them back.`;
}
function droppedRuleLabel(id, onDemandIds) {
	const skillDir = `${SKILLS_PROJECTION_DIR}/${RULE_SKILL_DIR_PREFIX}${id}/`;
	return onDemandIds.has(id) ? `\`${id}\` (on demand at ${skillDir})` : `\`${id}\``;
}
function skillsListCharacters(skills) {
	let total = 0;
	for (const row of skills) {
		if (!row.path.endsWith(`/${SKILL_FILE$2}`)) continue;
		const head = parseFrontmatter(row.content, row.path).frontmatter;
		const name = typeof head["name"] === "string" ? head["name"] : "";
		const description = typeof head["description"] === "string" ? head["description"] : "";
		total += name.length + description.length + 3;
	}
	return total;
}
function ruleSkillIds(skills) {
	const ids = /* @__PURE__ */ new Set();
	for (const row of skills) if (row.artifactType === "rule" && row.path.endsWith(`/${SKILL_FILE$2}`)) ids.add(row.path.slice(0, -`/${SKILL_FILE$2}`.length).split("/").pop() ?? "");
	return new Set([...ids].map((dir) => dir.slice(8)));
}
function emissionRow(path, content, artifactId, artifactType) {
	return {
		path,
		content,
		owner: {
			adapter: TOOL$1,
			artifactId,
			artifactType
		}
	};
}
function runtimeAgentId$1(id) {
	return `${CONTENT_PREFIX}${id}`;
}
function grantFor$1(item) {
	const pack = item.provenance;
	return resolveAgentGrant({
		runtimeId: runtimeAgentId$1(item.id),
		frontmatter: item.frontmatter,
		...pack === void 0 ? {} : { declaredTools: grantableFootprint(pack.declaredTools) }
	});
}
async function selectedItems$1(ctx) {
	const index = await buildContentIndex(ctx.contentRoot);
	const allowlist = buildSelectionAllowlist(ctx.manifest.selection);
	const admitted = index.items.filter((item) => index.byKey.get(typeIdKey(item.type, item.id)) === item && classifySelection(item, allowlist) !== "drop" && (item.tools === void 0 || item.tools.includes(TOOL$1)));
	return {
		agents: admitted.filter((item) => item.type === "agent"),
		rules: admitted.filter((item) => item.type === "rule")
	};
}
function bodyRenderer$1(ctx) {
	const detection = detectionContextFromManifest(ctx.manifest);
	const gates = verificationGatesFromManifest(ctx.manifest);
	return (raw) => substituteCanonicalPlatformMarker(substituteVerificationGateTokens(substituteRepoTokens(raw, detection), gates), TOOL$1);
}
function hookTrustSentence() {
	return HOOK_TRUST_STEPS.join(" ").replaceAll(/\s+/gu, " ");
}
const SESSION_END_TIMEOUT_SECONDS = 3;
function buildHooksJson$1(core, hookScriptsRoot) {
	const hooks = {};
	for (const row of core.hooks.interchangeFor(TOOL$1)) {
		const event = CLAUDE_EVENT_NAMES[row.event];
		const groups = hooks[event] ??= [];
		let group = groups.find((entry) => entry.matcher === row.matcher);
		if (group === void 0) {
			group = {
				...row.matcher === void 0 ? {} : { matcher: row.matcher },
				hooks: []
			};
			groups.push(group);
		}
		group.hooks.push({
			type: "command",
			command: portableHookCommand("codex", row),
			commandWindows: portableHookCommand("codex", row),
			...row.event === "session_end" ? { timeout: Math.min(SESSION_END_TIMEOUT_SECONDS, row.timeoutMs === void 0 ? SESSION_END_TIMEOUT_SECONDS : Math.ceil(row.timeoutMs / 1e3)) } : row.timeoutMs === void 0 ? {} : { timeout: Math.ceil(row.timeoutMs / 1e3) }
		});
	}
	const scriptsDir = hookScriptsRoot ?? `.stamity/generated/hooks/${TOOL$1}`;
	const description = `Stamity hooks. ${hookTrustSentence()} Trust is recorded against this file's hash only: the hook script bytes under ${scriptsDir}/ are outside it and can change without re-review, so stamity check is the control for them and for emitted-file drift generally. The role guard is telemetry because PreToolUse carries no agent identity.`;
	return `${JSON.stringify({
		description,
		hooks
	}, null, 2)}\n`;
}
const MUTATING_CATEGORIES = /* @__PURE__ */ new Set(["edit", "execute"]);
function buildAgentToml(item, grant, body = item.body, opts = {}) {
	const runtimeId = runtimeAgentId$1(item.id);
	const allow = grant.allow;
	const entries = [
		["name", runtimeId],
		["description", item.description],
		["sandbox_mode", allow.some((category) => MUTATING_CATEGORIES.has(category)) ? "workspace-write" : "read-only"]
	];
	const declaredClass = item.frontmatter.model_class;
	if (typeof declaredClass === "string") {
		const model = resolveModelValue(declaredClass, TOOL$1, opts.pins);
		if (model !== void 0) entries.push(["model", model]);
		const effort = resolveEffortValue(declaredClass, TOOL$1, opts.efforts);
		if (effort !== void 0) entries.push(["model_reasoning_effort", effort]);
	}
	const rolePolicy = allow.length === 0 ? "Role tool policy: no tool categories are granted. Decline tool use and return the missing permission to the parent." : `Role tool policy: only use tools in these categories: ${allow.join(", ")}. If work needs another category, return that dependency to the parent. Native sandbox and approval controls still apply.`;
	entries.push(["developer_instructions", `${body.trim()}\n\n${rolePolicy}\n`]);
	const comments = [
		`stamity — Codex subagent "${runtimeId}". Generated file: regenerate rather than`,
		"editing it; local edits are overwritten.",
		"",
		"Key set: learn.chatgpt.com/docs/agent-configuration/subagents (accessed 2026-09-10).",
		`Stamity role grant: ${toCodexToolsFrontmatter(allow) || "none"}. No native tools key is documented.`,
		"sandbox_mode binds the filesystem boundary; category restrictions remain prompt-level."
	];
	if (grant.source === "none") comments.push("", `No resolvable grant for "${runtimeId}" — neither a roster row nor capabilities this`, "engine can derive one from. The grant is empty by default, and the generated", "role must decline tool use; the identity-free hook cannot enforce that role grant.");
	return serializeTomlDocument({
		comments,
		tables: [{
			header: null,
			entries
		}]
	});
}
function composeConfigToml(core, ctx) {
	const reserved = core.mcpFor(TOOL$1);
	if (reserved.length > 0) throw new EngineError(`The core plan returned ${reserved.length} generic MCP document(s) for codex (${reserved.map((emission) => emission.path).join(", ")}), but ${CODEX_CONFIG_FILE} is composed by this adapter alone. Keep the codex-toml dialect reserved to the codex residue planner, or move composition into the core — one path takes one writer.`, { code: "VALIDATION_ERROR" });
	return `${serializeTomlDocument({
		comments: [
			"stamity — Codex CLI configuration. Generated file: regenerate rather than editing",
			"it; local edits are overwritten.",
			"",
			"Composed by one writer: the MCP server tables below are rendered from the curated",
			"catalog, and any adapter-level table joins them here rather than in a second file.",
			"",
			`Hooks: ${CODEX_HOOKS_FILE} · subagents: ${CODEX_AGENTS_DIR}/ · standards: ${AGENTS_MD_FILE}.`
		],
		tables: []
	})}\n${serializeTomlDocument({
		comments: [
			"Lifecycle hooks: OFF by default in the client, so an emitted hooks.json does nothing",
			"until this key turns it on. Enabling it here is step 1 of 3.",
			"",
			...HOOK_TRUST_STEPS,
			"",
			"One writer: this whole file is generated, so a `[features]` table of your own does not",
			"belong in it — TOML reads a second [features] header as a redefinition, not a merge, and",
			"a regeneration would drop the keys anyway. Your own keys are never clobbered: the engine",
			"refuses to overwrite a file it does not own (sync reports an unmanaged-name collision),",
			"so keep your file and add `hooks = true` INTO your existing [features] table.",
			"Removing this key (or setting it false) makes every emitted hook inert with no other",
			"signal — the client reads none of them — and `sync` restores `hooks = true` on this file",
			"the next time it regenerates it."
		],
		tables: [{
			header: "features",
			entries: [["hooks", true]]
		}]
	})}\n${emitCodexToml(ctx.manifest.mcp?.servers ?? [], { packServers: core.packMcpServers })}`;
}
const PRECEDENCE_RANK = {
	critical: 0,
	high: 1,
	normal: 2,
	low: 3
};
function downConvertRules(items, coreRoot, coreNestedPaths = [], onDemandIds = /* @__PURE__ */ new Set()) {
	const sections = items.map(toSection).toSorted((a, b) => compareText(a.id, b.id));
	const taken = new Set(coreNestedPaths);
	const rootSections = [];
	const byPath = /* @__PURE__ */ new Map();
	for (const section of sections) {
		if (section.anchor === null) {
			rootSections.push(section);
			continue;
		}
		const path = `${section.anchor}/${AGENTS_MD_FILE}`;
		if (taken.has(path)) {
			rootSections.push({
				...section,
				reroutedFrom: section.anchor
			});
			continue;
		}
		byPath.set(path, [...byPath.get(path) ?? [], section]);
	}
	const dropped = [];
	const nested = [...byPath.entries()].toSorted(([a], [b]) => compareText(a, b)).map(([path, group]) => {
		const anchor = path.slice(0, -10);
		const shaped = shapeToBudget(group, (kept, omitted) => renderAppendix({
			head: "",
			scope: anchor,
			titleLevel: 1,
			sections: kept,
			dropped: omitted,
			onDemandIds
		}));
		dropped.push(...shaped.dropped);
		return {
			path,
			content: shaped.content
		};
	});
	let rootReplacement = null;
	if (rootSections.length > 0) {
		const shaped = shapeToBudget(rootSections, (kept, omitted) => renderAppendix({
			head: coreRoot,
			scope: null,
			titleLevel: 2,
			sections: kept,
			dropped: omitted,
			onDemandIds
		}));
		dropped.push(...shaped.dropped);
		rootReplacement = shaped.content;
	}
	return {
		nested,
		rootReplacement,
		dropped: dropped.toSorted(compareText)
	};
}
function toSection(item) {
	const globs = declaredRuleGlobs(item);
	const precedence = item.precedence ?? "normal";
	return {
		id: item.id,
		precedence,
		risk: {
			critical: precedence === "critical",
			floorTagged: item.tags.some(isFloorTag)
		},
		globs,
		description: item.description,
		body: item.body,
		anchor: ruleAnchor(globs)
	};
}
function shapeToBudget(sections, render) {
	const kept = [...sections];
	const dropped = [];
	let content = render(kept, dropped);
	while (Buffer.byteLength(content, "utf8") > 32768 && kept.length > 0) {
		const victim = lowestRisk(kept);
		kept.splice(kept.indexOf(victim), 1);
		dropped.push(victim.id);
		content = render(kept, dropped.toSorted(compareText));
	}
	return {
		content,
		dropped: dropped.toSorted(compareText)
	};
}
function compareDropOrder(a, b) {
	const critical = rank(a.risk.critical) - rank(b.risk.critical);
	if (critical !== 0) return critical;
	const floor = rank(a.risk.floorTagged) - rank(b.risk.floorTagged);
	if (floor !== 0) return floor;
	const precedence = PRECEDENCE_RANK[a.precedence] - PRECEDENCE_RANK[b.precedence];
	if (precedence !== 0) return precedence;
	return compareText(a.id, b.id);
}
function rank(flagged) {
	return flagged ? 0 : 1;
}
function lowestRisk(sections) {
	return sections.reduce((worst, section) => compareDropOrder(section, worst) > 0 ? section : worst);
}
function renderAppendix(input) {
	const blocks = [];
	if (input.head !== "") blocks.push(input.head.trimEnd());
	const title = input.scope === null ? APPENDIX_TITLE : `${APPENDIX_TITLE} — \`${input.scope}\``;
	blocks.push(`${"#".repeat(input.titleLevel)} ${title}`);
	blocks.push(`Codex has no glob-scoped rule layer, so the rules below are inlined here instead of attaching only when a matching file is read (documented lossy — upstream gap: ${LOSSY_GAP}). Each section names what it was authored to attach to: apply it when those paths are in play.`);
	for (const section of input.sections) blocks.push(renderSection(section, input.titleLevel + 1));
	if (input.dropped.length > 0) blocks.push(renderDroppedNotice(input.dropped, input.titleLevel + 1, input.onDemandIds));
	return `${blocks.join("\n\n")}\n`;
}
function renderSection(section, level) {
	const heading = `${"#".repeat(level)} ${section.id}`;
	const body = demoteHeadings(stripLeadingH1(section.body), level - 1);
	return [
		heading,
		attachmentNote(section),
		body
	].filter((part) => part !== "").join("\n\n");
}
function attachmentNote(section) {
	if (section.reroutedFrom !== void 0) return `**Authored for:** ${globList(section.globs)} — inlined at the repository root because \`${section.reroutedFrom}/${AGENTS_MD_FILE}\` is a workspace-package charter copy with its own writer (documented lossy — upstream gap: ${LOSSY_GAP}).`;
	if (section.globs.length === 0) return `**Trigger:** ${section.description === "" ? "no declared trigger" : section.description} — inlined here because Codex has no description-triggered rule layer (documented lossy — upstream gap: ${LOSSY_GAP}).`;
	return `**Attaches to:** ${globList(section.globs)} — inlined here because Codex cannot scope a rule by glob (documented lossy — upstream gap: ${LOSSY_GAP}).`;
}
function globList(globs) {
	return globs.map((glob) => `\`${glob}\``).join(", ");
}
function renderDroppedNotice(dropped, level, onDemandIds) {
	return [
		`${"#".repeat(level)} Omitted for the ${CODEX_AGENTS_MD_BUDGET_BYTES}-byte budget`,
		`Codex reads at most ${CODEX_AGENTS_MD_BUDGET_BYTES} bytes (32 KiB) of instruction text, and this setup shapes each ${AGENTS_MD_FILE} to that ceiling on its own. These rules did not fit THIS file and were dropped, lowest risk first — rules marked critical are kept longest, then floor-tagged rules, then by declared precedence, then by id: ${dropped.map((id) => droppedRuleLabel(id, onDemandIds)).join(", ")}. Narrow the content selection to bring them back.`,
		`**Per-file shaping only — the aggregate is not enforced.** The ceiling applies to the CONCATENATION a session loads: the root ${AGENTS_MD_FILE} plus every nested one down to the working directory. Nothing here measures that total, so files that each fit can still overflow together, and the excess is dropped by the client without a message. Check it for the directory you work in: \`cat ${AGENTS_MD_FILE} path/to/dir/${AGENTS_MD_FILE} | wc -c\`, against ${CODEX_AGENTS_MD_BUDGET_BYTES}.`
	].join("\n\n");
}
function stripLeadingH1(body) {
	const trimmed = body.trim();
	if (!trimmed.startsWith("# ")) return trimmed;
	const newline = trimmed.indexOf("\n");
	return newline === -1 ? "" : trimmed.slice(newline + 1).trim();
}
function demoteHeadings(body, levels) {
	if (levels <= 0) return body;
	let fenced = false;
	return body.split("\n").map((line) => {
		if (/^\s*(?:```|~~~)/.test(line)) {
			fenced = !fenced;
			return line;
		}
		if (fenced) return line;
		const match = /^(#{1,6})(?=\s)/.exec(line);
		if (match === null) return line;
		const hashes = match[1] ?? "";
		return `${"#".repeat(Math.min(6, hashes.length + levels))}${line.slice(hashes.length)}`;
	}).join("\n");
}
function compareText(a, b) {
	return a < b ? -1 : a > b ? 1 : 0;
}
//#endregion
//#region src/adapters/copilot.ts
var copilot_exports = /* @__PURE__ */ __exportAll({
	COPILOT_AGENT_PROMPT_CAP: () => COPILOT_AGENT_PROMPT_CAP,
	COPILOT_DIALECT_FACTS: () => COPILOT_DIALECT_FACTS,
	COPILOT_HOOKS_PATH: () => COPILOT_HOOKS_PATH,
	COPILOT_PROMPTS_DIR: () => COPILOT_PROMPTS_DIR,
	COPILOT_SETUP_STEPS_PATH: () => COPILOT_SETUP_STEPS_PATH,
	buildAgentFile: () => buildAgentFile,
	buildCopilotHooksJson: () => buildCopilotHooksJson,
	buildInstructionsFile: () => buildInstructionsFile,
	buildPromptFile: () => buildPromptFile,
	buildSetupSteps: () => buildSetupSteps,
	copilotResiduePlanner: () => copilotResiduePlanner
});
const TOOL = "copilot";
const INSTRUCTIONS_DIR = ".github/instructions";
const AGENTS_DIR = ".github/agents";
const COPILOT_HOOKS_PATH = ".github/hooks/stamity.json";
const COPILOT_PROMPTS_DIR = ".github/prompts";
const PROMPTS_DIR = COPILOT_PROMPTS_DIR;
const COPILOT_SETUP_STEPS_PATH = ".github/workflows/copilot-setup-steps.yml";
const SETUP_STEPS_JOB = "copilot-setup-steps";
const COPILOT_AGENT_PROMPT_CAP = 3e4;
const APPLY_TO_EVERY_FILE = "**";
const APPLY_TO_SEPARATOR = ",";
const MODEL_CLASS_FIELD = "model_class";
const NODE_LANGUAGES = /* @__PURE__ */ new Set(["javascript", "typescript"]);
const ACCESS_DATE = "2026-09-10";
const HOOK_GUARANTEE = CLIENT_HOOK_GUARANTEES.find((row) => row.tool === TOOL);
const COPILOT_DIALECT_FACTS = {
	tool: TOOL,
	ruleShape: "`.github/instructions/<id>.instructions.md` with `applyTo:` — ONE glob string, patterns comma-separated, never a YAML list",
	hooksConfigPath: COPILOT_HOOKS_PATH,
	readsAgentsSkillsDir: true,
	agentsFormat: "`.github/agents/<id>.agent.md` — frontmatter (`name`, `description`, `target: github-copilot`, `tools:` alias list, `model:` only under an operator pin) over a markdown prompt",
	mcpDialect: "vscode-json",
	entryFile: null,
	caps: [
		{
			name: "agent-prompt-chars",
			value: String(COPILOT_AGENT_PROMPT_CAP)
		},
		{
			name: "charter-budget",
			value: "~2 pages; AGENTS.md is native, so no mirror is emitted"
		},
		{
			name: "command-surface",
			value: `native — the nine touchpoints ship as prompt files in ${PROMPTS_DIR}/, invoked as /st-<id>; the format's \`agent\` and \`tools\` keys stay unemitted (per-prompt restrictions this engine cannot answer), \`model\` follows an operator pin`
		},
		{
			name: "effort-axis",
			value: "omitted — this surface publishes no effort key and no model-value parameter, the one documented omission of the reasoning-effort axis"
		},
		{
			name: "hook-enforcement",
			value: HOOK_GUARANTEE === void 0 ? "undeclared" : HOOK_GUARANTEE.notes
		},
		{
			name: "deny-gate",
			value: "Repository hooks target Copilot CLI/cloud. preToolUse denies via native JSON or nonzero exit; timeouts fail-open. The core role guard has no calling-agent identity and remains telemetry."
		},
		{
			name: "rule-activation",
			value: "glob only; no description-pull mode, so an agent-requested rule emits applyTo: \"**\""
		},
		{
			name: "rule-precedence",
			value: "not expressible — Copilot has no ordering primitive"
		},
		{
			name: "mcp-documents",
			value: "two — the editor `vscode-json` document plus the coding agent's `copilot-env` repo settings"
		},
		{
			name: "mcp-approval",
			value: "configuration-time — a coding-agent server is approved by a repository administrator when it is entered in the repository's Copilot settings, so a server's trust is decided when it is configured, not when the agent runs; the editor `vscode-json` document is the user's own and that approval does not cover it (coding-agent MCP configuration docs, re-read 2026-08-22 for this claim alone)"
		}
	],
	citations: [
		{
			url: "https://docs.github.com/en/copilot/reference/custom-agents-configuration",
			accessDate: ACCESS_DATE
		},
		{
			url: "https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/customize-the-agent-environment",
			accessDate: ACCESS_DATE
		},
		{
			url: "https://docs.github.com/en/copilot/how-tos/configure-custom-instructions-in-your-ide/add-repository-instructions-in-your-ide",
			accessDate: ACCESS_DATE
		},
		{
			url: "https://code.visualstudio.com/docs/copilot/customization/prompt-files",
			accessDate: ACCESS_DATE
		},
		{
			url: "https://docs.github.com/en/copilot/reference/hooks-reference",
			accessDate: "2026-09-17"
		}
	]
};
const HOOK_INFRA_ARTIFACT_IDS$1 = /* @__PURE__ */ new Set(["copilot-hooks", "copilot-portable-hook"]);
const copilotResiduePlanner = {
	tool: TOOL,
	facts: COPILOT_DIALECT_FACTS,
	async planResidue(core, ctx) {
		const [items, packageManager] = await Promise.all([selectedItems(ctx), detectPackageManager(ctx.rootDir)]);
		const render = bodyRenderer(ctx);
		const pins = ctx.manifest.models?.pins ?? {};
		const demoted = core.demotedRules[TOOL];
		const rows = items.flatMap((item) => {
			switch (item.type) {
				case "rule": return demoted.has(item.id) ? [] : [buildInstructionsFile(item, render)];
				case "agent": return [buildAgentFile(item, grantFor(item), render, pins)];
				default: return [buildPromptFile(item, render, pins)];
			}
		});
		rows.push({
			path: COPILOT_HOOKS_PATH,
			content: buildCopilotHooksJson(core.hooks.interchangeFor(TOOL)),
			owner: owner("copilot-hooks", "infra")
		});
		rows.push({
			path: `.stamity/generated/hooks/copilot/${PORTABLE_RUNNER_FILE}`,
			content: buildPortableHookRunner("copilot"),
			owner: owner("copilot-portable-hook", "infra")
		});
		rows.push({
			path: COPILOT_SETUP_STEPS_PATH,
			content: buildSetupSteps(packageManager, ctx.manifest.detected?.languages ?? []),
			owner: owner(SETUP_STEPS_JOB, "infra")
		});
		for (const emission of core.mcpFor(TOOL)) rows.push(mcpRow(emission));
		return {
			outputs: withoutPluginOwnedRows(ctx.manifest, TOOL, rows, HOOK_INFRA_ARTIFACT_IDS$1),
			warnings: ["hook fallback [copilot]: sessionStart output is injected as additionalContext (docs.github.com hooks reference, 2026-09-17), so the learning/handoff index reaches the session. Hook timeouts remain fail-open; use native permission controls for mandatory enforcement."]
		};
	}
};
async function selectedItems(ctx) {
	const index = await buildContentIndex(ctx.contentRoot);
	const allowlist = buildSelectionAllowlist(ctx.manifest.selection);
	return index.items.filter((item) => item.type !== "skill" && index.byKey.get(typeIdKey(item.type, item.id)) === item && classifySelection(item, allowlist) !== "drop" && (item.tools === void 0 || item.tools.includes(TOOL)));
}
function grantFor(item) {
	const pack = item.provenance;
	return resolveAgentGrant({
		runtimeId: emittedId(item),
		frontmatter: item.frontmatter,
		...pack === void 0 ? {} : { declaredTools: grantableFootprint(pack.declaredTools) }
	});
}
function buildInstructionsFile(item, render) {
	const globs = declaredGlobs(item);
	const applyTo = globs.length === 0 ? APPLY_TO_EVERY_FILE : globs.join(APPLY_TO_SEPARATOR);
	return {
		path: `${INSTRUCTIONS_DIR}/${emittedId(item)}.instructions.md`,
		content: frontmatterDocument([`applyTo: ${yamlScalar(applyTo)}`, `description: ${yamlScalar(render(item.description))}`], bodyOf(render(item.body))),
		owner: owner(item.id, item.type)
	};
}
function buildAgentFile(item, grant, render, pins = {}) {
	const id = emittedId(item);
	const prompt = bodyOf(render(item.body));
	if (prompt.length > 3e4) throw new EngineError(`Copilot agent "${id}" would emit a ${prompt.length}-character prompt, over the ${COPILOT_AGENT_PROMPT_CAP}-character limit GitHub enforces on ${AGENTS_DIR}/${id}.agent.md — the platform truncates or rejects it with no signal. Shorten the agent's canonical body, or move detail into a skill it can load on demand.`, { code: "VALIDATION_ERROR" });
	return {
		path: `${AGENTS_DIR}/${id}.agent.md`,
		content: frontmatterDocument([
			`name: ${id}`,
			`description: ${yamlScalar(render(item.description))}`,
			"target: github-copilot",
			`tools: ${toCopilotToolsFrontmatter(grant.allow)}`,
			...modelLine(item, pins)
		], prompt),
		owner: owner(item.id, item.type)
	};
}
function buildPromptFile(item, render, pins = {}) {
	return {
		path: `${PROMPTS_DIR}/${emittedId(item)}.prompt.md`,
		content: frontmatterDocument([`description: ${yamlScalar(render(item.description))}`, ...modelLine(item, pins)], bodyOf(render(item.body))),
		owner: owner(item.id, item.type)
	};
}
function modelLine(item, pins) {
	const declared = item.frontmatter[MODEL_CLASS_FIELD];
	if (typeof declared !== "string") return [];
	const model = resolveModelValue(declared, TOOL, pins);
	return model === void 0 ? [] : [`model: ${yamlScalar(model)}`];
}
function buildSetupSteps(packageManager, languages) {
	const named = [...languages].map((value) => value.trim()).filter((value) => value !== "");
	const steps = packageManager.lockfile !== null || packageManager.fromPackageJsonField || named.some((language) => NODE_LANGUAGES.has(language.toLowerCase())) ? nodeSteps(packageManager) : [`      # No Node toolchain was detected for this repository (detected: ${named.length === 0 ? "nothing" : named.join(", ")}).`, "      # Add the runtime setup and dependency-install steps the agent needs here."];
	return [
		"name: Copilot Setup Steps",
		"",
		"# Prepares the environment the GitHub Copilot coding agent works in. The agent runs",
		`# the job named \`${SETUP_STEPS_JOB}\` below and nothing else in this file.`,
		"# Generated — edits are overwritten on the next sync.",
		"",
		"on:",
		"  workflow_dispatch:",
		"  push:",
		"    paths:",
		`      - ${COPILOT_SETUP_STEPS_PATH}`,
		"  pull_request:",
		"    paths:",
		`      - ${COPILOT_SETUP_STEPS_PATH}`,
		"",
		"jobs:",
		`  ${SETUP_STEPS_JOB}:`,
		"    runs-on: ubuntu-latest",
		"    permissions:",
		"      contents: read",
		"    steps:",
		"      # Pin these to a full-length commit SHA for a stricter supply-chain posture.",
		"      - uses: actions/checkout@v5",
		...steps,
		""
	].join("\n");
}
function nodeSteps(packageManager) {
	const lines = [
		"      - uses: actions/setup-node@v5",
		"        with:",
		"          # Replace with this project's pin (.nvmrc, engines.node) when it declares one.",
		"          node-version: \"lts/*\""
	];
	if (packageManager.name === "pnpm" || packageManager.name === "yarn") lines.push("      - run: corepack enable");
	if (packageManager.name === "bun") lines.push("      # bun is not preinstalled on GitHub-hosted runners — add its setup step here.");
	lines.push(`      - run: ${installCommand(packageManager)}`);
	return lines;
}
function installCommand(packageManager) {
	const frozen = packageManager.lockfile !== null;
	switch (packageManager.name) {
		case "npm": return frozen ? "npm ci" : "npm install";
		case "pnpm": return frozen ? "pnpm install --frozen-lockfile" : "pnpm install";
		case "bun": return frozen ? "bun install --frozen-lockfile" : "bun install";
		case "yarn": return "yarn install";
	}
}
function mcpRow(emission) {
	return {
		path: emission.path,
		content: emission.content,
		owner: owner(`mcp-${emission.dialect}`, "infra")
	};
}
function bodyRenderer(ctx) {
	const detection = detectionContextFromManifest(ctx.manifest);
	const gates = verificationGatesFromManifest(ctx.manifest);
	return (raw) => substituteCanonicalPlatformMarker(substituteVerificationGateTokens(substituteRepoTokens(raw, detection), gates), TOOL);
}
function declaredGlobs(item) {
	return [...new Set(declaredRuleGlobs(item))];
}
function emittedId(item) {
	return emittedIdFor(item);
}
function owner(artifactId, artifactType) {
	return {
		adapter: TOOL,
		artifactId,
		artifactType
	};
}
function frontmatterDocument(lines, body) {
	return `---\n${lines.join("\n")}\n---\n\n${body}\n`;
}
function bodyOf(rendered) {
	return rendered.replace(/^(?:[ \t]*\r?\n)+/, "").replace(/(?:\r?\n[ \t]*)+$/, "");
}
function yamlScalar(value) {
	return JSON.stringify(value.replace(/\s*[\r\n]+\s*/g, " ").trim());
}
function buildCopilotHooksJson(rows) {
	const hooks = {};
	for (const row of rows) (hooks[CLAUDE_EVENT_NAMES[row.event]] ??= []).push({
		type: "command",
		command: portableHookCommand("copilot", row),
		cwd: ".",
		...row.matcher === void 0 ? {} : { matcher: row.matcher },
		...row.timeoutMs === void 0 ? {} : { timeoutSec: Math.ceil(row.timeoutMs / 1e3) }
	});
	return `${JSON.stringify({
		version: 1,
		hooks
	}, null, 2)}\n`;
}
//#endregion
//#region src/adapters/cursor.ts
var cursor_exports = /* @__PURE__ */ __exportAll({
	CURSOR_AGENTS_DIR: () => CURSOR_AGENTS_DIR,
	CURSOR_COMMANDS_DIR: () => CURSOR_COMMANDS_DIR,
	CURSOR_GUARD_DIR: () => CURSOR_GUARD_DIR,
	CURSOR_GUARD_EVENTS: () => CURSOR_GUARD_EVENTS,
	CURSOR_HOOKS_CONFIG_PATH: () => CURSOR_HOOKS_CONFIG_PATH,
	CURSOR_RULES_DIR: () => CURSOR_RULES_DIR,
	CURSOR_RULE_LINE_CAP: () => 500,
	EVENT_RENAME: () => EVENT_RENAME,
	MCP_GUARD_PATH: () => MCP_GUARD_PATH,
	SUBAGENT_GUARD_PATH: () => SUBAGENT_GUARD_PATH,
	buildCursorAgent: () => buildCursorAgent,
	buildCursorCommand: () => buildCursorCommand,
	buildHooksJson: () => buildHooksJson,
	buildMcpGuardScript: () => buildMcpGuardScript,
	buildMdcRule: () => buildMdcRule,
	buildSubagentGuardScript: () => buildSubagentGuardScript,
	cursorDialectFacts: () => cursorDialectFacts,
	cursorResiduePlanner: () => cursorResiduePlanner
});
const CURSOR_RULES_DIR = ".cursor/rules";
const CURSOR_AGENTS_DIR = ".cursor/agents";
const CURSOR_COMMANDS_DIR = ".cursor/skills";
const CURSOR_HOOKS_CONFIG_PATH = ".cursor/hooks.json";
const CURSOR_GUARD_DIR = ".cursor/hooks";
const SUBAGENT_GUARD_PATH = `${CURSOR_GUARD_DIR}/subagent-guard.mjs`;
const MCP_GUARD_PATH = `${CURSOR_GUARD_DIR}/mcp-guard.mjs`;
const MCP_TOOL_PREFIX = "mcp__";
const EVENT_RENAME = {
	session_start: "sessionStart",
	pre_tool_use: "preToolUse",
	post_tool_use: "postToolUse",
	user_prompt_submit: "beforeSubmitPrompt",
	stop: "stop",
	session_end: "sessionEnd"
};
const CURSOR_GUARD_EVENTS = {
	subagentSpawn: "subagentStart",
	mcpExecution: "beforeMCPExecution"
};
const BLOCKING_EVENTS = /* @__PURE__ */ new Set(["pre_tool_use"]);
const CORE_SCRIPT_PREFIX = `${HOOKS_GENERATED_DIR}/cursor/`;
const CORE_GUARD_REACHES_VERDICT = !IDENTITY_FREE_PRE_TOOL_USE_PAYLOADS.has("cursor");
function isCoreScriptRow(row, hookScriptsRoot) {
	const prefixes = hookScriptsRoot === void 0 ? [CORE_SCRIPT_PREFIX] : [CORE_SCRIPT_PREFIX, `${hookScriptsRoot}/`];
	return row.command.some((token) => prefixes.some((prefix) => token.startsWith(prefix)));
}
function rowOptsIntoBlocking(event, row, hookScriptsRoot) {
	if (!BLOCKING_EVENTS.has(event)) return false;
	return CORE_GUARD_REACHES_VERDICT || !isCoreScriptRow(row, hookScriptsRoot);
}
const ARTIFACT_IDS = {
	hooksConfig: "cursor-hooks-config",
	subagentGuard: "cursor-subagent-guard",
	mcpGuard: "cursor-mcp-guard",
	mcp: "mcp-config"
};
const HOOK_INFRA_ARTIFACT_IDS = /* @__PURE__ */ new Set([
	ARTIFACT_IDS.hooksConfig,
	ARTIFACT_IDS.subagentGuard,
	ARTIFACT_IDS.mcpGuard,
	"cursor-portable-hook"
]);
const EFFORT_SCALE_CAP = `${CLIENT_MODEL_PROJECTION.cursor.effortScale.join(", ")}: ${CLIENT_MODEL_PROJECTION.cursor.effortScaleNote ?? ""} (cursor.com/docs/sdk/typescript, accessed 2026-09-17). The level rides inside the model value as \`[effort=<level>]\` and this client parses the group rather than ruling on the value, so nothing is narrowed here: a level the chosen model does not offer is the model's to reject, and no key is emitted at all until a model id is pinned`;
const cursorDialectFacts = {
	tool: "cursor",
	ruleShape: "`.cursor/rules/<id>.mdc` — `description` plus `globs` as an unquoted comma-separated list with no spaces; `alwaysApply: false` on every emitted rule",
	hooksConfigPath: CURSOR_HOOKS_CONFIG_PATH,
	readsAgentsSkillsDir: true,
	agentsFormat: "`.cursor/agents/<id>.md` — `description`, `model` (the operator's pinned id for the role's class, carrying this client's `[effort=…]` parameter; the key is omitted entirely when no pin names one, so the client applies its own default rather than the engine restating it), `readonly`",
	mcpDialect: "cursor-json",
	entryFile: null,
	caps: [
		{
			name: "rule body",
			value: `500 lines per rule, refused above`
		},
		{
			name: "hook enforcement",
			value: "Exit 2 denies; failClosed: true also denies hook errors and timeouts, and this client counts no output as such a failure (cursor.com/docs/hooks, accessed 2026-09-17), so every allow is written explicitly. Emitted on " + (CORE_GUARD_REACHES_VERDICT ? "the pre-tool-use gate and both guards" : "both guards and on any authored pre-tool-use row, but NOT on the core pre-tool-use guard: this client's tool-call payload names no calling agent, so that guard is emitted as telemetry and has no verdict to block on")
		},
		{
			name: "hook timeout",
			value: "timeoutMs converts to native timeout seconds, rounded up; the portable runner also bounds the child to the requested milliseconds"
		},
		{
			name: "command surface",
			value: `\`${CURSOR_COMMANDS_DIR}/<id>/SKILL.md\` with \`disable-model-invocation: true\` — this client folded slash commands into skills, so no \`.cursor/commands/\` directory appears in current docs and the touchpoint bodies ship as explicitly invoked skills`
		},
		{
			name: "user hook enforcement",
			value: "explicit exit-2 denial applies on supported events; authored pre-tool-use rows also opt into failClosed for hook errors and timeouts, and no output counts as one of those failures (cursor.com/docs/hooks, accessed 2026-09-17), so a row that decides nothing is emitted as an explicit allow. Session-start and session-end responses cannot block"
		},
		{
			name: "MCP tool surface",
			value: "servers expose tools through mcp.json; the current contract documents no fixed per-session tool-count cap"
		},
		{
			name: "workdir guard",
			value: "not emitted — mitigated a pre-3.0 path-escape class; revisit if that class recurs on a supported release"
		},
		{
			name: "effort-scale",
			value: EFFORT_SCALE_CAP
		}
	],
	citations: [
		{
			url: "https://cursor.com/docs/context/rules",
			accessDate: "2026-09-10"
		},
		{
			url: "https://cursor.com/docs/agent/subagents",
			accessDate: "2026-09-10"
		},
		{
			url: "https://cursor.com/docs/hooks",
			accessDate: "2026-09-17"
		},
		{
			url: "https://cursor.com/docs/skills",
			accessDate: "2026-09-10"
		},
		{
			url: "https://cursor.com/docs/mcp",
			accessDate: "2026-09-10"
		}
	]
};
const cursorResiduePlanner = {
	tool: "cursor",
	facts: cursorDialectFacts,
	async planResidue(core, ctx) {
		const index = await buildContentIndex(ctx.contentRoot);
		const allowlist = buildSelectionAllowlist(ctx.manifest.selection);
		const detection = detectionContextFromManifest(ctx.manifest);
		const gates = verificationGatesFromManifest(ctx.manifest);
		const render = (raw) => substituteCanonicalPlatformMarker(substituteVerificationGateTokens(substituteRepoTokens(raw, detection), gates), "cursor");
		const admitted = (type) => index.items.filter((item) => item.type === type && index.byKey.get(typeIdKey(item.type, item.id)) === item && (item.tools === void 0 || item.tools.includes("cursor")) && classifySelection(item, allowlist) !== "drop");
		const rows = [{
			path: `.stamity/generated/hooks/cursor/${PORTABLE_RUNNER_FILE}`,
			content: buildPortableHookRunner("cursor"),
			owner: {
				adapter: "cursor",
				artifactId: "cursor-portable-hook",
				artifactType: "infra"
			}
		}];
		for (const rule of admitted("rule")) rows.push({
			path: `${CURSOR_RULES_DIR}/${prefixedId(rule.id)}.mdc`,
			content: buildMdcRule(rule, render(rule.body)),
			owner: {
				adapter: "cursor",
				artifactId: rule.id,
				artifactType: "rule"
			}
		});
		const pins = ctx.manifest.models?.pins ?? {};
		const efforts = ctx.manifest.models?.effort ?? {};
		const spawnable = [...RUNTIME_AGENT_IDS];
		for (const agent of admitted("agent")) {
			const runtimeId = prefixedId(agent.id);
			const pack = agent.provenance;
			spawnable.push(runtimeId);
			rows.push({
				path: `${CURSOR_AGENTS_DIR}/${runtimeId}.md`,
				content: buildCursorAgent(agent, resolveAgentGrant({
					runtimeId,
					frontmatter: agent.frontmatter,
					...pack === void 0 ? {} : { declaredTools: grantableFootprint(pack.declaredTools) }
				}), render(agent.body), pins, efforts),
				owner: {
					adapter: "cursor",
					artifactId: agent.id,
					artifactType: "agent"
				}
			});
		}
		for (const command of admitted("command")) {
			const name = commandName(command);
			rows.push({
				path: `${CURSOR_COMMANDS_DIR}/${name}/SKILL.md`,
				content: buildCursorCommand(command, name, render(command.body)),
				owner: {
					adapter: "cursor",
					artifactId: command.id,
					artifactType: "command"
				}
			});
		}
		rows.push({
			path: SUBAGENT_GUARD_PATH,
			content: buildSubagentGuardScript(spawnable),
			owner: {
				adapter: "cursor",
				artifactId: ARTIFACT_IDS.subagentGuard,
				artifactType: "infra"
			}
		}, {
			path: MCP_GUARD_PATH,
			content: buildMcpGuardScript(),
			owner: {
				adapter: "cursor",
				artifactId: ARTIFACT_IDS.mcpGuard,
				artifactType: "infra"
			}
		}, {
			path: CURSOR_HOOKS_CONFIG_PATH,
			content: buildHooksJson(core.hooks.interchangeFor("cursor"), ctx.facts.hookScriptsRoot),
			owner: {
				adapter: "cursor",
				artifactId: ARTIFACT_IDS.hooksConfig,
				artifactType: "infra"
			}
		});
		for (const emission of core.mcpFor("cursor")) rows.push({
			path: emission.path,
			content: emission.content,
			owner: {
				adapter: "cursor",
				artifactId: ARTIFACT_IDS.mcp,
				artifactType: "infra"
			}
		});
		return { outputs: withoutPluginOwnedRows(ctx.manifest, "cursor", rows, HOOK_INFRA_ARTIFACT_IDS).toSorted((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0) };
	}
};
function prefixedId(id) {
	return `${CONTENT_PREFIX}${id}`;
}
function commandName(item) {
	return emittedIdFor(item);
}
const RULE_SCOPES$2 = /* @__PURE__ */ new Set([
	"always",
	"agent-requested",
	"conditional"
]);
function buildMdcRule(item, body) {
	const source = `rule "${item.id}"`;
	const scope = readScope(item, source);
	if (scope === "always") throw new EngineError(`${source} declares \`scope: always\`, which this client would emit as an always-applied rule. Rules attach on globs; content that must bind every session belongs in the AGENTS.md charter. Give the rule \`scope: conditional\` with \`globs\`, or \`scope: agent-requested\`, or move it into the charter.`, { code: "VALIDATION_ERROR" });
	const globs = readGlobs$1(item, source);
	if (scope === "agent-requested" && globs.length > 0) throw new EngineError(`${source} declares \`scope: agent-requested\` and \`globs\`, which name two different activation modes: description-driven, and auto-attach on those paths. Declare \`scope: conditional\` to attach on the globs, or drop the \`globs\` line to keep the rule description-driven.`, { code: "VALIDATION_ERROR" });
	const rendered = body.endsWith("\n") ? body : `${body}\n`;
	const lines = countLines$1(rendered);
	if (lines > 500) throw new EngineError(`${source} renders to ${lines} lines, over this client's 500-line per-rule budget. Split the rule, or move the detail into a skill the rule points at.`, { code: "VALIDATION_ERROR" });
	const activation = globs.length === 0 ? ["alwaysApply: false"] : [`globs: ${globs.join(",")}`, "alwaysApply: false"];
	return `---\ndescription: ${frontmatterScalar(item.description)}\n${activation.join("\n")}\n---\n${rendered}`;
}
function readScope(item, source) {
	const value = item.frontmatter["scope"];
	if (value === void 0 || value === null || value === "") return void 0;
	if (typeof value !== "string" || !RULE_SCOPES$2.has(value)) throw new EngineError(`${source}: unknown \`scope\` value ${JSON.stringify(value)}. Declare one of ${[...RULE_SCOPES$2].join(", ")}.`, { code: "VALIDATION_ERROR" });
	return value;
}
function readGlobs$1(item, source) {
	const value = item.frontmatter["globs"];
	if (value === void 0 || value === null) return [];
	const declared = typeof value === "string" ? value.split(",") : Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : null;
	if (declared === null) throw new EngineError(`${source}: \`globs\` must be a list of glob strings or one comma-separated string.`, { code: "VALIDATION_ERROR" });
	const globs = [];
	for (const entry of declared) {
		const glob = entry.trim();
		if (glob === "") continue;
		if (glob.includes(",")) throw new EngineError(`${source}: glob ${JSON.stringify(glob)} contains a comma, which is this client's glob separator — the value cannot be written without splitting it into two patterns. Rewrite the glob without a comma.`, { code: "VALIDATION_ERROR" });
		if (!globs.includes(glob)) globs.push(glob);
	}
	return globs;
}
function buildCursorAgent(item, grant, body, pins = {}, efforts = {}) {
	const lines = [`description: ${frontmatterScalar(item.description)}`];
	const declaredClass = item.frontmatter["model_class"];
	const model = typeof declaredClass === "string" ? resolveModelValue(declaredClass, "cursor", pins, efforts) : void 0;
	if (model !== void 0) lines.push(`model: ${frontmatterScalar(model)}`);
	if (toCursorReadonlyFrontmatter(grant.allow) ?? true) lines.push("readonly: true");
	const rendered = body.endsWith("\n") ? body : `${body}\n`;
	return `---\n${lines.join("\n")}\n---\n${rendered}`;
}
function buildCursorCommand(item, name, body) {
	const front = [
		`name: ${name}`,
		`description: ${frontmatterScalar(item.description)}`,
		"disable-model-invocation: true"
	];
	const rendered = body.endsWith("\n") ? body : `${body}\n`;
	return `---\n${front.join("\n")}\n---\n${rendered}`;
}
function buildHooksJson(rows, hookScriptsRoot) {
	const events = {};
	const guard = (file) => hookScriptsRoot === void 0 ? file : `${hookScriptsRoot}/${file.slice(file.lastIndexOf("/") + 1)}`;
	for (const event of CANONICAL_HOOK_EVENTS) {
		const matching = rows.filter((row) => row.event === event);
		if (matching.length === 0) continue;
		events[EVENT_RENAME[event]] = matching.map((row) => {
			const entry = { command: portableHookCommand("cursor", row) };
			if (row.timeoutMs !== void 0) entry.timeout = Math.ceil(row.timeoutMs / 1e3);
			if (row.matcher !== void 0) entry.matcher = row.matcher;
			if (rowOptsIntoBlocking(event, row, hookScriptsRoot)) entry.failClosed = true;
			return entry;
		});
	}
	events[CURSOR_GUARD_EVENTS.subagentSpawn] = [{
		command: shellCommand(["node", guard(SUBAGENT_GUARD_PATH)]),
		failClosed: true
	}];
	events[CURSOR_GUARD_EVENTS.mcpExecution] = [{
		command: shellCommand(["node", guard(MCP_GUARD_PATH)]),
		failClosed: true
	}];
	return `${JSON.stringify({
		version: 1,
		hooks: events
	}, null, 2)}\n`;
}
const SHELL_SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/;
function shellCommand(argv) {
	return argv.map((token) => {
		if (SHELL_SAFE.test(token)) return token;
		if (ROOT_VARIABLE_PATH.test(token)) return `"${token}"`;
		return `'${token.replaceAll("'", `'\\''`)}'`;
	}).join(" ");
}
function guardHeader(summary) {
	return [
		"#!/usr/bin/env node",
		...summary.map((line) => line === "" ? "//" : `// ${line}`),
		"//",
		"// Generated file — regenerate it rather than editing; local edits are overwritten.",
		"// Trust posture: exec form, repo-committed, no dynamic evaluation, no network",
		"// reach, and output determined by repo state alone."
	].join("\n");
}
const REASON_HELPER = `function reasonOf(err) {
  if (err === null || err === undefined) return "unknown error";
  const message = typeof err === "object" && typeof err.message === "string" ? err.message : String(err);
  const code = typeof err === "object" && typeof err.code === "string" ? err.code + ": " : "";
  return code + message;
}`;
const READ_PAYLOAD = `function readPayload() {
  let raw = "";
  try {
    raw = readFileSync(0, "utf8");
  } catch (err) {
    return { payload: {}, problem: "stdin was unreadable (" + reasonOf(err) + ")" };
  }
  if (raw.trim() === "") return { payload: {}, problem: "stdin carried no payload" };
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { payload: {}, problem: "payload was not a JSON object" };
    }
    return { payload: parsed, problem: null };
  } catch (err) {
    return { payload: {}, problem: "payload was not valid JSON (" + reasonOf(err) + ")" };
  }
}`;
const NOTICE_HELPER = `function notice(hook, event) {
  process.stderr.write(JSON.stringify({ hook, ...event }) + "\\n");
}`;
const DENY_HELPER = `function deny(hook, event, userMessage) {
  notice(hook, event);
  process.stdout.write(JSON.stringify({ permission: "deny", user_message: userMessage }));
}`;
const ALLOW_HELPER = `function allow() {
  process.stdout.write(JSON.stringify({ permission: "allow" }));
}`;
function buildSubagentGuardScript(roster) {
	const ids = [...new Set(roster)].toSorted();
	return `${guardHeader([
		"stamity — sub-agent spawn guard.",
		"",
		"Denies a spawn whose agent id carries the generated-content prefix but is",
		"not on the shipped roster. Ids outside that prefix are not this setup's to",
		"police and pass through. Wired to the spawn event with failClosed: true, so",
		"a crash or a timeout denies rather than waving the spawn through.",
		"",
		"A payload that cannot be read names no agent, so it is not a crash and not",
		"a refusal: the spawn proceeds and the reason is written to stderr, because",
		"an allowlist that quietly stops matching is worse than one that says so."
	])}

import { readFileSync } from "node:fs";

const NAMESPACE = ${JSON.stringify(CONTENT_PREFIX)};
const ROSTER = new Set(${JSON.stringify(ids, null, 2)});

${REASON_HELPER}

${READ_PAYLOAD}

${NOTICE_HELPER}

${DENY_HELPER}

${ALLOW_HELPER}

const { payload, problem } = readPayload();
const agentId = typeof payload.subagent_type === "string" ? payload.subagent_type : "";

// Nothing to judge: say so on stderr rather than passing the spawn through in
// silence. The spawn still proceeds, and it takes an explicit allow to say so —
// no output is a failClosed failure on this client.
if (agentId === "") {
  notice("stamity-cursor-subagent-guard", {
    reasonCode: "SPAWN_PAYLOAD_UNUSABLE",
    detail: problem === null ? "payload carried no subagent_type" : problem,
    at: new Date().toISOString(),
  });
  allow();
} else if (agentId.startsWith(NAMESPACE) && !ROSTER.has(agentId)) {
  deny(
    "stamity-cursor-subagent-guard",
    { reasonCode: "AGENT_NOT_ON_ROSTER", agentId, at: new Date().toISOString() },
    'Blocked the spawn of "' +
      agentId +
      '": no agent with that id ships in this setup, so it holds no tool policy. ' +
      "Re-run \`stamity sync\` if the roster changed, or spawn one of: " +
      [...ROSTER].join(", ") +
      ".",
  );
} else {
  // Out of scope, or rostered. The spawn proceeds and the verdict says so.
  allow();
}
`;
}
function buildMcpGuardScript() {
	return `${guardHeader([
		"stamity — MCP server allowlist guard.",
		"",
		"Denies a pending MCP call whose server is absent from the resolved",
		".cursor/mcp.json set (this project's file plus the operator's user-level",
		"one). Deny-by-default: no configured server means nothing to match, so",
		"every mcp__ call is refused and the message says why.",
		"",
		"A manifest that exists but does not parse is reported as its own refusal,",
		"naming the path and the parser message — not folded into the absent case.",
		"To stop the guard, change the selection (stamity config mcp add <id>, then",
		"stamity sync) or deselect this client; editing .cursor/hooks.json does not",
		"stick."
	])}

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// This script sits at ${MCP_GUARD_PATH}; the project manifest is its sibling
// one level up, and the operator's own file lives under the home directory.
const MANIFESTS = [join(HERE, "..", "mcp.json"), join(homedir(), ".cursor", "mcp.json")];
const TOOL_PREFIX = ${JSON.stringify(MCP_TOOL_PREFIX)};

${REASON_HELPER}

${READ_PAYLOAD}

${NOTICE_HELPER}

${DENY_HELPER}

${ALLOW_HELPER}

function normalize(value) {
  return String(value).replace(/\\s+/g, " ").trim();
}

// Every spelling of a configured server: its name, a remote URL, and the full
// stdio command line — the payload supplies whichever the call was made with.
// \`faults\` collects manifests that exist and could not be used; a manifest that
// is simply absent is not a fault, it is a repo that selected no servers.
function allowedIdentities() {
  const allowed = new Set();
  const faults = [];
  for (const file of MANIFESTS) {
    let raw;
    try {
      raw = readFileSync(file, "utf8");
    } catch (err) {
      if (err === null || typeof err !== "object" || err.code !== "ENOENT") {
        faults.push({ path: file, detail: reasonOf(err) });
      }
      continue;
    }
    let doc;
    try {
      doc = JSON.parse(raw);
    } catch (err) {
      faults.push({ path: file, detail: reasonOf(err) });
      continue;
    }
    const servers = doc !== null && typeof doc === "object" ? doc.mcpServers : null;
    if (servers === null || typeof servers !== "object") {
      faults.push({ path: file, detail: "no mcpServers object" });
      continue;
    }
    for (const [name, server] of Object.entries(servers)) {
      allowed.add(name);
      if (server === null || typeof server !== "object") continue;
      if (typeof server.url === "string" && server.url !== "") {
        allowed.add(normalize(server.url));
      }
      if (typeof server.command === "string" && server.command !== "") {
        const args = Array.isArray(server.args) ? server.args : [];
        allowed.add(normalize([server.command, ...args].join(" ")));
      }
    }
  }
  return { allowed, faults };
}

function faultLine(faults) {
  return faults.map((fault) => fault.path + " (" + fault.detail + ")").join("; ");
}

function identityOf(payload) {
  const toolName = typeof payload.tool_name === "string" ? payload.tool_name : "";
  if (toolName.startsWith(TOOL_PREFIX)) {
    const server = toolName.slice(TOOL_PREFIX.length).split("__")[0];
    if (server) return server;
  }
  if (typeof payload.url === "string" && payload.url !== "") return normalize(payload.url);
  if (typeof payload.command === "string" && payload.command !== "") {
    return normalize(payload.command);
  }
  return "";
}

const HOOK = "stamity-cursor-mcp-guard";
const { payload, problem } = readPayload();
const { allowed, faults } = allowedIdentities();
const identity = identityOf(payload);
const event = { server: identity, at: new Date().toISOString() };

if (allowed.size === 0 && faults.length > 0) {
  // The manifests exist and could not be used. Refusing is still right — an
  // unreadable allowlist allows nothing — but the cause and the fix are the
  // file, not the selection, so they are named instead of the absent-case text.
  deny(
    HOOK,
    { reasonCode: "MCP_MANIFEST_UNREADABLE", faults, ...event },
    "Blocked every MCP call: no MCP manifest could be read, so there is no " +
      "allowlist to match against. Fix " +
      faultLine(faults) +
      ", then re-run \`stamity sync\`.",
  );
} else if (allowed.size === 0) {
  deny(
    HOOK,
    { reasonCode: "NO_MCP_SERVERS_CONFIGURED", ...event },
    "Blocked every MCP call: this setup configured no MCP servers, so there is " +
      "no allowlist to match against. Add one with \`stamity config mcp add <id>\` " +
      "and re-run \`stamity sync\`.",
  );
} else if (identity === "") {
  deny(
    HOOK,
    {
      reasonCode: "MCP_SERVER_UNIDENTIFIED",
      detail: problem === null ? "payload named no server" : problem,
      ...event,
    },
    "Blocked an MCP call that names no server this guard can recognise, so it " +
      "cannot be matched against .cursor/mcp.json. Report the client payload shape.",
  );
} else if (!allowed.has(identity)) {
  deny(
    HOOK,
    { reasonCode: "MCP_SERVER_NOT_CONFIGURED", ...event },
    'Blocked an MCP call to "' +
      identity +
      '": it is absent from the resolved .cursor/mcp.json set. Add it with ' +
      "\`stamity config mcp add <id>\` and re-run \`stamity sync\`.",
  );
} else if (faults.length > 0) {
  // Allowed on the manifests that DID load. The broken one still cost the
  // operator whatever it configured, so it is announced rather than left to be
  // discovered as a server that silently stopped being reachable.
  notice(HOOK, { reasonCode: "MCP_MANIFEST_UNREADABLE", faults, ...event });
  allow();
} else {
  // On the allowlist. The verdict is written rather than implied: no output is
  // a failClosed failure here, and this guard is wired failClosed: true.
  allow();
}
`;
}
function frontmatterScalar(value) {
	const singleLine = value.replace(/\s*[\r\n]+\s*/g, " ").trim();
	if (singleLine === "") return singleLine;
	return /["\\]/.test(singleLine) || /:(\s|$)/.test(singleLine) || /\s#/.test(singleLine) || /^(?:[,[\]{}#&*!|>'%@`]|[-?:](?:\s|$))/.test(singleLine) ? JSON.stringify(singleLine) : singleLine;
}
function countLines$1(raw) {
	if (raw === "") return 0;
	const lines = raw.split(/\r?\n/);
	return lines.at(-1) === "" ? lines.length - 1 : lines.length;
}
//#endregion
//#region src/adapters/registry.ts
var registry_exports = /* @__PURE__ */ __exportAll({ ADAPTER_REGISTRY: () => ADAPTER_REGISTRY });
const ADAPTER_REGISTRY = Object.freeze({
	claude: claudeResiduePlanner,
	cursor: cursorResiduePlanner,
	copilot: copilotResiduePlanner,
	codex: codexResiduePlanner
});
//#endregion
//#region src/content/userContent.ts
var userContent_exports = /* @__PURE__ */ __exportAll({
	CLASS_LAYOUT: () => CLASS_LAYOUT,
	LEAN_LINE_THRESHOLDS: () => LEAN_LINE_THRESHOLDS,
	SKILL_FILE: () => SKILL_FILE$1,
	checkUserArtifact: () => checkUserArtifact,
	discoverOverlaysUnder: () => discoverOverlaysUnder,
	discoverSkillOverlayCarrierExtras: () => discoverSkillOverlayCarrierExtras,
	discoverSkippedUserEntries: () => discoverSkippedUserEntries,
	discoverUserContent: () => discoverUserContent,
	discoverUserOverlays: () => discoverUserOverlays,
	saveUserContent: () => saveUserContent,
	scanUserSkillSupportFiles: () => scanUserSkillSupportFiles,
	userContentRoot: () => userContentRoot,
	validateContentBody: () => validateContentBody,
	validateUserArtifact: () => validateUserArtifact
});
const LEAN_LINE_THRESHOLDS = {
	agent: 350,
	skill: 200,
	rule: 100,
	command: 200
};
const USER_CONTENT_DIR = "overrides";
function userContentRoot(rootDir) {
	return join(rootDir, STATE_DIR, USER_CONTENT_DIR);
}
const CLASS_LAYOUT = {
	agent: {
		dir: "agents",
		layout: "file"
	},
	skill: {
		dir: "skills",
		layout: "directory"
	},
	rule: {
		dir: "rules",
		layout: "file"
	},
	command: {
		dir: "commands",
		layout: "file"
	}
};
const SKILL_FILE$1 = "SKILL.md";
const ARTIFACT_EXTENSION$1 = ".md";
const SKILL_BASE = SKILL_FILE$1.slice(0, -3);
const OVERLAY_FRONTMATTER_SUFFIX = ".customize.yaml";
const OVERLAY_BODY_SUFFIX = ".customize.md";
function isOverlayFileName(name) {
	return name.endsWith(OVERLAY_FRONTMATTER_SUFFIX) || name.endsWith(OVERLAY_BODY_SUFFIX);
}
const READ_CONCURRENCY$3 = 8;
const SLUG_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const REQUIRED_FIELDS = [
	"id",
	"type",
	"description",
	"tags"
];
const LOAD_CLASSES = [
	"always",
	"on-demand",
	"reference"
];
async function saveUserContent(rootDir, type, id, content) {
	const idDefect = saveIdDefect(id);
	if (idDefect !== void 0) return {
		saved: false,
		errors: [idDefect],
		warnings: []
	};
	const filePath = artifactPath(rootDir, type, id);
	const document = readDocument(content, filePath);
	const patched = await overlayHalvesAt(rootDir, type, id);
	if (patched.length > 0) return {
		saved: false,
		errors: [overlayExclusivityDefect(filePath, patched)],
		warnings: []
	};
	const check = await checkUserArtifact({
		type,
		id,
		filePath,
		...document
	});
	const errors = check.errors.map(describeViolation);
	const warnings = check.warnings.map(describeViolation);
	if (errors.length > 0) return {
		saved: false,
		errors,
		warnings
	};
	const result = await safeWriteFile(filePath, content, {
		force: true,
		boundaryDir: rootDir
	});
	if (result.warning !== void 0) warnings.push(result.warning);
	return {
		saved: true,
		path: filePath,
		errors: [],
		warnings
	};
}
async function discoverUserContent(rootDir) {
	const root = userContentRoot(rootDir);
	return (await Promise.all(CONTENT_CLASSES.map((type) => scanClass(root, type)))).flat();
}
const SYMLINK_SKIP_REASON = "is a symlink, and the content walk reads regular files and real directories only — this override is not indexed, so the bundled artifact is what gets emitted. Replace the link with the file itself.";
async function discoverSkippedUserEntries(rootDir) {
	const root = userContentRoot(rootDir);
	return (await Promise.all(CONTENT_CLASSES.map((type) => scanSkipped(root, type)))).flat();
}
async function scanSkipped(root, type) {
	const { dir, layout } = CLASS_LAYOUT[type];
	const classDir = join(root, dir);
	const entries = await listDir(classDir);
	if (entries === null) return [];
	const linked = entries.filter((entry) => entry.isSymbolicLink()).filter((entry) => layout === "directory" || entry.name.endsWith(ARTIFACT_EXTENSION$1)).map((entry) => ({
		type,
		filePath: join(classDir, entry.name),
		reason: SYMLINK_SKIP_REASON
	}));
	if (layout !== "directory") return linked;
	const composed = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
		const skillDir = join(classDir, entry.name);
		const artifact = (await listDir(skillDir))?.find((candidate) => candidate.name === SKILL_FILE$1);
		if (artifact === void 0 || !artifact.isSymbolicLink()) return [];
		return [{
			type,
			filePath: join(skillDir, SKILL_FILE$1),
			reason: SYMLINK_SKIP_REASON
		}];
	}));
	return [...linked, ...composed.flat()];
}
async function discoverUserOverlays(rootDir) {
	return discoverOverlaysUnder(userContentRoot(rootDir));
}
async function discoverOverlaysUnder(root) {
	return (await Promise.all(CONTENT_CLASSES.map((type) => scanOverlays(root, type)))).flat();
}
async function scanOverlays(root, type) {
	const { dir, layout } = CLASS_LAYOUT[type];
	const classDir = join(root, dir);
	const entries = await listDir(classDir);
	if (entries === null) return [];
	return await withBodyLengths(layout === "directory" ? await skillOverlayPairs(classDir, type, entries) : fileOverlayPairs(classDir, type, entries));
}
function fileOverlayPairs(classDir, type, entries) {
	const found = /* @__PURE__ */ new Map();
	for (const entry of entries) {
		if (!entry.isFile()) continue;
		const half = overlayHalfOf(entry.name);
		if (half === null) continue;
		const slug = stripEngineContentPrefix(half.base);
		const pair = found.get(slug) ?? {
			type,
			slug
		};
		if (half.kind === "frontmatter") pair.frontmatterPath = join(classDir, entry.name);
		else pair.bodyPath = join(classDir, entry.name);
		found.set(slug, pair);
	}
	return [...found.values()];
}
async function skillOverlayPairs(classDir, type, entries) {
	const dirs = entries.filter((entry) => entry.isDirectory());
	const listings = await Promise.all(dirs.map((entry) => listDir(join(classDir, entry.name))));
	return dirs.flatMap((entry, index) => {
		const inner = listings[index] ?? [];
		const pathOf = (name) => inner.some((candidate) => candidate.name === name && candidate.isFile()) ? join(classDir, entry.name, name) : void 0;
		const frontmatterPath = pathOf(`${SKILL_BASE}${OVERLAY_FRONTMATTER_SUFFIX}`);
		const bodyPath = pathOf(`${SKILL_BASE}${OVERLAY_BODY_SUFFIX}`);
		if (frontmatterPath === void 0 && bodyPath === void 0) return [];
		return [{
			type,
			slug: stripEngineContentPrefix(entry.name),
			...frontmatterPath === void 0 ? {} : { frontmatterPath },
			...bodyPath === void 0 ? {} : { bodyPath }
		}];
	});
}
async function withBodyLengths(pairs) {
	const texts = await pLimit(READ_CONCURRENCY$3).map(pairs, (pair) => pair.bodyPath === void 0 ? Promise.resolve(null) : readIfPresent$1(pair.bodyPath));
	return pairs.map((pair, index) => {
		const text = texts[index];
		return text === null || text === void 0 ? pair : {
			...pair,
			bodyLength: text.length
		};
	});
}
async function discoverSkillOverlayCarrierExtras(rootDir) {
	const classDir = join(userContentRoot(rootDir), CLASS_LAYOUT.skill.dir);
	const entries = await listDir(classDir);
	if (entries === null) return [];
	const dirs = entries.filter((entry) => entry.isDirectory());
	return (await Promise.all(dirs.map(async (entry) => {
		const dirPath = join(classDir, entry.name);
		const inner = await listDir(dirPath) ?? [];
		const hasHalf = inner.some((candidate) => candidate.isFile() && (candidate.name === `${SKILL_BASE}${OVERLAY_FRONTMATTER_SUFFIX}` || candidate.name === `${SKILL_BASE}${OVERLAY_BODY_SUFFIX}`));
		const hasSkillFile = inner.some((candidate) => candidate.isFile() && candidate.name === "SKILL.md");
		if (!hasHalf || hasSkillFile) return [];
		const found = (await walkSupportEntries(dirPath, "")).filter((item) => !item.linked && item.relative !== `${SKILL_BASE}${OVERLAY_FRONTMATTER_SUFFIX}` && item.relative !== `${SKILL_BASE}${OVERLAY_BODY_SUFFIX}` && !item.relative.split("/").some((segment) => segment.startsWith(".")));
		const slug = stripEngineContentPrefix(entry.name);
		const byTop = /* @__PURE__ */ new Map();
		for (const item of found) {
			const top = item.relative.split("/")[0];
			byTop.set(top, [...byTop.get(top) ?? [], item]);
		}
		return [...byTop.entries()].map(([top, items]) => items.length === 1 ? {
			slug,
			filePath: join(dirPath, ...items[0].relative.split("/")),
			count: 1
		} : {
			slug,
			filePath: join(dirPath, top),
			count: items.length
		});
	}))).flat();
}
function overlayHalfOf(name) {
	if (name.endsWith(OVERLAY_FRONTMATTER_SUFFIX)) return {
		base: name.slice(0, -15),
		kind: "frontmatter"
	};
	if (name.endsWith(OVERLAY_BODY_SUFFIX)) return {
		base: name.slice(0, -13),
		kind: "body"
	};
	return null;
}
async function overlayHalvesAt(rootDir, type, id) {
	const { dir, layout } = CLASS_LAYOUT[type];
	const classDir = join(userContentRoot(rootDir), dir);
	const base = layout === "directory" ? join(classDir, id, SKILL_BASE) : join(classDir, id);
	const candidates = [`${base}${OVERLAY_FRONTMATTER_SUFFIX}`, `${base}${OVERLAY_BODY_SUFFIX}`];
	const texts = await Promise.all(candidates.map((path) => readIfPresent$1(path)));
	return candidates.filter((_path, index) => texts[index] !== null);
}
const SUPPORT_SYMLINK_SKIP_REASON = "is a symlink inside a skill override, and the skills projection copies regular files and real directories only — it is not emitted to any client, and its target is never screened. Replace the link with the file itself.";
async function scanUserSkillSupportFiles(rootDir) {
	const classDir = join(userContentRoot(rootDir), CLASS_LAYOUT.skill.dir);
	const entries = await listDir(classDir);
	if (entries === null) return {
		findings: [],
		skipped: [],
		inspected: 0
	};
	const perSkill = await Promise.all(entries.filter((entry) => entry.isDirectory()).map((entry) => scanSkillSupport(join(classDir, entry.name))));
	return {
		findings: perSkill.flatMap((scan) => scan.findings),
		skipped: perSkill.flatMap((scan) => scan.skipped),
		inspected: perSkill.reduce((total, scan) => total + scan.inspected, 0)
	};
}
async function scanSkillSupport(skillDir) {
	const entries = (await walkSupportEntries(skillDir, "")).filter((entry) => entry.relative !== "SKILL.md" && entry.relative !== `${SKILL_BASE}${OVERLAY_FRONTMATTER_SUFFIX}` && entry.relative !== `${SKILL_BASE}${OVERLAY_BODY_SUFFIX}`);
	const absolute = (entry) => join(skillDir, ...entry.relative.split("/"));
	const skipped = entries.filter((entry) => entry.linked).map((entry) => ({
		type: "skill",
		filePath: absolute(entry),
		reason: SUPPORT_SYMLINK_SKIP_REASON
	}));
	const files = entries.filter((entry) => !entry.linked);
	const raws = await pLimit(READ_CONCURRENCY$3).map(files, (entry) => readIfPresent$1(absolute(entry)));
	const findings = [];
	let inspected = 0;
	for (const [index, entry] of files.entries()) {
		const raw = raws[index];
		if (raw === null || raw === void 0) continue;
		inspected += 1;
		for (const violation of denyViolations(raw, `support file \`${entry.relative}\``)) {
			if (violation.severity !== "error") continue;
			findings.push({
				filePath: absolute(entry),
				severity: "error",
				detail: violation.detail
			});
		}
	}
	return {
		findings,
		skipped,
		inspected
	};
}
async function walkSupportEntries(dir, prefix) {
	const entries = await listDir(dir);
	if (entries === null) return [];
	return (await Promise.all(entries.map((entry) => {
		const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
		if (entry.isSymbolicLink()) return Promise.resolve([{
			relative,
			linked: true
		}]);
		if (entry.isDirectory()) return walkSupportEntries(join(dir, entry.name), relative);
		return Promise.resolve(entry.isFile() ? [{
			relative,
			linked: false
		}] : []);
	}))).flat();
}
async function scanClass(root, type) {
	const { dir, layout } = CLASS_LAYOUT[type];
	const classDir = join(root, dir);
	const entries = await listDir(classDir);
	if (entries === null) return [];
	const named = entries.filter((entry) => layout === "directory" ? entry.isDirectory() : entry.isFile() && entry.name.endsWith(ARTIFACT_EXTENSION$1) && !isOverlayFileName(entry.name));
	const linkedArtifact = layout === "directory" ? await Promise.all(named.map((entry) => hasLinkedSkillFile(join(classDir, entry.name)))) : named.map(() => false);
	const candidates = named.map((entry, index) => ({
		slug: layout === "directory" ? entry.name : entry.name.slice(0, -3),
		filePath: layout === "directory" ? join(classDir, entry.name, SKILL_FILE$1) : join(classDir, entry.name),
		linked: linkedArtifact[index] === true
	})).filter((candidate) => !candidate.linked);
	const raws = await pLimit(READ_CONCURRENCY$3).map(candidates, (candidate) => readIfPresent$1(candidate.filePath));
	const artifacts = [];
	for (const [index, candidate] of candidates.entries()) {
		const raw = raws[index];
		if (raw === null || raw === void 0) continue;
		const document = readDocument(raw, candidate.filePath);
		const declared = trimmedString(document.frontmatter, "id");
		artifacts.push({
			type,
			id: declared !== void 0 && SLUG_PATTERN.test(declared) ? declared : candidate.slug,
			filePath: candidate.filePath,
			...document
		});
	}
	return artifacts;
}
async function checkUserArtifact(input) {
	const violations = [];
	for (const field of REQUIRED_FIELDS) {
		const detail = fieldDefect(input, field);
		if (detail !== void 0) violations.push({
			kind: "missing-field",
			detail,
			severity: "error"
		});
	}
	const mismatch = identityDefect(input);
	if (mismatch !== void 0) violations.push({
		kind: "filename-mismatch",
		detail: mismatch,
		severity: "error"
	});
	violations.push(...lifecycleViolations(input.frontmatter));
	violations.push(...activationViolations(input));
	for (const [key, value] of Object.entries(input.frontmatter)) violations.push(...denyViolations(`${key}\n${stringLeaves(value)}`, `frontmatter \`${key}\``));
	violations.push(...denyViolations(commentText(input.frontmatterText), "frontmatter comments"));
	violations.push(...await validateContentBody(input.body, input.type));
	return {
		errors: violations.filter((violation) => violation.severity === "error"),
		warnings: violations.filter((violation) => violation.severity === "warning")
	};
}
async function validateUserArtifact(artifact) {
	const check = await checkUserArtifact(artifact);
	return [...check.errors, ...check.warnings];
}
async function validateContentBody(body, type) {
	const violations = [...denyViolations(body, "body"), ...antiSlopViolations(body)];
	const lines = countLines(body);
	const limit = LEAN_LINE_THRESHOLDS[type];
	if (lines > limit) violations.push({
		kind: "lean-lines",
		severity: "warning",
		detail: `body is ${lines} lines, over the lean threshold of ${limit} for a ${type} — compress it or split it into two artifacts`
	});
	return violations;
}
function denyViolations(text, where) {
	if (text === "") return [];
	const stripped = text.replace(INVISIBLE_SMUGGLING_CHARS, "");
	const strippedHits = scanForDeniedPatterns(stripped);
	const alreadyHit = new Set(strippedHits.map((hit) => hit.patternId));
	const folded = foldConfusables(stripped);
	const foldedHits = folded === stripped ? [] : scanForDeniedPatterns(folded).filter((hit) => !alreadyHit.has(hit.patternId));
	for (const hit of foldedHits) alreadyHit.add(hit.patternId);
	const joined = joinMaskedWords(folded);
	return groupHits([
		...strippedHits,
		...foldedHits,
		...joined === folded ? [] : scanForDeniedPatterns(joined).filter((hit) => !alreadyHit.has(hit.patternId)),
		...scanForDeniedPatterns(text, INJECTION_PATTERNS).filter((hit) => hit.severity === "warn" || NO_HONEST_SHAPE_INJECTION_ROWS.has(hit.patternId))
	]).map((hit) => ({
		kind: "deny-pattern",
		severity: hit.severity === "block" ? "error" : "warning",
		detail: `${where} matches the denied pattern \`${hit.patternId}\` at offset ${hit.index} (${JSON.stringify(hit.snippet)})${occurrences(hit.count)} — remove or rewrite the flagged text`
	}));
}
function antiSlopViolations(body) {
	return groupHits(scanAntiSlop(body)).map((hit) => ({
		kind: "anti-slop",
		severity: "warning",
		detail: `body uses the filler phrase ${JSON.stringify(hit.snippet)} at offset ${hit.index}${occurrences(hit.count)} — state the measurable thing instead`
	}));
}
function lifecycleViolations(frontmatter) {
	const violations = [];
	const load = trimmedString(frontmatter, "load");
	if (load === void 0) violations.push({
		kind: "missing-lifecycle-field",
		severity: "warning",
		detail: `\`load\` is not declared — say whether this artifact loads ${LOAD_CLASSES.join(", ")}, so a reader can tell what it costs in context`
	});
	else if (!LOAD_CLASSES.includes(load)) violations.push({
		kind: "missing-lifecycle-field",
		severity: "warning",
		detail: `\`load\` is ${JSON.stringify(load)}, which is not one of ${LOAD_CLASSES.join(", ")} — a class outside those three declares nothing`
	});
	if (trimmedString(frontmatter, "obsolete_when") === void 0) violations.push({
		kind: "missing-lifecycle-field",
		severity: "warning",
		detail: "`obsolete_when` is not declared — name the condition that makes this artifact redundant, or nothing will ever retire it"
	});
	return violations;
}
const RULE_SCOPES$1 = ["conditional", "agent-requested"];
function activationViolations(input) {
	if (input.type !== "rule") return [];
	const scope = trimmedString(input.frontmatter, "scope");
	if (scope === void 0 || RULE_SCOPES$1.includes(scope)) return [];
	return [{
		kind: "missing-field",
		severity: "error",
		detail: scope === "always" ? "`scope: always` is not emittable: the cursor adapter refuses it (so every later sync fails) and the other three clients cannot read the field and would apply the rule on every turn. Use `scope: conditional` with `globs:`, or `scope: agent-requested`." : `\`scope\` is ${JSON.stringify(scope)}, which is not one of ${RULE_SCOPES$1.join(", ")} — an activation nothing recognises emits as an unconditional rule`
	}];
}
function identityDefect(input) {
	const declared = trimmedString(input.frontmatter, "id");
	if (declared === void 0 || !SLUG_PATTERN.test(declared)) return void 0;
	const slug = input.fileSlug ?? fileSlug(input.filePath, input.type);
	if (slug === null || slug === declared) return void 0;
	return `Frontmatter \`id\` is ${JSON.stringify(declared)} but the file names it ${JSON.stringify(slug)}. Make the two agree — the engine will not pick one for you.`;
}
function fileSlug(filePath, type) {
	const name = basename(filePath);
	if (CLASS_LAYOUT[type].layout === "directory") {
		const dir = basename(dirname(filePath));
		return dir === "" || dir === "." ? null : dir;
	}
	return name.endsWith(ARTIFACT_EXTENSION$1) ? name.slice(0, -3) : null;
}
function fieldDefect(artifact, field) {
	const { frontmatter } = artifact;
	const value = Object.hasOwn(frontmatter, field) ? frontmatter[field] : void 0;
	if (value === void 0) return `\`${field}\` is required in the frontmatter`;
	if (field === "tags") return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? void 0 : "`tags` must be a list of strings";
	if (typeof value !== "string" || value.trim() === "") return `\`${field}\` must be a non-empty string`;
	if (field === "id" && !SLUG_PATTERN.test(value.trim())) return `\`id\` must be a lowercase kebab-case slug (got ${JSON.stringify(value)})`;
	if (field === "type" && value.trim() !== artifact.type) return `\`type\` must be ${JSON.stringify(artifact.type)} — the class this artifact is filed under (got ${JSON.stringify(value)})`;
}
function groupHits(hits) {
	const grouped = /* @__PURE__ */ new Map();
	for (const hit of hits) {
		const existing = grouped.get(hit.patternId);
		if (existing === void 0) grouped.set(hit.patternId, {
			...hit,
			count: 1
		});
		else existing.count += 1;
	}
	return [...grouped.values()];
}
function occurrences(count) {
	if (count < 2) return "";
	return count === 2 ? " and 1 more time" : ` and ${count - 1} more times`;
}
function describeViolation(violation) {
	return `${violation.kind}: ${violation.detail}`;
}
function saveIdDefect(id) {
	if (!SLUG_PATTERN.test(id)) return `Artifact id ${JSON.stringify(id)} is not a slug. Use lowercase letters, digits and single hyphens (for example \`review-gate\`) — the id becomes the file name.`;
	const reserved = ENGINE_CONTENT_PREFIXES.find((prefix) => id.startsWith(prefix));
	if (reserved !== void 0) return `Artifact id ${JSON.stringify(id)} starts with \`${reserved}\`, which names the generated corpus: a file called that reads as engine-owned and would be overwritten without a backup. Save it as ${JSON.stringify(id.slice(reserved.length))} — an id that matches a bundled artifact already overrides it, prefix and all.`;
}
function overlayExclusivityDefect(filePath, overlayPaths) {
	const overlays = overlayPaths.map(toPosixDisplayPath).join(" and ");
	return `The overlay ${overlays} already patches this id. An artifact is either REPLACED by a full override or PATCHED by an overlay, never both — a tree holding both stops indexing, so this save would break the next sync. Remove ${overlays} to write ${toPosixDisplayPath(filePath)}, or drop the save and edit the overlay instead.`;
}
function artifactPath(rootDir, type, id) {
	const { dir, layout } = CLASS_LAYOUT[type];
	const classDir = join(userContentRoot(rootDir), dir);
	return layout === "directory" ? join(classDir, id, SKILL_FILE$1) : join(classDir, `${id}${ARTIFACT_EXTENSION$1}`);
}
const FRONTMATTER_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
function readDocument(raw, source) {
	const block = FRONTMATTER_BLOCK.exec(raw)?.[1];
	const head = block === void 0 ? {} : { frontmatterText: block };
	try {
		const parsed = parseFrontmatter(raw, source);
		return {
			frontmatter: parsed.frontmatter,
			body: parsed.body,
			...head
		};
	} catch {
		return {
			frontmatter: {},
			body: raw,
			...head
		};
	}
}
function commentText(frontmatterText) {
	if (frontmatterText === void 0) return "";
	return frontmatterText.split(/\r?\n/).map((line) => /(?:^|\s)#(.*)$/.exec(line)?.[1] ?? "").filter((comment) => comment !== "").join("\n");
}
function trimmedString(frontmatter, field) {
	const value = Object.hasOwn(frontmatter, field) ? frontmatter[field] : void 0;
	if (typeof value !== "string") return void 0;
	const trimmed = value.trim();
	return trimmed === "" ? void 0 : trimmed;
}
function stringLeaves(value, seen = /* @__PURE__ */ new Set()) {
	if (typeof value === "string") return value;
	if (typeof value !== "object" || value === null) return "";
	if (seen.has(value)) return "";
	seen.add(value);
	return (Array.isArray(value) ? value : Object.values(value)).map((entry) => stringLeaves(entry, seen)).filter((text) => text !== "").join("\n");
}
function countLines(body) {
	const trimmed = body.replace(/\r?\n$/, "");
	return trimmed === "" ? 0 : trimmed.split(/\r?\n/).length;
}
async function listDir(dirPath) {
	try {
		return (await readdir(dirPath, { withFileTypes: true })).toSorted(byName);
	} catch (error) {
		if (isMissing$1(error)) return null;
		throw error;
	}
}
async function hasLinkedSkillFile(skillDir) {
	return (await listDir(skillDir))?.find((entry) => entry.name === SKILL_FILE$1)?.isSymbolicLink() === true;
}
async function readIfPresent$1(filePath) {
	try {
		return await readFile(filePath, "utf8");
	} catch (error) {
		if (isMissing$1(error)) return null;
		throw error;
	}
}
function isMissing$1(error) {
	const code = error?.code;
	return code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR";
}
function byName(a, b) {
	if (a.name < b.name) return -1;
	return a.name > b.name ? 1 : 0;
}
//#endregion
//#region src/guard/tokenEstimate.ts
var tokenEstimate_exports = /* @__PURE__ */ __exportAll({
	CHARS_PER_TOKEN: () => 4,
	estimateTokens: () => estimateTokens
});
function estimateTokens(text) {
	if (text === void 0 || text.length === 0) return 0;
	return Math.ceil(text.length / 4);
}
//#endregion
//#region src/pack/sigstoreVerifier.ts
var sigstoreVerifier_exports = /* @__PURE__ */ __exportAll({
	sigstoreCachePath: () => sigstoreCachePath,
	verifySigstoreBundle: () => verifySigstoreBundle
});
const BUNDLE_MEDIA_TYPE_PREFIX = "application/vnd.dev.sigstore.bundle";
const CACHE_DIR_SEGMENTS = ["stamity", "sigstore-tuf"];
function sigstoreCachePath(env = process.env, platform = process.platform, home = homedir()) {
	switch (platform) {
		case "win32": return join(env.LOCALAPPDATA ?? join(home, "AppData", "Local"), ...CACHE_DIR_SEGMENTS);
		case "darwin": return join(home, "Library", "Caches", ...CACHE_DIR_SEGMENTS);
		default: return join(env.XDG_CACHE_HOME ?? join(home, ".cache"), ...CACHE_DIR_SEGMENTS);
	}
}
const refuse$4 = (reason) => ({
	verified: false,
	reason
});
const MAX_CAUSE_LENGTH = 200;
const NOT_PRINTABLE_ASCII = /[^\x20-\x7E]/g;
function sanitizeForVerdict(text) {
	const printable = text.replace(NOT_PRINTABLE_ASCII, "?");
	return printable.length <= MAX_CAUSE_LENGTH ? printable : `${printable.slice(0, MAX_CAUSE_LENGTH)}… (truncated)`;
}
function describeError$1(cause) {
	if (cause instanceof Error) {
		const code = cause.code;
		const message = sanitizeForVerdict(cause.message);
		return typeof code === "string" && code !== "" ? `${sanitizeForVerdict(code)}: ${message}` : message;
	}
	return sanitizeForVerdict(String(cause));
}
function anchoredPattern(value) {
	return `^${value.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)}$`;
}
const URI_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
function withoutIdentityPins(options) {
	const stripped = { ...options };
	delete stripped.certificateIssuer;
	delete stripped.certificateIdentityEmail;
	delete stripped.certificateIdentityURI;
	return stripped;
}
function verifyOptionsFor(pin, overrides) {
	const base = {
		tufCachePath: sigstoreCachePath(),
		...overrides
	};
	const pattern = anchoredPattern(pin.identity);
	return {
		...withoutIdentityPins(base),
		certificateIssuer: pin.issuer,
		...URI_SCHEME.test(pin.identity) ? { certificateIdentityURI: pattern } : { certificateIdentityEmail: pattern }
	};
}
function identityMismatch(pin, signer) {
	const san = signer.identity?.subjectAlternativeName;
	const issuer = signer.identity?.extensions?.issuer;
	if (san !== pin.identity) return `certificate identity ${JSON.stringify(san ?? null)} is not the declared ${JSON.stringify(pin.identity)}`;
	if (issuer !== pin.issuer) return `certificate issuer ${JSON.stringify(issuer ?? null)} is not the declared ${JSON.stringify(pin.issuer)}`;
	return null;
}
function parseBundle(bundleBytes) {
	let parsed;
	try {
		parsed = JSON.parse(Buffer.from(bundleBytes).toString("utf8"));
	} catch (cause) {
		return { reason: `the detached bundle is not valid JSON (${describeError$1(cause)})` };
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return { reason: "the detached bundle is not a JSON object" };
	const mediaType = parsed.mediaType;
	if (typeof mediaType !== "string" || !mediaType.startsWith(BUNDLE_MEDIA_TYPE_PREFIX)) return { reason: `the detached bundle declares mediaType ${JSON.stringify(mediaType ?? null)}, which is not a Sigstore bundle (${BUNDLE_MEDIA_TYPE_PREFIX}…)` };
	return { bundle: parsed };
}
async function loadSigstoreVerify() {
	const { verify } = await import("sigstore");
	return (bundle, payload, options) => verify(bundle, payload, options);
}
async function verifySigstoreBundle(bundleBytes, payload, opts = {}) {
	const parsed = parseBundle(bundleBytes);
	if ("reason" in parsed) return refuse$4(parsed.reason);
	if (opts.signer === void 0) return refuse$4(`the pack declares a Sigstore signature but no \`signing.signer\`, so nothing pins WHO signed it and any Sigstore identity would satisfy the claim. ${SIGNER_GRAMMAR} An unpinned claim is refused, never verified as publisher-signed.`);
	const pin = parseSignerPin(opts.signer);
	if (pin === null) return refuse$4(`the pack declares signer ${JSON.stringify(sanitizeForVerdict(opts.signer))}, which names no verifiable identity. ${SIGNER_GRAMMAR} A signer that cannot be pinned is refused rather than ignored.`);
	let verifyFn = opts.verifyFn;
	if (verifyFn === void 0) try {
		verifyFn = await loadSigstoreVerify();
	} catch (cause) {
		return refuse$4(`the Sigstore client could not be loaded (${describeError$1(cause)}), so the signature was never checked. Reinstall this package's dependencies; a missing verifier is a refusal, not a pass.`);
	}
	let signer;
	try {
		signer = await verifyFn(parsed.bundle, payload, verifyOptionsFor(pin, opts.verifyOptions ?? {}));
	} catch (cause) {
		return refuse$4(`the detached bundle did not verify — ${describeError$1(cause)}`);
	}
	const mismatch = identityMismatch(pin, signer);
	if (mismatch !== null) return refuse$4(`the detached bundle verified, but ${mismatch}`);
	return {
		verified: true,
		reason: `bundle verified: signed by ${sanitizeForVerdict(pin.identity)} via ${sanitizeForVerdict(pin.issuer)}`
	};
}
//#endregion
//#region src/pack/trust.ts
var trust_exports = /* @__PURE__ */ __exportAll({
	MAX_SIGSTORE_BUNDLE_BYTES: () => MAX_SIGSTORE_BUNDLE_BYTES,
	SIGNING_METHODS: () => SIGNING_METHODS,
	TRUST_TIERS: () => TRUST_TIERS,
	armedSigstoreVerifier: () => armedSigstoreVerifier,
	computeAggregateContentSha: () => computeAggregateContentSha,
	notYetArmedSigstoreVerifier: () => notYetArmedSigstoreVerifier,
	readSigstoreBundle: () => readSigstoreBundle,
	resolveTrustTier: () => resolveTrustTier,
	settleSignatureClause: () => settleSignatureClause,
	sigstoreSignedPayload: () => sigstoreSignedPayload,
	trustTierRank: () => trustTierRank,
	verifyPublisherSignedClaim: () => verifyPublisherSignedClaim
});
const TRUST_TIERS = [
	"pinned-unsigned",
	"scanned",
	"publisher-signed",
	"curator-verified"
];
function trustTierRank(tier) {
	return TRUST_TIERS.indexOf(tier);
}
const SIGNING_METHODS = [SIGSTORE_SIGNING_METHOD];
const notYetArmedSigstoreVerifier = { verify: () => Promise.resolve({
	verified: false,
	unarmed: true,
	reason: "no armed Sigstore verifier sits behind the seam on this path, so the publisher-signed claim is refused rather than assumed. Install from a catalog-pinned source — a verified pin is an independent trust basis this gate honours."
}) };
const armedSigstoreVerifier = { verify: (bundleBytes, aggregateSha, signer) => verifySigstoreBundle(bundleBytes, sigstoreSignedPayload(aggregateSha), signer === void 0 ? {} : { signer }) };
function frameField(value) {
	return `${Buffer.byteLength(value, "utf8")}:${value}`;
}
function computeAggregateContentSha(integrity) {
	const entries = Object.entries(integrity).toSorted(([a], [b]) => a < b ? -1 : 1);
	const hash = createHash("sha256");
	for (const [relPath, digest] of entries) hash.update(frameField(relPath) + frameField(digest.toLowerCase()), "utf8");
	return hash.digest("hex");
}
function sigstoreSignedPayload(aggregateSha) {
	return Buffer.from(frameField(aggregateSha.toLowerCase()), "utf8");
}
function assertKnownSigningMethod(method) {
	if (!SIGNING_METHODS.includes(method)) throw new EngineError(`Unknown signing method ${JSON.stringify(method)} (known: ${SIGNING_METHODS.join(", ")}). An unknown method never passes as publisher-signed; fix the pack's \`signing.method\` or drop the declaration.`, { code: "VALIDATION_ERROR" });
}
const shortSha = (sha) => `${sha.slice(0, 12)}…`;
const PENDING_SIGNATURE_CLAUSE = "; the declared signature claim must still verify against its bundle";
function settleSignatureClause(basis, verifiedBasis) {
	return `${basis.endsWith(PENDING_SIGNATURE_CLAUSE) ? basis.slice(0, -67) : basis}; ${verifiedBasis}`;
}
function resolveTrustTier(manifest, pin) {
	const signing = manifest.signing;
	if (signing !== void 0) assertKnownSigningMethod(signing.method);
	const aggregateSha = computeAggregateContentSha(manifest.integrity);
	if (pin !== void 0) {
		if (aggregateSha !== pin.sha256.toLowerCase()) throw new EngineError(`Pack "${manifest.name}" does not match its catalog pin: pinned aggregate content SHA ${pin.sha256}, computed ${aggregateSha}. Pinned-or-refuse — this content is not what the catalog entry names; re-obtain the pack or point at the catalog entry for this version.`, { code: "INTEGRITY_ERROR" });
		if (pin.tier === "curator-verified" || pin.tier === "scanned") return {
			tier: pin.tier,
			basis: `catalog pin verified: aggregate content SHA ${shortSha(aggregateSha)} matches and the catalog grants "${pin.tier}"` + (signing === void 0 ? "" : PENDING_SIGNATURE_CLAUSE)
		};
	}
	if (signing !== void 0) return {
		tier: "publisher-signed",
		basis: `signing.method "${signing.method}" claims publisher-signed over aggregate content SHA ${shortSha(aggregateSha)}` + (pin === void 0 ? "" : ` (catalog pin SHA verified; its "${pin.tier}" grant adds no higher rung)`) + PENDING_SIGNATURE_CLAUSE
	};
	return {
		tier: "pinned-unsigned",
		basis: (pin === void 0 ? "no catalog pin and no signing declaration" : `catalog pin SHA verified but grants "${pin.tier}", and no signing is declared`) + "; only the manifest integrity map anchors this content, so installing requires --allow-untrusted"
	};
}
const MAX_SIGSTORE_BUNDLE_BYTES = 1048576;
const O_NOFOLLOW = constants["O_NOFOLLOW"] ?? 0;
async function readSigstoreBundle(packRoot, bundlePath) {
	assertSafePackRelPath(bundlePath, "`signing.bundlePath`");
	const root = resolve(packRoot);
	const absPath = resolve(root, bundlePath);
	if (absPath !== root && !absPath.startsWith(root + sep)) throw new EngineError(`Unsafe pack path in \`signing.bundlePath\`: ${JSON.stringify(bundlePath)} resolves outside ${root}.`, { code: "VALIDATION_ERROR" });
	const notRegular = () => new EngineError(`Pack signing declares a Sigstore bundle at ${JSON.stringify(bundlePath)}, but that path is not a regular file. Symlinks can address files outside the pack, and a pipe or device node has no end; either way the pack does not match its signing declaration.`, { code: "INTEGRITY_ERROR" });
	const tooLarge = (size) => new EngineError(`Pack signing declares a Sigstore bundle at ${JSON.stringify(bundlePath)} of ${String(size)} bytes, over the ${String(MAX_SIGSTORE_BUNDLE_BYTES)}-byte limit. A detached bundle is a few kilobytes; this one is refused unread.`, { code: "INTEGRITY_ERROR" });
	let handle;
	try {
		const link = await lstat(absPath);
		if (!link.isFile()) throw notRegular();
		if (link.size > 1048576) throw tooLarge(link.size);
		handle = await open(absPath, constants.O_RDONLY | O_NOFOLLOW);
		const opened = await handle.stat();
		if (!opened.isFile()) throw notRegular();
		if (opened.size > 1048576) throw tooLarge(opened.size);
		return await handle.readFile();
	} catch (cause) {
		if (cause instanceof EngineError) throw cause;
		const code = cause.code;
		if (code === "ENOENT") throw new EngineError(`Pack signing declares a Sigstore bundle at ${JSON.stringify(bundlePath)} but the pack ships no such file. The pack does not match its signing declaration; re-obtain it from the author.`, {
			code: "INTEGRITY_ERROR",
			cause
		});
		if (code === "ELOOP" || code === "EMLINK") throw notRegular();
		throw new EngineError(`Cannot read Sigstore bundle ${absPath}: ${code ?? (cause instanceof Error ? cause.message : String(cause))}.`, {
			code: "FS_ERROR",
			cause
		});
	} finally {
		await handle?.close();
	}
}
const CATALOG_GRANTED_TIERS = /* @__PURE__ */ new Set(["scanned", "curator-verified"]);
async function verifyPublisherSignedClaim(manifest, packRoot, verifier, opts = {}) {
	const signing = manifest.signing;
	if (signing === void 0) return { outcome: "n/a" };
	assertKnownSigningMethod(signing.method);
	const bundlePath = signing.bundlePath;
	if (bundlePath === void 0) throw new EngineError(`Pack "${manifest.name}" declares signing.method "${signing.method}" but no \`bundlePath\`. A publisher-signed claim without its detached bundle cannot be verified, so it is refused.`, { code: "INTEGRITY_ERROR" });
	const bundleBytes = await readSigstoreBundle(packRoot, bundlePath);
	const aggregateSha = computeAggregateContentSha(manifest.integrity);
	const verdict = await verifier.verify(bundleBytes, aggregateSha, signing.signer);
	if (verdict.verified) return {
		outcome: "pass",
		verifiedBasis: verdict.reason
	};
	const pinTier = opts.catalogPinTier;
	if (verdict.unarmed === true && pinTier !== void 0 && CATALOG_GRANTED_TIERS.has(pinTier)) return { outcome: "n/a" };
	throw new EngineError(`Pack "${manifest.name}" publisher-signed claim refused: ${verdict.reason}`, { code: "INTEGRITY_ERROR" });
}
//#endregion
//#region src/pack/install.ts
var install_exports = /* @__PURE__ */ __exportAll({
	applyPackInstall: () => applyPackInstall,
	packLedgerRelPath: () => packLedgerRelPath,
	planPackInstall: () => planPackInstall,
	planPackRemoval: () => planPackRemoval
});
const READ_CONCURRENCY$2 = 8;
function packLedgerRelPath(packId) {
	return packDirRelPath(packId);
}
function packArtifactId(packId, relPath) {
	return `${packId}/${relPath}`;
}
const CLASS_OF_PACK_DIR = {
	agents: "agent",
	skills: "skill",
	rules: "rule",
	commands: "command"
};
const ARTIFACT_EXTENSION = ".md";
const SKILL_FILE = "SKILL.md";
function catalogIdOf(relPath, declaredId) {
	const segments = relPath.split("/");
	const type = CLASS_OF_PACK_DIR[segments[0] ?? ""];
	if (type === void 0) return null;
	const declared = declaredId?.trim();
	let slug;
	if (type === "skill") {
		if (segments.length !== 3 || segments[2] !== SKILL_FILE) return null;
		slug = slugOf(segments[1]);
	} else {
		if (segments.length !== 2) return null;
		const name = segments[1];
		if (extname(name).toLowerCase() !== ARTIFACT_EXTENSION) return null;
		slug = slugOf(name.slice(0, -3));
	}
	return typeIdKey(type, applyCommandPrefix(declared === void 0 || declared === "" ? slug : declared, type));
}
function isOwnedByPack(entry, owner) {
	return entry.adapter === owner;
}
function cloneEntry(entry) {
	return {
		path: entry.path,
		adapter: entry.adapter,
		artifactId: entry.artifactId,
		artifactType: entry.artifactType,
		...entry.contentHash !== void 0 ? { contentHash: entry.contentHash } : {},
		...entry.stampedVersion !== void 0 ? { stampedVersion: entry.stampedVersion } : {}
	};
}
function describeError(cause) {
	return cause instanceof Error ? cause.message : String(cause);
}
function underRoot(rootDir, relPath) {
	return join(rootDir, ...relPath.split("/"));
}
async function pathExists$2(path) {
	try {
		await lstat(path);
		return true;
	} catch (cause) {
		const code = cause.code;
		if (code === "ENOENT" || code === "ENOTDIR") return false;
		throw new EngineError(`Cannot stat ${path}: ${describeError(cause)}.`, {
			code: "FS_ERROR",
			cause
		});
	}
}
async function readIfExists(path) {
	try {
		return await readFile(path, "utf8");
	} catch (cause) {
		if (cause.code !== "ENOENT") throw cause;
		return null;
	}
}
function verifiedDigest(manifest, relPath) {
	const digest = manifest.integrity[relPath];
	if (digest === void 0) throw new EngineError(`Pack "${manifest.name}" enumerates ${relPath} but its integrity map does not list it.`, { code: "INTEGRITY_ERROR" });
	return digest;
}
function resolveSourceIdentity(packManifest, source) {
	const sourceName = source.sourceName;
	if (sourceName === void 0) return packManifest.name;
	if (!packNameMatchesSource(packManifest.name, sourceName)) throw new EngineError(`Pack package "${sourceName}" declares itself ${JSON.stringify(packManifest.name)} in its pack.json. The org trust policy and every ownership record downstream key on one identity, so a package that installs under a different name than the one it was resolved from is refused rather than reconciled. Re-obtain the pack from a source whose package name matches its manifest.`, { code: "INTEGRITY_ERROR" });
	return sourceName;
}
function policySourceKind(source, tier) {
	if (tier === "curator-verified" || tier === "scanned") return "catalog-pinned";
	return source.kind;
}
function applyOrgPolicy(identity, sourceKind, policy) {
	const decision = evaluatePackSource(policy, identity, sourceKind);
	if (decision.decision === "deny") throw new EngineError(`Pack "${identity}" is denied by the org trust policy${decision.matchedRule === void 0 ? "" : ` (matched rule: ${JSON.stringify(decision.matchedRule)})`}. The policy at ${ORG_POLICY_REL_PATH} decides which pack sources this repo accepts; installing it requires a policy change, not a flag.`, { code: "INTEGRITY_ERROR" });
	return decision;
}
async function runSigningGate(packRoot, manifest, tier, opts) {
	if (manifest.signing !== void 0) return await verifyPublisherSignedClaim(manifest, packRoot, opts.sigstoreVerifier ?? armedSigstoreVerifier, opts.catalogPin === void 0 ? {} : { catalogPinTier: tier });
	if (tier === "scanned" || tier === "curator-verified") return { outcome: "n/a" };
	return { outcome: verifySigningDeclaration(manifest, opts.allowUntrusted === true) };
}
async function estimateContentTokens(files) {
	const estimates = await pLimit(READ_CONCURRENCY$2).map(files, async (file) => {
		try {
			return [file.relPath, estimateTokens(await readFile(file.absPath, "utf8"))];
		} catch (cause) {
			throw new EngineError(`Cannot read pack file ${file.absPath}: ${describeError(cause)}.`, {
				code: "FS_ERROR",
				cause
			});
		}
	});
	return new Map(estimates);
}
const AGENT_CLASS = "agents";
function runtimeAgentId(catalogKey) {
	const bare = catalogKey.slice(catalogKey.indexOf(":") + 1);
	return bare.startsWith("stamity-") ? bare : `${CONTENT_PREFIX}${bare}`;
}
async function readPackArtifacts(files) {
	const artifacts = files.filter((file) => CLASS_OF_PACK_DIR[file.contentClass] !== void 0 && file.relPath.endsWith(ARTIFACT_EXTENSION));
	return pLimit(READ_CONCURRENCY$2).map(artifacts, async (file) => {
		let raw;
		try {
			raw = await readFile(file.absPath, "utf8");
		} catch (cause) {
			throw new EngineError(`Cannot read pack file ${file.absPath}: ${describeError(cause)}.`, {
				code: "FS_ERROR",
				cause
			});
		}
		const parsed = parseFrontmatter(raw, file.relPath);
		const declared = parsed.hadFrontmatter ? parsed.frontmatter["id"] : void 0;
		return {
			relPath: file.relPath,
			contentClass: file.contentClass,
			catalogKey: parsed.hadFrontmatter ? catalogIdOf(file.relPath, typeof declared === "string" ? declared : void 0) : null,
			frontmatter: parsed.frontmatter
		};
	});
}
function packAgentsOf(artifacts) {
	return artifacts.filter((file) => file.contentClass === AGENT_CLASS && file.catalogKey !== null).map((file) => ({
		relPath: file.relPath,
		runtimeId: runtimeAgentId(file.catalogKey),
		frontmatter: file.frontmatter
	}));
}
function declaredFootprint(manifest) {
	return grantableFootprint(manifest.permissions?.toolFootprint);
}
function describeAgentGrants(agents, manifest) {
	const declaredTools = declaredFootprint(manifest);
	return agents.map((agent) => {
		const grant = resolveAgentGrant({
			runtimeId: agent.runtimeId,
			frontmatter: agent.frontmatter,
			declaredTools
		});
		const held = grant.allow.length > 0 ? grant.allow.join(", ") : "nothing";
		const basis = grant.source === "roster" ? `this setup's own agent policy answers the id, so the pack's file cannot widen or narrow it` : `bounded by the pack's declared tool footprint (${declaredTools.length > 0 ? declaredTools.join(", ") : "the pack declares none"})`;
		return {
			relPath: agent.relPath,
			runtimeId: agent.runtimeId,
			allow: grant.allow,
			rationale: `may use ${held} — ${basis}.`
		};
	});
}
async function collectCollisions(rootDir, packId, writeSet, ledger, artifacts) {
	const owner = packOwner(packId);
	const foreign = ledger.filter((entry) => !isOwnedByPack(entry, owner));
	const claimedPaths = new Map(foreign.map((entry) => [entry.path, entry]));
	const claimedIds = claimedCatalogIds(foreign);
	const plannedIds = new Map(artifacts.filter((artifact) => artifact.catalogKey !== null).map((artifact) => [artifact.relPath, artifact.catalogKey]));
	const ownedPaths = new Set(ledger.filter((entry) => isOwnedByPack(entry, owner)).map((entry) => entry.path));
	const strays = await Promise.all(writeSet.map(async (entry) => ownedPaths.has(entry.targetPath) ? false : await pathExists$2(underRoot(rootDir, entry.targetPath))));
	const collisions = /* @__PURE__ */ new Set();
	for (const [index, entry] of writeSet.entries()) {
		const pathOwner = claimedPaths.get(entry.targetPath);
		if (pathOwner !== void 0) collisions.add(`${entry.targetPath}: the ledger already assigns this path to ${pathOwner.artifactId}`);
		const catalogKey = plannedIds.get(entry.relPath);
		const idOwner = catalogKey === void 0 ? void 0 : claimedIds.get(catalogKey);
		if (catalogKey !== void 0 && idOwner !== void 0) {
			const [type = "", id = ""] = splitKey(catalogKey);
			collisions.add(`${entry.relPath}: ${type} id "${id}" is already owned by ${idOwner.artifactId} at ${idOwner.path}; installing it would shadow content this repo already has`);
		}
		if (strays[index] === true) collisions.add(`${entry.targetPath}: a file already exists there that pack "${packId}" does not own`);
	}
	return [...collisions];
}
function splitKey(key) {
	const colon = key.indexOf(":");
	return [key.slice(0, colon), key.slice(colon + 1)];
}
function claimedCatalogIds(foreign) {
	const claimed = /* @__PURE__ */ new Map();
	for (const entry of foreign) {
		if (CONTENT_CLASSES.includes(entry.artifactType)) {
			claimed.set(typeIdKey(entry.artifactType, entry.artifactId), entry);
			continue;
		}
		const slash = entry.artifactId.indexOf("/");
		if (slash === -1) continue;
		const key = catalogIdOf(entry.artifactId.slice(slash + 1));
		if (key !== null) claimed.set(key, entry);
	}
	return claimed;
}
const HOOK_CLASS_PREFIX = "hooks/";
function packRelHookPath(reported) {
	const segments = reported.split("/");
	return `${HOOK_CLASS_PREFIX}${segments[segments.length - 1]}`;
}
async function checkHookDefinitions(manifest, files, packRoot, rootDir) {
	if (files.filter((file) => file.relPath.startsWith(HOOK_CLASS_PREFIX)).length === 0) return "n/a";
	const { hooks, errors } = await readHookDefinitions(join(packRoot, "hooks"), rootDir);
	if (errors.length > 0) {
		const list = errors.map((error) => `  - ${packRelHookPath(error.file)} [${error.code}] ${error.message}`).join("\n");
		throw new EngineError(`Pack "${manifest.name}" declares hook command(s) this repo will not run:\n${list}\nAn accepted hook lands in your client's own settings file and runs on every matching tool call, as you — so a defective definition is refused while you are still deciding, rather than installed under an all-pass gate table and dropped at the next sync. Fix the definition, or commit the repo script it names, and re-run.`, { code: "VALIDATION_ERROR" });
	}
	return hooks.length === 0 ? "n/a" : "pass";
}
async function planPackInstall(projectRoot, spec, opts = {}) {
	const rootDir = resolve(projectRoot);
	const source = await resolvePackSource(rootDir, spec);
	const packManifest = await readPackManifest(source.packRoot);
	const checks = { manifest: "pass" };
	const orgPolicy = await loadOrgPolicy(rootDir);
	const { tier, basis } = resolveTrustTier(packManifest, opts.catalogPin);
	checks.trustTier = "pass";
	const policy = applyOrgPolicy(resolveSourceIdentity(packManifest, source), policySourceKind(source, tier), orgPolicy);
	checks.orgPolicy = orgPolicy === null ? "n/a" : "pass";
	const signature = await runSigningGate(source.packRoot, packManifest, tier, opts);
	checks.signing = signature.outcome;
	checks.lifecycleScripts = await checkLifecycleScripts(source.packRoot);
	const files = await enumeratePackContent(source.packRoot);
	checks.integrityMap = await verifyIntegrityMap(source.packRoot, packManifest, files);
	checks.bodyScan = await scanPackBodies(files);
	checks.mcpServers = await checkMcpServerDefinitions(packManifest, files);
	checks.hooks = await checkHookDefinitions(packManifest, files, source.packRoot, rootDir);
	checks.footprint = checkFootprint(packManifest, files);
	checks.declaredTools = await checkDeclaredTools(packManifest, files);
	checks.ruleActivation = await checkRuleActivation(packManifest, files);
	checks.permissions = checkPermissions(packManifest, files);
	const artifacts = await readPackArtifacts(files);
	const agents = packAgentsOf(artifacts);
	checks.agentCapabilities = checkAgentCapabilities(agents, packManifest.permissions);
	const packRelPath = packLedgerRelPath(packManifest.name);
	const writeSet = files.map((file) => ({
		relPath: file.relPath,
		targetPath: `${packRelPath}/${file.relPath}`,
		contentClass: file.contentClass,
		contentHash: verifiedDigest(packManifest, file.relPath),
		sizeBytes: file.sizeBytes
	}));
	const tokensByRelPath = await estimateContentTokens(files);
	const tokensByPath = {};
	let totalTokens = 0;
	for (const entry of writeSet) {
		const tokens = tokensByRelPath.get(entry.relPath) ?? 0;
		tokensByPath[entry.targetPath] = tokens;
		totalTokens += tokens;
	}
	const projectManifest = await readManifest$1(rootDir);
	const collisions = await collectCollisions(rootDir, packManifest.name, writeSet, projectManifest?.ledger ?? [], artifacts);
	return {
		manifest: packManifest,
		source,
		spec,
		writeSet,
		agentGrants: describeAgentGrants(agents, packManifest),
		collisions,
		checks,
		trustTier: tier,
		tierBasis: signature.verifiedBasis === void 0 ? basis : settleSignatureClause(basis, signature.verifiedBasis),
		policy,
		tokensByPath,
		totalTokens
	};
}
async function rollback(written, packRootAbs, rootDir) {
	for (const record of written.toReversed()) try {
		if (record.prior === null) await rm(record.targetAbs, { force: true });
		else await safeWriteFile(record.targetAbs, record.prior, {
			force: true,
			backup: false,
			skipIfUnchanged: false,
			boundaryDir: rootDir
		});
	} catch (cause) {
		console.error(`Pack install rollback could not restore ${record.targetAbs}: ${describeError(cause)}`);
	}
	await pruneEmptyDirs(written.filter((record) => record.prior === null).map((record) => dirname(record.targetAbs)), packRootAbs);
}
async function pruneEmptyDirs(dirs, packRootAbs) {
	const deepestFirst = [...new Set(dirs)].toSorted((a, b) => b.length - a.length);
	for (const start of deepestFirst) {
		let dir = start;
		while (dir === packRootAbs || dir.startsWith(`${packRootAbs}${sep}`)) {
			try {
				await rmdir(dir);
			} catch {
				break;
			}
			dir = dirname(dir);
		}
	}
}
function foreignClaims(manifest, plan, owner) {
	const targets = new Set(plan.writeSet.map((entry) => entry.targetPath));
	return manifest.ledger.filter((entry) => targets.has(entry.path) && !isOwnedByPack(entry, owner)).map((entry) => `${entry.path}: the ledger already assigns this path to ${entry.artifactId}`);
}
function decodeForWrite(bytes, packId, relPath) {
	const text = bytes.toString("utf8");
	if (Buffer.compare(Buffer.from(text, "utf8"), bytes) !== 0) throw new EngineError(`Pack "${packId}" ships ${relPath} as text but its bytes are not valid UTF-8, so installing it would change them. Nothing was installed; re-encode the file as UTF-8 and re-publish the pack.`, { code: "INTEGRITY_ERROR" });
	return text;
}
async function applyPackInstall(projectRoot, plan, manifest, opts = {}) {
	const rootDir = resolve(projectRoot);
	const packId = plan.manifest.name;
	const packRelPath = packLedgerRelPath(packId);
	const owner = packOwner(packId);
	const errors = [...plan.collisions, ...foreignClaims(manifest, plan, owner)];
	if (errors.length > 0) return {
		result: {
			installed: false,
			written: [],
			ledgerEntries: [],
			errors,
			receiptPath: null
		},
		manifest: structuredClone(manifest)
	};
	const receiptText = serializeReceipt(buildReceipt(plan, opts.now ?? /* @__PURE__ */ new Date(), opts.engineVersion ?? manifest.generatedBy));
	const receiptTarget = receiptRelPath(packId);
	const written = [];
	try {
		for (const entry of plan.writeSet) {
			const sourceAbs = underRoot(plan.source.packRoot, entry.relPath);
			const bytes = await readFile(sourceAbs);
			const actual = createHash("sha256").update(bytes).digest("hex");
			if (actual !== entry.contentHash) throw new EngineError(`Pack "${packId}" changed on disk after it was checked: ${entry.relPath} now hashes to ${actual.slice(0, 12)}…, not the verified ${entry.contentHash.slice(0, 12)}…. Nothing was installed; re-run the install to re-check the pack.`, { code: "INTEGRITY_ERROR" });
			const text = decodeForWrite(bytes, packId, entry.relPath);
			const targetAbs = underRoot(rootDir, entry.targetPath);
			const prior = await readIfExists(targetAbs);
			await safeWriteFile(targetAbs, text, {
				force: true,
				backup: false,
				boundaryDir: rootDir
			});
			written.push({
				targetAbs,
				prior
			});
		}
		const receiptAbs = underRoot(rootDir, receiptTarget);
		const priorReceipt = await readIfExists(receiptAbs);
		await safeWriteFile(receiptAbs, receiptText, {
			force: true,
			backup: false,
			skipIfUnchanged: false,
			boundaryDir: rootDir
		});
		written.push({
			targetAbs: receiptAbs,
			prior: priorReceipt
		});
	} catch (cause) {
		await rollback(written, underRoot(rootDir, packRelPath), rootDir);
		throw cause;
	}
	const ledgerEntries = [...plan.writeSet.map((entry) => ({
		path: entry.targetPath,
		adapter: owner,
		artifactId: packArtifactId(packId, entry.relPath),
		artifactType: "infra",
		contentHash: entry.contentHash
	})), {
		path: receiptTarget,
		adapter: owner,
		artifactId: packArtifactId(packId, RECEIPT_FILE),
		artifactType: "infra",
		contentHash: createHash("sha256").update(receiptText, "utf8").digest("hex")
	}];
	const ledger = [...manifest.ledger.filter((entry) => !isOwnedByPack(entry, owner)), ...ledgerEntries].map(cloneEntry).toSorted((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
	return {
		result: {
			installed: true,
			written: ledgerEntries.map((entry) => entry.path),
			ledgerEntries,
			errors: [],
			receiptPath: receiptTarget
		},
		manifest: {
			...structuredClone(manifest),
			ledger
		}
	};
}
function planPackRemoval(manifest, packId) {
	packLedgerRelPath(packId);
	const owner = packOwner(packId);
	return manifest.ledger.filter((entry) => isOwnedByPack(entry, owner)).map((entry) => ({
		entry: cloneEntry(entry),
		reason: "deselected"
	}));
}
//#endregion
//#region src/detect/stackSupport.ts
var stackSupport_exports = /* @__PURE__ */ __exportAll({
	FRAMEWORK_SUPPORT: () => FRAMEWORK_SUPPORT,
	LANGUAGE_SUPPORT: () => LANGUAGE_SUPPORT,
	STACK_GUIDANCE_INVENTORY: () => STACK_GUIDANCE_INVENTORY,
	classifyDetectedStacks: () => classifyDetectedStacks,
	classifyFramework: () => classifyFramework,
	classifyLanguage: () => classifyLanguage,
	classifyStacksAgainst: () => classifyStacksAgainst,
	deriveStackSupport: () => deriveStackSupport,
	suggestStackPacks: () => suggestStackPacks
});
const STACK_GUIDANCE_INVENTORY = /* @__PURE__ */ new Set();
const STACK_PACK_CATALOG = /* @__PURE__ */ new Map();
const full = (subject) => ({
	tier: "full",
	notes: `Dedicated ${subject} guidance ships with the corpus, on top of the always-on charter floor.`
});
const partial = (subject) => ({
	tier: "partial",
	notes: `No ${subject} idiom guidance yet; the always-on charter floor and file-scoped rules still apply.`
});
const UNMAPPED = {
	tier: "none",
	notes: `Unmapped stack: only the always-on charter floor applies. Add project rules for its idioms and set the verification gates by hand.`
};
const FRAMEWORK_SUBJECTS = {
	django: "Python",
	flask: "Python",
	fastapi: "Python",
	rails: "Ruby on Rails",
	laravel: "PHP and Laravel",
	axum: "Rust",
	actix: "Rust",
	next: "Next.js",
	react: "React",
	vue: "Vue",
	svelte: "Svelte",
	sveltekit: "SvelteKit",
	nuxt: "Nuxt",
	angular: "Angular",
	astro: "Astro",
	remix: "Remix",
	"solid-start": "SolidStart",
	"tanstack-start": "TanStack Start",
	qwik: "Qwik",
	express: "Express",
	fastify: "Fastify",
	hono: "Hono",
	nestjs: "NestJS",
	spring: "Spring",
	phoenix: "Phoenix"
};
const LANGUAGE_SUBJECTS = {
	typescript: "TypeScript and JavaScript",
	javascript: "TypeScript and JavaScript",
	python: "Python",
	go: "Go",
	rust: "Rust",
	ruby: "Ruby on Rails",
	php: "PHP and Laravel",
	csharp: ".NET",
	dart: "Flutter and Dart",
	kotlin: "Android and Kotlin",
	swift: "SwiftUI and Swift",
	java: "Java",
	elixir: "Elixir",
	scala: "Scala",
	zig: "Zig",
	ocaml: "OCaml",
	haskell: "Haskell",
	clojure: "Clojure",
	lua: "Lua"
};
function deriveTable(subjects, inventory) {
	const table = {};
	for (const [key, subject] of Object.entries(subjects)) table[key] = inventory.has(subject) ? full(subject) : partial(subject);
	return table;
}
function deriveStackSupport(inventory) {
	return {
		frameworks: deriveTable(FRAMEWORK_SUBJECTS, inventory),
		languages: deriveTable(LANGUAGE_SUBJECTS, inventory)
	};
}
const SHIPPED_SUPPORT = deriveStackSupport(STACK_GUIDANCE_INVENTORY);
const FRAMEWORK_SUPPORT = SHIPPED_SUPPORT.frameworks;
const LANGUAGE_SUPPORT = SHIPPED_SUPPORT.languages;
function classifyFramework(framework) {
	return FRAMEWORK_SUPPORT[framework] ?? UNMAPPED;
}
function classifyLanguage(language) {
	return LANGUAGE_SUPPORT[language] ?? UNMAPPED;
}
function classifyStacksAgainst(info, tables) {
	const out = [];
	const seen = /* @__PURE__ */ new Set();
	for (const framework of info.frameworks) {
		const support = tables.frameworks[framework] ?? UNMAPPED;
		if (support.tier === "full" || seen.has(framework)) continue;
		seen.add(framework);
		out.push({
			name: framework,
			kind: "framework",
			support
		});
	}
	for (const language of info.languages) {
		const support = tables.languages[language] ?? UNMAPPED;
		if (support.tier === "full" || seen.has(language)) continue;
		seen.add(language);
		out.push({
			name: language,
			kind: "language",
			support
		});
	}
	return out;
}
function classifyDetectedStacks(info) {
	return classifyStacksAgainst(info, SHIPPED_SUPPORT);
}
function subjectOf(stack) {
	return (stack.kind === "framework" ? FRAMEWORK_SUBJECTS : LANGUAGE_SUBJECTS)[stack.name];
}
function suggestStackPacks(info, catalog = STACK_PACK_CATALOG) {
	return classifyDetectedStacks(info).map((stack) => {
		const subject = subjectOf(stack);
		const packId = subject === void 0 ? void 0 : catalog.get(subject);
		const { name, kind } = stack;
		const tier = stack.support.tier;
		return packId === void 0 ? {
			name,
			kind,
			tier,
			action: stack.support.notes
		} : {
			name,
			kind,
			tier,
			action: `Install the ${packId} pack: stamity add ${packId}`,
			packId
		};
	});
}
//#endregion
//#region src/learnings/store.ts
var store_exports$1 = /* @__PURE__ */ __exportAll({
	DEFAULT_MAX_TOTAL_LEARNINGS_BYTES: () => DEFAULT_MAX_TOTAL_LEARNINGS_BYTES,
	formatLearningsIndex: () => formatLearningsIndex,
	loadValidatedLearnings: () => loadValidatedLearnings,
	persistLearning: () => persistLearning
});
const DEFAULT_MAX_TOTAL_LEARNINGS_BYTES = MAX_LEARNING_FILE_BYTES;
const READ_CONCURRENCY$1 = 8;
const INTEGRITY_FIELD = "integrity";
const REVIEW_BY_FIELD = "reviewBy";
function learningsDir(rootDir) {
	return join(rootDir, STATE_DIR, "learnings");
}
async function persistLearning(opts) {
	const caps = opts.caps ?? resolveLearningsCaps();
	const now = opts.now ?? /* @__PURE__ */ new Date();
	const dir = learningsDir(opts.rootDir);
	const gates = validateLearningContent(opts.fileName, opts.content, {
		maxFileBytes: caps.maxFileBytes,
		now
	});
	if (!gates.valid) return refused(gates.errors, false);
	const existing = await listLearningFileNames(dir);
	if (existing.includes(opts.fileName)) return refused([`Learning "${opts.fileName}" already exists in ${dir}. Learnings are append-only: retire that file or write this note under a different slug.`], false);
	if (existing.length >= caps.maxCount) return refused([`The learnings directory ${dir} holds ${existing.length} files, at the ${caps.maxCount} file cap. Retire or consolidate a learning before adding "${opts.fileName}".`], false);
	const sanitization = sanitizeLearningsContent(opts.content);
	if (sanitization.content.trim() === "") return refused([`Learning "${opts.fileName}" could not be neutralized — the sanitizer dropped it (patterns: ${sanitization.strippedPatternIds.join(", ") || "none reported"}). Rewrite the note without the flagged spans.`], true);
	let parsed;
	try {
		parsed = parseFrontmatter(sanitization.content, `Learning "${opts.fileName}"`);
	} catch (error) {
		return refused([messageOf$1(error)], sanitization.modified);
	}
	const stamped = composeFrontmatter({
		...parsed.frontmatter,
		[INTEGRITY_FIELD]: computeLearningIntegrity(parsed.body)
	}, parsed.body);
	const recheck = validateLearningContent(opts.fileName, stamped, {
		maxFileBytes: caps.maxFileBytes,
		now
	});
	if (!recheck.valid) return refused(recheck.errors.map((error) => `Stamped form — ${error}`), sanitization.modified);
	const path = join(dir, opts.fileName);
	await atomicWriteFile(path, stamped);
	return {
		written: true,
		path,
		errors: [],
		sanitized: sanitization.modified
	};
}
function refused(errors, sanitized) {
	return {
		written: false,
		errors,
		sanitized
	};
}
async function loadValidatedLearnings(opts) {
	const dir = learningsDir(opts.rootDir);
	const now = opts.now ?? /* @__PURE__ */ new Date();
	const budget = opts.maxTotalBytes ?? DEFAULT_MAX_TOTAL_LEARNINGS_BYTES;
	const candidates = await listCandidates(dir);
	const examined = await pLimit(READ_CONCURRENCY$1).map(candidates, (candidate) => examine(dir, candidate, now));
	const learnings = [];
	const skips = [];
	let totalBytes = 0;
	let exhausted = false;
	for (const result of examined) {
		if (!result.ok) {
			skips.push(result.skip);
			continue;
		}
		if (exhausted || totalBytes + result.bytes > budget) {
			exhausted = true;
			skips.push({
				fileName: result.learning.fileName,
				reason: "over-size",
				detail: `${result.bytes} bytes would pass the ${budget} byte session budget (${totalBytes} bytes already loaded).`
			});
			continue;
		}
		totalBytes += result.bytes;
		learnings.push(result.learning);
	}
	return {
		learnings,
		skips,
		totalBytes
	};
}
async function listCandidates(dir) {
	const names = await listLearningFileNames(dir);
	const stamped = await pLimit(READ_CONCURRENCY$1).map(names, async (fileName) => {
		try {
			const stats = await stat(join(dir, fileName));
			return {
				fileName,
				mtimeMs: stats.mtimeMs,
				size: stats.size
			};
		} catch {
			return {
				fileName,
				mtimeMs: 0,
				size: null
			};
		}
	});
	stamped.sort((a, b) => b.mtimeMs - a.mtimeMs || (a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0));
	return stamped;
}
async function examine(dir, candidate, now) {
	const { fileName } = candidate;
	const path = join(dir, fileName);
	if (candidate.size === null) return skip(fileName, "invalid-frontmatter", `${path} could not be read.`);
	if (candidate.size > 65536) return skip(fileName, "over-size", `${candidate.size} bytes, over the ${MAX_LEARNING_FILE_BYTES} byte per-file cap.`);
	let raw;
	try {
		raw = await readFile(path, "utf8");
	} catch (error) {
		return skip(fileName, "invalid-frontmatter", `${path} could not be read: ${messageOf$1(error)}`);
	}
	const blocked = scanNormalized(raw.replace(INVISIBLE_SMUGGLING_CHARS, ""), LEARNINGS_SCREEN_PATTERNS).filter((hit) => hit.severity === "block");
	if (blocked.length > 0) {
		const ids = [...new Set(blocked.map((hit) => hit.patternId))].toSorted();
		return skip(fileName, "injection-detected", `matches injection ${ids.length === 1 ? "pattern" : "patterns"} ${ids.join(", ")}.`);
	}
	const source = `Learning "${fileName}"`;
	let parsed;
	try {
		parsed = parseFrontmatter(raw, source);
	} catch (error) {
		return skip(fileName, "invalid-frontmatter", messageOf$1(error));
	}
	if (!parsed.hadFrontmatter) return skip(fileName, "invalid-frontmatter", `${source} has no \`---\` frontmatter block.`);
	const declared = frontmatterField(parsed, INTEGRITY_FIELD);
	if (declared === void 0) return skip(fileName, "integrity-mismatch", `no \`${INTEGRITY_FIELD}\` digest. Re-save the learning through the write path to stamp one.`);
	if (!verifyLearningIntegrity(declared, parsed.body)) return skip(fileName, "integrity-mismatch", `declared ${String(declared)}, computed ${computeLearningIntegrity(parsed.body)}. The body changed after it was stamped.`);
	const gates = validateLearningContent(fileName, raw, { now });
	if (!gates.valid) return skip(fileName, "invalid-frontmatter", gates.errors.join(" "));
	const expired = expiredReview(parsed, now);
	if (expired !== null) return skip(fileName, "expired-review", `\`${REVIEW_BY_FIELD}\` ${expired} has passed. Re-verify the learning and move the date, or retire it.`);
	return {
		ok: true,
		bytes: candidate.size,
		learning: {
			fileName,
			frontmatter: parsed.frontmatter,
			body: parsed.body,
			integrityOk: true
		}
	};
}
function skip(fileName, reason, detail) {
	return {
		ok: false,
		skip: {
			fileName,
			reason,
			detail
		}
	};
}
function expiredReview(parsed, now) {
	const reviewBy = frontmatterField(parsed, REVIEW_BY_FIELD);
	if (typeof reviewBy !== "string") return null;
	const deadline = Date.parse(`${reviewBy}T23:59:59.999Z`);
	return Number.isNaN(deadline) || deadline >= now.getTime() ? null : reviewBy;
}
function formatLearningsIndex(result) {
	const lines = [`Learnings: ${result.learnings.length} loaded, ${result.skips.length} skipped, ${result.totalBytes} bytes.`];
	const duplicates = duplicateIds(result.learnings);
	for (const learning of result.learnings) {
		const id = indexId(learning);
		const confidence = fieldText(learning.frontmatter, "confidence") ?? "unrated";
		const summary = fieldText(learning.frontmatter, "summary") ?? "(no summary)";
		const flag = duplicates.has(id) ? " [duplicate id]" : "";
		lines.push(`- [${confidence}] ${id} — ${summary} (${learning.fileName})${flag}`);
	}
	for (const entry of result.skips) lines.push(`- skipped ${entry.fileName}: ${entry.reason}`);
	return lines.join("\n");
}
function duplicateIds(learnings) {
	const seen = /* @__PURE__ */ new Set();
	const duplicates = /* @__PURE__ */ new Set();
	for (const learning of learnings) {
		const id = indexId(learning);
		if (seen.has(id)) duplicates.add(id);
		else seen.add(id);
	}
	return duplicates;
}
function indexId(learning) {
	return fieldText(learning.frontmatter, "id") ?? learning.fileName.replace(/\.md$/, "");
}
function fieldText(frontmatter, field) {
	const value = Object.hasOwn(frontmatter, field) ? frontmatter[field] : void 0;
	if (typeof value === "string") {
		const collapsed = value.replace(/\s+/g, " ").trim();
		return collapsed === "" ? void 0 : collapsed;
	}
	if (typeof value === "number" || typeof value === "boolean") return String(value);
}
async function listLearningFileNames(dir) {
	try {
		return (await readdir(dir, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => entry.name);
	} catch (error) {
		if (error.code === "ENOENT") return [];
		throw new EngineError(`Cannot read the learnings directory ${dir}: ${messageOf$1(error)}`, {
			code: "FS_ERROR",
			cause: error
		});
	}
}
function messageOf$1(error) {
	return error instanceof Error ? error.message : String(error);
}
//#endregion
//#region src/mcp/env.ts
var env_exports = /* @__PURE__ */ __exportAll({
	ENV_MCP_FILE: () => ENV_MCP_FILE,
	REQUIRED_GITIGNORE_ENTRIES: () => REQUIRED_GITIGNORE_ENTRIES,
	collectRequiredEnvVars: () => collectRequiredEnvVars,
	ensureEnvMcp: () => ensureEnvMcp,
	ensureGitignoreEntry: () => ensureGitignoreEntry,
	generateEnvMcpContent: () => generateEnvMcpContent,
	getSourceEnvMcpCommand: () => getSourceEnvMcpCommand,
	getSourceEnvMcpDisclaimer: () => getSourceEnvMcpDisclaimer,
	hardenEnvMcpMode: () => hardenEnvMcpMode,
	parseEnvFile: () => parseEnvFile,
	reportEnvValues: () => reportEnvValues
});
const ENV_MCP_FILE = ".env.mcp";
const GITIGNORE_FILE = ".gitignore";
const SECRET_FILE_MODE$1 = 384;
const LOOSE_MODE_BITS = 63;
const FILE_HEADER = ["# MCP server credentials — one value per name below.", "# Gitignored by design: never commit this file, and never inline a value into a client config."];
const APPEND_HEADER = "# --- appended: variables the current server selection requires ---";
const SOURCE_POSIX = "set -a && source .env.mcp && set +a";
const SOURCE_POWERSHELL = "Get-Content .env.mcp | ForEach-Object { if ($_ -match '^\\s*([^#][^=]*)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim().Trim('\"'), 'Process') } }";
const SHELL_BLOCKS = {
	posix: ["macOS/Linux (bash/zsh):", `  ${SOURCE_POSIX}`],
	"git-bash": ["Windows (Git Bash) — same command as macOS/Linux:", `  ${SOURCE_POSIX}`],
	powershell: ["Windows (PowerShell):", `  ${SOURCE_POWERSHELL}`]
};
const SHELL_ORDER = [
	"posix",
	"git-bash",
	"powershell"
];
const CMD_EXE_NOTE = "cmd.exe has no one-line equivalent — use PowerShell or Git Bash.";
const DISCLAIMER_LEAD = "Load .env.mcp into your environment before starting the tool that runs the MCP servers.";
const GUI_LAUNCH_NOTE = [
	"An app started from Finder, the Dock, Spotlight, or the Start menu inherits the desktop",
	"session environment, not the shell you sourced in. Either start the tool from that same",
	"terminal, or persist the values for the session: `launchctl setenv NAME \"$NAME\"` on macOS,",
	"`setx NAME value` on Windows."
].join("\n");
const CLI_TOOL_NOTE = "spawns MCP servers as child processes, so they inherit the environment of the shell you start it in — source this file there.";
const EDITOR_TOOL_NOTE = "passes its own environment to each MCP server, so start the editor from the shell you sourced in (see the launch note above).";
const TOOL_ENV_NOTES = {
	claude: CLI_TOOL_NOTE,
	codex: CLI_TOOL_NOTE,
	cursor: EDITOR_TOOL_NOTE,
	copilot: EDITOR_TOOL_NOTE
};
const REQUIRED_GITIGNORE_ENTRIES = [ENV_MCP_FILE];
const DOMINATING_PATTERNS = { [ENV_MCP_FILE]: [
	".env.*",
	".env*",
	"*.mcp"
] };
function collectRequiredEnvVars(serverIds, packServers = []) {
	const byName = /* @__PURE__ */ new Map();
	for (const id of serverIds) {
		const requirements = resolveServerMeta(id, packServers)?.requiresEnv;
		if (requirements === void 0) continue;
		for (const requirement of requirements) {
			const known = byName.get(requirement.name);
			if (known === void 0) byName.set(requirement.name, {
				comment: requirement.comment,
				url: requirement.url,
				servers: [id]
			});
			else if (!known.servers.includes(id)) known.servers.push(id);
		}
	}
	return [...byName].map(([name, { comment, url, servers }]) => ({
		name,
		server: servers.join(", "),
		comment,
		url
	}));
}
function getSourceEnvMcpCommand(shell = "auto") {
	return resolveShell(shell) === "powershell" ? SOURCE_POWERSHELL : SOURCE_POSIX;
}
function getSourceEnvMcpDisclaimer(shell, tools) {
	const requested = tools.length === 0 ? [] : TOOLS.filter((tool) => tools.includes(tool));
	const blocks = [
		DISCLAIMER_LEAD,
		[...shellLines(shell), CMD_EXE_NOTE].join("\n"),
		GUI_LAUNCH_NOTE
	];
	if (requested.length > 0) blocks.push(requested.map((tool) => `${tool}: ${TOOL_ENV_NOTES[tool]}`).join("\n"));
	return blocks.join("\n\n");
}
function shellLines(shell) {
	const lead = shell === "all" ? void 0 : resolveShell(shell);
	return (lead === void 0 ? SHELL_ORDER : [lead, ...SHELL_ORDER.filter((name) => name !== lead)]).flatMap((name) => SHELL_BLOCKS[name]);
}
function resolveShell(shell) {
	if (shell !== "auto" && shell !== "all") return shell;
	if (process.platform !== "win32") return "posix";
	return (process.env["PSModulePath"] ?? "") === "" ? "git-bash" : "powershell";
}
function generateEnvMcpContent(vars, existing = {}) {
	if (vars.length === 0) return "";
	const entries = vars.map((envVar) => renderEntry(envVar, existing[envVar.name] ?? "", "\n"));
	return `${FILE_HEADER.join("\n")}\n\n${entries.join("\n\n")}\n`;
}
function renderEntry(envVar, value, eol) {
	return `${commentLine(envVar)}${eol}${envVar.name}=${renderValue(value)}`;
}
function commentLine(envVar) {
	const parts = [sanitize(envVar.comment)];
	const servers = sanitize(envVar.server);
	if (servers !== "") parts.push(`(required by ${servers})`);
	const url = sanitize(envVar.url);
	if (url !== "") parts.push(`— ${url}`);
	return `# ${parts.filter((part) => part !== "").join(" ")}`;
}
function sanitize(value) {
	return value.replace(/[\r\n=]/g, " ").trim();
}
function renderValue(value) {
	const flat = value.replace(/[\r\n]+/g, " ");
	if (/^[A-Za-z0-9_@%+,.:/=-]*$/.test(flat)) return flat;
	return `"${flat.replace(/[\\"$`]/g, (char) => `\\${char}`)}"`;
}
function parseEnvFile(content) {
	const result = {};
	for (const rawLine of content.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (line === "" || line.startsWith("#")) continue;
		const assignment = line.startsWith("export ") ? line.slice(7).trim() : line;
		const separator = assignment.indexOf("=");
		if (separator < 1) continue;
		result[assignment.slice(0, separator).trim()] = unquote(assignment.slice(separator + 1).trim());
	}
	return result;
}
function unquote(raw) {
	if (raw.length < 2) return raw;
	if (raw.startsWith("\"") && raw.endsWith("\"")) return raw.slice(1, -1).replace(/\\([\\"$`])/g, "$1");
	if (raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1);
	return raw;
}
function reportEnvValues(values) {
	return Object.entries(values).map(([name, value]) => {
		const set = value.trim() !== "";
		return {
			name,
			set,
			masked: set ? maskValue(value) : "",
			secretPatternIds: scanValueForSecrets(name, value).map((finding) => finding.patternId)
		};
	});
}
async function refuseRepublish(path, content, opts) {
	let entry;
	try {
		entry = await lstat(path);
	} catch (error) {
		if (error.code === "ENOENT") return;
		throw error;
	}
	if (entry.isSymbolicLink()) throw refuseRepublishOfLink(path);
	if (!entry.isFile()) return;
	if (isSharedRegularFile(entry)) throw refuseRepublishOfSharedFile(path);
	if (!opts.refuseInjectionPatterns) return;
	const hits = blockingDenyHits(content);
	if (hits.length === 0) return;
	const findings = hits.map((hit) => `${hit.patternId} at offset ${hit.index} (${JSON.stringify(hit.snippet)})`).join("; ");
	throw new EngineError(`Refusing to write ${path}: ${hits.length} prompt-injection pattern(s) found in the content this write would preserve: ${findings}. Remove or rewrite the flagged text, then re-run.`, { code: "INTEGRITY_ERROR" });
}
function blockingDenyHits(content) {
	return [...scanNormalized(content), ...scanForDeniedPatterns(content, INJECTION_PATTERNS).filter((hit) => NO_HONEST_SHAPE_INJECTION_ROWS.has(hit.patternId))].filter((hit) => hit.severity === "block");
}
function refuseRepublishOfLink(path) {
	return new EngineError(`Refusing to write ${path}: it is a symbolic link, so the bytes this write would keep are not this file's — they are whatever the link points at, including a file outside this tree that was never yours to publish. Writing them back would land those contents at a tracked path as a regular file, where the next commit picks them up. Nothing was written. Replace the link with a regular file, or delete it and re-run to regenerate the file.`, { code: "FS_ERROR" });
}
function refuseRepublishOfSharedFile(path) {
	return new EngineError(`Refusing to write ${path}: it is a hard link — this file shares its contents with another name, which this tree cannot see and which may sit outside it, so the bytes this write would keep are not this file's alone. Writing them back publishes them as a fresh independent file, so this name stops being the same file as the other one and starts being a copy of it. Nothing was written. Replace it with a regular file — copy the contents to a new file and move that over this name — and re-run.`, { code: "FS_ERROR" });
}
async function hardenEnvMcpMode(path) {
	if (process.platform === "win32") return false;
	let entry;
	try {
		entry = await lstat(path);
	} catch (error) {
		if (error.code === "ENOENT") return false;
		throw error;
	}
	if (!entry.isFile() || (entry.mode & LOOSE_MODE_BITS) === 0) return false;
	await chmod(path, SECRET_FILE_MODE$1);
	return true;
}
async function ensureGitignoreEntry(rootDir) {
	const path = join(rootDir, GITIGNORE_FILE);
	const content = await readTextOrNull(path) ?? "";
	const lines = content.split(/\r?\n/).map((line) => line.trim());
	const missing = REQUIRED_GITIGNORE_ENTRIES.filter((entry) => !isCovered(entry, lines));
	if (missing.length === 0) return;
	await refuseRepublish(path, content, { refuseInjectionPatterns: true });
	const eol = detectEol(content);
	await atomicWriteFile(path, `${content}${content === "" || content.endsWith("\n") ? "" : eol}${missing.join(eol)}${eol}`, { boundaryDir: rootDir });
}
function isCovered(entry, lines) {
	const dominating = DOMINATING_PATTERNS[entry] ?? [];
	return lines.some((line) => line === entry || line === `!${entry}` || dominating.includes(line));
}
async function ensureEnvMcp(rootDir, serverIds, packServers = []) {
	const result = await writeEnvMcp(rootDir, serverIds, packServers);
	await hardenEnvMcpMode(result.path);
	return result;
}
async function writeEnvMcp(rootDir, serverIds, packServers) {
	const path = join(rootDir, ENV_MCP_FILE);
	const vars = collectRequiredEnvVars(serverIds, packServers);
	const writeOpts = {
		mode: SECRET_FILE_MODE$1,
		boundaryDir: rootDir
	};
	const existingRaw = await readTextOrNull(path);
	const existing = existingRaw === null ? {} : parseEnvFile(existingRaw);
	const preservedVars = Object.keys(existing);
	const missing = vars.filter((envVar) => !Object.hasOwn(existing, envVar.name));
	const addedVars = missing.map((envVar) => envVar.name);
	if (existingRaw === null || existingRaw.trim() === "") {
		if (vars.length === 0) return {
			path,
			created: false,
			addedVars: [],
			preservedVars
		};
		await atomicWriteFile(path, generateEnvMcpContent(vars), writeOpts);
		return {
			path,
			created: existingRaw === null,
			addedVars,
			preservedVars
		};
	}
	if (missing.length === 0) return {
		path,
		created: false,
		addedVars: [],
		preservedVars
	};
	await refuseRepublish(path, existingRaw, { refuseInjectionPatterns: false });
	await atomicWriteFile(path, appendVars(existingRaw, missing), writeOpts);
	return {
		path,
		created: false,
		addedVars,
		preservedVars
	};
}
function appendVars(existingRaw, missing) {
	const eol = detectEol(existingRaw);
	const body = existingRaw.replace(/[\r\n]+$/, "");
	const entries = missing.map((envVar) => renderEntry(envVar, "", eol));
	return `${body}${eol}${eol}${APPEND_HEADER}${eol}${entries.join(`${eol}${eol}`)}${eol}`;
}
function detectEol(content) {
	return content.includes("\r\n") ? "\r\n" : "\n";
}
async function readTextOrNull(path) {
	try {
		return await readFile(path, "utf8");
	} catch (error) {
		if (error.code === "ENOENT") return null;
		throw error;
	}
}
//#endregion
//#region src/workspace/model.ts
var model_exports = /* @__PURE__ */ __exportAll({
	WORKSPACE_MANIFEST_FILE: () => WORKSPACE_MANIFEST_FILE,
	WORKSPACE_MANIFEST_VERSION: () => WORKSPACE_MANIFEST_VERSION
});
const WORKSPACE_MANIFEST_FILE = "workspace.json";
const WORKSPACE_MANIFEST_VERSION = "1.0.0";
//#endregion
//#region src/workspace/manifest.ts
var manifest_exports = /* @__PURE__ */ __exportAll({
	WORKSPACE_MANIFEST_MIGRATIONS: () => WORKSPACE_MANIFEST_MIGRATIONS,
	collectWorkspaceManifestErrors: () => collectWorkspaceManifestErrors,
	createWorkspaceManifest: () => createWorkspaceManifest,
	isUnsafeRepoPath: () => isUnsafeRepoPath,
	migrateWorkspaceManifest: () => migrateWorkspaceManifest,
	normalizeRepoPathKey: () => normalizeRepoPathKey,
	readWorkspaceManifest: () => readWorkspaceManifest,
	writeWorkspaceManifest: () => writeWorkspaceManifest
});
const REPO_PATH_DEFECT_MESSAGE = {
	absolute: "is an absolute path — repo paths are relative to the workspace root",
	traversal: "climbs out of the workspace with a `..` segment",
	"nul-byte": "contains a NUL byte",
	empty: "is empty — it must name a directory under the workspace root"
};
const WINDOWS_ABSOLUTE_PATTERN = /^(?:[A-Za-z]:|\\\\)/;
function pathSegments$1(repoPath) {
	return repoPath.replaceAll("\\", "/").split("/").filter((segment) => segment !== "" && segment !== ".");
}
function classifyRepoPath(repoPath) {
	if (repoPath.includes("\0")) return "nul-byte";
	if (repoPath.startsWith("/") || repoPath.startsWith("\\")) return "absolute";
	if (WINDOWS_ABSOLUTE_PATTERN.test(repoPath)) return "absolute";
	const segments = pathSegments$1(repoPath);
	if (segments.includes("..")) return "traversal";
	if (segments.length === 0) return "empty";
	return null;
}
function isUnsafeRepoPath(repoPath) {
	return classifyRepoPath(repoPath) !== null;
}
function normalizeRepoPathKey(repoPath) {
	return pathSegments$1(repoPath).join("/");
}
function describeRoot(value) {
	if (value === null) return "null";
	if (Array.isArray(value)) return "an array";
	return typeof value;
}
function isStringArray(value) {
	return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
function duplicates(names) {
	const seen = /* @__PURE__ */ new Set();
	const repeated = /* @__PURE__ */ new Set();
	for (const name of names) {
		if (seen.has(name)) repeated.add(name);
		seen.add(name);
	}
	return [...repeated];
}
function collectToolListErrors(value, path, errors) {
	if (!isStringArray(value)) {
		errors.push(`\`${path}\` must be an array of strings`);
		return;
	}
	for (const tool of value) {
		if (VALID_TOOLS.has(tool)) continue;
		errors.push(`\`${path}\` names unknown tool ${JSON.stringify(tool)} (known: ${TOOLS.join(", ")})`);
	}
}
function collectItemMapErrors(value, path, errors) {
	if (value === void 0) return;
	if (!isPlainObject$2(value)) {
		errors.push(`\`${path}\` must be an object keyed by content class`);
		return;
	}
	for (const [key, ids] of Object.entries(value)) {
		if (!CONTENT_CLASSES.includes(key)) {
			errors.push(`\`${path}.${key}\` is not a content class (known: ${CONTENT_CLASSES.join(", ")})`);
			continue;
		}
		if (!isStringArray(ids)) errors.push(`\`${path}.${key}\` must be an array of strings`);
	}
}
function collectDefaultsErrors(value, errors) {
	if (!isPlainObject$2(value)) {
		errors.push("`defaults` must be an object");
		return;
	}
	collectToolListErrors(value.tools, "defaults.tools", errors);
	if (value.selection !== void 0) {
		if (!isPlainObject$2(value.selection) || !isPlainObject$2(value.selection.items)) errors.push("`defaults.selection` must be an object with an `items` object");
		else collectItemMapErrors(value.selection.items, "defaults.selection.items", errors);
	}
	if (value.maturityTier !== void 0 && (typeof value.maturityTier !== "string" || !VALID_MATURITY_TIERS.has(value.maturityTier))) errors.push(`\`defaults.maturityTier\` must be one of ${MATURITY_TIERS.join(" | ")}`);
	if (value.mcp !== void 0) {
		if (!isPlainObject$2(value.mcp)) errors.push("`defaults.mcp` must be an object");
		else {
			if (!isStringArray(value.mcp.servers)) errors.push("`defaults.mcp.servers` must be an array of strings");
			if (value.mcp.protocolVersion !== void 0 && typeof value.mcp.protocolVersion !== "string") errors.push("`defaults.mcp.protocolVersion` must be a string");
		}
	}
}
function collectGroupsErrors(value, errors) {
	if (value === void 0) return;
	if (!Array.isArray(value)) {
		errors.push("`groups` must be an array of group deltas");
		return;
	}
	const names = [];
	for (const [index, delta] of value.entries()) {
		if (!isPlainObject$2(delta)) {
			errors.push(`\`groups[${index}]\` must be an object`);
			continue;
		}
		if (typeof delta.name !== "string" || delta.name === "") errors.push(`\`groups[${index}].name\` must be a non-empty string`);
		else names.push(delta.name);
		if (delta.toolOverrides !== void 0) collectToolListErrors(delta.toolOverrides, `groups[${index}].toolOverrides`, errors);
		collectItemMapErrors(delta.addItems, `groups[${index}].addItems`, errors);
		collectItemMapErrors(delta.removeItems, `groups[${index}].removeItems`, errors);
	}
	for (const name of duplicates(names)) errors.push(`\`groups[]\` defines ${JSON.stringify(name)} more than once — a group name is the key members reference, so merge two deltas into one`);
}
function collectRepoEntryErrors(entry, index, errors) {
	if (!isPlainObject$2(entry)) {
		errors.push(`\`repos[${index}]\` must be an object`);
		return null;
	}
	if (entry.groups !== void 0) {
		if (!isStringArray(entry.groups)) errors.push(`\`repos[${index}].groups\` must be an array of strings`);
		else for (const name of duplicates(entry.groups)) errors.push(`\`repos[${index}].groups\` names ${JSON.stringify(name)} twice`);
	}
	if (entry.overrides !== void 0) {
		if (!isPlainObject$2(entry.overrides)) errors.push(`\`repos[${index}].overrides\` must be an object`);
		else {
			if (entry.overrides.tools !== void 0) collectToolListErrors(entry.overrides.tools, `repos[${index}].overrides.tools`, errors);
			collectItemMapErrors(entry.overrides.addItems, `repos[${index}].overrides.addItems`, errors);
			collectItemMapErrors(entry.overrides.removeItems, `repos[${index}].overrides.removeItems`, errors);
		}
	}
	if (typeof entry.path !== "string") {
		errors.push(`\`repos[${index}].path\` must be a string`);
		return null;
	}
	const defect = classifyRepoPath(entry.path);
	if (defect !== null) {
		errors.push(`\`repos[${index}].path\` ${JSON.stringify(entry.path)} ${REPO_PATH_DEFECT_MESSAGE[defect]}`);
		return null;
	}
	return entry.path;
}
function collectReposErrors(value, errors) {
	if (!Array.isArray(value)) {
		errors.push("`repos` must be an array");
		return;
	}
	const declaredBy = /* @__PURE__ */ new Map();
	for (const [index, entry] of value.entries()) {
		const path = collectRepoEntryErrors(entry, index, errors);
		if (path === null) continue;
		const key = normalizeRepoPathKey(path);
		const prior = declaredBy.get(key);
		if (prior === void 0) {
			declaredBy.set(key, path);
			continue;
		}
		errors.push(`\`repos[]\` registers ${JSON.stringify(prior)} and ${JSON.stringify(path)}, which both name ${JSON.stringify(key)} — two entries syncing one directory race every write, so drop one`);
	}
}
function collectWorkspaceManifestErrors(data) {
	if (!isPlainObject$2(data)) return [`the manifest root must be a JSON object (got ${describeRoot(data)})`];
	const errors = [];
	if (typeof data.version !== "string" || semver.valid(data.version) === null) errors.push("`version` must be a semantic version string (e.g. \"1.0.0\")");
	collectDefaultsErrors(data.defaults, errors);
	collectGroupsErrors(data.groups, errors);
	collectReposErrors(data.repos, errors);
	if (data.lockedContent !== void 0 && !isStringArray(data.lockedContent)) errors.push("`lockedContent` must be an array of strings");
	return errors;
}
const WORKSPACE_MANIFEST_MIGRATIONS = [];
function migrateWorkspaceManifest(raw) {
	let current = structuredClone(raw);
	const visited = /* @__PURE__ */ new Set();
	for (;;) {
		const version = typeof current.version === "string" ? current.version : "";
		if (visited.has(version)) return current;
		visited.add(version);
		const step = WORKSPACE_MANIFEST_MIGRATIONS.find((entry) => entry.fromVersion === version);
		if (step === void 0) return current;
		current = step.migrate(current);
	}
}
function workspaceManifestPath(rootDir) {
	return join(rootDir, WORKSPACE_MANIFEST_FILE);
}
function assertReadableGeneration(document, path) {
	const declared = document.version;
	if (typeof declared !== "string" || semver.valid(declared) === null) return;
	const major = semver.major(declared);
	if (major <= semver.major("1.0.0")) return;
	throw new EngineError(`The workspace manifest at ${path} declares schema version ${declared}, newer than the ${WORKSPACE_MANIFEST_VERSION} this build reads. Upgrade to a release that understands schema ${major}.x, then re-run.`, { code: "CONFIG_ERROR" });
}
function readFailure(cause, path) {
	const errno = cause?.code;
	return new EngineError(`Cannot read the workspace manifest at ${path}${typeof errno === "string" ? ` (${errno})` : ""}. Confirm it is a readable file, then re-run.`, {
		code: "FS_ERROR",
		cause
	});
}
async function readWorkspaceManifest(rootDir) {
	const path = workspaceManifestPath(rootDir);
	let raw;
	try {
		raw = await readFile(path, "utf8");
	} catch (err) {
		if (err?.code === "ENOENT") return null;
		throw readFailure(err, path);
	}
	const document = parseJsonStrict(raw, path);
	assertReadableGeneration(document, path);
	const migrated = migrateWorkspaceManifest(document);
	const errors = collectWorkspaceManifestErrors(migrated);
	if (errors.length > 0) throw new EngineError(`Invalid workspace manifest in ${path}: ${errors.join("; ")}. Fix the field(s) named above and re-run.`, { code: "VALIDATION_ERROR" });
	return migrated;
}
async function writeWorkspaceManifest(rootDir, manifest) {
	const path = workspaceManifestPath(rootDir);
	const errors = collectWorkspaceManifestErrors(manifest);
	if (errors.length > 0) throw new EngineError(`Refusing to write an invalid workspace manifest to ${path}: ${errors.join("; ")}.`, { code: "VALIDATION_ERROR" });
	await atomicWriteFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}
function createWorkspaceManifest(defaults, repos) {
	return structuredClone({
		version: WORKSPACE_MANIFEST_VERSION,
		defaults,
		repos: [...repos]
	});
}
//#endregion
//#region src/workspace/detect.ts
var detect_exports = /* @__PURE__ */ __exportAll({
	DEFAULT_MAX_DEPTH: () => 4,
	detectSubRepos: () => detectSubRepos,
	detectWorkspaceContext: () => detectWorkspaceContext,
	isWorkspaceRoot: () => isWorkspaceRoot,
	shouldSuggestWorkspace: () => shouldSuggestWorkspace
});
const MAX_PARENT_WALK = 10;
const MIN_REPOS_TO_SUGGEST = 2;
const SKIPPED_DIR = "node_modules";
async function detectSubRepos(rootDir, opts) {
	const maxDepth = normalizeDepth(opts?.maxDepth);
	const found = [];
	const visit = async (dir, prefix, depth) => {
		await mapBounded(await readDirEntries(dir), async (entry) => {
			if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === SKIPPED_DIR) return;
			const child = join(dir, entry.name);
			const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
			const [hasGit, hasManifest] = await Promise.all([pathExists$1(join(child, ".git")), fileExists(join(child, STATE_DIR, MANIFEST_FILE))]);
			if (hasGit || hasManifest) {
				found.push({
					path,
					name: entry.name,
					hasGit,
					hasManifest
				});
				return;
			}
			if (depth < maxDepth) await visit(child, path, depth + 1);
		});
	};
	await visit(resolve(rootDir), "", 1);
	return found.toSorted((a, b) => compare$2(a.path, b.path));
}
async function detectWorkspaceContext(dir) {
	const start = resolve(dir);
	const candidates = ancestorChain(start).map((root) => ({
		root,
		manifestPath: join(root, WORKSPACE_MANIFEST_FILE)
	}));
	const present = await Promise.all(candidates.map((candidate) => fileExists(candidate.manifestPath)));
	const nearest = candidates.find((_candidate, index) => present[index] === true);
	if (nearest === void 0) return {
		role: "standalone",
		workspaceRoot: null,
		manifestPath: null
	};
	return {
		role: nearest.root === start ? "workspace-root" : "workspace-member",
		workspaceRoot: nearest.root,
		manifestPath: nearest.manifestPath
	};
}
function ancestorChain(dir) {
	const chain = [dir];
	let current = dir;
	for (let step = 0; step < MAX_PARENT_WALK; step++) {
		const parent = dirname(current);
		if (parent === current) break;
		chain.push(parent);
		current = parent;
	}
	return chain;
}
async function shouldSuggestWorkspace(dir) {
	if (await isWorkspaceRoot(dir)) return false;
	return (await detectSubRepos(dir)).length >= MIN_REPOS_TO_SUGGEST;
}
async function isWorkspaceRoot(dir) {
	return fileExists(join(resolve(dir), WORKSPACE_MANIFEST_FILE));
}
function normalizeDepth(value) {
	if (value === void 0 || !Number.isFinite(value)) return 4;
	return Math.max(1, Math.floor(value));
}
const EXHAUSTED = /* @__PURE__ */ new Set(["EMFILE", "ENFILE"]);
async function probe$1(read, fallback) {
	try {
		return await read();
	} catch (error) {
		const code = error.code;
		if (typeof code === "string" && !EXHAUSTED.has(code)) return fallback;
		throw error;
	}
}
const SCAN_CONCURRENCY = 16;
async function mapBounded(items, run) {
	let next = 0;
	const worker = async () => {
		for (let index = next; index < items.length; index = next) {
			next += 1;
			const item = items[index];
			if (item === void 0) continue;
			await run(item);
		}
	};
	await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, items.length) }, () => worker()));
}
async function pathExists$1(path) {
	return probe$1(async () => {
		await stat(path);
		return true;
	}, false);
}
async function fileExists(path) {
	return probe$1(async () => (await stat(path)).isFile(), false);
}
async function readDirEntries(path) {
	return probe$1(() => readdir(path, { withFileTypes: true }), []);
}
function compare$2(a, b) {
	return a < b ? -1 : a > b ? 1 : 0;
}
//#endregion
//#region src/workspace/git.ts
var git_exports$1 = /* @__PURE__ */ __exportAll({
	detectPlatformFromRemote: () => detectPlatformFromRemote,
	detectRepoGitIdentity: () => detectRepoGitIdentity,
	parseGitDefaultBranch: () => parseGitDefaultBranch,
	parseGitRemote: () => parseGitRemote
});
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const SCHEME_REMOTE = /^[a-z][a-z0-9+.-]*:\/\/(?:[^/@]*@)?([^/:]+)(?::\d+)?\/(.*)$/i;
const SCP_REMOTE = /^(?:[^/@]+@)?([^/:]+):(.+)$/;
const BARE_REMOTE = /^([a-z0-9][a-z0-9.-]*\.[a-z]{2,})(?:\/(.*))?$/i;
const SCP_PORT_PREFIX = /^\d+\/(.+)$/;
const GIT_PROBE_TIMEOUT_MS = 5e3;
const REF_FORBIDDEN = [
	"~",
	"^",
	":",
	"?",
	"*",
	"[",
	"\\",
	"..",
	"@{"
];
function parseGitRemote(url) {
	const location = splitRemote(url);
	if (location === null) return null;
	const segments = pathSegments(location.path);
	if (segments.length < 2) return null;
	const identity = splitNamespace(platformForHost(location.host), segments);
	if (identity.owner === "" || identity.repo === "") return null;
	return {
		host: location.host,
		...identity
	};
}
function parseGitDefaultBranch(symbolicRefOutput) {
	const line = symbolicRefOutput.split(/\r?\n/, 1)[0]?.trim() ?? "";
	if (line === "") return null;
	const arrowAt = line.lastIndexOf("->");
	const branch = stripRefPrefix((arrowAt === -1 ? line : line.slice(arrowAt + 2)).trim());
	return isBranchName(branch) ? branch : null;
}
function detectPlatformFromRemote(remoteUrl) {
	const location = splitRemote(remoteUrl);
	return location === null ? null : platformForHost(location.host);
}
function detectRepoGitIdentity(cwd, runner = execGit) {
	const remoteUrl = probe(runner, [
		"remote",
		"get-url",
		"origin"
	], cwd);
	const headRef = probe(runner, ["symbolic-ref", "refs/remotes/origin/HEAD"], cwd);
	return {
		remoteUrl,
		defaultBranch: headRef === null ? null : parseGitDefaultBranch(headRef),
		platform: remoteUrl === null ? null : detectPlatformFromRemote(remoteUrl)
	};
}
const execGit = (args, cwd) => execFileSync("git", args, {
	cwd,
	encoding: "utf8",
	stdio: [
		"ignore",
		"pipe",
		"ignore"
	],
	timeout: GIT_PROBE_TIMEOUT_MS
});
function probe(runner, args, cwd) {
	try {
		const output = runner(args, cwd).trim();
		return output === "" ? null : output;
	} catch {
		return null;
	}
}
function splitRemote(url) {
	const trimmed = url.trim();
	if (HAS_SCHEME.test(trimmed)) {
		const scheme = SCHEME_REMOTE.exec(trimmed);
		if (scheme === null) return null;
		const [, host = "", path = ""] = scheme;
		return {
			host: host.toLowerCase(),
			path
		};
	}
	const scp = SCP_REMOTE.exec(trimmed);
	if (scp !== null) {
		const [, host = "", path = ""] = scp;
		return {
			host: host.toLowerCase(),
			path: SCP_PORT_PREFIX.exec(path)?.[1] ?? path
		};
	}
	const bare = BARE_REMOTE.exec(trimmed);
	if (bare !== null) {
		const [, host = "", path = ""] = bare;
		return {
			host: host.toLowerCase(),
			path
		};
	}
	return null;
}
function pathSegments(path) {
	const segments = path.replace(/[?#].*$/, "").split("/").filter((segment) => segment !== "");
	const last = segments.at(-1);
	if (last !== void 0) segments[segments.length - 1] = stripGitSuffix(last);
	return segments;
}
function stripGitSuffix(segment) {
	return segment.replace(/\.git$/i, "");
}
function splitNamespace(platform, segments) {
	const last = segments.length - 1;
	const repo = segments[last] ?? "";
	if (platform === "github") return {
		owner: segments[0] ?? "",
		repo: stripGitSuffix(segments[1] ?? "")
	};
	if (platform === "azure-devops") {
		const gitAt = segments.indexOf("_git");
		if (gitAt >= 1 && gitAt === last - 1) return {
			owner: segments.slice(0, gitAt).join("/"),
			repo
		};
		if (segments[0] === "v3" && segments.length >= 4) return {
			owner: segments.slice(1, last).join("/"),
			repo
		};
	}
	return {
		owner: segments.slice(0, last).join("/"),
		repo
	};
}
function underDomain(host, domain) {
	return host === domain || host.endsWith(`.${domain}`);
}
function vendorLabel(host, vendor) {
	return host.startsWith(`${vendor}.`) || host.includes(`.${vendor}.`);
}
function platformForHost(host) {
	if (underDomain(host, "dev.azure.com") || underDomain(host, "visualstudio.com")) return "azure-devops";
	if (vendorLabel(host, "gitlab")) return "gitlab";
	if (vendorLabel(host, "github")) return "github";
	return null;
}
function stripRefPrefix(ref) {
	const remote = /^refs\/remotes\/[^/]+\/(.+)$/.exec(ref);
	if (remote !== null) return remote[1] ?? ref;
	const head = /^refs\/heads\/(.+)$/.exec(ref);
	if (head !== null) return head[1] ?? ref;
	const slash = ref.indexOf("/");
	return slash === -1 ? ref : ref.slice(slash + 1);
}
function isBranchName(value) {
	if (value === "" || value === "HEAD") return false;
	if (value.startsWith("-") || value.startsWith("/") || value.endsWith("/")) return false;
	if (value.endsWith(".lock") || /\s/.test(value)) return false;
	return !REF_FORBIDDEN.some((token) => value.includes(token));
}
//#endregion
//#region src/worktree/git.ts
var git_exports = /* @__PURE__ */ __exportAll({
	GIT_FETCH_TIMEOUT_MS: () => GIT_FETCH_TIMEOUT_MS,
	addWorktree: () => addWorktree,
	assertWorktreeName: () => assertWorktreeName,
	checkWorktreeNameShape: () => checkWorktreeNameShape,
	classifyFetchFailure: () => classifyFetchFailure,
	classifyRepoPaths: () => classifyRepoPaths,
	fetchBranch: () => fetchBranch,
	hasOriginRemote: () => hasOriginRemote,
	isDirty: () => isDirty,
	listWorktrees: () => listWorktrees,
	localBranchExists: () => localBranchExists,
	parseWorktreeList: () => parseWorktreeList,
	pruneWorktrees: () => pruneWorktrees,
	readDirtyCounts: () => readDirtyCounts,
	readStashCount: () => readStashCount,
	remoteBranchExists: () => remoteBranchExists,
	removeWorktree: () => removeWorktree,
	resolveGitCommonDir: () => resolveGitCommonDir,
	resolveSha: () => resolveSha,
	resolveWorktreeGitDir: () => resolveWorktreeGitDir,
	runGit: () => runGit,
	shortBranchName: () => shortBranchName,
	worktreePathFor: () => worktreePathFor
});
const GIT_FETCH_TIMEOUT_MS = 6e4;
const runGit = (invocation) => new Promise((settle) => {
	const child = spawn("git", [...invocation.args], {
		cwd: invocation.cwd,
		stdio: [
			"pipe",
			"pipe",
			"pipe"
		],
		...invocation.timeoutMs === void 0 ? {} : { timeout: invocation.timeoutMs }
	});
	let stdout = "";
	let stderr = "";
	child.stdout.setEncoding("utf8");
	child.stderr.setEncoding("utf8");
	child.stdout.on("data", (chunk) => stdout += chunk);
	child.stderr.on("data", (chunk) => stderr += chunk);
	child.on("error", (error) => settle({
		status: 127,
		stdout,
		stderr: `${stderr}${error.message}`
	}));
	child.on("close", (code) => settle({
		status: code ?? 1,
		stdout,
		stderr
	}));
	child.stdin.on("error", () => void 0);
	child.stdin.end(invocation.stdin ?? "");
});
function refuse$3(message, next) {
	throw new EngineError(message, {
		code: "VALIDATION_ERROR",
		...next === void 0 ? {} : { next }
	});
}
function gitFailed(what, outcome) {
	const detail = outcome.stderr.trim() === "" ? outcome.stdout.trim() : outcome.stderr.trim();
	throw new EngineError(`${what} failed (git exited ${outcome.status}).`, {
		code: "FS_ERROR",
		why: sanitizeGitOutput(detail)
	});
}
const GIT_CONTROL_BYTES = /[\u0000-\u001F\u007F-\u009F]/gu;
function sanitizeGitOutput(text) {
	return text.replace(/[\r\n\t]/gu, " ").replace(GIT_CONTROL_BYTES, "").trim();
}
async function expectGit(run, what, invocation) {
	const outcome = await run(invocation);
	if (outcome.status !== 0) gitFailed(what, outcome);
	return outcome.stdout.trim();
}
const CONTROL_CHARACTERS$2 = /[\u0000-\u001f\u007f]/;
function checkWorktreeNameShape(name) {
	if (name === "") return "the name is empty.";
	if (CONTROL_CHARACTERS$2.test(name)) return "the name carries a control character.";
	if (name.includes("\\")) return `${JSON.stringify(name)} carries a backslash. A worktree name is a POSIX path fragment — spell nesting with \`/\`.`;
	if (name.startsWith("-")) return `${JSON.stringify(name)} starts with \`-\`, which git reads as an option rather than as a name.`;
	if (isAbsolute(name) || name.startsWith("/")) return `${JSON.stringify(name)} is an absolute path. A worktree name is relative to the farm directory.`;
	for (const segment of name.split("/")) {
		if (segment === "") return `${JSON.stringify(name)} carries an empty path segment. Spell the name plainly, with single \`/\` separators and no trailing slash.`;
		if (segment === "." || segment === "..") return `${JSON.stringify(name)} carries the segment ${JSON.stringify(segment)}, which would resolve outside the farm directory.`;
	}
	return null;
}
async function assertWorktreeName(run, repoRoot, name) {
	const shape = checkWorktreeNameShape(name);
	if (shape !== null) refuse$3(`${shape} A worktree name is also the branch name, so it must be a valid ref.`);
	if ((await run({
		args: [
			"check-ref-format",
			"--branch",
			name
		],
		cwd: repoRoot
	})).status !== 0) refuse$3(`${JSON.stringify(name)} is not a valid branch name: git check-ref-format rejected it.`, `Pick a name git accepts as a ref — no \`..\`, no \`~^:?*[\`, no trailing \`.lock\`, and no component starting with a dot.`);
}
function worktreePathFor(farmDir, name) {
	if (isAbsolute(name)) refuse$3(`The worktree name ${JSON.stringify(name)} is an absolute path, and a worktree name is relative to the farm directory.`, `Name the worktree relative to the farm directory, without a leading \`/\` or drive.`);
	const farm = normalize(farmDir);
	const target = join(farm, name);
	if (target !== farm && target.startsWith(`${farm}${sep}`)) return target;
	refuse$3(`The worktree name ${JSON.stringify(name)} resolves to ${target}, which is outside the farm at ${farm}.`, `Name the worktree relative to the farm directory, without \`..\` segments.`);
}
function parseWorktreeList(output) {
	const entries = [];
	let current = null;
	const flush = () => {
		if (current === null) return;
		const path = current["worktree"];
		if (typeof path === "string") entries.push(toInventoryEntry(path, current));
		current = null;
	};
	for (const token of output.split("\0")) {
		if (token === "") {
			flush();
			continue;
		}
		const space = token.indexOf(" ");
		const key = space === -1 ? token : token.slice(0, space);
		const value = space === -1 ? true : token.slice(space + 1);
		if (key === "worktree") flush();
		current ??= {};
		current[key] = value;
	}
	flush();
	return entries;
}
function toInventoryEntry(path, record) {
	const branchRef = record["branch"];
	const head = record["HEAD"];
	const locked = record["locked"];
	const prunable = record["prunable"];
	return {
		path,
		branch: typeof branchRef === "string" ? shortBranchName(branchRef) : null,
		head: typeof head === "string" ? head : null,
		bare: record["bare"] !== void 0,
		detached: record["detached"] !== void 0,
		locked: locked !== void 0,
		lockReason: typeof locked === "string" && locked !== "" ? locked : null,
		prunable: prunable !== void 0,
		prunableReason: typeof prunable === "string" && prunable !== "" ? prunable : null
	};
}
function shortBranchName(ref) {
	return ref.startsWith("refs/heads/") ? ref.slice(11) : ref;
}
async function listWorktrees(run, repoRoot) {
	const outcome = await run({
		args: [
			"worktree",
			"list",
			"--porcelain",
			"-z"
		],
		cwd: repoRoot
	});
	if (outcome.status !== 0) gitFailed("reading the worktree inventory", outcome);
	return parseWorktreeList(outcome.stdout).map((entry) => Object.assign({}, entry, { path: normalize(entry.path) }));
}
async function readStashCount(run, repoRoot) {
	const outcome = await run({
		args: [
			"stash",
			"list",
			"--format=%H"
		],
		cwd: repoRoot
	});
	if (outcome.status !== 0) return 0;
	return outcome.stdout.split("\n").filter((line) => line.trim() !== "").length;
}
function isDirty(counts) {
	return counts.modified > 0 || counts.untracked > 0;
}
async function readDirtyCounts(run, worktreePath) {
	const outcome = await run({
		args: ["status", "--porcelain"],
		cwd: worktreePath
	});
	if (outcome.status !== 0) gitFailed(`reading git status in ${worktreePath}`, outcome);
	let modified = 0;
	let untracked = 0;
	for (const line of outcome.stdout.split("\n")) {
		if (line.trim() === "") continue;
		if (line.startsWith("??")) untracked += 1;
		else modified += 1;
	}
	return {
		modified,
		untracked
	};
}
async function classifyRepoPaths(run, repoRoot, relPaths) {
	const classes = /* @__PURE__ */ new Map();
	if (relPaths.length === 0) return classes;
	const tracked = await run({
		args: [
			"ls-files",
			"-z",
			"--",
			...relPaths
		],
		cwd: repoRoot
	});
	if (tracked.status !== 0) gitFailed("listing tracked paths", tracked);
	const trackedPaths = tracked.stdout.split("\0").filter((entry) => entry !== "");
	const ignored = await run({
		args: [
			"check-ignore",
			"-z",
			"--stdin"
		],
		cwd: repoRoot,
		stdin: `${relPaths.join("\0")}\0`
	});
	if (ignored.status !== 0 && ignored.status !== 1) gitFailed("checking ignored paths", ignored);
	const ignoredPaths = new Set(ignored.stdout.split("\0").filter((entry) => entry !== ""));
	for (const relPath of relPaths) if (trackedPaths.some((entry) => entry === relPath || entry.startsWith(`${relPath}/`))) classes.set(relPath, "tracked");
	else if (ignoredPaths.has(relPath)) classes.set(relPath, "ignored");
	else classes.set(relPath, "untracked");
	return classes;
}
async function localBranchExists(run, repoRoot, branch) {
	return (await run({
		args: [
			"show-ref",
			"--verify",
			"--quiet",
			`refs/heads/${branch}`
		],
		cwd: repoRoot
	})).status === 0;
}
async function remoteBranchExists(run, repoRoot, branch) {
	return (await run({
		args: [
			"show-ref",
			"--verify",
			"--quiet",
			`refs/remotes/origin/${branch}`
		],
		cwd: repoRoot
	})).status === 0;
}
async function hasOriginRemote(run, repoRoot) {
	const outcome = await run({
		args: [
			"remote",
			"get-url",
			"origin"
		],
		cwd: repoRoot
	});
	return outcome.status === 0 && outcome.stdout.trim() !== "";
}
const MISSING_REF_MARKER = "couldn't find remote ref";
function classifyFetchFailure(stderr) {
	return stderr.toLowerCase().includes(MISSING_REF_MARKER) ? "missing-ref" : "transport";
}
async function fetchBranch(run, repoRoot, branch) {
	const outcome = await run({
		args: [
			"fetch",
			"origin",
			branch
		],
		cwd: repoRoot,
		timeoutMs: GIT_FETCH_TIMEOUT_MS
	});
	if (outcome.status === 0) return "fetched";
	if (classifyFetchFailure(outcome.stderr) === "missing-ref") return "missing-ref";
	throw new EngineError(`Could not reach \`origin\` to look for the branch ${JSON.stringify(branch)}.`, {
		code: "NETWORK_ERROR",
		why: sanitizeGitOutput(outcome.stderr),
		next: `Check the network and the remote, or re-run with --no-track to create ${JSON.stringify(branch)} off the current HEAD without consulting origin.`
	});
}
async function resolveGitCommonDir(run, cwd) {
	const printed = await expectGit(run, "resolving the git common directory", {
		args: ["rev-parse", "--git-common-dir"],
		cwd
	});
	return resolve(cwd, printed);
}
async function resolveWorktreeGitDir(run, worktreePath) {
	const printed = await expectGit(run, `resolving the git directory of ${worktreePath}`, {
		args: ["rev-parse", "--git-dir"],
		cwd: worktreePath
	});
	return resolve(worktreePath, printed);
}
async function resolveSha(run, cwd, rev = "HEAD") {
	return expectGit(run, `resolving ${rev}`, {
		args: ["rev-parse", rev],
		cwd
	});
}
const ALREADY_CHECKED_OUT = /already used by worktree at '([^']*)'/;
const COMMONDIR_RACE = /failed to read .*[\\/]commondir/;
const WORKTREE_ADD_RETRY_DELAY_MS = 250;
async function addWorktree(run, repoRoot, request) {
	const args = request.kind === "attach" ? [
		"worktree",
		"add",
		request.path,
		request.branch
	] : request.kind === "track" ? [
		"worktree",
		"add",
		"--track",
		"-b",
		request.branch,
		request.path,
		`origin/${request.branch}`
	] : [
		"worktree",
		"add",
		"-b",
		request.branch,
		request.path
	];
	let outcome = await run({
		args,
		cwd: repoRoot
	});
	let retriedAfterRace = false;
	if (outcome.status === 128 && COMMONDIR_RACE.test(outcome.stderr)) {
		await new Promise((wake) => setTimeout(wake, WORKTREE_ADD_RETRY_DELAY_MS));
		outcome = await run({
			args,
			cwd: repoRoot
		});
		retriedAfterRace = true;
	}
	if (outcome.status === 0) return;
	const collision = ALREADY_CHECKED_OUT.exec(outcome.stderr);
	if (collision !== null) {
		const other = sanitizeGitOutput(collision[1] ?? "");
		refuse$3(`The branch ${JSON.stringify(request.branch)} is already checked out in the worktree at ${other}.`, `Work in ${other}, or run setup with a different name.`);
	}
	if (outcome.stderr.includes("already exists")) refuse$3(`${request.path} already exists, so there is nothing for this run to create.`, `Remove it, or run \`stamity worktree cleanup\` for that name first.`);
	gitFailed(retriedAfterRace ? `creating the worktree at ${request.path} (retried once after the commondir race)` : `creating the worktree at ${request.path}`, outcome);
}
async function removeWorktree(run, repoRoot, worktreePath, force) {
	const outcome = await run({
		args: force ? [
			"worktree",
			"remove",
			"--force",
			worktreePath
		] : [
			"worktree",
			"remove",
			worktreePath
		],
		cwd: repoRoot
	});
	if (outcome.status === 0) return;
	if (outcome.stderr.includes("contains modified or untracked files")) refuse$3(`${worktreePath} carries uncommitted changes, so it was not removed.`, `Commit or discard them, or re-run with --force.`);
	gitFailed(`removing the worktree at ${worktreePath}`, outcome);
}
async function pruneWorktrees(run, repoRoot) {
	await expectGit(run, "pruning abandoned worktree registrations", {
		args: ["worktree", "prune"],
		cwd: repoRoot
	});
}
//#endregion
//#region src/worktree/receipt.ts
var receipt_exports = /* @__PURE__ */ __exportAll({
	WORKTREE_RECEIPT_FILENAME: () => WORKTREE_RECEIPT_FILENAME,
	WORKTREE_RECEIPT_SUBDIR: () => WORKTREE_RECEIPT_SUBDIR,
	WORKTREE_RECEIPT_VERSION: () => 1,
	classifyReceiptEntry: () => classifyReceiptEntry,
	createWorktreeReceipt: () => createWorktreeReceipt,
	digestFile: () => digestFile,
	inspectEntryState: () => inspectEntryState,
	readWorktreeReceipt: () => readWorktreeReceipt,
	sha256Hex: () => sha256Hex,
	worktreeReceiptPath: () => worktreeReceiptPath,
	writeWorktreeReceipt: () => writeWorktreeReceipt
});
const WORKTREE_RECEIPT_SUBDIR = "stamity";
const WORKTREE_RECEIPT_FILENAME = "worktree-receipt.json";
function worktreeReceiptPath(gitDir) {
	return join(gitDir, WORKTREE_RECEIPT_SUBDIR, WORKTREE_RECEIPT_FILENAME);
}
function createWorktreeReceipt(fields) {
	return {
		version: 1,
		...fields
	};
}
function sha256Hex(bytes) {
	return createHash("sha256").update(bytes).digest("hex");
}
async function digestFile(absPath) {
	try {
		if (!(await lstat(absPath)).isFile()) return null;
		return sha256Hex(await readFile(absPath));
	} catch {
		return null;
	}
}
async function writeWorktreeReceipt(gitDir, receipt) {
	const filePath = worktreeReceiptPath(gitDir);
	await atomicWriteFile(filePath, `${JSON.stringify(receipt, null, 2)}\n`, { boundaryDir: gitDir });
	return filePath;
}
async function readWorktreeReceipt(gitDir) {
	const filePath = worktreeReceiptPath(gitDir);
	let text;
	try {
		text = await readFile(filePath, "utf8");
	} catch (error) {
		const code = error.code;
		return unreadable(code === "ENOENT" ? `${filePath}: absent — this worktree carries no receipt.` : `${filePath}: could not be read (${code ?? "unknown errno"}).`);
	}
	let document;
	try {
		document = JSON.parse(text);
	} catch (error) {
		return unreadable(`${filePath}: not valid JSON (${error.message}).`);
	}
	if (typeof document !== "object" || document === null || Array.isArray(document)) return unreadable(`${filePath}: the receipt is not a JSON object.`);
	const record = document;
	if (record["version"] !== 1) return unreadable(`${filePath}: receipt version ${JSON.stringify(record["version"])} — this build reads version 1 only, so the worktree is left untouched.`);
	const rows = record["entries"];
	if (!Array.isArray(rows)) return unreadable(`${filePath}: \`entries\` is not an array.`);
	const entries = [];
	const droppedRows = [];
	rows.forEach((row, index) => {
		const parsed = parseReceiptEntry(row);
		if (typeof parsed === "string") droppedRows.push({
			index,
			reason: parsed
		});
		else entries.push(parsed);
	});
	return {
		receipt: {
			version: 1,
			createdAt: stringOr(record["createdAt"], ""),
			engineVersion: stringOr(record["engineVersion"], ""),
			worktree: parseTarget(record["worktree"]),
			entries
		},
		unreadable: null,
		droppedRows
	};
}
function unreadable(reason) {
	return {
		receipt: null,
		unreadable: reason,
		droppedRows: []
	};
}
function stringOr(value, fallback) {
	return typeof value === "string" ? value : fallback;
}
function parseTarget(value) {
	const record = typeof value === "object" && value !== null ? value : {};
	return {
		path: stringOr(record["path"], ""),
		branch: stringOr(record["branch"], ""),
		head: stringOr(record["head"], "")
	};
}
const CONTROL_CHARACTERS$1 = /[\u0000-\u001f\u007f]/;
function parseReceiptEntry(row) {
	if (typeof row !== "object" || row === null || Array.isArray(row)) return "the row is not an object";
	const record = row;
	const path = record["path"];
	if (typeof path !== "string" || path === "") return "the row has no `path`";
	if (path.includes("\\")) return "the row's `path` carries a backslash";
	if (isAbsolute(path) || path.startsWith("/")) return "the row's `path` is absolute";
	if (CONTROL_CHARACTERS$1.test(path)) return "the row's `path` carries a control character";
	for (const segment of path.split("/")) if (segment === "." || segment === "..") return `the row's \`path\` carries the segment ${JSON.stringify(segment)}, which escapes the worktree`;
	const strategy = record["strategy"];
	if (strategy !== "copy" && strategy !== "symlink") return `the row's \`strategy\` is ${JSON.stringify(strategy)}, not \`copy\` or \`symlink\``;
	const mode = record["mode"];
	const sha256 = record["sha256"];
	return {
		path,
		strategy,
		...typeof mode === "string" ? { mode } : {},
		...typeof sha256 === "string" ? { sha256 } : {}
	};
}
function classifyReceiptEntry(entry, state) {
	if (state.kind === "absent") return {
		disposition: "absent",
		reason: "not-present"
	};
	if (entry.strategy === "symlink") return state.kind === "symlink" ? {
		disposition: "remove",
		reason: "still-a-symlink"
	} : {
		disposition: "keep",
		reason: "replaced"
	};
	if (state.kind !== "file") return {
		disposition: "keep",
		reason: "replaced"
	};
	if (entry.sha256 === void 0) return {
		disposition: "keep",
		reason: "no-digest"
	};
	return entry.sha256 === state.sha256 ? {
		disposition: "remove",
		reason: "digest-match"
	} : {
		disposition: "keep",
		reason: "diverged"
	};
}
async function inspectEntryState(absPath) {
	let entry;
	try {
		entry = await lstat(absPath);
	} catch (error) {
		if (error.code === "ENOENT") return {
			kind: "absent",
			sha256: null
		};
		throw error;
	}
	if (entry.isSymbolicLink()) return {
		kind: "symlink",
		sha256: null
	};
	if (entry.isDirectory()) return {
		kind: "directory",
		sha256: null
	};
	if (!entry.isFile()) return {
		kind: "other",
		sha256: null
	};
	return {
		kind: "file",
		sha256: await digestFile(absPath)
	};
}
//#endregion
//#region src/worktree/materialize.ts
var materialize_exports = /* @__PURE__ */ __exportAll({
	materializeEntries: () => materializeEntries,
	materializeEntry: () => materializeEntry,
	receiptEntryFor: () => receiptEntryFor
});
const SECRET_FILE_MODE = 384;
const SYMLINK_FALLBACK_ERRNOS = /* @__PURE__ */ new Set(["EPERM", "EACCES"]);
async function materializeEntries(requests, opts) {
	const results = [];
	for (const request of requests) {
		const expanded = await expandRequest(request, opts);
		if (expanded === null) {
			results.push(await materializeEntry(request, opts));
			continue;
		}
		if (expanded.requests.length === 0 && expanded.failures.length === 0 && expanded.withheld.length === 0) {
			results.push({
				relPath: request.relPath,
				requested: request.strategy,
				strategy: request.strategy,
				outcome: "skipped",
				reason: "every path under this directory is skipped by the policy"
			});
			continue;
		}
		for (const child of expanded.requests) results.push(await materializeEntry(child, opts));
		results.push(...expanded.failures);
		results.push(...expanded.withheld);
	}
	return results;
}
async function expandRequest(request, opts) {
	if (request.strategy !== "copy") return null;
	let entry;
	try {
		entry = await lstat(join(opts.sourceRoot, request.relPath));
	} catch {
		return null;
	}
	if (!entry.isDirectory()) return null;
	const collected = [];
	const failures = [];
	const withheld = [];
	const walk = async (relDir) => {
		let children;
		try {
			children = await readdir(join(opts.sourceRoot, relDir), { withFileTypes: true });
		} catch (error) {
			const code = error.code;
			failures.push({
				relPath: relDir,
				requested: request.strategy,
				strategy: request.strategy,
				outcome: "failed",
				reason: error instanceof Error ? error.message : String(error),
				...code === void 0 ? {} : { errno: code }
			});
			return;
		}
		for (const child of children) {
			const relPath = posix.join(relDir, child.name);
			if (opts.isSkipped?.(relPath) === true) continue;
			if (child.isSymbolicLink()) continue;
			if (child.isDirectory()) {
				await walk(relPath);
				continue;
			}
			const elevated = request.secret || opts.isKnownCredential?.(relPath) === true;
			if (elevated && !request.secret && opts.secretsGranted !== true) {
				withheld.push({
					relPath,
					requested: "copy",
					strategy: "copy",
					outcome: "withheld",
					reason: "this run had no consent to copy secret material (--copy-secrets)"
				});
				continue;
			}
			collected.push({
				relPath,
				strategy: "copy",
				secret: elevated
			});
		}
	};
	await walk(request.relPath);
	return {
		requests: collected,
		failures,
		withheld
	};
}
async function findCredentialInSubtree(sourceRoot, relDir, isKnownCredential) {
	let children;
	try {
		children = await readdir(join(sourceRoot, relDir), { withFileTypes: true });
	} catch {
		return null;
	}
	for (const child of children) {
		const relPath = posix.join(relDir, child.name);
		if (child.isSymbolicLink()) continue;
		if (child.isDirectory()) {
			const found = await findCredentialInSubtree(sourceRoot, relPath, isKnownCredential);
			if (found !== null) return found;
			continue;
		}
		if (isKnownCredential(relPath)) return relPath;
	}
	return null;
}
async function materializeEntry(request, opts) {
	const source = join(opts.sourceRoot, request.relPath);
	const destination = join(opts.worktreeRoot, request.relPath);
	try {
		await assertWriteTargetContained(destination, opts.worktreeRoot);
		await mkdir(dirname(destination), { recursive: true });
		return request.strategy === "symlink" ? await placeSymlink(request, source, destination, opts) : await placeCopy(request, source, destination, opts, "copy");
	} catch (error) {
		return failure(request, request.strategy, error);
	}
}
async function placeCopy(request, source, destination, opts, performed, fallbackFrom) {
	const fallback = fallbackFrom === void 0 ? {} : { fallbackFrom };
	let sourceMode;
	try {
		const link = await lstat(source);
		if (link.isSymbolicLink()) sourceMode = await stat(source).then((entry) => entry.mode & 511, () => SECRET_FILE_MODE);
		else sourceMode = link.mode & 511;
	} catch (error) {
		if (error.code === "ENOENT") return {
			relPath: request.relPath,
			requested: request.strategy,
			strategy: performed,
			outcome: "absent",
			reason: `${source} is not present, so there was nothing to place`,
			...fallback
		};
		throw error;
	}
	try {
		await copyFile(source, destination, constants.COPYFILE_EXCL);
	} catch (error) {
		if (error.code === "EEXIST") return await skipExisting(request, destination, opts, performed, fallbackFrom);
		await rm(destination, { force: true }).catch(() => void 0);
		return failure(request, performed, error, fallbackFrom);
	}
	let mode;
	try {
		mode = await applyMode(request, destination, sourceMode, opts);
	} catch (error) {
		await rm(destination, { force: true }).catch(() => void 0);
		return failure(request, performed, error, fallbackFrom);
	}
	return {
		relPath: request.relPath,
		requested: request.strategy,
		strategy: performed,
		outcome: "materialized",
		...mode,
		...await digestOf(destination),
		...fallback
	};
}
async function placeSymlink(request, source, destination, opts) {
	let sourceIsDirectory;
	try {
		sourceIsDirectory = (await lstat(source)).isDirectory();
	} catch (error) {
		if (error.code === "ENOENT") return {
			relPath: request.relPath,
			requested: "symlink",
			strategy: "symlink",
			outcome: "absent",
			reason: `${source} is not present, so there was nothing to link`
		};
		throw error;
	}
	if (sourceIsDirectory && opts.isKnownCredential !== void 0) {
		const credential = await findCredentialInSubtree(opts.sourceRoot, request.relPath, opts.isKnownCredential);
		if (credential !== null) return {
			relPath: request.relPath,
			requested: "symlink",
			strategy: "symlink",
			outcome: "failed",
			reason: `${credential} inside this directory is a known credential, and a symlink links its whole subtree as one unit — there is no per-file boundary to gate consent at the way a \`copy\` row has. Set this row's strategy to \`copy\` (with --copy-secrets) so the credential is placed under the same consent gate a top-level secret row gets, or carve it out with a \`skip\` row of its own. This check answers for the directory as it stands right now — a symlink row that later clears it stays a standing alias into a live directory, so a file added there afterward is never re-checked.`
		};
	}
	const link = opts.symlinkImpl ?? ((target, path) => symlink(target, path));
	try {
		await link(source, destination);
	} catch (error) {
		const code = error.code;
		if (code === "EEXIST") return await skipExisting(request, destination, opts, "symlink");
		if (code === void 0 || !SYMLINK_FALLBACK_ERRNOS.has(code)) return failure(request, "symlink", error);
		if (sourceIsDirectory) return {
			relPath: request.relPath,
			requested: "symlink",
			strategy: "symlink",
			outcome: "failed",
			reason: `the link was refused with ${code} and ${source} is a directory, so the copy fallback does not apply — a directory copied in place of a link is a duplicated tree the operator never asked for. Set this row's strategy to \`copy\` or \`skip\`.`,
			errno: code
		};
		return await placeCopy(request, source, destination, opts, "copy", "symlink");
	}
	return {
		relPath: request.relPath,
		requested: "symlink",
		strategy: "symlink",
		outcome: "materialized"
	};
}
async function skipExisting(request, destination, opts, performed, fallbackFrom) {
	const entry = await lstat(destination);
	const mode = entry.isFile() && !entry.isSymbolicLink() ? await applyMode(request, destination, entry.mode & 511, opts) : {};
	return {
		relPath: request.relPath,
		requested: request.strategy,
		strategy: performed,
		outcome: "skipped",
		reason: "already present",
		...mode,
		...performed === "copy" ? await digestOf(destination) : {},
		...fallbackFrom === void 0 ? {} : { fallbackFrom }
	};
}
async function applyMode(request, destination, sourceMode, opts) {
	if ((opts.platform ?? process.platform) === "win32") return request.secret ? { secretModeApplied: false } : {};
	const mode = request.secret ? SECRET_FILE_MODE : sourceMode;
	await chmod(destination, mode);
	return {
		mode: formatMode(mode),
		...request.secret ? { secretModeApplied: true } : {}
	};
}
async function digestOf(destination) {
	const sha256 = await digestFile(destination);
	return sha256 === null ? {} : { sha256 };
}
function formatMode(mode) {
	return `0${(mode & 511).toString(8)}`;
}
function failure(request, performed, error, fallbackFrom) {
	const code = error.code;
	return {
		relPath: request.relPath,
		requested: request.strategy,
		strategy: performed,
		outcome: "failed",
		reason: error instanceof Error ? error.message : String(error),
		...code === void 0 ? {} : { errno: code },
		...fallbackFrom === void 0 ? {} : { fallbackFrom }
	};
}
function receiptEntryFor(result) {
	if (result.outcome !== "materialized" && result.outcome !== "skipped") return null;
	return {
		path: result.relPath,
		strategy: result.strategy,
		...result.mode === void 0 ? {} : { mode: result.mode },
		...result.sha256 === void 0 ? {} : { sha256: result.sha256 }
	};
}
//#endregion
//#region src/worktree/policy.ts
var policy_exports = /* @__PURE__ */ __exportAll({
	BUILT_IN_POLICY_SOURCE: () => BUILT_IN_POLICY_SOURCE,
	DEFAULT_WORKTREE_RULES: () => DEFAULT_WORKTREE_RULES,
	WORKTREE_FARM_DIR_NAME: () => WORKTREE_FARM_DIR_NAME,
	WORKTREE_POLICY_FILE: () => WORKTREE_POLICY_FILE,
	WORKTREE_POLICY_VERSION: () => 1,
	assertRulesAdmissible: () => assertRulesAdmissible,
	builtInWorktreePolicy: () => builtInWorktreePolicy,
	isKnownCredentialPath: () => isKnownCredentialPath,
	matchPolicyRule: () => matchPolicyRule,
	materializationRules: () => materializationRules,
	parseWorktreePolicy: () => parseWorktreePolicy,
	policyRules: () => policyRules,
	readWorktreePolicy: () => readWorktreePolicy,
	resolveFarmDir: () => resolveFarmDir,
	resolveStrategy: () => resolveStrategy
});
const WORKTREE_POLICY_FILE = ".stamity/worktree.json";
const WORKTREE_FARM_DIR_NAME = ".stamity-worktrees";
const BUILT_IN_POLICY_SOURCE = "<built-in worktree defaults>";
const DEFAULT_WORKTREE_RULES = Object.freeze([Object.freeze({
	path: ".env.mcp",
	strategy: "copy",
	secret: true,
	reason: "MCP credentials",
	list: "entries"
}), Object.freeze({
	path: "node_modules",
	strategy: "skip",
	secret: false,
	reason: "install inside the worktree; a symlinked tree is written through",
	list: "entries"
})]);
function builtInWorktreePolicy() {
	return {
		version: 1,
		entries: DEFAULT_WORKTREE_RULES,
		overrides: [],
		source: BUILT_IN_POLICY_SOURCE,
		builtIn: true
	};
}
const KNOWN_CREDENTIAL_BASENAMES = /* @__PURE__ */ new Set([normalizeCredentialBasename(ENV_MCP_FILE)]);
function normalizeCredentialBasename(name) {
	return name.toLowerCase().replace(/[. ]+$/, "");
}
function isKnownCredentialPath(relPath) {
	return KNOWN_CREDENTIAL_BASENAMES.has(normalizeCredentialBasename(basename(relPath)));
}
const TOP_LEVEL_KEYS = /* @__PURE__ */ new Set([
	"version",
	"farmDir",
	"entries",
	"overrides"
]);
const RULE_KEYS = /* @__PURE__ */ new Set([
	"path",
	"strategy",
	"secret",
	"reason"
]);
const STRATEGIES = [
	"copy",
	"symlink",
	"skip"
];
const GLOB_CHARACTERS = [
	"*",
	"?",
	"[",
	"{"
];
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
function refuse$2(message, next) {
	throw new EngineError(message, {
		code: "VALIDATION_ERROR",
		...next === void 0 ? {} : { next }
	});
}
async function readWorktreePolicy(repoRoot) {
	const filePath = join(repoRoot, WORKTREE_POLICY_FILE);
	let text;
	try {
		text = await readFile(filePath, "utf8");
	} catch (error) {
		if (error.code === "ENOENT") return builtInWorktreePolicy();
		throw new EngineError(`${filePath}: the worktree policy file could not be read.`, {
			code: "FS_ERROR",
			cause: error,
			why: error.code
		});
	}
	return parseWorktreePolicy(text, filePath);
}
function parseWorktreePolicy(text, filePath) {
	let document;
	try {
		document = JSON.parse(text);
	} catch (error) {
		refuse$2(`${filePath}: the worktree policy file is not valid JSON (${error.message}).`, `Fix the syntax in ${filePath}, or delete the file to fall back to the built-in defaults.`);
	}
	if (typeof document !== "object" || document === null || Array.isArray(document)) refuse$2(`${filePath}: the worktree policy file must be a JSON object with a \`version\` key.`);
	const record = document;
	for (const key of Object.keys(record)) {
		if (TOP_LEVEL_KEYS.has(key)) continue;
		refuse$2(`${filePath}: unknown key ${JSON.stringify(key)}. The policy file declares only ${[...TOP_LEVEL_KEYS].map((known) => `\`${known}\``).join(", ")}.`);
	}
	const version = record["version"];
	if (version !== 1) refuse$2(`${filePath}: \`version\` must be 1, not ${JSON.stringify(version)}. This build reads schema generation 1 only.`);
	let farmDir;
	if (record["farmDir"] !== void 0) {
		const declared = record["farmDir"];
		if (typeof declared !== "string" || declared.trim() === "") refuse$2(`${filePath}: \`farmDir\` must be a non-empty string path, not ${JSON.stringify(declared)}.`);
		if (declared.includes("\\")) refuse$2(`${filePath}: \`farmDir\` carries a backslash. Spell the path with \`/\` separators.`);
		farmDir = declared;
	}
	const entries = parseRuleList(record["entries"], "entries", filePath);
	const overrides = parseRuleList(record["overrides"], "overrides", filePath);
	assertNoContestedPath([...entries, ...overrides], filePath);
	return {
		version: 1,
		...farmDir === void 0 ? {} : { farmDir },
		entries,
		overrides,
		source: filePath,
		builtIn: false
	};
}
function parseRuleList(value, list, filePath) {
	if (value === void 0) return [];
	if (!Array.isArray(value)) refuse$2(`${filePath}: \`${list}\` must be an array of { path, strategy } rows.`);
	return value.map((row, index) => parseRule(row, list, index, filePath));
}
function parseRule(row, list, index, filePath) {
	const label = `${list}[${index}]`;
	if (typeof row !== "object" || row === null || Array.isArray(row)) refuse$2(`${filePath}: ${label} must be an object with \`path\` and \`strategy\` keys.`);
	const record = row;
	for (const key of Object.keys(record)) {
		if (RULE_KEYS.has(key)) continue;
		refuse$2(`${filePath}: ${label} carries the unknown key ${JSON.stringify(key)}. A row declares only ${[...RULE_KEYS].map((known) => `\`${known}\``).join(", ")}.`);
	}
	const declaredPath = record["path"];
	if (typeof declaredPath !== "string" || declaredPath.trim() === "") refuse$2(`${filePath}: ${label} has no \`path\`. Every row names one literal repo-relative path.`);
	const path = normalizeRulePath(declaredPath, label, filePath);
	const strategy = record["strategy"];
	if (typeof strategy !== "string" || !STRATEGIES.includes(strategy)) refuse$2(`${filePath}: ${label} \`strategy\` must be one of ${STRATEGIES.map((known) => `\`${known}\``).join(", ")}, not ${JSON.stringify(strategy)}.`);
	const secret = record["secret"];
	if (secret !== void 0 && typeof secret !== "boolean") refuse$2(`${filePath}: ${label} \`secret\` must be true or false, not ${JSON.stringify(secret)}.`);
	const reason = record["reason"];
	if (reason !== void 0 && typeof reason !== "string") refuse$2(`${filePath}: ${label} \`reason\` must be a string, not ${JSON.stringify(reason)}.`);
	return {
		path,
		strategy,
		secret: secret === true || isKnownCredentialPath(path),
		...typeof reason === "string" ? { reason } : {},
		list
	};
}
function normalizeRulePath(declared, label, filePath) {
	if (declared.includes("\\")) refuse$2(`${filePath}: ${label} \`path\` ${JSON.stringify(declared)} carries a backslash. Paths are repo-relative POSIX paths — spell them with \`/\`.`);
	if (declared.includes(":")) refuse$2(`${filePath}: ${label} \`path\` ${JSON.stringify(declared)} carries a colon. A colon is not a valid character in a filename on Windows — including inside an alternate-data-stream alias such as \`name::$DATA\`, which addresses the SAME file's bytes under a spelling this policy's credential-identity check does not see.`);
	for (const character of GLOB_CHARACTERS) {
		if (!declared.includes(character)) continue;
		refuse$2(`${filePath}: ${label} \`path\` ${JSON.stringify(declared)} carries the glob metacharacter \`${character}\`. Paths here are literal: name each file or directory in its own row.`);
	}
	if (CONTROL_CHARACTERS.test(declared)) refuse$2(`${filePath}: ${label} \`path\` carries a control character.`);
	if (declared.startsWith("/")) refuse$2(`${filePath}: ${label} \`path\` ${JSON.stringify(declared)} is absolute. Paths are relative to the repository root.`);
	const trimmed = declared.endsWith("/") ? declared.slice(0, -1) : declared;
	if (trimmed === "") refuse$2(`${filePath}: ${label} \`path\` is empty after normalization.`);
	for (const segment of trimmed.split("/")) if (segment === "" || segment === "." || segment === "..") refuse$2(`${filePath}: ${label} \`path\` ${JSON.stringify(declared)} carries the segment ${JSON.stringify(segment)}. Spell the path plainly, relative to the repository root.`);
	return trimmed;
}
function assertNoContestedPath(rules, filePath) {
	const seen = /* @__PURE__ */ new Map();
	for (const rule of rules) {
		const previous = seen.get(rule.path);
		if (previous === void 0) {
			seen.set(rule.path, rule);
			continue;
		}
		refuse$2(`${filePath}: the path ${JSON.stringify(rule.path)} is claimed twice — once in \`${previous.list}\` (strategy \`${previous.strategy}\`) and once in \`${rule.list}\` (strategy \`${rule.strategy}\`). Resolution is by longest prefix, never by declaration order, so one path carries one row.`, `Delete one of the two rows in ${filePath}, or make one a strict prefix of the other.`);
	}
}
function policyRules(policy) {
	return [...policy.entries, ...policy.overrides];
}
function matchPolicyRule(policy, relPath) {
	let best = null;
	for (const rule of policyRules(policy)) {
		if (relPath !== rule.path && !relPath.startsWith(`${rule.path}/`)) continue;
		if (best === null || rule.path.length > best.path.length) best = rule;
	}
	return best;
}
function resolveStrategy(policy, relPath) {
	return matchPolicyRule(policy, relPath)?.strategy ?? "skip";
}
function materializationRules(policy) {
	return policyRules(policy).filter((rule) => rule.strategy !== "skip" && matchPolicyRule(policy, rule.path) === rule);
}
function assertRulesAdmissible(policy, classify) {
	for (const rule of materializationRules(policy)) {
		const verdict = classify(rule.path);
		if (verdict === "ignored") continue;
		const drop = policy.builtIn ? `declare ${WORKTREE_POLICY_FILE} with a \`skip\` row for ${JSON.stringify(rule.path)}, which replaces the built-in defaults` : `remove the row from ${policy.source}`;
		if (verdict === "tracked") refuse$2(`${policy.source}: ${rule.list} row ${JSON.stringify(rule.path)} names a path git TRACKS. The checkout already supplies it, so materializing it would write over committed content.`, `Either stop tracking ${rule.path}, or ${drop}.`);
		refuse$2(`${policy.source}: ${rule.list} row ${JSON.stringify(rule.path)} names a path git neither tracks nor ignores. Materializing it would leave the new worktree dirty at creation.`, `Either add ${rule.path} to .gitignore, or ${drop}.`);
	}
}
function resolveFarmDir(policy, repoRoot) {
	const root = resolve(repoRoot);
	const parent = dirname(root);
	let farm;
	if (policy.farmDir === void 0) farm = join(parent, WORKTREE_FARM_DIR_NAME, basename(root));
	else {
		if (isAbsolute(policy.farmDir)) refuse$2(`${policy.source}: \`farmDir\` ${JSON.stringify(policy.farmDir)} is an absolute path. The farm is a sibling of the repository — name it relative to the repository root.`, `Spell \`farmDir\` as a relative path such as \`../worktrees/${basename(root)}\`.`);
		farm = resolve(root, policy.farmDir);
		if (farm !== parent && !farm.startsWith(`${parent}${sep}`)) refuse$2(`${policy.source}: \`farmDir\` resolves to ${farm}, which escapes the repository's parent directory ${parent} via \`..\`. The farm must sit beside the repository, not at an arbitrary location.`, `Point \`farmDir\` at a directory under ${parent}.`);
		if (farm === parent) refuse$2(`${policy.source}: \`farmDir\` resolves to ${farm}, which is the repository's OWN parent directory. The farm must be a directory BESIDE the repository, not the directory that holds it — the repository itself would sit inside the farm.`, `Point \`farmDir\` at a new directory under ${parent}, such as \`../worktrees/${basename(root)}\`.`);
	}
	if (farm === root || farm.startsWith(`${root}${sep}`)) refuse$2(`${policy.source}: \`farmDir\` resolves to ${farm}, which is inside the repository at ${root}. Nothing this lane creates lands inside the working tree — a farm there would put a second checkout in front of the repository's own walks and would need an ignore rule to stay out of git status.`, `Point \`farmDir\` at a directory outside ${root}.`);
	return farm;
}
//#endregion
//#region src/worktree/setup.ts
var setup_exports = /* @__PURE__ */ __exportAll({
	UNANSWERED_CONSENT: () => UNANSWERED_CONSENT,
	WORKTREE_LOCK_SUBDIR: () => WORKTREE_LOCK_SUBDIR,
	applySetupConsent: () => applySetupConsent,
	isGranted: () => isGranted,
	planWorktreeSetup: () => planWorktreeSetup,
	probeSetupPresence: () => probeSetupPresence,
	resolveBranchPlan: () => resolveBranchPlan,
	runWorktreeSetup: () => runWorktreeSetup,
	worktreeLockPath: () => worktreeLockPath
});
function isGranted(answer) {
	return answer === "granted";
}
const UNANSWERED_CONSENT = Object.freeze({
	attach: "unanswered",
	track: "unanswered",
	secrets: "unanswered"
});
function refuse$1(message, next) {
	throw new EngineError(message, {
		code: "VALIDATION_ERROR",
		next
	});
}
async function resolveBranchPlan(run, repoRoot, branch, opts) {
	if (await localBranchExists(run, repoRoot, branch)) {
		const holder = (await listWorktrees(run, repoRoot)).find((entry) => entry.branch === branch);
		return {
			kind: "attach",
			branch,
			reason: `a local branch \`${branch}\` already exists`,
			remoteConsulted: false,
			checkedOutAt: holder?.path ?? null
		};
	}
	if (!opts.fetch) {
		const known = await remoteBranchExists(run, repoRoot, branch);
		return {
			kind: known ? "track" : "create",
			branch,
			reason: known ? `no local branch \`${branch}\`, and \`origin/${branch}\` is already known locally — the remote was NOT consulted for this preview` : `no local branch \`${branch}\` and no local \`origin/${branch}\` — the remote was NOT consulted for this preview`,
			remoteConsulted: false,
			checkedOutAt: null
		};
	}
	if (!await hasOriginRemote(run, repoRoot)) return {
		kind: "create",
		branch,
		reason: `no local branch \`${branch}\` and no \`origin\` remote to look in`,
		remoteConsulted: false,
		checkedOutAt: null
	};
	const known = await fetchBranch(run, repoRoot, branch) === "fetched" && await remoteBranchExists(run, repoRoot, branch);
	return {
		kind: known ? "track" : "create",
		branch,
		reason: known ? `\`origin/${branch}\` was found on the remote` : `\`origin\` has no branch \`${branch}\``,
		remoteConsulted: true,
		checkedOutAt: null
	};
}
async function planWorktreeSetup(opts) {
	const run = opts.run ?? runGit;
	const consent = opts.consent ?? UNANSWERED_CONSENT;
	await assertWorktreeName(run, opts.repoRoot, opts.name);
	const policy = opts.policy ?? await readWorktreePolicy(opts.repoRoot);
	const farmDir = resolveFarmDir(policy, opts.repoRoot);
	const worktreePath = worktreePathFor(farmDir, opts.name);
	const rules = materializationRules(policy);
	const classes = await classifyRepoPaths(run, opts.repoRoot, rules.map((rule) => rule.path));
	assertRulesAdmissible(policy, (relPath) => classes.get(relPath) ?? "untracked");
	const entries = rules.map((rule) => ({
		path: rule.path,
		strategy: rule.strategy,
		secret: rule.secret,
		reason: rule.reason ?? null
	}));
	const branchPlan = await resolveBranchPlan(run, opts.repoRoot, opts.name, { fetch: opts.fetch ?? true });
	return {
		name: opts.name,
		farmDir,
		worktreePath,
		policySource: policy.source,
		policy,
		entries,
		branchPlan,
		gates: planConsentGates(branchPlan, entries, consent)
	};
}
function planConsentGates(branchPlan, entries, consent) {
	const gates = [];
	if (branchPlan.kind === "attach") gates.push({
		gate: "attach",
		answer: consent.attach,
		effect: isGranted(consent.attach) ? "proceed" : "refuse"
	});
	if (branchPlan.kind === "track") gates.push({
		gate: "track",
		answer: consent.track,
		effect: isGranted(consent.track) ? "proceed" : consent.track === "declined" ? "create-instead" : "refuse"
	});
	if (entries.some((entry) => entry.secret)) gates.push({
		gate: "secrets",
		answer: consent.secrets,
		effect: isGranted(consent.secrets) ? "proceed" : "skip"
	});
	return gates;
}
function applySetupConsent(plan, consent, rerun) {
	const { branchPlan } = plan;
	if (branchPlan.kind === "attach") {
		if (branchPlan.checkedOutAt !== null) refuse$1(`The branch \`${branchPlan.branch}\` is already checked out in the worktree at ${branchPlan.checkedOutAt}, and a branch can be checked out in one worktree at a time.`, `Work in ${branchPlan.checkedOutAt}, or run setup under a different name.`);
		if (!isGranted(consent.attach)) {
			if (consent.attach === "declined") refuse$1(`A local branch \`${branchPlan.branch}\` already exists and --no-use-existing was given, so this run will not attach to it.`, `Pick a name with no branch behind it, or re-run: ${rerun} --use-existing`);
			refuse$1(`Setting up \`${plan.name}\` would ATTACH the new worktree to the existing local branch \`${branchPlan.branch}\`, and this run cannot ask.`, `Re-run with the decision made: ${rerun} --use-existing`);
		}
		return branchPlan;
	}
	if (branchPlan.kind === "track") {
		if (!isGranted(consent.track)) {
			if (consent.track === "declined") return {
				...branchPlan,
				kind: "create",
				reason: `\`origin/${branchPlan.branch}\` exists, but --no-track was given, so the branch is created off the current HEAD instead`
			};
			refuse$1(`Setting up \`${branchPlan.branch}\` would TRACK the remote branch \`origin/${branchPlan.branch}\`, and this run cannot ask.`, `Re-run with the decision made: ${rerun} --track`);
		}
	}
	return branchPlan;
}
const WORKTREE_LOCK_SUBDIR = join("stamity", "worktree");
function worktreeLockPath(gitCommonDir, name) {
	return join(gitCommonDir, WORKTREE_LOCK_SUBDIR, name);
}
async function runWorktreeSetup(opts) {
	const run = opts.run ?? runGit;
	const consent = opts.consent ?? UNANSWERED_CONSENT;
	const rerun = opts.rerun ?? `stamity worktree setup ${opts.name}`;
	const plan = await planWorktreeSetup({
		...opts,
		run,
		consent
	});
	const branchPlan = applySetupConsent(plan, consent, rerun);
	const notices = [];
	if (!isCrossProcessLockingEnabled()) notices.push("Cross-process locking is off for this run (STAMITY_LOCK=0 or an explicit opt-out), so a concurrent setup of this same name is UNSUPPORTED and may leave a half-built worktree.");
	const commonDir = await resolveGitCommonDir(run, opts.repoRoot);
	const release = await acquireWriteLock(worktreeLockPath(commonDir, opts.name), commonDir);
	try {
		return await setupUnderLock(plan, branchPlan, opts, run, consent, notices);
	} finally {
		await release();
	}
}
async function setupUnderLock(plan, branchPlan, opts, run, consent, notices) {
	if (await pathExists(plan.worktreePath)) refuse$1(`${plan.worktreePath} already exists, so there is nothing for this run to create.`, `Run \`stamity worktree cleanup ${plan.name}\` first, or set up under a different name.`);
	await mkdir(plan.farmDir, {
		recursive: true,
		mode: 448
	});
	await chmod(plan.farmDir, 448);
	await addWorktree(run, opts.repoRoot, {
		path: plan.worktreePath,
		branch: branchPlan.branch,
		kind: branchPlan.kind
	});
	const withheld = plan.entries.filter((entry) => entry.secret && !isGranted(consent.secrets));
	if (withheld.length > 0) notices.push(`${withheld.length === 1 ? "One entry holds" : `${withheld.length} entries hold`} secret material (${withheld.map((entry) => entry.path).join(", ")}) and was not copied, because this run had no consent for it. Re-run with --copy-secrets to place it.`);
	const options = {
		sourceRoot: opts.repoRoot,
		worktreeRoot: plan.worktreePath,
		isSkipped: (relPath) => resolveStrategy(plan.policy, relPath) === "skip",
		isKnownCredential: isKnownCredentialPath,
		secretsGranted: isGranted(consent.secrets)
	};
	const entries = [];
	const placed = [];
	for (const entry of plan.entries) {
		if (entry.secret && !isGranted(consent.secrets)) {
			entries.push({
				path: entry.path,
				requested: entry.strategy,
				strategy: entry.strategy,
				outcome: "skipped",
				reason: "this run had no consent to copy secret material (--copy-secrets)",
				mode: null,
				errno: null,
				fallbackFrom: null
			});
			continue;
		}
		const results = await materializeEntries([{
			relPath: entry.path,
			strategy: entry.strategy,
			secret: entry.secret
		}], options);
		placed.push(...results);
		entries.push(...results.map(toEntryReport));
		notices.push(...placementNotices(results));
	}
	let head = "";
	let receiptPath = null;
	let receiptFailure = null;
	try {
		head = await resolveSha(run, plan.worktreePath);
		const gitDir = await resolveWorktreeGitDir(run, plan.worktreePath);
		const receiptEntries = placed.map(receiptEntryFor).filter((entry) => entry !== null);
		receiptPath = await writeWorktreeReceipt(gitDir, createWorktreeReceipt({
			createdAt: (opts.now?.() ?? /* @__PURE__ */ new Date()).toISOString(),
			engineVersion: opts.engineVersion,
			worktree: {
				path: plan.worktreePath,
				branch: branchPlan.branch,
				head
			},
			entries: receiptEntries
		}));
	} catch (error) {
		receiptFailure = error instanceof Error ? error.message : String(error);
	}
	const setup = await probeSetupPresence(plan.worktreePath);
	notices.push(...presenceNotices(setup, plan.worktreePath));
	notices.push("Records under .stamity/handoffs/ and .stamity/learnings/ travel only once they are COMMITTED — a checkout carries committed content, so uncommitted ones stay where they are.");
	const failed = entries.filter((entry) => entry.outcome === "failed");
	const partial = failed.length > 0 || receiptFailure !== null;
	return {
		status: partial ? "partial" : "complete",
		worktree: {
			path: plan.worktreePath,
			branch: branchPlan.branch,
			head
		},
		branchPlan: branchPlan.kind,
		entries,
		notices,
		setup,
		receiptPath,
		error: partial ? {
			code: "FS_ERROR",
			message: receiptFailure === null ? `The worktree was created, but ${failed.length} of ${entries.length} entries could not be placed.` : `The worktree was created, but its receipt could not be written: ${receiptFailure}`,
			next: receiptFailure === null ? `Fix the cause, then run \`stamity worktree cleanup ${plan.name}\` to take the tree back down — its receipt inverts the entries that DID land — and set up again.` : `The worktree has no receipt to scope a teardown, so run \`stamity worktree cleanup ${plan.name} --force\` to remove the whole tree, then set up again.`
		} : null
	};
}
function toEntryReport(result) {
	return {
		path: result.relPath,
		requested: result.requested,
		strategy: result.strategy,
		outcome: result.outcome,
		reason: result.reason ?? null,
		mode: result.mode ?? null,
		errno: result.errno ?? null,
		fallbackFrom: result.fallbackFrom ?? null
	};
}
function placementNotices(results) {
	const notices = [];
	for (const result of results) {
		if (result.fallbackFrom === "symlink" && result.outcome !== "failed") notices.push(`${result.relPath}: the platform refused a symlink, so it was COPIED instead. The receipt records \`copy\`, and cleanup will invert it as one.`);
		if (result.secretModeApplied === false) notices.push(`${result.relPath}: this platform has no POSIX mode, so the secret copy was left at whatever permissions the platform gave it rather than hardened to 0600.`);
		if (result.outcome === "withheld") notices.push(`${result.relPath}: holds secret material (a known credential name found inside a copied directory) and was not copied, because this run had no consent for it. Re-run with --copy-secrets to place it.`);
	}
	return notices;
}
function presenceNotices(setup, worktreePath) {
	if (setup === "absent") return [`This branch predates the setup: ${join(worktreePath, ".stamity", "manifest.json")} is not there. Run \`stamity init\` inside ${worktreePath} to give the worktree its own.`];
	if (setup === "unreadable") return [`${join(worktreePath, ".stamity", "manifest.json")} exists but does not parse. Run \`stamity check\` inside ${worktreePath}.`];
	return [];
}
async function probeSetupPresence(worktreePath) {
	const manifestPath = join(worktreePath, ".stamity", "manifest.json");
	let text;
	try {
		text = await readFile(manifestPath, "utf8");
	} catch {
		return "absent";
	}
	try {
		const parsed = JSON.parse(text);
		return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? "present" : "unreadable";
	} catch {
		return "unreadable";
	}
}
async function pathExists(absPath) {
	try {
		await lstat(absPath);
		return true;
	} catch {
		return false;
	}
}
//#endregion
//#region src/worktree/cleanup.ts
var cleanup_exports = /* @__PURE__ */ __exportAll({
	isInside: () => isInside,
	readWorktreeInventory: () => readWorktreeInventory,
	runWorktreeCleanup: () => runWorktreeCleanup
});
function refuse(message, next) {
	throw new EngineError(message, {
		code: "VALIDATION_ERROR",
		next
	});
}
const nativePathOps = {
	relative,
	resolve,
	sep,
	isAbsolute
};
function isInside(child, parent, pathOps = nativePathOps) {
	const rel = pathOps.relative(pathOps.resolve(parent), pathOps.resolve(child));
	return rel === "" || !rel.startsWith(`..${pathOps.sep}`) && rel !== ".." && !pathOps.isAbsolute(rel);
}
async function readWorktreeInventory(opts) {
	const run = opts.run ?? runGit;
	const entries = await listWorktrees(run, opts.repoRoot);
	const rows = [];
	for (const entry of entries) rows.push(await classifyInventoryEntry(run, entry, opts.farmDir, opts.repoRoot));
	return {
		worktrees: rows,
		stash: { entries: await readStashCount(run, opts.repoRoot) }
	};
}
async function classifyInventoryEntry(run, entry, farmDir, repoRoot) {
	const base = {
		entry,
		receipt: null,
		droppedRows: [],
		gitDir: null,
		dirty: null
	};
	if (entry.prunable) return {
		...base,
		classification: "prunable",
		reason: entry.prunableReason ?? "the registration points at a directory that is gone"
	};
	if (entry.locked) return {
		...base,
		classification: "locked",
		reason: entry.lockReason ?? "the worktree is locked"
	};
	if (resolve(entry.path) === resolve(repoRoot) || !isInside(entry.path, farmDir)) return {
		...base,
		classification: "other",
		reason: `registered outside the farm at ${farmDir}`
	};
	const gitDir = await resolveWorktreeGitDir(run, entry.path);
	const read = await readWorktreeReceipt(gitDir);
	if (read.receipt === null) return {
		...base,
		gitDir,
		classification: "managed-orphan",
		reason: read.unreadable,
		dirty: await readDirtyCounts(run, entry.path)
	};
	return {
		entry,
		classification: "managed",
		reason: null,
		receipt: read.receipt,
		droppedRows: read.droppedRows,
		gitDir,
		dirty: await readDirtyCounts(run, entry.path)
	};
}
async function runWorktreeCleanup(opts) {
	const run = opts.run ?? runGit;
	const names = opts.names ?? [];
	const all = opts.all === true;
	const rerun = opts.rerun ?? "stamity worktree cleanup";
	if (names.length === 0 && !all) throw new EngineError("cleanup needs a name, or --all to sweep every worktree this lane manages.", {
		code: "VALIDATION_ERROR",
		next: `Run \`${rerun} <name>\`, or \`${rerun} --all\`.`
	});
	const inventory = await readWorktreeInventory({
		...opts,
		run
	});
	const candidates = selectCandidates(inventory, opts.farmDir, names, all);
	for (const row of candidates) {
		if (!isInside(opts.cwd, row.entry.path)) continue;
		refuse(`The current directory ${opts.cwd} is inside ${row.entry.path}, which this run would remove.`, `Run the command from ${opts.repoRoot} instead.`);
	}
	if (all && !isGranted(opts.force ?? "unanswered") && candidates.length > 0) refuse(`\`--all\` would take down ${candidates.length} worktree${candidates.length === 1 ? "" : "s"}, and this run cannot ask.`, `Re-run with the decision made: ${rerunWith(rerun, "--all", "-y")}`);
	const notices = [];
	const reports = [];
	const commonDir = await resolveGitCommonDir(run, opts.repoRoot);
	for (const row of candidates) try {
		reports.push(await cleanOne(row, opts, run, commonDir, rerun));
	} catch (error) {
		if (error instanceof EngineError && error.code === "VALIDATION_ERROR") throw error;
		reports.push(failedTreeReport(row, error));
	}
	for (const row of inventory.worktrees) {
		if (candidates.includes(row) || isCleanable(row)) continue;
		if (row.classification === "prunable") continue;
		if (resolve(row.entry.path) === resolve(opts.repoRoot)) continue;
		reports.push(skippedReport(row));
	}
	for (const report of reports) if (report.classification === "managed-orphan" && report.removed) notices.push(`${report.path}: removed the whole tree with --force — it carried no readable receipt, so nothing scoped the removal to individual files.`);
	const prunable = inventory.worktrees.filter((row) => row.classification === "prunable");
	if (prunable.length > 0) await pruneWorktrees(run, opts.repoRoot);
	if (inventory.stash.entries > 0) notices.push(`This clone has ${inventory.stash.entries} stash ${inventory.stash.entries === 1 ? "entry" : "entries"}. A stash is one list for the whole clone and belongs to no worktree, so nothing here removed or moved it.`);
	return {
		status: reports.some((report) => report.treeFailure !== null || report.files.some((file) => file.outcome === "failed")) ? "partial" : "complete",
		worktrees: reports,
		pruned: prunable.length,
		notices,
		stash: inventory.stash
	};
}
function isCleanable(row) {
	return row.classification === "managed" || row.classification === "managed-orphan";
}
function selectCandidates(inventory, farmDir, names, all) {
	const cleanable = inventory.worktrees.filter(isCleanable);
	if (all) return cleanable;
	const wanted = new Set(names.map((name) => resolve(farmDir, name)));
	return cleanable.filter((row) => wanted.has(resolve(row.entry.path)));
}
function skippedReport(row) {
	return {
		path: row.entry.path,
		branch: row.entry.branch,
		classification: row.classification,
		files: [],
		droppedRows: row.droppedRows,
		removed: false,
		branchCommand: null,
		skipped: row.reason ?? "not managed by this lane",
		treeFailure: null
	};
}
function failedTreeReport(row, error) {
	const branch = row.entry.branch;
	const message = error instanceof Error ? error.message : String(error);
	return {
		path: row.entry.path,
		branch: branch === "" ? null : branch,
		classification: row.classification,
		files: [],
		droppedRows: row.droppedRows,
		removed: false,
		branchCommand: null,
		skipped: null,
		treeFailure: message
	};
}
async function cleanOne(row, opts, run, commonDir, rerun) {
	const name = relative(resolve(opts.farmDir), resolve(row.entry.path)).split(sep).join("/");
	const release = await acquireWriteLock(worktreeLockPath(commonDir, name), commonDir);
	try {
		return await invertOne(await classifyInventoryEntry(run, row.entry, opts.farmDir, opts.repoRoot), name, opts, run, rerun);
	} finally {
		await release();
	}
}
function rerunWith(rerun, ...tokens) {
	const present = new Set(rerun.split(/\s+/).filter((token) => token !== ""));
	const missing = tokens.filter((token) => !present.has(token));
	return missing.length === 0 ? rerun : `${rerun} ${missing.join(" ")}`;
}
function orphanRemovedReport(row) {
	const branch = row.entry.branch;
	return {
		path: row.entry.path,
		branch: branch === "" ? null : branch,
		classification: row.classification,
		files: [],
		droppedRows: row.droppedRows,
		removed: true,
		branchCommand: branch !== null && branch !== "" ? `git branch -d ${branch}` : null,
		skipped: null,
		treeFailure: null
	};
}
async function invertOrphan(row, name, opts, run, rerun) {
	if (opts.filesOnly === true) return skippedReport(row);
	if (!isGranted(opts.force ?? "unanswered")) refuse(`${row.entry.path} sits inside the farm but carries no readable receipt, so this run cannot verify what it placed. Removing it takes the WHOLE tree and needs --force.`, `Re-run with the decision made: ${rerunWith(rerun, name, "--force")}`);
	await removeWorktree(run, opts.repoRoot, row.entry.path, true);
	return orphanRemovedReport(row);
}
async function invertOne(row, name, opts, run, rerun) {
	const receipt = row.receipt;
	if (receipt === null) return await invertOrphan(row, name, opts, run, rerun);
	const dirty = row.dirty !== null && isDirty(row.dirty);
	if (opts.filesOnly !== true && dirty && !isGranted(opts.force ?? "unanswered")) refuse(`${row.entry.path} carries uncommitted changes (${row.dirty?.modified ?? 0} modified, ${row.dirty?.untracked ?? 0} untracked), and this run cannot ask.`, `Re-run with the decision made: ${rerunWith(rerun, name, "--force")}`);
	const files = [];
	const removedPaths = [];
	for (const entry of receipt.entries) {
		const absolute = join(row.entry.path, entry.path);
		const verdict = classifyReceiptEntry(entry, await inspectEntryState(absolute));
		if (verdict.disposition !== "remove") {
			files.push({
				path: entry.path,
				outcome: verdict.disposition === "absent" ? "absent" : "kept",
				reason: verdict.reason,
				detail: verdict.reason === "diverged" ? "the bytes differ from what setup placed, so the copy was left where it is" : null
			});
			continue;
		}
		try {
			await rm(absolute, { force: true });
			files.push({
				path: entry.path,
				outcome: "removed",
				reason: verdict.reason,
				detail: null
			});
			removedPaths.push(absolute);
		} catch (error) {
			files.push({
				path: entry.path,
				outcome: "failed",
				reason: "failed",
				detail: error instanceof Error ? error.message : String(error)
			});
		}
	}
	await pruneEmptyAncestors(removedPaths, row.entry.path);
	if (opts.filesOnly === true) return cleanupReport(row, files, receipt, false, null);
	await removeWorktree(run, opts.repoRoot, row.entry.path, dirty);
	return cleanupReport(row, files, receipt, true, null);
}
function cleanupReport(row, files, receipt, removed, skipped) {
	const branch = row.entry.branch ?? receipt.worktree.branch;
	return {
		path: row.entry.path,
		branch: branch === "" ? null : branch,
		classification: row.classification,
		files,
		droppedRows: row.droppedRows,
		removed,
		branchCommand: removed && branch !== "" ? `git branch -d ${branch}` : null,
		skipped,
		treeFailure: null
	};
}
async function pruneEmptyAncestors(removedPaths, worktreeRoot) {
	const root = resolve(worktreeRoot);
	const candidates = [...new Set(removedPaths.map((path) => dirname(resolve(path))))].toSorted((a, b) => b.split(sep).length - a.split(sep).length);
	for (let directory of candidates) while (directory !== root && isInside(directory, root)) {
		const contents = await readdir(directory).catch(() => null);
		if (contents === null || contents.length > 0) break;
		if (!await rmdir(directory).then(() => true, () => false)) break;
		directory = dirname(directory);
	}
}
//#endregion
//#region src/content/mdcCompanions.ts
var mdcCompanions_exports = /* @__PURE__ */ __exportAll({
	cursorCompanionFrontmatter: () => cursorCompanionFrontmatter,
	generateMdcCompanions: () => generateMdcCompanions,
	planMdcCompanions: () => planMdcCompanions,
	resolveRuleActivation: () => resolveRuleActivation
});
const RULE_SCOPES = [
	"always",
	"agent-requested",
	"conditional"
];
const DESCRIPTION_FIELD = "description";
const SCOPE_FIELD = "scope";
const GLOBS_FIELD = "globs";
const MD_EXTENSION = ".md";
const MDC_EXTENSION = ".mdc";
const IO_CONCURRENCY = 8;
function cursorCompanionFrontmatter(mdFrontmatter, options = {}) {
	const source = options.source ?? "rule frontmatter";
	const description = requireString(mdFrontmatter, DESCRIPTION_FIELD, {
		source,
		optional: true
	}) ?? "";
	const scope = requireEnum(mdFrontmatter, SCOPE_FIELD, RULE_SCOPES, {
		source,
		optional: true
	});
	const globs = readGlobs(mdFrontmatter, source);
	return `---\n${[`${DESCRIPTION_FIELD}: ${descriptionScalar(description)}`, ...activationLines(scope, globs, source, options.warnings)].join("\n")}\n---`;
}
function planMdcCompanions(rules, options = {}) {
	return rules.filter((item) => item.type === "rule").map((rule) => ({
		sourcePath: rule.filePath,
		outputPath: companionPathFor(rule.filePath),
		content: companionContent(rule.frontmatter, rule.body, {
			source: rule.relativePath,
			warnings: options.warnings
		})
	}));
}
async function generateMdcCompanions(rulesDir, options = {}) {
	const entries = await listMarkdown(rulesDir);
	const companions = (await pLimit(IO_CONCURRENCY).map(entries, async (entry) => {
		const sourcePath = join(rulesDir, entry);
		const raw = await readFile(sourcePath, "utf8").catch(nullOnMissing);
		return raw === null ? null : {
			entry,
			sourcePath,
			raw
		};
	})).flatMap((source) => {
		if (source === null) return [];
		const parsed = parseFrontmatter(source.raw, source.entry);
		if (!parsed.hadFrontmatter) return [];
		return [{
			sourcePath: source.sourcePath,
			outputPath: companionPathFor(source.sourcePath),
			content: companionContent(parsed.frontmatter, parsed.body, {
				source: source.entry,
				warnings: options.warnings
			})
		}];
	});
	await pLimit(IO_CONCURRENCY).map(companions, (companion) => atomicWriteFile(companion.outputPath, companion.content));
	return companions.map((companion) => companion.outputPath);
}
function companionContent(frontmatter, body, options) {
	return `${cursorCompanionFrontmatter(frontmatter, options)}\n${body}`;
}
function companionPathFor(mdPath) {
	return `${mdPath.endsWith(MD_EXTENSION) ? mdPath.slice(0, -3) : mdPath}${MDC_EXTENSION}`;
}
function resolveRuleActivation(scope, globs, source, warnings) {
	if (scope === "always") throw new EngineError(`${source} declares \`${SCOPE_FIELD}: always\`, which this client would emit as an always-applied rule. Rules attach on globs; content that must bind every session belongs in the AGENTS.md charter. Give the rule \`${SCOPE_FIELD}: conditional\` with \`${GLOBS_FIELD}\`, or \`${SCOPE_FIELD}: agent-requested\`, or move it into the charter.`, { code: "VALIDATION_ERROR" });
	if (scope === "agent-requested" && globs.length > 0) throw new EngineError(`${source} declares \`${SCOPE_FIELD}: agent-requested\` and \`${GLOBS_FIELD}\`, which name two different activation modes: description-driven, and auto-attach on those paths. Declare \`${SCOPE_FIELD}: conditional\` to attach on the globs, or drop the \`${GLOBS_FIELD}\` line to keep the rule description-driven.`, { code: "VALIDATION_ERROR" });
	if (globs.length === 0) {
		if (scope === "conditional") warnings?.push(`${source}: \`${SCOPE_FIELD}: conditional\` without \`${GLOBS_FIELD}\` is the deprecated glob-less form; emitted as description-driven (\`alwaysApply: false\`). Declare \`${SCOPE_FIELD}: agent-requested\`.`);
		return { kind: "description-driven" };
	}
	if (scope === void 0) warnings?.push(`${source}: \`${GLOBS_FIELD}\` declared without a \`${SCOPE_FIELD}\`; read as \`${SCOPE_FIELD}: conditional\`. Declare the scope.`);
	return {
		kind: "glob-attached",
		globs
	};
}
function activationLines(scope, globs, source, warnings) {
	const activation = resolveRuleActivation(scope, globs, source, warnings);
	if (activation.kind === "description-driven") return ["alwaysApply: false"];
	const rendered = activation.globs.map((glob) => JSON.stringify(glob)).join(", ");
	return [`${GLOBS_FIELD}: [${rendered}]`, "alwaysApply: false"];
}
function readGlobs(frontmatter, source) {
	const value = Object.hasOwn(frontmatter, GLOBS_FIELD) ? frontmatter[GLOBS_FIELD] : void 0;
	if (value === void 0 || value === null) return [];
	if (typeof value === "string") return dedupe(value.split(","));
	if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) return dedupe(value);
	throw new EngineError(`${source}: \`${GLOBS_FIELD}\` must be a list of glob strings or one comma-separated string (got ${describeGlobs(value)}).`, { code: "VALIDATION_ERROR" });
}
function dedupe(globs) {
	const seen = /* @__PURE__ */ new Set();
	for (const glob of globs) {
		const value = glob.trim();
		if (value !== "") seen.add(value);
	}
	return [...seen];
}
function describeGlobs(value) {
	if (Array.isArray(value)) return "an array with a non-string entry";
	return value === null ? "null" : typeof value;
}
function descriptionScalar(description) {
	const singleLine = description.replace(/\s*[\r\n]+\s*/g, " ").trim();
	if (singleLine === "") return singleLine;
	return /["\\]/.test(singleLine) || /:(\s|$)/.test(singleLine) || /\s#/.test(singleLine) || /^(?:[,[\]{}#&*!|>'%@`]|[-?:](?:\s|$))/.test(singleLine) ? JSON.stringify(singleLine) : singleLine;
}
async function listMarkdown(dir) {
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch (error) {
		if (isMissing(error)) return [];
		throw error;
	}
	return entries.filter((entry) => entry.isFile() && entry.name.endsWith(MD_EXTENSION)).map((entry) => entry.name).toSorted();
}
function nullOnMissing(error) {
	if (isMissing(error)) return null;
	throw error;
}
function isMissing(error) {
	const code = error?.code;
	return code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR";
}
//#endregion
//#region src/handoffs/store.ts
var store_exports = /* @__PURE__ */ __exportAll({
	DEFAULT_ARCHIVE_RETENTION_DAYS: () => 90,
	archiveHandoff: () => archiveHandoff,
	buildHandoffIndex: () => buildHandoffIndex,
	listHandoffs: () => listHandoffs,
	pruneHandoffs: () => pruneHandoffs,
	readHandoff: () => readHandoff,
	writeHandoff: () => writeHandoff
});
const HANDOFFS_DIR = "handoffs";
const ARCHIVE_DIR = "archive";
const HANDOFF_FILE_EXTENSION = ".md";
function liveDir(rootDir) {
	return join(rootDir, STATE_DIR, HANDOFFS_DIR);
}
function archiveDir(rootDir) {
	return join(liveDir(rootDir), ARCHIVE_DIR);
}
const MS_PER_DAY = 864e5;
const UNFINISHED_STATUSES = /* @__PURE__ */ new Set(["active", "in-progress"]);
const READ_CONCURRENCY = 8;
const MUTATION_CONCURRENCY = 4;
const ID_DRAW_ATTEMPTS = 3;
async function writeHandoff(opts) {
	const now = opts.now ?? /* @__PURE__ */ new Date();
	const dir = liveDir(opts.rootDir);
	const live = await loadDirectory(dir);
	const activeCount = live.filter((handoff) => UNFINISHED_STATUSES.has(handoff.frontmatter.status)).length;
	if (activeCount >= 25) throw new EngineError(`${dir} already holds ${activeCount} unfinished handoffs, the maximum of 25. Archive the ones that are done before writing another.`, { code: "VALIDATION_ERROR" });
	const id = drawId(opts.slug, now, new Set(live.map((handoff) => handoff.frontmatter.id)), dir);
	const body = `${opts.body.trim()}\n`;
	const frontmatter = {
		id,
		status: "active",
		created: now.toISOString(),
		expires: new Date(now.getTime() + 30 * MS_PER_DAY).toISOString(),
		summary: opts.summary,
		...opts.fromTool === void 0 ? {} : { fromTool: opts.fromTool },
		...opts.toTool === void 0 ? {} : { toTool: opts.toTool },
		...opts.gitRef === void 0 ? {} : { gitRef: opts.gitRef },
		integrity: computeHandoffIntegrity(opts.summary, body)
	};
	const path = join(dir, `${id}${HANDOFF_FILE_EXTENSION}`);
	const document = serialize(frontmatter, body);
	const validation = validateHandoffContent(document, path);
	if (!validation.valid) throw new EngineError(`Refusing to write the handoff to ${path}:\n${validation.errors.map((line) => `  - ${line}`).join("\n")}`, { code: "VALIDATION_ERROR" });
	await atomicWriteFile(path, document);
	return {
		id,
		path
	};
}
function drawId(slug, now, taken, dir) {
	for (let attempt = 0; attempt < ID_DRAW_ATTEMPTS; attempt += 1) {
		const id = generateHandoffId(slug, now);
		if (!taken.has(id)) return id;
	}
	throw new EngineError(`Could not draw an unused handoff id for ${JSON.stringify(slug)} after ${ID_DRAW_ATTEMPTS} attempts against ${dir}. Re-run; if it repeats, the directory holds an implausible number of same-day handoffs and needs pruning.`, { code: "VALIDATION_ERROR" });
}
async function readHandoff(rootDir, id) {
	if (!HANDOFF_ID_PATTERN.test(id)) return null;
	const file = `${id}${HANDOFF_FILE_EXTENSION}`;
	return await readHandoffFile(join(liveDir(rootDir), file)) ?? await readHandoffFile(join(archiveDir(rootDir), file));
}
async function listHandoffs(rootDir, filter = {}) {
	const [live, archived] = await Promise.all([loadDirectory(liveDir(rootDir)), loadDirectory(archiveDir(rootDir))]);
	return [...live, ...archived].filter(({ frontmatter }) => filter.status === void 0 || frontmatter.status === filter.status).filter(({ frontmatter }) => filter.toTool === void 0 || frontmatter.toTool === filter.toTool).toSorted(byNewestFirst);
}
async function buildHandoffIndex(rootDir, opts = {}) {
	const now = opts.now ?? /* @__PURE__ */ new Date();
	const active = (await loadDirectory(liveDir(rootDir))).filter((handoff) => UNFINISHED_STATUSES.has(handoff.frontmatter.status) && !isHandoffExpired(handoff, now) && verifyHandoffIntegrity(handoff)).map(toIndexEntry).toSorted((a, b) => compare$1(timestamp(a.expires), timestamp(b.expires)) || compare$1(a.id, b.id));
	return {
		active,
		count: active.length
	};
}
function toIndexEntry({ frontmatter }) {
	const { id, summary, expires, fromTool } = frontmatter;
	if (fromTool === void 0) return {
		id,
		summary,
		expires
	};
	return {
		id,
		summary,
		expires,
		fromTool
	};
}
async function archiveHandoff(rootDir, id) {
	const handoff = await readHandoff(rootDir, id);
	if (handoff === null) throw new EngineError(`No handoff ${JSON.stringify(id)} under ${liveDir(rootDir)}. List the store to see the ids it holds.`, { code: "FS_ERROR" });
	await archiveLoaded(rootDir, handoff);
}
async function archiveLoaded(rootDir, handoff) {
	const { frontmatter, body, filePath } = handoff;
	if (!isValidStatusTransition(frontmatter.status, "archived")) throw new EngineError(`Handoff ${JSON.stringify(frontmatter.id)} is ${frontmatter.status}, and ${frontmatter.status} → archived is not a valid transition. Write a new handoff instead of reopening this one.`, { code: "VALIDATION_ERROR" });
	const target = join(archiveDir(rootDir), `${frontmatter.id}${HANDOFF_FILE_EXTENSION}`);
	await atomicWriteFile(target, serialize({
		...frontmatter,
		status: "archived"
	}, body));
	if (target === filePath) return;
	await removeFile(filePath, `${target} holds the archived copy; remove ${filePath} by hand`);
}
async function pruneHandoffs(rootDir, opts = {}) {
	const now = opts.now ?? /* @__PURE__ */ new Date();
	const retentionDays = opts.retentionDays ?? 90;
	if (!Number.isFinite(retentionDays) || retentionDays < 0) throw new EngineError(`retentionDays must be a non-negative number of days (got ${JSON.stringify(retentionDays)}).`, { code: "VALIDATION_ERROR" });
	const [live, archived] = await Promise.all([loadDirectory(liveDir(rootDir)), loadDirectory(archiveDir(rootDir))]);
	const expired = live.filter((handoff) => isHandoffExpired(handoff, now) && isValidStatusTransition(handoff.frontmatter.status, "archived"));
	const archiving = new Set(expired.map((handoff) => handoff.frontmatter.id));
	const cutoff = now.getTime() - retentionDays * MS_PER_DAY;
	const stale = archived.filter((handoff) => {
		if (archiving.has(handoff.frontmatter.id)) return false;
		const expires = timestamp(handoff.frontmatter.expires);
		return expires !== null && expires <= cutoff;
	});
	const limit = pLimit(MUTATION_CONCURRENCY);
	await limit.map(expired, (handoff) => archiveLoaded(rootDir, handoff));
	await limit.map(stale, (handoff) => removeFile(handoff.filePath));
	return {
		archivedExpired: expired.map((handoff) => handoff.frontmatter.id).toSorted(),
		deleted: stale.map((handoff) => handoff.frontmatter.id).toSorted()
	};
}
async function loadDirectory(dir) {
	const files = await listHandoffFiles(dir);
	return (await pLimit(READ_CONCURRENCY).map(files, (file) => readHandoffFile(join(dir, file)))).filter((handoff) => handoff !== null);
}
async function listHandoffFiles(dir) {
	try {
		return (await readdir(dir)).filter((name) => name.endsWith(HANDOFF_FILE_EXTENSION)).toSorted();
	} catch (cause) {
		if (errnoCode(cause) === "ENOENT") return [];
		throw new EngineError(`Cannot read the handoff directory ${dir}: ${describe(cause)}. Check the path and its permissions.`, {
			code: "FS_ERROR",
			cause
		});
	}
}
async function readHandoffFile(path) {
	let raw;
	try {
		const stats = await stat(path);
		if (!stats.isFile() || stats.size > 61440) return null;
		raw = await readFile(path, "utf8");
	} catch (cause) {
		if (errnoCode(cause) === "ENOENT") return null;
		throw new EngineError(`Cannot read the handoff at ${path}: ${describe(cause)}. Check the file and its permissions.`, {
			code: "FS_ERROR",
			cause
		});
	}
	return toHandoff(raw, path);
}
async function removeFile(path, remedy) {
	try {
		await unlink(path);
	} catch (cause) {
		if (errnoCode(cause) === "ENOENT") return;
		const next = remedy ?? `Check the file and its permissions`;
		throw new EngineError(`Cannot remove ${path}: ${describe(cause)}. ${next}.`, {
			code: "FS_ERROR",
			cause
		});
	}
}
function serialize(frontmatter, body) {
	return composeFrontmatter({
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
function toHandoff(raw, filePath) {
	let parsed;
	try {
		parsed = parseFrontmatter(raw, filePath);
	} catch {
		return null;
	}
	if (!parsed.hadFrontmatter) return null;
	const head = parsed.frontmatter;
	const id = readString(head, "id");
	const status = readValue(head, "status");
	const created = readString(head, "created");
	const expires = readString(head, "expires");
	const summary = readString(head, "summary");
	const integrity = readString(head, "integrity");
	if (id === void 0 || !isHandoffStatus(status) || created === void 0 || expires === void 0 || summary === void 0 || integrity === void 0) return null;
	const fromTool = readTool(head, "fromTool");
	const toTool = readTool(head, "toTool");
	const gitRef = readString(head, "gitRef");
	return {
		frontmatter: {
			id,
			status,
			created,
			expires,
			summary,
			...fromTool === void 0 ? {} : { fromTool },
			...toTool === void 0 ? {} : { toTool },
			...gitRef === void 0 ? {} : { gitRef },
			integrity
		},
		body: parsed.body,
		filePath
	};
}
function readValue(head, field) {
	return Object.hasOwn(head, field) ? head[field] : void 0;
}
function readString(head, field) {
	const value = readValue(head, field);
	return typeof value === "string" ? value : void 0;
}
function readTool(head, field) {
	const value = readValue(head, field);
	return typeof value === "string" && VALID_TOOLS.has(value) ? value : void 0;
}
function byNewestFirst(a, b) {
	return compare$1(timestamp(b.frontmatter.created), timestamp(a.frontmatter.created)) || compare$1(a.frontmatter.id, b.frontmatter.id);
}
function timestamp(value) {
	const ms = Date.parse(value);
	return Number.isNaN(ms) ? null : ms;
}
function compare$1(a, b) {
	if (a === b) return 0;
	if (a === null) return -1;
	if (b === null) return 1;
	return a < b ? -1 : 1;
}
function errnoCode(cause) {
	const code = cause?.code;
	return typeof code === "string" ? code : void 0;
}
function describe(cause) {
	return cause instanceof Error ? cause.message : String(cause);
}
//#endregion
//#region src/pack/sign.ts
var sign_exports = /* @__PURE__ */ __exportAll({ signPack: () => signPack });
function foldedPath(path) {
	return path.normalize("NFC").toLowerCase();
}
async function assertBundleDestination(root, manifest, bundlePath) {
	const segments = bundlePath.split("/");
	const reserved = new Set([PACK_MANIFEST_FILE, ...Object.keys(manifest.integrity)].map(foldedPath));
	const folded = foldedPath(bundlePath);
	if (segments.some((segment) => segment === "" || segment === "." || segment.includes(":") || /[ .]$/.test(segment)) || reserved.has(folded) || PACK_CONTENT_CLASSES.some((name) => folded === name || folded.startsWith(`${name}/`))) throw new EngineError("The detached bundle must use an unambiguous path outside the manifest, content classes and integrity map.", { code: "VALIDATION_ERROR" });
	const target = resolve(root, bundlePath);
	await assertWriteTargetContained(target, root);
	const paths = segments.map((_, index) => join(root, ...segments.slice(0, index + 1)));
	const entries = await Promise.all(paths.map(async (path) => {
		try {
			return await lstat(path, { bigint: true });
		} catch (error) {
			if (error.code === "ENOENT") return void 0;
			throw error;
		}
	}));
	if (entries.some((entry, index) => entry !== void 0 && (entry.isSymbolicLink() || index < entries.length - 1 && !entry.isDirectory()))) throw new EngineError("The detached bundle path must not contain symlinks or non-directory ancestors.", { code: "INTEGRITY_ERROR" });
	const existing = entries.at(-1);
	if (existing !== void 0) {
		if (!existing.isFile() || existing.nlink > 1n) throw new EngineError("The detached bundle target must be a regular, unshared file; symlinks are refused.", { code: "INTEGRITY_ERROR" });
		if ((await Promise.all(["pack.json", ...Object.keys(manifest.integrity)].map((path) => stat(join(root, path), { bigint: true })))).some((entry) => entry.dev === existing.dev && entry.ino === existing.ino)) throw new EngineError("The detached bundle target aliases a protected pack input.", { code: "INTEGRITY_ERROR" });
	}
	return target;
}
async function signPack(packRoot, options = {}) {
	const root = await realpath(resolve(packRoot));
	const manifest = await readPackManifest(root);
	const signing = manifest.signing;
	if (signing?.method !== "sigstore" || signing.signer === void 0 || signing.bundlePath === void 0) throw new EngineError("Author signing requires signing.method sigstore, signer and bundlePath in pack.json.", { code: "VALIDATION_ERROR" });
	const target = await assertBundleDestination(root, manifest, signing.bundlePath);
	await verifyIntegrityMap(root, manifest, await enumeratePackContent(root));
	const aggregateSha = computeAggregateContentSha(manifest.integrity);
	const payload = sigstoreSignedPayload(aggregateSha);
	let bundle;
	try {
		bundle = await (options.signFn ?? (await import("sigstore")).sign)(payload);
	} catch {
		throw new EngineError("Signing failed. Check the authorized OIDC identity and Sigstore network access; no bundle was written.", { code: "INTEGRITY_ERROR" });
	}
	const bytes = Buffer.from(`${JSON.stringify(bundle)}\n`);
	if (bytes.length > 1048576) throw new EngineError("The signing provider returned a bundle over the accepted size limit.", { code: "INTEGRITY_ERROR" });
	if (!(await verifySigstoreBundle(bytes, payload, {
		signer: signing.signer,
		...options.verifyFn === void 0 ? {} : { verifyFn: options.verifyFn }
	})).verified) throw new EngineError("The produced bundle did not verify against the manifest's exact signer and payload; no bundle was written.", { code: "INTEGRITY_ERROR" });
	const current = await readPackManifest(root);
	if (JSON.stringify(current) !== JSON.stringify(manifest)) throw new EngineError("The pack manifest changed while signing; sign the current inputs again.", { code: "INTEGRITY_ERROR" });
	await verifyIntegrityMap(root, current, await enumeratePackContent(root));
	await assertBundleDestination(root, current, signing.bundlePath);
	await atomicWriteFile(target, bytes.toString("utf8"), { boundaryDir: root });
	return {
		bundlePath: signing.bundlePath,
		aggregateSha
	};
}
//#endregion
//#region src/workspace/resolve.ts
var resolve_exports = /* @__PURE__ */ __exportAll({
	buildSelectionFromIds: () => buildSelectionFromIds,
	resolveRepoConfig: () => resolveRepoConfig
});
function resolveRepoConfig(manifest, repoPath) {
	const entry = findRepoEntry(manifest, repoPath);
	const deltas = matchedGroupDeltas(manifest, entry);
	const locked = new Set(manifest.lockedContent ?? []);
	const lockedApplied = /* @__PURE__ */ new Set();
	const items = perClass((cls) => new Set(manifest.defaults.selection?.items[cls] ?? []));
	let tools = manifest.defaults.tools;
	for (const delta of deltas) {
		if (delta.toolOverrides !== void 0) tools = delta.toolOverrides;
		applyDelta(items, locked, lockedApplied, delta.removeItems, delta.addItems);
	}
	if (entry.overrides?.tools !== void 0) tools = entry.overrides.tools;
	applyDelta(items, locked, lockedApplied, entry.overrides?.removeItems, entry.overrides?.addItems);
	const { maturityTier, mcp } = manifest.defaults;
	return {
		repoPath: entry.path,
		tools: [...tools],
		selection: buildSelectionFromIds(perClass((cls) => [...items[cls]])),
		...maturityTier === void 0 ? {} : { maturityTier },
		...mcp === void 0 ? {} : { mcp: cloneMcp(mcp) },
		lockedApplied: [...lockedApplied].toSorted(compare)
	};
}
function buildSelectionFromIds(ids) {
	return { items: perClass((cls) => [...new Set(ids[cls] ?? [])]) };
}
function applyDelta(items, locked, lockedApplied, removeItems, addItems) {
	for (const cls of CONTENT_CLASSES) {
		const selected = items[cls];
		for (const id of removeItems?.[cls] ?? []) {
			if (!selected.has(id)) continue;
			if (locked.has(id)) {
				lockedApplied.add(id);
				continue;
			}
			selected.delete(id);
		}
		for (const id of addItems?.[cls] ?? []) selected.add(id);
	}
}
function findRepoEntry(manifest, repoPath) {
	const wanted = normalizeRepoPath(repoPath);
	const entry = manifest.repos.find((repo) => normalizeRepoPath(repo.path) === wanted);
	if (entry !== void 0) return entry;
	const registered = manifest.repos.map((repo) => repo.path);
	throw new EngineError(`Repository ${repoPath} is not registered in the workspace manifest. ${registered.length === 0 ? "The manifest registers no repositories." : `Registered: ${registered.join(", ")}.`} Add it to repos[] in ${WORKSPACE_MANIFEST_FILE}, or resolve one of the registered paths.`, { code: "VALIDATION_ERROR" });
}
function matchedGroupDeltas(manifest, entry) {
	const wanted = entry.groups ?? [];
	if (wanted.length === 0) return [];
	const groups = manifest.groups ?? [];
	const defined = new Set(groups.map((group) => group.name));
	for (const name of wanted) {
		if (defined.has(name)) continue;
		const known = defined.size === 0 ? "The manifest defines no groups." : `Defined groups: ${[...defined].join(", ")}.`;
		throw new EngineError(`Repository ${entry.path} references group "${name}", which the workspace manifest does not define. ${known} Define it in groups[] in ${WORKSPACE_MANIFEST_FILE}, or drop the reference from this repository's groups.`, { code: "VALIDATION_ERROR" });
	}
	const selected = new Set(wanted);
	return groups.filter((group) => selected.has(group.name));
}
function normalizeRepoPath(path) {
	return path.replaceAll("\\", "/").split("/").filter((segment) => segment !== "" && segment !== ".").join("/");
}
function cloneMcp(mcp) {
	return {
		servers: [...mcp.servers],
		...mcp.protocolVersion === void 0 ? {} : { protocolVersion: mcp.protocolVersion }
	};
}
function perClass(make) {
	return {
		agent: make("agent"),
		skill: make("skill"),
		rule: make("rule"),
		command: make("command")
	};
}
function compare(a, b) {
	return a < b ? -1 : a > b ? 1 : 0;
}
//#endregion
//#region src/resilience/failureLog.ts
var failureLog_exports = /* @__PURE__ */ __exportAll({
	DEFAULT_MAX_LOG_SIZE: () => DEFAULT_MAX_LOG_SIZE,
	FAILURE_LOG_FILE: () => FAILURE_LOG_FILE,
	FAILURE_LOG_MAX_BYTES_ENV: () => FAILURE_LOG_MAX_BYTES_ENV,
	MIN_RETAINED_ENTRIES: () => 10,
	appendAuditLine: () => appendAuditLine,
	createFailureLogEntry: () => createFailureLogEntry,
	formatLogEntry: () => formatLogEntry,
	getMaxLogSize: () => getMaxLogSize,
	parseFailureLog: () => parseFailureLog,
	parseFailureLogDetailed: () => parseFailureLogDetailed,
	rotateLog: () => rotateLog,
	shouldRotateLog: () => shouldRotateLog,
	writeFailureLog: () => writeFailureLog
});
const FAILURE_LOG_FILE = "failure-log.jsonl";
const DEFAULT_MAX_LOG_SIZE = 524288;
const FAILURE_LOG_MAX_BYTES_ENV = "STAMITY_FAILURE_LOG_MAX_BYTES";
function getMaxLogSize() {
	const raw = process.env[FAILURE_LOG_MAX_BYTES_ENV]?.trim();
	if (raw === void 0 || !/^\d+$/.test(raw)) return DEFAULT_MAX_LOG_SIZE;
	const parsed = Number(raw);
	return parsed > 0 && Number.isSafeInteger(parsed) ? parsed : DEFAULT_MAX_LOG_SIZE;
}
function createFailureLogEntry(phase, error, extra) {
	return {
		timestamp: (/* @__PURE__ */ new Date()).toISOString(),
		phase,
		errorType: errorTypeOf(error),
		message: messageOf(error),
		...extra
	};
}
function formatLogEntry(entry) {
	return JSON.stringify(entry);
}
function parseFailureLog(content) {
	return parseFailureLogDetailed(content).entries;
}
function parseFailureLogDetailed(content) {
	const entries = [];
	let skipped = 0;
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (trimmed === "") continue;
		const entry = readEntry(trimmed);
		if (entry === null) skipped += 1;
		else entries.push(entry);
	}
	return {
		entries,
		skipped
	};
}
function shouldRotateLog(content) {
	return Buffer.byteLength(content, "utf8") > getMaxLogSize();
}
function rotateLog(content) {
	const lines = parseFailureLog(content).map(formatLogEntry);
	if (lines.length === 0) return "";
	const budget = getMaxLogSize();
	const floor = Math.min(lines.length, 10);
	let kept = 0;
	let bytes = 0;
	for (const line of lines.toReversed()) {
		const size = Buffer.byteLength(line, "utf8") + 1;
		if (kept >= floor && bytes + size > budget) break;
		bytes += size;
		kept += 1;
	}
	return `${lines.slice(lines.length - kept).join("\n")}\n`;
}
const APPEND_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW;
function refuseLinkedAuditTarget(path) {
	return new EngineError(`Refusing to append to ${path}: it is a symbolic link, so the line would be written into whatever the link points at — a file outside this tree that this engine was never aimed at. Nothing was written. Remove the link, or replace it with a regular file, and re-run.`, { code: "FS_ERROR" });
}
function refuseSharedAuditTarget(path) {
	return new EngineError(`Refusing to append to ${path}: it is a hard link — this file shares its contents with another name, which this tree cannot see and which may sit outside it, so the line would be appended to a file that is not this one alone. Nothing was written. Replace it with a regular file — copy the contents to a new file and move that over this name — and re-run.`, { code: "FS_ERROR" });
}
async function assertAuditTarget(path, boundaryDir) {
	await assertWriteTargetContained(path, boundaryDir);
	let entry;
	try {
		entry = await lstat(path);
	} catch (error) {
		if (error.code === "ENOENT") return;
		throw error;
	}
	if (entry.isSymbolicLink()) throw refuseLinkedAuditTarget(path);
	if (isSharedRegularFile(entry)) throw refuseSharedAuditTarget(path);
}
async function appendUnfollowed(path, text) {
	const handle = await open(path, APPEND_FLAGS);
	try {
		await handle.writeFile(text, "utf8");
	} finally {
		await handle.close();
	}
}
async function appendAuditLine(path, text, opts = {}) {
	await assertAuditTarget(path, opts.boundaryDir);
	await mkdir(dirname(path), { recursive: true });
	await appendUnfollowed(path, text);
}
async function writeFailureLog(stateDir, entry) {
	const path = join(stateDir, FAILURE_LOG_FILE);
	try {
		await assertAuditTarget(path);
		await mkdir(stateDir, { recursive: true });
		const existing = await readIfPresent(path);
		const addition = `${existing === "" || existing.endsWith("\n") ? "" : "\n"}${formatLogEntry(entry)}\n`;
		if (shouldRotateLog(existing + addition)) {
			await atomicWriteFileUnlocked(path, rotateLog(existing + addition));
			return {
				path,
				rotated: true
			};
		}
		await appendUnfollowed(path, addition);
		return {
			path,
			rotated: false
		};
	} catch (error) {
		throw new EngineError(`Could not write the failure log at ${path}: ${messageOf(error)}. Check write permission and free space on ${stateDir}.`, {
			code: "FS_ERROR",
			cause: error
		});
	}
}
async function readIfPresent(path) {
	try {
		return await readFile(path, "utf8");
	} catch (error) {
		if (error.code === "ENOENT") return "";
		throw error;
	}
}
function readEntry(line) {
	let parsed;
	try {
		parsed = JSON.parse(line);
	} catch {
		return null;
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
	const raw = parsed;
	const timestamp = raw["timestamp"];
	const phase = raw["phase"];
	const errorType = raw["errorType"];
	const message = raw["message"];
	if (!isNonEmptyString(timestamp) || !isNonEmptyString(phase) || !isNonEmptyString(errorType) || typeof message !== "string") return null;
	const entry = {
		timestamp,
		phase,
		errorType,
		message
	};
	const agentId = raw["agentId"];
	if (isNonEmptyString(agentId)) entry.agentId = agentId;
	const context = raw["context"];
	if (typeof context === "object" && context !== null && !Array.isArray(context)) entry.context = context;
	return entry;
}
function isNonEmptyString(value) {
	return typeof value === "string" && value !== "";
}
function errorTypeOf(error) {
	if (typeof error === "object" && error !== null) {
		const name = error.name;
		return isNonEmptyString(name) ? name : "object";
	}
	return error === null ? "null" : typeof error;
}
function messageOf(error) {
	if (typeof error === "object" && error !== null) {
		const message = error.message;
		if (typeof message === "string") return message;
	}
	try {
		return String(error);
	} catch {
		return Object.prototype.toString.call(error);
	}
}
//#endregion
//#region src/workspace/sync.ts
var sync_exports = /* @__PURE__ */ __exportAll({
	WORKSPACE_SYNC_JOURNAL_FILE: () => WORKSPACE_SYNC_JOURNAL_FILE,
	computeWorkspaceSyncOutcome: () => computeWorkspaceSyncOutcome,
	defaultSyncConcurrency: () => defaultSyncConcurrency,
	syncWorkspaceRepos: () => syncWorkspaceRepos,
	toRepoSyncError: () => toRepoSyncError
});
const WORKSPACE_SYNC_JOURNAL_FILE = "workspace-sync-journal.jsonl";
const MAX_SYNC_CONCURRENCY = 8;
const JOURNAL_MESSAGE_LIMIT = 200;
const FILESYSTEM_ERRNOS = /* @__PURE__ */ new Set([
	"EACCES",
	"EBUSY",
	"EDQUOT",
	"EEXIST",
	"EFBIG",
	"EIO",
	"EISDIR",
	"ELOOP",
	"EMFILE",
	"ENAMETOOLONG",
	"ENFILE",
	"ENOENT",
	"ENOSPC",
	"ENOTDIR",
	"ENOTEMPTY",
	"EPERM",
	"EROFS",
	"EXDEV"
]);
function toRepoSyncError(repoPath, err) {
	if (err instanceof EngineError) return {
		repoPath,
		code: err.code,
		message: err.message
	};
	const errno = err?.code;
	return {
		repoPath,
		code: typeof errno === "string" && FILESYSTEM_ERRNOS.has(errno) ? "FS_ERROR" : "UNKNOWN_ERROR",
		message: err instanceof Error ? err.message : String(err)
	};
}
function computeWorkspaceSyncOutcome(counts) {
	if (counts.failed === 0) return "passed";
	return counts.succeeded === 0 ? "failed" : "partial";
}
function defaultSyncConcurrency(cpuCount = cpus().length) {
	if (!Number.isFinite(cpuCount)) return 1;
	return Math.min(Math.max(Math.floor(cpuCount), 1), MAX_SYNC_CONCURRENCY);
}
function planTargets(repos) {
	const firstByKey = /* @__PURE__ */ new Map();
	return repos.map((entry) => {
		const key = normalizeRepoPathKey(entry.path);
		const first = firstByKey.get(key);
		if (first === void 0) {
			firstByKey.set(key, entry.path);
			return {
				entry,
				duplicateOf: null
			};
		}
		return {
			entry,
			duplicateOf: first
		};
	});
}
function resolveConcurrency(requested) {
	if (requested === void 0) return defaultSyncConcurrency();
	return Number.isFinite(requested) ? Math.max(1, Math.floor(requested)) : 1;
}
function createJournal(rootDir, enabled) {
	const warnings = [];
	if (!enabled) return {
		warnings,
		record: () => Promise.resolve()
	};
	const path = join(rootDir, STATE_DIR, WORKSPACE_SYNC_JOURNAL_FILE);
	let live = true;
	const disable = (err) => {
		live = false;
		warnings.push(`Sync journal disabled after a failed write to ${path}: ${err instanceof Error ? err.message : String(err)}. The cascade continued and member results are unaffected.`);
	};
	let queue = Promise.resolve();
	const record = (entry) => {
		const next = queue.then(async () => {
			if (!live) return;
			try {
				await appendAuditLine(path, `${JSON.stringify(entry)}\n`, { boundaryDir: rootDir });
			} catch (err) {
				disable(err);
			}
		});
		queue = next;
		return next;
	};
	return {
		warnings,
		record
	};
}
async function requireRepoDirectory(rootDir, repoPath) {
	const dir = join(rootDir, repoPath);
	let entry;
	try {
		entry = await stat(dir);
	} catch (err) {
		const errno = err.code;
		throw new EngineError(errno === "ENOENT" ? `Workspace member "${repoPath}" is registered but ${dir} does not exist. Clone or create it, or drop the entry from repos[] in ${WORKSPACE_MANIFEST_FILE}.` : `Workspace member "${repoPath}" at ${dir} could not be read (${errno ?? "unknown error"}). Check its permissions, or drop the entry from repos[] in ${WORKSPACE_MANIFEST_FILE}.`, {
			code: "FS_ERROR",
			cause: err
		});
	}
	if (!entry.isDirectory()) throw new EngineError(`Workspace member "${repoPath}" resolves to ${dir}, which is not a directory. Point the entry at the repository directory in ${WORKSPACE_MANIFEST_FILE}.`, { code: "FS_ERROR" });
	let root;
	let member;
	try {
		[root, member] = await Promise.all([realpath(rootDir), realpath(dir)]);
	} catch (err) {
		throw new EngineError(`Workspace member "${repoPath}" at ${dir} could not be resolved to a real path (${err.code ?? "unknown error"}), so the cascade cannot confirm it stays inside the workspace. Nothing was written for it. Replace it with a real directory, or drop the entry from repos[] in ${WORKSPACE_MANIFEST_FILE}.`, {
			code: "FS_ERROR",
			cause: err
		});
	}
	if (member !== root && !member.startsWith(join(root, sep))) throw new EngineError(`Workspace member "${repoPath}" resolves to ${member}, outside the workspace root ${root}. A symbolic link on its path points out of the tree this cascade is confined to, and syncing it would write a member's whole generated tree there. Nothing was written for it. Replace the link with the real directory, or drop the entry from repos[] in ${WORKSPACE_MANIFEST_FILE}.`, { code: "FS_ERROR" });
}
async function syncWorkspaceRepos(opts) {
	const journal = createJournal(opts.rootDir, opts.journal ?? true);
	const run = getRunId();
	const ts = () => (opts.now ?? /* @__PURE__ */ new Date()).toISOString();
	const repos = await pLimit(resolveConcurrency(opts.concurrency)).map(planTargets(opts.manifest.repos), async (target) => {
		const repo = target.entry.path;
		if (target.duplicateOf !== null) {
			const reason = `duplicate of the earlier entry "${target.duplicateOf}" — one directory is one cascade target`;
			await journal.record({
				ts: ts(),
				run,
				repo,
				event: "skipped",
				reason
			});
			return {
				repoPath: repo,
				ok: true,
				state: "skipped",
				skipReason: reason
			};
		}
		await journal.record({
			ts: ts(),
			run,
			repo,
			event: "started"
		});
		try {
			await requireRepoDirectory(opts.rootDir, repo);
			await opts.syncRepo(target.entry, resolveRepoConfig(opts.manifest, repo));
		} catch (err) {
			const error = toRepoSyncError(repo, err);
			await journal.record({
				ts: ts(),
				run,
				repo,
				event: "finished",
				status: "failed",
				code: error.code,
				message: error.message.slice(0, JOURNAL_MESSAGE_LIMIT)
			});
			return {
				repoPath: repo,
				ok: false,
				error,
				state: "failed"
			};
		}
		await journal.record({
			ts: ts(),
			run,
			repo,
			event: "finished",
			status: "ok"
		});
		return {
			repoPath: repo,
			ok: true,
			state: "synced"
		};
	});
	const counts = {
		total: repos.length,
		succeeded: repos.filter((row) => row.state === "synced").length,
		failed: repos.filter((row) => row.state === "failed").length,
		skipped: repos.filter((row) => row.state === "skipped").length
	};
	return {
		outcome: computeWorkspaceSyncOutcome(counts),
		counts,
		repos,
		journalWarnings: journal.warnings
	};
}
//#endregion
//#region src/emit/capabilityMatrix.ts
var capabilityMatrix_exports = /* @__PURE__ */ __exportAll({
	CAPABILITY_MATRIX_DOC_PATH: () => CAPABILITY_MATRIX_DOC_PATH,
	LIVE_CAPABILITY_INPUTS: () => LIVE_CAPABILITY_INPUTS,
	PLUGIN_CONTAINER_CLASSES: () => PLUGIN_CONTAINER_CLASSES,
	REGENERATE_COMMAND: () => REGENERATE_COMMAND,
	REVISIT_TRIGGERS: () => REVISIT_TRIGGERS,
	renderCapabilityMatrix: () => renderCapabilityMatrix,
	renderCapabilityMatrixFrom: () => renderCapabilityMatrixFrom
});
const CAPABILITY_MATRIX_DOC_PATH = "docs/capability-matrix.md";
const REGENERATE_COMMAND = "node scripts/generate-capability-matrix.mjs";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PROSE_WIDTH = 95;
const PLUGIN_CONTAINER_CLASSES = [
	"agent",
	"skill",
	"command",
	"rule",
	"hooks",
	"mcp"
];
const REVISIT_TRIGGERS = [
	{
		when: "Antigravity adoption/demand",
		action: "adapter #5",
		watch: null,
		status: "No adapter, so no row above carries a source for it — the trigger is adoption or demand, not a page this repo re-reads."
	},
	{
		when: "codex#34002 resolution",
		action: "native glob emission",
		watch: "codex",
		status: "Open — that client's declared rule shape still down-converts conditional rules into nested `AGENTS.md` files."
	},
	{
		when: "Claude Code AGENTS.md support change",
		action: "drop the bridge",
		watch: "claude",
		status: "Unchanged — `claude` is the one client still declaring an entry file, so the bridge block stays emitted."
	},
	{
		when: "Agent Plugins scope expansion",
		action: "container widens",
		watch: "claude",
		status: "Four containers are emitted — one root per client, built by `scripts/generate-plugin-packages.mjs` — and the Plugin containers section above states what each carries. The condition is now about the classes a container may hold: an agent or a command class reaching the Agent Plugins format would move two of codex's repository-owned rows into its root."
	},
	{
		when: "VS Code deny-gate GA",
		action: "recheck editor-specific hook compatibility",
		watch: "copilot",
		status: "CLI/cloud preToolUse hooks are emitted now, with timeout fail-open. [VS Code hooks](https://code.visualstudio.com/docs/agent-customization/hooks) remain Preview; editor-specific compatibility needs separate verification."
	}
];
const LIVE_ALWAYS_ON = {
	ceilings: ALWAYS_ON_BUDGET_LINES,
	charterCap: 150,
	sharedBytesWithCodex: ALWAYS_ON_SHARED_BYTES_WITH_CODEX,
	sharedBytesWithoutCodex: ALWAYS_ON_SHARED_BYTES_WITHOUT_CODEX,
	codexDroppedRuleCount: 0,
	ruleDelivery: RULE_DELIVERY_DEFAULT,
	codexFoldedRuleIds: [
		"injection-screening",
		"secrets",
		"security-patterns"
	],
	codexRuleSkillCount: 9,
	codexSkillsListChars: 5570,
	codexSkillsListCap: CODEX_SKILLS_LIST_BUDGET_CHARS,
	sharedTreeDuplicateRules: {
		claude: 0,
		cursor: 9,
		copilot: 7,
		codex: 0
	}
};
const LIVE_CAPABILITY_INPUTS = {
	facts: [
		claudeResiduePlanner.facts,
		cursorResiduePlanner.facts,
		copilotResiduePlanner.facts,
		codexResiduePlanner.facts
	],
	guarantees: CLIENT_HOOK_GUARANTEES,
	coverage: ADAPTER_ALLOWLIST_COVERAGE,
	triggers: REVISIT_TRIGGERS,
	alwaysOn: LIVE_ALWAYS_ON
};
function fail(message) {
	throw new EngineError(message, { code: "ADAPTER_ERROR" });
}
function requireExactToolCoverage(label, rows) {
	const seen = /* @__PURE__ */ new Set();
	for (const row of rows) {
		if (!VALID_TOOLS.has(row.tool)) fail(`${label} declares \`${row.tool}\`, which is not a supported client.`);
		if (seen.has(row.tool)) fail(`${label} declares \`${row.tool}\` twice.`);
		seen.add(row.tool);
	}
	const missing = TOOLS.filter((tool) => !seen.has(tool));
	if (missing.length > 0) fail(`${label} is missing a row for ${missing.map((t) => `\`${t}\``).join(", ")}.`);
}
function requireCitations(facts) {
	if (facts.citations.length === 0) fail(`The \`${facts.tool}\` adapter declares no platform citation, so its capability row would state undated facts. Add at least one { url, accessDate } to its dialect facts.`);
	for (const citation of facts.citations) {
		if (citation.url.trim() === "") fail(`The \`${facts.tool}\` adapter declares a citation with no URL.`);
		if (!ISO_DATE.test(citation.accessDate)) fail(`The \`${facts.tool}\` citation ${citation.url} carries access date "${citation.accessDate}", which is not an ISO calendar date (YYYY-MM-DD).`);
	}
}
function requirePluginContainers(rows) {
	requireExactToolCoverage("The plugin-container set", rows);
	for (const row of rows) {
		for (const [label, value] of [
			["container manifest path", row.container],
			["root variable", row.rootVariable],
			["invocation form", row.invocation],
			["client floor", row.floor]
		]) if (value.trim() === "") fail(`The \`${row.tool}\` plugin container declares no ${label}.`);
		if (row.carries.length === 0) fail(`The \`${row.tool}\` plugin container carries no class at all, so the root it describes would deliver nothing.`);
		const declared = [...row.carries, ...row.repositoryOwned];
		for (const klass of PLUGIN_CONTAINER_CLASSES) {
			const count = declared.filter((name) => name === klass).length;
			if (count === 0) fail(`The \`${row.tool}\` plugin container declares no owner for \`${klass}\`, so a reader could not tell whether the root or the repository delivers it.`);
			if (count > 1) fail(`The \`${row.tool}\` plugin container declares \`${klass}\` twice — a class is carried or repository-owned, never both.`);
		}
		if (row.citations.length === 0) fail(`The \`${row.tool}\` plugin container declares no source, so its client floor would be an undated claim.`);
		for (const citation of row.citations) {
			if (citation.url.trim() === "") fail(`The \`${row.tool}\` plugin container declares a source with no URL.`);
			if (!ISO_DATE.test(citation.accessDate)) fail(`The \`${row.tool}\` plugin container's source ${citation.url} carries access date "${citation.accessDate}", which is not an ISO calendar date (YYYY-MM-DD).`);
		}
	}
}
function requireAlwaysOnFigures(alwaysOn) {
	for (const tool of TOOLS) {
		const ceiling = alwaysOn.ceilings[tool];
		if (!Number.isFinite(ceiling) || ceiling <= 0) fail(`The always-on disclosure carries no measured ceiling for \`${tool}\`, so its row would state a load nobody took.`);
	}
	if (alwaysOn.sharedBytesWithCodex <= alwaysOn.sharedBytesWithoutCodex) fail(`The always-on disclosure puts the shared instruction file at ${alwaysOn.sharedBytesWithCodex} bytes with codex and ${alwaysOn.sharedBytesWithoutCodex} without it. The rules appendix only adds bytes, so these two are the wrong way round or one of them is stale.`);
	if (alwaysOn.codexSkillsListChars <= 0 || alwaysOn.codexSkillsListChars > alwaysOn.codexSkillsListCap) fail(`The always-on disclosure puts the codex skills list at ${alwaysOn.codexSkillsListChars} characters against a cap of ${alwaysOn.codexSkillsListCap}. A list at or below zero was never measured, and one over the cap is an emission this setup refuses, so neither can be published as a cost.`);
	if (alwaysOn.codexFoldedRuleIds.length === 0) fail("The always-on disclosure names no rule that codex still folds into its appendix. The floors are what that appendix is for, so an empty set is a stale reading rather than a client that stopped needing them.");
	for (const tool of TOOLS) {
		const duplicates = alwaysOn.sharedTreeDuplicateRules[tool];
		if (!Number.isInteger(duplicates) || duplicates < 0) fail(`The always-on disclosure puts \`${tool}\`'s shared-tree duplicate count at ${duplicates}, which is not a number of directories anyone counted.`);
		if (duplicates > alwaysOn.codexRuleSkillCount) fail(`The always-on disclosure says \`${tool}\` receives ${duplicates} duplicated rules from a shared tree holding ${alwaysOn.codexRuleSkillCount} rule-skills. A client cannot be handed more copies than the tree contains.`);
	}
}
function resolveTriggers(triggers, ordered) {
	if (triggers.length === 0) fail("The currency block declares no revisit trigger, so the page would publish a currency process with nothing bound to it.");
	const seen = /* @__PURE__ */ new Set();
	return triggers.map((trigger) => {
		for (const [label, value] of [
			["condition", trigger.when],
			["action", trigger.action],
			["status", trigger.status]
		]) if (value.trim() === "") fail(`A revisit trigger declares no ${label}, so its row would render a blank cell — a condition with no action, or an action with nowhere it stands, is not a trigger.`);
		if (seen.has(trigger.when)) fail(`The revisit trigger "${trigger.when}" is declared twice.`);
		seen.add(trigger.when);
		if (trigger.watch === null) return {
			trigger,
			watched: null
		};
		const watched = ordered.find((facts) => facts.tool === trigger.watch);
		if (watched === void 0) fail(`The revisit trigger "${trigger.when}" watches \`${trigger.watch}\`, which declares no dialect facts here, so its status would carry no access date.`);
		return {
			trigger,
			watched
		};
	});
}
function cell(value) {
	return value.replace(/\s*\r?\n\s*/g, " ").replaceAll("|", "\\|").trim();
}
function table(headers, rows) {
	return [
		`| ${headers.join(" | ")} |`,
		`|${headers.map(() => "---").join("|")}|`,
		...rows.map((row) => `| ${row.map(cell).join(" | ")} |`)
	];
}
function paragraph(text) {
	const lines = [];
	let current = "";
	for (const word of text.split(" ").filter((part) => part !== "")) if (current === "") current = word;
	else if (current.length + 1 + word.length <= PROSE_WIDTH) current = `${current} ${word}`;
	else {
		lines.push(current);
		current = word;
	}
	if (current !== "") lines.push(current);
	return lines;
}
function code(value) {
	return `\`${value}\``;
}
function hooksConfigCell(facts) {
	return facts.hooksConfigPath === null ? "none emitted" : code(facts.hooksConfigPath);
}
function entryFileCell(facts) {
	return facts.entryFile === null ? "none — `AGENTS.md` is native" : code(facts.entryFile);
}
function enforcementCell(guarantee) {
	if (guarantee === void 0) return "undeclared";
	return guarantee.blockingExitCode === null ? `${code(guarantee.failMode)} — never blocks` : `${code(guarantee.failMode)} — blocks on exit ${code(String(guarantee.blockingExitCode))}`;
}
function blockingExitCell(guarantee) {
	return guarantee.blockingExitCode === null ? "never blocks" : code(String(guarantee.blockingExitCode));
}
function glanceSection(ordered, guarantees) {
	return [
		"## Coverage at a glance",
		"",
		...table([
			"Client",
			"Entry file",
			"Reads `.agents/skills/`",
			"Hook config",
			"Hook enforcement",
			"MCP dialect"
		], ordered.map((facts) => [
			code(facts.tool),
			entryFileCell(facts),
			facts.readsAgentsSkillsDir ? "yes" : "no",
			hooksConfigCell(facts),
			enforcementCell(guarantees.find((row) => row.tool === facts.tool)),
			code(facts.mcpDialect)
		]))
	];
}
function clientSection(facts) {
	const lines = [
		`### ${code(facts.tool)}`,
		"",
		...table(["Fact", "Declared value"], [
			["Rule shape", facts.ruleShape],
			["Agent format", facts.agentsFormat],
			["Hook config", hooksConfigCell(facts)],
			["Reads `.agents/skills/`", facts.readsAgentsSkillsDir ? "yes" : "no"],
			["MCP dialect", code(facts.mcpDialect)],
			["Entry file", entryFileCell(facts)]
		]),
		""
	];
	if (facts.caps.length === 0) lines.push("Declared caps: none.", "");
	else lines.push("Declared caps:", "", ...table(["Cap", "Declared value"], facts.caps.map((cap) => [code(cap.name), cap.value])), "");
	lines.push("Sources:", "", ...facts.citations.map((c) => `- <${c.url}> — accessed ${c.accessDate}`));
	return lines;
}
function pluginSection(rows) {
	const ordered = TOOLS.map((tool) => {
		const row = rows.find((candidate) => candidate.tool === tool);
		if (row === void 0) fail(`No plugin container declared for \`${tool}\`.`);
		return row;
	});
	const classes = (list) => list.length === 0 ? "none" : PLUGIN_CONTAINER_CLASSES.filter((klass) => list.includes(klass)).join(", ");
	return [
		"## Plugin containers",
		"",
		"A release also publishes one plugin root per client. Each root's own emitter module decides",
		"which artifact classes travel inside it and which stay in the repository, and this table is",
		"built from those modules rather than beside them. `carried` means the root ships the class",
		"and the client reads it from there; the repository-owned column is what",
		"`stamity plugin setup` writes instead. Together the two columns cover every class, so no",
		"class is left without an owner.",
		"",
		...table([
			"Client",
			"Container manifest",
			"Carries",
			"Repository-owned",
			"Invocation",
			"Root variable",
			"Client floor"
		], ordered.map((row) => [
			code(row.tool),
			code(row.container),
			classes(row.carries),
			classes(row.repositoryOwned),
			row.invocation,
			code(row.rootVariable),
			row.floor
		])),
		"",
		"Sources:",
		"",
		...ordered.flatMap((row) => row.citations.map((c) => `- ${code(row.tool)}: <${c.url}> — accessed ${c.accessDate}`))
	];
}
function guaranteeSection(guarantees) {
	return [
		"## Hook guarantee honesty",
		"",
		"A hook written once is a gate on some of these clients and telemetry on others. Each row",
		"states what that client enforces, read from the same table the emitters use, so this page",
		"and the emitted guards cannot disagree. Rows keep the ladder order: strongest first.",
		"",
		...table([
			"Client",
			"Fail mode",
			"Blocking exit code",
			"What an operator actually gets"
		], guarantees.map((row) => [
			code(row.tool),
			code(row.failMode),
			blockingExitCell(row),
			row.notes
		]))
	];
}
function oldestAccessDate(facts) {
	return facts.citations.map((citation) => citation.accessDate).reduce((earliest, date) => date < earliest ? date : earliest);
}
function watchCell(row) {
	if (row.watched === null) return "unwatched — no supported client carries a source for it";
	return `${code(row.watched.tool)}, oldest source read ${oldestAccessDate(row.watched)}`;
}
function currencySection(rows) {
	return [
		"## Currency and revisit triggers",
		"",
		"The standing check is per release: re-read each client's sources, regenerate this page, and",
		"the diff is the currency report. On top of it, these named conditions each re-open a",
		"decision when they fire. A row states where its condition stands in this repo today and the",
		"oldest access date among the watched client's sources — the bound on how stale that status",
		"can be, since nothing here re-reads a page on its own.",
		"",
		...table([
			"Revisit when",
			"Then",
			"Status today",
			"Where the status is read"
		], rows.map((row) => [
			row.trigger.when,
			row.trigger.action,
			row.trigger.status,
			watchCell(row)
		]))
	];
}
function alwaysOnReasonCell(tool, mode) {
	if (DESCRIPTION_PULL_TOOLS.has(tool)) return "the charter alone — a rule with no globs is pulled in when the conversation matches it";
	if (RULE_APPENDIX_TOOLS.has(tool)) return mode === "on-demand" ? "the charter plus the rules that must be unconditional — critical, floor-tagged, or anchored to a nested instruction file; the rest are skills" : "the charter plus EVERY selected rule — no per-rule attach mechanism, so the whole set is folded into the one instruction file";
	return mode === "on-demand" ? "the charter alone — a rule with no globs is delivered as a skill instead, and every other rule attaches on paths" : "the charter plus every rule with no globs — those carry no attach trigger, so they load every session";
}
function deliveryCell(tool, mode) {
	if (DESCRIPTION_PULL_TOOLS.has(tool)) return "rule, pulled on relevance";
	return mode === "on-demand" ? "skill, on demand" : "rule, every session";
}
function alwaysOnSection(alwaysOn) {
	const ratio = (alwaysOn.sharedBytesWithCodex / alwaysOn.sharedBytesWithoutCodex).toFixed(1);
	return [
		"## Always-on cost by client",
		"",
		...paragraph(`What a session pays before it has done anything: the charter every client reads, plus every rule that client cannot attach conditionally. The charter TEMPLATE is capped at ${alwaysOn.charterCap} physical lines, and what a session actually loads is that template plus whatever rules the client's own delivery leaves in front of it.`),
		"",
		...table([
			"Client",
			"Always-on lines",
			"Delivery of description-scoped rules",
			"What it loads unconditionally"
		], TOOLS.map((tool) => [
			code(tool),
			String(alwaysOn.ceilings[tool]),
			deliveryCell(tool, alwaysOn.ruleDelivery),
			alwaysOnReasonCell(tool, alwaysOn.ruleDelivery)
		])),
		"",
		...paragraph(`Measured under \`ruleDelivery: ${alwaysOn.ruleDelivery}\`, the shipped default. A rule that carries no globs has no attach trigger, so under \`always-on\` claude and copilot load its whole body every session; under \`on-demand\` it is projected as \`.agents/skills/stamity-<rule-id>/SKILL.md\` and the client opens it when its description matches. Cursor is the one client that never needed the option — its own rule layer already pulls such a rule on relevance. A repository can take the other shape back with \`stamity config set ruleDelivery always-on\`, which moves the first two columns and nothing else.`),
		"",
		...paragraph("The line figures are the ratchet ceilings in `src/content/charter.ts`, each pinned at the load measured on the last corpus refresh: the corpus suite fails the build when a client's real composite differs from its cell in either direction, so a cell that grew is a slice nobody authorised and one that shrank is a saving nobody wrote down. They are a bound a reader can plan against, not a reading this page took as it rendered."),
		"",
		...paragraph(`**What co-selecting codex costs every other client.** Selecting \`codex\` does not add a codex-only file. It rewrites the root \`AGENTS.md\` that every other selected client already reads, so a claude+codex repository hands claude the codex rules appendix too: ${alwaysOn.sharedBytesWithCodex} bytes of shared instruction text against ${alwaysOn.sharedBytesWithoutCodex} without it — ≈${ratio}x the always-on bytes every co-selected client pays.`),
		"",
		...paragraph(`**What codex folds, and what it pulls.** Under the delivery mode above, the appendix carries ${alwaysOn.codexFoldedRuleIds.length} rules — ${alwaysOn.codexFoldedRuleIds.map((id) => code(id)).join(", ")} — and they are there for the reason the client has no conditional layer to put them anywhere else: each is either marked critical or carries a \`floor:*\` tag, and a floor that loads on relevance is a floor that stops binding the moment the model does not notice it applies. The other ${alwaysOn.codexRuleSkillCount} rules are projected as \`.agents/skills/stamity-<rule-id>/SKILL.md\` instead, one directory each.`),
		"",
		...paragraph("**What that costs the clients beside it.** Those directories sit in the SHARED `.agents/skills/` tree, which cursor, copilot and codex all read — a directory cannot be made client-specific, so it holds the union of every selected client's demotions. Co-selecting `codex` therefore hands " + TOOLS.filter((tool) => alwaysOn.sharedTreeDuplicateRules[tool] > 0).map((tool) => `${code(tool)} ${alwaysOn.sharedTreeDuplicateRules[tool]}`).join(" and ") + " rules a second time: each is already delivered to that client as its own `.mdc` rule or `.instructions.md` file, and is now also description-pullable as a skill. The duplicate is pulled on relevance and never loaded at launch, so it moves none of the line figures above — and a selection without `codex` does not pay it at all. `claude` is absent from that list because it reads no shared tree: its native skills directory carries only the rules it demoted itself."),
		"",
		...paragraph(`That trade is paid in a second budget, so it is measured too. The client holds every skill's name and description for the whole session in order to decide when to open one, and caps that list at ${alwaysOn.codexSkillsListCap} characters when the context window is unknown. The full selection measures ${alwaysOn.codexSkillsListChars} — the shipped skills plus the projected rules — and emission refuses outright rather than truncating past the cap, the same way it refuses an oversized instruction file. The remaining headroom is what a repository's own skills spend into.`),
		"",
		...paragraph(`The appendix is shaped to the client's own 32 KiB ceiling, lowest risk first — rules marked critical are kept longest, then floor-tagged rules, then declared precedence, then id. On the full selection it drops ${alwaysOn.codexDroppedRuleCount} rules. The emitted file names any it dropped in its own omission notice, so the current set is read there rather than here. Re-measure with \`${REGENERATE_COMMAND}\` after a corpus change.`)
	];
}
function coverageSection(coverage) {
	return [
		"## Agent tool-allowlist enforcement coverage",
		"",
		"How far each client can actually hold an agent to its granted tools. Where a client",
		"exposes no primitive the emission is none at all — a guessed frontmatter key reads to an",
		`operator as a restriction that is not there. ${coverage.length} clients, one row each:`,
		"",
		buildAllowlistCoverageTable()
	];
}
function renderCapabilityMatrixFrom(inputs) {
	requireExactToolCoverage("The dialect-facts set", inputs.facts);
	requireExactToolCoverage("The hook-guarantee table", inputs.guarantees);
	requireExactToolCoverage("The allowlist-coverage table", inputs.coverage);
	const ordered = TOOLS.map((tool) => {
		const facts = inputs.facts.find((row) => row.tool === tool);
		if (facts === void 0) fail(`No dialect facts declared for \`${tool}\`.`);
		requireCitations(facts);
		return facts;
	});
	const dated = resolveTriggers(inputs.triggers, ordered);
	requireAlwaysOnFigures(inputs.alwaysOn);
	if (inputs.plugins !== void 0) requirePluginContainers(inputs.plugins);
	return `${[
		"---",
		"title: Client capability matrix",
		"---",
		"",
		`<!-- GENERATED FILE — do not edit by hand. Rewrite it with \`${REGENERATE_COMMAND}\`. -->`,
		"",
		"# Client capability matrix",
		"",
		"Every cell below renders from code: the dialect facts each client's residue planner",
		"declares, the hook-guarantee ladder the emitters read, and the tool-allowlist coverage the",
		"translator applies. A test re-renders this page and byte-compares this file, so it cannot",
		"be hand-edited and cannot lag a change to those declarations.",
		"",
		"That is the whole of the guarantee, and its edges are worth stating. The byte-compare pins",
		"this page to what the adapters DECLARE. It does not pin a declaration to what an adapter",
		"EMITS — that holds only where a test pins the two together, as `test/emit/hooksInfra.test.ts`",
		"does for the hook-config column — and it pins nothing at all to a client's live",
		"documentation. A declared value is prose someone wrote into a constant: read a cell as what",
		"the adapter says, and the access date beside it as how old the saying is.",
		"",
		"A platform fact is only as current as the access date beside it. Each client's sources carry",
		"the date its documentation was last read; re-read them per release and the diff of this page",
		"is the currency report. The named conditions that re-open a decision are at the foot of the",
		"page, under Currency and revisit triggers.",
		"",
		...glanceSection(ordered, inputs.guarantees),
		"",
		...alwaysOnSection(inputs.alwaysOn),
		"",
		...inputs.plugins === void 0 ? [] : [...pluginSection(inputs.plugins), ""],
		"## Dialect facts by client",
		"",
		...ordered.flatMap((facts) => clientSection(facts).concat("")),
		...guaranteeSection(inputs.guarantees),
		"",
		...coverageSection(inputs.coverage),
		"",
		...currencySection(dated)
	].join("\n")}\n`;
}
function renderCapabilityMatrix() {
	return renderCapabilityMatrixFrom(LIVE_CAPABILITY_INPUTS);
}
//#endregion
//#region src/resilience/failureClass.ts
var failureClass_exports = /* @__PURE__ */ __exportAll({ classifyFailure: () => classifyFailure });
const MAX_CAUSE_DEPTH = 4;
const ENGINE_CODE_VERDICTS = {
	NETWORK_ERROR: "transient",
	LOCK_TIMEOUT: "transient",
	VALIDATION_ERROR: "substantive",
	CONFIG_ERROR: "substantive",
	INTEGRITY_ERROR: "substantive"
};
const ERRNO_VERDICTS = {
	ECONNREFUSED: "transient",
	ECONNRESET: "transient",
	ECONNABORTED: "transient",
	ETIMEDOUT: "transient",
	ENOTFOUND: "transient",
	EAI_AGAIN: "transient",
	EHOSTUNREACH: "transient",
	ENETUNREACH: "transient",
	ENETRESET: "transient",
	EPIPE: "transient",
	EBUSY: "transient",
	EAGAIN: "transient",
	EMFILE: "transient",
	ENFILE: "transient",
	ENOENT: "transient",
	EACCES: "substantive",
	EPERM: "substantive",
	EROFS: "substantive",
	ENOSPC: "substantive",
	EEXIST: "substantive",
	EISDIR: "substantive",
	ENOTDIR: "substantive",
	ENOTEMPTY: "substantive"
};
const LOGIC_ERROR_NAMES = /* @__PURE__ */ new Set([
	"TypeError",
	"RangeError",
	"SyntaxError",
	"ReferenceError",
	"EvalError"
]);
const MESSAGE_VERDICTS = [
	[/\b(429|500|502|503|504)\b/, "transient"],
	[/service unavailable|too many requests|bad gateway|gateway timeout/i, "transient"],
	[/socket hang up|connection (reset|refused)|network (error|failure)/i, "transient"],
	[/\b(ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE)\b/, "transient"],
	[/timeout|timed out/i, "transient"],
	[/\b(400|401|403|404|409|422)\b/, "substantive"],
	[/unauthorized|forbidden|not found|invalid (token|credential|api.?key)/i, "substantive"],
	[/malformed|missing required|invalid \S*\s?config|schema validation/i, "substantive"]
];
function stringProp(value, key) {
	const raw = value[key];
	return typeof raw === "string" ? raw : "";
}
function verdictFor(value) {
	if (typeof value !== "object" || value === null) return "unknown";
	const name = stringProp(value, "name");
	const code = stringProp(value, "code");
	if (name === "AbortError" || code === "ABORT_ERR") return "substantive";
	if (LOGIC_ERROR_NAMES.has(name)) return "substantive";
	const byCode = ENGINE_CODE_VERDICTS[code] ?? ERRNO_VERDICTS[code];
	if (byCode !== void 0) return byCode;
	const message = stringProp(value, "message");
	if (message !== "") {
		for (const [pattern, verdict] of MESSAGE_VERDICTS) if (pattern.test(message)) return verdict;
	}
	return "unknown";
}
function classifyFailure(error) {
	let cursor = error;
	for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
		const verdict = verdictFor(cursor);
		if (verdict !== "unknown") return verdict;
		if (typeof cursor !== "object" || cursor === null) break;
		const cause = cursor.cause;
		if (cause === void 0 || cause === cursor) break;
		cursor = cause;
	}
	return "unknown";
}
//#endregion
//#region src/resilience/retry.ts
var retry_exports = /* @__PURE__ */ __exportAll({
	DEFAULT_BACKOFF_FACTOR: () => 2,
	DEFAULT_INITIAL_DELAY_MS: () => 200,
	DEFAULT_MAX_ATTEMPTS: () => 3,
	DEFAULT_MAX_DELAY_MS: () => DEFAULT_MAX_DELAY_MS,
	applyJitter: () => applyJitter,
	computeBackoffDelay: () => computeBackoffDelay,
	defaultShouldRetry: () => defaultShouldRetry,
	retryWithBackoff: () => retryWithBackoff
});
const DEFAULT_MAX_DELAY_MS = 5e3;
const MAX_ATTEMPTS_CEILING = 20;
const realSleep = (ms) => setTimeout$1(ms);
function nonNegativeOr(value, fallback) {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}
function resolveMaxAttempts(value) {
	if (typeof value !== "number" || !Number.isFinite(value)) return 3;
	return Math.min(MAX_ATTEMPTS_CEILING, Math.max(1, Math.trunc(value)));
}
function defaultShouldRetry(err, _attempt) {
	return classifyFailure(err) === "transient";
}
function computeBackoffDelay(attempt, opts = {}) {
	const initialDelayMs = nonNegativeOr(opts.initialDelayMs, 200);
	const maxDelayMs = nonNegativeOr(opts.maxDelayMs, DEFAULT_MAX_DELAY_MS);
	const raw = initialDelayMs * Math.max(1, nonNegativeOr(opts.backoffFactor, 2)) ** (Number.isFinite(attempt) ? Math.max(0, Math.trunc(attempt) - 1) : 0);
	return Math.min(maxDelayMs, Math.round(raw));
}
function applyJitter(delayMs, random = Math.random) {
	if (!(delayMs > 0)) return 0;
	const draw = random();
	return Math.round((Number.isFinite(draw) ? Math.min(1, Math.max(0, draw)) : 1) * delayMs);
}
async function retryWithBackoff(fn, opts = {}) {
	const maxAttempts = resolveMaxAttempts(opts.maxAttempts);
	const shouldRetry = opts.shouldRetry ?? defaultShouldRetry;
	const sleep = opts.sleep ?? realSleep;
	const random = opts.random ?? Math.random;
	const jitter = opts.jitter ?? true;
	let lastError;
	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) try {
		return await fn(attempt);
	} catch (error) {
		lastError = error;
		if (attempt === maxAttempts) break;
		let retryable;
		try {
			retryable = shouldRetry(error, attempt);
		} catch {
			retryable = false;
		}
		if (!retryable) break;
		const base = computeBackoffDelay(attempt, opts);
		const delayMs = jitter ? applyJitter(base, random) : base;
		opts.onRetry?.(error, attempt, delayMs);
		await sleep(delayMs);
	}
	throw lastError;
}
//#endregion
//#region src/resilience/adapterTimeout.ts
var adapterTimeout_exports = /* @__PURE__ */ __exportAll({
	AdapterTimeoutError: () => AdapterTimeoutError,
	DEFAULT_ADAPTER_TIMEOUT_MS: () => DEFAULT_ADAPTER_TIMEOUT_MS,
	MAX_ADAPTER_TIMEOUT_MS: () => MAX_ADAPTER_TIMEOUT_MS,
	MIN_ADAPTER_TIMEOUT_MS: () => MIN_ADAPTER_TIMEOUT_MS,
	clampAdapterTimeout: () => clampAdapterTimeout,
	generateWithTimeout: () => generateWithTimeout,
	throwIfSignalAborted: () => throwIfSignalAborted
});
const DEFAULT_ADAPTER_TIMEOUT_MS = 18e4;
const MIN_ADAPTER_TIMEOUT_MS = 5e3;
const MAX_ADAPTER_TIMEOUT_MS = 9e5;
const MAX_ATTEMPTS = 10;
var AdapterTimeoutError = class extends Error {
	adapter;
	timeoutMs;
	constructor(adapter, timeoutMs) {
		super(`"${adapter}" exceeded its ${Math.round(timeoutMs / 1e3)}s budget and was aborted. Raise the timeout (max ${MAX_ADAPTER_TIMEOUT_MS / 1e3}s) or find out why it stalls.`);
		this.name = "AdapterTimeoutError";
		this.adapter = adapter;
		this.timeoutMs = timeoutMs;
	}
};
function clampAdapterTimeout(timeoutMs) {
	if (Number.isNaN(timeoutMs)) return DEFAULT_ADAPTER_TIMEOUT_MS;
	return Math.max(MIN_ADAPTER_TIMEOUT_MS, Math.min(timeoutMs, MAX_ADAPTER_TIMEOUT_MS));
}
async function generateWithTimeout(adapter, fn, config) {
	const timeoutMs = clampAdapterTimeout(config?.timeoutMs ?? 18e4);
	const attempts = clampAttempts(config?.retryAttempts);
	const controller = new AbortController();
	const startedAt = performance.now();
	let timer;
	const deadline = new Promise((_resolve, reject) => {
		timer = setTimeout(() => {
			const timeout = new AdapterTimeoutError(adapter, timeoutMs);
			controller.abort(timeout);
			reject(timeout);
		}, timeoutMs);
	});
	try {
		return {
			result: await Promise.race([runAttempts(fn, controller.signal, attempts), deadline]),
			elapsedMs: Math.round(performance.now() - startedAt)
		};
	} finally {
		clearTimeout(timer);
	}
}
function throwIfSignalAborted(signal) {
	if (signal === void 0 || !signal.aborted) return;
	const reason = signal.reason;
	if (reason instanceof Error) throw reason;
	const error = new Error(typeof reason === "string" && reason !== "" ? reason : "The operation was aborted.");
	error.name = "AbortError";
	throw error;
}
async function runAttempts(fn, signal, remaining) {
	try {
		return await fn(signal);
	} catch (error) {
		if (remaining <= 1 || signal.aborted) throw error;
		return await runAttempts(fn, signal, remaining - 1);
	}
}
function clampAttempts(retryAttempts) {
	if (retryAttempts === void 0 || Number.isNaN(retryAttempts)) return 1;
	return Math.min(MAX_ATTEMPTS, Math.max(1, Math.trunc(retryAttempts)));
}
//#endregion
//#region src/roster/triggers.ts
var triggers_exports = /* @__PURE__ */ __exportAll({
	SPECIALIST_TRIGGER_TABLE: () => SPECIALIST_TRIGGER_TABLE,
	duplicateSpecialistIds: () => duplicateSpecialistIds,
	findSpecialistTrigger: () => findSpecialistTrigger,
	specialistsForPath: () => specialistsForPath
});
const SPECIALIST_TRIGGER_TABLE = [
	{
		specialist: "stamity-security",
		triggerPaths: [
			"auth/",
			"middleware/",
			"crypto/",
			"api/",
			"routes/",
			"handlers/",
			"*.pem",
			"*.key",
			"package.json",
			"package-lock.json",
			"pnpm-lock.yaml",
			"yarn.lock",
			"requirements.txt",
			"go.mod",
			"cargo.toml",
			"gemfile"
		],
		triggerKeywords: [
			"authentication",
			"authorization",
			"session",
			"permission",
			"encryption",
			"signing",
			"hashing",
			"input validation",
			"injection",
			"deserialization",
			"upload",
			"dependency",
			"advisory",
			"supply chain"
		],
		rationale: "Authentication, cryptography, trust boundaries and the dependency set are where a missed defect is paid for after release rather than in review."
	},
	{
		specialist: "stamity-design-quality",
		triggerPaths: [
			"components/",
			"pages/",
			"views/",
			"*.tsx",
			"*.jsx",
			"*.vue",
			"*.svelte",
			"*.css",
			"*.scss"
		],
		triggerKeywords: [
			"component",
			"empty state",
			"error state",
			"loading state",
			"form",
			"design token",
			"contrast",
			"focus",
			"keyboard",
			"navigation",
			"accessibility"
		],
		rationale: "A rendered surface carries success criteria and design-token obligations that need a measured value, not a judgment made from the diff alone."
	},
	{
		specialist: "stamity-performance",
		triggerPaths: [
			"queries/",
			"*.sql",
			"workers/",
			"queue/",
			"jobs/",
			"cache/",
			"benchmarks/"
		],
		triggerKeywords: [
			"n+1",
			"index",
			"pagination",
			"throughput",
			"batch",
			"concurrency",
			"latency",
			"bundle size",
			"cache invalidation",
			"benchmark",
			"budget"
		],
		rationale: "Data access, background work and cache surfaces are where cost per operation moves, and where a declared budget can turn a cost claim into a blocking one."
	}
];
function findSpecialistTrigger(specialist, table = SPECIALIST_TRIGGER_TABLE) {
	return table.find((row) => row.specialist === specialist);
}
function duplicateSpecialistIds(table = SPECIALIST_TRIGGER_TABLE) {
	const seen = /* @__PURE__ */ new Set();
	const duplicates = /* @__PURE__ */ new Set();
	for (const row of table) if (seen.has(row.specialist)) duplicates.add(row.specialist);
	else seen.add(row.specialist);
	return [...duplicates];
}
function normalize$1(value) {
	return value.replaceAll("\\", "/").toLowerCase();
}
function basenameOf(normalizedPath) {
	return normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1);
}
const MATCH_ALL = "*";
function matchesPattern(normalizedPath, pattern) {
	const needle = normalize$1(pattern).trim();
	if (needle === MATCH_ALL) return true;
	if (needle.replaceAll("/", "") === "") return false;
	if (needle.endsWith("/")) return normalizedPath.startsWith(needle) || normalizedPath.includes(`/${needle}`);
	const basename = basenameOf(normalizedPath);
	return needle.startsWith(MATCH_ALL) ? basename.endsWith(needle.slice(1)) : basename === needle;
}
function specialistsForPath(filePath, table = SPECIALIST_TRIGGER_TABLE) {
	const normalized = normalize$1(filePath);
	if (normalized === "") return [];
	const triggered = /* @__PURE__ */ new Set();
	for (const row of table) if (row.triggerPaths.some((pattern) => matchesPattern(normalized, pattern))) triggered.add(row.specialist);
	return [...triggered];
}
//#endregion
//#region src/composition/root.ts
function createEngine() {
	return Object.freeze({
		denyscan: denyScan_exports,
		merge: {
			managedBlocks: managedBlocks_exports,
			atomicWrite: atomicWrite_exports,
			safeWrite: safeWrite_exports,
			reclaim: reclaim_exports,
			fsErrors: fsErrors_exports
		},
		content: {
			frontmatter: frontmatter_exports,
			contentRoot: contentRoot_exports,
			tags: tags_exports,
			catalog: catalog_exports$1,
			charter: charter_exports,
			selection: selection_exports,
			ruleDelivery: ruleDelivery_exports,
			mdcCompanions: mdcCompanions_exports,
			userContent: userContent_exports
		},
		learnings: {
			validation: validation_exports,
			store: store_exports$1
		},
		handoffs: {
			schema: schema_exports,
			validation: validation_exports$1,
			store: store_exports
		},
		manifest: {
			manifest: manifest_exports$2,
			ledger: ledger_exports,
			mcpFilter: mcpFilter_exports,
			claudeSettings: claudeSettings_exports
		},
		mcp: {
			catalog: catalog_exports,
			descriptionScan: descriptionScan_exports,
			env: env_exports,
			emit: emit_exports,
			secretScan: secretScan_exports
		},
		pack: {
			manifest: manifest_exports$1,
			install: install_exports,
			permissions: permissions_exports,
			trust: trust_exports,
			sign: sign_exports,
			sigstoreVerifier: sigstoreVerifier_exports,
			orgPolicy: orgPolicy_exports,
			receipt: receipt_exports$1,
			projection: projection_exports,
			curated: curated_exports,
			catalogPins: catalogPins_exports,
			verifyInstalled: verifyInstalled_exports
		},
		workspace: {
			model: model_exports,
			git: git_exports$1,
			detect: detect_exports,
			resolve: resolve_exports,
			manifest: manifest_exports,
			sync: sync_exports
		},
		worktree: {
			policy: policy_exports,
			receipt: receipt_exports,
			materialize: materialize_exports,
			git: git_exports,
			setup: setup_exports,
			cleanup: cleanup_exports
		},
		hooks: {
			model: model_exports$1,
			portableRunner: portableRunner_exports,
			userHooks: userHooks_exports,
			scripts: scripts_exports
		},
		tools: {
			categories: categories_exports,
			allowlist: allowlist_exports,
			translator: translator_exports
		},
		detect: {
			repoAnalyzer: repoAnalyzer_exports,
			packageManager: packageManager_exports,
			stackSupport: stackSupport_exports,
			verificationGates: verificationGates_exports
		},
		emit: {
			substitution: substitution_exports,
			monorepoPlan: monorepoPlan_exports,
			agentsMd: agentsMd_exports,
			skillsProjection: skillsProjection_exports,
			stateScaffold: stateScaffold_exports,
			hooksInfra: hooksInfra_exports,
			ownership: ownership_exports,
			planner: planner_exports,
			capabilityMatrix: capabilityMatrix_exports
		},
		adapters: {
			claude: claude_exports,
			cursor: cursor_exports,
			copilot: copilot_exports,
			codex: codex_exports,
			toml: toml_exports,
			registry: registry_exports
		},
		guard: {
			promptGuard: promptGuard_exports,
			outputBounds: outputBounds_exports,
			tokenEstimate: tokenEstimate_exports
		},
		resilience: {
			retry: retry_exports,
			failureClass: failureClass_exports,
			failureLog: failureLog_exports,
			adapterTimeout: adapterTimeout_exports
		},
		roster: {
			triggers: triggers_exports,
			reviewCaps: reviewCaps_exports,
			agentPolicies: agentPolicies_exports,
			agentGrants: agentGrants_exports,
			modelLadder: modelLadder_exports
		},
		plugins: { capabilityFile: capabilityFile_exports },
		config: { parse: parse_exports }
	});
}
function resolvePackageVersion() {
	let dir = path.dirname(fileURLToPath(import.meta.url));
	for (;;) {
		const candidate = path.join(dir, "package.json");
		if (existsSync(candidate)) {
			const parsed = JSON.parse(readFileSync(candidate, "utf8"));
			if (typeof parsed.version === "string") return parsed.version;
		}
		const parent = path.dirname(dir);
		if (parent === dir) throw new Error(`no package.json with a version field above ${import.meta.url}`);
		dir = parent;
	}
}
const VERSION = resolvePackageVersion();
const systemClock = { now: () => /* @__PURE__ */ new Date() };
function createApp(options = {}) {
	const runtime = {
		cwd: options.cwd ?? process.cwd(),
		env: options.env ?? process.env,
		clock: options.clock ?? systemClock
	};
	return {
		version: VERSION,
		runtime
	};
}
//#endregion
export { predictMcpMergeRefusal as $, lookupCatalogEntry as $n, readReviewCap as $t, ADAPTER_REGISTRY as A, effortRank as An, nearestExpressibleEffort as At, MERGED_MCP_JSON_PATHS as B, carriesEngineContentPrefix as Bn, LEARNING_CONFIDENCE_LEVELS as Bt, ensureGitignoreEntry as C, TOOLS as Cn, CLAUDE_COMMANDS_DIR as Ct, suggestStackPacks as D, VALID_MATURITY_TIERS as Dn, CLIENT_MODEL_PROJECTION as Dt, persistLearning as E, VALID_IMPORT_MODES as En, claudeSettingsOwnedKeys as Et, packMcpServers as F, CONTENT_PREFIX as Fn, splitAtManagedBlock as Ft, validateServerIds as G, INSTALL_MODE_DEFAULT as Gn, collectManifestErrors as Gt, mcpReclaimReducers as H, getMarkersForPath as Hn, resolveLearningsCaps as Ht, packDirRelPath as I, ENGINE_CONTENT_PREFIXES as In, NATIVE_SKILL_DIRS as It, predictClaudeSettingsMerge as J, PACK_OWNER_PREFIX as Jn, readCommunicationStyle as Jt, claudeSettingsReclaimReducer as K, MANIFEST_FILE as Kn, createManifest as Kt, ensureStateScaffold as L, HOOKS_GENERATED_DIR as Ln, SKILLS_PROJECTION_DIR as Lt, COPILOT_PROMPTS_DIR as M, resolveBundledForkRoot as Mn, resolveModelValue as Mt, composeEmissionPlanner as N, CONTENT_CLASSES as Nn, extractManagedBlock as Nt, planPackRemoval as O, VALID_MODEL_CLASSES as On, MODEL_LADDER as Ot, discoverInstalledPacks as P, outputOwners as Pn, hasManagedBlock as Pt, planUserMcpJson as Q, packOwner as Qn, readMaturityTier as Qt, formatReclaimReport as R, INVOCABLE_CONTENT_PREFIX as Rn, isPluginOwned as Rt, ENV_MCP_FILE as S, MODEL_CLASSES as Sn, verifyInstalledPacks as St, hardenEnvMcpMode as T, VALID_EFFORT_LEVELS as Tn, CLAUDE_SKILLS_DIR as Tt, CURATED_MCP_SERVERS as U, stripEngineContentPrefix as Un, validateLearningContent as Ut, engineOwnedServerIds as V, contentPrefixFor as Vn, REQUIRED_LEARNING_SECTIONS as Vt, PLATFORM_MCP_SERVER as W, INSTALL_MODES as Wn, applyPreservedManifestFields as Wt, filterMcpServers as X, RULE_DELIVERIES as Xn, readInstallMode as Xt, filterMcpJsonOnDisk as Y, PLUGIN_OWNED_CLASSES as Yn, readGates as Yt, materializeUserMcpJson as Z, isPackOwner as Zn, readManifest$1 as Zt, detectSubRepos as _, DEFAULT_IMPORT_MODE as _n, carriedClasses as _t, readWorktreeInventory as a, readCharterTemplate as an, safeWriteFile as at, writeWorkspaceManifest as b, IMPORT_MODES as bn, uncarriableClasses as bt, probeSetupPresence as c, countSelectionItems as cn, replaceAdapterEntries as ct, resolveFarmDir as d, emittedIdFor as dn, analyzeRepo as dt, readRuleDelivery as en, resolveBundledPackRoot as er, isManagedPath as et, isDirty as f, toPosixDisplayPath as fn, detectMonorepoPackages as ft, detectRepoGitIdentity as g, DEFAULT_COMMUNICATION_STYLE as gn, PLUGIN_ROOT_VARIABLES as gt, runGit as h, COMMUNICATION_STYLES as hn, CARRIABLE_CLASSES as ht, isInside as i, verificationCommandsFor as in, predictPreservedContentRefusal as it, CURSOR_COMMANDS_DIR as j, resolveBundledContentRoot as jn, resolveEffortValue as jt, userContentRoot as k, VALID_TOOLS as kn, isModelClass as kt, runWorktreeSetup as l, buildContentIndex as ln, toLedgerEntries as lt, resolveGitCommonDir as m, parseFrontmatter as mn, summarizeDetection as mt, createApp as n, atomicWriteFile as nn, EngineError as nr, ledgerPathSet as nt, runWorktreeCleanup as o, DETECTION_UNKNOWN as on, assertLedgerContainment as ot, readDirtyCounts as p, composeFrontmatter as pn, isGreenfield as pt, materializeClaudeSettings as q, MANIFEST_VERSION as qn, manifestPath as qt, createEngine as r, isSharedRegularFile as rn, predictMergeAction as rt, planWorktreeSetup as s, renderInvariantsVersion as sn, computeReclaimCandidates as st, VERSION as t, writeManifest as tn, findPackageRoot as tr, ledgerHashIndex as tt, readWorktreePolicy as u, contentRootsOf as un, trustedInfraPaths as ut, detectWorkspaceContext as v, DEFAULT_MATURITY_TIER as vn, readCapabilityFile as vt, getSourceEnvMcpCommand as w, VALID_COMMUNICATION_STYLES as wn, CLAUDE_SETTINGS_PATH as wt, WORKSPACE_MANIFEST_FILE as x, MATURITY_TIERS as xn, describePackIntegrityFinding as xt, createWorkspaceManifest as y, EFFORT_LEVELS as yn, resolvePluginRoot as yt, sweepReclaimCandidates as z, STATE_DIR as zn, pluginOwnedSummary as zt };
