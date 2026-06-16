import { describe, it, expect } from 'vitest';
import { ok, err, isOk } from './result.js';

describe('Result', () => {
  it('ok carries data and narrows', () => {
    const r = ok(42);
    expect(isOk(r)).toBe(true);
    if (r.success) expect(r.data).toBe(42);
  });

  it('err carries the error and narrows', () => {
    const r = err(new Error('boom'));
    expect(isOk(r)).toBe(false);
    if (!r.success) expect(r.error.message).toBe('boom');
  });
});
