import { NextRequest, NextResponse } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isSuperAdmin } from '@/lib/auth/rbac';

/**
 * GET /api/dashboard/sales/leads/export
 * Export leads as CSV with BOM for Arabic support.
 * Supports same filters as list API.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('sales_leads.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();
    const sp = request.nextUrl.searchParams;

    let query = supabase
      .from('pyra_sales_leads')
      .select('id, name, phone, email, company, source, stage_id, assigned_to, priority, score, is_converted, created_at')
      .order('created_at', { ascending: false });

    // Agent scoping
    const isAdmin = isSuperAdmin(auth.pyraUser.rolePermissions);
    if (!isAdmin) {
      query = query.eq('assigned_to', auth.pyraUser.username);
    }

    // Apply filters
    const stageId = sp.get('stage_id');
    const assignedTo = sp.get('assigned_to');
    const priority = sp.get('priority');
    const source = sp.get('source');
    const search = sp.get('search');
    const isConverted = sp.get('is_converted');

    if (stageId) query = query.eq('stage_id', stageId);
    if (assignedTo && isAdmin) query = query.eq('assigned_to', assignedTo);
    if (priority) query = query.eq('priority', priority);
    if (source) query = query.eq('source', source);
    if (isConverted !== null && isConverted !== undefined) {
      query = query.eq('is_converted', isConverted === 'true');
    }
    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`);
    }

    const { data: leads, error } = await query;

    if (error) {
      console.error('Leads export error:', error);
      return apiServerError();
    }

    // Fetch stage names
    const { data: stages } = await supabase
      .from('pyra_sales_pipeline_stages')
      .select('id, name_ar');
    const stageMap: Record<string, string> = {};
    for (const s of stages || []) stageMap[s.id] = s.name_ar;

    const priorityLabels: Record<string, string> = {
      low: 'منخفضة', medium: 'متوسطة', high: 'عالية', urgent: 'عاجلة',
    };

    const sourceLabels: Record<string, string> = {
      manual: 'يدوي', whatsapp: 'واتساب', website: 'موقع', referral: 'إحالة', ad: 'إعلان', social: 'سوشيال',
    };

    // Build CSV with BOM
    const headers = ['الاسم', 'الهاتف', 'البريد الإلكتروني', 'الشركة', 'المصدر', 'المرحلة', 'الأولوية', 'التقييم', 'الموظف', 'محوّل', 'تاريخ الإنشاء'];
    const rows = (leads || []).map(lead => [
      lead.name || '',
      lead.phone || '',
      lead.email || '',
      lead.company || '',
      sourceLabels[lead.source] || lead.source || '',
      stageMap[lead.stage_id] || '',
      priorityLabels[lead.priority] || lead.priority || '',
      lead.score?.toString() || '0',
      lead.assigned_to || '',
      lead.is_converted ? 'نعم' : 'لا',
      lead.created_at ? new Date(lead.created_at).toLocaleDateString('ar-SA') : '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    // UTF-8 BOM for Arabic support in Excel
    const bom = '\uFEFF';
    const body = bom + csvContent;

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="leads-export-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (err) {
    console.error('GET /api/dashboard/sales/leads/export error:', err);
    return apiServerError();
  }
}
