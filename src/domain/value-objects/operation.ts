import { z } from 'zod';

/**
 * Entity types in scope for v1 (ADR 0007). Custom templates are included;
 * gallery templates are instantiated, not rewritten.
 */
export const EntityTypeSchema = z.enum([
  'tag',
  'trigger',
  'variable',
  'builtInVariable',
  'folder',
  'client', // server only
  'transformation', // server only
  'customTemplate',
]);
export type EntityType = z.infer<typeof EntityTypeSchema>;

export const OperationTypeSchema = z.enum(['create', 'update', 'delete']);
export type OperationType = z.infer<typeof OperationTypeSchema>;

/**
 * A reference to a GTM entity, resolved at Apply time (3-tier, ADR 0004):
 *   1. known numeric id      -> { id: "123" }
 *   2. existing by name      -> { name: "Purchase" }
 *   3. created earlier in the same changeset -> { ref: "purchase-trigger" } (a $ref placeholder)
 */
export const EntityRefSchema = z
  .object({
    id: z.string().min(1).optional(),
    name: z.string().min(1).max(255).optional(),
    ref: z.string().min(1).max(120).optional(),
  })
  .refine((r) => Boolean(r.id ?? r.name ?? r.ref), 'one of id, name, or ref is required');
export type EntityRef = z.infer<typeof EntityRefSchema>;

/**
 * A single create/update/delete of one entity (ADR 0004).
 * `data` mirrors the raw GTM API entity shape (Q3) — kept loose here, validated
 * per entity-type by the infrastructure GTM adapter before Apply.
 */
export const OperationSchema = z.object({
  op: OperationTypeSchema,
  entity: EntityTypeSchema,
  // For create: assign a local placeholder so later ops can reference it.
  assignRef: z.string().min(1).max(120).optional(),
  // For update/delete: which existing entity.
  target: EntityRefSchema.optional(),
  // Raw GTM entity payload (create/update). Refined downstream against the entity type.
  data: z.record(z.unknown()).optional(),
});
export type Operation = z.infer<typeof OperationSchema>;

export const OperationsSchema = z.array(OperationSchema).min(1).max(200);
