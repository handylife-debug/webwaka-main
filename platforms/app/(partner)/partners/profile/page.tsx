import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/auth-server';
import { getPartnerByUserId, getPartnerByEmail } from '@/lib/partner-management';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { User, Mail, Phone, Calendar, MapPin, Edit, Save, Shield } from 'lucide-react';
import type { Metadata } from 'next';
import { rootDomain } from '@/lib/utils';

export const metadata: Metadata = {
  title: `Profile | Partner Portal | ${rootDomain}`,
  description: 'Manage your partner profile and account settings'
};

async function ProfileData() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg">
          <h3 className="text-sm font-medium">Authentication Required</h3>
          <div className="text-sm mt-1">Please log in to access your profile.</div>
        </div>
      );
    }

    // Get real partner ID for the authenticated user
    let partnerId: string | null = null;
    
    // First try to get partner by user ID
    partnerId = await getPartnerByUserId(user.id);
    
    // If not found, try by email as fallback
    if (!partnerId) {
      partnerId = await getPartnerByEmail(user.email);
    }
    
    // If still no partner record found, show appropriate message
    if (!partnerId) {
      return (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg">
          <h3 className="text-sm font-medium">Partner Registration Required</h3>
          <div className="text-sm mt-1">
            You need to be registered as a partner to manage your profile.
            <a href="/partner-registration" className="underline font-medium ml-1">Apply to become a partner</a>
          </div>
        </div>
      );
    }

    // Mock partner profile data - replace with real data fetching
    const partnerProfile = {
      id: partnerId,
      firstName: user.name.split(' ')[0] || 'John',
      lastName: user.name.split(' ')[1] || 'Doe',
      email: user.email,
      phone: '+1 (555) 123-4567',
      address: '123 Main St, Anytown, ST 12345',
      joinDate: '2024-01-15',
      partnerLevel: 'Gold Partner',
      status: 'Active',
      commissionRate: 15,
      referralCode: 'PARTNER2024',
      totalReferrals: 24,
      bio: 'Passionate about helping businesses grow through innovative solutions and strategic partnerships.'
    };

    return (
      <div className="space-y-6">
        {/* Profile Header */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
                  <User className="h-8 w-8 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-2xl">{partnerProfile.firstName} {partnerProfile.lastName}</CardTitle>
                  <CardDescription className="text-base flex items-center gap-2">
                    <Badge variant="secondary" className="bg-green-100 text-green-800">
                      {partnerProfile.status}
                    </Badge>
                    <Badge variant="outline">{partnerProfile.partnerLevel}</Badge>
                  </CardDescription>
                </div>
              </div>
              <Button variant="outline" size="sm">
                <Edit className="h-4 w-4 mr-2" />
                Edit Profile
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-gray-500" />
                <span>Joined {new Date(partnerProfile.joinDate).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Shield className="h-4 w-4 text-gray-500" />
                <span>{partnerProfile.commissionRate}% Commission Rate</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-gray-500" />
                <span>{partnerProfile.totalReferrals} Total Referrals</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Personal Information */}
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
              <CardDescription>Your basic profile information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="firstName">First Name</Label>
                  <Input id="firstName" value={partnerProfile.firstName} readOnly />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input id="lastName" value={partnerProfile.lastName} readOnly />
                </div>
              </div>
              <div>
                <Label htmlFor="email">Email Address</Label>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-gray-500" />
                  <Input id="email" value={partnerProfile.email} readOnly />
                </div>
              </div>
              <div>
                <Label htmlFor="phone">Phone Number</Label>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-gray-500" />
                  <Input id="phone" value={partnerProfile.phone} readOnly />
                </div>
              </div>
              <div>
                <Label htmlFor="address">Address</Label>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-gray-500" />
                  <Input id="address" value={partnerProfile.address} readOnly />
                </div>
              </div>
              <div>
                <Label htmlFor="bio">Bio</Label>
                <Textarea id="bio" value={partnerProfile.bio} readOnly rows={3} />
              </div>
            </CardContent>
          </Card>

          {/* Partner Details */}
          <Card>
            <CardHeader>
              <CardTitle>Partner Details</CardTitle>
              <CardDescription>Your partnership status and settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Partner Level</Label>
                <div className="mt-1">
                  <Badge variant="outline" className="text-base px-3 py-1">
                    {partnerProfile.partnerLevel}
                  </Badge>
                </div>
              </div>
              <div>
                <Label>Referral Code</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input value={partnerProfile.referralCode} readOnly />
                  <Button size="sm" variant="outline">
                    Copy
                  </Button>
                </div>
              </div>
              <div>
                <Label>Commission Rate</Label>
                <div className="mt-1 text-2xl font-bold text-green-600">
                  {partnerProfile.commissionRate}%
                </div>
              </div>
              <div>
                <Label>Account Status</Label>
                <div className="mt-1">
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    {partnerProfile.status}
                  </Badge>
                </div>
              </div>
              <div>
                <Label>Partnership Since</Label>
                <div className="mt-1 text-sm text-gray-600">
                  {new Date(partnerProfile.joinDate).toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Account Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Account Settings</CardTitle>
            <CardDescription>Manage your account preferences and security settings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <div className="font-medium">Email Notifications</div>
                  <div className="text-sm text-gray-500">Receive email updates about commissions and referrals</div>
                </div>
                <Button variant="outline" size="sm">Configure</Button>
              </div>
              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <div className="font-medium">Password</div>
                  <div className="text-sm text-gray-500">Last updated 30 days ago</div>
                </div>
                <Button variant="outline" size="sm">Change</Button>
              </div>
              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <div className="font-medium">Two-Factor Authentication</div>
                  <div className="text-sm text-gray-500">Add an extra layer of security to your account</div>
                </div>
                <Button variant="outline" size="sm">Enable</Button>
              </div>
              <div className="flex items-center justify-between py-3">
                <div>
                  <div className="font-medium">Data Export</div>
                  <div className="text-sm text-gray-500">Download your partner data and commission history</div>
                </div>
                <Button variant="outline" size="sm">Export</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Coming Soon Notice */}
        <Card>
          <CardHeader>
            <CardTitle>Profile Editing Coming Soon</CardTitle>
            <CardDescription>
              We're working on making your profile fully editable with real-time updates and enhanced customization options.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-gray-600">
              Features in development:
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li>Real-time profile editing</li>
                <li>Profile picture upload</li>
                <li>Custom marketing materials</li>
                <li>Social media integration</li>
                <li>Enhanced security settings</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  } catch (error) {
    console.error('Error loading profile data:', error);
    return (
      <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
        <h3 className="text-sm font-medium">Error Loading Profile</h3>
        <div className="text-sm mt-1">Unable to load profile data. Please try again later.</div>
      </div>
    );
  }
}

export default function ProfilePage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Profile</h2>
        <p className="text-gray-600 mt-1">
          Manage your partner profile, account settings, and preferences.
        </p>
      </div>
      
      <Suspense 
        fallback={
          <div className="space-y-6">
            <div className="h-48 bg-gray-100 rounded-lg animate-pulse" />
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="h-64 bg-gray-100 rounded-lg animate-pulse" />
              <div className="h-64 bg-gray-100 rounded-lg animate-pulse" />
            </div>
            <div className="h-32 bg-gray-100 rounded-lg animate-pulse" />
          </div>
        }
      >
        <ProfileData />
      </Suspense>
    </div>
  );
}