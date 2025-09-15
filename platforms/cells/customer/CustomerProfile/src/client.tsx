'use client';

import { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription 
} from '@/components/ui/dialog';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { 
  Users, 
  UserPlus,
  Edit,
  Save,
  X,
  Phone,
  MessageSquare,
  Mail,
  MapPin,
  Building,
  Shield,
  Star,
  Calendar,
  DollarSign,
  MessageCircle,
  FileText,
  Plus,
  Search,
  Filter,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  Globe,
  Heart,
  Flag
} from 'lucide-react';

// Types
interface CustomerProfile {
  id: string;
  tenantId: string;
  customerCode: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  preferredLanguage: 'en' | 'ha' | 'yo' | 'ig';
  primaryPhone: string;
  secondaryPhone?: string;
  email?: string;
  whatsappNumber?: string;
  preferredContactMethod: 'phone' | 'sms' | 'whatsapp' | 'email' | 'in_person';
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country: string;
    postalCode?: string;
    lga?: string;
  };
  customerType: 'individual' | 'business' | 'corporate' | 'government';
  industry?: string;
  companyName?: string;
  taxId?: string;
  status: 'active' | 'inactive' | 'suspended' | 'archived';
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  tags: string[];
  communicationPreferences: {
    marketingOptIn: boolean;
    smsOptIn: boolean;
    emailOptIn: boolean;
    whatsappOptIn: boolean;
    callOptIn: boolean;
    preferredTime: 'morning' | 'afternoon' | 'evening' | 'anytime';
    preferredDays: string[];
  };
  stats: {
    totalPurchases: number;
    lifetimeValue: number;
    lastPurchaseDate?: string;
    firstPurchaseDate?: string;
    loyaltyPoints: number;
    averageOrderValue: number;
    purchaseFrequency: number;
  };
  notes?: string;
  customFields: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

interface CustomerProfileCellProps {
  mode?: 'view' | 'create' | 'edit' | 'search';
  customerId?: string;
  customer?: CustomerProfile;
  tenantId: string;
  isOpen: boolean;
  onClose: () => void;
  onCustomerUpdate?: (customer: CustomerProfile) => void;
  onCustomerCreated?: (customer: CustomerProfile) => void;
}

// Nigerian states for dropdown
const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'Gombe', 'Imo',
  'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos',
  'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers',
  'Sokoto', 'Taraba', 'Yobe', 'Zamfara', 'FCT'
];

// Language options
const LANGUAGES = [
  { value: 'en', label: 'English', flag: '🇬🇧' },
  { value: 'ha', label: 'Hausa', flag: '🇳🇬' },
  { value: 'yo', label: 'Yoruba', flag: '🇳🇬' },
  { value: 'ig', label: 'Igbo', flag: '🇳🇬' }
];

// Customer tiers with Nigerian context
const CUSTOMER_TIERS = [
  { value: 'bronze', label: 'Bronze', color: 'bg-amber-100 text-amber-800' },
  { value: 'silver', label: 'Silver', color: 'bg-gray-100 text-gray-800' },
  { value: 'gold', label: 'Gold', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'platinum', label: 'Platinum', color: 'bg-purple-100 text-purple-800' }
];

