import { z } from 'zod';
import { type McpServer, type ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ContainerAliasSchema } from '../../domain/value-objects/container-alias.js';
import { EntityTypeSchema, OperationsSchema } from '../../domain/value-objects/operation.js';
import { type ActorContext } from '../../infrastructure/actor/actor-context.js';
import { type MirrorWriter } from '../../application/use-cases/pull-container.js';
import { type MirrorReader } from '../../domain/ports/mirror-reader.js';
import { type DatalayerCatalog } from '../../domain/ports/datalayer-catalog.js';
import { type PreviewRepository } from '../../domain/repositories/preview-repository.js';
import { type ChangesetRepository } from '../../domain/repositories/changeset-repository.js';
import { type ToolCallRepository } from '../../domain/repositories/tool-call-repository.js';
import { isAdmin } from '../../domain/entities/collaborator.js';
import { getIdentity } from '../../application/use-cases/get-identity.js';
import { pullContainer } from '../../application/use-cases/pull-container.js';
import { exportContainer } from '../../application/use-cases/export-container.js';
import { searchContainer } from '../../application/use-cases/search-container.js';
import { previewChangeset } from '../../application/use-cases/preview-changeset.js';
import {
  applyChangeset,
  GTM_WORKSPACE_LIMIT,
} from '../../application/use-cases/apply-changeset.js';
import { findExisting } from '../../domain/services/state-query.js';

const ChangesetStatusSchema = z.enum(['draft', 'previewed', 'applied', 'rejected', 'published']);

export interface Services {
  readonly actor: ActorContext;
  readonly mirror: MirrorWriter;
  readonly mirrorReader: MirrorReader;
  readonly previews: PreviewRepository;
  readonly changesets: ChangesetRepository;
  readonly toolCalls: ToolCallRepository;
  readonly containers: { readonly web: string; readonly server: string };
  readonly now: () => Date;
  readonly newId: () => string;
  readonly previewTtlHours: number;
  readonly catalog: DatalayerCatalog | null;
  readonly minSkillVersion: string;
}

const text = (o: unknown): CallToolResult => ({
  content: [{ type: 'text', text: typeof o === 'string' ? o : JSON.stringify(o, null, 2) }],
});
const fail = (msg: string): CallToolResult => ({
  content: [{ type: 'text', text: msg }],
  isError: true,
});

// ---------- Per-call observability log (ADR 0010) ----------

const ERROR_MESSAGE_CAP = 500;

const containerOf = (args: unknown): string | null => {
  if (args === null || typeof args !== 'object') return null;
  const c = (args as { container?: unknown }).container;
  return typeof c === 'string' ? c : null;
};

const sessionIdOf = (extra: unknown): string | null => {
  if (extra === null || typeof extra !== 'object') return null;
  const sid = (extra as { sessionId?: unknown }).sessionId;
  return typeof sid === 'string' ? sid : null;
};

/**
 * Sanitized arg shape — NEVER raw operation bodies, query text, refs/names/ids
 * (RGPD: data minimisation, ADR 0010). Only counts, lengths, presence, and bounded enums.
 */
const summarizeArgs = (args: unknown): Record<string, unknown> | null => {
  if (args === null || typeof args !== 'object') return null;
  const a = args as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (Array.isArray(a.operations)) out.opsCount = a.operations.length;
  if (typeof a.query === 'string') out.queryLength = a.query.length;
  if (typeof a.filter === 'string') out.filterLength = a.filter.length;
  if (typeof a.name === 'string') out.nameLength = a.name.length;
  if (typeof a.type === 'string') out.type = a.type; // entity-type enum — bounded, safe
  if (typeof a.mode === 'string') out.mode = a.mode; // compact | full — safe
  if (typeof a.status === 'string') out.status = a.status; // changeset-status enum — safe
  if (typeof a.sinceHours === 'number') out.sinceHours = a.sinceHours;
  if (typeof a.ref === 'string') out.hasRef = true; // arbitrary name/id — presence only
  if (typeof a.id === 'string') out.hasId = true;
  if (typeof a.previewId === 'string') out.hasPreviewId = true;
  if (typeof a.changesetId === 'string') out.hasChangesetId = true;
  return Object.keys(out).length > 0 ? out : null;
};

const firstText = (r: CallToolResult): string | null => {
  const c = r.content[0];
  return c !== undefined && c.type === 'text' ? c.text.slice(0, ERROR_MESSAGE_CAP) : null;
};

/**
 * Fire-and-forget append of one tool call. Resolves identity and writes off the
 * request path; a logging fault is swallowed to console (never fails the call).
 */
