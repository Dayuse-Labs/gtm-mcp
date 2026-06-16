import {
  type GtmClient,
  type GtmEntitySnapshot,
  type GtmWorkspaceRef,
  type ContainerState,
  WorkspaceNotFoundError,
} from '../domain/ports/gtm-client.js';
import { type ContainerAlias } from '../domain/value-objects/container-alias.js';
import { type EntityType } from '../domain/value-objects/operation.js';
import { ALL_KINDS } from '../domain/value-objects/entity-kind.js';
import { type Collaborator } from '../domain/entities/collaborator.js';
import { type Preview } from '../domain/entities/preview.js';
import { type Changeset, type ChangesetStatus } from '../domain/entities/changeset.js';
import { type PreviewRepository } from '../domain/repositories/preview-repository.js';
import { type ChangesetRepository } from '../domain/repositories/changeset-repository.js';
import {
  type ToolCallRepository,
  type ToolCallRecord,
  type UsageRollup,
} from '../domain/repositories/tool-call-repository.js';
import { type Notifier, type ToolErrorAlert } from '../domain/ports/notifier.js';
import { type Result, ok, err } from '../shared/result.js';

export function emptyState(): ContainerState {
  const s: Partial<Record<EntityType, readonly GtmEntitySnapshot[]>> = {};
  for (const k of ALL_KINDS) s[k] = [];
  return s as ContainerState;
}

export function snap(
  kind: EntityType,
  id: string | null,
  name: string,
  fingerprint: string,
  raw: Record<string, unknown> = {},
): GtmEntitySnapshot {
  return {
    kind,
    id,
    name,
    fingerprint,
    path: id ? `ws/${kind}/${id}` : null,
    raw: { name, ...raw },
  };
}

export function stateWith(
  entries: Partial<Record<EntityType, GtmEntitySnapshot[]>>,
): ContainerState {
  return { ...emptyState(), ...entries };
}

export interface RecordedCall {
  readonly op: 'create' | 'update' | 'delete' | 'createWorkspace' | 'deleteWorkspace';
  readonly kind?: EntityType;
  readonly id?: string;
}

export class FakeGtmClient implements GtmClient {
  public calls: RecordedCall[] = [];
  /** When 'notFound', deleteWorkspace returns WorkspaceNotFoundError (already-gone case);
   *  when 'error', a generic failure (permission/other); when false, it succeeds. */
  public failDeleteWorkspace: false | 'notFound' | 'error' = false;
  private idSeq = 0;

  constructor(
    public state: ContainerState,
    public workspaceCount = 1,
  ) {}

  describeAccess(): Promise<Result<{ containerPublicId: string }>> {
    return Promise.resolve(ok({ containerPublicId: 'GTM-TEST' }));
  }
  pull(): Promise<Result<ContainerState>> {
    return Promise.resolve(ok(this.state));
  }
  getExamples(_c: ContainerAlias, kind: EntityType): Promise<Result<readonly GtmEntitySnapshot[]>> {
    return Promise.resolve(ok((this.state[kind] ?? []).slice(0, 5)));
  }
  countWorkspaces(): Promise<Result<number>> {
    return Promise.resolve(ok(this.workspaceCount));
  }
  createWorkspace(_c: ContainerAlias, name: string): Promise<Result<GtmWorkspaceRef>> {
    this.calls.push({ op: 'createWorkspace' });
    return Promise.resolve(
      ok({ id: 'ws-new', name, path: 'accounts/a/containers/c/workspaces/ws-new' }),
    );
  }
  deleteWorkspace(
    _c: ContainerAlias,
    id: string,
  ): Promise<Result<void, WorkspaceNotFoundError | Error>> {
    this.calls.push({ op: 'deleteWorkspace', id });
    if (this.failDeleteWorkspace === 'notFound')
      return Promise.resolve(err(new WorkspaceNotFoundError(id)));
    if (this.failDeleteWorkspace === 'error')
      return Promise.resolve(err(new Error('insufficient permissions to delete workspace')));
    return Promise.resolve(ok(undefined));
  }
  createEntity(
    _w: GtmWorkspaceRef,
    kind: EntityType,
    data: Record<string, unknown>,
  ): Promise<Result<GtmEntitySnapshot>> {
    this.idSeq += 1;
    const id = `new-${this.idSeq}`;
    this.calls.push({ op: 'create', kind, id });
    const name = typeof data.name === 'string' ? data.name : 'created';
    return Promise.resolve(ok(snap(kind, id, name, 'fp-new', data)));
  }
  updateEntity(
    _w: GtmWorkspaceRef,
    kind: EntityType,
    id: string,
    data: Record<string, unknown>,
  ): Promise<Result<GtmEntitySnapshot>> {
    this.calls.push({ op: 'update', kind, id });
    const name = typeof data.name === 'string' ? data.name : 'updated';
    return Promise.resolve(ok(snap(kind, id, name, 'fp-upd', data)));
  }
  deleteEntity(_w: GtmWorkspaceRef, kind: EntityType, id: string): Promise<Result<void>> {
    this.calls.push({ op: 'delete', kind, id });
    return Promise.resolve(ok(undefined));
  }
}

