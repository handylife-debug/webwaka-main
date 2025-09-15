import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// Webhook to handle Paystack payment events
export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get('x-paystack-signature')

    // Verify webhook signature
    const secret = process.env.PAYSTACK_SECRET_KEY
    if (!secret) {
      console.error('Paystack secret key not configured')
      return NextResponse.json({ success: false }, { status: 400 })
    }

    const hash = crypto.createHmac('sha512', secret).update(body).digest('hex')
    
    if (hash !== signature) {
      console.error('Invalid webhook signature')
      return NextResponse.json({ success: false }, { status: 400 })
    }

    const event = JSON.parse(body)
    
    console.log('Paystack webhook received:', {
      event: event.event,
      reference: event.data?.reference,
      status: event.data?.status
    })

    // Handle different webhook events
    switch (event.event) {
      case 'charge.success':
        await handleChargeSuccess(event.data)
        break
        
      case 'charge.failed':
        await handleChargeFailed(event.data)
        break
        
      case 'refund.processed':
        await handleRefundProcessed(event.data)
        break
        
      case 'refund.failed':
        await handleRefundFailed(event.data)
        break
        
      default:
        console.log('Unhandled webhook event:', event.event)
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Webhook processing error:', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}

async function handleChargeSuccess(data: any) {
  console.log('Payment successful:', {
    reference: data.reference,
    amount: data.amount / 100, // Convert from kobo
    currency: data.currency,
    customer: data.customer.email
  })

  // Here you would:
  // 1. Update transaction status in database
  // 2. Update inventory levels
  // 3. Send receipt to customer
  // 4. Trigger any business logic
  
  // TODO: Implement database updates
}

async function handleChargeFailed(data: any) {
  console.log('Payment failed:', {
    reference: data.reference,
    gateway_response: data.gateway_response
  })

  // Here you would:
  // 1. Update transaction status to failed
  // 2. Notify relevant parties
  // 3. Restore inventory if needed
  
  // TODO: Implement failure handling
}

async function handleRefundProcessed(data: any) {
  console.log('Refund processed:', {
    refund_id: data.id,
    transaction_reference: data.transaction.reference,
    amount: data.amount / 100, // Convert from kobo
    status: data.status
  })

  // Here you would:
  // 1. Update refund status in database
  // 2. Update inventory if applicable
  // 3. Notify customer and staff
  
  // TODO: Implement refund handling
}

async function handleRefundFailed(data: any) {
  console.log('Refund failed:', {
    refund_id: data.id,
    transaction_reference: data.transaction.reference,
    failure_reason: data.failure_reason
  })

  // Here you would:
  // 1. Update refund status to failed
  // 2. Notify staff for manual intervention
  // 3. Log for investigation
  
  // TODO: Implement refund failure handling
}