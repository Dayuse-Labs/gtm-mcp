import { type ContainerState, type GtmEntitySnapshot } from '../ports/gtm-client.js';
import { type EntityType, type EntityRef } from '../value-objects/operation.js';
import { type Result, ok, err } from '../../shared/result.js';

export class EntityNotFoundError extends Error {
  constructor(kind: EntityType, ref: EntityRef) {
    super(`No ${kind} matches reference ${JSON.stringify(ref)} in the current container state.`);
    this.name = 'EntityNotFoundError';
  }
}

export function snapshotsOf(state: ContainerState, kind: EntityType): readonly GtmEntitySnapshot[] {
  return state[kind] ?? [];
}

/**
 * Resolve an existing entity (update/delete target) against current state.
 * Tiers: numeric id, then unique name. `ref` placeholders are intra-changeset only
 * and never resolve against live state.
 */
export function findExisting(
  state: ContainerState,
  kind: EntityType,
  ref: EntityRef,
): Result<GtmEntitySnapshot, EntityNotFoundError> {
  const pool = snapshotsOf(state, kind);
  if (ref.id !== undefined) {
    const byId = pool.find((s) => s.id === ref.id);
    return byId ? ok(byId) : err(new EntityNotFoundError(kind, ref));
  }
  if (ref.name !== undefined) {
    const byName = pool.find((s) => s.name === ref.name);
    return byName ? ok(byName) : err(new EntityNotFoundError(kind, ref));
  }
  return err(new EntityNotFoundError(kind, ref));
}
