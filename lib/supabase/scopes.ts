import { escapePostgrestValue } from '@/lib/utils/path';

/**
 * Build a PostgREST `.or()` scope string for portal routes that query
 * projects belonging to a client.
 *
 * Logic:
 *  - Direct match: `client_id.eq.<clientId>`
 *  - Legacy fallback: `client_id.is.null AND client_company.eq.<company>`
 *
 * The company value is escaped to prevent PostgREST filter injection.
 *
 * Usage:
 *   const scope = buildClientProjectScope(client.id, client.company);
 *   query.or(scope);
 */
export function buildClientProjectScope(clientId: string, company: string | null): string {
  const safeCompany = escapePostgrestValue(company || '');
  return `client_id.eq.${clientId},and(client_id.is.null,client_company.eq.${safeCompany})`;
}
