import { ImapFlow } from "imapflow";
import { createTransport } from "nodemailer";
import { readFileSync } from "fs";

// Load credentials from env file
const envFile = readFileSync("/home/node/.openclaw/credentials/pyra-voice.env", "utf8");
const env = Object.fromEntries(
  envFile.split("\n").filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

// IMAP — read emails
const client = new ImapFlow({
  host: "mail.pyramedia.info",
  port: 993,
  secure: true,
  auth: { user: env.BAYRA_EMAIL_USER, pass: env.BAYRA_EMAIL_PASS },
  logger: false,
});

// SMTP — send report
const smtp = createTransport({
  host: "mail.pyramedia.info",
  port: 465,
  secure: true,
  auth: { user: env.BAYRA_EMAIL_USER, pass: env.BAYRA_EMAIL_PASS },
});

const today = new Date().toLocaleDateString("ar-EG", { 
  weekday: "long", year: "numeric", month: "long", day: "numeric",
  timeZone: "Asia/Dubai"
});

let reportLines = [`📧 تقرير الإيميل اليومي — ${today}\n`];

try {
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const msgs = await client.search({ since, unseen: true });

    if (!msgs.length) {
      reportLines.push("📭 لا يوجد رسائل جديدة");
      console.log("NO_NEW_EMAILS");
    } else {
      reportLines.push(`📬 ${msgs.length} رسالة جديدة:\n`);
      console.log(`FOUND:${msgs.length}`);
      
      for (const uid of msgs) {
        const msg = await client.fetchOne(uid, { envelope: true }, { uid: true });
        const e = msg.envelope;
        const from = e.from?.map(f => `${f.name || ""} <${f.address}>`).join(", ") || "unknown";
        const subject = e.subject || "(بدون عنوان)";
        const date = e.date?.toLocaleString("ar-EG", { timeZone: "Asia/Dubai" }) || "";
        
        reportLines.push(`• من: ${from}`);
        reportLines.push(`  الموضوع: ${subject}`);
        reportLines.push(`  التاريخ: ${date}\n`);
        
        console.log(`FROM: ${from}`);
        console.log(`SUBJECT: ${subject}`);
        console.log(`DATE: ${e.date?.toISOString() || "unknown"}`);
        console.log("---");
      }
    }
  } finally {
    lock.release();
    await client.logout();
  }
} catch (err) {
  reportLines.push(`❌ خطأ: ${err.message}`);
  console.error(`ERROR: ${err.message}`);
}

// Send report email
try {
  const report = reportLines.join("\n");
  await smtp.sendMail({
    from: "Bayra <pyraai@pyramedia.info>",
    to: "eng.moabdo22@gmail.com",
    subject: `📧 تقرير بايرا — ${today}`,
    text: report,
  });
  console.log("EMAIL_REPORT_SENT");
} catch (err) {
  console.error(`SMTP_ERROR: ${err.message}`);
}
