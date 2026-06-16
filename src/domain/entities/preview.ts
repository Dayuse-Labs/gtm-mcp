import { type ContainerAlias } from '../value-objects/container-alias.js';
import { type Operation } from '../value-objects/operation.js';
import { type EntityType } from '../value-objects/operation.js';

/** Recorded at preview time; re-checked at apply for fail-on-drift (ADR 0006). */
export interface BaselineEntry {
  readonly kind: EntityType;
  readonly id: string;
  readonly name: string;
  readonly fingerprint: string;
}

/** A dependent surfaced by rename/template fan-out analysis (ADR 0007 rider). */
export interface ImpactEntry {
  readonly kind: EntityType;
  readonly name: string;
  readonly id: string | null;
  readonly reason: string;
}

/**
 * The first phase of a two-phase Apply: a validated, drift-checked, summarised
 * changeset awaiting `apply(previewId)`.
 */
export interface Preview {
  readonly id: string;
  readonly authorId: string;
  readonly container: ContainerAlias;
  readonly operations: readonly Operation[];
  readonly summary: readonly string[];
  readonly impacts: readonly ImpactEntry[];
  readonly baseline: readonly BaselineEntry[];
  readonly createdAt: string;
  readonly expiresAt: string;
}
