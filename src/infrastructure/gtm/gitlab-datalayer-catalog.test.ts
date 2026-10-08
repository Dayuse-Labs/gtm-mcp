import { describe, it, expect, afterEach, vi } from 'vitest';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { GitlabDatalayerCatalog, type CatalogFetcher } from './gitlab-datalayer-catalog.js';
import { DATALAYER_FIXTURE } from '../../test-support/datalayer-fixture.js';

const dirs: string[] = [];
function tmp(): string {
  const d = join(tmpdir(), `dl-cat-${randomUUID()}`);
  dirs.push(d);
  return d;
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

function okFetcher(body = DATALAYER_FIXTURE): { fetch: CatalogFetcher; calls: () => number } {
  let n = 0;
  const fetch: CatalogFetcher = () => {
    n += 1;
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(body) });
  };
  return { fetch, calls: () => n };
}

const failFetcher: CatalogFetcher = () =>
  Promise.resolve({ ok: false, status: 403, text: () => Promise.resolve('') });

describe('GitlabDatalayerCatalog', () => {
  it('cold fetch: parses and lists events', async () => {
    const f = okFetcher();
    const c = new GitlabDatalayerCatalog({
      token: 't',
      projectId: '1',
      cacheDir: tmp(),
      fetcher: f.fetch,
    });
    const r = await c.listEvents();
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.events).toContain('purchase');
      expect(r.data.staleWarning).toBeNull();
    }
    expect(f.calls()).toBe(1);
  });

  it('cache hit within TTL: fetcher called once', async () => {
    const f = okFetcher();
    let t = 1000;
    const c = new GitlabDatalayerCatalog({
      token: 't',
      projectId: '1',
      cacheDir: tmp(),
      fetcher: f.fetch,
      now: () => t,
    });
    await c.listEvents();
    t += 60_000; // 1 min < 10 min TTL
    await c.getEvent('purchase', 'compact');
    expect(f.calls()).toBe(1);
  });

  it('refetches after the TTL lapses', async () => {
    const f = okFetcher();
    let t = 1000;
    const c = new GitlabDatalayerCatalog({
      token: 't',
      projectId: '1',
      cacheDir: tmp(),
      fetcher: f.fetch,
      now: () => t,
    });
    await c.listEvents();
    t += 11 * 60_000;
    await c.listEvents();
    expect(f.calls()).toBe(2);
  });

  it('degrades to the disk copy when a fresh instance cannot fetch', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const dir = tmp();
    const good = okFetcher();
    const warm = new GitlabDatalayerCatalog({
      token: 't',
      projectId: '1',
      cacheDir: dir,
      fetcher: good.fetch,
    });
    await warm.listEvents(); // writes disk

    const cold = new GitlabDatalayerCatalog({
      token: 't',
      projectId: '1',
      cacheDir: dir,
      fetcher: failFetcher,
    });
    const r = await cold.getEvent('purchase', 'compact');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toContain('stale catalog');
      expect(r.data).toContain('event: "purchase"');
    }
  });

  it('serves stale memory when a refresh fails after the TTL', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let t = 1000;
    let fail = false;
    let n = 0;
    const fetcher: CatalogFetcher = () => {
      n += 1;
      return fail
        ? Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('') })
        : Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(DATALAYER_FIXTURE),
          });
    };
    const c = new GitlabDatalayerCatalog({
      token: 't',
      projectId: '1',
      cacheDir: tmp(),
      fetcher,
      now: () => t,
    });
    await c.listEvents();
    fail = true;
    t += 11 * 60_000;
    const r = await c.getType('CommercialType');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toContain('stale catalog');
    expect(n).toBe(2);
  });

  it('flags a stale copy on the event index too', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const dir = tmp();
    await new GitlabDatalayerCatalog({
      token: 't',
      projectId: '1',
      cacheDir: dir,
      fetcher: okFetcher().fetch,
    }).listEvents();

    const r = await new GitlabDatalayerCatalog({
      token: 't',
      projectId: '1',
      cacheDir: dir,
      fetcher: failFetcher,
    }).listEvents();
    expect(r.success && r.data.staleWarning).toContain('GitLab responded 403');
  });

  it('errors when no copy exists anywhere', async () => {
    const c = new GitlabDatalayerCatalog({
      token: 't',
      projectId: '1',
      cacheDir: tmp(),
      fetcher: failFetcher,
    });
    const r = await c.listEvents();
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.message).toContain('unavailable');
  });
});
