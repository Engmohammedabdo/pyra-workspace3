#!/usr/bin/env node
/**
 * Evolution API v2 — WhatsApp Client for PyraAI
 * Direct API client with full operations + CLI interface
 * 
 * Usage as module:
 *   import { EvolutionClient } from './evolution-client.mjs';
 *   const client = new EvolutionClient();
 *   await client.sendText('971565799505', 'Hello!');
 * 
 * Usage as CLI:
 *   node evolution-client.mjs send-text 971565799505 "Hello"
 *   node evolution-client.mjs contacts
 *   node evolution-client.mjs groups
 */

const DEFAULT_CONFIG = {
  apiUrl: 'https://evo.pyramedia.info',
  apiKey: '5002E96781AE-4AB5-AD97-A5F6234570EC',
  instance: 'pyraai',
};

export class EvolutionClient {
  constructor(config = {}) {
    this.apiUrl = (config.apiUrl || process.env.EVOLUTION_API_URL || DEFAULT_CONFIG.apiUrl).replace(/\/+$/, '');
    this.apiKey = config.apiKey || process.env.EVOLUTION_API_KEY || DEFAULT_CONFIG.apiKey;
    this.instance = config.instance || process.env.EVOLUTION_INSTANCE || DEFAULT_CONFIG.instance;

    if (!this.apiUrl || !this.apiKey || !this.instance) {
      throw new Error('Missing config: apiUrl, apiKey, and instance are required');
    }
  }

  // ─── Helpers ───────────────────────────────────────────────

  /** Format number to JID */
  jid(number) {
    const clean = String(number).replace(/[^0-9]/g, '');
    if (clean.includes('@')) return clean;
    return `${clean}@s.whatsapp.net`;
  }

  /** Make API request with retries */
  async request(method, path, body = null, retries = 2) {
    const url = `${this.apiUrl}${path}`;
    const opts = {
      method,
      headers: {
        'apikey': this.apiKey,
        'Content-Type': 'application/json',
      },
    };
    if (body !== null) opts.body = JSON.stringify(body);

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, opts);
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch { data = text; }
        
