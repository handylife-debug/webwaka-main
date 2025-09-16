# Overview

This project is a Next.js 15 multi-tenant SaaS application designed to allow users to create custom subdomains with emoji branding. It features a main domain for subdomain registration and an admin interface for tenant management. Each subdomain functions as an independent tenant space, complete with its own branding and content. The platform aims to automate complex business workflows using an advanced "WebWaka Biological Cell System" for modularity and scalability, targeting various business needs including POS, E-commerce, and CRM.

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

# System Architecture

## Frontend Architecture
- **Framework**: Next.js 15 with App Router and React 19.
- **Styling**: Tailwind CSS 4 with shadcn/ui components.
- **Component Structure**: Modular "WebWaka Biological Cell System" located in `/cells/`, ensuring atomic, reusable components.
- **Routing**: Dynamic routing with middleware for subdomain-based tenant detection.

## Backend Architecture
- **Server Actions**: Next.js server actions for data mutations and form handling.
- **Middleware**: Custom `middleware.ts` for subdomain extraction and routing.
- **Authentication**: Role-based access control (SuperAdmin, Admin, User) with a mock authentication system for demo purposes.
- **Data Storage**: PostgreSQL for structured data; Redis (Upstash) for caching and tenant-specific data.

## Multi-Tenant Implementation
- **Subdomain Routing**: Automatic detection and routing for tenant-specific subdomains in both development and production.
- **Tenant Isolation**: Shared core infrastructure with isolated content per subdomain.
- **Admin Panel**: Protected `/admin` interface for tenant and partner management.

## Authentication & Authorization
- **Role-Based Access**: Three-tier system (SuperAdmin, Admin, User) with hierarchical permissions.
- **Session Management**: Cookie-based sessions.

## Data Management
- **Redis Storage**: Tenant data and caching via Upstash Redis.
- **Server Actions**: Handling form submissions for subdomain creation and management.
- **Data Validation**: Input sanitization, including emoji validation.

## Partner Management System
- **Partner Onboarding**: Public registration flow at `/partner-registration`.
- **Application Workflow**: SuperAdmin approval process for partner applications.
- **Partnership Levels**: Multi-tier system (Bronze, Silver, Gold, Platinum) with commission tracking.

## Core Feature Specifications (WebWaka Biological Cell System)
- **Authentication Cells (CC-001)**: Enterprise authentication with MFA, OAuth (Google, GitHub, LinkedIn), and robust JWT management.
- **Payment Cells (CC-002)**: Nigerian payment gateway integration (Paystack, Flutterwave, Interswitch) with multi-currency and split payment capabilities.
- **Inventory Cells (CC-003)**: Comprehensive product catalog and multi-location inventory tracking with Nigerian market features (VAT, bulk pricing).
- **Customer/CRM Cells (CC-004)**: Customer data management with Nigerian localization, SMS/WhatsApp integration, and advanced loyalty programs.
- **Sales/Transaction Processing Cells (CC-005)**: POS transaction processing with Nigerian VAT compliance, multi-payment support, and comprehensive sales reporting.
- **Tissue Orchestrator (MOD-501-1)**: Advanced cell composition system for complex business workflows, providing API infrastructure for CRUD operations and workflow execution with multi-tenant security.
- **UI Component Modularization (MOD-501.1)**: Extracted reusable UI components (e.g., StatusBadgeCell, ActionButtonCell, DataTableCell) following a mobile-first design.
- **Tenant Management Modularization (MOD-501.2)**: Modularized tenant management into dedicated cells for registration, configuration, analytics, billing, and security.

# External Dependencies

## Core Framework
- **Next.js 15**: React framework.
- **React 19**: UI library.
- **TypeScript**: Type safety.

## Database & Storage
- **PostgreSQL**: Primary relational database.
- **Drizzle ORM**: Type-safe ORM.
- **Upstash Redis**: Cloud Redis for caching and tenant data.
- **@upstash/redis**: Redis client library.

## UI & Styling
- **Tailwind CSS 4**: Utility-first CSS.
- **shadcn/ui**: Component library based on Radix UI.
- **Radix UI**: Accessible component primitives.
- **Lucide React**: Icon library.
- **frimousse**: Emoji picker.

## Development & Analytics
- **Vercel Analytics**: Performance and usage analytics.
- **Vercel Speed Insights**: Performance monitoring.
- **class-variance-authority**: Component variant management.
- **clsx & tailwind-merge**: Styling utilities.

## Integrations (Specific to WebWaka Biological Cells)
- **Paystack, Flutterwave, Interswitch**: Nigerian payment gateways.
- **Google, GitHub, LinkedIn**: OAuth providers for social login.
- **Octokit (`@octokit/rest`)**: GitHub API integration for pushing code.