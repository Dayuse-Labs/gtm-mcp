import { type Collaborator } from '../../domain/entities/collaborator.js';
import { type GtmClient } from '../../domain/ports/gtm-client.js';
import { type ContainerAlias } from '../../domain/value-objects/container-alias.js';
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
  const aliases: ContainerAlias[] = ['web', 'server'];
  const containers: Array<{ alias: ContainerAlias; access: string }> = [];
  for (const alias of aliases) {
    const res = await deps.gtm.describeAccess(alias);
    containers.push({
      alias,
      access: res.success
        ? `ok (${res.data.containerPublicId})`
        : `no access (${res.error.message})`,
    });
  }
  return ok({ email: actor.email, role: actor.role, containers });
}