const recordCall = (
  s: Services,
  tool: string,
  args: unknown,
  extra: unknown,
  outcome: 'ok' | 'error',
  errorMessage: string | null,
  durationMs: number,
): void => {
  void (async () => {
    try {
      const who = await s.actor.identify();
      await s.toolCalls.record({
        collaboratorId: who?.id ?? null,
        sessionId: sessionIdOf(extra),
        tool,
        container: containerOf(args),
        outcome,
        errorMessage,
        durationMs,
        argSummary: summarizeArgs(args),
        createdAt: s.now(),
      });
    } catch (e) {
      console.error(`[tool-call-log] record failed for ${tool}:`, e);
    }
  })();
};

/** Wrap a tool handler so every call is timed + logged with its outcome (ADR 0010). */
const wrapWithLogging = <InputArgs extends z.ZodRawShape>(
  s: Services,
  tool: string,
  handler: ToolCallback<InputArgs>,
): ToolCallback<InputArgs> => {
  const run = handler as unknown as (
    args: unknown,
    extra: unknown,
  ) => CallToolResult | Promise<CallToolResult>;
  const wrapped = async (args: unknown, extra: unknown): Promise<CallToolResult> => {
    const start = Date.now();
    try {
      const result = await run(args, extra);
      const outcome = result.isError === true ? 'error' : 'ok';
      recordCall(s, tool, args, extra, outcome, outcome === 'error' ? firstText(result) : null, Date.now() - start);
      return result;
    } catch (e) {
      recordCall(s, tool, args, extra, 'error', e instanceof Error ? e.message : String(e), Date.now() - start);
      throw e;
    }
  };
  return wrapped as unknown as ToolCallback<InputArgs>;
};

