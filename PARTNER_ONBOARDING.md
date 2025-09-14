# Partner Onboarding System Documentation

## Overview

The Partner Onboarding System provides a comprehensive workflow for potential partners to apply, and for SuperAdmins to review and approve/reject applications. The system includes public registration, database tracking, and an admin interface for management.

## Database Schema

### partner_applications Table

The `partner_applications` table stores all partner application data with proper tenant isolation.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | gen_random_uuid() | Primary key, auto-generated UUID |
| `tenant_id` | uuid | NO | - | Tenant isolation identifier |
| `email` | varchar | NO | - | Applicant's email address (unique per tenant) |
| `first_name` | varchar | NO | - | Applicant's first name |
| `last_name` | varchar | NO | - | Applicant's last name |
| `phone` | varchar | YES | - | Optional phone number |
| `company_name` | varchar | YES | - | Optional company name |
| `company_website` | varchar | YES | - | Optional company website |
| `experience_level` | varchar | YES | - | Marketing experience level (beginner, intermediate, advanced) |
| `marketing_experience` | text | YES | - | Detailed marketing experience description |
| `why_partner` | text | YES | - | Why they want to become a partner |
| `referral_methods` | text | YES | - | How they plan to refer customers |
| `sponsor_email` | varchar | YES | - | Optional sponsor email |
| `sponsor_id` | uuid | YES | - | Optional sponsor user ID |
| `requested_partner_level_id` | uuid | YES | - | Requested partner level |
| `application_status` | varchar | YES | 'pending' | Current status (pending, approved, rejected, withdrawn) |
| `application_date` | date | YES | CURRENT_DATE | Date application was submitted |
| `reviewed_date` | date | YES | - | Date application was reviewed |
| `reviewed_by` | uuid | YES | - | ID of admin who reviewed |
| `approval_notes` | text | YES | - | Notes added during approval |
| `rejection_reason` | text | YES | - | Reason for rejection |
| `metadata` | jsonb | YES | '{}' | Additional metadata |
| `created_at` | timestamptz | YES | CURRENT_TIMESTAMP | Record creation timestamp |
| `updated_at` | timestamptz | YES | CURRENT_TIMESTAMP | Record update timestamp |

### Key Constraints

- **Unique Email per Tenant**: Prevents duplicate applications from the same email within a tenant
- **Status Validation**: Application status must be valid (pending, approved, rejected, withdrawn)
- **Tenant Isolation**: All queries are scoped by tenant_id for multi-tenant security

## Partner Onboarding Workflow

### 1. Public Registration

**Endpoint**: `/partner-registration`
**Method**: Public access (no authentication required)

#### Process:
1. **Form Submission**: Potential partners fill out comprehensive application form
2. **Validation**: Client-side and server-side validation of required fields
3. **API Processing**: POST to `/api/partner-registration`
4. **Database Storage**: Application stored with `pending` status
5. **Confirmation**: User receives success message with application ID

#### Required Fields:
- First Name
- Last Name  
- Email Address

#### Optional Fields:
- Phone Number
- Company Name
- Company Website
- Experience Level
- Marketing Experience
- Partnership Motivation
- Referral Methods
- Sponsor Email

### 2. SuperAdmin Review Process

**Endpoint**: `/admin/partners` → Applications Tab
**Access**: SuperAdmin role required

#### Features:
- **Application Statistics**: View counts of pending, approved, rejected, and total applications
- **Application Table**: Sortable table showing all applications with key details
- **Detail View**: Complete application information in modal dialog
- **Bulk Actions**: Future capability for bulk approve/reject operations

### 3. Approval/Rejection Actions

#### Approval Process:
1. **Authentication**: Verify SuperAdmin role
2. **Status Check**: Ensure application is in `pending` status
3. **Update Database**: Set status to `approved`, add reviewer info and optional notes
4. **Activity Logging**: Log approval action for audit trail
5. **UI Refresh**: Revalidate admin panel to show updated status

#### Rejection Process:
1. **Authentication**: Verify SuperAdmin role
2. **Status Check**: Ensure application is in `pending` status
3. **Reason Required**: Rejection reason is mandatory
4. **Update Database**: Set status to `rejected`, add reviewer info and reason
5. **Activity Logging**: Log rejection action for audit trail
6. **UI Refresh**: Revalidate admin panel to show updated status

## API Endpoints

### POST /api/partner-registration

