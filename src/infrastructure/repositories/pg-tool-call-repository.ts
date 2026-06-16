import { type DbPool } from '../persistence/pool.js';
import {
  type ToolCallRepository,
  type ToolCallRecord,
  type UsageRollup,
} from '../../domain/repositories/tool-call-repository.js';
import { type Result, ok, err } from '../../shared/result.js';

interface UsageRow {
  email: string | null;
  tool: string;
  calls: string;
  errors: string;
  avg_duration_ms: string | null;
}

export class PgToolCallRepository implements ToolCallRepository {
  constructor(private readonly pool: DbPool) {}

  async record(c: ToolCallRecord): Promise<Result<void>> {
    try {
      await this.pool.query(
        `INSERT INTO tool_call
           (collaborator_id, session_id, tool, container, outcome, error_message, duration_ms, arg_summary, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
        [
          c.collaboratorId,
          c.sessionId,
          c.tool,
          c.container,
          c.outcome,
          c.errorMessage,
          c.durationMs,
          c.argSummary === null ? null : JSON.stringify(c.argSummary),
          c.createdAt,
        ],
      );
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e : new Error('record tool_call failed.'));
    }
  }

  async usage(sinceHours: number): Promise<Result<readonly UsageRollup[]>> {
    try {
      const res = await this.pool.query<UsageRow>(
        `SELECT c.email AS email,
                t.tool AS tool,
                count(*)::text AS calls,
                count(*) FILTER (WHERE t.outcome = 'error')::text AS errors,
                round(avg(t.duration_ms))::text AS avg_duration_ms
           FROM tool_call t
           LEFT JOIN collaborator c ON c.id = t.collaborator_id
          WHERE t.created_at >= now() - make_interval(hours => $1::int)
          GROUP BY c.email, t.tool
          ORDER BY count(*) DESC`,
        [sinceHours],
      );
      return ok(
        res.rows.map((r) => ({
          collaboratorEmail: r.email,
          tool: r.tool,
          calls: Number(r.calls),
          errors: Number(r.errors),
          avgDurationMs: Number(r.avg_duration_ms ?? '0'),
        })),
      );
    } catch (e) {
      return err(e instanceof Error ? e : new Error('usage rollup failed.'));
    }
  }
}
