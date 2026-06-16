import { type MirrorReader } from '../../domain/ports/mirror-reader.js';
import { type ContainerAlias } from '../../domain/value-objects/container-alias.js';
import { type EntityType } from '../../domain/value-objects/operation.js';
import {
  type ExportEntity,
  type ExportMode,
  countByKind,
  projectState,
} from '../../domain/services/container-export.js';
import { type Result, ok, err } from '../../shared/result.js';

export interface ExportView {
  readonly container: ContainerAlias;
  readonly mode: ExportMode;
  readonly total: number;
  readonly counts: Partial<Record<EntityType, number>>;
  readonly entities: readonly ExportEntity[];
}

/** export_container — serve the whole container from the mirror in one call (zero GTM calls). */
export async function exportContainer(
  deps: { readonly mirror: MirrorReader },
  container: ContainerAlias,
  mode: ExportMode,
): Promise<Result<ExportView>> {
  const read = await deps.mirror.read(container);
  if (!read.success) return read;
  if (read.data === null) {
    return err(new Error(`No mirror for "${container}" yet. Run pull("${container}") first.`));
  }
  const entities = projectState(read.data, mode);
  return ok({
    container,
    mode,
    total: entities.length,
    counts: countByKind(read.data),
    entities,
  });
}
