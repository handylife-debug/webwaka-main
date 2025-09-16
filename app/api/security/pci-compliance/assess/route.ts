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

    // CRITICAL RBAC CHECK: Only Admins can perform compliance assessments
    const currentUser = await getCurrentUser()
    if (!currentUser || !hasRequiredRole(currentUser, 'Admin')) {
      return NextResponse.json(
        { 
          error: 'RBAC_VIOLATION: Only Admins can perform PCI compliance assessments', 
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

    // Use secure PCI compliance service for real assessment
    const pciService = new SecurePCIComplianceService(tenantId)
    
    // Run comprehensive PCI DSS assessment with real vulnerability scanning
    const complianceStatus = await pciService.assessCompliance()
    const requirements = await pciService.validatePCIRequirements()
    
    // Verify audit log integrity as part of assessment
    const auditIntegrity = await pciService.verifyAuditLogIntegrity()

    return NextResponse.json({
      success: true,
      assessment: {
        timestamp: new Date().toISOString(),
        assessor: currentUser.email,
        tenantId,
        complianceStatus,
        requirements,
        auditIntegrity,
        summary: {
          overallStatus: complianceStatus.cardDataExposureRisk === 'none' ? 'COMPLIANT' : 'NON_COMPLIANT',
          criticalVulnerabilities: complianceStatus.vulnerabilities.filter(v => v.severity === 'critical').length,
          highVulnerabilities: complianceStatus.vulnerabilities.filter(v => v.severity === 'high').length,
          encryptionStatus: complianceStatus.encryptionStatus,
          auditLogStatus: complianceStatus.auditLogStatus,
          auditChainIntegrity: auditIntegrity.valid ? 'VALID' : 'COMPROMISED'
        }
      }
    })

  } catch (error) {
    console.error('Failed to run PCI compliance assessment:', error)
    return NextResponse.json(
      { 
        error: 'Failed to run PCI compliance assessment', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}