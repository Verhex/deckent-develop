/**
 * Canonical project-directory slug shared with Claude Code's session store.
 * Every non-ASCII-alphanumeric character is replaced independently so the
 * mapping remains byte-for-byte compatible with the existing implementation.
 */
export function projectSlug(absPath: string): string {
  return absPath.replace(/[^a-zA-Z0-9]/g, '-');
}
