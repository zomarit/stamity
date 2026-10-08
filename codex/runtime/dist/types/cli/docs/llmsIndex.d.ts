export declare const LLMS_INDEX_DOC_PATH = "llms.txt";
interface IndexEntry {
    readonly path: string;
    readonly title: string;
    readonly description: string;
    readonly regenerateCommand: string | null;
}
export interface IndexSection {
    readonly heading: string;
    readonly entries: readonly IndexEntry[];
}
export declare const LLMS_INDEX_SECTIONS: readonly IndexSection[];
export declare function renderLlmsIndexFrom(sections: readonly IndexSection[]): string;
export declare function renderLlmsIndex(): string;
export {};
