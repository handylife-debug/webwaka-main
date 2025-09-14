import { getCurrentUser } from '@/lib/auth-server';
import { hasRequiredRole } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { PartnerSidebar } from '@/components/partner/sidebar';
import { PartnerHeader } from '@/components/partner/header';

interface PartnerLayoutProps {
  children: React.ReactNode;
}

export default async function PartnerLayout({ children }: PartnerLayoutProps) {
  // Check Partner role authorization
  const user = await getCurrentUser();
  if (!hasRequiredRole(user, 'Partner')) {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        {/* Sidebar */}
        <PartnerSidebar className="fixed left-0 top-0 bottom-0 z-30" />
        
        {/* Main content area */}
        <div className="flex-1 ml-64">
          {/* Header */}
          <PartnerHeader />
          
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