'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils/cn';
import {
  Megaphone, Plus, Trash2, Send, Loader2,
  Users, CheckCircle2, Clock, Ban, PhoneOff, AlertTriangle,
  MessageSquareReply, Radio, PauseCircle, CalendarClock, CircleSlash,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useCampaigns,
  useCreateCampaign,
  useDeleteCampaign,
  useSendCampaign,
  useWhatsAppLines,
  useSetCampaignAutoResume,
  type CampaignProgress,
} from '@/hooks/useWhatsApp';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: 'مسودة', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  sending: { label: 'جاري الإرسال', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  completed: { label: 'مكتمل', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  // A run stops on purpose when the daily cap is reached or the line's window
  // closes. Without this entry the badge rendered blank and the campaign
  // looked broken rather than simply waiting for tomorrow.
  paused: { label: 'متوقفة مؤقتاً', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
};

/** Dubai minutes-from-midnight → "14:30". */
function hhmm(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

/**
 * Every contact lands in exactly one of these. Showing only `sent` made a run
 * where everyone was suppressed look identical to one that never started.
 */
function ProgressBreakdown({ p }: { p: CampaignProgress }) {
  const cells = [
    { icon: CheckCircle2, label: 'أُرسلت', value: p.sent, tone: 'text-emerald-600 dark:text-emerald-400' },
    { icon: MessageSquareReply, label: 'ردّوا', value: p.replied, tone: 'text-sky-600 dark:text-sky-400' },
    { icon: Clock, label: 'في الانتظار', value: p.pending, tone: 'text-muted-foreground' },
    { icon: Ban, label: 'مستبعدون', value: p.skipped, tone: 'text-amber-600 dark:text-amber-400' },
    { icon: PhoneOff, label: 'بلا واتساب', value: p.invalid, tone: 'text-muted-foreground' },
    { icon: AlertTriangle, label: 'فشلت', value: p.failed, tone: 'text-destructive' },
  ].filter((c) => c.value > 0 || c.label === 'أُرسلت' || c.label === 'في الانتظار');

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
      {cells.map((c) => (
        <span key={c.label} className={cn('flex items-center gap-1', c.tone)}>
          <c.icon className="h-3.5 w-3.5" />
          <span className="font-mono font-semibold">{c.value}</span>
          <span className="text-muted-foreground/70">{c.label}</span>
        </span>
      ))}
    </div>
  );
}

export default function WhatsAppCampaignsPage() {
  const { data: campaigns = [], isLoading } = useCampaigns();
  const { data: lines = [] } = useWhatsAppLines();
  // The notification line is never offered: a broadcast ban on it silences
  // every internal notification in the system.
  const sendableLines = lines.filter((l) => !l.is_notification_line && l.status === 'connected');
  const createMutation = useCreateCampaign();
  const deleteMutation = useDeleteCampaign();
  const sendMutation = useSendCampaign();
  const autoResumeMutation = useSetCampaignAutoResume();

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [messageTemplate, setMessageTemplate] = useState('');
  const [contactsRaw, setContactsRaw] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [dailyCap, setDailyCap] = useState('40');

  function parseContacts(raw: string): { phone: string; name?: string }[] {
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(',').map((p) => p.trim());
        return { phone: parts[0], name: parts[1] };
      });
  }

  function handleCreate() {
    const contacts = parseContacts(contactsRaw);
    if (!name.trim() || !messageTemplate.trim() || contacts.length === 0) {
      toast.error('يرجى ملء جميع الحقول');
      return;
    }
    if (!instanceName) {
      toast.error('اختر خط الإرسال — لا يوجد خط افتراضي');
      return;
    }
    const cap = Number(dailyCap);
    if (!Number.isFinite(cap) || cap < 1 || cap > 120) {
      toast.error('الحد اليومي يجب أن يكون بين 1 و 120');
      return;
    }
    createMutation.mutate(
      {
        name,
        message_template: messageTemplate,
        contacts,
        instance_name: instanceName,
        daily_cap: Math.floor(cap),
      },
      {
        onSuccess: () => {
          toast.success('تم إنشاء الحملة');
          setShowCreate(false);
          setName('');
          setMessageTemplate('');
          setContactsRaw('');
          setInstanceName('');
        },
        // The API refuses an unusable line by name — surface its reason
        // instead of a generic failure the operator cannot act on.
        onError: (err: unknown) =>
          toast.error(err instanceof Error ? err.message : 'فشل إنشاء الحملة'),
      },
    );
  }

  function handleSend(id: string) {
    sendMutation.mutate(id, {
      onSuccess: () => toast.success('بدأ إرسال الحملة'),
      // Outside the window, over the cap, wrong line — each is a distinct,
      // actionable reason the route already names.
      onError: (err: unknown) =>
        toast.error(err instanceof Error ? err.message : 'فشل إرسال الحملة'),
    });
  }

  function handleAutoResume(id: string, auto_resume: boolean) {
    autoResumeMutation.mutate(
      { id, auto_resume },
      {
        onSuccess: () =>
          toast.success(
            auto_resume
              ? 'الحملة على الجدول التلقائي — ستكمل يومياً داخل نافذة الخط'
              : 'أُوقفت المتابعة التلقائية. الرسائل المتبقية تبقى في الانتظار.',
          ),
        onError: (err: unknown) =>
          toast.error(err instanceof Error ? err.message : 'تعذّر تعديل الجدولة'),
      },
    );
  }

  function handleDelete(id: string) {
    deleteMutation.mutate(id, {
      onSuccess: () => toast.success('تم حذف الحملة'),
      onError: () => toast.error('فشل حذف الحملة'),
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-56" />
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-6 p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Megaphone className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">حملات الرسائل</h1>
            <p className="text-xs text-muted-foreground/60">إرسال رسائل جماعية عبر واتساب</p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)} className="rounded-xl gap-2">
          <Plus className="h-4 w-4" />
          إنشاء حملة
        </Button>
      </div>

      {/* Campaign List */}
      {campaigns.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="لا توجد حملات"
          description="أنشئ حملة رسائل جديدة لإرسال رسائل جماعية"
        />
      ) : (
        <div className="grid gap-4">
          {campaigns.map((campaign) => {
            const statusInfo = STATUS_MAP[campaign.status] || STATUS_MAP.draft;
            // Settled = everything that will never be sent again, so the bar
            // reaches 100% on a run that legitimately skipped most contacts.
            const settled =
              campaign.progress.sent + campaign.progress.skipped +
              campaign.progress.invalid + campaign.progress.failed;
            const progress = campaign.progress.total > 0
              ? Math.round((settled / campaign.progress.total) * 100)
              : 0;

            return (
              <Card key={campaign.id} className="rounded-2xl">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      {campaign.name}
                      <Badge className={cn('text-[10px]', statusInfo.color)}>
                        {statusInfo.label}
                      </Badge>
                      {campaign.auto_resume && (
                        <Badge className="text-[10px] bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 gap-1">
                          <CalendarClock className="h-3 w-3" />
                          تلقائي يومياً
                        </Badge>
                      )}
                    </CardTitle>
                    <div className="flex items-center gap-1.5">
                      {(campaign.status === 'draft' || campaign.status === 'paused') && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-lg h-8 gap-1.5 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:border-emerald-800 dark:hover:bg-emerald-950/20"
                            onClick={() => handleSend(campaign.id)}
                            disabled={sendMutation.isPending}
                          >
                            {sendMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                            إرسال
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-lg h-8 text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(campaign.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {campaign.auto_resume && campaign.status !== 'completed' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="rounded-lg h-8 gap-1.5 text-xs text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                          onClick={() => handleAutoResume(campaign.id, false)}
                          disabled={autoResumeMutation.isPending}
                        >
                          <CircleSlash className="h-3.5 w-3.5" />
                          إيقاف الجدولة
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {campaign.progress.total} جهة اتصال
                    </span>
                    <span className="flex items-center gap-1">
                      <Radio className="h-3.5 w-3.5" />
                      {campaign.instance_name ?? '— بلا خط —'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {campaign.daily_cap}/يوم
                      {campaign.send_window
                        ? ` · ${hhmm(campaign.send_window.startMinute)}–${hhmm(campaign.send_window.endMinute)}`
                        : ''}
                    </span>
                  </div>

                  <ProgressBreakdown p={campaign.progress} />

                  {(campaign.status === 'sending' || campaign.status === 'paused') && (
                    <div>
                      <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-500',
                            campaign.status === 'sending'
                              ? 'bg-gradient-to-l from-emerald-500 to-teal-500'
                              : 'bg-amber-500/70',
                          )}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground/60 mt-1">
                        {progress}%
                        {campaign.progress.last_sent_at
                          ? ` · آخر رسالة ${new Date(campaign.progress.last_sent_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`
                          : ''}
                      </p>
                    </div>
                  )}

                  {campaign.status === 'paused' && (
                    <p className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                      <PauseCircle className="h-3.5 w-3.5 shrink-0 mt-px" />
                      {campaign.auto_resume
                        ? 'بلغت حدها اليومي أو انتهت نافذة الخط. ستكمل تلقائياً في النافذة القادمة — لا حاجة لأي إجراء.'
                        : 'توقفت بعد بلوغ الحد اليومي أو انتهاء نافذة الخط. اضغط «إرسال» مرة أخرى داخل النافذة لتكمل من حيث توقفت — لا شيء يُعاد إرساله.'}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Campaign Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-orange-500" />
              إنشاء حملة جديدة
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>خط الإرسال</Label>
              {sendableLines.length === 0 ? (
                <p className="text-xs text-destructive">
                  لا يوجد خط صالح للإرسال. الخط يحتاج أن يكون متصلاً وله مفتاح API،
                  وخط الإشعارات مستثنى دائماً.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {sendableLines.map((line) => (
                    <button
                      key={line.id}
                      type="button"
                      onClick={() => setInstanceName(line.instance_name)}
                      className={cn(
                        'rounded-xl border p-3 text-start transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500',
                        instanceName === line.instance_name
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/30'
                          : 'border-border hover:bg-muted/50',
                      )}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        <Radio className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        {line.instance_name}
                      </span>
                      <span className="block text-[11px] text-muted-foreground/70 font-mono" dir="ltr">
                        {line.phone_number ?? '—'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground/50">
                كل حملة تخرج من خط واحد محدد. لا يوجد خط افتراضي، وخط الإشعارات
                لا يظهر هنا إطلاقاً.
              </p>
            </div>

            <div className="space-y-2">
              <Label>الحد اليومي للرسائل</Label>
              <Input
                type="number"
                min={1}
                max={120}
                value={dailyCap}
                onChange={(e) => setDailyCap(e.target.value)}
                dir="ltr"
                className="w-32"
              />
              <p className="text-[10px] text-muted-foreground/50">
                يُحسب على الخط كله وليس على الحملة وحدها. ابدأ منخفضاً على أي خط
                جديد وارفعه تدريجياً — القفزة المفاجئة هي ما يُحظر عليه.
              </p>
            </div>

            <div className="space-y-2">
              <Label>اسم الحملة</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: عرض رمضان 2026"
              />
            </div>
            <div className="space-y-2">
              <Label>نص الرسالة</Label>
              <Textarea
                value={messageTemplate}
                onChange={(e) => setMessageTemplate(e.target.value)}
                placeholder={'مرحباً {{name}}!\nلدينا عرض خاص لك...'}
                rows={4}
              />
              <p className="text-[10px] text-muted-foreground/50">
                {'استخدم {{name}} و {{company}} لإدراج البيانات تلقائياً. لا تضع رابطاً في أول رسالة — الرابط في تواصل أول مع رقم غريب هو أعلى سبب منفرد للحظر.'}
              </p>
            </div>
            <div className="space-y-2">
              <Label>جهات الاتصال (رقم في كل سطر)</Label>
              <Textarea
                value={contactsRaw}
                onChange={(e) => setContactsRaw(e.target.value)}
                placeholder={'971501234567, أحمد\n971509876543, فاطمة'}
                rows={4}
                dir="ltr"
              />
              <p className="text-[10px] text-muted-foreground/50">
                الصيغة: رقم الهاتف, الاسم (اختياري) — كل سطر جهة اتصال واحدة
              </p>
            </div>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="w-full rounded-xl"
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : null}
              إنشاء الحملة
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
