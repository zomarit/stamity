import type { CommandModule } from "../kit/program.ts";
export declare const INBOX_SCREEN: readonly {
    readonly id: string;
    readonly re: RegExp;
}[];
export declare const INBOX_BULLET_MAX_CHARS = 4096;
export declare const INBOX_OVER_LENGTH = "over-length";
export declare const INBOX_LISTED_MAX = 50;
export declare const ledgerCommand: CommandModule;
