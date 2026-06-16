import { describe, it, expect } from 'vitest';
import { compactRaw, projectState, countByKind } from './container-export.js';
import { type ContainerState, type GtmEntitySnapshot } from '../ports/gtm-client.js';
import { type EntityType } from '../value-objects/operation.js';
import { ALL_KINDS } from '../value-objects/entity-kind.js';

const LONG = 'x'.repeat(500);

const snap = (
  kind: EntityType,
  id: string,
  name: string,
  raw: Record<string, unknown>,
): GtmEntitySnapshot => ({
  kind,
  id,
  name,
  fingerprint: 'fp',
  path: null,
  raw: { name, ...raw },
});

function state(partial: Partial<Record<EntityType, GtmEntitySnapshot[]>>): ContainerState {
  const base = {} as Record<EntityType, readonly GtmEntitySnapshot[]>;
  for (const k of ALL_KINDS) base[k] = partial[k] ?? [];
  return base;
}

describe('compactRaw', () => {
  it('keeps a trigger condition value (e.g. daypass) and its type', () => {
    const raw = {
      triggerId: '1538',
      type: 'customEvent',
      filter: [
        {
          type: 'equals',
          parameter: [
            { type: 'template', key: 'arg0', value: '{{commercialType}}' },
            { type: 'template', key: 'arg1', value: 'daypass' },
          ],
        },
      ],
    };
    const out = compactRaw(raw);
    expect(out.type).toBe('customEvent');
    expect(JSON.stringify(out.filter)).toContain('daypass');
    expect(out.triggerId).toBeUndefined(); // non-structural, dropped
  });

  it('keeps tag references but omits the html blob behind a marker', () => {
    const raw = {
      type: 'html',
      firingTriggerId: ['1538'],
      parameter: [{ type: 'template', key: 'html', value: LONG }],
    };
    const out = compactRaw(raw);
    expect(out.firingTriggerId).toEqual(['1538']);
    const params = out.parameter as Array<{ key: string; value: unknown }>;
    expect(params[0]?.value).toEqual({ _omitted: 'html', length: 500 });
  });

  it('omits a custom-template code blob with a marker', () => {
    const out = compactRaw({ type: 'macro', templateData: LONG });
    expect(out.templateData).toEqual({ _omitted: 'templateData', length: 500 });
  });
});

describe('projectState / countByKind', () => {
  const s = state({
    trigger: [snap('trigger', '1538', 'purchase (daypass)', { type: 'customEvent' })],
    tag: [
      snap('tag', '1539', 'FB daypass', {
        type: 'html',
        parameter: [{ key: 'html', value: LONG }],
      }),
    ],
  });

  it('full keeps the blob, compact omits it', () => {
    const full = projectState(s, 'full').find((e) => e.kind === 'tag');
    const compact = projectState(s, 'compact').find((e) => e.kind === 'tag');
    expect(JSON.stringify(full?.fields).length).toBeGreaterThan(
      JSON.stringify(compact?.fields).length,
    );
  });

  it('counts only non-empty kinds', () => {
    expect(countByKind(s)).toEqual({ trigger: 1, tag: 1 });
  });
});
