import { type Collaborator } from '../../domain/entities/collaborator.js';
import { type GtmClient } from '../../domain/ports/gtm-client.js';
import {
  type ContainerAlias,
  CONTAINER_ALIASES,
  ContainerNotConfiguredError,
} from '../../domain/value-objects/container-alias.js';
import { type Result, ok } from '../../shared/result.js';

export interface IdentityView {
  readonly email: string;
  readonly role: Collaborator['role'];
  readonly containers: ReadonlyArray<{ alias: ContainerAlias; access: string }>;
}

/** whoami — the current collaborator and their GTM access (ADR 0003). */
export async function getIdentity(
  deps: { readonly gtm: GtmClient },
  actor: Collaborator,
): Promise<Result<IdentityView>> {
  const containers: Array<{ alias: ContainerAlias; access: string }> = [];
  for (const alias of CONTAINER_ALIASES) {
    const res = await deps.gtm.describeAccess(alias);
    containers.push({ alias, access: describe(res) });
  }
  return ok({ email: actor.email, role: actor.role, containers });
}

function describe(res: Result<{ containerPublicId: string }>): string {
  if (res.success) return `ok (${res.data.containerPublicId})`;
  if (res.error instanceof ContainerNotConfiguredError) return 'not configured';
  return `no access (${res.error.message})`;
}
