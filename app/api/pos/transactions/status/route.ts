import { NextRequest, NextResponse } from 'next/server'
import { TransactionPersistenceService } from '@/lib/transaction-persistence-service'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tenantId = searchParams.get('tenantId')

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant ID is required' }, { status: 400 })
    }

    const persistenceService = new TransactionPersistenceService(tenantId)
    const status = await persistenceService.getStatus()

    return NextResponse.json({
      success: true,
      ...status
    })

  } catch (error) {
    console.error('Failed to get transaction status:', error)
    return NextResponse.json(
      { 
        error: 'Failed to get transaction status', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}