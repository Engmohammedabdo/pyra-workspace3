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
  Users, CheckCircle2, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useCampaigns,
  useCreateCampaign,
  useDeleteCampaign,
  useSendCampaign,
} from '@/hooks/useWhatsApp';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: 'مسودة', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  sending: { label: 'جاري الإرسال', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  completed: { label: 'مكتمل', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
};

export default function WhatsAppCampaignsPage() {
  const { data: campaigns = [], isLoading } = useCampaigns();
  const createMutation = useCreateCampaign();
  const deleteMutation = useDeleteCampaign();
  const sendMutation = useSendCampaign();

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [messageTemplate, setMessageTemplate] = useState('');
  const [contactsRaw, setContactsRaw] = useState('');

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
    createMutation.mutate(
      { name, message_template: messageTemplate, contacts },
      {
        onSuccess: () => {
          toast.success('تم إنشاء الحملة');
          setShowCreate(false);
          setName('');
          setMessageTemplate('');
          setContactsRaw('');
        },
        onError: () => toast.error('فشل إنشاء الحملة'),
      },
    );
  }

  function handleSend(id: string) {
    sendMutation.mutate(id, {
      onSuccess: () => toast.success('بدأ إرسال الحملة'),
      onError: () => toast.error('فشل إرسال الحملة'),
    });
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
            <h1 className="text-xl font-bold tracking-tight">حملات الرسائل</h1>
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
            const progress = campaign.total_contacts > 0
              ? Math.round((campaign.sent_count / campaign.total_contacts) * 100)
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
                    </CardTitle>
                    <div className="flex items-center gap-1.5">
                      {campaign.status === 'draft' && (
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
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {campaign.total_contacts} جهة اتصال
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {campaign.sent_count} مرسلة
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {new Date(campaign.created_at).toLocaleDateString('ar-EG')}
                    </span>
                  </div>
                  {campaign.status === 'sending' && (
                    <div className="mt-3">
                      <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-teal-500 transition-all duration-500"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground/50 mt-1">{progress}%</p>
                    </div>
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
                {'استخدم {{name}} لإدراج اسم جهة الاتصال تلقائياً'}
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
