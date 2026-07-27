import { describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';

import {
  DETERMINISTIC_CBOR_LIMITS,
  decodeDeterministicCbor,
  deterministicCborDigestRef,
  encodeDeterministicCbor,
  validateDeterministicCbor,
} from '../../scripts/hermeticity/evidence/deterministic-cbor.mjs';

function hex(value: Uint8Array): string {
  return Buffer.from(value).toString('hex');
}

function fromHex(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, 'hex'));
}

function encoded(value: unknown): Uint8Array {
  const result = encodeDeterministicCbor(value);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.hold.reasonCode);
  return result.value;
}

describe('deterministic containment CBOR profile', () => {
  it('uses RFC 8949 preferred integer forms and deterministic map ordering', () => {
    expect(hex(encoded(0))).toBe('00');
    expect(hex(encoded(23))).toBe('17');
    expect(hex(encoded(24))).toBe('1818');
    expect(hex(encoded(255))).toBe('18ff');
    expect(hex(encoded(256))).toBe('190100');
    expect(hex(encoded(-1))).toBe('20');
    expect(hex(encoded(-24))).toBe('37');
    expect(hex(encoded(-25))).toBe('3818');
    expect(hex(encoded('a'))).toBe('6161');
    expect(hex(encoded(Uint8Array.from([1, 2])))).toBe('420102');
    expect(hex(encoded([1, 2]))).toBe('820102');
    expect(hex(encoded({ b: 1, a: 2 }))).toBe('a2616102616201');

    const integerKeys = new Map<unknown, unknown>([
      [-1, 'negative'],
      [10, 'positive'],
    ]);
    expect(hex(encoded(integerKeys))).toBe(
      'a20a68706f73697469766520686e65676174697665',
    );

    const coreOrdering = new Map<unknown, unknown>([
      [24, 'p'],
      [-1, 'n'],
    ]);
    expect(hex(encoded(coreOrdering))).toBe('a21818617020616e');
    expect(decodeDeterministicCbor(fromHex('a220616e18186170'))).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_CBOR_MAP_KEY_ORDER' },
    });
  });

  it('round-trips bounded scalar, byte, array and mixed-key map values', () => {
    const value = new Map<unknown, unknown>([
      ['text', 'Merhaba 🌍'],
      [1, Uint8Array.from([0, 1, 2, 255])],
      [-2, [true, false, null, 2n ** 63n]],
    ]);
    const bytes = encoded(value);
    const decoded = decodeDeterministicCbor(bytes);

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.hold.reasonCode);
    expect(decoded.value).toBeInstanceOf(Map);
    expect((decoded.value as Map<unknown, unknown>).get('text')).toBe('Merhaba 🌍');
    expect((decoded.value as Map<unknown, unknown>).get(1)).toEqual(
      Uint8Array.from([0, 1, 2, 255]),
    );
    expect(validateDeterministicCbor(bytes)).toMatchObject({
      ok: true,
      value: {
        state: 'CANONICAL',
        proofEligible: false,
      },
    });
    expect(deterministicCborDigestRef(value)).toMatchObject({
      ok: true,
      value: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });

    for (const text of ['\uFEFF', '\uFEFFx']) {
      const textBytes = encoded(text);
      const textRoundTrip = decodeDeterministicCbor(textBytes);
      expect(textRoundTrip).toEqual({ ok: true, value: text });
      expect(validateDeterministicCbor(textBytes)).toMatchObject({
        ok: true,
        value: { value: text },
      });
    }
  });

  it('rejects unsupported values, unsafe descriptors, aliases and cycles', () => {
    const getter = Object.defineProperty({}, 'value', {
      enumerable: true,
      get: () => 1,
    });
    const symbol = { value: 1 } as Record<PropertyKey, unknown>;
    symbol[Symbol('hidden')] = 2;
    const sparse = Array(2);
    sparse[1] = 'present';
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    const duplicateCanonicalKey = new Map<unknown, unknown>([
      [1, 'number'],
      [1n, 'bigint'],
    ]);

    for (const [value, reasonCode] of [
      [1.5, 'E_CONTAINMENT_CBOR_INTEGER_INVALID'],
      [Number.NaN, 'E_CONTAINMENT_CBOR_INTEGER_INVALID'],
      [-0, 'E_CONTAINMENT_CBOR_INTEGER_INVALID'],
      [undefined, 'E_CONTAINMENT_CBOR_TYPE_UNSUPPORTED'],
      [new Date(0), 'E_CONTAINMENT_CBOR_TYPE_UNSUPPORTED'],
      [getter, 'E_CONTAINMENT_CBOR_PROPERTY_INVALID'],
      [symbol, 'E_CONTAINMENT_CBOR_PROPERTY_INVALID'],
      [sparse, 'E_CONTAINMENT_CBOR_ARRAY_INVALID'],
      [cyclic, 'E_CONTAINMENT_CBOR_CYCLE'],
      [duplicateCanonicalKey, 'E_CONTAINMENT_CBOR_MAP_KEY_DUPLICATE'],
      ['\ud800', 'E_CONTAINMENT_CBOR_UNICODE_INVALID'],
    ] as const) {
      expect(encodeDeterministicCbor(value)).toMatchObject({
        ok: false,
        hold: { reasonCode, proofEligible: false },
      });
    }
  });

  it('rejects non-canonical, indefinite, tagged, floating and malformed wire forms', () => {
    const vectors = [
      ['1801', 'E_CONTAINMENT_CBOR_NONCANONICAL_INTEGER'],
      ['9f01ff', 'E_CONTAINMENT_CBOR_INDEFINITE_DENIED'],
      ['c100', 'E_CONTAINMENT_CBOR_TAG_DENIED'],
      ['f93c00', 'E_CONTAINMENT_CBOR_FLOAT_DENIED'],
      ['f7', 'E_CONTAINMENT_CBOR_SIMPLE_VALUE_DENIED'],
      ['61ff', 'E_CONTAINMENT_CBOR_UNICODE_INVALID'],
      ['a2616201616102', 'E_CONTAINMENT_CBOR_MAP_KEY_ORDER'],
      ['a201010102', 'E_CONTAINMENT_CBOR_MAP_KEY_DUPLICATE'],
      ['0000', 'E_CONTAINMENT_CBOR_TRAILING_DATA'],
      ['5c', 'E_CONTAINMENT_CBOR_ADDITIONAL_INFO_INVALID'],
    ] as const;

    for (const [vector, reasonCode] of vectors) {
      expect(decodeDeterministicCbor(fromHex(vector))).toMatchObject({
        ok: false,
        hold: { reasonCode, proofEligible: false },
      });
    }
  });

  it('fails closed on depth, collection and byte budgets', () => {
    expect(encodeDeterministicCbor([[[[1]]]], {
      limits: { maxDepth: 2 },
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_CBOR_DEPTH_EXCEEDED' },
    });
    expect(encodeDeterministicCbor([1, 2, 3], {
      limits: { maxCollectionEntries: 2 },
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_CBOR_CAPACITY_EXCEEDED' },
    });
    expect(decodeDeterministicCbor(fromHex('4401020304'), {
      limits: { maxBytes: 4 },
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_CBOR_CAPACITY_EXCEEDED' },
    });

    const largeBytes = Uint8Array.from(
      { length: 130_000 },
      (_, index) => index % 251,
    );
    const largeEncoded = encodeDeterministicCbor(largeBytes);
    expect(largeEncoded.ok).toBe(true);
    if (!largeEncoded.ok) throw new Error(largeEncoded.hold.reasonCode);
    expect(largeEncoded.value.byteLength).toBe(130_005);
    expect(decodeDeterministicCbor(largeEncoded.value)).toEqual({
      ok: true,
      value: largeBytes,
    });
    expect(encodeDeterministicCbor(largeBytes, {
      limits: { maxBytes: 130_005 },
    }).ok).toBe(true);
    expect(encodeDeterministicCbor(largeBytes, {
      limits: { maxBytes: 130_004 },
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_CBOR_CAPACITY_EXCEEDED' },
    });

    expect(encodeDeterministicCbor(new Map([['k', 1]]), {
      limits: { maxNodes: 2 },
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_CBOR_CAPACITY_EXCEEDED' },
    });
    expect(encodeDeterministicCbor(new Map(
      Array.from({ length: 4097 }, (_, index) => [index, index]),
    ))).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_CBOR_CAPACITY_EXCEEDED' },
    });
    expect(encodeDeterministicCbor(new Map([['x'.repeat(64), 1]]), {
      limits: { maxBytes: 10 },
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_CBOR_CAPACITY_EXCEEDED' },
    });
  });

  it('rejects proxies and shared memory without invoking traps', () => {
    let trapCount = 0;
    const recordProxy = new Proxy({ x: 1 }, {
      ownKeys() {
        trapCount += 1;
        throw new Error('must not execute');
      },
    });
    const arrayProxy = new Proxy([1], {
      getOwnPropertyDescriptor() {
        trapCount += 1;
        throw new Error('must not execute');
      },
    });
    for (const value of [recordProxy, arrayProxy]) {
      expect(encodeDeterministicCbor(value)).toMatchObject({
        ok: false,
        hold: { reasonCode: 'E_CONTAINMENT_CBOR_EXOTIC_DENIED' },
      });
    }
    expect(trapCount).toBe(0);

    const crossRealmBytes = runInNewContext('new Uint8Array([1, 2, 3])');
    expect(hex(encoded(crossRealmBytes))).toBe('43010203');

    if (typeof SharedArrayBuffer === 'function') {
      const shared = new Uint8Array(new SharedArrayBuffer(8));
      expect(encodeDeterministicCbor(shared)).toMatchObject({
        ok: false,
        hold: { reasonCode: 'E_CONTAINMENT_CBOR_EXOTIC_DENIED' },
      });
    }
  });

  it('never invokes typed-array species or foreign byte-view methods', () => {
    let speciesCount = 0;
    class AdversarialBytes extends Uint8Array {
      static get [Symbol.species](): Uint8ArrayConstructor {
        speciesCount += 1;
        throw new Error('species must not execute');
      }
    }
    const local = new AdversarialBytes([1, 2, 3]);
    expect(hex(encoded(local))).toBe('43010203');
    expect(speciesCount).toBe(0);

    const foreign = runInNewContext(`
      (() => {
        let callCount = 0;
        const value = new Uint8Array([0x41, 0x07]);
        Object.defineProperty(Uint8Array, Symbol.species, {
          configurable: true,
          get() {
            callCount += 1;
            throw new Error('foreign species must not execute');
          },
        });
        Uint8Array.prototype.slice = function () {
          callCount += 1;
          throw new Error('foreign slice must not execute');
        };
        return { value, calls: () => callCount };
      })()
    `);
    expect(decodeDeterministicCbor(foreign.value)).toEqual({
      ok: true,
      value: Uint8Array.from([7]),
    });
    expect(foreign.calls()).toBe(0);
  });

  it('validates exact own-data limits without invoking accessors or traps', () => {
    let trapCount = 0;
    const optionProxy = new Proxy({}, {
      get() {
        trapCount += 1;
        throw new Error('must not execute');
      },
      ownKeys() {
        trapCount += 1;
        throw new Error('must not execute');
      },
    });
    const limitProxy = new Proxy({}, {
      ownKeys() {
        trapCount += 1;
        throw new Error('must not execute');
      },
    });
    const accessorOptions = Object.defineProperty({}, 'limits', {
      enumerable: true,
      get() {
        trapCount += 1;
        throw new Error('must not execute');
      },
    });
    const inheritedLimits = Object.create({ maxBytes: 8 });
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();

    for (const options of [
      optionProxy,
      revoked.proxy,
      accessorOptions,
      { limits: limitProxy },
      { limits: inheritedLimits },
      { limits: null },
      { limits: { maxBytes: null } },
      {
        limits: {
          maxBytes: DETERMINISTIC_CBOR_LIMITS.maxBytes + 1,
        },
      },
    ]) {
      expect(() => encodeDeterministicCbor(1, options as never)).not.toThrow();
      expect(encodeDeterministicCbor(1, options as never)).toMatchObject({
        ok: false,
        hold: { reasonCode: 'E_CONTAINMENT_CBOR_LIMITS_INVALID' },
      });
    }
    expect(trapCount).toBe(0);
  });

  it('preflights UTF-8, byte inputs and aggregate map-key scratch', () => {
    expect(encodeDeterministicCbor('😀', {
      limits: { maxBytes: 5 },
    }).ok).toBe(true);
    expect(encodeDeterministicCbor('😀', {
      limits: { maxBytes: 4 },
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_CBOR_CAPACITY_EXCEEDED' },
    });

    let speciesCount = 0;
    class OversizedBytes extends Uint8Array {
      static get [Symbol.species](): Uint8ArrayConstructor {
        speciesCount += 1;
        throw new Error('oversized input must fail before species');
      }
    }
    expect(encodeDeterministicCbor(new OversizedBytes(64), {
      limits: { maxBytes: 16 },
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_CBOR_CAPACITY_EXCEEDED' },
    });
    expect(speciesCount).toBe(0);

    const sharedBacking = new ArrayBuffer(40);
    const firstKey = new Uint8Array(sharedBacking);
    const secondKey = new Uint8Array(sharedBacking);
    expect(encodeDeterministicCbor(new Map([
      [firstKey, 1],
      [secondKey, 2],
    ]), {
      limits: { maxBytes: 64 },
    })).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_CBOR_CAPACITY_EXCEEDED' },
    });
  });

  it('keeps encoded, decoded and validated canonical authority private', () => {
    const source = new Map<unknown, unknown>([
      ['bytes', Uint8Array.from([1, 2, 3])],
    ]);
    const encoding = encodeDeterministicCbor(source);
    expect(encoding.ok).toBe(true);
    if (!encoding.ok) throw new Error(encoding.hold.reasonCode);
    const changedEncoding = encoding.value;
    changedEncoding[0] ^= 0xff;
    expect(encoding.value).not.toEqual(changedEncoding);

    const decoding = decodeDeterministicCbor(encoding.value);
    expect(decoding.ok).toBe(true);
    if (!decoding.ok) throw new Error(decoding.hold.reasonCode);
    const changedDecoded = decoding.value as Map<string, Uint8Array>;
    changedDecoded.set('forged', Uint8Array.from([9]));
    changedDecoded.get('bytes')![0] = 9;
    const freshDecoded = decoding.value as Map<string, Uint8Array>;
    expect(freshDecoded.has('forged')).toBe(false);
    expect(freshDecoded.get('bytes')).toEqual(Uint8Array.from([1, 2, 3]));

    const validation = validateDeterministicCbor(encoding.value);
    expect(validation.ok).toBe(true);
    if (!validation.ok) throw new Error(validation.hold.reasonCode);
    const changedValidated = validation.value.value as Map<string, Uint8Array>;
    changedValidated.set('forged', Uint8Array.from([9]));
    changedValidated.get('bytes')![0] = 9;
    const freshValidated = validation.value.value as Map<string, Uint8Array>;
    expect(freshValidated.has('forged')).toBe(false);
    expect(freshValidated.get('bytes')).toEqual(Uint8Array.from([1, 2, 3]));
    expect(validation.value.state).toBe('CANONICAL');
  });
});
