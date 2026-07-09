import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError, type ApiAuthResult } from '@/lib/api/auth';
import {
  apiSuccess,
  apiError,
  apiNotFound,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logError } from '@/lib/observability/log-error';
import { storeGeneratedDocument } from '@/lib/hr/store-generated-document';
import {
  loadServerPdfFonts,
  loadServerDefaultLogo,
} from '@/lib/pdf/pdf-assets-server';
import { dubaiDayKey } from '@/lib/utils/format';

// ─────────────────────────────────────────────────────────────────────────────
// /api/hr/onboarding/[id]/documents/[docType]/regenerate
//
// POST → re-run the matching PDF generator from offer_data / assets, replace
//         the stored document (delete old storage object + DB row, store new).
//
// [docType] is one of: offer_letter | nda | asset_handover
// Maps to type IDs:    dt_offer_letter | dt_nda | dt_asset_handover
//
// Returns: { doc_id, type_id }   — NEVER storage_path.
//
// Gated: hr.manage (admin-only, service-role AFTER the gate)
// ─────────────────────────────────────────────────────────────────────────────

const DOC_BUCKET = 'pyra-private';

// Map URL segment → canonical type_id and Arabic label prefix
const DOC_TYPE_MAP: Record<string, { typeId: string; labelPrefix: string }> = {
  offer_letter:   { typeId: 'dt_offer_letter',   labelPrefix: 'عرض عمل' }, // i18n-exempt: PDF document label (Phase 9 scope)
  nda:            { typeId: 'dt_nda',             labelPrefix: 'اتفاقية سرية' }, // i18n-exempt: PDF document label (Phase 9 scope)
  asset_handover: { typeId: 'dt_asset_handover',  labelPrefix: 'نموذج تسليم عهدة' }, // i18n-exempt: PDF document label (Phase 9 scope)
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docType: string }> },
) {
  let authForLogging: ApiAuthResult | null = null;
  try {
    const auth = await requireApiPermission('hr.manage');
    if (isApiError(auth)) return auth;
    authForLogging = auth;
    const t = await getTranslations('api');

    const { id, docType } = await params;

    // ── Validate docType ──────────────────────────────────────────────────────
    const docMeta = DOC_TYPE_MAP[docType];
    if (!docMeta) {
      return apiError(
        t('hr.regenerateDocTypeInvalid'),
        400,
      );
    }

    const { typeId, labelPrefix } = docMeta;
    const supabase = createServiceRoleClient();

    // ── 1. Load onboarding record ─────────────────────────────────────────────
    const { data: onboarding, error: onbError } = await supabase
      .from('pyra_onboarding')
      .select('id, employee_username, offer_data, assets')
      .eq('id', id)
      .maybeSingle();

    if (onbError) {
      logError({
        error: onbError,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { source: 'hr_onboarding_doc_regenerate', onboarding_id: id, doc_type: docType, stage: 'fetch_onboarding' },
      });
      console.error('[hr/onboarding/[id]/documents/[docType]/regenerate POST] fetch error:', onbError.message);
      return apiServerError();
    }

    if (!onboarding) return apiNotFound(t('hr.onboardingNotFound'));

    const employeeUsername = onboarding.employee_username;
    // offer_data is a JSON object stored in the DB
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const offerData = (onboarding.offer_data ?? {}) as Record<string, any>;
    const assets = (onboarding.assets ?? []) as Array<{
      type: string;
      description: string;
      serial: string;
      condition: string;
      value: string;
      notes: string;
    }>;

    // ── 2. Load employee from pyra_users (for fields that may not be in offer_data) ──
    const { data: employee } = await supabase
      .from('pyra_users')
      .select('display_name, job_title, department')
      .eq('username', employeeUsername)
      .maybeSingle();

    // ── 3. Read company_name from pyra_settings ───────────────────────────────
    const { data: settingRow } = await supabase
      .from('pyra_settings')
      .select('value')
      .eq('key', 'company_name')
      .single();
    const companyName = settingRow?.value || 'PyramediaX';

    // ── 4. Load server-side PDF fonts + logo (cached for process lifetime) ────
    const [fonts, defaultLogo] = await Promise.all([
      loadServerPdfFonts(),
      loadServerDefaultLogo(),
    ]);
    const pdfOpts = { fonts, defaultLogo: defaultLogo ?? undefined };

    // ── 5. Generate the matching PDF — mirror Task 7 field mapping exactly ────
    let pdfBlob: Blob;
    const todayIso = dubaiDayKey();

    if (typeId === 'dt_offer_letter') {
      const { generateOfferLetterPDF } = await import('@/lib/pdf/offer-letter-pdf');
      pdfBlob = await generateOfferLetterPDF(
        {
          refNo:          offerData.refNo ?? id.slice(-4),
          year:           offerData.year  ?? todayIso.slice(0, 4),
          date:           offerData.date  ?? todayIso,
          startDate:      offerData.startDate  ?? '',
          nameEn:         offerData.nameEn     ?? '',
          nationality:    offerData.nationality ?? '',
          passport:       offerData.passport    ?? '',
          idNumber:       offerData.idNumber    ?? '',
          titleEn:        offerData.titleEn     ?? employee?.job_title ?? '',
          titleAr:        offerData.titleAr     ?? employee?.job_title ?? '',
          deptEn:         offerData.deptEn      ?? employee?.department ?? '',
          deptAr:         offerData.deptAr      ?? employee?.department ?? '',
          reportsTo:      offerData.reportsTo   ?? '',
          isSales:        Boolean(offerData.isSales),
          basic:          Number(offerData.basic)         || 0,
          housing:        Number(offerData.housing)       || 0,
          transport:      Number(offerData.transport)     || 0,
          communication:  Number(offerData.communication) || 0,
          other:          Number(offerData.other)         || 0,
          commissionRate: offerData.commissionRate !== undefined ? Number(offerData.commissionRate) : undefined,
          monthlyTarget:  offerData.monthlyTarget  !== undefined ? Number(offerData.monthlyTarget)  : undefined,
          currency:       typeof offerData.currency === 'string' ? offerData.currency : undefined,
          customClauses:  Array.isArray(offerData.customClauses) ? offerData.customClauses : [],
          signatoryName:  offerData.signatoryName  ?? '',
          signatoryTitle: offerData.signatoryTitle ?? '',
          companyName,
        },
        pdfOpts,
      );
    } else if (typeId === 'dt_nda') {
      const { generateNdaPDF } = await import('@/lib/pdf/nda-pdf');
      pdfBlob = await generateNdaPDF(
        {
          date:        offerData.date ?? todayIso,
          nameAr:      offerData.nameAr     ?? employee?.display_name ?? '',
          idNumber:    offerData.idNumber    ?? '',
          nationality: offerData.nationality ?? '',
          jobTitle:    offerData.titleAr     ?? offerData.titleEn ?? employee?.job_title ?? '',
          address:     undefined,
          companyName,
        },
        pdfOpts,
      );
    } else {
      // dt_asset_handover
      const { generateAssetHandoverPDF } = await import('@/lib/pdf/asset-handover-pdf');
      pdfBlob = await generateAssetHandoverPDF(
        {
          employeeName: offerData.nameAr  ?? offerData.nameEn ?? employee?.display_name ?? '',
          jobTitle:     offerData.titleAr ?? offerData.titleEn ?? employee?.job_title  ?? '',
          department:   offerData.deptAr  ?? offerData.deptEn  ?? employee?.department  ?? '',
          idNumber:     offerData.idNumber ?? '',
          username:     employeeUsername,
          handoverDate: offerData.startDate ?? todayIso,
          currency:     typeof offerData.currency === 'string' ? offerData.currency : undefined,
          assets,
          companyName,
        },
        pdfOpts,
      );
    }

    const pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer());

    // ── 6. Delete old row + storage object (best-effort, then store new) ──────
    const { data: oldDoc } = await supabase
      .from('pyra_employee_documents')
      .select('id, storage_path')
      .eq('employee_username', employeeUsername)
      .eq('type_id', typeId)
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (oldDoc) {
      // Delete DB row first, then storage object (best-effort — don't fail
      // the regeneration if deletion of the old version fails)
      const { error: deleteRowError } = await supabase
        .from('pyra_employee_documents')
        .delete()
        .eq('id', oldDoc.id);

      if (deleteRowError) {
        // Log but continue — we still want to store the new doc
        logError({
          error: deleteRowError,
          request,
          user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
          metadata: {
            source: 'hr_onboarding_doc_regenerate',
            onboarding_id: id,
            doc_type: docType,
            stage: 'delete_old_row',
            old_doc_id: oldDoc.id,
          },
        });
        console.warn('[hr/onboarding regenerate] old row delete failed, continuing:', deleteRowError.message);
      } else {
        // Row deleted; now remove the orphaned storage object
        void supabase.storage.from(DOC_BUCKET).remove([oldDoc.storage_path]).catch((storageErr) => {
          console.warn('[hr/onboarding regenerate] old storage object delete failed (non-fatal):', storageErr);
        });
      }
    }

    // ── 7. Store new document ─────────────────────────────────────────────────
    const employeeName = offerData.nameAr ?? offerData.nameEn ?? employee?.display_name ?? employeeUsername;
    const label = `${labelPrefix} — ${employeeName}`;

    const storeResult = await storeGeneratedDocument(supabase, {
      employeeUsername,
      typeId,
      label,
      pdf: pdfBuffer,
      uploadedBy: auth.pyraUser.username,
    });

    if (!storeResult.ok) {
      logError({
        error: new Error(storeResult.error),
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: {
          source: 'hr_onboarding_doc_regenerate',
          onboarding_id: id,
          doc_type: docType,
          stage: 'store_new',
          employee_username: employeeUsername,
        },
      });
      console.error('[hr/onboarding regenerate] store error:', storeResult.error);
      return apiServerError(t('hr.regenerateStoreFailed'));
    }

    // ── 8. Return doc_id + type_id — NEVER storage_path ──────────────────────
    return apiSuccess(
      {
        doc_id: storeResult.doc_id,
        type_id: typeId,
      },
      undefined,
      201,
    );
  } catch (err) {
    logError({
      error: err,
      request,
      user: authForLogging
        ? { id: authForLogging.pyraUser.username, role: authForLogging.pyraUser.role }
        : undefined,
      metadata: { source: 'hr_onboarding_doc_regenerate' },
    });
    console.error('[hr/onboarding/[id]/documents/[docType]/regenerate POST] threw:', err);
    return apiServerError();
  }
}
