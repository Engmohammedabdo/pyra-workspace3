'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { ClientNotesTab } from '@/components/clients/ClientNotesTab';
import { BrandingEditor } from '@/components/clients/BrandingEditor';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';
import { formatDate, formatCurrency, formatRelativeDate } from '@/lib/utils/format';
import { usePermission } from '@/hooks/usePermission';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Building2,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Briefcase,
  FileText,
  Receipt,
  Quote,
  StickyNote,
  Activity,
  Palette,
  Edit,
  Power,
  ExternalLink,
  Tag,
  DollarSign,
  Clock,
  AlertCircle,
  Globe,
  Users,
  Loader2,
} from 'lucide-react';

// ──────────────────────────────────────────────────────────────
// Interfaces
// ──────────────────────────────────────────────────────────────

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string;
  address: string | null;
  source: string | null;
  last_login_at: string | null;
  is_active: boolean;
  created_at: string;
  tags: { id: string; name: string; color: string }[];
  projects_count: number;
  active_projects_count: number;
  quotes_count: number;
  quotes_total: number;
  invoices_count: number;
  total_invoiced: number;
  total_paid: number;
  outstanding: number;
  contracts_count: number;
  recent_activity: ActivityItem[];
}

interface ActivityItem {
  id: string;
  action_type: string;
  username: string;
  display_name: string;
  details: Record<string, unknown>;
  created_at: string;
}

interface ProjectItem {
  id: string;
  name: string;
  status: string;
  deadline: string | null;
  created_at: string;
}

interface InvoiceItem {
  id: string;
  invoice_number: string;
  total: number;
  status: string;
  currency: string;
  due_date: string | null;
  created_at: string;
}

interface QuoteItem {
  id: string;
  quote_number: string;
  total: number;
  status: string;
  currency: string;
  created_at: string;
}

