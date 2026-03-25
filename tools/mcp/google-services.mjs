#!/usr/bin/env node
/**
 * PyraAI Google Services MCP Server — Gmail + Drive
 * 
 * Usage (via mcp-client.mjs):
 *   Spawned with first arg "gmail" or "drive" to select service mode.
 *   Provides tools for the selected service using existing OAuth tokens.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { google } from 'googleapis';
import { readFile, writeFile } from 'fs/promises';

const SERVICE_MODE = process.argv[2] || 'gmail'; // "gmail" or "drive"
const TOKENS_PATH = '/home/node/.openclaw/google-calendar-mcp/tokens.json';
const CREDENTIALS_PATH = '/home/node/.openclaw/credentials/google-oauth-credentials.json';
const ACCOUNT = 'mohammed';

// ─── Auth ───

let oauth2Client = null;

async function getAuth() {
  if (oauth2Client) return oauth2Client;

  const creds = JSON.parse(await readFile(CREDENTIALS_PATH, 'utf-8'));
  const { client_id, client_secret, redirect_uris } = creds.installed;

  oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const tokens = JSON.parse(await readFile(TOKENS_PATH, 'utf-8'));
  const userTokens = tokens[ACCOUNT];
  if (!userTokens) throw new Error(`No tokens found for account "${ACCOUNT}"`);

  oauth2Client.setCredentials({
    access_token: userTokens.access_token,
    refresh_token: userTokens.refresh_token,
    expiry_date: userTokens.expiry_date,
    token_type: userTokens.token_type || 'Bearer',
    scope: userTokens.scope,
  });

  // Auto-refresh listener — save new tokens
  oauth2Client.on('tokens', async (newTokens) => {
    try {
      const allTokens = JSON.parse(await readFile(TOKENS_PATH, 'utf-8'));
      if (newTokens.access_token) allTokens[ACCOUNT].access_token = newTokens.access_token;
      if (newTokens.expiry_date) allTokens[ACCOUNT].expiry_date = newTokens.expiry_date;
      if (newTokens.refresh_token) allTokens[ACCOUNT].refresh_token = newTokens.refresh_token;
      await writeFile(TOKENS_PATH, JSON.stringify(allTokens, null, 2));
    } catch (e) {
      console.error('Failed to save refreshed tokens:', e.message);
    }
  });

  return oauth2Client;
}

// ─── Helpers ───

function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function text(content) {
  return { content: [{ type: 'text', text: String(content) }] };
}

function errorResult(msg) {
  return { content: [{ type: 'text', text: `❌ ${msg}` }], isError: true };
}

// ─── Gmail Tools ───

const GMAIL_TOOLS = [
  {
    name: 'gmail-list-messages',
    description: 'List recent email messages with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Gmail search query (e.g. "is:unread", "from:someone@email.com")' },
        maxResults: { type: 'number', description: 'Max messages to return (default 10, max 50)' },
        label: { type: 'string', description: 'Label to filter by (e.g. INBOX, SENT, STARRED)' },
      },
    },
  },
  {
    name: 'gmail-read-message',
    description: 'Read a specific email message by ID. Returns subject, from, to, date, and body text.',
    inputSchema: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'The message ID to read' },
      },
      required: ['messageId'],
    },
  },
  {
    name: 'gmail-search',
    description: 'Search emails using Gmail search syntax (same as gmail-list-messages but semantically for search)',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Gmail search query' },
        maxResults: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'gmail-send',
    description: 'Send a new email',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject' },
        body: { type: 'string', description: 'Email body (plain text)' },
        cc: { type: 'string', description: 'CC recipients (comma-separated)' },
        bcc: { type: 'string', description: 'BCC recipients (comma-separated)' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'gmail-reply',
    description: 'Reply to an existing email message',
    inputSchema: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'ID of the message to reply to' },
        body: { type: 'string', description: 'Reply body (plain text)' },
      },
      required: ['messageId', 'body'],
    },
  },
  {
    name: 'gmail-labels',
    description: 'List all Gmail labels',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'gmail-unread-count',
    description: 'Get count of unread messages, optionally filtered by label',
    inputSchema: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Label to check (default: INBOX)' },
      },
    },
  },
];

async function handleGmail(toolName, args) {
  const auth = await getAuth();
  const gmail = google.gmail({ version: 'v1', auth });

  switch (toolName) {
    case 'gmail-list-messages':
    case 'gmail-search': {
      const maxResults = Math.min(args.maxResults || 10, 50);
      const q = args.query || '';
      const labelIds = args.label ? [args.label] : undefined;
      
      const res = await gmail.users.messages.list({
        userId: 'me', q, maxResults, labelIds,
      });

      const messages = res.data.messages || [];
      if (messages.length === 0) return text('No messages found.');

      const summaries = [];
      for (const msg of messages) {
        const detail = await gmail.users.messages.get({
          userId: 'me', id: msg.id, format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'Date'],
        });
        const headers = detail.data.payload?.headers || [];
        const get = (name) => headers.find(h => h.name === name)?.value || '';
        const snippet = detail.data.snippet || '';
        summaries.push(`📧 [${msg.id}] ${get('Subject')}\n   From: ${get('From')}\n   Date: ${get('Date')}\n   ${snippet}`);
      }
      return text(summaries.join('\n\n'));
    }

    case 'gmail-read-message': {
      const msg = await gmail.users.messages.get({
        userId: 'me', id: args.messageId, format: 'full',
      });
      const headers = msg.data.payload?.headers || [];
      const get = (name) => headers.find(h => h.name === name)?.value || '';

      // Extract body
      let bodyText = '';
      const parts = msg.data.payload?.parts || [];
      
      function findBody(payload) {
        if (payload.mimeType === 'text/plain' && payload.body?.data) {
          return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
        }
        if (payload.parts) {
          for (const part of payload.parts) {
            const found = findBody(part);
            if (found) return found;
          }
        }
        if (payload.mimeType === 'text/html' && payload.body?.data) {
          return stripHtml(Buffer.from(payload.body.data, 'base64url').toString('utf-8'));
        }
        return null;
      }

      bodyText = findBody(msg.data.payload) || '';
      if (!bodyText && msg.data.payload?.body?.data) {
        const raw = Buffer.from(msg.data.payload.body.data, 'base64url').toString('utf-8');
        bodyText = msg.data.payload.mimeType === 'text/html' ? stripHtml(raw) : raw;
      }

      return text(
        `📧 Message: ${args.messageId}\n` +
        `Subject: ${get('Subject')}\n` +
        `From: ${get('From')}\n` +
        `To: ${get('To')}\n` +
        `Date: ${get('Date')}\n` +
        `Labels: ${(msg.data.labelIds || []).join(', ')}\n` +
        `─────────────────────\n${bodyText || '(empty body)'}`
      );
    }

    case 'gmail-send': {
      const headers = [
        `To: ${args.to}`,
        `Subject: ${args.subject}`,
        `Content-Type: text/plain; charset=utf-8`,
      ];
      if (args.cc) headers.push(`Cc: ${args.cc}`);
      if (args.bcc) headers.push(`Bcc: ${args.bcc}`);
      
      const raw = Buffer.from(headers.join('\r\n') + '\r\n\r\n' + args.body)
        .toString('base64url');

      const res = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw },
      });
      return text(`✅ Email sent! Message ID: ${res.data.id}`);
    }

    case 'gmail-reply': {
      // Get original message for threading
      const original = await gmail.users.messages.get({
        userId: 'me', id: args.messageId, format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'To', 'Message-ID', 'References', 'In-Reply-To'],
      });
      const oHeaders = original.data.payload?.headers || [];
      const get = (name) => oHeaders.find(h => h.name === name)?.value || '';
      
      const subject = get('Subject').startsWith('Re:') ? get('Subject') : `Re: ${get('Subject')}`;
      const replyTo = get('From');
      const messageId = get('Message-ID');
      const references = get('References') ? `${get('References')} ${messageId}` : messageId;

      const headers = [
        `To: ${replyTo}`,
        `Subject: ${subject}`,
        `In-Reply-To: ${messageId}`,
        `References: ${references}`,
        `Content-Type: text/plain; charset=utf-8`,
      ];

      const raw = Buffer.from(headers.join('\r\n') + '\r\n\r\n' + args.body)
        .toString('base64url');

      const res = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw, threadId: original.data.threadId },
      });
      return text(`✅ Reply sent! Message ID: ${res.data.id}`);
    }

    case 'gmail-labels': {
      const res = await gmail.users.labels.list({ userId: 'me' });
      const labels = (res.data.labels || [])
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(l => `• ${l.name} (${l.id}) — type: ${l.type}`)
        .join('\n');
      return text(`📋 Gmail Labels:\n${labels}`);
    }

    case 'gmail-unread-count': {
      const labelId = args.label || 'INBOX';
      const label = await gmail.users.labels.get({ userId: 'me', id: labelId });
      return text(
        `📬 Unread in ${label.data.name || labelId}: ${label.data.messagesUnread || 0}\n` +
        `   Total messages: ${label.data.messagesTotal || 0}`
      );
    }

    default:
      return errorResult(`Unknown Gmail tool: ${toolName}`);
  }
}

// ─── Drive Tools ───

const DRIVE_TOOLS = [
  {
    name: 'drive-list-files',
    description: 'List files and folders in Google Drive',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Drive search query (e.g. "mimeType=\'application/pdf\'")' },
        maxResults: { type: 'number', description: 'Max files to return (default 10, max 100)' },
        folderId: { type: 'string', description: 'List files in a specific folder ID' },
      },
    },
  },
  {
    name: 'drive-search',
    description: 'Search files by name or content',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text (searches file names and content)' },
        maxResults: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'drive-read-file',
    description: 'Read file content (text files, Google Docs/Sheets exported as plain text)',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'The file ID to read' },
      },
      required: ['fileId'],
    },
  },
  {
    name: 'drive-upload-file',
    description: 'Upload/create a file in Google Drive',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'File name' },
        content: { type: 'string', description: 'File content (text)' },
        mimeType: { type: 'string', description: 'MIME type (default: text/plain)' },
        folderId: { type: 'string', description: 'Parent folder ID (optional)' },
      },
      required: ['name', 'content'],
    },
  },
  {
    name: 'drive-create-folder',
    description: 'Create a new folder in Google Drive',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Folder name' },
        parentId: { type: 'string', description: 'Parent folder ID (optional)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'drive-share',
    description: 'Share a file or folder with someone',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'File or folder ID to share' },
        email: { type: 'string', description: 'Email address to share with' },
        role: { type: 'string', description: 'Permission role: reader, writer, commenter (default: reader)' },
      },
      required: ['fileId', 'email'],
    },
  },
  {
    name: 'drive-get-info',
    description: 'Get file metadata (size, owner, shared status, modified date)',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'File ID' },
      },
      required: ['fileId'],
    },
  },
];

async function handleDrive(toolName, args) {
  const auth = await getAuth();
  const drive = google.drive({ version: 'v3', auth });

  switch (toolName) {
    case 'drive-list-files': {
      const maxResults = Math.min(args.maxResults || 10, 100);
      let q = args.query || '';
      if (args.folderId) {
        const folderQ = `'${args.folderId}' in parents`;
        q = q ? `${q} and ${folderQ}` : folderQ;
      }
      if (!q.includes('trashed')) {
        q = q ? `${q} and trashed = false` : 'trashed = false';
      }

      const res = await drive.files.list({
        q, pageSize: maxResults,
        fields: 'files(id,name,mimeType,size,modifiedTime,owners)',
        orderBy: 'modifiedTime desc',
      });

      const files = res.data.files || [];
      if (files.length === 0) return text('No files found.');

      const lines = files.map(f => {
        const isFolder = f.mimeType === 'application/vnd.google-apps.folder';
        const icon = isFolder ? '📁' : '📄';
        const size = f.size ? ` (${formatSize(Number(f.size))})` : '';
        const modified = f.modifiedTime ? ` — ${new Date(f.modifiedTime).toLocaleDateString()}` : '';
        return `${icon} ${f.name}${size}${modified}\n   ID: ${f.id}\n   Type: ${f.mimeType}`;
      });
      return text(lines.join('\n\n'));
    }

    case 'drive-search': {
      const maxResults = Math.min(args.maxResults || 10, 100);
      const q = `fullText contains '${args.query.replace(/'/g, "\\'")}' and trashed = false`;

      const res = await drive.files.list({
        q, pageSize: maxResults,
        fields: 'files(id,name,mimeType,size,modifiedTime)',
        orderBy: 'modifiedTime desc',
      });

      const files = res.data.files || [];
      if (files.length === 0) return text(`No files found matching "${args.query}".`);

      const lines = files.map(f => {
        const size = f.size ? ` (${formatSize(Number(f.size))})` : '';
        return `📄 ${f.name}${size}\n   ID: ${f.id}\n   Type: ${f.mimeType}`;
      });
      return text(`🔍 Search results for "${args.query}":\n\n${lines.join('\n\n')}`);
    }

    case 'drive-read-file': {
      // First get file metadata to determine type
      const meta = await drive.files.get({
        fileId: args.fileId,
        fields: 'id,name,mimeType,size',
      });

      const { mimeType, name } = meta.data;
      let content = '';

      // Google Workspace files need export
      const exportMap = {
        'application/vnd.google-apps.document': 'text/plain',
        'application/vnd.google-apps.spreadsheet': 'text/csv',
        'application/vnd.google-apps.presentation': 'text/plain',
        'application/vnd.google-apps.drawing': 'image/svg+xml',
      };

      if (exportMap[mimeType]) {
        const res = await drive.files.export({
          fileId: args.fileId,
          mimeType: exportMap[mimeType],
        }, { responseType: 'text' });
        content = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      } else {
        const res = await drive.files.get({
          fileId: args.fileId,
          alt: 'media',
        }, { responseType: 'text' });
        content = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      }

      // Truncate very large files
      if (content.length > 50000) {
        content = content.substring(0, 50000) + '\n\n... (truncated, file too large)';
      }

      return text(`📄 ${name} (${mimeType})\n─────────────────────\n${content}`);
    }

    case 'drive-upload-file': {
      const metadata = { name: args.name };
      if (args.folderId) metadata.parents = [args.folderId];

      const res = await drive.files.create({
        requestBody: metadata,
        media: {
          mimeType: args.mimeType || 'text/plain',
          body: args.content,
        },
        fields: 'id,name,webViewLink',
      });

      return text(
        `✅ File uploaded!\n` +
        `   Name: ${res.data.name}\n` +
        `   ID: ${res.data.id}\n` +
        `   Link: ${res.data.webViewLink || 'N/A'}`
      );
    }

    case 'drive-create-folder': {
      const metadata = {
        name: args.name,
        mimeType: 'application/vnd.google-apps.folder',
      };
      if (args.parentId) metadata.parents = [args.parentId];

      const res = await drive.files.create({
        requestBody: metadata,
        fields: 'id,name,webViewLink',
      });

      return text(
        `✅ Folder created!\n` +
        `   Name: ${res.data.name}\n` +
        `   ID: ${res.data.id}\n` +
        `   Link: ${res.data.webViewLink || 'N/A'}`
      );
    }

    case 'drive-share': {
      await drive.permissions.create({
        fileId: args.fileId,
        requestBody: {
          type: 'user',
          role: args.role || 'reader',
          emailAddress: args.email,
        },
        sendNotificationEmail: true,
      });

      return text(`✅ Shared file ${args.fileId} with ${args.email} (role: ${args.role || 'reader'})`);
    }

    case 'drive-get-info': {
      const res = await drive.files.get({
        fileId: args.fileId,
        fields: 'id,name,mimeType,size,createdTime,modifiedTime,owners,shared,webViewLink,parents,sharingUser,permissions',
      });

      const f = res.data;
      const owner = f.owners?.[0]?.emailAddress || 'unknown';
      const size = f.size ? formatSize(Number(f.size)) : 'N/A (Google file)';

      return text(
        `📄 File Info: ${f.name}\n` +
        `   ID: ${f.id}\n` +
        `   Type: ${f.mimeType}\n` +
        `   Size: ${size}\n` +
        `   Owner: ${owner}\n` +
        `   Shared: ${f.shared ? 'Yes' : 'No'}\n` +
        `   Created: ${f.createdTime}\n` +
        `   Modified: ${f.modifiedTime}\n` +
        `   Link: ${f.webViewLink || 'N/A'}`
      );
    }

    default:
      return errorResult(`Unknown Drive tool: ${toolName}`);
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// ─── MCP Server Setup ───

const tools = SERVICE_MODE === 'drive' ? DRIVE_TOOLS : GMAIL_TOOLS;
const handler = SERVICE_MODE === 'drive' ? handleDrive : handleGmail;

const server = new Server(
  { name: `google-${SERVICE_MODE}`, version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  try {
    return await handler(name, args);
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message || String(err);
    return errorResult(`${name} failed: ${msg}`);
  }
});

// Start
const transport = new StdioServerTransport();
await server.connect(transport);
