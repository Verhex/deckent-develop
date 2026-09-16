import { createHash } from 'node:crypto';
import {
  TextDecoder as NodeTextDecoder,
  TextEncoder as NodeTextEncoder,
  types as nodeTypes,
} from 'node:util';

export const DETERMINISTIC_CBOR_PROFILE_VERSION = 1;

export const DETERMINISTIC_CBOR_LIMITS = Object.freeze({
  maxBytes: 1024 * 1024,
  maxDepth: 32,
  maxCollectionEntries: 4096,
  maxNodes: 16_384,
});

const MAX_UINT64 = (1n << 64n) - 1n;
const MIN_NEGATIVE_UINT64 = -(1n << 64n);
const MAX_SAFE_BIGINT = 9_007_199_254_740_991n;
const MIN_SAFE_BIGINT = -9_007_199_254_740_991n;
const IntrinsicArray = Array;
const IntrinsicMap = Map;
const IntrinsicUint8Array = Uint8Array;
const intrinsicIsArray = Array.isArray;
const intrinsicIsMap = nodeTypes.isMap;
const intrinsicIsProxy = nodeTypes.isProxy;
const intrinsicIsSharedArrayBuffer = nodeTypes.isSharedArrayBuffer;
const intrinsicIsUint8Array = nodeTypes.isUint8Array;
const intrinsicGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const intrinsicGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const intrinsicGetPrototypeOf = Object.getPrototypeOf;
const intrinsicOwnKeys = Reflect.ownKeys;
let textCodecValue = null;
let mapAuthorityValue = null;
let typedArrayAuthorityValue = null;

function textCodec() {
  if (textCodecValue === null) {
    textCodecValue = Object.freeze({
      encoder: new NodeTextEncoder(),
      decoder: new NodeTextDecoder('utf-8', { fatal: true, ignoreBOM: true }),
    });
  }
  return textCodecValue;
}

function mapAuthority() {
  if (mapAuthorityValue === null) {
    const iterator = new IntrinsicMap().entries();
    const sizeGetter = intrinsicGetOwnPropertyDescriptor(
      IntrinsicMap.prototype,
      'size',
    ).get;
    mapAuthorityValue = Object.freeze({
      entries: Function.prototype.call.bind(IntrinsicMap.prototype.entries),
      iteratorNext: Function.prototype.call.bind(
        intrinsicGetPrototypeOf(iterator).next,
      ),
      set: Function.prototype.call.bind(IntrinsicMap.prototype.set),
      size: Function.prototype.call.bind(sizeGetter),
    });
  }
  return mapAuthorityValue;
}

function typedArrayAuthority() {
  if (typedArrayAuthorityValue === null) {
    const typedArrayPrototype = intrinsicGetPrototypeOf(
      IntrinsicUint8Array.prototype,
    );
    const bufferGetter = intrinsicGetOwnPropertyDescriptor(
      typedArrayPrototype,
      'buffer',
    ).get;
    const byteLengthGetter = intrinsicGetOwnPropertyDescriptor(
      typedArrayPrototype,
      'byteLength',
    ).get;
    typedArrayAuthorityValue = Object.freeze({
      buffer: Function.prototype.call.bind(bufferGetter),
      byteLength: Function.prototype.call.bind(byteLengthGetter),
    });
  }
  return typedArrayAuthorityValue;
}

class CborProfileError extends Error {
  constructor(reasonCode, details = {}) {
    super(reasonCode);
    this.reasonCode = reasonCode;
    this.details = details;
  }
}

function freezeDetails(value) {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(freezeDetails));
  }
  if (value !== null && typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = freezeDetails(item);
    }
    return Object.freeze(result);
  }
  return value;
}

function hold(reasonCode, details = {}) {
  return {
    ok: false,
    hold: Object.freeze({
      schemaVersion: DETERMINISTIC_CBOR_PROFILE_VERSION,
      kind: 'deterministic-cbor',
      state: 'HOLD',
      proofEligible: false,
      reasonCode,
      details: freezeDetails(details),
    }),
  };
}

function fail(reasonCode, details = {}) {
  throw new CborProfileError(reasonCode, details);
}

