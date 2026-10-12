export interface ProgramFileProbe {
    isProgramFile(path: string): boolean;
    realPath(path: string): string | null;
}
export interface ProgramSearch {
    readonly platform: NodeJS.Platform;
    readonly path: string | undefined;
    readonly cwd: string;
    readonly probe: ProgramFileProbe;
}
export declare const fileSystemProbe: ProgramFileProbe;
export declare function resolveProgramOnPath(name: string, search: ProgramSearch): string | null;
export declare function searchPathOf(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string | undefined;
export declare function gitProgramFor(cwd: string, env: NodeJS.ProcessEnv): string | null;
export declare function programNotFound(name: string, call: "spawn" | "spawnSync", args: readonly string[]): NodeJS.ErrnoException;
