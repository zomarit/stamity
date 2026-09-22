import { type CustomizingOrigin } from "../../content/catalog.ts";
import type { EngineRegistry } from "../../index.ts";
import type { ContentClass } from "../../types/content.ts";
import type { CommandModule } from "../kit/program.ts";
export interface ValidateFinding {
    source: "user-content" | "user-hooks" | "learnings" | "env-mcp" | "workspace";
    path: string;
    severity: "error" | "warning";
    message: string;
}
export type ValidateShadow = ValidateReplaced | ValidatePatched;
interface ValidateReplaced {
    outcome: "replaced";
    type: ContentClass;
    id: string;
    winner: CustomizingOrigin;
    path: string;
    replaced: string[];
    shadowedOverlays?: string[];
    emits: boolean;
}
interface ValidatePatched {
    outcome: "patched";
    type: ContentClass;
    id: string;
    layer: CustomizingOrigin;
    base: string;
    origin: string;
    overlays: string[];
    emits: boolean;
}
export declare function collectValidateFindings(rootDir: string, engine: EngineRegistry): Promise<ValidateFinding[]>;
export declare const validateCommand: CommandModule;
export {};
