'use client';

import {
  Users, TrendingUp, Star, CircleDot, Target, Download, Plus, Search, LayoutGrid, List
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils/cn';

interface HeaderProps {
  total: number;
  onExport: () => void;
  onCreate: () => void;
  view: 'table' | 'kanban';
  onViewChange: (view: 'table' | 'kanban') => void;
  searchInput: string;
  setSearchInput: (val: string) => void;
  filterPriority: string;
  setFilterPriority: (val: string) => void;
  filterSource: string;
  setFilterSource: (val: string) => void;
}

const PRIORITY_LABELS: Record<string, string> = { low: 'منخفضة', medium: 'متوسطة', high: 'عالية', urgent: 'عاجلة' };
const SOURCE_LABELS: Record<string, string> = { manual: 'يدوي', whatsapp: 'واتساب', website: 'موقع', referral: 'إحالة', ad: 'إعلان', social: 'سوشيال' };

export function LeadsHeader({ 
  total, onExport, onCreate, view, onViewChange, 
  searchInput, setSearchInput, filterPriority, setFilterPriority,
  filterSource, setFilterSource 
}: HeaderProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-400 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Target className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">العملاء المحتملين</h1>
            <p className="text-xs text-muted-foreground">{total} عميل محتمل</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onExport} className="rounded-xl gap-1.5">
            <Download className="h-4 w-4" /> تصدير
          </Button>
          <Button onClick={onCreate} className="bg-orange-500 hover:bg-orange-600 text-white gap-1.5 rounded-xl">
            <Plus className="h-4 w-4" /> عميل جديد
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="بحث بالاسم أو الهاتف أو البريد..."
            className="ps-9 rounded-xl"
          />
        </div>

        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-36 rounded-xl">
            <SelectValue placeholder="الأولوية" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأولويات</SelectItem>
            {Object.entries(PRIORITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterSource} onValueChange={setFilterSource}>
          <SelectTrigger className="w-36 rounded-xl">
            <SelectValue placeholder="المصدر" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المصادر</SelectItem>
            {Object.entries(SOURCE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="flex items-center border rounded-xl overflow-hidden ms-auto">
          <button onClick={() => onViewChange('kanban')} className={cn('p-2 transition-colors', view === 'kanban' ? 'bg-orange-500 text-white' : 'hover:bg-muted')}>
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button onClick={() => onViewChange('table')} className={cn('p-2 transition-colors', view === 'table' ? 'bg-orange-500 text-white' : 'hover:bg-muted')}>
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function MiniStat({ icon: Icon, label, value, color }: { icon: React.ElementType, label: string, value: number, color: 'orange' | 'emerald' | 'blue' | 'red' }) {
  const colorMap = {
    orange: 'from-orange-500/10 to-orange-500/5 text-orange-600',
    emerald: 'from-emerald-500/10 to-emerald-500/5 text-emerald-600',
    blue: 'from-blue-500/10 to-blue-500/5 text-blue-600',
    red: 'from-red-500/10 to-red-500/5 text-red-600',
  };
  return (
    <div className={cn('rounded-2xl bg-gradient-to-br p-3 border border-border/30', colorMap[color])}>
      <div className="flex items-center justify-between">
        <Icon className="h-4 w-4 opacity-60" />
        <span className="text-xl font-bold">{value}</span>
      </div>
      <p className="text-[11px] mt-0.5 opacity-70">{label}</p>
    </div>
  );
}
