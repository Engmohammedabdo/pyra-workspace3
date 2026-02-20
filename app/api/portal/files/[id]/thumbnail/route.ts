import { NextRequest, NextResponse } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isPathSafe } from '@/lib/utils/path';

/**
 * GET /api/portal/files/[id]/thumbnail
 *
 * Returns a signed URL for image file thumbnails.
 * Only works for image/* MIME types. Redirects to the signed URL.
 * Used by the grid view to display image previews.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const client = await getPortalSession();
    if (!client) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: fileId } = await params;
    const supabase = createServiceRoleClient();

    const { data: projectFile } = await supabase
      .from('pyra_project_files')
      .select('id, project_id, file_path, mime_type, client_visible')
      .eq('id', fileId)
      .single();

    if (!projectFile || projectFile.client_visible === false) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Only serve thumbnails for images
    if (!projectFile.mime_type?.startsWith('image/')) {
      return NextResponse.json({ error: 'Not an image' }, { status: 404 });
    }

    if (!isPathSafe(projectFile.file_path)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
    }

    // Verify project ownership
    const { data: project } = await supabase
      .from('pyra_projects')
      .select('id, client_id, client_company')
      .eq('id', projectFile.project_id)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const ownsProject = project.client_id
      ? project.client_id === client.id
      : project.client_company === client.company;

    if (!ownsProject) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Generate signed URL (5 minutes)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('pyraai-workspace')
      .createSignedUrl(projectFile.file_path, 60 * 5);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      return NextResponse.json({ error: 'Storage error' }, { status: 500 });
    }

    // Redirect to the signed URL with cache headers
    return NextResponse.redirect(signedUrlData.signedUrl, {
      headers: {
        'Cache-Control': 'private, max-age=240',
      },
    });
  } catch (err) {
    console.error('GET /api/portal/files/[id]/thumbnail error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
