import { type Operation } from '../value-objects/operation.js';
import { type Result, ok, err } from '../../shared/result.js';

/**
 * Intra-changeset reference placeholders embedded in an operation's `data` body
 * (ADR 0004). A string whose ENTIRE value is `$ref:NAME` is replaced at Apply time
 * with the real GTM id of the entity created earlier in the same changeset under
 * `assignRef: "NAME"`. This is what lets a tag created in one operation fire on a
 * trigger created in an earlier operation of the same changeset, e.g.
 *   { op: 'create', entity: 'trigger', assignRef: 'trig_hpv', data: {...} }
 *   { op: 'create', entity: 'tag',     data: { firingTriggerId: ['$ref:trig_hpv'] } }
 *
 * The `target` field uses the structured `{ ref }` form instead (see
 * reference-resolution.ts); this module covers the `data` body only.
 */
const REF_PREFIX = '$ref:';

export class UnresolvedDataRefError extends Error {
  constructor(name: string) {
    super(`Unresolved $ref:${name} in operation data — no earlier create assigned that ref.`);
    this.name = 'UnresolvedDataRefError';
  }
}

/** The ref name if `value` is exactly a `$ref:NAME` token, else null. */
function refName(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith(REF_PREFIX)) return null;
  const name = value.slice(REF_PREFIX.length);
  return name.length > 0 ? name : null;
}

/** Every distinct `$ref:NAME` name referenced anywhere inside a data body. */
export function collectDataRefs(data: unknown): string[] {
  const names = new Set<string>();
  const walk = (node: unknown): void => {
    const name = refName(node);
    if (name !== null) {
      names.add(name);
      return;
    }
    if (Array.isArray(node)) node.forEach(walk);
    else if (node !== null && typeof node === 'object')
      Object.values(node as Record<string, unknown>).forEach(walk);
  };
  walk(data);
  return [...names];
}

/**
 * Deep-clone `data`, replacing every `$ref:NAME` token with `created.get(NAME)`.
 * Errors if any referenced name is absent from `created`.
 */
export function substituteDataRefs(
  data: Record<string, unknown>,
  created: ReadonlyMap<string, string>,
): Result<Record<string, unknown>, UnresolvedDataRefError> {
  let failed: string | null = null;
  const walk = (node: unknown): unknown => {
    const name = refName(node);
    if (name !== null) {
      const id = created.get(name);
      if (id === undefined) {
        failed ??= name;
        return node;
      }
      return id;
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node !== null && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) out[k] = walk(v);
      return out;
    }
    return node;
  };
  const result = walk(data) as Record<string, unknown>;
  if (failed !== null) return err(new UnresolvedDataRefError(failed));
  return ok(result);
}

/**
 * Preview-time validation: every `$ref:NAME` used in a `data` body must match an
 * `assignRef` on a create operation that appears EARLIER in the array. Fails fast so
 * a bad changeset is rejected before any workspace is created.
 */
export function validateDataRefs(
  operations: readonly Operation[],
): Result<void, UnresolvedDataRefError> {
  const assignedSoFar = new Set<string>();
  for (const op of operations) {
    for (const name of collectDataRefs(op.data)) {
      if (!assignedSoFar.has(name)) return err(new UnresolvedDataRefError(name));
    }
    if (op.op === 'create' && op.assignRef !== undefined) assignedSoFar.add(op.assignRef);
  }
  return ok(undefined);
}
