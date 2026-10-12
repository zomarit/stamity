export interface AddedLine {
    line: number;
    text: string;
}
export interface ScanHit {
    path: string;
    line: number;
    rule: string;
    commit?: string;
}
export interface ScanFile {
    path: string;
    commit?: string;
    added: readonly AddedLine[];
}
export declare const SCAN_LINE_MAX_CHARS: number;
export declare function linesPastCap(files: readonly ScanFile[]): {
    path: string;
    line: number;
    commit?: string;
}[];
export declare function scanAddedLines(files: readonly ScanFile[]): ScanHit[];
