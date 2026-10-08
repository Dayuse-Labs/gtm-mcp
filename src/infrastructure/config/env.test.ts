import { describe, it, expect } from 'vitest';
import { loadEnv } from './env.js';

const base = {
  MCP_PUBLIC_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgres://u:p@localhost:5432/gtm',
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
  GOOGLE_OAUTH_CLIENT_ID: 'id',
  GOOGLE_OAUTH_CLIENT_SECRET: 'secret',
  GOOGLE_OAUTH_REDIRECT_URI: 'http://localhost:3000/oauth/callback',
  GTM_ACCOUNT_ID: '128104592',
  GTM_WEB_CONTAINER_ID: '1',
  GTM_SERVER_CONTAINER_ID: '2',
};

describe('loadEnv GTM_PREPROD_CONTAINER_ID', () => {
  it('is optional so existing deployments still boot', () => {
    expect(loadEnv(base).GTM_PREPROD_CONTAINER_ID).toBeUndefined();
  });

  it('is read when set', () => {
    expect(
      loadEnv({ ...base, GTM_PREPROD_CONTAINER_ID: '41658217' }).GTM_PREPROD_CONTAINER_ID,
    ).toBe('41658217');
  });
});
