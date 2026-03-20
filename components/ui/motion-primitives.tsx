'use client';

import { motion, AnimatePresence, type Variants, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils/cn';
import { useEffect, useRef, useState } from 'react';

// ═══════════════════════════════════════════════════
//  Shared transition presets
// ═══════════════════════════════════════════════════

export const springBounce = { type: 'spring' as const, stiffness: 400, damping: 25 };
export const springSmooth = { type: 'spring' as const, stiffness: 300, damping: 30 };
export const easeOut = { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] as const };

// ═══════════════════════════════════════════════════
//  FadeIn — simple opacity fade with optional direction
// ═══════════════════════════════════════════════════

interface FadeInProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode;
  direction?: 'up' | 'down' | 'start' | 'end';
  distance?: number;
  delay?: number;
  duration?: number;
  className?: string;
}

export function FadeIn({
  children,
  direction,
  distance = 16,
  delay = 0,
  duration = 0.4,
  className,
  ...props
}: FadeInProps) {
  const dirMap: Record<string, { x?: number; y?: number }> = {
    up: { y: distance },
    down: { y: -distance },
    start: { x: distance },    // RTL: start = right
    end: { x: -distance },
  };
  const offset = direction ? dirMap[direction] : {};

  return (
    <motion.div
      initial={{ opacity: 0, ...offset }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════
//  ScaleIn — appear with scale bounce
// ═══════════════════════════════════════════════════

interface ScaleInProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}

export function ScaleIn({ children, delay = 0, className }: ScaleInProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ ...springBounce, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════
//  HoverCard — lift + shadow on hover (for Cards)
// ═══════════════════════════════════════════════════

interface HoverCardProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode;
  className?: string;
  lift?: number;
  /** Scale factor on hover (default 1.01) */
  hoverScale?: number;
}

export function HoverCard({ children, className, lift = 4, hoverScale = 1.01, ...props }: HoverCardProps) {
  return (
    <motion.div
      whileHover={{ y: -lift, scale: hoverScale }}
      whileTap={{ scale: 0.99 }}
      transition={easeOut}
      className={cn(
        'transition-shadow duration-300 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20',
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════
//  AnimatedCounter — count up to a number
// ═══════════════════════════════════════════════════

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  formatFn?: (n: number) => string;
  className?: string;
}

export function AnimatedCounter({
  value,
  duration = 1.2,
  formatFn,
  className,
}: AnimatedCounterProps) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number | null>(null);
  const startRef = useRef(0);

  useEffect(() => {
    const startVal = startRef.current;
    const diff = value - startVal;
    if (diff === 0) return;

    const startTime = performance.now();
    const durationMs = duration * 1000;

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      // easeOutQuart
      const eased = 1 - Math.pow(1 - progress, 4);
      const current = startVal + diff * eased;
      setDisplay(current);

      if (progress < 1) {
        ref.current = requestAnimationFrame(step);
      } else {
        startRef.current = value;
      }
    };

    ref.current = requestAnimationFrame(step);
    return () => { if (ref.current) cancelAnimationFrame(ref.current); };
  }, [value, duration]);

  const formatted = formatFn ? formatFn(Math.round(display)) : Math.round(display).toLocaleString();

  return <span className={className}>{formatted}</span>;
}

// ═══════════════════════════════════════════════════
//  PulseIcon — throb animation for notifications
// ═══════════════════════════════════════════════════

interface PulseIconProps {
  children: React.ReactNode;
  active?: boolean;
  className?: string;
}

export function PulseIcon({ children, active = false, className }: PulseIconProps) {
  return (
    <motion.div
      animate={active ? {
        scale: [1, 1.15, 1],
      } : {}}
      transition={active ? {
        duration: 0.6,
        repeat: 2,
        ease: 'easeInOut',
      } : {}}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════
//  SlideCollapse — collapsible content with height anim
// ═══════════════════════════════════════════════════

interface SlideCollapseProps {
  open: boolean;
  children: React.ReactNode;
  className?: string;
}

export function SlideCollapse({ open, children, className }: SlideCollapseProps) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className={cn('overflow-hidden', className)}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════
//  ListStagger — for list pages (clients, invoices, etc.)
// ═══════════════════════════════════════════════════

const listContainerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const listItemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
};

interface ListStaggerProps {
  children: React.ReactNode;
  className?: string;
}

export function ListStagger({ children, className }: ListStaggerProps) {
  return (
    <motion.div
      variants={listContainerVariants}
      initial="hidden"
      animate="show"
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function ListStaggerItem({ children, className }: ListStaggerProps) {
  return (
    <motion.div variants={listItemVariants} className={className}>
      {children}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════
//  Shimmer — loading shimmer effect for skeleton text
// ═══════════════════════════════════════════════════

interface ShimmerProps {
  className?: string;
}

export function Shimmer({ className }: ShimmerProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded bg-muted',
        className
      )}
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </div>
  );
}

// ═══════════════════════════════════════════════════
//  ProgressBar — animated progress fill
// ═══════════════════════════════════════════════════

interface ProgressBarProps {
  value: number;
  className?: string;
  barClassName?: string;
}

export function ProgressBar({ value, className, barClassName }: ProgressBarProps) {
  return (
    <div className={cn('h-2 bg-muted rounded-full overflow-hidden', className)}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.2 }}
        className={cn('h-full rounded-full bg-orange-500', barClassName)}
      />
    </div>
  );
}

// Re-export framer-motion for convenience
export { motion, AnimatePresence };
export type { Variants };
