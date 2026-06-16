import { type ContainerState, type GtmEntitySnapshot } from '../ports/gtm-client.js';
import { type Operation, type EntityType } from '../value-objects/operation.js';
import { type ImpactEntry } from '../entities/preview.js';
import { findExisting } from './state-query.js';

function allSnapshots(state: ContainerState): GtmEntitySnapshot[] {
  return Object.values(state).flat();
}

function newName(op: Operation): string | undefined {
  const n = op.data?.name;
  return typeof n === 'string' ? n : undefined;
}

/**
 * Surface fan-out before a change is applied (ADR 0007 rider). A rename only
 * breaks *name-based* references — chiefly `{{Variable}}` tokens — because GTM
 * wires tags/triggers/folders by numeric id, which a rename preserves. Deleting
 * an entity breaks both name and id references.
 */
export function analyzeImpacts(
  operations: readonly Operation[],
  state: ContainerState,
): ImpactEntry[] {
  const impacts: ImpactEntry[] = [];
  const everything = allSnapshots(state);

  const consider = (
    kind: EntityType,
    oldName: string,
    selfId: string | null,
    verb: string,
  ): void => {
    const variableToken = `{{${oldName}}}`;
    for (const s of everything) {
      if (s.id !== null && s.id === selfId) continue; // skip the entity itself
      const serialized = JSON.stringify(s.raw);
      const refsByToken = kind === 'variable' && serialized.includes(variableToken);
      if (refsByToken) {
        impacts.push({
          kind: s.kind,
          name: s.name,
          id: s.id,
          reason: `references variable ${variableToken} (${verb} ${oldName})`,
        });
      }
    }
  };

  for (const op of operations) {
    if (op.target === undefined) continue;
    const found = findExisting(state, op.entity, op.target);
    if (!found.success) continue;
    const current = found.data;

    if (op.op === 'delete') {
      consider(op.entity, current.name, current.id, 'deleting');
      continue;
    }
    if (op.op === 'update') {
      const renamedTo = newName(op);
      if (renamedTo !== undefined && renamedTo !== current.name) {
        consider(op.entity, current.name, current.id, 'renaming');
      }
    }
  }
  return impacts;
}
