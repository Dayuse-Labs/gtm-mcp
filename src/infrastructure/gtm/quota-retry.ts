/** GTM's per-user API quota is a few calls per minute, so backoff spans ~2 minutes in total. */
const DEFAULT_DELAYS_MS = [15_000, 30_000, 60_000] as const;

export interface RetryOptions {
  readonly delaysMs?: readonly number[];
  readonly sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function httpStatus(e: unknown): number | null {
  if (e === null || typeof e !== 'object') return null;
  const o = e as { status?: unknown; code?: unknown; response?: { status?: unknown } };
  for (const v of [o.response?.status, o.status, o.code]) {
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && /^\d{3}$/.test(v)) return Number(v);
  }
  return null;
}

export function isQuotaError(e: unknown): boolean {
  if (httpStatus(e) === 429) return true;
  return e instanceof Error && /quota exceeded|rate limit/i.test(e.message);
}

/** Safe for writes too: GTM rejects a quota-limited request before executing it. */
export async function withQuotaRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const delays = opts.delaysMs ?? DEFAULT_DELAYS_MS;
  const sleep = opts.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (e) {
      const delay = delays[attempt];
      if (delay === undefined || !isQuotaError(e)) throw e;
      await sleep(delay);
    }
  }
}
