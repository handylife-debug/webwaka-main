import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/auth-server';
import { PartnerDashboard } from './dashboard';
import { getPartnerCommissionStats, getPartnerByUserId, getPartnerByEmail } from '@/lib/partner-management';
import type { Metadata } from 'next';
import { rootDomain } from '@/lib/utils';

export const metadata: Metadata = {
  title: `Partner Dashboard | ${rootDomain}`,
  description: `Partner Portal Dashboard for ${rootDomain}`
};

async function PartnerStatsWrapper() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium">Authentication Required</h3>
              <div className="text-sm mt-1">Please log in to access your partner dashboard.</div>
            </div>
          </div>
        </div>
      );
    }

    // Get real partner ID for the authenticated user
    let partnerId: string | null = null;
    
    // First try to get partner by user ID
    partnerId = await getPartnerByUserId(user.id);
    
    // If not found, try by email as fallback
    if (!partnerId) {
      partnerId = await getPartnerByEmail(user.email);
    }
    
    // If still no partner record found, show appropriate message
    if (!partnerId) {
      return (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium">Partner Registration Required</h3>
              <div className="text-sm mt-1">
                You need to be registered as a partner to access this dashboard. 
                <a href="/partner-registration" className="underline font-medium ml-1">Apply to become a partner</a>
              </div>
            </div>
          </div>
        </div>
      );
    }
    
    const commissionStats = await getPartnerCommissionStats(partnerId);
    
    return <PartnerDashboard user={user} commissionStats={commissionStats} />;
  } catch (error) {
    console.error('Error loading partner dashboard:', error);
    return (
      <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
        <div className="flex">
          <div className="ml-3">
            <h3 className="text-sm font-medium">Dashboard Error</h3>
            <div className="text-sm mt-1">Unable to load dashboard data. Please try again later.</div>
          </div>
        </div>
      </div>
    );
  }
}

export default async function PartnerPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Partner Dashboard</h2>
        <p className="text-gray-600 mt-1">
          Welcome to your Partner Portal. Track your commissions, referrals, and performance metrics.
        </p>
      </div>
      
      <Suspense 
        fallback={
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        }
      >
        <PartnerStatsWrapper />
      </Suspense>
    </div>
  );
}