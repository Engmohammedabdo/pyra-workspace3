#!/usr/bin/env tsx
/**
 * Seed the lead-reactivation campaigns.
 *
 *   pnpm reactivation:seed            # dry run — prints what it WOULD create
 *   pnpm reactivation:seed --apply    # actually creates the campaigns
 *
 * Builds one DRAFT campaign per segment: the segment's own script (three
 * wordings, `---`-separated), its designated line, its daily cap, and its
 * contacts resolved live from pyra_sales_leads.
 *
 * Nothing is sent. Every campaign lands in `draft` for a human to review and
 * press send on, inside that line's window.
 *
 * Segment definition is IDENTICAL to the CSV export and the playbook: first
 * match wins, mobiles only, open leads only, suppression list excluded.
 */
import { existsSync, readFileSync } from 'node:fs';
import { generateId } from '../lib/utils/id';

const SUPABASE_HOST = 'pyraworkspacedb.pyramedia.cloud';
const ENV_FILE = '.env.local';

function fail(msg: string): never {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

function serviceKey(): string {
  if (!existsSync(ENV_FILE)) fail(`${ENV_FILE} not found — run from the repo root.`);
  const m = readFileSync(ENV_FILE, 'utf8').match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m);
  if (!m) fail('SUPABASE_SERVICE_ROLE_KEY missing from .env.local');
  return m[1].trim().replace(/^["']|["']$/g, '');
}

async function q<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const res = await fetch(`https://${SUPABASE_HOST}/pg/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', apikey: serviceKey() },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) fail(`pg/query HTTP ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text) as T[];
}

// ─── The scripts ────────────────────────────────────────────────────────────
// Three wordings per segment, separated by `---`. splitVariants() picks one
// per contact, seeded on the phone number, so a retry re-sends the same text.
//
// Every wording ends in a question with a short answer, carries no link (a
// link in a first message to an unknown number is the single highest-risk
// element), and stays under ~350 characters.

const S1 = `أهلاً {{name}}، معك يوسف من پيراميديا.

اتفقنا على ترتيب لقاء بخصوص محتوى {{company}} ولم أعد إليك في حينه، وأعتذر عن التأخير.

عندي الثلاثاء ١١ صباحاً أو الأربعاء ٤ عصراً. أيهما أنسب لك؟
---
{{name}} أهلاً بك، يوسف من پيراميديا.

كنا قد اتفقنا على موعد لمناقشة محتوى {{company}}، والتقصير في المتابعة مني.

أستطيع الحضور الثلاثاء صباحاً أو الأربعاء بعد الظهر. أيهما يناسبك؟
---
أهلاً {{name}}، يوسف من پيراميديا.

لم أعد إليك بعد اتفاقنا على اللقاء بخصوص {{company}} — اعتذاري عن ذلك.

هل نثبّت الموعد الثلاثاء ١١ صباحاً، أم تفضّل الأربعاء ٤ عصراً؟`;

const S2 = `أهلاً {{name}}، معك يوسف من پيراميديا.

تحدثنا قبل فترة عن المحتوى المرئي لـ{{company}} ولم نكمل النقاش.

جهّزت نموذجين لأعمال في نفس المجال. أرسلهما لك هنا، أم تفضّل مكالمة عشر دقائق؟
---
{{name}} أهلاً، يوسف من پيراميديا.

حديثنا عن المحتوى المرئي لـ{{company}} توقف قبل أن نصل إلى شيء عملي.

عندي نموذجان من نفس المجال. أرسلهما، أم مكالمة قصيرة أسهل؟
---
أهلاً {{name}}، معك يوسف من پيراميديا.

أعود إليك بخصوص المحتوى المرئي لـ{{company}}.

اخترت لك عملين قريبين من نشاطكم. تفضّل أن أرسلهما هنا أم نتحدث عشر دقائق؟`;

const S3 = `أهلاً {{name}}، معك يوسف من پيراميديا.

تواصلنا سابقاً بخصوص المحتوى المرئي لـ{{company}}.

سؤال واحد فقط: هل تنتجون فيديوهات لحساباتكم حالياً، أم متوقفة؟
---
{{name}} أهلاً، يوسف من پيراميديا.

كنا قد تحدثنا باختصار عن المحتوى المرئي لـ{{company}}.

سؤال سريع: الفيديوهات على حساباتكم شغّالة حالياً أم متوقفة؟
---
أهلاً {{name}}، يوسف من پيراميديا — إنتاج فيديو ومحتوى في دبي.

تواصلنا معكم قبل فترة بخصوص {{company}}.

هل لديكم إنتاج فيديو قائم الآن، أم الموضوع مؤجل؟`;

const S4 = `أهلاً {{name}}، معك يوسف من پيراميديا.

وصلنا استفساركم بخصوص {{company}} ونعتذر عن تأخر الرد.

هل ما زال الطلب قائماً؟ لو نعم، أخبرني بنوع المشروع وأرسل لك التفاصيل اليوم.
---
{{name}} أهلاً بك، يوسف من پيراميديا.

استفساركم عن {{company}} وصلنا، والتأخير في الرد تقصير منا.

هل الطلب ما زال قائماً؟ أخبرني بنوع المشروع وأرسل التفاصيل اليوم.
---
أهلاً {{name}}، معك يوسف من پيراميديا.

أعتذر عن تأخر ردنا على استفساركم بخصوص {{company}}.

هل الموضوع ما زال مطروحاً عندكم؟`;

const S5 = `أهلاً {{name}}، معك يوسف من پيراميديا — إنتاج فيديو ومحتوى في دبي.

تواصلنا معكم باختصار قبل فترة.

نعمل حالياً مع عدد من الشركات في الإمارات على فيديوهات قصيرة للسوشيال ميديا. هل يهمكم أن أرسل نموذجين؟
---
{{name}} أهلاً، يوسف من پيراميديا لإنتاج الفيديو والمحتوى في دبي.

كان بيننا تواصل سريع قبل فترة.

ننتج حالياً فيديوهات قصيرة للسوشيال ميديا لشركات في الإمارات. أرسل لكم نموذجين؟
---
أهلاً {{name}}، يوسف من پيراميديا — إنتاج فيديو ومحتوى، دبي.

تحدثنا باختصار سابقاً بخصوص {{company}}.

هل تودّون الاطلاع على نموذجين من أعمالنا في نفس المجال؟`;

const S6 = `أهلاً {{name}}، معك يوسف من پيراميديا — إنتاج فيديو ومحتوى في دبي.

حاولت الاتصال بكم ولم يتيسّر الرد.

هل الواتساب أنسب للتواصل معكم؟
---
{{name}} أهلاً، يوسف من پيراميديا لإنتاج الفيديو والمحتوى في دبي.

اتصلت بكم ولم أوفّق في الوصول.

هل أتواصل معكم هنا على الواتساب بدلاً من الاتصال؟
---
أهلاً {{name}}، معك يوسف من پيراميديا — إنتاج فيديو ومحتوى، دبي.

حاولت الوصول إليكم هاتفياً دون توفيق.

ما القناة الأنسب للتواصل معكم؟`;

const S7 = `أهلاً {{name}}، معك يوسف من پيراميديا — إنتاج فيديو ومحتوى في دبي.

نتواصل مع شركات بخصوص محتوى السوشيال ميديا.

لو الموضوع لا يهمكم، أخبرني وأتوقف. ولو يهمكم، أرسل لك نموذج عمل.
---
{{name}} أهلاً، يوسف من پيراميديا لإنتاج الفيديو والمحتوى في دبي.

نعمل مع شركات في الإمارات على محتوى السوشيال ميديا.

هل الموضوع ذو صلة بكم؟ إن لم يكن، أخبرني وأتوقف فوراً.
---
أهلاً {{name}}، يوسف من پيراميديا — إنتاج فيديو ومحتوى، دبي.

أتواصل بخصوص محتوى السوشيال ميديا لـ{{company}}.

إن لم يكن هذا مناسباً، كلمة واحدة وأتوقف. وإن كان، أرسل لك نموذجاً.`;

interface Segment {
  key: string;
  name: string;
  /** SQL predicate applied on top of the shared open-mobile-lead base. */
  match: string;
  instance: string;
  dailyCap: number;
  template: string;
  /** Warm audience on the notification line — see migration 065. */
  allowNotificationLine?: boolean;
}

const SEGMENTS: Segment[] = [
  { key: 's1_meeting',        name: 'استرجاع — اجتماع متفق عليه',      match: `stage = 'اجتماع'`,      instance: 'pyraai', dailyCap: 10, template: S1, allowNotificationLine: true },
  { key: 's2_talk_5min',      name: 'استرجاع — تحدثوا 5 دقائق فأكثر',  match: `talk_sec >= 300`,       instance: 'pyraai', dailyCap: 10, template: S2, allowNotificationLine: true },
  { key: 's3_talk_2to5min',   name: 'استرجاع — تحدثوا 2 إلى 5 دقائق',  match: `talk_sec >= 120`,       instance: 'selver', dailyCap: 10, template: S3 },
  { key: 's4_inbound',        name: 'استرجاع — استفسار وارد',          match: `stage = 'استفسار جديد'`, instance: 'selver', dailyCap: 10, template: S4 },
  { key: 's5_short_convo',    name: 'استرجاع — مكالمة قصيرة',          match: `convos >= 1`,           instance: 'yellow', dailyCap: 40, template: S5 },
  { key: 's6_no_answer',      name: 'استرجاع — لم يردّوا',             match: `attempts >= 1`,         instance: 'yellow', dailyCap: 40, template: S6 },
  { key: 's7_never_called',   name: 'استرجاع — لم يُتصل بهم',          match: `TRUE`,                  instance: 'yellow', dailyCap: 40, template: S7 },
];

/**
 * Shared base: open leads on a UAE mobile, excluding anyone on the global
 * suppression list. Segments are evaluated FIRST-MATCH-WINS in array order, so
 * each later segment also excludes every earlier one's predicate.
 */
function segmentSql(index: number): string {
  const prior = SEGMENTS.slice(0, index).map((s) => `NOT (${s.match})`).join(' AND ') || 'TRUE';
  return `
WITH c AS (
  SELECT lead_id,
         count(*)                                                     AS attempts,
         count(*) FILTER (WHERE duration_seconds >= 30)                AS convos,
         COALESCE(sum(duration_seconds) FILTER (WHERE duration_seconds >= 30), 0) AS talk_sec
  FROM pyra_agent_calls WHERE lead_id IS NOT NULL GROUP BY lead_id
),
base AS (
  SELECT l.id, l.name, l.phone, l.company, s.name_ar AS stage,
         COALESCE(c.attempts, 0) AS attempts,
         COALESCE(c.convos, 0)   AS convos,
         COALESCE(c.talk_sec, 0) AS talk_sec
  FROM pyra_sales_leads l
  LEFT JOIN pyra_sales_pipeline_stages s ON s.id = l.stage_id
  LEFT JOIN c ON c.lead_id = l.id
  WHERE (regexp_replace(l.phone, '[^0-9]', '', 'g') LIKE '9715%'
      OR regexp_replace(l.phone, '[^0-9]', '', 'g') LIKE '05%')
    AND l.is_converted IS NOT TRUE
    AND COALESCE(s.name_ar, '') NOT IN ('غير مهتم', 'خسارة')
    AND NOT EXISTS (
          SELECT 1 FROM pyra_whatsapp_suppressions sup
          WHERE sup.phone_key = RIGHT(regexp_replace(l.phone, '[^0-9]', '', 'g'), 9)
        )
)
SELECT id, name, phone, company FROM base
WHERE (${prior}) AND (${SEGMENTS[index].match})
ORDER BY talk_sec DESC, id;`;
}

function esc(v: string | null): string {
  return v === null ? 'NULL' : `'${v.replace(/'/g, "''")}'`;
}

async function main() {
  const apply = process.argv.includes('--apply');

  // Refuse to run against lines that cannot actually send.
  const lines = await q<{ instance_name: string; status: string; has_key: boolean; is_notification_line: boolean }>(
    `SELECT instance_name, status, (api_key IS NOT NULL AND length(trim(api_key)) > 0) AS has_key,
            is_notification_line FROM pyra_whatsapp_instances`,
  );
  for (const seg of SEGMENTS) {
    const line = lines.find((l) => l.instance_name === seg.instance);
    if (!line) fail(`Line "${seg.instance}" is not registered.`);
    if (line.status !== 'connected') fail(`Line "${seg.instance}" is not connected.`);
    if (!line.has_key) fail(`Line "${seg.instance}" has no api_key — sends would 401.`);
    if (line.is_notification_line && !seg.allowNotificationLine) {
      fail(`Segment "${seg.key}" targets the notification line without an opt-in.`);
    }
  }

  const existing = await q<{ segment_key: string }>(
    `SELECT segment_key FROM pyra_whatsapp_campaigns WHERE segment_key IS NOT NULL`,
  );
  const already = new Set(existing.map((e) => e.segment_key));

  let grand = 0;
  const statements: string[] = [];

  for (let i = 0; i < SEGMENTS.length; i++) {
    const seg = SEGMENTS[i];
    const leads = await q<{ id: string; name: string | null; phone: string; company: string | null }>(
      segmentSql(i),
    );
    grand += leads.length;

    const skip = already.has(seg.key);
    const days = Math.ceil(leads.length / seg.dailyCap);
    console.log(
      `${seg.key.padEnd(18)} ${String(leads.length).padStart(4)} leads  ` +
      `→ ${seg.instance.padEnd(7)} cap ${String(seg.dailyCap).padStart(3)}/day  ` +
      `≈ ${String(days).padStart(2)} day(s)${skip ? '   [EXISTS — skipped]' : ''}`,
    );
    if (skip || leads.length === 0) continue;

    // The app's own id helper: these columns are varchar(30) and a
    // descriptive id built from the segment key overflows them.
    const campId = generateId('camp');
    statements.push(`
INSERT INTO pyra_whatsapp_campaigns
  (id, name, message_template, status, instance_name, daily_cap, segment_key,
   allow_notification_line, total_contacts, sent_count, delivered_count,
   read_count, replied_count, created_by)
VALUES (${esc(campId)}, ${esc(seg.name)}, ${esc(seg.template)}, 'draft',
        ${esc(seg.instance)}, ${seg.dailyCap}, ${esc(seg.key)},
        ${seg.allowNotificationLine ? 'true' : 'false'}, ${leads.length},
        0, 0, 0, 0, 'elharm');`);

    // Chunked multi-row inserts keep the statement well under any body limit.
    for (let j = 0; j < leads.length; j += 200) {
      const rows = leads.slice(j, j + 200).map((l) =>
        `(${esc(generateId('cc'))}, ${esc(campId)}, ${esc(l.phone)}, ` +
        `${esc(l.name)}, ${esc(l.id)}, 'pending')`,
      );
      statements.push(
        `INSERT INTO pyra_whatsapp_campaign_contacts\n` +
        `  (id, campaign_id, contact_phone, contact_name, lead_id, status)\nVALUES\n` +
        rows.join(',\n') + ';',
      );
    }
  }

  console.log(`\n${grand} leads across ${SEGMENTS.length} segments.`);

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to create the campaigns (all as DRAFT).');
    return;
  }
  if (statements.length === 0) {
    console.log('\nNothing to create — every segment already has a campaign.');
    return;
  }

  await q(`BEGIN;\n${statements.join('\n')}\nCOMMIT;`);
  const check = await q<{ segment_key: string; total_contacts: number; instance_name: string; status: string }>(
    `SELECT segment_key, total_contacts, instance_name, status
       FROM pyra_whatsapp_campaigns WHERE segment_key IS NOT NULL ORDER BY segment_key`,
  );
  console.log('\n✅ Created:');
  for (const c of check) {
    console.log(`   ${c.segment_key.padEnd(18)} ${String(c.total_contacts).padStart(4)} → ${c.instance_name} (${c.status})`);
  }
  console.log('\nAll DRAFT. Nothing has been sent.');
}

main().catch((e) => fail(String(e)));
