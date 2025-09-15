# Overview

This is a Next.js 15 multi-tenant application that enables users to create custom subdomains with emoji branding. The platform features a main domain where users can register subdomains (e.g., "mycompany.example.com") and an admin interface for managing tenants. Each subdomain serves as an independent tenant space with its own branding and content.

# User Preferences

Preferred communication style: Simple, everyday language.

# Recent Changes

## WebWaka Biological Cell System Implementation (September 15, 2025)
- **5 Core Enhancement Cells**: Implemented atomic, reusable Cells following WebWaka Biological hierarchical system
  - TenantDetails Cell: Comprehensive tenant detail management with real-time analytics
  - TenantFeatureToggle Cell: Professional feature toggle management with persistence
  - TenantTableEnhanced Cell: Advanced table with search, filtering, pagination & bulk operations
  - UserDetails Cell: Professional user detail management with role controls
  - PlanDetailsModal Cell: Complete plan management with analytics integration
- **Component Integration**: Replaced placeholder functionality with production-ready interfaces
- **Server Architecture**: Complete server wiring with persistence layer and optimistic state management
- **Type Safety**: Resolved all LSP errors with comprehensive TypeScript coverage
- **Admin Control Tower**: Enhanced from basic alerts to professional modal management system

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