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

/** Evolution API Group */
export interface EvoGroup {
  id: string; // group JID ending with @g.us
  subject: string;
  subjectOwner?: string;
  subjectTime?: number;
  pictureUrl?: string | null;
  size?: number;
  creation?: number;
  owner?: string;
  desc?: string;
  descId?: string;
  restrict?: boolean;
  announce?: boolean;
  participants?: EvoGroupParticipant[];
}

/** Evolution API Group Participant */
export interface EvoGroupParticipant {
  id: string; // participant JID (phone@s.whatsapp.net)
  admin: 'superadmin' | 'admin' | null;
}

/** Group invite code response */
export interface EvoGroupInvite {
  inviteUrl: string;
  inviteCode: string;
}

/** Webhook event types we handle */
export type EvoWebhookEvent =
  | 'MESSAGES_UPSERT'
  | 'MESSAGES_UPDATE'
  | 'CONNECTION_UPDATE'
  | 'QRCODE_UPDATED'
  | 'PRESENCE_UPDATE'
  | 'GROUPS_UPSERT'
  | 'GROUPS_UPDATE'
  | 'GROUP_PARTICIPANTS_UPDATE';

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
    /** Alternative JID in @s.whatsapp.net format (when remoteJid is @lid) */
    remoteJidAlt?: string;
    /** "lid" for new Linked ID format, undefined for classic */
    addressingMode?: string;
    participant?: string;
  };
  pushName?: string;
  message?: {
    conversation?: string;
    extendedTextMessage?: {
      text?: string;
      contextInfo?: {
        stanzaId?: string;
        participant?: string;
        quotedMessage?: {
          conversation?: string;
          imageMessage?: { caption?: string };
          documentMessage?: { fileName?: string };
        };
      };
    };
    imageMessage?: { url?: string; caption?: string; mimetype?: string };
    documentMessage?: { url?: string; fileName?: string; mimetype?: string };
    audioMessage?: { url?: string; mimetype?: string };
    videoMessage?: { url?: string; caption?: string; mimetype?: string };
  };
  messageType?: string;
  messageTimestamp?: number;
  status?: string;
}
