import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { generateId } from '@/lib/utils/id';
import { EVOLUTION_API_URL, EVOLUTION_API_KEY } from '@/lib/evolution/config';

/** Allow up to 120 seconds for sync batches */
export const maxDuration = 120;

/**
 * Normalize a phone number to digits-only, stripping leading zeros and
 * ensuring consistent format for exact matching.
 */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0') && digits.length === 10) return `971${digits.slice(1)}`;
  return digits;
}

/**
 * POST /api/dashboard/sales/whatsapp/sync
 *
 * Syncs historical messages from Evolution API into pyra_whatsapp_messages.
 * Works in batches to avoid Vercel timeout.
 *
 * Body (optional):
 *   instanceName: string (default: 'pyraai')
 *   startPage: number (default: 1)
 *   batchSize: number (default: 50, max 100)
 *   pagesToSync: number (default: 10 — pages per call)
 *
 * Returns: { sync: { ...progress, done: boolean, nextPage: number } }
 *   Client should keep calling with nextPage until done === true
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiPermission('sales_whatsapp.view');
  if (isApiError(auth)) return auth;

  let body: {
    instanceName?: string;
    startPage?: number;
    batchSize?: number;
    pagesToSync?: number;
  } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine
  }

  const instanceName = body.instanceName || 'pyraai';
  const batchSize = Math.min(body.batchSize || 50, 100);
  const startPage = body.startPage || 1;
  const pagesToSync = Math.min(body.pagesToSync || 10, 20); // max 20 pages per call

  const supabase = createServiceRoleClient();

  // Fetch all existing message_ids for dedup
  const { data: existingMsgs } = await supabase
    .from('pyra_whatsapp_messages')
    .select('message_id')
    .eq('instance_name', instanceName)
    .not('message_id', 'is', null);

  const existingIds = new Set(
    (existingMsgs || []).map((m: { message_id: string | null }) => m.message_id).filter(Boolean)
  );

  // Pre-fetch leads for phone matching
  const { data: allLeads } = await supabase
    .from('pyra_sales_leads')
    .select('id, client_id, phone')
    .not('phone', 'is', null);

  const leadsByPhone = new Map<string, { id: string; client_id: string | null }>();
  for (const lead of allLeads || []) {
    if (lead.phone) {
      leadsByPhone.set(normalizePhone(lead.phone), { id: lead.id, client_id: lead.client_id });
    }
  }

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let totalPagesInApi = 0;

  const endPage = startPage + pagesToSync - 1;

  for (let page = startPage; page <= endPage; page++) {
    const { data: res, error: fetchError } = await fetchEvoMessages(instanceName, batchSize, page);
    if (!res) {
      // If first page fails, return detailed error
      if (page === startPage) {
        return NextResponse.json(
          {
            error: 'Failed to fetch from Evolution API',
            details: fetchError || 'Unknown error',
            debug: {
              url: `${EVOLUTION_API_URL}/chat/findMessages/${instanceName}`,
              hasApiKey: !!EVOLUTION_API_KEY,
              apiKeyPrefix: EVOLUTION_API_KEY ? EVOLUTION_API_KEY.slice(0, 8) + '...' : 'EMPTY',
            },
          },
          { status: 502 },
        );
      }
      break; // Otherwise stop gracefully
    }

    totalPagesInApi = res.pages;

    // If we've exceeded total pages, we're done
    if (page > res.pages) break;

    if (!res.records?.length) break;

    const result = await processPage(
      res.records,
      instanceName,
      supabase,
      existingIds,
      leadsByPhone,
    );
    totalInserted += result.inserted;
    totalSkipped += result.skipped;
    totalErrors += result.errors;
  }

  const lastProcessedPage = Math.min(endPage, totalPagesInApi || endPage);
  const done = lastProcessedPage >= totalPagesInApi;

  return NextResponse.json({
    status: 'ok',
    sync: {
      instance: instanceName,
      totalPages: totalPagesInApi,
      startPage,
      lastProcessedPage,
      nextPage: done ? null : lastProcessedPage + 1,
      done,
      inserted: totalInserted,
      skipped: totalSkipped,
      errors: totalErrors,
    },
  });
}

// ─── Helpers ──────────────────────────────────────────────────

interface EvoApiMessage {
  id: string;
  key: {
    id: string;
    fromMe: boolean;
    remoteJid: string;
    remoteJidAlt?: string;
    addressingMode?: string;
    participant?: string;
  };
  pushName?: string;
  messageType?: string;
  message?: Record<string, unknown>;
  messageTimestamp?: number;
  source?: string;
}

interface EvoMessagesResponse {
  total: number;
  pages: number;
  currentPage: number;
  records: EvoApiMessage[];
}

async function fetchEvoMessages(
  instanceName: string,
  limit: number,
  page: number,
): Promise<{ data: EvoMessagesResponse | null; error?: string }> {
  try {
    const url = `${EVOLUTION_API_URL}/chat/findMessages/${instanceName}`;
    console.log(`[WA Sync] Fetching page ${page} from ${url}`);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: EVOLUTION_API_KEY,
      },
      body: JSON.stringify({ where: {}, limit, page }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const errMsg = `Evolution API returned ${res.status}: ${text.slice(0, 200)}`;
      console.error(`[WA Sync] ${errMsg}`);
      return { data: null, error: errMsg };
    }

    const data = await res.json();
    return { data: data.messages as EvoMessagesResponse };
  } catch (err) {
    const errMsg = `Network error: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[WA Sync] ${errMsg}`);
    return { data: null, error: errMsg };
  }
}

async function processPage(
  records: EvoApiMessage[],
  instanceName: string,
  supabase: ReturnType<typeof createServiceRoleClient>,
  existingIds: Set<string | null>,
  leadsByPhone: Map<string, { id: string; client_id: string | null }>,
) {
  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  const rowsToInsert: Record<string, unknown>[] = [];

  for (const msg of records) {
    if (!msg.key?.remoteJid) { skipped++; continue; }

    // Skip status/broadcast and group messages
    if (msg.key.remoteJid === 'status@broadcast') { skipped++; continue; }
    if (msg.key.remoteJid.endsWith('@g.us')) { skipped++; continue; }

    // Dedup
    if (msg.key.id && existingIds.has(msg.key.id)) { skipped++; continue; }

    const direction = msg.key.fromMe ? 'outgoing' : 'incoming';

    // Extract phone — handle @lid format
    const jidForPhone = msg.key.remoteJidAlt || msg.key.remoteJid;
    const rawPhone = jidForPhone
      .replace('@s.whatsapp.net', '')
      .replace('@c.us', '')
      .replace('@lid', '');
    const phone = normalizePhone(rawPhone);

    // Match lead
    const matchedLead = phone ? leadsByPhone.get(phone) || null : null;

    // Extract content
    const content = extractTextContent(msg.message);
    const messageType = msg.messageType || detectMessageType(msg.message);
    const mediaUrl = extractMediaUrl(msg.message);
    const fileName = extractFileName(msg.message);

    rowsToInsert.push({
      id: generateId('wm'),
      instance_name: instanceName,
      remote_jid: msg.key.remoteJid,
      lead_id: matchedLead?.id || null,
      client_id: matchedLead?.client_id || null,
      message_id: msg.key.id || null,
      direction,
      message_type: messageType,
      content,
      media_url: mediaUrl,
      file_name: fileName,
      status: direction === 'incoming' ? 'received' : 'sent',
      timestamp: msg.messageTimestamp
        ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
        : new Date().toISOString(),
      metadata: {
        pushName: msg.pushName || null,
        remoteJidAlt: msg.key.remoteJidAlt || null,
        addressingMode: msg.key.addressingMode || null,
        phone: phone || null,
      },
    });

    // Track for dedup within same sync run
    if (msg.key.id) existingIds.add(msg.key.id);
  }

  // Batch insert (Supabase handles up to 1000 rows per insert)
  if (rowsToInsert.length > 0) {
    const { error } = await supabase
      .from('pyra_whatsapp_messages')
      .insert(rowsToInsert);

    if (error) {
      console.error('[WA Sync] Batch insert error:', error.message);
      errors += rowsToInsert.length;
    } else {
      inserted += rowsToInsert.length;
    }
  }

  return { inserted, skipped, errors };
}

// ─── Message Extraction ──────────────────────────────────────

function extractTextContent(message?: Record<string, unknown>): string | null {
  if (!message) return null;
  if (typeof message.conversation === 'string') return message.conversation;
  const ext = message.extendedTextMessage as { text?: string } | undefined;
  if (ext?.text) return ext.text;
  const img = message.imageMessage as { caption?: string } | undefined;
  if (img?.caption) return img.caption;
  const vid = message.videoMessage as { caption?: string } | undefined;
  if (vid?.caption) return vid.caption;
  return null;
}

function detectMessageType(message?: Record<string, unknown>): string {
  if (!message) return 'text';
  if (message.imageMessage) return 'image';
  if (message.documentMessage) return 'document';
  if (message.audioMessage) return 'audio';
  if (message.videoMessage) return 'video';
  if (message.stickerMessage) return 'sticker';
  if (message.contactMessage) return 'contact';
  if (message.locationMessage) return 'location';
  return 'text';
}

function extractMediaUrl(message?: Record<string, unknown>): string | null {
  if (!message) return null;
  const img = message.imageMessage as { url?: string } | undefined;
  if (img?.url) return img.url;
  const doc = message.documentMessage as { url?: string } | undefined;
  if (doc?.url) return doc.url;
  const aud = message.audioMessage as { url?: string } | undefined;
  if (aud?.url) return aud.url;
  const vid = message.videoMessage as { url?: string } | undefined;
  if (vid?.url) return vid.url;
  return null;
}

function extractFileName(message?: Record<string, unknown>): string | null {
  if (!message) return null;
  const doc = message.documentMessage as { fileName?: string } | undefined;
  if (doc?.fileName) return doc.fileName;
  return null;
}
