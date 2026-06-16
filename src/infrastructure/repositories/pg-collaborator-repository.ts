import { type DbPool } from '../persistence/pool.js';
import { type CollaboratorRepository } from '../../domain/repositories/collaborator-repository.js';
import { type Collaborator, RoleSchema } from '../../domain/entities/collaborator.js';
import { type Result, ok, err } from '../../shared/result.js';

interface Row {
  id: string;
  google_sub: string;
  email: string;
  role: string;
}

function toCollaborator(r: Row): Collaborator {
  return { id: r.id, googleSub: r.google_sub, email: r.email, role: RoleSchema.parse(r.role) };
}

export class PgCollaboratorRepository implements CollaboratorRepository {
  constructor(private readonly pool: DbPool) {}

  async findByGoogleSub(googleSub: string): Promise<Result<Collaborator | null>> {
    try {
      const res = await this.pool.query<Row>(
        'SELECT id, google_sub, email, role FROM collaborator WHERE google_sub = $1',
        [googleSub],
      );
      const row = res.rows[0];
      return ok(row ? toCollaborator(row) : null);
    } catch (e) {
      return err(e instanceof Error ? e : new Error('findByGoogleSub failed.'));
    }
  }

  async upsertOnLogin(input: { googleSub: string; email: string }): Promise<Result<Collaborator>> {
    try {
      const res = await this.pool.query<Row>(
        `INSERT INTO collaborator (google_sub, email, last_seen_at)
         VALUES ($1, $2, now())
         ON CONFLICT (google_sub) DO UPDATE SET email = EXCLUDED.email, last_seen_at = now()
         RETURNING id, google_sub, email, role`,
        [input.googleSub, input.email],
      );
      const row = res.rows[0];
      if (!row) return err(new Error('upsert returned no row.'));
      return ok(toCollaborator(row));
    } catch (e) {
      return err(e instanceof Error ? e : new Error('upsertOnLogin failed.'));
    }
  }

  /** Dev convenience: resolve the most-recently-active collaborator (single-user dev session). */
  async mostRecent(): Promise<Result<Collaborator | null>> {
    try {
      const res = await this.pool.query<Row>(
        'SELECT id, google_sub, email, role FROM collaborator ORDER BY last_seen_at DESC NULLS LAST LIMIT 1',
      );
      const row = res.rows[0];
      return ok(row ? toCollaborator(row) : null);
    } catch (e) {
      return err(e instanceof Error ? e : new Error('mostRecent failed.'));
    }
  }
}
