# Overview

This project is a Next.js 15 multi-tenant SaaS application that enables users to create custom, emoji-branded subdomains. It provides a main domain for subdomain registration and an administrative interface for tenant management. Each subdomain operates as an independent tenant space with its own branding and content. The platform utilizes an advanced "WebWaka Biological Cell System" for modularity and scalability, aiming to automate complex business workflows across various sectors, including POS, E-commerce, and CRM.

## Latest Achievement: POS-103 Specialized Industry Cells Completed (September 16, 2025)

**🏆 Major Milestone: POS-103 Level Specialized Industry Cells Successfully Implemented**

### RepairShopManagement Cell (CC-R001) ✅ PRODUCTION-READY
- **Comprehensive Electronics Repair Management** for Nigerian device repair businesses
- **100% Reuse-First Compliance**: Composes CustomerProfile, InventoryTracking, SalesEngine, and SplitPayment cells
- **Device Registration**: Full tracking for smartphones, laptops, tablets, gaming consoles with warranty status
- **Repair Workflow**: Complete status management from diagnosis → parts ordering → repair → testing → delivery
- **Parts Integration**: Seamless inventory tracking with atomic operations and serial number tracking
- **Complex Billing**: Split payments for diagnostics + parts + labor using existing payment infrastructure
- **Nigerian Market Features**: NGN currency, SMS/WhatsApp notifications, mobile money integration
- **Production Safety**: Atomic job numbers, idempotency protection, transactional consistency
- **Architect Approved**: Full production readiness confirmed with robust concurrency handling

### RestaurantTableKDS Cell (CC-R002) ✅ FUNCTIONAL
- **Kitchen Display System** for Nigerian restaurants and food service businesses  
- **100% Reuse-First Compliance**: Composes SalesEngine, InventoryTracking, ProductCatalog, and CustomerProfile cells
- **Table Management**: Complete seating, reservations, status tracking, party management
- **Order Processing**: Full lifecycle from creation → kitchen preparation → serving → completion
- **Kitchen Workflow**: Multi-station support (grill, fryer, saute, salad, pastry, beverage, expedite)
- **Course Timing**: Sophisticated scheduling for appetizers, mains, desserts with stagger delays
- **Ingredient Integration**: Real-time availability checking with automatic inventory reservation
- **Payment Processing**: Multi-method support including Nigerian mobile money and split billing
- **Customer Communications**: SMS/Email notifications for order status updates
- **Production Features**: Transactional atomicity, POS synchronization, idempotency protection

### 🎯 Next: OfflinePWASynchronization Cell (CC-R003) - Pending Implementation
- **Mobile-First Nigerian Businesses** with offline-first capabilities
- **Reuse Focus**: Leverage existing OfflineDataSync and PWA infrastructure  
- **Target**: Complete POS-103 specialization tier for production deployment

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

**Autonomous Workflow**: After completing any task, ALWAYS automatically: (1) **Reuse Audit** - verify 100% code reuse compliance per ADR-0001, (2) Document changes in replit.md, (3) Push to GitHub using creative API solution, (4) Move immediately to next pending task without asking. Keep building continuously until all WebWaka Biological Cells are complete.

**🔐 REUSE-FIRST MANDATE (ADR-0001)**: All development MUST follow the Reuse-First principle. Before creating ANY new code: (1) Search existing cells for similar functionality, (2) Reuse existing modules instead of creating duplicates, (3) Extend existing cells rather than creating parallel implementations, (4) Declare all dependencies in cell.json, (5) Zero tolerance for >15 lines code duplication. This principle is permanently hardcoded and enforced via automated tooling.

# System Architecture

## Frontend Architecture
- **Framework**: Next.js 15 with App Router and React 19.
- **Styling**: Tailwind CSS 4 with shadcn/ui components.
- **Component Structure**: Modular "WebWaka Biological Cell System" located in `/cells/` for atomic, reusable components.
- **Routing**: Dynamic routing with middleware for subdomain-based tenant detection.
- **UI/UX Decisions**: Mobile-first design principles, accessible components via Radix UI, consistent UI across the platform.

## Backend Architecture
- **Server Actions**: Next.js server actions for data mutations and form handling.
- **Middleware**: Custom `middleware.ts` for subdomain extraction and routing.
- **Authentication**: Role-based access control (SuperAdmin, Admin, User) with cookie-based session management.
- **Data Storage**: PostgreSQL for structured data; Redis (Upstash) for caching and tenant-specific data.
- **Data Management**: Type-safe ORM (Drizzle ORM), input validation (including emoji validation), race-free atomic operations for financial integrity, and deterministic idempotency.

## Multi-Tenant Implementation
- **Subdomain Routing**: Automatic detection and routing for tenant-specific subdomains.
- **Tenant Isolation**: Shared core infrastructure with isolated content per subdomain.
- **Admin Panel**: Protected `/admin` interface for tenant and partner management.

## Partner Management System
- **Partner Onboarding**: Public registration flow and SuperAdmin approval process.
- **Partnership Levels**: Multi-tier system (Bronze, Silver, Gold, Platinum) with commission tracking.

## Core Feature Specifications (WebWaka Biological Cell System)
- **Authentication Cells (CC-001)**: Enterprise authentication with MFA, OAuth (Google, GitHub, LinkedIn), and JWT management.
- **Payment Cells (CC-002)**: Nigerian payment gateway integration (Paystack, Flutterwave, Interswitch) with multi-currency and split payment capabilities.
- **Inventory Cells (CC-003)**: Comprehensive product catalog (variant matrix, pricing strategies, bulk operations, auto-generation) and multi-location inventory tracking (serial number, lot, expiry management) with Nigerian market features.
- **Customer/CRM Cells (CC-004)**: Customer data management with Nigerian localization, SMS/WhatsApp integration, and loyalty programs.
- **Sales/Transaction Processing Cells (CC-005)**: POS transaction processing with Nigerian VAT compliance, multi-payment support, and sales reporting.
- **Repair Shop Management Cells (CC-R001)**: Complete electronics repair business workflow with device tracking, parts management, complex billing, and customer communications for Nigerian market.
- **Restaurant Table/KDS Cells (CC-R002)**: Full-service restaurant management with table operations, kitchen display systems, order workflow, and multi-station preparation management.
- **Tissue Orchestrator (MOD-501-1)**: Advanced cell composition system for complex business workflows, providing API infrastructure for CRUD operations and workflow execution with multi-tenant security.
- **Modularization**: Reusable UI components (e.g., StatusBadgeCell, ActionButtonCell), tenant management (registration, configuration, analytics, billing, security), and admin functions (user, partner, reporting, system health, auditing) are modularized into dedicated cells. All critical client/server boundary issues resolved, ensuring production readiness.

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

## Integrations
- **Paystack, Flutterwave, Interswitch**: Nigerian payment gateways.
- **Google, GitHub, LinkedIn**: OAuth providers for social login.
- **Octokit (`@octokit/rest`)**: GitHub API integration for pushing code.