import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { TokenCipher } from './token-cipher.js';

const key = randomBytes(32).toString('base64');

describe('TokenCipher', () => {
  it('round-trips a refresh token', () => {
    const c = new TokenCipher(key);
    const sealed = c.seal('1//refresh-token-value');
    expect(sealed.ciphertext.toString('utf8')).not.toContain('refresh-token-value');
    expect(c.open(sealed)).toBe('1//refresh-token-value');
  });

  it('rejects a wrong-length key', () => {
    expect(() => new TokenCipher(Buffer.from('short').toString('base64'))).toThrow();
  });

  it('fails to open with a different key (auth tag mismatch)', () => {
    const sealed = new TokenCipher(key).seal('secret');
    const other = new TokenCipher(randomBytes(32).toString('base64'));
    expect(() => other.open(sealed)).toThrow();
  });
});
