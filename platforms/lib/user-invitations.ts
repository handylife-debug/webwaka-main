// Integration reference: blueprint:replitmail
import { sendEmail } from './replitmail';
import { generateInviteToken, AdminRole, logActivity } from './user-management';
import { rootDomain } from './utils';

export interface InvitationData {
  email: string;
  role: AdminRole;
  invitedBy: string;
  inviteToken: string;
}

export async function sendUserInvitation(
  email: string, 
  role: AdminRole, 
  invitedBy: string,
  inviterName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Generate invitation token
    const inviteToken = await generateInviteToken(email, role, invitedBy);
    
    // Create invitation URL
    const inviteUrl = `https://${rootDomain}/admin/invite/${inviteToken}`;
    
    // Send invitation email
    const emailResult = await sendEmail({
      to: email,
      subject: `Invitation to join ${rootDomain} as ${role}`,
      html: createInvitationEmailHTML(email, role, inviterName, inviteUrl),
      text: createInvitationEmailText(email, role, inviterName, inviteUrl),
    });

    // Log the invitation activity
    await logActivity({
      userId: invitedBy,
      userEmail: inviterName,
      action: 'user_invited',
      targetType: 'user',
      targetId: email,
      details: `Invited ${email} as ${role}`,
    });

    return { 
      success: emailResult.accepted.includes(email),
      error: emailResult.accepted.includes(email) ? undefined : 'Email delivery failed'
    };
  } catch (error) {
    console.error('Error sending user invitation:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to send invitation' 
    };
  }
}

function createInvitationEmailHTML(
  email: string, 
  role: AdminRole, 
  inviterName: string, 
  inviteUrl: string
): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
      <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #1f2937; margin: 0; font-size: 24px;">You're Invited!</h1>
          <p style="color: #6b7280; margin: 10px 0 0 0;">Join our administrative team</p>
        </div>
        
        <div style="margin-bottom: 30px;">
          <p style="color: #374151; line-height: 1.6; margin: 0 0 15px 0;">
            Hello,
          </p>
          <p style="color: #374151; line-height: 1.6; margin: 0 0 15px 0;">
            <strong>${inviterName}</strong> has invited you to join <strong>${rootDomain}</strong> as a <strong>${role}</strong>.
          </p>
          <p style="color: #374151; line-height: 1.6; margin: 0 0 25px 0;">
            Click the button below to accept your invitation and set up your account.
          </p>
        </div>

        <div style="text-align: center; margin-bottom: 30px;">
          <a href="${inviteUrl}" 
             style="display: inline-block; background-color: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 500;">
            Accept Invitation
          </a>
        </div>

        <div style="background-color: #f3f4f6; border-radius: 6px; padding: 20px; margin-bottom: 20px;">
          <h3 style="color: #1f2937; margin: 0 0 10px 0; font-size: 16px;">Your Role: ${role}</h3>
          <p style="color: #6b7280; margin: 0; font-size: 14px;">
            ${getRoleDescription(role)}
          </p>
        </div>

        <div style="border-top: 1px solid #e5e7eb; padding-top: 20px;">
          <p style="color: #9ca3af; font-size: 12px; line-height: 1.5; margin: 0;">
            This invitation will expire in 7 days. If you didn't expect this invitation, you can safely ignore this email.
          </p>
          <p style="color: #9ca3af; font-size: 12px; line-height: 1.5; margin: 10px 0 0 0;">
            If the button doesn't work, copy and paste this link: ${inviteUrl}
          </p>
        </div>
      </div>
    </div>
  `;
}

function createInvitationEmailText(
  email: string, 
  role: AdminRole, 
  inviterName: string, 
  inviteUrl: string
): string {
  return `
You're Invited to Join ${rootDomain}!

Hello,

${inviterName} has invited you to join ${rootDomain} as a ${role}.

Your Role: ${role}
${getRoleDescription(role)}

To accept your invitation and set up your account, visit:
${inviteUrl}

This invitation will expire in 7 days. If you didn't expect this invitation, you can safely ignore this email.

Best regards,
The ${rootDomain} Team
  `.trim();
}

function getRoleDescription(role: AdminRole): string {
  const descriptions: Record<AdminRole, string> = {
    'SuperAdmin': 'Full system access including user management, tenant administration, and system configuration.',
    'Admin': 'Platform administration with access to tenant management and system monitoring.',
    'FinanceAdmin': 'Access to financial data, billing management, and subscription administration.',
    'SupportStaff': 'Customer support tools, ticket management, and user assistance capabilities.',
    'ContentModerator': 'Content review, moderation tools, and user-generated content management.',
  };
  
  return descriptions[role] || 'Administrative access to the platform.';
}