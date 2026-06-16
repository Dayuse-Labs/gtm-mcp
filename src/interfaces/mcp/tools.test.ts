import { describe, it, expect, vi } from 'vitest';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { registerTools, type Services } from './tools.js';
import { ok, err, type Result } from '../../shared/result.js';
import { type ActorContext, type ResolvedActor } from '../../infrastructure/actor/actor-context.js';
import { type MirrorWriter } from '../../application/use-cases/pull-container.js';
import { type MirrorReader } from '../../domain/ports/mirror-reader.js';
import { type Collaborator } from '../../domain/entities/collaborator.js';
import {
  FakeGtmClient,
  emptyState,
  collaborator,
  InMemoryPreviewRepository,
  InMemoryChangesetRepository,
  InMemoryToolCallRepository,
  RecordingNotifier,
} from '../../test-support/fakes.js';

type Handler = (args: unknown, extra: unknown) => Promise<CallToolResult>;

/** Capture the tool handlers registered against a fake McpServer. */
function captureTools(s: Services): Map<string, Handler> {
  const handlers = new Map<string, Handler>();
  const fakeServer = {
    registerTool: (name: string, _cfg: unknown, handler: Handler): void => {
      handlers.set(name, handler);
    },
  } as unknown as McpServer;
  registerTools(fakeServer, s);
  return handlers;
}

interface Over {
  readonly minSkillVersion?: string;
  readonly identity?: Collaborator | null; // null ⇒ resolve fails + identify returns null (anon)
  readonly toolCalls?: InMemoryToolCallRepository;
  readonly notifier?: RecordingNotifier;
}

function servicesWith(over: Over = {}): Services {
  const who = over.identity === undefined ? collaborator() : over.identity;
  const actor: ActorContext = {
    resolve: (): Promise<Result<ResolvedActor>> =>
      who === null
        ? Promise.resolve(err(new Error('No collaborator is logged in.')))
        : Promise.resolve(ok({ collaborator: who, gtm: new FakeGtmClient(emptyState()) })),
    identify: (): Promise<Collaborator | null> => Promise.resolve(who),
  };
  const mirror: MirrorWriter = { write: () => Promise.resolve(ok(undefined)) };
  const mirrorReader: MirrorReader = { read: () => Promise.resolve(ok(null)) };
  return {
    actor,
    mirror,
    mirrorReader,
    previews: new InMemoryPreviewRepository(),
    changesets: new InMemoryChangesetRepository(),
    toolCalls: over.toolCalls ?? new InMemoryToolCallRepository(),
    notifier: over.notifier ?? null,
    containers: { web: 'GTM-WEB', server: 'GTM-SRV' },
    now: () => new Date('2026-06-15T00:00:00.000Z'),
    newId: () => 'id-1',
    previewTtlHours: 24,
    catalog: null,
    minSkillVersion: over.minSkillVersion ?? '1.0.0',
  };
}

async function rawCall(
  handlers: Map<string, Handler>,
  name: string,
  args: unknown = {},
  extra: unknown = {},
): Promise<CallToolResult> {
  const handler = handlers.get(name);
  if (handler === undefined) throw new Error(`tool not registered: ${name}`);
  return handler(args, extra);
}

async function callTool(
  handlers: Map<string, Handler>,
  name: string,
  args: unknown = {},
): Promise<unknown> {
  const res = await rawCall(handlers, name, args);
  const first = res.content[0];
  if (first === undefined || first.type !== 'text') throw new Error('expected text content');
  return JSON.parse(first.text);
}

describe('whoami', () => {
  it('includes the server minSkillVersion alongside identity (ADR 0009)', async () => {
    const handlers = captureTools(servicesWith({ minSkillVersion: '1.2.3' }));
    const payload = await callTool(handlers, 'whoami');
    expect(payload).toMatchObject({ email: 'author@dayuse.com', minSkillVersion: '1.2.3' });
  });

  it('reflects whatever minSkillVersion the server was configured with', async () => {
    const handlers = captureTools(servicesWith({ minSkillVersion: '9.9.9' }));
    const payload = await callTool(handlers, 'whoami');
    expect(payload).toMatchObject({ minSkillVersion: '9.9.9' });
  });
});

