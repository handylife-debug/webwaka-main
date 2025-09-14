import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/auth-server';
import { getPartnerCommissionReport, getPartnerByUserId, getPartnerByEmail } from '@/lib/partner-management';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DollarSign, Download, Filter, Calendar, TrendingUp, FileText } from 'lucide-react';
import type { Metadata } from 'next';
import { rootDomain } from '@/lib/utils';

export const metadata: Metadata = {
  title: `Commission Reports | Partner Portal | ${rootDomain}`,
  description: 'Detailed commission reports and transaction history'
};

interface ReportFilters {
  status?: string;
  transaction_type?: string;
  date_from?: string;
  date_to?: string;
  commission_level?: number;
  limit?: number;
  offset?: number;
}

async function CommissionReportData({ filters }: { filters: ReportFilters }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg">
          <h3 className="text-sm font-medium">Authentication Required</h3>
          <div className="text-sm mt-1">Please log in to access commission reports.</div>
        </div>
      );
    }

    // Get real partner ID for the authenticated user
    let partnerId = await getPartnerByUserId(user.id);
    if (!partnerId) {
      partnerId = await getPartnerByEmail(user.email);
    }

    if (!partnerId) {
      return (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg">
          <h3 className="text-sm font-medium">Partner Registration Required</h3>
          <div className="text-sm mt-1">
            You need to be registered as a partner to access commission reports.
            <a href="/partner-registration" className="underline font-medium ml-1">Apply to become a partner</a>
          </div>
        </div>
      );
    }

    const reportData = await getPartnerCommissionReport(partnerId, filters);

    return (
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${reportData.summary.total_amount.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">
                From {reportData.summary.total_transactions} transactions
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Amount</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${reportData.summary.pending_amount.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">
                Awaiting payout
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Paid Amount</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${reportData.summary.paid_amount.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">
                Successfully paid out
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Records</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{reportData.total_count}</div>
              <p className="text-xs text-muted-foreground">
                Commission records
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Commission Table */}
        <Card>
          <CardHeader>
            <CardTitle>Commission Details</CardTitle>
            <CardDescription>
              Comprehensive list of all generated commissions with transaction details
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reportData.commissions.length === 0 ? (
              <div className="text-center py-8">
                <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No commission records found</h3>
                <p className="text-gray-600">
                  No commissions match your current filter criteria.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Transaction ID</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Transaction Amount</TableHead>
                      <TableHead>Commission %</TableHead>
                      <TableHead>Commission Amount</TableHead>
                      <TableHead>Level</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Source Partner</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.commissions.map((commission) => (
                      <TableRow key={commission.id}>
                        <TableCell className="font-mono text-xs">
                          {commission.transaction_id.substring(0, 8)}...
                        </TableCell>
                        <TableCell>
                          {new Date(commission.transaction_date).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {commission.transaction_type}
                          </Badge>
                        </TableCell>
                        <TableCell>${commission.transaction_amount.toFixed(2)}</TableCell>
                        <TableCell>{(commission.commission_percentage * 100).toFixed(2)}%</TableCell>
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
                              commission.payout_status === 'approved' ? 'bg-blue-100 text-blue-800' :
                              'bg-gray-100 text-gray-800'
                            }
                          >
                            {commission.payout_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {commission.source_partner_code}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Pagination Info */}
            {reportData.total_count > 0 && (
              <div className="flex items-center justify-between pt-4 text-sm text-gray-600">
                <div>
                  Showing {Math.min(filters.limit || 50, reportData.commissions.length)} of {reportData.total_count} records
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={!filters.offset}>
                    Previous
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    disabled={reportData.commissions.length < (filters.limit || 50)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  } catch (error) {
    console.error('Error loading commission report:', error);
    return (
      <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
        <h3 className="text-sm font-medium">Report Error</h3>
        <div className="text-sm mt-1">Unable to load commission report. Please try again later.</div>
      </div>
    );
  }
}

function ReportFilters() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="h-4 w-4" />
          Report Filters
        </CardTitle>
        <CardDescription>
          Filter your commission data by status, date range, and transaction type
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="status-filter">Payout Status</Label>
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="type-filter">Transaction Type</Label>
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="payment">Payment</SelectItem>
                <SelectItem value="signup">Signup</SelectItem>
                <SelectItem value="recurring">Recurring</SelectItem>
                <SelectItem value="bonus">Bonus</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="level-filter">Commission Level</Label>
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="All levels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="1">Level 1</SelectItem>
                <SelectItem value="2">Level 2</SelectItem>
                <SelectItem value="3">Level 3</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="date-from">Date From</Label>
            <Input type="date" id="date-from" />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="date-to">Date To</Label>
            <Input type="date" id="date-to" />
          </div>
          
          <div className="flex items-end">
            <Button className="w-full">
              <Filter className="h-4 w-4 mr-2" />
              Apply Filters
            </Button>
          </div>
        </div>
        
        <div className="flex gap-2 pt-4">
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CommissionReportsPage() {
  // Default filters - in a real app, these would come from URL params
  const defaultFilters: ReportFilters = {
    limit: 50,
    offset: 0,
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Commission Reports</h2>
        <p className="text-gray-600 mt-1">
          Detailed analysis of all your commission transactions with comprehensive filtering and export options.
        </p>
      </div>
      
      {/* Filters */}
      <ReportFilters />
      
      {/* Report Data */}
      <Suspense 
        fallback={
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
            <div className="h-96 bg-gray-100 rounded-lg animate-pulse" />
          </div>
        }
      >
        <CommissionReportData filters={defaultFilters} />
      </Suspense>
    </div>
  );
}