import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, Cipher, totpCode, verifyTotp } from './crypto.js';

describe('crypto', () => {
  it('round-trips AES-256-GCM and rejects tampering', () => {
    const c = new Cipher(Buffer.alloc(32, 7).toString('base64'), 'k1');
    const sealed = c.seal('{"passport":"P01234567"}', 'user-1');
    expect(c.open(sealed, 'user-1')).toContain('P01234567');
    expect(() => c.open(sealed, 'user-2')).toThrow();
  });

  it('matches the RFC 6238 SHA-1 test vector', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    expect(base32Decode(secret).toString()).toBe('12345678901234567890');
    // RFC 6238 Appendix B: T = 59 s -> 94287082 (8 digits); the 6-digit code is the last 6 digits.
    expect(totpCode(secret, 59_000)).toBe('287082');
    expect(verifyTotp(secret, '287082', 59_000)).toBe(true);
    expect(verifyTotp(secret, '000000', 59_000)).toBe(false);
  });
});
