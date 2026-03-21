// ─── Terminal Utilities ─────────────────────────────────────────────

export function getTerminalWidth(): number {
  if (process.stdout.columns && process.stdout.columns > 0) {
    return process.stdout.columns;
  }
  return 80; // default fallback
}

export function truncateString(str: string, max: number): string {
  if (max <= 0) return '';
  if (str.length <= max) return str;
  if (max <= 3) return str.slice(0, max);
  return str.slice(0, max - 3) + '...';
}

export function fitTable(
  columns: string[],
  data: string[][],
  width: number,
): string {
  if (columns.length === 0) return '';

  // Calculate max width per column
  const colWidths = columns.map((col, i) => {
    const dataMax = data.reduce((max, row) => {
      const cell = row[i] ?? '';
      return Math.max(max, cell.length);
    }, 0);
    return Math.max(col.length, dataMax);
  });

  // If total exceeds width, shrink the widest columns
  const separatorWidth = (columns.length - 1) * 3; // " | " separators
  const totalNeeded = colWidths.reduce((s, w) => s + w, 0) + separatorWidth;

  if (totalNeeded > width && columns.length > 0) {
    const available = width - separatorWidth;
    const perCol = Math.max(4, Math.floor(available / columns.length));
    for (let i = 0; i < colWidths.length; i++) {
      if (colWidths[i]! > perCol) {
        colWidths[i] = perCol;
      }
    }
  }

  const formatRow = (cells: string[]): string =>
    cells
      .map((c, i) => {
        const w = colWidths[i] ?? 10;
        const truncated = truncateString(c, w);
        return truncated.padEnd(w);
      })
      .join(' | ');

  const headerLine = formatRow(columns);
  const separator = colWidths.map((w) => '-'.repeat(w)).join('-+-');
  const dataLines = data.map((row) => formatRow(row));

  return [headerLine, separator, ...dataLines].join('\n');
}

export function clearLines(n: number): string {
  if (n <= 0) return '';
  // ANSI: move cursor up n lines and clear each
  const lines: string[] = [];
  for (let i = 0; i < n; i++) {
    lines.push('\x1b[1A\x1b[2K');
  }
  return lines.join('');
}

export function isInteractive(): boolean {
  return Boolean(process.stdout.isTTY);
}
