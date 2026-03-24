import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { BOARD_TEMPLATES } from '@/lib/config/board-templates';

// =============================================================
// GET /api/dashboard/board-templates
// List all templates (DB + system fallback)
// =============================================================
export async function GET() {
  const auth = await requireApiPermission('boards.view');
  if (isApiError(auth)) return auth;

  const supabase = await createServerSupabaseClient();
  const { data: dbTemplates } = await supabase
    .from('pyra_board_templates')
    .select('*')
    .order('created_at');

  // Merge: DB templates first, then system templates not already in DB
  const dbKeys = new Set((dbTemplates || []).map(t => t.name));
  const systemTemplates = BOARD_TEMPLATES.filter(t => !dbKeys.has(t.name)).map(t => ({
    id: `sys_${t.key}`,
    name: t.name,
    name_ar: t.nameAr,
    description: t.description,
    icon: t.icon,
    view_mode: 'kanban',
    is_pipeline: false,
    columns: t.columns,
    labels: t.labels,
    task_types: [],
    is_system: true,
    created_by: null,
    created_at: null,
  }));

  return apiSuccess([...(dbTemplates || []), ...systemTemplates]);
}

// =============================================================
// POST /api/dashboard/board-templates
// Create a custom template (admin only)
// =============================================================
export async function POST(req: NextRequest) {
  const auth = await requireApiPermission('boards.manage');
  if (isApiError(auth)) return auth;

  const body = await req.json();
  const { name, name_ar, description, icon, view_mode, is_pipeline, columns, labels, task_types } = body;

  if (!name || !name_ar) return apiValidationError('اسم القالب مطلوب');
  if (!columns || !Array.isArray(columns) || columns.length === 0) {
    return apiValidationError('يجب إضافة عمود واحد على الأقل');
  }

  const supabase = await createServerSupabaseClient();
  const id = generateId('bt');

  const { data, error } = await supabase
    .from('pyra_board_templates')
    .insert({
      id,
      name,
      name_ar,
      description: description || null,
      icon: icon || 'Layout',
      view_mode: view_mode || 'kanban',
      is_pipeline: is_pipeline || false,
      columns,
      labels: labels || [],
      task_types: task_types || [],
      is_system: false,
      created_by: auth.pyraUser.username,
    })
    .select()
    .single();

  if (error) return apiServerError(error.message);
  return apiSuccess(data, undefined, 201);
}
