// ─── Change Categorizer ─────────────────────────────────────────────

export type ChangeCategory = 'source' | 'test' | 'config' | 'docs' | 'build';

export interface FileChange {
  filePath: string;
  linesAdded: number;
  linesRemoved: number;
}

export class ChangeCategorizer {
  categorize(files: FileChange[]): Map<ChangeCategory, FileChange[]> {
    const result = new Map<ChangeCategory, FileChange[]>();

    for (const file of files) {
      const category = this.detectCategory(file.filePath);
      const existing = result.get(category) ?? [];
      existing.push(file);
      result.set(category, existing);
    }

    return result;
  }

  detectCategory(filePath: string): ChangeCategory {
    const lower = filePath.toLowerCase();

    // Test files (path or suffix based)
    if (
      lower.includes('/tests/') ||
      lower.startsWith('tests/') ||
      lower.includes('/test/') ||
      lower.startsWith('test/') ||
      lower.includes('.test.') ||
      lower.includes('.spec.')
    ) {
      return 'test';
    }

    // Build files (path-based, checked before config to avoid .yml false positives)
    if (
      lower.includes('dockerfile') ||
      lower.includes('makefile') ||
      lower.includes('.github/') ||
      lower.includes('ci/') ||
      lower.endsWith('.sh')
    ) {
      return 'build';
    }

    // Docs (path or extension based)
    if (
      lower.endsWith('.md') ||
      lower.includes('/docs/') ||
      lower.startsWith('docs/') ||
      lower.includes('readme') ||
      lower.includes('changelog') ||
      lower.includes('license')
    ) {
      return 'docs';
    }

    // Config files
    if (
      lower.endsWith('.json') && (lower.includes('config') || lower.includes('tsconfig') || lower.includes('package')) ||
      lower.endsWith('.yaml') ||
      lower.endsWith('.yml') ||
      lower.endsWith('.toml') ||
      lower.includes('.eslint') ||
      lower.includes('.prettier')
    ) {
      return 'config';
    }

    // Default: source
    return 'source';
  }

  formatCategorized(categorized: Map<ChangeCategory, FileChange[]>): string {
    const order: ChangeCategory[] = ['source', 'test', 'config', 'docs', 'build'];
    const lines: string[] = [];

    for (const category of order) {
      const files = categorized.get(category);
      if (!files || files.length === 0) continue;

      const totalAdded = files.reduce((s, f) => s + f.linesAdded, 0);
      const totalRemoved = files.reduce((s, f) => s + f.linesRemoved, 0);

      lines.push(`${category.toUpperCase()} (${files.length} files, +${totalAdded} -${totalRemoved}):`);
      for (const file of files) {
        lines.push(`  ${file.filePath} +${file.linesAdded} -${file.linesRemoved}`);
      }
    }

    if (lines.length === 0) {
      return 'No changes';
    }

    return lines.join('\n');
  }
}
