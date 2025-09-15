import { NextRequest, NextResponse } from 'next/server'
import { createPaymentService } from '../../../../../lib/payment-service'

export async function GET(
  request: NextRequest,
  { params }: { params: { reference: string } }
) {
  try {
    const { reference } = params

    if (!reference) {
      return NextResponse.json(
        { success: false, message: 'Payment reference is required' },
        { status: 400 }
      )
    }

    const paymentService = createPaymentService()
    
    const result = await paymentService.verifyPayment(reference)

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
    console.error('Payment verification error:', error)
    return NextResponse.json(
      { success: false, message: 'Payment verification failed' },
      { status: 500 }
    )
  }
}