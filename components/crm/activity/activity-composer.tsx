'use client';

/**
 * Inline composer for adding manual activity to a lead.
 *
 * Type tabs:
 *   note               — textarea + pin toggle
 *   call_logged        — textarea + duration + direction (inbound/outbound)
 *   meeting_scheduled  — textarea + date + location
 *   email_sent         — subject + body
 *
 * Submit → POST /api/crm/leads/[id]/activities. The mutation hook
 * (useCreateLeadActivity) invalidates the activity timeline + the lead
 * detail query so the new entry appears immediately.
 *
 * `mode`:
 *   undefined → render all 4 type tabs
 *   'note'    → render note-only composer (used in the Notes tab)
 *
 * `defaultExpanded`:
 *   true  → show the composer fully open
 *   false → show a compact "Add note..."-style trigger row that expands on click
 */

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MentionTextarea } from '@/components/ui/mention-textarea';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils/cn';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { StickyNote, Phone, CalendarClock, Mail, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateLeadActivity } from '@/hooks/useLeadActivities';

type ActivityKind = 'note' | 'call_logged' | 'meeting_scheduled' | 'email_sent';

interface ActivityComposerProps {
  leadId: string;
  /** Lock to a single type (e.g. on the Notes tab). */
  mode?: ActivityKind;
  /** When true, the composer renders fully expanded; otherwise it shows a compact trigger that expands on focus. */
  defaultExpanded?: boolean;
  /** Called after a successful submit (e.g. for "scroll to top of timeline"). */
  onSubmitted?: () => void;
}

// Icons only — labels/placeholders resolved in-component via t() from
// `crm.activity.composer.kinds.*` (Phase 3.4 restructure, module maps can't
// call hooks).
const KIND_ICONS: Record<ActivityKind, React.ComponentType<{ className?: string }>> = {
  note: StickyNote,
  call_logged: Phone,
  meeting_scheduled: CalendarClock,
  email_sent: Mail,
};

