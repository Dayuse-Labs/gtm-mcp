import { describe, it, expect } from 'vitest';
import { canActOn, type Changeset } from './changeset.js';
import { type Collaborator } from './collaborator.js';

const base: Changeset = {
  id: 'cs-1',
  authorId: 'author-1',
  containerAlias: 'web',
  planId: null,
  status: 'draft',
  operations: [{ op: 'create', entity: 'tag' }],
  summary: [],
  beforeImages: null,
  gtmWorkspaceId: null,
};

const author: Collaborator = {
  id: 'author-1',
  googleSub: 's1',
  email: 'a@dayuse.com',
  role: 'collaborator',
};
const other: Collaborator = {
  id: 'other-1',
  googleSub: 's2',
  email: 'b@dayuse.com',
  role: 'collaborator',
};
const admin: Collaborator = {
  id: 'admin-1',
  googleSub: 's3',
  email: 'c@dayuse.com',
  role: 'admin',
};

describe('canActOn', () => {
  it('allows the author', () => expect(canActOn(base, author)).toBe(true));
  it('blocks a non-author collaborator', () => expect(canActOn(base, other)).toBe(false));
  it('allows an admin override', () => expect(canActOn(base, admin)).toBe(true));
});
