import type { CommandModule } from "../kit/program.ts";
import { type SetupManifest } from "../../types/manifest.ts";
import type { ResolvedRepoConfig } from "../../workspace/resolve.ts";
declare const PROPAGATED_FIELDS: readonly ["tools", "maturityTier", "mcp"];
type PropagatedField = (typeof PROPAGATED_FIELDS)[number];
export declare function propagationPatch(manifest: SetupManifest, resolved: ResolvedRepoConfig): {
    patch: Partial<SetupManifest>;
    fields: PropagatedField[];
};
export declare const workspaceCommand: CommandModule;
export {};
