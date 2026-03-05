'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Search, Phone, Mail, Briefcase, Users,
} from 'lucide-react';
import { getRoleColorClasses } from '@/lib/auth/rbac';
import type { AuthSession } from '@/lib/auth/guards';

interface DirectoryUser {
  id: number;
  username: string;
  display_name: string | null;
  email: string | null;
  role: string;
  role_id: string | null;
  phone: string | null;
  job_title: string | null;
  avatar_url: string | null;
  bio: string | null;
  status: string;
  created_at: string;
  pyra_roles: {
    name: string;
    name_ar: string;
    color: string;
    icon: string;
  } | null;
  employment_type?: 'full_time' | 'part_time' | 'contractor' | 'freelancer';
  work_location?: 'remote' | 'onsite' | 'hybrid';
  department?: string;
}

interface DirectoryClientProps {
  session: AuthSession;
}

const EMPLOYMENT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  full_time: { label: 'دوام كامل', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  part_time: { label: 'دوام جزئي', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  contractor: { label: 'متعاقد', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  freelancer: { label: 'مستقل', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
};

const WORK_LOCATION_LABELS: Record<string, string> = {
  remote: 'عن بعد',
  onsite: 'حضوري',
  hybrid: 'هجين',
};

export default function DirectoryClient({ session }: DirectoryClientProps) {
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/directory')
      .then(res => res.json())
      .then(({ data }) => setUsers(data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(u =>
      u.display_name?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q) ||
      u.job_title?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    );
  }, [users, search]);

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">دليل الفريق</h1>
          <p className="text-sm text-muted-foreground">{users.length} عضو في الفريق</p>
        </div>
        <div className="relative w-72">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم، المسمى الوظيفي..."
            className="ps-10"
          />
        </div>
      </div>

      {/* Cards Grid */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="لا يوجد نتائج"
          description="حاول تغيير كلمات البحث"
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((user) => {
            const role = user.pyra_roles;
            const initials = (user.display_name || user.username || 'U').slice(0, 2).toUpperCase();
            return (
              <Card key={user.id} className="hover:border-orange-300 dark:hover:border-orange-700 transition-colors">
                <CardContent className="p-6 text-center space-y-3">
                  <Avatar className="h-16 w-16 mx-auto border-2 border-orange-200 dark:border-orange-800">
                    <AvatarImage src={user.avatar_url || undefined} alt={user.display_name || user.username} />
                    <AvatarFallback className="bg-orange-500/10 text-orange-600 font-bold text-lg">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-semibold text-sm">{user.display_name || user.username}</h3>
                    {user.job_title && (
                      <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
                        <Briefcase className="h-3 w-3" />
                        {user.job_title}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className={`text-[10px] ${getRoleColorClasses(role?.color || 'gray')}`}>
                    {role?.name_ar || (user.role === 'admin' ? 'مسؤول' : 'موظف')}
                  </Badge>
                  <div className="flex flex-wrap items-center justify-center gap-1">
                    {user.employment_type && EMPLOYMENT_TYPE_LABELS[user.employment_type] && (
                      <Badge className={`text-[10px] border-0 ${EMPLOYMENT_TYPE_LABELS[user.employment_type].color}`}>
                        {EMPLOYMENT_TYPE_LABELS[user.employment_type].label}
                      </Badge>
                    )}
                    {user.work_location && WORK_LOCATION_LABELS[user.work_location] && (
                      <Badge variant="outline" className="text-[10px]">
                        {WORK_LOCATION_LABELS[user.work_location]}
                      </Badge>
                    )}
                    {user.department && (
                      <Badge variant="outline" className="text-[10px]">
                        {user.department}
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {user.email && (
                      <p className="flex items-center justify-center gap-1 truncate">
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate" dir="ltr">{user.email}</span>
                      </p>
                    )}
                    {user.phone && (
                      <p className="flex items-center justify-center gap-1">
                        <Phone className="h-3 w-3 shrink-0" />
                        <span dir="ltr">{user.phone}</span>
                      </p>
                    )}
                  </div>
                  {user.status === 'inactive' && (
                    <Badge variant="secondary" className="text-[10px]">غير نشط</Badge>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
