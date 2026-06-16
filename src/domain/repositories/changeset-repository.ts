import { type Changeset, type ChangesetStatus } from '../entities/changeset.js';
import { type ContainerAlias } from '../value-objects/container-alias.js';
import { type Result } from '../../shared/result.js';

export interface ChangesetRepository {
  save(changeset: Changeset): Promise<Result<Changeset>>;
  findById(id: string): Promise<Result<Changeset | null>>;
  list(filter: {
    container?: ContainerAlias;
    status?: ChangesetStatus;
  }): Promise<Result<readonly Changeset[]>>;
  /** Count changesets currently holding a GTM workspace slot, for the cap-guard (ADR 0005). */
  countPending(container: ContainerAlias): Promise<Result<number>>;
}
