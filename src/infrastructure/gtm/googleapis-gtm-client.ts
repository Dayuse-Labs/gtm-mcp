import { google, type tagmanager_v2 } from 'googleapis';
import { type OAuth2Client } from './google-oauth.js';
import {
  type GtmClient,
  type GtmEntitySnapshot,
  type GtmWorkspaceRef,
  type ContainerState,
  type VersionCreation,
  type VersionMeta,
  type VersionPublication,
} from '../../domain/ports/gtm-client.js';
import {
  type ContainerAlias,
  type ContainerIds,
  resolveContainerId,
} from '../../domain/value-objects/container-alias.js';
import { type EntityType } from '../../domain/value-objects/operation.js';
import { ALL_KINDS, KIND_META, kindsForContainer } from '../../domain/value-objects/entity-kind.js';
import { type Result, ok, err } from '../../shared/result.js';
import { withQuotaRetry, httpStatus, isQuotaError } from './quota-retry.js';

export interface GtmContainerConfig {
  readonly accountId: string;
  readonly containerIds: ContainerIds;
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

/** GtmClient over GTM API v2, scoped to one collaborator's OAuth client. */
export class GoogleApisGtmClient implements GtmClient {
  private readonly tm: Tm;

  constructor(
    auth: OAuth2Client,
    private readonly cfg: GtmContainerConfig,
  ) {
    this.tm = google.tagmanager({ version: 'v2', auth });
  }

  /** Throws on an unconfigured alias; every caller runs inside a try that turns it into an err. */
  private containerId(alias: ContainerAlias): string {
    const id = resolveContainerId(this.cfg.containerIds, alias);
    if (!id.success) throw id.error;
    return id.data;
  }

  private containerPath(alias: ContainerAlias): string {
    return `accounts/${this.cfg.accountId}/containers/${this.containerId(alias)}`;
  }

  async describeAccess(alias: ContainerAlias): Promise<Result<{ containerPublicId: string }>> {
    try {
      const res = await withQuotaRetry(() =>
        this.tm.accounts.containers.get({ path: this.containerPath(alias) }),
      );
      return ok({ containerPublicId: res.data.publicId ?? this.containerId(alias) });
    } catch (e) {
      return err(e instanceof Error ? e : new Error('GTM access check failed.'));
    }
  }

  private async defaultWorkspace(alias: ContainerAlias): Promise<Result<GtmWorkspaceRef>> {
    try {
      const res = await withQuotaRetry(() =>
        this.tm.accounts.containers.workspaces.list({ parent: this.containerPath(alias) }),
      );
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
      const pageToken = token;
      const page = await withQuotaRetry(() => this.listPage(kind, parent, pageToken));
      for (const it of page.items) out.push(this.toSnapshot(kind, it));
      token = page.next;
    } while (token !== undefined);
    return out;
  }

  /**
   * Reads the PUBLISHED version: apply builds each workspace from it, and the Default
   * Workspace can hold a human's unpublished edits that are not live.
   */
  async pull(alias: ContainerAlias): Promise<Result<ContainerState>> {
    try {
      const live = await withQuotaRetry(() =>
        this.tm.accounts.containers.versions.live({ parent: this.containerPath(alias) }),
      );
      const version = live.data as unknown as Record<string, unknown>;
      const allowed = new Set(kindsForContainer(alias));
      const state: Partial<Record<EntityType, readonly GtmEntitySnapshot[]>> = {};
      for (const kind of ALL_KINDS) {
        const items = allowed.has(kind) ? version[kind] : undefined;
        state[kind] = Array.isArray(items) ? items.map((it) => this.toSnapshot(kind, it)) : [];
      }
      return ok(state as ContainerState);
    } catch (e) {
      if (httpStatus(e) === 404) return this.pullDefaultWorkspace(alias);
      return err(e instanceof Error ? e : new Error('GTM pull failed.'));
    }
  }

  /** Fallback for a container that has never been published. */
  private async pullDefaultWorkspace(alias: ContainerAlias): Promise<Result<ContainerState>> {
    const ws = await this.defaultWorkspace(alias);
    if (!ws.success) return ws;
    try {
      const state: Partial<Record<EntityType, readonly GtmEntitySnapshot[]>> = {};
      for (const kind of kindsForContainer(alias)) {
        state[kind] = await this.listAll(kind, ws.data.path);
      }
      for (const kind of ALL_KINDS) state[kind] ??= [];
      return ok(state as ContainerState);
    } catch (e) {
      return err(e instanceof Error ? e : new Error('GTM pull failed.'));
    }
  }

  async getExamples(
    alias: ContainerAlias,
    kind: EntityType,
  ): Promise<Result<readonly GtmEntitySnapshot[]>> {
    const pulled = await this.pull(alias);
    return pulled.success ? ok(pulled.data[kind].slice(0, 5)) : pulled;
  }

