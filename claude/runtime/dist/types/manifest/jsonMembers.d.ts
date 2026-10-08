import type { CoOwnership } from "../types/manifest.ts";
export declare const MAX_CO_OWNED_POINTERS = 64;
export declare const MAX_CO_OWNED_ELEMENTS = 256;
export type MemberPointer = string;
export type MemberSegments = readonly [string] | readonly [string, string];
export declare function memberPointer(segments: MemberSegments): MemberPointer;
export declare function parseMemberPointer(pointer: string): MemberSegments;
export declare function canonicalJson(value: unknown): string;
export declare function memberHash(value: unknown): string;
export declare function readMember(doc: Record<string, unknown>, pointer: MemberPointer): unknown;
export declare function memberHashes(doc: Record<string, unknown>, pointers: readonly MemberPointer[]): Record<MemberPointer, string>;
export type MemberProof = "absent" | "proven" | "edited" | "unrecorded";
export declare function proveMember(doc: Record<string, unknown>, pointer: MemberPointer, record: CoOwnership | null): MemberProof;
export declare function removeOwnedMembers(doc: Record<string, unknown>, owned: readonly MemberPointer[], record: CoOwnership | null): {
    doc: Record<string, unknown>;
    removed: MemberPointer[];
    proven: boolean;
};
export interface JsonStyle {
    indent: string;
    eol: "\n" | "\r\n";
    finalNewline: boolean;
    bom?: true;
}
export declare const ENGINE_JSON_STYLE: JsonStyle;
export declare function jsonStyleOf(raw: string): JsonStyle;
export declare function roundTripLoss(raw: string): string | null;
export declare function serialiseJson(value: unknown, style: JsonStyle): string;
