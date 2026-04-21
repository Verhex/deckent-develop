import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  generateKeypair,
  loadOrGenerateKeypair,
  signMessage,
  verifySignature,
  bytesToHex,
  hexToBytes,
} from '../../src/core/signature.js';

describe('signature — Ed25519 Sign/Verify', () => {
  // Test 1: generateKeypair returns 32-byte keys
  it('generateKeypair returns 32-byte private and public keys', async () => {
    const kp = await generateKeypair();
    expect(kp.privateKey).toBeInstanceOf(Uint8Array);
    expect(kp.publicKey).toBeInstanceOf(Uint8Array);
    expect(kp.privateKey.length).toBe(32);
    expect(kp.publicKey.length).toBe(32);
  });

  // Test 2: signMessage + verifySignature round-trip
  it('sign and verify round-trip succeeds', async () => {
    const kp = await generateKeypair();
    const message = 'Hello Deckent Ed25519!';
    const signature = await signMessage(message, kp.privateKey);

    expect(typeof signature).toBe('string');
    expect(signature.length).toBe(128); // 64 bytes = 128 hex chars

    const valid = await verifySignature(message, signature, kp.publicKey);
    expect(valid).toBe(true);
  });

  // Test 3: Wrong public key → verification fails
  it('verification fails with wrong public key', async () => {
    const kp1 = await generateKeypair();
    const kp2 = await generateKeypair();
    const message = 'signed by kp1';
    const signature = await signMessage(message, kp1.privateKey);

    const valid = await verifySignature(message, signature, kp2.publicKey);
    expect(valid).toBe(false);
  });

  // Test 4: Tampered message → verification fails
  it('verification fails with tampered message', async () => {
    const kp = await generateKeypair();
    const message = 'original message';
    const signature = await signMessage(message, kp.privateKey);

    const valid = await verifySignature('tampered message', signature, kp.publicKey);
    expect(valid).toBe(false);
  });

  // Test 5-7: loadOrGenerateKeypair file creation + permissions
  describe('loadOrGenerateKeypair', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = join(tmpdir(), `deckent-sig-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    });

    afterEach(() => {
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    // Test 5: creates files on first call
    it('creates key files on first call', () => {
      const kp = loadOrGenerateKeypair(tempDir);

      expect(kp.privateKey).toBeInstanceOf(Uint8Array);
      expect(kp.publicKey).toBeInstanceOf(Uint8Array);
      expect(kp.privateKey.length).toBe(32);
      expect(kp.publicKey.length).toBe(32);

      // Files exist
      expect(existsSync(join(tempDir, 'private.hex'))).toBe(true);
      expect(existsSync(join(tempDir, 'public.hex'))).toBe(true);

      // Hex content is valid
      const privHex = readFileSync(join(tempDir, 'private.hex'), 'utf-8').trim();
      const pubHex = readFileSync(join(tempDir, 'public.hex'), 'utf-8').trim();
      expect(privHex.length).toBe(64); // 32 bytes = 64 hex
      expect(pubHex.length).toBe(64);
    });

    // Test 6: file permissions (private 0600, public 0644)
    it('sets correct file permissions', () => {
      loadOrGenerateKeypair(tempDir);

      const privStat = statSync(join(tempDir, 'private.hex'));
      const pubStat = statSync(join(tempDir, 'public.hex'));

      // Check permission bits (masking off file type bits)
      const privMode = privStat.mode & 0o777;
      const pubMode = pubStat.mode & 0o777;

      expect(privMode).toBe(0o600);
      expect(pubMode).toBe(0o644);
    });

    // Test 7: directory permissions 0700
    it('sets correct directory permissions', () => {
      loadOrGenerateKeypair(tempDir);

      const dirStat = statSync(tempDir);
      const dirMode = dirStat.mode & 0o777;
      expect(dirMode).toBe(0o700);
    });

    // Test: second call loads existing keys (not regenerate)
    it('loads existing keys on second call', () => {
      const kp1 = loadOrGenerateKeypair(tempDir);
      const kp2 = loadOrGenerateKeypair(tempDir);

      expect(bytesToHex(kp1.privateKey)).toBe(bytesToHex(kp2.privateKey));
      expect(bytesToHex(kp1.publicKey)).toBe(bytesToHex(kp2.publicKey));
    });
  });

  // Test 8: Determinism — same message + same key → same signature
  it('deterministic: same message + same key produces same signature', async () => {
    const kp = await generateKeypair();
    const message = 'determinism test';

    const sig1 = await signMessage(message, kp.privateKey);
    const sig2 = await signMessage(message, kp.privateKey);

    expect(sig1).toBe(sig2);
  });
});
