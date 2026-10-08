import { describe, it, expect } from 'vitest';
import { parseContainerAlias, resolveContainerId, type ContainerIds } from './container-alias.js';
import { kindsForContainer } from './entity-kind.js';

describe('parseContainerAlias', () => {
  it.each(['web', 'server', 'preprod'])('accepts %s', (value) => {
    const r = parseContainerAlias(value);
    expect(r.success).toBe(true);
  });

  it('rejects unknown aliases', () => {
    const r = parseContainerAlias('mobile');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.name).toBe('InvalidContainerAliasError');
  });
});

describe('resolveContainerId', () => {
  const ids: ContainerIds = { web: '1', server: '2', preprod: null };

  it('returns the configured id', () => {
    expect(resolveContainerId(ids, 'web')).toEqual({ success: true, data: '1' });
  });

  it('reports an unconfigured alias with the env var to set', () => {
    const r = resolveContainerId(ids, 'preprod');
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.name).toBe('ContainerNotConfiguredError');
      expect(r.error.message).toContain('GTM_PREPROD_CONTAINER_ID');
    }
  });
});

describe('kindsForContainer', () => {
  it('treats preprod as a web container (no clients/transformations)', () => {
    expect(kindsForContainer('preprod')).toEqual(kindsForContainer('web'));
    expect(kindsForContainer('preprod')).not.toContain('client');
    expect(kindsForContainer('server')).toContain('transformation');
  });
});
