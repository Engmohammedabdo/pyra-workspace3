/** Types for Evolution API v2 */

export interface EvoInstance {
  instance: {
    instanceName: string;
    instanceId: string;
    status: string;
    owner: string;
  };
}

export interface EvoConnectionState {
  instance: string;
  state: 'open' | 'close' | 'connecting';
}

export interface EvoQRCode {
  pairingCode: string | null;
  code: string; // QR code base64
  count: number;
}

export interface EvoSendTextPayload {
  number: string;
  text: string;
}

export interface EvoSendMediaPayload {
  number: string;
  mediatype: 'image' | 'document' | 'audio' | 'video';
  mimetype: string;
  media: string; // URL or base64
  caption?: string;
  fileName?: string;
}

export interface EvoSendResponse {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  message: Record<string, unknown>;
  messageTimestamp: string;
  status: string;
}

/** Webhook event types we handle */
export type EvoWebhookEvent =
  | 'MESSAGES_UPSERT'
  | 'MESSAGES_UPDATE'
  | 'CONNECTION_UPDATE'
  | 'QRCODE_UPDATED';

export interface EvoWebhookPayload {
  event: EvoWebhookEvent;
  instance: string;
  data: Record<string, unknown>;
}

export interface EvoMessageData {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  pushName?: string;
  message?: {
    conversation?: string;
    extendedTextMessage?: { text: string };
    imageMessage?: { url?: string; caption?: string; mimetype?: string };
    documentMessage?: { url?: string; fileName?: string; mimetype?: string };
    audioMessage?: { url?: string; mimetype?: string };
    videoMessage?: { url?: string; caption?: string; mimetype?: string };
  };
  messageType?: string;
  messageTimestamp?: number;
  status?: string;
}
