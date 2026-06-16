import { type ContainerState } from '../ports/gtm-client.js';
import { type EntityType, type EntityRef } from '../value-objects/operation.js';
import { type Result, ok, err } from '../../shared/result.js';
import { findExisting } from './state-query.js';

export class UnresolvedReferenceError extends Error {
  constructor(kind: EntityType, ref: EntityRef) {
    super(`Could not resolve ${kind} reference ${JSON.stringify(ref)} to a GTM id.`);
    this.name = 'UnresolvedReferenceError';
  }
}

/** Carries placeholder ids assigned to entities created earlier in the same changeset. */
export interface RefContext {
  readonly state: ContainerState;
  readonly created: ReadonlyMap<string, string>;
}

/**
 * Three-tier reference resolution at apply time (ADR 0004):
 *   1. explicit numeric id
 *   2. intra-changeset placeholder ($ref assigned by an earlier create)
 *   3. existing entity matched by unique name in current state
 */
export function resolveTargetId(
  kind: EntityType,
  ref: EntityRef,
  ctx: RefContext,
): Result<string, UnresolvedReferenceError> {
  if (ref.id !== undefined) return ok(ref.id);
  if (ref.ref !== undefined) {
    const id = ctx.created.get(ref.ref);
    return id !== undefined ? ok(id) : err(new UnresolvedReferenceError(kind, ref));
  }
  if (ref.name !== undefined) {
    const found = findExisting(ctx.state, kind, ref);
    if (found.success && found.data.id !== null) return ok(found.data.id);
  }
  return err(new UnresolvedReferenceError(kind, ref));
}
