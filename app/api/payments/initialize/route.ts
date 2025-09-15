import { NextRequest, NextResponse } from 'next/server'
import { createPaymentService } from '../../../../lib/payment-service'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { amount, email, customerInfo, cartItems, tenantId } = body

    if (!amount || !email) {
      return NextResponse.json(
        { success: false, message: 'Amount and email are required' },
        { status: 400 }
      )
    }

    const paymentService = createPaymentService()
    
    const result = await paymentService.initializePayment({
      amount: Math.round(amount * 100), // Convert to kobo
      email,
      metadata: {
        customer_info: customerInfo,
        cart_items: cartItems,
        tenant_id: tenantId,
        pos_transaction: true,
        source: 'webwaka_pos'
      }
    })

    if (result.success) {
      return NextResponse.json({
        success: true,
        data: result.data,
        message: result.message
      })
    } else {
      return NextResponse.json(
        { success: false, message: result.message },
        { status: 400 }
      )
    }

  } catch (error) {
    console.error('Payment initialization error:', error)
    return NextResponse.json(
      { success: false, message: 'Payment initialization failed' },
      { status: 500 }
    )
  }
}