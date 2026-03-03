'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormLabel } from '@/components/ui/form-label';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Building2, Plus, MoreHorizontal, Pencil, Trash2, Mail, Phone, Eye,
  LayoutGrid, Table2, ArrowUpDown, Receipt, Briefcase, MapPin,
} from 'lucide-react';
import { SearchInput } from '@/components/ui/search-input';
import { formatDate, formatCurrency } from '@/lib/utils/format';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { usePermission } from '@/hooks/usePermission';
import { ClientExportButton } from '@/components/clients/ClientExportButton';
import { TagFilterSelect } from '@/components/clients/TagFilterSelect';
import { motion } from 'framer-motion';

interface ClientTag {
  id: string;
  name: string;
  color: string;
}

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string;
  address: string | null;
  source: string | null;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  tags: ClientTag[];
  projects_count: number;
  invoices_total: number;
  invoices_paid: number;
}

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

const SOURCE_LABELS: Record<string, string> = {
  manual: 'يدوي',
  referral: 'إحالة',
  website: 'موقع إلكتروني',
  social: 'تواصل اجتماعي',
};

interface FormState {
  name: string;
  email: string;
  phone: string;
  company: string;
  password: string;
  is_active: boolean;
  address: string;
  source: string;
}

const EMPTY_FORM: FormState = {
  name: '', email: '', phone: '', company: '', password: '',
  is_active: true, address: '', source: 'manual',
};

