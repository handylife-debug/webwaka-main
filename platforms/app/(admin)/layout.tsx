import { getCurrentUser } from '@/lib/auth-server';
import { hasRequiredRole } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AdminSidebar } from '@/components/admin/sidebar';
import { AdminHeader } from '@/components/admin/header';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
  // Check SuperAdmin role authorization
  const user = await getCurrentUser();
  if (!hasRequiredRole(user, 'SuperAdmin')) {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        {/* Sidebar */}
        <AdminSidebar className="fixed left-0 top-0 bottom-0 z-30" />
        
        {/* Main content area */}
        <div className="flex-1 ml-64">
          {/* Header */}
          <AdminHeader />
          
          {/* Page content */}
          <main className="p-6">
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}