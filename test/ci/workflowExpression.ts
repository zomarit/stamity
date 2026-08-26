/**
 * A small evaluator for the GitHub Actions expression subset this repository's workflows use.
 *
 * Why it exists rather than a string match. The release workflow's safety property is a
 * CONDITION: `publish` must run on a tag push, must run on a dispatch that explicitly set
 * `dry_run` to false, and must NOT run on the default dispatch. Asserting that with
 * `expect(condition).toContain("dry_run == false")` proves the substring is present, not that the
 * condition denies the dry run — a widened `if:` that adds a third arm keeps the substring and
 * loses the property. Evaluating the real condition string against the three trigger shapes tests
 * the property itself.
 *
 * Deliberately narrow, and LOUD where it is narrow: an operator or function the workflows do not
 * use throws instead of guessing. A silent default would be the same mistake the evaluator exists
 * to catch — a condition that looks evaluated and is not.
 *
 * Semantics follow the documented ones (docs.github.com/actions/reference/evaluate-expressions-in-
 * workflows-and-actions, accessed 2026-08-26): string comparison is case-insensitive, and operands
 * of differing types are cast to numbers, with null and false and the empty string all casting to
 * 0 and a non-numeric string casting to NaN (which compares equal to nothing, itself included).
 */

/** The contexts a condition may read: `github`, `inputs`, `needs`, `steps`, `matrix`, `runner`. */
export type ExpressionContext = Readonly<Record<string, unknown>>;

type Value = string | number | boolean | null | undefined | Readonly<Record<string, unknown>>;

interface Token {
  readonly kind: "operator" | "string" | "number" | "path";
  readonly text: string;
}

const OPERATORS = ["&&", "||", "==", "!=", "(", ")", ",", "!"] as const;

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < expression.length) {
    const char = expression[index] ?? "";

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === "'") {
      let text = "";
      index += 1;
      while (index < expression.length) {
        if (expression[index] === "'") {
          // Doubled quote is the escape for a literal quote.
          if (expression[index + 1] === "'") {
            text += "'";
            index += 2;
            continue;
          }
          break;
        }
        text += expression[index];
        index += 1;
      }
      if (expression[index] !== "'") throw new Error(`unterminated string in: ${expression}`);
      index += 1;
      tokens.push({ kind: "string", text });
      continue;
    }

    const operator = OPERATORS.find((candidate) => expression.startsWith(candidate, index));
    if (operator !== undefined) {
      tokens.push({ kind: "operator", text: operator });
      index += operator.length;
      continue;
    }

    const rest = expression.slice(index);
    const number = /^-?\d+(?:\.\d+)?/.exec(rest);
    if (number !== null) {
      tokens.push({ kind: "number", text: number[0] });
      index += number[0].length;
      continue;
    }

    const path = /^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_*-]+)*/.exec(rest);
    if (path === null) throw new Error(`unexpected character '${char}' in: ${expression}`);
    tokens.push({ kind: "path", text: path[0] });
    index += path[0].length;
  }

  return tokens;
}

/** `true` for the values GitHub treats as falsy in a boolean position. */
function truthy(value: Value): boolean {
  if (value === undefined || value === null || value === false) return false;
  if (value === "") return false;
  if (typeof value === "number") return value !== 0 && !Number.isNaN(value);
  return true;
}

/** The number GitHub casts a value to when the two sides of a comparison differ in type. */
function toNumber(value: Value): number {
  if (value === undefined || value === null || value === false) return 0;
  if (value === true) return 1;
  if (typeof value === "number") return value;
  if (typeof value === "string") return value.trim() === "" ? 0 : Number(value);
  return Number.NaN;
}

function looseEquals(left: Value, right: Value): boolean {
  if (typeof left === "string" && typeof right === "string") {
    return left.toLowerCase() === right.toLowerCase();
  }
  if (typeof left === typeof right && (typeof left === "boolean" || typeof left === "number")) {
    return left === right;
  }
  if ((left === null || left === undefined) && (right === null || right === undefined)) return true;
  const [a, b] = [toNumber(left), toNumber(right)];
  return !Number.isNaN(a) && !Number.isNaN(b) && a === b;
}

function asString(value: Value): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") return "";
  return String(value);
}

class Parser {
  private position = 0;

  constructor(
    private readonly tokens: readonly Token[],
    private readonly context: ExpressionContext,
    private readonly expression: string,
  ) {}

