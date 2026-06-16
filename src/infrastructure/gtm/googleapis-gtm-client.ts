import { google, type tagmanager_v2 } from 'googleapis';
import { type OAuth2Client } from './google-oauth.js';
import {
  type GtmClient,
  type GtmEntitySnapshot,
  type GtmWorkspaceRef,
  type ContainerState,
  WorkspaceNotFoundError,
} from '../../domain/ports/gtm-client.js';
import { type ContainerAlias } from '../../domain/value-objects/container-alias.js';
import { type EntityType } from '../../domain/value-objects/operation.js';
import { KIND_META, kindsForContainer } from '../../domain/value-objects/entity-kind.js';
import { type Result, ok, err } from '../../shared/result.js';

export interface GtmContainerConfig {
  readonly accountId: string;
  readonly webContainerId: string;
  readonly serverContainerId: string;
}

type Tm = tagmanager_v2.Tagmanager;
type ListPage = { items: unknown[]; next?: string };

export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`Not implemented: ${what}`);
    this.name = 'NotImplementedError';
  }
}

function asRecord(item: unknown): Record<string, unknown> {
  return item as Record<string, unknown>;
}

/** A GTM API error is a 404 (resource gone) — read off the GaxiosError shape. */
function isNotFound(e: unknown): boolean {
  if (e === null || typeof e !== 'object') return false;
  const { code, status, response } = e as {
    code?: unknown;
    status?: unknown;
    response?: { status?: unknown };
  };
  return code === 404 || status === 404 || response?.status === 404;
}

/** GtmClient over GTM API v2, scoped to one collaborator's OAuth client. Never publishes (ADR 0003). */
export class GoogleApisGtmClient implements GtmClient {
  private readonly tm: Tm;

  constructor(
    auth: OAuth2Client,
    private readonly cfg: GtmContainerConfig,
  ) {
    this.tm = google.tagmanager({ version: 'v2', auth });
  }

  private containerId(alias: ContainerAlias): string {
    return alias === 'web' ? this.cfg.webContainerId : this.cfg.serverContainerId;
  }

  private containerPath(alias: ContainerAlias): string {
    return `accounts/${this.cfg.accountId}/containers/${this.containerId(alias)}`;
  }

  async describeAccess(alias: ContainerAlias): Promise<Result<{ containerPublicId: string }>> {
    try {
      const res = await this.tm.accounts.containers.get({ path: this.containerPath(alias) });
      return ok({ containerPublicId: res.data.publicId ?? this.containerId(alias) });
    } catch (e) {
      return err(e instanceof Error ? e : new Error('GTM access check failed.'));
    }
  }

  private async defaultWorkspace(alias: ContainerAlias): Promise<Result<GtmWorkspaceRef>> {
    try {
      const res = await this.tm.accounts.containers.workspaces.list({
        parent: this.containerPath(alias),
      });
      const workspaces = res.data.workspace ?? [];
      const chosen = workspaces.find((w) => w.name === 'Default Workspace') ?? workspaces[0];
      if (!chosen?.workspaceId) return err(new Error(`No workspace found on ${alias} container.`));
      const id = chosen.workspaceId;
      return ok({
        id,
        name: chosen.name ?? 'Default Workspace',
        path: chosen.path ?? `${this.containerPath(alias)}/workspaces/${id}`,
      });
    } catch (e) {
      return err(e instanceof Error ? e : new Error('Could not list workspaces.'));
    }
  }

  private async listPage(kind: EntityType, parent: string, pageToken?: string): Promise<ListPage> {
    const w = this.tm.accounts.containers.workspaces;
    switch (kind) {
      case 'tag': {
        const r = await w.tags.list({ parent, pageToken });
        return { items: r.data.tag ?? [], next: r.data.nextPageToken ?? undefined };
      }
      case 'trigger': {
        const r = await w.triggers.list({ parent, pageToken });
        return { items: r.data.trigger ?? [], next: r.data.nextPageToken ?? undefined };
      }
      case 'variable': {
        const r = await w.variables.list({ parent, pageToken });
        return { items: r.data.variable ?? [], next: r.data.nextPageToken ?? undefined };
      }
      case 'builtInVariable': {
        const r = await w.built_in_variables.list({ parent, pageToken });
        return { items: r.data.builtInVariable ?? [], next: r.data.nextPageToken ?? undefined };
      }
      case 'folder': {
        const r = await w.folders.list({ parent, pageToken });
        return { items: r.data.folder ?? [], next: r.data.nextPageToken ?? undefined };
      }
      case 'client': {
        const r = await w.clients.list({ parent, pageToken });
        return { items: r.data.client ?? [], next: r.data.nextPageToken ?? undefined };
      }
      case 'transformation': {
        const r = await w.transformations.list({ parent, pageToken });
        return { items: r.data.transformation ?? [], next: r.data.nextPageToken ?? undefined };
      }
      case 'customTemplate': {
        const r = await w.templates.list({ parent, pageToken });
        return { items: r.data.template ?? [], next: r.data.nextPageToken ?? undefined };
      }
    }
  }

