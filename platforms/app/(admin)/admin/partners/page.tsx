import { Suspense } from 'react';
import { 
  getAllPartnerLevels, 
  getPartnerLevelStats,
  getPendingPartnerApplications,
  getPartnerApplicationStats,
  initializePartnerTables 
} from '@/lib/partner-management';
import { PartnerLevelsTable } from '@/components/admin/partner-levels-table';
import { CreatePartnerLevelDialog } from '@/components/admin/create-partner-level-dialog';
import { PartnerApplicationsTable } from '@/components/admin/partner-applications-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Users, 
  TrendingUp, 
  Settings,
  Plus,
  Handshake,
  Target,
  Layers,
  FileText,
  Clock,
  CheckCircle,
  XCircle
} from 'lucide-react';

async function PartnerLevelsStats() {
  try {
    const stats = await getPartnerLevelStats();
    
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Partner Levels</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              Configured tier levels
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Levels</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.active}</div>
            <p className="text-xs text-muted-foreground">
              Available for partners
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inactive Levels</CardTitle>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.inactive}</div>
            <p className="text-xs text-muted-foreground">
              Temporarily disabled
            </p>
          </CardContent>
        </Card>
      </div>
    );
  } catch (error) {
    console.error('Error loading partner level stats:', error);
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
}

async function PartnerApplicationsStats() {
  try {
    const stats = await getPartnerApplicationStats();
    
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Applications</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              All applications received
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">
              Awaiting approval
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
            <p className="text-xs text-muted-foreground">
              Successfully approved
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rejected</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
            <p className="text-xs text-muted-foreground">
              Not approved
            </p>
          </CardContent>
        </Card>
      </div>
    );
  } catch (error) {
    console.error('Error loading partner application stats:', error);
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
}

async function PartnerApplicationsContent() {
  try {
    await initializePartnerTables();
    
    const pendingApplications = await getPendingPartnerApplications();
    
    return (
      <div className="space-y-6">
        <Suspense fallback={<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>}>
          <PartnerApplicationsStats />
        </Suspense>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Partner Applications
            </CardTitle>
            <CardDescription>
              Review and manage partner applications. Approve or reject applications to control who can join your partner program.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <PartnerApplicationsTable applications={pendingApplications} />
          </CardContent>
        </Card>
      </div>
    );
  } catch (error) {
    console.error('Error loading partner applications:', error);
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Partner Applications
            </CardTitle>
            <CardDescription>
              There was an error loading partner applications. Please try refreshing the page.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="text-center text-muted-foreground">
              <p>Unable to load partner applications at this time.</p>
              <p className="text-sm mt-2">If this persists, check the database connection.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}

async function PartnerLevelsContent() {
  try {
    // Initialize partner tables to ensure they exist
    await initializePartnerTables();
    
    const partnerLevels = await getAllPartnerLevels();
    
    return (
      <div className="space-y-6">
        <Suspense fallback={<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>}>
          <PartnerLevelsStats />
        </Suspense>
        
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Partner Tiers</h2>
            <p className="text-muted-foreground">
              Configure commission rates and referral depth for different partner levels
            </p>
          </div>
          <CreatePartnerLevelDialog>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create Partner Level
            </Button>
          </CreatePartnerLevelDialog>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Handshake className="h-5 w-5" />
              Partner Level Management
            </CardTitle>
            <CardDescription>
              Manage partner tiers, commission rates, and referral structures for your multi-level partnership program
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <PartnerLevelsTable partnerLevels={partnerLevels} />
          </CardContent>
        </Card>
      </div>
    );
  } catch (error) {
    console.error('Error loading partner levels:', error);
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Partner Tiers</h2>
            <p className="text-muted-foreground">
              Configure commission rates and referral depth for different partner levels
            </p>
          </div>
          <CreatePartnerLevelDialog>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create Partner Level
            </Button>
          </CreatePartnerLevelDialog>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Handshake className="h-5 w-5" />
              Partner Level Management
            </CardTitle>
            <CardDescription>
              There was an error loading partner levels. Please try refreshing the page.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="text-center text-muted-foreground">
              <p>Unable to load partner levels at this time.</p>
              <p className="text-sm mt-2">If this persists, check the database connection.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}

export default function PartnerManagementPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Partner Management</h1>
          <p className="text-muted-foreground">
            Manage your multi-level partnership program and referral tiers
          </p>
        </div>
        <Badge variant="secondary" className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          SuperAdmin
        </Badge>
      </div>
      
      <Tabs defaultValue="levels" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="levels" className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Partner Levels
          </TabsTrigger>
          <TabsTrigger value="applications" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Applications
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="levels">
          <Suspense 
            fallback={
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24" />)}
                </div>
                <Skeleton className="h-64 w-full" />
              </div>
            }
          >
            <PartnerLevelsContent />
          </Suspense>
        </TabsContent>
        
        <TabsContent value="applications">
          <Suspense 
            fallback={
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
                </div>
                <Skeleton className="h-64 w-full" />
              </div>
            }
          >
            <PartnerApplicationsContent />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}