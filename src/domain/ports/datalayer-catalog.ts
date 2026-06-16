import { type Result } from '../../shared/result.js';

/**
 * The authoritative, upstream-generated dataLayer event catalog (ADR 0008).
 *
 * Read-only. The implementation (infrastructure) fetches + caches the generated
 * `datalayer-events.ts` from GitLab, so these methods are async. Responses are
 * compacted to stay token-cheap — fat string-literal unions are collapsed and
 * referenced types stay as bare names unless `mode: 'full'` is requested.
 */
export type CatalogMode = 'compact' | 'full';

export interface DatalayerCatalog {
  /** Cheap index: every event name. */
  listEvents(): Promise<Result<readonly string[]>>;
  /** One event's shape, compacted. `full` expands referenced named types one level. */
  getEvent(name: string, mode: CatalogMode): Promise<Result<string>>;
  /** One helper type's body, compacted. */
  getType(name: string): Promise<Result<string>>;
}
