'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  CheckCircle, 
  XCircle, 
  Copy, 
  AlertTriangle,
  Settings,
  Lock
} from 'lucide-react';
import { ServiceCredential } from '@/lib/credentials-management';
import { useState } from 'react';

interface CredentialsStatusCardProps {
  serviceName: string;
  credentials: Record<string, ServiceCredential>;
  onRefresh?: () => void;
}

export function CredentialsStatusCard({ 
  serviceName, 
  credentials, 
  onRefresh 
}: CredentialsStatusCardProps) {

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const allSet = Object.values(credentials).every(cred => cred.isSet);
  const requiredCount = Object.values(credentials).filter(cred => cred.required).length;
  const setCount = Object.values(credentials).filter(cred => cred.isSet).length;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Lock className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-lg">{serviceName}</CardTitle>
              <p className="text-sm text-gray-600">
                {setCount}/{requiredCount} credentials configured
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge 
              className={allSet 
                ? 'bg-green-100 text-green-800 border-green-200' 
                : 'bg-red-100 text-red-800 border-red-200'
              }
            >
              {allSet ? (
                <>
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Complete
                </>
              ) : (
                <>
                  <XCircle className="h-3 w-3 mr-1" />
                  Incomplete
                </>
              )}
            </Badge>
            {onRefresh && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={onRefresh}
              >
                <Settings className="h-4 w-4 mr-1" />
                Refresh
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {Object.entries(credentials).map(([key, credential]) => (
            <div
              key={key}
              className="flex items-center justify-between p-3 border rounded-lg bg-gray-50"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{credential.name}</span>
                  {credential.required && (
                    <Badge variant="outline" className="text-xs">
                      Required
                    </Badge>
                  )}
                  {credential.isSet ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                </div>
                <p className="text-xs text-gray-600 mt-1">{credential.description}</p>
                
                {/* Secret Key Name for Reference */}
                <div className="mt-2 flex items-center gap-2">
                  <code className="text-xs bg-gray-200 px-2 py-1 rounded">
                    {credential.key}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => copyToClipboard(credential.key)}
                    title="Copy secret key name"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {credential.isSet ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-green-700 font-medium">
                      Configured
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    <span className="text-sm text-red-600 font-medium">
                      Not Set
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}