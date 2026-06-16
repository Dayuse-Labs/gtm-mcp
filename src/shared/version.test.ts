import { describe, it, expect } from 'vitest';
import { DEFAULT_MIN_SKILL_VERSION, resolveMinSkillVersion } from './version.js';

describe('resolveMinSkillVersion', () => {
  it('falls back to the default when no override is set', () => {
    expect(resolveMinSkillVersion(undefined)).toBe(DEFAULT_MIN_SKILL_VERSION);
  });

  it('lets the env override win over the default', () => {
    expect(resolveMinSkillVersion('2.0.0')).toBe('2.0.0');
    expect(resolveMinSkillVersion('2.0.0')).not.toBe(DEFAULT_MIN_SKILL_VERSION);
  });
});
