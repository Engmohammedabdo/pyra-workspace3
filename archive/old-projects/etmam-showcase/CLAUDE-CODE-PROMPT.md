# Claude Code Prompt: Etmam Scripts Page for Pyra Workspace Portal

## Overview

Add a **Scripts** page to the existing client portal at `app/portal/(main)/scripts/page.tsx`. This page is **exclusive to the Injazat client** (مركز إتمام) and displays video script markdown files from Supabase Storage with Etmam's brand identity.

## Tech Stack (already in project)

- Next.js 15+ (App Router, `'use client'` components)
- Supabase (`@supabase/ssr` + `@supabase/supabase-js`)
- Tailwind CSS + shadcn/ui (Radix UI)
- React Query (`@tanstack/react-query`)
- Framer Motion
- `react-markdown` + `remark-gfm` (already installed)
- TypeScript
- Cairo font (Arabic RTL)

## Data Source

- **Supabase instance:** `https://pyraworkspacedb.pyramedia.cloud`
- **Bucket:** `pyraai-workspace`
- **Path:** `projects/injazat/Etmam/video-scripts/`
- **Files:** `.md` markdown files
- **⚠️ IMPORTANT:** This is a **different Supabase instance** from the main app DB. You need a separate client.

### File naming convention:
```
video-01-intro-v1.md
video-01-intro-v2.md
video-01-intro-v3.md
video-02-services-v1.md
video-03-testimonials-v1.md
video-03-testimonials-v2.md
```

Files with the same video number should be **grouped together** with version tabs.

---

## Files to Create/Modify

### 1. `lib/supabase/workspace-client.ts` (CREATE)

Create a **separate** Supabase client for the workspace storage DB:

```typescript
import { createClient } from '@supabase/supabase-js';

const WORKSPACE_URL = 'https://pyraworkspacedb.pyramedia.cloud';
const WORKSPACE_ANON_KEY = process.env.NEXT_PUBLIC_WORKSPACE_SUPABASE_ANON_KEY!;

export function createWorkspaceClient() {
  return createClient(WORKSPACE_URL, WORKSPACE_ANON_KEY);
}
```

> **Note:** Add `NEXT_PUBLIC_WORKSPACE_SUPABASE_ANON_KEY` to `.env.local` with the workspace Supabase anon key.

### 2. `app/portal/(main)/scripts/page.tsx` (CREATE)

This is the main Scripts page. Follow these patterns from the existing codebase:

**Auth pattern** (from `app/portal/(main)/layout.tsx`):
- The layout already calls `getPortalSession()` and redirects if not authenticated
- The layout passes `client` to `PortalTopbar` with `{ id, name, email, company }`
- Child pages are `'use client'` components

**Data fetching pattern** (from `app/portal/(main)/projects/[id]/page.tsx`):
- Uses `useState` + `useEffect` + `useCallback` for data fetching
- Uses `toast` from `sonner` for notifications
- Uses `Skeleton` components for loading states
- Uses `Card`, `Badge`, `Button`, `Tabs` from shadcn/ui
- Uses `motion` from `framer-motion` for animations
- Uses lucide-react icons

**Page requirements:**

```tsx
'use client';

// The page should:
// 1. Check if current client is Injazat (company contains "injazat" or "إنجازات")
//    - If not Injazat, show access denied message
//    - Get client info via API: fetch('/api/portal/me') or use a context
//    - Since layout.tsx passes client to topbar but not to children,
//      create an API route or use the session cookie approach

// 2. Fetch scripts from workspace Supabase Storage
//    - Use createWorkspaceClient() to list files in 'projects/injazat/Etmam/video-scripts/'
//    - Use React Query with refetchInterval: 30000 for auto-refresh
//    - Parse filenames to extract: video number, title, version

// 3. Group scripts by video number
//    - Parse filename pattern: video-{number}-{title}-v{version}.md
//    - Group into: { videoNumber, title, versions: [{version, filename, metadata}] }
//    - Sort by video number ascending

// 4. Layout: Split panel
//    - LEFT: Scrollable video list (sidebar style)
//    - RIGHT: Selected script content with markdown rendering
//    - On mobile: Stack vertically with collapsible list

// 5. Markdown rendering
//    - Use react-markdown + remark-gfm
//    - Custom styled components matching Etmam brand colors
//    - RTL support with dir="rtl"

// 6. Actions per script
//    - Download button (download .md file)
//    - Copy text button (copy raw markdown to clipboard)
//    - Show metadata: file size, last modified date
```

