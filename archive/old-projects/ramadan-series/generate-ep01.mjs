import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';

const KIE_KEY = 'bb95f4d46f57be29c3181d55e246d403';
const SUPA_URL = 'https://db.pyramedia.info';
const SUPA_KEY = 'REDACTED_SUPABASE_SERVICE_KEY_1';
const BUCKET = 'pyraai-workspace';
const OUTDIR = '/home/node/openclaw/ramadan-series/images';
const ASSETS_FILE = '/home/node/openclaw/ramadan-series/EP01-assets.json';

fs.mkdirSync(OUTDIR, { recursive: true });

function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
    }, (res) => {
      if (options.binary) {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, buffer: Buffer.concat(chunks) }));
      } else {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, data, raw: true }); }
        });
      }
    });
    req.on('error', reject);
    if (options.body) req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    req.end();
  });
}

function fetchBinary(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchBinary(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
  });
}

async function createTask(prompt) {
  const body = {
    model: 'google/nano-banana',
    callBackUrl: 'https://example.com/callback',
    input: {
      prompt,
      output_format: 'png',
      image_size: '9:16'
    }
  };
  const resp = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${KIE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  return resp.data;
}

async function pollTask(taskId) {
  for (let i = 0; i < 60; i++) {
    const resp = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`, {
      headers: { 'Authorization': `Bearer ${KIE_KEY}` }
    });
    const d = resp.data?.data || resp.data;
    const state = d?.state || 'unknown';
    console.log(`  Poll #${i}: state=${state}`);
    if (state === 'success') return d;
    if (state === 'fail' || state === 'failed') throw new Error(`Task failed: ${JSON.stringify(d)}`);
    await new Promise(r => setTimeout(r, 10000));
  }
  throw new Error('Timeout');
}

function extractImageUrl(result) {
  // resultJson could be string or object
  let rj = result.resultJson;
  if (typeof rj === 'string') {
    try { rj = JSON.parse(rj); } catch {}
  }
  if (Array.isArray(rj)) {
    // Could be array of objects with url or array of strings
    const first = rj[0];
    if (typeof first === 'string') return first;
    if (first?.url) return first.url;
    if (first?.image_url) return first.image_url;
  }
  if (rj?.url) return rj.url;
  if (rj?.image_url) return rj.image_url;
  if (rj?.output) return rj.output;
  if (result.result_url) return result.result_url;
  if (result.output_url) return result.output_url;
  // Try to find any URL in the stringified result
  const str = JSON.stringify(result);
  const urlMatch = str.match(/https?:\/\/[^\s"',]+\.(png|jpg|jpeg|webp)/i);
  if (urlMatch) return urlMatch[0];
  return null;
}

async function getDownloadUrl(url) {
  try {
    const resp = await fetch('https://api.kie.ai/api/v1/common/download-url', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${KIE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url })
    });
    return resp.data?.data?.url || resp.data?.url || null;
  } catch { return null; }
}

async function downloadImage(url, outputPath) {
  // Try download-url endpoint first
  const dlUrl = await getDownloadUrl(url);
  const finalUrl = dlUrl || url;
  const buf = await fetchBinary(finalUrl);
  fs.writeFileSync(outputPath, buf);
  return buf.length;
}

async function uploadToSupabase(filePath, storagePath) {
  const fileData = fs.readFileSync(filePath);
  const urlObj = new URL(`${SUPA_URL}/storage/v1/object/${BUCKET}/${storagePath}`);
  
  return new Promise((resolve, reject) => {
    const req = https.request(urlObj, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPA_KEY}`,
        'Content-Type': 'image/png',
        'Content-Length': fileData.length,
        'x-upsert': 'true'
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        console.log(`  Supabase upload status: ${res.statusCode}`);
        resolve(`${SUPA_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`);
      });
    });
    req.on('error', reject);
    req.write(fileData);
    req.end();
  });
}

async function processImage(name, prompt, category, supaPath) {
  console.log(`\n=== Processing: ${name} ===`);
  
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      console.log(`  Creating task (attempt ${attempt + 1})...`);
      const createResp = await createTask(prompt);
      const taskId = createResp?.data?.task_id || createResp?.data?.taskId || createResp?.taskId || createResp?.task_id;
      
      if (!taskId) {
        console.log(`  ERROR: No taskId. Response: ${JSON.stringify(createResp)}`);
        continue;
      }
      
      console.log(`  TaskId: ${taskId}`);
      const result = await pollTask(taskId);
      const imgUrl = extractImageUrl(result);
      
      if (!imgUrl) {
        console.log(`  ERROR: No image URL found in result: ${JSON.stringify(result).slice(0, 500)}`);
        continue;
      }
      
      console.log(`  Image URL: ${imgUrl}`);
      const localFile = path.join(OUTDIR, `${name}.png`);
      const size = await downloadImage(imgUrl, localFile);
      console.log(`  Downloaded: ${size} bytes`);
      
      if (size < 1000) {
        console.log(`  ERROR: File too small, likely failed download`);
        continue;
      }
      
      const publicUrl = await uploadToSupabase(localFile, supaPath);
      console.log(`  ✅ Done: ${publicUrl}`);
      return { name, url: publicUrl, status: 'success' };
      
    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
      if (attempt < 1) {
        console.log(`  Retrying in 5s...`);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }
  
  console.log(`  ❌ FAILED after 2 attempts: ${name}`);
  return { name, url: null, status: 'failed' };
}

// All tasks
const tasks = [
  // Characters
  { name: 'dr-ahmed', prompt: 'Photorealistic portrait of a 40-year-old Egyptian male dentist in Dubai. He wears a white lab coat over a light blue shirt, thin-framed glasses, short dark hair with slight grey at temples, clean-shaven with light stubble, tired but professional expression. Modern dental clinic background with white and blue decor. Shot on Canon EOS R5, 85mm f/1.4, natural lighting, 4K quality', category: 'characters', path: 'projects/ramadan-series/characters/dr-ahmed.png' },
  { name: 'noura', prompt: 'Photorealistic portrait of a 30-year-old Arab female dental assistant in Dubai. She wears light blue medical scrubs, hair pulled back neatly under a medical cap, warm brown eyes, stressed but caring expression. Standing at a clinic reception desk with papers and a computer. Shot on Canon EOS R5, 85mm f/1.4, soft clinical lighting, 4K quality', category: 'characters', path: 'projects/ramadan-series/characters/noura.png' },
  { name: 'angry-patient', prompt: 'Photorealistic portrait of a 35-year-old Arab man holding his cheek in pain, wearing a casual white t-shirt, short beard, frustrated angry expression. Standing in a dental clinic waiting area in Dubai. Shot on Canon EOS R5, 85mm f/1.4, natural lighting, 4K quality', category: 'characters', path: 'projects/ramadan-series/characters/angry-patient.png' },
  { name: 'ahmed-friend', prompt: 'Photorealistic portrait of a 40-year-old Arab man in a modern Dubai Marina cafe. He wears a casual navy polo shirt, well-groomed short beard, friendly confident smile, holding a coffee cup. Warm ambient cafe lighting with Dubai skyline visible through windows. Shot on Canon EOS R5, 85mm f/1.4, warm lighting, 4K quality', category: 'characters', path: 'projects/ramadan-series/characters/ahmed-friend.png' },
  { name: 'mohammed', prompt: 'Photorealistic portrait of a late-20s Egyptian man, founder of a tech company in Dubai. He wears a black polo shirt with a small gold pyramid logo on chest, dark jeans, light neat beard, short dark hair, confident warm smile. Modern open-space office with navy blue and gold decor, large screens on walls. Shot on Canon EOS R5, 85mm f/1.4, warm office lighting, 4K quality', category: 'characters', path: 'projects/ramadan-series/characters/mohammed.png' },
  { name: 'bayra', prompt: 'Photorealistic portrait of a mid-20s Arab woman, AI assistant character. She wears a modern turquoise hijab, thin elegant glasses, white blouse, warm intelligent smile. Subtle cyan/turquoise glow (#00D4FF) around her. Clean tech background with floating data visualizations. Shot on Canon EOS R5, 85mm f/1.4, studio lighting with subtle cyan rim light, 4K quality', category: 'characters', path: 'projects/ramadan-series/characters/bayra.png' },
  // Scenes
  { name: 'hook-schedule', prompt: "Close-up shot of a paper appointment schedule on a clinic desk. A hand holding a red pen is crossing out 3 patient names one by one. The schedule shows Arabic names and times. Dramatic lighting, shallow depth of field. Shot on Canon EOS R5, 50mm f/1.2, 4K quality", category: 'scenes', path: 'projects/ramadan-series/storyboard/EP01/hook-schedule.png' },
  { name: 'empty-clinic', prompt: "Wide shot of a modern dental clinic waiting room in Dubai. 3 empty chairs in a row, fluorescent lighting, white and light blue decor. A 40-year-old Egyptian male dentist in white coat stands alone looking at his watch, sighing. Empty, quiet, lonely atmosphere. Shot on Canon EOS R5, 24mm f/2.8, 4K quality", category: 'scenes', path: 'projects/ramadan-series/storyboard/EP01/empty-clinic.png' },
  { name: 'noura-phone', prompt: "Medium shot of a 30-year-old Arab female dental assistant in blue scrubs at a reception desk. She's holding a phone to her ear with a frustrated expression. Computer screen shows 'No Answer' in Arabic. Papers scattered on desk. Shot on Canon EOS R5, 50mm f/1.4, clinical lighting, 4K quality", category: 'scenes', path: 'projects/ramadan-series/storyboard/EP01/noura-phone.png' },
  { name: 'angry-patient-reception', prompt: "Medium-wide shot inside a dental clinic reception in Dubai. An angry 35-year-old Arab man holding his cheek confronts a stressed female receptionist in blue scrubs. A 40-year-old dentist in white coat tries to calm the situation. Tense atmosphere, fluorescent lighting. Shot on Canon EOS R5, 35mm f/2.0, 4K quality", category: 'scenes', path: 'projects/ramadan-series/storyboard/EP01/angry-patient-reception.png' },
  { name: 'ahmed-breakdown', prompt: "Medium shot of a 40-year-old Egyptian dentist sitting alone in his small office. He's rubbing his face with his hands in frustration. An open laptop shows a messy colorful Excel spreadsheet. Medical certificates on the wall. Moody dramatic lighting. Shot on Canon EOS R5, 50mm f/1.4, 4K quality", category: 'scenes', path: 'projects/ramadan-series/storyboard/EP01/ahmed-breakdown.png' },
  { name: 'cafe-scene', prompt: "Two Arab men in their 40s sitting at a modern Dubai Marina cafe. One in white coat (came from clinic), looking stressed. The other in navy polo, smiling confidently, showing his phone screen to his friend. The phone screen shows a gold pyramid logo (Pyramedia). Warm ambient cafe lighting, Dubai skyline through windows. Shot on Canon EOS R5, 35mm f/2.0, 4K quality", category: 'scenes', path: 'projects/ramadan-series/storyboard/EP01/cafe-scene.png' },
];

async function main() {
  console.log('🎬 Starting EP01 Image Generation...');
  console.log('================================================');
  
  // Check credits first
  try {
    const credit = await fetch('https://api.kie.ai/api/v1/chat/credit', {
      headers: { 'Authorization': `Bearer ${KIE_KEY}` }
    });
    console.log('Credits:', JSON.stringify(credit.data));
  } catch (e) {
    console.log('Could not check credits:', e.message);
  }
  
  const assets = { characters: {}, scenes: {} };
  const results = [];
  
  for (const task of tasks) {
    const result = await processImage(task.name, task.prompt, task.category, task.path);
    results.push(result);
    if (result.status === 'success') {
      assets[task.category][task.name] = result.url;
    } else {
      assets[task.category][task.name] = 'FAILED';
    }
    // Save progress after each
    fs.writeFileSync(ASSETS_FILE, JSON.stringify(assets, null, 2));
  }
  
  console.log('\n================================================');
  console.log('🎬 ALL DONE!');
  console.log('\nResults:');
  for (const r of results) {
    console.log(`  ${r.status === 'success' ? '✅' : '❌'} ${r.name}: ${r.url || 'FAILED'}`);
  }
  console.log(`\nAssets saved to ${ASSETS_FILE}`);
  console.log(JSON.stringify(assets, null, 2));
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
