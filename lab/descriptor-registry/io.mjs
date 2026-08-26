import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const labDirectory = dirname(fileURLToPath(import.meta.url));
export const generatedDirectory = resolve(labDirectory, 'generated');

export function normalizeGeneratedContent(content) {
  return `${String(content).replace(/\r\n/g, '\n').trimEnd()}\n`;
}

async function readIfPresent(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, content, { encoding: 'utf8', flag: 'wx' });
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

export async function reconcileOutputs(outputs, { mode = 'check' } = {}) {
  if (!['check', 'write'].includes(mode)) throw new Error(`OUTPUT_MODE_INVALID:${mode}`);
  const changes = [];
  for (const [relativePath, rawContent] of [...outputs.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (relativePath.startsWith('/') || relativePath.includes('..')) {
      throw new Error(`OUTPUT_PATH_OUTSIDE_GENERATED:${relativePath}`);
    }
    const absolutePath = resolve(generatedDirectory, relativePath);
    if (!absolutePath.startsWith(`${generatedDirectory}/`)) throw new Error(`OUTPUT_PATH_OUTSIDE_GENERATED:${relativePath}`);
    const content = normalizeGeneratedContent(rawContent);
    const previous = await readIfPresent(absolutePath);
    if (previous === content) continue;
    changes.push({ path: `generated/${relativePath}`, state: previous === null ? 'missing' : 'stale' });
    if (mode === 'write') await atomicWrite(absolutePath, content);
  }
  return { mode, changed: changes.length, changes };
}

export function outputModeFromArgv(argv) {
  const flags = new Set(argv.slice(2));
  if (flags.has('--write') && flags.has('--check')) throw new Error('OUTPUT_MODE_CONFLICT');
  return flags.has('--write') ? 'write' : 'check';
}

export function isDirectRun(metaUrl, argv = process.argv) {
  return argv[1] !== undefined && resolve(argv[1]) === fileURLToPath(metaUrl);
}