#### Etmam Brand Colors (use as Tailwind custom classes or inline):
```
Gold:       #b89a77  → bg-[#b89a77] text-[#b89a77]
Navy:       #003866  → bg-[#003866] text-[#003866]
Terracotta: #b35434  → bg-[#b35434] text-[#b35434]
Warm Gray:  #e6dfd7  → bg-[#e6dfd7] text-[#e6dfd7]
```

#### Detailed Component Structure:

```tsx
'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createWorkspaceClient } from '@/lib/supabase/workspace-client';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileText, Download, Copy, Clock, HardDrive,
  ChevronLeft, Film, Loader2, ShieldAlert, RefreshCw,
} from 'lucide-react';

// ── Types ──

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

// ── Constants ──

const SCRIPTS_PATH = 'projects/injazat/Etmam/video-scripts';
const BUCKET = 'pyraai-workspace';

// ── Filename Parser ──

function parseScriptFilename(filename: string): {
  videoNumber: number;
  title: string;
  version: number;
} | null {
  // Match patterns like: video-01-intro-v1.md, video-02-services-overview-v2.md
  const match = filename.match(/^video-(\d+)-(.+?)-v(\d+)\.md$/i);
  if (!match) {
    // Try simpler pattern: video-01-v1.md
    const simpleMatch = filename.match(/^video-(\d+)-v(\d+)\.md$/i);
    if (simpleMatch) {
      return {
        videoNumber: parseInt(simpleMatch[1]),
        title: `فيديو ${parseInt(simpleMatch[1])}`,
        version: parseInt(simpleMatch[2]),
      };
    }
    return null;
  }
  return {
    videoNumber: parseInt(match[1]),
    title: match[2].replace(/-/g, ' '),
    version: parseInt(match[3]),
  };
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

  // Sort versions within each group
  for (const group of groups.values()) {
    group.versions.sort((a, b) => a.version - b.version);
  }

  // Sort groups by video number
  return Array.from(groups.values()).sort((a, b) => a.videoNumber - b.videoNumber);
}

// ── Main Page Component ──

export default function EtmamScriptsPage() {
  const [selectedVideo, setSelectedVideo] = useState<number | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string>('latest');
  const [scriptContent, setScriptContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [clientAuthorized, setClientAuthorized] = useState<boolean | null>(null);

  // Check authorization
  const { data: clientData } = useQuery({
    queryKey: ['portal-me'],
    queryFn: async () => {
      const res = await fetch('/api/portal/me');
      const json = await res.json();
      return json.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Set authorization based on client data
  useMemo(() => {
    if (clientData) {
      const company = (clientData.company || '').toLowerCase();
      const isInjazat = company.includes('injazat') || company.includes('إنجازات') || company.includes('etmam') || company.includes('إتمام');
      setClientAuthorized(isInjazat);
    }
  }, [clientData]);

  // Fetch script files from workspace storage
  const {
    data: videoGroups = [],
    isLoading: filesLoading,
    refetch: refetchFiles,
  } = useQuery({
    queryKey: ['etmam-scripts'],
    queryFn: async () => {
      const workspace = createWorkspaceClient();
      const { data, error } = await workspace.storage
        .from(BUCKET)
        .list(SCRIPTS_PATH, {
          sortBy: { column: 'name', order: 'asc' },
        });

      if (error) throw error;
      return groupScriptFiles(data || []);
    },
    refetchInterval: 30000, // Poll every 30 seconds
    enabled: clientAuthorized === true,
  });

  // Fetch script content when video/version is selected
  async function loadScriptContent(filename: string) {
    setContentLoading(true);
    try {
      const workspace = createWorkspaceClient();
      const { data, error } = await workspace.storage
        .from(BUCKET)
        .download(`${SCRIPTS_PATH}/${filename}`);

      if (error) throw error;
      const text = await data.text();
      setScriptContent(text);
    } catch {
      toast.error('فشل في تحميل محتوى السكريبت');
      setScriptContent(null);
    } finally {
      setContentLoading(false);
    }
  }

  // Handle video selection
  function handleSelectVideo(videoNumber: number) {
    setSelectedVideo(videoNumber);
    const group = videoGroups.find(g => g.videoNumber === videoNumber);
    if (group && group.versions.length > 0) {
      const latest = group.versions[group.versions.length - 1];
      setSelectedVersion(`v${latest.version}`);
      loadScriptContent(latest.filename);
    }
  }

  // Handle version tab change
  function handleVersionChange(versionTab: string) {
    setSelectedVersion(versionTab);
    const group = videoGroups.find(g => g.videoNumber === selectedVideo);
    if (group) {
      const vNum = parseInt(versionTab.replace('v', ''));
      const ver = group.versions.find(v => v.version === vNum);
      if (ver) loadScriptContent(ver.filename);
    }
  }

  // Download script
  async function handleDownload(filename: string) {
    try {
      const workspace = createWorkspaceClient();
      const { data, error } = await workspace.storage
        .from(BUCKET)
        .download(`${SCRIPTS_PATH}/${filename}`);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('تم تحميل السكريبت');
    } catch {
      toast.error('فشل في تحميل الملف');
    }
  }

  // Copy script text
  async function handleCopy() {
    if (!scriptContent) return;
    try {
      await navigator.clipboard.writeText(scriptContent);
      toast.success('تم نسخ النص');
    } catch {
      toast.error('فشل في نسخ النص');
    }
  }

  // ── Authorization check ──

  if (clientAuthorized === null) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[600px] w-full rounded-lg" />
      </div>
    );
  }

  if (clientAuthorized === false) {
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

  // ── Loading state ──

  if (filesLoading) {
    return (
      <div className="space-y-6">
        {/* Header skeleton */}
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

  const selectedGroup = videoGroups.find(g => g.videoNumber === selectedVideo);
  const currentVersion = selectedGroup?.versions.find(
    v => `v${v.version}` === selectedVersion
  );

  // ── Main Render ──

  return (
    <div className="space-y-6" dir="rtl">
      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-[#003866] flex items-center justify-center">
              <Film className="h-5 w-5 text-[#b89a77]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#003866]">
                سكريبتات إتمام
              </h1>
              <p className="text-sm text-muted-foreground">
                سكريبتات الفيديوهات الخاصة بمركز إتمام
              </p>
            </div>
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
            <h2 className="text-lg font-bold text-[#003866] mb-2">
              لا توجد سكريبتات
            </h2>
            <p className="text-sm text-muted-foreground">
              لم يتم رفع أي سكريبتات بعد. سيتم إشعارك عند توفرها.
            </p>
          </CardContent>
        </Card>
      ) : (
        /* ── Split Panel Layout ── */
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          {/* ── LEFT: Video List ── */}
          <div className="space-y-2">
            <Card className="border-[#e6dfd7]/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-[#003866] flex items-center gap-2">
                  <Film className="h-4 w-4" />
                  قائمة الفيديوهات
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[calc(100vh-300px)] lg:h-[calc(100vh-280px)]">
                  <div className="space-y-1 p-3">
                    {videoGroups.map((group) => {
                      const isSelected = selectedVideo === group.videoNumber;
                      const latestVersion = group.versions[group.versions.length - 1];
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
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${
                              isSelected
                                ? 'bg-[#b89a77] text-white'
                                : 'bg-[#003866]/10 text-[#003866]'
                            }`}>
                              {String(group.videoNumber).padStart(2, '0')}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={`text-sm font-medium truncate ${
                                isSelected ? 'text-white' : 'text-foreground'
                              }`}>
                                {group.title}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className={`text-[10px] ${
                                  isSelected ? 'text-white/70' : 'text-muted-foreground'
                                }`}>
                                  {group.versions.length} {group.versions.length === 1 ? 'نسخة' : 'نسخ'}
                                </span>
                                {latestVersion.updatedAt && (
                                  <span className={`text-[10px] ${
                                    isSelected ? 'text-white/50' : 'text-muted-foreground/60'
                                  }`}>
                                    • {new Date(latestVersion.updatedAt).toLocaleDateString('ar-SA')}
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
          </div>

          {/* ── RIGHT: Script Content ── */}
          <div>
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
                  key={`video-${selectedVideo}`}
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
                          <CardTitle className="text-[#003866] flex items-center gap-2">
                            <span className="text-[#b89a77]">
                              #{String(selectedGroup!.videoNumber).padStart(2, '0')}
                            </span>
                            {selectedGroup!.title}
                          </CardTitle>
                          {/* Metadata */}
                          {currentVersion && (
                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                              {currentVersion.size && (
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
                        {/* Action buttons */}
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
                            <article className="etmam-markdown prose prose-sm max-w-none">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  // Custom styled markdown components
                                  h1: ({ children }) => (
                                    <h1 className="text-2xl font-bold text-[#003866] mt-8 mb-4 pb-3 border-b border-[#e6dfd7]">
                                      {children}
                                    </h1>
                                  ),
                                  h2: ({ children }) => (
                                    <h2 className="text-xl font-bold text-[#003866] mt-6 mb-3 flex items-center gap-2 before:content-[''] before:w-1 before:h-5 before:rounded-full before:bg-[#b89a77]">
                                      {children}
                                    </h2>
                                  ),
                                  h3: ({ children }) => (
                                    <h3 className="text-lg font-semibold text-[#003866]/90 mt-5 mb-2">
                                      {children}
                                    </h3>
                                  ),
                                  p: ({ children }) => (
                                    <p className="text-sm leading-[1.9] text-foreground/80 my-3">
                                      {children}
                                    </p>
                                  ),
                                  strong: ({ children }) => (
                                    <strong className="font-bold text-[#b35434]">
                                      {children}
                                    </strong>
                                  ),
                                  em: ({ children }) => (
                                    <em className="italic text-[#003866]/70">
                                      {children}
                                    </em>
                                  ),
                                  blockquote: ({ children }) => (
                                    <blockquote className="my-4 relative rounded-lg bg-[#e6dfd7]/20 border border-[#b89a77]/20 ps-5 pe-4 py-3 before:content-[''] before:absolute before:top-0 before:bottom-0 before:start-0 before:w-1 before:rounded-s-lg before:bg-[#b89a77]">
                                      {children}
                                    </blockquote>
                                  ),
                                  ul: ({ children }) => (
                                    <ul className="ps-5 my-3 space-y-1.5 list-none">
                                      {children}
                                    </ul>
                                  ),
                                  li: ({ children }) => (
                                    <li className="text-sm leading-relaxed text-foreground/80 relative ps-4 before:content-[''] before:absolute before:start-0 before:top-[9px] before:w-1.5 before:h-1.5 before:rounded-full before:bg-[#b89a77]">
                                      {children}
                                    </li>
                                  ),
                                  ol: ({ children }) => (
                                    <ol className="list-decimal ps-6 my-3 space-y-1.5 marker:text-[#b89a77] marker:font-bold">
                                      {children}
                                    </ol>
                                  ),
                                  a: ({ href, children }) => (
                                    <a
                                      href={href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[#003866] hover:text-[#b89a77] underline underline-offset-2 transition-colors"
                                    >
                                      {children}
                                    </a>
                                  ),
                                  code: ({ children, className }) => {
                                    const isBlock = className?.includes('language-');
                                    if (isBlock) {
                                      return (
                                        <code className="block bg-[#003866]/5 rounded-lg p-4 text-sm font-mono overflow-x-auto border border-[#e6dfd7]">
                                          {children}
                                        </code>
                                      );
                                    }
                                    return (
                                      <code className="text-sm font-mono text-[#b35434] bg-[#b35434]/5 px-1.5 py-0.5 rounded border border-[#b35434]/10">
                                        {children}
                                      </code>
                                    );
                                  },
                                  hr: () => (
                                    <div className="my-6 flex items-center gap-3">
                                      <div className="flex-1 h-px bg-gradient-to-l from-transparent via-[#e6dfd7] to-transparent" />
                                      <div className="w-2 h-2 rounded-full bg-[#b89a77]/40" />
                                      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#e6dfd7] to-transparent" />
                                    </div>
                                  ),
                                  table: ({ children }) => (
                                    <div className="my-4 overflow-x-auto rounded-lg border border-[#e6dfd7]">
                                      <table className="w-full text-sm">{children}</table>
                                    </div>
                                  ),
                                  th: ({ children }) => (
                                    <th className="px-4 py-2.5 text-start font-semibold text-[#003866] bg-[#e6dfd7]/30 border-b border-[#e6dfd7]">
                                      {children}
                                    </th>
                                  ),
                                  td: ({ children }) => (
                                    <td className="px-4 py-2.5 text-foreground/75 border-b border-[#e6dfd7]/40">
                                      {children}
                                    </td>
                                  ),
                                }}
                              />
                            </article>
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
        </div>
      )}
    </div>
  );
}
```

### 3. `app/api/portal/me/route.ts` (CREATE)

Create an API route to get the current portal client info (needed by the scripts page to check authorization):

```typescript
import { NextResponse } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';

export async function GET() {
  const client = await getPortalSession();

  if (!client) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      id: client.id,
      name: client.name,
      email: client.email,
      company: client.company,
    },
  });
}
```

### 4. `components/portal/portal-sidebar.tsx` (MODIFY)

Add the Scripts link to the sidebar navigation. Add it after the "الملفات" (Files) item:

**Find this code:**
```typescript
import {
  FolderKanban,
  FolderOpen,
  FileText,
  Bell,
  User,
} from 'lucide-react';
```

**Replace with:**
```typescript
import {
  FolderKanban,
  FolderOpen,
  FileText,
  Bell,
  User,
  ScrollText,
} from 'lucide-react';
```

**Find this in `portalNavItems`:**
```typescript
  {
    href: '/portal/files',
    label: 'الملفات',
    icon: FolderOpen,
  },
