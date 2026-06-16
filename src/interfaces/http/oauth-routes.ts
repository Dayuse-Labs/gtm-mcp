import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { type GoogleOAuth } from '../../infrastructure/gtm/google-oauth.js';
import { type PgCollaboratorRepository } from '../../infrastructure/repositories/pg-collaborator-repository.js';
import { type OAuthTokenRepository } from '../../domain/repositories/oauth-token-repository.js';

export interface OAuthRouteDeps {
  readonly oauth: GoogleOAuth;
  readonly collaborators: PgCollaboratorRepository;
  readonly tokens: OAuthTokenRepository;
}

const wrap =
  (h: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response): void => {
    h(req, res).catch((error: unknown) => {
      console.error('oauth route error', error);
      if (!res.headersSent) res.status(500).send('OAuth error.');
    });
  };

export function buildOAuthRouter(deps: OAuthRouteDeps): Router {
  const router = Router();
  const pendingStates = new Set<string>();

  router.get(
    '/oauth/login',
    wrap((_req, res) => {
      const state = randomUUID();
      pendingStates.add(state);
      res.redirect(deps.oauth.authUrl(state));
      return Promise.resolve();
    }),
  );

  router.get(
    '/oauth/callback',
    wrap(async (req, res) => {
      const code = typeof req.query.code === 'string' ? req.query.code : undefined;
      const state = typeof req.query.state === 'string' ? req.query.state : undefined;
      if (!code || !state || !pendingStates.has(state)) {
        res.status(400).send('Invalid OAuth callback (missing/unknown code or state).');
        return;
      }
      pendingStates.delete(state);

      const exchanged = await deps.oauth.exchangeCode(code);
      if (!exchanged.success) {
        res.status(400).send(`OAuth failed: ${exchanged.error.message}`);
        return;
      }
      const tokens = exchanged.data;

      const upserted = await deps.collaborators.upsertOnLogin({
        googleSub: tokens.googleSub,
        email: tokens.email,
      });
      if (!upserted.success) {
        res.status(500).send('Could not persist collaborator.');
        return;
      }
      const stored = await deps.tokens.store(upserted.data.id, tokens.refreshToken, tokens.scopes);
      if (!stored.success) {
        res.status(500).send('Could not store token.');
        return;
      }
      res
        .status(200)
        .send(
          `<h1>Signed in as ${tokens.email}</h1><p>You can close this tab and use the MCP tools.</p>`,
        );
    }),
  );

  return router;
}
