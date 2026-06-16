import { type GtmClient, type ContainerState } from '../../domain/ports/gtm-client.js';
import { type ContainerAlias } from '../../domain/value-objects/container-alias.js';
import { type EntityType } from '../../domain/value-objects/operation.js';
import { type Result, ok } from '../../shared/result.js';

/** Writes the disposable mirror cache (ADR 0001). Implemented in infrastructure. */
export interface MirrorWriter {
  write(container: ContainerAlias, state: ContainerState): Promise<Result<void>>;
}

export interface PullView {
  readonly container: ContainerAlias;
  readonly counts: Partial<Record<EntityType, number>>;
  readonly total: number;
}

/** pull — refresh the mirror from GTM and report what was found (ADR 0001). */
export async function pullContainer(
  deps: { readonly gtm: GtmClient; readonly mirror: MirrorWriter },
  container: ContainerAlias,
): Promise<Result<PullView>> {
  const pulled = await deps.gtm.pull(container);
  if (!pulled.success) return pulled;

  const written = await deps.mirror.write(container, pulled.data);
  if (!written.success) return written;

  const counts: Partial<Record<EntityType, number>> = {};
  let total = 0;
  for (const [kind, snaps] of Object.entries(pulled.data) as Array<
    [EntityType, readonly unknown[]]
  >) {
    if (snaps.length > 0) {
      counts[kind] = snaps.length;
      total += snaps.length;
    }
  }
  return ok({ container, counts, total });
}
