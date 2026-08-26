import type { Framework, RepoInfo } from "../types/detect.ts";

/**
 * How well the corpus covers a detected stack.
 *
 * Detection names what a repository runs; this module says what the generated
 * setup can actually offer it. The distinction matters at `init` time: a user
 * whose stack has no idiom-level guidance deserves to be told so in one line,
 * rather than discovering it later from guidance that reads generically.
 *
 * Three tiers, and only one of them is a gap:
 *
 * - `full` — dedicated guidance for the stack's subject exists.
 * - `partial` — no stack-idiom guidance, but the always-on charter floor and
 *   every file-scoped rule matching its sources apply. This is the floor, not
 *   a hole.
 * - `none` — the engine has no mapping for the name at all. In practice this
 *   only appears when detection learns a language the tables have not, which
 *   is exactly the drift worth surfacing.
 *
 * **Tiers are derived, never asserted.** Every row takes its tier from one
 * lookup in {@link STACK_GUIDANCE_INVENTORY} — the subjects dedicated guidance
 * actually covers. That set is EMPTY as shipped, so every row below reads
 * `partial` today and nothing here claims content a user would go looking for
 * and not find. A reader needs no run to know the honest state: no row can
 * read `full` until a stack pack ships and its subject enters the inventory,
 * at which point the affected rows light up from data alone.
 *
 * {@link FRAMEWORK_SUPPORT} is keyed by the whole {@link Framework} union, so
 * adding a framework to detection without classifying it here fails to compile
 * rather than silently reporting a stack as unsupported.
 */

export type StackSupportTier = "full" | "partial" | "none";

export interface StackSupport {
  tier: StackSupportTier;
  /** One line a user can act on: what they get today, and what to do about the rest. */
  notes: string;
}

/**
 * The guidance subjects a shipped corpus file actually covers — the single
 * source every tier below is computed from.
 *
 * EMPTY, and that is the accurate state rather than a stub: the corpus ships a
 * charter and twelve glob-scoped rules written against concerns (testing,
 * migrations, secrets, API versioning), not one stack-idiom file, and the
 * curated catalog carries no stack pack to install one from. Adding a subject
 * here is the whole act of shipping stack support.
 *
 * Keyed by SUBJECT rather than by stack name because guidance is authored per
 * subject: one Python guidance file answers `python`, `django`, `flask`, and
 * `fastapi` at once, so one entry lights all four rows. That keying is also
 * what keeps the two axes consistent — a framework that shares its language's
 * subject can never read `full` while the language still reads `partial`.
 */
export const STACK_GUIDANCE_INVENTORY: ReadonlySet<string> = new Set<string>();

/**
 * Curated stack packs by subject — the installable half of the answer, and the
 * only thing that lets a suggestion name a pack.
 *
 * EMPTY for the same reason: the curated catalog ships `ops`, `product-audit`,
 * and `scaffold`, none of which is a stack pack. Held as data so the day one
 * lands, naming it in the init panel is a row here rather than a code change —
 * and so no suggestion can ever print an id `stamity add` could not resolve.
 */
const STACK_PACK_CATALOG: ReadonlyMap<string, string> = new Map<string, string>();

/** The claim sentence — the one place anything is said to ship for a stack. */
const full = (subject: string): StackSupport => ({
  tier: "full",
  notes: `Dedicated ${subject} guidance ships with the corpus, on top of the always-on charter floor.`,
});

/**
 * The floor sentence — it names what the user DOES get, so an honest tier does
 * not read as a failure.
 *
 * It leads with the SUBJECT because it is also the line the init panel prints
 * (see {@link suggestStackPacks}), and a panel listing three uncovered stacks
 * used to print one subject-free sentence three times over. Short enough to
 * stay one screen line next to the row's `name (kind)` prefix.
 */
const partial = (subject: string): StackSupport => ({
  tier: "partial",
  notes: `No ${subject} idiom guidance yet; the always-on charter floor and file-scoped rules still apply.`,
});

/**
 * The one thing a user can do for a stack nothing ships for. It reaches the
 * init panel through {@link UNMAPPED}'s note, which {@link suggestStackPacks}
 * prints verbatim — one sentence, one home, so the panel and the tier can never
 * state the act differently.
 */
const ADD_RULES_ACTION = "Add project rules for its idioms and set the verification gates by hand.";

