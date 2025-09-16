import { NextRequest, NextResponse } from 'next/server'
import { SecurePCIComplianceService } from '@/lib/pci-compliance-service'
import { getTenantContext, validateTenantAccess } from '@/lib/tenant-context'
import { getCurrentUser } from '@/lib/auth-server'
import { hasRequiredRole } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    // Get tenant context from subdomain
    const tenantContext = await getTenantContext(request)
    const tenantId = tenantContext.tenantId
    
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant ID required' }, { status: 400 })
    }

    // CRITICAL RBAC CHECK: Only Admins can enable encryption system-wide
    const currentUser = await getCurrentUser()
    if (!currentUser || !hasRequiredRole(currentUser, 'Admin')) {
      return NextResponse.json(
        { 
          error: 'RBAC_VIOLATION: Only Admins can enable data encryption', 
          requiredRole: 'Admin',
          currentRole: currentUser?.role || 'none'
        },
        { status: 403 }
      )
    }
    
    // Validate tenant access
    const hasAccess = await validateTenantAccess(tenantId, request)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Unauthorized access to tenant' }, { status: 403 })
    }

    // Use secure PCI compliance service with proper key management
    const pciService = new SecurePCIComplianceService(tenantId)
    
    // Enable data encryption with envelope encryption and audit logging
    await pciService.enableEncryption()

    return NextResponse.json({
      success: true,
      message: 'Data encryption enabled with per-tenant key management and tamper-evident audit logging',
      encryptionStatus: 'enabled',
      algorithm: 'AES-256-GCM',
      keyManagement: 'envelope_encryption_with_tenant_specific_deks',
      auditLogging: 'tamper_evident_with_hash_chaining',
      enabledBy: currentUser.email
    })

  } catch (error) {
    console.error('Failed to enable encryption:', error)
    return NextResponse.json(
      { 
        error: 'Failed to enable encryption', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}