import { getAllSubdomains } from '@/lib/subdomains';
import type { Metadata } from 'next';
import { AdminDashboard } from './dashboard';
import { rootDomain } from '@/lib/utils';

export const metadata: Metadata = {
  title: `Super Admin Dashboard | ${rootDomain}`,
  description: `SuperAdmin Control Tower for ${rootDomain}`
};

export default async function AdminPage() {
  let tenants: Awaited<ReturnType<typeof getAllSubdomains>> = [];
  let error: string | null = null;

  try {
    tenants = await getAllSubdomains();
  } catch (err) {
    console.error('Error fetching subdomains:', err);
    error = 'Failed to load tenant data. Please check your database connection.';
    tenants = [];
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard Overview</h2>
        <p className="text-gray-600 mt-1">
          Welcome to the SuperAdmin Control Tower. Manage your multi-tenant platform from here.
        </p>
      </div>
      
      {error ? (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium">Database Error</h3>
              <div className="text-sm mt-1">{error}</div>
            </div>
          </div>
        </div>
      ) : (
        <AdminDashboard tenants={tenants} />
      )}
    </div>
  );
}