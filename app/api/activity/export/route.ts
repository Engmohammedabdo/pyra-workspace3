import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { apiUnauthorized, apiForbidden, apiServerError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// =============================================================
// GET /api/activity/export?format=csv&from=2025-01-01&to=2025-12-31
// Export activity log as CSV. Admin only.
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const auth = await getApiAdmin();
    if (!auth) {
      const { getApiAuth } = await import('@/lib/api/auth');
      const basicAuth = await getApiAuth();
      if (!basicAuth) return apiUnauthorized();
      return apiForbidden();
    }

    const searchParams = request.nextUrl.searchParams;
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const actionType = searchParams.get('action_type');

    const supabase = await createServerSupabaseClient();

    let query = supabase
      .from('pyra_activity_log')
      .select('id, action_type, username, display_name, target_path, details, ip_address, created_at')
      .order('created_at', { ascending: false })
      .limit(5000);

    if (from) {
      query = query.gte('created_at', from);
    }
    if (to) {
      // Add a day to include the end date fully
      const toDate = new Date(to);
      toDate.setDate(toDate.getDate() + 1);
      query = query.lt('created_at', toDate.toISOString());
    }
    if (actionType && actionType !== 'all') {
      query = query.eq('action_type', actionType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Activity export error:', error);
      return apiServerError('فشل في تصدير سجل النشاط');
    }

    const rows = data || [];

    // BOM for Excel Arabic support
    const BOM = '\uFEFF';

    // CSV Header
    const headers = ['التاريخ', 'الوقت', 'المستخدم', 'الاسم', 'نوع الإجراء', 'المسار', 'IP', 'التفاصيل'];

    const ACTION_LABELS: Record<string, string> = {
      // Admin / system actions
      file_uploaded: 'رفع ملف', file_deleted: 'حذف ملف', file_renamed: 'إعادة تسمية',
      file_moved: 'نقل ملف', folder_created: 'إنشاء مجلد', user_created: 'إنشاء مستخدم',
      user_updated: 'تحديث مستخدم', user_deleted: 'حذف مستخدم', team_created: 'إنشاء فريق',
      client_created: 'إنشاء عميل', project_created: 'إنشاء مشروع', share_created: 'رابط مشاركة',
      review_added: 'مراجعة', settings_updated: 'تحديث إعدادات', file_restored: 'استعادة ملف',
      file_purged: 'حذف نهائي', login: 'تسجيل دخول', logout: 'تسجيل خروج',
      password_changed: 'تغيير كلمة مرور',
      upload: 'رفع ملف', version_restore: 'استعادة نسخة', version_delete: 'حذف نسخة',
      trash_empty: 'تفريغ السلة', trash_purge: 'حذف منتهية',
      // Portal client actions
      portal_login: 'دخول عميل', portal_logout: 'خروج عميل',
      portal_download: 'تحميل ملف (عميل)', portal_preview: 'معاينة ملف (عميل)',
      file_approved: 'اعتماد ملف', revision_requested: 'طلب تعديل',
      client_comment: 'تعليق عميل', quote_signed: 'توقيع عرض سعر',
      quote_viewed: 'مشاهدة عرض سعر',
      portal_password_changed: 'تغيير كلمة مرور (عميل)',
      portal_password_reset_requested: 'طلب استعادة كلمة مرور',
      portal_password_reset_completed: 'إعادة تعيين كلمة مرور',
      portal_profile_updated: 'تحديث بروفايل عميل',
      script_approved: 'اعتماد سكريبت',
      script_revision_requested: 'طلب تعديل سكريبت',
      script_reply_sent: 'رد إدارة على سكريبت',
      script_client_reply: 'رد عميل على سكريبت',
    };

    // Build CSV content
    const csvRows = rows.map((row) => {
      const date = new Date(row.created_at);
      const dateStr = date.toLocaleDateString('en-CA'); // YYYY-MM-DD
      const timeStr = date.toLocaleTimeString('en-GB', { hour12: false });
      const actionLabel = ACTION_LABELS[row.action_type] || row.action_type;
      const details = row.details ? JSON.stringify(row.details) : '';

      // Proper CSV escaping for all fields
      const escapeCSV = (val: string) => {
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      };

      return [
        dateStr,
        timeStr,
        escapeCSV(row.username || ''),
        escapeCSV(row.display_name || ''),
        escapeCSV(actionLabel),
        escapeCSV(row.target_path || ''),
        row.ip_address || '',
        escapeCSV(details),
      ].join(',');
    });

    const csvContent = BOM + headers.join(',') + '\n' + csvRows.join('\n');

    const fileName = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (err) {
    console.error('Activity export error:', err);
    return apiServerError();
  }
}
