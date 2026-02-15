'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  FileText,
  Bell,
  Activity,
  Settings,
  Shield,
  Trash2,
  Star,
  UsersRound,
  Search,
  HardDrive,
} from 'lucide-react';

const NAV_ITEMS = [
  { label: 'لوحة التحكم', path: '/dashboard', icon: LayoutDashboard, keywords: 'dashboard home الرئيسية' },
  { label: 'المشاريع', path: '/dashboard/projects', icon: FolderKanban, keywords: 'projects مشاريع' },
  { label: 'العملاء', path: '/dashboard/clients', icon: Users, keywords: 'clients عملاء' },
  { label: 'عروض الأسعار', path: '/dashboard/quotes', icon: FileText, keywords: 'quotes عروض اسعار' },
  { label: 'عرض سعر جديد', path: '/dashboard/quotes/new', icon: FileText, keywords: 'new quote عرض سعر جديد' },
  { label: 'الملفات', path: '/dashboard/files', icon: HardDrive, keywords: 'files ملفات' },
  { label: 'الفريق', path: '/dashboard/teams', icon: UsersRound, keywords: 'teams فريق' },
  { label: 'المستخدمون', path: '/dashboard/users', icon: Users, keywords: 'users مستخدمون' },
  { label: 'الإشعارات', path: '/dashboard/notifications', icon: Bell, keywords: 'notifications إشعارات' },
  { label: 'سجل النشاط', path: '/dashboard/activity', icon: Activity, keywords: 'activity نشاط سجل' },
  { label: 'التقييمات', path: '/dashboard/reviews', icon: Star, keywords: 'reviews تقييمات' },
  { label: 'الصلاحيات', path: '/dashboard/permissions', icon: Shield, keywords: 'permissions صلاحيات' },
  { label: 'الإعدادات', path: '/dashboard/settings', icon: Settings, keywords: 'settings إعدادات' },
  { label: 'سلة المحذوفات', path: '/dashboard/trash', icon: Trash2, keywords: 'trash محذوفات سلة' },
];

interface CommandPaletteProps {
  trigger?: React.ReactNode;
}

export function CommandPalette({ trigger }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  // Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelect = useCallback(
    (path: string) => {
      setOpen(false);
      router.push(path);
    },
    [router]
  );

  return (
    <>
      {/* Optional trigger button */}
      {trigger && (
        <div onClick={() => setOpen(true)} className="cursor-pointer">
          {trigger}
        </div>
      )}

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="ابحث عن صفحة..." dir="rtl" />
        <CommandList>
          <CommandEmpty>لا توجد نتائج</CommandEmpty>
          <CommandGroup heading="الصفحات">
            {NAV_ITEMS.map((item) => (
              <CommandItem
                key={item.path}
                value={`${item.label} ${item.keywords}`}
                onSelect={() => handleSelect(item.path)}
                className="gap-2"
              >
                <item.icon className="h-4 w-4 text-muted-foreground" />
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}

// Export SearchTrigger for use in topbar
export function SearchTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="hidden sm:flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
    >
      <Search className="h-3.5 w-3.5" />
      <span>بحث...</span>
      <kbd className="pointer-events-none ms-4 hidden select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
        <span className="text-xs">Ctrl</span>K
      </kbd>
    </button>
  );
}
