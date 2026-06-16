import { type GtmClient, WorkspaceNotFoundError } from '../../domain/ports/gtm-client.js';
import { type ChangesetRepository } from '../../domain/repositories/changeset-repository.js';
import { type Collaborator } from '../../domain/entities/collaborator.js';
import { canActOn } from '../../domain/entities/changeset.js';
import { type Result, ok, err } from '../../shared/result.js';

export class DiscardError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'forbidden' | 'gtm_error',
  ) {
    super(message);
    this.name = 'DiscardError';
  }
}

export interface DiscardDeps {
  readonly gtm: GtmClient;
  readonly changesets: ChangesetRepository;
}

export interface DiscardView {
  readonly changesetId: string;
  readonly status: 'rejected';
  /** True when GTM reported the workspace already gone — reconciled, not deleted now. */
  readonly alreadyGone: boolean;
  readonly note: string;
}

/**
 * discard — delete the ephemeral GTM workspace an Apply created, freeing a slot, and
 * reconcile the Changeset to `rejected` (ADR 0005, 0011). This is the real implementation
 * behind the `reject` tool (previously an inline stub that erred on an already-gone workspace).
 *
 * Author-owned + Admin override (Q15 / ADR 0004): only the changeset author or an admin may
 * discard it. Idempotent: a GTM 404 (workspace already gone) is treated as success and the
 * status is still reconciled — never an error. Any other delete failure surfaces as `err`.
 */
export async function discardWorkspace(
  deps: DiscardDeps,
  actor: Collaborator,
  changesetId: string,
): Promise<Result<DiscardView, DiscardError>> {
  const found = await deps.changesets.findById(changesetId);
  if (!found.success) return err(new DiscardError('Could not load changeset.', 'gtm_error'));
  const changeset = found.data;
  if (changeset === null) return err(new DiscardError('Changeset not found.', 'not_found'));

  if (!canActOn(changeset, actor)) {
    return err(
      new DiscardError('Only the changeset author (or an admin) may discard it.', 'forbidden'),
    );
  }

  let alreadyGone = false;
  if (changeset.gtmWorkspaceId !== null) {
    const del = await deps.gtm.deleteWorkspace(changeset.containerAlias, changeset.gtmWorkspaceId);
    if (!del.success) {
      // Already gone (human published/deleted it, or a prior discard) — reconcile, don't error.
      if (del.error instanceof WorkspaceNotFoundError) {
        alreadyGone = true;
      } else {
        return err(
          new DiscardError(`Could not discard workspace: ${del.error.message}`, 'gtm_error'),
        );
      }
    }
  } else {
    // No workspace was ever recorded (e.g. a draft) — nothing to delete; just reconcile.
    alreadyGone = true;
  }

  const saved = await deps.changesets.save({ ...changeset, status: 'rejected' });
  if (!saved.success)
    return err(new DiscardError('Workspace discarded but status update failed.', 'gtm_error'));

  return ok({
    changesetId: changeset.id,
    status: 'rejected',
    alreadyGone,
    note: alreadyGone
      ? 'Workspace was already gone in GTM; changeset reconciled to rejected.'
      : 'Workspace discarded in GTM and a slot freed; changeset marked rejected.',
  });
}
