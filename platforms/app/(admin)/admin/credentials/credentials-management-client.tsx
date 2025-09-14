'use client';

import { useState } from 'react';
import { CredentialsStatus } from '@/lib/credentials-management';
import { CredentialsStatusCard } from '@/components/admin/credentials-status-card';
import { CredentialsSetupGuide } from '@/components/admin/credentials-setup-guide';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface CredentialsManagementClientProps {
  credentialsStatus: CredentialsStatus;
  health: {
    allSet: boolean;
    totalCredentials: number;
    setCredentials: number;
    missingCredentials: string[];
  };
  currentUser: { id: string; email: string; role: string };
}

export function CredentialsManagementClient({ 
  credentialsStatus: initialStatus, 
  health: initialHealth,
  currentUser 
}: CredentialsManagementClientProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Refresh the page to get updated status
      window.location.reload();
    } catch (error) {
      console.error('Error refreshing credentials status:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Refresh Button */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Third-Party Service Credentials</h3>
          <p className="text-sm text-gray-600">
            Monitor and manage API keys for external integrations.
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Refresh Status'}
        </Button>
      </div>

      {/* Setup Guide */}
      <CredentialsSetupGuide 
        missingCredentials={initialHealth.missingCredentials}
        onRefresh={handleRefresh}
      />

      {/* Service Credentials Status */}
      <div className="grid gap-6 lg:grid-cols-1">
        <CredentialsStatusCard
          serviceName="Paystack Payment Gateway"
          credentials={initialStatus.paystack}
          onRefresh={handleRefresh}
        />
        
        <CredentialsStatusCard
          serviceName="BetaSMS Messaging Service"
          credentials={initialStatus.betaSMS}
          onRefresh={handleRefresh}
        />
        
        <CredentialsStatusCard
          serviceName="VerifyMe Identity Verification"
          credentials={initialStatus.verifyMe}
          onRefresh={handleRefresh}
        />
      </div>

      {/* Additional Information */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h4 className="font-medium text-gray-900 mb-2">Important Notes:</h4>
        <ul className="text-sm text-gray-700 space-y-1">
          <li>• Credentials are stored securely using Replit's encrypted Secrets feature</li>
          <li>• API keys are never stored in the database or exposed in logs</li>
          <li>• Changes to secrets require an application restart to take effect</li>
          <li>• Only SuperAdmins can view and manage these credentials</li>
          <li>• Use the exact secret key names shown above when adding to Replit Secrets</li>
        </ul>
      </div>
    </div>
  );
}