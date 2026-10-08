import { type GtmClient, type VersionMeta } from '../../domain/ports/gtm-client.js';
import { type ChangesetRepository } from '../../domain/repositories/changeset-repository.js';
import { type Changeset } from '../../domain/entities/changeset.js';
import { type Collaborator } from '../../domain/entities/collaborator.js';
import { authorizePublish } from '../../domain/services/role-policy.js';
import { baselineFromBeforeImages, detectDrift } from '../../domain/services/drift.js';
import { type Result, ok, err } from '../../shared/result.js';

export class PublishError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'forbidden'
      | 'not_found'
      | 'not_applied'
      | 'drift'
      | 'conflict'
      | 'compiler_error'
      | 'gtm_error',
  ) {
    super(message);
    this.name = 'PublishError';
  }
}

export interface PublishDeps {
  readonly gtm: GtmClient;
  readonly changesets: ChangesetRepository;
}

export interface PublishView {
  readonly changesetId: string;
  readonly container: Changeset['containerAlias'];
  readonly versionId: string;
  readonly versionName: string;
  readonly status: 'published';
}

const VERSION_NAME_MAX = 100;

export function versionMetaFor(changeset: Changeset, publisher: Collaborator): VersionMeta {
  const headline = changeset.summary[0] ?? `${changeset.operations.length} operation(s)`;
  const name = `AI ${changeset.id.slice(0, 8)} · ${headline}`;
  return {
    name: name.length > VERSION_NAME_MAX ? `${name.slice(0, VERSION_NAME_MAX - 1)}…` : name,
    notes: [
      `Changeset ${changeset.id}`,
      `Author ${changeset.authorId}`,
      `Published by ${publisher.email}`,
      '',
      ...changeset.summary,
    ].join('\n'),
  };
}

/** publish — cut a version from an applied changeset's workspace and make it live (ADR 0011). */
export async function publishChangeset(
  deps: PublishDeps,
  actor: Collaborator,
  changesetId: string,
): Promise<Result<PublishView, PublishError>> {
  const allowed = authorizePublish(actor);
  if (!allowed.success) return err(new PublishError(allowed.error.message, 'forbidden'));

  const found = await deps.changesets.findById(changesetId);
  if (!found.success) return err(new PublishError('Could not load changeset.', 'gtm_error'));
  const changeset = found.data;
  if (changeset === null) return err(new PublishError('Changeset not found.', 'not_found'));
  if (changeset.status !== 'applied' || changeset.gtmWorkspaceId === null) {
    return err(
      new PublishError(
        `Only an applied changeset can be published (this one is ${changeset.status}).`,
        'not_applied',
      ),
    );
  }

  const meta = versionMetaFor(changeset, actor);
  let versionId = changeset.gtmVersionId;
  if (versionId === null) {
    const fresh = await deps.gtm.pull(changeset.containerAlias);
    if (!fresh.success)
      return err(new PublishError(`Re-pull failed: ${fresh.error.message}`, 'gtm_error'));
    const drift = detectDrift(baselineFromBeforeImages(changeset.beforeImages ?? {}), fresh.data);
    if (drift.length > 0) {
      const detail = drift.map((d) => `${d.kind} «${d.name}» ${d.reason}`).join('; ');
      return err(
        new PublishError(
          `The live GTM version changed since this changeset was applied (${detail}). Reject it and rebuild.`,
          'drift',
        ),
      );
    }

    const created = await deps.gtm.createVersion(
      changeset.containerAlias,
      changeset.gtmWorkspaceId,
      meta,
    );
    if (!created.success)
      return err(
        new PublishError(`Could not create a version: ${created.error.message}`, 'gtm_error'),
      );
    if (created.data.kind === 'conflict') {
      return err(
        new PublishError(
          `The workspace conflicts with the live version (${created.data.reason}). Nothing was published; reject the changeset and rebuild it.`,
          'conflict',
        ),
      );
    }
    if (created.data.kind === 'compiler_error') {
      return err(
        new PublishError(
          'GTM reported a compiler error on the workspace. Nothing was published; fix it in the workspace or reject the changeset.',
          'compiler_error',
        ),
      );
    }
    versionId = created.data.versionId;
    // Persisted before publishing: create_version consumed the workspace, so a retry must reuse this version.
    const recorded = await deps.changesets.save({ ...changeset, gtmVersionId: versionId });
    if (!recorded.success)
      return err(
        new PublishError(
          `Version ${versionId} was created but could not be recorded; publish it in the GTM UI.`,
          'gtm_error',
        ),
      );
  }

  const published = await deps.gtm.publishVersion(changeset.containerAlias, versionId);
  if (!published.success)
    return err(
      new PublishError(
        `Version ${versionId} was created but publishing failed: ${published.error.message}. Retry publish.`,
        'gtm_error',
      ),
    );
  if (published.data.kind === 'compiler_error') {
    return err(
      new PublishError(
        `GTM reported a compiler error publishing version ${versionId}; it is not live.`,
        'compiler_error',
      ),
    );
  }

  const saved = await deps.changesets.save({
    ...changeset,
    status: 'published',
    gtmVersionId: published.data.versionId,
  });
  if (!saved.success)
    return err(
      new PublishError(
        `Version ${published.data.versionId} is live, but the changeset status could not be saved.`,
        'gtm_error',
      ),
    );

  return ok({
    changesetId: changeset.id,
    container: changeset.containerAlias,
    versionId: published.data.versionId,
    versionName: meta.name,
    status: 'published',
  });
}
