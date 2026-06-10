import { describe, it, expect, beforeEach } from "vitest";
import {
  generatePkce,
  buildAuthorizeUrl,
  parseCallbackParams,
  validateState,
  randomToken,
  persistFlowSession,
  loadFlowSession,
  clearFlowSession,
  OidcFlowError,
  type OidcAuthorizeConfig,
} from "../../src/dashboard/src/lib/oidc-flow.js";

/** base64url alphabet only — no `+`, `/`, or `=` padding. */
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/**
 * Deterministic mock Web Crypto for hermetic, repeatable assertions:
 *  - getRandomValues fills bytes with their index (0,1,2,…)
 *  - subtle.digest returns a fixed 32-byte buffer
 * This lets us assert DETERMINISM without depending on real entropy.
 */
function fakeCrypto(): Crypto {
  return {
    getRandomValues: <T extends ArrayBufferView | null>(arr: T): T => {
      if (arr instanceof Uint8Array) {
        for (let i = 0; i < arr.length; i++) arr[i] = i % 256;
      }
      return arr;
    },
    subtle: {
      digest: async (_algo: string, _data: BufferSource): Promise<ArrayBuffer> => {
        const out = new Uint8Array(32);
        for (let i = 0; i < 32; i++) out[i] = (255 - i) % 256;
        return out.buffer;
      },
    },
  } as unknown as Crypto;
}

const CFG: OidcAuthorizeConfig = {
  authorizationEndpoint: "https://idp.example.com/authorize",
  clientId: "deckent-dashboard",
  redirectUri: "https://app.example.com/auth/callback",
};