describe('tool-call log (ADR 0010)', () => {
  it('records every call — attributed, with ok outcome and the target container', async () => {
    const toolCalls = new InMemoryToolCallRepository();
    const handlers = captureTools(servicesWith({ toolCalls }));

    await callTool(handlers, 'list_containers');

    await vi.waitFor(() => expect(toolCalls.records.length).toBe(1));
    expect(toolCalls.records[0]).toMatchObject({
      tool: 'list_containers',
      outcome: 'ok',
      collaboratorId: 'author-1',
      createdAt: new Date('2026-06-15T00:00:00.000Z'),
    });
  });

  it('captures the mcp session id from the call extra', async () => {
    const toolCalls = new InMemoryToolCallRepository();
    const handlers = captureTools(servicesWith({ toolCalls }));

    await rawCall(handlers, 'list_containers', {}, { sessionId: 'sess-42' });

    await vi.waitFor(() => expect(toolCalls.records.length).toBe(1));
    expect(toolCalls.records[0]?.sessionId).toBe('sess-42');
  });

  it('records an error outcome with the failure message when a tool fails', async () => {
    const toolCalls = new InMemoryToolCallRepository();
    // non-admin caller ⇒ usage_stats returns isError
    const handlers = captureTools(servicesWith({ toolCalls, identity: collaborator() }));

    const res = await rawCall(handlers, 'usage_stats');
    expect(res.isError).toBe(true);

    await vi.waitFor(() => expect(toolCalls.records.length).toBe(1));
    expect(toolCalls.records[0]).toMatchObject({ tool: 'usage_stats', outcome: 'error' });
    expect(toolCalls.records[0]?.errorMessage).toContain('admin-only');
  });

  it('stores a SANITIZED arg summary — counts/lengths, never the raw query', async () => {
    const toolCalls = new InMemoryToolCallRepository();
    const handlers = captureTools(servicesWith({ toolCalls }));

    await rawCall(handlers, 'search_container', { container: 'web', query: 'super-secret-value' });

    await vi.waitFor(() => expect(toolCalls.records.length).toBe(1));
    const rec = toolCalls.records[0];
    expect(rec?.container).toBe('web');
    expect(rec?.argSummary).toMatchObject({ queryLength: 'super-secret-value'.length });
    // the raw query must NOT appear anywhere in the persisted summary
    expect(JSON.stringify(rec?.argSummary)).not.toContain('super-secret-value');
  });

  it('still logs anonymous calls with a null collaborator id', async () => {
    const toolCalls = new InMemoryToolCallRepository();
    const handlers = captureTools(servicesWith({ toolCalls, identity: null }));

    await callTool(handlers, 'list_containers');

    await vi.waitFor(() => expect(toolCalls.records.length).toBe(1));
    expect(toolCalls.records[0]?.collaboratorId).toBeNull();
  });
});

describe('usage_stats (ADR 0010)', () => {
  it('refuses a non-admin collaborator', async () => {
    const handlers = captureTools(
      servicesWith({ identity: collaborator({ role: 'collaborator' }) }),
    );
    const res = await rawCall(handlers, 'usage_stats');
    expect(res.isError).toBe(true);
    const first = res.content[0];
    expect(first?.type === 'text' ? first.text : '').toContain('admin-only');
  });

  it('returns a usage rollup for an admin', async () => {
    const toolCalls = new InMemoryToolCallRepository();
    const handlers = captureTools(
      servicesWith({ identity: collaborator({ role: 'admin' }), toolCalls }),
    );

    // generate some logged activity first
    await callTool(handlers, 'list_containers');
    await vi.waitFor(() => expect(toolCalls.records.length).toBeGreaterThan(0));

    const payload = (await callTool(handlers, 'usage_stats')) as {
      sinceHours: number;
      usage: { tool: string; calls: number }[];
    };
    expect(payload.sinceHours).toBe(24);
    expect(payload.usage.some((u) => u.tool === 'list_containers')).toBe(true);
  });
});

describe('google chat error push (ADR 0010)', () => {
  it('does NOT alert on a successful call', async () => {
    const notifier = new RecordingNotifier();
    const handlers = captureTools(servicesWith({ notifier }));

    await callTool(handlers, 'list_containers');
    // give any (incorrect) async alert a chance to land before asserting absence
    await new Promise((r) => setTimeout(r, 10));
    expect(notifier.alerts).toHaveLength(0);
  });

  it('alerts on a failed call with the tool, collaborator and message', async () => {
    const notifier = new RecordingNotifier();
    const handlers = captureTools(servicesWith({ notifier, identity: collaborator() }));

    await rawCall(handlers, 'usage_stats'); // non-admin ⇒ isError

    await vi.waitFor(() => expect(notifier.alerts).toHaveLength(1));
    expect(notifier.alerts[0]).toMatchObject({
      tool: 'usage_stats',
      collaboratorEmail: 'author@dayuse.com',
    });
    expect(notifier.alerts[0]?.errorMessage).toContain('admin-only');
  });

  it('alerts even for an anonymous caller, with a null email', async () => {
    const notifier = new RecordingNotifier();
    // identity null ⇒ resolve fails ⇒ whoami returns isError
    const handlers = captureTools(servicesWith({ notifier, identity: null }));

    await rawCall(handlers, 'whoami');

    await vi.waitFor(() => expect(notifier.alerts).toHaveLength(1));
    expect(notifier.alerts[0]?.collaboratorEmail).toBeNull();
  });
});
