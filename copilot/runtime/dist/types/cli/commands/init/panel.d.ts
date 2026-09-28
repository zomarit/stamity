import type { StackSuggestion } from "../../../detect/stackSupport.ts";
import type { CarryReport } from "../../../migration/carry.ts";
import type { Tool } from "../../../types/core.ts";
import type { Palette } from "../../kit/terminal.ts";
import type { InitApplyReport } from "./apply.ts";
import type { InitDecisions } from "./plan.ts";
export interface InitPanelInput {
    decisions: InitDecisions;
    report: InitApplyReport;
    carry: CarryReport | null;
    mcpServers: readonly string[];
    palette: Palette;
    stackSuggestions?: readonly StackSuggestion[];
    residue?: MigrationResidue;
    gitAvailable?: boolean;
    predecessorDetected?: boolean;
}
export interface MigrationResidue {
    paths: readonly string[];
    unownedSettingsPath?: string;
}
export declare const MAX_STACK_SUGGESTION_ROWS = 3;
export declare function nextStepsForTool(tool: Tool): string[];
export declare function emissionSummary(report: InitApplyReport, dryRun?: boolean): string;
export declare function migrationLines(carry: CarryReport, residue?: MigrationResidue): string[];
export declare function gitignoreLine(dryRun: boolean, gitAvailable?: boolean): string;
export declare function renderInitPanel(input: InitPanelInput): string;
