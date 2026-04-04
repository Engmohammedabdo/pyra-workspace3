'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Film, ChevronLeft } from 'lucide-react';
import { motion } from 'framer-motion';

interface Group {
  videoNumber: number;
  title: string;
  versions: { id: string; version: number; filename: string; status: string }[];
}

export function ScriptList({ groups, selectedVideo, onSelect }: { groups: Group[]; selectedVideo: number | null; onSelect: (v: number) => void }) {
  return (
    <Card className="border-[#e6dfd7]/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-[#003866] flex items-center gap-2">
          <Film className="h-4 w-4" /> قائمة الفيديوهات
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[calc(100vh-340px)] lg:h-[calc(100vh-280px)]">
          <div className="space-y-1 p-3">
            {groups.map((group) => (
              <motion.button
                key={group.videoNumber}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => onSelect(group.videoNumber)}
                className={`w-full text-start rounded-lg p-3 transition-all ${
                  selectedVideo === group.videoNumber
                    ? 'bg-[#003866] text-white shadow-lg'
                    : 'hover:bg-[#e6dfd7]/40 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                    selectedVideo === group.videoNumber ? 'bg-[#b89a77] text-white' : 'bg-[#003866]/10 text-[#003866]'
                  }`}>
                    {String(group.videoNumber).padStart(2, '0')}
                  </div>
                  <p className="text-sm font-medium truncate flex-1">{group.title}</p>
                  {selectedVideo !== group.videoNumber && <ChevronLeft className="h-4 w-4 text-muted-foreground/40" />}
                </div>
              </motion.button>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