function exactOwnDataRecord(value, allowedKeys) {
  if (value === null
    || typeof value !== 'object'
    || intrinsicIsProxy(value)
    || intrinsicIsArray(value)) {
    return null;
  }
  let prototype;
  let keys;
  let descriptors;
  try {
    prototype = intrinsicGetPrototypeOf(value);
    keys = intrinsicOwnKeys(value);
    if (keys.length > allowedKeys.length
      || keys.some(key => typeof key !== 'string' || !allowedKeys.includes(key))) {
      return null;
    }
    descriptors = intrinsicGetOwnPropertyDescriptors(value);
  } catch {
    return null;
  }
  if (prototype !== Object.prototype && prototype !== null) return null;
  const descriptorKeys = intrinsicOwnKeys(descriptors);
  if (descriptorKeys.length !== keys.length
    || descriptorKeys.some((key, index) => key !== keys[index])) {
    return null;
  }
  const result = Object.create(null);
  for (const key of descriptorKeys) {
    const descriptor = descriptors[key];
    if (!descriptor
      || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      || descriptor.enumerable !== true) {
      return null;
    }
    result[key] = descriptor.value;
  }
  return result;
}

function resolveLimits(options) {
  const optionRecord = exactOwnDataRecord(options, ['limits']);
  if (optionRecord === null) fail('E_CONTAINMENT_CBOR_LIMITS_INVALID');
  if (!Object.prototype.hasOwnProperty.call(optionRecord, 'limits')) {
    return DETERMINISTIC_CBOR_LIMITS;
  }
  const candidate = exactOwnDataRecord(optionRecord.limits, [
    'maxBytes',
    'maxDepth',
    'maxCollectionEntries',
    'maxNodes',
  ]);
  if (candidate === null) fail('E_CONTAINMENT_CBOR_LIMITS_INVALID');
  const resolved = {};
  for (const key of Object.keys(DETERMINISTIC_CBOR_LIMITS)) {
    const value = Object.prototype.hasOwnProperty.call(candidate, key)
      ? candidate[key]
      : DETERMINISTIC_CBOR_LIMITS[key];
    if (!Number.isSafeInteger(value)
      || value <= 0
      || value > DETERMINISTIC_CBOR_LIMITS[key]) {
      fail('E_CONTAINMENT_CBOR_LIMITS_INVALID', { field: key });
    }
    resolved[key] = value;
  }
  return Object.freeze(resolved);
}

function unicodeScalarUtf8Length(value) {
  let byteLength = 0;
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (index + 1 >= value.length) return null;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return null;
      byteLength += 4;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return null;
    } else if (unit <= 0x7f) {
      byteLength += 1;
    } else if (unit <= 0x7ff) {
      byteLength += 2;
    } else {
      byteLength += 3;
    }
  }
  return byteLength;
}

function isUnicodeScalarString(value) {
  return unicodeScalarUtf8Length(value) !== null;
}

function bytesEqual(left, right) {
  const leftLength = typedArrayAuthority().byteLength(left);
  const rightLength = typedArrayAuthority().byteLength(right);
  if (leftLength !== rightLength) return false;
  for (let index = 0; index < leftLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function compareBytes(left, right) {
  const leftLength = typedArrayAuthority().byteLength(left);
  const rightLength = typedArrayAuthority().byteLength(right);
  const sharedLength = Math.min(leftLength, rightLength);
  for (let index = 0; index < sharedLength; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  if (leftLength === rightLength) return 0;
  return leftLength < rightLength ? -1 : 1;
}

function bytesToHex(value) {
  let result = '';
  for (const byte of value) result += byte.toString(16).padStart(2, '0');
  return result;
}

function byteViewMetadata(value) {
  if (intrinsicIsProxy(value) || !intrinsicIsUint8Array(value)) return null;
  try {
    if (intrinsicIsSharedArrayBuffer(typedArrayAuthority().buffer(value))) {
      return null;
    }
    const byteLength = typedArrayAuthority().byteLength(value);
    if (!Number.isSafeInteger(byteLength) || byteLength < 0) return null;
    return Object.freeze({ byteLength });
  } catch {
    return null;
  }
}

function copyByteView(value, minimum, maximum) {
  const metadata = byteViewMetadata(value);
  if (metadata === null
    || metadata.byteLength < minimum
    || metadata.byteLength > maximum) {
    return null;
  }
  const result = new IntrinsicUint8Array(metadata.byteLength);
  for (let index = 0; index < metadata.byteLength; index += 1) {
    result[index] = value[index];
  }
  return result;
}

function copyByteRange(value, offset, length) {
  const result = new IntrinsicUint8Array(length);
  for (let index = 0; index < length; index += 1) {
    result[index] = value[offset + index];
  }
  return result;
}

function toUnsignedInteger(value) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
      fail('E_CONTAINMENT_CBOR_INTEGER_INVALID');
    }
    return BigInt(value);
  }
  if (typeof value === 'bigint') return value;
  fail('E_CONTAINMENT_CBOR_INTEGER_INVALID');
}