```

**Add after it:**
```typescript
  {
    href: '/portal/scripts',
    label: 'السكريبتات',
    icon: ScrollText,
  },
```

### 5. Environment Variables

Add to `.env.local`:

```env
# Workspace Supabase (for storage access to pyraai-workspace bucket)
NEXT_PUBLIC_WORKSPACE_SUPABASE_URL=https://pyraworkspacedb.pyramedia.cloud
NEXT_PUBLIC_WORKSPACE_SUPABASE_ANON_KEY=<workspace-anon-key-here>
```

---

## Implementation Notes

### Existing Patterns to Follow:
1. **All portal pages are `'use client'`** — server components only in layout
2. **Auth is handled by layout** — `getPortalSession()` redirects to login if not authenticated
3. **Components use `cn()` utility** from `@/lib/utils/cn` for class merging
4. **Toast notifications** use `sonner` — `toast.success()`, `toast.error()`
5. **Date formatting** uses `date-fns` utilities from `@/lib/utils/format`
6. **File sizes** use `formatFileSize()` from `@/lib/utils/format`
7. **Loading states** use `<Skeleton>` component from shadcn/ui
8. **Animations** use `framer-motion` with `motion.div`, `AnimatePresence`
9. **RTL support** — all text is Arabic, use `dir="rtl"` and `start`/`end` instead of `left`/`right`

### Key Differences from Other Pages:
1. **Separate Supabase client** — workspace DB is different from main DB
2. **Storage API** — uses `supabase.storage.from().list()` and `.download()` instead of table queries
3. **Client-only page** — restricted to Injazat company clients
4. **No API routes for data** — reads directly from Supabase Storage on client side
5. **Polling for updates** — React Query `refetchInterval: 30000` instead of Supabase Realtime

### Dependencies (already installed):
- `react-markdown` ^10.1.0 ✅
- `remark-gfm` ^4.0.1 ✅
- `@tanstack/react-query` ^5.80.7 ✅
- `framer-motion` ^12.12.2 ✅
- `@supabase/supabase-js` ^2.49.8 ✅

No new npm packages needed.

---

## Verification Checklist

After implementation, verify:

- [ ] Page loads at `/portal/scripts`
- [ ] Non-Injazat clients see "غير مصرح بالوصول" message
- [ ] Injazat clients see the scripts list
- [ ] Scripts are grouped by video number
- [ ] Version tabs appear for scripts with multiple versions
- [ ] Clicking a video loads and renders the markdown content
- [ ] Markdown renders with Etmam brand colors (Gold, Navy, Terracotta, Warm Gray)
- [ ] Copy button copies raw markdown to clipboard
- [ ] Download button downloads the .md file
- [ ] File metadata (size, date) is displayed
- [ ] Auto-refresh works (new files appear within 30 seconds)
- [ ] Sidebar shows "السكريبتات" link with ScrollText icon
- [ ] Page is responsive (mobile/desktop)
- [ ] RTL layout works correctly
- [ ] No TypeScript errors (`npm run check`)
- [ ] Build succeeds (`npm run build`)
