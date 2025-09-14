import { getCredentialsStatus, getCredentialsHealth } from '@/lib/credentials-management';
import { getCurrentUser } from '@/lib/auth-server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Key, AlertTriangle, CheckCircle } from 'lucide-react';
import { CredentialsManagementClient } from './credentials-management-client';

const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:5000';

export const metadata: Metadata = {
  title: `Credentials Management | ${rootDomain}`,
  description: `Securely manage API keys and credentials for ${rootDomain}`
};

export default async function CredentialsPage() {
  // Check if user has SuperAdmin permissions
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== 'SuperAdmin') {
    redirect('/admin?error=insufficient_permissions');
  }

  // Get current credentials status
  const credentialsStatus = getCredentialsStatus();
  const health = getCredentialsHealth();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Credentials Management</h2>
          <p className="text-gray-600 mt-1">
            Securely manage API keys for third-party services using Replit Secrets.
          </p>
        </div>
      </div>

      {/* Security Notice */}
      <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-800">
              Secure Credential Storage
            </h4>
            <p className="text-sm text-blue-700 mt-1">
              All API keys are securely stored using Replit's encrypted Secrets feature. 
              Credentials are never stored in the database and are only accessible as environment variables.
            </p>
          </div>
        </div>
      </div>

      {/* Health Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Credentials</CardTitle>
            <Key className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{health.totalCredentials}</div>
            <p className="text-xs text-muted-foreground">API keys to configure</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Configured</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{health.setCredentials}</div>
            <p className="text-xs text-muted-foreground">Keys properly set</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Missing</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{health.missingCredentials.length}</div>
            <p className="text-xs text-muted-foreground">Keys not configured</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <Shield className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${health.allSet ? 'text-green-600' : 'text-orange-600'}`}>
              {health.allSet ? 'Ready' : 'Pending'}
            </div>
            <p className="text-xs text-muted-foreground">
              {health.allSet ? 'All integrations ready' : 'Setup required'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <CardTitle>API Credentials Status</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <CredentialsManagementClient 
            credentialsStatus={credentialsStatus}
            health={health}
            currentUser={currentUser}
          />
        </CardContent>
      </Card>
    </div>
  );
}