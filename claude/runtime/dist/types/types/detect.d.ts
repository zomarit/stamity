export type Framework = "next" | "angular" | "vue" | "svelte" | "sveltekit" | "remix" | "astro" | "nuxt" | "react" | "express" | "fastify" | "hono" | "nestjs" | "django" | "flask" | "rails" | "spring" | "laravel" | "tanstack-start" | "solid-start" | "qwik" | "fastapi" | "phoenix" | "axum" | "actix";
export interface PackageEntry {
    name: string;
    path: string;
}
export interface RepoInfo {
    rootDir: string;
    languages: string[];
    frameworks: Framework[];
    linters: string[];
    testFrameworks: string[];
    ciProviders: string[];
    packageManager?: string;
    packageScripts?: string[];
    monorepoPackages: PackageEntry[];
    hasDockerfile: boolean;
    hasDataArtifacts: boolean;
    hasExistingAgents: boolean;
    existingTools: string[];
}
export interface DetectedSummary {
    languages: string[];
    linters: string[];
    testFrameworks: string[];
    ciProviders: string[];
    packageManager?: string;
    packageScripts?: string[];
}
