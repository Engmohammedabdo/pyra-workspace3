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
 * Also sends a notification to the client when a new file is linked.
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
    let matchedProject: { id: string; client_id: string | null } | null = null;

    for (let depth = parts.length - 1; depth >= 3; depth--) {
      const candidatePath = parts.slice(0, depth).join('/');

      const { data: project } = await supabase
        .from('pyra_projects')
        .select('id, client_id')
        .eq('storage_path', candidatePath)
        .limit(1)
        .maybeSingle();

      if (project) {
        matchedProject = project;
        break;
      }
    }

    if (!matchedProject) return; // No matching project — file is not inside a project folder

    const projectId = matchedProject.id;

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

    // ── Notify client about new file upload (non-critical) ──
    if (matchedProject.client_id) {
      try {
        await supabase.from('pyra_client_notifications').insert({
          id: generateId('cn'),
          client_id: matchedProject.client_id,
          type: 'file_upload',
          title: 'ملف جديد',
          message: `تم رفع ملف جديد: ${fileName}`,
          target_project_id: projectId,
          is_read: false,
        });
      } catch (notifErr) {
        console.warn('autoLinkFileToProject notification warning:', notifErr);
      }
    }
  } catch (err) {
    // Non-critical — log and continue
    console.warn('autoLinkFileToProject warning:', err);
  }
}
