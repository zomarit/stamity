export declare const DEFAULT_CLI_PACKAGE_NAME = "@zomarit/stamity";
export interface CliCallOptions {
    readonly npmChannel?: boolean;
}
export declare function pinnedCliPrefix(packageName: string, version: string, opts?: CliCallOptions): string;
export declare function pinnedCliCall(packageName: string, version: string, verb: string, opts?: CliCallOptions): string;
export declare function cliCallHint(packageName: string, version: string, verb: string, opts?: CliCallOptions): string;
