import { z } from 'zod';
import { type Result, ok, err } from '../../shared/result.js';

/**
 * The project tracks three containers, addressed by alias (ADR 0004, ADR 0012).
 * `preprod` is web-kind: it is a separate web container, not an environment of `web`.
 */
export const ContainerAliasSchema = z.enum(['web', 'server', 'preprod']);
export type ContainerAlias = z.infer<typeof ContainerAliasSchema>;

export const CONTAINER_ALIASES: readonly ContainerAlias[] = ContainerAliasSchema.options;

/** GTM numeric container id per alias; null when this deployment does not configure it. */
export type ContainerIds = Readonly<Record<ContainerAlias, string | null>>;

export class InvalidContainerAliasError extends Error {
  constructor(value: string) {
    super(
      `Unknown container alias "${value}". Expected one of: ${CONTAINER_ALIASES.map((a) => `"${a}"`).join(', ')}.`,
    );
    this.name = 'InvalidContainerAliasError';
  }
}

export class ContainerNotConfiguredError extends Error {
  constructor(alias: ContainerAlias) {
    super(
      `Container "${alias}" is not configured on this server (set GTM_${alias.toUpperCase()}_CONTAINER_ID).`,
    );
    this.name = 'ContainerNotConfiguredError';
  }
}

export function parseContainerAlias(
  value: string,
): Result<ContainerAlias, InvalidContainerAliasError> {
  const parsed = ContainerAliasSchema.safeParse(value);
  return parsed.success ? ok(parsed.data) : err(new InvalidContainerAliasError(value));
}

export function resolveContainerId(
  ids: ContainerIds,
  alias: ContainerAlias,
): Result<string, ContainerNotConfiguredError> {
  const id = ids[alias];
  return id === null ? err(new ContainerNotConfiguredError(alias)) : ok(id);
}
