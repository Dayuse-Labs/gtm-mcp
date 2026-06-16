import { type ContainerState } from '../ports/gtm-client.js';
import { type Operation } from '../value-objects/operation.js';
import { type BaselineEntry } from '../entities/preview.js';
import { type Result, ok, err } from '../../shared/result.js';
import { findExisting, EntityNotFoundError } from './state-query.js';

/** Operations that act on a pre-existing entity (so they have a drift baseline). */
export function targetedOperations(operations: readonly Operation[]): Operation[] {
  return operations.filter(
    (o) => (o.op === 'update' || o.op === 'delete') && o.target !== undefined,
  );
}

/**
 * Build the fingerprint baseline at preview time. Fails if any targeted entity
 * cannot be found now (you can't update/delete what isn't there).
 */
export function buildBaseline(
  operations: readonly Operation[],
  state: ContainerState,
): Result<BaselineEntry[], EntityNotFoundError> {
  const baseline: BaselineEntry[] = [];
  for (const op of targetedOperations(operations)) {
    if (op.target === undefined) continue;
    const found = findExisting(state, op.entity, op.target);
    if (!found.success) return err(found.error);
    const s = found.data;
    if (s.id === null) continue; // type-keyed kinds carry no stable id baseline
    baseline.push({ kind: op.entity, id: s.id, name: s.name, fingerprint: s.fingerprint });
  }
  return ok(baseline);
}

export interface DriftFinding {
  readonly kind: BaselineEntry['kind'];
  readonly id: string;
  readonly name: string;
  readonly reason: 'deleted' | 'modified';
}

/** Compare the recorded baseline against a fresh pull (ADR 0006). Empty = no drift. */
export function detectDrift(
  baseline: readonly BaselineEntry[],
  fresh: ContainerState,
): DriftFinding[] {
  const findings: DriftFinding[] = [];
  for (const b of baseline) {
    const current = (fresh[b.kind] ?? []).find((s) => s.id === b.id);
    if (current === undefined) {
      findings.push({ kind: b.kind, id: b.id, name: b.name, reason: 'deleted' });
    } else if (current.fingerprint !== b.fingerprint) {
      findings.push({ kind: b.kind, id: b.id, name: current.name, reason: 'modified' });
    }
  }
  return findings;
}