export function CustomerProfileCell({
  mode = 'view',
  customerId,
  customer: initialCustomer,
  tenantId,
  isOpen,
  onClose,
  onCustomerUpdate,
  onCustomerCreated
}: CustomerProfileCellProps) {
  const [customer, setCustomer] = useState<CustomerProfile | null>(initialCustomer || null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('basic');
  const [editMode, setEditMode] = useState(mode === 'create' || mode === 'edit');
  
  // Form data for editing
  const [formData, setFormData] = useState<Partial<CustomerProfile>>({});

  // Initialize form data when customer changes
  useEffect(() => {
    if (customer) {
      setFormData({ ...customer });
    } else if (mode === 'create') {
      setFormData({
        preferredLanguage: 'en',
        customerType: 'individual',
        status: 'active',
        tier: 'bronze',
        tags: [],
        communicationPreferences: {
          marketingOptIn: true,
          smsOptIn: true,
          emailOptIn: true,
          whatsappOptIn: true,
          callOptIn: true,
          preferredTime: 'anytime',
          preferredDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
        },
        customFields: {}
      });
    }
  }, [customer, mode]);

  // Load customer data
  useEffect(() => {
    if (isOpen && customerId && mode !== 'create') {
      loadCustomer();
    }
  }, [isOpen, customerId, mode]);

  const loadCustomer = async () => {
    if (!customerId) return;
    
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/cells/customer/CustomerProfile?action=getCustomer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId,
          customerId,
          includeContacts: true,
          includeAddresses: true,
          includeNotes: true
        })
      });

      const result = await response.json();

      if (result.success && result.customer) {
        setCustomer(result.customer);
      } else {
        setError(result.message || 'Failed to load customer');
      }
    } catch (err) {
      console.error('Failed to load customer:', err);
      setError('Failed to load customer data');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const action = mode === 'create' ? 'createCustomer' : 'updateCustomer';
      const payload = mode === 'create' 
        ? { tenantId, customerData: formData }
        : { tenantId, customerId, updates: formData };

      const response = await fetch(`/api/cells/customer/CustomerProfile?action=${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (result.success) {
        if (mode === 'create') {
          onCustomerCreated?.(result.customer);
        } else {
          setCustomer(result.customer || { ...customer, ...formData });
          onCustomerUpdate?.(result.customer || { ...customer, ...formData });
        }
        setEditMode(false);
      } else {
        setError(result.message || 'Failed to save customer');
      }
    } catch (err) {
      console.error('Failed to save customer:', err);
      setError('Failed to save customer data');
    } finally {
      setSaving(false);
    }
  };

  const handleSendCommunication = async (type: string) => {
    if (!customer) return;

    try {
      const response = await fetch(`/api/cells/customer/CustomerProfile?action=sendCommunication`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId,
          customerId: customer.id,
          communicationType: type,
          message: `Hello ${customer.firstName}, thank you for being a valued customer!`,
          language: customer.preferredLanguage
        })
      });

      const result = await response.json();
      if (result.success) {
        // Show success message
      } else {
        setError(result.message || 'Failed to send communication');
      }
    } catch (err) {
      console.error('Failed to send communication:', err);
      setError('Failed to send communication');
    }
  };

  const formatPhone = (phone: string) => {
    // Format Nigerian phone numbers nicely
    if (phone?.startsWith('+234')) {
      return `+234 ${phone.slice(4, 7)} ${phone.slice(7, 10)} ${phone.slice(10)}`;
    }
    return phone;
  };

  const getLanguageDisplay = (code: string) => {
    const lang = LANGUAGES.find(l => l.value === code);
    return lang ? `${lang.flag} ${lang.label}` : code;
  };

  const getTierDisplay = (tier: string) => {
    const tierInfo = CUSTOMER_TIERS.find(t => t.value === tier);
    return tierInfo ? (
      <Badge className={tierInfo.color}>
        <Star className="h-3 w-3 mr-1" />
        {tierInfo.label}
      </Badge>
    ) : tier;
  };

  if (loading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-center p-8">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            Loading customer data...
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === 'create' ? (
              <>
                <UserPlus className="h-5 w-5" />
                Create New Customer
              </>
            ) : (
              <>
                <Users className="h-5 w-5" />
                {customer ? `${customer.firstName} ${customer.lastName}` : 'Customer Profile'}
                {customer && (
                  <Badge variant="outline" className="ml-2">
                    {customer.customerCode}
                  </Badge>
                )}
              </>
            )}
          </DialogTitle>
          
          {customer && (
            <DialogDescription className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {formatPhone(customer.primaryPhone)}
              </span>
              {customer.email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {customer.email}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Globe className="h-3 w-3" />
                {getLanguageDisplay(customer.preferredLanguage)}
              </span>
              {getTierDisplay(customer.tier)}
            </DialogDescription>
          )}
        </DialogHeader>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
            <div className="flex items-center">
              <AlertCircle className="h-4 w-4 text-red-400 mr-2" />
              <span className="text-red-800 text-sm">{error}</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {!editMode && mode !== 'create' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditMode(true)}
              >
                <Edit className="h-3 w-3 mr-1" />
                Edit
              </Button>
            )}
            
            {customer && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSendCommunication('sms')}
                  disabled={!customer.communicationPreferences.smsOptIn}
                >
                  <MessageSquare className="h-3 w-3 mr-1" />
                  SMS
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSendCommunication('whatsapp')}
                  disabled={!customer.communicationPreferences.whatsappOptIn}
                >
                  <MessageCircle className="h-3 w-3 mr-1" />
                  WhatsApp
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSendCommunication('email')}
                  disabled={!customer.email || !customer.communicationPreferences.emailOptIn}
                >
                  <Mail className="h-3 w-3 mr-1" />
                  Email
                </Button>
              </>
            )}
          </div>

          {editMode && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditMode(false);
                  setFormData(customer || {});
                }}
              >
                <X className="h-3 w-3 mr-1" />
                Cancel
              </Button>
              
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Save className="h-3 w-3 mr-1" />
                )}
                Save
              </Button>
            </div>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            <TabsTrigger value="contact">Contact</TabsTrigger>
            <TabsTrigger value="address">Address</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="stats">Statistics</TabsTrigger>
          </TabsList>

          {/* Basic Information Tab */}
          <TabsContent value="basic" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Personal Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="firstName">First Name *</Label>
                    <Input
                      id="firstName"
                      value={editMode ? formData.firstName || '' : customer?.firstName || ''}
                      onChange={(e) => editMode && setFormData({ ...formData, firstName: e.target.value })}
                      disabled={!editMode}
                      placeholder="Enter first name"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="lastName">Last Name *</Label>
                    <Input
                      id="lastName"
                      value={editMode ? formData.lastName || '' : customer?.lastName || ''}
                      onChange={(e) => editMode && setFormData({ ...formData, lastName: e.target.value })}
                      disabled={!editMode}
                      placeholder="Enter last name"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="middleName">Middle Name</Label>
                    <Input
                      id="middleName"
                      value={editMode ? formData.middleName || '' : customer?.middleName || ''}
                      onChange={(e) => editMode && setFormData({ ...formData, middleName: e.target.value })}
                      disabled={!editMode}
                      placeholder="Enter middle name"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="gender">Gender</Label>
                    <Select
                      value={editMode ? formData.gender || '' : customer?.gender || ''}
                      onValueChange={(value) => editMode && setFormData({ ...formData, gender: value as any })}
                      disabled={!editMode}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                        <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="dateOfBirth">Date of Birth</Label>
                    <Input
                      id="dateOfBirth"
                      type="date"
                      value={editMode ? formData.dateOfBirth || '' : customer?.dateOfBirth || ''}
                      onChange={(e) => editMode && setFormData({ ...formData, dateOfBirth: e.target.value })}
                      disabled={!editMode}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="preferredLanguage">Preferred Language</Label>
                    <Select
                      value={editMode ? formData.preferredLanguage || 'en' : customer?.preferredLanguage || 'en'}
                      onValueChange={(value) => editMode && setFormData({ ...formData, preferredLanguage: value as any })}
                      disabled={!editMode}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LANGUAGES.map((lang) => (
                          <SelectItem key={lang.value} value={lang.value}>
                            {lang.flag} {lang.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Business Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="customerType">Customer Type</Label>
                    <Select
                      value={editMode ? formData.customerType || 'individual' : customer?.customerType || 'individual'}
                      onValueChange={(value) => editMode && setFormData({ ...formData, customerType: value as any })}
                      disabled={!editMode}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="individual">Individual</SelectItem>
                        <SelectItem value="business">Business</SelectItem>
                        <SelectItem value="corporate">Corporate</SelectItem>
                        <SelectItem value="government">Government</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="industry">Industry</Label>
                    <Input
                      id="industry"
                      value={editMode ? formData.industry || '' : customer?.industry || ''}
                      onChange={(e) => editMode && setFormData({ ...formData, industry: e.target.value })}
                      disabled={!editMode}
                      placeholder="e.g. Retail, Technology, Healthcare"
                    />
                  </div>
                </div>

                {(formData.customerType !== 'individual' || customer?.customerType !== 'individual') && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="companyName">Company Name</Label>
                      <Input
                        id="companyName"
                        value={editMode ? formData.companyName || '' : customer?.companyName || ''}
                        onChange={(e) => editMode && setFormData({ ...formData, companyName: e.target.value })}
                        disabled={!editMode}
                        placeholder="Enter company name"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="taxId">Tax ID / CAC Number</Label>
                      <Input
                        id="taxId"
                        value={editMode ? formData.taxId || '' : customer?.taxId || ''}
                        onChange={(e) => editMode && setFormData({ ...formData, taxId: e.target.value })}
                        disabled={!editMode}
                        placeholder="Enter tax ID or CAC number"
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Contact Information Tab */}
          <TabsContent value="contact" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Contact Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="primaryPhone">Primary Phone *</Label>
                    <Input
                      id="primaryPhone"
                      value={editMode ? formData.primaryPhone || '' : customer?.primaryPhone || ''}
                      onChange={(e) => editMode && setFormData({ ...formData, primaryPhone: e.target.value })}
                      disabled={!editMode}
                      placeholder="+234 801 234 5678"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="secondaryPhone">Secondary Phone</Label>
                    <Input
                      id="secondaryPhone"
                      value={editMode ? formData.secondaryPhone || '' : customer?.secondaryPhone || ''}
                      onChange={(e) => editMode && setFormData({ ...formData, secondaryPhone: e.target.value })}
                      disabled={!editMode}
                      placeholder="+234 802 345 6789"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={editMode ? formData.email || '' : customer?.email || ''}
                      onChange={(e) => editMode && setFormData({ ...formData, email: e.target.value })}
                      disabled={!editMode}
                      placeholder="customer@example.com"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="whatsappNumber">WhatsApp Number</Label>
                    <Input
                      id="whatsappNumber"
                      value={editMode ? formData.whatsappNumber || '' : customer?.whatsappNumber || ''}
                      onChange={(e) => editMode && setFormData({ ...formData, whatsappNumber: e.target.value })}
                      disabled={!editMode}
                      placeholder="+234 803 456 7890"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="preferredContactMethod">Preferred Contact Method</Label>
                  <Select
                    value={editMode ? formData.preferredContactMethod || 'phone' : customer?.preferredContactMethod || 'phone'}
                    onValueChange={(value) => editMode && setFormData({ ...formData, preferredContactMethod: value as any })}
                    disabled={!editMode}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="phone">📞 Phone Call</SelectItem>
                      <SelectItem value="sms">💬 SMS</SelectItem>
                      <SelectItem value="whatsapp">📱 WhatsApp</SelectItem>
                      <SelectItem value="email">📧 Email</SelectItem>
                      <SelectItem value="in_person">🤝 In Person</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Address Tab */}
          <TabsContent value="address" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Address Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="street">Street Address</Label>
                  <Textarea
                    id="street"
                    value={editMode ? formData.address?.street || '' : customer?.address?.street || ''}
                    onChange={(e) => editMode && setFormData({ 
                      ...formData, 
                      address: { ...formData.address, street: e.target.value }
                    })}
                    disabled={!editMode}
                    placeholder="Enter street address"
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={editMode ? formData.address?.city || '' : customer?.address?.city || ''}
                      onChange={(e) => editMode && setFormData({ 
                        ...formData, 
                        address: { ...formData.address, city: e.target.value }
                      })}
                      disabled={!editMode}
                      placeholder="Enter city"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="state">State</Label>
                    <Select
                      value={editMode ? formData.address?.state || '' : customer?.address?.state || ''}
                      onValueChange={(value) => editMode && setFormData({ 
                        ...formData, 
                        address: { ...formData.address, state: value }
                      })}
                      disabled={!editMode}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                      <SelectContent>
                        {NIGERIAN_STATES.map((state) => (
                          <SelectItem key={state} value={state}>
                            {state}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="lga">Local Government Area</Label>
                    <Input
                      id="lga"
                      value={editMode ? formData.address?.lga || '' : customer?.address?.lga || ''}
                      onChange={(e) => editMode && setFormData({ 
                        ...formData, 
                        address: { ...formData.address, lga: e.target.value }
                      })}
                      disabled={!editMode}
                      placeholder="Enter LGA"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="postalCode">Postal Code</Label>
                    <Input
                      id="postalCode"
                      value={editMode ? formData.address?.postalCode || '' : customer?.address?.postalCode || ''}
                      onChange={(e) => editMode && setFormData({ 
                        ...formData, 
                        address: { ...formData.address, postalCode: e.target.value }
                      })}
                      disabled={!editMode}
                      placeholder="Enter postal code"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="country">Country</Label>
                    <Input
                      id="country"
                      value={editMode ? formData.address?.country || 'Nigeria' : customer?.address?.country || 'Nigeria'}
                      onChange={(e) => editMode && setFormData({ 
                        ...formData, 
                        address: { ...formData.address, country: e.target.value }
                      })}
                      disabled={!editMode}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Preferences Tab */}
          <TabsContent value="preferences" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Communication Preferences</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="marketingOptIn">Marketing Communications</Label>
                    <Switch
                      id="marketingOptIn"
                      checked={editMode ? formData.communicationPreferences?.marketingOptIn || false : customer?.communicationPreferences.marketingOptIn || false}
                      onCheckedChange={(checked) => editMode && setFormData({
                        ...formData,
                        communicationPreferences: {
                          ...formData.communicationPreferences,
                          marketingOptIn: checked
                        }
                      })}
                      disabled={!editMode}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label htmlFor="smsOptIn">SMS Notifications</Label>
                    <Switch
                      id="smsOptIn"
                      checked={editMode ? formData.communicationPreferences?.smsOptIn || false : customer?.communicationPreferences.smsOptIn || false}
                      onCheckedChange={(checked) => editMode && setFormData({
                        ...formData,
                        communicationPreferences: {
                          ...formData.communicationPreferences,
                          smsOptIn: checked
                        }
                      })}
                      disabled={!editMode}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label htmlFor="emailOptIn">Email Notifications</Label>
                    <Switch
                      id="emailOptIn"
                      checked={editMode ? formData.communicationPreferences?.emailOptIn || false : customer?.communicationPreferences.emailOptIn || false}
                      onCheckedChange={(checked) => editMode && setFormData({
                        ...formData,
                        communicationPreferences: {
                          ...formData.communicationPreferences,
                          emailOptIn: checked
                        }
                      })}
                      disabled={!editMode}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label htmlFor="whatsappOptIn">WhatsApp Messages</Label>
                    <Switch
                      id="whatsappOptIn"
                      checked={editMode ? formData.communicationPreferences?.whatsappOptIn || false : customer?.communicationPreferences.whatsappOptIn || false}
                      onCheckedChange={(checked) => editMode && setFormData({
                        ...formData,
                        communicationPreferences: {
                          ...formData.communicationPreferences,
                          whatsappOptIn: checked
                        }
                      })}
                      disabled={!editMode}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Statistics Tab */}
          <TabsContent value="stats" className="space-y-4">
            {customer?.stats && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Total Purchases</p>
                        <p className="text-2xl font-bold">{customer.stats.totalPurchases}</p>
                      </div>
                      <ShoppingCart className="h-8 w-8 text-blue-500" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Lifetime Value</p>
                        <p className="text-2xl font-bold">₦{customer.stats.lifetimeValue.toLocaleString()}</p>
                      </div>
                      <DollarSign className="h-8 w-8 text-green-500" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Loyalty Points</p>
                        <p className="text-2xl font-bold">{customer.stats.loyaltyPoints}</p>
                      </div>
                      <Star className="h-8 w-8 text-yellow-500" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}