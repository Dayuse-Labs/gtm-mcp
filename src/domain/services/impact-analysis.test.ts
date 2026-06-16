import { describe, it, expect } from 'vitest';
import { analyzeImpacts } from './impact-analysis.js';
import { type Operation } from '../value-objects/operation.js';
import { stateWith, snap } from '../../test-support/fakes.js';

// A variable `daypass` referenced by a tag via {{daypass}} — the rename fan-out case.
const state = stateWith({
  variable: [snap('variable', 'v1', 'daypass', 'fp')],
  tag: [
    snap('tag', 't1', 'Conversion Tag', 'fp', {
      parameter: [{ type: 'template', value: '{{daypass}}' }],
    }),
  ],
});

describe('analyzeImpacts (rename fan-out, ADR 0007 rider)', () => {
  it('surfaces dependents when a referenced variable is renamed', () => {
    const ops: Operation[] = [
      { op: 'update', entity: 'variable', target: { id: 'v1' }, data: { name: 'dayaccess' } },
    ];
    const impacts = analyzeImpacts(ops, state);
    expect(impacts).toHaveLength(1);
    expect(impacts[0]?.name).toBe('Conversion Tag');
    expect(impacts[0]?.reason).toContain('{{daypass}}');
  });
  it('surfaces dependents on delete too', () => {
    const ops: Operation[] = [{ op: 'delete', entity: 'variable', target: { id: 'v1' } }];
    expect(analyzeImpacts(ops, state)).toHaveLength(1);
  });
  it('no impact when the name is unchanged', () => {
    const ops: Operation[] = [
      { op: 'update', entity: 'variable', target: { id: 'v1' }, data: { value: 'x' } },
    ];
    expect(analyzeImpacts(ops, state)).toHaveLength(0);
  });
});
