import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiNotFound, apiValidationError, apiError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { hasPermission } from '@/lib/auth/rbac';
import { generateId } from '@/lib/utils/id';
import { EVALUATION_STATUS, EMPLOYEE_PAYMENT_STATUS } from '@/lib/constants/statuses';
import { notify } from '@/lib/notifications/notify';

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
    const t = await getTranslations('api');

    const { id } = await params;
    const supabase = createServiceRoleClient();

    // Fetch evaluation
    const { data: evaluation, error } = await supabase
      .from('pyra_evaluations')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !evaluation) return apiNotFound(t('evaluations.notFound'));

    // Non-admins can only view their own evaluations
    const canManage = hasPermission(auth.pyraUser.rolePermissions, 'evaluations.manage');
    if (!canManage) {
      if (evaluation.employee_username !== auth.pyraUser.username && evaluation.evaluator_username !== auth.pyraUser.username) {
        return apiError(t('evaluations.viewForbidden'), 403);
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
    const t = await getTranslations('api');

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const supabase = createServiceRoleClient();

    // Fetch current evaluation
    const { data: evaluation, error: fetchError } = await supabase
      .from('pyra_evaluations')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !evaluation) return apiNotFound(t('evaluations.notFound'));

    const canManage = hasPermission(auth.pyraUser.rolePermissions, 'evaluations.manage');
    const isEvaluator = evaluation.evaluator_username === auth.pyraUser.username;
    const isEmployee = evaluation.employee_username === auth.pyraUser.username;

    // Handle submit action
    if (body.action === 'submit') {
      if (!isEvaluator && !canManage) {
        return apiError(t('evaluations.submitForbidden'), 403);
      }
      if (evaluation.status !== EVALUATION_STATUS.DRAFT) {
        return apiError(t('evaluations.alreadySubmitted'), 409);
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

      // Activity log
      const { error: logErr } = await supabase.from('pyra_activity_log').insert({
        id: generateId('al'),
        action_type: 'evaluation_updated',
        username: auth.pyraUser.username,
        display_name: auth.pyraUser.display_name,
        target_path: '/dashboard/evaluations',
        details: { evaluation_id: id, status: 'submitted' },
        ip_address: req.headers.get('x-forwarded-for') || 'unknown',
      });
      if (logErr) console.error('Activity log error:', logErr);

      // Notify the evaluated employee their evaluation was submitted (needs ack)
      await notify(supabase, {
        to: evaluation.employee_username,
        type: 'evaluation_submitted',
        title: 'تم تقديم تقييم أدائك', // i18n-exempt: notification content (Phase 8)
        message: 'راجع تقييمك وأكّد اطّلاعك عليه', // i18n-exempt: notification content (Phase 8)
        link: '/dashboard/evaluations',
        entity: { type: 'evaluation', id },
        from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
      });

      return apiSuccess(data);
    }

    // Handle recommend_bonus action
    if (body.action === 'recommend_bonus') {
      if (!canManage) {
        return apiError(t('evaluations.bonusForbidden'), 403);
      }

      const overallRating = Number(evaluation.overall_rating);
      if (!overallRating || overallRating < 3.5) {
        return apiError(t('evaluations.notEligibleForBonus'), 400);
      }

      // Idempotency: a bonus was already recommended for THIS evaluation — don't
      // create a duplicate pending payment (the UI button also guards, but that
      // resets on refresh; this is the authoritative guard).
      const { data: existingBonus } = await supabase
        .from('pyra_employee_payments')
        .select('id')
        .eq('source_type', 'bonus')
        .eq('source_id', evaluation.id)
        .limit(1);
      if (existingBonus && existingBonus.length > 0) {
        return apiError(t('evaluations.bonusAlreadyRecommended'), 409);
      }

      // Fetch employee salary (+ currency — the workspace is multi-currency;
      // never hardcode 'AED' for the payment record)
      const { data: employee, error: empError } = await supabase
        .from('pyra_users')
        .select('salary, salary_currency, display_name')
        .eq('username', evaluation.employee_username)
        .single();

      if (empError || !employee) {
        return apiError(t('evaluations.employeeNotFound'), 404);
      }

      const currency = employee.salary_currency || 'AED';

      const salary = Number(employee.salary);
      if (!salary || salary <= 0) {
        return apiError(t('evaluations.noSalaryConfigured'), 400);
      }

      // Calculate bonus percentage based on rating
      let bonusPercent: number;
      if (overallRating >= 4.5) {
        bonusPercent = 0.15;
      } else if (overallRating >= 4.0) {
        bonusPercent = 0.10;
      } else {
        bonusPercent = 0.05;
      }

      const bonusAmount = Math.round(salary * bonusPercent * 100) / 100;

      // Fetch period name for the description
      const { data: period } = await supabase
        .from('pyra_evaluation_periods')
        .select('name_ar, name')
        .eq('id', evaluation.period_id)
        .single();

      const periodLabel = period?.name_ar || period?.name || '';
      const description = `مكافأة أداء — تقييم ${periodLabel}`.trim(); // i18n-exempt: stored data (employee_payments.description), computed-per-request

      // Create employee payment record
      const { data: payment, error: paymentError } = await supabase
        .from('pyra_employee_payments')
        .insert({
          id: generateId('ep'),
          username: evaluation.employee_username,
          source_type: 'bonus',
          source_id: evaluation.id,
          description,
          amount: bonusAmount,
          currency,
          status: EMPLOYEE_PAYMENT_STATUS.PENDING,
        })
        .select()
        .single();

      if (paymentError) {
        console.error('Bonus payment insert error:', paymentError);
        return apiServerError(t('evaluations.bonusInsertFailed'));
      }

      // Activity log
      await supabase.from('pyra_activity_log').insert({
        id: generateId('al'),
        action_type: 'evaluation_bonus_recommended',
        username: auth.pyraUser.username,
        display_name: auth.pyraUser.display_name,
        target_path: '/dashboard/evaluations',
        details: {
          evaluation_id: id,
          employee_username: evaluation.employee_username,
          overall_rating: overallRating,
          bonus_amount: bonusAmount,
          bonus_percent: bonusPercent * 100,
          payment_id: payment.id,
        },
        ip_address: req.headers.get('x-forwarded-for') || 'unknown',
      });

      return apiSuccess({
        message: t('evaluations.bonusRecommendedSuccess', { amount: bonusAmount, currency }),
        payment,
        bonus_amount: bonusAmount,
        bonus_percent: bonusPercent * 100,
      });
    }

    // Handle acknowledge action
    if (body.action === 'acknowledge') {
      if (!isEmployee && !canManage) {
        return apiError(t('evaluations.acknowledgeForbidden'), 403);
      }
      if (evaluation.status !== 'submitted') {
        return apiError(t('evaluations.mustBeSubmittedToAcknowledge'), 409);
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

      // Activity log
      const { error: logErr2 } = await supabase.from('pyra_activity_log').insert({
        id: generateId('al'),
        action_type: 'evaluation_updated',
        username: auth.pyraUser.username,
        display_name: auth.pyraUser.display_name,
        target_path: '/dashboard/evaluations',
        details: { evaluation_id: id, status: 'acknowledged' },
        ip_address: req.headers.get('x-forwarded-for') || 'unknown',
      });
      if (logErr2) console.error('Activity log error:', logErr2);

      // Notify the evaluator that the employee acknowledged the evaluation
      await notify(supabase, {
        to: evaluation.evaluator_username,
        type: 'evaluation_acknowledged',
        title: 'تم الاعتراف بالتقييم', // i18n-exempt: notification content (Phase 8)
        message: `${auth.pyraUser.display_name} اطّلع على التقييم وأكّده`, // i18n-exempt: notification content (Phase 8)
        link: '/dashboard/evaluations',
        entity: { type: 'evaluation', id },
        from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
      });

      return apiSuccess(data);
    }

    // Regular update (comments, strengths, improvements, overall_rating)
    if (!isEvaluator && !canManage) {
      return apiError(t('evaluations.editForbidden'), 403);
    }

    const updates: Record<string, unknown> = {};
    if (body.comments !== undefined) updates.comments = body.comments;
    if (body.strengths !== undefined) updates.strengths = body.strengths;
    if (body.improvements !== undefined) updates.improvements = body.improvements;
    if (body.overall_rating !== undefined) updates.overall_rating = body.overall_rating;

    if (Object.keys(updates).length === 0) {
      return apiValidationError(t('evaluations.noFieldsToUpdate'));
    }

    const { data, error } = await supabase
      .from('pyra_evaluations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return apiServerError(error.message);

    // Activity log
    const { error: logErr3 } = await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'evaluation_updated',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: '/dashboard/evaluations',
      details: { evaluation_id: id, status: evaluation.status },
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
    });
    if (logErr3) console.error('Activity log error:', logErr3);

    return apiSuccess(data);
  } catch (err) {
    console.error('PATCH /api/dashboard/evaluations/[id] error:', err);
    return apiServerError();
  }
}
