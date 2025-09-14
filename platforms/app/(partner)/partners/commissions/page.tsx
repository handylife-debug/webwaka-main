import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/auth-server';
import { getPartnerCommissions, getPartnerCommissionStats, getPartnerByUserId, getPartnerByEmail } from '@/lib/partner-management';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DollarSign, TrendingUp, Clock, CheckCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { rootDomain } from '@/lib/utils';

export const metadata: Metadata = {
  title: `Commissions | Partner Portal | ${rootDomain}`,
  description: 'Track your commission earnings and payout history'
};

async function CommissionData() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg">
          <h3 className="text-sm font-medium">Authentication Required</h3>
          <div className="text-sm mt-1">Please log in to access your commissions.</div>
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
          <h3 className="text-sm font-medium">Partner Registration Required</h3>
          <div className="text-sm mt-1">
            You need to be registered as a partner to view commissions.
            <a href="/partner-registration" className="underline font-medium ml-1">Apply to become a partner</a>
          </div>
        </div>
      );
    }
    
    const [commissionStats, commissions] = await Promise.all([
      getPartnerCommissionStats(partnerId),
      getPartnerCommissions(partnerId, { limit: 50 })
    ]);

    return (
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${commissionStats.total_earnings.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">
                From {commissionStats.total_transactions} transactions
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Payouts</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${commissionStats.pending_earnings.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">
                {commissionStats.pending_transactions} pending transactions
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Paid Out</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${commissionStats.paid_earnings.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">
                {commissionStats.paid_transactions} completed payouts
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Commission History */}
        <Card>
          <CardHeader>
            <CardTitle>Commission History</CardTitle>
            <CardDescription>
              Your detailed commission earnings and transaction history
            </CardDescription>
          </CardHeader>
          <CardContent>
            {commissions.length === 0 ? (
              <div className="text-center py-8">
                <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No commissions yet</h3>
                <p className="text-gray-600">
                  Your commission earnings will appear here once you start referring customers.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Transaction ID</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Commission</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commissions.map((commission) => (
                    <TableRow key={commission.id}>
                      <TableCell className="font-mono text-xs">
                        {commission.transaction_id.substring(0, 8)}...
                      </TableCell>
                      <TableCell>${commission.transaction_amount.toFixed(2)}</TableCell>
                      <TableCell className="font-medium">
                        ${commission.commission_amount.toFixed(2)}
                      </TableCell>
                      <TableCell>Level {commission.commission_level}</TableCell>
                      <TableCell>
                        <Badge 
                          variant="secondary"
                          className={
                            commission.payout_status === 'paid' ? 'bg-green-100 text-green-800' :
                            commission.payout_status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }
                        >
                          {commission.payout_status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(commission.transaction_date).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    );
  } catch (error) {
    console.error('Error loading commission data:', error);
    return (
      <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
        <h3 className="text-sm font-medium">Error Loading Commissions</h3>
        <div className="text-sm mt-1">Unable to load commission data. Please try again later.</div>
      </div>
    );
  }
}

export default function CommissionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Commissions</h2>
        <p className="text-gray-600 mt-1">
          Track your commission earnings, payout history, and transaction details.
        </p>
      </div>
      
      <Suspense 
        fallback={
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
            <div className="h-64 bg-gray-100 rounded-lg animate-pulse" />
          </div>
        }
      >
        <CommissionData />
      </Suspense>
    </div>
  );
}