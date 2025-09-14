# SuperAdmin Control Tower - User Guide

This guide explains how to use each module in the SuperAdmin Control Tower for managing your multi-tenant platform.

## Getting Started

### Accessing the Admin Dashboard

1. **Login Requirement**: Only SuperAdmins can access the admin control tower
2. **Navigation**: Visit `/admin` to access the main dashboard
3. **Main Menu**: Use the sidebar to navigate between different modules

### Dashboard Overview

The main admin dashboard provides:
- **System Statistics**: Overview of tenants, users, plans, and credentials
- **Quick Actions**: Common administrative tasks
- **Health Monitoring**: System status and alerts
- **Recent Activity**: Latest administrative actions

---

## Tenant Management Module

**Purpose**: Manage all tenant accounts (subdomains) on your platform.

### What You Can Do

- **View All Tenants**: See complete list of registered subdomains
- **Monitor Status**: Track tenant activity and subscription status
- **Update Plans**: Change tenant subscription plans
- **Manage Access**: Activate, suspend, or deactivate tenant accounts

### How to Use

1. **Navigate**: Click "Tenants" in the sidebar
2. **View Tenants**: Browse the tenant table with search and filters
3. **Tenant Details**: Click on any tenant to see detailed information
4. **Status Changes**: Use the actions menu to modify tenant status
5. **Plan Updates**: Assign different subscription plans to tenants

### Key Features

- **Real-time Status**: See which tenants are active, suspended, or inactive
- **Subscription Tracking**: Monitor which plan each tenant is using
- **Activity Monitoring**: Track when tenants were last active
- **Bulk Actions**: Manage multiple tenants simultaneously

---

## User Management Module

**Purpose**: Manage all users across your platform with email invitations and role assignments.

### What You Can Do

- **Invite New Users**: Send email invitations to join the platform
- **Assign Roles**: Set user permissions (SuperAdmin, Admin, User)
- **Monitor Activity**: Track user logins and actions
- **Manage Access**: Activate, deactivate, or remove user accounts

### How to Use

1. **Navigate**: Click "Users" in the sidebar
2. **Invite Users**: 
   - Click "Invite User" button
   - Enter email address and select role
   - Send invitation email automatically
3. **Manage Existing Users**:
   - View user list with roles and activity
   - Change user roles using the dropdown
   - Activate/deactivate accounts as needed
4. **Activity Monitoring**: Review user activity logs for security

### Key Features

- **Email Invitations**: Automated invitation system with secure links
- **Role-Based Access**: Three-tier permission system (SuperAdmin > Admin > User)
- **Activity Logging**: Complete audit trail of user actions
- **Status Management**: Control user access with activate/deactivate options

### User Roles Explained

- **SuperAdmin**: Full system access, can manage all modules
- **Admin**: Can manage tenants and users, limited system access
- **User**: Basic platform access, no administrative privileges

---

## Pricing & Plans Module

**Purpose**: Create and manage subscription plans with Nigerian Naira (NGN) pricing.

### What You Can Do

- **Create Plans**: Design subscription tiers (Free, Basic, Premium, etc.)
- **Set Pricing**: Configure prices in NGN with precise kobo amounts
- **Define Features**: Specify what's included in each plan
- **Set Limits**: Control usage limits (users, storage, API calls, etc.)
- **Manage Status**: Activate, deactivate, or archive plans

### How to Use

1. **Navigate**: Click "Plans" in the sidebar
2. **Create New Plan**:
   - Click "Create Plan" button
   - Enter plan name and description
   - Set price in NGN (system converts to kobo for precision)
   - Define billing interval (monthly, yearly)
   - Add features and set limits
   - Mark as popular if desired
3. **Manage Existing Plans**:
   - View all plans in the data table
   - Edit plan details and pricing
   - Change plan status (active/inactive/archived)
   - Monitor revenue potential

### Key Features

