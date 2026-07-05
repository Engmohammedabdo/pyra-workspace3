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
  EvoGroup,
  EvoGroupParticipant,
  EvoGroupInvite,
} from './types';

// A hanging Evolution instance must never stall a caller indefinitely —
// requests abort after this window and surface as a normal thrown error
// (all sends are best-effort; callers already tolerate rejection).
const REQUEST_TIMEOUT_MS = 8000;

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
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
              'PRESENCE_UPDATE',
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
        'PRESENCE_UPDATE',
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

  /** Send a text message quoting another message */
  async sendTextQuoted(
    instanceName: string,
    payload: { number: string; text: string; quotedMessageId: string },
  ): Promise<EvoSendResponse> {
    return this.request<EvoSendResponse>(
      'POST',
      `/message/sendText/${instanceName}`,
      {
        number: payload.number,
        text: payload.text,
        quoted: { key: { id: payload.quotedMessageId } },
      },
    );
  }

  /** Send an emoji reaction to a message */
  async sendReaction(
    instanceName: string,
    payload: { remoteJid: string; messageId: string; reaction: string },
  ) {
    return this.request('POST', `/message/sendReaction/${instanceName}`, {
      key: { remoteJid: payload.remoteJid, id: payload.messageId },
      reaction: payload.reaction,
    });
  }

  /** Mark a chat as read (syncs blue ticks back to WhatsApp) */
  async markChatRead(instanceName: string, remoteJid: string) {
    try {
      return await this.request('POST', `/chat/markChatUnread/${instanceName}`, {
        lastMessage: { key: { remoteJid } },
        read: true,
      });
    } catch {
      return null;
    }
  }

  /** Send typing / presence indicator */
  async sendPresence(
    instanceName: string,
    remoteJid: string,
    state: 'composing' | 'paused' | 'available',
  ) {
    try {
      return await this.request('POST', `/chat/updatePresence/${instanceName}`, {
        remoteJid,
        presence: state,
      });
    } catch {
      return null;
    }
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

  // ─── Forward ──────────────────────────────────────────────

  /** Forward a message to another contact */
  async forwardMessage(instanceName: string, payload: { number: string; messageId: string }) {
    return this.request('POST', `/chat/forwardMessage/${instanceName}`, {
      number: payload.number,
      messageId: payload.messageId,
    });
  }

  // ─── Templates ────────────────────────────────────────────

  /** Send a WhatsApp Business template message */
  async sendTemplate(
    instanceName: string,
    payload: { number: string; name: string; language: string; components?: unknown[] },
  ): Promise<EvoSendResponse> {
    return this.request<EvoSendResponse>(
      'POST',
      `/message/sendTemplate/${instanceName}`,
      payload,
    );
  }

  // ─── Polls / Location / Contact Cards ─────────────────────

  /** Send a poll message */
  async sendPoll(
    instanceName: string,
    payload: { number: string; name: string; options: string[]; selectableCount?: number },
  ): Promise<EvoSendResponse> {
    return this.request<EvoSendResponse>(
      'POST',
      `/message/sendPoll/${instanceName}`,
      {
        number: payload.number,
        name: payload.name,
        values: payload.options,
        selectableCount: payload.selectableCount || 1,
      },
    );
  }

  /** Send a location message */
  async sendLocation(
    instanceName: string,
    payload: { number: string; latitude: number; longitude: number; name?: string; address?: string },
  ): Promise<EvoSendResponse> {
    return this.request<EvoSendResponse>(
      'POST',
      `/message/sendLocation/${instanceName}`,
      {
        number: payload.number,
        latitude: payload.latitude,
        longitude: payload.longitude,
        name: payload.name,
        address: payload.address,
      },
    );
  }

  // ─── Button Messages ──────────────────────────────────────

  /** Send interactive button message */
  async sendButtons(
    instanceName: string,
    payload: {
      number: string;
      title: string;
      description?: string;
      buttons: Array<{ buttonId: string; buttonText: string }>;
      footerText?: string;
    },
  ): Promise<EvoSendResponse> {
    return this.request<EvoSendResponse>(
      'POST',
      `/message/sendButtons/${instanceName}`,
      {
        number: payload.number,
        buttonMessage: {
          title: payload.title,
          description: payload.description || '',
          buttons: payload.buttons,
          footerText: payload.footerText || '',
        },
      },
    );
  }

  // ─── Profile Photos ─────────────────────────────────────

  /** Fetch contact profile photo URL */
  async fetchProfilePhoto(
    instanceName: string,
    number: string,
  ): Promise<{ profilePictureUrl?: string } | null> {
    try {
      return await this.request<{ profilePictureUrl?: string }>(
        'GET',
        `/chat/fetchProfileUrl/${instanceName}?number=${number}`,
      );
    } catch {
      return null;
    }
  }

  /** Send a contact card */
  async sendContact(
    instanceName: string,
    payload: { number: string; contact: { fullName: string; phoneNumber: string; organization?: string } },
  ): Promise<EvoSendResponse> {
    return this.request<EvoSendResponse>(
      'POST',
      `/message/sendContact/${instanceName}`,
      {
        number: payload.number,
        contact: [
          {
            fullName: payload.contact.fullName,
            wuid: payload.contact.phoneNumber,
            phoneNumber: payload.contact.phoneNumber,
            organization: payload.contact.organization,
          },
        ],
      },
    );
  }

  // ─── Groups ─────────────────────────────────────────────

  /** Fetch all groups the instance is part of */
  async fetchAllGroups(instanceName: string, getParticipants = false): Promise<EvoGroup[]> {
    try {
      return await this.request<EvoGroup[]>(
        'GET',
        `/group/fetchAllGroups/${instanceName}?getParticipants=${getParticipants}`,
      );
    } catch {
      return [];
    }
  }

  /** Get info for a specific group by JID */
  async findGroupInfo(instanceName: string, groupJid: string): Promise<EvoGroup | null> {
    try {
      return await this.request<EvoGroup>(
        'GET',
        `/group/findGroupInfos/${instanceName}?groupJid=${encodeURIComponent(groupJid)}`,
      );
    } catch {
      return null;
    }
  }

  /** Get participants of a group */
  async findGroupParticipants(instanceName: string, groupJid: string): Promise<EvoGroupParticipant[]> {
    try {
      const data = await this.request<{ participants?: EvoGroupParticipant[] }>(
        'GET',
        `/group/participants/${instanceName}?groupJid=${encodeURIComponent(groupJid)}`,
      );
      return data?.participants || [];
    } catch {
      return [];
    }
  }

  /** Update group subject (name) */
  async updateGroupSubject(instanceName: string, groupJid: string, subject: string) {
    return this.request(
      'POST',
      `/group/updateGroupSubject/${instanceName}?groupJid=${encodeURIComponent(groupJid)}`,
      { subject },
    );
  }

  /** Update group description */
  async updateGroupDescription(instanceName: string, groupJid: string, description: string) {
    return this.request(
      'POST',
      `/group/updateGroupDescription/${instanceName}?groupJid=${encodeURIComponent(groupJid)}`,
      { description },
    );
  }

  /** Update group picture */
  async updateGroupPicture(instanceName: string, groupJid: string, imageUrl: string) {
    return this.request(
      'POST',
      `/group/updateGroupPicture/${instanceName}?groupJid=${encodeURIComponent(groupJid)}`,
      { image: imageUrl },
    );
  }

  /** Manage group participants (add/remove/promote/demote) */
  async updateGroupParticipants(
    instanceName: string,
    groupJid: string,
    action: 'add' | 'remove' | 'promote' | 'demote',
    participants: string[],
  ) {
    return this.request(
      'POST',
      `/group/updateParticipant/${instanceName}?groupJid=${encodeURIComponent(groupJid)}`,
      { action, participants },
    );
  }

  /** Get group invite code/URL */
  async fetchGroupInviteCode(instanceName: string, groupJid: string): Promise<EvoGroupInvite | null> {
    try {
      return await this.request<EvoGroupInvite>(
        'GET',
        `/group/inviteCode/${instanceName}?groupJid=${encodeURIComponent(groupJid)}`,
      );
    } catch {
      return null;
    }
  }
}

/** Singleton instance */
export const evolutionClient = new EvolutionClient();
