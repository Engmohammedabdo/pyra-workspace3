'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Monitor, Wifi, WifiOff, Trash2, AlertTriangle } from 'lucide-react';
import { formatRelativeDate } from '@/lib/utils/format';
import { toast } from 'sonner';

interface Session {
  id: string;
  username: string;
  ip_address: string;
  user_agent: string;
  last_activity: string;
  created_at: string;
}

function parseUserAgent(ua: string): string {
  if (!ua) return 'غير معروف';
  if (ua.includes('Edg')) return 'Edge';  // Edge Chromium uses "Edg/"
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari')) return 'Safari';
  return ua.substring(0, 30) + '...';
}

function isActive(lastActivity: string): boolean {
  const diff = Date.now() - new Date(lastActivity).getTime();
  return diff < 30 * 60 * 1000; // Active if within last 30 min
}

export default function SessionsClient() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTerminateAll, setShowTerminateAll] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sessions');
      const json = await res.json();
      if (json.data) setSessions(json.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const terminateSession = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      toast.success('تم إنهاء الجلسة');
      fetchSessions();
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ');
    } finally {
      setSaving(false);
    }
  };

  const terminateAll = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/sessions', { method: 'DELETE' });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      setShowTerminateAll(false);
      toast.success('تم إنهاء جميع الجلسات');
      fetchSessions();
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ');
    } finally {
      setSaving(false);
    }
  };

  const activeSessions = sessions.filter(s => isActive(s.last_activity));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Monitor className="h-6 w-6" /> إدارة الجلسات
          </h1>
          <p className="text-muted-foreground">الجلسات النشطة للعملاء على البورتال</p>
        </div>
        {sessions.length > 0 && (
          <Button variant="destructive" size="sm" onClick={() => setShowTerminateAll(true)} disabled={saving}>
            <Trash2 className="h-4 w-4 me-1" /> إنهاء الكل
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Wifi className="h-8 w-8 text-green-500" />
            <div>
              <div className="text-2xl font-bold text-green-600">{activeSessions.length}</div>
              <div className="text-xs text-muted-foreground">جلسات نشطة</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <WifiOff className="h-8 w-8 text-muted-foreground" />
            <div>
              <div className="text-2xl font-bold">{sessions.length - activeSessions.length}</div>
              <div className="text-xs text-muted-foreground">جلسات غير نشطة</div>
            </div>
          </CardContent>
        </Card>
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
                  <th className="text-start p-3 font-medium">المتصفح</th>
                  <th className="text-start p-3 font-medium">الحالة</th>
                  <th className="text-start p-3 font-medium">آخر نشاط</th>
                  <th className="text-start p-3 font-medium">بدأت في</th>
                  <th className="text-start p-3 font-medium w-[80px]"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="p-3"><Skeleton className="h-5 w-20" /></td>
                    ))}
                  </tr>
                )) : sessions.length === 0 ? (
                  <tr><td colSpan={7} className="p-12 text-center text-muted-foreground">لا توجد جلسات نشطة</td></tr>
                ) : sessions.map(session => (
                  <tr key={session.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-medium">{session.username}</td>
                    <td className="p-3 text-muted-foreground font-mono text-xs">{session.ip_address || '—'}</td>
                    <td className="p-3 text-muted-foreground text-xs">{parseUserAgent(session.user_agent)}</td>
                    <td className="p-3">
                      {isActive(session.last_activity) ? (
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400">
                          <Wifi className="h-3 w-3 me-1" /> نشط
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <WifiOff className="h-3 w-3 me-1" /> غير نشط
                        </Badge>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">{formatRelativeDate(session.last_activity)}</td>
                    <td className="p-3 text-muted-foreground text-xs">{formatRelativeDate(session.created_at)}</td>
                    <td className="p-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => terminateSession(session.id)}
                        disabled={saving}
                        title="إنهاء الجلسة"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Terminate All Dialog */}
      <Dialog open={showTerminateAll} onOpenChange={setShowTerminateAll}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" /> إنهاء جميع الجلسات
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-4">
            هل أنت متأكد من إنهاء <strong>جميع الجلسات ({sessions.length})</strong>؟<br />
            سيتم تسجيل خروج جميع العملاء المتصلين.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTerminateAll(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={terminateAll} disabled={saving}>
              {saving ? 'جارٍ الإنهاء...' : 'إنهاء الكل'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
