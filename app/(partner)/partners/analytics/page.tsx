import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/auth-server';
import { getPartnerByUserId, getPartnerByEmail } from '@/lib/partner-management';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Users, Eye, BarChart3, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import type { Metadata } from 'next';
import { rootDomain } from '@/lib/utils';

export const metadata: Metadata = {
  title: `Analytics | Partner Portal | ${rootDomain}`,
  description: 'Track your partner performance and analytics'
};

async function AnalyticsData() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg">
          <h3 className="text-sm font-medium">Authentication Required</h3>
          <div className="text-sm mt-1">Please log in to access analytics.</div>
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
            You need to be registered as a partner to view analytics.
            <a href="/partner-registration" className="underline font-medium ml-1">Apply to become a partner</a>
          </div>
        </div>
      );
    }

    // Mock analytics data - replace with real data fetching
    const analyticsData = {
      totalViews: 1247,
      conversionRate: 3.2,
      clickThroughRate: 12.5,
      totalReferrals: 24,
      monthlyGrowth: 8.3,
      topPages: [
        { page: '/pricing', views: 423, conversions: 12 },
        { page: '/features', views: 341, conversions: 8 },
        { page: '/about', views: 289, conversions: 4 }
      ],
      recentActivity: [
        { type: 'referral', description: 'New customer signup', date: '2 hours ago' },
        { type: 'view', description: 'Referral link clicked', date: '5 hours ago' },
        { type: 'conversion', description: 'Customer upgraded to Pro', date: '1 day ago' }
      ]
    };

    return (
      <div className="space-y-6">
        {/* Overview Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Views</CardTitle>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analyticsData.totalViews.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                <span className="inline-flex items-center text-green-600">
                  <ArrowUpRight className="h-3 w-3 mr-1" />
                  +{analyticsData.monthlyGrowth}%
                </span>
                {' '}from last month
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analyticsData.conversionRate}%</div>
              <p className="text-xs text-muted-foreground">
                <span className="inline-flex items-center text-green-600">
                  <ArrowUpRight className="h-3 w-3 mr-1" />
                  +0.3%
                </span>
                {' '}from last month
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Click-Through Rate</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analyticsData.clickThroughRate}%</div>
              <p className="text-xs text-muted-foreground">
                <span className="inline-flex items-center text-red-600">
                  <ArrowDownRight className="h-3 w-3 mr-1" />
                  -1.2%
                </span>
                {' '}from last month
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Referrals</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analyticsData.totalReferrals}</div>
              <p className="text-xs text-muted-foreground">
                <span className="inline-flex items-center text-green-600">
                  <ArrowUpRight className="h-3 w-3 mr-1" />
                  +3
                </span>
                {' '}this week
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts and Detailed Analytics */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Top Pages */}
          <Card>
            <CardHeader>
              <CardTitle>Top Performing Pages</CardTitle>
              <CardDescription>Pages generating the most referral traffic</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analyticsData.topPages.map((page, index) => (
                  <div key={page.page} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 text-sm font-medium flex items-center justify-center">
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-medium">{page.page}</div>
                        <div className="text-sm text-gray-500">{page.views} views</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{page.conversions} conversions</div>
                      <div className="text-sm text-gray-500">
                        {((page.conversions / page.views) * 100).toFixed(1)}% rate
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest referral and conversion activity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analyticsData.recentActivity.map((activity, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      activity.type === 'conversion' ? 'bg-green-500' :
                      activity.type === 'referral' ? 'bg-blue-500' : 'bg-gray-400'
                    }`} />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{activity.description}</div>
                      <div className="text-xs text-gray-500">{activity.date}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Coming Soon Notice */}
        <Card>
          <CardHeader>
            <CardTitle>Enhanced Analytics Coming Soon</CardTitle>
            <CardDescription>
              We're working on advanced analytics features including detailed conversion funnels, 
              geographic data, and custom date ranges.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-gray-600">
              Features in development:
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li>Real-time visitor tracking</li>
                <li>A/B testing for referral campaigns</li>
                <li>Detailed conversion funnel analysis</li>
                <li>Geographic performance data</li>
                <li>Custom date range reports</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  } catch (error) {
    console.error('Error loading analytics data:', error);
    return (
      <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
        <h3 className="text-sm font-medium">Error Loading Analytics</h3>
        <div className="text-sm mt-1">Unable to load analytics data. Please try again later.</div>
      </div>
    );
  }
}

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Analytics</h2>
        <p className="text-gray-600 mt-1">
          Track your referral performance, conversion rates, and engagement metrics.
        </p>
      </div>
      
      <Suspense 
        fallback={
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="h-64 bg-gray-100 rounded-lg animate-pulse" />
              <div className="h-64 bg-gray-100 rounded-lg animate-pulse" />
            </div>
          </div>
        }
      >
        <AnalyticsData />
      </Suspense>
    </div>
  );
}