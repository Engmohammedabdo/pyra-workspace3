'use client';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Copy, Download, HardDrive, Clock } from 'lucide-react';
import { CardHeader, CardTitle } from '@/components/ui/card';

export function ScriptHeader({
  videoNumber, title, currentVersion, versions,
  selectedVersion, onVersionChange, onCopy, onDownload,
}: any) {
  return (
    <CardHeader className="border-b border-[#e6dfd7]/40">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <CardTitle className="text-[#003866] flex items-center gap-2 flex-wrap">
            <span className="text-[#b89a77]">#{String(videoNumber).padStart(2, '0')}</span>
            {title}
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
          <Button variant="outline" size="sm" onClick={onCopy} className="gap-1.5 border-[#003866]/20">
            <Copy className="h-3.5 w-3.5" /> نسخ
          </Button>
          <Button size="sm" onClick={onDownload} className="gap-1.5 bg-[#003866] text-white">
            <Download className="h-3.5 w-3.5" /> تحميل
          </Button>
        </div>
      </div>

      {versions.length > 1 && (
        <Tabs value={selectedVersion} onValueChange={onVersionChange} className="mt-3">
          <TabsList className="bg-[#e6dfd7]/30">
            {versions.map((ver: any) => (
              <TabsTrigger key={ver.version} value={`v${ver.version}`} className="data-[state=active]:bg-[#003866] data-[state=active]:text-white text-xs">
                النسخة {ver.version}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
    </CardHeader>
  );
}
