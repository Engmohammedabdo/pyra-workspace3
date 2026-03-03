import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { escapeLike, escapePostgrestValue } from '@/lib/utils/path';

// Fields to select for export
const CLIENT_FIELDS = 'id, name, email, phone, company, source, is_active, created_at';

/**
 * Escape a single CSV field value.
 * Wraps in double-quotes if the value contains commas, quotes, or newlines.
 */
function escapeCsvField(field: string): string {
  if (!field) return '';
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * GET /api/clients/export
 * Export clients as CSV with BOM for Arabic support.
 * Supports the same filters as the main clients list + tag filter.
 * Admin only.
 *
 * Query params:
 *   ?search= — filter by name, email, or company (ilike)
 *   ?active= — "true" or "false"
 *   ?tag=    — filter by tag ID (via pyra_client_tag_assignments)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('clients.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();
    const searchParams = request.nextUrl.searchParams;

    const search = searchParams.get('search')?.trim() || '';
    const active = searchParams.get('active')?.trim() || '';
    const tagId = searchParams.get('tag')?.trim() || '';

    // ── If tag filter, get matching client IDs first ─
    let tagClientIds: string[] | null = null;

    if (tagId) {
      const { data: tagAssignments, error: tagError } = await supabase
        .from('pyra_client_tag_assignments')
        .select('client_id')
        .eq('tag_id', tagId);

      if (tagError) {
        console.error('Tag assignments fetch error:', tagError);
        // Non-critical — proceed without tag filter
      } else {
        tagClientIds = (tagAssignments || []).map((a) => a.client_id);
        // If no clients match the tag, return empty CSV
        if (tagClientIds.length === 0) {
          return buildEmptyCsv();
        }
      }
    }

    // ── Build clients query ─────────────────────────
    let query = supabase
      .from('pyra_clients')
      .select(CLIENT_FIELDS)
      .order('created_at', { ascending: false })
      .limit(5000);

    // Search filter
    if (search) {
      const escaped = escapeLike(search);
      const safeVal = escapePostgrestValue(`%${escaped}%`);
      query = query.or(
        `name.ilike.${safeVal},email.ilike.${safeVal},company.ilike.${safeVal}`
      );
    }

    // Active filter
    if (active === 'true') {
      query = query.eq('is_active', true);
    } else if (active === 'false') {
      query = query.eq('is_active', false);
    }

    // Tag filter — restrict to matching client IDs
    if (tagClientIds) {
      query = query.in('id', tagClientIds);
    }

    const { data: clients, error: clientsError } = await query;

    if (clientsError) {
      console.error('Clients export query error:', clientsError);
      return apiServerError('فشل في تصدير العملاء');
    }

    const clientList = clients || [];

    if (clientList.length === 0) {
      return buildEmptyCsv();
    }

    // ── Fetch tags for all exported clients ─────────
    const clientIds = clientList.map((c) => c.id);

    const { data: allAssignments } = await supabase
      .from('pyra_client_tag_assignments')
      .select('client_id, tag_id, pyra_client_tags(name)')
      .in('client_id', clientIds);

    // Build a map: client_id → tag names[]
    const clientTagsMap: Record<string, string[]> = {};
    if (allAssignments) {
      for (const assignment of allAssignments) {
        const cid = assignment.client_id;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tagName = (assignment as any).pyra_client_tags?.name;
        if (tagName) {
          if (!clientTagsMap[cid]) clientTagsMap[cid] = [];
          clientTagsMap[cid].push(tagName);
        }
      }
    }

    // ── Build CSV ───────────────────────────────────
    const BOM = '\uFEFF';
    const headers = [
      'الاسم',
      'البريد الإلكتروني',
      'الهاتف',
      'الشركة',
      'المصدر',
      'الحالة',
      'التصنيفات',
      'تاريخ الإنشاء',
    ];

    const SOURCE_LABELS: Record<string, string> = {
      manual: 'يدوي',
      import: 'استيراد',
      referral: 'إحالة',
      website: 'موقع إلكتروني',
    };

    const csvRows = clientList.map((client) => {
      const createdDate = client.created_at
        ? new Date(client.created_at).toLocaleDateString('en-CA') // YYYY-MM-DD
        : '';
      const statusLabel = client.is_active ? 'نشط' : 'غير نشط';
      const sourceLabel = SOURCE_LABELS[client.source] || client.source || '';
      const tags = clientTagsMap[client.id]?.join('، ') || '';

      return [
        escapeCsvField(client.name || ''),
        escapeCsvField(client.email || ''),
        escapeCsvField(client.phone || ''),
        escapeCsvField(client.company || ''),
        escapeCsvField(sourceLabel),
        escapeCsvField(statusLabel),
        escapeCsvField(tags),
        createdDate,
      ].join(',');
    });

    const csvContent = BOM + headers.join(',') + '\n' + csvRows.join('\n');
    const fileName = `clients-export-${new Date().toISOString().slice(0, 10)}.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (err) {
    console.error('GET /api/clients/export error:', err);
    return apiServerError();
  }
}

/**
 * Return an empty CSV with headers only (when no clients match filters).
 */
function buildEmptyCsv(): Response {
  const BOM = '\uFEFF';
  const headers = [
    'الاسم',
    'البريد الإلكتروني',
    'الهاتف',
    'الشركة',
    'المصدر',
    'الحالة',
    'التصنيفات',
    'تاريخ الإنشاء',
  ];
  const csvContent = BOM + headers.join(',') + '\n';
  const fileName = `clients-export-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  });
}
