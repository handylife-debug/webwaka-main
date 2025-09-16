'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, TrendingUp, Percent } from 'lucide-react';

interface SeasonalPricingCalendarProps {
  tenantId: string;
}

export function SeasonalPricingCalendar({ tenantId }: SeasonalPricingCalendarProps) {
  return (
    <div className="space-y-6">
      <div className="text-center py-8">
        <Calendar className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Seasonal Pricing Calendar</h3>
        <p className="text-sm text-gray-500 mb-4">
          Configure time-based pricing rules for holidays, festivals, and seasonal demand
        </p>
        <div className="text-xs text-orange-600 bg-orange-50 p-3 rounded-lg border border-orange-200">
          🚧 Component under development - Seasonal pricing calendar functionality coming soon
        </div>
      </div>

      {/* Placeholder for seasonal events */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="opacity-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center">
              <Calendar className="h-4 w-4 mr-2 text-green-600" />
              Christmas Season
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Period:</span>
              <span className="font-medium">Dec 1 - 31</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Price Adjustment:</span>
              <span className="font-medium text-green-600">+15%</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Status:</span>
              <span className="font-medium">Planned</span>
            </div>
          </CardContent>
        </Card>

        <Card className="opacity-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center">
              <Calendar className="h-4 w-4 mr-2 text-blue-600" />
              Back to School
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Period:</span>
              <span className="font-medium">Sep 1 - 30</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Price Adjustment:</span>
              <span className="font-medium text-blue-600">+10%</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Status:</span>
              <span className="font-medium">Planned</span>
            </div>
          </CardContent>
        </Card>

        <Card className="opacity-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center">
              <Calendar className="h-4 w-4 mr-2 text-purple-600" />
              Black Friday
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Period:</span>
              <span className="font-medium">Nov 29 - Dec 2</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Price Adjustment:</span>
              <span className="font-medium text-red-600">-20%</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Status:</span>
              <span className="font-medium">Planned</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Placeholder stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="opacity-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Seasons</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">0</div>
            <p className="text-xs text-gray-600">3 upcoming</p>
          </CardContent>
        </Card>

        <Card className="opacity-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Adjustment</CardTitle>
            <Percent className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">+8.3%</div>
            <p className="text-xs text-gray-600">Across all seasons</p>
          </CardContent>
        </Card>

        <Card className="opacity-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue Impact</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">+12%</div>
            <p className="text-xs text-gray-600">Estimated increase</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}