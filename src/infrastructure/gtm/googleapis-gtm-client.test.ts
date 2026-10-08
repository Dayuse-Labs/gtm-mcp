import { describe, it, expect, vi } from 'vitest';
import { google } from 'googleapis';
import { GoogleApisGtmClient } from './googleapis-gtm-client.js';

const client = new GoogleApisGtmClient(new google.auth.OAuth2(), {
  accountId: '128104592',
  containerIds: { web: '1', server: '2', preprod: null },
});

describe('GoogleApisGtmClient with an unconfigured alias', () => {
  it('fails access checks and reads without calling GTM', async () => {
    const access = await client.describeAccess('preprod');
    const pulled = await client.pull('preprod');
    expect(!access.success && access.error.name).toBe('ContainerNotConfiguredError');
    expect(!pulled.success && pulled.error.message).toContain('GTM_PREPROD_CONTAINER_ID');
  });

  it('fails workspace operations without calling GTM', async () => {
    const count = await client.countWorkspaces('preprod');
    const created = await client.createWorkspace('preprod', 'cs');
    expect(!count.success && count.error.name).toBe('ContainerNotConfiguredError');
    expect(!created.success && created.error.name).toBe('ContainerNotConfiguredError');
  });
});

describe('GoogleApisGtmClient.deleteWorkspace', () => {
  const internalError = Object.assign(new Error('Experienced an internal error.'), { code: 500 });

  function clientWith(remaining: string[]) {
    const c = new GoogleApisGtmClient(new google.auth.OAuth2(), {
      accountId: '128104592',
      containerIds: { web: '1', server: '2', preprod: null },
    });
    const workspaces = {
      delete: vi.fn().mockRejectedValue(internalError),
      list: vi.fn().mockResolvedValue({
        data: { workspace: remaining.map((workspaceId) => ({ workspaceId })) },
      }),
    };
    Object.assign(c as unknown as { tm: unknown }, {
      tm: { accounts: { containers: { workspaces } } },
    });
    return c;
  }

  it('treats a failed delete of a workspace GTM no longer lists as done', async () => {
    const r = await clientWith(['399']).deleteWorkspace('web', '396');
    expect(r.success).toBe(true);
  });

  it('reports the error when the workspace still exists', async () => {
    const r = await clientWith(['399', '396']).deleteWorkspace('web', '396');
    expect(!r.success && r.error.message).toContain('internal error');
  });
});