  private toSnapshot(kind: EntityType, item: unknown): GtmEntitySnapshot {
    const r = asRecord(item);
    const idField = KIND_META[kind].idField;
    const idRaw = idField ? r[idField] : null;
    const id = typeof idRaw === 'string' ? idRaw : typeof idRaw === 'number' ? String(idRaw) : null;
    return {
      kind,
      id,
      name: typeof r.name === 'string' ? r.name : '(unnamed)',
      fingerprint: typeof r.fingerprint === 'string' ? r.fingerprint : '',
      path: typeof r.path === 'string' ? r.path : null,
      raw: r,
    };
  }

  private async listAll(kind: EntityType, parent: string): Promise<GtmEntitySnapshot[]> {
    const out: GtmEntitySnapshot[] = [];
    let token: string | undefined;
    do {
      const page = await this.listPage(kind, parent, token);
      for (const it of page.items) out.push(this.toSnapshot(kind, it));
      token = page.next;
    } while (token !== undefined);
    return out;
  }

  async pull(alias: ContainerAlias): Promise<Result<ContainerState>> {
    const ws = await this.defaultWorkspace(alias);
    if (!ws.success) return ws;
    try {
      const state: Partial<Record<EntityType, readonly GtmEntitySnapshot[]>> = {};
      for (const kind of kindsForContainer(alias)) {
        state[kind] = await this.listAll(kind, ws.data.path);
      }
      // ensure every kind key exists
      for (const kind of Object.keys(KIND_META) as EntityType[]) state[kind] ??= [];
      return ok(state as ContainerState);
    } catch (e) {
      return err(e instanceof Error ? e : new Error('GTM pull failed.'));
    }
  }

  async getExamples(
    alias: ContainerAlias,
    kind: EntityType,
  ): Promise<Result<readonly GtmEntitySnapshot[]>> {
    const ws = await this.defaultWorkspace(alias);
    if (!ws.success) return ws;
    try {
      const all = await this.listAll(kind, ws.data.path);
      return ok(all.slice(0, 5));
    } catch (e) {
      return err(e instanceof Error ? e : new Error('getExamples failed.'));
    }
  }

  async countWorkspaces(alias: ContainerAlias): Promise<Result<number>> {
    try {
      const res = await this.tm.accounts.containers.workspaces.list({
        parent: this.containerPath(alias),
      });
      return ok((res.data.workspace ?? []).length);
    } catch (e) {
      return err(e instanceof Error ? e : new Error('countWorkspaces failed.'));
    }
  }

  async createWorkspace(alias: ContainerAlias, name: string): Promise<Result<GtmWorkspaceRef>> {
    try {
      const res = await this.tm.accounts.containers.workspaces.create({
        parent: this.containerPath(alias),
        requestBody: { name },
      });
      const id = res.data.workspaceId;
      if (!id) return err(new Error('Workspace created but no id returned.'));
      return ok({
        id,
        name: res.data.name ?? name,
        path: res.data.path ?? `${this.containerPath(alias)}/workspaces/${id}`,
      });
    } catch (e) {
      return err(e instanceof Error ? e : new Error('createWorkspace failed (cap reached?).'));
    }
  }

  async deleteWorkspace(
    alias: ContainerAlias,
    workspaceId: string,
  ): Promise<Result<void, WorkspaceNotFoundError | Error>> {
    try {
      await this.tm.accounts.containers.workspaces.delete({
        path: `${this.containerPath(alias)}/workspaces/${workspaceId}`,
      });
      return ok(undefined);
    } catch (e) {
      // Already gone — surface as a typed not-found so discard stays idempotent (ADR 0011).
      if (isNotFound(e)) return err(new WorkspaceNotFoundError(workspaceId));
      return err(e instanceof Error ? e : new Error('deleteWorkspace failed.'));
    }
  }

