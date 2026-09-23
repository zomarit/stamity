export interface CompactOptions {
    maxArrayItems?: number;
    maxStringLength?: number;
    maxDepth?: number;
}
export declare function truncateAt(text: string, max: number): string;
export declare function compactOutput<T>(value: T, opts?: CompactOptions): T;
