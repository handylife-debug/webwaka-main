'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  TrendingUp, 
  Users, 
  Settings, 
  Menu,
  ChevronLeft,
  Handshake,
  DollarSign,
  UserPlus,
  BarChart3
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface SidebarProps {
  className?: string;
}

const navigation = [
  {
    name: 'Dashboard',
    href: '/partners',
    icon: LayoutDashboard,
  },
  {
    name: 'Commissions',
    href: '/partners/commissions',
    icon: DollarSign,
  },
  {
    name: 'Referrals',
    href: '/partners/referrals',
    icon: UserPlus,
  },
  {
    name: 'Analytics',
    href: '/partners/analytics',
    icon: BarChart3,
  },
  {
    name: 'Profile',
    href: '/partners/profile',
    icon: Settings,
  },
];

export function PartnerSidebar({ className }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <div className={cn(
      "relative flex flex-col bg-white border-r border-gray-200 transition-all duration-300",
      isCollapsed ? "w-16" : "w-64",
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <Handshake className="h-6 w-6 text-blue-600" />
            <span className="font-semibold text-gray-900">Partner Portal</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="h-8 w-8"
        >
          {isCollapsed ? <Menu className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors",
                    isActive
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50",
                    isCollapsed && "justify-center px-2"
                  )}
                >
                  <Icon className={cn("h-4 w-4 flex-shrink-0", isActive && "text-blue-600")} />
                  {!isCollapsed && <span>{item.name}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      {!isCollapsed && (
        <div className="p-4 border-t border-gray-200">
          <div className="text-xs text-gray-500 text-center">
            Partner Portal v1.0
          </div>
        </div>
      )}
    </div>
  );
}