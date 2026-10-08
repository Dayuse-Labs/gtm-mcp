import { type ContainerAlias } from '../value-objects/container-alias.js';
import { type Operation } from '../value-objects/operation.js';
import { type Collaborator, isAdmin } from './collaborator.js';

/**
 * Changeset lifecycle (ADR 0004, 0005, 0006):
 *   draft -> previewed -> applied -> published (admin `publish` tool, ADR 0011)
 *                                 \-> rejected (workspace deleted, slot freed)
 */
export type ChangesetStatus = 'draft' | 'previewed' | 'applied' | 'rejected' | 'published';

export interface Changeset {
  readonly id: string;
  readonly authorId: string;
  readonly containerAlias: ContainerAlias;
  readonly planId: string | null;
  readonly status: ChangesetStatus;
  readonly operations: readonly Operation[];
  /** Plain-language, field-level change summary from preview (ADR 0006) — kept so get_changeset shows the real edits. */
  readonly summary: readonly string[];
  /** Captured at Apply for rollback + audit (ADR 0006). */
  readonly beforeImages: Record<string, unknown> | null;
  /** Ephemeral GTM workspace created at Apply (ADR 0005). */
  readonly gtmWorkspaceId: string | null;
  /** Container version cut from the workspace at publish; set before the publish call so a failed publish can be retried. */
  readonly gtmVersionId: string | null;
}

/**
 * Author-owned + Admin override (Q15). Only the author or an Admin may Apply/reject;
 * Apply itself runs under the actor's own GTM token.
 */
export function canActOn(changeset: Changeset, actor: Collaborator): boolean {
  return changeset.authorId === actor.id || isAdmin(actor);
}