function ensureOutputCapacity(state, additional) {
  if (!Number.isSafeInteger(additional)
    || additional < 0
    || state.output.length + additional > state.limits.maxBytes) {
    fail('E_CONTAINMENT_CBOR_CAPACITY_EXCEEDED', { kind: 'bytes' });
  }
}

function appendOutputByte(state, value) {
  ensureOutputCapacity(state, 1);
  state.output.push(value);
}

function appendOutputBytes(state, value) {
  const byteLength = typedArrayAuthority().byteLength(value);
  ensureOutputCapacity(state, byteLength);
  for (let index = 0; index < byteLength; index += 1) {
    state.output.push(value[index]);
  }
}

function encodedHeadLength(argument) {
  if (argument < 0n || argument > MAX_UINT64) {
    fail('E_CONTAINMENT_CBOR_INTEGER_RANGE');
  }
  if (argument < 24n) return 1;
  if (argument <= 0xffn) return 2;
  if (argument <= 0xffffn) return 3;
  if (argument <= 0xffffffffn) return 5;
  return 9;
}

function preflightSizedItem(state, byteLength) {
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
    fail('E_CONTAINMENT_CBOR_CAPACITY_EXCEEDED', { kind: 'bytes' });
  }
  ensureOutputCapacity(
    state,
    encodedHeadLength(BigInt(byteLength)) + byteLength,
  );
}

function writeHead(major, argument, state) {
  if (argument < 0n || argument > MAX_UINT64) {
    fail('E_CONTAINMENT_CBOR_INTEGER_RANGE');
  }
  const prefix = major << 5;
  if (argument < 24n) {
    appendOutputByte(state, prefix | Number(argument));
  } else if (argument <= 0xffn) {
    appendOutputByte(state, prefix | 24);
    appendOutputByte(state, Number(argument));
  } else if (argument <= 0xffffn) {
    appendOutputByte(state, prefix | 25);
    appendOutputByte(state, Number((argument >> 8n) & 0xffn));
    appendOutputByte(state, Number(argument & 0xffn));
  } else if (argument <= 0xffffffffn) {
    appendOutputByte(state, prefix | 26);
    for (let shift = 24n; shift >= 0n; shift -= 8n) {
      appendOutputByte(state, Number((argument >> shift) & 0xffn));
    }
  } else {
    appendOutputByte(state, prefix | 27);
    for (let shift = 56n; shift >= 0n; shift -= 8n) {
      appendOutputByte(state, Number((argument >> shift) & 0xffn));
    }
  }
}

function countNode(state, kind) {
  state.counters.nodes += 1;
  if (state.counters.nodes > state.limits.maxNodes) {
    fail('E_CONTAINMENT_CBOR_CAPACITY_EXCEEDED', { kind: 'nodes' });
  }
  state.lastKind = kind;
}

function assertDepth(state, depth) {
  if (depth > state.limits.maxDepth) {
    fail('E_CONTAINMENT_CBOR_DEPTH_EXCEEDED');
  }
}

function assertCollectionLength(state, length) {
  if (!Number.isSafeInteger(length) || length < 0
    || length > state.limits.maxCollectionEntries) {
    fail('E_CONTAINMENT_CBOR_CAPACITY_EXCEEDED', { kind: 'collection' });
  }
}

function enterContainer(state, value) {
  if (state.ancestors.includes(value)) {
    fail('E_CONTAINMENT_CBOR_CYCLE');
  }
  state.ancestors.push(value);
}

function leaveContainer(state) {
  state.ancestors.pop();
}

