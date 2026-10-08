import { describe, it, expect } from 'vitest';
import { withQuotaRetry, isQuotaError, httpStatus } from './quota-retry.js';

const noSleep = (): Promise<void> => Promise.resolve();
const quotaError = (): Error =>
  Object.assign(new Error('Quota exceeded for quota metric'), { code: 429 });

describe('withQuotaRetry', () => {
  it('retries a quota error and returns the eventual success', async () => {
    let calls = 0;
    const r = await withQuotaRetry(
      () => {
        calls += 1;
        return calls < 3 ? Promise.reject(quotaError()) : Promise.resolve('ok');
      },
      { delaysMs: [1, 1, 1], sleep: noSleep },
    );
    expect(r).toBe('ok');
    expect(calls).toBe(3);
  });

  it('gives up after the last delay and rethrows', async () => {
    await expect(
      withQuotaRetry(() => Promise.reject(quotaError()), { delaysMs: [1], sleep: noSleep }),
    ).rejects.toThrow('Quota exceeded');
  });

  it('does not retry other errors', async () => {
    let calls = 0;
    await expect(
      withQuotaRetry(
        () => {
          calls += 1;
          return Promise.reject(Object.assign(new Error('Insufficient Permission'), { code: 403 }));
        },
        { delaysMs: [1, 1], sleep: noSleep },
      ),
    ).rejects.toThrow('Insufficient Permission');
    expect(calls).toBe(1);
  });
});

describe('isQuotaError / httpStatus', () => {
  it('recognises 429 and rate-limit messages', () => {
    expect(isQuotaError(quotaError())).toBe(true);
    expect(isQuotaError(new Error('User Rate Limit Exceeded'))).toBe(true);
    expect(isQuotaError(new Error('Not found'))).toBe(false);
  });

  it('reads the status from a gaxios-style response', () => {
    expect(httpStatus({ response: { status: 404 } })).toBe(404);
  });
});
