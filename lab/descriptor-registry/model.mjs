import { createHash } from 'node:crypto';

export const PRESENCE = Object.freeze([
  'optional',
  'required',
  'required_when_parent_present',
]);

export const DEFAULT_KINDS = Object.freeze([
  'NO_DEFAULT',
  'EFFECTIVE_DEFAULT',
  'STARTER_VALUE',
  'SAFETY_FALLBACK',
  'POLICY_INHERITED',
  'PLATFORM_RESOLVED',
]);

export const LIFECYCLES = Object.freeze([
  'ACTIVE',
  'OPT_IN',
  'DEPRECATED',
  'INTERNAL',
  'RESERVED',
  'PLATFORM_UNSUPPORTED',
  'REMOVED',
]);

export const IMPACTS = Object.freeze(['hot-reload', 'next-run', 'restart']);

export const SENSITIVITIES = Object.freeze([
  'PUBLIC',
  'PERSONAL',
  'CONFIDENTIAL',
  'SECRET_REFERENCE',
  'SECRET_MATERIAL_FORBIDDEN',
]);

const TYPE_KINDS = new Set([
  'array',
  'discriminatedUnion',
  'enum',
  'externalRef',
  'literal',
  'object',
  'primitive',
  'record',
  'ref',
  'union',
]);

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function registryDigest(registry) {
  return `sha256:${sha256(canonicalJson(registry))}`;
}

export function parsePath(path) {
  if (typeof path !== 'string' || path.length === 0) throw new Error('REGISTRY_PATH_EMPTY');
  const segments = path.split('.');
  for (const segment of segments) {
    if (segment === '*' || segment === '[]') continue;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(segment)) {
      throw new Error(`REGISTRY_PATH_SEGMENT_INVALID:${path}:${segment}`);
    }
  }
  return segments;
}

function assertEnum(value, allowed, code) {
  if (!allowed.includes(value)) throw new Error(`${code}:${String(value)}`);
}

function validateType(node, context) {
  if (node === null || typeof node !== 'object' || !TYPE_KINDS.has(node.kind)) {
    throw new Error(`REGISTRY_TYPE_INVALID:${context}`);
  }
  switch (node.kind) {
    case 'primitive':
      assertEnum(node.name, ['boolean', 'integer', 'number', 'string', 'unknown'], 'REGISTRY_PRIMITIVE');
      break;
    case 'literal':
      if (!['boolean', 'number', 'string'].includes(typeof node.value) && node.value !== null) {
        throw new Error(`REGISTRY_LITERAL_INVALID:${context}`);
      }
      break;
    case 'enum':
      if (!Array.isArray(node.values) || node.values.length === 0) throw new Error(`REGISTRY_ENUM_EMPTY:${context}`);
      if (new Set(node.values.map(String)).size !== node.values.length) throw new Error(`REGISTRY_ENUM_DUPLICATE:${context}`);
      break;
    case 'union':
      if (!Array.isArray(node.variants) || node.variants.length < 2) throw new Error(`REGISTRY_UNION_SMALL:${context}`);
      node.variants.forEach((variant, index) => validateType(variant, `${context}.variant.${index}`));
      break;
    case 'object': {
      if (!Array.isArray(node.fields) || node.closed !== true) throw new Error(`REGISTRY_OBJECT_OPEN:${context}`);
      const names = new Set();
      for (const field of node.fields) {
        if (!field.name || names.has(field.name)) throw new Error(`REGISTRY_OBJECT_FIELD_DUPLICATE:${context}:${field.name}`);
        names.add(field.name);
        assertEnum(field.presence, PRESENCE, 'REGISTRY_OBJECT_PRESENCE');
        validateType(field.type, `${context}.${field.name}`);
      }
      break;
    }
    case 'array':
      validateType(node.element, `${context}.element`);
      if (node.maxItems !== undefined && (!Number.isInteger(node.maxItems) || node.maxItems < 1)) {
        throw new Error(`REGISTRY_ARRAY_MAX_INVALID:${context}`);
      }
      break;
    case 'record':
      validateKeyGrammar(node.key, `${context}.key`);
      validateType(node.value, `${context}.value`);
      break;
    case 'discriminatedUnion': {
      if (!node.discriminator || !Array.isArray(node.variants) || node.variants.length < 2) {
        throw new Error(`REGISTRY_DISCRIMINATED_UNION_INVALID:${context}`);
      }
      const tags = new Set();
      for (const variant of node.variants) {
        if (!variant.tag || tags.has(variant.tag)) throw new Error(`REGISTRY_VARIANT_TAG_DUPLICATE:${context}`);
        tags.add(variant.tag);
        validateType(variant.type, `${context}.${variant.tag}`);
        const discriminator = variant.type.fields?.find((field) => field.name === node.discriminator);
        if (discriminator?.type?.kind !== 'literal' || discriminator.type.value !== variant.tag) {
          throw new Error(`REGISTRY_VARIANT_DISCRIMINATOR_MISMATCH:${context}:${variant.tag}`);
        }
      }
      break;
    }
    case 'ref':
    case 'externalRef':
      if (!node.name) throw new Error(`REGISTRY_REF_EMPTY:${context}`);
      break;
    default:
      throw new Error(`REGISTRY_TYPE_UNHANDLED:${context}:${node.kind}`);
  }
}

