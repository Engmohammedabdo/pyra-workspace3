import { NextRequest, NextResponse } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { buildClientProjectScope } from '@/lib/supabase/scopes';
import JSZip from 'jszip';

/**
 * POST /api/portal/files/bulk-download
 * Body: { fileIds: string[] } OR { folderPath: string[] }
 *
 * Downloads multiple files as a ZIP archive.
 * Max 50 files, max 200MB total.
 */
export async function POST(request: NextRequest) {
  try {
    const client = await getPortalSession();
    if (!client) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { fileIds, folderPath } = body;

    const supabase = createServiceRoleClient();
    const projectScope = buildClientProjectScope(client.id, client.company);

    // Get client's project IDs
    const { data: clientProjects } = await supabase
      .from('pyra_projects')
      .select('id')
      .or(projectScope);
    const projectIds = (clientProjects || []).map((p: { id: string }) => p.id);

    if (projectIds.length === 0) {
      return NextResponse.json({ error: 'لا توجد مشاريع' }, { status: 404 });
    }

    let files: { id: string; file_name: string; file_path: string; file_size: number | null }[] | null;

    if (fileIds && Array.isArray(fileIds) && fileIds.length > 0) {
      // Download specific files by IDs
      if (fileIds.length > 50) {
        return NextResponse.json({ error: 'الحد الأقصى 50 ملف' }, { status: 400 });
      }
      const { data } = await supabase
        .from('pyra_project_files')
        .select('id, file_name, file_path, file_size')
        .in('id', fileIds)
        .in('project_id', projectIds)
        .eq('client_visible', true);
      files = data;
    } else if (folderPath && Array.isArray(folderPath)) {
      // Download all files in a folder path
      // folderPath is the currentPath array, e.g. ['Brand-Guideline', 'Pattern']
      // Files are stored as: projects/{company}/{project}/{sub1}/{sub2}/.../filename
      // We need files whose path contains the folder segments at the right depth
      const { data: allFiles } = await supabase
        .from('pyra_project_files')
        .select('id, file_name, file_path, file_size')
        .in('project_id', projectIds)
        .eq('client_visible', true);

      // Filter files that match the folder path
      files = (allFiles || []).filter((f) => {
        const parts = f.file_path.split('/');
        // parts: ['projects', company, project, sub1, sub2, ..., filename]
        if (parts.length <= 4) return folderPath.length === 0;
        const subParts = parts.slice(3, parts.length - 1);
        // Check if the folderPath matches the beginning of subParts
        if (folderPath.length > subParts.length) return false;
        return folderPath.every((seg: string, i: number) => subParts[i] === seg);
      });

      if (files.length > 50) {
        files = files.slice(0, 50); // Limit to 50
      }
    } else {
      return NextResponse.json({ error: 'يرجى تحديد الملفات' }, { status: 400 });
    }

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'لا توجد ملفات' }, { status: 404 });
    }

    // Check total size (200MB max)
    const totalSize = files.reduce((sum, f) => sum + (f.file_size || 0), 0);
    if (totalSize > 200 * 1024 * 1024) {
      return NextResponse.json({ error: 'حجم الملفات يتجاوز 200 ميجا' }, { status: 400 });
    }

    // Create ZIP
    const zip = new JSZip();
    const bucket = 'pyraai-workspace';

    // Download files in parallel (batches of 5)
    const batchSize = 5;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (file) => {
          try {
            const { data: fileData, error } = await supabase.storage
              .from(bucket)
              .download(file.file_path);
            if (error || !fileData) return;
            const buffer = await fileData.arrayBuffer();
            zip.file(file.file_name, buffer);
          } catch {
            // Skip files that fail to download
          }
        })
      );
    }

    // Generate ZIP as blob
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    // Return ZIP as download
    const folderName = folderPath?.length ? folderPath[folderPath.length - 1] : 'files';
    return new NextResponse(zipBlob, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(folderName)}.zip"`,
        'Content-Length': String(zipBlob.size),
      },
    });
  } catch (err) {
    console.error('POST /api/portal/files/bulk-download error:', err);
    return NextResponse.json({ error: 'حدث خطأ في التحميل' }, { status: 500 });
  }
}
