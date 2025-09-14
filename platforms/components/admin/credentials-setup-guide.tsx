'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Book, 
  ExternalLink, 
  Copy, 
  AlertCircle,
  CheckCircle,
  Settings
} from 'lucide-react';
import { getSetupInstructions } from '@/lib/credentials-management';

interface CredentialsSetupGuideProps {
  missingCredentials: string[];
  onRefresh?: () => void;
}

export function CredentialsSetupGuide({ 
  missingCredentials, 
  onRefresh 
}: CredentialsSetupGuideProps) {
  const instructions = getSetupInstructions();

  const copyInstruction = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (missingCredentials.length === 0) {
    return (
      <Card className="w-full bg-green-50 border-green-200">
        <CardHeader>
          <div className="flex items-center gap-3">
            <CheckCircle className="h-6 w-6 text-green-600" />
            <div>
              <CardTitle className="text-lg text-green-800">
                All Credentials Configured
              </CardTitle>
              <p className="text-sm text-green-700">
                Your API integrations are ready to use.
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Book className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <CardTitle className="text-lg">Setup Guide</CardTitle>
              <p className="text-sm text-gray-600">
                Configure your API credentials using Replit Secrets
              </p>
            </div>
          </div>
          {onRefresh && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={onRefresh}
            >
              <Settings className="h-4 w-4 mr-1" />
              Check Status
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Missing Credentials Alert */}
        {missingCredentials.length > 0 && (
          <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-orange-800">
                  Missing Credentials
                </h4>
                <p className="text-sm text-orange-700 mt-1">
                  The following credentials need to be configured:
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {missingCredentials.map((cred) => (
                    <Badge 
                      key={cred}
                      className="bg-orange-100 text-orange-800 border-orange-300"
                    >
                      {cred}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Setup Instructions */}
        <div>
          <h4 className="font-medium text-gray-900 mb-3">
            How to Add Credentials via Replit Secrets:
          </h4>
          <div className="space-y-2">
            {instructions.map((instruction, index) => (
              <div 
                key={index}
                className={`flex items-start gap-3 ${
                  instruction.trim() === '' ? 'py-1' : 'p-2 rounded-lg bg-gray-50'
                }`}
              >
                {instruction.trim() !== '' && (
                  <>
                    <span className="text-sm font-medium text-blue-600 min-w-[20px]">
                      {instruction.match(/^\d+\./) ? '' : '•'}
                    </span>
                    <span className="text-sm text-gray-700 flex-1">
                      {instruction}
                    </span>
                    {instruction.includes('Click') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => copyInstruction(instruction)}
                        title="Copy instruction"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Quick Access */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-blue-800">
                Quick Access to Secrets
              </h4>
              <p className="text-sm text-blue-700 mt-1">
                Open Replit Secrets panel to add your API keys
              </p>
            </div>
            <Button 
              variant="outline"
              className="border-blue-300 text-blue-700 hover:bg-blue-100"
              onClick={() => {
                // This will work in the Replit environment
                if (typeof window !== 'undefined') {
                  window.open('/~/secrets', '_blank');
                }
              }}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Secrets
            </Button>
          </div>
        </div>

        {/* Service-Specific Instructions */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-purple-200 bg-purple-50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-purple-800">Paystack</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-purple-700">
              <p className="mb-2">Get your keys from:</p>
              <p className="font-mono bg-purple-100 p-1 rounded">
                dashboard.paystack.com → Settings → API Keys
              </p>
            </CardContent>
          </Card>

          <Card className="border-green-200 bg-green-50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-green-800">BetaSMS</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-green-700">
              <p className="mb-2">Get your credentials from:</p>
              <p className="font-mono bg-green-100 p-1 rounded">
                betasms.com → Dashboard → API Settings
              </p>
            </CardContent>
          </Card>

          <Card className="border-blue-200 bg-blue-50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-blue-800">VerifyMe</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-blue-700">
              <p className="mb-2">Get your keys from:</p>
              <p className="font-mono bg-blue-100 p-1 rounded">
                verifyme.ng → Account → API Keys
              </p>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}