function encodeArray(value, state, depth) {
  const rawLengthDescriptor = intrinsicGetOwnPropertyDescriptor(value, 'length');
  if (!rawLengthDescriptor
    || !Object.prototype.hasOwnProperty.call(rawLengthDescriptor, 'value')
    || !Number.isSafeInteger(rawLengthDescriptor.value)
    || rawLengthDescriptor.value < 0) {
    fail('E_CONTAINMENT_CBOR_ARRAY_INVALID');
  }
  assertCollectionLength(state, rawLengthDescriptor.value);
  let ownKeys;
  try {
    ownKeys = intrinsicOwnKeys(value);
  } catch {
    fail('E_CONTAINMENT_CBOR_DESCRIPTOR_ACCESS');
  }
  if (ownKeys.length !== rawLengthDescriptor.value + 1
    || ownKeys.some(key => typeof key === 'symbol')) {
    fail('E_CONTAINMENT_CBOR_ARRAY_INVALID');
  }
  let descriptors;
  try {
    descriptors = intrinsicGetOwnPropertyDescriptors(value);
  } catch {
    fail('E_CONTAINMENT_CBOR_DESCRIPTOR_ACCESS');
  }
  const lengthDescriptor = descriptors.length;
  if (!lengthDescriptor
    || !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value')
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
    || intrinsicOwnKeys(descriptors).some(key => typeof key === 'symbol')
    || intrinsicOwnKeys(descriptors).length !== ownKeys.length) {
    fail('E_CONTAINMENT_CBOR_ARRAY_INVALID');
  }
  writeHead(4, BigInt(lengthDescriptor.value), state);
  enterContainer(state, value);
  try {
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor
        || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
        || descriptor.enumerable !== true) {
        fail('E_CONTAINMENT_CBOR_ARRAY_INVALID', { index });
      }
      encodeValue(descriptor.value, state, depth + 1);
    }
  } finally {
    leaveContainer(state);
  }
}

function isPlainRecord(value) {
  let prototype;
  try {
    prototype = intrinsicGetPrototypeOf(value);
  } catch {
    return false;
  }
  return prototype === Object.prototype || prototype === null;
}

function encodeStandalone(value, limits, depth, counters = { nodes: 0 }) {
  const output = [];
  const state = {
    limits,
    output,
    counters,
    ancestors: [],
    lastKind: null,
  };
  encodeValue(value, state, depth);
  if (output.length > limits.maxBytes) {
    fail('E_CONTAINMENT_CBOR_CAPACITY_EXCEEDED', { kind: 'bytes' });
  }
  const result = new IntrinsicUint8Array(output.length);
  for (let index = 0; index < output.length; index += 1) {
    result[index] = output[index];
  }
  return result;
}

function safeMapEntries(value, state) {
  if (intrinsicIsProxy(value) || !intrinsicIsMap(value)) {
    fail('E_CONTAINMENT_CBOR_MAP_INVALID');
  }
  let expectedSize;
  try {
    expectedSize = mapAuthority().size(value);
  } catch {
    fail('E_CONTAINMENT_CBOR_MAP_INVALID');
  }
  assertCollectionLength(state, expectedSize);
  let iterator;
  try {
    iterator = mapAuthority().entries(value);
  } catch {
    fail('E_CONTAINMENT_CBOR_MAP_INVALID');
  }
  const entries = [];
  while (true) {
    let step;
    try {
      step = mapAuthority().iteratorNext(iterator);
    } catch {
      fail('E_CONTAINMENT_CBOR_MAP_INVALID');
    }
    if (!step || typeof step !== 'object' || typeof step.done !== 'boolean') {
      fail('E_CONTAINMENT_CBOR_MAP_INVALID');
    }
    if (step.done) break;
    if (!Array.isArray(step.value) || step.value.length !== 2) {
      fail('E_CONTAINMENT_CBOR_MAP_INVALID');
    }
    if (entries.length >= expectedSize) {
      fail('E_CONTAINMENT_CBOR_MAP_INVALID');
    }
    entries.push(step.value);
  }
  if (entries.length !== expectedSize) fail('E_CONTAINMENT_CBOR_MAP_INVALID');
  return entries;
}

function isSupportedMapKey(value) {
  return typeof value === 'string'
    || typeof value === 'bigint'
    || (typeof value === 'number' && Number.isSafeInteger(value) && !Object.is(value, -0))
    || byteViewMetadata(value) !== null;
}

