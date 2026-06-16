import { type EntityType } from './operation.js';
import { type ContainerAlias } from './container-alias.js';

/**
 * Maps our EntityType to the GTM API v2 surface: the workspace sub-collection,
 * the numeric id field on the resource, and whether it is server-only.
 */
export interface KindMeta {
  /** GTM API collection name under a workspace (e.g. `tags`). */
  readonly collection: string;
  /** Field holding the GTM-assigned numeric id (e.g. `tagId`). Null for type-keyed kinds. */
  readonly idField: string | null;
  /** Only valid in the server container. */
  readonly serverOnly: boolean;
}

export const KIND_META: Readonly<Record<EntityType, KindMeta>> = {
  tag: { collection: 'tags', idField: 'tagId', serverOnly: false },
  trigger: { collection: 'triggers', idField: 'triggerId', serverOnly: false },
  variable: { collection: 'variables', idField: 'variableId', serverOnly: false },
  builtInVariable: { collection: 'built_in_variables', idField: null, serverOnly: false },
  folder: { collection: 'folders', idField: 'folderId', serverOnly: false },
  client: { collection: 'clients', idField: 'clientId', serverOnly: true },
  transformation: { collection: 'transformations', idField: 'transformationId', serverOnly: true },
  customTemplate: { collection: 'templates', idField: 'templateId', serverOnly: false },
};

export const ALL_KINDS = Object.keys(KIND_META) as EntityType[];

export function kindsForContainer(container: ContainerAlias): EntityType[] {
  return ALL_KINDS.filter((k) => container === 'server' || !KIND_META[k].serverOnly);
}
