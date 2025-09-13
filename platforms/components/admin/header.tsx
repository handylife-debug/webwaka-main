'use client';

import { Bell, Search, User, LogOut, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { getCurrentUser, logout } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { rootDomain } from '@/lib/utils';

interface AdminHeaderProps {
  title?: string;
}

export function AdminHeader({ title = 'Dashboard' }: AdminHeaderProps) {
  const router = useRouter();
  const user = getCurrentUser();

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Left side - Title and breadcrumb */}
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
            <p className="text-sm text-gray-500">
              Managing {rootDomain}
            </p>
          </div>
        </div>

        {/* Right side - Search and user menu */}
        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search..."
              className="pl-10 w-64"
            />
          </div>

          {/* Notifications */}
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-4 w-4" />
            <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full text-xs text-white flex items-center justify-center">
              3
            </span>
          </Button>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 px-2">
                <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <User className="h-4 w-4 text-blue-600" />
                </div>
                <div className="hidden md:block text-left">
                  <div className="text-sm font-medium text-gray-900">
                    {user?.name || 'Super Admin'}
                  </div>
                  <div className="text-xs text-gray-500 capitalize">
                    {user?.role || 'SuperAdmin'}
                  </div>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div>
                  <div className="font-medium">{user?.name || 'Super Admin'}</div>
                  <div className="text-sm text-gray-500">{user?.email || 'admin@example.com'}</div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}