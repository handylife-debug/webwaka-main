'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  MoreHorizontal, 
  Eye, 
  Edit, 
  Archive,
  Play,
  Pause,
  Star,
  Loader2,
  Package
} from 'lucide-react';
import { SubscriptionPlan, PlanStatus } from '@/lib/plans-management';

interface PlansDataTableProps {
  plans: SubscriptionPlan[];
  onStatusChange?: (planId: string, status: PlanStatus) => Promise<void>;
  onEdit?: (plan: SubscriptionPlan) => void;
  onViewDetails?: (plan: SubscriptionPlan) => void;
}

function getStatusColor(status: PlanStatus): string {
  switch (status) {
    case 'active':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'inactive':
      return 'bg-gray-100 text-gray-800 border-gray-200';
    case 'archived':
      return 'bg-red-100 text-red-800 border-red-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

function formatPrice(price: number, interval: string): string {
  return `₦${price.toLocaleString()}/${interval}`;
}

export function PlansDataTable({ plans, onStatusChange, onEdit, onViewDetails }: PlansDataTableProps) {
  const [loadingActions, setLoadingActions] = useState<Record<string, boolean>>({});

  const handleStatusChange = async (planId: string, status: PlanStatus) => {
    if (!onStatusChange) return;
    
    setLoadingActions(prev => ({ ...prev, [planId]: true }));
    try {
      await onStatusChange(planId, status);
    } finally {
      setLoadingActions(prev => ({ ...prev, [planId]: false }));
    }
  };

  const handleEdit = (plan: SubscriptionPlan) => {
    if (onEdit) {
      onEdit(plan);
    } else {
      alert(`Edit plan: ${plan.name}`);
    }
  };

  const handleViewDetails = (plan: SubscriptionPlan) => {
    if (onViewDetails) {
      onViewDetails(plan);
    } else {
      const featuresText = plan.features.map(f => 
        `• ${f.name}${f.limit ? ` (${f.limit} limit)` : ''}: ${f.included ? 'Included' : 'Not included'}`
      ).join('\n');
      
      const limitsText = Object.entries(plan.limits).map(([key, value]) => 
        `• ${key}: ${value}`
      ).join('\n');

      alert(`Plan Details:\n\nName: ${plan.name}\nPrice: ${formatPrice(plan.price, plan.interval)}\nStatus: ${plan.status}\n\nFeatures:\n${featuresText}\n\nLimits:\n${limitsText}`);
    }
  };

  if (plans.length === 0) {
    return (
      <div className="rounded-md border">
        <div className="p-8 text-center">
          <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No plans found</h3>
          <p className="text-gray-500">Create your first subscription plan to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Plan</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Interval</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Features</TableHead>
            <TableHead>Trial</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {plans.map((plan) => (
            <TableRow key={plan.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{plan.name}</span>
                      {plan.isPopular && (
                        <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
                          <Star className="h-3 w-3 mr-1" />
                          Popular
                        </Badge>
                      )}
                    </div>
                    {plan.description && (
                      <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="font-medium">
                  ₦{plan.price.toLocaleString()}
                </div>
                <div className="text-sm text-gray-500">NGN</div>
              </TableCell>
              <TableCell>
                <Badge variant="outline">
                  {plan.interval}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge className={getStatusColor(plan.status)}>
                  {plan.status}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="text-sm">
                  {plan.features.length} features
                </div>
                <div className="text-xs text-gray-500">
                  {Object.keys(plan.limits).length} limits
                </div>
              </TableCell>
              <TableCell>
                <span className="text-sm">
                  {plan.trialDays || 0} days
                </span>
              </TableCell>
              <TableCell>
                <div className="text-sm text-gray-500">
                  {plan.createdAt.toLocaleDateString()}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <span className="sr-only">Open menu</span>
                      {loadingActions[plan.id] ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <MoreHorizontal className="h-4 w-4" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[200px]">
                    <DropdownMenuItem
                      onClick={() => handleViewDetails(plan)}
                      className="flex items-center gap-2"
                    >
                      <Eye className="h-4 w-4" />
                      View Details
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem
                      onClick={() => handleEdit(plan)}
                      className="flex items-center gap-2"
                    >
                      <Edit className="h-4 w-4" />
                      Edit Plan
                    </DropdownMenuItem>
                    
                    {plan.status === 'active' && (
                      <DropdownMenuItem
                        onClick={() => handleStatusChange(plan.id, 'inactive')}
                        className="flex items-center gap-2 text-orange-600"
                      >
                        <Pause className="h-4 w-4" />
                        Deactivate
                      </DropdownMenuItem>
                    )}
                    
                    {plan.status === 'inactive' && (
                      <DropdownMenuItem
                        onClick={() => handleStatusChange(plan.id, 'active')}
                        className="flex items-center gap-2 text-green-600"
                      >
                        <Play className="h-4 w-4" />
                        Activate
                      </DropdownMenuItem>
                    )}
                    
                    {plan.status !== 'archived' && (
                      <DropdownMenuItem
                        onClick={() => handleStatusChange(plan.id, 'archived')}
                        className="flex items-center gap-2 text-red-600"
                      >
                        <Archive className="h-4 w-4" />
                        Archive
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}