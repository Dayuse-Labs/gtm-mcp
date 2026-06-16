import { type MirrorReader } from '../../domain/ports/mirror-reader.js';
import { type ContainerAlias } from '../../domain/value-objects/container-alias.js';
import { type SearchHit, searchState } from '../../domain/services/container-search.js';
import { type Result, ok, err } from '../../shared/result.js';

export interface SearchView {
  readonly container: ContainerAlias;
  readonly query: string;
  readonly count: number;
  readonly hits: readonly SearchHit[];
}

/** search_container — value-level search over the mirror in one call (zero GTM calls). */
export async function searchContainer(
  deps: { readonly mirror: MirrorReader },
  container: ContainerAlias,
  query: string,
): Promise<Result<SearchView>> {
  const read = await deps.mirror.read(container);
  if (!read.success) return read;
  if (read.data === null) {
    return err(new Error(`No mirror for "${container}" yet. Run pull("${container}") first.`));
  }
  const hits = searchState(read.data, query);
  return ok({ container, query, count: hits.length, hits });
}