  async createEntity(
    workspace: GtmWorkspaceRef,
    kind: EntityType,
    data: Record<string, unknown>,
  ): Promise<Result<GtmEntitySnapshot>> {
    const w = this.tm.accounts.containers.workspaces;
    const parent = workspace.path;
    try {
      switch (kind) {
        case 'tag':
          return ok(
            this.toSnapshot(kind, (await w.tags.create({ parent, requestBody: data })).data),
          );
        case 'trigger':
          return ok(
            this.toSnapshot(kind, (await w.triggers.create({ parent, requestBody: data })).data),
          );
        case 'variable':
          return ok(
            this.toSnapshot(kind, (await w.variables.create({ parent, requestBody: data })).data),
          );
        case 'folder':
          return ok(
            this.toSnapshot(kind, (await w.folders.create({ parent, requestBody: data })).data),
          );
        case 'client':
          return ok(
            this.toSnapshot(kind, (await w.clients.create({ parent, requestBody: data })).data),
          );
        case 'transformation':
          return ok(
            this.toSnapshot(
              kind,
              (await w.transformations.create({ parent, requestBody: data })).data,
            ),
          );
        case 'customTemplate':
          return ok(
            this.toSnapshot(kind, (await w.templates.create({ parent, requestBody: data })).data),
          );
        case 'builtInVariable':
          return err(new NotImplementedError('create builtInVariable (use enable endpoint)'));
      }
    } catch (e) {
      return err(e instanceof Error ? e : new Error('createEntity failed.'));
    }
  }

  async updateEntity(
    workspace: GtmWorkspaceRef,
    kind: EntityType,
    id: string,
    data: Record<string, unknown>,
  ): Promise<Result<GtmEntitySnapshot>> {
    const w = this.tm.accounts.containers.workspaces;
    const meta = KIND_META[kind];
    const path = `${workspace.path}/${meta.collection}/${id}`;
    try {
      switch (kind) {
        case 'tag':
          return ok(this.toSnapshot(kind, (await w.tags.update({ path, requestBody: data })).data));
        case 'trigger':
          return ok(
            this.toSnapshot(kind, (await w.triggers.update({ path, requestBody: data })).data),
          );
        case 'variable':
          return ok(
            this.toSnapshot(kind, (await w.variables.update({ path, requestBody: data })).data),
          );
        case 'folder':
          return ok(
            this.toSnapshot(kind, (await w.folders.update({ path, requestBody: data })).data),
          );
        case 'client':
          return ok(
            this.toSnapshot(kind, (await w.clients.update({ path, requestBody: data })).data),
          );
        case 'transformation':
          return ok(
            this.toSnapshot(
              kind,
              (await w.transformations.update({ path, requestBody: data })).data,
            ),
          );
        case 'customTemplate':
          return ok(
            this.toSnapshot(kind, (await w.templates.update({ path, requestBody: data })).data),
          );
        case 'builtInVariable':
          return err(new NotImplementedError('update builtInVariable'));
      }
    } catch (e) {
      return err(e instanceof Error ? e : new Error('updateEntity failed.'));
    }
  }

  async deleteEntity(
    workspace: GtmWorkspaceRef,
    kind: EntityType,
    id: string,
  ): Promise<Result<void>> {
    const w = this.tm.accounts.containers.workspaces;
    const meta = KIND_META[kind];
    const path = `${workspace.path}/${meta.collection}/${id}`;
    try {
      switch (kind) {
        case 'tag':
          await w.tags.delete({ path });
          return ok(undefined);
        case 'trigger':
          await w.triggers.delete({ path });
          return ok(undefined);
        case 'variable':
          await w.variables.delete({ path });
          return ok(undefined);
        case 'folder':
          await w.folders.delete({ path });
          return ok(undefined);
        case 'client':
          await w.clients.delete({ path });
          return ok(undefined);
        case 'transformation':
          await w.transformations.delete({ path });
          return ok(undefined);
        case 'customTemplate':
          await w.templates.delete({ path });
          return ok(undefined);
        case 'builtInVariable':
          return err(new NotImplementedError('delete builtInVariable'));
      }
    } catch (e) {
      return err(e instanceof Error ? e : new Error('deleteEntity failed.'));
    }
  }
}
