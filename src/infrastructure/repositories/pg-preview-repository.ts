import { type DbPool } from '../persistence/pool.js';
import { type PreviewRepository } from '../../domain/repositories/preview-repository.js';
import {
  type Preview,
  type BaselineEntry,
  type ImpactEntry,
} from '../../domain/entities/preview.js';
import { type ContainerAlias } from '../../domain/value-objects/container-alias.js';
import { type Operation } from '../../domain/value-objects/operation.js';
import { type Result, ok, err } from '../../shared/result.js';

interface Row {
  id: string;
  author_id: string;
  container: string;
  operations: Operation[];
  summary: string[];
  impacts: ImpactEntry[];
  baseline: BaselineEntry[];
  created_at: Date;
  expires_at: Date;
}

function toPreview(r: Row): Preview {
  return {
    id: r.id,
    authorId: r.author_id,
    container: r.container as ContainerAlias,
    operations: r.operations,
    summary: r.summary,
    impacts: r.impacts,
    baseline: r.baseline,
    createdAt: r.created_at.toISOString(),
    expiresAt: r.expires_at.toISOString(),
  };
}

export class PgPreviewRepository implements PreviewRepository {
  constructor(private readonly pool: DbPool) {}

  async save(p: Preview): Promise<Result<Preview>> {
    try {
      await this.pool.query(
        `INSERT INTO preview (id, author_id, container, operations, summary, impacts, baseline, created_at, expires_at)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9)`,
        [
          p.id,
          p.authorId,
          p.container,
          JSON.stringify(p.operations),
          JSON.stringify(p.summary),
          JSON.stringify(p.impacts),
          JSON.stringify(p.baseline),
          p.createdAt,
          p.expiresAt,
        ],
      );
      return ok(p);
    } catch (e) {
      return err(e instanceof Error ? e : new Error('save preview failed.'));
    }
  }

  async findById(id: string): Promise<Result<Preview | null>> {
    try {
      const res = await this.pool.query<Row>(
        `SELECT id, author_id, container, operations, summary, impacts, baseline, created_at, expires_at
         FROM preview WHERE id = $1 AND expires_at > now()`,
        [id],
      );
      const row = res.rows[0];
      return ok(row ? toPreview(row) : null);
    } catch (e) {
      return err(e instanceof Error ? e : new Error('findById preview failed.'));
    }
  }

  async delete(id: string): Promise<Result<void>> {
    try {
      await this.pool.query('DELETE FROM preview WHERE id = $1', [id]);
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e : new Error('delete preview failed.'));
    }
  }
}