  parse(): Value {
    const value = this.or();
    if (this.position !== this.tokens.length) {
      throw new Error(`trailing tokens in: ${this.expression}`);
    }
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.position];
  }

  private eat(text: string): boolean {
    if (this.peek()?.text === text && this.peek()?.kind === "operator") {
      this.position += 1;
      return true;
    }
    return false;
  }

  private or(): Value {
    let left = this.and();
    while (this.eat("||")) {
      const right = this.and();
      left = truthy(left) ? left : right;
    }
    return left;
  }

  private and(): Value {
    let left = this.comparison();
    while (this.eat("&&")) {
      const right = this.comparison();
      left = truthy(left) ? right : left;
    }
    return left;
  }

  private comparison(): Value {
    const left = this.unary();
    if (this.eat("==")) return looseEquals(left, this.unary());
    if (this.eat("!=")) return !looseEquals(left, this.unary());
    return left;
  }

  private unary(): Value {
    if (this.eat("!")) return !truthy(this.unary());
    return this.primary();
  }

  private primary(): Value {
    const token = this.peek();
    if (token === undefined) throw new Error(`unexpected end of: ${this.expression}`);

    if (this.eat("(")) {
      const value = this.or();
      if (!this.eat(")")) throw new Error(`unbalanced parentheses in: ${this.expression}`);
      return value;
    }

    this.position += 1;

    if (token.kind === "string") return token.text;
    if (token.kind === "number") return Number(token.text);

    // A path immediately followed by `(` is a function call.
    if (this.peek()?.text === "(" && this.peek()?.kind === "operator") {
      this.position += 1;
      const args: Value[] = [];
      if (!this.eat(")")) {
        do {
          args.push(this.or());
        } while (this.eat(","));
        if (!this.eat(")")) throw new Error(`unbalanced call in: ${this.expression}`);
      }
      return this.call(token.text, args);
    }

    return this.lookup(token.text);
  }

  private call(name: string, args: readonly Value[]): Value {
    switch (name) {
      case "format": {
        // `format('{0}', x)` is how a workflow forces a STRING comparison. It matters here
        // because the number cast behind `==` makes null, '' and false interchangeable, and the
        // release workflow's publish arm turns on telling them apart. Semantics per
        // docs.github.com/actions/reference/evaluate-expressions-in-workflows-and-actions
        // (accessed 2026-08-26): `{N}` takes replacement N, `{{` and `}}` are literal braces,
        // and a value renders the way `asString` renders it — null and undefined as the empty
        // string, booleans as 'true'/'false'.
        const template = asString(args[0]);
        const replacements = args.slice(1);
        return template.replace(/\{\{|\}\}|\{(\d+)\}/g, (match, index: string) => {
          if (match === "{{") return "{";
          if (match === "}}") return "}";
          // Out of range is an author error, not an empty string: GitHub refuses it, and a
          // silent '' here would be the convenient default this evaluator exists to refuse.
          if (Number(index) >= replacements.length) {
            throw new Error(
              `format() references {${index}} with ${String(replacements.length)} replacement(s) ` +
                `in: ${this.expression}`,
            );
          }
          return asString(replacements[Number(index)]);
        });
      }
      case "startsWith":
        return asString(args[0]).toLowerCase().startsWith(asString(args[1]).toLowerCase());
      case "endsWith":
        return asString(args[0]).toLowerCase().endsWith(asString(args[1]).toLowerCase());
      case "contains":
        return asString(args[0]).toLowerCase().includes(asString(args[1]).toLowerCase());
      case "always":
        return true;
      case "cancelled":
      case "failure":
        return false;
      case "success":
        return true;
      default:
        // Loud on purpose: an unmodelled function must not evaluate to a convenient default.
        throw new Error(`unsupported function '${name}()' in: ${this.expression}`);
    }
  }

  private lookup(path: string): Value {
    if (path === "true") return true;
    if (path === "false") return false;
    if (path === "null") return null;

    let cursor: unknown = this.context;
    for (const segment of path.split(".")) {
      if (cursor === null || cursor === undefined || typeof cursor !== "object") return undefined;
      cursor = (cursor as Record<string, unknown>)[segment];
    }
    return cursor as Value;
  }
}

/**
 * Evaluate one `if:` condition against a context, as GitHub would.
 *
 * `${{ }}` wrappers are stripped: a job-level `if:` may carry them or not, and both spellings mean
 * the same thing to the runner.
 */
export function evaluateWorkflowExpression(
  expression: string,
  context: ExpressionContext,
): boolean {
  const body = expression
    .trim()
    .replace(/^\$\{\{/, "")
    .replace(/\}\}$/, "")
    .trim();
  if (body === "") throw new Error("empty condition");
  return truthy(new Parser(tokenize(body), context, body).parse());
}
