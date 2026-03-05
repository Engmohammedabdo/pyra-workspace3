import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiNotFound, apiValidationError, apiError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { hasPermission } from '@/lib/auth/rbac';

type RouteParams = { params: Promise<{ id: string }> };

// =============================================================
// GET /api/dashboard/evaluations/[id]
// Get a single evaluation with scores, criteria, and user names.
// =============================================================
export async function GET(
  _req: NextRequest,
  { params }: RouteParams
) {
  try {
    const auth = await requireApiPermission('evaluations.view');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = createServiceRoleClient();

    // Fetch evaluation
    const { data: evaluation, error } = await supabase
      .from('pyra_evaluations')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !evaluation) return apiNotFound('التقييم غير موجود');

    // Non-admins can only view their own evaluations
    const canManage = hasPermission(auth.pyraUser.rolePermissions, 'evaluations.manage');
    if (!canManage) {
      if (evaluation.employee_username !== auth.pyraUser.username && evaluation.evaluator_username !== auth.pyraUser.username) {
        return apiError('ليس لديك صلاحية لعرض هذا التقييم', 403);
      }
    }

    // Fetch scores with criteria info
    const { data: scores } = await supabase
      .from('pyra_evaluation_scores')
      .select('id, criteria_id, score, comment')
      .eq('evaluation_id', id);

    // Fetch criteria details for the scores
    let enrichedScores: Array<{
      id: string;
      criteria_id: string;
      score: number;
      comment: string | null;
      criteria: { name: string; name_ar: string; weight: number; category: string | null } | null;
    }> = [];

    if (scores && scores.length > 0) {
      const criteriaIds = scores.map((s) => s.criteria_id);
      const { data: criteriaData } = await supabase
        .from('pyra_evaluation_criteria')
        .select('id, name, name_ar, weight, category')
        .in('id', criteriaIds);

      const criteriaMap: Record<string, { name: string; name_ar: string; weight: number; category: string | null }> = {};
      for (const c of criteriaData || []) {
        criteriaMap[c.id] = { name: c.name, name_ar: c.name_ar, weight: c.weight, category: c.category };
      }

      enrichedScores = scores.map((s) => ({
        ...s,
        criteria: criteriaMap[s.criteria_id] || null,
      }));
    }

    // Fetch user display names
    const usernames = [evaluation.employee_username, evaluation.evaluator_username];
    const { data: usersData } = await supabase
      .from('pyra_users')
      .select('username, display_name')
      .in('username', usernames);

    const userMap: Record<string, string> = {};
    for (const u of usersData || []) {
      userMap[u.username] = u.display_name;
    }

    // Fetch period info
    const { data: period } = await supabase
      .from('pyra_evaluation_periods')
      .select('id, name, name_ar, status')
      .eq('id', evaluation.period_id)
      .single();

    // Build enriched response
    const enriched = {
      ...evaluation,
      employee: {
        username: evaluation.employee_username,
        display_name: userMap[evaluation.employee_username] || evaluation.employee_username,
      },
      evaluator: {
        username: evaluation.evaluator_username,
        display_name: userMap[evaluation.evaluator_username] || evaluation.evaluator_username,
      },
      period: period || null,
      scores: enrichedScores,
    };

    return apiSuccess(enriched);
  } catch (err) {
    console.error('GET /api/dashboard/evaluations/[id] error:', err);
    return apiServerError();
  }
}

// =============================================================
// PATCH /api/dashboard/evaluations/[id]
// Update evaluation. Actions:
//   - action='submit': evaluator submits (status='submitted')
//   - action='acknowledge': employee acknowledges (status='acknowledged')
//   - Otherwise: update fields (comments, strengths, improvements, overall_rating)
// =============================================================
export async function PATCH(
  req: NextRequest,
  { params }: RouteParams
) {
  try {
    const auth = await requireApiPermission('evaluations.view');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const supabase = createServiceRoleClient();

    // Fetch current evaluation
    const { data: evaluation, error: fetchError } = await supabase
      .from('pyra_evaluations')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !evaluation) return apiNotFound('التقييم غير موجود');

    const canManage = hasPermission(auth.pyraUser.rolePermissions, 'evaluations.manage');
    const isEvaluator = evaluation.evaluator_username === auth.pyraUser.username;
    const isEmployee = evaluation.employee_username === auth.pyraUser.username;

    // Handle submit action
    if (body.action === 'submit') {
      if (!isEvaluator && !canManage) {
        return apiError('فقط المقيّم يمكنه تقديم التقييم', 403);
      }
      if (evaluation.status !== 'draft') {
        return apiError('لا يمكن تقديم تقييم تم تقديمه مسبقاً', 409);
      }

      const { data, error } = await supabase
        .from('pyra_evaluations')
        .update({
          status: 'submitted',
          submitted_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) return apiServerError(error.message);
      return apiSuccess(data);
    }

    // Handle acknowledge action
    if (body.action === 'acknowledge') {
      if (!isEmployee && !canManage) {
        return apiError('فقط الموظف يمكنه الاعتراف بالتقييم', 403);
      }
      if (evaluation.status !== 'submitted') {
        return apiError('يجب أن يكون التقييم في حالة "مقدم" للاعتراف به', 409);
      }

      const { data, error } = await supabase
        .from('pyra_evaluations')
        .update({
          status: 'acknowledged',
          acknowledged_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) return apiServerError(error.message);
      return apiSuccess(data);
    }

    // Regular update (comments, strengths, improvements, overall_rating)
    if (!isEvaluator && !canManage) {
      return apiError('فقط المقيّم أو المسؤول يمكنهم تعديل التقييم', 403);
    }

    const updates: Record<string, unknown> = {};
    if (body.comments !== undefined) updates.comments = body.comments;
    if (body.strengths !== undefined) updates.strengths = body.strengths;
    if (body.improvements !== undefined) updates.improvements = body.improvements;
    if (body.overall_rating !== undefined) updates.overall_rating = body.overall_rating;

    if (Object.keys(updates).length === 0) {
      return apiValidationError('لا توجد بيانات للتحديث');
    }

    const { data, error } = await supabase
      .from('pyra_evaluations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return apiServerError(error.message);
    return apiSuccess(data);
  } catch (err) {
    console.error('PATCH /api/dashboard/evaluations/[id] error:', err);
    return apiServerError();
  }
}
