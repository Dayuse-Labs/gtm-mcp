import { describe, it, expect } from 'vitest';
import { collapseUnions } from './datalayer-catalog.js';

describe('collapseUnions holds on real-file shapes', () => {
  it('collapses a ~300-member plain-string union', () => {
    const members = Array.from({ length: 300 }, (_, i) => `"goal_${i}"`).join(' | ');
    const out = collapseUnions(`type KameleoonGoalName = ${members};`);
    expect(out).toContain('300 strings');
    expect(out).not.toContain('goal_299');
  });

  it('collapses a mixed backtick-template + plain-string union (> 8 members)', () => {
    const parts = [
      '`home::${string}`',
      '`search_page::${string}`',
      '`hotel_page::${string}`',
      '"a"',
      '"b"',
      '"c"',
      '"d"',
      '"e"',
      '"f"',
    ].join(' | ');
    const out = collapseUnions(`item_list_name: ${parts}`);
    expect(out).toContain(' strings:');
    expect(out).not.toContain('"f"');
  });

  it('leaves an exactly-8-member union intact', () => {
    const parts = Array.from({ length: 8 }, (_, i) => `"p${i}"`).join(' | ');
    expect(collapseUnions(parts)).toBe(parts);
  });
});
