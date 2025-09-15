# Overview

This is a Next.js 15 multi-tenant application that enables users to create custom subdomains with emoji branding. The platform features a main domain where users can register subdomains (e.g., "mycompany.example.com") and an admin interface for managing tenants. Each subdomain serves as an independent tenant space with its own branding and content.

# User Preferences

Preferred communication style: Simple, everyday language.

**GitHub Push Methodology**: When user requests to push code to GitHub, ALWAYS use the creative GitHub API solution instead of standard Git operations. The system is already connected with PAT token, so use the GitHub REST API with Octokit integration to upload files directly. User should never have to handle technical Git operations manually.

**Creative GitHub API Push Process**:
1. Use the GitHub integration: `connection:conn_github_01K55BXKEF6E9E6EK2C4344X42`
2. Create upload script using Octokit with `@octokit/rest` package  
3. Upload files via GitHub API to repository: `handylife-debug/webwaka-main`
4. Handle both new file creation and existing file updates (with SHA)
5. Use professional commit messages with detailed feature descriptions
6. Clean up temporary scripts after successful upload
7. This approach bypasses Git lock issues and provides reliable code deployment

**Autonomous Workflow**: After completing any task, ALWAYS automatically: (1) Document changes in replit.md, (2) Push to GitHub using creative API solution, (3) Move immediately to next pending task without asking. Keep building continuously until all WebWaka Biological Cells are complete.

# Recent Changes

## WebWaka Biological Cell System Implementation (September 15, 2025)

### Core Authentication Cells (Cross-Cutting CC-001) ✅ COMPLETE
- **AuthenticationCore Cell (CC-001.1)**: Production-ready enterprise authentication with MFA, secure httpOnly cookies, encrypted storage, JWT management, password policies
- **SocialLoginIntegration Cell (CC-001.2)**: Multi-provider OAuth system supporting Google, GitHub, LinkedIn with secure state verification, CSRF protection, account linking/unlinking, encrypted token storage
- **JWTTokenManager Cell (CC-001.3)**: Enterprise JWT token management with token families, refresh rotation, revocation tracking, reuse detection, secure cookie lifecycle, production secret enforcement

### Core Payment Cells (Cross-Cutting CC-002) ✅ COMPLETE
- **PaymentGatewayCore Cell (CC-002.1)**: Enterprise Nigerian payment processing with Paystack, Flutterwave, Interswitch integration, multi-currency support, secure webhooks, HMAC verification, tenant isolation, comprehensive audit logging
- **SplitPayment Cell (CC-002.2)**: Advanced payment splitting system with installments, layaway, multi-method payments, banker's rounding (IEEE 754), perfect financial reconciliation, production-ready with comprehensive security

### Legacy Admin Enhancement Cells  
- **TenantDetails Cell**: Comprehensive tenant detail management with real-time analytics
- **TenantFeatureToggle Cell**: Professional feature toggle management with persistence
- **TenantTableEnhanced Cell**: Advanced table with search, filtering, pagination & bulk operations
- **UserDetails Cell**: Professional user detail management with role controls
- **PlanDetailsModal Cell**: Complete plan management with analytics integration

### Architecture Achievements
- **WebWaka Biological System**: Atomic, reusable Cells ready for cross-system deployment (POS, E-commerce, Website Builder, LMS)
- **Enterprise Security**: AES-256-CBC encryption, httpOnly cookies, required environment variables, zero secret logging
- **Type Safety**: Comprehensive TypeScript coverage with minimal LSP diagnostics
- **Performance**: Fast compilation (150-450ms builds), stable Next.js operation

# System Architecture

## Frontend Architecture
- **Framework**: Next.js 15 with App Router and React 19
- **Styling**: Tailwind CSS 4 with shadcn/ui design system components
- **Component Structure**: Modular components with UI components in `/components/ui/` and admin-specific components in `/components/admin/`
- **Cell Architecture**: WebWaka Biological system with atomic, reusable Cells in `/cells/admin/` directory
- **Routing**: Dynamic routing with subdomain detection via middleware for tenant-specific pages

## Backend Architecture
- **Server Actions**: Next.js server actions for form handling and data mutations
- **Middleware**: Custom middleware (`middleware.ts`) for subdomain extraction and routing logic
- **Authentication**: Mock authentication system with role-based access control (SuperAdmin, Admin, User)
- **Data Storage**: PostgreSQL database for structured data with Redis caching for tenant data using Upstash Redis

## Multi-Tenant Implementation
- **Subdomain Routing**: Automatic subdomain detection supporting both local development (`subdomain.localhost:3000`) and production environments
- **Tenant Isolation**: Each subdomain serves isolated content while sharing core application infrastructure
- **Admin Panel**: Protected admin interface at `/admin` with tenant management and partner onboarding capabilities
- **Vercel Preview Support**: Special handling for Vercel preview deployments with subdomain format `tenant---branch.vercel.app`

## Authentication & Authorization
- **Role-Based Access**: Three-tier role system (SuperAdmin, Admin, User) with hierarchical permissions
- **Mock Implementation**: Simplified authentication for demo purposes with hardcoded credentials
- **Server-Side Protection**: Route protection using server-side user validation in admin layouts
- **Session Management**: Cookie-based session handling for authentication state

## Data Management
- **Redis Storage**: Tenant data stored in Redis with keys like `subdomain:tenantname`
- **Server Actions**: Form submissions handled via Next.js server actions for subdomain creation and management
- **Data Validation**: Input sanitization and emoji validation for tenant customization
- **Error Handling**: Graceful error handling with user-friendly error messages

## Partner Management System
- **Partner Onboarding**: Public partner registration at `/partner-registration` with comprehensive application form
- **Application Workflow**: SuperAdmin approval system with detailed application review and status tracking
- **Partnership Levels**: Multi-tier partner system (Bronze, Silver, Gold, Platinum) with commission tracking
- **Referral System**: Complete referral tracking with commission calculations and activity logging
- **SuperAdmin Controls**: Dedicated interface for managing partner applications, approvals, and rejections

# External Dependencies

## Core Framework
- **Next.js 15**: React framework with App Router
- **React 19**: UI library with latest features
- **TypeScript**: Type safety across the application

## Database & Storage
- **PostgreSQL**: Primary database for structured data including partner applications and tenant management
- **Drizzle ORM**: Type-safe database ORM with schema management
- **Upstash Redis**: Cloud Redis service for tenant data storage and caching
- **@upstash/redis**: Redis client library for data operations

## UI & Styling
- **Tailwind CSS 4**: Utility-first CSS framework
- **shadcn/ui**: Component library built on Radix UI primitives
- **Radix UI**: Accessible component primitives for dialogs, dropdowns, labels, etc.
- **Lucide React**: Icon library for consistent iconography
- **frimousse**: Emoji picker component for tenant customization

## Development & Analytics
- **Vercel Analytics**: Performance and usage analytics
- **Vercel Speed Insights**: Performance monitoring
- **class-variance-authority**: Utility for component variant management
- **clsx & tailwind-merge**: Conditional styling utilities

## Environment Configuration
- **Environment Variables**: `KV_REST_API_URL`, `KV_REST_API_TOKEN` for Redis connection
- **Domain Configuration**: `NEXT_PUBLIC_ROOT_DOMAIN` for multi-tenant routing
- **Development Setup**: Local subdomain support with `*.localhost` configuration