export default function ClientsClient() {
  const canCreate = usePermission('clients.create');
  const canEdit = usePermission('clients.edit');
  const canDelete = usePermission('clients.delete');

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [sortField, setSortField] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [selected, setSelected] = useState<Client | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // Debounce search input (350ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (tagFilter) params.set('tag', tagFilter);
      if (sortField) params.set('sort', sortField);
      if (sortOrder) params.set('order', sortOrder);
      const res = await fetch(`/api/clients?${params}`);
      const json = await res.json();
      if (json.data) setClients(json.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, tagFilter, sortField, sortOrder]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone || null,
          company: form.company,
          password: form.password,
          address: form.address || null,
          source: form.source || 'manual',
        }),
      });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      setShowCreate(false);
      setForm(EMPTY_FORM);
      toast.success('تم إنشاء العميل بنجاح');
      fetchClients();
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone || null,
          company: form.company,
          is_active: form.is_active,
          address: form.address || null,
          source: form.source || 'manual',
        }),
      });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      setShowEdit(false);
      toast.success('تم تحديث العميل');
      fetchClients();
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${selected.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      setShowDelete(false);
      toast.success('تم حذف العميل');
      fetchClients();
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (c: Client) => {
    setSelected(c);
    setForm({
      name: c.name,
      email: c.email,
      phone: c.phone || '',
      company: c.company,
      password: '',
      is_active: c.is_active,
      address: c.address || '',
      source: c.source || 'manual',
    });
    setShowEdit(true);
  };

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // ── Activity indicator ─────────────────────────────
  const getActivityIndicator = (lastLogin: string | null) => {
    if (!lastLogin) return 'bg-gray-300 dark:bg-gray-600';
    const diff = Date.now() - new Date(lastLogin).getTime();
    const days = diff / (1000 * 60 * 60 * 24);
    if (days <= 7) return 'bg-green-500';
    if (days <= 30) return 'bg-yellow-500';
    return 'bg-gray-300 dark:bg-gray-600';
  };

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-300">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" /> العملاء
          </h1>
          <p className="text-muted-foreground">إدارة حسابات العملاء وعلاقاتهم</p>
        </div>
        <div className="flex items-center gap-2">
          <ClientExportButton
            search={debouncedSearch}
            active=""
            tag={tagFilter}
          />
          {canCreate && (
            <Button
              onClick={() => { setForm(EMPTY_FORM); setShowCreate(true); }}
              className="bg-orange-500 hover:bg-orange-600"
            >
              <Plus className="h-4 w-4 me-2" /> إضافة عميل
            </Button>
          )}
        </div>
      </div>

      {/* ── Toolbar ────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="بحث عن عميل..."
          className="max-w-xs"
        />
        <TagFilterSelect value={tagFilter} onChange={setTagFilter} />
        <Select value={sortField} onValueChange={setSortField}>
          <SelectTrigger className="w-[160px]">
            <ArrowUpDown className="h-3.5 w-3.5 me-1.5 opacity-50" />
            <SelectValue placeholder="ترتيب حسب" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="created_at">تاريخ الإنشاء</SelectItem>
            <SelectItem value="name">الاسم</SelectItem>
            <SelectItem value="company">الشركة</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center border rounded-lg overflow-hidden ms-auto">
          <Button
            variant="ghost"
            size="sm"
            className={cn('rounded-none h-9 px-3', viewMode === 'table' && 'bg-muted')}
            onClick={() => setViewMode('table')}
          >
            <Table2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn('rounded-none h-9 px-3', viewMode === 'cards' && 'bg-muted')}
            onClick={() => setViewMode('cards')}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Content: Table or Cards ────────────────────── */}
      {viewMode === 'table' ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-start p-3 font-medium">العميل</th>
                    <th className="text-start p-3 font-medium">الشركة</th>
                    <th className="text-start p-3 font-medium">التصنيفات</th>
                    <th
                      className="text-start p-3 font-medium cursor-pointer hover:text-foreground transition-colors"
                      onClick={() => toggleSort('name')}
                    >
                      <span className="flex items-center gap-1">
                        المشاريع <ArrowUpDown className="h-3 w-3 opacity-40" />
                      </span>
                    </th>
                    <th className="text-start p-3 font-medium">الفواتير</th>
                    <th className="text-start p-3 font-medium">الحالة</th>
                    <th className="text-start p-3 font-medium w-[60px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b">
                        {Array.from({ length: 7 }).map((_, j) => (
                          <td key={j} className="p-3"><Skeleton className="h-5 w-24" /></td>
                        ))}
                      </tr>
                    ))
                  ) : clients.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <EmptyState
                          icon={Building2}
                          title="لا يوجد عملاء"
                          description="أضف عميل جديد للبدء في إدارة الحسابات"
                        />
                      </td>
                    </tr>
                  ) : (
                    clients.map((c) => (
                      <tr key={c.id} className="border-b hover:bg-muted/30 transition-colors group">
                        <td className="p-3">
                          <Link href={`/dashboard/clients/${c.id}`} className="flex items-center gap-2.5 hover:text-orange-600 transition-colors">
                            <div className="relative">
                              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-xs font-bold text-white">
                                {c.name.slice(0, 2)}
                              </div>
                              <div className={cn(
                                'absolute -bottom-0.5 -end-0.5 h-3 w-3 rounded-full border-2 border-background',
                                getActivityIndicator(c.last_login_at),
                              )} />
                            </div>
                            <div>
                              <span className="font-medium block">{c.name}</span>
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Mail className="h-3 w-3" /> {c.email}
                              </span>
                            </div>
                          </Link>
                        </td>
                        <td className="p-3">
                          <span className="text-muted-foreground">{c.company}</span>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {c.tags?.slice(0, 3).map((tag) => (
                              <span
                                key={tag.id}
                                className={cn(
                                  'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium',
                                  TAG_COLOR_MAP[tag.color] || TAG_COLOR_MAP.gray,
                                )}
                              >
                                {tag.name}
                              </span>
                            ))}
                            {(c.tags?.length || 0) > 3 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{c.tags.length - 3}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Briefcase className="h-3.5 w-3.5" />
                            <span>{c.projects_count}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          {c.invoices_total > 0 ? (
                            <div className="text-xs">
                              <div className="font-medium">{formatCurrency(c.invoices_total)}</div>
                              {c.invoices_total - c.invoices_paid > 0 && (
                                <div className="text-red-500 dark:text-red-400">
                                  معلق: {formatCurrency(c.invoices_total - c.invoices_paid)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3">
                          <Badge variant={c.is_active ? 'default' : 'secondary'}>
                            {c.is_active ? 'نشط' : 'معطل'}
                          </Badge>
                        </td>
                        {(canEdit || canDelete) && (
                          <td className="p-3">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                  <Link href={`/dashboard/clients/${c.id}`}>
                                    <Eye className="h-4 w-4 me-2" /> عرض التفاصيل
                                  </Link>
                                </DropdownMenuItem>
                                {canEdit && (
                                  <DropdownMenuItem onClick={() => openEdit(c)}>
                                    <Pencil className="h-4 w-4 me-2" /> تعديل
                                  </DropdownMenuItem>
                                )}
                                {canDelete && (
                                  <DropdownMenuItem
                                    onClick={() => { setSelected(c); setShowDelete(true); }}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4 me-2" /> حذف
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* ── Card View ───────────────────────────────── */
        <div>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <Skeleton className="h-12 w-12 rounded-full" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                    <Skeleton className="h-3 w-full mb-2" />
                    <Skeleton className="h-3 w-2/3" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : clients.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="لا يوجد عملاء"
              description="أضف عميل جديد للبدء في إدارة الحسابات"
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {clients.map((c, idx) => (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: idx * 0.03 }}
                >
                  <Link href={`/dashboard/clients/${c.id}`}>
                    <Card className="hover:shadow-md transition-all duration-200 hover:border-orange-300 dark:hover:border-orange-700 cursor-pointer group">
                      <CardContent className="p-5">
                        {/* Header */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-sm font-bold text-white">
                                {c.name.slice(0, 2)}
                              </div>
                              <div className={cn(
                                'absolute -bottom-0.5 -end-0.5 h-3 w-3 rounded-full border-2 border-background',
                                getActivityIndicator(c.last_login_at),
                              )} />
                            </div>
                            <div>
                              <p className="font-semibold group-hover:text-orange-600 transition-colors">
                                {c.name}
                              </p>
                              <p className="text-xs text-muted-foreground">{c.company}</p>
                            </div>
                          </div>
                          <Badge variant={c.is_active ? 'default' : 'secondary'} className="text-[10px]">
                            {c.is_active ? 'نشط' : 'معطل'}
                          </Badge>
                        </div>

                        {/* Tags */}
                        {c.tags && c.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {c.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag.id}
                                className={cn(
                                  'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium',
                                  TAG_COLOR_MAP[tag.color] || TAG_COLOR_MAP.gray,
                                )}
                              >
                                {tag.name}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Stats */}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-3 border-t">
                          <div className="flex items-center gap-1">
                            <Briefcase className="h-3.5 w-3.5" />
                            <span>{c.projects_count} مشاريع</span>
                          </div>
                          {c.invoices_total > 0 && (
                            <div className="flex items-center gap-1">
                              <Receipt className="h-3.5 w-3.5" />
                              <span>{formatCurrency(c.invoices_total)}</span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Create Dialog ──────────────────────────────── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>إضافة عميل جديد</DialogTitle>
          </DialogHeader>
          <div className="grid gap-5 py-4">
            {/* Basic Info */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-3">معلومات أساسية</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <FormLabel required>الاسم</FormLabel>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <FormLabel required>الشركة</FormLabel>
                  <Input
                    value={form.company}
                    onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Contact Info */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-3">معلومات التواصل</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <FormLabel required>البريد الإلكتروني</FormLabel>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <FormLabel>الهاتف</FormLabel>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                    dir="ltr"
                  />
                </div>
              </div>
            </div>

            {/* Additional Details */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-3">تفاصيل إضافية</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <FormLabel>المصدر</FormLabel>
                  <Select
                    value={form.source}
                    onValueChange={(v) => setForm((p) => ({ ...p, source: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">يدوي</SelectItem>
                      <SelectItem value="referral">إحالة</SelectItem>
                      <SelectItem value="website">موقع إلكتروني</SelectItem>
                      <SelectItem value="social">تواصل اجتماعي</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <FormLabel required>كلمة المرور</FormLabel>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                    dir="ltr"
                    placeholder="لبوابة العميل"
                  />
                </div>
              </div>
              <div className="space-y-2 mt-4">
                <FormLabel>العنوان</FormLabel>
                <Textarea
                  value={form.address}
                  onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                  rows={2}
                  placeholder="العنوان الكامل (اختياري)"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>إلغاء</Button>
            <Button
              onClick={handleCreate}
              disabled={saving}
              className="bg-orange-500 hover:bg-orange-600"
            >
              {saving ? 'جارٍ الحفظ...' : 'إنشاء'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ────────────────────────────────── */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>تعديل العميل — {selected?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-5 py-4">
            {/* Basic Info */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-3">معلومات أساسية</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <FormLabel required>الاسم</FormLabel>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <FormLabel required>الشركة</FormLabel>
                  <Input
                    value={form.company}
                    onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Contact Info */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-3">معلومات التواصل</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <FormLabel required>البريد</FormLabel>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <FormLabel>الهاتف</FormLabel>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                    dir="ltr"
                  />
                </div>
              </div>
            </div>

            {/* Additional Details */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-3">تفاصيل إضافية</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <FormLabel>المصدر</FormLabel>
                  <Select
                    value={form.source}
                    onValueChange={(v) => setForm((p) => ({ ...p, source: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">يدوي</SelectItem>
                      <SelectItem value="referral">إحالة</SelectItem>
                      <SelectItem value="website">موقع إلكتروني</SelectItem>
                      <SelectItem value="social">تواصل اجتماعي</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end pb-1">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={form.is_active}
                      onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: v }))}
                    />
                    <Label>حساب نشط</Label>
                  </div>
                </div>
              </div>
              <div className="space-y-2 mt-4">
                <FormLabel>العنوان</FormLabel>
                <Textarea
                  value={form.address}
                  onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                  rows={2}
                  placeholder="العنوان الكامل (اختياري)"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>إلغاء</Button>
            <Button onClick={handleEdit} disabled={saving}>
              {saving ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Dialog ──────────────────────────────── */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>حذف العميل</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-4">
            هل أنت متأكد من حذف العميل <strong>{selected?.name}</strong>؟
            سيتم التحقق من وجود سجلات مرتبطة.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? 'جارٍ الحذف...' : 'حذف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
