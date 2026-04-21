# File Organizer — Local Filesystem Organization Helpers

## Trigger Patterns
- "organize my files", "rename files in bulk", "sort by date"
- "find duplicates", "deduplicate", "cleanup directory"
- "move files by extension", "flatten folder structure"

## Core API Patterns

### Bulk Rename with Pattern
```typescript
import { readdirSync, renameSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

function bulkRename(dir: string, pattern: (name: string, index: number) => string): void {
  const files = readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isFile())
    .sort((a, b) => a.name.localeCompare(b.name));

  for (let i = 0; i < files.length; i++) {
    const oldPath = join(dir, files[i].name);
    const ext = extname(files[i].name);
    const newName = pattern(basename(files[i].name, ext), i) + ext;
    renameSync(oldPath, join(dir, newName));
  }
}

// Usage: bulkRename('./photos', (name, i) => `vacation-${String(i + 1).padStart(3, '0')}`);
```

### Sort Files into Subdirectories by Extension
```typescript
import { readdirSync, mkdirSync, renameSync, existsSync } from 'node:fs';

function sortByExtension(dir: string): Record<string, number> {
  const stats: Record<string, number> = {};
  const files = readdirSync(dir, { withFileTypes: true }).filter(d => d.isFile());

  for (const file of files) {
    const ext = extname(file.name).slice(1).toLowerCase() || 'no-extension';
    const targetDir = join(dir, ext);
    if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
    renameSync(join(dir, file.name), join(targetDir, file.name));
    stats[ext] = (stats[ext] ?? 0) + 1;
  }
  return stats;
}
```

### Find Duplicate Files by Content Hash
```typescript
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';

function findDuplicates(dir: string): Map<string, string[]> {
  const hashMap = new Map<string, string[]>();

  function walk(d: string): void {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const fullPath = join(d, entry.name);
      if (entry.isDirectory()) { walk(fullPath); continue; }
      const hash = createHash('sha256').update(readFileSync(fullPath)).digest('hex');
      const existing = hashMap.get(hash) ?? [];
      existing.push(fullPath);
      hashMap.set(hash, existing);
    }
  }

  walk(dir);
  return new Map([...hashMap].filter(([, paths]) => paths.length > 1));
}
```

### Sort Files by Date Modified
```typescript
function sortByDate(dir: string, targetDir: string): void {
  const files = readdirSync(dir, { withFileTypes: true }).filter(d => d.isFile());
  for (const file of files) {
    const fullPath = join(dir, file.name);
    const stat = statSync(fullPath);
    const dateStr = stat.mtime.toISOString().split('T')[0]; // YYYY-MM-DD
    const dest = join(targetDir, dateStr);
    mkdirSync(dest, { recursive: true });
    renameSync(fullPath, join(dest, file.name));
  }
}
```

## Error Handling
- **EACCES permission denied**: Check file ownership. Use `chmodSync` or run with appropriate permissions.
- **ENOENT**: Always check `existsSync` before operating. Race conditions possible with concurrent writes.
- **ENAMETOOLONG**: Truncate filenames to 255 bytes. Use `Buffer.byteLength(name) < 255` check.
- **Cross-device rename**: `renameSync` fails across mount points. Fall back to `copyFileSync` + `unlinkSync`.
- **Symlinks**: Use `lstatSync` instead of `statSync` to avoid following symlinks into unexpected directories.

## Best Practices
- Always do a dry-run first: log intended operations before executing
- Create a rollback manifest (JSON map of old -> new paths) before bulk operations
- Use `node:path` for all path manipulation (never string concatenation)
- Skip hidden files (starting with `.`) by default unless explicitly requested
- For large directories (10K+ files), use async `readdir` with batching
