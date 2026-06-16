import { type Result } from '../../shared/result.js';

/**
 * One MCP tool invocation, sanitized for the observability log (ADR 0010).
 * Carries no raw args — only a shape summary — and stamps its own time at call
 * completion (insert order is irrelevant; analysis sorts by createdAt + id).
 */
export interface ToolCallRecord {
  readonly collaboratorId: string | null; // null = anon / not-yet-identified / collaborator deleted
  readonly sessionId: string | null;
  readonly tool: string;
  readonly container: string | null;
  readonly outcome: 'ok' | 'error';
  readonly errorMessage: string | null;
  readonly durationMs: number;
  readonly argSummary: Record<string, unknown> | null;
  readonly createdAt: Date;
}

/** A usage-per-collaborator-per-tool rollup over a time window, for the admin `usage_stats` tool. */
export interface UsageRollup {
  readonly collaboratorEmail: string | null; // null once the collaborator row is gone (SET NULL)
  readonly tool: string;
  readonly calls: number;
  readonly errors: number;
  readonly avgDurationMs: number;
}

export interface ToolCallRepository {
  /** Best-effort append of one tool call. Callers fire-and-forget; failures must never surface. */
  record(call: ToolCallRecord): Promise<Result<void>>;
  /** Usage + error counts grouped by collaborator and tool, over the last `sinceHours`. */
  usage(sinceHours: number): Promise<Result<readonly UsageRollup[]>>;
}
