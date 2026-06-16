import { type GtmClient } from '../../domain/ports/gtm-client.js';
import { type PreviewRepository } from '../../domain/repositories/preview-repository.js';
import { type Preview } from '../../domain/entities/preview.js';
import { type Collaborator } from '../../domain/entities/collaborator.js';
import { type ContainerAlias } from '../../domain/value-objects/container-alias.js';
import { type Operation } from '../../domain/value-objects/operation.js';
import { kindsForContainer } from '../../domain/value-objects/entity-kind.js';
import { buildBaseline } from '../../domain/services/drift.js';
import { analyzeImpacts } from '../../domain/services/impact-analysis.js';
import { summarize } from '../../domain/services/operation-summary.js';
import { type Result, ok, err } from '../../shared/result.js';

export class ChangesetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChangesetValidationError';
  }
}

export interface PreviewDeps {
  readonly gtm: GtmClient;
  readonly previews: PreviewRepository;
  readonly now: () => Date;
  readonly newId: () => string;
  readonly previewTtlHours: number;
}

export interface PreviewInput {
  readonly author: Collaborator;
  readonly container: ContainerAlias;
  readonly operations: readonly Operation[];
}

function validateShape(input: PreviewInput): Result<void, ChangesetValidationError> {
  const allowed = new Set(kindsForContainer(input.container));
  for (const op of input.operations) {
    if (!allowed.has(op.entity)) {
      return err(
        new ChangesetValidationError(
          `${op.entity} is not valid in the ${input.container} container.`,
        ),
      );
    }
    if ((op.op === 'update' || op.op === 'delete') && op.target === undefined) {
      return err(new ChangesetValidationError(`${op.op} ${op.entity} requires a target.`));
    }
    if (op.op === 'create' && op.data === undefined) {
      return err(new ChangesetValidationError(`create ${op.entity} requires data.`));
    }
  }
  return ok(undefined);
}

/** preview — phase 1 of Apply: validate, drift-baseline, impact-analyse, summarise (ADR 0006). */
export async function previewChangeset(
  deps: PreviewDeps,
  input: PreviewInput,
): Promise<Result<Preview>> {
  const shape = validateShape(input);
  if (!shape.success) return shape;

  const pulled = await deps.gtm.pull(input.container);
  if (!pulled.success) return pulled;
  const state = pulled.data;

  const baseline = buildBaseline(input.operations, state);
  if (!baseline.success) return baseline;

  const impacts = analyzeImpacts(input.operations, state);
  const summary = summarize(input.operations, state);

  const created = deps.now();
  const expires = new Date(created.getTime() + deps.previewTtlHours * 3_600_000);
  const preview: Preview = {
    id: deps.newId(),
    authorId: input.author.id,
    container: input.container,
    operations: input.operations,
    summary,
    impacts,
    baseline: baseline.data,
    createdAt: created.toISOString(),
    expiresAt: expires.toISOString(),
  };
  return deps.previews.save(preview);
}
