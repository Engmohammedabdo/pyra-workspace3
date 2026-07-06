'use client';

import { useState, useCallback, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from '@/hooks/api-helpers';
import { useUsers } from '@/hooks/useUsers';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import { dirFor, type Locale } from '@/lib/i18n/config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { hasPermission } from '@/lib/auth/rbac';
import { motion } from 'framer-motion';
import { KpiProgressEditor } from '@/components/evaluations/KpiProgressEditor';
import { PerformanceTrend } from '@/components/evaluations/PerformanceTrend';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from 'recharts';
import {
  ClipboardCheck,
  CalendarRange,
  Target,
  Plus,
  Star,
  Send,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  Users,
  TrendingUp,
  Gift,
} from 'lucide-react';
import type { AuthSession } from '@/lib/auth/guards';

// ============================================================
// Types
// ============================================================

interface EvaluationPeriod {
  id: string;
  name: string;
  name_ar: string;
  start_date: string;
  end_date: string;
  status: 'draft' | 'active' | 'closed';
  created_by: string;
  created_at: string;
}

interface Evaluation {
  id: string;
  period_id: string;
  employee_username: string;
  evaluator_username: string;
  evaluation_type: string;
  overall_rating: number | null;
  status: 'draft' | 'submitted' | 'acknowledged';
  comments: string | null;
  strengths: string | null;
  improvements: string | null;
  submitted_at: string | null;
  acknowledged_at: string | null;
  created_at: string;
  employee?: { username: string; display_name: string } | null;
  evaluator?: { username: string; display_name: string } | null;
  period?: { id: string; name: string; name_ar: string; status: string } | null;
  scores?: EvaluationScore[];
}

interface EvaluationScore {
  id: string;
  criteria_id: string;
  score: number;
  comment: string | null;
  criteria?: {
    name: string;
    name_ar: string;
    weight: number;
    category: string | null;
  } | null;
}

interface Criterion {
  id: string;
  name: string;
  name_ar: string;
  description: string | null;
  weight: number;
  category: string | null;
  is_active: boolean;
  sort_order: number;
}

interface KpiTarget {
  id: string;
  username: string;
  period_id: string | null;
  title: string;
  target_value: number | null;
  actual_value: number;
  unit: string | null;
  status: string;
  created_at: string;
  user?: { username: string; display_name: string } | null;
  period?: { id: string; name: string; name_ar: string } | null;
}

interface PyraUser {
  username: string;
  display_name: string;
}

// ============================================================
// Constants
// ============================================================

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
  active: 'bg-green-500/10 text-green-600 dark:text-green-400',
  closed: 'bg-red-500/10 text-red-600 dark:text-red-400',
  submitted: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  acknowledged: 'bg-green-500/10 text-green-600 dark:text-green-400',
};

// Status + evaluation-type labels now resolve via useStatusLabels('evaluationForm' |
// 'evaluationPeriod' | 'evaluationType') at each render site — see lib/i18n/status-labels.ts.

// ============================================================
// Main Component
// ============================================================