function validateKeyGrammar(key, context) {
  if (key === null || typeof key !== 'object') throw new Error(`REGISTRY_KEY_GRAMMAR_INVALID:${context}`);
  assertEnum(key.kind, ['dynamic', 'finite'], 'REGISTRY_KEY_KIND');
  if (!key.tsType) throw new Error(`REGISTRY_KEY_TYPE_EMPTY:${context}`);
  if (key.kind === 'finite' && (!Array.isArray(key.values) || key.values.length === 0)) {
    throw new Error(`REGISTRY_FINITE_KEYS_EMPTY:${context}`);
  }
  if (key.kind === 'dynamic' && (!key.pattern || !key.maxLength)) {
    throw new Error(`REGISTRY_DYNAMIC_KEY_UNBOUNDED:${context}`);
  }
  if (key.memberPresence !== undefined) assertEnum(key.memberPresence, ['optional', 'required'], 'REGISTRY_KEY_MEMBER_PRESENCE');
}

function collectTypeKinds(node, output = new Set()) {
  output.add(node.kind);
  if (node.kind === 'union') node.variants.forEach((variant) => collectTypeKinds(variant, output));
  if (node.kind === 'object') node.fields.forEach((field) => collectTypeKinds(field.type, output));
  if (node.kind === 'array') collectTypeKinds(node.element, output);
  if (node.kind === 'record') collectTypeKinds(node.value, output);
  if (node.kind === 'discriminatedUnion') node.variants.forEach((variant) => collectTypeKinds(variant.type, output));
  return output;
}