describe("dashboard/lib/oidc-flow", () => {
  describe("generatePkce()", () => {
    it("produces a 43-char base64url verifier and a base64url challenge (real crypto)", async () => {
      const { verifier, challenge } = await generatePkce();
      // 32 random bytes → 43-char base64url verifier (RFC 7636 §4.1: 43–128 chars).
      expect(verifier).toHaveLength(43);
      expect(verifier).toMatch(BASE64URL);
      // SHA-256 digest (32 bytes) → 43-char base64url challenge.
      expect(challenge).toHaveLength(43);
      expect(challenge).toMatch(BASE64URL);
      // S256: challenge is a hash of the verifier, never equal to it.
      expect(challenge).not.toBe(verifier);
    });

    it("is non-deterministic across calls (real entropy)", async () => {
      const a = await generatePkce();
      const b = await generatePkce();
      expect(a.verifier).not.toBe(b.verifier);
      expect(a.challenge).not.toBe(b.challenge);
    });

    it("is deterministic under an injected mock crypto", async () => {
      const a = await generatePkce(fakeCrypto());
      const b = await generatePkce(fakeCrypto());
      expect(a).toEqual(b);
      expect(a.verifier).toMatch(BASE64URL);
      expect(a.challenge).toMatch(BASE64URL);
    });

    it("throws crypto_unavailable when Web Crypto subtle is missing", async () => {
      const noSubtle = { getRandomValues: (a: Uint8Array) => a } as unknown as Crypto;
      await expect(generatePkce(noSubtle)).rejects.toBeInstanceOf(OidcFlowError);
      await expect(generatePkce(noSubtle)).rejects.toHaveProperty("code", "crypto_unavailable");
    });
  });

  describe("randomToken()", () => {
    it("returns a base64url token and a distinct value each call", () => {
      const a = randomToken();
      const b = randomToken();
      expect(a).toMatch(BASE64URL);
      expect(a).not.toBe(b);
    });

    it("throws crypto_unavailable when getRandomValues is missing", () => {
      expect(() => randomToken(32, {} as unknown as Crypto)).toThrow(OidcFlowError);
    });
  });

  describe("buildAuthorizeUrl()", () => {
    const params = { state: "st-123", nonce: "nc-456", challenge: "ch-789" };

    it("includes every required authorization-code + PKCE parameter", () => {
      const url = new URL(buildAuthorizeUrl(CFG, params));
      const q = url.searchParams;
      expect(`${url.origin}${url.pathname}`).toBe("https://idp.example.com/authorize");
      expect(q.get("response_type")).toBe("code");
      expect(q.get("client_id")).toBe("deckent-dashboard");
      expect(q.get("redirect_uri")).toBe("https://app.example.com/auth/callback");
      expect(q.get("scope")).toBe("openid profile email");
      expect(q.get("state")).toBe("st-123");
      expect(q.get("nonce")).toBe("nc-456");
      expect(q.get("code_challenge")).toBe("ch-789");
      expect(q.get("code_challenge_method")).toBe("S256");
    });

    it("honours a custom scope and preserves pre-existing endpoint query params", () => {
      const url = new URL(
        buildAuthorizeUrl(
          {
            ...CFG,
            authorizationEndpoint: "https://idp.example.com/authorize?audience=api",
            scope: "openid email groups",
          },
          params,
        ),
      );
      expect(url.searchParams.get("scope")).toBe("openid email groups");
      expect(url.searchParams.get("audience")).toBe("api");
    });

    it("throws invalid_authorization_endpoint for a non-URL endpoint", () => {
      expect(() =>
        buildAuthorizeUrl({ ...CFG, authorizationEndpoint: "not a url" }, params),
      ).toThrow(OidcFlowError);
    });
  });

  describe("parseCallbackParams()", () => {
    it("extracts code + state from a successful callback (with leading '?')", () => {
      const result = parseCallbackParams("?code=abc123&state=st-xyz");
      expect(result).toEqual({ code: "abc123", state: "st-xyz" });
    });

    it("extracts code + state without a leading '?'", () => {
      expect(parseCallbackParams("code=c&state=s")).toEqual({ code: "c", state: "s" });
    });

    it("passes through an IdP error with its description", () => {
      const result = parseCallbackParams(
        "?error=access_denied&error_description=User%20cancelled",
      );
      expect(result).toEqual({ error: "access_denied", errorDescription: "User cancelled" });
    });

    it("reports invalid_callback when code or state is missing", () => {
      expect(parseCallbackParams("?code=onlycode")).toEqual({ error: "invalid_callback" });
      expect(parseCallbackParams("")).toEqual({ error: "invalid_callback" });
    });
  });

  describe("validateState()", () => {
    it("returns true only for an exact match", () => {
      expect(validateState("abc123", "abc123")).toBe(true);
    });

    it("returns false on a value mismatch", () => {
      expect(validateState("abc123", "abc124")).toBe(false);
    });

    it("returns false on a length mismatch", () => {
      expect(validateState("abc", "abcd")).toBe(false);
    });

    it("returns false for empty, null, or undefined inputs", () => {
      expect(validateState("", "")).toBe(false);
      expect(validateState(null, "abc")).toBe(false);
      expect(validateState("abc", undefined)).toBe(false);
      expect(validateState(undefined, undefined)).toBe(false);
    });
  });

  describe("sessionStorage round-trip helpers", () => {
    beforeEach(() => {
      clearFlowSession();
    });

    it("persists and loads the verifier / state / nonce", () => {
      persistFlowSession({ verifier: "v1", state: "s1", nonce: "n1" });
      expect(loadFlowSession()).toEqual({ verifier: "v1", state: "s1", nonce: "n1" });
    });

    it("clears persisted secrets (load returns undefined fields)", () => {
      persistFlowSession({ verifier: "v1", state: "s1", nonce: "n1" });
      clearFlowSession();
      expect(loadFlowSession()).toEqual({
        verifier: undefined,
        state: undefined,
        nonce: undefined,
      });
    });

    it("round-trips a real PKCE pair + state for the callback validation path", async () => {
      const { verifier } = await generatePkce();
      const state = randomToken();
      persistFlowSession({ verifier, state, nonce: randomToken() });
      const stored = loadFlowSession();
      expect(stored.verifier).toBe(verifier);
      // The returned state from the callback must validate against the stored one.
      expect(validateState(state, stored.state)).toBe(true);
      expect(validateState("tampered-state", stored.state)).toBe(false);
    });
  });
});
