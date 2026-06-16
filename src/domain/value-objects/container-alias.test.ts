import { describe, it, expect } from 'vitest';
import { parseContainerAlias } from './container-alias.js';

describe('parseContainerAlias', () => {
  it.each(['web', 'server'])('accepts %s', (value) => {
    const r = parseContainerAlias(value);
    expect(r.success).toBe(true);
  });

  it('rejects unknown aliases', () => {
    const r = parseContainerAlias('mobile');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.name).toBe('InvalidContainerAliasError');
  });
});
