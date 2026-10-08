export declare function isPlainObject(value: unknown): value is Record<string, unknown>;
export declare function parseJsonStrict(raw: string, source: string): unknown;
export declare function parseYamlStrict(raw: string, source: string): unknown;
export interface RequireFieldOptions {
    source: string;
    optional?: boolean;
}
export declare function requireString(obj: Record<string, unknown>, field: string, opts: RequireFieldOptions): string | undefined;
export declare function requireBoolean(obj: Record<string, unknown>, field: string, opts: RequireFieldOptions): boolean | undefined;
export declare function requireStringArray(obj: Record<string, unknown>, field: string, opts: RequireFieldOptions): string[] | undefined;
export declare function requireEnum<T extends string>(obj: Record<string, unknown>, field: string, allowed: readonly T[], opts: RequireFieldOptions): T | undefined;
export declare function unknownFields(obj: Record<string, unknown>, known: readonly string[]): string[];
export declare function rejectUnknownFields(obj: Record<string, unknown>, known: readonly string[], source: string): void;
export declare function readEnvInt(name: string, env?: Readonly<Record<string, string | undefined>>): number | undefined;
export declare function readEnvBool(name: string, env?: Readonly<Record<string, string | undefined>>): boolean | undefined;
