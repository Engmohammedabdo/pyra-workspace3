'use client';

import { FileWithProject } from './types';

/**
 * Extract subfolder parts from a file path as an array.
 * Path format: projects/{company}/{project}/{sub1}/{sub2}/.../filename
 * Returns: ['sub1', 'sub2', ...] (empty array if file is at project root)
 */
export function getSubfolderParts(filePath: string): string[] {
  const parts = filePath.split('/');
  // parts: ['projects', company, project, sub1, sub2, ..., filename]
  if (parts.length <= 4) return []; // file at project root
  return parts.slice(3, parts.length - 1);
}

/**
 * Format a single folder segment name for display.
 * Replaces dashes/underscores with spaces, capitalizes words.
 */
export function formatSegmentName(segment: string): string {
  return segment
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Given all files and the current navigation path,
 * compute what's visible at this level:
 * - folders: immediate child directories
 * - files: files that live at exactly this depth
 */
export function getItemsAtLevel(files: FileWithProject[], currentPath: string[]) {
  const depth = currentPath.length;
  const folderMap = new Map<string, { count: number; totalSize: number }>();
  const filesAtLevel: FileWithProject[] = [];

  for (const file of files) {
    const parts = getSubfolderParts(file.file_path);

    // Check if file is under the current path
    let matches = true;
    for (let i = 0; i < depth; i++) {
      if (i >= parts.length || parts[i] !== currentPath[i]) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;

    if (parts.length === depth) {
      // File is exactly at this level (no deeper subfolder)
      filesAtLevel.push(file);
    } else if (parts.length > depth) {
      // File is in a child folder — count the immediate child folder
      const folderName = parts[depth];
      const existing = folderMap.get(folderName) || { count: 0, totalSize: 0 };
      existing.count++;
      existing.totalSize += file.file_size || 0;
      folderMap.set(folderName, existing);
    }
  }

  const folders = Array.from(folderMap.entries())
    .map(([name, info]) => ({
      name,
      label: formatSegmentName(name),
      fileCount: info.count,
      totalSize: info.totalSize,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { folders, files: filesAtLevel };
}
