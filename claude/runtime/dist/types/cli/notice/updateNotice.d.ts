export { resolveOwnPackageFacts } from "../kit/packageName.ts";
export declare const DEFAULT_NOTICE_TTL_MS: number;
export declare const DEFAULT_NOTICE_TIMEOUT_MS: number;
export declare const DEFAULT_REGISTRY_BASE_URL: string;
export interface UpdateNoticeOptions {
    packageName: string;
    currentVersion: string;
    isPrivate: boolean;
    env: Readonly<Record<string, string | undefined>>;
    cacheDir: string;
    registryBaseUrl?: string;
    fetchImpl?: typeof fetch;
    ttlMs?: number;
    timeoutMs?: number;
    now?: () => Date;
}
export declare function checkForUpdateNotice(opts: UpdateNoticeOptions): Promise<string | null>;
export declare function noticeCacheDir(env: Readonly<Record<string, string | undefined>>, homeDir: string): string;
