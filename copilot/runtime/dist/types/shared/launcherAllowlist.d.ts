export declare const ALLOWED_LAUNCHERS: ReadonlySet<string>;
export declare const CODE_EVAL_FLAGS: ReadonlySet<string>;
export type LauncherRefusalCode = "LAUNCHER_NOT_ALLOWED" | "INLINE_CODE_FLAG" | "NO_SCRIPT_ARGUMENT" | "SCRIPT_OUTSIDE_REPO" | "SCRIPT_MISSING";
export type LauncherVerdict = {
    readonly ok: true;
    readonly script: string;
} | {
    readonly ok: false;
    readonly code: LauncherRefusalCode;
    readonly reason: string;
};
export declare function checkLauncherArgv(argv: readonly string[], repoRoot: string): LauncherVerdict;
