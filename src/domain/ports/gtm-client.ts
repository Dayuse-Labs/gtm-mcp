import { type ContainerAlias } from '../value-objects/container-alias.js';
import { type EntityType } from '../value-objects/operation.js';
import { type Result } from '../../shared/result.js';

/**
 * A single GTM entity as pulled from the API. `raw` is the verbatim GTM resource
 * (lossless, Q3); `fingerprint` powers fail-on-drift (ADR 0006).
 */
export interface GtmEntitySnapshot {
  readonly kind: EntityType;
  /** GTM numeric id (null for type-keyed kinds like built-in variables). */
  readonly id: string | null;
  readonly name: string;
  readonly fingerprint: string;
  /** Full GTM API resource path, when known. */
  readonly path: string | null;
  readonly raw: Record<string, unknown>;
}

/** Snapshot of one container's entities, grouped by kind. */
export type ContainerState = Readonly<Record<EntityType, readonly GtmEntitySnapshot[]>>;

export interface GtmWorkspaceRef {
  readonly id: string;
  readonly name: string;
  readonly path: string;
}

/**
 * Port over the Google Tag Manager API v2, scoped to one collaborator's OAuth token.
 * Implemented in infrastructure. Write paths target an ephemeral workspace (ADR 0005)
 * and NEVER publish (no publish scope — ADR 0003).
 */
export interface GtmClient {
  /** The collaborator's GTM access for a container (used by whoami). */
  describeAccess(container: ContainerAlias): Promise<Result<{ containerPublicId: string }>>;
  /** Pull current state from the container's default workspace into snapshots (ADR 0001). */
  pull(container: ContainerAlias): Promise<Result<ContainerState>>;
  /** Representative existing entities of a kind, for clone-from-example authoring (Q13). */
  getExamples(
    container: ContainerAlias,
    kind: EntityType,
  ): Promise<Result<readonly GtmEntitySnapshot[]>>;
  /** Total workspaces on the container — cap-guard input (ADR 0005). */
  countWorkspaces(container: ContainerAlias): Promise<Result<number>>;

  // --- write paths (apply only) ---
  createWorkspace(container: ContainerAlias, name: string): Promise<Result<GtmWorkspaceRef>>;
  deleteWorkspace(container: ContainerAlias, workspaceId: string): Promise<Result<void>>;
  createEntity(
    workspace: GtmWorkspaceRef,
    kind: EntityType,
    data: Record<string, unknown>,
  ): Promise<Result<GtmEntitySnapshot>>;
  updateEntity(
    workspace: GtmWorkspaceRef,
    kind: EntityType,
    id: string,
    data: Record<string, unknown>,
  ): Promise<Result<GtmEntitySnapshot>>;
  deleteEntity(workspace: GtmWorkspaceRef, kind: EntityType, id: string): Promise<Result<void>>;
}
