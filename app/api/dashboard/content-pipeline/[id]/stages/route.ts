import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiNotFound,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

type RouteContext = { params: Promise<{ id: string }> };

const STAGE_ORDER = [
  'scripting',
  'review',
  'revision',
  'filming',
  'editing',
  'client_review',
  'delivery',
];

// =============================================================
// PATCH /api/dashboard/content-pipeline/[id]/stages
// Update a stage's status (start, complete, skip)
// =============================================================
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiPermission('script_reviews.manage');
    if (isApiError(auth)) return auth;

    const { id: pipelineId } = await context.params;
    const body = await request.json();
    const { stage_id, action, assigned_to, notes } = body;

    if (!stage_id || typeof stage_id !== 'string') {
      return apiValidationError('معرّف المرحلة مطلوب');
    }

    const validActions = ['start', 'complete', 'skip'];
    if (!action || !validActions.includes(action)) {
      return apiValidationError('الإجراء غير صالح. الإجراءات المسموحة: start, complete, skip');
    }

    const supabase = createServiceRoleClient();
    const now = new Date().toISOString();

    // Verify pipeline exists
    const { data: pipeline, error: pipeErr } = await supabase
      .from('pyra_content_pipeline')
      .select('id, current_stage')
      .eq('id', pipelineId)
      .single();

    if (pipeErr || !pipeline) {
      return apiNotFound('عنصر خط الإنتاج غير موجود');
    }

    // Verify stage exists and belongs to this pipeline
    const { data: stageRecord, error: stageErr } = await supabase
      .from('pyra_pipeline_stages')
      .select('id, stage, status, sort_order, started_at')
      .eq('id', stage_id)
      .eq('pipeline_id', pipelineId)
      .single();

    if (stageErr || !stageRecord) {
      return apiNotFound('المرحلة غير موجودة');
    }

    // Build update based on action
    const stageUpdate: Record<string, unknown> = {};

    if (action === 'start') {
      stageUpdate.status = 'in_progress';
      stageUpdate.started_at = now;
      if (assigned_to !== undefined) stageUpdate.assigned_to = assigned_to || null;
      if (notes !== undefined) stageUpdate.notes = notes?.trim() || null;
    } else if (action === 'complete') {
      stageUpdate.status = 'completed';
      stageUpdate.completed_at = now;
      if (!stageRecord.started_at) stageUpdate.started_at = now;
      if (notes !== undefined) stageUpdate.notes = notes?.trim() || null;
    } else if (action === 'skip') {
      stageUpdate.status = 'skipped';
      if (notes !== undefined) stageUpdate.notes = notes?.trim() || null;
    }

    // Update the stage
    const { error: updateErr } = await supabase
      .from('pyra_pipeline_stages')
      .update(stageUpdate)
      .eq('id', stage_id);

    if (updateErr) {
      console.error('Stage update error:', updateErr);
      return apiServerError('فشل في تحديث المرحلة');
    }

    // If completing or skipping, advance pipeline to next stage and auto-start it
    if (action === 'complete' || action === 'skip') {
      const currentIdx = STAGE_ORDER.indexOf(stageRecord.stage);
      if (currentIdx >= 0 && currentIdx < STAGE_ORDER.length - 1) {
        const nextStage = STAGE_ORDER[currentIdx + 1];

        // Update pipeline's current_stage
        await supabase
          .from('pyra_content_pipeline')
          .update({ current_stage: nextStage, updated_at: now })
          .eq('id', pipelineId);

        // Auto-start the next stage
        await supabase
          .from('pyra_pipeline_stages')
          .update({ status: 'in_progress', started_at: now })
          .eq('pipeline_id', pipelineId)
          .eq('stage', nextStage)
          .eq('status', 'pending');
      } else if (currentIdx === STAGE_ORDER.length - 1) {
        // Last stage completed — mark pipeline as delivered
        await supabase
          .from('pyra_content_pipeline')
          .update({ current_stage: 'delivery', updated_at: now })
          .eq('id', pipelineId);
      }
    }

    // If starting, update pipeline's current_stage to this stage
    if (action === 'start') {
      await supabase
        .from('pyra_content_pipeline')
        .update({ current_stage: stageRecord.stage, updated_at: now })
        .eq('id', pipelineId);
    }

    // Return updated pipeline with stages
    const { data: updatedPipeline } = await supabase
      .from('pyra_content_pipeline')
      .select(
        '*, pyra_pipeline_stages(id, stage, status, assigned_to, started_at, completed_at, notes, sort_order)'
      )
      .eq('id', pipelineId)
      .single();

    if (updatedPipeline) {
      updatedPipeline.pyra_pipeline_stages = (updatedPipeline.pyra_pipeline_stages || []).sort(
        (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order
      );
    }

    return apiSuccess(updatedPipeline);
  } catch (err) {
    console.error('Content pipeline stages PATCH error:', err);
    return apiServerError();
  }
}
