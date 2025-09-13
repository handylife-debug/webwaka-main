import { getAllSubdomains } from '@/lib/subdomains';
import type { Metadata } from 'next';
import { AdminDashboard } from './dashboard';
import { rootDomain } from '@/lib/utils';

export const metadata: Metadata = {
  title: `Super Admin Dashboard | ${rootDomain}`,
  description: `SuperAdmin Control Tower for ${rootDomain}`
};

export default async function AdminPage() {
  const tenants = await getAllSubdomains();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard Overview</h2>
        <p className="text-gray-600 mt-1">
          Welcome to the SuperAdmin Control Tower. Manage your multi-tenant platform from here.
        </p>
      </div>
      
      <AdminDashboard tenants={tenants} />
    </div>
  );
}