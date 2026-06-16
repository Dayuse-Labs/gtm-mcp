import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type MirrorWriter } from '../../application/use-cases/pull-container.js';
import { type MirrorReader } from '../../domain/ports/mirror-reader.js';
import { type ContainerState, type GtmEntitySnapshot } from '../../domain/ports/gtm-client.js';
import { type ContainerAlias } from '../../domain/value-objects/container-alias.js';
import { type EntityType } from '../../domain/value-objects/operation.js';
import { ALL_KINDS } from '../../domain/value-objects/entity-kind.js';
import { type Result, ok, err } from '../../shared/result.js';

/** Reads/writes the disposable mirror cache at .cache/gtm/<container>/<kind>.json (gitignored, ADR 0001). */
export class FileMirror implements MirrorWriter, MirrorReader {
  constructor(private readonly root: string = '.cache/gtm') {}

  async write(container: ContainerAlias, state: ContainerState): Promise<Result<void>> {
    try {
      const dir = join(this.root, container);
      await mkdir(dir, { recursive: true });
      for (const [kind, snaps] of Object.entries(state)) {
        await writeFile(join(dir, `${kind}.json`), JSON.stringify(snaps, null, 2), 'utf8');
      }
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e : new Error('mirror write failed.'));
    }
  }

  async read(container: ContainerAlias): Promise<Result<ContainerState | null>> {
    const dir = join(this.root, container);
    try {
      await access(dir);
    } catch {
      return ok(null); // never pulled
    }
    try {
      const entries = await Promise.all(
        ALL_KINDS.map(async (kind): Promise<[EntityType, readonly GtmEntitySnapshot[]]> => {
          try {
            const buf = await readFile(join(dir, `${kind}.json`), 'utf8');
            return [kind, JSON.parse(buf) as GtmEntitySnapshot[]];
          } catch {
            return [kind, []]; // missing kind file → empty
          }
        }),
      );
      return ok(Object.fromEntries(entries) as ContainerState);
    } catch (e) {
      return err(e instanceof Error ? e : new Error('mirror read failed.'));
    }
  }
}
