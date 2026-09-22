import { type ReclaimCandidate } from "../../manifest/ledger.ts";
import { type SetupManifest } from "../../types/manifest.ts";
import type { CommandModule } from "../kit/program.ts";
export declare function planCleanCandidates(manifest: SetupManifest): ReclaimCandidate[];
export declare const cleanCommand: CommandModule;
