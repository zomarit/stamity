import { type SetupManifest } from "../../../types/manifest.ts";
import type { Palette } from "../../kit/terminal.ts";
import type { SyncApplyReport, SyncPlan } from "./engine.ts";
export interface ProvenanceRollup {
    generatedBy: string;
    updatedAt: string;
    manifestVersion: string;
    perAdapter: {
        adapter: string;
        files: number;
        stampedVersion: string | null;
    }[];
    packs: {
        packId: string;
        files: number;
    }[];
}
export declare function provenanceFromManifest(manifest: SetupManifest): ProvenanceRollup;
export declare function renderSyncReport(plan: SyncPlan, report: SyncApplyReport, palette: Palette): string;
export declare function syncJsonPayload(plan: SyncPlan, report: SyncApplyReport): Record<string, unknown>;
