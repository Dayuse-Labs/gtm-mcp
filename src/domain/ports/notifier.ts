/**
 * Outbound operational alerting (ADR 0010): the "is everything going right" push.
 * A best-effort side channel — callers fire-and-forget; an alert must never slow
 * or fail the tool call that triggered it.
 */
export interface ToolErrorAlert {
  readonly tool: string;
  readonly collaboratorEmail: string | null;
  readonly container: string | null;
  readonly errorMessage: string;
  readonly at: Date;
}

export interface Notifier {
  /**
   * Push a failed tool call to the ops channel. Never throws. Implementations
   * are expected to suppress duplicates (same tool + message) within a cooldown
   * window so a looping failure cannot flood the channel.
   */
  notifyToolError(alert: ToolErrorAlert): Promise<void>;
}
