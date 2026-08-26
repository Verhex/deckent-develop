import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { compileRegistry, parsePath, sha256 } from './model.mjs';
import { messages } from './messages.mjs';
import { registry } from './registry.mjs';
import { generatedDirectory, isDirectRun, reconcileOutputs } from './io.mjs';

const sourceRelativePath = 'src/core/config-types.ts';
const sourcePath = resolve(generatedDirectory, '../../..', sourceRelativePath);

function stripComments(source) {
  let output = '';
  let state = 'code';
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (state === 'line-comment') {
      if (character === '\n') {
        output += '\n';
        state = 'code';
      } else output += ' ';
      continue;
    }
    if (state === 'block-comment') {
      if (character === '*' && next === '/') {
        output += '  ';
        index += 1;
        state = 'code';
      } else output += character === '\n' ? '\n' : ' ';
      continue;
    }
    if (state === 'single-quote' || state === 'double-quote' || state === 'template') {
      output += character;
      if (character === '\\') {
        output += source[index + 1] ?? '';
        index += 1;
      } else if ((state === 'single-quote' && character === "'")
        || (state === 'double-quote' && character === '"')
        || (state === 'template' && character === '`')) state = 'code';
      continue;
    }
    if (character === '/' && next === '/') {
      output += '  ';
      index += 1;
      state = 'line-comment';
    } else if (character === '/' && next === '*') {
      output += '  ';
      index += 1;
      state = 'block-comment';
    } else {
      output += character;
      if (character === "'") state = 'single-quote';
      else if (character === '"') state = 'double-quote';
      else if (character === '`') state = 'template';
    }
  }
  return output;
}

function findBalanced(source, start, openCharacter, closeCharacter) {
  let depth = 0;
  let quote = null;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote !== null) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (["'", '"', '`'].includes(character)) {
      quote = character;
      continue;
    }
    if (character === openCharacter) depth += 1;
    if (character === closeCharacter) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error(`SOURCE_BALANCE_UNCLOSED:${openCharacter}:${start}`);
}

