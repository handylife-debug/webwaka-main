'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { 
  Activity, 
  User, 
  Globe, 
  Settings,
  Clock
} from 'lucide-react';
import { ActivityLog } from '@/lib/types';

interface ActivityLogTableProps {
  activities: ActivityLog[];
}

function getActionIcon(action: string) {
  switch (action) {
    case 'user_invited':
    case 'user_created':
    case 'user_status_changed':
      return <User className="h-4 w-4 text-blue-500" />;
    case 'tenant_created':
    case 'tenant_status_changed':
      return <Globe className="h-4 w-4 text-green-500" />;
    case 'system_config_changed':
      return <Settings className="h-4 w-4 text-purple-500" />;
    default:
      return <Activity className="h-4 w-4 text-gray-500" />;
  }
}

function getActionColor(action: string): string {
  if (action.includes('created')) {
    return 'bg-green-100 text-green-800 border-green-200';
  }
  if (action.includes('suspended') || action.includes('deleted')) {
    return 'bg-red-100 text-red-800 border-red-200';
  }
  if (action.includes('changed') || action.includes('updated')) {
    return 'bg-blue-100 text-blue-800 border-blue-200';
  }
  return 'bg-gray-100 text-gray-800 border-gray-200';
}

function formatAction(action: string): string {
  return action
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function ActivityLogTable({ activities }: ActivityLogTableProps) {
  if (activities.length === 0) {
    return (
      <div className="rounded-md border">
        <div className="p-8 text-center">
          <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No activity yet</h3>
          <p className="text-gray-500">Administrative actions will appear here once users start using the system.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]">Type</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Details</TableHead>
            <TableHead>Timestamp</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {activities.map((activity) => (
            <TableRow key={activity.id}>
              <TableCell>
                <div className="flex items-center justify-center">
                  {getActionIcon(activity.action)}
                </div>
              </TableCell>
              <TableCell>
                <div className="font-medium">{activity.userEmail}</div>
              </TableCell>
              <TableCell>
                <Badge className={getActionColor(activity.action)}>
                  {formatAction(activity.action)}
                </Badge>
              </TableCell>
              <TableCell>
                {activity.targetType && activity.targetId && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500 capitalize">
                      {activity.targetType}:
                    </span>
                    <code className="bg-gray-100 px-2 py-1 rounded text-sm">
                      {activity.targetId}
                    </code>
                  </div>
                )}
                {(!activity.targetType || !activity.targetId) && (
                  <span className="text-gray-400">-</span>
                )}
              </TableCell>
              <TableCell>
                <div className="max-w-xs truncate text-sm text-gray-600">
                  {activity.details}
                </div>
              </TableCell>
              <TableCell>
                <div className="text-sm text-gray-500">
                  {new Date(activity.timestamp).toLocaleString()}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}