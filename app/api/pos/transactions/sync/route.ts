import { NextRequest, NextResponse } from 'next/server'
import { TransactionPersistenceService } from '@/lib/transaction-persistence-service'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tenantId, action = 'sync_to_server' } = body

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant ID is required' }, { status: 400 })
    }

    const persistenceService = new TransactionPersistenceService(tenantId)

    let result

    switch (action) {
      case 'sync_to_server':
        result = await persistenceService.syncToServer()
        break
      
      case 'sync_from_server':
        await persistenceService.syncFromServer()
        result = { syncedCount: 0, pendingCount: 0, conflicts: 0, errors: [] }
        break
      
      case 'full_sync':
        result = await persistenceService.fullSync()
        break
      
      case 'cleanup_old':
        const daysToKeep = body.daysToKeep || 30
        const deletedCount = await persistenceService.cleanupOldTransactions(daysToKeep)
        result = { deletedCount, syncedCount: 0, pendingCount: 0, conflicts: 0, errors: [] }
        break
      
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      action,
      ...result
    })

  } catch (error) {
    console.error('Sync operation failed:', error)
    return NextResponse.json(
      { 
        error: 'Sync operation failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}