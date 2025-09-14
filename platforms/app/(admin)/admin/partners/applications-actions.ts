'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth-server';
import { 
  getAllPartnerApplications, 
  getPendingPartnerApplications,
  getPartnerApplication,
  updatePartnerApplicationStatus,
  getPartnerApplicationStats,
  initializePartnerTables 
} from '@/lib/partner-management';
import { logActivity } from '@/lib/user-management';

/**
 * Get all partner applications with SuperAdmin authentication
 */
export async function getPartnerApplicationsAction() {
  try {
    const user = await getCurrentUser();
    
    if (!user || user.role !== 'SuperAdmin') {
      throw new Error('Unauthorized: SuperAdmin access required');
    }

    await initializePartnerTables();
    
    const applications = await getAllPartnerApplications();
    
    await logActivity({
      userId: user.id,
      action: 'VIEW_PARTNER_APPLICATIONS',
      details: `Viewed ${applications.length} partner applications`,
      ipAddress: 'system'
    });

    return { success: true, data: applications };
  } catch (error: any) {
    console.error('Error fetching partner applications:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to fetch partner applications' 
    };
  }
}

/**
 * Get pending partner applications with SuperAdmin authentication
 */
export async function getPendingPartnerApplicationsAction() {
  try {
    const user = await getCurrentUser();
    
    if (!user || user.role !== 'SuperAdmin') {
      throw new Error('Unauthorized: SuperAdmin access required');
    }

    await initializePartnerTables();
    
    const pendingApplications = await getPendingPartnerApplications();
    
    return { success: true, data: pendingApplications };
  } catch (error: any) {
    console.error('Error fetching pending partner applications:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to fetch pending applications' 
    };
  }
}

/**
 * Get a specific partner application with SuperAdmin authentication
 */
export async function getPartnerApplicationAction(applicationId: string) {
  try {
    const user = await getCurrentUser();
    
    if (!user || user.role !== 'SuperAdmin') {
      throw new Error('Unauthorized: SuperAdmin access required');
    }

    if (!applicationId || typeof applicationId !== 'string') {
      throw new Error('Valid application ID is required');
    }

    const application = await getPartnerApplication(applicationId);
    
    if (!application) {
      throw new Error('Partner application not found');
    }

    return { success: true, data: application };
  } catch (error: any) {
    console.error('Error fetching partner application:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to fetch partner application' 
    };
  }
}

/**
 * Approve a partner application with SuperAdmin authentication
 */
export async function approvePartnerApplicationAction(
  applicationId: string, 
  approvalNotes?: string
) {
  try {
    const user = await getCurrentUser();
    
    if (!user || user.role !== 'SuperAdmin') {
      throw new Error('Unauthorized: SuperAdmin access required');
    }

    if (!applicationId || typeof applicationId !== 'string') {
      throw new Error('Valid application ID is required');
    }

    // Get the application details first
    const application = await getPartnerApplication(applicationId);
    if (!application) {
      throw new Error('Partner application not found');
    }

    if (application.application_status !== 'pending') {
      throw new Error('Only pending applications can be approved');
    }

    // Update application status to approved
    const success = await updatePartnerApplicationStatus(
      applicationId, 
      'approved', 
      user.id,
      approvalNotes
    );

    if (!success) {
      throw new Error('Failed to approve partner application');
    }

    // Log the approval activity
    await logActivity({
      userId: user.id,
      action: 'APPROVE_PARTNER_APPLICATION',
      details: `Approved partner application for ${application.first_name} ${application.last_name} (${application.email})`,
      ipAddress: 'system'
    });

    // Revalidate the partners page to reflect changes
    revalidatePath('/admin/partners');

    return { 
      success: true, 
      message: `Partner application for ${application.first_name} ${application.last_name} has been approved`
    };
  } catch (error: any) {
    console.error('Error approving partner application:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to approve partner application' 
    };
  }
}

/**
 * Reject a partner application with SuperAdmin authentication
 */
export async function rejectPartnerApplicationAction(
  applicationId: string, 
  rejectionReason?: string
) {
  try {
    const user = await getCurrentUser();
    
    if (!user || user.role !== 'SuperAdmin') {
      throw new Error('Unauthorized: SuperAdmin access required');
    }

    if (!applicationId || typeof applicationId !== 'string') {
      throw new Error('Valid application ID is required');
    }

    if (!rejectionReason || rejectionReason.trim().length === 0) {
      throw new Error('Rejection reason is required');
    }

    // Get the application details first
    const application = await getPartnerApplication(applicationId);
    if (!application) {
      throw new Error('Partner application not found');
    }

    if (application.application_status !== 'pending') {
      throw new Error('Only pending applications can be rejected');
    }

    // Update application status to rejected
    const success = await updatePartnerApplicationStatus(
      applicationId, 
      'rejected', 
      user.id,
      rejectionReason
    );

    if (!success) {
      throw new Error('Failed to reject partner application');
    }

    // Log the rejection activity
    await logActivity({
      userId: user.id,
      action: 'REJECT_PARTNER_APPLICATION',
      details: `Rejected partner application for ${application.first_name} ${application.last_name} (${application.email}). Reason: ${rejectionReason}`,
      ipAddress: 'system'
    });

    // Revalidate the partners page to reflect changes
    revalidatePath('/admin/partners');

    return { 
      success: true, 
      message: `Partner application for ${application.first_name} ${application.last_name} has been rejected`
    };
  } catch (error: any) {
    console.error('Error rejecting partner application:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to reject partner application' 
    };
  }
}

/**
 * Get partner application statistics with SuperAdmin authentication
 */
export async function getPartnerApplicationStatsAction() {
  try {
    const user = await getCurrentUser();
    
    if (!user || user.role !== 'SuperAdmin') {
      throw new Error('Unauthorized: SuperAdmin access required');
    }

    await initializePartnerTables();
    
    const stats = await getPartnerApplicationStats();
    
    return { success: true, data: stats };
  } catch (error: any) {
    console.error('Error fetching partner application stats:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to fetch application statistics' 
    };
  }
}

/**
 * Bulk action to approve multiple applications
 */
export async function bulkApproveApplicationsAction(
  applicationIds: string[], 
  approvalNotes?: string
) {
  try {
    const user = await getCurrentUser();
    
    if (!user || user.role !== 'SuperAdmin') {
      throw new Error('Unauthorized: SuperAdmin access required');
    }

    if (!Array.isArray(applicationIds) || applicationIds.length === 0) {
      throw new Error('At least one application ID is required');
    }

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const applicationId of applicationIds) {
      try {
        const result = await approvePartnerApplicationAction(applicationId, approvalNotes);
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
        }
        results.push({ applicationId, result });
      } catch (error) {
        errorCount++;
        results.push({ 
          applicationId, 
          result: { success: false, error: 'Failed to process application' } 
        });
      }
    }

    // Log bulk operation
    await logActivity({
      userId: user.id,
      action: 'BULK_APPROVE_APPLICATIONS',
      details: `Bulk approved ${successCount} applications, ${errorCount} errors`,
      ipAddress: 'system'
    });

    revalidatePath('/admin/partners');

    return { 
      success: true, 
      message: `Bulk approval completed: ${successCount} approved, ${errorCount} failed`,
      details: { successCount, errorCount, results }
    };
  } catch (error: any) {
    console.error('Error in bulk approve applications:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to bulk approve applications' 
    };
  }
}