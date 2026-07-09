'use client';

import { useEffect } from 'react';
import { useProjects } from '@/hooks/useProjects';
import { useUser } from '@/hooks/useUsers';
import { useEmployeePayments } from '@/hooks/useEmployeePayments';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import Link from 'next/link';
import { getStatusBadgeClass } from '@/lib/constants/badge-colors';
import {
  User, Briefcase, DollarSign, FolderKanban, ArrowRight,
  Phone, Mail, MapPin, Calendar, Clock, Building2,
  CreditCard, Wallet, TrendingUp, Receipt, Download, FileText,
  ClipboardList,
} from 'lucide-react';
import { UserDocumentsTab } from '@/components/hr/documents/UserDocumentsTab';
import { useTranslations, useLocale } from 'next-intl';
import { useStatusLabels } from '@/lib/i18n/status-labels';

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

interface UserData {
  username: string;
  display_name: string;
  email?: string;
  phone?: string;
  job_title?: string;
  role: string;
  role_name_ar?: string;
  status?: string;
  avatar_url?: string;
  department?: string;
  employment_type?: string;
  work_location?: string;
  payment_type?: string;
  salary?: number;
  salary_currency?: string;
  hourly_rate?: number;
  commission_rate?: number;
  hire_date?: string;
  manager_username?: string;
  bank_details?: { bank?: string; iban?: string; account_name?: string; account_no?: string };
  created_at: string;
  onboarding_id?: string | null;
}

interface ProjectItem {
  id: string;
  name: string;
  status: string;
  client_name?: string;
}

// ═══════════════════════════════════════════════════════════
// Phase 6a Task 4 — the 5 shadow label maps that used to live here
// (EMPLOYMENT_LABELS, WORK_LOCATION_LABELS, PAYMENT_TYPE_LABELS,
// SOURCE_LABELS, ROLE_LABELS) are DELETED. Labels now resolve via
// useStatusLabels() against the canonical statuses.json entities
// (accountType / employmentType / workLocation / paymentType /
// paymentSourceType) — see the reconciliation notes in the component
// body below and the Phase 6a.4 task report for the wording decisions.
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════

