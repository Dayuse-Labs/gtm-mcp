import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' }); // loads .env.local in dev; no-op in prod where Railway injects env
import { randomUUID } from 'node:crypto';
import express, { type Request, type Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { loadEnv } from './infrastructure/config/env.js';
import { createPool } from './infrastructure/persistence/pool.js';
import { TokenCipher } from './infrastructure/crypto/token-cipher.js';
import { GoogleOAuth } from './infrastructure/gtm/google-oauth.js';
import { type GtmContainerConfig } from './infrastructure/gtm/googleapis-gtm-client.js';
import { PgCollaboratorRepository } from './infrastructure/repositories/pg-collaborator-repository.js';
import { PgOAuthTokenRepository } from './infrastructure/repositories/pg-oauth-token-repository.js';
import { PgChangesetRepository } from './infrastructure/repositories/pg-changeset-repository.js';
import { PgPreviewRepository } from './infrastructure/repositories/pg-preview-repository.js';
import { PgToolCallRepository } from './infrastructure/repositories/pg-tool-call-repository.js';
import { FileMirror } from './infrastructure/mirror/file-mirror.js';
import { GitlabDatalayerCatalog } from './infrastructure/gtm/gitlab-datalayer-catalog.js';
import { DevActorContext } from './infrastructure/actor/actor-context.js';
import { buildOAuthRouter } from './interfaces/http/oauth-routes.js';
import { requireAuth } from './interfaces/http/require-auth.js';
import { buildMcpServer } from './interfaces/mcp/server.js';
import { type Services } from './interfaces/mcp/tools.js';
import { resolveMinSkillVersion } from './shared/version.js';

const env = loadEnv();

// --- Composition root (DDD wiring) ---
const pool = createPool(env.DATABASE_URL);
const cipher = new TokenCipher(env.TOKEN_ENCRYPTION_KEY);
const cfg: GtmContainerConfig = {
  accountId: env.GTM_ACCOUNT_ID,
  webContainerId: env.GTM_WEB_CONTAINER_ID,
  serverContainerId: env.GTM_SERVER_CONTAINER_ID,
};
const oauth = new GoogleOAuth({
  clientId: env.GOOGLE_OAUTH_CLIENT_ID,
  clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
  redirectUri: env.GOOGLE_OAUTH_REDIRECT_URI,
});
const collaborators = new PgCollaboratorRepository(pool);
const tokens = new PgOAuthTokenRepository(pool, cipher);
const changesets = new PgChangesetRepository(pool);
const previews = new PgPreviewRepository(pool);
const toolCalls = new PgToolCallRepository(pool);
const fileMirror = new FileMirror();
const catalog =
  env.GITLAB_TOKEN !== undefined && env.GITLAB_CATALOG_PROJECT_ID !== undefined
    ? new GitlabDatalayerCatalog({
        token: env.GITLAB_TOKEN,
        projectId: env.GITLAB_CATALOG_PROJECT_ID,
      })
    : null;
const services: Services = {
  actor: new DevActorContext(collaborators, tokens, oauth, cfg),
  mirror: fileMirror,
  mirrorReader: fileMirror,
  previews,
  changesets,
  toolCalls,
  containers: { web: cfg.webContainerId, server: cfg.serverContainerId },
  now: () => new Date(),
  newId: () => randomUUID(),
  previewTtlHours: 24,
  catalog,
  minSkillVersion: resolveMinSkillVersion(env.MIN_SKILL_VERSION),
};

const app = express();
app.use(express.json());

const wrap =
  (handler: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response): void => {
    handler(req, res).catch((error: unknown) => {
      console.error('Unhandled request error', error);
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
    });
  };

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'gtm-mcp', version: '0.1.0' });
});

// OAuth federation routes (ADR 0003).
app.use(buildOAuthRouter({ oauth, collaborators, tokens }));

const transports = new Map<string, StreamableHTTPServerTransport>();
const getSessionId = (req: Request): string | undefined => {
  const raw = req.headers['mcp-session-id'];
  return typeof raw === 'string' ? raw : undefined;
};

app.post(
  '/mcp',
  requireAuth(env),
  wrap(async (req, res) => {
    const sessionId = getSessionId(req);
    const existing = sessionId ? transports.get(sessionId) : undefined;
    const body: unknown = req.body;

    if (existing) {
      await existing.handleRequest(req, res, body);
      return;
    }
    if (!isInitializeRequest(body)) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'No valid session; send an initialize request first.' },
        id: null,
      });
      return;
    }
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid: string) => {
        transports.set(sid, transport);
      },
    });
    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) transports.delete(sid);
    };
    await buildMcpServer(services).connect(transport);
    await transport.handleRequest(req, res, body);
  }),
);

const sessionStream = wrap(async (req, res) => {
  const sessionId = getSessionId(req);
  const transport = sessionId ? transports.get(sessionId) : undefined;
  if (!transport) {
    res.status(400).json({ error: 'Unknown or missing session id' });
    return;
  }
  await transport.handleRequest(req, res);
});
app.get('/mcp', requireAuth(env), sessionStream);
app.delete('/mcp', requireAuth(env), sessionStream);

app.listen(env.PORT, () => {
  console.warn(
    `gtm-mcp listening on :${env.PORT} (${env.NODE_ENV}) — MCP at /mcp, OAuth at /oauth/login, health at /health`,
  );
  if (env.NODE_ENV !== 'production') {
    console.warn(
      'DEV: requireAuth bypassed for /mcp; identity resolved from the last /oauth/login. Not deployable until MCP-transport OAuth is wired.',
    );
  }
});
