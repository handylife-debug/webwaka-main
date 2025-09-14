'use server';

import { getCurrentUser } from '@/lib/auth-server';
import { 
  createPayoutRequest, 
  getPartnerByUserId, 
  getPartnerByEmail,
  getPartnerPayableBalance 
} from '@/lib/partner-management';
import { revalidatePath } from 'next/cache';

export async function createPayoutRequestAction(formData: FormData) {
  try {
    // Get authenticated user
    const user = await getCurrentUser();
    if (!user) {
      return {
        success: false,
        error: 'Authentication required'
      };
    }

    // Get partner ID for the authenticated user
    let partnerId = await getPartnerByUserId(user.id);
    if (!partnerId) {
      partnerId = await getPartnerByEmail(user.email);
    }

    if (!partnerId) {
      return {
        success: false,
        error: 'Partner record not found. Please contact support.'
      };
    }

    // Get form data
    const requestedAmount = parseFloat(formData.get('requested_amount') as string);
    const paymentMethod = formData.get('payment_method') as string || 'bank_transfer';
    
    // Validate amount
    if (isNaN(requestedAmount) || requestedAmount <= 0) {
      return {
        success: false,
        error: 'Please enter a valid amount greater than zero'
      };
    }

    // Check payable balance
    const payableBalance = await getPartnerPayableBalance(partnerId);
    if (requestedAmount > payableBalance) {
      return {
        success: false,
        error: `Requested amount ($${requestedAmount.toFixed(2)}) exceeds your payable balance ($${payableBalance.toFixed(2)})`
      };
    }

    // Create the payout request
    const payoutRequestId = await createPayoutRequest({
      partner_id: partnerId,
      requested_amount: requestedAmount,
      payment_method: paymentMethod,
      payment_details: {
        submitted_via: 'partner_dashboard',
        user_agent: 'web'
      }
    });

    if (!payoutRequestId) {
      return {
        success: false,
        error: 'Failed to create payout request. Please try again.'
      };
    }

    // Revalidate the dashboard to show updated data
    revalidatePath('/partners');
    
    return {
      success: true,
      message: `Payout request submitted successfully! Request ID: ${payoutRequestId.substring(0, 8)}...`,
      requestId: payoutRequestId
    };

  } catch (error: any) {
    console.error('Error creating payout request:', error);
    
    // Return user-friendly error messages
    if (error.message.includes('already have a pending payout request')) {
      return {
        success: false,
        error: 'You already have a pending payout request. Please wait for it to be processed.'
      };
    }
    
    if (error.message.includes('exceeds payable balance')) {
      return {
        success: false,
        error: 'Requested amount exceeds your available balance.'
      };
    }

    return {
      success: false,
      error: 'Failed to submit payout request. Please try again later.'
    };
  }
}