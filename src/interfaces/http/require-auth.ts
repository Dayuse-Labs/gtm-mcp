import { type Request, type Response, type NextFunction } from 'express';
import { type Env } from '../../infrastructure/config/env.js';

/**
 * Auth boundary (ADR 0003). Per-user Google OAuth is the target implementation.
 *
 * SKELETON BEHAVIOUR — fails closed:
 *   - production: rejects every request (501) until OAuth federation is wired.
 *     The server is intentionally NOT deployable yet (dayuse-vibes: no app without auth).
 *   - development: attaches a stub collaborator so the tool surface can be exercised locally.
 *
 * Replace the body with: validate the bearer token, resolve the Google identity,
 * upsert the collaborator, and attach it + a scoped access token to the request.
 */
export interface AuthedCollaborator {
  readonly id: string;
  readonly email: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    collaborator?: AuthedCollaborator;
  }
}

export function requireAuth(env: Env) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (env.NODE_ENV === 'production') {
      res.status(501).json({
        error:
          'Authentication not implemented. OAuth federation (ADR 0003) must be wired before deploy.',
      });
      return;
    }
    req.collaborator = { id: 'dev-collaborator', email: 'dev@dayuse.com' };
    next();
  };
}