export class InMemoryPreviewRepository implements PreviewRepository {
  private store = new Map<string, Preview>();
  save(p: Preview): Promise<Result<Preview>> {
    this.store.set(p.id, p);
    return Promise.resolve(ok(p));
  }
  findById(id: string): Promise<Result<Preview | null>> {
    return Promise.resolve(ok(this.store.get(id) ?? null));
  }
  delete(id: string): Promise<Result<void>> {
    this.store.delete(id);
    return Promise.resolve(ok(undefined));
  }
}

export class InMemoryChangesetRepository implements ChangesetRepository {
  public store = new Map<string, Changeset>();
  save(c: Changeset): Promise<Result<Changeset>> {
    this.store.set(c.id, c);
    return Promise.resolve(ok(c));
  }
  findById(id: string): Promise<Result<Changeset | null>> {
    return Promise.resolve(ok(this.store.get(id) ?? null));
  }
  list(filter: {
    container?: ContainerAlias;
    status?: ChangesetStatus;
  }): Promise<Result<readonly Changeset[]>> {
    const rows = [...this.store.values()].filter(
      (c) =>
        (!filter.container || c.containerAlias === filter.container) &&
        (!filter.status || c.status === filter.status),
    );
    return Promise.resolve(ok(rows));
  }
  countPending(container: ContainerAlias): Promise<Result<number>> {
    const n = [...this.store.values()].filter(
      (c) => c.containerAlias === container && c.status === 'applied',
    ).length;
    return Promise.resolve(ok(n));
  }
}

export class InMemoryToolCallRepository implements ToolCallRepository {
  public records: ToolCallRecord[] = [];
  record(call: ToolCallRecord): Promise<Result<void>> {
    this.records.push(call);
    return Promise.resolve(ok(undefined));
  }
  usage(_sinceHours: number): Promise<Result<readonly UsageRollup[]>> {
    const groups = new Map<
      string,
      { email: string | null; tool: string; calls: number; errors: number; sum: number }
    >();
    for (const r of this.records) {
      const key = `${r.collaboratorId ?? 'null'}::${r.tool}`;
      const g = groups.get(key) ?? {
        email: r.collaboratorId,
        tool: r.tool,
        calls: 0,
        errors: 0,
        sum: 0,
      };
      g.calls += 1;
      if (r.outcome === 'error') g.errors += 1;
      g.sum += r.durationMs;
      groups.set(key, g);
    }
    const rows: UsageRollup[] = [...groups.values()].map((g) => ({
      collaboratorEmail: g.email,
      tool: g.tool,
      calls: g.calls,
      errors: g.errors,
      avgDurationMs: Math.round(g.sum / g.calls),
    }));
    return Promise.resolve(ok(rows));
  }
}

export class RecordingNotifier implements Notifier {
  public alerts: ToolErrorAlert[] = [];
  notifyToolError(alert: ToolErrorAlert): Promise<void> {
    this.alerts.push(alert);
    return Promise.resolve();
  }
}

export const collaborator = (over: Partial<Collaborator> = {}): Collaborator => ({
  id: 'author-1',
  googleSub: 'sub-1',
  email: 'author@dayuse.com',
  role: 'collaborator',
  ...over,
});

let seq = 0;
export const sequentialId = (): string => `id-${(seq += 1)}`;
export const fixedNow = (): Date => new Date('2026-06-15T00:00:00.000Z');