export default function EvaluationsClient({ session }: { session: AuthSession }) {
  const canManage = hasPermission(session.pyraUser.rolePermissions, 'evaluations.manage');
  const t = useTranslations('hr.evaluations.tabs');
  const locale = useLocale() as Locale;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-6"
    >
      <Tabs defaultValue="evaluations" dir={dirFor(locale)}>
        <TabsList className="w-full justify-start">
          <TabsTrigger value="evaluations" className="gap-1.5">
            <ClipboardCheck className="h-4 w-4" />
            {t('evaluations')}
          </TabsTrigger>
          <TabsTrigger value="periods" className="gap-1.5">
            <CalendarRange className="h-4 w-4" />
            {t('periods')}
          </TabsTrigger>
          <TabsTrigger value="kpis" className="gap-1.5">
            <Target className="h-4 w-4" />
            {t('kpis')}
          </TabsTrigger>
          <TabsTrigger value="trend" className="gap-1.5">
            <TrendingUp className="h-4 w-4" />
            {t('trend')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="evaluations">
          <EvaluationsTab session={session} canManage={canManage} />
        </TabsContent>

        <TabsContent value="periods">
          <PeriodsTab canManage={canManage} />
        </TabsContent>

        <TabsContent value="kpis">
          <KpisTab session={session} canManage={canManage} />
        </TabsContent>

        <TabsContent value="trend">
          <PerformanceTrend />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

// ============================================================
// Tab 1: Evaluations
// ============================================================

function EvaluationsTab({ session, canManage }: { session: AuthSession; canManage: boolean }) {
  const t = useTranslations('hr.evaluations.list');
  const locale = useLocale() as Locale;
  const statusLabelFor = useStatusLabels('evaluationForm');
  const evalTypeLabelFor = useStatusLabels('evaluationType');
  // Bundled fix (sanctioned): the score dialog previously rendered the raw
  // English category key unmapped — now routes through the same
  // evaluationCriteriaCategory entity the settings page uses.
  const categoryLabelFor = useStatusLabels('evaluationCriteriaCategory');
  const queryClient = useQueryClient();
  const { data: evaluations = [], isLoading: loading } = useQuery<Evaluation[]>({
    queryKey: ['evaluations'],
    queryFn: () => fetchAPI('/api/dashboard/evaluations'),
  });
  const { data: periods = [] } = useQuery<EvaluationPeriod[]>({
    queryKey: ['evaluation-periods'],
    queryFn: () => fetchAPI('/api/dashboard/evaluations/periods'),
  });
  const { data: criteriaRaw = [] } = useQuery<Criterion[]>({
    queryKey: ['evaluation-criteria'],
    queryFn: () => fetchAPI('/api/dashboard/evaluations/criteria'),
  });
  const criteria = criteriaRaw.filter(c => c.is_active);
  const { data: usersRaw = [] } = useUsers();
  const users = usersRaw as unknown as PyraUser[];
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedData, setExpandedData] = useState<Evaluation | null>(null);
  const [expandedLoading, setExpandedLoading] = useState(false);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [newEval, setNewEval] = useState({
    period_id: '',
    employee_username: '',
    evaluator_username: '',
    evaluation_type: 'manager',
  });

  // Score dialog state
  const [scoreOpen, setScoreOpen] = useState(false);
  const [scoreEvalId, setScoreEvalId] = useState<string | null>(null);
  const [scoreValues, setScoreValues] = useState<Record<string, { score: number; comment: string }>>({});

  // Comment fields for evaluation
  const [editComments, setEditComments] = useState({ comments: '', strengths: '', improvements: '' });

  // Bonus recommendations already sent this session (hide/disable the button after success)
  const [bonusRecommendedIds, setBonusRecommendedIds] = useState<Set<string>>(new Set());

  const fetchData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['evaluations'] });
    queryClient.invalidateQueries({ queryKey: ['evaluation-periods'] });
    queryClient.invalidateQueries({ queryKey: ['evaluation-criteria'] });
  }, [queryClient]);

  const toggleExpand = async (evalId: string) => {
    if (expandedId === evalId) {
      setExpandedId(null);
      setExpandedData(null);
      return;
    }

    setExpandedId(evalId);
    setExpandedLoading(true);

    try {
      const data = await fetchAPI<Evaluation>(`/api/dashboard/evaluations/${evalId}`);
      const ev = (data as any).data ?? data;
      if (ev) {
        setExpandedData(ev);
        setEditComments({
          comments: ev.comments || '',
          strengths: ev.strengths || '',
          improvements: ev.improvements || '',
        });
      }
    } catch {
      toast.error(t('toasts.loadDetailFailed'));
    } finally {
      setExpandedLoading(false);
    }
  };

  // Re-fetch expanded data without collapsing/expanding (replaces toggleExpand+setTimeout hack)
  const refreshExpanded = async (evalId: string) => {
    try {
      const data = await fetchAPI<Evaluation>(`/api/dashboard/evaluations/${evalId}`);
      const ev = (data as any).data ?? data;
      if (ev) {
        setExpandedData(ev);
        setEditComments({
          comments: ev.comments || '',
          strengths: ev.strengths || '',
          improvements: ev.improvements || '',
        });
      }
    } catch {
      // Silently fail — the list refresh will still run
    }
  };

  const createEvalMutation = useMutation({
    mutationFn: (data: object) => mutateAPI('/api/dashboard/evaluations', 'POST', data),
    onSuccess: () => {
      toast.success(t('toasts.createSuccess'));
      setCreateOpen(false);
      setNewEval({ period_id: '', employee_username: '', evaluator_username: '', evaluation_type: 'manager' });
      fetchData();
    },
    onError: () => toast.error(t('toasts.createFailed')),
  });

  const saveScoresMutation = useMutation({
    mutationFn: ({ evalId, scores }: { evalId: string; scores: object[] }) =>
      mutateAPI(`/api/dashboard/evaluations/${evalId}/scores`, 'POST', { scores }),
    onSuccess: () => {
      toast.success(t('toasts.saveScoresSuccess'));
      setScoreOpen(false);
      if (expandedId && scoreEvalId && expandedId === scoreEvalId) refreshExpanded(scoreEvalId);
      fetchData();
    },
    onError: () => toast.error(t('toasts.saveScoresFailed')),
  });

  const submitEvalMutation = useMutation({
    mutationFn: (evalId: string) => mutateAPI(`/api/dashboard/evaluations/${evalId}`, 'PATCH', { action: 'submit' }),
    onSuccess: (_d, evalId) => {
      toast.success(t('toasts.submitSuccess'));
      fetchData();
      if (expandedId === evalId) refreshExpanded(evalId);
    },
    onError: () => toast.error(t('toasts.submitFailed')),
  });

  const acknowledgeEvalMutation = useMutation({
    mutationFn: (evalId: string) => mutateAPI(`/api/dashboard/evaluations/${evalId}`, 'PATCH', { action: 'acknowledge' }),
    onSuccess: (_d, evalId) => {
      toast.success(t('toasts.acknowledgeSuccess'));
      fetchData();
      if (expandedId === evalId) refreshExpanded(evalId);
    },
    onError: () => toast.error(t('toasts.acknowledgeFailed')),
  });

  const saveCommentsMutation = useMutation({
    mutationFn: ({ evalId, comments }: { evalId: string; comments: object }) =>
      mutateAPI(`/api/dashboard/evaluations/${evalId}`, 'PATCH', comments),
    onSuccess: () => toast.success(t('toasts.saveCommentsSuccess')),
    onError: () => toast.error(t('toasts.saveCommentsFailed')),
  });

  const recommendBonusMutation = useMutation({
    mutationFn: (evalId: string) =>
      mutateAPI<{ message: string }>(`/api/dashboard/evaluations/${evalId}`, 'PATCH', { action: 'recommend_bonus' }),
    onSuccess: (data, evalId) => {
      // Server-supplied message (Arabic, api-namespace route — Phase 8) takes
      // priority; the client fallback is the ordinary UI toast string.
      toast.success(data?.message || t('toasts.recommendBonusSuccess'));
      setBonusRecommendedIds((prev) => new Set(prev).add(evalId));
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t('toasts.recommendBonusFailed'));
    },
  });

  const handleCreate = () => {
    if (!newEval.period_id || !newEval.employee_username || !newEval.evaluator_username) {
      toast.error(t('toasts.allFieldsRequired'));
      return;
    }
    createEvalMutation.mutate(newEval);
  };

  const handleOpenScoring = (evalId: string) => {
    setScoreEvalId(evalId);
    // Initialize with existing scores if available
    const ev = expandedData;
    const initial: Record<string, { score: number; comment: string }> = {};
    if (ev?.scores) {
      for (const s of ev.scores) {
        initial[s.criteria_id] = { score: s.score, comment: s.comment || '' };
      }
    }
    // Fill in missing criteria
    for (const c of criteria) {
      if (!initial[c.id]) {
        initial[c.id] = { score: 3, comment: '' };
      }
    }
    setScoreValues(initial);
    setScoreOpen(true);
  };

  const handleSaveScores = () => {
    if (!scoreEvalId) return;
    const scores = Object.entries(scoreValues).map(([criteria_id, v]) => ({
      criteria_id, score: v.score, comment: v.comment || undefined,
    }));
    saveScoresMutation.mutate({ evalId: scoreEvalId, scores });
  };

  const handleSubmit = (evalId: string) => submitEvalMutation.mutate(evalId);
  const handleAcknowledge = (evalId: string) => acknowledgeEvalMutation.mutate(evalId);
  const handleSaveComments = (evalId: string) => saveCommentsMutation.mutate({ evalId, comments: editComments });
  const handleRecommendBonus = (evalId: string) => recommendBonusMutation.mutate(evalId);

  const renderStars = (rating: number | null) => {
    if (!rating) return <span className="text-muted-foreground text-sm">—</span>;
    const full = Math.floor(rating);
    const half = rating - full >= 0.5;
    return (
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`h-4 w-4 ${
              i < full
                ? 'fill-orange-500 text-orange-500'
                : i === full && half
                ? 'fill-orange-500/50 text-orange-500'
                : 'text-muted-foreground/30'
            }`}
          />
        ))}
        <span className="text-sm font-medium text-muted-foreground ms-1">
          {rating.toFixed(1)}
        </span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4 mt-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        {canManage && (
          <Button
            onClick={() => setCreateOpen(true)}
            size="sm"
            className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
          >
            <Plus className="h-4 w-4" />
            {t('createButton')}
          </Button>
        )}
      </div>

      {/* Evaluations List */}
      {evaluations.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={t('empty.title')}
          description={t('empty.description')}
          actionLabel={canManage ? t('empty.actionLabel') : undefined}
          onAction={canManage ? () => setCreateOpen(true) : undefined}
        />
      ) : (
        evaluations.map((ev) => (
          <Card key={ev.id} className="overflow-hidden">
            <div
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => toggleExpand(ev.id)}
            >
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">
                      {ev.employee?.display_name || ev.employee_username}
                    </span>
                    <Badge className={STATUS_STYLES[ev.status] || ''} variant="secondary">
                      {statusLabelFor(ev.status)}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {evalTypeLabelFor(ev.evaluation_type)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {t('evaluatorLabel', { name: ev.evaluator?.display_name || ev.evaluator_username })}
                    </span>
                    {ev.period && (
                      <span className="flex items-center gap-1">
                        <CalendarRange className="h-3.5 w-3.5" />
                        {locale === 'ar' ? ev.period.name_ar : (ev.period.name || ev.period.name_ar)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {renderStars(ev.overall_rating)}
                  {expandedId === ev.id ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </div>
            </div>

            {/* Expanded Details */}
            {expandedId === ev.id && (
              <div className="border-t p-4 space-y-4">
                {expandedLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-40 w-full rounded-lg" />
                    <Skeleton className="h-20 w-full rounded-lg" />
                  </div>
                ) : expandedData ? (
                  <>
                    {/* Radar Chart */}
                    {expandedData.scores && expandedData.scores.length > 0 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">{t('radarChartTitle')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="h-[280px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <RadarChart
                                data={expandedData.scores.map((s) => ({
                                  criterion: (locale === 'ar'
                                    ? s.criteria?.name_ar
                                    : (s.criteria?.name || s.criteria?.name_ar)) || '',
                                  score: s.score,
                                  fullMark: 5,
                                }))}
                              >
                                <PolarGrid />
                                <PolarAngleAxis
                                  dataKey="criterion"
                                  tick={{ fontSize: 11, fill: 'currentColor' }}
                                />
                                <PolarRadiusAxis
                                  angle={90}
                                  domain={[0, 5]}
                                  tick={{ fontSize: 10 }}
                                />
                                <Radar
                                  name={t('radarScoreName')}
                                  dataKey="score"
                                  stroke="#f97316"
                                  fill="#f97316"
                                  fillOpacity={0.25}
                                  strokeWidth={2}
                                />
                              </RadarChart>
                            </ResponsiveContainer>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Scores Table */}
                    {expandedData.scores && expandedData.scores.length > 0 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">{t('scoresTableTitle')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {expandedData.scores.map((s) => (
                              <div
                                key={s.id}
                                className="flex items-center justify-between py-2 border-b last:border-0"
                              >
                                <div>
                                  <span className="font-medium text-sm">
                                    {locale === 'ar'
                                      ? s.criteria?.name_ar
                                      : (s.criteria?.name || s.criteria?.name_ar)}
                                  </span>
                                  {s.comment && (
                                    <p className="text-xs text-muted-foreground mt-0.5">{s.comment}</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold text-orange-600 dark:text-orange-400">
                                    {s.score.toFixed(1)}
                                  </span>
                                  <span className="text-xs text-muted-foreground">{t('scoreOutOf')}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Comments Section */}
                    {(expandedData.status === 'draft' &&
                      (canManage || expandedData.evaluator_username === session.pyraUser.username)) ? (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">{t('commentsTitle')}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div>
                            <Label className="text-xs">{t('strengthsLabel')}</Label>
                            <Textarea
                              value={editComments.strengths}
                              onChange={(e) =>
                                setEditComments((p) => ({ ...p, strengths: e.target.value }))
                              }
                              placeholder={t('strengthsPlaceholder')}
                              className="mt-1"
                              rows={2}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">{t('improvementsLabel')}</Label>
                            <Textarea
                              value={editComments.improvements}
                              onChange={(e) =>
                                setEditComments((p) => ({ ...p, improvements: e.target.value }))
                              }
                              placeholder={t('improvementsPlaceholder')}
                              className="mt-1"
                              rows={2}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">{t('generalCommentsLabel')}</Label>
                            <Textarea
                              value={editComments.comments}
                              onChange={(e) =>
                                setEditComments((p) => ({ ...p, comments: e.target.value }))
                              }
                              placeholder={t('generalCommentsPlaceholder')}
                              className="mt-1"
                              rows={2}
                            />
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleSaveComments(ev.id)}
                            disabled={saveCommentsMutation.isPending}
                            className="bg-orange-500 hover:bg-orange-600 text-white"
                          >
                            {saveCommentsMutation.isPending ? t('savingComments') : t('saveComments')}
                          </Button>
                        </CardContent>
                      </Card>
                    ) : (
                      /* Read-only comments */
                      (expandedData.strengths || expandedData.improvements || expandedData.comments) && (
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm">{t('commentsTitle')}</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2 text-sm">
                            {expandedData.strengths && (
                              <div>
                                <span className="font-medium text-green-600 dark:text-green-400">{t('strengthsReadonlyLabel')}</span>
                                <p className="text-muted-foreground mt-0.5">{expandedData.strengths}</p>
                              </div>
                            )}
                            {expandedData.improvements && (
                              <div>
                                <span className="font-medium text-orange-600 dark:text-orange-400">{t('improvementsReadonlyLabel')}</span>
                                <p className="text-muted-foreground mt-0.5">{expandedData.improvements}</p>
                              </div>
                            )}
                            {expandedData.comments && (
                              <div>
                                <span className="font-medium">{t('generalCommentsReadonlyLabel')}</span>
                                <p className="text-muted-foreground mt-0.5">{expandedData.comments}</p>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {expandedData.status === 'draft' &&
                        (canManage || expandedData.evaluator_username === session.pyraUser.username) && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenScoring(ev.id)}
                              className="gap-1.5"
                            >
                              <FileText className="h-4 w-4" />
                              {t('scoreAction')}
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleSubmit(ev.id)}
                              className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
                            >
                              <Send className="h-4 w-4" />
                              {t('submitAction')}
                            </Button>
                          </>
                        )}
                      {expandedData.status === 'submitted' &&
                        (canManage || expandedData.employee_username === session.pyraUser.username) && (
                          <Button
                            size="sm"
                            onClick={() => handleAcknowledge(ev.id)}
                            className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                          >
                            <CheckCircle className="h-4 w-4" />
                            {t('acknowledgeAction')}
                          </Button>
                        )}
                      {canManage &&
                        (expandedData.status === 'submitted' || expandedData.status === 'acknowledged') &&
                        Number(expandedData.overall_rating) >= 3.5 && (
                          <Button
                            size="sm"
                            onClick={() => handleRecommendBonus(ev.id)}
                            disabled={recommendBonusMutation.isPending || bonusRecommendedIds.has(ev.id)}
                            className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white dark:bg-amber-600 dark:hover:bg-amber-700"
                          >
                            <Gift className="h-4 w-4" />
                            {bonusRecommendedIds.has(ev.id)
                              ? t('bonusRecommended')
                              : recommendBonusMutation.isPending
                              ? t('recommendingBonus')
                              : t('recommendBonusAction')}
                          </Button>
                        )}
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </Card>
        ))
      )}

      {/* Create Evaluation Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto" dir={dirFor(locale)}>
          <DialogHeader>
            <DialogTitle>{t('createDialog.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('createDialog.periodLabel')}</Label>
              <Select value={newEval.period_id} onValueChange={(v) => setNewEval((p) => ({ ...p, period_id: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={t('createDialog.periodPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {locale === 'ar' ? p.name_ar : (p.name || p.name_ar)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('createDialog.employeeLabel')}</Label>
              <Select
                value={newEval.employee_username}
                onValueChange={(v) => setNewEval((p) => ({ ...p, employee_username: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={t('createDialog.employeePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.username} value={u.username}>
                      {u.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('createDialog.evaluatorLabel')}</Label>
              <Select
                value={newEval.evaluator_username}
                onValueChange={(v) => setNewEval((p) => ({ ...p, evaluator_username: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={t('createDialog.evaluatorPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.username} value={u.username}>
                      {u.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('createDialog.typeLabel')}</Label>
              <Select
                value={newEval.evaluation_type}
                onValueChange={(v) => setNewEval((p) => ({ ...p, evaluation_type: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">{evalTypeLabelFor('manager')}</SelectItem>
                  <SelectItem value="self">{evalTypeLabelFor('self')}</SelectItem>
                  <SelectItem value="peer">{evalTypeLabelFor('peer')}</SelectItem>
                  <SelectItem value="360">{evalTypeLabelFor('360')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t('createDialog.cancel')}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createEvalMutation.isPending}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {createEvalMutation.isPending ? t('createDialog.creating') : t('createDialog.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Score Entry Dialog */}
      <Dialog open={scoreOpen} onOpenChange={setScoreOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" dir={dirFor(locale)}>
          <DialogHeader>
            <DialogTitle>{t('scoreDialog.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {criteria.map((c) => (
              <div key={c.id} className="space-y-2 p-3 border rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-sm">
                      {locale === 'ar' ? c.name_ar : (c.name || c.name_ar)}
                    </span>
                    {c.category && (
                      <Badge variant="outline" className="ms-2 text-xs">
                        {categoryLabelFor(c.category)}
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {t('scoreDialog.weightLabel', { weight: c.weight })}
                  </span>
                </div>
                {c.description && (
                  <p className="text-xs text-muted-foreground">{c.description}</p>
                )}
                <div className="flex items-center gap-2">
                  <Label className="text-xs min-w-[50px]">{t('scoreDialog.scoreLabel')}</Label>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() =>
                          setScoreValues((prev) => ({
                            ...prev,
                            [c.id]: { ...prev[c.id], score: val },
                          }))
                        }
                        className={`w-8 h-8 rounded-md text-sm font-medium transition-colors ${
                          scoreValues[c.id]?.score === val
                            ? 'bg-orange-500 text-white'
                            : 'bg-muted hover:bg-muted/80 text-foreground'
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>
                <Input
                  placeholder={t('scoreDialog.commentPlaceholder')}
                  value={scoreValues[c.id]?.comment || ''}
                  onChange={(e) =>
                    setScoreValues((prev) => ({
                      ...prev,
                      [c.id]: { ...prev[c.id], comment: e.target.value },
                    }))
                  }
                  className="text-sm"
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScoreOpen(false)}>
              {t('scoreDialog.cancel')}
            </Button>
            <Button
              onClick={handleSaveScores}
              disabled={saveScoresMutation.isPending}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {saveScoresMutation.isPending ? t('scoreDialog.saving') : t('scoreDialog.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// Tab 2: Periods
// ============================================================

function PeriodsTab({ canManage }: { canManage: boolean }) {
  const t = useTranslations('hr.evaluations.periods');
  const locale = useLocale() as Locale;
  const statusLabelFor = useStatusLabels('evaluationPeriod');
  const [periods, setPeriods] = useState<EvaluationPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newPeriod, setNewPeriod] = useState({ name: '', name_ar: '', start_date: '', end_date: '' });

  const fetchPeriods = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAPI<EvaluationPeriod[]>('/api/dashboard/evaluations/periods');
      setPeriods(data || []);
    } catch {
      toast.error(t('toasts.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchPeriods(); }, [fetchPeriods]);

  const createPeriodMutation = useMutation({
    mutationFn: (data: object) => mutateAPI('/api/dashboard/evaluations/periods', 'POST', data),
    onSuccess: () => { toast.success(t('toasts.createSuccess')); setCreateOpen(false); setNewPeriod({ name: '', name_ar: '', start_date: '', end_date: '' }); fetchPeriods(); },
    onError: () => toast.error(t('toasts.createFailed')),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => mutateAPI(`/api/dashboard/evaluations/periods/${id}`, 'PATCH', { status }),
    onSuccess: (_d, { status }) => { toast.success(t('toasts.statusUpdateSuccess', { status: statusLabelFor(status) })); fetchPeriods(); },
    onError: () => toast.error(t('toasts.statusUpdateFailed')),
  });

  const handleCreate = () => {
    if (!newPeriod.name || !newPeriod.name_ar || !newPeriod.start_date || !newPeriod.end_date) { toast.error(t('toasts.allFieldsRequired')); return; }
    createPeriodMutation.mutate(newPeriod);
  };

  const handleUpdateStatus = (id: string, status: string) => updateStatusMutation.mutate({ id, status });

  if (loading) {
    return (
      <div className="space-y-4 mt-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        {canManage && (
          <Button
            onClick={() => setCreateOpen(true)}
            size="sm"
            className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
          >
            <Plus className="h-4 w-4" />
            {t('createButton')}
          </Button>
        )}
      </div>

      {periods.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title={t('empty.title')}
          description={t('empty.description')}
          actionLabel={canManage ? t('empty.actionLabel') : undefined}
          onAction={canManage ? () => setCreateOpen(true) : undefined}
        />
      ) : (
        periods.map((p) => (
          <Card key={p.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{locale === 'ar' ? p.name_ar : (p.name || p.name_ar)}</span>
                  <Badge className={STATUS_STYLES[p.status] || ''} variant="secondary">
                    {statusLabelFor(p.status)}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('dateRange', { start: p.start_date, end: p.end_date })}
                </p>
              </div>
              {canManage && (
                <div className="flex items-center gap-2">
                  {p.status === 'draft' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleUpdateStatus(p.id, 'active')}
                      className="text-green-600 border-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                    >
                      {t('activateButton')}
                    </Button>
                  )}
                  {p.status === 'active' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleUpdateStatus(p.id, 'closed')}
                      className="text-red-600 border-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      {t('closeButton')}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}

      {/* Create Period Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto" dir={dirFor(locale)}>
          <DialogHeader>
            <DialogTitle>{t('createDialog.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('createDialog.nameEnLabel')}</Label>
              <Input
                value={newPeriod.name}
                onChange={(e) => setNewPeriod((p) => ({ ...p, name: e.target.value }))}
                placeholder="Q1 2025 Review"
                className="mt-1"
              />
            </div>
            <div>
              <Label>{t('createDialog.nameArLabel')}</Label>
              <Input
                value={newPeriod.name_ar}
                onChange={(e) => setNewPeriod((p) => ({ ...p, name_ar: e.target.value }))}
                placeholder="مراجعة الربع الأول 2025"
                className="mt-1"
              />
            </div>
            <div>
              <Label>{t('createDialog.startDateLabel')}</Label>
              <Input
                type="date"
                value={newPeriod.start_date}
                onChange={(e) => setNewPeriod((p) => ({ ...p, start_date: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>{t('createDialog.endDateLabel')}</Label>
              <Input
                type="date"
                value={newPeriod.end_date}
                onChange={(e) => setNewPeriod((p) => ({ ...p, end_date: e.target.value }))}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t('createDialog.cancel')}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createPeriodMutation.isPending}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {createPeriodMutation.isPending ? t('createDialog.creating') : t('createDialog.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// Tab 3: KPIs
// ============================================================

function KpisTab({ session, canManage }: { session: AuthSession; canManage: boolean }) {
  const t = useTranslations('hr.evaluations.kpis');
  const locale = useLocale() as Locale;
  const [kpis, setKpis] = useState<KpiTarget[]>([]);
  const [periods, setPeriods] = useState<EvaluationPeriod[]>([]);
  const [users, setUsers] = useState<PyraUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newKpi, setNewKpi] = useState({
    username: '',
    period_id: '',
    title: '',
    target_value: '',
    unit: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [kpis, periods] = await Promise.all([
        fetchAPI<{ data: KpiTarget[] }>('/api/dashboard/kpi'),
        fetchAPI<{ data: EvaluationPeriod[] }>('/api/dashboard/evaluations/periods'),
      ]);
      setKpis((kpis as any).data ?? kpis ?? []);
      setPeriods((periods as any).data ?? periods ?? []);

      if (canManage) {
        const usersData = await fetchAPI<{ data: PyraUser[] }>('/api/users');
        setUsers((usersData as any).data ?? usersData ?? []);
      }
    } catch {
      toast.error(t('toasts.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [canManage, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const createKpiMutation = useMutation({
    mutationFn: (data: object) => mutateAPI('/api/dashboard/kpi', 'POST', data),
    onSuccess: () => {
      toast.success(t('toasts.createSuccess'));
      setCreateOpen(false);
      setNewKpi({ username: '', period_id: '', title: '', target_value: '', unit: '' });
      fetchData();
    },
    onError: () => toast.error(t('toasts.createFailed')),
  });

  const handleCreate = () => {
    if (!newKpi.username || !newKpi.title) {
      toast.error(t('toasts.validationError'));
      return;
    }
    createKpiMutation.mutate({
      ...newKpi,
      target_value: newKpi.target_value ? parseFloat(newKpi.target_value) : null,
      period_id: newKpi.period_id || null,
    });
  };

  const getProgressPercent = (target: number | null, actual: number): number => {
    if (!target || target === 0) return 0;
    return Math.min(Math.round((actual / target) * 100), 100);
  };

  if (loading) {
    return (
      <div className="space-y-4 mt-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        {canManage && (
          <Button
            onClick={() => setCreateOpen(true)}
            size="sm"
            className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
          >
            <Plus className="h-4 w-4" />
            {t('createButton')}
          </Button>
        )}
      </div>

      {kpis.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title={t('empty.title')}
          description={t('empty.description')}
          actionLabel={canManage ? t('empty.actionLabel') : undefined}
          onAction={canManage ? () => setCreateOpen(true) : undefined}
        />
      ) : (
        kpis.map((kpi) => {
          const pct = getProgressPercent(kpi.target_value, kpi.actual_value);
          return (
            <Card key={kpi.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{kpi.title}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {kpi.user?.display_name || kpi.username}
                      </span>
                      {kpi.period && (
                        <Badge variant="outline" className="text-xs">
                          {locale === 'ar' ? kpi.period.name_ar : (kpi.period.name || kpi.period.name_ar)}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-end">
                    <span className="text-sm font-bold text-orange-600 dark:text-orange-400">
                      {kpi.actual_value}
                    </span>
                    {kpi.target_value && (
                      <span className="text-sm text-muted-foreground">
                        {' / '}
                        {kpi.target_value}
                      </span>
                    )}
                    {kpi.unit && (
                      <span className="text-xs text-muted-foreground ms-1">{kpi.unit}</span>
                    )}
                  </div>
                </div>
                {kpi.target_value && (
                  <div className="space-y-1">
                    <Progress value={pct} className="h-2" />
                    <p className="text-xs text-muted-foreground text-end">{pct}%</p>
                  </div>
                )}
                {canManage && (
                  <div className="pt-2 border-t flex items-center justify-end">
                    <KpiProgressEditor
                      kpiId={kpi.id}
                      currentValue={kpi.actual_value}
                      onSaved={fetchData}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Create KPI Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto" dir={dirFor(locale)}>
          <DialogHeader>
            <DialogTitle>{t('createDialog.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('createDialog.employeeLabel')}</Label>
              <Select
                value={newKpi.username}
                onValueChange={(v) => setNewKpi((p) => ({ ...p, username: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={t('createDialog.employeePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.username} value={u.username}>
                      {u.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('createDialog.titleLabel')}</Label>
              <Input
                value={newKpi.title}
                onChange={(e) => setNewKpi((p) => ({ ...p, title: e.target.value }))}
                placeholder={t('createDialog.titlePlaceholder')}
                className="mt-1"
              />
            </div>
            <div>
              <Label>{t('createDialog.targetLabel')}</Label>
              <Input
                type="number"
                value={newKpi.target_value}
                onChange={(e) => setNewKpi((p) => ({ ...p, target_value: e.target.value }))}
                placeholder={t('createDialog.targetPlaceholder')}
                className="mt-1"
                dir="ltr"
              />
            </div>
            <div>
              <Label>{t('createDialog.unitLabel')}</Label>
              <Input
                value={newKpi.unit}
                onChange={(e) => setNewKpi((p) => ({ ...p, unit: e.target.value }))}
                placeholder={t('createDialog.unitPlaceholder')}
                className="mt-1"
              />
            </div>
            <div>
              <Label>{t('createDialog.periodLabel')}</Label>
              <Select
                value={newKpi.period_id}
                onValueChange={(v) => setNewKpi((p) => ({ ...p, period_id: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={t('createDialog.periodPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {locale === 'ar' ? p.name_ar : (p.name || p.name_ar)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t('createDialog.cancel')}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createKpiMutation.isPending}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {createKpiMutation.isPending ? t('createDialog.creating') : t('createDialog.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