function encodeMapEntries(entries, state, depth, owner) {
  assertCollectionLength(state, entries.length);
  enterContainer(state, owner);
  try {
    const mapHeadBytes = encodedHeadLength(BigInt(entries.length));
    ensureOutputCapacity(state, mapHeadBytes);
    const retainedKeyBudget = state.limits.maxBytes
      - state.output.length
      - mapHeadBytes;
    let retainedKeyBytes = 0;
    const encodedEntries = [];
    for (let index = 0; index < entries.length; index += 1) {
      const [key, value] = entries[index];
      if (!isSupportedMapKey(key)) {
        fail('E_CONTAINMENT_CBOR_MAP_KEY_INVALID', { index });
      }
      const remainingKeyBudget = retainedKeyBudget - retainedKeyBytes;
      if (remainingKeyBudget <= 0) {
        fail('E_CONTAINMENT_CBOR_CAPACITY_EXCEEDED', {
          kind: 'map-key-scratch',
        });
      }
      const keyBytes = encodeStandalone(
        key,
        Object.freeze({
          ...state.limits,
          maxBytes: remainingKeyBudget,
        }),
        depth + 1,
        state.counters,
      );
      retainedKeyBytes += typedArrayAuthority().byteLength(keyBytes);
      if (retainedKeyBytes > retainedKeyBudget) {
        fail('E_CONTAINMENT_CBOR_CAPACITY_EXCEEDED', {
          kind: 'map-key-scratch',
        });
      }
      encodedEntries.push({ keyBytes, value, index });
    }
    encodedEntries.sort((left, right) => compareBytes(left.keyBytes, right.keyBytes));
    for (let index = 1; index < encodedEntries.length; index += 1) {
      if (bytesEqual(encodedEntries[index - 1].keyBytes, encodedEntries[index].keyBytes)) {
        fail('E_CONTAINMENT_CBOR_MAP_KEY_DUPLICATE', {
          keyEncoding: bytesToHex(encodedEntries[index].keyBytes),
        });
      }
    }
    writeHead(5, BigInt(encodedEntries.length), state);
    for (const entry of encodedEntries) {
      appendOutputBytes(state, entry.keyBytes);
      encodeValue(entry.value, state, depth + 1);
    }
  } finally {
    leaveContainer(state);
  }
}

function encodeRecord(value, state, depth) {
  let keys;
  try {
    keys = intrinsicOwnKeys(value);
  } catch {
    fail('E_CONTAINMENT_CBOR_DESCRIPTOR_ACCESS');
  }
  assertCollectionLength(state, keys.length);
  let descriptors;
  try {
    descriptors = intrinsicGetOwnPropertyDescriptors(value);
  } catch {
    fail('E_CONTAINMENT_CBOR_DESCRIPTOR_ACCESS');
  }
  const descriptorKeys = intrinsicOwnKeys(descriptors);
  if (descriptorKeys.length !== keys.length
    || descriptorKeys.some(key => typeof key !== 'string')) {
    fail('E_CONTAINMENT_CBOR_PROPERTY_INVALID');
  }
  const entries = descriptorKeys.map(key => {
    const descriptor = descriptors[key];
    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')
      || descriptor.enumerable !== true
      || !isUnicodeScalarString(key)) {
      fail('E_CONTAINMENT_CBOR_PROPERTY_INVALID', { key });
    }
    return [key, descriptor.value];
  });
  encodeMapEntries(entries, state, depth, value);
}

