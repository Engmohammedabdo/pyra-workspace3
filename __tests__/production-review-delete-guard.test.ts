import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('production review evidence delete guard', () => {
  it('maps the authoritative database guard in task and board delete routes', () => {
    for (const path of [
      'app/api/tasks/[id]/route.ts',
      'app/api/boards/[id]/route.ts',
    ]) {
      const source = read(path);
      expect(source).toContain('PRODUCTION_REVIEW_DELETE_BLOCKED_ERROR');
      expect(source).toContain('productionReviewedTaskArchiveOnly');
    }
  });

  it('deletes a project through one atomic database writer', () => {
    const source = read('app/api/projects/[id]/route.ts');
    expect(source).toContain("'pyra_delete_project_atomic'");
    expect(source).toContain('createServiceRoleClient');
    expect(source).toContain('PRODUCTION_REVIEW_DELETE_BLOCKED_ERROR');
    expect(source).not.toMatch(/from\('pyra_project_files'\)[\s\S]{0,120}\.delete\(\)/);
    expect(source).not.toMatch(/from\('pyra_client_comments'\)[\s\S]{0,120}\.delete\(\)/);
  });
});
