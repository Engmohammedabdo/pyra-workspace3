import nodemailer from 'nodemailer';

// ============================================================
// Email Service for Pyra Workspace
// Uses SMTP configured via environment variables
// ============================================================

/** Escape HTML special chars to prevent injection in email templates */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER
    ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS || '',
      }
    : undefined,
  // Allow self-signed certs in dev
  tls: {
    rejectUnauthorized: process.env.NODE_ENV === 'production',
  },
});

const FROM_NAME = process.env.SMTP_FROM_NAME || 'Pyra Workspace';
const FROM_EMAIL = process.env.SMTP_FROM_EMAIL || 'noreply@pyramedia.cloud';

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailOptions): Promise<boolean> {
  // Skip if SMTP not configured
  if (!process.env.SMTP_HOST) {
    console.warn('[Email] SMTP_HOST not configured, skipping email');
    return false;
  }

  try {
    await transporter.sendMail({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      html,
      text: text || subject,
    });
    return true;
  } catch (error) {
    console.error('[Email] Failed to send:', error);
    return false;
  }
}

// ============================================================
// Email Templates (Arabic RTL)
// ============================================================

const baseLayout = (content: string) => `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; background-color: #f4f4f5; direction: rtl; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; margin-top: 24px; margin-bottom: 24px; }
    .header { background: linear-gradient(135deg, #f97316, #ea580c); padding: 24px 32px; text-align: center; }
    .header h1 { color: #fff; font-size: 22px; margin: 0; font-weight: 700; }
    .body { padding: 32px; color: #18181b; font-size: 15px; line-height: 1.7; }
    .body h2 { font-size: 18px; color: #18181b; margin-top: 0; }
    .btn { display: inline-block; background: #f97316; color: #fff !important; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; margin-top: 16px; }
    .footer { padding: 20px 32px; background: #fafafa; text-align: center; color: #71717a; font-size: 12px; border-top: 1px solid #e4e4e7; }
    .detail { background: #f4f4f5; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
    .detail-label { color: #71717a; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>Pyra Workspace</h1></div>
    <div class="body">${content}</div>
    <div class="footer">
      <p>هذه رسالة آلية من نظام Pyra Workspace</p>
      <p>${process.env.NEXT_PUBLIC_APP_URL || 'https://workspace.pyramedia.cloud'}</p>
    </div>
  </div>
</body>
</html>
`;

