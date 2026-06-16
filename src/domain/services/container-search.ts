import { type ContainerState } from '../ports/gtm-client.js';
import { type EntityType } from '../value-objects/operation.js';

export interface SearchHit {
  readonly kind: EntityType;
  readonly id: string | null;
  readonly name: string;
  /** Top-level fields of the entity whose JSON contained the query. */
  readonly matchedFields: string[];
  readonly raw: Record<string, unknown>;
}

/**
 * Case-insensitive substring search across each entity's FULL json. Finds entities that
 * CARRY a value (e.g. a trigger condition `== daypass`), not just those named for it.
 */
export function searchState(state: ContainerState, query: string): SearchHit[] {
  const q = query.toLowerCase();
  const hits: SearchHit[] = [];
  for (const snaps of Object.values(state)) {
    for (const s of snaps) {
      const matched: string[] = [];
      for (const [field, value] of Object.entries(s.raw)) {
        if ((JSON.stringify(value) ?? '').toLowerCase().includes(q)) matched.push(field);
      }
      if (matched.length > 0) {
        hits.push({ kind: s.kind, id: s.id, name: s.name, matchedFields: matched, raw: s.raw });
      }
    }
  }
  return hits;
}
