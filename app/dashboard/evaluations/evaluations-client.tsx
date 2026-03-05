'use client';

import { useState, useEffect, useCallback } from 'react';
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

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  active: 'نشط',
  closed: 'مغلق',
  submitted: 'مقدم',
  acknowledged: 'معترف به',
};

const EVAL_TYPE_LABELS: Record<string, string> = {
  manager: 'تقييم المدير',
  self: 'تقييم ذاتي',
  peer: 'تقييم الأقران',
  '360': 'تقييم 360°',
};

// ============================================================
// Main Component
// ============================================================

export default function EvaluationsClient({ session }: { session: AuthSession }) {
  const canManage = hasPermission(session.pyraUser.rolePermissions, 'evaluations.manage');

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-6"
    >
      <Tabs defaultValue="evaluations" dir="rtl">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="evaluations" className="gap-1.5">
            <ClipboardCheck className="h-4 w-4" />
            التقييمات
          </TabsTrigger>
          <TabsTrigger value="periods" className="gap-1.5">
            <CalendarRange className="h-4 w-4" />
            الفترات
          </TabsTrigger>
          <TabsTrigger value="kpis" className="gap-1.5">
            <Target className="h-4 w-4" />
            مؤشرات الأداء
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
      </Tabs>
    </motion.div>
  );
}

// ============================================================
// Tab 1: Evaluations
// ============================================================

