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

// ── Sales CRM notifications ──

/**
 * Notify sales agent that their quote was approved.
 */
export function notifyQuoteApproved(data: {
  requestedBy: string;
  quoteNumber: string;
  approvedBy: string;
  quoteId: string;
  comments?: string;
}) {
  (async () => {
    try {
      const supabase = await createServerSupabaseClient();
      const { data: user } = await supabase
        .from('pyra_users')
        .select('email, display_name')
        .eq('username', data.requestedBy)
        .single();
      if (user?.email) {
        await sendEmail({
          to: user.email,
          subject: `✅ تمت الموافقة على عرض السعر ${data.quoteNumber}`,
          html: emailTemplates.quoteApproved({
            agentName: user.display_name || data.requestedBy,
            quoteNumber: data.quoteNumber,
            approvedBy: data.approvedBy,
            comments: data.comments,
            quoteUrl: `${APP_URL}/dashboard/quotes/${data.quoteId}`,
          }),
        });
      }
    } catch (err) {
      console.error('[Notify] quoteApproved error:', err);
    }
  })();
}

/**
 * Notify sales agent that their quote was rejected.
 */
export function notifyQuoteRejected(data: {
  requestedBy: string;
  quoteNumber: string;
  rejectedBy: string;
  quoteId: string;
  comments?: string;
}) {
  (async () => {
    try {
      const supabase = await createServerSupabaseClient();
      const { data: user } = await supabase
        .from('pyra_users')
        .select('email, display_name')
        .eq('username', data.requestedBy)
        .single();
      if (user?.email) {
        await sendEmail({
          to: user.email,
          subject: `❌ تم رفض عرض السعر ${data.quoteNumber}`,
          html: emailTemplates.quoteRejected({
            agentName: user.display_name || data.requestedBy,
            quoteNumber: data.quoteNumber,
            rejectedBy: data.rejectedBy,
            comments: data.comments,
            quoteUrl: `${APP_URL}/dashboard/quotes/${data.quoteId}`,
          }),
        });
      }
    } catch (err) {
      console.error('[Notify] quoteRejected error:', err);
    }
  })();
}

/**
 * Notify agent when a lead is assigned/transferred to them.
 */
export function notifyLeadAssigned(data: {
  agentUsername: string;
  leadName: string;
  assignedBy: string;
  leadId: string;
}) {
  (async () => {
    try {
      const supabase = await createServerSupabaseClient();
      const { data: user } = await supabase
        .from('pyra_users')
        .select('email, display_name')
        .eq('username', data.agentUsername)
        .single();
      if (user?.email) {
        await sendEmail({
          to: user.email,
          subject: `👤 تم تعيين عميل محتمل جديد: ${data.leadName}`,
          html: emailTemplates.leadAssigned({
            agentName: user.display_name || data.agentUsername,
            leadName: data.leadName,
            assignedBy: data.assignedBy,
            leadUrl: `${APP_URL}/dashboard/sales/leads/${data.leadId}`,
          }),
        });
      }
    } catch (err) {
      console.error('[Notify] leadAssigned error:', err);
    }
  })();
}
