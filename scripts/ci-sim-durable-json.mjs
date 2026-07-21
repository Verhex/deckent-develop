import { randomUUID } from 'node:crypto';
import { open, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

async function syncParentDirectory(path) {
  if (process.platform === 'win32') return;
  const directory = await open(dirname(path), 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}

export async function atomicJson(path, value) {
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(value)}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, path);
    await syncParentDirectory(path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function syncCreatedFile(path) {
  await syncParentDirectory(path);
}
