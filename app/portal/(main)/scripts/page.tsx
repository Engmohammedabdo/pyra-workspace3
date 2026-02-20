'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileText, Download, Copy, Clock, HardDrive,
  ChevronLeft, Film, Loader2, ShieldAlert, RefreshCw,
  CheckCircle, AlertTriangle, MessageSquareWarning,
} from 'lucide-react';
import type { PyraScriptReview } from '@/types/database';

// ── Types ──────────────────────────────────────────────

interface ScriptFile {
  name: string;
  id: string | null;
  updated_at: string | null;
  created_at: string | null;
  metadata: {
    size?: number;
    mimetype?: string;
  } | null;
}

interface VideoVersion {
  version: number;
  filename: string;
  size: number | null;
  updatedAt: string | null;
}

interface VideoGroup {
  videoNumber: number;
  title: string;
  versions: VideoVersion[];
}

// ── Filename Parser ────────────────────────────────────

function parseScriptFilename(filename: string): {
  videoNumber: number;
  title: string;
  version: number;
} | null {
  // Pattern 1: video-01-intro-v1.md (with version)
  const versionMatch = filename.match(/^video-(\d+)-(.+?)-v(\d+)\.md$/i);
  if (versionMatch) {
    return {
      videoNumber: parseInt(versionMatch[1]),
      title: versionMatch[2].replace(/-/g, ' '),
      version: parseInt(versionMatch[3]),
    };
  }

  // Pattern 2: video-02-divorce.md (no version = v1)
  const noVersionMatch = filename.match(/^video-(\d+)-(.+?)\.md$/i);
  if (noVersionMatch) {
    return {
      videoNumber: parseInt(noVersionMatch[1]),
      title: noVersionMatch[2].replace(/-/g, ' '),
      version: 1,
    };
  }

  return null;
}

function groupScriptFiles(files: ScriptFile[]): VideoGroup[] {
  const groups = new Map<number, VideoGroup>();

  for (const file of files) {
    if (!file.name.endsWith('.md')) continue;

    const parsed = parseScriptFilename(file.name);
    if (!parsed) continue;

    if (!groups.has(parsed.videoNumber)) {
      groups.set(parsed.videoNumber, {
        videoNumber: parsed.videoNumber,
        title: parsed.title,
        versions: [],
      });
    }

    groups.get(parsed.videoNumber)!.versions.push({
      version: parsed.version,
      filename: file.name,
      size: file.metadata?.size ?? null,
      updatedAt: file.updated_at,
    });
  }

  // Sort versions within each group (ascending)
  for (const group of groups.values()) {
    group.versions.sort((a, b) => a.version - b.version);
  }

  // Sort groups by video number
  return Array.from(groups.values()).sort((a, b) => a.videoNumber - b.videoNumber);
}

// ── Markdown Components (Etmam Brand) ──────────────────

const markdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-2xl font-bold text-[#003866] mt-8 mb-4 pb-3 border-b border-[#e6dfd7]">
      {children}
    </h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-xl font-bold text-[#003866] mt-6 mb-3 flex items-center gap-2 before:content-[''] before:w-1 before:h-5 before:rounded-full before:bg-[#b89a77] before:shrink-0">
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-lg font-semibold text-[#003866]/90 mt-5 mb-2">
      {children}
    </h3>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-sm leading-[1.9] text-foreground/80 my-3">
      {children}
    </p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-bold text-[#b35434]">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic text-[#003866]/70">{children}</em>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="my-4 relative rounded-lg bg-[#e6dfd7]/20 border border-[#b89a77]/20 ps-5 pe-4 py-3 before:content-[''] before:absolute before:top-0 before:bottom-0 before:start-0 before:w-1 before:rounded-s-lg before:bg-[#b89a77]">
      {children}
    </blockquote>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="ps-5 my-3 space-y-1.5 list-none">{children}</ul>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-sm leading-relaxed text-foreground/80 relative ps-4 before:content-[''] before:absolute before:start-0 before:top-[9px] before:w-1.5 before:h-1.5 before:rounded-full before:bg-[#b89a77]">
      {children}
    </li>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal ps-6 my-3 space-y-1.5 marker:text-[#b89a77] marker:font-bold">
      {children}
    </ol>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[#003866] hover:text-[#b89a77] underline underline-offset-2 transition-colors"
    >
      {children}
    </a>
  ),
  hr: () => (
    <div className="my-6 flex items-center gap-3">
      <div className="flex-1 h-px bg-gradient-to-l from-transparent via-[#e6dfd7] to-transparent" />
      <div className="w-2 h-2 rounded-full bg-[#b89a77]/40" />
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#e6dfd7] to-transparent" />
    </div>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-[#e6dfd7]">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="px-4 py-2.5 text-start font-semibold text-[#003866] bg-[#e6dfd7]/30 border-b border-[#e6dfd7]">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-4 py-2.5 text-foreground/75 border-b border-[#e6dfd7]/40">
      {children}
    </td>
  ),
};

// ── Main Page Component ────────────────────────────────

export default function EtmamScriptsPage() {
  const [selectedVideo, setSelectedVideo] = useState<number | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [scriptContent, setScriptContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [reviewComment, setReviewComment] = useState('');
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const queryClient = useQueryClient();

  // ── Fetch script files (auth is handled server-side) ──
  const {
    data: videoGroups = [],
    isLoading: filesLoading,
    refetch: refetchFiles,
    error: filesError,
  } = useQuery({
    queryKey: ['etmam-scripts'],
    queryFn: async () => {
      const res = await fetch('/api/portal/scripts');
      if (res.status === 401 || res.status === 403) {
        throw new Error(res.status === 403 ? 'FORBIDDEN' : 'UNAUTHORIZED');
      }
      if (!res.ok) throw new Error('FETCH_FAILED');
      const json = await res.json();
      return groupScriptFiles((json.data as ScriptFile[]) || []);
    },
    refetchInterval: 30000,
    retry: (failureCount, error) => {
      // Don't retry auth errors
      if (error instanceof Error && (error.message === 'FORBIDDEN' || error.message === 'UNAUTHORIZED')) {
        return false;
      }
      return failureCount < 2;
    },
  });

  // ── Fetch reviews ──
  const { data: reviews = [] } = useQuery({
    queryKey: ['etmam-script-reviews'],
    queryFn: async () => {
      const res = await fetch('/api/portal/scripts/reviews');
      if (!res.ok) return [];
      const json = await res.json();
      return (json.data || []) as PyraScriptReview[];
    },
    refetchInterval: 30000,
  });

  // ── Reviews lookup map (filename → review) ──
  const reviewMap = useMemo(() => {
    const map = new Map<string, PyraScriptReview>();
    for (const r of reviews) map.set(r.filename, r);
    return map;
  }, [reviews]);

  // ── Load script content ──
  const loadScriptContent = useCallback(async (filename: string) => {
    setContentLoading(true);
    try {
      const res = await fetch(`/api/portal/scripts/${encodeURIComponent(filename)}`);
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setScriptContent(json.data.content);
    } catch {
      toast.error('فشل في تحميل محتوى السكريبت');
      setScriptContent(null);
    } finally {
      setContentLoading(false);
    }
  }, []);

  // ── Handle video selection ──
  const handleSelectVideo = useCallback(
    (videoNumber: number) => {
      setSelectedVideo(videoNumber);
      const group = videoGroups.find((g) => g.videoNumber === videoNumber);
      if (group && group.versions.length > 0) {
        const latest = group.versions[group.versions.length - 1];
        setSelectedVersion(`v${latest.version}`);
        loadScriptContent(latest.filename);
      }
    },
    [videoGroups, loadScriptContent]
  );

  // ── Handle version tab change ──
  const handleVersionChange = useCallback(
    (versionTab: string) => {
      setSelectedVersion(versionTab);
      const group = videoGroups.find((g) => g.videoNumber === selectedVideo);
      if (group) {
        const vNum = parseInt(versionTab.replace('v', ''));
        const ver = group.versions.find((v) => v.version === vNum);
        if (ver) loadScriptContent(ver.filename);
      }
    },
    [videoGroups, selectedVideo, loadScriptContent]
  );

  // ── Download script ──
  const handleDownload = useCallback(async (filename: string) => {
    try {
      const res = await fetch(`/api/portal/scripts/${encodeURIComponent(filename)}`);
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();

      const blob = new Blob([json.data.content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('تم تحميل السكريبت');
    } catch {
      toast.error('فشل في تحميل الملف');
    }
  }, []);

  // ── Copy script text ──
  const handleCopy = useCallback(async () => {
    if (!scriptContent) return;
    try {
      await navigator.clipboard.writeText(scriptContent);
      toast.success('تم نسخ النص');
    } catch {
      toast.error('فشل في نسخ النص');
    }
  }, [scriptContent]);

  // ── Current version filename (for review lookup) ──
  const currentVersionFilename = useMemo(() => {
    if (!selectedVideo) return null;
    const group = videoGroups.find((g) => g.videoNumber === selectedVideo);
    if (!group) return null;
    const vNum = parseInt(selectedVersion.replace('v', ''));
    const ver = group.versions.find((v) => v.version === vNum);
    return ver?.filename || null;
  }, [selectedVideo, selectedVersion, videoGroups]);

  const currentReview = currentVersionFilename ? reviewMap.get(currentVersionFilename) : null;

  // ── Submit review (approve or request revision) ──
  const handleReview = useCallback(
    async (status: 'approved' | 'revision_requested') => {
      if (!currentVersionFilename) return;
      if (status === 'revision_requested' && !reviewComment.trim()) {
        toast.error('يرجى كتابة ملاحظاتك قبل طلب التعديل');
        return;
      }

      setReviewSubmitting(true);
      try {
        const parsed = parseScriptFilename(currentVersionFilename);
        const res = await fetch('/api/portal/scripts/reviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: currentVersionFilename,
            video_number: parsed?.videoNumber || 0,
            version: parsed?.version || 1,
            status,
            comment: reviewComment.trim() || null,
          }),
        });

        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error || 'Failed');
        }

        toast.success(
          status === 'approved' ? 'تم اعتماد السكريبت بنجاح' : 'تم إرسال طلب التعديل'
        );
        setReviewComment('');
        setShowRevisionForm(false);
        queryClient.invalidateQueries({ queryKey: ['etmam-script-reviews'] });
      } catch {
        toast.error('حدث خطأ أثناء إرسال المراجعة');
      } finally {
        setReviewSubmitting(false);
      }
    },
    [currentVersionFilename, reviewComment, queryClient]
  );

  // ── Auth error (403 from API) ──
  const isForbidden = filesError instanceof Error && filesError.message === 'FORBIDDEN';
  if (isForbidden) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
            <ShieldAlert className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="text-lg font-bold mb-2">غير مصرح بالوصول</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            هذه الصفحة مخصصة لعملاء مركز إتمام فقط.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── Files loading ──
  if (filesLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-[600px] w-full rounded-lg" />
        </div>
      </div>
    );
  }

  const selectedGroup = videoGroups.find((g) => g.videoNumber === selectedVideo);
  const currentVersion = selectedGroup?.versions.find(
    (v) => `v${v.version}` === selectedVersion
  );

  return (
    <div className="space-y-6" dir="rtl">
      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#003866] flex items-center justify-center">
            <Film className="h-5 w-5 text-[#b89a77]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#003866]">سكريبتات إتمام</h1>
            <p className="text-sm text-muted-foreground">
              سكريبتات الفيديوهات الخاصة بمركز إتمام
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-[#b89a77]/10 text-[#b89a77] border-[#b89a77]/20">
            {videoGroups.length} فيديو
          </Badge>
          <Badge className="bg-[#003866]/10 text-[#003866] border-[#003866]/20">
            {videoGroups.reduce((sum, g) => sum + g.versions.length, 0)} نسخة
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchFiles()}
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            تحديث
          </Button>
        </div>
      </motion.div>

      {/* ── Empty state ── */}
      {videoGroups.length === 0 ? (
        <Card className="border-[#e6dfd7]">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-[#e6dfd7] flex items-center justify-center mb-4">
              <FileText className="h-8 w-8 text-[#003866]" />
            </div>
            <h2 className="text-lg font-bold text-[#003866] mb-2">لا توجد سكريبتات</h2>
            <p className="text-sm text-muted-foreground">
              لم يتم رفع أي سكريبتات بعد. سيتم إشعارك عند توفرها.
            </p>
          </CardContent>
        </Card>
      ) : (
        /* ── Split Panel Layout ── */
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          {/* ── LEFT: Video List ── */}
          <Card className="border-[#e6dfd7]/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-[#003866] flex items-center gap-2">
                <Film className="h-4 w-4" />
                قائمة الفيديوهات
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-340px)] lg:h-[calc(100vh-280px)]">
                <div className="space-y-1 p-3">
                  {videoGroups.map((group) => {
                    const isSelected = selectedVideo === group.videoNumber;
                    const latestVersion = group.versions[group.versions.length - 1];

                    // Review status for latest version
                    const latestReview = reviewMap.get(latestVersion.filename);
                    const hasApproved = group.versions.every(
                      (v) => reviewMap.get(v.filename)?.status === 'approved'
                    );
                    const hasRevision = group.versions.some(
                      (v) => reviewMap.get(v.filename)?.status === 'revision_requested'
                    );

                    return (
                      <motion.button
                        key={group.videoNumber}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => handleSelectVideo(group.videoNumber)}
                        className={`w-full text-start rounded-lg p-3 transition-all ${
                          isSelected
                            ? 'bg-[#003866] text-white shadow-lg shadow-[#003866]/20'
                            : 'hover:bg-[#e6dfd7]/40 border border-transparent hover:border-[#e6dfd7]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${
                              isSelected
                                ? 'bg-[#b89a77] text-white'
                                : 'bg-[#003866]/10 text-[#003866]'
                            }`}
                          >
                            {String(group.videoNumber).padStart(2, '0')}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p
                              className={`text-sm font-medium truncate ${
                                isSelected ? 'text-white' : 'text-foreground'
                              }`}
                            >
                              {group.title}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span
                                className={`text-[10px] ${
                                  isSelected ? 'text-white/70' : 'text-muted-foreground'
                                }`}
                              >
                                {group.versions.length}{' '}
                                {group.versions.length === 1 ? 'نسخة' : 'نسخ'}
                              </span>
                              {latestReview && (
                                <span className={`text-[10px] flex items-center gap-0.5 ${
                                  isSelected ? 'text-white/70' : ''
                                }`}>
                                  • {hasApproved ? (
                                    <span className={isSelected ? 'text-green-300' : 'text-green-600'}>معتمد</span>
                                  ) : hasRevision ? (
                                    <span className={isSelected ? 'text-red-300' : 'text-red-500'}>تعديل</span>
                                  ) : (
                                    <span className={isSelected ? 'text-yellow-300' : 'text-yellow-600'}>قيد المراجعة</span>
                                  )}
                                </span>
                              )}
                              {!latestReview && latestVersion.updatedAt && (
                                <span
                                  className={`text-[10px] ${
                                    isSelected
                                      ? 'text-white/50'
                                      : 'text-muted-foreground/60'
                                  }`}
                                >
                                  •{' '}
                                  {new Date(latestVersion.updatedAt).toLocaleDateString(
                                    'ar-SA'
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                          {!isSelected && (
                            <ChevronLeft className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                          )}
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* ── RIGHT: Script Content ── */}
          <AnimatePresence mode="wait">
            {!selectedVideo ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <Card className="border-[#e6dfd7]/60">
                  <CardContent className="flex flex-col items-center justify-center py-24 text-center">
                    <div className="w-20 h-20 rounded-2xl bg-[#e6dfd7]/50 flex items-center justify-center mb-4">
                      <FileText className="h-10 w-10 text-[#003866]/30" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      اختر فيديو من القائمة لعرض السكريبت
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <motion.div
                key={`video-${selectedVideo}-${selectedVersion}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
              >
                <Card className="border-[#e6dfd7]/60">
                  {/* Script Header */}
                  <CardHeader className="border-b border-[#e6dfd7]/40">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-[#003866] flex items-center gap-2 flex-wrap">
                          <span className="text-[#b89a77]">
                            #{String(selectedGroup!.videoNumber).padStart(2, '0')}
                          </span>
                          {selectedGroup!.title}
                          {currentReview?.status === 'approved' && (
                            <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px]">
                              <CheckCircle className="h-3 w-3 me-1" />
                              معتمد
                            </Badge>
                          )}
                          {currentReview?.status === 'revision_requested' && (
                            <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">
                              <AlertTriangle className="h-3 w-3 me-1" />
                              مطلوب تعديل
                            </Badge>
                          )}
                        </CardTitle>
                        {currentVersion && (
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            {currentVersion.size != null && (
                              <span className="flex items-center gap-1">
                                <HardDrive className="h-3 w-3" />
                                {(currentVersion.size / 1024).toFixed(1)} KB
                              </span>
                            )}
                            {currentVersion.updatedAt && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(currentVersion.updatedAt).toLocaleString('ar-SA')}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCopy}
                          disabled={!scriptContent}
                          className="gap-1.5 border-[#003866]/20 text-[#003866] hover:bg-[#003866]/5"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          نسخ
                        </Button>
                        {currentVersion && (
                          <Button
                            size="sm"
                            onClick={() => handleDownload(currentVersion.filename)}
                            className="gap-1.5 bg-[#003866] hover:bg-[#003866]/90 text-white"
                          >
                            <Download className="h-3.5 w-3.5" />
                            تحميل
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Version Tabs */}
                    {selectedGroup!.versions.length > 1 && (
                      <Tabs
                        value={selectedVersion}
                        onValueChange={handleVersionChange}
                        className="mt-3"
                      >
                        <TabsList className="bg-[#e6dfd7]/30">
                          {selectedGroup!.versions.map((ver) => (
                            <TabsTrigger
                              key={ver.version}
                              value={`v${ver.version}`}
                              className="data-[state=active]:bg-[#003866] data-[state=active]:text-white text-xs"
                            >
                              النسخة {ver.version}
                            </TabsTrigger>
                          ))}
                        </TabsList>
                      </Tabs>
                    )}
                  </CardHeader>

                  {/* Script Content */}
                  <CardContent className="p-0">
                    {contentLoading ? (
                      <div className="flex items-center justify-center py-24">
                        <Loader2 className="h-8 w-8 animate-spin text-[#b89a77]" />
                      </div>
                    ) : scriptContent ? (
                      <ScrollArea className="h-[calc(100vh-400px)]">
                        <div className="p-6 lg:p-8" dir="rtl">
                          <article className="prose prose-sm max-w-none">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={markdownComponents}
                            >
                              {scriptContent}
                            </ReactMarkdown>
                          </article>

                          {/* ── Review Action Panel ── */}
                          <div className="mt-8 pt-6 border-t border-[#e6dfd7]">
                            {currentReview?.status === 'approved' ? (
                              /* Already approved */
                              <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 border border-green-200">
                                <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-green-800">
                                    تم اعتماد هذه النسخة
                                  </p>
                                  <p className="text-xs text-green-600 mt-0.5">
                                    بواسطة {currentReview.client_name}
                                    {currentReview.reviewed_at &&
                                      ` • ${new Date(currentReview.reviewed_at).toLocaleString('ar-SA')}`}
                                  </p>
                                  {currentReview.comment && (
                                    <p className="text-xs text-green-700 mt-2 bg-green-100 rounded p-2">
                                      {currentReview.comment}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ) : currentReview?.status === 'revision_requested' ? (
                              /* Revision requested — show previous comment + allow re-approve */
                              <div className="space-y-3">
                                <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 border border-red-200">
                                  <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-red-800">
                                      تم طلب تعديل على هذه النسخة
                                    </p>
                                    <p className="text-xs text-red-600 mt-0.5">
                                      بواسطة {currentReview.client_name}
                                      {currentReview.reviewed_at &&
                                        ` • ${new Date(currentReview.reviewed_at).toLocaleString('ar-SA')}`}
                                    </p>
                                    {currentReview.comment && (
                                      <p className="text-xs text-red-700 mt-2 bg-red-100 rounded p-2">
                                        {currentReview.comment}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => handleReview('approved')}
                                    disabled={reviewSubmitting}
                                    className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                                  >
                                    {reviewSubmitting ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <CheckCircle className="h-3.5 w-3.5" />
                                    )}
                                    اعتماد الآن
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              /* Pending — show approve/revision buttons */
                              <div className="space-y-3">
                                <p className="text-sm text-muted-foreground">
                                  بعد مراجعة السكريبت، يمكنك اعتماده أو طلب تعديلات:
                                </p>
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => handleReview('approved')}
                                    disabled={reviewSubmitting}
                                    className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                                  >
                                    {reviewSubmitting ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <CheckCircle className="h-3.5 w-3.5" />
                                    )}
                                    اعتماد السكريبت
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setShowRevisionForm(!showRevisionForm)}
                                    disabled={reviewSubmitting}
                                    className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
                                  >
                                    <MessageSquareWarning className="h-3.5 w-3.5" />
                                    طلب تعديل
                                  </Button>
                                </div>

                                <AnimatePresence>
                                  {showRevisionForm && (
                                    <motion.div
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: 'auto' }}
                                      exit={{ opacity: 0, height: 0 }}
                                      className="overflow-hidden"
                                    >
                                      <div className="space-y-2 pt-2">
                                        <textarea
                                          value={reviewComment}
                                          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReviewComment(e.target.value)}
                                          placeholder="اكتب ملاحظاتك وتعديلاتك المطلوبة..."
                                          className="w-full min-h-[100px] text-sm resize-none rounded-md border border-red-200 bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-transparent"
                                          dir="rtl"
                                          maxLength={5000}
                                        />
                                        <div className="flex items-center justify-between">
                                          <span className="text-[10px] text-muted-foreground">
                                            {reviewComment.length}/5000
                                          </span>
                                          <Button
                                            size="sm"
                                            onClick={() => handleReview('revision_requested')}
                                            disabled={reviewSubmitting || !reviewComment.trim()}
                                            className="gap-1.5 bg-red-600 hover:bg-red-700 text-white"
                                          >
                                            {reviewSubmitting ? (
                                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                              <MessageSquareWarning className="h-3.5 w-3.5" />
                                            )}
                                            إرسال طلب التعديل
                                          </Button>
                                        </div>
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            )}
                          </div>
                        </div>
                      </ScrollArea>
                    ) : (
                      <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
                        فشل في تحميل المحتوى
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
