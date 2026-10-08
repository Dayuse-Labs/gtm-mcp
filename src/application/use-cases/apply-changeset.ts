import {
  type GtmClient,
  type GtmWorkspaceRef,
  type ContainerState,
} from '../../domain/ports/gtm-client.js';
import { type ContainerAlias } from '../../domain/value-objects/container-alias.js';
import { type PreviewRepository } from '../../domain/repositories/preview-repository.js';
import { type ChangesetRepository } from '../../domain/repositories/changeset-repository.js';
import { type Changeset } from '../../domain/entities/changeset.js';
import { type Collaborator } from '../../domain/entities/collaborator.js';
import { authorizeOperations, canManageChangeset } from '../../domain/services/role-policy.js';
import { type Operation } from '../../domain/value-objects/operation.js';
import { detectDrift } from '../../domain/services/drift.js';
import { findExisting } from '../../domain/services/state-query.js';
import { resolveTargetId, type RefContext } from '../../domain/services/reference-resolution.js';
import { substituteDataRefs } from '../../domain/services/data-refs.js';
import { type Result, ok, err } from '../../shared/result.js';

export class ApplyError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'expired' | 'forbidden' | 'drift' | 'cap_reached' | 'gtm_error',
  ) {
    super(message);
    this.name = 'ApplyError';
  }
}

/**
 * GTM free-plan hard cap: 3 workspaces per container, incl. the permanent Default (ADR 0005).
 * The cap is enforced against the LIVE GTM workspace count (not our DB changeset count) so it
 * stays correct when humans publish/delete agent workspaces or create their own in the UI.
 */
export const GTM_WORKSPACE_LIMIT = 3;

export interface ApplyDeps {
  readonly gtm: GtmClient;
  readonly previews: PreviewRepository;
  readonly changesets: ChangesetRepository;
  readonly now: () => Date;
  readonly newId: () => string;
}

export interface ApplyView {
  readonly changesetId: string;
  readonly workspace: GtmWorkspaceRef;
  readonly summary: readonly string[];
  readonly note: string;
}

function beforeImages(
  operations: readonly Operation[],
  state: ContainerState,
): Record<string, unknown> {
  const images: Record<string, unknown> = {};
  for (const op of operations) {
    if (op.target === undefined) continue;
    const found = findExisting(state, op.entity, op.target);
    if (found.success && found.data.id !== null)
      images[`${op.entity}:${found.data.id}`] = found.data.raw;
  }
  return images;
}

/** apply — phase 2: write a previewed changeset into a fresh ephemeral workspace (ADR 0005/0006). Does not publish. */
export async function applyChangeset(
  deps: ApplyDeps,
  actor: Collaborator,
  previewId: string,
): Promise<Result<ApplyView, ApplyError>> {
  const found = await deps.previews.findById(previewId);
  if (!found.success) return err(new ApplyError('Could not load preview.', 'gtm_error'));
  const preview = found.data;
  if (preview === null)
    return err(new ApplyError('Preview not found or expired — re-run preview.', 'expired'));

  if (!canManageChangeset(actor, preview.authorId)) {
    return err(
      new ApplyError('Only the changeset author (or an admin) may apply it.', 'forbidden'),
    );
  }
  // Re-checked here because an admin may apply someone else's preview, and roles can change after preview.
  const allowed = authorizeOperations(actor, preview.operations);
  if (!allowed.success) return err(new ApplyError(allowed.error.message, 'forbidden'));

  // Fail-on-drift: re-pull and compare fingerprints against the preview baseline.
  const fresh = await deps.gtm.pull(preview.container);
  if (!fresh.success)
    return err(new ApplyError(`Re-pull failed: ${fresh.error.message}`, 'gtm_error'));
  const drift = detectDrift(preview.baseline, fresh.data);
  if (drift.length > 0) {
    const detail = drift.map((d) => `${d.kind} «${d.name}» ${d.reason}`).join('; ');
    return err(
      new ApplyError(
        `GTM changed since this preview was built (${detail}). Rebuild the changeset.`,
        'drift',
      ),
    );
  }

  // Cap-guard (ADR 0005): refuse before creating a workspace, against the LIVE GTM count
  // (covers human-published/deleted agent workspaces and workspaces created in the UI).
  const wsCount = await deps.gtm.countWorkspaces(preview.container);
  if (!wsCount.success)
    return err(new ApplyError('Could not check GTM workspace count.', 'gtm_error'));
  if (wsCount.data >= GTM_WORKSPACE_LIMIT) {
    return err(
      new ApplyError(
        `Container ${preview.container} is at GTM's ${GTM_WORKSPACE_LIMIT}-workspace limit (incl. workspaces created in the UI) — publish or delete one in GTM first.`,
        'cap_reached',
      ),
    );
  }

  const changesetId = deps.newId();
  const ws = await deps.gtm.createWorkspace(
    preview.container,
    `AI ${changesetId.slice(0, 8)} · ${actor.email}`,
  );
  if (!ws.success)
    return err(new ApplyError(`Could not create workspace: ${ws.error.message}`, 'gtm_error'));
  const workspace = ws.data;

  const images = beforeImages(preview.operations, fresh.data);
  const created = new Map<string, string>();

  for (const op of preview.operations) {
    const ctx: RefContext = { state: fresh.data, created };
    const dataRefs = substituteDataRefs(op.data ?? {}, created);
    if (!dataRefs.success)
      return rollback(deps, preview.container, workspace, dataRefs.error.message);
    const data = dataRefs.data;
    if (op.op === 'create') {
      const res = await deps.gtm.createEntity(workspace, op.entity, data);
      if (!res.success)
        return rollback(
          deps,
          preview.container,
          workspace,
          `create ${op.entity}: ${res.error.message}`,
        );
      if (op.assignRef !== undefined && res.data.id !== null)
        created.set(op.assignRef, res.data.id);
    } else if (op.target !== undefined) {
      const idRes = resolveTargetId(op.entity, op.target, ctx);
      if (!idRes.success) return rollback(deps, preview.container, workspace, idRes.error.message);
      if (op.op === 'update') {
        const res = await deps.gtm.updateEntity(workspace, op.entity, idRes.data, data);
        if (!res.success)
          return rollback(
            deps,
            preview.container,
            workspace,
            `update ${op.entity}: ${res.error.message}`,
          );
      } else {
        const res = await deps.gtm.deleteEntity(workspace, op.entity, idRes.data);
        if (!res.success)
          return rollback(
            deps,
            preview.container,
            workspace,
            `delete ${op.entity}: ${res.error.message}`,
          );
      }
    }
  }

  const changeset: Changeset = {
    id: changesetId,
    authorId: actor.id,
    containerAlias: preview.container,
    planId: null,
    status: 'applied',
    operations: preview.operations,
    summary: preview.summary,
    beforeImages: images,
    gtmWorkspaceId: workspace.id,
    gtmVersionId: null,
  };
  const saved = await deps.changesets.save(changeset);
  if (!saved.success)
    return rollback(deps, preview.container, workspace, 'failed to persist changeset');

  await deps.previews.delete(previewId);
  return ok({
    changesetId,
    workspace,
    summary: preview.summary,
    note: 'Applied to a workspace. Verify it in GTM Preview; only then may an admin publish it (publish tool or GTM UI).',
  });
}

async function rollback(
  deps: ApplyDeps,
  container: ContainerAlias,
  ws: GtmWorkspaceRef,
  reason: string,
): Promise<Result<never, ApplyError>> {
  await deps.gtm.deleteWorkspace(container, ws.id);
  return err(new ApplyError(`Apply failed (${reason}); workspace discarded.`, 'gtm_error'));
}