  async countWorkspaces(alias: ContainerAlias): Promise<Result<number>> {
    try {
      const res = await withQuotaRetry(() =>
        this.tm.accounts.containers.workspaces.list({ parent: this.containerPath(alias) }),
      );
      return ok((res.data.workspace ?? []).length);
    } catch (e) {
      return err(e instanceof Error ? e : new Error('countWorkspaces failed.'));
    }
  }

  async createWorkspace(alias: ContainerAlias, name: string): Promise<Result<GtmWorkspaceRef>> {
    try {
      const res = await withQuotaRetry(() =>
        this.tm.accounts.containers.workspaces.create({
          parent: this.containerPath(alias),
          requestBody: { name },
        }),
      );
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

  async deleteWorkspace(alias: ContainerAlias, workspaceId: string): Promise<Result<void>> {
    try {
      await withQuotaRetry(() =>
        this.tm.accounts.containers.workspaces.delete({
          path: `${this.containerPath(alias)}/workspaces/${workspaceId}`,
        }),
      );
      return ok(undefined);
    } catch (e) {
      // Already deleted (or published, which consumes the workspace) in the GTM UI.
      // GTM answers 404 for some of those and 500 "internal error" for others.
      if (httpStatus(e) === 404 || (await this.workspaceIsGone(alias, workspaceId))) {
        return ok(undefined);
      }
      return err(e instanceof Error ? e : new Error('deleteWorkspace failed.'));
    }
  }

  private async workspaceIsGone(alias: ContainerAlias, workspaceId: string): Promise<boolean> {
    try {
      const res = await withQuotaRetry(() =>
        this.tm.accounts.containers.workspaces.list({ parent: this.containerPath(alias) }),
      );
      return !(res.data.workspace ?? []).some((w) => w.workspaceId === workspaceId);
    } catch {
      return false;
    }
  }

  async createVersion(
    alias: ContainerAlias,
    workspaceId: string,
    meta: VersionMeta,
  ): Promise<Result<VersionCreation>> {
    try {
      const res = await withQuotaRetry(() =>
        this.tm.accounts.containers.workspaces.create_version({
          path: `${this.containerPath(alias)}/workspaces/${workspaceId}`,
          requestBody: { name: meta.name, notes: meta.notes },
        }),
      );
      const sync = res.data.syncStatus;
      if (sync?.mergeConflict === true) return ok({ kind: 'conflict', reason: 'merge_conflict' });
      if (sync?.syncError === true) return ok({ kind: 'conflict', reason: 'sync_error' });
      if (res.data.compilerError === true) return ok({ kind: 'compiler_error' });
      const versionId = res.data.containerVersion?.containerVersionId;
      if (!versionId) return err(new Error('Version created but no version id returned.'));
      return ok({ kind: 'created', versionId });
    } catch (e) {
      return err(e instanceof Error ? e : new Error('createVersion failed.'));
    }
  }

  async publishVersion(
    alias: ContainerAlias,
    versionId: string,
  ): Promise<Result<VersionPublication>> {
    try {
      const res = await withQuotaRetry(() =>
        this.tm.accounts.containers.versions.publish({
          path: `${this.containerPath(alias)}/versions/${versionId}`,
        }),
      );
      if (res.data.compilerError === true) return ok({ kind: 'compiler_error' });
      return ok({
        kind: 'published',
        versionId: res.data.containerVersion?.containerVersionId ?? versionId,
      });
    } catch (e) {
      return err(e instanceof Error ? e : new Error('publishVersion failed.'));
    }
  }

  private async retryOnQuota<T>(once: () => Promise<Result<T>>): Promise<Result<T>> {
    try {
      return await withQuotaRetry(async () => {
        const r = await once();
        if (!r.success && isQuotaError(r.error)) throw r.error;
        return r;
      });
    } catch (e) {
      return err(e instanceof Error ? e : new Error('GTM call failed.'));
    }
  }

  createEntity(
    workspace: GtmWorkspaceRef,
    kind: EntityType,
    data: Record<string, unknown>,
  ): Promise<Result<GtmEntitySnapshot>> {
    return this.retryOnQuota(() => this.createEntityOnce(workspace, kind, data));
  }

  updateEntity(
    workspace: GtmWorkspaceRef,
    kind: EntityType,
    id: string,
    data: Record<string, unknown>,
  ): Promise<Result<GtmEntitySnapshot>> {
    return this.retryOnQuota(() => this.updateEntityOnce(workspace, kind, id, data));
  }

  deleteEntity(workspace: GtmWorkspaceRef, kind: EntityType, id: string): Promise<Result<void>> {
    return this.retryOnQuota(() => this.deleteEntityOnce(workspace, kind, id));
  }

  private async createEntityOnce(
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

  private async updateEntityOnce(
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

  private async deleteEntityOnce(
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
