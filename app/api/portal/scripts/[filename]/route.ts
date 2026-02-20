import { NextRequest } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiServerError,
  apiValidationError,
} from '@/lib/api/response';

const BUCKET = 'pyraai-workspace';
const SCRIPTS_PATH = 'projects/injazat/Etmam/video-scripts';

/** Allowed companies (lowercase check) */
const ALLOWED_COMPANIES = ['injazat', 'إنجازات', 'etmam', 'إتمام'];

function isAuthorizedCompany(company: string | null): boolean {
  if (!company) return false;
  const lower = company.toLowerCase();
  return ALLOWED_COMPANIES.some((c) => lower.includes(c));
}

/** Only allow valid script filenames — prevents path traversal */
const SAFE_FILENAME = /^video-\d+-[\w-]+(\.md)$/i;

/**
 * GET /api/portal/scripts/:filename
 *
 * Download and return the text content of a specific script file.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    if (!isAuthorizedCompany(client.company)) {
      return apiForbidden('هذه الصفحة مخصصة لعملاء مركز إتمام فقط');
    }

    const { filename } = await params;

    // Validate filename to prevent path traversal
    if (!filename || !SAFE_FILENAME.test(filename)) {
      return apiValidationError('اسم ملف غير صالح');
    }

    const filePath = `${SCRIPTS_PATH}/${filename}`;

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .download(filePath);

    if (error) {
      console.error('[portal/scripts/file] Download error:', error.message);
      return apiNotFound('الملف غير موجود');
    }

    const content = await data.text();

    return apiSuccess({ content, filename });
  } catch (err) {
    console.error('[portal/scripts/file] Unexpected error:', err);
    return apiServerError();
  }
}
