'use client';

import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface ActionItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export function QuickActions({ actions }: { actions: ActionItem[] }) {
  const router = useRouter();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="grid grid-cols-2 sm:grid-cols-4 gap-3"
    >
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.href}
            onClick={() => router.push(action.href)}
            className="flex flex-col items-center justify-center gap-3 rounded-xl border bg-card p-6 hover:shadow-md hover:border-portal/30 dark:hover:border-portal/40 transition-all duration-200 group"
          >
            <div className="w-12 h-12 rounded-xl bg-portal/10 flex items-center justify-center group-hover:bg-portal/20 group-hover:scale-110 transition-all duration-300">
              <Icon className="h-6 w-6 text-portal" />
            </div>
            <span className="text-sm font-medium text-foreground">
              {action.label}
            </span>
          </button>
        );
      })}
    </motion.div>
  );
}
