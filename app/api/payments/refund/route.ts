import { NextRequest, NextResponse } from 'next/server'
import { createPaymentService } from '../../../../lib/payment-service'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { transactionReference, amount, reason, customerNote } = body

    if (!transactionReference) {
      return NextResponse.json(
        { success: false, message: 'Transaction reference is required' },
        { status: 400 }
      )
    }

    const paymentService = createPaymentService()
    
    const result = await paymentService.processRefund({
      transactionReference,
      amount: amount ? Math.round(amount * 100) : undefined, // Convert to kobo if provided
      customerNote,
      merchantNote: reason
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
    console.error('Refund processing error:', error)
    return NextResponse.json(
      { success: false, message: 'Refund processing failed' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const reference = searchParams.get('reference')
    const page = searchParams.get('page')
    const perPage = searchParams.get('perPage')

    const paymentService = createPaymentService()
    
    const result = await paymentService.listRefunds({
      reference: reference || undefined,
      page: page ? parseInt(page) : undefined,
      perPage: perPage ? parseInt(perPage) : undefined
    })

    if (result.success) {
      return NextResponse.json({
        success: true,
        data: result.data,
        meta: result.meta,
        message: result.message
      })
    } else {
      return NextResponse.json(
        { success: false, message: result.message },
        { status: 400 }
      )
    }

  } catch (error) {
    console.error('List refunds error:', error)
    return NextResponse.json(
      { success: false, message: 'Failed to retrieve refunds' },
      { status: 500 }
    )
  }
}