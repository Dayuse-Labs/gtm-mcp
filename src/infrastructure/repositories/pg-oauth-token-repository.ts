import { type DbPool } from '../persistence/pool.js';
import { type OAuthTokenRepository } from '../../domain/repositories/oauth-token-repository.js';
import { type TokenCipher } from '../crypto/token-cipher.js';
import { type Result, ok, err } from '../../shared/result.js';

interface Row {
  ciphertext: Buffer;
  iv: Buffer;
  auth_tag: Buffer;
}

export class PgOAuthTokenRepository implements OAuthTokenRepository {
  constructor(
    private readonly pool: DbPool,
    private readonly cipher: TokenCipher,
  ) {}

  async store(
    collaboratorId: string,
    refreshToken: string,
    scopes: readonly string[],
  ): Promise<Result<void>> {
    try {
      const sealed = this.cipher.seal(refreshToken);
      await this.pool.query(
        `INSERT INTO oauth_token (collaborator_id, ciphertext, iv, auth_tag, scopes, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (collaborator_id) DO UPDATE
           SET ciphertext = EXCLUDED.ciphertext, iv = EXCLUDED.iv,
               auth_tag = EXCLUDED.auth_tag, scopes = EXCLUDED.scopes, updated_at = now()`,
        [collaboratorId, sealed.ciphertext, sealed.iv, sealed.authTag, scopes.join(' ')],
      );
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e : new Error('store token failed.'));
    }
  }

  async retrieve(collaboratorId: string): Promise<Result<string | null>> {
    try {
      const res = await this.pool.query<Row>(
        'SELECT ciphertext, iv, auth_tag FROM oauth_token WHERE collaborator_id = $1',
        [collaboratorId],
      );
      const row = res.rows[0];
      if (!row) return ok(null);
      return ok(
        this.cipher.open({ ciphertext: row.ciphertext, iv: row.iv, authTag: row.auth_tag }),
      );
    } catch (e) {
      return err(e instanceof Error ? e : new Error('retrieve token failed.'));
    }
  }

  async delete(collaboratorId: string): Promise<Result<void>> {
    try {
      await this.pool.query('DELETE FROM oauth_token WHERE collaborator_id = $1', [collaboratorId]);
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e : new Error('delete token failed.'));
    }
  }
}
