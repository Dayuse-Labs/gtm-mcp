import { type DbPool } from '../persistence/pool.js';
import { type ChangesetRepository } from '../../domain/repositories/changeset-repository.js';
import { type Changeset, type ChangesetStatus } from '../../domain/entities/changeset.js';
import { type ContainerAlias } from '../../domain/value-objects/container-alias.js';
import { type Operation } from '../../domain/value-objects/operation.js';
import { type Result, ok, err } from '../../shared/result.js';

interface Row {
  id: string;
  author_id: string;
  container_alias: string;
  plan_id: string | null;
  status: string;
  operations: Operation[];
  summary: string[] | null;
  before_images: Record<string, unknown> | null;
  gtm_workspace_id: string | null;
}

function toChangeset(r: Row): Changeset {
  return {
    id: r.id,
    authorId: r.author_id,
    containerAlias: r.container_alias as ContainerAlias,
    planId: r.plan_id,
    status: r.status as ChangesetStatus,
    operations: r.operations,
    summary: r.summary ?? [],
    beforeImages: r.before_images,
    gtmWorkspaceId: r.gtm_workspace_id,
  };
}

const COLS =
  'id, author_id, container_alias, plan_id, status, operations, summary, before_images, gtm_workspace_id';

export class PgChangesetRepository implements ChangesetRepository {
  constructor(private readonly pool: DbPool) {}

  async save(c: Changeset): Promise<Result<Changeset>> {
    try {
      await this.pool.query(
        `INSERT INTO changeset (id, author_id, container_alias, plan_id, status, operations, summary, before_images, gtm_workspace_id, applied_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, CASE WHEN $5 = 'applied' THEN now() ELSE NULL END)
         ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, summary = EXCLUDED.summary, before_images = EXCLUDED.before_images, gtm_workspace_id = EXCLUDED.gtm_workspace_id`,
        [
          c.id,
          c.authorId,
          c.containerAlias,
          c.planId,
          c.status,
          JSON.stringify(c.operations),
          JSON.stringify(c.summary),
          c.beforeImages === null ? null : JSON.stringify(c.beforeImages),
          c.gtmWorkspaceId,
        ],
      );
      return ok(c);
    } catch (e) {
      return err(e instanceof Error ? e : new Error('save changeset failed.'));
    }
  }

  async findById(id: string): Promise<Result<Changeset | null>> {
    try {
      const res = await this.pool.query<Row>(`SELECT ${COLS} FROM changeset WHERE id = $1`, [id]);
      const row = res.rows[0];
      return ok(row ? toChangeset(row) : null);
    } catch (e) {
      return err(e instanceof Error ? e : new Error('findById changeset failed.'));
    }
  }

  async list(filter: {
    container?: ContainerAlias;
    status?: ChangesetStatus;
  }): Promise<Result<readonly Changeset[]>> {
    try {
      const res = await this.pool.query<Row>(
        `SELECT ${COLS} FROM changeset
         WHERE ($1::text IS NULL OR container_alias = $1)
           AND ($2::text IS NULL OR status = $2)
         ORDER BY created_at DESC`,
        [filter.container ?? null, filter.status ?? null],
      );
      return ok(res.rows.map(toChangeset));
    } catch (e) {
      return err(e instanceof Error ? e : new Error('list changesets failed.'));
    }
  }

  async countPending(container: ContainerAlias): Promise<Result<number>> {
    try {
      const res = await this.pool.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM changeset WHERE container_alias = $1 AND status = 'applied'`,
        [container],
      );
      return ok(Number(res.rows[0]?.n ?? '0'));
    } catch (e) {
      return err(e instanceof Error ? e : new Error('countPending failed.'));
    }
  }
}
