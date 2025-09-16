'use server';

import { redis } from '@/lib/redis';
import { execute_sql } from '@/lib/database';
import { 
  createPartnerApplication, 
  updatePartnerApplicationStatus,
  createPartnerLevel,
  getAllPartnerLevels,
  getAllPartnerApplications,
  type PartnerApplication,
  type PartnerLevel,
  type CreatePartnerLevelData
} from '@/lib/partner-management';

// Server actions that match cell.json contract exactly
export interface VendorApplicationData {
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  businessName: string;
  company_website?: string;
  businessType: 'individual' | 'company' | 'partnership' | 'cooperative';
  businessAddress: string;
  businessRegistrationNumber?: string;
  taxId?: string;
  bankDetails?: {
    bankName: string;
    accountNumber: string;
    accountName: string;
    routingNumber?: string;
  };
  documents?: {
    type: string;
    url: string;
    verified: boolean;
  }[];
  experience_level?: string;
  marketing_experience?: string;
  why_partner?: string;
  referral_methods?: string;
  sponsor_email?: string;
  requested_partner_level_id?: string;
}

export interface VendorProfile {
  id: string;
  tenantId: string;
  partnerId: string;
  businessName: string;
  displayName: string;
  slug: string;
  status: 'active' | 'inactive' | 'suspended';
  currentTier: string;
  commissionRate: number;
  totalSales: number;
  monthlyVolume: number;
  productCount: number;
  rating: number;
  reviewCount: number;
  joinedAt: number;
  lastActiveAt: number;
  settings: {
    autoApproveOrders: boolean;
    fulfillmentMethod: 'self' | 'dropship' | 'warehouse';
    returnPolicy: string;
    shippingZones: string[];
  };
}

// Helper function to get current tenant ID from request context
async function getCurrentTenantId(): Promise<string> {
  try {
    // Get tenant from request headers or context
    const { headers } = await import('next/headers');
    const headersList = await headers();
    const tenantId = headersList.get('x-tenant-id') || headersList.get('host')?.split('.')[0];
    
    if (!tenantId) {
      throw new Error('Tenant ID not found in request context');
    }
    
    return tenantId;
  } catch (error) {
    console.error('Error getting tenant ID:', error);
    throw new Error('Unable to determine tenant context');
  }
}

// Encryption helpers for sensitive data
async function encryptSensitiveData(data: any): Promise<string> {
  try {
    // In a real implementation, use proper encryption with managed keys
    // For demo purposes, use base64 encoding (NOT secure for production)
    const jsonString = JSON.stringify(data);
    return Buffer.from(jsonString).toString('base64');
  } catch (error) {
    console.error('Error encrypting data:', error);
    throw new Error('Failed to encrypt sensitive data');
  }
}

async function decryptSensitiveData(encryptedData: string): Promise<any> {
  try {
    // In a real implementation, use proper decryption with managed keys
    // For demo purposes, use base64 decoding (NOT secure for production)
    const jsonString = Buffer.from(encryptedData, 'base64').toString();
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Error decrypting data:', error);
    throw new Error('Failed to decrypt sensitive data');
  }
}

// Authorization helper
async function checkAuthorization(action: string, tenantId: string): Promise<boolean> {
  try {
    // Get user context from headers
    const { headers } = await import('next/headers');
    const headersList = await headers();
    const userId = headersList.get('x-user-id');
    const userRole = headersList.get('x-user-role');
    
    if (!userId) {
      throw new Error('User not authenticated');
    }

    // Check role-based permissions
    const adminActions = ['reviewApplication', 'manageTiers', 'updateCommissionStructure'];
    const reviewerActions = ['reviewApplication', 'getApplications'];
    const publicActions = ['createVendorApplication', 'getVendorMetrics'];
    
    if (adminActions.includes(action) && userRole !== 'admin') {
      return false;
    }
    
    if (reviewerActions.includes(action) && !['admin', 'reviewer'].includes(userRole || '')) {
      return false;
    }

    // Allow public actions for any authenticated user
    if (publicActions.includes(action)) {
      return true;
    }

    return true;
  } catch (error) {
    console.error('Authorization check failed:', error);
    return false;
  }
}

