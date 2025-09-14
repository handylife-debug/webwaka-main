'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  CheckCircle, 
  XCircle, 
  MoreHorizontal, 
  Eye,
  Calendar,
  Mail,
  Building,
  User,
  Loader2
} from 'lucide-react';
import { PartnerApplication } from '@/lib/partner-management';
import { approvePartnerApplicationAction, rejectPartnerApplicationAction } from '@/app/(admin)/admin/partners/applications-actions';

interface PartnerApplicationsTableProps {
  applications: PartnerApplication[];
}

function ApplicationStatusBadge({ status }: { status: string }) {
  const statusConfig = {
    pending: { color: 'bg-yellow-100 text-yellow-800', label: 'Pending' },
    approved: { color: 'bg-green-100 text-green-800', label: 'Approved' },
    rejected: { color: 'bg-red-100 text-red-800', label: 'Rejected' },
    withdrawn: { color: 'bg-gray-100 text-gray-800', label: 'Withdrawn' },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;

  return (
    <Badge variant="secondary" className={config.color}>
      {config.label}
    </Badge>
  );
}

function ApplicationDetailsDialog({ application }: { application: PartnerApplication }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Eye className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Application Details</DialogTitle>
          <DialogDescription>
            Review the complete partner application information
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Personal Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Personal Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-gray-600">Name</Label>
                <p className="text-sm">{application.first_name} {application.last_name}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-600">Email</Label>
                <p className="text-sm">{application.email}</p>
              </div>
              {application.phone && (
                <div>
                  <Label className="text-sm font-medium text-gray-600">Phone</Label>
                  <p className="text-sm">{application.phone}</p>
                </div>
              )}
            </div>
          </div>

          {/* Company Information */}
          {(application.company_name || application.company_website) && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Company Information</h3>
              <div className="grid grid-cols-2 gap-4">
                {application.company_name && (
                  <div>
                    <Label className="text-sm font-medium text-gray-600">Company</Label>
                    <p className="text-sm">{application.company_name}</p>
                  </div>
                )}
                {application.company_website && (
                  <div>
                    <Label className="text-sm font-medium text-gray-600">Website</Label>
                    <p className="text-sm">{application.company_website}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Experience & Background */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Experience & Background</h3>
            {application.experience_level && (
              <div>
                <Label className="text-sm font-medium text-gray-600">Experience Level</Label>
                <p className="text-sm capitalize">{application.experience_level}</p>
              </div>
            )}
            {application.marketing_experience && (
              <div>
                <Label className="text-sm font-medium text-gray-600">Marketing Experience</Label>
                <p className="text-sm whitespace-pre-wrap">{application.marketing_experience}</p>
              </div>
            )}
          </div>

          {/* Partnership Interest */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Partnership Interest</h3>
            {application.why_partner && (
              <div>
                <Label className="text-sm font-medium text-gray-600">Why Partner?</Label>
                <p className="text-sm whitespace-pre-wrap">{application.why_partner}</p>
              </div>
            )}
            {application.referral_methods && (
              <div>
                <Label className="text-sm font-medium text-gray-600">Referral Methods</Label>
                <p className="text-sm whitespace-pre-wrap">{application.referral_methods}</p>
              </div>
            )}
            {application.sponsor_email && (
              <div>
                <Label className="text-sm font-medium text-gray-600">Sponsor Email</Label>
                <p className="text-sm">{application.sponsor_email}</p>
              </div>
            )}
          </div>

          {/* Application Status */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Application Status</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-gray-600">Status</Label>
                <div className="mt-1">
                  <ApplicationStatusBadge status={application.application_status} />
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-600">Application Date</Label>
                <p className="text-sm">{new Date(application.application_date).toLocaleDateString()}</p>
              </div>
              {application.reviewed_date && (
                <div>
                  <Label className="text-sm font-medium text-gray-600">Reviewed Date</Label>
                  <p className="text-sm">{new Date(application.reviewed_date).toLocaleDateString()}</p>
                </div>
              )}
            </div>
            
            {application.approval_notes && (
              <div>
                <Label className="text-sm font-medium text-gray-600">Approval Notes</Label>
                <p className="text-sm whitespace-pre-wrap">{application.approval_notes}</p>
              </div>
            )}
            
            {application.rejection_reason && (
              <div>
                <Label className="text-sm font-medium text-gray-600">Rejection Reason</Label>
                <p className="text-sm whitespace-pre-wrap">{application.rejection_reason}</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ApproveApplicationDialog({ application }: { application: PartnerApplication }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');

  const handleApprove = async () => {
    setIsLoading(true);
    try {
      const result = await approvePartnerApplicationAction(application.id, approvalNotes);
      if (result.success) {
        setIsOpen(false);
        setApprovalNotes('');
        // Show success message (you could add a toast here)
      } else {
        // Show error message (you could add a toast here)
        console.error('Failed to approve application:', result.error);
      }
    } catch (error) {
      console.error('Error approving application:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
          <CheckCircle className="mr-2 h-4 w-4" />
          Approve
        </DropdownMenuItem>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve Application</DialogTitle>
          <DialogDescription>
            Approve the partner application for {application.first_name} {application.last_name}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="approvalNotes">Approval Notes (Optional)</Label>
            <Textarea
              id="approvalNotes"
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              placeholder="Add any notes about the approval..."
              rows={3}
            />
          </div>
          
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleApprove} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Approving...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Approve Application
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RejectApplicationDialog({ application }: { application: PartnerApplication }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      return; // Require rejection reason
    }

    setIsLoading(true);
    try {
      const result = await rejectPartnerApplicationAction(application.id, rejectionReason);
      if (result.success) {
        setIsOpen(false);
        setRejectionReason('');
        // Show success message (you could add a toast here)
      } else {
        // Show error message (you could add a toast here)
        console.error('Failed to reject application:', result.error);
      }
    } catch (error) {
      console.error('Error rejecting application:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
          <XCircle className="mr-2 h-4 w-4" />
          Reject
        </DropdownMenuItem>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject Application</DialogTitle>
          <DialogDescription>
            Reject the partner application for {application.first_name} {application.last_name}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="rejectionReason">Rejection Reason *</Label>
            <Textarea
              id="rejectionReason"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Please provide a reason for rejection..."
              rows={3}
              required
            />
          </div>
          
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleReject} 
              disabled={isLoading || !rejectionReason.trim()}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Rejecting...
                </>
              ) : (
                <>
                  <XCircle className="mr-2 h-4 w-4" />
                  Reject Application
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PartnerApplicationsTable({ applications }: PartnerApplicationsTableProps) {
  if (!applications || applications.length === 0) {
    return (
      <div className="p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
          <User className="h-6 w-6 text-gray-400" />
        </div>
        <h3 className="mt-4 text-sm font-semibold text-gray-900">No applications</h3>
        <p className="mt-2 text-sm text-gray-500">
          No partner applications have been submitted yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Applicant</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Experience</TableHead>
            <TableHead>Applied</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[50px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {applications.map((application) => (
            <TableRow key={application.id}>
              <TableCell>
                <div className="space-y-1">
                  <div className="font-medium">
                    {application.first_name} {application.last_name}
                  </div>
                  <div className="text-sm text-gray-500 flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {application.email}
                  </div>
                </div>
              </TableCell>
              
              <TableCell>
                {application.company_name ? (
                  <div className="space-y-1">
                    <div className="font-medium flex items-center gap-1">
                      <Building className="h-3 w-3" />
                      {application.company_name}
                    </div>
                    {application.company_website && (
                      <div className="text-sm text-gray-500">
                        {application.company_website}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </TableCell>
              
              <TableCell>
                {application.experience_level ? (
                  <Badge variant="outline" className="capitalize">
                    {application.experience_level}
                  </Badge>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </TableCell>
              
              <TableCell>
                <div className="text-sm flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(application.application_date).toLocaleDateString()}
                </div>
              </TableCell>
              
              <TableCell>
                <ApplicationStatusBadge status={application.application_status} />
              </TableCell>
              
              <TableCell>
                <div className="flex items-center gap-2">
                  <ApplicationDetailsDialog application={application} />
                  
                  {application.application_status === 'pending' && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <ApproveApplicationDialog application={application} />
                        <RejectApplicationDialog application={application} />
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}