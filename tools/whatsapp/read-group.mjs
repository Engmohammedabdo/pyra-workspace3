/**
 * WhatsApp Group Reader — PyraAI 🦊
 * قراءة رسائل جروبات واتساب عبر Evolution API
 */

const EVO_URL = 'https://evo.pyramedia.info';
const EVO_KEY = '5002E96781AE-4AB5-AD97-A5F6234570EC';
const INSTANCE = 'pyraai';

const GROUPS = {
  'المطبخ': '120363193205216185@g.us',
  'المراجعة القانونية': '120363406537842528@g.us',
  'PyraAi X Beauty wise': '120363406105317872@g.us'
};

async function fetchMessages(remoteJid, limit = 20) {
  const res = await fetch(`${EVO_URL}/chat/findMessages/${INSTANCE}`, {
    method: 'POST',
    headers: { 'apikey': EVO_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ where: { key: { remoteJid } }, limit })
  });
  const data = await res.json();
  return data.messages?.records || [];
}

async function fetchAudioBase64(msg) {
  const res = await fetch(`${EVO_URL}/chat/getBase64FromMediaMessage/${INSTANCE}`, {
    method: 'POST',
    headers: { 'apikey': EVO_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: msg, convertToMp4: false })
  });
  return await res.json();
}

async function listGroups() {
  const res = await fetch(`${EVO_URL}/group/fetchAllGroups/${INSTANCE}?getParticipants=false`, {
    headers: { 'apikey': EVO_KEY }
  });
  return await res.json();
}

// CLI
const [,, cmd, ...args] = process.argv;

if (cmd === 'groups') {
  const groups = await listGroups();
  groups.forEach(g => console.log(g.id, '|', g.subject, '| size:', g.size));
} else if (cmd === 'messages') {
  const groupName = args[0] || 'المطبخ';
  const jid = GROUPS[groupName] || args[0];
  const limit = parseInt(args[1]) || 20;
  const msgs = await fetchMessages(jid, limit);
  console.log(`\n📱 ${groupName} — ${msgs.length} messages:\n`);
  msgs.forEach(m => {
    const ts = m.messageTimestamp ? new Date(Number(m.messageTimestamp)*1000).toLocaleString('en-GB',{timeZone:'Asia/Dubai'}) : '';
    const from = m.key?.participant?.split('@')[0] || m.key?.remoteJid?.split('@')[0] || '';
    const audio = m.message?.audioMessage ? '🎤 VOICE NOTE' : '';
    const img = m.message?.imageMessage ? '📷 IMAGE' : '';
    const video = m.message?.videoMessage ? '🎥 VIDEO' : '';
    const doc = m.message?.documentMessage ? '📄 DOC' : '';
    const text = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
    console.log(`${ts} | ${from} | ${audio || img || video || doc || text.substring(0,100)}`);
  });
} else if (cmd === 'audio') {
  const messageId = args[0];
  if (!messageId) { console.log('Usage: node read-group.mjs audio <messageId>'); process.exit(1); }
  const result = await fetchAudioBase64({ key: { id: messageId } });
  if (result.base64) {
    const fs = await import('fs');
    const buf = Buffer.from(result.base64, 'base64');
    const outPath = `/tmp/voice-${messageId}.ogg`;
    fs.writeFileSync(outPath, buf);
    console.log('✅ Saved to:', outPath, '| Size:', buf.length, 'bytes');
  } else {
    console.log('Result:', JSON.stringify(result).substring(0, 300));
  }
} else if (cmd === 'all') {
  for (const [name, jid] of Object.entries(GROUPS)) {
    const msgs = await fetchMessages(jid, 5);
    console.log(`\n${name}: ${msgs.length} messages`);
    msgs.forEach(m => {
      const ts = m.messageTimestamp ? new Date(Number(m.messageTimestamp)*1000).toLocaleString('en-GB',{timeZone:'Asia/Dubai'}) : '';
      const from = m.key?.participant?.split('@')[0] || '';
      const text = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
      const audio = m.message?.audioMessage ? '🎤' : '';
      console.log(`  ${ts} | ${from} | ${audio || text.substring(0,60)}`);
    });
  }
} else {
  console.log('WhatsApp Group Reader 🦊\n');
  console.log('Usage:');
  console.log('  node read-group.mjs groups              — list all groups');
  console.log('  node read-group.mjs messages المطبخ     — read group messages');
  console.log('  node read-group.mjs messages <JID> 50   — read by JID with limit');
  console.log('  node read-group.mjs audio <messageId>   — download voice note');
  console.log('  node read-group.mjs all                 — check all groups');
}
