'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ScriptList } from '@/components/portal/scripts/ScriptList';
import { ScriptHeader } from '@/components/portal/scripts/ScriptHeader';
import { ScriptContent } from '@/components/portal/scripts/ScriptContent';
import { Card } from '@/components/ui/card';
import { Film, RefreshCw, Badge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

// ... (Types & Logic helpers remain available locally)

export default function EtmamScriptsPage() {
  const [selectedVideo, setSelectedVideo] = useState<number | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [scriptContent, setScriptContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);

  // ... (Fetch logic remains)

  return (
    <div className="space-y-6" dir="rtl">
      <motion.div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#003866] flex items-center justify-center">
            <Film className="h-5 w-5 text-[#b89a77]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#003866]">سكريبتات إتمام</h1>
            <p className="text-sm text-muted-foreground">سكريبتات الفيديوهات الخاصة بمركز إتمام</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        <ScriptList groups={[]} selectedVideo={selectedVideo} onSelect={() => {}} />
        <Card className="border-[#e6dfd7]/60">
            {/* Header + Content */}
        </Card>
      </div>
    </div>
  );
}
