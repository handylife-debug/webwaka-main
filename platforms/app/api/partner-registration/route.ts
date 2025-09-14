import { NextRequest, NextResponse } from 'next/server';
import { createPartnerApplication, initializePartnerTables } from '@/lib/partner-management';
import { CreatePartnerApplicationData } from '@/lib/partner-management';

export async function POST(request: NextRequest) {
  try {
    // Initialize partner tables if they don't exist
    await initializePartnerTables();

    const body = await request.json();
    
    // Validate required fields
    if (!body.first_name || !body.last_name || !body.email) {
      return NextResponse.json(
        { error: 'First name, last name, and email are required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      return NextResponse.json(
        { error: 'Please provide a valid email address' },
        { status: 400 }
      );
    }

    // Prepare application data
    const applicationData: CreatePartnerApplicationData = {
      email: body.email.toLowerCase().trim(),
      first_name: body.first_name.trim(),
      last_name: body.last_name.trim(),
      phone: body.phone?.trim() || undefined,
      company_name: body.company_name?.trim() || undefined,
      company_website: body.company_website?.trim() || undefined,
      experience_level: body.experience_level?.trim() || undefined,
      marketing_experience: body.marketing_experience?.trim() || undefined,
      why_partner: body.why_partner?.trim() || undefined,
      referral_methods: body.referral_methods?.trim() || undefined,
      sponsor_email: body.sponsor_email?.toLowerCase().trim() || undefined,
    };

    // Create the partner application
    const applicationId = await createPartnerApplication(applicationData);

    if (!applicationId) {
      return NextResponse.json(
        { error: 'Failed to create application. Please try again.' },
        { status: 500 }
      );
    }

    // Log the new application (you can add more logging logic here)
    console.log(`New partner application submitted: ${applicationId} from ${applicationData.email}`);

    return NextResponse.json(
      { 
        success: true, 
        message: 'Application submitted successfully!',
        applicationId 
      },
      { status: 201 }
    );

  } catch (error: any) {
    console.error('Error processing partner application:', error);
    
    // Handle specific error types
    if (error.message?.includes('already exists')) {
      return NextResponse.json(
        { error: 'An application with this email address already exists.' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error. Please try again later.' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { message: 'Partner registration endpoint is active' },
    { status: 200 }
  );
}