function EvaluationsTab({ session, canManage }: { session: AuthSession; canManage: boolean }) {
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [periods, setPeriods] = useState<EvaluationPeriod[]>([]);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [users, setUsers] = useState<PyraUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedData, setExpandedData] = useState<Evaluation | null>(null);
  const [expandedLoading, setExpandedLoading] = useState(false);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
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
  const [savingScores, setSavingScores] = useState(false);

  // Comment fields for evaluation
  const [editComments, setEditComments] = useState({ comments: '', strengths: '', improvements: '' });
  const [savingComments, setSavingComments] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const promises: Promise<Response>[] = [
        fetch('/api/dashboard/evaluations'),
        fetch('/api/dashboard/evaluations/periods'),
        fetch('/api/dashboard/evaluations/criteria'),
      ];
      // Only fetch user list when admin needs it for create dialog
      if (canManage) {
        promises.push(fetch('/api/users'));
      }

      const results = await Promise.all(promises);

      const evJson = await results[0].json();
      const periodsJson = await results[1].json();
      const criteriaJson = await results[2].json();

      if (evJson.data) setEvaluations(evJson.data);
      if (periodsJson.data) setPeriods(periodsJson.data);
      if (criteriaJson.data) setCriteria(criteriaJson.data.filter((c: Criterion) => c.is_active));

      if (canManage && results[3]) {
        const usersJson = await results[3].json();
        if (usersJson.data) setUsers(usersJson.data);
      }
    } catch {
      toast.error('فشل في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleExpand = async (evalId: string) => {
    if (expandedId === evalId) {
      setExpandedId(null);
      setExpandedData(null);
      return;
    }

    setExpandedId(evalId);
    setExpandedLoading(true);

    try {
      const res = await fetch(`/api/dashboard/evaluations/${evalId}`);
      const json = await res.json();
      if (json.data) {
        setExpandedData(json.data);
        setEditComments({
          comments: json.data.comments || '',
          strengths: json.data.strengths || '',
          improvements: json.data.improvements || '',
        });
      }
    } catch {
      toast.error('فشل في تحميل تفاصيل التقييم');
    } finally {
      setExpandedLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newEval.period_id || !newEval.employee_username || !newEval.evaluator_username) {
      toast.error('جميع الحقول مطلوبة');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/dashboard/evaluations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEval),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
      } else {
        toast.success('تم إنشاء التقييم بنجاح');
        setCreateOpen(false);
        setNewEval({ period_id: '', employee_username: '', evaluator_username: '', evaluation_type: 'manager' });
        fetchData();
      }
    } catch {
      toast.error('فشل في إنشاء التقييم');
    } finally {
      setCreating(false);
    }
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

  const handleSaveScores = async () => {
    if (!scoreEvalId) return;
    setSavingScores(true);
    try {
      const scores = Object.entries(scoreValues).map(([criteria_id, v]) => ({
        criteria_id,
        score: v.score,
        comment: v.comment || undefined,
      }));

      const res = await fetch(`/api/dashboard/evaluations/${scoreEvalId}/scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
      } else {
        toast.success('تم حفظ الدرجات بنجاح');
        setScoreOpen(false);
        // Refresh expanded data
        if (expandedId === scoreEvalId) {
          toggleExpand(scoreEvalId);
          setTimeout(() => toggleExpand(scoreEvalId), 200);
        }
        fetchData();
      }
    } catch {
      toast.error('فشل في حفظ الدرجات');
    } finally {
      setSavingScores(false);
    }
  };

  const handleSubmit = async (evalId: string) => {
    try {
      const res = await fetch(`/api/dashboard/evaluations/${evalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit' }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
      } else {
        toast.success('تم تقديم التقييم بنجاح');
        fetchData();
        if (expandedId === evalId) {
          toggleExpand(evalId);
          setTimeout(() => toggleExpand(evalId), 200);
        }
      }
    } catch {
      toast.error('فشل في تقديم التقييم');
    }
  };

  const handleAcknowledge = async (evalId: string) => {
    try {
      const res = await fetch(`/api/dashboard/evaluations/${evalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'acknowledge' }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
      } else {
        toast.success('تم الاعتراف بالتقييم بنجاح');
        fetchData();
        if (expandedId === evalId) {
          toggleExpand(evalId);
          setTimeout(() => toggleExpand(evalId), 200);
        }
      }
    } catch {
      toast.error('فشل في الاعتراف بالتقييم');
    }
  };

  const handleSaveComments = async (evalId: string) => {
    setSavingComments(true);
    try {
      const res = await fetch(`/api/dashboard/evaluations/${evalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editComments),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
      } else {
        toast.success('تم حفظ الملاحظات');
      }
    } catch {
      toast.error('فشل في حفظ الملاحظات');
    } finally {
      setSavingComments(false);
    }
  };

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
        <h2 className="text-lg font-semibold">التقييمات</h2>
        {canManage && (
          <Button
            onClick={() => setCreateOpen(true)}
            size="sm"
            className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
          >
            <Plus className="h-4 w-4" />
            تقييم جديد
          </Button>
        )}
      </div>

      {/* Evaluations List */}
      {evaluations.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="لا توجد تقييمات"
          description="لم يتم إنشاء أي تقييمات بعد"
          actionLabel={canManage ? 'إنشاء تقييم' : undefined}
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
                      {STATUS_LABELS[ev.status] || ev.status}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {EVAL_TYPE_LABELS[ev.evaluation_type] || ev.evaluation_type}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      المقيّم: {ev.evaluator?.display_name || ev.evaluator_username}
                    </span>
                    {ev.period && (
                      <span className="flex items-center gap-1">
                        <CalendarRange className="h-3.5 w-3.5" />
                        {ev.period.name_ar}
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
                          <CardTitle className="text-sm">مخطط التقييم</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="h-[280px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <RadarChart
                                data={expandedData.scores.map((s) => ({
                                  criterion: s.criteria?.name_ar || s.criteria?.name || '',
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
                                  name="الدرجة"
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
                          <CardTitle className="text-sm">الدرجات التفصيلية</CardTitle>
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
                                    {s.criteria?.name_ar || s.criteria?.name}
                                  </span>
                                  {s.comment && (
                                    <p className="text-xs text-muted-foreground mt-0.5">{s.comment}</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold text-orange-600 dark:text-orange-400">
                                    {s.score.toFixed(1)}
                                  </span>
                                  <span className="text-xs text-muted-foreground">/5</span>
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
                          <CardTitle className="text-sm">ملاحظات التقييم</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div>
                            <Label className="text-xs">نقاط القوة</Label>
                            <Textarea
                              value={editComments.strengths}
                              onChange={(e) =>
                                setEditComments((p) => ({ ...p, strengths: e.target.value }))
                              }
                              placeholder="أذكر نقاط القوة..."
                              className="mt-1"
                              rows={2}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">نقاط التحسين</Label>
                            <Textarea
                              value={editComments.improvements}
                              onChange={(e) =>
                                setEditComments((p) => ({ ...p, improvements: e.target.value }))
                              }
                              placeholder="أذكر نقاط التحسين..."
                              className="mt-1"
                              rows={2}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">ملاحظات عامة</Label>
                            <Textarea
                              value={editComments.comments}
                              onChange={(e) =>
                                setEditComments((p) => ({ ...p, comments: e.target.value }))
                              }
                              placeholder="ملاحظات إضافية..."
                              className="mt-1"
                              rows={2}
                            />
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleSaveComments(ev.id)}
                            disabled={savingComments}
                            className="bg-orange-500 hover:bg-orange-600 text-white"
                          >
                            {savingComments ? 'جارٍ الحفظ...' : 'حفظ الملاحظات'}
                          </Button>
                        </CardContent>
                      </Card>
                    ) : (
                      /* Read-only comments */
                      (expandedData.strengths || expandedData.improvements || expandedData.comments) && (
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm">ملاحظات التقييم</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2 text-sm">
                            {expandedData.strengths && (
                              <div>
                                <span className="font-medium text-green-600 dark:text-green-400">نقاط القوة:</span>
                                <p className="text-muted-foreground mt-0.5">{expandedData.strengths}</p>
                              </div>
                            )}
                            {expandedData.improvements && (
                              <div>
                                <span className="font-medium text-orange-600 dark:text-orange-400">نقاط التحسين:</span>
                                <p className="text-muted-foreground mt-0.5">{expandedData.improvements}</p>
                              </div>
                            )}
                            {expandedData.comments && (
                              <div>
                                <span className="font-medium">ملاحظات عامة:</span>
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
                              تقييم الدرجات
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleSubmit(ev.id)}
                              className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                            >
                              <Send className="h-4 w-4" />
                              تقديم التقييم
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
                            الاعتراف بالتقييم
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
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>تقييم جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>فترة التقييم</Label>
              <Select value={newEval.period_id} onValueChange={(v) => setNewEval((p) => ({ ...p, period_id: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="اختر الفترة" />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name_ar}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الموظف</Label>
              <Select
                value={newEval.employee_username}
                onValueChange={(v) => setNewEval((p) => ({ ...p, employee_username: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="اختر الموظف" />
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
              <Label>المقيّم</Label>
              <Select
                value={newEval.evaluator_username}
                onValueChange={(v) => setNewEval((p) => ({ ...p, evaluator_username: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="اختر المقيّم" />
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
              <Label>نوع التقييم</Label>
              <Select
                value={newEval.evaluation_type}
                onValueChange={(v) => setNewEval((p) => ({ ...p, evaluation_type: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">تقييم المدير</SelectItem>
                  <SelectItem value="self">تقييم ذاتي</SelectItem>
                  <SelectItem value="peer">تقييم الأقران</SelectItem>
                  <SelectItem value="360">تقييم 360°</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {creating ? 'جارٍ الإنشاء...' : 'إنشاء'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Score Entry Dialog */}
      <Dialog open={scoreOpen} onOpenChange={setScoreOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>تقييم الدرجات</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {criteria.map((c) => (
              <div key={c.id} className="space-y-2 p-3 border rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-sm">{c.name_ar}</span>
                    {c.category && (
                      <Badge variant="outline" className="ms-2 text-xs">
                        {c.category}
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    الوزن: {c.weight}
                  </span>
                </div>
                {c.description && (
                  <p className="text-xs text-muted-foreground">{c.description}</p>
                )}
                <div className="flex items-center gap-2">
                  <Label className="text-xs min-w-[50px]">الدرجة:</Label>
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
                  placeholder="ملاحظة (اختياري)"
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
              إلغاء
            </Button>
            <Button
              onClick={handleSaveScores}
              disabled={savingScores}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {savingScores ? 'جارٍ الحفظ...' : 'حفظ الدرجات'}
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
  const [periods, setPeriods] = useState<EvaluationPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newPeriod, setNewPeriod] = useState({
    name: '',
    name_ar: '',
    start_date: '',
    end_date: '',
  });

  const fetchPeriods = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/evaluations/periods');
      const json = await res.json();
      if (json.data) setPeriods(json.data);
    } catch {
      toast.error('فشل في تحميل الفترات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPeriods();
  }, [fetchPeriods]);

  const handleCreate = async () => {
    if (!newPeriod.name || !newPeriod.name_ar || !newPeriod.start_date || !newPeriod.end_date) {
      toast.error('جميع الحقول مطلوبة');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/dashboard/evaluations/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPeriod),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
      } else {
        toast.success('تم إنشاء الفترة بنجاح');
        setCreateOpen(false);
        setNewPeriod({ name: '', name_ar: '', start_date: '', end_date: '' });
        fetchPeriods();
      }
    } catch {
      toast.error('فشل في إنشاء الفترة');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/dashboard/evaluations/periods/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
      } else {
        toast.success(`تم تحديث الحالة إلى "${STATUS_LABELS[status]}"`);
        fetchPeriods();
      }
    } catch {
      toast.error('فشل في تحديث الحالة');
    }
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
        <h2 className="text-lg font-semibold">فترات التقييم</h2>
        {canManage && (
          <Button
            onClick={() => setCreateOpen(true)}
            size="sm"
            className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
          >
            <Plus className="h-4 w-4" />
            فترة جديدة
          </Button>
        )}
      </div>

      {periods.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="لا توجد فترات تقييم"
          description="قم بإنشاء فترة تقييم جديدة للبدء"
          actionLabel={canManage ? 'إنشاء فترة' : undefined}
          onAction={canManage ? () => setCreateOpen(true) : undefined}
        />
      ) : (
        periods.map((p) => (
          <Card key={p.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{p.name_ar}</span>
                  <Badge className={STATUS_STYLES[p.status] || ''} variant="secondary">
                    {STATUS_LABELS[p.status] || p.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {p.start_date} — {p.end_date}
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
                      تفعيل
                    </Button>
                  )}
                  {p.status === 'active' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleUpdateStatus(p.id, 'closed')}
                      className="text-red-600 border-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      إغلاق
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
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>فترة تقييم جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>الاسم (إنجليزي)</Label>
              <Input
                value={newPeriod.name}
                onChange={(e) => setNewPeriod((p) => ({ ...p, name: e.target.value }))}
                placeholder="Q1 2025 Review"
                className="mt-1"
              />
            </div>
            <div>
              <Label>الاسم (عربي)</Label>
              <Input
                value={newPeriod.name_ar}
                onChange={(e) => setNewPeriod((p) => ({ ...p, name_ar: e.target.value }))}
                placeholder="مراجعة الربع الأول 2025"
                className="mt-1"
              />
            </div>
            <div>
              <Label>تاريخ البداية</Label>
              <Input
                type="date"
                value={newPeriod.start_date}
                onChange={(e) => setNewPeriod((p) => ({ ...p, start_date: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>تاريخ النهاية</Label>
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
              إلغاء
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {creating ? 'جارٍ الإنشاء...' : 'إنشاء'}
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
  const [kpis, setKpis] = useState<KpiTarget[]>([]);
  const [periods, setPeriods] = useState<EvaluationPeriod[]>([]);
  const [users, setUsers] = useState<PyraUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
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
      const promises: Promise<Response>[] = [
        fetch('/api/dashboard/kpi'),
        fetch('/api/dashboard/evaluations/periods'),
      ];
      if (canManage) {
        promises.push(fetch('/api/users'));
      }

      const results = await Promise.all(promises);

      const kpiJson = await results[0].json();
      const periodsJson = await results[1].json();

      if (kpiJson.data) setKpis(kpiJson.data);
      if (periodsJson.data) setPeriods(periodsJson.data);

      if (canManage && results[2]) {
        const usersJson = await results[2].json();
        if (usersJson.data) setUsers(usersJson.data);
      }
    } catch {
      toast.error('فشل في تحميل مؤشرات الأداء');
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreate = async () => {
    if (!newKpi.username || !newKpi.title) {
      toast.error('اسم المستخدم والعنوان مطلوبان');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/dashboard/kpi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newKpi,
          target_value: newKpi.target_value ? parseFloat(newKpi.target_value) : null,
          period_id: newKpi.period_id || null,
        }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
      } else {
        toast.success('تم إنشاء مؤشر الأداء بنجاح');
        setCreateOpen(false);
        setNewKpi({ username: '', period_id: '', title: '', target_value: '', unit: '' });
        fetchData();
      }
    } catch {
      toast.error('فشل في إنشاء مؤشر الأداء');
    } finally {
      setCreating(false);
    }
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
        <h2 className="text-lg font-semibold">مؤشرات الأداء (KPIs)</h2>
        {canManage && (
          <Button
            onClick={() => setCreateOpen(true)}
            size="sm"
            className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
          >
            <Plus className="h-4 w-4" />
            مؤشر جديد
          </Button>
        )}
      </div>

      {kpis.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="لا توجد مؤشرات أداء"
          description="قم بإنشاء مؤشرات أداء لتتبع تقدم الموظفين"
          actionLabel={canManage ? 'إنشاء مؤشر' : undefined}
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
                          {kpi.period.name_ar}
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
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Create KPI Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>مؤشر أداء جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>الموظف</Label>
              <Select
                value={newKpi.username}
                onValueChange={(v) => setNewKpi((p) => ({ ...p, username: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="اختر الموظف" />
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
              <Label>العنوان</Label>
              <Input
                value={newKpi.title}
                onChange={(e) => setNewKpi((p) => ({ ...p, title: e.target.value }))}
                placeholder="مثال: عدد المشاريع المنجزة"
                className="mt-1"
              />
            </div>
            <div>
              <Label>القيمة المستهدفة</Label>
              <Input
                type="number"
                value={newKpi.target_value}
                onChange={(e) => setNewKpi((p) => ({ ...p, target_value: e.target.value }))}
                placeholder="مثال: 10"
                className="mt-1"
              />
            </div>
            <div>
              <Label>الوحدة</Label>
              <Input
                value={newKpi.unit}
                onChange={(e) => setNewKpi((p) => ({ ...p, unit: e.target.value }))}
                placeholder="مثال: مشروع، ساعة، %"
                className="mt-1"
              />
            </div>
            <div>
              <Label>فترة التقييم (اختياري)</Label>
              <Select
                value={newKpi.period_id}
                onValueChange={(v) => setNewKpi((p) => ({ ...p, period_id: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="اختر الفترة (اختياري)" />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name_ar}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {creating ? 'جارٍ الإنشاء...' : 'إنشاء'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
