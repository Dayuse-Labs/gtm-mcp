import { z } from 'zod';
import { type Result, ok, err } from '../../shared/result.js';

/**
 * The project tracks exactly two containers, addressed by alias (Q8 / ADR 0004).
 */
export const ContainerAliasSchema = z.enum(['web', 'server']);
export type ContainerAlias = z.infer<typeof ContainerAliasSchema>;

export class InvalidContainerAliasError extends Error {
  constructor(value: string) {
    super(`Unknown container alias "${value}". Expected "web" or "server".`);
    this.name = 'InvalidContainerAliasError';
  }
}

export function parseContainerAlias(
  value: string,
): Result<ContainerAlias, InvalidContainerAliasError> {
  const parsed = ContainerAliasSchema.safeParse(value);
  return parsed.success ? ok(parsed.data) : err(new InvalidContainerAliasError(value));
}
