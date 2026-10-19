#!/usr/bin/env node
/* eslint-disable */
// stamity — person-only shell guard.
//
// Reads every shell call and GitHub MCP write for the person-only acts. Attended,
// one that can be undone (a push of a tag or of the default branch, a tag, a
// merge, a release, a publish, a secret or protection write) asks the person for
// one click on Claude Code's main thread and Copilot CLI's main agent and is
// refused elsewhere; a deletion, a
// force push or an act that cannot be undone is refused on every client. While a
// run is unattended every person-only act is refused, and any push that steps
// around `stamity run checkpoint` and `stamity run end`. `curl` and `wget` appear
// below only as command words it reads; it runs none.
//
// Generated file — regenerate it rather than editing; local edits are overwritten.
// Trust posture: exec form, repo-committed, no dynamic evaluation, no network reach.
// Reads outside repo state: the pending call's payload on stdin and the
// STAMITY_UNATTENDED and STAMITY_REPO_ROOT variables. Reads the git metadata and
// the run records' heads; writes only the pre-flight canary.

import { closeSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const STATE_SEGMENTS = [".stamity"];
const RUNS_SEGMENTS = [".stamity","runs"];
const RECORD_FILE = "record.md";
const RUN_ID = new RegExp("^[0-9]{4}-[0-9]{2}-[0-9]{2}_[a-z0-9-]+$", "");
const STATUS = new RegExp("^status:\\s*(.*)$", "i");
const MODE = new RegExp("^mode:\\s*(attended|unattended)\\b", "i");
const IN_PROGRESS = new RegExp("\\bin progress\\b", "i");
const HEAD_LINES = 15;
const HEAD_READ_BYTES = 65536;
const RUN_FOLDERS_MAX = 2000;
const GIT_MAX_BYTES = 4096;
const TAG_NAMES_MAX = 10000;
const PACKED_REFS_MAX_BYTES = 8388608;
const PLACES_MAX = 32;
const CANARY_SEGMENTS = [".stamity","preflight-canary.json"];
const SHELL_TOOLS = new Set(["Bash", "PowerShell", "Shell", "bash", "powershell", "shell"]);
// The GitHub MCP server's person-only tools and whether each is ask-class (personOnly.ts, GITHUB_MCP_ROWS).
const MCP_ROWS = new Map([["mcp__github__merge_pull_request",true],["mcp__github__push_files",true],["mcp__github__create_or_update_file",true],["mcp__github__delete_file",true],["mcp__github__update_pull_request_branch",true],["mcp__github__pull_request_review_write",true],["mcp__github__create_pull_request_review",true],["mcp__github__submit_pending_pull_request_review",true],["mcp__github__update_pull_request",true],["mcp__github__update_pull_request_state",true],["mcp__github__update_pull_request_draft_state",true],["mcp__github__create_branch",true],["mcp__github__delete_repository",false],["mcp__github__create_pull_request",true]]);

const HERE = dirname(fileURLToPath(import.meta.url));
const ANCHOR_SEGMENTS = ["hooks",".claude"];

/**
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

function repoRoot() {
  const cwd = resolve(process.cwd());
  const derived = derivedRoot();
  if (derived !== "") return derived;
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
}

// The person-only verdict and the unattended push rule, as their own source
// (src/hooks/personOnly.ts in the engine that wrote this file). An engine loaded
// through a name-keeping transformer (tsx) wraps their inner functions in
// __name(fn, "name"), a helper it defines outside them: a no-op one stands in.
const __name = (target) => target;
const personOnlyVerdict = function personOnlyVerdict(command, ctx) {
	const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
	const KEYWORDS = /* @__PURE__ */ new Set([
		"!",
		"{",
		"}",
		"if",
		"then",
		"else",
		"elif",
		"fi",
		"do",
		"done",
		"while",
		"until"
	]);
	const WRAPPERS = /* @__PURE__ */ new Set([
		"env",
		"command",
		"builtin",
		"exec",
		"nohup",
		"sudo",
		"doas",
		"nice",
		"timeout",
		"stdbuf",
		"time",
		"xargs",
		"npx",
		"bunx",
		"pnpx",
		"corepack"
	]);
	const RUNNERS = /* @__PURE__ */ new Set([
		"npm exec",
		"npm x",
		"pnpm dlx",
		"pnpm exec",
		"yarn dlx",
		"yarn exec",
		"bun x",
		"bun exec"
	]);
	const RUNNER_OPTIONS = [
		"pw",
		[
			"--package",
			"--workspace",
			"--filter"
		],
		[
			"-c",
			"--call",
			"--shell-mode"
		]
	];
	const NO_OPTIONS = [
		"",
		[],
		[]
	];
	const MANAGERS = /* @__PURE__ */ new Set([
		"npm",
		"pnpm",
		"yarn",
		"bun"
	]);
	const MANAGER_VALUED = /* @__PURE__ */ new Set([
		"-w",
		"--workspace",
		"--filter",
		"-F",
		"--prefix",
		"-C",
		"--dir",
		"--cwd",
		"--registry",
		"--userconfig"
	]);
	const WRAPPER_OPTIONS = /* @__PURE__ */ new Map([
		["env", [
			"uCP",
			["--unset", "--chdir"],
			["-S", "--split-string"]
		]],
		["sudo", [
			"ugpCrtUDRT",
			[
				"--user",
				"--group",
				"--prompt",
				"--close-from",
				"--role",
				"--type",
				"--other-user",
				"--chdir",
				"--chroot",
				"--command-timeout",
				"--host"
			],
			[]
		]],
		["doas", [
			"uC",
			[],
			[]
		]],
		["exec", [
			"a",
			[],
			[]
		]],
		["nice", [
			"n",
			["--adjustment"],
			[]
		]],
		["timeout", [
			"sk",
			["--signal", "--kill-after"],
			[]
		]],
		["stdbuf", [
			"ioe",
			[
				"--input",
				"--output",
				"--error"
			],
			[]
		]],
		["time", [
			"fo",
			["--format", "--output"],
			[]
		]],
		["xargs", [
			"ILnPsdEa",
			[
				"--max-args",
				"--max-procs",
				"--max-chars",
				"--delimiter",
				"--arg-file",
				"--process-slot-var"
			],
			[]
		]],
		["npx", RUNNER_OPTIONS],
		["bunx", RUNNER_OPTIONS],
		["pnpx", RUNNER_OPTIONS]
	]);
	const ANSI_ESCAPES = /* @__PURE__ */ new Map([
		["n", "\n"],
		["t", "	"],
		["r", "\r"],
		["a", "\x07"],
		["b", "\b"],
		["e", "\x1B"],
		["E", "\x1B"],
		["f", "\f"],
		["v", "\v"],
		["\\", "\\"],
		["'", "'"],
		["\"", "\""],
		["?", "?"]
	]);
	const SHELLS = /* @__PURE__ */ new Set([
		"sh",
		"bash",
		"zsh",
		"dash",
		"ksh"
	]);
	const POWERSHELLS = /* @__PURE__ */ new Set([
		"pwsh",
		"powershell",
		"invoke-expression",
		"iex"
	]);
	const PS_SINGLE = "'" + String.fromCharCode(8216, 8217, 8218, 8219);
	const PS_DOUBLE = "\"" + String.fromCharCode(8220, 8221, 8222);
	function programName(word) {
		return (word.split(/[\\/]/).pop() ?? "").toLowerCase().replace(/^([^@]+)@[\s\S]*$/, "$1").replace(/\.(exe|cmd|bat)$/, "");
	}
	function commandFlag(word) {
		const match = /^(?:--?|\/)([a-z]+)(?::([\s\S]*))?$/i.exec(word);
		const name = (match?.[1] ?? "").toLowerCase();
		return name !== "" && ("commandwithargs".startsWith(name) || name === "cwa") ? match?.[2] ?? "" : null;
	}
	function splitLine(text, blocks, pwsh) {
		const segments = [];
		const nested = [];
		let words = [];
		let word = "";
		let inWord = false;
		let dropNext = false;
		const endWord = () => {
			if (!inWord) return;
			if (dropNext) dropNext = false;
			else words.push(word);
			word = "";
			inWord = false;
		};
		const cut = () => {
			endWord();
			dropNext = false;
			if (words.length > 0) segments.push(words);
			words = [];
		};
		const quote = (c, kind) => c !== void 0 && (c === kind[0] || pwsh && kind.includes(c));
		let i = 0;
		while (i < text.length) {
			const ch = text[i] ?? "";
			if (quote(ch, PS_SINGLE)) {
				let stop = i + 1;
				while (stop < text.length && !quote(text[stop], PS_SINGLE)) stop += 1;
				word += text.slice(i + 1, stop);
				inWord = true;
				i = stop + 1;
			} else if (quote(ch, PS_DOUBLE)) {
				inWord = true;
				i += 1;
				while (i < text.length && !quote(text[i], PS_DOUBLE)) {
					const c = text[i] ?? "";
					const next = text[i + 1] ?? "";
					if (pwsh && c === "`" && i + 1 < text.length) {
						word += next;
						i += 2;
					} else if (!pwsh && c === "\\" && i + 1 < text.length) {
						word += "\"\\$`".includes(next) ? next : next === "\n" ? "" : c + next;
						i += 2;
					} else if (c === "$" && next === "(" || !pwsh && c === "`") {
						const start = c === "`" ? i + 1 : i + 2;
						let j = start;
						if (c === "`") while (j < text.length && text[j] !== "`") j += 1;
						else {
							let level = 1;
							while (j < text.length) {
								if (text[j] === "(") level += 1;
								else if (text[j] === ")") level -= 1;
								if (level === 0) break;
								j += 1;
							}
						}
						nested.push(text.slice(start, j));
						word += text.slice(i, Math.min(j + 1, text.length));
						i = j + 1;
					} else {
						word += c;
						i += 1;
					}
				}
				i += 1;
			} else if (ch === "$" && text[i + 1] === "\"") i += 1;
			else if (ch === "$" && text[i + 1] === "'") {
				let j = i + 2;
				while (j < text.length && text[j] !== "'") {
					const c = text[j] ?? "";
					const next = text[j + 1] ?? "";
					const code = /^(?:x[0-9A-Fa-f]{1,2}|u[0-9A-Fa-f]{1,4}|U[0-9A-Fa-f]{1,8}|[0-7]{1,3})/.exec(text.slice(j + 1, j + 10))?.[0];
					if (c !== "\\" || j + 1 >= text.length) {
						word += c;
						j += 1;
					} else if (ANSI_ESCAPES.has(next)) {
						word += ANSI_ESCAPES.get(next) ?? "";
						j += 2;
					} else if (code !== void 0) {
						const point = /^[0-7]/.test(code) ? Number.parseInt(code, 8) : Number.parseInt(code.slice(1), 16);
						word += point <= 1114111 ? String.fromCodePoint(point) : "�";
						j += 1 + code.length;
					} else if (next === "c" && j + 2 < text.length) {
						word += String.fromCharCode(text.charCodeAt(j + 2) & 31);
						j += 3;
					} else {
						word += c + next;
						j += 2;
					}
				}
				inWord = true;
				i = j + 1;
			} else if (ch === (pwsh ? "`" : "\\")) {
				const next = text[i + 1];
				const crlf = next === "\r" && text[i + 2] === "\n";
				if (next !== void 0 && next !== "\n" && !(pwsh && crlf)) {
					word += next;
					inWord = true;
				}
				i += pwsh && crlf ? 3 : 2;
			} else if (ch === "$" && text[i + 1] === "(" || ch === "`" || ch === "(" && (inWord || words.length > 0)) {
				const start = ch === "$" ? i + 2 : i + 1;
				let j = start;
				if (ch === "`") while (j < text.length && text[j] !== "`") j += 1;
				else {
					let level = 1;
					while (j < text.length) {
						if (text[j] === "(") level += 1;
						else if (text[j] === ")") level -= 1;
						if (level === 0) break;
						j += 1;
					}
				}
				nested.push(text.slice(start, j));
				word += text.slice(i, Math.min(j + 1, text.length));
				inWord = true;
				i = j + 1;
			} else if (ch === " " || ch === "	") {
				endWord();
				i += 1;
			} else if (ch === "#" && !inWord) while (i < text.length && text[i] !== "\n") i += 1;
			else if (ch === ">" || ch === "<") {
				if (inWord && /^\d+$/.test(word)) {
					word = "";
					inWord = false;
				} else endWord();
				while (i < text.length && "<>&|".includes(text[i] ?? "")) i += 1;
				dropNext = true;
			} else if (";&|\n\r()`".includes(ch) || blocks && ch === "{" && !inWord || blocks && ch === "}" && word.split("{").length <= word.split("}").length) {
				cut();
				i += 1;
			} else {
				word += ch;
				inWord = true;
				i += 1;
			}
		}
		cut();
		return {
			segments,
			nested
		};
	}
	const assigned = [];
	function commandsOf(text, depth, pwsh) {
		if (depth > 4) throw Object.assign(/* @__PURE__ */ new Error("nesting"), { code: "NESTING_DEPTH" });
		const { segments, nested } = splitLine(text, true, pwsh);
		const commands = pwsh ? commandsOf(text, depth, false) : [];
		for (const words of [...segments, .../[{}]/.test(text) ? splitLine(text, false, pwsh).segments : []]) {
			let k = 0;
			let line = null;
			while (k < words.length && line === null) {
				const word = words[k] ?? "";
				let sub = k + 1;
				while (MANAGERS.has(programName(word)) && sub < words.length) {
					const option = words[sub] ?? "";
					const next = words[sub + 1] ?? "-";
					if (MANAGER_VALUED.has(option) || programName(word) === "yarn" && option === "workspace") sub += 2;
					else if (/^--[^=]+$/.test(option) && !next.startsWith("-") && !RUNNERS.has(`${programName(word)} ${next}`)) sub += 2;
					else if (option.startsWith("-") && option !== "--") sub += 1;
					else break;
				}
				const runner = `${programName(word)} ${words[sub] ?? ""}`;
				if (ASSIGNMENT.test(word) || KEYWORDS.has(word)) {
					if (ASSIGNMENT.test(word)) assigned.push(word);
					k += 1;
				} else if (WRAPPERS.has(programName(word)) || RUNNERS.has(runner)) {
					const [short, long, lineOptions] = RUNNERS.has(runner) ? RUNNER_OPTIONS : WRAPPER_OPTIONS.get(programName(word)) ?? NO_OPTIONS;
					k = RUNNERS.has(runner) ? sub + 1 : k + 1;
					while (k < words.length) {
						const option = words[k] ?? "";
						if (ASSIGNMENT.test(option)) {
							assigned.push(option);
							k += 1;
							continue;
						}
						if (!/^(-|\d)/.test(option)) break;
						k += 1;
						if (option === "--") break;
						let value;
						let isLine = false;
						if (option.startsWith("--")) {
							const name = option.split("=")[0] ?? "";
							if (long.includes(name) || lineOptions.includes(name)) {
								isLine = lineOptions.includes(name);
								value = option.includes("=") ? option.slice(name.length + 1) : words[k];
								if (!option.includes("=")) k += 1;
							}
						} else if (option.startsWith("-")) for (let c = 1; c < option.length; c += 1) {
							const letter = option[c] ?? "";
							if (!short.includes(letter) && !lineOptions.includes(`-${letter}`)) continue;
							isLine = lineOptions.includes(`-${letter}`);
							value = c === option.length - 1 ? words[k] : option.slice(c + 1);
							if (c === option.length - 1) k += 1;
							break;
						}
						if (isLine && value !== void 0) {
							line = [value, ...words.slice(k)].join(" ");
							break;
						}
					}
				} else break;
			}
			if (line !== null) {
				commands.push(...commandsOf(line, depth + 1, pwsh));
				continue;
			}
			const cmd = words.slice(k);
			if (cmd.length === 0) continue;
			if (/\s/.test(cmd[0] ?? "") && cmd.join(" ") !== text) commands.push(...commandsOf(cmd.join(" "), depth + 1, pwsh));
			cmd[0] = programName(cmd[0] ?? "");
			if (/^git-./.test(cmd[0])) cmd.splice(0, 1, "git", cmd[0].slice(4));
			if (SHELLS.has(cmd[0] ?? "")) {
				const flag = cmd.findIndex((word, index) => index > 0 && /^-[A-Za-z]*c[A-Za-z]*$/.test(word));
				const script = flag === -1 ? void 0 : cmd[flag + 1];
				if (script !== void 0) commands.push(...commandsOf(script, depth + 1, false));
			} else if (cmd[0] === "eval") commands.push(...commandsOf(cmd.slice(1).join(" "), depth + 1, false));
			else if (POWERSHELLS.has(cmd[0] ?? "")) {
				const at = cmd.findIndex((word, index) => index > 0 && commandFlag(word) !== null);
				const first = at !== -1 ? -1 : cmd.findIndex((word, index) => index > 0 && !/^-|^\/\w*$/.test(word));
				if (at !== -1) commands.push(...commandsOf([commandFlag(cmd[at] ?? ""), ...cmd.slice(at + 1)].join(" "), depth + 1, true));
				else if (first !== -1) commands.push(...commandsOf(cmd.slice(first).join(" "), depth + 1, true));
				for (const word of first === -1 ? [] : cmd.slice(first + 1)) if (/\s/.test(word)) commands.push(...commandsOf(word, depth + 1, true));
			} else if (cmd[0] === "cmd") {
				const at = cmd.findIndex((word, index) => index > 0 && /^\/[ck]/i.test(word));
				const rest = at === -1 ? "" : [(cmd[at] ?? "").slice(2), ...cmd.slice(at + 1)].join(" ");
				if (at !== -1) commands.push(...commandsOf(rest, depth + 1, true));
				if (rest.includes("^")) commands.push(...commandsOf(rest.replace(/\^([\s\S])/g, "$1"), depth + 1, true));
			} else if (cmd[0] === "git") {
				const { sub, args } = gitParts(cmd);
				const rebase = sub === "rebase" ? args : [];
				for (let j = 0; j < rebase.length && rebase[j] !== "--"; j += 1) {
					const arg = rebase[j] ?? "";
					const long = /^--ex(?:ec?)?(=[\s\S]*)?$/.exec(arg);
					let exec;
					if (long !== null) exec = long[1] === void 0 ? rebase[j += 1] : long[1].slice(1);
					else if (/^-[^-]/.test(arg)) for (let c = 1; c < arg.length; c += 1) {
						const letter = arg[c] ?? "";
						if (letter === "x") exec = c === arg.length - 1 ? rebase[j += 1] : arg.slice(c + 1);
						if (letter === "x" || "sXCS".includes(letter)) {
							if (letter !== "x" && letter !== "S" && c === arg.length - 1) j += 1;
							break;
						}
					}
					if (exec !== void 0) commands.push(...commandsOf(exec, depth + 1, false));
				}
				if (sub === "bisect" && args[0] === "run") commands.push(...commandsOf(args.slice(1).map((word) => `'${word.replace(/'/g, "'\\''")}'`).join(" "), depth + 1, false));
			}
			commands.push(cmd);
		}
		for (const inner of nested) commands.push(...commandsOf(inner, depth + 1, pwsh));
		return commands;
	}
	function gitParts(cmd) {
		const config = [];
		let k = 1;
		while (k < cmd.length) {
			const word = cmd[k] ?? "";
			if (word === "-c") {
				config.push(cmd[k + 1] ?? "");
				k += 2;
			} else if ([
				"-C",
				"--git-dir",
				"--work-tree",
				"--namespace",
				"--config-env",
				"--super-prefix"
			].includes(word)) k += 2;
			else if (word.startsWith("-")) k += 1;
			else break;
		}
		return {
			sub: (cmd[k] ?? "").toLowerCase(),
			args: cmd.slice(k + 1),
			config
		};
	}
	function ghPositionals(cmd) {
		const positionals = [];
		for (let k = 1; k < cmd.length; k += 1) {
			const word = cmd[k] ?? "";
			if (word === "-R" || word === "--repo") k += 1;
			else if (positionals.length < 2 && /^(?:--[^=]+|-[^-])$/.test(word) && ![
				"-h",
				"--help",
				"--version"
			].includes(word)) k += 1;
			else if (!word.startsWith("-")) positionals.push(word);
		}
		return positionals;
	}
	function httpCall(raw) {
		const tool = raw[0] ?? "";
		const hidden = () => {
			throw Object.assign(/* @__PURE__ */ new Error("http target hidden"), { code: "HTTP_TARGET_HIDDEN" });
		};
		const LONG = /* @__PURE__ */ new Map([["wget", [
			"--method",
			"--post-data",
			"--post-file",
			"--body-data",
			"--body-file",
			"--execute",
			"--config",
			"--input-file"
		]], ["curl", [
			"--request",
			"--data",
			"--data-raw",
			"--data-binary",
			"--data-ascii",
			"--data-urlencode",
			"--json",
			"--form",
			"--form-string",
			"--upload-file",
			"--config",
			"--next",
			"--globoff",
			"--url"
		]]]);
		const expanded = raw.map((word) => {
			const name = word.split("=")[0] ?? "";
			const full = /^--[a-z-]{2,}$/i.test(name) ? LONG.get(tool)?.find((option) => option.startsWith(name.toLowerCase())) : void 0;
			return full === void 0 ? word : full + word.slice(name.length);
		});
		const WGETRC = /* @__PURE__ */ new Map([
			["method", "--method"],
			["postdata", "--post-data"],
			["postfile", "--post-file"],
			["bodydata", "--body-data"],
			["bodyfile", "--body-file"],
			["input", "--input-file"]
		]);
		const cmd = [];
		for (let k = 0; k < expanded.length; k += 1) {
			const word = expanded[k] ?? "";
			const lead = tool === "curl" ? /^-([^-:KHouAebcwmxrEdFTXCDPQtyYzU]*)([dFTX])([\s\S]*)$/.exec(word) : tool === "gh" ? /^-(i*)([XfFHpqt])=?([\s\S]*)$/.exec(word) : null;
			if (lead !== null && word.length > 2) {
				if (lead[1]) cmd.push(`-${lead[1]}`);
				cmd.push(`-${lead[2]}`);
				if (lead[3]) cmd.push(lead[3]);
				continue;
			}
			const own = /^(-[A-Za-z]*e|--execute)$/.test(word);
			let rc;
			if (tool === "wget" && k > 0) {
				if (own) rc = expanded[k + 1];
				else if (word.startsWith("--execute=")) rc = word.slice(10);
				else rc = /^-[A-Za-z]*?e(.+)$/.exec(word)?.[1];
			}
			const eq = rc?.indexOf("=") ?? -1;
			const option = rc !== void 0 && eq > 0 ? WGETRC.get(rc.slice(0, eq).trim().toLowerCase().replace(/[-_]/g, "")) : void 0;
			if (rc === void 0 || option === void 0) cmd.push(word);
			else {
				cmd.push(`${option}=${rc.slice(eq + 1).trim()}`);
				if (own) k += 1;
			}
		}
		let method = null;
		let body = false;
		let globoff = false;
		let inputFile = false;
		let end = cmd.length;
		let next = null;
		const targets = [];
		const api = tool === "gh" ? cmd.indexOf("api") : -1;
		const valueFlags = tool === "gh" ? [
			"-H",
			"--header",
			"-q",
			"--jq",
			"-t",
			"--template",
			"--hostname",
			"-p",
			"--preview",
			"--cache"
		] : [
			"-H",
			"--header",
			"-o",
			"--output",
			"-u",
			"--user",
			"-A",
			"--user-agent",
			"-e",
			"--referer",
			"-b",
			"--cookie",
			"-c",
			"--cookie-jar",
			"-w",
			"--write-out",
			"-m",
			"--max-time",
			"-x",
			"--proxy",
			"-K",
			"--config",
			"-r",
			"--range",
			"-E",
			"--cert",
			"--key",
			"--cacert",
			"--oauth2-bearer",
			"--connect-timeout",
			"--retry",
			"-O",
			"--output-document",
			"--password"
		];
		const bodyFlags = tool === "gh" ? [
			"-f",
			"-F",
			"--field",
			"--raw-field",
			"--input"
		] : [
			"-d",
			"--data",
			"--data-raw",
			"--data-binary",
			"--data-urlencode",
			"--data-ascii",
			"--json",
			"-F",
			"--form",
			"--form-string",
			"-T",
			"--upload-file",
			"--post-data",
			"--post-file",
			"--body-data",
			"--body-file"
		];
		for (let k = 1; k < cmd.length; k += 1) {
			if (k === api) continue;
			const word = cmd[k] ?? "";
			const name = word.split("=")[0] ?? "";
			if (tool === "curl" && (word === "--next" || word === "-:")) {
				next = ["curl", ...cmd.slice(k + 1)];
				end = k;
				break;
			}
			if (tool !== "gh" && /^--conf(ig?)?(=|$)/.test(word)) hidden();
			if (tool === "wget" && /^--input-file(=|$)/.test(word)) inputFile = true;
			if (tool !== "gh" && /^-[^-]/.test(word)) for (const letter of word.slice(1)) if (tool === "curl") {
				if (letter === "K" || letter === ":") hidden();
				if (letter === "g") globoff = true;
				if ("HouAebcwmxrEdFTXCDPQtyYzU".includes(letter)) break;
			} else {
				if (letter === "i") inputFile = true;
				if ("oaeiBtOTwQPlARDXIU".includes(letter)) break;
			}
			if (tool === "curl" && word === "--globoff") globoff = true;
			const methodLetter = tool !== "wget";
			if (word === "-X" && methodLetter || word === "--method" || word === "--request") {
				method = cmd[k + 1] ?? hidden();
				k += 1;
			} else if (name === "--method" || name === "--request") method = word.slice(name.length + 1);
			else if (/^-X./.test(word) && methodLetter) method = word.slice(2);
			else if (word === "-X") k += 1;
			else if (bodyFlags.includes(word)) {
				body = true;
				k += 1;
			} else if (word.includes("=") && bodyFlags.includes(name)) body = true;
			else if (word === "--url") {
				targets.push(cmd[k + 1] ?? "");
				k += 1;
			} else if (valueFlags.includes(word)) k += 1;
			else if (/^-[fF]./.test(word) && tool === "gh") body = true;
			else if (!word.startsWith("-")) targets.push(word);
		}
		const verb = (method ?? (body ? "POST" : "GET")).toUpperCase();
		const write = [
			"POST",
			"PUT",
			"PATCH",
			"DELETE"
		].includes(verb);
		if (method !== null && /[$`]/.test(method)) hidden();
		if (tool === "curl" && (write || body) && !globoff && targets.some((target) => /[{[]/.test(target))) hidden();
		if (tool === "wget" && write && inputFile) hidden();
		const resolved = (path) => {
			const segments = path.split("/");
			const kept = [];
			segments.forEach((segment, index) => {
				if (segment === "..") kept.pop();
				else if (segment !== ".") kept.push(segment);
				if ((segment === "." || segment === "..") && index === segments.length - 1) kept.push("");
			});
			return kept.join("/").replace(/^\/+/, "").replace(/^api\/v3\//i, "");
		};
		return {
			write,
			method: verb,
			paths: targets.flatMap((target) => {
				const decoded = (target.replace(/^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/]*/, "").replace(/^[\w-]+(\.[\w-]+)+(:\d+)?(?=\/)/, "").replace(/^\/+/, "").replace(/^api\/v3\//i, "").split(/[?#]/)[0] ?? "").replace(/%([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
				return [.../* @__PURE__ */ new Set([decoded, resolved(decoded)])].map((path) => path.replace(/\/+$/, "").replace(/^repos\/[^/]+\/[^/]+\//i, "").replace(/^(orgs|enterprises|users|repositories)\/[^/]+\//i, ""));
			}),
			cmd: cmd.slice(0, end),
			next
		};
	}
	const branch = (ref) => ref.replace(/^refs\/heads\//i, "").replace(/^refs\/remotes\/[^/]+\//i, "").toLowerCase();
	const defaults = /* @__PURE__ */ new Set([
		"main",
		"master",
		...ctx.defaultBranches.map(branch)
	]);
	const onDefault = ctx.currentBranch !== null && defaults.has(branch(ctx.currentBranch));
	let tagNames = null;
	const isTagName = (name) => (tagNames ??= new Set(ctx.tags.map((tag) => tag.replace(/^refs\/tags\//i, "").toLowerCase()))).has(name);
	const ASK_RULES = /* @__PURE__ */ new Set([
		"push-default",
		"push-tags",
		"tag",
		"pr-merge",
		"pr-ready",
		"release",
		"publish",
		"secrets",
		"protection"
	]);
	const acts = [];
	const deny = (rule, what) => {
		const verdict = {
			deny: true,
			rule,
			act: what,
			reason: `${what} is a person-only act (${rule}): the person runs it, never the agent (REQ-FLOW-102). Stop here and list it for the person.`,
			ask: ASK_RULES.has(rule)
		};
		acts.push(verdict);
		return verdict;
	};
	function destination(refspec) {
		const spec = refspec.replace(/^\+/, "");
		const colon = spec.indexOf(":");
		if (colon === -1) return spec;
		const dst = spec.slice(colon + 1);
		return dst === "" ? spec.slice(0, colon) : dst;
	}
	function pushVerdict(args, config) {
		let force = false;
		let remove = false;
		let tags = false;
		let matching = false;
		let repoGiven = false;
		const positionals = [];
		const configured = [];
		for (const pair of config) {
			const eq = pair.indexOf("=");
			const key = (eq === -1 ? pair : pair.slice(0, eq)).toLowerCase();
			const value = eq === -1 ? "true" : pair.slice(eq + 1).toLowerCase();
			const on = ![
				"false",
				"no",
				"off",
				"0",
				""
			].includes(value);
			if (key === "push.followtags" && on) tags = true;
			if (/^remote\..+\.mirror$/.test(key) && on) force = true;
			if (key === "push.default" && value === "matching") matching = true;
			if (/^remote\..+\.push$/.test(key) && eq !== -1) configured.push(pair.slice(eq + 1));
			if (/^branch\..+\.merge$/.test(key) && eq !== -1) configured.push(`HEAD:${pair.slice(eq + 1)}`);
		}
		for (let j = 0; j < args.length; j += 1) {
			const arg = args[j] ?? "";
			if (arg === "--") {
				positionals.push(...args.slice(j + 1));
				break;
			}
			if (arg.startsWith("--")) {
				const name = (arg.split("=")[0] ?? "").toLowerCase();
				const is = (options) => name.length > 2 && options.some((option) => option.startsWith(name));
				if (is([
					"--force",
					"--force-with-lease",
					"--force-if-includes",
					"--mirror"
				])) force = true;
				else if (is([
					"--tags",
					"--follow-tags",
					"--all",
					"--branches"
				])) tags = true;
				else if (is(["--delete", "--prune"])) remove = true;
				else if (is(["--repo"])) {
					repoGiven = true;
					if (!arg.includes("=")) j += 1;
				} else if (is([
					"--push-option",
					"--receive-pack",
					"--exec"
				]) && !arg.includes("=")) j += 1;
			} else if (arg.startsWith("-") && arg.length > 1) for (let c = 1; c < arg.length; c += 1) {
				const flag = arg[c];
				if (flag === "f") force = true;
				else if (flag === "d") remove = true;
				else if (flag === "o") {
					if (c === arg.length - 1) j += 1;
					break;
				}
			}
			else positionals.push(arg);
		}
		const named = repoGiven ? positionals : positionals.slice(1);
		const tagWord = named.indexOf("tag");
		const tagNamed = tagWord !== -1 && tagWord < named.length - 1;
		const refspecs = named.length > 0 ? named : configured;
		const namesTag = (side) => side !== "" && (/^(refs\/)?tags\//i.test(side) || isTagName(side.toLowerCase()));
		if (force || refspecs.some((spec) => spec.startsWith("+"))) return deny("force-push", "A force push");
		const deleted = refspecs.filter((spec) => spec.length > 1 && spec.startsWith(":")).map((spec) => spec.slice(1));
		if (remove || deleted.length > 0) {
			if (tagNamed || [...deleted, ...remove ? refspecs : []].some(namesTag)) return deny("tag-delete", "A remote tag deletion");
			return deny("push-delete", "A remote branch deletion");
		}
		if (tagNamed) return deny("push-tags", "A push of tags");
		const sides = (spec) => {
			const bare = spec.replace(/^\+/, "");
			const colon = bare.indexOf(":");
			return colon === -1 ? [bare] : [bare.slice(0, colon), bare.slice(colon + 1)];
		};
		if (tags || refspecs.some((spec) => sides(spec).some(namesTag))) return deny("push-tags", "A push of tags");
		for (const spec of refspecs) {
			const name = destination(spec).replace(/^(refs\/)?heads\//i, "").toLowerCase();
			if (spec === ":" || spec === "+:") return deny("push-default", "A matching push, the default branch among them");
			if (defaults.has(name)) return deny("push-default", `A push to the default branch \`${name}\``);
			if ((name === "head" || name === "@") && onDefault) return deny("push-default", "A push of `HEAD` while on the default branch");
			const pattern = destination(spec).toLowerCase();
			if (pattern.includes("*")) {
				const parts = pattern.split("*").map((part) => part.replace(/[.+?^$()|[\]{}\\]/g, "\\$&"));
				const glob = new RegExp(`^${parts.join(".*")}$`);
				if ([...defaults].some((ref) => [
					ref,
					`heads/${ref}`,
					`refs/heads/${ref}`
				].some((full) => glob.test(full)))) return deny("push-default", "A pattern push, the default branch among the branches it matches");
			}
		}
		if (named.length === 0 && (onDefault || matching)) return deny("push-default", "A push with no refspec that lands on the default branch");
		return null;
	}
	function tagVerdict(args) {
		const write = /* @__PURE__ */ new Set([
			"--annotate",
			"--sign",
			"--local-user",
			"--force",
			"--delete",
			"--message",
			"--file",
			"--edit",
			"--verify",
			"--create-reflog",
			"--cleanup",
			"--trailer"
		]);
		const valued = /* @__PURE__ */ new Set([
			"--contains",
			"--no-contains",
			"--merged",
			"--no-merged",
			"--points-at",
			"--sort",
			"--format"
		]);
		const listing = /* @__PURE__ */ new Set([
			"--list",
			"--contains",
			"--no-contains",
			"--merged",
			"--no-merged",
			"--points-at"
		]);
		let list = false;
		let written = false;
		let removed = false;
		const positionals = [];
		for (let j = 0; j < args.length; j += 1) {
			const arg = args[j] ?? "";
			if (arg === "--") {
				positionals.push(...args.slice(j + 1));
				break;
			}
			if (arg.startsWith("--")) {
				const name = arg.split("=")[0] ?? "";
				if (name.length > 2 && ["--delete", "--force"].some((option) => option.startsWith(name))) removed = true;
				else if (write.has(name)) written = true;
				if (listing.has(name)) list = true;
				if ((valued.has(name) || [
					"--local-user",
					"--message",
					"--file",
					"--cleanup",
					"--trailer"
				].includes(name)) && !arg.includes("=")) j += 1;
			} else if (arg.startsWith("-") && arg.length > 1) for (let c = 1; c < arg.length; c += 1) {
				const letter = arg[c] ?? "";
				if (letter === "d" || letter === "f") removed = true;
				else if ("asmFuev".includes(letter)) written = true;
				if (letter === "l" || letter === "n") list = true;
				if ("umFn".includes(letter)) {
					if (c === arg.length - 1 && letter !== "n") j += 1;
					break;
				}
			}
			else positionals.push(arg);
		}
		if (removed) return deny("tag-delete", "A tag deleted or moved (`git tag -d` or `-f`)");
		if (written) return deny("tag", "A tag write (`git tag`)");
		return list || positionals.length === 0 ? null : deny("tag", "A tag created (`git tag <name>`)");
	}
	function symbolicRefVerdict(args, via = "git symbolic-ref") {
		let remove = false;
		const positionals = [];
		for (let j = 0; j < args.length; j += 1) {
			const arg = args[j] ?? "";
			if (arg === "--") {
				positionals.push(...args.slice(j + 1));
				break;
			}
			if (arg.startsWith("--")) {
				const name = (arg.split("=")[0] ?? "").toLowerCase();
				if (name.length > 2 && "--delete".startsWith(name)) remove = true;
			} else if (arg.startsWith("-") && arg.length > 1) {
				for (let c = 1; c < arg.length; c += 1) if (arg[c] === "d") remove = true;
				else if (arg[c] === "m") {
					if (c === arg.length - 1) j += 1;
					break;
				}
			} else positionals.push(arg);
		}
		const [name = "", target] = positionals;
		if (remove && /^(refs\/)?tags\//i.test(name)) return deny("tag-delete", `A symbolic tag ref deleted (\`${via}\`)`);
		if (target !== void 0 && /^(refs\/)?tags\//i.test(name)) return deny("tag", `A symbolic tag ref written or deleted (\`${via}\`)`);
		if (remove || target === void 0 || name === "HEAD") return null;
		if (/[$`]/.test(target) || defaults.has(target.replace(/^(refs\/)?heads\//i, "").toLowerCase())) return deny("push-default", `A symbolic ref pointed at the default branch, or at a branch the line cannot show (\`${via}\`)`);
		return null;
	}
	function ghVerdict(cmd) {
		const [group, sub] = ghPositionals(cmd);
		const flag = (long, short, valued) => cmd.some((word) => {
			if (word === long || word.startsWith(`${long}=`)) return !/^(?:false|f|0)$/i.test(word.slice(long.length + 1));
			if (!/^-[^-]/.test(word)) return false;
			for (const letter of word.slice(1)) {
				if (letter === short) return true;
				if (valued.includes(letter)) return false;
			}
			return false;
		});
		if (group === "pr" && sub === "merge" && flag("--delete-branch", "d", "bFtA")) deny("push-delete", "A remote branch deletion (`gh pr merge --delete-branch`)");
		if (group === "pr" && sub === "merge") deny("pr-merge", "Merging a pull request (`gh pr merge`)");
		if (group === "pr" && sub === "close" && flag("--delete-branch", "d", "c")) deny("push-delete", "A remote branch deletion (`gh pr close --delete-branch`)");
		if (group === "pr" && sub === "review" && flag("--approve", "a", "bF")) deny("pr-merge", "Approving a pull request review (`gh pr review --approve`)");
		if (group === "pr" && sub === "ready") deny("pr-ready", "Marking a pull request ready (`gh pr ready`)");
		if (group === "release" && sub !== void 0 && ![
			"list",
			"ls",
			"view",
			"download"
		].includes(sub)) {
			if (sub === "delete" || sub === "delete-asset" || sub === "upload" && flag("--clobber", "", "")) deny("release-delete", `A release or asset deletion (\`gh release ${sub}\`)`);
			else deny("release", "A release write (`gh release`)");
		}
		if ((group === "secret" || group === "variable") && sub !== void 0 && ![
			"list",
			"ls",
			...group === "variable" ? ["get"] : []
		].includes(sub)) {
			if (sub === "delete" || sub === "remove") deny("secrets-delete", `A ${group} deletion (\`gh ${group} ${sub}\`)`);
			else deny("secrets", `A ${group} write (\`gh ${group}\`)`);
		}
		if (group === "repo" && sub === "delete") deny("repo-delete", "A repository delete (`gh repo delete`)");
		if (group === "repo" && sub === "transfer") deny("repo-irreversible", "A repository transfer (`gh repo transfer`)");
		if (group === "repo" && [
			"archive",
			"unarchive",
			"rename"
		].includes(sub ?? "")) deny("protection", `A repository ${sub} (\`gh repo ${sub}\`)`);
		if (group === "repo" && sub === "sync") {
			const words = [];
			const branches = [];
			for (let k = 1; k < cmd.length; k += 1) {
				const word = cmd[k] ?? "";
				if (word === "-b" || word === "--branch") branches.push(cmd[k += 1] ?? "");
				else if (word.startsWith("--branch=")) branches.push(word.slice(9));
				else if (/^-b./.test(word)) branches.push(word.slice(2).replace(/^=/, ""));
				else if ([
					"-R",
					"--repo",
					"-s",
					"--source"
				].includes(word)) k += 1;
				else if (!word.startsWith("-")) words.push(word);
			}
			if (words.length > 2) {
				if (flag("--force", "", "")) deny("force-push", "A forced sync of a repository (`gh repo sync --force`)");
				if (branches.length === 0 || branches.some((name) => name === "" || /[$`]/.test(name) || defaults.has(branch(name)))) deny("push-default", "A sync of a repository's default branch, or of a branch the line cannot show (`gh repo sync`)");
			}
		}
		if (group === "repo" && sub === "edit") {
			if (cmd.some((word) => /^--visibility(=|$)/.test(word))) deny("repo-irreversible", "A visibility change (`gh repo edit --visibility`)");
			if (cmd.some((word) => /^--default-branch(=|$)/.test(word))) deny("protection", "A default-branch change (`gh repo edit --default-branch`)");
			else deny("protection", "A repository settings write (`gh repo edit`)");
		}
		if (group === "api") httpVerdict(cmd);
	}
	function httpVerdict(line) {
		const gh = line[0] === "gh";
		const fill = (value) => value.replace(/\{branch\}|:branch\b/g, () => ctx.currentBranch === null ? "main" : branch(ctx.currentBranch));
		const { write, method, paths: targets, cmd, next } = httpCall(line);
		if (next !== null) httpVerdict(next);
		const paths = gh ? targets.map(fill) : targets;
		const text = cmd.join(" ");
		const fieldFlag = gh ? /^(-[fF]|--field|--raw-field)$/ : /^(-[A-Za-z]*d|--data(-raw|-binary|-ascii|-urlencode)?|--json|--post-data|--body-data)$/;
		const fieldAttached = gh ? /^(-[fF]|--field=|--raw-field=)/ : /^(-d|--(data(-raw|-binary|-ascii|-urlencode)?|json|post-data|body-data)=)/;
		const bodyFields = [];
		const queries = [];
		let hiddenBody = false;
		const add = (key, value, typed) => {
			const shown = typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : null;
			const placed = typed && shown !== null ? shown === "null" ? null : fill(shown) : shown;
			if (key === "query" && typeof value === "string" && !(typed && value.startsWith("@"))) queries.push(typed ? fill(value) : value);
			else bodyFields.push([key, placed === null || /[$`]/.test(placed) || typed && placed.startsWith("@") ? null : placed]);
		};
		for (let k = 1; k < cmd.length; k += 1) {
			const word = cmd[k] ?? "";
			const named = word.split("=")[0] ?? "";
			if (gh ? named === "--input" : [
				"-F",
				"-T",
				"--upload-file",
				"--form",
				"--form-string",
				"--post-file",
				"--body-file"
			].includes(named) || /^-[FT]./.test(word) || /^-[A-Za-z]{2,}$/.test(word) && /[FT]/.test(word.split("X")[0] ?? "")) hiddenBody = true;
			let value = fieldAttached.exec(word)?.[0];
			if (fieldFlag.test(word)) {
				value = cmd[k + 1];
				k += 1;
			} else if (value !== void 0) value = word.slice(value.length);
			if (value === void 0) continue;
			if (gh) {
				const eq = value.indexOf("=");
				if (eq > 0) add(value.slice(0, eq), value.slice(eq + 1), /^(-F|--field)/.test(word));
				if (/^(-F|--field)/.test(word) && value.slice(eq + 1).startsWith("@")) hiddenBody = true;
				continue;
			}
			try {
				const body = JSON.parse(value);
				if (typeof body === "object" && body !== null && !Array.isArray(body)) for (const [key, field] of Object.entries(body)) add(key, field, false);
				else hiddenBody = true;
			} catch {
				hiddenBody = true;
			}
		}
		const fields = (key) => bodyFields.filter(([name]) => name === key).map(([, value]) => value);
		const landsOnDefault = (values) => values.length === 0 || values.some((value) => value === null || value === "" || defaults.has(branch(value)));
		const forced = (values) => values.some((value) => value === null || ![
			"false",
			"0",
			"no",
			"off",
			""
		].includes(value.toLowerCase()));
		const mask = (query) => query.replace(/"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|#[^\n]*/g, (lit) => (lit.startsWith("\"") ? "\"" : " ").padEnd(lit.length));
		const valueAt = (query, at) => {
			const after = query.slice(at);
			const literal = after.startsWith("\"\"\"") ? void 0 : /^"(?:\\.|[^"\\])*"/.exec(after)?.[0];
			let value = /^[\w.-]+/.exec(after)?.[0] ?? null;
			if (literal !== void 0) try {
				const decoded = JSON.parse(literal);
				value = typeof decoded === "string" && !/[$`]/.test(decoded) ? decoded : null;
			} catch {
				value = null;
			}
			return value;
		};
		const spans = (name) => {
			const found = [];
			for (const query of queries) {
				const masked = mask(query);
				for (const call of masked.matchAll(new RegExp(`\\b${name}\\s*\\(`, "g"))) {
					const start = (call.index ?? 0) + call[0].length;
					let end = start;
					for (let level = 1; end < masked.length; end += 1) {
						if (masked[end] === "(") level += 1;
						else if (masked[end] === ")") level -= 1;
						if (level === 0) break;
					}
					found.push([
						query,
						masked,
						start,
						end
					]);
				}
			}
			return found;
		};
		const calls = (name, key) => spans(name).map(([query, masked, start, end]) => [...masked.slice(start, end).matchAll(new RegExp(`\\b${key}\\s*:\\s*`, "g"))].map((arg) => valueAt(query, start + (arg.index ?? 0) + arg[0].length)));
		const refEntries = () => {
			const entries = [];
			const read = (query, masked, from, to, key) => {
				const arg = new RegExp(`\\b${key}\\s*:\\s*`).exec(masked.slice(from, to));
				return arg === null ? null : valueAt(query, from + arg.index + arg[0].length);
			};
			for (const [query, masked, start, end] of spans("updateRefs")) {
				const list = /\brefUpdates\s*:\s*/.exec(masked.slice(start, end));
				let k = list === null ? end : start + list.index + list[0].length;
				if (masked[k] !== "[") {
					entries.push({
						name: null,
						oid: null
					});
					continue;
				}
				let depth = 0;
				let from = k;
				for (k += 1; k < end; k += 1) {
					const ch = masked[k];
					if (depth === 0 && ch === "]") break;
					if (ch === "{") {
						if (depth === 0) from = k;
						depth += 1;
					} else if (ch === "}") {
						depth -= 1;
						if (depth === 0) entries.push({
							name: read(query, masked, from, k, "name"),
							oid: read(query, masked, from, k, "afterOid")
						});
					} else if (ch === "$" && depth === 0) entries.push({
						name: null,
						oid: null
					});
				}
			}
			return entries;
		};
		const callsLand = (name, key) => {
			const found = calls(name, key);
			return found.length === 0 || found.some(landsOnDefault);
		};
		for (const path of paths) {
			const shown = `${method} ${path}`;
			if (/^graphql$/i.test(path)) {
				if (/\b(mergePullRequest|enablePullRequestAutoMerge|enqueuePullRequest)\b/.test(text)) deny("pr-merge", "A GraphQL merge");
				if (/\bmarkPullRequestReadyForReview\b/.test(text)) deny("pr-ready", "A GraphQL ready-for-review");
				if (/\b(deleteBranchProtectionRule|deleteRepositoryRuleset|deleteRepositoryCustomProperty)\b/.test(text)) deny("protection-delete", "A GraphQL protection, ruleset or custom property deletion");
				if (/\b(archiveRepository|unarchiveRepository|updateRepository(CustomProperty|Ruleset|WebCommitSignoffSetting)?|(create|update)(BranchProtectionRule|RepositoryRuleset)|(create|promote)RepositoryCustomProperty|setRepositoryCustomPropertyValues)\b/.test(text)) deny("protection", "A GraphQL repository settings, protection or ruleset write");
				if (/\b(addPullRequestReview|submitPullRequestReview)\b/.test(text)) {
					const reviews = [...calls("addPullRequestReview", "event"), ...calls("submitPullRequestReview", "event")];
					const variables = queries.some((query) => mask(query).includes("$"));
					if (reviews.length === 0 || reviews.some((events) => events.length === 0 && variables || events.some((event) => event === null || /^approve$/i.test(event)))) deny("pr-merge", "A GraphQL review approval, or a review whose event the line cannot show");
				}
				if (/\bcreateCommitOnBranch\b/.test(text) && callsLand("createCommitOnBranch", "branchName")) deny("push-default", "A GraphQL commit to the default branch");
				if (/\bmergeBranch\b/.test(text) && callsLand("mergeBranch", "base")) deny("push-default", "A GraphQL merge into the default branch");
				if (/\bupdateRefs?\b/.test(text)) {
					if ([...calls("updateRef", "force"), ...calls("updateRefs", "force")].some(forced)) deny("force-push", "A forced GraphQL ref update");
					for (const entry of refEntries()) {
						if (entry.oid !== null && !/^(0{40}|0{64})$/.test(entry.oid)) continue;
						if (entry.name !== null && /^refs\/tags\//i.test(entry.name)) deny("tag-delete", "A GraphQL tag ref deletion");
						else deny("push-delete", "A GraphQL ref deletion, or a ref update whose target the line cannot show");
					}
					if (calls("updateRefs", "name").flat().some((ref) => ref !== null && /^refs\/tags\//i.test(ref))) deny("push-tags", "A GraphQL tag ref update");
					const hidden = queries.some((query) => /\brefUpdates\s*:\s*\[(?:[^\]]*,)?\s*\$/.test(mask(query)));
					if (/\bupdateRef\b/.test(text) || hidden || callsLand("updateRefs", "name")) deny("push-default", "A GraphQL ref update onto the default branch, or onto a ref the line cannot show");
				}
				if (/\bdeleteRef\b/.test(text)) deny("push-delete", "A GraphQL ref deletion");
				if (/\bcreateRef\b/.test(text)) {
					const created = calls("createRef", "name");
					if (created.length === 0 || created.some((refs) => refs.length === 0 || refs.some((ref) => ref === null || /^refs\/tags\//i.test(ref)))) deny("push-tags", "A GraphQL tag ref created, or a ref the line cannot show");
					else if (created.flat().some((ref) => ref !== null && defaults.has(branch(ref)))) deny("push-default", "A GraphQL ref created on the default branch");
				}
				continue;
			}
			if (write) restAct(path, shown);
		}
		function restAct(path, shown) {
			if (/^pulls\/[^/]+\/merge(-async)?(\/|$)/i.test(path)) deny("pr-merge", `A REST merge (${shown})`);
			if (/^pulls\/[^/]+\/reviews(\/[^/]+\/events)?$/i.test(path) && (hiddenBody || fields("event").some((event) => event === null || /^approve$/i.test(event.trim())))) deny("pr-merge", `A REST review approval, or a review whose body the line cannot show (${shown})`);
			if (/^branches\/.+\/protection(\/|$)/i.test(path) || /^(rulesets|properties)(\/|$)/i.test(path)) {
				if (method === "DELETE") deny("protection-delete", `A protection, ruleset or custom property deletion (${shown})`);
				else deny("protection", `A protection or ruleset write (${shown})`);
			}
			if (/^environments\/(?!.+\/(deployment_protection_rules|deployment-branch-policies|secrets|variables)(\/|$)).+$/i.test(path)) {
				if (method === "DELETE") deny("protection-delete", `A deployment environment deletion (${shown})`);
				else if (method === "PUT") deny("protection", `A deployment environment write (${shown})`);
			}
			if (/^environments\/.+\/(deployment_protection_rules|deployment-branch-policies)(\/|$)/i.test(path)) {
				if (method === "DELETE") deny("protection-delete", `A deployment protection rule or branch policy deletion (${shown})`);
				else deny("protection", `A deployment protection rule or branch policy write (${shown})`);
			}
			if (/^(repos\/[^/]+\/[^/]+|repositories\/[^/]+)$/i.test(path) && (method === "PATCH" || method === "DELETE")) {
				if (method === "DELETE") deny("repo-delete", `A repository settings write or deletion (${shown})`);
				else if (hiddenBody || fields("visibility").length > 0 || fields("private").length > 0) deny("repo-irreversible", `A repository visibility change, or a settings write whose body the line cannot show (${shown})`);
				else deny("protection", `A repository settings write or deletion (${shown})`);
			}
			if (/^branches\/.+\/rename$/i.test(path)) deny("protection", `A branch rename (${shown})`);
			if (/^transfer$/i.test(path)) deny("repo-irreversible", `A repository transfer (${shown})`);
			if (/^contents(\/|$)/i.test(path) && landsOnDefault(fields("branch"))) deny("push-default", `A REST commit to the default branch (${shown})`);
			if (/^merges$/i.test(path) && landsOnDefault(fields("base")) || /^merge-upstream$/i.test(path) && landsOnDefault(fields("branch"))) deny("push-default", `A REST merge into the default branch (${shown})`);
			if (/^((actions|dependabot|codespaces|agents|user\/codespaces)|environments\/.+)\/(secrets|variables)(\/|$)/i.test(path)) {
				if (method === "DELETE") deny("secrets-delete", `A secret or variable deletion (${shown})`);
				else deny("secrets", `A secret or variable write (${shown})`);
			}
			if (/^releases(\/|$)/i.test(path)) {
				if (method === "DELETE") deny("release-delete", `A release or asset deletion (${shown})`);
				else deny("release", `A release write (${shown})`);
			}
			if (/^git\/refs(\/|$)/i.test(path)) refAct(path, shown);
		}
		function refAct(path, shown) {
			if (method === "DELETE") {
				if (/^git\/refs\/tags(\/|$)/i.test(path)) deny("tag-delete", `A REST tag ref deletion (${shown})`);
				else deny("push-delete", `A REST ref deletion (${shown})`);
				return;
			}
			if (forced(fields("force")) || method === "PATCH" && hiddenBody) {
				deny("force-push", `A forced REST ref update, or one whose body the line cannot show (${shown})`);
				return;
			}
			const refs = fields("ref");
			if (/^git\/refs\/tags(\/|$)/i.test(path) || /(^|[=\s])refs\/tags\//i.test(text) || refs.some((ref) => ref === null || /^refs\/tags\//i.test(ref))) {
				deny("push-tags", `A REST tag ref write (${shown})`);
				return;
			}
			if ([
				/^git\/refs\/heads\/(.+)$/i.exec(path)?.[1] ?? "",
				...[...text.matchAll(/(?:^|[=\s/])refs\/heads\/(\S+)/gi)].map((match) => match[1] ?? ""),
				...refs.map((ref) => /^refs\/heads\/(.+)$/i.exec(ref ?? "")?.[1] ?? "")
			].some((name) => defaults.has(name.toLowerCase()))) deny("push-default", `A REST write to the default branch (${shown})`);
		}
	}
	function publishVerdict(cmd) {
		const valued = /* @__PURE__ */ new Set([
			"--registry",
			"--workspace",
			"-w",
			"--prefix",
			"-C",
			"--dir",
			"--filter",
			"--userconfig",
			"--cwd",
			"--tag",
			"--otp",
			"--access"
		]);
		const npm = cmd[0] === "npm";
		const flags = /* @__PURE__ */ new Set([
			"--json",
			"--dry-run",
			"--force",
			"--global",
			"--parseable",
			"--color",
			"--no-color",
			"--silent",
			"--quiet",
			"--verbose",
			"-s",
			"-q",
			"-d",
			"-g",
			"-f",
			"-p"
		]);
		const kept = (option, next) => /^pu(?:b(?:l(?:i(?:sh?)?)?)?)?$/.test(next) || flags.has(option.replace(/^-(?=[^-]{2})/, "--")) && [
			"run",
			"run-script",
			"exec",
			"x"
		].includes(next);
		const positionalsOf = (settings) => {
			const positionals = [];
			for (let k = 1; k < cmd.length; k += 1) {
				const word = cmd[k] ?? "";
				const next = cmd[k + 1] ?? "-";
				if (valued.has(word)) k += 1;
				else if (settings && positionals.length === 0 && /^-{1,2}[^-=][^=]*$/.test(word) && !next.startsWith("-") && !kept(word, next)) k += 1;
				else if (!word.startsWith("-")) positionals.push(word);
			}
			return positionals;
		};
		const publishes = [positionalsOf(false), ...npm ? [positionalsOf(true)] : []].some((positionals) => positionals.some((word, index) => (word === "publish" || (index === 0 ? npm : positionals[index - 1] === "npm") && /^pu(?:b(?:l(?:i(?:sh?)?)?)?)?$/.test(word)) && (index === 0 || [
			"npm",
			"pnpm",
			"yarn",
			"bun"
		].includes(positionals[index - 1] ?? "") || cmd[0] === "yarn" && index === 2 && positionals[0] === "workspace")));
		for (const positionals of npm ? [positionalsOf(false), positionalsOf(true)] : [positionalsOf(false)]) for (const [index, word] of positionals.entries()) {
			const passed = index === 0 && cmd[0] === "pnpm" && (word === "unpublish" || word === "dist-tag");
			const own = cmd[0] === "yarn" && word === "tag" && (index === 0 || index === 2 && positionals[0] === "workspace");
			if (!passed && !own && !(index === 0 ? npm : positionals[index - 1] === "npm")) continue;
			if (/^unp(?:u(?:b(?:l(?:i(?:sh?)?)?)?)?)?$/.test(word)) deny("unpublish", "Withdrawing a package (`npm unpublish`)");
			const action = word === "dist-tag" || word === "dist-tags" || cmd[0] === "yarn" && word === "tag" ? positionals[index + 1] ?? "" : "";
			if ([
				"rm",
				"r",
				"del",
				"d",
				"remove"
			].includes(action)) deny("unpublish", "A dist-tag removed (`npm dist-tag rm`)");
			if ([
				"add",
				"a",
				"set",
				"s"
			].includes(action)) deny("publish", "A dist-tag moved (`npm dist-tag add`)");
		}
		return publishes ? deny("publish", `Publishing a package (\`${cmd[0]} publish\`)`) : null;
	}
	for (const cmd of commandsOf(command, 0, false)) {
		const program = cmd[0] ?? "";
		if (program === "git") {
			const { sub, args, config } = gitParts(cmd);
			if (sub === "push") pushVerdict(args, config);
			else if (sub === "send-pack") pushVerdict(args, [...config, "push.default=matching"]);
			else if (sub === "tag") tagVerdict(args);
			else if (sub === "update-ref" && (args.some((arg) => /^(refs\/)?tags\//i.test(arg)) || args.includes("--stdin") && /refs\/tags\//i.test(command))) {
				const zero = /(^|[^0-9a-f])(0{40}|0{64})([^0-9a-f]|$)/i;
				const [, value = ""] = args.filter((arg, index) => !arg.startsWith("-") && args[index - 1] !== "-m");
				const word = String.raw`[^\s'"\\|;&<>()]`;
				const separator = String.raw`(?: |\\(?:x[\da-fA-F]{1,2}|u[\da-fA-F]{1,4}|[0-7]{1,4}))`;
				const before = String.raw`(?<=^|[^\w-]|\\(?:x[\da-fA-F]{1,2}|u[\da-fA-F]{1,4}|U[\da-fA-F]{1,8}|[0-7]{1,4}|[a-zA-Z])|%[-#0+ \d.]*[a-zA-Z])`;
				const emptied = new RegExp(String.raw`${before}update${separator}+refs\/tags\/${word}+(?!${word})(?!${separator}${word})`, "i");
				if (args.some((arg) => /^-[^-m]*d/.test(arg)) || zero.test(value) || args.includes("--stdin") && (/\bdelete\b/.test(command) || zero.test(command) || emptied.test(command))) deny("tag-delete", "A tag ref deleted (`git update-ref`)");
				else deny("tag", "A tag ref write (`git update-ref`)");
			} else if (sub === "update-ref" && args.includes("--stdin")) {
				const word = String.raw`(?:[\s'"]|\\(?:x[\da-fA-F]{1,2}|u[\da-fA-F]{1,4}|U[\da-fA-F]{1,8}|[0-7]{1,4}|[a-z]))+([^\s'"\\|;&<>()]+)`;
				for (const [, op, ref = "", target] of command.matchAll(new RegExp(String.raw`symref-(create|update|delete)${word}(?:${word})?`, "g"))) {
					const shown = target === void 0 || target.includes("%") ? "$" : target;
					symbolicRefVerdict(op === "delete" ? ["-d", ref] : [ref, shown], "git update-ref --stdin");
				}
			} else if (sub === "symbolic-ref") symbolicRefVerdict(args);
			else if (sub === "subtree") {
				const valued = /* @__PURE__ */ new Set([
					"-P",
					"--prefix",
					"-m",
					"--message",
					"-b",
					"--branch",
					"--onto"
				]);
				const words = args.filter((word, index) => !word.startsWith("-") && !valued.has(args[index - 1] ?? ""));
				if (words[0] === "push") pushVerdict(words.slice(1), config);
			}
		} else if (program === "gh") ghVerdict(cmd);
		else if (program === "curl" || program === "wget") httpVerdict(cmd);
		else if ([
			"npm",
			"pnpm",
			"yarn",
			"bun"
		].includes(program)) publishVerdict(cmd);
	}
	return acts.find((act) => !act.ask) ?? acts[0] ?? { deny: false };
};

const unattendedPushVerdict = function unattendedPushVerdict(command, powershell = false) {
	const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
	const KEYWORDS = /* @__PURE__ */ new Set([
		"!",
		"{",
		"}",
		"if",
		"then",
		"else",
		"elif",
		"fi",
		"do",
		"done",
		"while",
		"until"
	]);
	const WRAPPERS = /* @__PURE__ */ new Set([
		"env",
		"command",
		"builtin",
		"exec",
		"nohup",
		"sudo",
		"doas",
		"nice",
		"timeout",
		"stdbuf",
		"time",
		"xargs",
		"npx",
		"bunx",
		"pnpx",
		"corepack"
	]);
	const RUNNERS = /* @__PURE__ */ new Set([
		"npm exec",
		"npm x",
		"pnpm dlx",
		"pnpm exec",
		"yarn dlx",
		"yarn exec",
		"bun x",
		"bun exec"
	]);
	const RUNNER_OPTIONS = [
		"pw",
		[
			"--package",
			"--workspace",
			"--filter"
		],
		[
			"-c",
			"--call",
			"--shell-mode"
		]
	];
	const NO_OPTIONS = [
		"",
		[],
		[]
	];
	const MANAGERS = /* @__PURE__ */ new Set([
		"npm",
		"pnpm",
		"yarn",
		"bun"
	]);
	const MANAGER_VALUED = /* @__PURE__ */ new Set([
		"-w",
		"--workspace",
		"--filter",
		"-F",
		"--prefix",
		"-C",
		"--dir",
		"--cwd",
		"--registry",
		"--userconfig"
	]);
	const WRAPPER_OPTIONS = /* @__PURE__ */ new Map([
		["env", [
			"uCP",
			["--unset", "--chdir"],
			["-S", "--split-string"]
		]],
		["sudo", [
			"ugpCrtUDRT",
			[
				"--user",
				"--group",
				"--prompt",
				"--close-from",
				"--role",
				"--type",
				"--other-user",
				"--chdir",
				"--chroot",
				"--command-timeout",
				"--host"
			],
			[]
		]],
		["doas", [
			"uC",
			[],
			[]
		]],
		["exec", [
			"a",
			[],
			[]
		]],
		["nice", [
			"n",
			["--adjustment"],
			[]
		]],
		["timeout", [
			"sk",
			["--signal", "--kill-after"],
			[]
		]],
		["stdbuf", [
			"ioe",
			[
				"--input",
				"--output",
				"--error"
			],
			[]
		]],
		["time", [
			"fo",
			["--format", "--output"],
			[]
		]],
		["xargs", [
			"ILnPsdEa",
			[
				"--max-args",
				"--max-procs",
				"--max-chars",
				"--delimiter",
				"--arg-file",
				"--process-slot-var"
			],
			[]
		]],
		["npx", RUNNER_OPTIONS],
		["bunx", RUNNER_OPTIONS],
		["pnpx", RUNNER_OPTIONS]
	]);
	const ANSI_ESCAPES = /* @__PURE__ */ new Map([
		["n", "\n"],
		["t", "	"],
		["r", "\r"],
		["a", "\x07"],
		["b", "\b"],
		["e", "\x1B"],
		["E", "\x1B"],
		["f", "\f"],
		["v", "\v"],
		["\\", "\\"],
		["'", "'"],
		["\"", "\""],
		["?", "?"]
	]);
	const SHELLS = /* @__PURE__ */ new Set([
		"sh",
		"bash",
		"zsh",
		"dash",
		"ksh"
	]);
	const POWERSHELLS = /* @__PURE__ */ new Set([
		"pwsh",
		"powershell",
		"invoke-expression",
		"iex"
	]);
	const PS_SINGLE = "'" + String.fromCharCode(8216, 8217, 8218, 8219);
	const PS_DOUBLE = "\"" + String.fromCharCode(8220, 8221, 8222);
	function programName(word) {
		return (word.split(/[\\/]/).pop() ?? "").toLowerCase().replace(/^([^@]+)@[\s\S]*$/, "$1").replace(/\.(exe|cmd|bat)$/, "");
	}
	function commandFlag(word) {
		const match = /^(?:--?|\/)([a-z]+)(?::([\s\S]*))?$/i.exec(word);
		const name = (match?.[1] ?? "").toLowerCase();
		return name !== "" && ("commandwithargs".startsWith(name) || name === "cwa") ? match?.[2] ?? "" : null;
	}
	function splitLine(text, blocks, pwsh) {
		const segments = [];
		const nested = [];
		let words = [];
		let word = "";
		let inWord = false;
		let dropNext = false;
		const endWord = () => {
			if (!inWord) return;
			if (dropNext) dropNext = false;
			else words.push(word);
			word = "";
			inWord = false;
		};
		const cut = () => {
			endWord();
			dropNext = false;
			if (words.length > 0) segments.push(words);
			words = [];
		};
		const quote = (c, kind) => c !== void 0 && (c === kind[0] || pwsh && kind.includes(c));
		let i = 0;
		while (i < text.length) {
			const ch = text[i] ?? "";
			if (quote(ch, PS_SINGLE)) {
				let stop = i + 1;
				while (stop < text.length && !quote(text[stop], PS_SINGLE)) stop += 1;
				word += text.slice(i + 1, stop);
				inWord = true;
				i = stop + 1;
			} else if (quote(ch, PS_DOUBLE)) {
				inWord = true;
				i += 1;
				while (i < text.length && !quote(text[i], PS_DOUBLE)) {
					const c = text[i] ?? "";
					const next = text[i + 1] ?? "";
					if (pwsh && c === "`" && i + 1 < text.length) {
						word += next;
						i += 2;
					} else if (!pwsh && c === "\\" && i + 1 < text.length) {
						word += "\"\\$`".includes(next) ? next : next === "\n" ? "" : c + next;
						i += 2;
					} else if (c === "$" && next === "(" || !pwsh && c === "`") {
						const start = c === "`" ? i + 1 : i + 2;
						let j = start;
						if (c === "`") while (j < text.length && text[j] !== "`") j += 1;
						else {
							let level = 1;
							while (j < text.length) {
								if (text[j] === "(") level += 1;
								else if (text[j] === ")") level -= 1;
								if (level === 0) break;
								j += 1;
							}
						}
						nested.push(text.slice(start, j));
						word += text.slice(i, Math.min(j + 1, text.length));
						i = j + 1;
					} else {
						word += c;
						i += 1;
					}
				}
				i += 1;
			} else if (ch === "$" && text[i + 1] === "\"") i += 1;
			else if (ch === "$" && text[i + 1] === "'") {
				let j = i + 2;
				while (j < text.length && text[j] !== "'") {
					const c = text[j] ?? "";
					const next = text[j + 1] ?? "";
					const code = /^(?:x[0-9A-Fa-f]{1,2}|u[0-9A-Fa-f]{1,4}|U[0-9A-Fa-f]{1,8}|[0-7]{1,3})/.exec(text.slice(j + 1, j + 10))?.[0];
					if (c !== "\\" || j + 1 >= text.length) {
						word += c;
						j += 1;
					} else if (ANSI_ESCAPES.has(next)) {
						word += ANSI_ESCAPES.get(next) ?? "";
						j += 2;
					} else if (code !== void 0) {
						const point = /^[0-7]/.test(code) ? Number.parseInt(code, 8) : Number.parseInt(code.slice(1), 16);
						word += point <= 1114111 ? String.fromCodePoint(point) : "�";
						j += 1 + code.length;
					} else if (next === "c" && j + 2 < text.length) {
						word += String.fromCharCode(text.charCodeAt(j + 2) & 31);
						j += 3;
					} else {
						word += c + next;
						j += 2;
					}
				}
				inWord = true;
				i = j + 1;
			} else if (ch === (pwsh ? "`" : "\\")) {
				const next = text[i + 1];
				const crlf = next === "\r" && text[i + 2] === "\n";
				if (next !== void 0 && next !== "\n" && !(pwsh && crlf)) {
					word += next;
					inWord = true;
				}
				i += pwsh && crlf ? 3 : 2;
			} else if (ch === "$" && text[i + 1] === "(" || ch === "`" || ch === "(" && (inWord || words.length > 0)) {
				const start = ch === "$" ? i + 2 : i + 1;
				let j = start;
				if (ch === "`") while (j < text.length && text[j] !== "`") j += 1;
				else {
					let level = 1;
					while (j < text.length) {
						if (text[j] === "(") level += 1;
						else if (text[j] === ")") level -= 1;
						if (level === 0) break;
						j += 1;
					}
				}
				nested.push(text.slice(start, j));
				word += text.slice(i, Math.min(j + 1, text.length));
				inWord = true;
				i = j + 1;
			} else if (ch === " " || ch === "	") {
				endWord();
				i += 1;
			} else if (ch === "#" && !inWord) while (i < text.length && text[i] !== "\n") i += 1;
			else if (ch === ">" || ch === "<") {
				if (inWord && /^\d+$/.test(word)) {
					word = "";
					inWord = false;
				} else endWord();
				while (i < text.length && "<>&|".includes(text[i] ?? "")) i += 1;
				dropNext = true;
			} else if (";&|\n\r()`".includes(ch) || blocks && ch === "{" && !inWord || blocks && ch === "}" && word.split("{").length <= word.split("}").length) {
				cut();
				i += 1;
			} else {
				word += ch;
				inWord = true;
				i += 1;
			}
		}
		cut();
		return {
			segments,
			nested
		};
	}
	const assigned = [];
	function commandsOf(text, depth, pwsh) {
		if (depth > 4) throw Object.assign(/* @__PURE__ */ new Error("nesting"), { code: "NESTING_DEPTH" });
		const { segments, nested } = splitLine(text, true, pwsh);
		const commands = pwsh ? commandsOf(text, depth, false) : [];
		for (const words of [...segments, .../[{}]/.test(text) ? splitLine(text, false, pwsh).segments : []]) {
			let k = 0;
			let line = null;
			while (k < words.length && line === null) {
				const word = words[k] ?? "";
				let sub = k + 1;
				while (MANAGERS.has(programName(word)) && sub < words.length) {
					const option = words[sub] ?? "";
					const next = words[sub + 1] ?? "-";
					if (MANAGER_VALUED.has(option) || programName(word) === "yarn" && option === "workspace") sub += 2;
					else if (/^--[^=]+$/.test(option) && !next.startsWith("-") && !RUNNERS.has(`${programName(word)} ${next}`)) sub += 2;
					else if (option.startsWith("-") && option !== "--") sub += 1;
					else break;
				}
				const runner = `${programName(word)} ${words[sub] ?? ""}`;
				if (ASSIGNMENT.test(word) || KEYWORDS.has(word)) {
					if (ASSIGNMENT.test(word)) assigned.push(word);
					k += 1;
				} else if (WRAPPERS.has(programName(word)) || RUNNERS.has(runner)) {
					const [short, long, lineOptions] = RUNNERS.has(runner) ? RUNNER_OPTIONS : WRAPPER_OPTIONS.get(programName(word)) ?? NO_OPTIONS;
					k = RUNNERS.has(runner) ? sub + 1 : k + 1;
					while (k < words.length) {
						const option = words[k] ?? "";
						if (ASSIGNMENT.test(option)) {
							assigned.push(option);
							k += 1;
							continue;
						}
						if (!/^(-|\d)/.test(option)) break;
						k += 1;
						if (option === "--") break;
						let value;
						let isLine = false;
						if (option.startsWith("--")) {
							const name = option.split("=")[0] ?? "";
							if (long.includes(name) || lineOptions.includes(name)) {
								isLine = lineOptions.includes(name);
								value = option.includes("=") ? option.slice(name.length + 1) : words[k];
								if (!option.includes("=")) k += 1;
							}
						} else if (option.startsWith("-")) for (let c = 1; c < option.length; c += 1) {
							const letter = option[c] ?? "";
							if (!short.includes(letter) && !lineOptions.includes(`-${letter}`)) continue;
							isLine = lineOptions.includes(`-${letter}`);
							value = c === option.length - 1 ? words[k] : option.slice(c + 1);
							if (c === option.length - 1) k += 1;
							break;
						}
						if (isLine && value !== void 0) {
							line = [value, ...words.slice(k)].join(" ");
							break;
						}
					}
				} else break;
			}
			if (line !== null) {
				commands.push(...commandsOf(line, depth + 1, pwsh));
				continue;
			}
			const cmd = words.slice(k);
			if (cmd.length === 0) continue;
			if (/\s/.test(cmd[0] ?? "") && cmd.join(" ") !== text) commands.push(...commandsOf(cmd.join(" "), depth + 1, pwsh));
			cmd[0] = programName(cmd[0] ?? "");
			if (/^git-./.test(cmd[0])) cmd.splice(0, 1, "git", cmd[0].slice(4));
			if (SHELLS.has(cmd[0] ?? "")) {
				const flag = cmd.findIndex((word, index) => index > 0 && /^-[A-Za-z]*c[A-Za-z]*$/.test(word));
				const script = flag === -1 ? void 0 : cmd[flag + 1];
				if (script !== void 0) commands.push(...commandsOf(script, depth + 1, false));
			} else if (cmd[0] === "eval") commands.push(...commandsOf(cmd.slice(1).join(" "), depth + 1, false));
			else if (POWERSHELLS.has(cmd[0] ?? "")) {
				const at = cmd.findIndex((word, index) => index > 0 && commandFlag(word) !== null);
				const first = at !== -1 ? -1 : cmd.findIndex((word, index) => index > 0 && !/^-|^\/\w*$/.test(word));
				if (at !== -1) commands.push(...commandsOf([commandFlag(cmd[at] ?? ""), ...cmd.slice(at + 1)].join(" "), depth + 1, true));
				else if (first !== -1) commands.push(...commandsOf(cmd.slice(first).join(" "), depth + 1, true));
				for (const word of first === -1 ? [] : cmd.slice(first + 1)) if (/\s/.test(word)) commands.push(...commandsOf(word, depth + 1, true));
			} else if (cmd[0] === "cmd") {
				const at = cmd.findIndex((word, index) => index > 0 && /^\/[ck]/i.test(word));
				const rest = at === -1 ? "" : [(cmd[at] ?? "").slice(2), ...cmd.slice(at + 1)].join(" ");
				if (at !== -1) commands.push(...commandsOf(rest, depth + 1, true));
				if (rest.includes("^")) commands.push(...commandsOf(rest.replace(/\^([\s\S])/g, "$1"), depth + 1, true));
			} else if (cmd[0] === "git") {
				const { sub, args } = gitParts(cmd);
				const rebase = sub === "rebase" ? args : [];
				for (let j = 0; j < rebase.length && rebase[j] !== "--"; j += 1) {
					const arg = rebase[j] ?? "";
					const long = /^--ex(?:ec?)?(=[\s\S]*)?$/.exec(arg);
					let exec;
					if (long !== null) exec = long[1] === void 0 ? rebase[j += 1] : long[1].slice(1);
					else if (/^-[^-]/.test(arg)) for (let c = 1; c < arg.length; c += 1) {
						const letter = arg[c] ?? "";
						if (letter === "x") exec = c === arg.length - 1 ? rebase[j += 1] : arg.slice(c + 1);
						if (letter === "x" || "sXCS".includes(letter)) {
							if (letter !== "x" && letter !== "S" && c === arg.length - 1) j += 1;
							break;
						}
					}
					if (exec !== void 0) commands.push(...commandsOf(exec, depth + 1, false));
				}
				if (sub === "bisect" && args[0] === "run") commands.push(...commandsOf(args.slice(1).map((word) => `'${word.replace(/'/g, "'\\''")}'`).join(" "), depth + 1, false));
			}
			commands.push(cmd);
		}
		for (const inner of nested) commands.push(...commandsOf(inner, depth + 1, pwsh));
		return commands;
	}
	function gitParts(cmd) {
		const config = [];
		let k = 1;
		while (k < cmd.length) {
			const word = cmd[k] ?? "";
			if (word === "-c") {
				config.push(cmd[k + 1] ?? "");
				k += 2;
			} else if ([
				"-C",
				"--git-dir",
				"--work-tree",
				"--namespace",
				"--config-env",
				"--super-prefix"
			].includes(word)) k += 2;
			else if (word.startsWith("-")) k += 1;
			else break;
		}
		return {
			sub: (cmd[k] ?? "").toLowerCase(),
			args: cmd.slice(k + 1),
			config
		};
	}
	function ghPositionals(cmd) {
		const positionals = [];
		for (let k = 1; k < cmd.length; k += 1) {
			const word = cmd[k] ?? "";
			if (word === "-R" || word === "--repo") k += 1;
			else if (positionals.length < 2 && /^(?:--[^=]+|-[^-])$/.test(word) && ![
				"-h",
				"--help",
				"--version"
			].includes(word)) k += 1;
			else if (!word.startsWith("-")) positionals.push(word);
		}
		return positionals;
	}
	function httpCall(raw) {
		const tool = raw[0] ?? "";
		const hidden = () => {
			throw Object.assign(/* @__PURE__ */ new Error("http target hidden"), { code: "HTTP_TARGET_HIDDEN" });
		};
		const LONG = /* @__PURE__ */ new Map([["wget", [
			"--method",
			"--post-data",
			"--post-file",
			"--body-data",
			"--body-file",
			"--execute",
			"--config",
			"--input-file"
		]], ["curl", [
			"--request",
			"--data",
			"--data-raw",
			"--data-binary",
			"--data-ascii",
			"--data-urlencode",
			"--json",
			"--form",
			"--form-string",
			"--upload-file",
			"--config",
			"--next",
			"--globoff",
			"--url"
		]]]);
		const expanded = raw.map((word) => {
			const name = word.split("=")[0] ?? "";
			const full = /^--[a-z-]{2,}$/i.test(name) ? LONG.get(tool)?.find((option) => option.startsWith(name.toLowerCase())) : void 0;
			return full === void 0 ? word : full + word.slice(name.length);
		});
		const WGETRC = /* @__PURE__ */ new Map([
			["method", "--method"],
			["postdata", "--post-data"],
			["postfile", "--post-file"],
			["bodydata", "--body-data"],
			["bodyfile", "--body-file"],
			["input", "--input-file"]
		]);
		const cmd = [];
		for (let k = 0; k < expanded.length; k += 1) {
			const word = expanded[k] ?? "";
			const lead = tool === "curl" ? /^-([^-:KHouAebcwmxrEdFTXCDPQtyYzU]*)([dFTX])([\s\S]*)$/.exec(word) : tool === "gh" ? /^-(i*)([XfFHpqt])=?([\s\S]*)$/.exec(word) : null;
			if (lead !== null && word.length > 2) {
				if (lead[1]) cmd.push(`-${lead[1]}`);
				cmd.push(`-${lead[2]}`);
				if (lead[3]) cmd.push(lead[3]);
				continue;
			}
			const own = /^(-[A-Za-z]*e|--execute)$/.test(word);
			let rc;
			if (tool === "wget" && k > 0) {
				if (own) rc = expanded[k + 1];
				else if (word.startsWith("--execute=")) rc = word.slice(10);
				else rc = /^-[A-Za-z]*?e(.+)$/.exec(word)?.[1];
			}
			const eq = rc?.indexOf("=") ?? -1;
			const option = rc !== void 0 && eq > 0 ? WGETRC.get(rc.slice(0, eq).trim().toLowerCase().replace(/[-_]/g, "")) : void 0;
			if (rc === void 0 || option === void 0) cmd.push(word);
			else {
				cmd.push(`${option}=${rc.slice(eq + 1).trim()}`);
				if (own) k += 1;
			}
		}
		let method = null;
		let body = false;
		let globoff = false;
		let inputFile = false;
		let end = cmd.length;
		let next = null;
		const targets = [];
		const api = tool === "gh" ? cmd.indexOf("api") : -1;
		const valueFlags = tool === "gh" ? [
			"-H",
			"--header",
			"-q",
			"--jq",
			"-t",
			"--template",
			"--hostname",
			"-p",
			"--preview",
			"--cache"
		] : [
			"-H",
			"--header",
			"-o",
			"--output",
			"-u",
			"--user",
			"-A",
			"--user-agent",
			"-e",
			"--referer",
			"-b",
			"--cookie",
			"-c",
			"--cookie-jar",
			"-w",
			"--write-out",
			"-m",
			"--max-time",
			"-x",
			"--proxy",
			"-K",
			"--config",
			"-r",
			"--range",
			"-E",
			"--cert",
			"--key",
			"--cacert",
			"--oauth2-bearer",
			"--connect-timeout",
			"--retry",
			"-O",
			"--output-document",
			"--password"
		];
		const bodyFlags = tool === "gh" ? [
			"-f",
			"-F",
			"--field",
			"--raw-field",
			"--input"
		] : [
			"-d",
			"--data",
			"--data-raw",
			"--data-binary",
			"--data-urlencode",
			"--data-ascii",
			"--json",
			"-F",
			"--form",
			"--form-string",
			"-T",
			"--upload-file",
			"--post-data",
			"--post-file",
			"--body-data",
			"--body-file"
		];
		for (let k = 1; k < cmd.length; k += 1) {
			if (k === api) continue;
			const word = cmd[k] ?? "";
			const name = word.split("=")[0] ?? "";
			if (tool === "curl" && (word === "--next" || word === "-:")) {
				next = ["curl", ...cmd.slice(k + 1)];
				end = k;
				break;
			}
			if (tool !== "gh" && /^--conf(ig?)?(=|$)/.test(word)) hidden();
			if (tool === "wget" && /^--input-file(=|$)/.test(word)) inputFile = true;
			if (tool !== "gh" && /^-[^-]/.test(word)) for (const letter of word.slice(1)) if (tool === "curl") {
				if (letter === "K" || letter === ":") hidden();
				if (letter === "g") globoff = true;
				if ("HouAebcwmxrEdFTXCDPQtyYzU".includes(letter)) break;
			} else {
				if (letter === "i") inputFile = true;
				if ("oaeiBtOTwQPlARDXIU".includes(letter)) break;
			}
			if (tool === "curl" && word === "--globoff") globoff = true;
			const methodLetter = tool !== "wget";
			if (word === "-X" && methodLetter || word === "--method" || word === "--request") {
				method = cmd[k + 1] ?? hidden();
				k += 1;
			} else if (name === "--method" || name === "--request") method = word.slice(name.length + 1);
			else if (/^-X./.test(word) && methodLetter) method = word.slice(2);
			else if (word === "-X") k += 1;
			else if (bodyFlags.includes(word)) {
				body = true;
				k += 1;
			} else if (word.includes("=") && bodyFlags.includes(name)) body = true;
			else if (word === "--url") {
				targets.push(cmd[k + 1] ?? "");
				k += 1;
			} else if (valueFlags.includes(word)) k += 1;
			else if (/^-[fF]./.test(word) && tool === "gh") body = true;
			else if (!word.startsWith("-")) targets.push(word);
		}
		const verb = (method ?? (body ? "POST" : "GET")).toUpperCase();
		const write = [
			"POST",
			"PUT",
			"PATCH",
			"DELETE"
		].includes(verb);
		if (method !== null && /[$`]/.test(method)) hidden();
		if (tool === "curl" && (write || body) && !globoff && targets.some((target) => /[{[]/.test(target))) hidden();
		if (tool === "wget" && write && inputFile) hidden();
		const resolved = (path) => {
			const segments = path.split("/");
			const kept = [];
			segments.forEach((segment, index) => {
				if (segment === "..") kept.pop();
				else if (segment !== ".") kept.push(segment);
				if ((segment === "." || segment === "..") && index === segments.length - 1) kept.push("");
			});
			return kept.join("/").replace(/^\/+/, "").replace(/^api\/v3\//i, "");
		};
		return {
			write,
			method: verb,
			paths: targets.flatMap((target) => {
				const decoded = (target.replace(/^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/]*/, "").replace(/^[\w-]+(\.[\w-]+)+(:\d+)?(?=\/)/, "").replace(/^\/+/, "").replace(/^api\/v3\//i, "").split(/[?#]/)[0] ?? "").replace(/%([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
				return [.../* @__PURE__ */ new Set([decoded, resolved(decoded)])].map((path) => path.replace(/\/+$/, "").replace(/^repos\/[^/]+\/[^/]+\//i, "").replace(/^(orgs|enterprises|users|repositories)\/[^/]+\//i, ""));
			}),
			cmd: cmd.slice(0, end),
			next
		};
	}
	const deny = (what) => ({
		deny: true,
		reason: `${what} while this run is unattended: an unattended run pushes only through \`stamity run checkpoint\` and \`stamity run end\`, which hold the person-only paths and scan for secrets first (REQ-FLOW-120).`
	});
	const MOVES = [
		/^pulls\/?$/i,
		/^pulls\/[^/]+\/?$/i,
		/^pulls\/[^/]+\/(merge|update-branch)\/?$/i,
		/^contents(\/|$)/i,
		/^git\/(refs|commits|trees|blobs|tags)(\/|$)/i,
		/^(merges|merge-upstream)\/?$/i,
		/^branches\/.+\/rename\/?$/i
	];
	const GRAPHQL_MOVES = /\b(createPullRequest|updatePullRequest|updatePullRequestBranch|createCommitOnBranch|createRef|updateRef|updateRefs|deleteRef|mergeBranch|mergePullRequest|enablePullRequestAutoMerge|enqueuePullRequest)\b/;
	const GH_BUILTINS = new Set("agent-task alias api attestation auth browse cache co codespace completion config copilot discussion extension gist gpg-key help issue label licenses org pr preview project release repo ruleset run search secret skill ssh-key status variable version workflow agent-tasks agent agents at cs extensions ext rs skills".split(" "));
	const GIT_BUILTINS = new Set("add am annotate apply archive backfill bisect blame branch bugreport bundle cat-file check-attr check-ignore check-mailmap check-ref-format checkout checkout--worker checkout-index cherry cherry-pick clean clone column commit commit-graph commit-tree config count-objects credential credential-cache credential-cache--daemon credential-store describe diagnose diff diff-files diff-index diff-pairs diff-tree difftool fast-export fast-import fetch fetch-pack fmt-merge-msg for-each-ref for-each-repo format-patch fsck fsck-objects fsmonitor--daemon gc get-tar-commit-id grep hash-object help hook index-pack init init-db interpret-trailers last-modified log ls-files ls-remote ls-tree mailinfo mailsplit maintenance merge merge-base merge-file merge-index merge-ours merge-recursive merge-recursive-ours merge-recursive-theirs merge-subtree merge-tree mktag mktree multi-pack-index mv name-rev notes pack-objects pack-redundant pack-refs patch-id pickaxe prune prune-packed pull push range-diff read-tree rebase receive-pack reflog refs remote remote-ext remote-fd repack replace replay repo rerere reset restore rev-list rev-parse revert rm send-pack shortlog show show-branch show-index show-ref sparse-checkout stage stash status stripspace submodule--helper switch symbolic-ref tag unpack-file unpack-objects update-index update-ref update-server-info upload-archive upload-archive--writer upload-pack var verify-commit verify-pack verify-tag version whatchanged worktree write-tree subtree".split(" "));
	const READ_FORMS = /* @__PURE__ */ new Map([["lfs", /* @__PURE__ */ new Set([
		"fetch",
		"pull",
		"install",
		"ls-files",
		"env",
		"status"
	])], ["submodule", /* @__PURE__ */ new Set([
		"status",
		"init",
		"update",
		"sync"
	])]]);
	const CONFIG_KEYS = /^(?:color\..+|advice\..+|core\.quotepath|init\.defaultbranch|user\.name|user\.email)$/i;
	const CONFIG_NAMES = "GIT_CONFIG_(?:(?:COUNT|PARAMETERS|GLOBAL|SYSTEM)\\b|(?:KEY|VALUE)_\\d*\\b|(?=[$`{(%]))";
	const CONFIG_ENVIRONMENT = new RegExp(`\\b${CONFIG_NAMES}`, "i");
	const PROGRAM_VARIABLES = "GIT_EDITOR|GIT_SEQUENCE_EDITOR|GIT_SSH_COMMAND|GIT_SSH|GIT_EXTERNAL_DIFF|GIT_ASKPASS|GIT_PAGER|GIT_PROXY_COMMAND|GIT_EXEC_PATH|SSH_ASKPASS";
	const GIT_VARIABLE = `(?:(?:${PROGRAM_VARIABLES})\\b|${CONFIG_NAMES})`;
	const SETS_WORD = new RegExp(`^${GIT_VARIABLE}`, "i");
	const SETTERS = /* @__PURE__ */ new Set([
		"export",
		"declare",
		"typeset",
		"local",
		"set"
	]);
	const EXPORTS = /^-[A-Za-z]*x[A-Za-z]*$/;
	const EXPORTERS = /* @__PURE__ */ new Set([
		"declare",
		"typeset",
		"local"
	]);
	const READERS = /* @__PURE__ */ new Set([
		"read",
		"mapfile",
		"readarray",
		"getopts"
	]);
	function assignsNoValue(cmd) {
		const program = cmd[0] ?? "";
		if (READERS.has(program)) return cmd.slice(1);
		if (program === "for") return cmd.slice(1, cmd.includes("in") ? cmd.indexOf("in") : void 0);
		if (program !== "printf") return [];
		return cmd.flatMap((word, index) => word === "-v" ? [cmd[index + 1] ?? ""] : /^-v./.test(word) ? [word.slice(2)] : []);
	}
	const ALLEXPORT_CLUSTER = /^-[A-Za-z]*a[A-Za-z]*$/;
	const OPTION_SETTERS = /* @__PURE__ */ new Set([
		"set",
		"setopt",
		"unsetopt",
		"shopt"
	]);
	const NAMES_VARIABLE = new RegExp(`\\b${GIT_VARIABLE}`, "i");
	const SETS_TEXT = new RegExp(`\\$\\{?env:${GIT_VARIABLE}\\}?\\s*(?:[-+*/%]|\\?\\?)?=|\\b(?:Set-Item|New-Item|si|ni)\\b[^;|&\\n]*?(?<![\\w$\\{])env:\\\\?${GIT_VARIABLE}|\\[(?:System\\.)?Environment\\]::SetEnvironmentVariable\\(\\s*['"]${GIT_VARIABLE}`, "i");
	const PROGRAM_WORD = new RegExp(`^(?:${PROGRAM_VARIABLES})=`, "i");
	const PROGRAM_TEXT = new RegExp(`\\b(?:${PROGRAM_VARIABLES})\\}?\\s*=`, "i");
	const REMOTE_WRITES = /* @__PURE__ */ new Set([
		"add",
		"set-url",
		"rename",
		"remove",
		"rm",
		"set-head",
		"set-branches"
	]);
	function writesRemote(args) {
		const positionals = [];
		let write = false;
		let read = false;
		let edit = false;
		let rename = false;
		for (let j = 0; j < args.length; j += 1) {
			const arg = args[j] ?? "";
			const name = (arg.split("=")[0] ?? "").toLowerCase();
			if (arg === "--") {
				positionals.push(...args.slice(j + 1));
				break;
			}
			if ([
				"--add",
				"--replace-all",
				"--unset",
				"--unset-all",
				"--rename-section",
				"--remove-section"
			].includes(name)) {
				write = true;
				rename ||= name === "--rename-section";
			} else if (name === "--edit") edit = true;
			else if ([
				"--get",
				"--get-all",
				"--get-regexp",
				"--get-urlmatch",
				"--get-color",
				"--get-colorbool",
				"--list"
			].includes(name)) read = true;
			else if ([
				"--file",
				"--blob",
				"--type",
				"--value",
				"--comment",
				"--default",
				"--url"
			].includes(name)) {
				if (!arg.includes("=")) j += 1;
			} else if (/^-[^-]/.test(arg)) for (let c = 1; c < arg.length; c += 1) {
				const letter = arg[c] ?? "";
				if (letter === "e") edit = true;
				if (letter === "l") read = true;
				if (letter === "f" || letter === "t") {
					if (c === arg.length - 1) j += 1;
					break;
				}
			}
			else if (!arg.startsWith("-")) positionals.push(arg);
		}
		const first = (positionals[0] ?? "").toLowerCase();
		const sub = [
			"get",
			"list",
			"set",
			"unset",
			"rename-section",
			"remove-section",
			"edit"
		].includes(first) ? first : "";
		if (edit || sub === "edit") return true;
		const rest = sub === "" ? positionals : positionals.slice(1);
		const keys = rest.slice(0, rename || sub === "rename-section" ? 2 : 1);
		return (write || [
			"set",
			"unset",
			"rename-section",
			"remove-section"
		].includes(sub) || sub === "" && !read && rest.length > 1) && keys.some((key) => /^(?:remote|url)(\.|$)/i.test(key));
	}
	const RUN_VERBS = /* @__PURE__ */ new Set([
		"start",
		"checkpoint",
		"end"
	]);
	const PACKAGE = /stamity|\bst\b|\bcli\.m?js\b|@\d+\.\d+\.\d+/i;
	const namesVerb = (text) => /\brun(?:\W+|[^\w\s]*\s+[^\w\s-]*-[^;|&\r\n]*?\W)(?:start|checkpoint|end)\b/i.test(text) && PACKAGE.test(text);
	const namesVerbInWords = (words) => {
		const text = words.join(" ");
		if (!PACKAGE.test(text)) return false;
		for (const open of text.matchAll(/\brun[^\w\s]*\s+([^\w\s]*)/gi)) {
			const rest = text.slice((open.index ?? 0) + open[0].length);
			if (/^(?:start|checkpoint|end)\b/i.test(rest)) return true;
			if (/[-$`@*?[{]/.test(open[1] ?? "")) return /(?:^|\W)(?:start|checkpoint|end)\b/i.test(rest);
		}
		return false;
	};
	const REGISTRY_URL = /^https:\/\/[A-Za-z0-9.-]+(?::(?:[1-9]\d{0,3}|[1-5]\d{4}|6[0-4]\d{3}|65[0-4]\d{2}|655[0-2]\d|6553[0-5]))?(?:\/[A-Za-z0-9._~/-]*)?$/;
	const PINNED_PACKAGE = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*@(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
	function verbShape(line) {
		const text = line.replace(/[ \t]+2>&1[ \t]*$/, "");
		if (/[\r\n]/.test(text)) return "a line break";
		const typographic = [...text].some((ch) => ch.charCodeAt(0) >= 8216 && ch.charCodeAt(0) <= 8222);
		if (powershell && typographic) return "a typographic quote, which PowerShell reads as a quote";
		if (powershell && /[^\S \t]|\u0085/.test(text)) return "a blank other than a space or a tab, which PowerShell splits words on";
		const words = [];
		const ats = [];
		let word = null;
		for (let i = 0; i < text.length; i += 1) {
			const ch = text[i] ?? "";
			if (ch === "'" || ch === "\"") {
				const close = text.indexOf(ch, i + 1);
				if (close === -1) return "a quote left open";
				const quoted = text.slice(i + 1, close);
				if (ch === "\"" && /[$`\\]/.test(quoted)) return "a `$`, backtick or backslash inside double quotes";
				word = (word ?? "") + quoted;
				i = close;
			} else if (ch === " " || ch === "	") {
				if (word !== null) words.push(word);
				word = null;
			} else if ("$`\\(){};|&<>#".includes(ch)) return ch === "`" ? "an unquoted backtick" : `an unquoted \`${ch}\``;
			else {
				if (ch === "@") ats.push(words.length);
				word = (word ?? "") + ch;
			}
		}
		if (word !== null) words.push(word);
		if (powershell && words.some((each) => /^[-–-―]{2}%$/.test(each))) return "PowerShell's stop-parsing `--%`";
		let at = 1;
		if (words[0] === "npx") {
			if (![
				"-y",
				"--yes",
				"--no",
				"--no-yes"
			].includes(words[1] ?? "")) return "an `npx` call whose first word is not `-y`, `--yes`, `--no` or `--no-yes`";
			at = 2;
			const registry = /^--@[a-z0-9][a-z0-9._~-]*:registry=([\s\S]*)$/.exec(words[at] ?? "");
			if (registry !== null && !REGISTRY_URL.test(registry[1] ?? "")) return "a scope registry that is not a plain https URL";
			if (registry !== null) at += 1;
			const spec = words[at] ?? "";
			if (spec !== "stamity" && !PINNED_PACKAGE.test(spec)) return "an `npx` option or package other than `stamity` or `<pkg>@<semver>`";
			at += 1;
		} else if (words[0] !== "stamity" && words[0] !== "st") return "a first word other than `stamity`, `st` or `npx`: a prefix, a wrapper or another program";
		if (words[at] !== "run") return "words between the program and `run <verb>`";
		if (!RUN_VERBS.has(words[at + 1] ?? "")) return "words between `run` and its verb";
		if (powershell && ats.some((index) => index > at)) return "an unquoted `@` after the program, which PowerShell reads as a splat";
		return null;
	}
	const commands = commandsOf(command, 0, powershell);
	for (const cmd of commands) {
		const program = cmd[0] ?? "";
		if (program === "git") {
			const { sub, args, config } = gitParts(cmd);
			if (sub === "push" || sub === "send-pack") return deny(`A raw \`git ${sub}\``);
			const valued = /* @__PURE__ */ new Set([
				"-P",
				"--prefix",
				"-m",
				"--message",
				"-b",
				"--branch",
				"--onto"
			]);
			const first = args.find((word, index) => !word.startsWith("-") && !valued.has(args[index - 1] ?? ""));
			if (sub === "subtree" && first === "push") return deny("A `git subtree push`");
			if (config.some((pair) => /^alias\./i.test(pair))) return deny("A git call defining an alias (`-c alias.<name>=…`)");
			const globals = cmd.slice(1, cmd.length - args.length - 1);
			const configEnv = globals.flatMap((word, index) => word === "--config-env" ? [globals[index + 1] ?? ""] : word.startsWith("--config-env=") ? [word.slice(13)] : []);
			if ([...config, ...configEnv].some((pair) => !CONFIG_KEYS.test((pair.split("=")[0] ?? "").trim()))) return deny("A git call setting a configuration key outside the display and identity keys (`-c <key>=…`)");
			if (CONFIG_ENVIRONMENT.test(command) || [...assigned, ...commands.flat()].some((word) => CONFIG_ENVIRONMENT.test(word))) return deny("A git call on a line that names git's configuration variables (`GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_<n>`, `GIT_CONFIG_VALUE_<n>`, `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM`)");
			if (PROGRAM_TEXT.test(command) || [...assigned, ...commands.flat()].some((word) => PROGRAM_WORD.test(word))) return deny("A git call on a line that sets a program git runs through the environment (`GIT_EDITOR`, `GIT_SSH_COMMAND`, `GIT_EXEC_PATH`, …)");
			const remoteForm = sub === "remote" ? (args.find((word) => !word.startsWith("-")) ?? "").toLowerCase() : "";
			if (REMOTE_WRITES.has(remoteForm)) return deny(`A \`git remote ${remoteForm}\`, a write of a remote`);
			if (sub === "config" && writesRemote(args)) return deny("A `git config` write of a `remote.*` or `url.*` key");
			const forms = READ_FORMS.get(sub);
			if (forms !== void 0) {
				const form = (args.find((word) => !word.startsWith("-")) ?? "").toLowerCase();
				if (!forms.has(form)) return deny(`A \`git ${sub}\` subcommand outside its read and setup forms`);
				continue;
			}
			if (sub !== "" && !GIT_BUILTINS.has(sub)) return deny("A git subcommand that is not a builtin this guard knows");
			continue;
		}
		let http = program === "curl" || program === "wget";
		if (program === "gh") {
			const [group, sub] = ghPositionals(cmd);
			if (group !== void 0 && !GH_BUILTINS.has(group)) return deny("A gh command that is not a built-in this guard knows (an alias or an extension)");
			if (group === "alias" && (sub === "set" || sub === "import")) return deny(`\`gh alias ${sub}\`, which defines an alias`);
			if ([
				"extension",
				"extensions",
				"ext"
			].includes(group ?? "") && sub === "exec") return deny(`\`gh ${group} exec\`, which runs an extension`);
			if (group === "pr" && [
				"create",
				"new",
				"edit",
				"close",
				"reopen",
				"update-branch"
			].includes(sub ?? "")) return deny(`\`gh pr ${sub}\``);
			if (group === "repo" && sub === "sync") return deny("`gh repo sync`");
			if (group === "repo" && (sub === "create" || sub === "new") && cmd.some((word) => /^--push(=|$)/.test(word))) return deny(`\`gh repo ${sub} --push\``);
			http = group === "api";
		}
		if (!http) continue;
		for (let words = cmd; words !== null;) {
			const { write, method, paths, cmd: part, next } = httpCall(words);
			for (const path of paths) if (/^graphql$/i.test(path)) {
				if (GRAPHQL_MOVES.test(part.join(" "))) return deny("A GraphQL mutation that moves a branch or a pull request");
			} else if (write && MOVES.some((pattern) => pattern.test(path))) return deny(`A REST write that moves a branch or a pull request (${method} ${path})`);
			words = next;
		}
	}
	const allexport = commands.some((cmd) => cmd[0] === "set" && cmd.slice(1).some((word) => ALLEXPORT_CLUSTER.test(word)) || OPTION_SETTERS.has(cmd[0] ?? "") && cmd.slice(1).some((word) => /^(?:no)?allexport$/.test(word.replace(/_/g, "").toLowerCase())));
	if (assigned.some((word) => SETS_WORD.test(word)) || commands.some((cmd) => {
		const exports = cmd[0] === "export" || EXPORTERS.has(cmd[0] ?? "") && cmd.slice(1).some((word) => EXPORTS.test(word));
		if (assignsNoValue(cmd).some((word) => SETS_WORD.test(word))) return true;
		return SETTERS.has(cmd[0] ?? "") && cmd.slice(1).some((word) => SETS_WORD.test(word) && (exports || word.includes("=")));
	}) || SETS_TEXT.test(command) || allexport && (NAMES_VARIABLE.test(command) || [...assigned, ...commands.flat()].some((word) => NAMES_VARIABLE.test(word)))) return deny("A line that sets one of git's program or configuration variables (`GIT_EXEC_PATH`, `GIT_EDITOR`, `GIT_CONFIG_COUNT`, …), which the run verbs' own git reads,");
	const broke = commands.some((cmd) => {
		const at = cmd.findIndex((word, index) => index > 0 && !word.startsWith("-"));
		return (cmd[0] === "stamity" || cmd[0] === "st") && cmd[at] === "run" && cmd.slice(at + 1).some((word) => RUN_VERBS.has(word));
	}) || [...commands, ...assigned.map((word) => [word])].some(namesVerbInWords) || namesVerb(command) || [...assigned, ...commands.flat()].some(namesVerb) ? verbShape(command) : null;
	if (broke !== null) return deny(`A run verb (\`stamity run start\`, \`checkpoint\` or \`end\`) on a line that is more than the verb (${broke}; REQ-FLOW-121)`);
	return { deny: false };
};

/** A git metadata file's text, trimmed: a regular file of at most GIT_MAX_BYTES, never through a link. */
function gitText(path) {
  try {
    const stats = lstatSync(path);
    return stats.isFile() && stats.size <= GIT_MAX_BYTES ? readFileSync(path, "utf8").trim() : null;
  } catch {
    return null;
  }
}

/** The git dir HEAD lives in and the common dir the refs live in, from a git dir or a gitdir: file; null when neither. */
function gitDirsOf(path) {
  let gitDir = path;
  try {
    if (!lstatSync(path).isDirectory()) {
      const pointer = /^gitdir:[ \t]*(.+)$/.exec((gitText(path) ?? "").split(/\r?\n/)[0]);
      if (pointer === null) return null;
      const target = pointer[1].trim();
      gitDir = isAbsolute(target) ? target : resolve(dirname(path), target);
    }
  } catch {
    return null;
  }
  const common = gitText(join(gitDir, "commondir"));
  return { gitDir, commonDir: common === null ? gitDir : resolve(gitDir, common) };
}

/** The git dirs of the repository a directory sits in, the nearest .git upward; null when none can be placed. */
function gitDirsFrom(start) {
  try {
    if (!statSync(start).isDirectory()) return null;
  } catch {
    return null;
  }
  for (let dir = start; ; dir = dirname(dir)) {
    try {
      lstatSync(join(dir, ".git"));
      return gitDirsOf(join(dir, ".git"));
    } catch (error) {
      if (!error || (error.code !== "ENOENT" && error.code !== "ENOTDIR")) return null;
    }
    if (dirname(dir) === dir) return null;
  }
}

function programName(word) {
  return (word.split(/[\\/]/).pop() ?? "").toLowerCase().replace(/^([^@]+)@[\s\S]*$/, "$1").replace(/\.(exe|cmd|bat)$/, "");
}

function commandFlag(word) {
  const match = /^(?:--?|\/)([a-z]+)(?::([\s\S]*))?$/i.exec(word);
  const name = (match?.[1] ?? "").toLowerCase();
  return name !== "" && ("commandwithargs".startsWith(name) || name === "cwa") ? (match?.[2] ?? "") : null;
}

function present(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/** A line's words (a null where a command can follow), the lines they run, and its heredocs' bodies. */
function shellWords(command) {
  const words = [];
  const nested = [];
  const docs = [];
  const pending = [];
  let word = null;
  let drop = false;
  const end = () => {
    if (word !== null && !drop) words.push(word);
    else if (word !== null) drop = false;
    word = null;
  };
  const opens = (text, j) => (text[j] === "$" && text[j + 1] === "(") || text[j] === "\`";
  const sub = (text, j) => {
    let close = text[j] === "\`" ? text.indexOf("\`", j + 1) : j + 1;
    for (let level = 0; text[j] === "$" && close < text.length; close += 1) {
      if (text[close] === "(") level += 1;
      else if (text[close] === ")" && --level === 0) break;
    }
    if (close === -1) close = text.length;
    nested.push(text.slice(j + (text[j] === "$" ? 2 : 1), close));
    return close;
  };
  const bodies = (k) => {
    let at = k + 1;
    for (const doc of pending.splice(0)) {
      let body = "";
      while (at < command.length) {
        let stop = command.indexOf("\n", at);
        if (stop === -1) stop = command.length;
        const line = command.slice(at, stop).replace(/\r$/, "");
        at = stop + 1;
        if ((doc.strip ? line.replace(/^\t+/, "") : line) === doc.delimiter) break;
        body += line + "\n";
      }
      docs.push(body);
      for (let j = 0; doc.expand && j < body.length; j += 1) {
        if (body[j] === "\\") j += 1;
        else if (opens(body, j)) j = sub(body, j);
      }
    }
    return at - 1;
  };
  for (let k = 0; k < command.length; k += 1) {
    const c = command[k];
    if (c === "'") {
      const close = command.indexOf("'", k + 1);
      word = (word ?? "") + command.slice(k + 1, close === -1 ? command.length : close);
      k = close === -1 ? command.length : close;
    } else if (c === '"') {
      word ??= "";
      for (k += 1; k < command.length && command[k] !== '"'; k += 1) {
        if (opens(command, k)) {
          const close = sub(command, k);
          word += command.slice(k, close + 1);
          k = close;
          continue;
        }
        if (command[k] === "\\" && '$\`"\\\n'.includes(command[k + 1] ?? "")) k += 1;
        word += command[k] ?? "";
      }
    } else if (c === "\\" && process.platform !== "win32") {
      // A backslash escapes the next character, except on Windows, where it separates a path's parts.
      if (command[k + 1] !== "\n") word = (word ?? "") + (command[k + 1] ?? "");
      k += 1;
    } else if (c === "#" && word === null) {
      while (k + 1 < command.length && command[k + 1] !== "\n") k += 1;
    } else if (c === "<" || c === ">") {
      if (word !== null && /^\d+$/.test(word)) word = null;
      else end();
      if (command.startsWith("<<", k) && command[k + 2] !== "<") {
        let j = k + 2 + (command[k + 2] === "-" ? 1 : 0);
        while (command[j] === " " || command[j] === "\t") j += 1;
        const delimiter = /^[^\s;&|()<>]*/.exec(command.slice(j))[0];
        pending.push({ delimiter: delimiter.replace(/['"\\]/g, ""), strip: command[k + 2] === "-", expand: !/['"\\]/.test(delimiter) });
        k = j + delimiter.length - 1;
      } else {
        while (/[<>&|]/.test(command[k + 1] ?? "")) k += 1;
        drop = true;
      }
    } else if (/[\s;&|(){}\`]/.test(c)) {
      end();
      if (c === "\n" || c === "\r" || !/\s/.test(c)) {
        drop = false;
        words.push(null);
      }
      if (c === "\n" && pending.length > 0) k = bodies(k);
    } else word = (word ?? "") + c;
  }
  end();
  const home = process.env.HOME ?? process.env.USERPROFILE;
  return { words: words.map((w) => (w !== null && home && /^~(?=[\\/]|$)/.test(w) ? home + w.slice(1) : w)), nested, docs };
}

const RUNNER = ["pw", "--package --workspace --filter", "-c --call --shell-mode"];
const WRAPPERS = new Map([
  ["env", ["uCP", "--unset --chdir", "-S --split-string"]],
  ["sudo", ["ugpCrtUDRT", "--user --group --prompt --close-from --role --type --other-user --chdir --chroot --command-timeout --host"]],
  ["doas", ["uC"]],
  ["exec", ["a"]],
  ["nice", ["n", "--adjustment"]],
  ["timeout", ["sk", "--signal --kill-after"]],
  ["stdbuf", ["ioe", "--input --output --error"]],
  ["time", ["fo", "--format --output"]],
  ["xargs", ["ILnPsdEa", "--max-args --max-procs --max-chars --delimiter --arg-file --process-slot-var"]],
  ["command", []],
  ["builtin", []],
  ["nohup", []],
  ["npx", RUNNER],
  ["bunx", RUNNER],
  ["pnpx", RUNNER],
  ["corepack", []],
]);
const RUNNERS = new Set(["npm exec", "npm x", "pnpm dlx", "pnpm exec", "yarn dlx", "yarn exec", "bun x", "bun exec"]);
const MANAGERS = new Set(["npm", "pnpm", "yarn", "bun"]);
const MANAGER_VALUED = new Set(["-w", "--workspace", "--filter", "-F", "--prefix", "-C", "--dir", "--cwd", "--registry", "--userconfig"]);
const KEYWORDS = new Set(["!", "if", "then", "else", "elif", "fi", "do", "done", "while", "until"]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);
const POWERSHELLS = new Set(["pwsh", "powershell", "invoke-expression", "iex"]);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** Where a shell call's git runs: its working directory and each place a command on the line moves it to. */
function placesOf(command, cwd) {
  const places = [{ work: cwd }];
  const bases = [cwd];
  const full = () => places.length > PLACES_MAX || bases.length > PLACES_MAX;
  const has = (list, option) => list.split(" ").includes(option);
  const move = (path) => {
    if (typeof path !== "string" || path === "-" || path === "+") places.push(null);
    else for (const dir of bases.map((base) => resolve(base, path))) {
      places.push({ work: dir });
      if (!bases.includes(dir)) bases.push(dir);
    }
  };
  const gitDir = (path) => {
    if (typeof path !== "string") places.push(null);
    else for (const base of bases) places.push({ git: resolve(base, path) });
  };
  const scan = (line, depth) => {
    const { words, nested, docs } = shellWords(line);
    const inner = (text) => {
      if (depth < 4 && typeof text === "string") scan(text, depth + 1);
    };
    const rest = (j) => {
      const tail = [];
      while (typeof words[j] === "string") tail.push(words[j++]);
      return tail;
    };
    let shell = false;
    for (let k = 0, at = true; k < words.length && !full(); k += 1) {
      const word = words[k];
      if (word === null) at = true;
      if (word === null || !at) continue;
      if (ASSIGNMENT.test(word) || KEYWORDS.has(word)) {
        if (word.startsWith("GIT_DIR=")) gitDir(word.slice(8));
        continue;
      }
      at = false;
      if (/\s/.test(word) && !/^@\s/.test(word)) inner(rest(k).join(" "));
      const name = programName(word);
      const assigned = /^\$env:git_dir(=.*)?$/i.exec(word);
      // A package manager's options before a runner's subcommand (npm -w x exec), skipped as u6 skips them.
      let sub = k + 1;
      while (MANAGERS.has(name) && typeof words[sub] === "string") {
        const option = words[sub];
        const next = typeof words[sub + 1] === "string" ? words[sub + 1] : "-";
        if (MANAGER_VALUED.has(option) || (name === "yarn" && option === "workspace")) sub += 2;
        else if (/^--[^=]+$/.test(option) && !next.startsWith("-") && !RUNNERS.has(name + " " + next)) sub += 2;
        else if (option.startsWith("-") && option !== "--") sub += 1;
        else break;
      }
      if (assigned !== null) {
        const value = assigned[1] ?? (/^=/.test(words[k + 1] ?? "") ? words[(k += 1)] : undefined);
        if (value !== undefined) gitDir(value === "=" ? words[(k += 1)] : value.slice(1));
      } else if (WRAPPERS.has(name) || RUNNERS.has(name + " " + words[sub])) {
        const [short = "", long = "", lines = ""] = WRAPPERS.get(name) ?? RUNNER;
        if (!WRAPPERS.has(name)) k = sub;
        at = true;
        while (typeof words[k + 1] === "string" && (ASSIGNMENT.test(words[k + 1]) || /^(-|\d)/.test(words[k + 1]))) {
          const option = words[(k += 1)];
          if (ASSIGNMENT.test(option)) {
            if (option.startsWith("GIT_DIR=")) gitDir(option.slice(8));
            continue;
          }
          if (option === "--") break;
          let flag = null;
          let value;
          if (option.startsWith("--")) {
            const key = option.split("=")[0];
            if (has(long, key) || has(lines, key)) {
              flag = key;
              value = option.includes("=") ? option.slice(key.length + 1) : words[(k += 1)];
            }
          } else if (option.startsWith("-")) {
            for (let c = 1; c < option.length && flag === null; c += 1) {
              if (!short.includes(option[c]) && !has(lines, "-" + option[c])) continue;
              flag = "-" + option[c];
              value = c === option.length - 1 ? words[(k += 1)] : option.slice(c + 1);
            }
          }
          if (name === "env" && (flag === "-C" || flag === "--chdir")) move(value);
          else if (flag !== null && has(lines, flag)) {
            inner([value, ...rest(k + 1)].join(" "));
            at = false;
            break;
          }
        }
      } else if (["cd", "pushd", "chdir", "sl", "set-location", "push-location"].includes(name)) {
        let path;
        for (let j = k + 1; path === undefined && typeof words[j] === "string"; j += 1) {
          const option = /^--?(\w*)(?::(.*))?$/.exec(words[j]);
          if (option === null) path = words[j];
          else if (/^(?:path?|l\w*|pspath)$/i.test(option[1])) path = option[2] || words[j + 1] || null;
          else if (/^s/i.test(option[1]) && option[2] === undefined) j += 1;
        }
        move(path);
      } else if (name === "cd..") {
        move("..");
      } else if (name === "git") {
        let from = [...bases];
        for (let j = k + 1; typeof words[j] === "string"; j += 1) {
          const option = words[j];
          const value = option === "-C" || option === "--git-dir" ? words[(j += 1)] : option.slice(10);
          if (typeof value !== "string") {
            places.push(null);
            break;
          }
          if (option === "-C") {
            from = from.map((base) => resolve(base, value));
            for (const dir of from) places.push({ work: dir });
          } else if (option === "--git-dir" || option.startsWith("--git-dir=")) {
            for (const base of from) places.push({ git: resolve(base, value) });
          } else if (["-c", "--work-tree", "--namespace", "--config-env", "--super-prefix"].includes(option)) j += 1;
          else if (!option.startsWith("-")) break;
        }
      } else if (["export", "declare", "typeset", "local", "readonly"].includes(name)) {
        for (const option of rest(k + 1)) if (option.startsWith("GIT_DIR=")) gitDir(option.slice(8));
      }
      if (SHELLS.has(name) || POWERSHELLS.has(name)) shell = true;
      for (const text of linesOf(name, rest(k + 1))) inner(text);
    }
    for (const text of nested) inner(text);
    if (shell) for (const text of docs) inner(text);
  };
  scan(command, 0);
  if (full()) places.push(null);
  return places;
}

/**
 * The lines a command runs, as the push verdicts read them: sh -c's script, eval's words, PowerShell's command
 * string, cmd /c or /k's rest, each git rebase exec line (git's abbreviations and clusters too) and git bisect run's
 * command, so every line the verdicts read for a push is read here for a place. An entry past the line's end is no text.
 */
function linesOf(name, tail) {
  if (/^git-./.test(name)) return linesOf("git", [name.slice(4), ...tail]);
  if (SHELLS.has(name)) {
    const flag = tail.findIndex((option) => /^-[A-Za-z]*c[A-Za-z]*$/.test(option));
    return flag === -1 ? [] : [tail[flag + 1]];
  }
  if (name === "eval") return [tail.join(" ")];
  if (POWERSHELLS.has(name)) {
    const flag = tail.findIndex((option) => commandFlag(option) !== null);
    const first = flag !== -1 ? -1 : tail.findIndex((option) => !/^-|^\/\w*$/.test(option));
    const line = flag !== -1 ? [[commandFlag(tail[flag]), ...tail.slice(flag + 1)].join(" ")] : first !== -1 ? [tail.slice(first).join(" ")] : [];
    return [...line, ...(first === -1 ? [] : tail.slice(first + 1).filter((option) => /\s/.test(option)))];
  }
  if (name === "cmd") {
    const at = tail.findIndex((option) => /^\/[ck]/i.test(option));
    return at === -1 ? [] : [[tail[at].slice(2), ...tail.slice(at + 1)].join(" ")];
  }
  if (name !== "git") return [];
  let k = 0;
  while (k < tail.length && tail[k].startsWith("-")) k += ["-c", "-C", "--git-dir", "--work-tree", "--namespace", "--config-env", "--super-prefix"].includes(tail[k]) ? 2 : 1;
  const sub = (tail[k] ?? "").toLowerCase();
  const args = tail.slice(k + 1);
  if (sub === "bisect" && args[0] === "run") return [args.slice(1).map((word) => "'" + word.replaceAll("'", "'\\''") + "'").join(" ")];
  const lines = [];
  for (let j = 0; sub === "rebase" && j < args.length && args[j] !== "--"; j += 1) {
    const arg = args[j];
    const long = /^--ex(?:ec?)?(=[\s\S]*)?$/.exec(arg);
    if (long !== null) lines.push(long[1] === undefined ? args[(j += 1)] : long[1].slice(1));
    else if (/^-[^-]/.test(arg)) {
      for (let c = 1; c < arg.length; c += 1) {
        if (arg[c] === "x") lines.push(c === arg.length - 1 ? args[(j += 1)] : arg.slice(c + 1));
        if (arg[c] === "x" || "sXCS".includes(arg[c])) {
          if (arg[c] !== "x" && arg[c] !== "S" && c === arg.length - 1) j += 1;
          break;
        }
      }
    }
  }
  return lines;
}

/**
 * The branch context of each place a shell call's git runs in, one per git dir. Where HEAD names no branch or commit
 * (reftable's placeholder too), an implied destination counts as the default branch, so a refspec-less push is refused.
 */
function contextsOf(command, cwd) {
  const contexts = new Map();
  for (const place of placesOf(command, cwd)) {
    const dirs = place === null ? null : place.git !== undefined ? gitDirsOf(place.git) : gitDirsFrom(place.work);
    const key = dirs === null ? "" : dirs.gitDir;
    if (contexts.has(key)) continue;
    const reftable = dirs !== null && (present(join(dirs.gitDir, "reftable")) || present(join(dirs.commonDir, "reftable")));
    const head = dirs === null || reftable ? null : gitText(join(dirs.gitDir, "HEAD"));
    const branch = /^ref: refs\/heads\/(.+)$/.exec(head ?? "")?.[1] ?? ".invalid";
    const detached = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/i.test(head ?? "");
    const origin = dirs === null ? null : gitText(join(dirs.commonDir, "refs", "remotes", "origin", "HEAD"));
    const defaultBranches = origin !== null && origin.startsWith("ref: refs/remotes/origin/") ? [origin.slice(25)] : [];
    let tags = null;
    contexts.set(key, {
      currentBranch: branch !== ".invalid" ? branch : detached ? null : (defaultBranches[0] ?? "main"),
      defaultBranches,
      // Read the first time the verdict asks, which only a push refspec does: no other call reads a tag.
      get tags() {
        tags ??= dirs === null ? [] : localTags(dirs.commonDir);
        return tags;
      },
    });
  }
  return [...contexts.values()];
}

/**
 * The local tag names, loose and packed. Two ceilings fault with a coded error the guard refuses on, a further
 * tag past TAG_NAMES_MAX and a packed-refs file past PACKED_REFS_MAX_BYTES, so neither cut reads as every tag
 * there is; the throws sit outside the reads' catches. A packed-refs file or a loose tag entry that is not a
 * regular file (a link, a FIFO) is read as absent, so the list can still miss a tag that way.
 */
function localTags(commonDir) {
  // A name both loose and packed counts once.
  const tags = new Set();
  const add = (name, path) => {
    if (tags.has(name)) return;
    if (tags.size >= TAG_NAMES_MAX) throw Object.assign(new Error("tag names"), { code: "TAG_NAMES_OVER_" + TAG_NAMES_MAX, path });
    tags.add(name);
  };
  const walk = (dir, prefix) => {
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) walk(join(dir, entry.name), prefix + entry.name + "/");
      else if (entry.isFile()) add(prefix + entry.name, dir);
    }
  };
  walk(join(commonDir, "refs", "tags"), "");
  const packed = join(commonDir, "packed-refs");
  let text = "";
  let size = 0;
  try {
    const stats = lstatSync(packed);
    if (stats.isFile()) size = stats.size;
    if (stats.isFile() && size <= PACKED_REFS_MAX_BYTES) text = readFileSync(packed, "utf8");
  } catch {
    // No packed refs: the loose tags are all there are.
  }
  if (size > PACKED_REFS_MAX_BYTES) {
    throw Object.assign(new Error("packed refs"), { code: "PACKED_REFS_OVER_" + PACKED_REFS_MAX_BYTES, path: packed });
  }
  for (const line of text.split(/\r?\n/)) {
    const hit = /^[0-9a-f]{40,64} refs\/tags\/(.+)$/i.exec(line);
    if (hit !== null) add(hit[1], packed);
  }
  return [...tags];
}

/** A record's status and mode from its first HEAD_LINES lines; null when absent or not a regular file. */
function recordHead(path) {
  let stats;
  try {
    stats = lstatSync(path);
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
  if (!stats.isFile()) return null;
  const fd = openSync(path, "r");
  let text = "";
  try {
    const buffer = Buffer.alloc(Math.min(HEAD_READ_BYTES, stats.size));
    text = buffer.toString("utf8", 0, readSync(fd, buffer, 0, buffer.length, 0));
  } finally {
    closeSync(fd);
  }
  let status = null;
  let mode = null;
  for (const line of text.replace(/^\uFEFF/, "").split(/\r?\n/).slice(0, HEAD_LINES)) {
    status ??= STATUS.exec(line)?.[1] ?? null;
    mode ??= MODE.exec(line)?.[1].toLowerCase() ?? null;
  }
  return { inProgress: status !== null && IN_PROGRESS.test(status), mode };
}

/**
 * What makes the session unattended, as a refusal names it: the in-progress records reading Mode: unattended,
 * or the variable when it is set and no in-progress record reads attended; null when nothing does.
 */
function unattendedBy(root) {
  const modes = { attended: false, unattended: false };
  const runs = [];
  const runsDir = join(root, ...RUNS_SEGMENTS);
  let entries = [];
  try {
    if (lstatSync(runsDir).isDirectory()) entries = readdirSync(runsDir, { withFileTypes: true });
  } catch (error) {
    if (!error || (error.code !== "ENOENT" && error.code !== "ENOTDIR")) throw error;
  }
  // Every run folder's head, so no pile of folders named after an open record's pushes it out of the read.
  const names = entries
    .filter((entry) => entry.isDirectory() && RUN_ID.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  if (names.length > RUN_FOLDERS_MAX) {
    throw Object.assign(new Error("run folders"), { code: "RUN_FOLDERS_OVER_" + RUN_FOLDERS_MAX, path: runsDir });
  }
  for (const name of names) {
    const head = recordHead(join(runsDir, name, RECORD_FILE));
    if (head !== null && head.inProgress && head.mode !== null) modes[head.mode] = true;
    if (head !== null && head.inProgress && head.mode === "unattended") runs.push([...RUNS_SEGMENTS, name, RECORD_FILE].join("/"));
  }
  if (runs.length > 0) {
    const named = runs.slice(0, 3).join(", ") + (runs.length > 3 ? " and " + (runs.length - 3) + " more" : "");
    return "This session is unattended because " + named + " read" + (runs.length === 1 ? "s" : "") + " \`Status: in progress\` and \`Mode: unattended\`.";
  }
  const flag = (process.env.STAMITY_UNATTENDED ?? "").trim().toLowerCase();
  if (["", "false", "0"].includes(flag) || modes.attended) return null;
  return "This session is unattended because STAMITY_UNATTENDED is set and no in-progress run record reads \`Mode: attended\`.";
}

/** The shell command a payload carries; null when the call is not a shell call. */
function shellCommand(payload) {
  // Cursor's beforeShellExecution names the command at the top level and no tool: every such payload is a shell call,
  // so one with no command string is one this guard cannot read, never one that is not a shell call.
  if (payload.tool_name === undefined || payload.hook_event_name === "beforeShellExecution") {
    if (typeof payload.command === "string") return payload.command;
    throw Object.assign(new Error("no command"), { code: "NO_COMMAND" });
  }
  if (!SHELL_TOOLS.has(payload.tool_name)) return null;
  const input = payload.tool_input;
  const command = input !== null && typeof input === "object" ? input.command : undefined;
  if (typeof command === "string") return command;
  if (Array.isArray(command) && command.every((word) => typeof word === "string")) {
    return command.map((word) => "'" + word.replaceAll("'", "'\\''") + "'").join(" ");
  }
  throw Object.assign(new Error("no command"), { code: "NO_COMMAND" });
}

/** The pre-flight's canary; a link at its path is not followed, and a failed write leaves the pre-flight to refuse. */
function writeCanary(root) {
  const path = join(root, ...CANARY_SEGMENTS);
  try {
    try {
      if (!lstatSync(path).isFile()) return;
    } catch {
      // Absent: written below.
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ at: new Date().toISOString() }) + "\n");
  } catch {
    // Not written: the pre-flight then finds no fresh canary and refuses.
  }
}

/** The sentences a person-only act earns (REQ-FLOW-102, REQ-FLOW-124), the act printed as the verdict's own text. */
function askSentence(act, rule) {
  return act + " is a person-only act (\`" + rule + "\`): approve it to let the agent run it once (REQ-FLOW-102).";
}
function refuseSentence(act, rule) {
  return act + " deletes, force-pushes or cannot be undone (\`" + rule + "\`): it stays the person's to run, even with approval (REQ-FLOW-124). Give the person the exact command.";
}
function unattendedSentence(act, rule) {
  return act + " is a person-only act (\`" + rule + "\`) and this run is unattended: list it on the morning list, whose walk runs it after one click.";
}

/**
 * An attended ask-class act's decision: the person is asked, except where a sub-agent runs it (any agent identity the
 * core guard reads), since the act is the person's, or in Claude Code's \`auto\` permission mode, where a
 * classifier may settle the prompt; both are refused.
 */
function attendedAsk(payload, act, rule) {
  const told = act + " is a person-only act (\`" + rule + "\`) and ";
  const end = " (REQ-FLOW-102). Give the person the exact command.";
  const names = ["agent_type","subagent_type","agentType","subagentType","agent_id","subagent_id","agentId","parentAgentId","parent_agent_id","parent_tool_call_id"];
  const held = (reason) => ({ ask: false, reason });
  if (names.some((name) => Object.hasOwn(payload, name) && typeof payload[name] === "string" && payload[name] !== "")) {
    return held(told + "a sub-agent runs it: the act is the person's, so only the main thread may ask for it" + end);
  }
  if (payload.permission_mode === "auto") {
    return held(told + "this session runs in the \`auto\` permission mode, where a classifier may settle the prompt: it stays the person's to run" + end);
  }
  return { ask: true, reason: askSentence(act, rule) };
}

/**
 * A GitHub MCP row's tool, classed by its row: the refused one refuses, and an ask-class one asks only while the mode
 * reads attended, since a settings ask row would otherwise wait for nobody in an unattended run (REQ-FLOW-120).
 */
function mcpDecision(tool, ask, root, payload) {
  const act = "A call to the GitHub MCP server";
  if (!ask) return { ask: false, reason: refuseSentence(act, tool) };
  const why = unattendedBy(root);
  return why === null ? attendedAsk(payload, act, tool) : { ask: false, reason: unattendedSentence(act, tool) + " " + why };
}

/** The decision this call earns: null to allow it, else whether the client asks the person and the reason. */
function decide() {
  const raw = readFileSync(0, "utf8");
  const payload = raw.trim() === "" ? {} : JSON.parse(raw);
  if (payload === null || typeof payload !== "object") throw new Error("payload");
  if (typeof payload.tool_name === "string" && MCP_ROWS.has(payload.tool_name)) {
    return mcpDecision(payload.tool_name, MCP_ROWS.get(payload.tool_name), repoRoot(), payload);
  }
  const command = shellCommand(payload);
  if (command === null) return null;
  const root = repoRoot();
  // Where the call runs: the payload's working directory (relative to the root), else the root.
  const cwd = typeof payload.cwd === "string" && payload.cwd !== "" ? resolve(root, payload.cwd) : root;
  // The PowerShell tool's text is PowerShell's command string, so the verdicts read it as one too, its backslash a
  // plain character and its backtick the escape, beside the text as it stands. The unattended verdict reads it with its
  // PowerShell flag, not through a synthetic pwsh -Command line, which the run verb's stand-alone rule would refuse.
  const pwsh = /^powershell$/i.test(payload.tool_name ?? "");
  const texts = pwsh ? [command, "pwsh -Command '" + command.replaceAll("'", "'\\''") + "'"] : [command];
  // Every place and every reading (REQ-FLOW-124): one refuse-class act refuses the call, so a deletion never rides an
  // approval another reading or place would ask for.
  const found = [];
  for (const ctx of contextsOf(command, cwd)) {
    for (const text of texts) {
      const always = personOnlyVerdict(text, ctx);
      if (always.deny) found.push(always);
    }
  }
  const refused = found.find((verdict) => !verdict.ask);
  if (refused !== undefined) return { ask: false, reason: refuseSentence(refused.act, refused.rule) };
  // The mode is read for every ask and for a call the unattended rule would refuse, so an unreadable record refuses
  // those and no other call.
  const run = () => {
    const verdict = unattendedPushVerdict(command, pwsh);
    return verdict.deny ? verdict : undefined;
  };
  if (found.length > 0) {
    const why = unattendedBy(root);
    if (why === null) return attendedAsk(payload, found[0].act, found[0].rule);
    // Unattended, a push keeps the push rule's own reason; any other act goes on the morning list.
    const push = run();
    return { ask: false, reason: (push !== undefined ? push.reason : unattendedSentence(found[0].act, found[0].rule)) + " " + why };
  }
  const push = run();
  if (push !== undefined) {
    const why = unattendedBy(root);
    if (why !== null) return { ask: false, reason: push.reason + " " + why };
  }
  if (/(?:^|[^\w-])gate\s+preflight(?![\w-])/.test(command)) writeCanary(root);
  return null;
}

let decision = null;
try {
  decision = decide();
} catch (error) {
  // Fail closed: a shell call this guard could not read is not one it allows, nor one it asks the person about.
  const what = error instanceof SyntaxError ? "an unreadable payload" : error && error.code ? error.code + (typeof error.path === "string" ? " on " + error.path : "") : "an internal fault";
  decision = { ask: false, reason: "The person-only guard could not decide this shell call (" + what + "), so it is refused (REQ-FLOW-102)." };
}
if (decision !== null && decision.ask) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: decision.reason } }) + "\n");
} else if (decision !== null) {
  process.stderr.write("stamity person-only guard: " + decision.reason + "\n");
  process.exitCode = 2;
}
