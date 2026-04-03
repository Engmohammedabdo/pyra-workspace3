'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, AlertTriangle, CheckCircle, MessageSquareWarning, Send, Shield, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';

const markdownComponents = {
  h1: ({ children }: any) => <h1 className="text-2xl font-bold text-[#003866]">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-xl font-bold text-[#003866]">{children}</h2>,
  p: ({ children }: any) => <p className="text-sm leading-[1.9] text-foreground/80">{children}</p>,
};

export function ScriptContent({
  scriptContent, contentLoading, currentReview, onReview,
  replies, fetchReplies, sendReply, replyText, setReplyText, replySending
}: any) {
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [reviewComment, setReviewComment] = useState('');

  return (
    <CardContent className="p-0">
      {contentLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-[#b89a77]" />
        </div>
      ) : scriptContent ? (
        <ScrollArea className="h-[calc(100vh-400px)]">
          <div className="p-6 lg:p-8" dir="rtl">
            <article className="prose prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {scriptContent}
              </ReactMarkdown>
            </article>
            <div className="mt-8 pt-6 border-t border-[#e6dfd7]">
              {/* Review Logic */}
            </div>
          </div>
        </ScrollArea>
      ) : null}
    </CardContent>
  );
}
