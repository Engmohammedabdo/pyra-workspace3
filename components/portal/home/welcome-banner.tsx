'use client';

import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { LayoutDashboard, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

interface Props {
  client: { name: string; company: string; last_login_at: string | null };
  onRefresh: () => void;
  loading: boolean;
}

export function WelcomeBanner({ client, onRefresh, loading }: Props) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="overflow-hidden border-portal/20">
        <div className="relative bg-gradient-to-l from-portal/10 via-portal/5 to-transparent">
          <div className="absolute -top-10 -start-10 w-40 h-40 rounded-full bg-portal/5 blur-2xl" />
          <div className="absolute -bottom-10 -end-10 w-32 h-32 rounded-full bg-portal/5 blur-2xl" />
          <CardContent className="relative flex items-center gap-4 py-8 px-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-portal to-portal-secondary flex items-center justify-center shrink-0 shadow-lg shadow-portal/20">
              <LayoutDashboard className="h-7 w-7 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold truncate">
                مرحبا، {client.name ?? 'العميل'}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {client.company}
                {client.last_login_at && (
                  <span className="mx-2">
                    &middot; آخر دخول{' '}
                    {formatDate(client.last_login_at, 'dd MMM yyyy')}
                  </span>
                )}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={onRefresh}
              aria-label="تحديث"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </CardContent>
        </div>
      </Card>
    </motion.div>
  );
}
