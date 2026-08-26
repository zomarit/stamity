import js from "@eslint/js";
import globals from "globals";

// oxlint is the primary lint lane and covers TypeScript natively. ESLint is kept for the
// JavaScript surface (config files, build scripts) and for the two custom rules below,
// which oxlint cannot express.
//
// DEFERRAL — TypeScript files are not routed through ESLint.
//   Blocker:  typescript-eslint@8 declares `typescript: >=4.8.4 <6.1.0` as a peer and refuses
//             to install alongside the TypeScript 7 native compiler this repo pins.
//   Effect:   `silent-catch` and `hatch-error` bind on `**/*.js` and `**/*.mjs` only. Every
//             file under `src/` and `test/` is outside them, so neither rule is a gate on the
//             engine today — say so rather than letting the config's presence imply coverage.
//   Trigger:  re-open when typescript-eslint publishes a release whose peer range admits the
//             pinned compiler. The tracked date for that is TypeScript 7.1, Autumn 2026; if
//             that release lands and the peer range still excludes it, the deferral is
//             re-dated with the new evidence rather than left open with a stale one.
//   Not the answer: moving the two rules to oxlint. That swaps the mechanism rather than
//             lifting the blocker, and the mechanism is a separate ratified decision.
//
// The two rules are STUBS in the precise sense that they check the syntactic floor of their
// contract, not its type-aware form: `silent-catch` cannot tell a discarded `unknown` from a
// discarded domain error, and `hatch-error` cannot tell the engine's own error type from any
// other constructor. Both are the shape that survives without type information, which is
// exactly the half the blocker above does not hold up.

/**
 * A catch clause has to do something with the failure it caught.
 *
 * Wider than `no-empty`'s catch case, which is why it exists separately: that rule stops at a
 * block with no statements and no comments, while the failure mode here is a catch that DOES
 * have statements and still drops the error on the floor — a binding declared, never read,
 * nothing rethrown. Both shapes end the same way, with a failure nobody can see.
 */
const silentCatch = {
  meta: {
    type: "problem",
    docs: { description: "Require a catch clause to surface, use, or document the failure." },
    schema: [],
    messages: {
      empty:
        "Empty catch: nothing runs and no comment says why discarding the failure is safe. State the reason, or handle it.",
      discarded:
        "`{{name}}` is caught and never read, and nothing is rethrown — the failure is discarded silently. Use it, rethrow, or drop the binding and comment the discard.",
    },
  },
  create(context) {
    const source = context.sourceCode;
    return {
      CatchClause(node) {
        // A `throw` anywhere in the block means the failure leaves this frame, which is the
        // one answer that always counts. Read off tokens rather than an AST walk: a stub
        // over-accepting a rethrow nested in a callback is the safe direction to be wrong in.
        const rethrows = source
          .getTokens(node.body)
          .some((token) => token.type === "Keyword" && token.value === "throw");
        if (rethrows) return;

        if (node.param === null) {
          // No binding: the only silent shape left is a body that runs nothing. A
          // comment-only body is a documented discard and passes — the comment is the
          // reason, which is what this rule asks for.
          if (node.body.body.length > 0) return;
          if (source.getCommentsInside(node.body).length > 0) return;
          context.report({ node, messageId: "empty" });
          return;
        }

        for (const variable of source.getDeclaredVariables(node)) {
          if (variable.references.length > 0) continue;
          context.report({ node: node.param, messageId: "discarded", data: { name: variable.name } });
        }
      },
    };
  },
};

/**
 * A thrown value is an Error carrying a message.
 *
 * The engine's own contract is stronger — an operator-readable failure states what failed,
 * why, and what to do next — and it is not checkable without types. What holds here is the
 * floor beneath it: a thrown string or object literal reaches every `catch` with no stack and
 * no `.message`, and a message-less `new Error()` reaches the operator with nothing at all.
 */
const hatchError = {
  meta: {
    type: "problem",
    docs: { description: "Require thrown values to be Errors, and Errors to carry a message." },
    schema: [],
    messages: {
      notAnError:
        "Throw an Error, not a bare {{kind}} — a thrown value with no stack and no `.message` tells the operator nothing.",
      noMessage: "`new {{name}}()` carries no message: state what failed and what to do next.",
    },
  },
  create(context) {
    const LITERAL_THROWS = new Set([
      "Literal",
      "TemplateLiteral",
      "ObjectExpression",
      "ArrayExpression",
    ]);
    return {
      ThrowStatement(node) {
        if (node.argument === null) return;
        if (!LITERAL_THROWS.has(node.argument.type)) return;
        context.report({ node, messageId: "notAnError", data: { kind: node.argument.type } });
      },
      NewExpression(node) {
        if (node.callee.type !== "Identifier") return;
        if (!node.callee.name.endsWith("Error")) return;
        if (node.arguments.length > 0) return;
        context.report({ node, messageId: "noMessage", data: { name: node.callee.name } });
      },
    };
  },
};

/** The repo's own rules, namespaced so a report names where the rule came from. */
export const stamityPlugin = {
  meta: { name: "stamity" },
  rules: { "silent-catch": silentCatch, "hatch-error": hatchError },
};

export default [
  {
    // `.stamity/` is engine-emitted product output, not hand-authored source — the same
    // class as `dist/`. It holds this repo's own dogfooded setup: the emitted
    // hook scripts are byte-governed by the golden suites and the emission contract, so
    // linting them with this repo's source rules would couple shipped bytes to dev-lane
    // style preferences. It also mislabels deliberate sanitization: the hooks strip C0/DEL
    // from untrusted payloads, which reads to `no-control-regex` as a defect.
    // `website/` is a separate npm project with its own toolchain: a Docusaurus site, React
    // TSX, its own tsconfig and its own lockfile. It is stated here rather than left to accident:
    // today the `files:` globs below already miss it, so this line changes nothing on its own —
    // which is exactly why it is written down. The day one of those globs widens to `**/*.ts`,
    // the site would be linted against rules built for the CLI's source, and the report would be
    // a config neither project asked for. The mirror of this entry is `.oxlintrc.json`'s
    // `ignorePatterns`, so both linters agree on what the tree contains.
    ignores: ["dist/**", "coverage/**", "node_modules/**", ".stamity/**", "website/**"],
  },
  {
    ...js.configs.recommended,
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.nodeBuiltin,
    },
    plugins: { stamity: stamityPlugin },
    rules: {
      ...js.configs.recommended.rules,
      "no-console": "off",
      "no-empty": ["error", { allowEmptyCatch: false }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "prefer-const": "error",
      "no-var": "error",
      "stamity/silent-catch": "error",
      "stamity/hatch-error": "error",
    },
  },
];
