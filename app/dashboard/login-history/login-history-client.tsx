'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shield, CheckCircle, XCircle, Monitor, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatRelativeDate } from '@/lib/utils/format';

interface LoginAttempt {
  id: number;
  username: string;
  ip_address: string;
  success: boolean;
  attempted_at: string;
}

export default function LoginHistoryClient() {
  const [attempts, setAttempts] = useState<LoginAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterUser, setFilterUser] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 50;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterUser.trim()) params.set('username', filterUser.trim());
      if (filterStatus !== 'all') params.set('success', filterStatus);
      params.set('page', String(page));
      params.set('limit', String(pageSize));

      const res = await fetch(`/api/login-history?${params}`);
      const json = await res.json();
      if (json.data) setAttempts(json.data);
      if (json.meta?.total !== undefined) setTotal(json.meta.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filterUser, filterStatus, page]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const handleUserFilterChange = (value: string) => {
    setFilterUser(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
    }, 400);
  };

  const totalPages = Math.ceil(total / pageSize);
  const successCount = attempts.filter(a => a.success).length;
  const failedCount = attempts.filter(a => !a.success).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6" /> سجل الدخول
        </h1>
        <p className="text-muted-foreground">محاولات تسجيل الدخول للنظام</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Monitor className="h-8 w-8 text-muted-foreground" />
            <div>
              <div className="text-2xl font-bold">{total}</div>
              <div className="text-xs text-muted-foreground">إجمالي المحاولات</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle className="h-8 w-8 text-green-500" />
            <div>
              <div className="text-2xl font-bold text-green-600">{successCount}</div>
              <div className="text-xs text-muted-foreground">ناجح (هذه الصفحة)</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <XCircle className="h-8 w-8 text-red-500" />
            <div>
              <div className="text-2xl font-bold text-red-600">{failedCount}</div>
              <div className="text-xs text-muted-foreground">فاشل (هذه الصفحة)</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="بحث باسم المستخدم..."
          value={filterUser}
          onChange={(e) => handleUserFilterChange(e.target.value)}
          className="max-w-xs"
        />
        <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="true">ناجح فقط</SelectItem>
            <SelectItem value="false">فاشل فقط</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{total} نتيجة</span>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-start p-3 font-medium">المستخدم</th>
                  <th className="text-start p-3 font-medium">عنوان IP</th>
                  <th className="text-start p-3 font-medium">الحالة</th>
                  <th className="text-start p-3 font-medium">التوقيت</th>
                </tr>
              </thead>
              <tbody>
                {loading ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    {Array.from({ length: 4 }).map((_, j) => (
                      <td key={j} className="p-3"><Skeleton className="h-5 w-24" /></td>
                    ))}
                  </tr>
                )) : attempts.length === 0 ? (
                  <tr><td colSpan={4} className="p-12 text-center text-muted-foreground">لا توجد محاولات دخول</td></tr>
                ) : attempts.map(attempt => (
                  <tr key={attempt.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-medium">{attempt.username}</td>
                    <td className="p-3 text-muted-foreground font-mono text-xs">{attempt.ip_address || '—'}</td>
                    <td className="p-3">
                      {attempt.success ? (
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400">
                          <CheckCircle className="h-3 w-3 me-1" /> ناجح
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400">
                          <XCircle className="h-3 w-3 me-1" /> فاشل
                        </Badge>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">{formatRelativeDate(attempt.attempted_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">صفحة {page} من {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
