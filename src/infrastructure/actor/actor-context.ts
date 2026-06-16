import { type Collaborator } from '../../domain/entities/collaborator.js';
import { type GtmClient } from '../../domain/ports/gtm-client.js';
import { type OAuthTokenRepository } from '../../domain/repositories/oauth-token-repository.js';
import { type PgCollaboratorRepository } from '../repositories/pg-collaborator-repository.js';
import { GoogleApisGtmClient, type GtmContainerConfig } from '../gtm/googleapis-gtm-client.js';
import { type GoogleOAuth } from '../gtm/google-oauth.js';
import { type Result, ok, err } from '../../shared/result.js';

export interface ResolvedActor {
  readonly collaborator: Collaborator;
  readonly gtm: GtmClient;
}

export interface ActorContext {
  resolve(): Promise<Result<ResolvedActor>>;
}

/**
 * DEV-ONLY identity binding: resolves the single most-recently-logged-in collaborator
 * and builds a GtmClient from their stored refresh token. Production fail-closed auth
 * (requireAuth → 501) is untouched; real per-request MCP-transport OAuth is still TODO.
 */
export class DevActorContext implements ActorContext {
  constructor(
    private readonly collaborators: PgCollaboratorRepository,
    private readonly tokens: OAuthTokenRepository,
    private readonly oauth: GoogleOAuth,
    private readonly cfg: GtmContainerConfig,
  ) {}

  async resolve(): Promise<Result<ResolvedActor>> {
    const recent = await this.collaborators.mostRecent();
    if (!recent.success) return recent;
    if (recent.data === null) {
      return err(new Error('No collaborator is logged in. Visit /oauth/login first.'));
    }
    const collaborator = recent.data;
    const token = await this.tokens.retrieve(collaborator.id);
    if (!token.success) return token;
    if (token.data === null) {
      return err(new Error('No stored Google token. Re-run /oauth/login.'));
    }
    const client = this.oauth.clientForRefreshToken(token.data);
    return ok({ collaborator, gtm: new GoogleApisGtmClient(client, this.cfg) });
  }
}
