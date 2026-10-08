import { type Collaborator, isAdmin } from '../entities/collaborator.js';
import { type EntityType, type Operation } from '../value-objects/operation.js';
import { type Result, ok, err } from '../../shared/result.js';

/**
 * Container-wide blast radius: a template edit fans out to every entity built on it, and
 * clients/transformations reshape every server event before any tag sees it (ADR 0007).
 */
const ADMIN_ONLY_KINDS: ReadonlySet<EntityType> = new Set<EntityType>([
  'customTemplate',
  'client',
  'transformation',
]);

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export function authorizeOperations(
  actor: Collaborator,
  operations: readonly Operation[],
): Result<void, ForbiddenError> {
  if (isAdmin(actor)) return ok(undefined);
  const blocked = [...new Set(operations.map((o) => o.entity))].filter((k) =>
    ADMIN_ONLY_KINDS.has(k),
  );
  if (blocked.length === 0) return ok(undefined);
  return err(
    new ForbiddenError(
      `Only an admin may change ${blocked.join(', ')}. Ask an admin to apply this part of the change.`,
    ),
  );
}

export const canManageChangeset = (actor: Collaborator, authorId: string): boolean =>
  actor.id === authorId || isAdmin(actor);

export function authorizePublish(actor: Collaborator): Result<void, ForbiddenError> {
  if (isAdmin(actor)) return ok(undefined);
  return err(
    new ForbiddenError(
      'Only an admin may publish. Ask an admin to publish this changeset once it is verified in GTM Preview.',
    ),
  );
}
