/**
 * Secret-shape detection for environment variable values.
 *
 * MCP server definitions carry `env` blocks, and the client configs generated
 * from them are committed. A literal credential in one of those values is a
 * repository leak, so values are scanned for well-known secret shapes before
 * emission, and every reported value is masked — a finding never echoes the
 * secret that produced it.
 *
 * Detection is shape-based and therefore advisory: it catches credential
 * formats that are unambiguous on sight, not every possible secret.
 */

export interface SecretPattern {
  /** Stable identifier; surfaces as a finding's `patternId`. */
  id: string;
  /** What the pattern detects. Used verbatim in human-readable output. */
  description: string;
  /** Applied to the value. Never `/g` — a global regex makes `test` stateful. */
  pattern: RegExp;
}

export interface SecretFinding {
  patternId: string;
  varName?: string;
  maskedValue: string;
}

export interface SecretDetectionResult {
  findings: SecretFinding[];
  clean: boolean;
}

/**
 * Ordered most specific first. A value may match several patterns and reports
 * all of them, so this order is the output order and part of the contract:
 * the precise shape is named before any generic fallback.
 */
export const SECRET_PATTERNS: readonly SecretPattern[] = [
  {
    id: "aws-access-key-id",
    description: "Cloud provider access key ID (AKIA-prefixed)",
    pattern: /(?:^|[^A-Za-z0-9])AKIA[0-9A-Z]{16}(?![A-Za-z0-9])/,
  },
  {
    id: "github-token",
    description: "Source-forge personal, OAuth, or app token (gh*_ prefixed)",
    pattern: /\bgh[pousr]_[A-Za-z0-9]{36}\b/,
  },
  {
    id: "github-fine-grained-token",
    description: "Source-forge fine-grained personal access token",
    pattern: /\bgithub_pat_[A-Za-z0-9_]{82}\b/,
  },
  {
    id: "gitlab-access-token",
    description: "Source-forge personal or project access token (glpat- prefixed)",
    pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/,
  },
  {
    id: "slack-token",
    description: "Chat platform bot, user, or app token (xox*- prefixed)",
    pattern: /\bxox[abporas]-[A-Za-z0-9-]{10,}\b/,
  },
  {
    id: "stripe-api-key",
    description: "Payment provider live or test API key (sk_/pk_ prefixed)",
    pattern: /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/,
  },
  {
    id: "sk-prefixed-api-key",
    description: "Provider API key using the sk- secret-key prefix",
    pattern: /\bsk-(?:[A-Za-z0-9]{1,12}-)?[A-Za-z0-9_-]{20,}\b/,
  },
  {
    id: "pem-private-key",
    description: "PEM-encoded private key block",
    pattern: /-----BEGIN (?:[A-Z0-9]+ ){0,3}PRIVATE KEY-----/,
  },
  {
    id: "bearer-token",
    description: "Authorization bearer token stored as a value",
    pattern: /^Bearer\s+[A-Za-z0-9\-._~+/]+=*$/i,
  },
  {
    id: "inline-api-key-assignment",
    description: "API key assigned inline inside the value",
    pattern: /(?:api[_-]?key|apikey|api[_-]?secret|access[_-]?key)\s*[:=]\s*\S+/i,
  },
  {
    id: "inline-password-assignment",
    description: "Password assigned inline inside the value",
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*\S+/i,
  },
  {
    id: "credentialed-connection-string",
    description: "Database or broker URL with embedded credentials",
    pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqps?):\/\/[^:@/\s]+:[^@/\s]+@/i,
  },
  {
    id: "azure-devops-pat",
    description: "Cloud DevOps personal access token",
    pattern: /^[A-Za-z0-9]{75}AZDO[A-Za-z0-9]{5}$/,
  },
  {
    id: "linear-api-key",
    description: "Issue tracker API key (lin_api_ prefixed)",
    pattern: /\blin_api_[A-Za-z0-9]{40,}\b/,
  },
  {
    id: "sentry-auth-token",
    description: "Error monitoring auth token (sntrys_ prefixed)",
    pattern: /\bsntrys_[A-Za-z0-9]{40,}\b/,
  },
  {
    id: "high-entropy-string",
    description: "Long base64-shaped run that may be an encoded credential",
    pattern: /[A-Za-z0-9+/]{40,}={0,2}/,
  },
];

/**
 * Patterns that only fire with corroborating credential context. Ungated, the
 * generic high-entropy pattern flags every 40+ character base64-shaped value —
 * commit SHAs, content digests, public-key fingerprints — and that noise
 * trains readers to ignore the scanner.
 */
