import { NextResponse } from 'next/server';
import { generateCSRFToken } from '@/lib/auth-secure';

export async function GET() {
  try {
    const csrfToken = await generateCSRFToken();
    return NextResponse.json({ csrfToken });
  } catch (error) {
    console.error('Error generating CSRF token:', error);
    return NextResponse.json(
      { error: 'Failed to generate CSRF token' },
      { status: 401 }
    );
  }
}