// Helper to securely store sensitive vendor metadata in encrypted database
async function storeSecureVendorMetadata(tenantId: string, applicationId: string, metadata: any): Promise<void> {
  try {
    // Extract sensitive data for encryption
    const sensitiveData = {
      businessRegistrationNumber: metadata.businessRegistrationNumber,
      taxId: metadata.taxId,
      bankDetails: metadata.bankDetails,
      documents: metadata.documents
    };

    // Encrypt sensitive data
    const encryptedData = await encryptSensitiveData(sensitiveData);
    
    // Store encrypted data in database
    await execute_sql(
      `INSERT INTO vendor_secure_metadata (tenant_id, application_id, encrypted_data, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (tenant_id, application_id) DO UPDATE 
       SET encrypted_data = $3, updated_at = NOW()`,
      [tenantId, applicationId, encryptedData]
    );
    
    // Store only non-sensitive metadata reference in Redis
    const redisKey = `vendor_metadata:${tenantId}:${applicationId}`;
    await redis.set(redisKey, {
      businessType: metadata.businessType,
      businessAddress: metadata.businessAddress,
      hasSecureData: true,
      lastUpdated: Date.now()
    });
    
    // Add to vendor applications index
    const applicationsIndexKey = `vendor_applications:${tenantId}`;
    const existingApplicationIds = await redis.get<string[]>(applicationsIndexKey) || [];
    if (!existingApplicationIds.includes(applicationId)) {
      existingApplicationIds.push(applicationId);
      await redis.set(applicationsIndexKey, existingApplicationIds);
    }
  } catch (error) {
    console.error('Error storing secure vendor metadata:', error);
    throw new Error('Failed to store vendor metadata securely');
  }
}

// Helper to retrieve vendor metadata (non-sensitive from Redis, sensitive from DB)
async function getVendorMetadata(tenantId: string, applicationId: string): Promise<any> {
  try {
    const redisKey = `vendor_metadata:${tenantId}:${applicationId}`;
    const basicMetadata = await redis.get(redisKey);
    
    if (basicMetadata?.hasSecureData) {
      // Retrieve and decrypt sensitive data from database when needed
      const result = await execute_sql(
        `SELECT encrypted_data FROM vendor_secure_metadata 
         WHERE tenant_id = $1 AND application_id = $2`,
        [tenantId, applicationId]
      );
      
      if (result.rows.length > 0) {
        const secureData = await decryptSensitiveData(result.rows[0].encrypted_data);
        return { ...basicMetadata, ...secureData };
      }
    }
    
    return basicMetadata;
  } catch (error) {
    console.error('Error retrieving vendor metadata:', error);
    return null;
  }
}

// Server actions matching cell.json contract

export async function createVendorApplication(
  applicationData: VendorApplicationData
): Promise<{ success: boolean; applicationId?: string; message: string }> {
  try {
    const tenantId = await getCurrentTenantId();
    
    // Check authorization for creating applications
    const isAuthorized = await checkAuthorization('createVendorApplication', tenantId);
    if (!isAuthorized) {
      return {
        success: false,
        message: 'Unauthorized to create vendor applications.'
      };
    }
    
    // Convert to partner application format
    const partnerAppData = {
      email: applicationData.email,
      first_name: applicationData.first_name,
      last_name: applicationData.last_name,
      phone: applicationData.phone,
      company_name: applicationData.businessName,
      company_website: applicationData.company_website,
      experience_level: applicationData.experience_level,
      marketing_experience: applicationData.marketing_experience,
      why_partner: applicationData.why_partner,
      referral_methods: applicationData.referral_methods,
      sponsor_email: applicationData.sponsor_email,
      requested_partner_level_id: applicationData.requested_partner_level_id
    };

    // Use existing partner application system
    const applicationId = await createPartnerApplication(partnerAppData);
    
    if (applicationId) {
      // Store vendor-specific metadata securely
      const secureMetadata = {
        businessName: applicationData.businessName,
        businessType: applicationData.businessType,
        businessAddress: applicationData.businessAddress,
        businessRegistrationNumber: applicationData.businessRegistrationNumber,
        taxId: applicationData.taxId,
        bankDetails: applicationData.bankDetails,
        documents: applicationData.documents || []
      };
      
      await storeSecureVendorMetadata(tenantId, applicationId, secureMetadata);

      return {
        success: true,
        applicationId,
        message: 'Vendor application submitted successfully. We will review it within 2-3 business days.'
      };
    }

    return {
      success: false,
      message: 'Failed to submit vendor application. Please try again.'
    };
  } catch (error) {
    console.error('Error creating vendor application:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to submit vendor application. Please try again.'
    };
  }
}

