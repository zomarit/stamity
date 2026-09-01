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

/**
 * One macrotask turn — the harness's synchronization unit for everything
 * below, and for `runMenu`'s own drains (`src/cli/kit/prompts.ts::drainNow`,
 * which resumes, waits exactly one `setImmediate` tick, then discards and
 * pauses again).
 *
 * THE CONTRACT this file's callers all lean on: a menu's real first keystroke
 * has to arrive at least one event-loop turn after the call that starts the
 * menu, never in the same synchronous turn. `runMenu` drains whatever the
 * stream is holding on entry precisely because a real terminal can be holding
 * a stray leftover byte from BEFORE the menu started reading — and that drain
 * runs by resuming the stream, which (for the same reason) also consumes and
 * discards anything written in that same window. No human keystroke can ever
 * land inside one tick of a function call returning; only a synthetic write
 * issued in the same synchronous turn can, which is why every caller here
 * awaits a `tick()` (or `press`, which already ends on one) before writing a
 * menu's FIRST key.
 */
export const tick = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

/**
 * Drives keys into a {@link MenuTtyInput}. All writes land first and one turn
 * of the loop delivers them: the keypress decoder is fed per byte, so a burst
 * decodes in order — verified against `node:readline` before this harness was
 * written.
 *
 * Ends on {@link tick} for the reason `tick`'s own doc states: it is both "let
 * the decoder process what was just written" AND, for whichever call happens
 * to be a menu's first press, the synchronization point the entry drain needs
 * to have already cleared before a real keystroke can be trusted to land.
 */
export async function press(input: MenuTtyInput, ...keys: readonly string[]): Promise<void> {
  for (const key of keys) input.write(key);
  await tick();
}
