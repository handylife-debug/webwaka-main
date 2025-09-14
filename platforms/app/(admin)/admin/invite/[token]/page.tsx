import { validateInviteToken, updateAdminUser, logActivity, getAllAdminUsers } from '@/lib/user-management';
import { notFound, redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserCheck, AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Accept Invitation',
  description: 'Complete your administrator account setup'
};

interface InvitePageProps {
  params: {
    token: string;
  };
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = params;
  
  // Validate the invitation token
  const inviteData = await validateInviteToken(token);
  
  if (!inviteData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <CardTitle className="text-red-600">Invalid Invitation</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-gray-600 mb-4">
              This invitation link is invalid or has expired.
            </p>
            <p className="text-sm text-gray-500">
              Please contact your administrator for a new invitation.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <UserCheck className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <CardTitle>Welcome to the Team!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center">
            <p className="text-gray-600 mb-2">
              You've been invited to join as:
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="font-medium text-blue-800">{inviteData.role}</p>
              <p className="text-sm text-blue-600">{inviteData.email}</p>
            </div>
          </div>
          
          <div className="text-center">
            <p className="text-sm text-gray-500 mb-4">
              Invited by: {inviteData.invitedBy}
            </p>
          </div>

          <form action={acceptInvitation.bind(null, token)}>
            <Button type="submit" className="w-full">
              Accept Invitation
            </Button>
          </form>
          
          <p className="text-xs text-gray-500 text-center">
            By accepting, you agree to the platform's terms of service.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

async function acceptInvitation(token: string) {
  'use server';
  
  try {
    // Validate token again to ensure it's still valid
    const inviteData = await validateInviteToken(token);
    if (!inviteData) {
      throw new Error('Invalid invitation token');
    }

    // Find all users to locate the pending user by email and token
    const allUsers = await getAllAdminUsers();
    const pendingUser = allUsers.find(user => 
      user.email === inviteData.email && 
      user.status === 'Pending' && 
      user.inviteToken === token
    );

    if (!pendingUser) {
      throw new Error('No matching pending user found for this invitation');
    }

    // Activate the user and clear invitation data
    const success = await updateAdminUser(pendingUser.id, {
      status: 'Active',
      inviteToken: undefined,
      inviteExpiresAt: undefined,
      lastActive: Date.now(),
    });

    if (!success) {
      throw new Error('Failed to activate user account');
    }

    // Invalidate the token by deleting it from Redis
    const { redis } = await import('@/lib/redis');
    await redis.del(`invite:${token}`);
    
    // Log the acceptance activity with correct user info
    await logActivity({
      userId: pendingUser.id,
      userEmail: pendingUser.email,
      action: 'user_invitation_accepted',
      targetType: 'user',
      targetId: pendingUser.email,
      details: `User ${pendingUser.email} accepted invitation for role ${pendingUser.role}`,
    });

    // Redirect to admin dashboard
    redirect('/admin');
  } catch (error) {
    console.error('Error accepting invitation:', error);
    throw error;
  }
}