export const emailTemplates = {
  /** New file uploaded to project */
  fileUploaded: (data: { projectName: string; fileName: string; uploadedBy: string; projectUrl: string }) =>
    baseLayout(`
      <h2>📁 ملف جديد في مشروع "${escapeHtml(data.projectName)}"</h2>
      <div class="detail">
        <div class="detail-row"><span class="detail-label">اسم الملف:</span> <strong>${escapeHtml(data.fileName)}</strong></div>
        <div class="detail-row"><span class="detail-label">رفع بواسطة:</span> <strong>${escapeHtml(data.uploadedBy)}</strong></div>
      </div>
      <a href="${escapeHtml(data.projectUrl)}" class="btn">عرض المشروع</a>
    `),

  /** File approval status changed */
  approvalUpdate: (data: { projectName: string; fileName: string; status: string; comment?: string; reviewedBy: string; projectUrl: string }) => {
    const statusLabels: Record<string, string> = {
      approved: '✅ تمت الموافقة',
      revision_requested: '🔄 مطلوب تعديل',
      pending: '⏳ بانتظار المراجعة',
    };
    return baseLayout(`
      <h2>حالة الموافقة — ${escapeHtml(data.projectName)}</h2>
      <div class="detail">
        <div class="detail-row"><span class="detail-label">الملف:</span> <strong>${escapeHtml(data.fileName)}</strong></div>
        <div class="detail-row"><span class="detail-label">الحالة:</span> <strong>${statusLabels[data.status] || escapeHtml(data.status)}</strong></div>
        <div class="detail-row"><span class="detail-label">بواسطة:</span> <strong>${escapeHtml(data.reviewedBy)}</strong></div>
        ${data.comment ? `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e4e4e7;"><p style="font-size: 13px; color: #52525b;">"${escapeHtml(data.comment)}"</p></div>` : ''}
      </div>
      <a href="${escapeHtml(data.projectUrl)}" class="btn">عرض المشروع</a>
    `);
  },

  /** New comment on project */
  newComment: (data: { projectName: string; authorName: string; commentText: string; projectUrl: string }) =>
    baseLayout(`
      <h2>💬 تعليق جديد في "${escapeHtml(data.projectName)}"</h2>
      <div class="detail">
        <div class="detail-row"><span class="detail-label">بواسطة:</span> <strong>${escapeHtml(data.authorName)}</strong></div>
        <div style="margin-top: 8px; padding: 12px; background: #fff; border-radius: 6px; border: 1px solid #e4e4e7;">
          <p style="margin: 0; font-size: 14px; color: #27272a;">${escapeHtml(data.commentText)}</p>
        </div>
      </div>
      <a href="${escapeHtml(data.projectUrl)}" class="btn">عرض التعليقات</a>
    `),

  /** New user created (welcome) */
  welcomeUser: (data: { displayName: string; username: string; loginUrl: string }) =>
    baseLayout(`
      <h2>مرحباً ${escapeHtml(data.displayName)} 👋</h2>
      <p>تم إنشاء حسابك في نظام Pyra Workspace بنجاح.</p>
      <div class="detail">
        <div class="detail-row"><span class="detail-label">اسم المستخدم:</span> <strong>${escapeHtml(data.username)}</strong></div>
      </div>
      <p>يرجى تسجيل الدخول وتغيير كلمة المرور.</p>
      <a href="${escapeHtml(data.loginUrl)}" class="btn">تسجيل الدخول</a>
    `),

  /** Share link file downloaded */
  shareDownloaded: (data: { fileName: string; sharedBy: string; downloadedAt: string }) => {
    const date = new Date(data.downloadedAt);
    const formattedDate = date.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return baseLayout(`
      <h2>تم تحميل ملفك المشارك</h2>
      <div class="detail">
        <div class="detail-row"><span class="detail-label">اسم الملف:</span> <strong>${escapeHtml(data.fileName)}</strong></div>
        <div class="detail-row"><span class="detail-label">تمت المشاركة بواسطة:</span> <strong>${escapeHtml(data.sharedBy)}</strong></div>
        <div class="detail-row"><span class="detail-label">وقت التحميل:</span> <strong>${formattedDate}</strong></div>
      </div>
      <p style="font-size: 13px; color: #71717a;">هذا إشعار تلقائي — تم تحميل الملف من رابط المشاركة الخاص بك.</p>
    `);
  },

  /** Project status changed */
  projectStatusChanged: (data: { projectName: string; oldStatus: string; newStatus: string; changedBy: string; projectUrl: string }) => {
    const statusLabels: Record<string, string> = {
      active: 'نشط', in_progress: 'قيد التنفيذ', review: 'مراجعة', completed: 'مكتمل', archived: 'مؤرشف',
    };
    return baseLayout(`
      <h2>تحديث حالة مشروع "${escapeHtml(data.projectName)}"</h2>
      <div class="detail">
        <div class="detail-row"><span class="detail-label">الحالة السابقة:</span> <strong>${statusLabels[data.oldStatus] || escapeHtml(data.oldStatus)}</strong></div>
        <div class="detail-row"><span class="detail-label">الحالة الجديدة:</span> <strong>${statusLabels[data.newStatus] || escapeHtml(data.newStatus)}</strong></div>
        <div class="detail-row"><span class="detail-label">بواسطة:</span> <strong>${escapeHtml(data.changedBy)}</strong></div>
      </div>
      <a href="${escapeHtml(data.projectUrl)}" class="btn">عرض المشروع</a>
    `);
  },
};
