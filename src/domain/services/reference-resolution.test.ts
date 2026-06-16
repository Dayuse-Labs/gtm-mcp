import { describe, it, expect } from 'vitest';
import { resolveTargetId, type RefContext } from './reference-resolution.js';
import { stateWith, snap } from '../../test-support/fakes.js';

const ctx: RefContext = {
  state: stateWith({ tag: [snap('tag', '10', 'Existing Tag', 'fp')] }),
  created: new Map([['purchase-trigger', '99']]),
};

describe('resolveTargetId (3-tier, ADR 0004)', () => {
  it('tier 1 — explicit id', () => {
    const r = resolveTargetId('tag', { id: '10' }, ctx);
    expect(r.success && r.data).toBe('10');
  });
  it('tier 2 — intra-changeset $ref placeholder', () => {
    const r = resolveTargetId('trigger', { ref: 'purchase-trigger' }, ctx);
    expect(r.success && r.data).toBe('99');
  });
  it('tier 3 — existing entity by unique name', () => {
    const r = resolveTargetId('tag', { name: 'Existing Tag' }, ctx);
    expect(r.success && r.data).toBe('10');
  });
  it('fails when nothing resolves', () => {
    const r = resolveTargetId('tag', { name: 'Nope' }, ctx);
    expect(r.success).toBe(false);
  });
});
