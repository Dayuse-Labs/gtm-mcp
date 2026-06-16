import { describe, it, expect } from 'vitest';
import { buildBaseline, detectDrift } from './drift.js';
import { type Operation } from '../value-objects/operation.js';
import { stateWith, snap, emptyState } from '../../test-support/fakes.js';

const ops: Operation[] = [
  { op: 'update', entity: 'tag', target: { id: '10' }, data: { name: 'Renamed' } },
];
const base = stateWith({ tag: [snap('tag', '10', 'Tag', 'fp-A')] });

describe('drift (ADR 0006)', () => {
  it('builds a baseline from targeted operations', () => {
    const r = buildBaseline(ops, base);
    expect(r.success && r.data).toEqual([
      { kind: 'tag', id: '10', name: 'Tag', fingerprint: 'fp-A' },
    ]);
  });
  it('errors when a target no longer exists', () => {
    expect(buildBaseline(ops, emptyState()).success).toBe(false);
  });
  it('no drift when fingerprints match', () => {
    const r = buildBaseline(ops, base);
    expect(r.success && detectDrift(r.data, base)).toEqual([]);
  });
  it('flags modified', () => {
    const r = buildBaseline(ops, base);
    const fresh = stateWith({ tag: [snap('tag', '10', 'Tag', 'fp-B')] });
    expect(r.success && detectDrift(r.data, fresh)[0]?.reason).toBe('modified');
  });
  it('flags deleted', () => {
    const r = buildBaseline(ops, base);
    expect(r.success && detectDrift(r.data, emptyState())[0]?.reason).toBe('deleted');
  });
});