function declarationMap(cleanedSource) {
  const declarations = new Map();
  const interfacePattern = /\b(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)[^\{]*\{/g;
  for (const match of cleanedSource.matchAll(interfacePattern)) {
    const open = match.index + match[0].lastIndexOf('{');
    const close = findBalanced(cleanedSource, open, '{', '}');
    declarations.set(match[1], { kind: 'interface', body: cleanedSource.slice(open + 1, close), offset: open + 1 });
  }
  const aliasPattern = /\b(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/g;
  for (const match of cleanedSource.matchAll(aliasPattern)) {
    const start = match.index + match[0].length;
    let round = 0;
    let square = 0;
    let curly = 0;
    let angle = 0;
    let quote = null;
    let end = -1;
    for (let index = start; index < cleanedSource.length; index += 1) {
      const character = cleanedSource[index];
      if (quote !== null) {
        if (character === '\\') index += 1;
        else if (character === quote) quote = null;
        continue;
      }
      if (["'", '"', '`'].includes(character)) quote = character;
      else if (character === '(') round += 1;
      else if (character === ')') round -= 1;
      else if (character === '[') square += 1;
      else if (character === ']') square -= 1;
      else if (character === '{') curly += 1;
      else if (character === '}') curly -= 1;
      else if (character === '<') angle += 1;
      else if (character === '>') angle = Math.max(0, angle - 1);
      else if (character === ';' && round === 0 && square === 0 && curly === 0 && angle === 0) {
        end = index;
        break;
      }
    }
    if (end !== -1) declarations.set(match[1], { kind: 'alias', body: cleanedSource.slice(start, end), offset: start });
  }
  return declarations;
}

function splitMembers(body, bodyOffset) {
  const members = [];
  let start = 0;
  let round = 0;
  let square = 0;
  let curly = 0;
  let angle = 0;
  let quote = null;
  for (let index = 0; index <= body.length; index += 1) {
    const character = body[index] ?? ';';
    if (quote !== null) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (["'", '"', '`'].includes(character)) quote = character;
    else if (character === '(') round += 1;
    else if (character === ')') round -= 1;
    else if (character === '[') square += 1;
    else if (character === ']') square -= 1;
    else if (character === '{') curly += 1;
    else if (character === '}') curly -= 1;
    else if (character === '<') angle += 1;
    else if (character === '>') angle = Math.max(0, angle - 1);
    else if (character === ';' && round === 0 && square === 0 && curly === 0 && angle === 0) {
      const chunk = body.slice(start, index);
      const match = chunk.match(/^\s*(?:readonly\s+)?(?:([A-Za-z_$][\w$]*)|(['"])(.*?)\2)\s*(\?)?\s*:\s*([\s\S]+?)\s*$/);
      if (match) {
        const name = match[1] ?? match[3];
        const nameIndex = chunk.indexOf(match[1] ?? match[2]);
        const typeIndex = chunk.indexOf(match[5], nameIndex);
        members.push({
          name,
          optional: match[4] === '?',
          type: match[5].trim(),
          offset: bodyOffset + start + nameIndex,
          typeOffset: bodyOffset + start + typeIndex,
        });
      }
      start = index + 1;
    }
  }
  return members;
}

function unwrapGeneric(type, genericName) {
  const trimmed = type.trim();
  const prefix = `${genericName}<`;
  if (!trimmed.startsWith(prefix)) return null;
  const open = genericName.length;
  const close = findBalanced(trimmed, open, '<', '>');
  if (trimmed.slice(close + 1).trim() !== '') return null;
  return trimmed.slice(open + 1, close).trim();
}

function unwrapParentheses(type) {
  let value = type.trim();
  while (value.startsWith('(')) {
    const close = findBalanced(value, 0, '(', ')');
    if (close !== value.length - 1) break;
    value = value.slice(1, -1).trim();
  }
  return value;
}

function splitTopLevel(value, delimiter = ',') {
  const parts = [];
  let start = 0;
  let round = 0;
  let square = 0;
  let curly = 0;
  let angle = 0;
  let quote = null;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote !== null) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (["'", '"', '`'].includes(character)) quote = character;
    else if (character === '(') round += 1;
    else if (character === ')') round -= 1;
    else if (character === '[') square += 1;
    else if (character === ']') square -= 1;
    else if (character === '{') curly += 1;
    else if (character === '}') curly -= 1;
    else if (character === '<') angle += 1;
    else if (character === '>') angle = Math.max(0, angle - 1);
    else if (character === delimiter && round === 0 && square === 0 && curly === 0 && angle === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts;
}

function membersFor(type, declarations, typeOffset = 0) {
  let target = unwrapParentheses(type);
  let partial = false;
  for (;;) {
    const unwrapped = unwrapGeneric(target, 'Partial') ?? unwrapGeneric(target, 'Readonly');
    if (unwrapped === null) break;
    if (target.startsWith('Partial<')) partial = true;
    target = unwrapParentheses(unwrapped);
  }
  if (target.startsWith('{')) {
    const close = findBalanced(target, 0, '{', '}');
    return { members: splitMembers(target.slice(1, close), typeOffset + 1), partial, declaration: 'inline' };
  }
  const declaration = declarations.get(target);
  if (!declaration) throw new Error(`SOURCE_TYPE_NOT_TRAVERSABLE:${target}`);
  if (declaration.kind === 'alias') return membersFor(declaration.body, declarations, declaration.offset);
  return { members: splitMembers(declaration.body, declaration.offset), partial, declaration: target };
}

function recordValue(type) {
  let target = unwrapParentheses(type);
  let optionalKeys = false;
  const partial = unwrapGeneric(target, 'Partial');
  if (partial !== null) {
    optionalKeys = true;
    target = unwrapParentheses(partial);
  }
  const record = unwrapGeneric(target, 'Record');
  if (record === null) throw new Error(`SOURCE_RECORD_EXPECTED:${target}`);
  const parts = splitTopLevel(record);
  if (parts.length !== 2) throw new Error(`SOURCE_RECORD_ARITY:${target}`);
  return { keyType: parts[0], type: parts[1], optionalKeys };
}

function arrayElement(type) {
  const target = unwrapParentheses(type);
  const generic = unwrapGeneric(target, 'Array') ?? unwrapGeneric(target, 'ReadonlyArray');
  if (generic !== null) return generic;
  if (target.endsWith('[]')) return target.slice(0, -2).trim();
  throw new Error(`SOURCE_ARRAY_EXPECTED:${target}`);
}

function normalizeType(type) {
  return unwrapParentheses(type).replace(/\s+/g, '');
}

function lineAt(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

function inspectDescriptor(descriptor, source, declarations) {
  const segments = parsePath(descriptor.path);
  let currentType = 'DeckentConfig';
  let currentTypeOffset = 0;
  let ancestorConditional = false;
  let enclosingMemberOptional = false;
  let terminalCollectionOptional = false;
  let actualKey = null;
  let evidenceOffset = 0;
  let declaration = 'DeckentConfig';
  for (const [index, segment] of segments.entries()) {
    const terminal = index === segments.length - 1;
    if (segment === '*') {
      const record = recordValue(currentType);
      currentType = record.type;
      actualKey = { type: record.keyType, memberPresence: record.optionalKeys ? 'optional' : 'required' };
      terminalCollectionOptional = record.optionalKeys || enclosingMemberOptional;
      if (!terminal) ancestorConditional = true;
      continue;
    }
    if (segment === '[]') {
      currentType = arrayElement(currentType);
      terminalCollectionOptional = enclosingMemberOptional;
      if (!terminal) ancestorConditional = true;
      continue;
    }
    const ownerType = currentType;
    const shape = membersFor(ownerType, declarations, currentTypeOffset);
    const member = shape.members.find((candidate) => candidate.name === segment);
    if (!member) throw new Error(`SOURCE_PATH_MISSING:${descriptor.path}:${segment}:${ownerType}`);
    const effectiveOptional = shape.partial || member.optional;
    enclosingMemberOptional = effectiveOptional;
    evidenceOffset = member.offset;
    declaration = shape.declaration === 'inline'
      ? `DeckentConfig.${segments.slice(0, index).filter((part) => part !== '*' && part !== '[]').join('.')}`
      : shape.declaration;
    currentType = member.type;
    currentTypeOffset = member.typeOffset;
    if (!terminal && effectiveOptional) ancestorConditional = true;
  }
  const terminalSegment = segments.at(-1);
  let actualPresence;
  if (terminalSegment === '*' || terminalSegment === '[]') {
    actualPresence = terminalCollectionOptional ? 'optional' : 'required_when_parent_present';
  } else if (enclosingMemberOptional) {
    actualPresence = 'optional';
  } else if (segments.length === 1) {
    actualPresence = 'required';
  } else {
    actualPresence = ancestorConditional ? 'required_when_parent_present' : 'required_when_parent_present';
  }
  const expectedType = descriptor.authored.legacyTs;
  const typeMatches = normalizeType(currentType) === normalizeType(expectedType);
  const presenceMatches = actualPresence === descriptor.authored.presence;
  const expectedKey = descriptor.key
    ? { type: descriptor.key.tsType, memberPresence: descriptor.key.memberPresence ?? 'required' }
    : null;
  const keyTypeMatches = expectedKey === null || normalizeType(actualKey?.type ?? '') === normalizeType(expectedKey.type);
  const keyPresenceMatches = expectedKey === null || actualKey?.memberPresence === expectedKey.memberPresence;
  return {
    path: descriptor.path,
    status: typeMatches && presenceMatches && keyTypeMatches && keyPresenceMatches ? 'MATCH' : 'DRIFT',
    expected: { type: expectedType, presence: descriptor.authored.presence, ...(expectedKey ? { key: expectedKey } : {}) },
    actual: { type: currentType.replace(/\s+/g, ' ').trim(), presence: actualPresence, ...(actualKey ? { key: actualKey } : {}) },
    evidence: { source: sourceRelativePath, declaration, line: lineAt(source, evidenceOffset) },
    drift: [
      ...(typeMatches ? [] : [{ dimension: 'type', expected: expectedType, actual: currentType.replace(/\s+/g, ' ').trim() }]),
      ...(presenceMatches ? [] : [{ dimension: 'presence', expected: descriptor.authored.presence, actual: actualPresence }]),
      ...(keyTypeMatches ? [] : [{ dimension: 'key-type', expected: expectedKey?.type, actual: actualKey?.type ?? null }]),
      ...(keyPresenceMatches ? [] : [{ dimension: 'key-member-presence', expected: expectedKey?.memberPresence, actual: actualKey?.memberPresence ?? null }]),
    ],
  };
}

export async function createEqualityReport() {
  const compiled = compileRegistry(registry, messages);
  const source = await readFile(sourcePath, 'utf8');
  const cleanedSource = stripComments(source);
  const declarations = declarationMap(cleanedSource);
  const fields = compiled.descriptors.map((descriptor) => inspectDescriptor(descriptor, source, declarations));
  const drift = fields.flatMap((field) => field.drift.map((item) => ({ path: field.path, ...item })));
  return {
    schemaVersion: 1,
    check: 'registry-authored-shape-vs-production-config-types',
    status: drift.length === 0 ? 'MATCH' : 'DRIFT',
    registryDigest: compiled.digest,
    source: {
      path: sourceRelativePath,
      sha256: `sha256:${sha256(source)}`,
      bytes: Buffer.byteLength(source),
    },
    comparedFields: fields.length,
    matchedFields: fields.filter((field) => field.status === 'MATCH').length,
    drift,
    fields,
  };
}

export async function equalityOutput() {
  const report = await createEqualityReport();
  return new Map([['equality-report.generated.json', JSON.stringify(report, null, 2)]]);
}

if (isDirectRun(import.meta.url)) {
  const flags = new Set(process.argv.slice(2));
  if (flags.has('--write') && flags.has('--check')) throw new Error('OUTPUT_MODE_CONFLICT');
  const report = await createEqualityReport();
  let generated = null;
  if (flags.has('--write') || flags.has('--check')) {
    generated = await reconcileOutputs(new Map([['equality-report.generated.json', JSON.stringify(report, null, 2)]]), {
      mode: flags.has('--write') ? 'write' : 'check',
    });
  }
  process.stdout.write(`${JSON.stringify({
    status: report.status,
    comparedFields: report.comparedFields,
    matchedFields: report.matchedFields,
    drift: report.drift,
    generated,
  }, null, 2)}\n`);
  if (report.status !== 'MATCH' || (generated?.mode === 'check' && generated.changed > 0)) process.exitCode = 1;
}
