export interface SpecialistTrigger {
    specialist: string;
    triggerPaths: readonly string[];
    triggerKeywords: readonly string[];
    rationale: string;
}
export declare const SPECIALIST_TRIGGER_TABLE: readonly SpecialistTrigger[];
export declare function findSpecialistTrigger(specialist: string, table?: readonly SpecialistTrigger[]): SpecialistTrigger | undefined;
export declare function duplicateSpecialistIds(table?: readonly SpecialistTrigger[]): string[];
export declare function specialistsForPath(filePath: string, table?: readonly SpecialistTrigger[]): string[];
