import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface SealedToken {
  readonly ciphertext: Buffer;
  readonly iv: Buffer;
  readonly authTag: Buffer;
}

/**
 * AES-256-GCM sealing for OAuth refresh tokens at rest (ADR 0003).
 * Key is the 32-byte base64 TOKEN_ENCRYPTION_KEY.
 */
export class TokenCipher {
  private readonly key: Buffer;

  constructor(keyBase64: string) {
    const key = Buffer.from(keyBase64, 'base64');
    if (key.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must decode to 32 bytes.');
    this.key = key;
  }

  seal(plaintext: string): SealedToken {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return { ciphertext, iv, authTag: cipher.getAuthTag() };
  }

  open(sealed: SealedToken): string {
    const decipher = createDecipheriv('aes-256-gcm', this.key, sealed.iv);
    decipher.setAuthTag(sealed.authTag);
    return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]).toString('utf8');
  }
}