export function compileRegistry(registry, messageCatalogs) {
  if (registry.schemaVersion !== 1) throw new Error(`REGISTRY_SCHEMA_UNSUPPORTED:${registry.schemaVersion}`);
  if (!Array.isArray(registry.descriptors) || registry.descriptors.length === 0) {
    throw new Error('REGISTRY_DESCRIPTORS_EMPTY');
  }

  const typeNames = new Set(Object.keys(registry.types ?? {}));
  const externalNames = new Set(Object.keys(registry.externalTypes ?? {}));
  const typeKinds = new Set();
  for (const [name, external] of Object.entries(registry.externalTypes ?? {})) {
    if (typeof external.importFrom !== 'string' || !external.importFrom.endsWith('.js')) {
      throw new Error(`REGISTRY_EXTERNAL_IMPORT_INVALID:${name}`);
    }
  }
  for (const [name, node] of Object.entries(registry.types ?? {})) {
    validateType(node, `type.${name}`);
    collectTypeKinds(node, typeKinds);
  }

  const ids = new Set();
  const paths = new Set();
  const containerPaths = new Set();
  if (!Array.isArray(registry.containers)) throw new Error('REGISTRY_CONTAINERS_INVALID');
  for (const container of registry.containers) {
    if (containerPaths.has(container.path)) throw new Error(`REGISTRY_CONTAINER_DUPLICATE:${container.path}`);
    const segments = parsePath(container.path);
    if (segments.includes('*') || segments.includes('[]')) throw new Error(`REGISTRY_CONTAINER_DYNAMIC:${container.path}`);
    assertEnum(container.authoredPresence, PRESENCE, 'REGISTRY_CONTAINER_AUTHORED_PRESENCE');
    assertEnum(container.resolvedPresence, PRESENCE, 'REGISTRY_CONTAINER_RESOLVED_PRESENCE');
    containerPaths.add(container.path);
  }
  for (const descriptor of registry.descriptors) {
    if (!descriptor.id || ids.has(descriptor.id)) throw new Error(`REGISTRY_DESCRIPTOR_ID_DUPLICATE:${descriptor.id}`);
    if (!descriptor.path || paths.has(descriptor.path)) throw new Error(`REGISTRY_DESCRIPTOR_PATH_DUPLICATE:${descriptor.path}`);
    ids.add(descriptor.id);
    paths.add(descriptor.path);
    const segments = parsePath(descriptor.path);
    if (segments.filter((segment) => segment === '*').length > 1) {
      throw new Error(`REGISTRY_MULTIPLE_WILDCARDS_UNSUPPORTED:${descriptor.path}`);
    }
    if (segments.includes('*')) validateKeyGrammar(descriptor.key, `descriptor.${descriptor.id}`);
    if (!segments.includes('*') && descriptor.key !== undefined) throw new Error(`REGISTRY_KEY_WITHOUT_WILDCARD:${descriptor.path}`);
    if (segments.includes('[]') && descriptor.authored.type.kind === 'array') {
      throw new Error(`REGISTRY_ARRAY_ITEM_DOUBLE_WRAPPED:${descriptor.path}`);
    }
    assertEnum(descriptor.authored.presence, PRESENCE, 'REGISTRY_AUTHORED_PRESENCE');
    assertEnum(descriptor.resolved.presence, PRESENCE, 'REGISTRY_RESOLVED_PRESENCE');
    assertEnum(descriptor.default.kind, DEFAULT_KINDS, 'REGISTRY_DEFAULT_KIND');
    assertEnum(descriptor.lifecycle, LIFECYCLES, 'REGISTRY_LIFECYCLE');
    assertEnum(descriptor.impact, IMPACTS, 'REGISTRY_IMPACT');
    assertEnum(descriptor.sensitivity, SENSITIVITIES, 'REGISTRY_SENSITIVITY');
    validateType(descriptor.authored.type, `descriptor.${descriptor.id}.authored`);
    validateType(descriptor.resolved.type, `descriptor.${descriptor.id}.resolved`);
    if (typeof descriptor.authored.legacyTs !== 'string' || descriptor.authored.legacyTs.length === 0) {
      throw new Error(`REGISTRY_LEGACY_TYPE_EMPTY:${descriptor.path}`);
    }
    collectTypeKinds(descriptor.authored.type, typeKinds);
    collectTypeKinds(descriptor.resolved.type, typeKinds);
    if (descriptor.default.kind === 'NO_DEFAULT' && Object.hasOwn(descriptor.default, 'value')) {
      throw new Error(`REGISTRY_NO_DEFAULT_HAS_VALUE:${descriptor.path}`);
    }
    if (descriptor.sensitivity === 'SECRET_MATERIAL_FORBIDDEN' && Object.hasOwn(descriptor.default, 'value')) {
      throw new Error(`REGISTRY_SECRET_DEFAULT_FORBIDDEN:${descriptor.path}`);
    }
    for (const key of [descriptor.messages.titleKey, descriptor.messages.descriptionKey]) {
      for (const locale of ['en', 'tr']) {
        if (!messageCatalogs[locale]?.[key]) throw new Error(`REGISTRY_MESSAGE_MISSING:${locale}:${key}`);
      }
    }
    if (!Array.isArray(descriptor.artifacts) || descriptor.artifacts.length === 0
      || new Set(descriptor.artifacts).size !== descriptor.artifacts.length) {
      throw new Error(`REGISTRY_ARTIFACTS_EMPTY:${descriptor.path}`);
    }
  }

  function assertRefs(node, context) {
    if (node.kind === 'ref' && !typeNames.has(node.name)) throw new Error(`REGISTRY_REF_UNRESOLVED:${context}:${node.name}`);
    if (node.kind === 'externalRef' && !externalNames.has(node.name)) throw new Error(`REGISTRY_EXTERNAL_REF_UNRESOLVED:${context}:${node.name}`);
    if (node.kind === 'union') node.variants.forEach((variant, index) => assertRefs(variant, `${context}.${index}`));
    if (node.kind === 'object') node.fields.forEach((field) => assertRefs(field.type, `${context}.${field.name}`));
    if (node.kind === 'array') assertRefs(node.element, `${context}.element`);
    if (node.kind === 'record') assertRefs(node.value, `${context}.value`);
    if (node.kind === 'discriminatedUnion') node.variants.forEach((variant) => assertRefs(variant.type, `${context}.${variant.tag}`));
  }
  for (const [name, node] of Object.entries(registry.types ?? {})) assertRefs(node, `type.${name}`);
  for (const descriptor of registry.descriptors) {
    assertRefs(descriptor.authored.type, `descriptor.${descriptor.id}.authored`);
    assertRefs(descriptor.resolved.type, `descriptor.${descriptor.id}.resolved`);
  }

  const descriptors = [...registry.descriptors].sort((left, right) => left.path.localeCompare(right.path));
  const normalized = canonicalize({ ...registry, descriptors });
  const digest = registryDigest(normalized);
  const countBy = (select) => {
    const counts = new Map();
    for (const descriptor of descriptors) {
      const value = select(descriptor);
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
  };
  const census = {
    descriptors: descriptors.length,
    containers: registry.containers.length,
    internalTypes: typeNames.size,
    externalTypes: externalNames.size,
    dynamicPaths: descriptors.filter((descriptor) => descriptor.path.includes('*')).length,
    arrayItemPaths: descriptors.filter((descriptor) => descriptor.path.includes('[]')).length,
    lifecycle: countBy((descriptor) => descriptor.lifecycle),
    defaultKinds: countBy((descriptor) => descriptor.default.kind),
    impacts: countBy((descriptor) => descriptor.impact),
    sensitivities: countBy((descriptor) => descriptor.sensitivity),
    typeKinds: [...typeKinds].sort(),
  };
  return { registry: normalized, descriptors, digest, census };
}

export function renderType(node, compiled, options = {}) {
  switch (node.kind) {
    case 'primitive':
      return node.name === 'integer' ? 'number' : node.name;
    case 'literal':
      return JSON.stringify(node.value);
    case 'enum':
      return node.values.map((value) => JSON.stringify(value)).join(' | ');
    case 'union':
      return node.variants.map((variant) => renderType(variant, compiled, options)).join(' | ');
    case 'ref':
      return `${node.name}Prototype`;
    case 'externalRef':
      return node.name;
    case 'array':
      return `Array<${renderType(node.element, compiled, options)}>`;
    case 'record':
      return `${node.key.memberPresence === 'optional' ? 'Partial<' : ''}Record<${node.key.tsType}, ${renderType(node.value, compiled, options)}>${node.key.memberPresence === 'optional' ? '>' : ''}`;
    case 'object':
      return `{ ${node.fields.map((field) => `${field.name}${field.presence === 'optional' ? '?' : ''}: ${renderType(field.type, compiled, options)}`).join('; ')} }`;
    case 'discriminatedUnion':
      return node.variants.map((variant) => renderType(variant.type, compiled, options)).join(' | ');
    default:
      throw new Error(`REGISTRY_TYPE_RENDER_UNHANDLED:${node.kind}`);
  }
}

export function defaultDisplay(rule) {
  if (!Object.hasOwn(rule, 'value')) return rule.strategy ? `${rule.kind}:${rule.strategy}` : rule.kind;
  return `${rule.kind}:${JSON.stringify(rule.value)}`;
}
