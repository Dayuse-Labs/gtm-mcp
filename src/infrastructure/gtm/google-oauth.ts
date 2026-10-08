import { google } from 'googleapis';
import { type Result, ok, err } from '../../shared/result.js';

export type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

/**
 * Superset needed by every role (ADR 0011); what each role may actually do is enforced
 * server-side by the role policy. `delete.containers` is how GTM gates workspace deletion
 * (reject/rollback); `edit.containerversions` + `publish` are both needed to publish a workspace.
 */
export const GTM_SCOPES = [
  'https://www.googleapis.com/auth/tagmanager.edit.containers',
  'https://www.googleapis.com/auth/tagmanager.delete.containers',
  'https://www.googleapis.com/auth/tagmanager.edit.containerversions',
  'https://www.googleapis.com/auth/tagmanager.publish',
  'https://www.googleapis.com/auth/tagmanager.readonly',
  // identity, to read the user's email/sub for attribution
  'openid',
  'email',
] as const;

export interface OAuthConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
}

export interface ExchangedTokens {
  readonly refreshToken: string;
  readonly accessToken: string;
  readonly scopes: readonly string[];
  readonly email: string;
  readonly googleSub: string;
}

export class GoogleOAuth {
  constructor(private readonly cfg: OAuthConfig) {}

  private client(): OAuth2Client {
    return new google.auth.OAuth2(this.cfg.clientId, this.cfg.clientSecret, this.cfg.redirectUri);
  }

  /** Consent URL. `offline` + `consent` so we always receive a refresh token. */
  authUrl(state: string): string {
    return this.client().generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [...GTM_SCOPES],
      state,
    });
  }

  async exchangeCode(code: string): Promise<Result<ExchangedTokens>> {
    try {
      const c = this.client();
      const { tokens } = await c.getToken(code);
      if (!tokens.refresh_token || !tokens.access_token) {
        return err(
          new Error('Google did not return a refresh token. Revoke prior consent and retry.'),
        );
      }
      c.setCredentials(tokens);
      const oauth2 = google.oauth2({ version: 'v2', auth: c });
      const me = await oauth2.userinfo.get();
      const email = me.data.email;
      const googleSub = me.data.id;
      if (!email || !googleSub)
        return err(new Error('Could not read Google identity (email/sub).'));
      return ok({
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token,
        scopes: (tokens.scope ?? '').split(' ').filter(Boolean),
        email,
        googleSub,
      });
    } catch (e) {
      return err(e instanceof Error ? e : new Error('OAuth code exchange failed.'));
    }
  }

  /** An authorized client for a stored refresh token (used to call GTM as the collaborator). */
  clientForRefreshToken(refreshToken: string): OAuth2Client {
    const c = this.client();
    c.setCredentials({ refresh_token: refreshToken });
    return c;
  }
}
