'use client';

import { useState, useRef } from 'react';
import {
  FolderPlus,
  Upload,
  LayoutGrid,
  LayoutList,
  RefreshCw,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export type ViewMode = 'grid' | 'list';

interface FileToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onCreateFolder: (name: string) => void;
  onUploadFiles: (files: File[]) => void;
  onRefresh: () => void;
  onSearch: (query: string) => void;
  isLoading: boolean;
  isUploading: boolean;
  isCreating: boolean;
}

export function FileToolbar({
  viewMode,
  onViewModeChange,
  onCreateFolder,
  onUploadFiles,
  onRefresh,
  onSearch,
  isLoading,
  isUploading,
  isCreating,
}: FileToolbarProps) {
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCreateFolder = () => {
    const name = folderName.trim();
    if (!name) return;
    onCreateFolder(name);
    setFolderName('');
    setShowNewFolder(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onUploadFiles(files);
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-3">
      {/* Main toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* New Folder */}
        <button
          onClick={() => setShowNewFolder(!showNewFolder)}
          disabled={isCreating}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
            'bg-primary text-primary-foreground hover:bg-primary/90',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <FolderPlus size={16} />
          <span>مجلد جديد</span>
        </button>

        {/* Upload */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
            'bg-secondary text-secondary-foreground hover:bg-secondary/80',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <Upload size={16} />
          <span>{isUploading ? 'جاري الرفع...' : 'رفع ملفات'}</span>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Spacer */}
        <div className="flex-1" />

        {/* Search */}
        <div className="relative">
          <Search
            size={16}
            className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            placeholder="بحث..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              onSearch(e.target.value);
            }}
            className={cn(
              'ps-9 pe-3 py-2 rounded-lg text-sm w-[200px]',
              'bg-secondary/50 border border-border',
              'placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1'
            )}
          />
        </div>

        {/* Refresh */}
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className={cn(
            'p-2 rounded-lg transition-colors',
            'hover:bg-accent text-muted-foreground hover:text-accent-foreground',
            'disabled:opacity-50'
          )}
          title="تحديث"
        >
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
        </button>

        {/* View Toggle */}
        <div className="flex items-center border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => onViewModeChange('grid')}
            className={cn(
              'p-2 transition-colors',
              viewMode === 'grid'
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent text-muted-foreground'
            )}
            title="عرض شبكي"
          >
            <LayoutGrid size={16} />
          </button>
          <button
            onClick={() => onViewModeChange('list')}
            className={cn(
              'p-2 transition-colors',
              viewMode === 'list'
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent text-muted-foreground'
            )}
            title="عرض قائمة"
          >
            <LayoutList size={16} />
          </button>
        </div>
      </div>

      {/* New Folder Input */}
      {showNewFolder && (
        <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border border-border">
          <FolderPlus size={18} className="text-pyra-orange shrink-0" />
          <input
            type="text"
            autoFocus
            placeholder="اسم المجلد الجديد"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder();
              if (e.key === 'Escape') {
                setShowNewFolder(false);
                setFolderName('');
              }
            }}
            className={cn(
              'flex-1 px-3 py-1.5 rounded-md text-sm bg-background border border-border',
              'placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-2 focus:ring-ring'
            )}
          />
          <button
            onClick={handleCreateFolder}
            disabled={!folderName.trim() || isCreating}
            className={cn(
              'px-3 py-1.5 rounded-md text-sm font-medium',
              'bg-primary text-primary-foreground hover:bg-primary/90',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isCreating ? 'جاري الإنشاء...' : 'إنشاء'}
          </button>
          <button
            onClick={() => {
              setShowNewFolder(false);
              setFolderName('');
            }}
            className="px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-accent"
          >
            إلغاء
          </button>
        </div>
      )}
    </div>
  );
}
