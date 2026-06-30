import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError, type ApiAuthResult } from '@/lib/api/auth';
import {
  apiSuccess,
  apiError,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';
import { notify } from '@/lib/notifications/notify';
import { createEmployeeUser } from '@/lib/hr/create-employee';
import { storeGeneratedDocument } from '@/lib/hr/store-generated-document';
import {
  loadServerPdfFonts,
  loadServerDefaultLogo,
} from '@/lib/pdf/pdf-assets-server';
import { DEFAULT_ONBOARDING_TASKS } from '@/lib/constants/onboarding';
import { dubaiDayKey } from '@/lib/utils/format';

// ─────────────────────────────────────────────────────────────────────────────
// /api/hr/onboarding
//
// GET  — list onboarding records (recent first, limit 100) with employee
//         display_name + task progress {done, total}
// POST — create new hire: user + onboarding row + 3 PDFs + checklist tasks
//
// Both gated: hr.manage (admin-only, service-role AFTER the gate)
// ─────────────────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────────────
// GET — list onboarding records
// ──────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  let authForLogging: ApiAuthResult | null = null;
  try {
    const auth = await requireApiPermission('hr.manage');
    if (isApiError(auth)) return auth;
    authForLogging = auth;

    const supabase = createServiceRoleClient();

    // 1. Fetch onboarding rows (recent first, cap at 100)
    const { data: rows, error: rowsError } = await supabase
      .from('pyra_onboarding')
      .select('id, employee_username, status, offer_data, assets, started_by, started_at, completed_at, notes')
      .order('started_at', { ascending: false })
      .limit(100);

    if (rowsError) {
      logError({
        error: rowsError,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { source: 'hr_onboarding_list' },
      });
      console.error('[hr/onboarding GET] list error:', rowsError.message);
      return apiServerError();
    }

    if (!rows || rows.length === 0) {
      return apiSuccess({ onboardings: [] });
    }

    // 2. Bulk fetch employee display names
    const usernames = [...new Set(rows.map((r) => r.employee_username))];
    const { data: usersData } = await supabase
      .from('pyra_users')
      .select('username, display_name')
      .in('username', usernames);
    const userMap = new Map((usersData ?? []).map((u) => [u.username, u.display_name]));

    // 3. Bulk fetch task counts per onboarding_id
    const onbIds = rows.map((r) => r.id);
    const { data: tasksData } = await supabase
      .from('pyra_onboarding_tasks')
      .select('onboarding_id, is_done')
      .in('onboarding_id', onbIds);

    // Build progress map: { onb_id → { done, total } }
    const progressMap = new Map<string, { done: number; total: number }>();
    for (const task of tasksData ?? []) {
      const entry = progressMap.get(task.onboarding_id) ?? { done: 0, total: 0 };
      entry.total++;
      if (task.is_done) entry.done++;
      progressMap.set(task.onboarding_id, entry);
    }

    // 4. Enrich rows
    const onboardings = rows.map((row) => ({
      ...row,
      employee_display_name: userMap.get(row.employee_username) ?? row.employee_username,
      task_progress: progressMap.get(row.id) ?? { done: 0, total: 0 },
    }));

    return apiSuccess({ onboardings });
  } catch (err) {
    logError({
      error: err,
      request,
      user: authForLogging
        ? { id: authForLogging.pyraUser.username, role: authForLogging.pyraUser.role }
        : undefined,
      metadata: { source: 'hr_onboarding_list' },
    });
    console.error('[hr/onboarding GET] threw:', err);
    return apiServerError();
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// POST — create new hire (full onboarding flow)
// ──────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let authForLogging: ApiAuthResult | null = null;

  // Track what was created for cleanup on partial failure
  let onboardingId: string | null = null;
  let employeeUsername: string | null = null;

  try {
    // ── Step 1: Auth gate (hr.manage = admin only) ────────────────────────────
    const auth = await requireApiPermission('hr.manage');
    if (isApiError(auth)) return auth;
    authForLogging = auth;

    // ── Parse body ────────────────────────────────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return apiValidationError('طلب غير صالح — يجب أن يكون JSON');
    }

    const {
      // personal
      nameEn,
      nameAr,
      nationality,
      passport,
      idNumber,
      dateOfBirth,
      phone,
      email,
      username,
      password,
      // position
      titleEn,
      titleAr,
      deptEn,
      deptAr,
      reportsTo,
      startDate,
      isSales,
      // compensation
      basic,
      housing,
      transport,
      communication,
      other,
      commissionRate,
      monthlyTarget,
      // custom + assets
      customClauses,
      assets,
      // signatory
      signatoryName,
      signatoryTitle,
      notes,
    } = body;

    // ── Required-field validation ─────────────────────────────────────────────
    const missing: string[] = [];
    if (!username || typeof username !== 'string' || !String(username).trim()) missing.push('username');
    if (!password || typeof password !== 'string' || !String(password).trim()) missing.push('password');
    if (!nameEn  || typeof nameEn  !== 'string' || !String(nameEn).trim())  missing.push('nameEn');
    if (!nameAr  || typeof nameAr  !== 'string' || !String(nameAr).trim())  missing.push('nameAr');
    if (!titleEn || typeof titleEn !== 'string' || !String(titleEn).trim()) missing.push('titleEn');
    if (!startDate || typeof startDate !== 'string' || !String(startDate).trim()) missing.push('startDate');
    if (basic === undefined || basic === null || typeof basic !== 'number') missing.push('basic');

    if (missing.length > 0) {
      return apiValidationError(`الحقول التالية مطلوبة: ${missing.join(', ')}`);
    }

    // Safe casts for validated primitives
    const cleanUsername = String(username).trim().toLowerCase();
    const cleanPassword = String(password).trim();
    const cleanNameEn   = String(nameEn).trim();
    const cleanNameAr   = String(nameAr).trim();
    const cleanTitleEn  = String(titleEn).trim();
    const cleanTitleAr  = titleAr  ? String(titleAr).trim()  : cleanTitleEn;
    const cleanDeptEn   = deptEn   ? String(deptEn).trim()   : '';
    const cleanDeptAr   = deptAr   ? String(deptAr).trim()   : cleanDeptEn;
    const cleanStartDate = String(startDate).trim();
    const cleanReportsTo = reportsTo ? String(reportsTo).trim() : null;
    const isSalesBool   = Boolean(isSales);
    const basicNum       = Number(basic)         || 0;
    const housingNum     = Number(housing)       || 0;
    const transportNum   = Number(transport)     || 0;
    const commNum        = Number(communication) || 0;
    const otherNum       = Number(other)         || 0;
    const monthlyTotal   = basicNum + housingNum + transportNum + commNum + otherNum;

    const cleanCustomClauses = Array.isArray(customClauses)
      ? (customClauses as Array<{ title?: string; body: string }>)
      : [];
    const cleanAssets = Array.isArray(assets)
      ? (assets as Array<{ type: string; description: string; serial: string; condition: string; value: string; notes: string }>)
      : [];

    // ── Step 2: Service-role client ───────────────────────────────────────────
    const supabase = createServiceRoleClient();

    // ── Step 3: Create the employee user ──────────────────────────────────────
    const createResult = await createEmployeeUser(supabase, {
      username:        cleanUsername,
      password:        cleanPassword,
      role:            isSalesBool ? 'sales_agent' : 'employee',
      display_name:    cleanNameAr || cleanNameEn,
      phone:           phone    ? String(phone).trim()    : undefined,
      email:           email    ? String(email).trim()    : undefined,
      job_title:       cleanTitleAr || cleanTitleEn,
      department:      cleanDeptAr  || cleanDeptEn || null,
      hire_date:       cleanStartDate,
      date_of_birth:   dateOfBirth ? String(dateOfBirth).trim() : null,
      manager_username: cleanReportsTo || null,
      payment_type:    'monthly_salary',
      salary:          monthlyTotal,
    });

    if (!createResult.ok) {
      return apiError(createResult.error, createResult.status);
    }

    employeeUsername = createResult.user.username;

    // ── Step 4: Insert pyra_onboarding row ───────────────────────────────────
    onboardingId = generateId('onb');

    const offerData = {
      nameEn: cleanNameEn,
      nameAr: cleanNameAr,
      nationality: nationality ? String(nationality).trim() : '',
      passport:    passport    ? String(passport).trim()    : '',
      idNumber:    idNumber    ? String(idNumber).trim()    : '',
      dateOfBirth: dateOfBirth ? String(dateOfBirth).trim() : null,
      phone:       phone       ? String(phone).trim()       : null,
      email:       email       ? String(email).trim()       : null,
      titleEn:     cleanTitleEn,
      titleAr:     cleanTitleAr,
      deptEn:      cleanDeptEn,
      deptAr:      cleanDeptAr,
      reportsTo:   cleanReportsTo,
      startDate:   cleanStartDate,
      isSales:     isSalesBool,
      basic:       basicNum,
      housing:     housingNum,
      transport:   transportNum,
      communication: commNum,
      other:       otherNum,
      commissionRate: commissionRate !== undefined ? Number(commissionRate) : undefined,
      monthlyTarget:  monthlyTarget  !== undefined ? Number(monthlyTarget)  : undefined,
      customClauses:  cleanCustomClauses,
      signatoryName:  signatoryName  ? String(signatoryName).trim()  : '',
      signatoryTitle: signatoryTitle ? String(signatoryTitle).trim() : '',
      // refNo and date added below
      refNo: onboardingId.slice(-4),
      year:  cleanStartDate.slice(0, 4),
      date:  dubaiDayKey(),
    };

    const { error: onbInsertError } = await supabase
      .from('pyra_onboarding')
      .insert({
        id:               onboardingId,
        employee_username: employeeUsername,
        status:            'in_progress',
        offer_data:        offerData,
        assets:            cleanAssets,
        started_by:        auth.pyraUser.username,
        notes:             notes ? String(notes).trim() : null,
      });

    if (onbInsertError) {
      // User was created — log partial failure; user stays, return error
      logError({
        error: onbInsertError,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { source: 'onboarding_insert', employee_username: employeeUsername },
      });
      console.error('[hr/onboarding POST] onboarding insert error:', onbInsertError.message);
      return apiServerError(
        `تم إنشاء المستخدم لكن فشل إنشاء سجل الإيبورد. يُرجى التواصل مع المسؤول. (${onbInsertError.message})`,
      );
    }

    // ── Step 5: Read company_name from pyra_settings ──────────────────────────
    const { data: settingRow } = await supabase
      .from('pyra_settings')
      .select('value')
      .eq('key', 'company_name')
      .single();
    const companyName = settingRow?.value || 'PyramediaX';

    // ── Step 6: Generate 3 PDFs ───────────────────────────────────────────────
    let pdfFailed = false;
    const storedDocuments: Array<{ type_id: string; label: string; doc_id: string }> = [];

    try {
      // Load server-side fonts + logo (cached for process lifetime)
      const [fonts, defaultLogo] = await Promise.all([
        loadServerPdfFonts(),
        loadServerDefaultLogo(),
      ]);
      const pdfOpts = { fonts, defaultLogo: defaultLogo ?? undefined };

      const todayIso = dubaiDayKey();
      const refNo    = onboardingId.slice(-4);
      const year     = cleanStartDate.slice(0, 4);

      // ── Offer Letter ──────────────────────────────────────────────────────
      const { generateOfferLetterPDF } = await import('@/lib/pdf/offer-letter-pdf');
      const offerBlob = await generateOfferLetterPDF(
        {
          refNo,
          year,
          date:          todayIso,
          startDate:     cleanStartDate,
          nameEn:        cleanNameEn,
          nationality:   nationality  ? String(nationality).trim()  : '',
          passport:      passport     ? String(passport).trim()     : '',
          idNumber:      idNumber     ? String(idNumber).trim()     : '',
          titleEn:       cleanTitleEn,
          titleAr:       cleanTitleAr,
          deptEn:        cleanDeptEn,
          deptAr:        cleanDeptAr,
          reportsTo:     cleanReportsTo ?? '',
          isSales:       isSalesBool,
          basic:         basicNum,
          housing:       housingNum,
          transport:     transportNum,
          communication: commNum,
          other:         otherNum,
          commissionRate: commissionRate !== undefined ? Number(commissionRate) : undefined,
          monthlyTarget:  monthlyTarget  !== undefined ? Number(monthlyTarget)  : undefined,
          customClauses:  cleanCustomClauses,
          signatoryName:  signatoryName  ? String(signatoryName).trim()  : '',
          signatoryTitle: signatoryTitle ? String(signatoryTitle).trim() : '',
          companyName,
        },
        pdfOpts,
      );
      const offerBuffer = Buffer.from(await offerBlob.arrayBuffer());

      const offerStoreResult = await storeGeneratedDocument(supabase, {
        employeeUsername: employeeUsername,
        typeId:      'dt_offer_letter',
        label:       `عرض عمل — ${cleanNameAr}`,
        pdf:         offerBuffer,
        uploadedBy:  auth.pyraUser.username,
      });
      if (offerStoreResult.ok) {
        storedDocuments.push({ type_id: 'dt_offer_letter', label: `عرض عمل — ${cleanNameAr}`, doc_id: offerStoreResult.doc_id });
      } else {
        logError({
          error: new Error(offerStoreResult.error),
          request,
          user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
          metadata: { source: 'onboarding_store_offer_letter', employee_username: employeeUsername },
        });
      }

      // ── NDA ────────────────────────────────────────────────────────────────
      const { generateNdaPDF } = await import('@/lib/pdf/nda-pdf');
      const ndaBlob = await generateNdaPDF(
        {
          date:        todayIso,
          nameAr:      cleanNameAr,
          idNumber:    idNumber ? String(idNumber).trim() : '',
          nationality: nationality ? String(nationality).trim() : '',
          jobTitle:    cleanTitleAr || cleanTitleEn,
          address:     undefined,
          companyName,
        },
        pdfOpts,
      );
      const ndaBuffer = Buffer.from(await ndaBlob.arrayBuffer());

      const ndaStoreResult = await storeGeneratedDocument(supabase, {
        employeeUsername: employeeUsername,
        typeId:      'dt_nda',
        label:       `اتفاقية سرية — ${cleanNameAr}`,
        pdf:         ndaBuffer,
        uploadedBy:  auth.pyraUser.username,
      });
      if (ndaStoreResult.ok) {
        storedDocuments.push({ type_id: 'dt_nda', label: `اتفاقية سرية — ${cleanNameAr}`, doc_id: ndaStoreResult.doc_id });
      } else {
        logError({
          error: new Error(ndaStoreResult.error),
          request,
          user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
          metadata: { source: 'onboarding_store_nda', employee_username: employeeUsername },
        });
      }

      // ── Asset Handover ─────────────────────────────────────────────────────
      const { generateAssetHandoverPDF } = await import('@/lib/pdf/asset-handover-pdf');
      const assetBlob = await generateAssetHandoverPDF(
        {
          employeeName: cleanNameAr || cleanNameEn,
          jobTitle:     cleanTitleAr || cleanTitleEn,
          department:   cleanDeptAr  || cleanDeptEn,
          idNumber:     idNumber ? String(idNumber).trim() : '',
          username:     employeeUsername,
          handoverDate: cleanStartDate,
          assets:       cleanAssets,
          companyName,
        },
        pdfOpts,
      );
      const assetBuffer = Buffer.from(await assetBlob.arrayBuffer());

      const assetStoreResult = await storeGeneratedDocument(supabase, {
        employeeUsername: employeeUsername,
        typeId:      'dt_asset_handover',
        label:       `نموذج تسليم عهدة — ${cleanNameAr}`,
        pdf:         assetBuffer,
        uploadedBy:  auth.pyraUser.username,
      });
      if (assetStoreResult.ok) {
        storedDocuments.push({ type_id: 'dt_asset_handover', label: `نموذج تسليم عهدة — ${cleanNameAr}`, doc_id: assetStoreResult.doc_id });
      } else {
        logError({
          error: new Error(assetStoreResult.error),
          request,
          user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
          metadata: { source: 'onboarding_store_asset_handover', employee_username: employeeUsername },
        });
      }
    } catch (pdfErr) {
      // PDF generation / storage failure — best-effort cleanup then partial-success error
      logError({
        error: pdfErr,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: {
          source:             'onboarding_pdf_generation',
          employee_username:  employeeUsername,
          onboarding_id:      onboardingId,
        },
      });
      console.error('[hr/onboarding POST] PDF/storage error:', pdfErr);
      pdfFailed = true;

      // Best-effort cleanup: delete onboarding row + tasks (user stays)
      try {
        // Tasks cascade-delete on onboarding delete (ON DELETE CASCADE)
        await supabase.from('pyra_onboarding').delete().eq('id', onboardingId);
      } catch (cleanupErr) {
        console.error('[hr/onboarding POST] cleanup error:', cleanupErr);
      }

      return apiServerError(
        'تم إنشاء المستخدم لكن فشل توليد المستندات. المستخدم مُنشأ — يُرجى رفع المستندات يدوياً عبر صفحة إدارة الموظفين.',
      );
    }

    // If we somehow reach here with pdfFailed, guard it (shouldn't happen — pdfFailed returns above)
    if (pdfFailed) {
      return apiServerError('فشل توليد المستندات');
    }

    // ── Step 8: Seed onboarding checklist tasks ───────────────────────────────
    const taskRows = DEFAULT_ONBOARDING_TASKS.map((title_ar, index) => ({
      id:            generateId('obt'),
      onboarding_id: onboardingId as string,
      title_ar,
      sort_order:    index,
      is_done:       false,
    }));

    const { error: tasksInsertError } = await supabase
      .from('pyra_onboarding_tasks')
      .insert(taskRows);

    if (tasksInsertError) {
      // Non-fatal — log and continue (tasks can be inserted manually)
      logError({
        error: tasksInsertError,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: {
          source:            'onboarding_tasks_seed',
          employee_username: employeeUsername,
          onboarding_id:     onboardingId,
        },
      });
      console.error('[hr/onboarding POST] tasks seed error:', tasksInsertError.message);
    }

    // ── Step 9: Activity log + notifications ──────────────────────────────────
    // Phase 11.5 lock: action_type from constants + specificity in metadata.source
    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.USER}_${ACTIVITY_ACTIONS.CREATE}`,
      '/dashboard/hr/onboarding',
      {
        source:            'onboarding_created',
        onboarding_id:     onboardingId,
        employee_username: employeeUsername,
        documents_stored:  storedDocuments.length,
      },
      request.headers.get('x-forwarded-for') ?? undefined,
    );

    // Welcome notification to the new employee (best-effort, fire-and-forget)
    void notify(supabase, {
      to:    employeeUsername,
      type:  'system',
      title: 'مرحباً بك في Pyra Workspace! 🎉',
      message: `نرحب بك في ${companyName}. تم إعداد حسابك بنجاح.`,
      link:  '/dashboard',
      from: {
        username:    auth.pyraUser.username,
        displayName: auth.pyraUser.display_name,
      },
    }).catch((notifyErr) =>
      console.error('[hr/onboarding POST] welcome notify error:', notifyErr),
    );

    // ── Step 10: Return success ───────────────────────────────────────────────
    return apiSuccess(
      {
        id:                onboardingId,
        employee_username: employeeUsername,
        documents:         storedDocuments,
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
      metadata: {
        source:            'hr_onboarding_create',
        onboarding_id:     onboardingId,
        employee_username: employeeUsername,
      },
    });
    console.error('[hr/onboarding POST] threw:', err);
    return apiServerError();
  }
}