- **NGN Currency**: Native support for Nigerian Naira with ₦ symbol
- **Feature Configuration**: Flexible feature inclusion/exclusion system
- **Usage Limits**: Set precise limits for users, storage, API calls, etc.
- **Status Control**: Professional plan lifecycle management
- **Revenue Tracking**: Monitor potential monthly revenue from active plans

### Plan Configuration

- **Basic Info**: Name, description, pricing, billing interval
- **Features**: Define what's included (with optional limits per feature)
- **System Limits**: Set overall usage constraints
- **Trial Periods**: Optional free trial days
- **Popular Flag**: Highlight recommended plans

---

## Credentials Management Module

**Purpose**: Securely manage API keys for third-party services using Replit's encrypted Secrets.

### What You Can Do

- **Monitor Status**: See which API credentials are configured
- **View Setup Guide**: Get step-by-step instructions for adding secrets
- **Validate Format**: Ensure API keys are properly formatted
- **Track Configuration**: Monitor which services are ready to use

### How to Use

1. **Navigate**: Click "Credentials" in the sidebar
2. **Check Status**: Review which credentials are configured vs missing
3. **Add Credentials**: Follow the setup guide to add secrets via Replit:
   - Open Replit Secrets panel
   - Add each required secret key exactly as shown
   - Use the provided key names (case-sensitive)
   - Restart application after adding secrets
4. **Verify Setup**: Refresh status to confirm credentials are detected

### Required Credentials

**Paystack (Payment Processing)**:
- `PAYSTACK_PUBLIC_KEY` - Public key starting with "pk_"
- `PAYSTACK_SECRET_KEY` - Secret key starting with "sk_"

**BetaSMS (SMS Services)**:
- `BETASMS_USERNAME` - Your BetaSMS account username
- `BETASMS_PASSWORD` - Your BetaSMS account password

**VerifyMe (Identity Verification)**:
- `VERIFYME_API_KEY` - API key for verification services
- `VERIFYME_PUBLIC_KEY` - Public key for verification

### Security Features

- **Encrypted Storage**: All credentials stored using Replit's secure system
- **No Database Storage**: API keys never stored in your application database
- **Server-Side Only**: Credentials only accessible on the server
- **Format Validation**: Automatic validation of API key formats
- **Activity Logging**: All credential management actions are tracked

### Getting API Keys

**Paystack**: Visit dashboard.paystack.com → Settings → API Keys
**BetaSMS**: Visit betasms.com → Dashboard → API Settings  
**VerifyMe**: Visit verifyme.ng → Account → API Keys

---

## Security & Best Practices

### Access Control

- Only SuperAdmins can access the Control Tower
- All actions are logged for audit purposes
- Session-based authentication with automatic timeouts
- Role-based permissions strictly enforced

### Data Protection

- Sensitive data (API keys) stored in encrypted Replit Secrets
- No credentials stored in database or logs
- Secure server-side validation for all operations
- Activity tracking for compliance and security

### Operational Guidelines

1. **Regular Monitoring**: Check system status and logs regularly
2. **User Management**: Review user roles and activity monthly
3. **Plan Updates**: Keep subscription plans current with market needs
4. **Credential Rotation**: Update API keys periodically for security
5. **Backup Procedures**: Ensure critical data is backed up

---

## Getting Help

### Common Issues

- **Access Denied**: Verify SuperAdmin role assignment
- **Missing Features**: Check if credentials are properly configured
- **Email Issues**: Verify Replit Mail integration is active
- **Database Errors**: Confirm PostgreSQL connection is working

### Support Resources

- **Activity Logs**: Review system logs for error details
- **Health Dashboard**: Monitor system status and metrics
- **Documentation**: Reference this guide for operational procedures

### Emergency Procedures

1. **System Issues**: Check workflow logs for errors
2. **Security Concerns**: Review user activity logs immediately
3. **Service Outages**: Verify third-party service status
4. **Data Issues**: Contact system administrator for database support

Remember: The SuperAdmin Control Tower is a powerful system that manages your entire platform. Always follow security best practices and review changes carefully before implementation.