'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  CheckCircle, 
  Clock, 
  XCircle, 
  Store, 
  FileText, 
  CreditCard,
  Building2,
  Mail,
  Phone,
  MapPin
} from 'lucide-react';

// Import server actions (proper client/server boundary)
import { 
  createVendorApplication,
  reviewApplication,
  getApplications,
  manageTiers,
  updateCommissionStructure,
  getVendorMetrics,
  type VendorApplicationData,
  type VendorProfile
} from './actions';

// Reuse existing partner types from the system
import type { PartnerApplication, PartnerLevel } from '@/lib/partner-management';

interface VendorOnboardingManagementProps {
  mode?: 'application' | 'review' | 'management';
  tenantId: string;
  currentUserId?: string;
  onApplicationSubmitted?: (applicationId: string) => void;
  onApplicationReviewed?: (vendorId?: string) => void;
  onTierCreated?: (tierId: string) => void;
  className?: string;
}

export function VendorOnboardingManagement({
  mode = 'application',
  tenantId,
  currentUserId,
  onApplicationSubmitted,
  onApplicationReviewed,
  onTierCreated,
  className = ''
}: VendorOnboardingManagementProps) {
  const [activeTab, setActiveTab] = useState<string>(mode);
  const [loading, setLoading] = useState(false);
  const [applications, setApplications] = useState<(PartnerApplication & { vendorMetadata?: any })[]>([]);
  const [vendors, setVendors] = useState<VendorProfile[]>([]);
  const [tiers, setTiers] = useState<PartnerLevel[]>([]);
  const [selectedApplication, setSelectedApplication] = useState<string | null>(null);

  // Application form state
  const [applicationForm, setApplicationForm] = useState<VendorApplicationData>({
    email: '',
    first_name: '',
    last_name: '',
    phone: '',
    businessName: '',
    company_website: '',
    businessType: 'company',
    businessAddress: '',
    businessRegistrationNumber: '',
    taxId: '',
    experience_level: '',
    marketing_experience: '',
    why_partner: '',
    referral_methods: ''
  });

  // Tier form state  
  const [tierForm, setTierForm] = useState({
    name: '',
    level_code: '',
    description: '',
    default_commission_rate: 0.1,
    min_commission_rate: 0.05,
    max_commission_rate: 0.25,
    benefits: [] as string[],
    requirements: [] as string[],
    level_order: 1,
    max_referral_depth: 3
  });

  useEffect(() => {
    if (mode === 'review' || mode === 'management') {
      loadApplications();
      loadTiers();
    }
  }, [mode, tenantId]);

  const loadApplications = async () => {
    try {
      const result = await getApplications({});
      setApplications(result.applications);
    } catch (error) {
      console.error('Error loading applications:', error);
    }
  };

  const loadTiers = async () => {
    try {
      const result = await manageTiers({ action: 'list' });
      if (result.success && result.tiers) {
        setTiers(result.tiers);
      }
    } catch (error) {
      console.error('Error loading tiers:', error);
    }
  };

  const handleApplicationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await createVendorApplication(applicationForm);
      
      if (result.success && result.applicationId) {
        onApplicationSubmitted?.(result.applicationId);
        // Reset form
        setApplicationForm({
          email: '',
          first_name: '',
          last_name: '',
          phone: '',
          businessName: '',
          company_website: '',
          businessType: 'company',
          businessAddress: '',
          businessRegistrationNumber: '',
          taxId: '',
          experience_level: '',
          marketing_experience: '',
          why_partner: '',
          referral_methods: ''
        });
        alert(result.message);
      } else {
        alert(result.message);
      }
    } catch (error) {
      console.error('Error submitting application:', error);
      alert('Failed to submit application. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleApplicationReview = async (applicationId: string, status: 'approved' | 'rejected', notes?: string) => {
    if (!currentUserId) return;

    setLoading(true);
    try {
      const result = await reviewApplication({
        applicationId,
        reviewData: {
          status,
          reviewNotes: notes,
          assignedTier: status === 'approved' ? 'basic' : undefined,
          commissionRate: status === 'approved' ? 0.1 : undefined,
          reviewerId: currentUserId
        }
      });

      if (result.success) {
        onApplicationReviewed?.(result.vendorId);
        await loadApplications(); // Refresh list
        alert(result.message);
      } else {
        alert(result.message);
      }
    } catch (error) {
      console.error('Error reviewing application:', error);
      alert('Failed to review application. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleTierCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserId) return;

    setLoading(true);
    try {
      const result = await manageTiers({
        action: 'create',
        tierData: {
          ...tierForm,
          createdBy: currentUserId
        }
      });

      if (result.success && result.tierId) {
        onTierCreated?.(result.tierId);
        await loadTiers(); // Refresh list
        // Reset form
        setTierForm({
          name: '',
          level_code: '',
          description: '',
          default_commission_rate: 0.1,
          min_commission_rate: 0.05,
          max_commission_rate: 0.25,
          benefits: [],
          requirements: [],
          level_order: 1,
          max_referral_depth: 3
        });
        alert(result.message);
      } else {
        alert(result.message);
      }
    } catch (error) {
      console.error('Error creating tier:', error);
      alert('Failed to create tier. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'pending': return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'rejected': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      approved: 'success',
      pending: 'warning', 
      rejected: 'destructive',
      default: 'secondary'
    };
    
    return (
      <Badge variant={variants[status] || variants.default}>
        {getStatusIcon(status)}
        <span className="ml-1 capitalize">{status}</span>
      </Badge>
    );
  };

  return (
    <div className={`vendor-onboarding-management ${className}`}>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="application">
            <Store className="h-4 w-4 mr-2" />
            Apply as Vendor
          </TabsTrigger>
          <TabsTrigger value="review">
            <FileText className="h-4 w-4 mr-2" />
            Review Applications
          </TabsTrigger>
          <TabsTrigger value="management">
            <Building2 className="h-4 w-4 mr-2" />
            Manage Tiers
          </TabsTrigger>
        </TabsList>

        <TabsContent value="application" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Vendor Application</CardTitle>
              <CardDescription>
                Apply to become a vendor on our platform. We'll review your application within 2-3 business days.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleApplicationSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="first_name">First Name *</Label>
                    <Input
                      id="first_name"
                      value={applicationForm.first_name}
                      onChange={(e) => setApplicationForm(prev => ({ ...prev, first_name: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="last_name">Last Name *</Label>
                    <Input
                      id="last_name"
                      value={applicationForm.last_name}
                      onChange={(e) => setApplicationForm(prev => ({ ...prev, last_name: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={applicationForm.email}
                    onChange={(e) => setApplicationForm(prev => ({ ...prev, email: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={applicationForm.phone}
                    onChange={(e) => setApplicationForm(prev => ({ ...prev, phone: e.target.value }))}
                  />
                </div>

                <div>
                  <Label htmlFor="businessName">Business Name *</Label>
                  <Input
                    id="businessName"
                    value={applicationForm.businessName}
                    onChange={(e) => setApplicationForm(prev => ({ ...prev, businessName: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="businessType">Business Type *</Label>
                  <Select
                    value={applicationForm.businessType}
                    onValueChange={(value: any) => setApplicationForm(prev => ({ ...prev, businessType: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="individual">Individual</SelectItem>
                      <SelectItem value="company">Company</SelectItem>
                      <SelectItem value="partnership">Partnership</SelectItem>
                      <SelectItem value="cooperative">Cooperative</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="businessAddress">Business Address *</Label>
                  <Textarea
                    id="businessAddress"
                    value={applicationForm.businessAddress}
                    onChange={(e) => setApplicationForm(prev => ({ ...prev, businessAddress: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="why_partner">Why do you want to become a vendor?</Label>
                  <Textarea
                    id="why_partner"
                    value={applicationForm.why_partner}
                    onChange={(e) => setApplicationForm(prev => ({ ...prev, why_partner: e.target.value }))}
                    placeholder="Tell us about your business goals and why you'd like to join our platform..."
                  />
                </div>

                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? 'Submitting...' : 'Submit Application'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="review" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Vendor Applications</CardTitle>
              <CardDescription>
                Review and approve vendor applications
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {applications.map((app) => (
                  <Card key={app.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div>
                          <h3 className="font-semibold">{app.company_name || `${app.first_name} ${app.last_name}`}</h3>
                          <div className="flex items-center space-x-4 text-sm text-gray-600">
                            <span className="flex items-center">
                              <Mail className="h-3 w-3 mr-1" />
                              {app.email}
                            </span>
                            {app.phone && (
                              <span className="flex items-center">
                                <Phone className="h-3 w-3 mr-1" />
                                {app.phone}
                              </span>
                            )}
                          </div>
                          {app.vendorMetadata?.businessAddress && (
                            <div className="flex items-center text-sm text-gray-600 mt-1">
                              <MapPin className="h-3 w-3 mr-1" />
                              {app.vendorMetadata.businessAddress}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {getStatusBadge(app.application_status)}
                        {app.application_status === 'pending' && currentUserId && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleApplicationReview(app.id, 'approved')}
                              disabled={loading}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleApplicationReview(app.id, 'rejected')}
                              disabled={loading}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
                {applications.length === 0 && (
                  <div className="text-center text-gray-500 py-8">
                    No vendor applications found
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="management" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Create Vendor Tier</CardTitle>
                <CardDescription>
                  Set up commission tiers for vendors
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleTierCreate} className="space-y-4">
                  <div>
                    <Label htmlFor="tier_name">Tier Name *</Label>
                    <Input
                      id="tier_name"
                      value={tierForm.name}
                      onChange={(e) => setTierForm(prev => ({ ...prev, name: e.target.value }))}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="tier_code">Tier Code *</Label>
                    <Input
                      id="tier_code"
                      value={tierForm.level_code}
                      onChange={(e) => setTierForm(prev => ({ ...prev, level_code: e.target.value }))}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="commission_rate">Commission Rate (%) *</Label>
                    <Input
                      id="commission_rate"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={tierForm.default_commission_rate * 100}
                      onChange={(e) => setTierForm(prev => ({ 
                        ...prev, 
                        default_commission_rate: parseFloat(e.target.value) / 100 
                      }))}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="tier_description">Description</Label>
                    <Textarea
                      id="tier_description"
                      value={tierForm.description}
                      onChange={(e) => setTierForm(prev => ({ ...prev, description: e.target.value }))}
                    />
                  </div>

                  <Button type="submit" disabled={loading}>
                    {loading ? 'Creating...' : 'Create Tier'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Existing Tiers</CardTitle>
                <CardDescription>
                  Current vendor tier structure
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {tiers.map((tier) => (
                    <Card key={tier.id} className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{tier.level_name}</h4>
                          <p className="text-sm text-gray-600">
                            {(tier.default_commission_rate * 100).toFixed(1)}% commission
                          </p>
                        </div>
                        <Badge variant="outline">
                          Order: {tier.level_order}
                        </Badge>
                      </div>
                    </Card>
                  ))}
                  {tiers.length === 0 && (
                    <div className="text-center text-gray-500 py-4">
                      No tiers created yet
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}