'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils/cn';
import { Sparkles, X, Loader2 } from 'lucide-react';

interface SuggestBarProps {
  suggestions: string[];
  isLoading: boolean;
  /** User started typing — hide the bar */
  isTyping: boolean;
  onSelect: (text: string) => void;
}

export function SuggestBar({
  suggestions,
  isLoading,
  isTyping,
  onSelect,
}: SuggestBarProps) {
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);

  // Reset dismissed state when suggestions change (new incoming message)
  useEffect(() => {
    setDismissed(false);
  }, [suggestions]);

  // Animate in after a short delay
  useEffect(() => {
    if (suggestions.length > 0 && !dismissed && !isTyping) {
      const timer = setTimeout(() => setVisible(true), 100);
      return () => clearTimeout(timer);
    }
    setVisible(false);
  }, [suggestions, dismissed, isTyping]);

  // Don't render if dismissed, typing, or no suggestions
  if (dismissed || isTyping) return null;
  if (!isLoading && suggestions.length === 0) return null;

  return (
    <div
      className={cn(
        'px-3 py-2 border-t border-border/30 bg-gradient-to-t from-orange-50/30 to-transparent dark:from-orange-950/10 dark:to-transparent transition-all duration-300',
        visible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-2'
      )}
    >
      <div className="flex items-center gap-2">
        {/* Sparkle icon */}
        <div className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-orange-500/10">
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 text-orange-500 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 text-orange-500" />
          )}
        </div>

        {/* Suggestion chips */}
        <div className="flex-1 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {isLoading ? (
            <div className="flex items-center gap-1.5">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-7 rounded-full bg-orange-500/5 dark:bg-orange-500/10 animate-pulse"
                  style={{ width: `${60 + i * 30}px` }}
                />
              ))}
            </div>
          ) : (
            suggestions.map((suggestion, idx) => (
              <button
                key={idx}
                onClick={() => onSelect(suggestion)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap',
                  'bg-orange-500/10 text-orange-700 dark:text-orange-400',
                  'hover:bg-orange-500/20 dark:hover:bg-orange-500/25',
                  'active:scale-[0.97]',
                  'transition-all duration-150',
                  'border border-orange-200/50 dark:border-orange-800/30'
                )}
              >
                {suggestion}
              </button>
            ))
          )}
        </div>

        {/* Dismiss button */}
        {!isLoading && suggestions.length > 0 && (
          <button
            onClick={() => setDismissed(true)}
            className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50 transition-colors"
            aria-label="إخفاء الاقتراحات"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