function encodeValue(value, state, depth) {
  assertDepth(state, depth);
  countNode(state, typeof value);
  if ((typeof value === 'object' || typeof value === 'function')
    && value !== null
    && intrinsicIsProxy(value)) {
    fail('E_CONTAINMENT_CBOR_EXOTIC_DENIED');
  }

  if (value === null) {
    appendOutputByte(state, 0xf6);
    return;
  }
  if (value === false) {
    appendOutputByte(state, 0xf4);
    return;
  }
  if (value === true) {
    appendOutputByte(state, 0xf5);
    return;
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    const integer = toUnsignedInteger(value);
    if (integer >= 0n) {
      writeHead(0, integer, state);
    } else {
      if (integer < MIN_NEGATIVE_UINT64) {
        fail('E_CONTAINMENT_CBOR_INTEGER_RANGE');
      }
      writeHead(1, -1n - integer, state);
    }
    return;
  }
  if (typeof value === 'string') {
    const utf8Length = unicodeScalarUtf8Length(value);
    if (utf8Length === null) {
      fail('E_CONTAINMENT_CBOR_UNICODE_INVALID');
    }
    preflightSizedItem(state, utf8Length);
    const encoded = textCodec().encoder.encode(value);
    const encodedLength = typedArrayAuthority().byteLength(encoded);
    if (encodedLength !== utf8Length) {
      fail('E_CONTAINMENT_CBOR_UNICODE_INVALID');
    }
    writeHead(3, BigInt(encodedLength), state);
    appendOutputBytes(state, encoded);
    return;
  }
  const byteMetadata = byteViewMetadata(value);
  if (byteMetadata !== null) {
    preflightSizedItem(state, byteMetadata.byteLength);
    const byteString = copyByteView(value, 0, byteMetadata.byteLength);
    if (byteString === null) fail('E_CONTAINMENT_CBOR_EXOTIC_DENIED');
    writeHead(2, BigInt(byteMetadata.byteLength), state);
    appendOutputBytes(state, byteString);
    return;
  }
  if (intrinsicIsUint8Array(value)) {
    fail('E_CONTAINMENT_CBOR_EXOTIC_DENIED');
  }
  if (intrinsicIsArray(value)) {
    encodeArray(value, state, depth);
    return;
  }
  if (intrinsicIsMap(value)) {
    encodeMapEntries(safeMapEntries(value, state), state, depth, value);
    return;
  }
  if (value !== null && typeof value === 'object' && isPlainRecord(value)) {
    encodeRecord(value, state, depth);
    return;
  }
  fail('E_CONTAINMENT_CBOR_TYPE_UNSUPPORTED', { actualType: typeof value });
}

function encodeInternal(value, options) {
  const limits = resolveLimits(options);
  return encodeStandalone(value, limits, 0);
}

function cloneCanonicalValue(value) {
  if (value === null
    || typeof value === 'boolean'
    || typeof value === 'number'
    || typeof value === 'bigint'
    || typeof value === 'string') {
    return value;
  }
  const metadata = byteViewMetadata(value);
  if (metadata !== null) {
    const copy = copyByteView(value, 0, metadata.byteLength);
    if (copy === null) fail('E_CONTAINMENT_CBOR_ACCESS_FAILED');
    return copy;
  }
  if (intrinsicIsArray(value)) {
    const result = new IntrinsicArray(value.length);
    for (let index = 0; index < value.length; index += 1) {
      result[index] = cloneCanonicalValue(value[index]);
    }
    return result;
  }
  if (intrinsicIsMap(value)) {
    const result = new IntrinsicMap();
    const iterator = mapAuthority().entries(value);
    while (true) {
      const step = mapAuthority().iteratorNext(iterator);
      if (step.done) break;
      mapAuthority().set(
        result,
        cloneCanonicalValue(step.value[0]),
        cloneCanonicalValue(step.value[1]),
      );
    }
    return result;
  }
  fail('E_CONTAINMENT_CBOR_ACCESS_FAILED');
}

function immutableByteSuccess(value) {
  const metadata = byteViewMetadata(value);
  if (metadata === null) fail('E_CONTAINMENT_CBOR_ACCESS_FAILED');
  const snapshot = copyByteView(value, 0, metadata.byteLength);
  if (snapshot === null) fail('E_CONTAINMENT_CBOR_ACCESS_FAILED');
  const result = { ok: true };
  Object.defineProperty(result, 'value', {
    enumerable: true,
    configurable: false,
    get() {
      const copy = copyByteView(snapshot, 0, metadata.byteLength);
      if (copy === null) throw new TypeError('private CBOR bytes unavailable');
      return copy;
    },
  });
  return Object.freeze(result);
}

function immutableCanonicalSuccess(value) {
  const snapshot = cloneCanonicalValue(value);
  const result = { ok: true };
  Object.defineProperty(result, 'value', {
    enumerable: true,
    configurable: false,
    get() {
      return cloneCanonicalValue(snapshot);
    },
  });
  return Object.freeze(result);
}

