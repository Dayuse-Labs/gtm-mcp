import { describe, it, expect } from 'vitest';
import { getIdentity } from './get-identity.js';
import { FakeGtmClient, emptyState, collaborator } from '../../test-support/fakes.js';

describe('getIdentity', () => {
  it('checks access on every container alias, preprod included', async () => {
    const r = await getIdentity({ gtm: new FakeGtmClient(emptyState()) }, collaborator());
    expect(r.success && r.data.containers.map((c) => c.alias)).toEqual([
      'web',
      'server',
      'preprod',
    ]);
  });

  it('reports an unconfigured container as "not configured", not as missing access', async () => {
    const gtm = new FakeGtmClient(emptyState());
    gtm.unconfigured.add('preprod');
    const r = await getIdentity({ gtm }, collaborator());
    expect(r.success && r.data.containers.find((c) => c.alias === 'preprod')?.access).toBe(
      'not configured',
    );
  });
});