export function ActivityComposer({
  leadId,
  mode,
  defaultExpanded = true,
  onSubmitted,
}: ActivityComposerProps) {
  const t = useTranslations('crm.activity.composer');
  const tCommon = useTranslations('common.actions');
  const formId = useId();
  const create = useCreateLeadActivity();

  const [expanded, setExpanded] = useState(defaultExpanded);
  const [kind, setKind] = useState<ActivityKind>(mode ?? 'note');
  const [content, setContent] = useState('');
  const [pinned, setPinned] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState('');
  const [callDirection, setCallDirection] = useState<'inbound' | 'outbound'>('outbound');
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingLocation, setMeetingLocation] = useState('');
  const [emailSubject, setEmailSubject] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (expanded && textareaRef.current) textareaRef.current.focus();
  }, [expanded, kind]);

  // Reset shared state when the kind changes mid-compose (so old fields don't bleed).
  function changeKind(k: ActivityKind) {
    setKind(k);
    setPinned(false);
    setDurationMinutes('');
    setCallDirection('outbound');
    setMeetingDate('');
    setMeetingLocation('');
    setEmailSubject('');
  }

  function reset() {
    setContent('');
    setPinned(false);
    setDurationMinutes('');
    setCallDirection('outbound');
    setMeetingDate('');
    setMeetingLocation('');
    setEmailSubject('');
  }

  async function handleSubmit() {
    const text = content.trim();
    if (!text) {
      toast.error(t('contentRequired'));
      return;
    }

    const metadata: Record<string, unknown> = {};
    if (kind === 'note' && pinned) metadata.pinned = true;
    if (kind === 'call_logged') {
      const minutes = parseInt(durationMinutes, 10);
      if (Number.isFinite(minutes) && minutes > 0) metadata.duration_minutes = minutes;
      metadata.direction = callDirection;
    }
    if (kind === 'meeting_scheduled') {
      if (meetingDate) metadata.meeting_date = new Date(meetingDate).toISOString();
      if (meetingLocation.trim()) metadata.location = meetingLocation.trim();
    }
    if (kind === 'email_sent' && emailSubject.trim()) {
      metadata.subject = emailSubject.trim();
    }

    try {
      await create.mutateAsync({
        lead_id: leadId,
        activity_type: kind,
        content: text,
        metadata: Object.keys(metadata).length ? metadata : undefined,
        pinned: kind === 'note' && pinned,
      });
      reset();
      toast.success(t('createSuccess'));
      onSubmitted?.();
      if (!defaultExpanded) setExpanded(false);
    } catch (err) {
      console.error('Add activity failed:', err);
      toast.error(t('createError'));
    }
  }

  const submitting = create.isPending;
  const showTabs = !mode;

  // Compact trigger when not expanded.
  if (!expanded) {
    const Icon = KIND_ICONS[kind];
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full text-start rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground hover:bg-muted/40 transition-colors flex items-center gap-2"
      >
        <Icon className="size-4" /> {t(`kinds.${kind}.placeholder`)}
      </button>
    );
  }

  return (
    <Card className="p-3 space-y-3 border-orange-200/40 dark:border-orange-800/30">
      {showTabs && (
        <div className="flex flex-wrap gap-1">
          {(Object.keys(KIND_ICONS) as ActivityKind[]).map((k) => {
            const Icon = KIND_ICONS[k];
            const isActive = k === kind;
            return (
              <button
                key={k}
                type="button"
                onClick={() => changeKind(k)}
                aria-pressed={isActive}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                  isActive
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted',
                )}
              >
                <Icon className="size-3.5" />
                {t(`kinds.${k}.label`)}
              </button>
            );
          })}
        </div>
      )}

      {/* Phase 15.1 Commit 1 — Textarea → MentionTextarea swap. The
          parent's autofocus-on-expand useEffect (line 79-80 above)
          still works unchanged because MentionTextarea forwards the
          ref to the underlying HTMLTextAreaElement via React.forwardRef.
          The `leadId` prop drives /api/dashboard/leads/[id]/members for
          autocomplete; mention notifications fire fire-and-forget from
          the POST /api/crm/leads/[id]/activities route via notifyMany(). */}
      <MentionTextarea
        ref={textareaRef}
        leadId={leadId}
        variant="dashboard"
        rows={3}
        value={content}
        onChange={setContent}
        placeholder={t(`kinds.${kind}.placeholder`)}
      />

      {/* Type-specific fields */}
      {kind === 'call_logged' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor={`${formId}-dur`} className="text-xs">{t('durationMinutes')}</Label>
            <Input
              id={`${formId}-dur`}
              type="number"
              inputMode="numeric"
              min={0}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              placeholder={t('dash')}
            />
          </div>
          <div>
            <Label htmlFor={`${formId}-dir`} className="text-xs">{t('direction')}</Label>
            <Select value={callDirection} onValueChange={(v) => setCallDirection(v as 'inbound' | 'outbound')}>
              <SelectTrigger id={`${formId}-dir`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="outbound">{t('outbound')}</SelectItem>
                <SelectItem value="inbound">{t('inbound')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {kind === 'meeting_scheduled' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <Label htmlFor={`${formId}-mdate`} className="text-xs">{t('meetingDate')}</Label>
            <Input
              id={`${formId}-mdate`}
              type="datetime-local"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor={`${formId}-mloc`} className="text-xs">{t('meetingLocation')}</Label>
            <Input
              id={`${formId}-mloc`}
              value={meetingLocation}
              onChange={(e) => setMeetingLocation(e.target.value)}
              placeholder={t('meetingLocationPlaceholder')}
            />
          </div>
        </div>
      )}

      {kind === 'email_sent' && (
        <div>
          <Label htmlFor={`${formId}-subj`} className="text-xs">{t('emailSubject')}</Label>
          <Input
            id={`${formId}-subj`}
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
            placeholder={t('emailSubjectPlaceholder')}
          />
        </div>
      )}

      {kind === 'note' && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-1.5">
          <Label htmlFor={`${formId}-pin`} className="text-xs cursor-pointer">{t('pinNote')}</Label>
          <Switch id={`${formId}-pin`} checked={pinned} onCheckedChange={setPinned} />
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {!defaultExpanded && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              reset();
              setExpanded(false);
            }}
            disabled={submitting}
          >
            {tCommon('cancel')}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          onClick={() => void handleSubmit()}
          disabled={submitting || !content.trim()}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          {submitting ? <Loader2 className="size-4 animate-spin me-1.5" /> : <Check className="size-4 me-1.5" />}
          {t('save')}
        </Button>
      </div>
    </Card>
  );
}
