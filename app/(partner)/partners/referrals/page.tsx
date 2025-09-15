import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Copy, Share2, Users, TrendingUp, UserPlus, ExternalLink } from 'lucide-react';
import type { Metadata } from 'next';
import { rootDomain } from '@/lib/utils';

export const metadata: Metadata = {
  title: `Referrals | Partner Portal | ${rootDomain}`,
  description: 'Manage your referral links and track referral performance'
};

function ReferralLink() {
  const referralCode = 'PARTNER123';
  const referralUrl = `https://${rootDomain}?ref=${referralCode}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Referral Link</CardTitle>
        <CardDescription>
          Share this link to earn commissions from new customer referrals
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="referral-url">Referral URL</Label>
          <div className="flex gap-2">
            <Input
              id="referral-url"
              value={referralUrl}
              readOnly
              className="flex-1"
            />
            <Button variant="outline" size="icon">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="referral-code">Referral Code</Label>
          <div className="flex gap-2">
            <Input
              id="referral-code"
              value={referralCode}
              readOnly
              className="flex-1"
            />
            <Button variant="outline" size="icon">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        <div className="flex gap-2 pt-2">
          <Button className="flex-1">
            <Share2 className="h-4 w-4 mr-2" />
            Share Link
          </Button>
          <Button variant="outline">
            <ExternalLink className="h-4 w-4 mr-2" />
            Preview
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ReferralStats() {
  const stats = [
    {
      title: 'Total Referrals',
      value: '47',
      icon: Users,
      color: 'text-blue-600 bg-blue-100',
      change: '+5 this month',
    },
    {
      title: 'Active Customers',
      value: '32',
      icon: TrendingUp,
      color: 'text-green-600 bg-green-100',
      change: '68% conversion',
    },
    {
      title: 'This Month',
      value: '8',
      icon: UserPlus,
      color: 'text-purple-600 bg-purple-100',
      change: '+2 from last month',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {stats.map((stat) => {
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
              <p className="text-xs text-gray-600 mt-1">
                {stat.change}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function ReferralHistory() {
  const referrals = [
    {
      id: 1,
      email: 'john.doe@example.com',
      signupDate: '2024-09-10',
      status: 'converted',
      plan: 'Pro',
      commission: '$45.00'
    },
    {
      id: 2,
      email: 'sarah.smith@example.com',
      signupDate: '2024-09-08',
      status: 'active',
      plan: 'Free',
      commission: 'Pending'
    },
    {
      id: 3,
      email: 'mike.johnson@example.com',
      signupDate: '2024-09-05',
      status: 'converted',
      plan: 'Enterprise',
      commission: '$125.00'
    },
    {
      id: 4,
      email: 'lisa.brown@example.com',
      signupDate: '2024-09-03',
      status: 'inactive',
      plan: 'Free',
      commission: '$0.00'
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Referral History</CardTitle>
        <CardDescription>
          Track the customers you've referred and their status
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer Email</TableHead>
              <TableHead>Signup Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Commission</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {referrals.map((referral) => (
              <TableRow key={referral.id}>
                <TableCell className="font-medium">{referral.email}</TableCell>
                <TableCell>{new Date(referral.signupDate).toLocaleDateString()}</TableCell>
                <TableCell>
                  <Badge 
                    variant="secondary"
                    className={
                      referral.status === 'converted' ? 'bg-green-100 text-green-800' :
                      referral.status === 'active' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }
                  >
                    {referral.status}
                  </Badge>
                </TableCell>
                <TableCell>{referral.plan}</TableCell>
                <TableCell className="font-medium">{referral.commission}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function ReferralsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Referrals</h2>
        <p className="text-gray-600 mt-1">
          Manage your referral links and track the customers you've referred.
        </p>
      </div>
      
      <ReferralStats />
      
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <ReferralLink />
        </div>
        <div className="lg:col-span-2">
          <ReferralHistory />
        </div>
      </div>
    </div>
  );
}