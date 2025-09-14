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
  Play,
  Pause,
  Trash2,
  Loader2,
  Layers,
  TrendingUp,
  Target
} from 'lucide-react';
import { PartnerLevel, PartnerLevelStatus } from '@/lib/partner-management';
import { updatePartnerLevelStatusAction, deletePartnerLevelAction } from '@/app/(admin)/admin/partners/actions';

interface PartnerLevelsTableProps {
  partnerLevels: PartnerLevel[];
}

function getStatusColor(isActive: boolean): string {
  return isActive 
    ? 'bg-green-100 text-green-800 border-green-200'
    : 'bg-gray-100 text-gray-800 border-gray-200';
}

function formatCommissionRate(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

export function PartnerLevelsTable({ partnerLevels }: PartnerLevelsTableProps) {
  const [loadingActions, setLoadingActions] = useState<Record<string, boolean>>({});

  const handleStatusChange = async (levelId: string, isActive: boolean) => {
    const status: PartnerLevelStatus = isActive ? 'active' : 'inactive';
    
    setLoadingActions(prev => ({ ...prev, [levelId]: true }));
    try {
      const result = await updatePartnerLevelStatusAction(levelId, status);
      if (!result.success) {
        alert(result.error || 'Failed to update status');
      }
    } catch (error) {
      alert('An error occurred while updating status');
    } finally {
      setLoadingActions(prev => ({ ...prev, [levelId]: false }));
    }
  };

  const handleDelete = async (levelId: string, levelName: string) => {
    if (!confirm(`Are you sure you want to delete the partner level "${levelName}"? This action cannot be undone.`)) {
      return;
    }
    
    setLoadingActions(prev => ({ ...prev, [levelId]: true }));
    try {
      const result = await deletePartnerLevelAction(levelId);
      if (!result.success) {
        alert(result.error || 'Failed to delete partner level');
      }
    } catch (error) {
      alert('An error occurred while deleting the partner level');
    } finally {
      setLoadingActions(prev => ({ ...prev, [levelId]: false }));
    }
  };

  const handleEdit = (level: PartnerLevel) => {
    // TODO: Implement edit functionality
    alert(`Edit partner level: ${level.level_name} (Feature coming soon)`);
  };

  const handleViewDetails = (level: PartnerLevel) => {
    const benefitsText = level.benefits.length > 0 
      ? level.benefits.map(b => `• ${b}`).join('\n')
      : 'No specific benefits defined';
    
    const permissionsText = level.permissions.length > 0
      ? level.permissions.map(p => `• ${p}`).join('\n')
      : 'No specific permissions defined';
    
    const details = [
      `Partner Level: ${level.level_name} (${level.level_code})`,
      `Description: ${level.description || 'No description'}`,
      `Commission Rate: ${formatCommissionRate(level.default_commission_rate)}`,
      `Rate Range: ${formatCommissionRate(level.minimum_commission_rate)} - ${formatCommissionRate(level.maximum_commission_rate)}`,
      `Max Referral Depth: ${level.max_referral_depth} levels`,
      `Level Order: ${level.level_order}`,
      `Minimum Requirements:`,
      `  • Referrals: ${level.minimum_referrals}`,
      `  • Revenue: ₦${level.minimum_revenue.toLocaleString()}`,
      `  • Active Referrals: ${level.minimum_active_referrals}`,
      `Auto-upgrade: ${level.can_auto_upgrade ? 'Yes' : 'No'}`,
      `Requires Approval: ${level.requires_approval ? 'Yes' : 'No'}`,
      `Status: ${level.is_active ? 'Active' : 'Inactive'}`,
      ``,
      `Benefits:`,
      benefitsText,
      ``,
      `Permissions:`,
      permissionsText,
    ].join('\n');
    
    alert(details);
  };

  if (partnerLevels.length === 0) {
    return (
      <div className="rounded-md border">
        <div className="p-8 text-center">
          <Layers className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No partner levels yet</h3>
          <p className="text-gray-500">Create your first partner tier to start building your partnership program.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[60px]">Order</TableHead>
            <TableHead>Level Name</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Commission Rate</TableHead>
            <TableHead>Max Depth</TableHead>
            <TableHead>Min Requirements</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[70px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {partnerLevels.map((level) => (
            <TableRow key={level.id}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {level.level_order}
                  </Badge>
                </div>
              </TableCell>
              
              <TableCell>
                <div className="font-medium">{level.level_name}</div>
                {level.description && (
                  <div className="text-sm text-muted-foreground max-w-[200px] truncate">
                    {level.description}
                  </div>
                )}
              </TableCell>
              
              <TableCell>
                <Badge variant="secondary" className="font-mono text-xs">
                  {level.level_code}
                </Badge>
              </TableCell>
              
              <TableCell>
                <div className="flex items-center gap-1">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  <span className="font-medium text-green-600">
                    {formatCommissionRate(level.default_commission_rate)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Range: {formatCommissionRate(level.minimum_commission_rate)} - {formatCommissionRate(level.maximum_commission_rate)}
                </div>
              </TableCell>
              
              <TableCell>
                <div className="flex items-center gap-1">
                  <Target className="h-4 w-4 text-blue-600" />
                  <span className="font-medium">{level.max_referral_depth}</span>
                  <span className="text-xs text-muted-foreground">levels</span>
                </div>
              </TableCell>
              
              <TableCell>
                <div className="text-sm space-y-1">
                  <div>Referrals: {level.minimum_referrals}</div>
                  <div>Revenue: ₦{level.minimum_revenue.toLocaleString()}</div>
                  <div>Active: {level.minimum_active_referrals}</div>
                </div>
              </TableCell>
              
              <TableCell>
                <Badge 
                  variant="outline" 
                  className={getStatusColor(level.is_active)}
                >
                  {level.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </TableCell>
              
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      className="h-8 w-8 p-0"
                      disabled={loadingActions[level.id]}
                    >
                      {loadingActions[level.id] ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <MoreHorizontal className="h-4 w-4" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleViewDetails(level)}>
                      <Eye className="mr-2 h-4 w-4" />
                      View Details
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem onClick={() => handleEdit(level)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit Level
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem 
                      onClick={() => handleStatusChange(level.id, !level.is_active)}
                    >
                      {level.is_active ? (
                        <>
                          <Pause className="mr-2 h-4 w-4" />
                          Deactivate
                        </>
                      ) : (
                        <>
                          <Play className="mr-2 h-4 w-4" />
                          Activate
                        </>
                      )}
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem 
                      onClick={() => handleDelete(level.id, level.level_name)}
                      className="text-red-600 focus:text-red-600"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
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