export default function UserDetailClient() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;

  const t = useTranslations('users.detail');
  const locale = useLocale();
  // Reconciled shadow-map resolvers (Phase 6a.4) — see report for the
  // per-enum wording decisions (accountType/employmentType/workLocation
  // converge to the canonical statuses.json wording; paymentType is a new
  // entity distinct from paymentSourceType since the two enums don't
  // share a key set; SOURCE_LABELS maps 1:1 onto the existing
  // paymentSourceType entity with zero wording conflicts).
  const accountTypeLabel = useStatusLabels('accountType');
  const employmentTypeLabel = useStatusLabels('employmentType');
  const workLocationLabel = useStatusLabels('workLocation');
  const paymentTypeLabel = useStatusLabels('paymentType');
  const sourceTypeLabel = useStatusLabels('paymentSourceType');

  // ── Data (React Query hooks — no raw fetch) ──
  const { data: user, isLoading: loading, isError } = useUser<UserData>(username);
  const { data: payments = [], isLoading: paymentsLoading } = useEmployeePayments({ username });
  const { data: projectsRaw = [], isLoading: projectsLoading } = useProjects();
  const projects: ProjectItem[] = projectsRaw.slice(0, 20).map(p => ({
    id: p.id,
    name: p.name,
    status: p.status || '',
    client_name: (p as unknown as Record<string, unknown> & { pyra_clients?: { name: string } }).pyra_clients?.name,
  }));

  // Redirect back to the list when the user can't be loaded (404 / fetch error)
  useEffect(() => {
    if (isError) {
      toast.error(t('loadFailed'));
      router.push('/dashboard/users');
    }
  }, [isError, router, t]);

  // ── Stats — grouped by currency to avoid summing across currencies ──
  const totalPaidByCurrency: Record<string, number> = {};
  for (const p of payments.filter(s => s.status === 'paid')) {
    const cur = p.currency || 'AED';
    totalPaidByCurrency[cur] = (totalPaidByCurrency[cur] ?? 0) + Number(p.amount);
  }
  const totalPendingByCurrency: Record<string, number> = {};
  for (const p of payments.filter(s => s.status === 'pending' || s.status === 'approved')) {
    const cur = p.currency || 'AED';
    totalPendingByCurrency[cur] = (totalPendingByCurrency[cur] ?? 0) + Number(p.amount);
  }
  // Net paid per currency (paid non-deductions minus deductions)
  const netPaidByCurrency: Record<string, number> = {};
  for (const p of payments.filter(s => s.status === 'paid')) {
    const cur = p.currency || 'AED';
    const delta = p.source_type === 'deduction' ? -Number(p.amount) : Number(p.amount);
    netPaidByCurrency[cur] = (netPaidByCurrency[cur] ?? 0) + delta;
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="space-y-6 p-4 lg:p-6">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  if (!user) return null;

  const initials = user.display_name?.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase() || 'U';

  return (
    <div className="space-y-6 p-4 lg:p-6">
      {/* ═══════════ Header Card ═══════════ */}
      <Card className="border-0 shadow-lg dark:shadow-black/20 bg-gradient-to-b from-orange-500/5 to-transparent dark:from-orange-500/10">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start gap-4">
            {/* Avatar */}
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-400 to-amber-600 flex items-center justify-center text-white text-xl font-bold shadow-lg shrink-0">
              {initials}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold">{user.display_name}</h1>
                <Badge className={getStatusBadgeClass(user.status || 'active')}>
                  {user.status === 'active' ? t('status.active') : user.status === 'suspended' ? t('status.suspended') : t('status.inactive')}
                </Badge>
                <Badge variant="outline">{user.role_name_ar || accountTypeLabel(user.role) || user.role}</Badge>
              </div>
              {user.job_title && <p className="text-sm text-muted-foreground mt-1">{user.job_title}</p>}

              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-muted-foreground">
                {user.email && (
                  <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{user.email}</span>
                )}
                {user.phone && (
                  <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{user.phone}</span>
                )}
                {user.department && (
                  <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{user.department}</span>
                )}
                {user.work_location && (
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{workLocationLabel(user.work_location)}</span>
                )}
                {user.hire_date && (
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{t('hireSince', { date: formatDate(user.hire_date, undefined, locale) })}</span>
                )}
                {user.employment_type && (
                  <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{employmentTypeLabel(user.employment_type)}</span>
                )}
                {user.payment_type && (
                  <span className="flex items-center gap-1"><CreditCard className="h-3 w-3" />{paymentTypeLabel(user.payment_type)}</span>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-2 shrink-0">
              {user.onboarding_id && (
                <Link href={`/dashboard/hr/onboarding/${user.onboarding_id}`}>
                  <Button variant="outline" size="sm" className="gap-1.5 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/30">
                    <ClipboardList className="h-3.5 w-3.5" />
                    {t('viewOnboarding')}
                  </Button>
                </Link>
              )}
              <Link href="/dashboard/users">
                <Button variant="outline" size="sm">{t('backButton')}</Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══════════ Stats Row ═══════════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4 pb-4 text-center">
            <Wallet className="h-5 w-5 mx-auto mb-1 text-emerald-500" />
            <p className="text-[10px] text-muted-foreground">{t('stats.totalPaid')}</p>
            {Object.entries(totalPaidByCurrency).length === 0 ? (
              <p className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">{formatCurrency(0)}</p>
            ) : (
              Object.entries(totalPaidByCurrency).map(([cur, amt]) => (
                <p key={cur} className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400 leading-tight">{formatCurrency(amt, cur)}</p>
              ))
            )}
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4 pb-4 text-center">
            <Clock className="h-5 w-5 mx-auto mb-1 text-yellow-500" />
            <p className="text-[10px] text-muted-foreground">{t('stats.pending')}</p>
            {Object.entries(totalPendingByCurrency).length === 0 ? (
              <p className="text-lg font-bold font-mono text-yellow-600 dark:text-yellow-400">{formatCurrency(0)}</p>
            ) : (
              Object.entries(totalPendingByCurrency).map(([cur, amt]) => (
                <p key={cur} className="text-lg font-bold font-mono text-yellow-600 dark:text-yellow-400 leading-tight">{formatCurrency(amt, cur)}</p>
              ))
            )}
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4 pb-4 text-center">
            <TrendingUp className="h-5 w-5 mx-auto mb-1 text-orange-500" />
            <p className="text-[10px] text-muted-foreground">{t('stats.paymentsCount')}</p>
            <p className="text-lg font-bold">{payments.length}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4 pb-4 text-center">
            <FolderKanban className="h-5 w-5 mx-auto mb-1 text-blue-500" />
            <p className="text-[10px] text-muted-foreground">{t('stats.projectsCount')}</p>
            <p className="text-lg font-bold">{projects.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* ═══════════ Tabs ═══════════ */}
      <Tabs defaultValue="financial" className="space-y-4">
        <TabsList className="bg-muted/50 p-1 h-auto flex-wrap">
          <TabsTrigger value="financial" className="gap-1.5 text-xs data-[state=active]:bg-orange-500/10 data-[state=active]:text-orange-600">
            <DollarSign className="h-3.5 w-3.5" />
            {t('tabs.financial')}
          </TabsTrigger>
          <TabsTrigger value="projects" className="gap-1.5 text-xs data-[state=active]:bg-orange-500/10 data-[state=active]:text-orange-600">
            <FolderKanban className="h-3.5 w-3.5" />
            {t('tabs.projects')}
          </TabsTrigger>
          <TabsTrigger value="info" className="gap-1.5 text-xs data-[state=active]:bg-orange-500/10 data-[state=active]:text-orange-600">
            <User className="h-3.5 w-3.5" />
            {t('tabs.info')}
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-1.5 text-xs data-[state=active]:bg-orange-500/10 data-[state=active]:text-orange-600">
            <FileText className="h-3.5 w-3.5" />
            {t('tabs.documents')}
          </TabsTrigger>
        </TabsList>

        {/* ═══════════ Financial Tab ═══════════ */}
        <TabsContent value="financial" className="space-y-4">
          {paymentsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
            </div>
          ) : payments.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title={t('financial.emptyTitle')}
              description={t('financial.emptyDescription')}
            />
          ) : (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Receipt className="h-4 w-4" />
                  {t('financial.recordsHeading', { count: payments.length })}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-start pb-3 pe-3 font-medium">{t('financial.table.date')}</th>
                        <th className="text-start pb-3 pe-3 font-medium">{t('financial.table.type')}</th>
                        <th className="text-start pb-3 pe-3 font-medium">{t('financial.table.description')}</th>
                        <th className="text-end pb-3 pe-3 font-medium">{t('financial.table.amount')}</th>
                        <th className="text-start pb-3 font-medium">{t('financial.table.status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map(p => (
                        <tr key={p.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="py-3 pe-3 text-xs text-muted-foreground">
                            {formatDate(p.created_at, undefined, locale)}
                          </td>
                          <td className="py-3 pe-3">
                            <Badge variant="outline" className="text-[10px]">
                              {sourceTypeLabel(p.source_type)}
                            </Badge>
                          </td>
                          <td className="py-3 pe-3 text-xs text-muted-foreground max-w-[250px] truncate">
                            {p.description || t('financial.noDescription')}
                          </td>
                          <td className={`py-3 pe-3 text-end font-mono font-medium ${
                            p.source_type === 'deduction' ? 'text-red-600 dark:text-red-400' : 'text-foreground'
                          }`}>
                            {p.source_type === 'deduction' ? '-' : ''}{formatCurrency(p.amount, p.currency || 'AED')}
                          </td>
                          <td className="py-3">
                            <Badge className={`text-[10px] border-0 ${getStatusBadgeClass(p.status)}`}>
                              {p.status === 'paid' ? t('financial.paymentStatus.paid') : p.status === 'approved' ? t('financial.paymentStatus.approved') : p.status === 'pending' ? t('financial.paymentStatus.pending') : p.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Summary */}
                <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t('financial.netPaid')}</span>
                  <span className="font-bold font-mono text-lg">
                    {Object.entries(netPaidByCurrency).length === 0
                      ? formatCurrency(0)
                      : Object.entries(netPaidByCurrency).map(([cur, amt]) => (
                          <span key={cur} className="block">{formatCurrency(amt, cur)}</span>
                        ))}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══════════ Projects Tab ═══════════ */}
        <TabsContent value="projects" className="space-y-4">
          {projectsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
            </div>
          ) : projects.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title={t('projects.emptyTitle')}
              description={t('projects.emptyDescription')}
            />
          ) : (
            <div className="space-y-2">
              {projects.map(p => (
                <Link key={p.id} href={`/dashboard/projects/${p.id}`}>
                  <Card className="border-0 shadow-sm hover:border-orange-300 dark:hover:border-orange-700 transition-colors cursor-pointer">
                    <CardContent className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FolderKanban className="h-4 w-4 text-orange-500" />
                        <div>
                          <p className="text-sm font-medium">{p.name}</p>
                          {p.client_name && <p className="text-xs text-muted-foreground">{p.client_name}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          {p.status === 'active' ? t('projects.status.active') : p.status === 'completed' ? t('projects.status.completed') : p.status}
                        </Badge>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ═══════════ Info Tab ═══════════ */}
        <TabsContent value="info" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Employment Info */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  {t('info.employmentHeading')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label={t('info.fields.employmentType')} value={employmentTypeLabel(user.employment_type || '') || t('info.empty')} />
                <InfoRow label={t('info.fields.workLocation')} value={workLocationLabel(user.work_location || '') || t('info.empty')} />
                <InfoRow label={t('info.fields.department')} value={user.department || t('info.empty')} />
                <InfoRow label={t('info.fields.hireDate')} value={user.hire_date ? formatDate(user.hire_date, undefined, locale) : t('info.empty')} />
                <InfoRow label={t('info.fields.manager')} value={user.manager_username || t('info.empty')} />
              </CardContent>
            </Card>

            {/* Compensation */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  {t('info.compensationHeading')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label={t('info.fields.paymentType')} value={paymentTypeLabel(user.payment_type || '') || t('info.empty')} />
                {user.salary ? <InfoRow label={t('info.fields.monthlySalary')} value={formatCurrency(user.salary, user.salary_currency)} /> : null}
                {user.hourly_rate ? <InfoRow label={t('info.fields.hourlyRate')} value={formatCurrency(user.hourly_rate, user.salary_currency)} /> : null}
                {user.commission_rate ? <InfoRow label={t('info.fields.commissionRate')} value={`${user.commission_rate}%`} /> : null}
              </CardContent>
            </Card>

            {/* Bank Details */}
            {user.bank_details && (
              <Card className="border-0 shadow-sm md:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    {t('info.bankHeading')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {user.bank_details.bank && <InfoRow label={t('info.fields.bank')} value={user.bank_details.bank} />}
                  {user.bank_details.account_name && <InfoRow label={t('info.fields.accountName')} value={user.bank_details.account_name} />}
                  {user.bank_details.account_no && <InfoRow label={t('info.fields.accountNumber')} value={user.bank_details.account_no} />}
                  {user.bank_details.iban && <InfoRow label={t('info.fields.iban')} value={user.bank_details.iban} />}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ═══════════ Documents Tab ═══════════ */}
        <TabsContent value="documents" className="space-y-4">
          <UserDocumentsTab username={username} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Helper ──
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
