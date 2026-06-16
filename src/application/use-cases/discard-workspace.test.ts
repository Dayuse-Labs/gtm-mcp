import { describe, it, expect } from 'vitest';
import { discardWorkspace, type DiscardDeps } from './discard-workspace.js';
import { type Changeset } from '../../domain/entities/changeset.js';
import {
  FakeGtmClient,
  InMemoryChangesetRepository,
  emptyState,
  collaborator,
} from '../../test-support/fakes.js';

const CHANGESET_ID = '11111111-1111-1111-1111-111111111111';

function appliedChangeset(over: Partial<Changeset> = {}): Changeset {
  return {
    id: CHANGESET_ID,
    authorId: 'author-1',
    containerAlias: 'web',
    planId: null,
    status: 'applied',
    operations: [],
    summary: [],
    beforeImages: null,
    gtmWorkspaceId: 'ws-7',
    ...over,
  };
}

async function setup(over: Partial<Changeset> = {}) {
  const gtm = new FakeGtmClient(emptyState());
  const changesets = new InMemoryChangesetRepository();
  const changeset = appliedChangeset(over);
  await changesets.save(changeset);
  const deps: DiscardDeps = { gtm, changesets };
  return { gtm, changesets, deps };
}

describe('discardWorkspace', () => {
  it('lets the author discard their own workspace: deletes it, reconciles status to rejected', async () => {
    const { gtm, changesets, deps } = await setup();

    const r = await discardWorkspace(deps, collaborator(), CHANGESET_ID);

    expect(r.success).toBe(true);
    expect(r.success && r.data.status).toBe('rejected');
    expect(r.success && r.data.alreadyGone).toBe(false);
    expect(gtm.calls.some((c) => c.op === 'deleteWorkspace' && c.id === 'ws-7')).toBe(true);
    const stored = await changesets.findById(CHANGESET_ID);
    expect(stored.success && stored.data?.status).toBe('rejected');
  });

  it('forbids a non-author, non-admin actor (no delete call, status untouched)', async () => {
    const { gtm, changesets, deps } = await setup();

    const r = await discardWorkspace(deps, collaborator({ id: 'someone-else' }), CHANGESET_ID);

    expect(!r.success && r.error.code).toBe('forbidden');
    expect(gtm.calls.some((c) => c.op === 'deleteWorkspace')).toBe(false);
    const stored = await changesets.findById(CHANGESET_ID);
    expect(stored.success && stored.data?.status).toBe('applied');
  });

  it("lets an admin discard another collaborator's workspace", async () => {
    const { gtm, deps } = await setup();

    const r = await discardWorkspace(
      deps,
      collaborator({ id: 'admin-9', role: 'admin' }),
      CHANGESET_ID,
    );

    expect(r.success).toBe(true);
    expect(gtm.calls.some((c) => c.op === 'deleteWorkspace' && c.id === 'ws-7')).toBe(true);
  });

  it('treats an already-gone workspace as success and still reconciles status', async () => {
    const { gtm, changesets, deps } = await setup();
    gtm.failDeleteWorkspace = 'notFound';

    const r = await discardWorkspace(deps, collaborator(), CHANGESET_ID);

    expect(r.success).toBe(true);
    expect(r.success && r.data.alreadyGone).toBe(true);
    expect(r.success && r.data.status).toBe('rejected');
    const stored = await changesets.findById(CHANGESET_ID);
    expect(stored.success && stored.data?.status).toBe('rejected');
  });

  it('surfaces a delete failure (permission/other) as an error — never claims success', async () => {
    const { gtm, changesets, deps } = await setup();
    gtm.failDeleteWorkspace = 'error';

    const r = await discardWorkspace(deps, collaborator(), CHANGESET_ID);

    expect(!r.success && r.error.code).toBe('gtm_error');
    // status must NOT have been reconciled after a real failure
    const stored = await changesets.findById(CHANGESET_ID);
    expect(stored.success && stored.data?.status).toBe('applied');
  });

  it('returns not_found for an unknown changeset', async () => {
    const { deps } = await setup();

    const r = await discardWorkspace(deps, collaborator(), '22222222-2222-2222-2222-222222222222');

    expect(!r.success && r.error.code).toBe('not_found');
  });
});
