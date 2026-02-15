export function sanitizePath(input: string): string {
  // Reject outright if input contains null bytes or backslashes
  if (input.includes('\0') || /\\/.test(input)) return '';

  let result = input
    .replace(/\.\./g, '')           // Remove .. sequences
    .replace(/^\/+/, '')            // Remove leading slashes
    .replace(/\/+/g, '/')           // Normalize multiple slashes
    .replace(/[<>:"|?*\x00-\x1f]/g, '') // Remove invalid filename chars
    .trim();

  // Second pass: ensure no .. survived after previous replacements
  // e.g. "....//" could leave ".." after normalization
  while (result.includes('..')) {
    result = result.replace(/\.\./g, '');
  }

  // Reject if result starts with / after trimming (absolute path)
  if (result.startsWith('/')) result = result.slice(1);

  return result;
}

export function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\.{2,}/g, '.')
    .substring(0, 255)
    .trim();
}

export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot > 0 ? filename.substring(lastDot + 1).toLowerCase() : '';
}

export function getFileName(path: string): string {
  return path.split('/').pop() || path;
}

export function getParentPath(path: string): string {
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

export function joinPath(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .join('/')
    .replace(/\/+/g, '/');
}

/**
 * Escape LIKE / ilike wildcards in user-supplied search terms.
 * Prevents users from injecting `%` or `_` to bypass search filters.
 */
export function escapeLike(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&');
}

/**
 * Validate that a file path is safe (no traversal, null bytes, backslashes).
 * Returns true if the path is safe, false if it should be rejected.
 */
export function isPathSafe(filePath: string): boolean {
  if (!filePath) return false;
  if (filePath.includes('..')) return false;
  if (filePath.includes('\0')) return false;
  if (/\\/.test(filePath)) return false;
  if (filePath.startsWith('/')) return false;
  return true;
}
