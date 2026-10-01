export type TomlValue = string | number | boolean;
interface TomlTable {
    readonly header: string | null;
    readonly entries: readonly (readonly [string, TomlValue])[];
}
export interface TomlDocument {
    readonly comments?: readonly string[];
    readonly tables: readonly TomlTable[];
}
export declare function serializeTomlDocument(doc: TomlDocument): string;
export declare function tomlBasicString(value: string): string;
export declare function tomlMultilineBasicString(value: string): string;
export {};
