import { describe, it, expect } from 'vitest';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { registerTools, type Services } from './tools.js';
import { ok, type Result } from '../../shared/result.js';
import { type ActorContext, type ResolvedActor } from '../../infrastructure/actor/actor-context.js';
import { type MirrorWriter } from '../../application/use-cases/pull-container.js';
import { type MirrorReader } from '../../domain/ports/mirror-reader.js';
import {
  FakeGtmClient,
  emptyState,
  collaborator,
  InMemoryPreviewRepository,
  InMemoryChangesetRepository,
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

function servicesWith(minSkillVersion: string): Services {
  const actor: ActorContext = {
    resolve: (): Promise<Result<ResolvedActor>> =>
      Promise.resolve(ok({ collaborator: collaborator(), gtm: new FakeGtmClient(emptyState()) })),
  };
  const mirror: MirrorWriter = { write: () => Promise.resolve(ok(undefined)) };
  const mirrorReader: MirrorReader = { read: () => Promise.resolve(ok(null)) };
  return {
    actor,
    mirror,
    mirrorReader,
    previews: new InMemoryPreviewRepository(),
    changesets: new InMemoryChangesetRepository(),
    containers: { web: 'GTM-WEB', server: 'GTM-SRV' },
    now: () => new Date('2026-06-15T00:00:00.000Z'),
    newId: () => 'id-1',
    previewTtlHours: 24,
    catalog: null,
    minSkillVersion,
  };
}

async function callTool(handlers: Map<string, Handler>, name: string): Promise<unknown> {
  const handler = handlers.get(name);
  if (handler === undefined) throw new Error(`tool not registered: ${name}`);
  const res = await handler({}, {});
  const first = res.content[0];
  if (first === undefined || first.type !== 'text') throw new Error('expected text content');
  return JSON.parse(first.text);
}

describe('whoami', () => {
  it('includes the server minSkillVersion alongside identity (ADR 0009)', async () => {
    const handlers = captureTools(servicesWith('1.2.3'));
    const payload = await callTool(handlers, 'whoami');
    expect(payload).toMatchObject({ email: 'author@dayuse.com', minSkillVersion: '1.2.3' });
  });

  it('reflects whatever minSkillVersion the server was configured with', async () => {
    const handlers = captureTools(servicesWith('9.9.9'));
    const payload = await callTool(handlers, 'whoami');
    expect(payload).toMatchObject({ minSkillVersion: '9.9.9' });
  });
});
