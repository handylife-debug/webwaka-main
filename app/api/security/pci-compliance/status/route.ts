import { NextRequest, NextResponse } from 'next/server'
import { SecurePCIComplianceService } from '@/lib/pci-compliance-service'
import { getTenantContext } from '@/lib/tenant-context'

export async function GET(request: NextRequest) {
  try {
    const tenantContext = await getTenantContext(request)
    
    if (!tenantContext.tenantId) {
      return NextResponse.json({ error: 'Tenant ID required' }, { status: 400 })
    }

    const pciService = new SecurePCIComplianceService(tenantContext.tenantId)
    const status = await pciService.assessCompliance()

    return NextResponse.json({
      success: true,
      ...status
    })

  } catch (error) {
    console.error('Failed to get PCI compliance status:', error)
    return NextResponse.json(
      { 
        error: 'Failed to get PCI compliance status', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}