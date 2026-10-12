import type { CommandModule } from "../kit/program.ts";
export interface LearningDraft {
    fileName: string;
    frontmatter: Record<string, unknown>;
    body: string;
}
export interface LearningDraftInput {
    title: string;
    summary: string;
    confidence: string;
    date: string;
    body: string;
}
export declare function draftLearning(input: LearningDraftInput): LearningDraft;
export declare const learnCommand: CommandModule;