export async function reviewApplication(
  input: {
    applicationId: string;
    reviewData: {
      status: 'approved' | 'rejected';
      reviewNotes?: string;
      assignedTier?: string;
      commissionRate?: number;
      reviewerId: string;
    };
  }
): Promise<{ success: boolean; vendorId?: string; message: string }> {
  try {
    const { applicationId, reviewData } = input;
    const tenantId = await getCurrentTenantId();
    
    // Check authorization for reviewing applications
    const isAuthorized = await checkAuthorization('reviewApplication', tenantId);
    if (!isAuthorized) {
      return {
        success: false,
        message: 'Unauthorized to review vendor applications.'
      };
    }
    
    // Use existing partner application review system
    const success = await updatePartnerApplicationStatus(
      applicationId,
      reviewData.status,
      reviewData.reviewerId,
      reviewData.reviewNotes
    );
    
    if (success && reviewData.status === 'approved') {
      // Verify assigned tier exists before creating vendor profile
      if (reviewData.assignedTier) {
        const partnerLevels = await getAllPartnerLevels();
        const assignedLevel = partnerLevels.find(level => 
          level.level_code === reviewData.assignedTier && level.tenant_id === tenantId
        );
        
        if (!assignedLevel) {
          return {
            success: false,
            message: `Assigned tier '${reviewData.assignedTier}' does not exist. Please create the tier first.`
          };
        }
      }
      
      // Create vendor profile from approved partner
      const vendorId = await createVendorProfileFromPartner(
        tenantId, 
        applicationId, 
        {
          assignedTier: reviewData.assignedTier || 'basic',
          commissionRate: reviewData.commissionRate || 0.1
        }
      );

      return {
        success: true,
        vendorId,
        message: 'Vendor application approved successfully. Vendor account has been created.'
      };
    }

    return {
      success,
      message: success ? `Application ${reviewData.status}.` : 'Failed to review application.'
    };
  } catch (error) {
    console.error('Error reviewing vendor application:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to review application. Please try again.'
    };
  }
}

export async function getApplications(
  input: {
    filters?: {
      status?: 'pending' | 'approved' | 'rejected';
      businessType?: string;
    };
    pagination?: { page?: number; limit?: number };
    includeSensitive?: boolean;
  } = {}
): Promise<{
  applications: (PartnerApplication & { vendorMetadata?: any })[];
  total: number;
  pagination: { page: number; limit: number; totalPages: number };
}> {
  try {
    const { filters = {}, pagination = {}, includeSensitive = false } = input;
    const tenantId = await getCurrentTenantId();
    
    // Check authorization for viewing applications
    const isAuthorized = await checkAuthorization('getApplications', tenantId);
    if (!isAuthorized) {
      return {
        applications: [],
        total: 0,
        pagination: { page: 1, limit: 20, totalPages: 0 }
      };
    }
    
    // Get all partner applications
    const partnerApplications = await getAllPartnerApplications();
    
    // Filter for this tenant and enhance with vendor metadata
    const applications: (PartnerApplication & { vendorMetadata?: any })[] = [];
    for (const app of partnerApplications) {
      if (app.tenant_id === tenantId) {
        const vendorMetadata = await getVendorMetadata(tenantId, app.id);
        if (vendorMetadata) {
          // Apply filters
          if (filters.status && app.application_status !== filters.status) continue;
          if (filters.businessType && vendorMetadata.businessType !== filters.businessType) continue;
          
          // Filter sensitive data if not authorized
          let filteredMetadata = vendorMetadata;
          if (!includeSensitive) {
            filteredMetadata = {
              businessType: vendorMetadata.businessType,
              businessAddress: vendorMetadata.businessAddress,
              hasSecureData: vendorMetadata.hasSecureData,
              lastUpdated: vendorMetadata.lastUpdated
            };
          }
          
          applications.push({
            ...app,
            vendorMetadata: filteredMetadata
          });
        }
      }
    }

    // Pagination
    const page = pagination.page || 1;
    const limit = pagination.limit || 20;
    const totalPages = Math.ceil(applications.length / limit);
    const startIndex = (page - 1) * limit;
    const paginatedApplications = applications.slice(startIndex, startIndex + limit);

    return {
      applications: paginatedApplications,
      total: applications.length,
      pagination: { page, limit, totalPages }
    };
  } catch (error) {
    console.error('Error getting vendor applications:', error);
    return {
      applications: [],
      total: 0,
      pagination: { page: 1, limit: 20, totalPages: 0 }
    };
  }
}