Submits a new partner application.

**Request Body:**
```json
{
  "first_name": "string",
  "last_name": "string", 
  "email": "string",
  "phone": "string?",
  "company_name": "string?",
  "company_website": "string?",
  "experience_level": "string?",
  "marketing_experience": "string?",
  "why_partner": "string?",
  "referral_methods": "string?",
  "sponsor_email": "string?"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Application submitted successfully!",
  "applicationId": "uuid"
}
```

**Error Responses:**
- `400`: Validation error (missing required fields, invalid email)
- `409`: Duplicate email address
- `500`: Internal server error

## Server Actions

### approvePartnerApplicationAction(applicationId, approvalNotes?)

Approves a pending partner application.

**Parameters:**
- `applicationId` (string): UUID of the application
- `approvalNotes` (string, optional): Notes about the approval

**Returns:**
```typescript
{ success: boolean; error?: string }
```

### rejectPartnerApplicationAction(applicationId, rejectionReason)

Rejects a pending partner application.

**Parameters:**
- `applicationId` (string): UUID of the application  
- `rejectionReason` (string): Required reason for rejection

**Returns:**
```typescript
{ success: boolean; error?: string }
```

## Security Considerations

### Authentication & Authorization
- **Public Registration**: No authentication required for applying
- **SuperAdmin Only**: All review and approval actions require SuperAdmin role
- **Server-Side Validation**: All actions validated server-side with role checks

### Data Protection
- **Tenant Isolation**: All data scoped by tenant_id
- **Email Validation**: Proper email format validation
- **Input Sanitization**: All text inputs trimmed and sanitized
- **SQL Injection Prevention**: Parameterized queries through Drizzle ORM

### Audit Trail
- **Activity Logging**: All approval/rejection actions logged
- **Reviewer Tracking**: Who reviewed each application is recorded
- **Status History**: Full status change tracking with timestamps

## File Structure

```
platforms/
├── app/
│   ├── partner-registration/
│   │   └── page.tsx                     # Public registration page
│   ├── (admin)/admin/partners/
│   │   ├── page.tsx                     # Admin dashboard with tabs
│   │   └── applications-actions.ts      # Server actions for approve/reject
│   └── api/partner-registration/
│       └── route.ts                     # API endpoint for submissions
├── components/
│   ├── partner-registration-form.tsx    # Registration form component
│   └── admin/
│       ├── partner-applications-table.tsx  # Admin table component
│       └── partner-applications-stats.tsx  # Statistics component
├── lib/
│   └── partner-management.ts            # Core business logic
└── shared/
    └── schema.ts                        # Database schema definitions
```

## Future Enhancements

### Planned Features
- **Email Notifications**: Automated emails for status changes
- **Application Analytics**: Advanced reporting and analytics
- **Bulk Operations**: Approve/reject multiple applications
- **Application Comments**: Thread-based communication
- **Partner Levels**: Automatic level assignment upon approval
- **API Integration**: Webhook support for external integrations

### Performance Optimizations
- **Database Indexes**: Add indexes for common query patterns
- **Pagination**: Large application lists pagination
- **Caching**: Redis caching for frequently accessed data
- **Background Jobs**: Async processing for heavy operations

## Testing

The system has been thoroughly tested with:

### End-to-End Testing
1. ✅ **Registration Form**: Successfully submits applications
2. ✅ **Database Persistence**: Applications stored correctly with proper tenant isolation
3. ✅ **Admin Panel**: Applications display correctly with status tracking
4. ✅ **Approval Process**: Status changes to `approved` with notes
5. ✅ **Rejection Process**: Status changes to `rejected` with reason
6. ✅ **Activity Logging**: All actions properly logged for audit trail

### Security Testing
1. ✅ **Role-Based Access**: SuperAdmin-only access enforced
2. ✅ **Tenant Isolation**: Data properly scoped by tenant
3. ✅ **Input Validation**: All inputs validated and sanitized
4. ✅ **Authentication**: Proper authentication checks in place

## Support

For technical support or questions about the Partner Onboarding System:

1. **Code Issues**: Check the implementation files listed in File Structure
2. **Database Issues**: Verify schema matches documentation
3. **Authentication Issues**: Check SuperAdmin role assignment
4. **Performance Issues**: Review database indexes and query patterns

---

*Last Updated: September 14, 2025*
*Version: 1.0.0*