const CONTEXT_REQUIRED_PATTERN_IDS: ReadonlySet<string> = new Set(["high-entropy-string"]);

const CREDENTIAL_NAME_PATTERN = /KEY|SECRET|TOKEN|PASSWORD|PASSWD|PWD|AUTH|CREDENTIAL/i;

/** A padded base64 credential runs longer than a hash: a 32-byte digest is 44 characters. */
const PADDED_BASE64_CREDENTIAL_LENGTH = 60;

function hasCredentialContext(varName: string, value: string): boolean {
  if (CREDENTIAL_NAME_PATTERN.test(varName)) return true;
  return value.endsWith("=") && value.length >= PADDED_BASE64_CREDENTIAL_LENGTH;
}

/** Below this length, revealing head and tail would expose most of the value. */
const MASK_MIN_LENGTH = 7;
const MASK_HEAD_LENGTH = 4;
const MASK_TAIL_LENGTH = 2;
/** Fixed width: the mask leaks neither the value's length nor a multi-KB key block. */
const MASK_RUN = "*".repeat(8);

/** Blanks control, format, and whitespace characters so a revealed fragment stays on one line. */
function printable(fragment: string): string {
  return fragment.replace(/[\s\p{C}]/gu, " ");
}

/**
 * Mask a value for display: first 4 and last 2 characters, never more. Values
 * shorter than {@link MASK_MIN_LENGTH} — including the empty string — are
 * masked whole.
 */
export function maskValue(value: string): string {
  if (value.length < MASK_MIN_LENGTH) return MASK_RUN;
  const head = printable(value.slice(0, MASK_HEAD_LENGTH));
  const tail = printable(value.slice(-MASK_TAIL_LENGTH));
  return `${head}${MASK_RUN}${tail}`;
}

/**
 * Scan one variable's value, returning a finding per matching pattern,
 * deduplicated by `patternId`. Blank and whitespace-only values never match.
 */
export function scanValueForSecrets(name: string, value: string): SecretFinding[] {
  if (value.trim() === "") return [];

  const direct: string[] = [];
  const contextual: string[] = [];
  for (const { id, pattern } of SECRET_PATTERNS) {
    if (!pattern.test(value)) continue;
    if (CONTEXT_REQUIRED_PATTERN_IDS.has(id)) contextual.push(id);
    else direct.push(id);
  }

  // A value already carrying a recognised credential is its own context: the
  // high-entropy run inside a PEM block is key material, not a digest.
  const contextSatisfied = direct.length > 0 || hasCredentialContext(name, value);
  const matchedIds = contextSatisfied ? [...direct, ...contextual] : direct;
  if (matchedIds.length === 0) return [];

  const maskedValue = maskValue(value);
  const seen = new Set<string>();
  const findings: SecretFinding[] = [];
  for (const patternId of matchedIds) {
    if (seen.has(patternId)) continue;
    seen.add(patternId);
    findings.push({ patternId, varName: name, maskedValue });
  }
  return findings;
}

/** Scan every variable in an env map. Insertion order of `vars` is preserved. */
export function detectSecrets(vars: Record<string, string>): SecretDetectionResult {
  const findings: SecretFinding[] = [];
  for (const [name, value] of Object.entries(vars)) {
    findings.push(...scanValueForSecrets(name, value));
  }
  return { findings, clean: findings.length === 0 };
}

const PATTERN_DESCRIPTIONS: ReadonlyMap<string, string> = new Map(
  SECRET_PATTERNS.map((secretPattern) => [secretPattern.id, secretPattern.description]),
);

/**
 * Render findings for a human reader. Only masked values are printed.
 *
 * Emptiness is decided by `findings`, not by `clean`: a hand-built result with
 * a stale `clean: true` must not suppress findings it actually carries.
 */
export function formatSecretFindings(result: SecretDetectionResult): string {
  if (result.findings.length === 0) return "No secret-shaped values detected.";

  const lines = [`Detected ${result.findings.length} secret-shaped value(s):`];
  for (const finding of result.findings) {
    const label = PATTERN_DESCRIPTIONS.get(finding.patternId) ?? finding.patternId;
    lines.push(
      `  ${finding.varName ?? "(value)"}: ${label} [${finding.patternId}] ${finding.maskedValue}`,
    );
  }
  lines.push("Move these values to a secrets manager and reference them by name, not by literal.");
  return lines.join("\n");
}