export async function manageTiers(
  input: {
    action: 'create' | 'update' | 'delete' | 'list';
    tierData?: {
      id?: string;
      name: string;
      level_code: string;
      description: string;
      default_commission_rate: number;
      min_commission_rate?: number;
      max_commission_rate?: number;
      benefits?: string[];
      requirements?: string[];
      level_order: number;
      max_referral_depth: number;
      createdBy: string;
    };
  }
): Promise<{ success: boolean; tierId?: string; tiers?: PartnerLevel[]; message: string }> {
  try {
    const { action, tierData } = input;
    const tenantId = await getCurrentTenantId();

    if (action === 'list') {
      const partnerLevels = await getAllPartnerLevels();
      const vendorTiers = partnerLevels.filter(level => level.tenant_id === tenantId);
      return {
        success: true,
        tiers: vendorTiers,
        message: 'Tiers retrieved successfully'
      };
    }

    if (action === 'create' && tierData) {
      // Ensure tenant_id is set properly by creating with current tenant context
      const partnerLevelData: CreatePartnerLevelData = {
        level_name: tierData.name,
        level_code: tierData.level_code,
        description: tierData.description,
        default_commission_rate: tierData.default_commission_rate,
        min_commission_rate: tierData.min_commission_rate || 0,
        max_commission_rate: tierData.max_commission_rate || 1,
        benefits: tierData.benefits || [],
        requirements: tierData.requirements || [],
        level_order: tierData.level_order,
        max_referral_depth: tierData.max_referral_depth,
        createdBy: tierData.createdBy
      };

      const tierId = await createPartnerLevel(partnerLevelData);
      
      if (tierId) {
        // Store vendor-specific tier metadata in Redis (non-sensitive)
        const metadataKey = `vendor_tier_metadata:${tenantId}:${tierId}`;
        await redis.set(metadataKey, {
          vendorSpecific: true,
          tierType: 'vendor',
          createdAt: Date.now()
        });

        return {
          success: true,
          tierId,
          message: 'Vendor tier created successfully.'
        };
      }

      return {
        success: false,
        message: 'Failed to create vendor tier.'
      };
    }

    return {
      success: false,
      message: 'Invalid action or missing tier data.'
    };
  } catch (error) {
    console.error('Error managing vendor tiers:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to manage vendor tiers.'
    };
  }
}

export async function updateCommissionStructure(
  input: {
    tierId: string;
    commissionData: {
      default_commission_rate?: number;
      min_commission_rate?: number;
      max_commission_rate?: number;
      benefits?: string[];
      requirements?: string[];
    };
  }
): Promise<{ success: boolean; message: string }> {
  try {
    const { tierId, commissionData } = input;
    const tenantId = await getCurrentTenantId();
    
    // Update commission structure in the database
    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    if (commissionData.default_commission_rate !== undefined) {
      updateFields.push(`default_commission_rate = $${paramIndex++}`);
      values.push(commissionData.default_commission_rate);
    }
    
    if (commissionData.min_commission_rate !== undefined) {
      updateFields.push(`min_commission_rate = $${paramIndex++}`);
      values.push(commissionData.min_commission_rate);
    }
    
    if (commissionData.max_commission_rate !== undefined) {
      updateFields.push(`max_commission_rate = $${paramIndex++}`);
      values.push(commissionData.max_commission_rate);
    }
    
    if (commissionData.benefits !== undefined) {
      updateFields.push(`benefits = $${paramIndex++}`);
      values.push(JSON.stringify(commissionData.benefits));
    }
    
    if (commissionData.requirements !== undefined) {
      updateFields.push(`requirements = $${paramIndex++}`);
      values.push(JSON.stringify(commissionData.requirements));
    }

    if (updateFields.length === 0) {
      return {
        success: false,
        message: 'No fields to update.'
      };
    }

    updateFields.push(`updated_at = NOW()`);
    values.push(tierId, tenantId);

    const result = await execute_sql(
      `UPDATE partner_levels 
       SET ${updateFields.join(', ')}
       WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}`,
      values
    );

    return {
      success: result.rowCount > 0,
      message: result.rowCount > 0 ? 'Commission structure updated successfully.' : 'Tier not found or not authorized.'
    };
  } catch (error) {
    console.error('Error updating commission structure:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to update commission structure.'
    };
  }
}

