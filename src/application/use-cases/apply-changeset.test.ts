import { describe, it, expect } from 'vitest';
import { applyChangeset, type ApplyDeps } from './apply-changeset.js';
import { previewChangeset } from './preview-changeset.js';
import { type Operation } from '../../domain/value-objects/operation.js';
import {
  FakeGtmClient,
  InMemoryPreviewRepository,
  InMemoryChangesetRepository,
  stateWith,
  snap,
  collaborator,
  fixedNow,
  sequentialId,
} from '../../test-support/fakes.js';

const RENAME: Operation[] = [
  { op: 'update', entity: 'variable', target: { id: 'v1' }, data: { name: 'dayaccess' } },
];

async function setup() {
  const gtm = new FakeGtmClient(
    stateWith({ variable: [snap('variable', 'v1', 'daypass', 'fp-A')] }),
  );
  const previews = new InMemoryPreviewRepository();
  const changesets = new InMemoryChangesetRepository();
  const author = collaborator();
  const p = await previewChangeset(
    { gtm, previews, now: fixedNow, newId: sequentialId, previewTtlHours: 24 },
    { author, container: 'web', operations: RENAME },
  );
  if (!p.success) throw new Error('preview failed in setup');
  const deps: ApplyDeps = {
    gtm,
    previews,
    changesets,
    now: fixedNow,
    newId: sequentialId,
  };
  return { gtm, previews, changesets, author, deps, previewId: p.data.id };
}

describe('applyChangeset', () => {
  it('applies into a fresh workspace, persists the changeset, consumes the preview', async () => {
    const { gtm, changesets, author, deps, previews, previewId } = await setup();
    const r = await applyChangeset(deps, author, previewId);
    expect(r.success).toBe(true);
    expect(gtm.calls.some((c) => c.op === 'createWorkspace')).toBe(true);
    expect(gtm.calls.some((c) => c.op === 'update' && c.kind === 'variable' && c.id === 'v1')).toBe(
      true,
    );
    expect(changesets.store.size).toBe(1);
    expect([...changesets.store.values()][0]?.status).toBe('applied');
    const gone = await previews.findById(previewId);
    expect(gone.success && gone.data).toBeNull();
  });

  it('refuses on drift (fingerprint changed since preview)', async () => {
    const { gtm, author, deps, previewId } = await setup();
    gtm.state = stateWith({ variable: [snap('variable', 'v1', 'daypass', 'fp-CHANGED')] });
    const r = await applyChangeset(deps, author, previewId);
    expect(!r.success && r.error.code).toBe('drift');
  });

  it('refuses when GTM is at the 3-workspace limit (live count)', async () => {
    const { gtm, author, deps, previewId } = await setup();
    gtm.workspaceCount = 3;
    const r = await applyChangeset(deps, author, previewId);
    expect(!r.success && r.error.code).toBe('cap_reached');
  });

  it('allows when the live GTM workspace count is below the limit', async () => {
    const { gtm, author, deps, previewId } = await setup();
    gtm.workspaceCount = 2;
    const r = await applyChangeset(deps, author, previewId);
    expect(r.success).toBe(true);
  });

  it('refuses a non-author, non-admin actor', async () => {
    const { deps, previewId } = await setup();
    const r = await applyChangeset(deps, collaborator({ id: 'someone-else' }), previewId);
    expect(!r.success && r.error.code).toBe('forbidden');
  });

  it('on entity-write failure, discards the workspace and persists nothing', async () => {
    const { gtm, changesets, author, deps, previewId } = await setup();
    gtm.failEntityWrite = true;
    const r = await applyChangeset(deps, author, previewId);
    expect(!r.success && r.error.code).toBe('gtm_error');
    expect(!r.success && r.error.message).toContain('workspace discarded');
    expect(gtm.calls.some((c) => c.op === 'deleteWorkspace')).toBe(true);
    expect(changesets.store.size).toBe(0);
  });

  it('when rollback cannot delete the workspace, reports the orphan instead of lying', async () => {
    const { gtm, author, deps, previewId } = await setup();
    gtm.failEntityWrite = true;
    gtm.failDeleteWorkspace = true; // missing delete scope (ADR 0003)
    const r = await applyChangeset(deps, author, previewId);
    expect(!r.success && r.error.code).toBe('gtm_error');
    expect(!r.success && r.error.message).not.toContain('workspace discarded');
    expect(!r.success && r.error.message).toContain('ws-new'); // the orphan id
    expect(!r.success && r.error.message).toContain('discard it manually');
    expect(!r.success && r.error.message).toContain('tagmanager.google.com');
  });

  it('nudges consolidation when the container already had other workspaces', async () => {
    const { gtm, author, deps, previewId } = await setup();
    gtm.workspaceCount = 2; // Default + one existing AI workspace
    const r = await applyChangeset(deps, author, previewId);
    expect(r.success && r.data.note).toContain('batch');
  });

  it('does not nudge consolidation for the first workspace', async () => {
    const { gtm, author, deps, previewId } = await setup();
    gtm.workspaceCount = 1; // only the Default workspace
    const r = await applyChangeset(deps, author, previewId);
    expect(r.success && r.data.note).not.toContain('batch');
  });
});
