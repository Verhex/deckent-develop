/**
 * Ed25519 Sign/Verify — Deckent cryptographic signature module.
 * Uses @noble/ed25519 (audited, pure JS, no native deps).
 */
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Wire sha512 into ed25519 (required by @noble/ed25519 v2)
ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));
ed.etc.sha512Async = async (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

const KEYPAIR_DIR = join(homedir(), '.deckent', 'keys');

export interface Keypair {
  privateKey: Uint8Array;  // 32 bytes
  publicKey: Uint8Array;   // 32 bytes
}

/**
 * Generate a new Ed25519 keypair (async).
 */
export async function generateKeypair(): Promise<Keypair> {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  return { privateKey, publicKey };
}

/**
 * Load existing keypair from ~/.deckent/keys/ or generate + persist a new one (sync).
 */
export function loadOrGenerateKeypair(keyDir?: string): Keypair {
  const dir = keyDir ?? KEYPAIR_DIR;
  const privPath = join(dir, 'private.hex');
  const pubPath = join(dir, 'public.hex');

  if (existsSync(privPath) && existsSync(pubPath)) {
    return {
      privateKey: ed.etc.hexToBytes(readFileSync(privPath, 'utf-8').trim()),
      publicKey: ed.etc.hexToBytes(readFileSync(pubPath, 'utf-8').trim()),
    };
  }

  // Generate and save
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = ed.getPublicKey(privateKey);

  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(privPath, ed.etc.bytesToHex(privateKey), { mode: 0o600 });
  writeFileSync(pubPath, ed.etc.bytesToHex(publicKey), { mode: 0o644 });

  return { privateKey, publicKey };
}

/**
 * Sign a message with Ed25519 private key. Returns hex-encoded signature.
 */
export async function signMessage(message: Uint8Array | string, privateKey: Uint8Array): Promise<string> {
  const msgBytes = typeof message === 'string' ? new TextEncoder().encode(message) : message;
  const sig = await ed.signAsync(msgBytes, privateKey);
  return ed.etc.bytesToHex(sig);
}

/**
 * Verify an Ed25519 signature. Returns true if valid.
 */
export async function verifySignature(
  message: Uint8Array | string,
  signatureHex: string,
  publicKey: Uint8Array,
): Promise<boolean> {
  const msgBytes = typeof message === 'string' ? new TextEncoder().encode(message) : message;
  const sigBytes = ed.etc.hexToBytes(signatureHex);
  return ed.verifyAsync(sigBytes, msgBytes, publicKey);
}

/**
 * Hex ↔ Bytes utilities (re-exported from @noble/ed25519 for convenience).
 */
export const bytesToHex = ed.etc.bytesToHex;
export const hexToBytes = ed.etc.hexToBytes;
