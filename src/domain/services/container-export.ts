import { type ContainerState, type GtmEntitySnapshot } from '../ports/gtm-client.js';
import { type EntityType } from '../value-objects/operation.js';

export type ExportMode = 'compact' | 'full';

export interface ExportEntity {
  readonly kind: EntityType;
  readonly id: string | null;
  readonly name: string;
  readonly fields: Record<string, unknown>;
}

/** Strings longer than this are blobs (tag html, custom-template code) → replaced with a marker. */
const MAX_STRING = 400;

/**
 * Top-level fields worth keeping in compact mode: the ones carrying conditions and
 * references an agent needs to find and plan changes. Everything else is dropped;
 * non-kept long-string blobs get an omission marker for transparency.
 */
const KEEP_TOP: ReadonlySet<string> = new Set([
  'type',
  'filter',
  'customEventFilter',
  'autoEventFilter',
  'parameter',
  'firingTriggerId',
  'blockingTriggerId',
  'enablingTriggerId',
  'disablingTriggerId',
  'setupTag',
  'teardownTag',
  'parentFolderId',
  'priority',
  'liveOnly',
  'paused',
  'tagFiringOption',
  'consentSettings',
  'variableType',
  'notes',
]);

const omit = (label: string, length: number): { _omitted: string; length: number } => ({
  _omitted: label,
  length,
});

function compactValue(value: unknown, label: string): unknown {
  if (typeof value === 'string')
    return value.length > MAX_STRING ? omit(label, value.length) : value;
  if (Array.isArray(value)) return value.map((item) => compactValue(item, label));
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // GTM parameter objects look like { type, key, value }: label an omitted value by its key.
    const keyLabel = typeof obj.key === 'string' ? obj.key : label;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = compactValue(v, k === 'value' ? keyLabel : k);
    }
    return out;
  }
  return value;
}

/** Keep condition/reference fields, drop bulky blobs (replace long strings with markers). */
export function compactRaw(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (KEEP_TOP.has(k)) out[k] = compactValue(v, k);
    else if (typeof v === 'string' && v.length > MAX_STRING) out[k] = omit(k, v.length);
    // otherwise dropped — not a condition/reference field
  }
  return out;
}

const toEntity = (s: GtmEntitySnapshot, mode: ExportMode): ExportEntity => ({
  kind: s.kind,
  id: s.id,
  name: s.name,
  fields: mode === 'full' ? s.raw : compactRaw(s.raw),
});

export function projectState(state: ContainerState, mode: ExportMode): ExportEntity[] {
  const out: ExportEntity[] = [];
  for (const snaps of Object.values(state)) {
    for (const s of snaps) out.push(toEntity(s, mode));
  }
  return out;
}

export function countByKind(state: ContainerState): Partial<Record<EntityType, number>> {
  const counts: Partial<Record<EntityType, number>> = {};
  for (const [kind, snaps] of Object.entries(state) as Array<[EntityType, readonly unknown[]]>) {
    if (snaps.length > 0) counts[kind] = snaps.length;
  }
  return counts;
}