        if (!res.ok) {
          const errMsg = typeof data === 'object' ? JSON.stringify(data) : data;
          if (attempt < retries && res.status >= 500) {
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
            continue;
          }
          throw new Error(`API ${res.status}: ${errMsg}`);
        }
        return data;
      } catch (err) {
        if (attempt < retries && err.code === 'ECONNRESET') {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
  }

  get(path) { return this.request('GET', path); }
  post(path, body) { return this.request('POST', path, body); }
  put(path, body) { return this.request('PUT', path, body); }
  del(path, body) { return this.request('DELETE', path, body); }

  // ─── Instance ──────────────────────────────────────────────

  /** Get instance info */
  async getInstance() {
    return this.get(`/instance/fetchInstances?instanceName=${this.instance}`);
  }

  /** Get connection status */
  async getStatus() {
    return this.get(`/instance/connectionState/${this.instance}`);
  }

  // ─── Messages ──────────────────────────────────────────────

  /** Send text message */
  async sendText(to, text) {
    return this.post(`/message/sendText/${this.instance}`, {
      number: this.jid(to),
      text,
    });
  }

  /** Send image */
  async sendImage(to, imageUrl, caption = '') {
    return this.post(`/message/sendMedia/${this.instance}`, {
      number: this.jid(to),
      mediatype: 'image',
      media: imageUrl,
      caption,
    });
  }

  /** Send video */
  async sendVideo(to, videoUrl, caption = '') {
    return this.post(`/message/sendMedia/${this.instance}`, {
      number: this.jid(to),
      mediatype: 'video',
      media: videoUrl,
      caption,
    });
  }

  /** Send audio (as voice note) */
  async sendAudio(to, audioUrl) {
    return this.post(`/message/sendWhatsAppAudio/${this.instance}`, {
      number: this.jid(to),
      audio: audioUrl,
    });
  }

  /** Send document */
  async sendDocument(to, docUrl, filename = 'document') {
    return this.post(`/message/sendMedia/${this.instance}`, {
      number: this.jid(to),
      mediatype: 'document',
      media: docUrl,
      fileName: filename,
    });
  }

  /** Send poll */
  async sendPoll(to, question, options) {
    return this.post(`/message/sendPoll/${this.instance}`, {
      number: this.jid(to),
      name: question,
      values: options,
      selectableCount: 1,
    });
  }

  /** Send contact card */
  async sendContact(to, contactName, contactNumber) {
    return this.post(`/message/sendContact/${this.instance}`, {
      number: this.jid(to),
      contact: [{
        fullName: contactName,
        wuid: this.jid(contactNumber),
        phoneNumber: String(contactNumber).replace(/[^0-9]/g, ''),
      }],
    });
  }

  /** React to a message */
  async sendReaction(remoteJid, messageId, emoji) {
    return this.post(`/message/sendReaction/${this.instance}`, {
      key: {
        remoteJid,
        id: messageId,
      },
      reaction: emoji,
    });
  }

  /** Mark message as read */
  async readMessage(remoteJid, messageId) {
    return this.post(`/chat/markMessageAsRead/${this.instance}`, {
      readMessages: [{
        remoteJid,
        id: messageId,
      }],
    });
  }

  /** Delete message */
  async deleteMessage(remoteJid, messageId, fromMe = true) {
    return this.del(`/chat/deleteMessageForEveryone/${this.instance}`, {
      remoteJid,
      messageId,
      fromMe,
    });
  }

  // ─── Chat Operations ──────────────────────────────────────

  /** Verify if number is on WhatsApp */
  async verifyNumber(number) {
    const numbers = Array.isArray(number) ? number : [number];
    const cleaned = numbers.map(n => String(n).replace(/[^0-9]/g, ''));
    return this.post(`/chat/whatsappNumbers/${this.instance}`, { numbers: cleaned });
  }

  /** Get contacts list */
  async getContacts() {
    return this.post(`/chat/findContacts/${this.instance}`, { where: {} });
  }

  /** Search messages */
  async searchMessages(query) {
    return this.post(`/chat/findMessages/${this.instance}`, {
      where: {
        key: { fromMe: false },
        message: { conversation: query },
      },
    });
  }

  /** Get profile picture */
  async getProfilePicture(number) {
    return this.post(`/chat/fetchProfilePictureUrl/${this.instance}`, {
      number: this.jid(number),
    });
  }

  /** Send presence (typing/recording indicator) */
  async sendPresence(to, type = 'composing') {
    // type: 'composing' | 'recording' | 'paused'
    return this.post(`/chat/sendPresence/${this.instance}`, {
      number: this.jid(to),
      presence: type,
    });
  }

  /** Fetch recent messages from a chat */
  async fetchMessages(chatId, limit = 20) {
    return this.post(`/chat/findMessages/${this.instance}`, {
      where: {
        key: { remoteJid: this.jid(chatId) },
      },
      limit,
    });
  }

  // ─── Groups ────────────────────────────────────────────────

  /** List all groups */
  async getGroupList() {
    return this.get(`/group/fetchAllGroups/${this.instance}?getParticipants=false`);
  }

  /** Get group participants */
  async getGroupParticipants(groupId) {
    return this.get(`/group/participants/${this.instance}?groupJid=${groupId}`);
  }

  // ─── Convenience ───────────────────────────────────────────

  /** Send text and show typing first */
  async sendTextWithPresence(to, text, delayMs = 1500) {
    await this.sendPresence(to, 'composing');
    await new Promise(r => setTimeout(r, delayMs));
    return this.sendText(to, text);
  }
}

// ─── CLI Interface ─────────────────────────────────────────────

