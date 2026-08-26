import { compileRegistry, parsePath, renderType } from './model.mjs';
import { messages } from './messages.mjs';
import { registry } from './registry.mjs';
import { isDirectRun, outputModeFromArgv, reconcileOutputs } from './io.mjs';

function node() {
  return { descriptor: null, named: new Map(), wildcard: null, arrayItem: null };
}

function buildPathTree(descriptors) {
  const root = node();
  for (const descriptor of descriptors) {
    let cursor = root;
    for (const segment of parsePath(descriptor.path)) {
      if (segment === '*') {
        cursor.wildcard ??= { ...node(), key: descriptor.key };
        if (JSON.stringify(cursor.wildcard.key) !== JSON.stringify(descriptor.key)) {
          throw new Error(`GENERATOR_WILDCARD_GRAMMAR_CONFLICT:${descriptor.path}`);
        }
        cursor = cursor.wildcard;
      } else if (segment === '[]') {
        cursor.arrayItem ??= node();
        cursor = cursor.arrayItem;
      } else {
        if (!cursor.named.has(segment)) cursor.named.set(segment, node());
        cursor = cursor.named.get(segment);
      }
    }
    if (cursor.descriptor !== null) throw new Error(`GENERATOR_PATH_COLLISION:${descriptor.path}`);
    cursor.descriptor = descriptor;
  }
  return root;
}

function descendantPresences(treeNode, mode, output = new Set()) {
  if (treeNode.descriptor) output.add(treeNode.descriptor[mode].presence);
  for (const child of treeNode.named.values()) descendantPresences(child, mode, output);
  if (treeNode.wildcard) descendantPresences(treeNode.wildcard, mode, output);
  if (treeNode.arrayItem) descendantPresences(treeNode.arrayItem, mode, output);
  return output;
}

function renderTreeNode(treeNode, mode, compiled, containerByPath, path) {
  const branches = Number(treeNode.named.size > 0) + Number(treeNode.wildcard !== null) + Number(treeNode.arrayItem !== null);
  if (treeNode.descriptor !== null && branches === 0) return renderType(treeNode.descriptor[mode].type, compiled);
  if (treeNode.descriptor !== null) throw new Error(`GENERATOR_LEAF_HAS_CHILDREN:${path}`);
  if (branches > 1) throw new Error(`GENERATOR_NODE_SHAPE_AMBIGUOUS:${path}`);
  if (treeNode.wildcard !== null) {
    const record = `Record<${treeNode.wildcard.key.tsType}, ${renderTreeNode(treeNode.wildcard, mode, compiled, containerByPath, `${path}.*`)}>`;
    return treeNode.wildcard.key.memberPresence === 'optional' ? `Partial<${record}>` : record;
  }
  if (treeNode.arrayItem !== null) {
    return `Array<${renderTreeNode(treeNode.arrayItem, mode, compiled, containerByPath, `${path}.[]`)}>`;
  }
  const fields = [...treeNode.named.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([name, child]) => {
    const childPath = path ? `${path}.${name}` : name;
    let presence = child.descriptor?.[mode].presence
      ?? containerByPath.get(childPath)?.[`${mode}Presence`];
    if (!presence) {
      const inherited = descendantPresences(child, mode);
      if (inherited.size === 1) [presence] = inherited;
    }
    if (!presence) throw new Error(`GENERATOR_CONTAINER_PRESENCE_MISSING:${mode}:${childPath}`);
    const optional = presence === 'optional' ? '?' : '';
    const rendered = renderTreeNode(child, mode, compiled, containerByPath, childPath).replaceAll('\n', '\n  ');
    return `  ${JSON.stringify(name)}${optional}: ${rendered};`;
  });
  return `{\n${fields.join('\n')}\n}`;
}

function renderInternalType(name, type, compiled) {
  return `export type ${name}Prototype = ${renderType(type, compiled)};`;
}

function renderFiniteKeyAliases(descriptors) {
  const aliases = new Map();
  for (const descriptor of descriptors) {
    if (descriptor.key?.kind !== 'finite') continue;
    const rendered = descriptor.key.values.map((value) => JSON.stringify(value)).join(' | ');
    const previous = aliases.get(descriptor.key.tsType);
    if (previous && previous !== rendered) throw new Error(`GENERATOR_FINITE_ALIAS_CONFLICT:${descriptor.key.tsType}`);
    aliases.set(descriptor.key.tsType, rendered);
  }
  return [...aliases.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([name, rendered]) => `export type ${name} = ${rendered};`);
}

export function generateTypeOutputs() {
  const compiled = compileRegistry(registry, messages);
  const tree = buildPathTree(compiled.descriptors);
  const containerByPath = new Map(compiled.registry.containers.map((container) => [container.path, container]));
  const importsByPath = new Map();
  for (const [name, external] of Object.entries(compiled.registry.externalTypes)) {
    const names = importsByPath.get(external.importFrom) ?? [];
    names.push(name);
    importsByPath.set(external.importFrom, names);
  }
  const imports = [...importsByPath.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([path, names]) => `import type { ${names.sort().join(', ')} } from ${JSON.stringify(path)};`);
  const internalTypes = Object.entries(compiled.registry.types).sort(([left], [right]) => left.localeCompare(right))
    .map(([name, type]) => renderInternalType(name, type, compiled));
  const finiteAliases = renderFiniteKeyAliases(compiled.descriptors);
  const authoredBody = renderTreeNode(tree, 'authored', compiled, containerByPath, '');
  const resolvedBody = renderTreeNode(tree, 'resolved', compiled, containerByPath, '');
  const content = [
    '/* AUTO-GENERATED by lab/descriptor-registry/generate-types.mjs. DO NOT EDIT. */',
    '/* Prototype only: this file is not a production config authority. */',
    `/* Registry: ${compiled.digest}; descriptors: ${compiled.census.descriptors}. */`,
    '',
    ...imports,
    '',
    ...finiteAliases,
    '',
    ...internalTypes,
    '',
    `export type AuthoredConfigPrototype = ${authoredBody};`,
    '',
    `export type ResolvedConfigPrototype = ${resolvedBody};`,
  ].join('\n');
  return new Map([['config-types.generated.ts', content]]);
}

if (isDirectRun(import.meta.url)) {
  const result = await reconcileOutputs(generateTypeOutputs(), { mode: outputModeFromArgv(process.argv) });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.mode === 'check' && result.changed > 0) process.exitCode = 1;
}
