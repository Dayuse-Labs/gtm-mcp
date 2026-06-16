import { z } from 'zod';

/** Role gating who may act on others' changesets (Q15 / ADR 0004). Stored in Postgres. */
export const RoleSchema = z.enum(['collaborator', 'admin']);
export type Role = z.infer<typeof RoleSchema>;

export interface Collaborator {
  readonly id: string;
  readonly googleSub: string;
  readonly email: string;
  readonly role: Role;
}

export const isAdmin = (c: Collaborator): boolean => c.role === 'admin';
