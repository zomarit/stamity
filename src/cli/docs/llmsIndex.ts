/**
 * `llms.txt` — the agent-native index of every readable page in this
 * repository.
 *
 * The problem it solves: an agent dropped into an unfamiliar repository has
 * to guess which files are worth reading, and guessing costs a directory walk
 * and a lot of context. An index at a conventional path answers that in one
 * read — what this repository is, and which page answers which question.
 *
 * **The index is the page registry, not a second copy of it.** The generated
 * reference pages come from {@link REFERENCE_PAGES} and the two path
 * constants their renderers export, so a page cannot be generated without
 * being listed here, or listed here without something generating it. Only the
 * hand-written pages — the five root pages (README, CONTRIBUTING, SECURITY,
 * GOVERNANCE, CODE_OF_CONDUCT) and the eight guides under `docs/` — and the
 * charter are named literally, because nothing generates them to be read from.
 * The guides are held to the same dated hand-page contract as three of those
 * root pages — README, SECURITY, CONTRIBUTING — by `test/docsPages.test.ts`,
 * which is what keeps a literal entry here from pointing at a page nobody can
 * date. GOVERNANCE and CODE_OF_CONDUCT are literal entries the suite does not
 * gate: `test/docsPages.test.ts:73-90` owns the reason each is excluded from
 * `PAGES`.
 *
 * **Repo-relative, always.** Every target is a path inside this tree. No
 * absolute link is admissible and the renderer refuses one: this index is
 * rendered from the tree and read inside it, and the published site mirrors
 * the same paths, so a repo-relative target resolves in both places while an
 * absolute one pins a reader to whichever copy its host happens to serve.
 *
 * **Structural `.md` variants come for free.** The llms.txt convention asks
 * for a markdown variant of every listed page; here every page already IS
 * markdown, so the listed path is the variant and no second rendering exists
 * to fall out of date.
 *
 * **One command per page, named on the page's own entry.** This index used to
 * carry a single regeneration command in its opening paragraph and promise it
 * for everything under the generated headings — but two generators write those
 * pages, they export a `REGENERATE_COMMAND` each, and the one interpolated here
 * was the docs one. A reader following it for the capability matrix ran a
 * script that does not write that file and saw no diff, which reads as "already
 * current". The command is per entry now, and an entry nothing generates
 * carries `null` rather than borrowing a neighbour's.
 *
 * Pure and clock-free: two runs are byte-identical until a page is added or
 * renamed.
 */

import { CHARTER_RELATIVE_PATH } from "../../content/charter.ts";
import { EngineError } from "../../types/errors.ts";
import { CLI_REFERENCE_DOC_PATH } from "./cliReference.ts";
import { CONFIG_REFERENCE_DOC_PATH } from "./configReference.ts";
import {
  CAPABILITY_MATRIX_DOC_PATH,
  REGENERATE_COMMAND as CAPABILITY_MATRIX_REGENERATE_COMMAND,
} from "../../emit/capabilityMatrix.ts";
import {
  REFERENCE_PAGES,
  REGENERATE_COMMAND as DOCS_REGENERATE_COMMAND,
} from "./referencePages.ts";

/** Repo-relative path of the committed index this module renders. */
export const LLMS_INDEX_DOC_PATH = "llms.txt";

/**
 * The corpus directory as it sits in a checkout — the first candidate
 * `src/content/contentRoot.ts` probes. Named here rather than resolved
 * because this index publishes repo-relative paths, and the resolver returns
 * an absolute one.
 */
const CORPUS_DIR = "content";

/** One listed page: where it is, what to call it, and why a reader would open it. */
interface IndexEntry {
  /** Repo-relative path. */
  readonly path: string;
  /** Link text. */
  readonly title: string;
  /** One line stating what this page answers. */
  readonly description: string;
  /**
   * The exact command that rewrites this page, or `null` when nothing
   * generates it. Not optional: a hand-written page has to SAY so, and an
   * omitted field would read as an author who forgot rather than a page with
   * no generator.
   */
  readonly regenerateCommand: string | null;
}

/** A named group of entries; sections are the index's only structure. */
export interface IndexSection {
  readonly heading: string;
  readonly entries: readonly IndexEntry[];
}

