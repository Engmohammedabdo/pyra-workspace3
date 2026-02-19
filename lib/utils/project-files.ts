import type { SupabaseClient } from '@supabase/supabase-js';
import { generateId } from './id';

/**
 * Auto-link a file to its project in pyra_project_files.
 *
 * When a file is uploaded under a project path
 * (projects/{company}/{project}/...), this function finds the matching
 * project in pyra_projects by storage_path and inserts a record in
 * pyra_project_files so the client can see it in the portal.
 *
 * Non-critical — errors are logged but never thrown.
 */
export async function autoLinkFileToProject(
  supabase: SupabaseClient,
  opts: {
    filePath: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    uploadedBy: string;
  }
): Promise<void> {
  try {
    const { filePath, fileName, fileSize, mimeType, uploadedBy } = opts;

    // Only process files under projects/
    if (!filePath.startsWith('projects/')) return;

    // Split: projects / {company} / {project} / ...rest
    const parts = filePath.split('/');
    if (parts.length < 4) return; // Must be at least projects/company/project/file

    // Try progressively shorter prefixes to find a matching project.
    // E.g. for "projects/ontime/branding/subfolder/file.png"
    // try "projects/ontime/branding/subfolder", then "projects/ontime/branding"
    let projectId: string | null = null;

    for (let depth = parts.length - 1; depth >= 3; depth--) {
      const candidatePath = parts.slice(0, depth).join('/');

      const { data: project } = await supabase
        .from('pyra_projects')
        .select('id')
        .eq('storage_path', candidatePath)
        .limit(1)
        .maybeSingle();

      if (project) {
        projectId = project.id;
        break;
      }
    }

    if (!projectId) return; // No matching project — file is not inside a project folder

    // Check if already linked (avoid duplicates)
    const { data: existing } = await supabase
      .from('pyra_project_files')
      .select('id')
      .eq('project_id', projectId)
      .eq('file_path', filePath)
      .limit(1)
      .maybeSingle();

    if (existing) return; // Already linked

    // Insert into pyra_project_files
    await supabase.from('pyra_project_files').insert({
      id: generateId('pf'),
      project_id: projectId,
      file_name: fileName,
      file_path: filePath,
      file_size: fileSize || 0,
      mime_type: mimeType || 'application/octet-stream',
      uploaded_by: uploadedBy,
      client_visible: true,
      needs_approval: true,
      version: 1,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    // Non-critical — log and continue
    console.warn('autoLinkFileToProject warning:', err);
  }
}