export function encodeDeterministicCbor(value, options = {}) {
  try {
    return immutableByteSuccess(encodeInternal(value, options));
  } catch (error) {
    if (error instanceof CborProfileError) {
      return hold(error.reasonCode, error.details);
    }
    return hold('E_CONTAINMENT_CBOR_ACCESS_FAILED');
  }
}

function readArgument(bytes, offset, additional) {
  if (additional < 24) return { value: BigInt(additional), offset };
  const width = additional === 24
    ? 1
    : additional === 25
      ? 2
      : additional === 26
        ? 4
        : additional === 27
          ? 8
          : undefined;
  if (width === undefined) {
    fail(
      additional === 31
        ? 'E_CONTAINMENT_CBOR_INDEFINITE_DENIED'
        : 'E_CONTAINMENT_CBOR_ADDITIONAL_INFO_INVALID',
    );
  }
  if (offset + width > typedArrayAuthority().byteLength(bytes)) {
    fail('E_CONTAINMENT_CBOR_TRUNCATED');
  }
  let value = 0n;
  for (let index = 0; index < width; index += 1) {
    value = (value << 8n) | BigInt(bytes[offset + index]);
  }
  const minimum = width === 1
    ? 24n
    : width === 2
      ? 256n
      : width === 4
        ? 65_536n
        : 4_294_967_296n;
  if (value < minimum) {
    fail('E_CONTAINMENT_CBOR_NONCANONICAL_INTEGER');
  }
  return { value, offset: offset + width };
}

function safeLength(value, state, kind) {
  if (value > MAX_SAFE_BIGINT) {
    fail('E_CONTAINMENT_CBOR_CAPACITY_EXCEEDED', { kind });
  }
  const length = Number(value);
  assertCollectionLength(state, length);
  return length;
}

function decodedInteger(value, negative) {
  const result = negative ? -1n - value : value;
  return result >= MIN_SAFE_BIGINT && result <= MAX_SAFE_BIGINT
    ? Number(result)
    : result;
}

function decodeValue(bytes, offset, state, depth) {
  assertDepth(state, depth);
  countNode(state, 'decode');
  if (offset >= typedArrayAuthority().byteLength(bytes)) {
    fail('E_CONTAINMENT_CBOR_TRUNCATED');
  }
  const start = offset;
  const initial = bytes[offset];
  offset += 1;
  const major = initial >> 5;
  const additional = initial & 0x1f;

  if (major === 6) fail('E_CONTAINMENT_CBOR_TAG_DENIED');
  if (major === 7) {
    if (additional === 20) return { value: false, offset, start };
    if (additional === 21) return { value: true, offset, start };
    if (additional === 22) return { value: null, offset, start };
    if (additional >= 25 && additional <= 27) {
      fail('E_CONTAINMENT_CBOR_FLOAT_DENIED');
    }
    if (additional === 31) fail('E_CONTAINMENT_CBOR_INDEFINITE_DENIED');
    fail('E_CONTAINMENT_CBOR_SIMPLE_VALUE_DENIED');
  }

  const argument = readArgument(bytes, offset, additional);
  offset = argument.offset;
  if (major === 0) {
    return { value: decodedInteger(argument.value, false), offset, start };
  }
  if (major === 1) {
    return { value: decodedInteger(argument.value, true), offset, start };
  }
  if (major === 2 || major === 3) {
    if (argument.value > BigInt(state.limits.maxBytes)) {
      fail('E_CONTAINMENT_CBOR_CAPACITY_EXCEEDED', { kind: 'bytes' });
    }
    const length = Number(argument.value);
    if (offset + length > typedArrayAuthority().byteLength(bytes)) {
      fail('E_CONTAINMENT_CBOR_TRUNCATED');
    }
    const raw = copyByteRange(bytes, offset, length);
    offset += length;
    if (major === 2) return { value: raw, offset, start };
    let value;
    try {
      value = textCodec().decoder.decode(raw);
    } catch {
      fail('E_CONTAINMENT_CBOR_UNICODE_INVALID');
    }
    if (!isUnicodeScalarString(value)) fail('E_CONTAINMENT_CBOR_UNICODE_INVALID');
    return { value, offset, start };
  }
  if (major === 4) {
    const length = safeLength(argument.value, state, 'collection');
    const result = [];
    for (let index = 0; index < length; index += 1) {
      const decoded = decodeValue(bytes, offset, state, depth + 1);
      result.push(decoded.value);
      offset = decoded.offset;
    }
    return { value: Object.freeze(result), offset, start };
  }
  if (major === 5) {
    const length = safeLength(argument.value, state, 'collection');
    const result = new IntrinsicMap();
    let previousKeyBytes = null;
    for (let index = 0; index < length; index += 1) {
      const keyStart = offset;
      const decodedKey = decodeValue(bytes, offset, state, depth + 1);
      offset = decodedKey.offset;
      const keyBytes = copyByteRange(bytes, keyStart, offset - keyStart);
      if (!isSupportedMapKey(decodedKey.value)) {
        fail('E_CONTAINMENT_CBOR_MAP_KEY_INVALID', { index });
      }
      if (previousKeyBytes !== null && compareBytes(previousKeyBytes, keyBytes) >= 0) {
        fail(
          bytesEqual(previousKeyBytes, keyBytes)
            ? 'E_CONTAINMENT_CBOR_MAP_KEY_DUPLICATE'
            : 'E_CONTAINMENT_CBOR_MAP_KEY_ORDER',
          { index },
        );
      }
      previousKeyBytes = keyBytes;
      const decodedValue = decodeValue(bytes, offset, state, depth + 1);
      offset = decodedValue.offset;
      mapAuthority().set(result, decodedKey.value, decodedValue.value);
    }
    return { value: result, offset, start };
  }
  fail('E_CONTAINMENT_CBOR_MAJOR_TYPE_INVALID', { major });
}

