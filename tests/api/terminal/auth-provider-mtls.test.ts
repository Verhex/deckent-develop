import { describe, it, expect } from 'vitest';
import type { AuthProvider } from '../../../src/api/terminal/auth-provider.js';
import { LocalTokenAuthProvider } from '../../../src/api/terminal/auth-provider.js';
import type { TenantId } from '../../../src/api/terminal/types.js';

describe('AuthProvider — mTLS interface (W5-11)', () => {
  it('interface contract: verifyClientCert is optional on AuthProvider', () => {
    // A minimal provider satisfying the interface with verifyClientCert.
    const withMtls: AuthProvider = {
      verify: () => true,
      verifyClientCert: async (_cert: Buffer): Promise<TenantId | null> => 'tenant-1',
    };
    expect(typeof withMtls.verifyClientCert).toBe('function');

    // A minimal provider without verifyClientCert is also a valid AuthProvider.
    const withoutMtls: AuthProvider = {
      verify: () => true,
    };
    expect(withoutMtls.verifyClientCert).toBeUndefined();
  });

  it('LocalTokenAuthProvider: verifyClientCert is undefined (no-op)', () => {
    const provider = new LocalTokenAuthProvider('test-token');
    // LocalTokenAuthProvider intentionally does not implement verifyClientCert.
    // Its absence signals to the gateway that mTLS is not configured.
    expect(provider.verifyClientCert).toBeUndefined();
  });

  it('custom MtlsAuthProvider: verifyClientCert returns TenantId or null', async () => {
    class MtlsAuthProvider implements AuthProvider {
      verify(_presented: string | undefined): boolean {
        return true; // token-less; cert is the credential
      }

      async verifyClientCert(cert: Buffer): Promise<TenantId | null> {
        // Minimal stub: empty cert → deny; non-empty → map to tenant
        if (cert.length === 0) return null;
        return 'tenant-mtls';
      }
    }

    const provider = new MtlsAuthProvider();
    expect(typeof provider.verifyClientCert).toBe('function');
    expect(await provider.verifyClientCert(Buffer.from('cert-data'))).toBe('tenant-mtls');
    expect(await provider.verifyClientCert(Buffer.alloc(0))).toBeNull();
  });
});
