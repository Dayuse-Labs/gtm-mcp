import { describe, it, expect } from 'vitest';
import {
  parseCatalog,
  listEvents,
  getEvent,
  getType,
  collapseUnions,
} from './datalayer-catalog.js';
import { DATALAYER_FIXTURE } from '../../test-support/datalayer-fixture.js';

const parsed = parseCatalog(DATALAYER_FIXTURE);

describe('parseCatalog', () => {
  it('extracts every event but not the DataLayerEvents/DataLayerEventName decls', () => {
    expect([...parsed.events.keys()]).toEqual([
      'purchase',
      'select_item',
      'all_filters_closed',
      'dl_head',
    ]);
    expect([...parsed.decls.keys()]).toEqual([
      'CommercialType',
      'PageType',
      'KameleoonGoalName',
      'EcommercePurchase',
    ]);
    expect(parsed.decls.has('DataLayerEventName')).toBe(false);
  });
});

describe('listEvents', () => {
  it('returns every event name', () => {
    expect(listEvents(parsed)).toEqual([
      'purchase',
      'select_item',
      'all_filters_closed',
      'dl_head',
    ]);
  });
});

describe('getEvent', () => {
  it('compact collapses a fat union but keeps discriminants verbatim', () => {
    const r = getEvent(parsed, 'select_item', 'compact');
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toContain('<11 strings:');
    expect(r.data).toContain('event: "select_item"');
    expect(r.data).toContain('eventTarget: "GA4"');
    // a collapsed member is gone
    expect(r.data).not.toContain('"tunnel::j"');
  });

  it('compact keeps referenced types as bare names (no expansion)', () => {
    const r = getEvent(parsed, 'purchase', 'compact');
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toContain('ecommerce: EcommercePurchase');
    expect(r.data).not.toContain('transaction_id'); // EcommercePurchase body not inlined
  });

  it('full expands referenced named types one level', () => {
    const r = getEvent(parsed, 'purchase', 'full');
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toContain('// referenced types (1 level):');
    expect(r.data).toContain('type EcommercePurchase =');
    expect(r.data).toContain('transaction_id');
  });

  it('full adds no appendix when nothing is referenced', () => {
    const r = getEvent(parsed, 'select_item', 'full');
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).not.toContain('referenced types');
  });

  it('errors on an unknown event', () => {
    const r = getEvent(parsed, 'nope', 'compact');
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.message).toContain('Unknown dataLayer event: nope');
  });
});

describe('getType', () => {
  it('collapses a fat helper-type union', () => {
    const r = getType(parsed, 'KameleoonGoalName');
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toContain('<10 strings:');
  });

  it('leaves an 8-member union intact (boundary, > 8 only)', () => {
    const r = getType(parsed, 'PageType');
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).not.toContain('strings:');
    expect(r.data).toContain('"other"');
  });

  it('errors on an unknown type', () => {
    const r = getType(parsed, 'Missing');
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.message).toContain('Unknown dataLayer type: Missing');
  });
});

describe('collapseUnions', () => {
  it('leaves a short union and non-string unions untouched', () => {
    expect(collapseUnions('"a" | "b" | "c"')).toBe('"a" | "b" | "c"');
    expect(collapseUnions('string | number')).toBe('string | number');
  });
});
