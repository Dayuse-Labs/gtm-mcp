import { describe, it, expect } from 'vitest';
import { searchState } from './container-search.js';
import { type ContainerState, type GtmEntitySnapshot } from '../ports/gtm-client.js';
import { type EntityType } from '../value-objects/operation.js';
import { ALL_KINDS } from '../value-objects/entity-kind.js';

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

const fixture = state({
  trigger: [
    snap('trigger', '1538', 'purchase (daypass)', {
      filter: [{ parameter: [{ key: 'arg1', value: 'daypass' }] }],
    }),
  ],
  tag: [snap('tag', '1539', 'Facebook - Purchase daypass', { type: 'html' })],
  variable: [snap('variable', '1535', 'dlv - commercialType', { type: 'v' })],
});

describe('searchState', () => {
  it('finds value-only matches (condition) and name matches, case-insensitive', () => {
    const hits = searchState(fixture, 'DAYPASS');
    const byId = new Map(hits.map((h) => [h.id, h]));
    expect(hits).toHaveLength(2);
    // trigger matched inside its filter (value-only, not the name field alone)
    expect(byId.get('1538')?.matchedFields).toContain('filter');
    // tag matched on its name
    expect(byId.get('1539')?.matchedFields).toContain('name');
  });

  it('returns nothing when absent', () => {
    expect(searchState(fixture, 'dayaccess')).toHaveLength(0);
  });
});
