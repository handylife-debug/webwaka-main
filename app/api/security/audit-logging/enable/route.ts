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

    // CRITICAL RBAC CHECK: Only Admins can enable audit logging system-wide
    const currentUser = await getCurrentUser()
    if (!currentUser || !hasRequiredRole(currentUser, 'Admin')) {
      return NextResponse.json(
        { 
          error: 'RBAC_VIOLATION: Only Admins can enable audit logging', 
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

    const body = await request.json()
    const { retentionDays = 365 } = body

    // Use secure PCI compliance service with tamper-evident logging
    const pciService = new SecurePCIComplianceService(tenantId)
    
    // Enable audit logging with hash chaining and immutability
    await pciService.enableAuditLogging()

    return NextResponse.json({
      success: true,
      message: 'Tamper-evident audit logging enabled with hash chaining for PCI DSS Requirement 10 compliance',
      auditLogStatus: 'active',
      retentionDays,
      features: [
        'hash_chain_integrity',
        'immutable_storage', 
        'tamper_detection',
        'automatic_retention_policy'
      ],
      enabledBy: currentUser.email
    })

  } catch (error) {
    console.error('Failed to enable audit logging:', error)
    return NextResponse.json(
      { 
        error: 'Failed to enable audit logging', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}