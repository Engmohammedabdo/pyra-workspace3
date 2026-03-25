#!/usr/bin/env node
/**
 * Google OAuth2 Manual Auth Flow for VPS
 * 
 * Since we're on a VPS, we can't use localhost redirect.
 * This script:
 * 1. Generates auth URL for user to visit
 * 2. Starts a temporary HTTP server to capture the code
 * 3. Exchanges code for tokens
 * 4. Saves tokens for MCP server use
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import http from 'http';
import { URL } from 'url';

const CREDS_PATH = '/home/node/.openclaw/credentials/google-oauth-credentials.json';
const TOKEN_DIR = '/home/node/.openclaw/google-calendar-mcp';
const TOKEN_PATH = `${TOKEN_DIR}/tokens.json`;
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/drive',
];

const cmd = process.argv[2];

async function loadCreds() {
  const data = await readFile(CREDS_PATH, 'utf-8');
  return JSON.parse(data).installed;
}

async function generateAuthUrl() {
  const creds = await loadCreds();
  
  // Use http://localhost redirect — Desktop app flow
  // After approval, browser redirects to http://localhost?code=XXX
  // User copies the code from URL bar
  const params = new URLSearchParams({
    client_id: creds.client_id,
    redirect_uri: 'http://localhost',
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
  });

  const url = `${creds.auth_uri}?${params}`;
  console.log('\n🔗 افتح الرابط ده في المتصفح:\n');
  console.log(url);
  console.log('\n📋 بعد ما توافق، المتصفح هيحولك لصفحة مش شغالة (localhost)');
  console.log('   بس الكود موجود في الـ URL بار!');
  console.log('   انسخ الجزء بعد "code=" من الرابط');
  console.log('\n   مثال: http://localhost?code=4/0AXXXX... → انسخ 4/0AXXXX...');
  console.log(`\n   وابعتهولي هنا على تيليجرام 📎`);
}

async function exchangeCode(code) {
  const creds = await loadCreds();

  const params = new URLSearchParams({
    code,
    client_id: creds.client_id,
    client_secret: creds.client_secret,
    redirect_uri: 'http://localhost',
    grant_type: 'authorization_code',
  });

  const res = await fetch(creds.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await res.json();

  if (data.error) {
    console.error('❌ Error:', data.error, data.error_description);
    process.exit(1);
  }

  // Save tokens in the format MCP server expects
  await mkdir(TOKEN_DIR, { recursive: true });
  
  const tokens = {
    accounts: {
      mohammed: {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        scope: data.scope,
        token_type: data.token_type,
        expiry_date: Date.now() + (data.expires_in * 1000),
      }
    }
  };

  await writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log('✅ Tokens saved to', TOKEN_PATH);
  console.log('🎉 Google account authenticated successfully!');
  console.log('\nToken details:');
  console.log('  Access token:', data.access_token?.slice(0, 20) + '...');
  console.log('  Refresh token:', data.refresh_token ? '✅ received' : '❌ missing');
  console.log('  Expires in:', data.expires_in, 'seconds');
  console.log('  Scopes:', data.scope);
}

async function startCallbackServer() {
  const creds = await loadCreds();
  const PORT = 3500;
  
  const params = new URLSearchParams({
    client_id: creds.client_id,
    redirect_uri: `http://localhost:${PORT}/oauth2callback`,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
  });

  const url = `${creds.auth_uri}?${params}`;
  
  console.log('\n🔗 Auth URL:\n');
  console.log(url);
  console.log(`\n⏳ Waiting for callback on port ${PORT}...`);

  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      const u = new URL(req.url, `http://localhost:${PORT}`);
      if (u.pathname === '/oauth2callback') {
        const code = u.searchParams.get('code');
        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<h1>✅ Success! You can close this tab.</h1>');
          server.close();
          
          await exchangeCode(code);
          resolve(code);
        } else {
          res.writeHead(400);
          res.end('No code received');
        }
      }
    });
    
    server.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  });
}

async function showStatus() {
  try {
    const data = await readFile(TOKEN_PATH, 'utf-8');
    const tokens = JSON.parse(data);
    console.log('\n📊 Token Status:');
    for (const [name, token] of Object.entries(tokens.accounts || {})) {
      const expired = token.expiry_date < Date.now();
      console.log(`  ${name}:`);
      console.log(`    Access token: ${token.access_token?.slice(0, 20)}...`);
      console.log(`    Refresh token: ${token.refresh_token ? '✅' : '❌'}`);
      console.log(`    Expires: ${new Date(token.expiry_date).toISOString()} ${expired ? '⚠️ EXPIRED' : '✅'}`);
      console.log(`    Scopes: ${token.scope}`);
    }
  } catch {
    console.log('❌ No tokens found. Run: node google-auth.mjs auth');
  }
}

switch (cmd) {
  case 'auth':
    await generateAuthUrl();
    break;
  case 'exchange':
    if (!process.argv[3]) {
      console.error('Usage: node google-auth.mjs exchange <code>');
      process.exit(1);
    }
    await exchangeCode(process.argv[3]);
    break;
  case 'server':
    await startCallbackServer();
    break;
  case 'status':
    await showStatus();
    break;
  default:
    console.log(`
🔐 Google OAuth2 Auth Tool

Commands:
  auth        Generate auth URL (copy-paste flow — for VPS)
  exchange    Exchange auth code for tokens
  server      Start callback server (for local use)
  status      Show token status

Flow:
  1. node google-auth.mjs auth       → get URL
  2. Visit URL in browser            → approve
  3. Copy the code
  4. node google-auth.mjs exchange <code>  → save tokens
`);
}
