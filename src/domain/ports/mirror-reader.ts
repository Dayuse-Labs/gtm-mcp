import { type ContainerAlias } from '../value-objects/container-alias.js';
import { type ContainerState } from './gtm-client.js';
import { type Result } from '../../shared/result.js';

/**
 * Reads the disposable mirror cache (ADR 0001) — zero GTM API calls.
 * Returns null when the container has never been pulled.
 */
export interface MirrorReader {
  read(container: ContainerAlias): Promise<Result<ContainerState | null>>;
}
