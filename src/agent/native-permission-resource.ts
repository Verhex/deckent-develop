/** Permission resource identity aligned with chat-tool-exec dispatch (String coercions, no trim, no aliases). */

export function primaryResource(args: Record<string, unknown>): string {
  const v = args['path'] ?? args['file_path'] ?? args['cmd'] ?? args['url'] ?? args['pattern'] ?? '';
  return typeof v === 'string' ? v : '';
}

function hasExplicitPathArg(args: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(args, 'path')
    && args['path'] !== undefined
    && args['path'] !== null;
}

/** Mirrors chat-tool-exec.ts list/read path defaults (`String(args['path'] ?? …)`). */
function execPath(args: Record<string, unknown>, defaultPath: string): string {
  return String(args['path'] ?? defaultPath);
}

export function permissionResource(tool: string, args: Record<string, unknown>): string {
  if (tool === 'deckent_list_dir') {
    return execPath(args, '.');
  }
  if (tool === 'deckent_grep' || tool === 'deckent_glob') {
    // Explicit path (including "." and "") is the permission resource — do not fold to pattern.
    if (hasExplicitPathArg(args)) {
      return String(args['path']);
    }
    const pattern = args['pattern'];
    if (typeof pattern === 'string' && pattern.length > 0) {
      return pattern;
    }
    return '.';
  }
  if (tool === 'deckent_read_file') {
    return execPath(args, '');
  }
  return primaryResource(args);
}
