import { type McpServerMeta } from "../mcp/catalog.ts";
import { type Tool } from "../types/core.ts";
import { type PackPermissions } from "./permissions.ts";
export { assertSafePackRelPath } from "./permissions.ts";
export declare const PACK_MANIFEST_FILE = "pack.json";
export declare const BANNED_LIFECYCLE_SCRIPTS: readonly string[];
export declare const PACK_CONTENT_CLASSES: readonly ["agents", "skills", "rules", "commands", "hooks", "mcp_servers"];
export type PackContentClass = (typeof PACK_CONTENT_CLASSES)[number];
export declare const DEFAULT_MAX_FOOTPRINT_BYTES: number;
export declare const MAX_PACK_FILE_COUNT = 500;
export declare const SIGSTORE_SIGNING_METHOD = "sigstore";
export declare const SIGNER_GRAMMAR: string;
export interface SignerPin {
    issuer: string;
    identity: string;
}
export declare function parseSignerPin(signer: string): SignerPin | null;
export interface PackSigning {
    method: string;
    signer?: string;
    bundlePath?: string;
}
export interface PackManifest {
    name: string;
    version: string;
    description?: string;
    signing?: PackSigning;
    integrity: Record<string, string>;
    declaredTools?: Tool[];
    permissions?: PackPermissions;
    maxFootprintBytes?: number;
}
export declare const PACK_SOURCE_KINDS: readonly ["local-path", "npm-package", "catalog-pinned"];
export type PackSourceKind = (typeof PACK_SOURCE_KINDS)[number];
export interface ResolvedPackSource {
    kind: PackSourceKind;
    packRoot: string;
    sourceName?: string;
}
export interface PackContentFile {
    relPath: string;
    contentClass: PackContentClass;
    absPath: string;
    sizeBytes: number;
}
export declare function resolvePackSource(projectRoot: string, spec: string): Promise<ResolvedPackSource>;
export declare function packNameMatchesSource(declaredName: string, sourceName: string): boolean;
export declare function validatePackManifest(raw: unknown): PackManifest;
export declare function readPackManifest(packRoot: string): Promise<PackManifest>;
export interface PackMcpEnvRequirement {
    readonly name: string;
    readonly description: string;
}
export interface PackMcpServerDefinition extends Readonly<Omit<McpServerMeta, "firstParty" | "requiresEnv">> {
    readonly requiresEnv?: readonly PackMcpEnvRequirement[];
}
export interface PackMcpServerFile {
    readonly relPath: string;
    readonly definition: PackMcpServerDefinition;
}
export declare function validatePackMcpServer(raw: unknown, relPath: string): PackMcpServerDefinition;
export declare function assertUniquePackServerIds(files: readonly PackMcpServerFile[]): void;
export declare function checkMcpServerDefinitions(manifest: PackManifest, files: readonly PackContentFile[]): Promise<"pass" | "n/a">;
export declare function verifySigningDeclaration(manifest: PackManifest, allowUntrusted: boolean): "pass" | "n/a";
export declare function checkLifecycleScripts(packRoot: string): Promise<"pass" | "n/a">;
export declare function enumeratePackContent(packRoot: string): Promise<PackContentFile[]>;
export declare function verifyIntegrityMap(packRoot: string, manifest: PackManifest, files: readonly PackContentFile[]): Promise<"pass">;
export declare function scanPackBodies(files: readonly PackContentFile[]): Promise<"pass">;
export declare function checkFootprint(manifest: PackManifest, files: readonly PackContentFile[]): "pass";
export declare function checkRuleActivation(manifest: PackManifest, files: readonly PackContentFile[]): Promise<"pass" | "n/a">;
export declare function checkDeclaredTools(manifest: PackManifest, files: readonly PackContentFile[]): Promise<"pass">;