/** Answer for a name the tables do not carry — the only tier that asks the user to act. */
const UNMAPPED: StackSupport = {
  tier: "none",
  notes: `Unmapped stack: only the always-on charter floor applies. ${ADD_RULES_ACTION}`,
};

/**
 * Framework → the guidance subject its row is classified under.
 *
 * The two axes are independent, and a framework row reports the framework's own
 * idioms only. A Next.js app on TypeScript is answered here by the `Next.js`
 * subject — routing, rendering, and data-loading idioms — while its language is
 * answered by the `TypeScript and JavaScript` subject in
 * {@link LANGUAGE_SUBJECTS}. Both statements are true, and collapsing them
 * would lose the one the user asked about.
 *
 * The frameworks that share their language's subject — the Python, Ruby, PHP,
 * and Rust web frameworks — are the ones whose request path that language's
 * guidance would carry. They can only light up together with their language,
 * which is what makes the cross-axis behaviour in
 * {@link classifyStacksAgainst} structural rather than a coincidence.
 */
const FRAMEWORK_SUBJECTS: Record<Framework, string> = {
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
  phoenix: "Phoenix",
};

/**
 * Language → the guidance subject its row is classified under. Keyed by the
 * names detection can emit, every one of them mapped: an unmapped name reaching
 * {@link classifyLanguage} means detection grew a language this table did not,
 * and the `none` tier says so instead of guessing a tier for it.
 *
 * Java keeps its own subject rather than sharing Kotlin's: server-side Java is
 * the dominant use of the language and Android idioms carry none of it, so an
 * Android and Kotlin pack must never light Java up.
 */
const LANGUAGE_SUBJECTS: Record<string, string> = {
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
  lua: "Lua",
};

/** Both coverage tables as one value, so a caller classifies against a single consistent pair. */
export interface StackSupportTables {
  readonly frameworks: Record<Framework, StackSupport>;
  readonly languages: Record<string, StackSupport>;
}

/** One subject map, resolved against one inventory; the key set is preserved exactly. */
function deriveTable<K extends string>(
  subjects: Readonly<Record<K, string>>,
  inventory: ReadonlySet<string>,
): Record<K, StackSupport> {
  const table = {} as Record<K, StackSupport>;
  for (const [key, subject] of Object.entries(subjects) as [K, string][]) {
    table[key] = inventory.has(subject) ? full(subject) : partial(subject);
  }
  return table;
}

/**
 * Both tables for a given inventory.
 *
 * The shipped tables are this function applied to {@link STACK_GUIDANCE_INVENTORY};
 * calling it with any other set yields the tables the corpus WOULD have, which
 * is how the derivation is proved and how the next stack pack's effect can be
 * read before it ships.
 */
export function deriveStackSupport(inventory: ReadonlySet<string>): StackSupportTables {
  return {
    frameworks: deriveTable(FRAMEWORK_SUBJECTS, inventory),
    languages: deriveTable(LANGUAGE_SUBJECTS, inventory),
  };
}

const SHIPPED_SUPPORT: StackSupportTables = deriveStackSupport(STACK_GUIDANCE_INVENTORY);

/** Framework → coverage, derived from the shipped inventory. */
export const FRAMEWORK_SUPPORT: Record<Framework, StackSupport> = SHIPPED_SUPPORT.frameworks;

/** Language → coverage, derived from the shipped inventory. */
export const LANGUAGE_SUPPORT: Record<string, StackSupport> = SHIPPED_SUPPORT.languages;

/** Coverage for one detected framework. */
export function classifyFramework(framework: Framework): StackSupport {
  // The record is total over the union, so the fallback only fires for a value
  // cast in from outside the type — a persisted manifest written by an older
  // build, for instance.
  return FRAMEWORK_SUPPORT[framework] ?? UNMAPPED;
}

/** Coverage for one detected language; an unmapped name is `none`, never a guess. */
export function classifyLanguage(language: string): StackSupport {
  return LANGUAGE_SUPPORT[language] ?? UNMAPPED;
}

/** A detected stack that has no dedicated guidance — what the `init` pointer reports. */
export interface UnsupportedStack {
  name: string;
  kind: "framework" | "language";
  support: StackSupport;
}

