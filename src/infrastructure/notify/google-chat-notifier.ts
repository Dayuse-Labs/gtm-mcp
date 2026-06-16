import { type Notifier, type ToolErrorAlert } from '../../domain/ports/notifier.js';

/** Minimal shape of a POST response — lets tests inject without a real `fetch`. */
export interface ChatPostResponse {
  readonly ok: boolean;
  readonly status: number;
}
export type ChatPoster = (url: string, body: string) => Promise<ChatPostResponse>;

export interface GoogleChatNotifierConfig {
  readonly webhookUrl: string;
  /** Suppress repeats of the same (tool + message) within this window (default 5 min). */
  readonly cooldownMinutes?: number;
  /** Epoch-ms clock, injectable for cooldown tests (default `Date.now`). */
  readonly now?: () => number;
  /** Injectable poster (default wraps global `fetch`). */
  readonly poster?: ChatPoster;
}

const defaultPoster: ChatPoster = async (url, body) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  return { ok: res.ok, status: res.status };
};

const buildText = (a: ToolErrorAlert): string =>
  [
    '🔴 *GTM MCP tool error*',
    `*tool:* ${a.tool}`,
    `*collaborator:* ${a.collaboratorEmail ?? '(unidentified)'}`,
    `*container:* ${a.container ?? '—'}`,
    `*error:* ${a.errorMessage}`,
    `*at:* ${a.at.toISOString()}`,
  ].join('\n');

/**
 * Pushes failed tool calls to a Google Chat space via an incoming-webhook URL
 * (ADR 0010). Best-effort: a delivery failure is swallowed to console and never
 * propagates. Deduplicates by (tool + message) on a cooldown so a looping failure
 * fires once per window, not once per call.
 */
export class GoogleChatNotifier implements Notifier {
  private readonly webhookUrl: string;
  private readonly cooldownMs: number;
  private readonly now: () => number;
  private readonly poster: ChatPoster;
  private readonly lastSentAt = new Map<string, number>();

  constructor(cfg: GoogleChatNotifierConfig) {
    this.webhookUrl = cfg.webhookUrl;
    this.cooldownMs = (cfg.cooldownMinutes ?? 5) * 60_000;
    this.now = cfg.now ?? Date.now;
    this.poster = cfg.poster ?? defaultPoster;
  }

  async notifyToolError(alert: ToolErrorAlert): Promise<void> {
    const key = `${alert.tool}::${alert.errorMessage}`;
    const now = this.now();
    const last = this.lastSentAt.get(key);
    if (last !== undefined && now - last < this.cooldownMs) return; // within cooldown — suppress
    this.lastSentAt.set(key, now);
    try {
      const res = await this.poster(this.webhookUrl, JSON.stringify({ text: buildText(alert) }));
      if (!res.ok) console.error(`[google-chat] alert POST failed: ${res.status}`);
    } catch (e) {
      console.error('[google-chat] alert POST threw:', e);
    }
  }
}
