# WebWaka E-Commerce Platform

## Overview
The WebWaka E-Commerce Platform is a multi-vendor e-commerce solution designed with a biological hierarchical system architecture, emphasizing cellular independence and 100% component reusability. It aims to provide a robust, secure, and scalable system for online commerce, with specialized features for the Nigerian market. Key capabilities include multi-vendor management, order splitting and fulfillment, B2B access control, and comprehensive security. The platform's ambition is to establish a leading e-commerce presence by leveraging a unique, highly modular architecture.

## User Preferences
- **Cellular Reusability**: Hardcoded requirement - reuse existing cells and codebase without duplicating functionality
- **Documentation**: Each completed subtask must be fully documented and pushed to GitHub immediately
- **Architecture**: Follow established cellular architecture pattern with client.tsx/server.ts structure
- **Security**: Implement proper encryption, RBAC authorization, and tenant scoping
- **Integration**: Push code to GitHub after each major completion using established connection

## System Architecture

### Core Design Principles
The platform uses a "biological hierarchical system" architecture, where each "cell" is a fundamental, 100% reusable functional unit. This design enforces strict cellular independence, eliminating direct cross-cell imports and relying solely on Cell Bus communication for inter-cell interactions.

### Technology Stack
- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **UI Components**: Radix UI, Lucide React icons
- **Database**: PostgreSQL
- **Caching**: Redis
- **Authentication**: Cookie-based sessions with JWT-like tokens

### Key Features & Implementations
- **Cellular Structure**: The codebase is organized into a `cells/` directory, containing independent functional units for various e-commerce functionalities (e.g., VendorOnboardingManagement, MultiStoreMarketplace, OrderSplittingFulfillment, B2BAccessControl).
- **UI/UX**: Utilizes Radix UI and Tailwind CSS for a consistent and modern design across all interfaces, including vendor and partner dashboards.
- **Multi-tenancy**: Designed with strict tenant-scoped data isolation and security.
- **E-commerce Capabilities**: Includes comprehensive vendor onboarding, multi-store marketplace management with individual store pages, automated order splitting and fulfillment, and B2B access control with guest price hiding and group management.
- **Regional Features**: Specific features for the Nigerian market, such as Naira currency defaults, CAC registration, tax ID, and 7.5% VAT compliance, are integrated.
- **Cellular Independence Achieved**: Core cells like `TaxAndFee`, `B2BAccessControl`, `QuoteRequestNegotiation`, and `WholesalePricingTiers` have achieved true cellular independence, eliminating direct cross-cell imports and relying on Cell Gateway v2 communication. This includes database-driven configurations, Redis caching, and robust security.
- **Data Access Layer Consolidation**: A military-grade secure Data Access Layer enforces mandatory `tenant_id` predicates at all database entry points, providing comprehensive protection against SQL injection, OR-bypass attacks, and UNION branch gaps.

## External Dependencies
- **Database**: PostgreSQL
- **Caching**: Redis
- **Authentication**: `jose` library (for JWT signing)
- **UI Libraries**: Radix UI, Lucide React (icons)
- **Version Control**: GitHub