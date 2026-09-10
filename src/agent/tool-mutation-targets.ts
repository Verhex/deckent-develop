/** Paths that may mutate disk for self-modification guard (read paths excluded). */

const READ_PATH_TOOLS = new Set([
  'read_file',
  'deckent_read_file',
  'grep',
  'deckent_grep',
  'glob',
  'deckent_glob',
  'list_dir',
  'deckent_list_dir',
]);

function pathLikeTargets(args: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const k of ['path', 'file_path']) {
    if (typeof args[k] === 'string') out.push(args[k] as string);
  }
  if (Array.isArray(args['files'])) {
    for (const f of args['files']) if (typeof f === 'string') out.push(f);
  }
  return out;
}

function isReadPathTool(tool: string): boolean {
  if (READ_PATH_TOOLS.has(tool)) return true;
  return tool.endsWith('_read_file') || tool.endsWith('_grep') || tool.endsWith('_glob') || tool.endsWith('_list_dir');
}

/**
 * Write/mutation targets for ADR-039 self-mod guard — NOT read/list/grep paths.
 * `writeTargets()` remains for legacy spawn parity; loop/bridge use this.
 */
export function mutationTargetsForSelfMod(tool: string, args: Record<string, unknown>): string[] {
  if (isReadPathTool(tool)) return [];
  return pathLikeTargets(args);
}