export function registerTools(server: McpServer, s: Services): void {
  // Register through a wrapper so EVERY tool call is logged uniformly (ADR 0010).
  const register = server.registerTool.bind(server);
  const reg = <InputArgs extends z.ZodRawShape>(
    name: string,
    config: { description: string; inputSchema: InputArgs },
    handler: ToolCallback<InputArgs>,
  ): void => {
    register(name, config, wrapWithLogging(s, name, handler));
  };

  // ---------- Read / discovery ----------
  reg(
    'list_containers',
    {
      description: 'List the registered web/server containers and their GTM ids.',
      inputSchema: {},
    },
    () => text({ web: s.containers.web, server: s.containers.server }),
  );

  reg(
    'whoami',
    { description: 'Return the current collaborator and their GTM access.', inputSchema: {} },
    async () => {
      const a = await s.actor.resolve();
      if (!a.success) return fail(a.error.message);
      const v = await getIdentity({ gtm: a.data.gtm }, a.data.collaborator);
      return v.success
        ? text({ ...v.data, minSkillVersion: s.minSkillVersion })
        : fail(v.error.message);
    },
  );

  reg(
    'pull',
    {
      description: 'Refresh the local mirror from GTM and return a change summary.',
      inputSchema: { container: ContainerAliasSchema },
    },
    async (args) => {
      const a = await s.actor.resolve();
      if (!a.success) return fail(a.error.message);
      const v = await pullContainer({ gtm: a.data.gtm, mirror: s.mirror }, args.container);
      return v.success ? text(v.data) : fail(v.error.message);
    },
  );

  reg(
    'list_entities',
    {
      description:
        'List entities of a type in a container (optionally filtered by name substring).',
      inputSchema: {
        container: ContainerAliasSchema,
        type: EntityTypeSchema,
        filter: z.string().max(200).optional(),
      },
    },
    async (args) => {
      const a = await s.actor.resolve();
      if (!a.success) return fail(a.error.message);
      const pulled = await a.data.gtm.pull(args.container);
      if (!pulled.success) return fail(pulled.error.message);
      const f = args.filter?.toLowerCase();
      const rows = (pulled.data[args.type] ?? [])
        .filter((e) => (f ? e.name.toLowerCase().includes(f) : true))
        .map((e) => ({ id: e.id, name: e.name }));
      return text({ type: args.type, count: rows.length, entities: rows });
    },
  );

  reg(
    'get_entity',
    {
      description: 'Get one entity (full GTM JSON) by name or id.',
      inputSchema: {
        container: ContainerAliasSchema,
        type: EntityTypeSchema,
        ref: z.string().min(1).max(255),
      },
    },
    async (args) => {
      const a = await s.actor.resolve();
      if (!a.success) return fail(a.error.message);
      const pulled = await a.data.gtm.pull(args.container);
      if (!pulled.success) return fail(pulled.error.message);
      const found = findExisting(pulled.data, args.type, { id: args.ref, name: args.ref });
      return found.success ? text(found.data.raw) : fail(found.error.message);
    },
  );

  reg(
    'get_examples',
    {
      description:
        'Representative valid examples of an entity type for clone-from-example authoring.',
      inputSchema: { container: ContainerAliasSchema, type: EntityTypeSchema },
    },
    async (args) => {
      const a = await s.actor.resolve();
      if (!a.success) return fail(a.error.message);
      const v = await a.data.gtm.getExamples(args.container, args.type);
      return v.success ? text(v.data.map((e) => e.raw)) : fail(v.error.message);
    },
  );

  reg(
    'export_container',
    {
      description:
        'Export the WHOLE container from the local mirror in ONE call (zero GTM API calls). mode=compact (default) keeps ids/names/types plus condition & reference fields and omits bulky blobs (tag html, custom-template code) behind {_omitted,length} markers; mode=full returns raw bodies verbatim. Prefer this over fetching entities one-by-one. Run pull first if the mirror is empty.',
      inputSchema: {
        container: ContainerAliasSchema,
        mode: z.enum(['compact', 'full']).optional(),
      },
    },
    async (args) => {
      const v = await exportContainer(
        { mirror: s.mirrorReader },
        args.container,
        args.mode ?? 'compact',
      );
      return v.success ? text(v.data) : fail(v.error.message);
    },
  );

  reg(
    'search_container',
    {
      description:
        'Search the local mirror (zero GTM API calls) for every entity whose full JSON contains the query string, case-insensitive. Finds entities that CARRY a value (e.g. a trigger condition equal to "daypass"), not just ones named for it — use this instead of fetching entities one-by-one. Returns matches with full bodies and which fields matched. Run pull first if the mirror is empty.',
      inputSchema: { container: ContainerAliasSchema, query: z.string().min(1).max(200) },
    },
    async (args) => {
      const v = await searchContainer({ mirror: s.mirrorReader }, args.container, args.query);
      return v.success ? text(v.data) : fail(v.error.message);
    },
  );

  reg(
    'workspace_status',
    {
      description:
        'Report the LIVE GTM workspace count vs the per-container limit (3, incl. Default). slotsFree reflects GTM reality (counts workspaces created in the UI too); pendingChangesets is our informational tally.',
      inputSchema: { container: ContainerAliasSchema },
    },
    async (args) => {
      const a = await s.actor.resolve();
      if (!a.success) return fail(a.error.message);
      const ws = await a.data.gtm.countWorkspaces(args.container);
      const pending = await s.changesets.countPending(args.container);
      if (!ws.success) return fail(ws.error.message);
      if (!pending.success) return fail(pending.error.message);
      return text({
        container: args.container,
        gtmWorkspaces: ws.data,
        limit: GTM_WORKSPACE_LIMIT,
        slotsFree: Math.max(0, GTM_WORKSPACE_LIMIT - ws.data),
        pendingChangesets: pending.data,
      });
    },
  );

  reg(
    'list_changesets',
    {
      description: 'List changesets, optionally filtered by container/status.',
      inputSchema: {
        container: ContainerAliasSchema.optional(),
        status: ChangesetStatusSchema.optional(),
      },
    },
    async (args) => {
      const v = await s.changesets.list({ container: args.container, status: args.status });
      if (!v.success) return fail(v.error.message);
      return text(
        v.data.map((c) => ({
          id: c.id,
          container: c.containerAlias,
          status: c.status,
          ops: c.operations.length,
          workspace: c.gtmWorkspaceId,
        })),
      );
    },
  );

  reg(
    'get_changeset',
    {
      description: 'Get a changeset with its operations, status and before-images.',
      inputSchema: { id: z.string().uuid() },
    },
    async (args) => {
      const v = await s.changesets.findById(args.id);
      if (!v.success) return fail(v.error.message);
      return v.data ? text(v.data) : fail('Changeset not found.');
    },
  );

  // ---------- Write / workflow ----------
  reg(
    'preview',
    {
      description:
        'Phase 1 of Apply: validate + drift-check a changeset, return a plain-language summary, dependency impacts, and a previewId.',
      inputSchema: { container: ContainerAliasSchema, operations: OperationsSchema },
    },
    async (args) => {
      const a = await s.actor.resolve();
      if (!a.success) return fail(a.error.message);
      const v = await previewChangeset(
        {
          gtm: a.data.gtm,
          previews: s.previews,
          now: s.now,
          newId: s.newId,
          previewTtlHours: s.previewTtlHours,
        },
        { author: a.data.collaborator, container: args.container, operations: args.operations },
      );
      if (!v.success) return fail(v.error.message);
      return text({
        previewId: v.data.id,
        container: v.data.container,
        summary: v.data.summary,
        impacts: v.data.impacts,
        expiresAt: v.data.expiresAt,
      });
    },
  );

  reg(
    'apply',
    {
      description:
        'Phase 2 of Apply: write a previewed changeset into a fresh ephemeral GTM workspace. Never publishes.',
      inputSchema: { previewId: z.string().uuid() },
    },
    async (args) => {
      const a = await s.actor.resolve();
      if (!a.success) return fail(a.error.message);
      const v = await applyChangeset(
        {
          gtm: a.data.gtm,
          previews: s.previews,
          changesets: s.changesets,
          now: s.now,
          newId: s.newId,
        },
        a.data.collaborator,
        args.previewId,
      );
      return v.success ? text(v.data) : fail(`[${v.error.code}] ${v.error.message}`);
    },
  );

  reg(
    'reject',
    {
      description: 'Reject a pending changeset and delete its workspace, freeing a slot.',
      inputSchema: { changesetId: z.string().uuid() },
    },
    async (args) => {
      const a = await s.actor.resolve();
      if (!a.success) return fail(a.error.message);
      const found = await s.changesets.findById(args.changesetId);
      if (!found.success) return fail(found.error.message);
      const cs = found.data;
      if (cs === null) return fail('Changeset not found.');
      if (cs.gtmWorkspaceId !== null) {
        const del = await a.data.gtm.deleteWorkspace(cs.containerAlias, cs.gtmWorkspaceId);
        if (!del.success) return fail(`Could not delete workspace: ${del.error.message}`);
      }
      const saved = await s.changesets.save({ ...cs, status: 'rejected' });
      return saved.success
        ? text({ changesetId: cs.id, status: 'rejected' })
        : fail(saved.error.message);
    },
  );

  reg(
    'inverse',
    {
      description:
        'Generate an inverse changeset from before-images (post-publish rollback helper).',
      inputSchema: { changesetId: z.string().uuid() },
    },
    () =>
      text(
        '[inverse] deferred — not part of this slice. Post-publish rollback: use GTM "publish previous version" for now (ADR 0006).',
      ),
  );

  // ---------- Observability (ADR 0010) ----------
  reg(
    'usage_stats',
    {
      description:
        'Admin-only. Usage + error counts grouped by collaborator and tool over the last sinceHours (default 24) — answers "usage per collaborator" and "is everything going right".',
      inputSchema: { sinceHours: z.number().int().positive().max(8760).optional() },
    },
    async (args) => {
      const a = await s.actor.resolve();
      if (!a.success) return fail(a.error.message);
      if (!isAdmin(a.data.collaborator)) return fail('usage_stats is admin-only.');
      const sinceHours = args.sinceHours ?? 24;
      const v = await s.toolCalls.usage(sinceHours);
      return v.success ? text({ sinceHours, usage: v.data }) : fail(v.error.message);
    },
  );

  // ---------- dataLayer catalog (ADR 0008) ----------
  const catalogNotConfigured = (): CallToolResult =>
    fail('dataLayer catalog not configured (set GITLAB_TOKEN + GITLAB_CATALOG_PROJECT_ID).');

  reg(
    'list_datalayer_events',
    {
      description:
        'List every dataLayer event name the site can emit. The CHEAP index — call this FIRST, then drill into one event with get_datalayer_event. Authoritative upstream schema (read-only).',
      inputSchema: {},
    },
    async () => {
      if (s.catalog === null) return catalogNotConfigured();
      const v = await s.catalog.listEvents();
      return v.success ? text(v.data) : fail(v.error.message);
    },
  );

  reg(
    'get_datalayer_event',
    {
      description:
        "Get ONE dataLayer event's shape. mode=compact (default) collapses fat string-unions and keeps referenced types as bare names; mode=full expands referenced types one level. Call list_datalayer_events first for valid names; drill referenced types with get_datalayer_type.",
      inputSchema: {
        name: z.string().min(1).max(200),
        mode: z.enum(['compact', 'full']).optional(),
      },
    },
    async (args) => {
      if (s.catalog === null) return catalogNotConfigured();
      const v = await s.catalog.getEvent(args.name, args.mode ?? 'compact');
      return v.success ? text(v.data) : fail(v.error.message);
    },
  );

  reg(
    'get_datalayer_type',
    {
      description:
        'Get ONE helper type from the catalog (a referenced DTO or enum), compacted. Use to walk a type referenced by an event without expanding the whole graph.',
      inputSchema: { name: z.string().min(1).max(200) },
    },
    async (args) => {
      if (s.catalog === null) return catalogNotConfigured();
      const v = await s.catalog.getType(args.name);
      return v.success ? text(v.data) : fail(v.error.message);
    },
  );
}

export const TOOL_NAMES = [
  'list_containers',
  'whoami',
  'pull',
  'list_entities',
  'get_entity',
  'get_examples',
  'export_container',
  'search_container',
  'workspace_status',
  'list_changesets',
  'get_changeset',
  'preview',
  'apply',
  'reject',
  'inverse',
  'usage_stats',
  'list_datalayer_events',
  'get_datalayer_event',
  'get_datalayer_type',
] as const;
