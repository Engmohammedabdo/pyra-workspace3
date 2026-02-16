import { NextRequest } from 'next/server';
import { getApiAuth, getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { escapeLike, sanitizeFileName } from '@/lib/utils/path';

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace';

// =============================================================
// GET /api/projects
// List projects. Admin sees all; employee sees only team projects.
// Supports ?status=, ?client_company=, ?search= filters
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const clientCompany = searchParams.get('client_company');
    const search = searchParams.get('search');

    const supabase = await createServerSupabaseClient();

    // If employee, scope to their team's projects only
    let teamProjectIds: string[] | null = null;
    if (auth.pyraUser.role === 'employee') {
      const { data: memberships } = await supabase
        .from('pyra_team_members')
        .select('team_id')
        .eq('username', auth.pyraUser.username);

      const teamIds = (memberships || []).map((m) => m.team_id);

      if (teamIds.length === 0) {
        // Employee not in any team — return empty
        return apiSuccess([], { total: 0 });
      }

      const { data: teamProjects } = await supabase
        .from('pyra_projects')
        .select('id')
        .in('team_id', teamIds);

      teamProjectIds = (teamProjects || []).map((p) => p.id);

      if (teamProjectIds.length === 0) {
        return apiSuccess([], { total: 0 });
      }
    }

    let query = supabase
      .from('pyra_projects')
      .select('*', { count: 'exact' });

    // Scope employee to their team's projects
    if (teamProjectIds) {
      query = query.in('id', teamProjectIds);
    }

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }

    if (clientCompany) {
      query = query.eq('client_company', clientCompany);
    }

    if (search) {
      const escaped = escapeLike(search);
      query = query.or(
        `name.ilike.%${escaped}%,description.ilike.%${escaped}%,client_company.ilike.%${escaped}%`
      );
    }

    // Order by most recently updated
    query = query.order('updated_at', { ascending: false });

    const { data: projects, error, count } = await query;

    if (error) {
      console.error('Projects list error:', error);
      return apiServerError('فشل في جلب المشاريع');
    }

    return apiSuccess(projects || [], { total: count || 0 });
  } catch (err) {
    console.error('Projects GET error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/projects
// Create a new project. Admin only.
// Body: { name, description?, client_company, client_id?, team_id?, status? }
// Auto-creates a project folder: projects/{company}/{project-name}/
// =============================================================
export async function POST(request: NextRequest) {
  try {
    const auth = await getApiAdmin();
    if (!auth) {
      const basicAuth = await getApiAuth();
      if (!basicAuth) return apiUnauthorized();
      return apiForbidden();
    }

    const body = await request.json();
    const { name, description, client_company, client_id, team_id, status } = body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return apiValidationError('اسم المشروع مطلوب');
    }

    if (!client_company || typeof client_company !== 'string' || client_company.trim().length === 0) {
      return apiValidationError('اسم شركة العميل مطلوب');
    }

    const validStatuses = ['active', 'in_progress', 'review', 'completed', 'archived'];
    if (status && !validStatuses.includes(status)) {
      return apiValidationError(`حالة غير صالحة. الحالات المسموحة: ${validStatuses.join(', ')}`);
    }

    const supabase = createServiceRoleClient();
    const now = new Date().toISOString();
    const projectId = generateId('pr');

    // ── Resolve client_id if provided ────────────────
    let resolvedClientId: string | null = client_id || null;
    if (!resolvedClientId && client_company) {
      // Try to auto-resolve from pyra_clients
      const { data: matchedClient } = await supabase
        .from('pyra_clients')
        .select('id')
        .eq('company', client_company.trim())
        .eq('is_active', true)
        .limit(1)
        .single();

      if (matchedClient) {
        resolvedClientId = matchedClient.id;
      }
    }

    // Generate storage path for project files
    const storagePath = `projects/${projectId}`;

    const newProject = {
      id: projectId,
      name: name.trim(),
      description: description?.trim() || null,
      client_id: resolvedClientId,
      client_company: client_company.trim(),
      team_id: team_id || null,
      status: status || 'active',
      storage_path: storagePath,
      created_by: auth.pyraUser.username,
      created_at: now,
      updated_at: now,
    };

    const { data: project, error } = await supabase
      .from('pyra_projects')
      .insert(newProject)
      .select()
      .single();

    if (error) {
      console.error('Project create error:', error);
      return apiServerError('فشل في إنشاء المشروع');
    }

    // ── Auto-create project folder in Storage ────────
    const companySlug = sanitizeFileName(client_company.trim())
      .replace(/\s+/g, '-')
      .toLowerCase();
    const projectSlug = sanitizeFileName(name.trim())
      .replace(/\s+/g, '-')
      .toLowerCase();

    // Build folder path: projects/{company}/{project}/
    const folderPath = `projects/${companySlug}/${projectSlug}`;

    // Check if folder already exists to prevent duplication
    const { data: existingFiles } = await supabase.storage
      .from(BUCKET)
      .list(`projects/${companySlug}`, { limit: 100, search: projectSlug });

    const folderExists = (existingFiles || []).some(
      (f) => f.name === projectSlug || f.name === `${projectSlug}/.emptyFolderPlaceholder`
    );

    if (!folderExists) {
      // Create folder with placeholder file
      await supabase.storage
        .from(BUCKET)
        .upload(
          `${folderPath}/.emptyFolderPlaceholder`,
          new Uint8Array(0),
          { contentType: 'application/octet-stream', upsert: true }
        );

      // Also create a client-visible subfolder for deliverables
      await supabase.storage
        .from(BUCKET)
        .upload(
          `${folderPath}/deliverables/.emptyFolderPlaceholder`,
          new Uint8Array(0),
          { contentType: 'application/octet-stream', upsert: true }
        );
    }

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'project_created',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: projectId,
      details: {
        project_name: name.trim(),
        client_company: client_company.trim(),
        client_id: resolvedClientId,
        team_id: team_id || null,
        folder_path: folderPath,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess({ ...project, folder_path: folderPath }, undefined, 201);
  } catch (err) {
    console.error('Projects POST error:', err);
    return apiServerError();
  }
}