// ──────────────────────────────────────────────────────────────
// Label / Status Maps
// ──────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  manual: 'يدوي',
  referral: 'إحالة',
  website: 'موقع إلكتروني',
  social: 'تواصل اجتماعي',
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: {
    label: 'نشط',
    color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  in_progress: {
    label: 'قيد التنفيذ',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  review: {
    label: 'مراجعة',
    color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  completed: {
    label: 'مكتمل',
    color: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
  },
  archived: {
    label: 'مؤرشف',
    color: 'bg-gray-100 text-gray-500 dark:bg-gray-800/50 dark:text-gray-500',
  },
};

const INVOICE_STATUS: Record<string, { label: string; color: string }> = {
  draft: {
    label: 'مسودة',
    color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  },
  sent: {
    label: 'مرسلة',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  paid: {
    label: 'مدفوعة',
    color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  overdue: {
    label: 'متأخرة',
    color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
  cancelled: {
    label: 'ملغاة',
    color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
  },
};

const QUOTE_STATUS: Record<string, { label: string; color: string }> = {
  draft: {
    label: 'مسودة',
    color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  },
  sent: {
    label: 'مرسل',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  accepted: {
    label: 'مقبول',
    color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  rejected: {
    label: 'مرفوض',
    color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
  expired: {
    label: 'منتهي',
    color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
};

const TAG_COLOR_MAP: Record<string, string> = {
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  pink: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  teal: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  gray: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
};

const ACTIVITY_LABELS: Record<string, string> = {
  // Client actions
  client_created: 'تم إنشاء الحساب',
  client_updated: 'تم تحديث البيانات',
  update_client: 'تم تحديث بيانات العميل',
  client_deleted: 'تم حذف العميل',
  client_note_added: 'تمت إضافة ملاحظة',
  client_note_deleted: 'تم حذف ملاحظة',
  // Project actions
  project_created: 'تم إنشاء مشروع',
  project_updated: 'تم تحديث مشروع',
  project_deleted: 'تم حذف مشروع',
  project_files_synced: 'تمت مزامنة ملفات المشروع',
  // Invoice actions
  invoice_created: 'تم إنشاء فاتورة',
  invoice_updated: 'تم تحديث فاتورة',
  invoice_deleted: 'تم حذف فاتورة',
  invoice_sent: 'تم إرسال فاتورة',
  invoice_paid: 'تم دفع فاتورة',
  // Quote actions
  quote_created: 'تم إنشاء عرض سعر',
  create_quote: 'تم إنشاء عرض سعر',
  quote_updated: 'تم تحديث عرض سعر',
  quote_deleted: 'تم حذف عرض سعر',
  delete_quote: 'تم حذف عرض سعر',
  quote_sent: 'تم إرسال عرض سعر',
  quote_accepted: 'تم قبول عرض سعر',
  quote_rejected: 'تم رفض عرض سعر',
  // File actions
  upload: 'تم رفع ملف',
  download: 'تم تحميل ملف',
  rename: 'تم إعادة تسمية ملف',
  move: 'تم نقل ملف',
  delete: 'تم حذف ملف',
  restore: 'تم استعادة ملف',
  share: 'تم مشاركة ملف',
  copy: 'تم نسخ ملف',
  // Portal actions
  portal_login: 'تسجيل دخول للبوابة',
  portal_download: 'تحميل ملف من البوابة',
  portal_preview: 'معاينة ملف من البوابة',
  portal_view: 'عرض صفحة في البوابة',
  // Finance actions
  create_expense: 'تم إنشاء مصروف',
  expense_created: 'تم إنشاء مصروف',
  create_subscription: 'تم إنشاء اشتراك',
  contract_created: 'تم إنشاء عقد',
  contract_updated: 'تم تحديث عقد',
  payment_received: 'تم استلام دفعة',
  // Review actions
  review_added: 'تمت إضافة مراجعة',
  review_updated: 'تم تحديث مراجعة',
  // Settings
  settings_updated: 'تم تحديث الإعدادات',
  branding_updated: 'تم تحديث الهوية البصرية',
};

// ──────────────────────────────────────────────────────────────
// Helper: get activity icon
// ──────────────────────────────────────────────────────────────

function getActivityIcon(actionType: string) {
  switch (actionType) {
    case 'client_created':
    case 'client_updated':
    case 'client_deleted':
    case 'update_client':
      return <Users className="h-3.5 w-3.5" />;
    case 'client_note_added':
    case 'client_note_deleted':
      return <StickyNote className="h-3.5 w-3.5" />;
    case 'project_created':
    case 'project_updated':
    case 'project_deleted':
    case 'project_files_synced':
      return <Briefcase className="h-3.5 w-3.5" />;
    case 'invoice_created':
    case 'invoice_updated':
    case 'invoice_deleted':
    case 'invoice_sent':
    case 'invoice_paid':
    case 'payment_received':
      return <Receipt className="h-3.5 w-3.5" />;
    case 'quote_created':
    case 'create_quote':
    case 'quote_updated':
    case 'quote_deleted':
    case 'delete_quote':
    case 'quote_sent':
    case 'quote_accepted':
    case 'quote_rejected':
      return <Quote className="h-3.5 w-3.5" />;
    case 'upload':
    case 'download':
    case 'rename':
    case 'move':
    case 'delete':
    case 'restore':
    case 'share':
    case 'copy':
      return <FileText className="h-3.5 w-3.5" />;
    case 'portal_login':
    case 'portal_download':
    case 'portal_preview':
    case 'portal_view':
      return <Globe className="h-3.5 w-3.5" />;
    case 'create_expense':
    case 'expense_created':
    case 'create_subscription':
      return <DollarSign className="h-3.5 w-3.5" />;
    case 'contract_created':
    case 'contract_updated':
      return <FileText className="h-3.5 w-3.5" />;
    case 'review_added':
    case 'review_updated':
      return <Edit className="h-3.5 w-3.5" />;
    case 'settings_updated':
    case 'branding_updated':
      return <Palette className="h-3.5 w-3.5" />;
    default:
      return <Activity className="h-3.5 w-3.5" />;
  }
}

// ──────────────────────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────────────────────

export function ClientDetailClient() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const canEdit = usePermission('clients.edit');

  // ── Main client data ─────────────────────────────────
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);

  // ── Tab data + loading states ────────────────────────
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsLoaded, setProjectsLoaded] = useState(false);

  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesLoaded, setInvoicesLoaded] = useState(false);

  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [quotesLoaded, setQuotesLoaded] = useState(false);

  const [fullActivity, setFullActivity] = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityLoaded, setActivityLoaded] = useState(false);

  // ── Fetch main client data ───────────────────────────
  const fetchClient = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}`);
      const json = await res.json();
      if (res.status === 404 || !json.data) {
        setNotFound(true);
        return;
      }
      setClient(json.data);
    } catch {
      toast.error('فشل في تحميل بيانات العميل');
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchClient();
  }, [fetchClient]);

  // ── Tab lazy-loaders ─────────────────────────────────
  const loadProjects = useCallback(async () => {
    if (projectsLoaded || !client) return;
    setProjectsLoading(true);
    try {
      const res = await fetch(
        `/api/projects?client_company=${encodeURIComponent(client.company)}`
      );
      const json = await res.json();
      if (json.data) setProjects(json.data);
    } catch {
      toast.error('فشل في تحميل المشاريع');
    } finally {
      setProjectsLoading(false);
      setProjectsLoaded(true);
    }
  }, [client, projectsLoaded]);

  const loadInvoices = useCallback(async () => {
    if (invoicesLoaded || !client) return;
    setInvoicesLoading(true);
    try {
      const res = await fetch(
        `/api/invoices?client_id=${encodeURIComponent(client.id)}`
      );
      const json = await res.json();
      if (json.data) setInvoices(json.data);
    } catch {
      toast.error('فشل في تحميل الفواتير');
    } finally {
      setInvoicesLoading(false);
      setInvoicesLoaded(true);
    }
  }, [client, invoicesLoaded]);

  const loadQuotes = useCallback(async () => {
    if (quotesLoaded || !client) return;
    setQuotesLoading(true);
    try {
      const res = await fetch(
        `/api/quotes?client_id=${encodeURIComponent(client.id)}`
      );
      const json = await res.json();
      if (json.data) setQuotes(json.data);
    } catch {
      toast.error('فشل في تحميل عروض الأسعار');
    } finally {
      setQuotesLoading(false);
      setQuotesLoaded(true);
    }
  }, [client, quotesLoaded]);

  const loadActivity = useCallback(async () => {
    if (activityLoaded || !client) return;
    setActivityLoading(true);
    try {
      const res = await fetch(`/api/clients/${client.id}/activity`);
      const json = await res.json();
      if (json.data) setFullActivity(json.data);
    } catch {
      toast.error('فشل في تحميل سجل النشاط');
    } finally {
      setActivityLoading(false);
      setActivityLoaded(true);
    }
  }, [client, activityLoaded]);

  // ── Handle tab change for lazy loading ───────────────
  const handleTabChange = (value: string) => {
    switch (value) {
      case 'projects':
        loadProjects();
        break;
      case 'invoices':
        loadInvoices();
        break;
      case 'quotes':
        loadQuotes();
        break;
      case 'activity':
        loadActivity();
        break;
    }
  };

  // ── Toggle active status ─────────────────────────────
  const handleToggleActive = async () => {
    if (!client) return;
    setTogglingActive(true);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !client.is_active }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
        return;
      }
      setClient((prev) =>
        prev ? { ...prev, is_active: !prev.is_active } : prev
      );
      toast.success(
        client.is_active ? 'تم تعطيل الحساب' : 'تم تفعيل الحساب'
      );
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setTogglingActive(false);
    }
  };

  // ──────────────────────────────────────────────────────
  // Loading State
  // ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="flex items-start gap-4">
          <Skeleton className="h-16 w-16 rounded-full shrink-0" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
            <div className="flex gap-2 mt-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
          </div>
        </div>
        {/* Stats skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        {/* Tabs skeleton */}
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  // ──────────────────────────────────────────────────────
  // Not Found State
  // ──────────────────────────────────────────────────────

  if (notFound || !client) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <EmptyState
          icon={Building2}
          title="العميل غير موجود"
          description="لم يتم العثور على العميل المطلوب"
          actionLabel="العودة للعملاء"
          onAction={() => router.push('/dashboard/clients')}
        />
      </div>
    );
  }

  // ──────────────────────────────────────────────────────
  // Main Render
  // ──────────────────────────────────────────────────────

  const initials = client.name.slice(0, 2);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* ── Back Button ──────────────────────────────────── */}
      <Link
        href="/dashboard/clients"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowRight className="h-4 w-4" />
        العملاء
      </Link>

      {/* ── Header Section ───────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        {/* Avatar */}
        <div className="h-16 w-16 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shrink-0">
          <span className="text-xl font-bold text-white">{initials}</span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{client.name}</h1>
            <Badge
              className={cn(
                'text-xs',
                client.is_active
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              )}
            >
              {client.is_active ? 'نشط' : 'غير نشط'}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-0.5">{client.company}</p>

          {/* Tags */}
          {client.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {client.tags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant="secondary"
                  className={cn(
                    'text-xs gap-1',
                    TAG_COLOR_MAP[tag.color] || TAG_COLOR_MAP.gray
                  )}
                >
                  <Tag className="h-3 w-3" />
                  {tag.name}
                </Badge>
              ))}
            </div>
          )}

          {/* Contact info row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-sm text-muted-foreground">
            {client.email && (
              <span className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                <span dir="ltr">{client.email}</span>
              </span>
            )}
            {client.phone && (
              <span className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                <span dir="ltr">{client.phone}</span>
              </span>
            )}
            {client.address && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {client.address}
              </span>
            )}
            {client.source && (
              <Badge variant="outline" className="text-xs gap-1">
                <Globe className="h-3 w-3" />
                {SOURCE_LABELS[client.source] || client.source}
              </Badge>
            )}
          </div>
        </div>

        {/* Quick actions */}
        {canEdit && (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() =>
                router.push(`/dashboard/clients?edit=${client.id}`)
              }
            >
              <Edit className="h-3.5 w-3.5" />
              تعديل
            </Button>
            <Button
              variant={client.is_active ? 'outline' : 'default'}
              size="sm"
              className={cn(
                'gap-1.5',
                !client.is_active &&
                  'bg-orange-500 hover:bg-orange-600 text-white'
              )}
              onClick={handleToggleActive}
              disabled={togglingActive}
            >
              {togglingActive ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Power className="h-3.5 w-3.5" />
              )}
              {client.is_active ? 'تعطيل' : 'تفعيل'}
            </Button>
          </div>
        )}
      </div>

      {/* ── Stats Cards ──────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Projects */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10">
                <Briefcase className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{client.projects_count}</p>
                <p className="text-xs text-muted-foreground">
                  المشاريع
                  {client.active_projects_count > 0 && (
                    <span className="text-blue-600 dark:text-blue-400 ms-1">
                      ({client.active_projects_count} نشط)
                    </span>
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total Invoiced */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-green-500/10">
                <Receipt className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {formatCurrency(client.total_invoiced)}
                </p>
                <p className="text-xs text-muted-foreground">
                  إجمالي الفواتير
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Outstanding */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-500/10">
                <AlertCircle
                  className={cn(
                    'h-5 w-5',
                    client.outstanding > 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-red-400 dark:text-red-600'
                  )}
                />
              </div>
              <div>
                <p
                  className={cn(
                    'text-2xl font-bold',
                    client.outstanding > 0 && 'text-red-600 dark:text-red-400'
                  )}
                >
                  {formatCurrency(client.outstanding)}
                </p>
                <p className="text-xs text-muted-foreground">مبالغ معلقة</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Last Activity */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/10">
                <Clock className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {client.recent_activity.length > 0
                    ? formatRelativeDate(client.recent_activity[0].created_at)
                    : '\u2014'}
                </p>
                <p className="text-xs text-muted-foreground">آخر نشاط</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Tabs Section ─────────────────────────────────── */}
      <Tabs
        defaultValue="overview"
        className="mt-6"
        onValueChange={handleTabChange}
      >
        <TabsList className="w-full justify-start gap-1 bg-muted/50 p-1 h-auto flex-wrap">
          <TabsTrigger value="overview" className="gap-1.5 text-xs">
            <Building2 className="h-3.5 w-3.5" />
            نظرة عامة
          </TabsTrigger>
          <TabsTrigger value="projects" className="gap-1.5 text-xs">
            <Briefcase className="h-3.5 w-3.5" />
            المشاريع
          </TabsTrigger>
          <TabsTrigger value="invoices" className="gap-1.5 text-xs">
            <Receipt className="h-3.5 w-3.5" />
            الفواتير
          </TabsTrigger>
          <TabsTrigger value="quotes" className="gap-1.5 text-xs">
            <Quote className="h-3.5 w-3.5" />
            عروض الأسعار
          </TabsTrigger>
          <TabsTrigger value="notes" className="gap-1.5 text-xs">
            <StickyNote className="h-3.5 w-3.5" />
            الملاحظات
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5 text-xs">
            <Activity className="h-3.5 w-3.5" />
            النشاط
          </TabsTrigger>
          <TabsTrigger value="branding" className="gap-1.5 text-xs">
            <Palette className="h-3.5 w-3.5" />
            الهوية البصرية
          </TabsTrigger>
        </TabsList>

        {/* ──── Overview Tab ──────────────────────────────── */}
        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Contact Details Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  معلومات التواصل
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <DetailRow
                    icon={<Mail className="h-4 w-4" />}
                    label="البريد الإلكتروني"
                    value={client.email}
                    dir="ltr"
                  />
                  <DetailRow
                    icon={<Phone className="h-4 w-4" />}
                    label="الهاتف"
                    value={client.phone || '\u2014'}
                    dir="ltr"
                  />
                  <DetailRow
                    icon={<Building2 className="h-4 w-4" />}
                    label="الشركة"
                    value={client.company}
                  />
                  <DetailRow
                    icon={<MapPin className="h-4 w-4" />}
                    label="العنوان"
                    value={client.address || '\u2014'}
                  />
                  <DetailRow
                    icon={<Globe className="h-4 w-4" />}
                    label="المصدر"
                    value={
                      client.source
                        ? SOURCE_LABELS[client.source] || client.source
                        : '\u2014'
                    }
                  />
                  <DetailRow
                    icon={<Calendar className="h-4 w-4" />}
                    label="تاريخ الإنشاء"
                    value={formatDate(client.created_at)}
                  />
                  <DetailRow
                    icon={<Clock className="h-4 w-4" />}
                    label="آخر دخول"
                    value={
                      client.last_login_at
                        ? formatRelativeDate(client.last_login_at)
                        : '\u2014'
                    }
                  />
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  آخر النشاطات
                </CardTitle>
              </CardHeader>
              <CardContent>
                {client.recent_activity.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    لا يوجد نشاط حديث
                  </p>
                ) : (
                  <div className="space-y-3">
                    {client.recent_activity.slice(0, 5).map((activity) => (
                      <div
                        key={activity.id}
                        className="flex items-start gap-3 text-sm"
                      >
                        <div className="p-1.5 rounded-lg bg-muted shrink-0 mt-0.5">
                          {getActivityIcon(activity.action_type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-foreground">
                            {ACTIVITY_LABELS[activity.action_type] ||
                              activity.action_type}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {activity.display_name} ·{' '}
                            {formatRelativeDate(activity.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ──── Projects Tab ──────────────────────────────── */}
        <TabsContent value="projects" className="mt-4">
          {projectsLoading ? (
            <Card>
              <CardContent className="p-0">
                <div className="space-y-0">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 p-4 border-b last:border-b-0">
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-5 w-20" />
                      <Skeleton className="h-5 w-24" />
                      <Skeleton className="h-5 w-24" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : projects.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title="لا توجد مشاريع"
              description="لا يوجد مشاريع مرتبطة بهذا العميل حالياً"
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-start p-3 font-medium">
                          اسم المشروع
                        </th>
                        <th className="text-start p-3 font-medium">الحالة</th>
                        <th className="text-start p-3 font-medium">
                          الموعد النهائي
                        </th>
                        <th className="text-start p-3 font-medium">
                          تاريخ الإنشاء
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {projects.map((project) => {
                        const statusInfo = STATUS_MAP[project.status];
                        return (
                          <tr
                            key={project.id}
                            className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                          >
                            <td className="p-3">
                              <Link
                                href={`/dashboard/projects/${project.id}`}
                                className="font-medium hover:text-orange-600 transition-colors inline-flex items-center gap-1"
                              >
                                {project.name}
                                <ExternalLink className="h-3 w-3 opacity-50" />
                              </Link>
                            </td>
                            <td className="p-3">
                              <Badge
                                variant="secondary"
                                className={cn(
                                  'text-xs',
                                  statusInfo?.color || ''
                                )}
                              >
                                {statusInfo?.label || project.status}
                              </Badge>
                            </td>
                            <td className="p-3 text-muted-foreground text-xs">
                              {project.deadline
                                ? formatDate(project.deadline)
                                : '\u2014'}
                            </td>
                            <td className="p-3 text-muted-foreground text-xs">
                              {formatDate(project.created_at)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ──── Invoices Tab ──────────────────────────────── */}
        <TabsContent value="invoices" className="mt-4">
          {invoicesLoading ? (
            <Card>
              <CardContent className="p-0">
                <div className="space-y-0">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 p-4 border-b last:border-b-0">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-5 w-24" />
                      <Skeleton className="h-5 w-20" />
                      <Skeleton className="h-5 w-24" />
                      <Skeleton className="h-5 w-24" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : invoices.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="لا توجد فواتير"
              description="لم يتم إنشاء فواتير لهذا العميل بعد"
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-start p-3 font-medium">
                          رقم الفاتورة
                        </th>
                        <th className="text-start p-3 font-medium">
                          المبلغ
                        </th>
                        <th className="text-start p-3 font-medium">الحالة</th>
                        <th className="text-start p-3 font-medium">
                          تاريخ الاستحقاق
                        </th>
                        <th className="text-start p-3 font-medium">
                          تاريخ الإنشاء
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((invoice) => {
                        const statusInfo = INVOICE_STATUS[invoice.status];
                        return (
                          <tr
                            key={invoice.id}
                            className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                          >
                            <td className="p-3">
                              <Link
                                href={`/dashboard/invoices/${invoice.id}`}
                                className="font-medium hover:text-orange-600 transition-colors inline-flex items-center gap-1"
                              >
                                <span dir="ltr">{invoice.invoice_number}</span>
                                <ExternalLink className="h-3 w-3 opacity-50" />
                              </Link>
                            </td>
                            <td className="p-3 font-medium">
                              {formatCurrency(
                                invoice.total,
                                invoice.currency || 'AED'
                              )}
                            </td>
                            <td className="p-3">
                              <Badge
                                variant="secondary"
                                className={cn(
                                  'text-xs',
                                  statusInfo?.color || '',
                                  invoice.status === 'cancelled' &&
                                    'line-through'
                                )}
                              >
                                {statusInfo?.label || invoice.status}
                              </Badge>
                            </td>
                            <td className="p-3 text-muted-foreground text-xs">
                              {invoice.due_date
                                ? formatDate(invoice.due_date)
                                : '\u2014'}
                            </td>
                            <td className="p-3 text-muted-foreground text-xs">
                              {formatDate(invoice.created_at)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ──── Quotes Tab ────────────────────────────────── */}
        <TabsContent value="quotes" className="mt-4">
          {quotesLoading ? (
            <Card>
              <CardContent className="p-0">
                <div className="space-y-0">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 p-4 border-b last:border-b-0">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-5 w-24" />
                      <Skeleton className="h-5 w-20" />
                      <Skeleton className="h-5 w-24" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : quotes.length === 0 ? (
            <EmptyState
              icon={Quote}
              title="لا توجد عروض أسعار"
              description="لم يتم إنشاء عروض أسعار لهذا العميل بعد"
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-start p-3 font-medium">
                          رقم العرض
                        </th>
                        <th className="text-start p-3 font-medium">
                          المبلغ
                        </th>
                        <th className="text-start p-3 font-medium">الحالة</th>
                        <th className="text-start p-3 font-medium">
                          تاريخ الإنشاء
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {quotes.map((quote) => {
                        const statusInfo = QUOTE_STATUS[quote.status];
                        return (
                          <tr
                            key={quote.id}
                            className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                          >
                            <td className="p-3">
                              <Link
                                href={`/dashboard/quotes/${quote.id}`}
                                className="font-medium hover:text-orange-600 transition-colors inline-flex items-center gap-1"
                              >
                                <span dir="ltr">{quote.quote_number}</span>
                                <ExternalLink className="h-3 w-3 opacity-50" />
                              </Link>
                            </td>
                            <td className="p-3 font-medium">
                              {formatCurrency(
                                quote.total,
                                quote.currency || 'AED'
                              )}
                            </td>
                            <td className="p-3">
                              <Badge
                                variant="secondary"
                                className={cn(
                                  'text-xs',
                                  statusInfo?.color || ''
                                )}
                              >
                                {statusInfo?.label || quote.status}
                              </Badge>
                            </td>
                            <td className="p-3 text-muted-foreground text-xs">
                              {formatDate(quote.created_at)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ──── Notes Tab ─────────────────────────────────── */}
        <TabsContent value="notes" className="mt-4">
          <ClientNotesTab clientId={client.id} />
        </TabsContent>

        {/* ──── Activity Tab ──────────────────────────────── */}
        <TabsContent value="activity" className="mt-4">
          {activityLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              ))}
            </div>
          ) : fullActivity.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="لا يوجد نشاط"
              description="لم يتم تسجيل أي نشاط لهذا العميل بعد"
            />
          ) : (
            <Card>
              <CardContent className="p-4">
                <div className="relative">
                  {/* Vertical timeline line */}
                  <div className="absolute top-2 bottom-2 end-[15px] w-0.5 bg-border" />

                  <div className="space-y-4">
                    {fullActivity.map((activity, index) => (
                      <div
                        key={activity.id}
                        className="relative flex gap-4"
                      >
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-muted shrink-0">
                              {getActivityIcon(activity.action_type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground">
                                {ACTIVITY_LABELS[activity.action_type] ||
                                  activity.action_type}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {activity.display_name} ·{' '}
                                {formatRelativeDate(activity.created_at)}
                              </p>
                              {/* Details preview */}
                              {activity.details &&
                                Object.keys(activity.details).length > 0 && (
                                  <div className="mt-1.5 text-xs text-muted-foreground bg-muted/50 rounded-md px-2 py-1.5 inline-block">
                                    {Array.isArray(
                                      activity.details.updated_fields
                                    ) && (
                                      <span>
                                        {'الحقول المحدثة: '}
                                        {(
                                          activity.details
                                            .updated_fields as string[]
                                        ).join('\u060C ')}
                                      </span>
                                    )}
                                    {typeof activity.details.client_name ===
                                      'string' && (
                                      <span>
                                        {activity.details.client_name}
                                      </span>
                                    )}
                                  </div>
                                )}
                            </div>
                          </div>
                        </div>

                        {/* Timeline dot */}
                        <div className="flex flex-col items-center pt-2.5 shrink-0">
                          <div className="h-3 w-3 rounded-full border-2 bg-background border-muted-foreground/40 z-10" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ──── Branding Tab ──────────────────────────────── */}
        <TabsContent value="branding" className="mt-4">
          <BrandingEditor clientId={client.id} />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────────
// Helper Component: Detail Row
// ──────────────────────────────────────────────────────────────

function DetailRow({
  icon,
  label,
  value,
  dir,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  dir?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="p-1.5 rounded-lg bg-muted text-muted-foreground shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium mt-0.5" dir={dir}>
          {value}
        </p>
      </div>
    </div>
  );
}
