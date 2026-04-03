/**
 * Evolution API v2 client.
 *
 * Wraps the most-used endpoints:
 * - Instance management (list, create, connect, status, delete)
 * - Messaging (send text, send media)
 */

import { EVOLUTION_API_URL, EVOLUTION_API_KEY } from './config';
import type {
  EvoInstance,
  EvoConnectionState,
  EvoQRCode,
  EvoSendTextPayload,
  EvoSendMediaPayload,
  EvoSendResponse,
} from './types';

class EvolutionClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl?: string, apiKey?: string) {
    this.baseUrl = (baseUrl || EVOLUTION_API_URL).replace(/\/$/, '');
    this.apiKey = apiKey || EVOLUTION_API_KEY;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        apikey: this.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Evolution API ${method} ${path} failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<T>;
  }

  // ─── Instance Management ──────────────────────────────────

  /** List all instances */
  async listInstances(): Promise<EvoInstance[]> {
    return this.request<EvoInstance[]>('GET', '/instance/fetchInstances');
  }

  /** Create a new instance */
  async createInstance(instanceName: string, webhookUrl?: string) {
    return this.request('POST', '/instance/create', {
      instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
      webhook: webhookUrl
        ? {
            url: webhookUrl,
            byEvents: false,
            base64: false,
            events: [
              'MESSAGES_UPSERT',
              'MESSAGES_UPDATE',
              'CONNECTION_UPDATE',
            ],
          }
        : undefined,
    });
  }

  /** Get instance connection state */
  async getConnectionState(instanceName: string): Promise<EvoConnectionState> {
    return this.request<EvoConnectionState>(
      'GET',
      `/instance/connectionState/${instanceName}`,
    );
  }

  /** Get QR code for connecting */
  async getQRCode(instanceName: string): Promise<EvoQRCode> {
    return this.request<EvoQRCode>(
      'GET',
      `/instance/connect/${instanceName}`,
    );
  }

  /** Delete an instance */
  async deleteInstance(instanceName: string) {
    return this.request('DELETE', `/instance/delete/${instanceName}`);
  }

  /** Disconnect (logout) instance */
  async logoutInstance(instanceName: string) {
    return this.request('DELETE', `/instance/logout/${instanceName}`);
  }

  /** Set/update webhook URL for an instance */
  async setWebhook(instanceName: string, webhookUrl: string) {
    return this.request('POST', `/webhook/set/${instanceName}`, {
      url: webhookUrl,
      webhook_by_events: false,
      webhook_base64: false,
      events: [
        'MESSAGES_UPSERT',
        'MESSAGES_UPDATE',
        'CONNECTION_UPDATE',
      ],
    });
  }

  /** Restart an instance */
  async restartInstance(instanceName: string) {
    return this.request('PUT', `/instance/restart/${instanceName}`);
  }

  // ─── Messaging ────────────────────────────────────────────

  /** Send a text message */
  async sendText(
    instanceName: string,
    payload: EvoSendTextPayload,
  ): Promise<EvoSendResponse> {
    return this.request<EvoSendResponse>(
      'POST',
      `/message/sendText/${instanceName}`,
      {
        number: payload.number,
        text: payload.text,
      },
    );
  }

  /** Send a media message (image, document, audio, video) */
  async sendMedia(
    instanceName: string,
    payload: EvoSendMediaPayload,
  ): Promise<EvoSendResponse> {
    return this.request<EvoSendResponse>(
      'POST',
      `/message/sendMedia/${instanceName}`,
      {
        number: payload.number,
        mediatype: payload.mediatype,
        mimetype: payload.mimetype,
        media: payload.media,
        caption: payload.caption,
        fileName: payload.fileName,
      },
    );
  }

  /** Fetch chat messages for a contact */
  async fetchMessages(instanceName: string, remoteJid: string, limit = 50) {
    return this.request('POST', `/chat/findMessages/${instanceName}`, {
      where: { key: { remoteJid } },
      limit,
    });
  }

  // ─── Polling (Chatwoot-style direct fetch) ────────────────

  /** Fetch all chats (conversations list) from Evolution API */
  async findChats(instanceName: string): Promise<Array<{
    id: string;
    remoteJid: string;
    pushName?: string;
    profilePicUrl?: string;
    unreadCount?: number;
  }>> {
    return this.request('POST', `/chat/findChats/${instanceName}`, {});
  }

  /** Fetch messages with pagination (no remoteJid filter = all messages) */
  async findAllMessages(instanceName: string, page = 1, limit = 50): Promise<{
    messages: { total: number; pages: number; currentPage: number; records: Array<Record<string, unknown>> };
  }> {
    return this.request('POST', `/chat/findMessages/${instanceName}`, {
      where: {},
      page,
      limit,
    });
  }

  /** Fetch media as base64 */
  async getMediaBase64(instanceName: string, messageKeyId: string): Promise<{
    base64: string;
    mimetype: string;
  } | null> {
    try {
      return await this.request('POST', `/chat/getBase64FromMediaMessage/${instanceName}`, {
        message: { key: { id: messageKeyId } },
        convertToMp4: false,
      });
    } catch {
      return null;
    }
  }
}

/** Singleton instance */
export const evolutionClient = new EvolutionClient();
