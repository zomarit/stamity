export interface TomlSegment {
    key: readonly string[] | null;
    arrayTable: boolean;
    text: string;
}
export interface TomlKeyLine {
    table: readonly string[];
    key: readonly string[];
    line: number;
}
export type TomlSegmentation = {
    ok: true;
    segments: TomlSegment[];
    keys: TomlKeyLine[];
} | {
    ok: false;
    line: number;
    reason: string;
};
export declare function segmentTomlTables(raw: string): TomlSegmentation;
export declare function tomlTableName(key: readonly string[]): string;
export declare function normaliseSegment(text: string): string;
