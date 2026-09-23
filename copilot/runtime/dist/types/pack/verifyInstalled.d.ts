import { type SetupManifest } from "../types/manifest.ts";
export interface PackIntegrityFinding {
    packId: string;
    relPath: string;
    expected: string;
    actual: string | null;
}
export interface PackIntegrityReport {
    checked: number;
    findings: PackIntegrityFinding[];
}
export declare function verifyInstalledPacks(rootDir: string, manifest: SetupManifest): Promise<PackIntegrityReport>;
export declare function describePackIntegrityFinding(finding: PackIntegrityFinding): string;
