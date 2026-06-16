import { type Result } from '../../shared/result.js';

/**
 * Stores per-user Google refresh tokens ENCRYPTED at rest (ADR 0003).
 * Implementations must never accept or return plaintext outside the crypto boundary.
 */
export interface OAuthTokenRepository {
  /** Persist (encrypt) a refresh token for a collaborator. */
  store(
    collaboratorId: string,
    refreshToken: string,
    scopes: readonly string[],
  ): Promise<Result<void>>;
  /** Retrieve (decrypt) the refresh token, or null if none stored. */
  retrieve(collaboratorId: string): Promise<Result<string | null>>;
  delete(collaboratorId: string): Promise<Result<void>>;
}