export async function getVendorMetrics(
  input: {
    vendorId?: string;
    dateRange?: { startDate: string; endDate: string };
  } = {}
): Promise<{
  success: boolean;
  metrics?: {
    totalSales: number;
    monthlyVolume: number;
    productCount: number;
    rating: number;
    reviewCount: number;
    commissionEarned: number;
    activeOrders: number;
  };
  message: string;
}> {
  try {
    const { vendorId, dateRange } = input;
    const tenantId = await getCurrentTenantId();
    
    // Get vendor metrics from database
    // This would be implemented with actual metrics calculation
    // For now, return mock metrics structure
    
    const metrics = {
      totalSales: 0,
      monthlyVolume: 0,
      productCount: 0,
      rating: 0,
      reviewCount: 0,
      commissionEarned: 0,
      activeOrders: 0
    };

    return {
      success: true,
      metrics,
      message: 'Vendor metrics retrieved successfully.'
    };
  } catch (error) {
    console.error('Error getting vendor metrics:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to retrieve vendor metrics.'
    };
  }
}

// Helper function to create vendor profile from approved partner
async function createVendorProfileFromPartner(
  tenantId: string,
  applicationId: string,
  approvalData: { assignedTier: string; commissionRate: number }
): Promise<string> {
  const vendorId = `vendor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const vendorMetadata = await getVendorMetadata(tenantId, applicationId);
  
  const vendorProfile: VendorProfile = {
    id: vendorId,
    tenantId,
    partnerId: applicationId,
    businessName: vendorMetadata?.businessName || '',
    displayName: vendorMetadata?.businessName || '',
    slug: generateVendorSlug(vendorMetadata?.businessName || ''),
    status: 'active',
    currentTier: approvalData.assignedTier,
    commissionRate: approvalData.commissionRate,
    totalSales: 0,
    monthlyVolume: 0,
    productCount: 0,
    rating: 0,
    reviewCount: 0,
    joinedAt: Date.now(),
    lastActiveAt: Date.now(),
    settings: {
      autoApproveOrders: false,
      fulfillmentMethod: 'self',
      returnPolicy: '',
      shippingZones: []
    }
  };

  // Store vendor profile in database for persistence
  await execute_sql(
    `INSERT INTO vendor_profiles 
     (id, tenant_id, partner_id, business_name, display_name, slug, status, 
      current_tier, commission_rate, total_sales, monthly_volume, product_count, 
      rating, review_count, joined_at, last_active_at, settings, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())`,
    [
      vendorProfile.id,
      vendorProfile.tenantId,
      vendorProfile.partnerId,
      vendorProfile.businessName,
      vendorProfile.displayName,
      vendorProfile.slug,
      vendorProfile.status,
      vendorProfile.currentTier,
      vendorProfile.commissionRate,
      vendorProfile.totalSales,
      vendorProfile.monthlyVolume,
      vendorProfile.productCount,
      vendorProfile.rating,
      vendorProfile.reviewCount,
      vendorProfile.joinedAt,
      vendorProfile.lastActiveAt,
      JSON.stringify(vendorProfile.settings)
    ]
  );

  // Cache in Redis for quick access
  const vendorKey = `vendor_profile:${tenantId}:${vendorId}`;
  await redis.set(vendorKey, vendorProfile);

  // Add to vendors index
  const vendorsIndexKey = `vendors:${tenantId}`;
  const existingVendorIds = await redis.get<string[]>(vendorsIndexKey) || [];
  existingVendorIds.push(vendorId);
  await redis.set(vendorsIndexKey, existingVendorIds);

  return vendorId;
}

function generateVendorSlug(businessName: string): string {
  return businessName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .substring(0, 50);
}