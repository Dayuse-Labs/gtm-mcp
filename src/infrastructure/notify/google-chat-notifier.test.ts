import { describe, it, expect } from 'vitest';
import { GoogleChatNotifier, type ChatPostResponse } from './google-chat-notifier.js';
import { type ToolErrorAlert } from '../../domain/ports/notifier.js';

const alert = (over: Partial<ToolErrorAlert> = {}): ToolErrorAlert => ({
  tool: 'pull',
  collaboratorEmail: 'a@dayuse.com',
  container: 'web',
  errorMessage: 'boom',
  at: new Date('2026-06-16T00:00:00.000Z'),
  ...over,
});

function harness(over: { now?: () => number; respond?: () => ChatPostResponse } = {}): {
  notifier: GoogleChatNotifier;
  posts: { url: string; body: string }[];
} {
  const posts: { url: string; body: string }[] = [];
  const notifier = new GoogleChatNotifier({
    webhookUrl: 'https://chat.example/hook',
    now: over.now,
    poster: (url, body) => {
      posts.push({ url, body });
      return Promise.resolve(over.respond ? over.respond() : { ok: true, status: 200 });
    },
  });
  return { notifier, posts };
}

describe('GoogleChatNotifier', () => {
  it('posts a readable message containing tool, collaborator, container and error', async () => {
    const { notifier, posts } = harness();
    await notifier.notifyToolError(alert());
    expect(posts).toHaveLength(1);
    expect(posts[0]?.url).toBe('https://chat.example/hook');
    const payload = JSON.parse(posts[0]?.body ?? '{}') as { text: string };
    expect(payload.text).toContain('pull');
    expect(payload.text).toContain('a@dayuse.com');
    expect(payload.text).toContain('web');
    expect(payload.text).toContain('boom');
  });

  it('suppresses the same (tool + message) within the cooldown window', async () => {
    let clock = 0;
    const { notifier, posts } = harness({ now: () => clock });

    await notifier.notifyToolError(alert());
    clock = 4 * 60_000; // 4 min < 5 min default
    await notifier.notifyToolError(alert());
    expect(posts).toHaveLength(1);

    clock = 6 * 60_000; // past the window
    await notifier.notifyToolError(alert());
    expect(posts).toHaveLength(2);
  });

  it('does not dedupe across different error messages', async () => {
    const { notifier, posts } = harness({ now: () => 0 });
    await notifier.notifyToolError(alert({ errorMessage: 'first' }));
    await notifier.notifyToolError(alert({ errorMessage: 'second' }));
    expect(posts).toHaveLength(2);
  });

  it('renders an unidentified collaborator placeholder when email is null', async () => {
    const { notifier, posts } = harness();
    await notifier.notifyToolError(alert({ collaboratorEmail: null }));
    const payload = JSON.parse(posts[0]?.body ?? '{}') as { text: string };
    expect(payload.text).toContain('(unidentified)');
  });

  it('never throws when the webhook POST rejects', async () => {
    const notifier = new GoogleChatNotifier({
      webhookUrl: 'https://chat.example/hook',
      poster: () => Promise.reject(new Error('network down')),
    });
    await expect(notifier.notifyToolError(alert())).resolves.toBeUndefined();
  });

  it('never throws on a non-ok webhook response', async () => {
    const { notifier } = harness({ respond: () => ({ ok: false, status: 500 }) });
    await expect(notifier.notifyToolError(alert())).resolves.toBeUndefined();
  });
});