async function cli() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd) {
    console.log(`
Evolution API WhatsApp Client — CLI

Usage:
  node evolution-client.mjs <command> [args...]

Commands:
  status                              Connection status
  send-text <number> <text>           Send text message
  send-image <number> <url> [caption] Send image
  send-video <number> <url> [caption] Send video
  send-audio <number> <url>           Send audio/voice note
  send-doc <number> <url> [filename]  Send document
  send-poll <number> <question> <opt1,opt2,...>  Send poll
  send-contact <to> <name> <number>   Send contact card
  react <remoteJid> <msgId> <emoji>   React to message
  read <remoteJid> <msgId>            Mark as read
  delete <remoteJid> <msgId>          Delete message
  verify <number>                     Check if on WhatsApp
  contacts                            List all contacts
  groups                              List all groups
  group-members <groupJid>            Group participants
  search <query>                      Search messages
  profile-pic <number>                Get profile picture URL
  messages <chatId> [limit]           Fetch recent messages
  presence <number> [composing|recording]  Send presence
    `);
    process.exit(0);
  }

  const client = new EvolutionClient();

  try {
    let result;
    switch (cmd) {
      case 'status':
        result = await client.getStatus();
        break;
      case 'send-text':
        result = await client.sendText(args[1], args[2]);
        break;
      case 'send-image':
        result = await client.sendImage(args[1], args[2], args[3] || '');
        break;
      case 'send-video':
        result = await client.sendVideo(args[1], args[2], args[3] || '');
        break;
      case 'send-audio':
        result = await client.sendAudio(args[1], args[2]);
        break;
      case 'send-doc':
        result = await client.sendDocument(args[1], args[2], args[3] || 'document');
        break;
      case 'send-poll':
        result = await client.sendPoll(args[1], args[2], args[3].split(','));
        break;
      case 'send-contact':
        result = await client.sendContact(args[1], args[2], args[3]);
        break;
      case 'react':
        result = await client.sendReaction(args[1], args[2], args[3]);
        break;
      case 'read':
        result = await client.readMessage(args[1], args[2]);
        break;
      case 'delete':
        result = await client.deleteMessage(args[1], args[2]);
        break;
      case 'verify':
        result = await client.verifyNumber(args[1]);
        break;
      case 'contacts':
        result = await client.getContacts();
        if (Array.isArray(result)) {
          console.log(`Total contacts: ${result.length}`);
          if (args[1] !== '--full') {
            result = result.slice(0, 10).map(c => ({
              jid: c.remoteJid,
              name: c.pushName || c.profileName || '—',
            }));
            console.log('(showing first 10, use --full for all)');
          }
        }
        break;
      case 'groups':
        result = await client.getGroupList();
        if (Array.isArray(result)) {
          console.log(`Total groups: ${result.length}`);
          result = result.map(g => ({ id: g.id, name: g.subject, size: g.size }));
        }
        break;
      case 'group-members':
        result = await client.getGroupParticipants(args[1]);
        break;
      case 'search':
        result = await client.searchMessages(args[1]);
        break;
      case 'profile-pic':
        result = await client.getProfilePicture(args[1]);
        break;
      case 'messages':
        result = await client.fetchMessages(args[1], parseInt(args[2]) || 20);
        if (Array.isArray(result)) {
          console.log(`Total messages fetched: ${result.length}`);
          result = result.slice(-5).map(m => ({
            id: m.key?.id,
            from: m.key?.fromMe ? 'me' : m.pushName || m.key?.remoteJid,
            text: m.message?.conversation || m.message?.extendedTextMessage?.text || '[media]',
            time: m.messageTimestamp,
          }));
        }
        break;
      case 'presence':
        result = await client.sendPresence(args[1], args[2] || 'composing');
        break;
      default:
        console.error(`Unknown command: ${cmd}`);
        process.exit(1);
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

// Run CLI if executed directly
if (process.argv[1]?.endsWith('evolution-client.mjs')) {
  cli();
}
