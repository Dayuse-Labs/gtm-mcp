import { describe, it, expect } from 'vitest';
import { publishChangeset, type PublishDeps } from './publish-changeset.js';
import { type Changeset } from '../../domain/entities/changeset.js';
import {
  FakeGtmClient,
  InMemoryChangesetRepository,
  stateWith,
  snap,
  collaborator,
} from '../../test-support/fakes.js';

const ADMIN = collaborator({ id: 'admin-1', email: 'admin@dayuse.com', role: 'admin' });

const applied: Changeset = {
  id: '6f1c2d3e-0000-4000-8000-000000000001',
  authorId: 'author-1',
  containerAlias: 'web',
  planId: null,
  status: 'applied',
  operations: [{ op: 'update', entity: 'variable', target: { id: 'v1' }, data: { name: 'x' } }],
  summary: ['Rename variable «daypass» → «dayaccess»'],
  beforeImages: { 'variable:v1': { name: 'daypass', fingerprint: 'fp-A' } },
  gtmWorkspaceId: 'ws-7',
  gtmVersionId: null,
};

async function setup(changeset: Changeset = applied) {
  const gtm = new FakeGtmClient(
    stateWith({ variable: [snap('variable', 'v1', 'daypass', 'fp-A')] }),
  );
  const changesets = new InMemoryChangesetRepository();
  await changesets.save(changeset);
  const deps: PublishDeps = { gtm, changesets };
  return { gtm, changesets, deps };
}

describe('publishChangeset', () => {
  it('lets an admin cut a traceable version from the workspace and publish it', async () => {
    const { gtm, changesets, deps } = await setup();
    const r = await publishChangeset(deps, ADMIN, applied.id);

    expect(r.success && r.data).toMatchObject({ versionId: 'v-42', status: 'published' });
    const createCall = gtm.calls.find((c) => c.op === 'createVersion');
    expect(createCall?.id).toBe('ws-7');
    expect(createCall?.name).toContain('6f1c2d3e');
    expect(createCall?.name).toContain('dayaccess');
    expect(gtm.calls.some((c) => c.op === 'publishVersion' && c.id === 'v-42')).toBe(true);
    expect(changesets.store.get(applied.id)).toMatchObject({
      status: 'published',
      gtmVersionId: 'v-42',
    });
  });

  it('refuses a collaborator, even the author, without touching GTM', async () => {
    const { gtm, changesets, deps } = await setup();
    const r = await publishChangeset(deps, collaborator(), applied.id);

    expect(!r.success && r.error.code).toBe('forbidden');
    expect(gtm.calls).toEqual([]);
    expect(changesets.store.get(applied.id)?.status).toBe('applied');
  });

  it('refuses a changeset that is not applied', async () => {
    const { gtm, deps } = await setup({ ...applied, status: 'rejected' });
    const r = await publishChangeset(deps, ADMIN, applied.id);

    expect(!r.success && r.error.code).toBe('not_applied');
    expect(gtm.calls).toEqual([]);
  });

  it('does not publish when GTM reports a compiler error on version creation', async () => {
    const { gtm, changesets, deps } = await setup();
    gtm.versionCreation = { kind: 'compiler_error' };
    const r = await publishChangeset(deps, ADMIN, applied.id);

    expect(!r.success && r.error.code).toBe('compiler_error');
    expect(gtm.calls.some((c) => c.op === 'publishVersion')).toBe(false);
    expect(changesets.store.get(applied.id)).toMatchObject({
      status: 'applied',
      gtmVersionId: null,
    });
  });

  it('does not publish on a merge conflict', async () => {
    const { gtm, deps } = await setup();
    gtm.versionCreation = { kind: 'conflict', reason: 'merge_conflict' };
    const r = await publishChangeset(deps, ADMIN, applied.id);

    expect(!r.success && r.error.code).toBe('conflict');
    expect(gtm.calls.some((c) => c.op === 'publishVersion')).toBe(false);
  });

  it('refuses before creating a version when the live entities drifted since apply', async () => {
    const { gtm, deps } = await setup();
    gtm.state = stateWith({ variable: [snap('variable', 'v1', 'daypass', 'fp-CHANGED')] });
    const r = await publishChangeset(deps, ADMIN, applied.id);

    expect(!r.success && r.error.code).toBe('drift');
    expect(gtm.calls).toEqual([]);
  });

  it('retries a failed publish by reusing the recorded version', async () => {
    const { gtm, deps } = await setup({ ...applied, gtmVersionId: 'v-41' });
    const r = await publishChangeset(deps, ADMIN, applied.id);

    expect(r.success && r.data.versionId).toBe('v-41');
    expect(gtm.calls.map((c) => c.op)).toEqual(['publishVersion']);
  });
});
