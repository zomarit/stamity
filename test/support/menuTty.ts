import { PassThrough } from "node:stream";

/**
 * The raw-mode menu double: a stdin the prompt kit's capability probe accepts,
 * and the bytes a terminal sends into it.
 *
 * Substitute, and the reason is the device: `src/cli/kit/prompts.ts` draws its
 * arrow menu only where stdin is a TTY that can be switched out of line mode,
 * and a vitest worker has no terminal on either stream. Nothing else is faked —
 * the frames, the keypress decoding and the toggle bookkeeping are the shipped
 * kit, driven by the real escape bytes below.
 *
 * One home rather than one copy per suite: this double is the entry condition
 * for the kit's whole raw path, so `test/cli/prompts.test.ts`,
 * `test/cli/commands/init.test.ts` and `test/cli/commands/config.test.ts` all
 * need the same three facts about it (`isTTY`, a callable `setRawMode`, a
 * writable body) and a divergence between copies would be a difference in what
 * the probe was tested against.
 */

/**
 * A PassThrough that claims `isTTY` and records every `setRawMode` call.
 *
 * `{ rawMode: false }` drops `setRawMode` entirely, reproducing the OTHER shape
 * the probe has to tell apart: an interactive TTY session whose stdin cannot be
 * switched — a socket, a plain PassThrough, a test double — which must take the
 * typed numbered path instead.
 */
export class MenuTtyInput extends PassThrough {
  isTTY = true;
  readonly rawModes: boolean[] = [];
  setRawMode?: (mode: boolean) => this;

  constructor(opts: { rawMode?: boolean } = {}) {
    super();
    if (opts.rawMode !== false) {
      this.setRawMode = (mode: boolean): this => {
        this.rawModes.push(mode);
        return this;
      };
    }
  }
}

/**
 * Every byte the menu speaks, built from char codes so no literal control
 * character sits in a test source — a stray ESC is invisible in a diff and
 * unsearchable in a review.
 */
const ESC = String.fromCharCode(27);

export const MENU_KEYS = {
  up: `${ESC}[A`,
  down: `${ESC}[B`,
  space: " ",
  enter: String.fromCharCode(13), // CR: what a terminal sends for Enter in raw mode
  ctrlC: String.fromCharCode(3),
} as const;

/**
 * Waits for a marker to appear in the transcript, then lets the caller press
 * the next key.
 *
 * Keys cannot simply be written up front: a menu that has not drawn yet has no
 * keypress listener attached, and bytes decoded with no listener are dropped —
 * the first press of the interaction is the one that would vanish.
 */
export async function waitForOutput(
  read: () => string,
  marker: string,
  what: string,
): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (read().includes(marker)) return;
    // oxlint-disable-next-line no-await-in-loop -- polling is sequential by definition
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error(`timed out waiting for ${what} (marker: ${JSON.stringify(marker)})`);
}
