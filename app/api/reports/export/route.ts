import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { apiError, apiForbidden, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

// =============================================================
// GET /api/reports/export
// Export report data as CSV with BOM for Arabic support.
// Admin only.
//
// Query params:
//   ?type=projects|clients|revenue|team|storage  (required)
//   ?from=YYYY-MM-DD  (default: 30 days ago)
//   ?to=YYYY-MM-DD    (default: today)
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const supabase = createServiceRoleClient();
    const url = new URL(request.url);

    const type = url.searchParams.get('type');
    const from = url.searchParams.get('from') || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const to = url.searchParams.get('to') || new Date().toISOString().split('T')[0];
    const toEnd = to + 'T23:59:59';

    if (!type || !['projects', 'clients', 'revenue', 'team', 'storage'].includes(type)) {
      return apiError('type is required (projects, clients, revenue, team, storage)', 400);
    }

    let csvContent = '';

    switch (type) {
      case 'projects':
        csvContent = await exportProjects(supabase);
        break;
      case 'clients':
        csvContent = await exportClients(supabase);
        break;
      case 'revenue':
        csvContent = await exportRevenue(supabase, from, to, toEnd);
        break;
      case 'team':
        csvContent = await exportTeam(supabase, from, toEnd);
        break;
      case 'storage':
        csvContent = await exportStorage(supabase);
        break;
    }

    const BOM = '\uFEFF';
    const fileName = `report-${type}-${new Date().toISOString().split('T')[0]}.csv`;

    return new Response(BOM + csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (err) {
    console.error('GET /api/reports/export error:', err);
    return apiServerError();
  }
}

// ── CSV Helpers ──────────────────────────────────────────────

function escapeCSV(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const headerLine = headers.map(escapeCSV).join(',');
  const dataLines = rows.map((row) => row.map(escapeCSV).join(','));
  return headerLine + '\n' + dataLines.join('\n');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

// ── Export: Projects ─────────────────────────────────────────

async function exportProjects(supabase: SupabaseClient): Promise<string> {
  const { data: projects } = await supabase
    .from('pyra_projects')
    .select('id, name, client_company, status, created_at, updated_at, deadline')
    .order('created_at', { ascending: false })
    .limit(5000);

  const headers = ['المعرف', 'اسم المشروع', 'شركة العميل', 'الحالة', 'تاريخ الإنشاء', 'آخر تحديث', 'الموعد النهائي'];

  const rows = (projects || []).map(
    (p: { id: string; name: string; client_company: string; status: string; created_at: string; updated_at: string; deadline: string | null }) => [
      p.id,
      p.name,
      p.client_company,
      p.status,
      p.created_at ? new Date(p.created_at).toLocaleDateString('en-CA') : '',
      p.updated_at ? new Date(p.updated_at).toLocaleDateString('en-CA') : '',
      p.deadline || '',
    ]
  );

  return toCSV(headers, rows);
}

// ── Export: Clients ──────────────────────────────────────────

async function exportClients(supabase: SupabaseClient): Promise<string> {
  const { data: clients } = await supabase
    .from('pyra_clients')
    .select('id, name, email, phone, company, is_active, created_at')
    .order('created_at', { ascending: false })
    .limit(5000);

  const headers = ['المعرف', 'الاسم', 'البريد', 'الهاتف', 'الشركة', 'نشط', 'تاريخ الإنشاء'];

  const rows = (clients || []).map(
    (c: { id: string; name: string; email: string; phone: string | null; company: string; is_active: boolean; created_at: string }) => [
      c.id,
      c.name,
      c.email,
      c.phone || '',
      c.company,
      c.is_active ? 'نعم' : 'لا',
      c.created_at ? new Date(c.created_at).toLocaleDateString('en-CA') : '',
    ]
  );

  return toCSV(headers, rows);
}

// ── Export: Revenue ──────────────────────────────────────────

async function exportRevenue(
  supabase: SupabaseClient,
  from: string,
  to: string,
  toEnd: string
): Promise<string> {
  const [paymentsRes, invoicesRes] = await Promise.all([
    supabase
      .from('pyra_payments')
      .select('id, invoice_id, amount, payment_date, method, reference')
      .gte('payment_date', from)
      .lte('payment_date', to)
      .order('payment_date', { ascending: false })
      .limit(5000),

    supabase
      .from('pyra_invoices')
      .select('id, invoice_number, client_name, total, amount_paid, amount_due, status, created_at')
      .not('status', 'in', '("draft","cancelled")')
      .gte('created_at', from)
      .lte('created_at', toEnd)
      .order('created_at', { ascending: false })
      .limit(5000),
  ]);

  // Payments CSV
  const paymentHeaders = ['معرف الدفعة', 'معرف الفاتورة', 'المبلغ', 'تاريخ الدفع', 'طريقة الدفع', 'المرجع'];
  const paymentRows = (paymentsRes.data || []).map(
    (p: { id: string; invoice_id: string; amount: number; payment_date: string; method: string; reference: string | null }) => [
      p.id,
      p.invoice_id,
      p.amount,
      p.payment_date,
      p.method,
      p.reference || '',
    ]
  );

  // Invoices CSV
  const invoiceHeaders = ['رقم الفاتورة', 'العميل', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة', 'تاريخ الإنشاء'];
  const invoiceRows = (invoicesRes.data || []).map(
    (i: { invoice_number: string; client_name: string | null; total: number; amount_paid: number; amount_due: number; status: string; created_at: string }) => [
      i.invoice_number,
      i.client_name || '',
      i.total,
      i.amount_paid,
      i.amount_due,
      i.status,
      i.created_at ? new Date(i.created_at).toLocaleDateString('en-CA') : '',
    ]
  );

  // Combine: Invoices section then Payments section
  const invoicesCSV = toCSV(invoiceHeaders, invoiceRows);
  const paymentsCSV = toCSV(paymentHeaders, paymentRows);

  return `--- الفواتير ---\n${invoicesCSV}\n\n--- المدفوعات ---\n${paymentsCSV}`;
}

// ── Export: Team ─────────────────────────────────────────────

async function exportTeam(
  supabase: SupabaseClient,
  from: string,
  toEnd: string
): Promise<string> {
  const [usersRes, activityRes] = await Promise.all([
    supabase
      .from('pyra_users')
      .select('username, display_name, role'),

    supabase
      .from('pyra_activity_log')
      .select('username, action_type, created_at')
      .gte('created_at', from)
      .lte('created_at', toEnd)
      .limit(10000),
  ]);

  const users = usersRes.data || [];
  const activities = activityRes.data || [];

  // Aggregate activity per user
  const userStatsMap: Record<string, { actions: number; uploads: number; last_active: string }> = {};
  for (const act of activities) {
    const username = (act as { username: string }).username;
    if (!username) continue;
    if (!userStatsMap[username]) {
      userStatsMap[username] = { actions: 0, uploads: 0, last_active: '' };
    }
    userStatsMap[username].actions += 1;
    const actionType = (act as { action_type: string }).action_type;
    if (actionType === 'upload' || actionType === 'file_uploaded') {
      userStatsMap[username].uploads += 1;
    }
    const createdAt = (act as { created_at: string }).created_at;
    if (!userStatsMap[username].last_active || createdAt > userStatsMap[username].last_active) {
      userStatsMap[username].last_active = createdAt;
    }
  }

  const headers = ['اسم المستخدم', 'الاسم', 'الدور', 'عدد الإجراءات', 'الملفات المرفوعة', 'آخر نشاط'];

  const rows = users.map(
    (u: { username: string; display_name: string; role: string }) => {
      const stats = userStatsMap[u.username];
      return [
        u.username,
        u.display_name,
        u.role,
        stats?.actions || 0,
        stats?.uploads || 0,
        stats?.last_active ? new Date(stats.last_active).toLocaleDateString('en-CA') : '',
      ];
    }
  );

  return toCSV(headers, rows);
}

// ── Export: Storage ──────────────────────────────────────────

async function exportStorage(supabase: SupabaseClient): Promise<string> {
  const { data: files } = await supabase
    .from('pyra_file_index')
    .select('file_name, file_path, file_size, mime_type, is_folder, indexed_at')
    .eq('is_folder', false)
    .order('file_size', { ascending: false })
    .limit(5000);

  const headers = ['اسم الملف', 'المسار', 'الحجم (بايت)', 'النوع', 'تاريخ الفهرسة'];

  const rows = (files || []).map(
    (f: { file_name: string; file_path: string; file_size: number; mime_type: string; indexed_at: string }) => [
      f.file_name,
      f.file_path,
      f.file_size,
      f.mime_type,
      f.indexed_at ? new Date(f.indexed_at).toLocaleDateString('en-CA') : '',
    ]
  );

  return toCSV(headers, rows);
}
