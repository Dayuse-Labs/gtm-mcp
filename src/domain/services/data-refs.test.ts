import { describe, it, expect } from 'vitest';
import { collectDataRefs, substituteDataRefs, validateDataRefs } from './data-refs.js';
import { type Operation } from '../value-objects/operation.js';

describe('collectDataRefs', () => {
  it('finds $ref tokens nested in arrays and objects', () => {
    const data = {
      firingTriggerId: ['$ref:trig_a'],
      nested: { blockingTriggerId: ['$ref:trig_b', '123'] },
      name: 'plain',
    };
    expect(collectDataRefs(data).sort()).toEqual(['trig_a', 'trig_b']);
  });
  it('ignores non-token strings and a bare prefix', () => {
    expect(collectDataRefs({ a: '$ref:', b: 'ref:x', c: 'value' })).toEqual([]);
  });
});

describe('substituteDataRefs', () => {
  const created = new Map([
    ['trig_a', '101'],
    ['trig_b', '102'],
  ]);
  it('replaces whole-string tokens with the created id, leaving other values intact', () => {
    const r = substituteDataRefs(
      { firingTriggerId: ['$ref:trig_a'], tagFiringOption: 'oncePerEvent', n: 5 },
      created,
    );
    expect(r.success && r.data).toEqual({
      firingTriggerId: ['101'],
      tagFiringOption: 'oncePerEvent',
      n: 5,
    });
  });
  it('does not mutate the input', () => {
    const data = { firingTriggerId: ['$ref:trig_a'] };
    substituteDataRefs(data, created);
    expect(data.firingTriggerId).toEqual(['$ref:trig_a']);
  });
  it('errors when a ref is not in the created map', () => {
    const r = substituteDataRefs({ firingTriggerId: ['$ref:missing'] }, created);
    expect(r.success).toBe(false);
  });
});

describe('validateDataRefs', () => {
  const create = (assignRef: string | undefined, data: Record<string, unknown>): Operation => ({
    op: 'create',
    entity: 'tag',
    ...(assignRef !== undefined ? { assignRef } : {}),
    data,
  });
  it('accepts a ref assigned by an earlier create', () => {
    const ops: Operation[] = [
      { op: 'create', entity: 'trigger', assignRef: 'trig_a', data: { name: 't' } },
      create(undefined, { firingTriggerId: ['$ref:trig_a'] }),
    ];
    expect(validateDataRefs(ops).success).toBe(true);
  });
  it('rejects a ref used before it is assigned (forward reference)', () => {
    const ops: Operation[] = [
      create(undefined, { firingTriggerId: ['$ref:trig_a'] }),
      { op: 'create', entity: 'trigger', assignRef: 'trig_a', data: { name: 't' } },
    ];
    expect(validateDataRefs(ops).success).toBe(false);
  });
  it('rejects a ref that is never assigned', () => {
    expect(validateDataRefs([create(undefined, { firingTriggerId: ['$ref:nope'] })]).success).toBe(
      false,
    );
  });
});