/**
 * The detected stacks that read below `full` against a given pair of tables,
 * frameworks first and de-duplicated.
 *
 * Frameworks lead because they are the more specific axis: a user on Next.js
 * wants to hear about Next.js before TypeScript. No cross-axis suppression is
 * needed — a framework only reads `full` when its subject is in the inventory,
 * and the frameworks that share a language's subject light up with it, so a
 * covered stack never re-appears through its language.
 *
 * An empty result means every detected stack has dedicated guidance, which is
 * the only case where the pointer stays silent. With today's empty inventory
 * that case is reachable only with nothing detected at all — which is the point
 * of taking the tables as an argument: the branch stays exercised, and it is
 * the branch that must survive until the first stack pack makes it live again.
 */
export function classifyStacksAgainst(
  info: RepoInfo,
  tables: StackSupportTables,
): UnsupportedStack[] {
  const out: UnsupportedStack[] = [];
  const seen = new Set<string>();

  for (const framework of info.frameworks) {
    const support = tables.frameworks[framework] ?? UNMAPPED;
    if (support.tier === "full" || seen.has(framework)) continue;
    seen.add(framework);
    out.push({ name: framework, kind: "framework", support });
  }

  for (const language of info.languages) {
    const support = tables.languages[language] ?? UNMAPPED;
    if (support.tier === "full" || seen.has(language)) continue;
    seen.add(language);
    out.push({ name: language, kind: "language", support });
  }

  return out;
}

/** {@link classifyStacksAgainst} against the shipped tables — the production entry. */
export function classifyDetectedStacks(info: RepoInfo): UnsupportedStack[] {
  return classifyStacksAgainst(info, SHIPPED_SUPPORT);
}

/** One printable row for the init panel: the stack, how well it is covered, and the one next step. */
export interface StackSuggestion {
  readonly name: string;
  readonly kind: "framework" | "language";
  readonly tier: StackSupportTier;
  /**
   * The row's single printed line: THIS row's support note when nothing is
   * installable, or the install command when a pack backs it. Never names a
   * pack that is not installable.
   *
   * It is the tier's own note rather than a constant because the panel prints
   * one line per row and nothing else: a shared sentence made a three-stack
   * repo read the identical instruction three times while the per-tier note and
   * the subject — the only parts that differed — were computed and dropped.
   */
  readonly action: string;
  /** Curated pack id when one exists for this subject; undefined today. */
  readonly packId?: string;
}

/** The guidance subject a classified row was resolved under, or `undefined` for an unmapped name. */
function subjectOf(stack: UnsupportedStack): string | undefined {
  const subjects: Record<string, string | undefined> =
    stack.kind === "framework" ? FRAMEWORK_SUBJECTS : LANGUAGE_SUBJECTS;
  return subjects[stack.name];
}

/**
 * What the init panel offers for the detected stacks nothing ships for:
 * suggestions, and nothing more. Stack packs are suggested by detection and
 * never auto-installed, so every row here is a sentence, not an action taken.
 *
 * The action is bound to what exists. With no stack pack in the curated
 * catalog, the only truthful next step is the row's OWN support note — which
 * names its subject and its tier, and for the `none` tier is exactly "write the
 * rules and set the gates". Carrying that note through is what stops the block
 * printing one identical sentence per row: both inventories are empty by
 * design, so every install today produces this branch, and a constant here made
 * an N-stack repo read the same instruction N times while the per-tier and
 * per-subject wording was computed and thrown away one line later. A subject
 * the catalog does carry is named by its pack id instead, so the suggestion
 * becomes copy-pasteable the moment a pack backs it.
 *
 * Order is {@link classifyDetectedStacks}'s: frameworks before languages, each
 * in detection order — most-specific first, so a panel that prints only the
 * first few rows prints the ones that matter. Capping and layout belong to the
 * panel; this returns every row it could show.
 */
export function suggestStackPacks(
  info: RepoInfo,
  catalog: ReadonlyMap<string, string> = STACK_PACK_CATALOG,
): StackSuggestion[] {
  return classifyDetectedStacks(info).map((stack) => {
    const subject = subjectOf(stack);
    const packId = subject === undefined ? undefined : catalog.get(subject);
    const { name, kind } = stack;
    const tier = stack.support.tier;

    return packId === undefined
      ? { name, kind, tier, action: stack.support.notes }
      : { name, kind, tier, action: `Install the ${packId} pack: stamity add ${packId}`, packId };
  });
}
