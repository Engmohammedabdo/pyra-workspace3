'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Users, Zap, Target, Clock, UserCheck, Phone, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { StatCard } from '@/components/dashboard/sales-overview/StatCard';
import { WhatsAppQuickStats } from '@/components/dashboard/sales-overview/WhatsAppQuickStats';
import { PipelineFunnel } from '@/components/dashboard/sales-overview/PipelineFunnel';

const containerMotion = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const itemMotion: any = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } };

export function SalesOverviewContent() {
  const [stats, setStats] = useState<any>(null);
  const [waStats, setWaStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetch('/api/dashboard/sales/leads'), fetch('/api/dashboard/sales/pipeline-stages'), fetch('/api/dashboard/sales/follow-ups?status=pending'), fetch('/api/dashboard/sales/whatsapp/conversations')])
      .then(r => Promise.all(r.map(i => i.json())))
      .then(([l, s, f, c]) => {
        const leads = l.data || [];
        setStats({ total_leads: leads.length, new_this_week: leads.filter((l: any) => new Date(l.created_at) >= new Date(Date.now()-7*24*60*60*1000)).length, converted: leads.filter((l: any) => l.is_converted).length, pending_follow_ups: f.data?.length || 0, stages: s.data?.map((stage: any) => ({ name_ar: stage.name_ar, color: stage.color, count: leads.filter((l: any) => l.stage_id === stage.id).length })) || [] });
        const convs = c.data || [];
        setWaStats({ total_conversations: convs.length, messages_today: convs.reduce((sum: number, c: any) => sum + (c.unread_count || 0), 0), messages_received_today: convs.filter((c: any) => new Date(c.last_timestamp) >= new Date(new Date().setHours(0,0,0,0))).length });
      }).finally(() => setLoading(false));
  }, []);

  if(loading || !stats) return <div />;

  const statCards = [
    { label: 'إجمالي العملاء', value: stats.total_leads, icon: Users, gradient: 'from-blue-500 to-indigo-600', shadowColor: 'shadow-blue-500/25', trend: stats.new_this_week > 0 ? `+${stats.new_this_week} هذا الأسبوع` : null, trendUp: true },
    { label: 'جديد هذا الأسبوع', value: stats.new_this_week, icon: Zap, gradient: 'from-emerald-400 to-teal-600', shadowColor: 'shadow-emerald-500/25', trend: null, trendUp: true },
    { label: 'تم التحويل', value: stats.converted, icon: Target, gradient: 'from-orange-400 to-amber-600', shadowColor: 'shadow-orange-500/25', trend: `${(stats.total_leads > 0 ? (stats.converted/stats.total_leads)*100 : 0).toFixed(0)}% نسبة التحويل`, trendUp: true },
    { label: 'متابعات معلقة', value: stats.pending_follow_ups, icon: Clock, gradient: 'from-violet-500 to-purple-600', shadowColor: 'shadow-violet-500/25', trend: null, trendUp: false },
  ];

  return (
    <motion.div variants={containerMotion} initial="hidden" animate="show" className="space-y-8">
      <motion.div variants={itemMotion} className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-orange-400 to-amber-600 flex items-center justify-center shadow-lg"><TrendingUp className="h-6 w-6 text-white" /></div>
        <div><h1 className="text-2xl font-bold">لوحة المبيعات</h1><p className="text-sm text-muted-foreground">نظرة عامة على أداء فريق المبيعات</p></div>
      </motion.div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{statCards.map((c, i) => <motion.div key={i} variants={itemMotion}><StatCard {...c} /></motion.div>)}</div>
      {waStats && <motion.div variants={itemMotion}><WhatsAppQuickStats waStats={waStats} /></motion.div>}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6"><motion.div variants={itemMotion} className="lg:col-span-2"><PipelineFunnel stages={stats.stages} totalPipelineLeads={stats.total_leads} /></motion.div></div>
      <motion.div variants={itemMotion} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[ { label: 'إضافة عميل', href: '/dashboard/sales/leads', icon: UserCheck, color: 'from-orange-400 to-amber-500' }, { label: 'المحادثات', href: '/dashboard/sales/chat', icon: Phone, color: 'from-emerald-400 to-teal-500' }, { label: 'المتابعات', href: '/dashboard/sales/follow-ups', icon: Clock, color: 'from-violet-400 to-purple-500' }, { label: 'التقارير', href: '/dashboard/sales/reports', icon: BarChart3, color: 'from-blue-400 to-indigo-500' } ].map((a, i) => (
          <Link key={i} href={a.href}><div className="group rounded-2xl border p-4 hover:border-orange-300 transition-all bg-card/50"><div className={cn('h-10 w-10 rounded-xl bg-gradient-to-br flex items-center justify-center mb-3', a.color)}><a.icon className="h-5 w-5 text-white" /></div><p className="font-medium text-sm">{a.label}</p></div></Link>
        ))}
      </motion.div>
    </motion.div>
  );
}
