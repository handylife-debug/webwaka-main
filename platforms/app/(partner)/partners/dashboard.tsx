'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  DollarSign, 
  TrendingUp, 
  Users, 
  Clock,
  Plus,
  Eye,
  Download,
  Share2,
  Wallet,
  AlertCircle
} from 'lucide-react';
import { User } from '@/lib/auth';
import Link from 'next/link';
import { useState } from 'react';
import { createPayoutRequestAction } from './payout-actions';

interface DashboardMetrics {
  total_earnings: number;
  pending_payouts: number;
  direct_referrals: number;
  payable_balance: number;
  commission_stats: {
    total_earnings: number;
    pending_earnings: number;
    paid_earnings: number;
    total_transactions: number;
    pending_transactions: number;
    paid_transactions: number;
  };
  referral_stats: {
    total_direct_referrals: number;
    active_referrals: number;
    converted_referrals: number;
    this_month_referrals: number;
  };
}

interface PartnerDashboardProps {
  user: User;
  dashboardMetrics: DashboardMetrics;
}

function StatsCards({ metrics }: { metrics: DashboardMetrics }) {
  const statsData = [
    {
      title: 'Total Earnings',
      value: `$${metrics.total_earnings.toFixed(2)}`,
      icon: DollarSign,
      color: 'text-green-600 bg-green-100',
      change: `${metrics.commission_stats.total_transactions} transactions`,
      changeType: 'positive' as const,
    },
    {
      title: 'Pending Payouts',
      value: `$${metrics.pending_payouts.toFixed(2)}`,
      icon: Clock,
      color: 'text-yellow-600 bg-yellow-100',
      change: `${metrics.commission_stats.pending_transactions} pending`,
      changeType: 'neutral' as const,
    },
    {
      title: 'Direct Referrals',
      value: `${metrics.direct_referrals}`,
      icon: Users,
      color: 'text-blue-600 bg-blue-100',
      change: `${metrics.referral_stats.this_month_referrals} this month`,
      changeType: 'positive' as const,
    },
    {
      title: 'Payable Balance',
      value: `$${metrics.payable_balance.toFixed(2)}`,
      icon: TrendingUp,
      color: 'text-purple-600 bg-purple-100',
      change: 'Available for payout',
      changeType: 'positive' as const,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {statsData.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-full ${stat.color}`}>
                <Icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className={`text-xs mt-1 ${
                stat.changeType === 'positive' ? 'text-green-600' : 
                stat.changeType === 'negative' ? 'text-red-600' : 'text-gray-600'
              }`}>
                {stat.change}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function RecentActivity() {
  const activities = [
    {
      id: 1,
      type: 'commission',
      description: 'Commission earned from customer signup',
      amount: '$45.00',
      date: '2 hours ago',
      status: 'pending',
    },
    {
      id: 2,
      type: 'referral',
      description: 'New referral: john.doe@example.com',
      amount: null,
      date: '1 day ago',
      status: 'active',
    },
    {
      id: 3,
      type: 'commission',
      description: 'Monthly recurring commission',
      amount: '$125.00',
      date: '3 days ago',
      status: 'paid',
    },
    {
      id: 4,
      type: 'commission',
      description: 'Commission from upgrade sale',
      amount: '$89.50',
      date: '1 week ago',
      status: 'paid',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Recent Activity
          <Button variant="outline" size="sm" asChild>
            <Link href="/partners/commissions">
              <Eye className="h-4 w-4 mr-2" />
              View All
            </Link>
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.map((activity) => (
            <div key={activity.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex-1">
                <p className="text-sm font-medium">{activity.description}</p>
                <p className="text-xs text-gray-500">{activity.date}</p>
              </div>
              <div className="flex items-center gap-3">
                {activity.amount && (
                  <span className="text-sm font-medium">{activity.amount}</span>
                )}
                <Badge 
                  variant="secondary" 
                  className={
                    activity.status === 'paid' ? 'bg-green-100 text-green-800' :
                    activity.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-blue-100 text-blue-800'
                  }
                >
                  {activity.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function QuickActions() {
  const actions = [
    {
      title: 'Share Referral Link',
      description: 'Get your unique referral link to share',
      icon: Share2,
      href: '/partners/referrals',
      color: 'bg-blue-50 text-blue-600 hover:bg-blue-100',
    },
    {
      title: 'View Commissions',
      description: 'Check your earnings and payout history',
      icon: DollarSign,
      href: '/partners/commissions',
      color: 'bg-green-50 text-green-600 hover:bg-green-100',
    },
    {
      title: 'Download Report',
      description: 'Export your performance data',
      icon: Download,
      href: '/partners/analytics',
      color: 'bg-purple-50 text-purple-600 hover:bg-purple-100',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.title}
                variant="ghost"
                className={`justify-start h-auto p-4 ${action.color}`}
                asChild
              >
                <Link href={action.href}>
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5" />
                    <div className="text-left">
                      <div className="font-medium">{action.title}</div>
                      <div className="text-xs opacity-70">{action.description}</div>
                    </div>
                  </div>
                </Link>
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function PayoutRequestCard({ payableBalance }: { payableBalance: number }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestAmount, setRequestAmount] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    try {
      const formData = new FormData(e.currentTarget);
      const result = await createPayoutRequestAction(formData);

      if (result.success) {
        setMessage({ type: 'success', text: result.message });
        setRequestAmount('');
      } else {
        setMessage({ type: 'error', text: result.error });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to submit payout request. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Request Payout
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Current Balance Display */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="text-sm text-gray-600">Current Payable Balance</div>
            <div className="text-2xl font-bold text-green-600">
              ${payableBalance.toFixed(2)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Available for immediate payout request
            </div>
          </div>

          {/* Success/Error Messages */}
          {message && (
            <div className={`p-3 rounded-lg flex items-center gap-2 ${
              message.type === 'success' 
                ? 'bg-green-50 text-green-800 border border-green-200' 
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{message.text}</span>
            </div>
          )}

          {/* Payout Request Form */}
          {payableBalance > 0 ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="requested_amount">Request Amount</Label>
                <Input
                  id="requested_amount"
                  name="requested_amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={payableBalance}
                  value={requestAmount}
                  onChange={(e) => setRequestAmount(e.target.value)}
                  placeholder="Enter amount to request"
                  required
                />
                <div className="text-xs text-gray-500">
                  Maximum: ${payableBalance.toFixed(2)}
                </div>
              </div>

              <input type="hidden" name="payment_method" value="bank_transfer" />

              <Button 
                type="submit" 
                className="w-full" 
                disabled={isSubmitting || payableBalance <= 0}
              >
                {isSubmitting ? 'Submitting...' : 'Request Payout'}
              </Button>
            </form>
          ) : (
            <div className="text-center py-4 text-gray-500">
              <Wallet className="h-8 w-8 mx-auto mb-2 text-gray-400" />
              <p className="text-sm">No funds available for payout</p>
              <p className="text-xs">Earn commissions to request payouts</p>
            </div>
          )}

          <div className="text-xs text-gray-500">
            <p>• Payout requests are reviewed within 2-3 business days</p>
            <p>• You can only have one pending request at a time</p>
            <p>• Minimum payout amount: $10.00</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function PartnerDashboard({ user, dashboardMetrics }: PartnerDashboardProps) {
  return (
    <div className="space-y-6">
      {/* Welcome Message */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Welcome back, {user.name}!
            </h3>
            <p className="text-gray-600 mt-1">
              Here's an overview of your partner performance and recent activities.
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500">Partner Level</div>
            <Badge variant="secondary" className="bg-blue-100 text-blue-800">
              Gold Partner
            </Badge>
          </div>
        </div>
      </div>

      {/* Key Metrics - Total Earnings, Pending Payouts, Direct Referrals */}
      <StatsCards metrics={dashboardMetrics} />

      {/* Activity and Actions */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentActivity />
        </div>
        <div className="space-y-6">
          <PayoutRequestCard payableBalance={dashboardMetrics.payable_balance} />
          <QuickActions />
        </div>
      </div>
    </div>
  );
}