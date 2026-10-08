import { describe, it, expect } from 'vitest';
import { previewChangeset, type PreviewDeps } from './preview-changeset.js';
import { type Operation } from '../../domain/value-objects/operation.js';
import {
  FakeGtmClient,
  InMemoryPreviewRepository,
  stateWith,
  snap,
  collaborator,
  fixedNow,
  sequentialId,
} from '../../test-support/fakes.js';

function deps(gtm: FakeGtmClient): PreviewDeps {
  return {
    gtm,
    previews: new InMemoryPreviewRepository(),
    now: fixedNow,
    newId: sequentialId,
    previewTtlHours: 24,
  };
}

const daypassState = stateWith({
  variable: [snap('variable', 'v1', 'daypass', 'fp-A')],
  tag: [
    snap('tag', 't1', 'Purchase Tag', 'fp', {
      parameter: [{ type: 'template', value: '{{daypass}}' }],
    }),
  ],
});

describe('previewChangeset', () => {
  it('summarises a rename and surfaces the fan-out (daypass → dayaccess)', async () => {
    const ops: Operation[] = [
      { op: 'update', entity: 'variable', target: { id: 'v1' }, data: { name: 'dayaccess' } },
    ];
    const r = await previewChangeset(deps(new FakeGtmClient(daypassState)), {
      author: collaborator(),
      container: 'web',
      operations: ops,
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.summary[0]).toContain('Rename variable «daypass» → «dayaccess»');
    expect(r.data.impacts.some((i) => i.name === 'Purchase Tag')).toBe(true);
    expect(r.data.baseline).toHaveLength(1);
  });

  it('rejects an operation whose target does not exist', async () => {
    const ops: Operation[] = [
      { op: 'update', entity: 'variable', target: { id: 'missing' }, data: { name: 'x' } },
    ];
    const r = await previewChangeset(deps(new FakeGtmClient(daypassState)), {
      author: collaborator(),
      container: 'web',
      operations: ops,
    });
    expect(r.success).toBe(false);
  });

  it.each(['web', 'preprod'] as const)(
    'rejects a server-only kind in the %s container',
    async (container) => {
      const ops: Operation[] = [{ op: 'create', entity: 'client', data: { name: 'GA4 Client' } }];
      const r = await previewChangeset(deps(new FakeGtmClient(daypassState)), {
        author: collaborator(),
        container,
        operations: ops,
      });
      expect(r.success).toBe(false);
    },
  );
});
