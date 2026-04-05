/**
 * In-memory typing indicator map.
 * Shared between webhook handler and conversations API.
 *
 * Key: remoteJid, Value: { typing, updatedAt }
 * Entries expire after 10 seconds.
 */

export const typingMap = new Map<string, { typing: boolean; updatedAt: number }>();

/** Clean up expired typing entries */
export function cleanupTypingMap() {
  const now = Date.now();
  for (const [jid, entry] of typingMap) {
    if (now - entry.updatedAt > 10_000) typingMap.delete(jid);
  }
}