function normalizeBytes(value, limits) {
  const metadata = byteViewMetadata(value);
  if (metadata === null) fail('E_CONTAINMENT_CBOR_BYTES_INVALID');
  if (metadata.byteLength === 0) fail('E_CONTAINMENT_CBOR_TRUNCATED');
  if (metadata.byteLength > limits.maxBytes) {
    fail('E_CONTAINMENT_CBOR_CAPACITY_EXCEEDED', { kind: 'bytes' });
  }
  const bytes = copyByteView(value, 1, limits.maxBytes);
  if (bytes === null) fail('E_CONTAINMENT_CBOR_BYTES_INVALID');
  return bytes;
}

export function decodeDeterministicCbor(value, options = {}) {
  try {
    const limits = resolveLimits(options);
    const bytes = normalizeBytes(value, limits);
    const state = {
      limits,
      output: [],
      counters: { nodes: 0 },
      ancestors: [],
      lastKind: null,
    };
    const decoded = decodeValue(bytes, 0, state, 0);
    if (decoded.offset !== typedArrayAuthority().byteLength(bytes)) {
      fail('E_CONTAINMENT_CBOR_TRAILING_DATA', {
        offset: decoded.offset,
        byteLength: typedArrayAuthority().byteLength(bytes),
      });
    }
    const reencoded = encodeInternal(decoded.value, { limits });
    if (!bytesEqual(bytes, reencoded)) {
      fail('E_CONTAINMENT_CBOR_NONCANONICAL_ENCODING');
    }
    return immutableCanonicalSuccess(decoded.value);
  } catch (error) {
    if (error instanceof CborProfileError) {
      return hold(error.reasonCode, error.details);
    }
    return hold('E_CONTAINMENT_CBOR_ACCESS_FAILED');
  }
}

export function deterministicCborDigestRef(value, options = {}) {
  const encoded = encodeDeterministicCbor(value, options);
  if (!encoded.ok) return encoded;
  const digest = createHash('sha256').update(encoded.value).digest('hex');
  return Object.freeze({ ok: true, value: `sha256:${digest}` });
}

export function validateDeterministicCbor(value, options = {}) {
  const decoded = decodeDeterministicCbor(value, options);
  if (!decoded.ok) return decoded;
  const snapshot = cloneCanonicalValue(decoded.value);
  const validation = {
    schemaVersion: DETERMINISTIC_CBOR_PROFILE_VERSION,
    kind: 'deterministic-cbor-validation',
    state: 'CANONICAL',
    proofEligible: false,
  };
  Object.defineProperty(validation, 'value', {
    enumerable: true,
    configurable: false,
    get() {
      return cloneCanonicalValue(snapshot);
    },
  });
  return Object.freeze({
    ok: true,
    value: Object.freeze(validation),
  });
}
