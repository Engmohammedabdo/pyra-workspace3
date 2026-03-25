/**
 * conversation-bridge.mjs — Bridge between OpenClaw workspace and Memory System
 * Reads recent content from daily memory files and converts to message format
 * for fact extraction pipeline.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MEMORY_DIR = '/home/node/openclaw/memory';
const WORKSPACE_DIR = '/home/node/openclaw';

/**
 * Get recent conversations from daily memory files.
 * Returns array of {role, content} messages.
 */
export async function getRecentConversations(options = {}) {
  const { sinceHours = 6, maxMessages = 100 } = options;
  const messages = [];
  const cutoff = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
  
  // 1. Read today's and yesterday's daily files
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  
  for (const dateStr of [yesterday, today]) {
    const filePath = join(MEMORY_DIR, `${dateStr}.md`);
    if (!existsSync(filePath)) continue;
    
    const stat = statSync(filePath);
    // Skip if file wasn't modified since cutoff
    if (stat.mtime < cutoff) continue;
    
    const content = readFileSync(filePath, 'utf-8');
    // Split by ## headers into sections
    const sections = content.split(/^## /m).filter(s => s.trim());
    
    for (const section of sections) {
      if (section.trim().length < 30) continue; // skip trivial
      messages.push({
        role: 'user',
        content: `## ${section.trim()}`,
      });
      if (messages.length >= maxMessages) break;
    }
    if (messages.length >= maxMessages) break;
  }
  
  // 2. Check WIP.md for recent changes
  const wipPath = join(WORKSPACE_DIR, 'WIP.md');
  if (existsSync(wipPath)) {
    const wipStat = statSync(wipPath);
    if (wipStat.mtime >= cutoff) {
      const wipContent = readFileSync(wipPath, 'utf-8');
      if (wipContent.trim().length > 30) {
        messages.push({
          role: 'user',
          content: `[WIP Update]\n${wipContent.substring(0, 2000)}`,
        });
      }
    }
  }
  
  return messages.slice(0, maxMessages);
}
