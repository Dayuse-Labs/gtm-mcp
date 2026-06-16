import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type CatalogMode, type DatalayerCatalog } from '../../domain/ports/datalayer-catalog.js';
import {
  parseCatalog,
  listEvents,
  getEvent,
  getType,
  type ParsedCatalog,
} from '../../domain/services/datalayer-catalog.js';
import { type Result, ok, err } from '../../shared/result.js';

/** Minimal shape of a fetch response — lets tests inject without a real `fetch`. */
export interface CatalogFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}
export type CatalogFetcher = (
  url: string,
  headers: Record<string, string>,
) => Promise<CatalogFetchResponse>;

const API_BASE = 'https://gitlab.com/api/v4';
const REF = 'develop';
const PATH = 'generated/datalayer-events.ts';
const CACHE_TTL_MINUTES = 10;

export interface GitlabCatalogConfig {
  readonly token: string;
  readonly projectId: string;
  /** Disk fallback location (default `.cache/datalayer`). */
  readonly cacheDir?: string;
  readonly ttlMinutes?: number;
  /** Epoch-ms clock, injectable for TTL tests (default `Date.now`). */
  readonly now?: () => number;
  /** Injectable fetcher (default wraps global `fetch`). */
  readonly fetcher?: CatalogFetcher;
}

interface CacheState {
  readonly parsed: ParsedCatalog;
  readonly raw: string;
  readonly fetchedAt: number;
  /** True when served despite a failed refresh (memory or disk). */
  readonly stale: boolean;
  readonly reason?: string;
}

const defaultFetcher: CatalogFetcher = async (url, headers) => {
  const res = await fetch(url, { headers });
  return { ok: res.ok, status: res.status, text: () => res.text() };
};

/**
 * Fetches the generated dataLayer catalog from GitLab (ADR 0008), caches it in
 * memory with a TTL plus a disk fallback, and serves compacted slices via the
 * pure parsing service. A disposable derived read-cache — never the source of
 * truth (cf. the Mirror, ADR 0001). Degrades gracefully: on a failed refresh it
 * serves the last-good copy with a staleness marker rather than blocking work.
 */
export class GitlabDatalayerCatalog implements DatalayerCatalog {
  private readonly token: string;
  private readonly projectId: string;
  private readonly cacheDir: string;
  private readonly catalogPath: string;
  private readonly metaPath: string;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly fetcher: CatalogFetcher;

  private state: CacheState | null = null;
  private warned = false;

  constructor(cfg: GitlabCatalogConfig) {
    this.token = cfg.token;
    this.projectId = cfg.projectId;
    this.cacheDir = cfg.cacheDir ?? '.cache/datalayer';
    this.catalogPath = join(this.cacheDir, 'catalog.ts');
    this.metaPath = join(this.cacheDir, 'meta.json');
    this.ttlMs = (cfg.ttlMinutes ?? CACHE_TTL_MINUTES) * 60_000;
    this.now = cfg.now ?? ((): number => Date.now());
    this.fetcher = cfg.fetcher ?? defaultFetcher;
  }

  async listEvents(): Promise<Result<readonly string[]>> {
    const r = await this.ensureFresh();
    if (!r.success) return r;
    return ok(listEvents(r.data.parsed));
  }

  async getEvent(name: string, mode: CatalogMode): Promise<Result<string>> {
    const r = await this.ensureFresh();
    if (!r.success) return r;
    const slice = getEvent(r.data.parsed, name, mode);
    if (!slice.success) return slice;
    return ok(this.stalePrefix(r.data) + slice.data);
  }

  async getType(name: string): Promise<Result<string>> {
    const r = await this.ensureFresh();
    if (!r.success) return r;
    const slice = getType(r.data.parsed, name);
    if (!slice.success) return slice;
    return ok(this.stalePrefix(r.data) + slice.data);
  }

  private async ensureFresh(): Promise<Result<CacheState>> {
    const mem = this.state;
    const fresh = mem !== null && !mem.stale && this.now() - mem.fetchedAt < this.ttlMs;
    if (fresh) return ok(mem);

    const url = `${API_BASE}/projects/${encodeURIComponent(this.projectId)}/repository/files/${encodeURIComponent(PATH)}/raw?ref=${REF}`;
    try {
      const res = await this.fetcher(url, { 'PRIVATE-TOKEN': this.token });
      if (!res.ok) throw new Error(`GitLab responded ${res.status}`);
      const raw = await res.text();
      const fetchedAt = this.now();
      const state: CacheState = { parsed: parseCatalog(raw), raw, fetchedAt, stale: false };
      this.state = state;
      this.warned = false;
      await this.writeDisk(raw, fetchedAt);
      return ok(state);
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'unknown error';
      if (mem !== null) {
        const stale: CacheState = { ...mem, stale: true, reason };
        this.state = stale;
        this.warnOnce(reason);
        return ok(stale);
      }
      const disk = await this.readDisk();
      if (disk !== null) {
        const stale: CacheState = {
          parsed: parseCatalog(disk.raw),
          raw: disk.raw,
          fetchedAt: disk.fetchedAt,
          stale: true,
          reason,
        };
        this.state = stale;
        this.warnOnce(reason);
        return ok(stale);
      }
      return err(
        new Error(`dataLayer catalog unavailable (refresh failed: ${reason}; no cached copy).`),
      );
    }
  }

  private stalePrefix(s: CacheState): string {
    if (!s.stale) return '';
    const iso = new Date(s.fetchedAt).toISOString();
    return `// ⚠ stale catalog (fetched ${iso}; refresh failed: ${s.reason ?? 'unknown'})\n`;
  }

  private warnOnce(reason: string): void {
    if (this.warned) return;
    this.warned = true;
    console.warn(`[datalayer-catalog] serving stale catalog: ${reason}`);
  }

  private async writeDisk(raw: string, fetchedAt: number): Promise<void> {
    try {
      await mkdir(this.cacheDir, { recursive: true });
      await writeFile(this.catalogPath, raw, 'utf8');
      await writeFile(this.metaPath, JSON.stringify({ fetchedAt }), 'utf8');
    } catch {
      // best-effort cache; a failed write must not break a successful fetch.
    }
  }

  private async readDisk(): Promise<{ raw: string; fetchedAt: number } | null> {
    let raw: string;
    try {
      raw = await readFile(this.catalogPath, 'utf8');
    } catch {
      return null;
    }
    let fetchedAt = 0;
    try {
      const meta: unknown = JSON.parse(await readFile(this.metaPath, 'utf8'));
      if (typeof meta === 'object' && meta !== null && 'fetchedAt' in meta) {
        const fa = meta.fetchedAt;
        if (typeof fa === 'number') fetchedAt = fa;
      }
    } catch {
      // no/invalid meta → treat as epoch 0 (still serves, marked stale).
    }
    return { raw, fetchedAt };
  }
}
