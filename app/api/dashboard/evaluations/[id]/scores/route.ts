import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiNotFound, apiValidationError, apiError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { hasPermission } from '@/lib/auth/rbac';

type RouteParams = { params: Promise<{ id: string }> };

// =============================================================
// POST /api/dashboard/evaluations/[id]/scores
// Save (upsert) scores for an evaluation.
// Body: { scores: [{ criteria_id, score, comment? }] }
// Recalculates overall_rating as weighted average.
// =============================================================
export async function POST(
  req: NextRequest,
  { params }: RouteParams
) {
  try {
    const auth = await requireApiPermission('evaluations.view');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { scores } = body;

    if (!scores || !Array.isArray(scores) || scores.length === 0) {
      return apiValidationError('يجب توفير قائمة الدرجات');
    }

    const supabase = createServiceRoleClient();

    // Verify evaluation exists
    const { data: evaluation, error: fetchError } = await supabase
      .from('pyra_evaluations')
      .select('id, evaluator_username, status')
      .eq('id', id)
      .single();

    if (fetchError || !evaluation) return apiNotFound('التقييم غير موجود');

    // Permission check: must be evaluator or have manage permission
    const canManage = hasPermission(auth.pyraUser.rolePermissions, 'evaluations.manage');
    const isEvaluator = evaluation.evaluator_username === auth.pyraUser.username;

    if (!isEvaluator && !canManage) {
      return apiError('ليس لديك صلاحية لتقييم هذا الموظف', 403);
    }

    // Only allow scoring draft evaluations
    if (evaluation.status !== 'draft') {
      return apiError('لا يمكن تعديل درجات تقييم تم تقديمه', 409);
    }

    // Validate each score
    for (const s of scores) {
      if (!s.criteria_id || s.score === undefined || s.score === null) {
        return apiValidationError('كل درجة يجب أن تحتوي على معرف المعيار والدرجة');
      }
      if (s.score < 1 || s.score > 5) {
        return apiValidationError('الدرجة يجب أن تكون بين 1 و 5');
      }
    }

    // Build new score rows
    const scoreRows = scores.map((s: { criteria_id: string; score: number; comment?: string }) => ({
      id: generateId('evs'),
      evaluation_id: id,
      criteria_id: s.criteria_id,
      score: s.score,
      comment: s.comment || null,
    }));

    // Backup existing scores before deletion (for rollback)
    const { data: existingScores } = await supabase
      .from('pyra_evaluation_scores')
      .select('*')
      .eq('evaluation_id', id);

    // Delete existing scores
    await supabase
      .from('pyra_evaluation_scores')
      .delete()
      .eq('evaluation_id', id);

    // Insert new scores — rollback on failure
    const { error: insertError } = await supabase
      .from('pyra_evaluation_scores')
      .insert(scoreRows);

    if (insertError) {
      // Rollback: restore old scores
      if (existingScores && existingScores.length > 0) {
        await supabase.from('pyra_evaluation_scores').insert(existingScores);
      }
      return apiServerError(insertError.message);
    }

    // Fetch criteria weights to calculate overall_rating
    const criteriaIds = scores.map((s: { criteria_id: string }) => s.criteria_id);
    const { data: criteriaList } = await supabase
      .from('pyra_evaluation_criteria')
      .select('id, weight')
      .in('id', criteriaIds);

    // Calculate weighted average
    let totalWeight = 0;
    let weightedSum = 0;

    for (const s of scores) {
      const criterion = criteriaList?.find((c: { id: string; weight: number }) => c.id === s.criteria_id);
      const weight = criterion?.weight || 1;
      weightedSum += s.score * weight;
      totalWeight += weight;
    }

    const overallRating = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : 0;

    // Update the evaluation's overall_rating
    const { data: updated, error: updateError } = await supabase
      .from('pyra_evaluations')
      .update({ overall_rating: overallRating })
      .eq('id', id)
      .select()
      .single();

    if (updateError) return apiServerError(updateError.message);

    // Activity log
    const { error: logErr } = await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'evaluation_scores_saved',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: '/dashboard/evaluations',
      details: { evaluation_id: id, overall_rating: overallRating, score_count: scoreRows.length },
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
    });
    if (logErr) console.error('Activity log error:', logErr);

    return apiSuccess({ evaluation: updated, scores: scoreRows, overall_rating: overallRating });
  } catch (err) {
    console.error('POST /api/dashboard/evaluations/[id]/scores error:', err);
    return apiServerError();
  }
}
