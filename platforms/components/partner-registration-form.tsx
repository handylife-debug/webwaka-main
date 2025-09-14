'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyName: string;
  companyWebsite: string;
  experienceLevel: string;
  marketingExperience: string;
  whyPartner: string;
  referralMethods: string;
  sponsorEmail: string;
}

const experienceLevels = [
  { value: 'beginner', label: 'Beginner (0-1 years)' },
  { value: 'intermediate', label: 'Intermediate (2-5 years)' },
  { value: 'experienced', label: 'Experienced (5+ years)' },
  { value: 'expert', label: 'Expert (10+ years)' },
];

export function PartnerRegistrationForm() {
  const [formData, setFormData] = useState<FormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    companyName: '',
    companyWebsite: '',
    experienceLevel: '',
    marketingExperience: '',
    whyPartner: '',
    referralMethods: '',
    sponsorEmail: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const validateForm = (): boolean => {
    const required = ['firstName', 'lastName', 'email'];
    for (const field of required) {
      if (!formData[field as keyof FormData].trim()) {
        setErrorMessage(`${field} is required`);
        return false;
      }
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setErrorMessage('Please enter a valid email address');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      setSubmitStatus('error');
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus('idle');
    setErrorMessage('');

    try {
      const response = await fetch('/api/partner-registration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          first_name: formData.firstName,
          last_name: formData.lastName,
          email: formData.email,
          phone: formData.phone || undefined,
          company_name: formData.companyName || undefined,
          company_website: formData.companyWebsite || undefined,
          experience_level: formData.experienceLevel || undefined,
          marketing_experience: formData.marketingExperience || undefined,
          why_partner: formData.whyPartner || undefined,
          referral_methods: formData.referralMethods || undefined,
          sponsor_email: formData.sponsorEmail || undefined,
        }),
      });

      if (response.ok) {
        setSubmitStatus('success');
        // Reset form
        setFormData({
          firstName: '',
          lastName: '',
          email: '',
          phone: '',
          companyName: '',
          companyWebsite: '',
          experienceLevel: '',
          marketingExperience: '',
          whyPartner: '',
          referralMethods: '',
          sponsorEmail: '',
        });
      } else {
        const errorData = await response.json();
        setErrorMessage(errorData.error || 'Failed to submit application');
        setSubmitStatus('error');
      }
    } catch (error) {
      setErrorMessage('Network error. Please try again.');
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitStatus === 'success') {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="h-6 w-6 text-green-500" />
            <CardTitle className="text-green-700">Application Submitted!</CardTitle>
          </div>
          <CardDescription>
            Thank you for your interest in our partner program. We've received your application and will review it shortly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              You should receive a confirmation email shortly. Our team will review your application and get back to you within 2-3 business days.
            </p>
            <Button 
              onClick={() => setSubmitStatus('idle')} 
              variant="outline"
              className="w-full"
            >
              Submit Another Application
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {submitStatus === 'error' && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {/* Personal Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Personal Information</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name *</Label>
            <Input
              id="firstName"
              value={formData.firstName}
              onChange={(e) => handleInputChange('firstName', e.target.value)}
              placeholder="Enter your first name"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name *</Label>
            <Input
              id="lastName"
              value={formData.lastName}
              onChange={(e) => handleInputChange('lastName', e.target.value)}
              placeholder="Enter your last name"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              placeholder="your.email@example.com"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => handleInputChange('phone', e.target.value)}
              placeholder="+1 (555) 123-4567"
            />
          </div>
        </div>
      </div>

      {/* Company Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Company Information</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="companyName">Company Name</Label>
            <Input
              id="companyName"
              value={formData.companyName}
              onChange={(e) => handleInputChange('companyName', e.target.value)}
              placeholder="Your company name"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="companyWebsite">Company Website</Label>
            <Input
              id="companyWebsite"
              type="url"
              value={formData.companyWebsite}
              onChange={(e) => handleInputChange('companyWebsite', e.target.value)}
              placeholder="https://yourcompany.com"
            />
          </div>
        </div>
      </div>

      {/* Experience & Background */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Experience & Background</h3>
        
        <div className="space-y-2">
          <Label htmlFor="experienceLevel">Marketing/Sales Experience Level</Label>
          <Select 
            value={formData.experienceLevel} 
            onValueChange={(value) => handleInputChange('experienceLevel', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select your experience level" />
            </SelectTrigger>
            <SelectContent>
              {experienceLevels.map((level) => (
                <SelectItem key={level.value} value={level.value}>
                  {level.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="marketingExperience">Previous Marketing Experience</Label>
          <Textarea
            id="marketingExperience"
            value={formData.marketingExperience}
            onChange={(e) => handleInputChange('marketingExperience', e.target.value)}
            placeholder="Tell us about your previous marketing or sales experience..."
            rows={3}
          />
        </div>
      </div>

      {/* Partnership Interest */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Partnership Interest</h3>
        
        <div className="space-y-2">
          <Label htmlFor="whyPartner">Why do you want to become a partner?</Label>
          <Textarea
            id="whyPartner"
            value={formData.whyPartner}
            onChange={(e) => handleInputChange('whyPartner', e.target.value)}
            placeholder="Share your motivation for joining our partner program..."
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="referralMethods">How do you plan to refer customers?</Label>
          <Textarea
            id="referralMethods"
            value={formData.referralMethods}
            onChange={(e) => handleInputChange('referralMethods', e.target.value)}
            placeholder="Describe your marketing strategy (social media, email, website, etc.)..."
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="sponsorEmail">Sponsor Email (Optional)</Label>
          <Input
            id="sponsorEmail"
            type="email"
            value={formData.sponsorEmail}
            onChange={(e) => handleInputChange('sponsorEmail', e.target.value)}
            placeholder="If you were referred by an existing partner, enter their email"
          />
        </div>
      </div>

      {/* Submit Button */}
      <div className="pt-4">
        <Button 
          type="submit" 
          className="w-full" 
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Submitting Application...
            </>
          ) : (
            'Submit Partner Application'
          )}
        </Button>
      </div>

      <p className="text-xs text-gray-500 text-center">
        * Required fields. By submitting this form, you agree to our terms and conditions.
      </p>
    </form>
  );
}