/** Anything that looks like a scheme-qualified link — refused on sight. */
const ABSOLUTE_TARGET = /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i;

function fail(message: string): never {
  throw new EngineError(message, { code: "VALIDATION_ERROR" });
}

/**
 * The index's own sections, in reading order: what the repository is, then
 * the generated reference, then the corpus the generators project.
 */
export const LLMS_INDEX_SECTIONS: readonly IndexSection[] = [
  {
    heading: "Start here",
    entries: [
      {
        path: "README.md",
        title: "README",
        description:
          "what this repository is, the command surface, where each subject lives, and the local loop.",
        regenerateCommand: null,
      },
      {
        path: "CONTRIBUTING.md",
        title: "Contributing",
        description:
          "the development loop, the three test lanes, and the regeneration command for every derived file.",
        regenerateCommand: null,
      },
      {
        path: "SECURITY.md",
        title: "Security",
        description: "what the engine defends today, how, and what it explicitly does not defend.",
        regenerateCommand: null,
      },
      {
        path: "GOVERNANCE.md",
        title: "Governance",
        description:
          "who decides, the two required checks a change passes to land, and what the private layer holds.",
        regenerateCommand: null,
      },
      {
        path: "CODE_OF_CONDUCT.md",
        title: "Code of conduct",
        description:
          "the behaviour expected here, the two channels a report goes through, and the enforcement ladder.",
        regenerateCommand: null,
      },
    ],
  },
  {
    heading: "Guides",
    entries: [
      {
        path: "docs/getting-started.md",
        title: "Getting started",
        description:
          "prerequisites, what init asks and writes per client, the guided first change, and where state lives.",
        regenerateCommand: null,
      },
      {
        path: "docs/doctrine.md",
        title: "Doctrine",
        description:
          "the root question every artifact answers, the four pillars and their public enforcement surfaces, and how an artifact is deleted.",
        regenerateCommand: null,
      },
      {
        path: "docs/migration.md",
        title: "Migration",
        description:
          "moving a repository off the predecessor setup — the guided path, the manual path, and what does not transfer.",
        regenerateCommand: null,
      },
      {
        path: "docs/working-with-stamity.md",
        title: "Working with stamity",
        description:
          "the nine touchpoints as one workflow — which one to open, what each writes, and how to run two changes at once.",
        regenerateCommand: null,
      },
      {
        path: "docs/customization.md",
        title: "Customization",
        description:
          "where an override lives per class, the two authoring paths and the one save gate, shadowing, and what a skill override carries.",
        regenerateCommand: null,
      },
      {
        path: "docs/workspaces.md",
        title: "Workspaces",
        description:
          "one policy across several repositories — the manifest, the init offer, the status rows, and the cascade.",
        regenerateCommand: null,
      },
      {
        path: "docs/packs-and-trust.md",
        title: "Packs and trust",
        description:
          "what a pack is, the four-rung trust ladder, what a verified signature does and does not prove, the org policy, and how to remove one.",
        regenerateCommand: null,
      },
      {
        path: "docs/troubleshooting.md",
        title: "Troubleshooting",
        description:
          "the exit model, every doctor row and its remedy, the common failures, and where to report one.",
        regenerateCommand: null,
      },
    ],
  },
  {
    heading: "Generated reference",
    entries: [
      {
        path: CLI_REFERENCE_DOC_PATH,
        title: "CLI reference",
        description:
          "every command, argument, flag and exit status, rendered from the program itself.",
        regenerateCommand: DOCS_REGENERATE_COMMAND,
      },
      {
        path: CONFIG_REFERENCE_DOC_PATH,
        title: "Configuration reference",
        description:
          "every addressable config key, what it accepts, and what binds when it is unset.",
        regenerateCommand: DOCS_REGENERATE_COMMAND,
      },
      {
        path: CAPABILITY_MATRIX_DOC_PATH,
        title: "Client capability matrix",
        description:
          "what each supported client can do, rendered from the adapters' declared dialect facts.",
        // The entry the single-command promise got wrong: this page has its own
        // generator, and the docs script leaves it untouched.
        regenerateCommand: CAPABILITY_MATRIX_REGENERATE_COMMAND,
      },
    ],
  },
  {
    heading: "Content corpus",
    entries: [
      ...REFERENCE_PAGES.map((page) => ({
        path: page.path,
        title: page.title,
        description: page.blurb,
        regenerateCommand: DOCS_REGENERATE_COMMAND,
      })),
      {
        path: `${CORPUS_DIR}/${CHARTER_RELATIVE_PATH}`,
        title: "Charter",
        description:
          "the always-on context every generated setup carries: repo facts, floor invariants, touchpoint index.",
        // Corpus source, not a render: `sync` PROJECTS this file into a repo's
        // clients, and nothing rewrites the file itself.
        regenerateCommand: null,
      },
    ],
  },
];

