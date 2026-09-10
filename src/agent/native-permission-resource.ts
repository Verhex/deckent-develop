/** Permission resource identity aligned with chat-tool-exec dispatch (no trim, no unknown aliases). */

export function primaryResource(args: Record<string, unknown>): string {
  const v = args['path'] ?? args['file_path'] ?? args['cmd'] ?? args['url'] ?? args['pattern'] ?? '';
  return typeof v === 'string' ? v : '';
}

export function permissionResource(tool: string, args: Record<string, unknown>): string {
  if (tool === 'deckent_list_dir') {
    if (args['path'] === undefined || args['path'] === null) return '.';
    return typeof args['path'] === 'string' ? args['path'] : '.';
  }
  if (tool === 'deckent_grep' || tool === 'deckent_glob') {
    const pattern = args['pattern'];
    if (typeof pattern !== 'string' || pattern.length === 0) {
      return typeof args['path'] === 'string' ? args['path'] : '';
    }
    const path = args['path'];
    if (typeof path === 'string' && path.length > 0) return path;
    return pattern;
  }
  if (tool === 'deckent_read_file') {
    const path = args['path'];
    return typeof path === 'string' ? path : '';
  }
  return primaryResource(args);
}
