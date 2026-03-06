'use client';

import React from 'react';

/** Shared regex for @mention extraction — supports Latin and Arabic characters */
export const MENTION_REGEX = /@([\w\u0600-\u06FF]+)/g;

/** Extract raw mention names from text */
export function extractMentions(text: string): string[] {
  const regex = new RegExp(MENTION_REGEX.source, 'g');
  return [...text.matchAll(regex)].map((m) => m[1]);
}

/** Render text with @mentions highlighted */
export function renderTextWithMentions(
  text: string,
  variant: 'dashboard' | 'portal' = 'dashboard'
): React.ReactNode[] {
  const className =
    variant === 'portal'
      ? 'text-portal font-semibold'
      : 'text-orange-600 font-semibold';

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const regex = new RegExp(MENTION_REGEX.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <span key={match.index} className={className}>
        @{match[1]}
      </span>
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}