/**
 * Render the index from explicit sections. Deterministic: sections and
 * entries keep their declared order, which is the order a reader should take
 * them in.
 *
 * Throws `EngineError` (`VALIDATION_ERROR`) on an empty section, an entry
 * with no title or description, a duplicate path, a target that is not
 * repo-relative, or a blank regeneration command (`null` is how an entry says
 * nothing generates it; `""` is an author who meant to name one).
 */
export function renderLlmsIndexFrom(sections: readonly IndexSection[]): string {
  if (sections.length === 0) fail(`${LLMS_INDEX_DOC_PATH} would list nothing.`);

  const seen = new Set<string>();
  for (const section of sections) {
    if (section.entries.length === 0) {
      fail(
        `The "${section.heading}" section of ${LLMS_INDEX_DOC_PATH} lists no page, so it would ` +
          `render as a heading over nothing.`,
      );
    }
    for (const entry of section.entries) {
      if (entry.path.trim() === "") fail(`An index entry under "${section.heading}" has no path.`);
      if (ABSOLUTE_TARGET.test(entry.path)) {
        fail(
          `Index entry "${entry.path}" is not repo-relative. Every ${LLMS_INDEX_DOC_PATH} target ` +
            `is a path inside this tree, and the published site mirrors those same paths — a link ` +
            `out of the tree resolves in only one of the two places.`,
        );
      }
      if (entry.title.trim() === "" || entry.description.trim() === "") {
        fail(
          `Index entry "${entry.path}" has no ${entry.title.trim() === "" ? "title" : "description"}, ` +
            `so a reader could not tell whether the page answers their question without opening it.`,
        );
      }
      if (entry.regenerateCommand !== null && entry.regenerateCommand.trim() === "") {
        fail(
          `Index entry "${entry.path}" declares a blank regeneration command. A page nothing ` +
            `generates declares null; a blank string names a command a reader cannot run.`,
        );
      }
      if (seen.has(entry.path)) {
        fail(`${LLMS_INDEX_DOC_PATH} lists "${entry.path}" twice.`);
      }
      seen.add(entry.path);
    }
  }

  const lines = [
    "# stamity",
    "",
    "> An ESM-only TypeScript CLI that generates agentic coding setups — a charter, commands,",
    "> agents, skills, rules, hooks and MCP wiring — for four AI coding clients from one",
    "> canonical source model.",
    "",
    "Every path below is relative to the repository root, and every page is markdown. A page",
    "rendered from code names the command that rewrites it — there is more than one generator",
    "here — and the test suite byte-compares each against a fresh render, so a page that lags",
    "its generator fails a check instead of reading as current. An entry naming no command is",
    "hand-written or corpus source. Nothing here links outside this tree.",
    "",
    ...sections.flatMap((section) => [
      `## ${section.heading}`,
      "",
      ...section.entries.map((entry) => {
        const line = `- [${entry.title}](${entry.path}): ${entry.description}`;
        return entry.regenerateCommand === null
          ? line
          : `${line} Regenerate with \`${entry.regenerateCommand}\`.`;
      }),
      "",
    ]),
  ];

  // The trailing section already left a blank line; drop it so the file ends
  // with exactly one newline like every other generated page.
  return `${lines.slice(0, -1).join("\n")}\n`;
}

/** The shipped index: {@link renderLlmsIndexFrom} over the live sections. */
export function renderLlmsIndex(): string {
  return renderLlmsIndexFrom(LLMS_INDEX_SECTIONS);
}
