import { describe, it, expect } from 'vitest';
import { authorizeOperations, authorizePublish, canManageChangeset } from './role-policy.js';
import { type Operation } from '../value-objects/operation.js';
import { collaborator } from '../../test-support/fakes.js';

const TAG_EDIT: Operation = {
  op: 'update',
  entity: 'tag',
  target: { id: 't1' },
  data: { name: 'x' },
};
const TEMPLATE_EDIT: Operation = {
  op: 'update',
  entity: 'customTemplate',
  target: { id: '12' },
  data: { name: 'x' },
};

describe('authorizeOperations', () => {
  it('lets a collaborator change tags, triggers and variables', () => {
    expect(authorizeOperations(collaborator(), [TAG_EDIT]).success).toBe(true);
  });

  it('refuses a collaborator touching a custom template, naming the blocked kind', () => {
    const r = authorizeOperations(collaborator(), [TAG_EDIT, TEMPLATE_EDIT]);
    expect(!r.success && r.error.message).toContain('customTemplate');
  });

  it('lets an admin change anything', () => {
    expect(authorizeOperations(collaborator({ role: 'admin' }), [TEMPLATE_EDIT]).success).toBe(
      true,
    );
  });
});

describe('canManageChangeset', () => {
  it('allows the author and admins, refuses others', () => {
    expect(canManageChangeset(collaborator(), 'author-1')).toBe(true);
    expect(canManageChangeset(collaborator({ id: 'other' }), 'author-1')).toBe(false);
    expect(canManageChangeset(collaborator({ id: 'other', role: 'admin' }), 'author-1')).toBe(true);
  });
});

describe('authorizePublish', () => {
  it('lets an admin publish', () => {
    expect(authorizePublish(collaborator({ role: 'admin' })).success).toBe(true);
  });

  it('refuses a collaborator, even on their own changeset', () => {
    const r = authorizePublish(collaborator());
    expect(!r.success && r.error.message).toContain('Only an admin may publish');
  });
});
