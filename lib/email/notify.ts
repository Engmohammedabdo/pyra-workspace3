import { sendEmail, emailTemplates } from './mailer';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// ============================================================
// Notification Dispatcher
// Handles sending email notifications based on events
// ============================================================

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://workspace.pyramedia.cloud';

/**
 * Notify admin users about a project event.
 * Fetches admin emails from pyra_users and sends email to all admins.
 */
async function getAdminEmails(): Promise<string[]> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from('pyra_users')
      .select('email')
      .eq('role', 'admin')
      .not('email', 'is', null);
    return (data || []).map((u) => u.email).filter(Boolean) as string[];
  } catch {
    return [];
  }
}

/**
 * Get client email for a project
 */
async function getClientEmail(clientCompany: string): Promise<string | null> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from('pyra_clients')
      .select('email')
      .eq('company', clientCompany)
      .limit(1)
      .single();
    return data?.email || null;
  } catch {
    return null;
  }
}

// ── Public notification functions (fire-and-forget) ──

export function notifyFileUploaded(data: {
  projectName: string;
  fileName: string;
  uploadedBy: string;
  clientCompany: string;
}) {
  // Don't await — fire and forget
  (async () => {
    try {
      const projectUrl = `${APP_URL}/portal/projects`;

      // Notify client
      const clientEmail = await getClientEmail(data.clientCompany);
      if (clientEmail) {
        await sendEmail({
          to: clientEmail,
          subject: `ملف جديد في مشروع "${data.projectName}"`,
          html: emailTemplates.fileUploaded({
            ...data,
            projectUrl,
          }),
        });
      }
    } catch (err) {
      console.error('[Notify] fileUploaded error:', err);
    }
  })();
}

export function notifyApprovalUpdate(data: {
  projectName: string;
  fileName: string;
  status: string;
  comment?: string;
  reviewedBy: string;
}) {
  (async () => {
    try {
      const projectUrl = `${APP_URL}/dashboard/projects`;
      const adminEmails = await getAdminEmails();
      if (adminEmails.length > 0) {
        await sendEmail({
          to: adminEmails,
          subject: `تحديث موافقة — ${data.projectName}`,
          html: emailTemplates.approvalUpdate({
            ...data,
            projectUrl,
          }),
        });
      }
    } catch (err) {
      console.error('[Notify] approvalUpdate error:', err);
    }
  })();
}

export function notifyNewComment(data: {
  projectName: string;
  authorName: string;
  commentText: string;
  authorType: 'client' | 'team';
}) {
  (async () => {
    try {
      const projectUrl = `${APP_URL}/dashboard/projects`;
      // If client commented, notify admins. If team commented, skip (client gets in-app notification).
      if (data.authorType === 'client') {
        const adminEmails = await getAdminEmails();
        if (adminEmails.length > 0) {
          await sendEmail({
            to: adminEmails,
            subject: `تعليق جديد من عميل — ${data.projectName}`,
            html: emailTemplates.newComment({
              ...data,
              projectUrl,
            }),
          });
        }
      }
    } catch (err) {
      console.error('[Notify] newComment error:', err);
    }
  })();
}

export function notifyProjectStatusChanged(data: {
  projectName: string;
  oldStatus: string;
  newStatus: string;
  changedBy: string;
  clientCompany: string;
}) {
  (async () => {
    try {
      const projectUrl = `${APP_URL}/portal/projects`;
      const clientEmail = await getClientEmail(data.clientCompany);
      if (clientEmail) {
        await sendEmail({
          to: clientEmail,
          subject: `تحديث حالة مشروع "${data.projectName}"`,
          html: emailTemplates.projectStatusChanged({
            ...data,
            projectUrl,
          }),
        });
      }
    } catch (err) {
      console.error('[Notify] projectStatusChanged error:', err);
    }
  })();
}

export function notifyWelcomeUser(data: {
  displayName: string;
  username: string;
  email: string;
}) {
  (async () => {
    try {
      await sendEmail({
        to: data.email,
        subject: 'مرحباً في Pyra Workspace',
        html: emailTemplates.welcomeUser({
          ...data,
          loginUrl: `${APP_URL}/login`,
        }),
      });
    } catch (err) {
      console.error('[Notify] welcomeUser error:', err);
    }
  })();
}
