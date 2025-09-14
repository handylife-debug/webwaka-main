# WebWaka - Multi-Tenant Business Management Platform

A comprehensive business management platform built with Next.js 15, featuring multi-tenancy with subdomain routing, Point of Sale (POS) system, inventory management, CRM, HRM, and partner management capabilities.

## 🚀 Features

- **Multi-Tenant Architecture** - Subdomain-based tenant isolation with dynamic routing
- **Point of Sale (POS)** - Complete POS system with offline capabilities and PWA support  
- **Inventory Management** - Product catalog, variants, categories, suppliers, and stock tracking
- **Customer Relationship Management (CRM)** - Customer data, interactions, segments, and communications
- **Human Resource Management (HRM)** - Employee management, attendance, and payroll tracking
- **Partner Management** - Partner onboarding, commission tracking, and referral systems
- **Admin Dashboard** - Comprehensive super admin controls for platform management
- **Progressive Web App (PWA)** - Mobile-first design with offline capabilities

## 📋 Prerequisites

- Node.js 18+ 
- pnpm (recommended) or npm
- PostgreSQL database
- Redis (Upstash recommended)

## 🛠️ Installation & Setup

### 1. Install Dependencies

```bash
# Clone the repository
git clone https://github.com/handylife-debug/webwaka-main.git
cd webwaka-main

# Navigate to the main application directory
cd platforms

# Install dependencies using pnpm (recommended)
pnpm install

# Or using npm
npm install
```

### 2. Configure Environment

```bash
# Copy the environment template
cp ../.env.example .env.local

# Edit .env.local with your actual configuration
nano .env.local
```

**Required Environment Variables:**

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `KV_REST_API_URL` | Upstash Redis URL | `https://your-redis.upstash.io` |
| `KV_REST_API_TOKEN` | Upstash Redis token | `your-redis-token` |
| `NEXT_PUBLIC_ROOT_DOMAIN` | Root domain for multi-tenancy | `localhost:3000` (dev) or `yourdomain.com` (prod) |

*Note: In Replit environment, many variables are auto-configured.*

### 3. Database Setup

The application uses PostgreSQL with automatic table creation. Database tables are initialized automatically when accessing different modules:

- **Core Tables**: Tenants, users, plans, credentials
- **CRM Tables**: Customers, contacts, interactions, segments  
- **HRM Tables**: Employees, attendance, payroll
- **Inventory Tables**: Products, categories, suppliers, stock
- **POS Tables**: Transactions, sales data
- **Partner Tables**: Applications, levels, commissions

### 4. Initial Run & Version Control

```bash
# Start the development server
pnpm dev

# Or with specific configuration
pnpm dev --port 5000 --hostname 0.0.0.0

# Build for production
pnpm build

# Start production server
pnpm start
```

The application will be available at:
- **Main Platform**: http://localhost:5000
- **Admin Dashboard**: http://localhost:5000/admin  
- **Tenant Subdomains**: http://tenant.localhost:5000
- **Partner Portal**: http://localhost:5000/partners

## 🏗️ Project Structure

```
webwaka-main/
├── platforms/                    # Main Next.js application
│   ├── app/
│   │   ├── (admin)/              # Admin route group
│   │   │   ├── layout.tsx        # Admin layout with sidebar & header
│   │   │   └── admin/            # Admin dashboard pages
│   │   │       ├── page.tsx      # Main admin dashboard
│   │   │       ├── tenants/      # Tenant management
│   │   │       ├── users/        # User management  
│   │   │       ├── partners/     # Partner management
│   │   │       └── credentials/  # System credentials
│   │   ├── (partner)/            # Partner route group
│   │   │   └── partners/         # Partner portal pages
│   │   ├── api/                  # API endpoints
│   │   │   ├── admin/            # Admin APIs
│   │   │   ├── crm/              # CRM APIs
│   │   │   └── hrm/              # HRM APIs
│   │   ├── inventory/            # Inventory management pages
│   │   ├── pos/                  # Point of Sale application
│   │   ├── s/[subdomain]/        # Dynamic tenant pages
│   │   └── layout.tsx            # Root layout
│   ├── components/
│   │   ├── admin/                # Admin-specific components
│   │   ├── partner/              # Partner-specific components
│   │   ├── inventory/            # Inventory components
│   │   └── ui/                   # Reusable UI components
│   ├── lib/                      # Core utilities and services
│   │   ├── database.ts           # PostgreSQL connection
│   │   ├── redis.ts              # Redis client
│   │   ├── auth.ts               # Authentication logic
│   │   ├── enhanced-subdomains.ts # Multi-tenant routing
│   │   └── partner-management.ts # Partner system
│   └── middleware.ts             # Next.js middleware for routing
├── shared/                       # Shared utilities
├── server/                       # Server-side code
└── .env.example                  # Environment template
```

## 🔧 Admin Route and Layout

The admin system is built with a robust layout structure:

- **Admin Layout** (`platforms/app/(admin)/layout.tsx`): 
  - Enforces SuperAdmin role authorization
  - Provides consistent sidebar navigation  
  - Includes header with user context
  - Responsive design for all screen sizes

- **Admin Routes**:
  - `/admin` - Main dashboard with tenant overview
  - `/admin/tenants` - Tenant management and analytics
  - `/admin/users` - User administration and invitations
  - `/admin/partners` - Partner application management
  - `/admin/credentials` - System integration setup
  - `/admin/plans` - Subscription plan management

## 🎯 Multi-Tenant Routing

The platform supports multiple tenancy modes:

1. **Main Domain**: Core platform and admin access
2. **Tenant Subdomains**: `tenant.yourdomain.com` - Isolated tenant spaces
3. **Local Development**: `tenant.localhost:3000` - Development subdomains
4. **Vercel Preview**: `tenant---branch.vercel.app` - Deploy previews

## 📱 Progressive Web App (PWA)

WebWaka includes full PWA capabilities:

- **Offline Functionality**: POS system works without internet
- **Mobile Installation**: Add to homescreen support
- **Push Notifications**: Real-time updates (when configured)
- **Background Sync**: Automatic data synchronization

## 🔐 Authentication & Authorization

The platform implements role-based access control:

- **SuperAdmin**: Full platform access and tenant management
- **Admin**: Tenant-level administration 
- **User**: Standard user permissions
- **Partner**: Partner portal access

## 🚀 Deployment

### Replit Deployment
The application is pre-configured for Replit with:
- Automatic workflows in `.replit` configuration
- Database and Redis integrations 
- Environment variable management

### Manual Deployment
For other platforms:

```bash
# Build the application
cd platforms
pnpm build

# Set environment variables
export DATABASE_URL="your-database-url"
export KV_REST_API_URL="your-redis-url"
export KV_REST_API_TOKEN="your-redis-token"

# Start production server
pnpm start
```

## 🔧 Development

### Available Scripts

```bash
# Development server with hot reload
pnpm dev

# Production build
pnpm build  

# Start production server
pnpm start

# Type checking
pnpm type-check

# Linting (if configured)
pnpm lint
```

### Database Migrations

The application uses automatic table creation. To manually initialize:

```bash
# Run database initialization endpoints
curl -X POST http://localhost:5000/api/admin/init-people-management
curl -X POST http://localhost:5000/api/admin/init-partner-tables
```

## 📝 Version Control

This project is version controlled with Git. Key commits include:

- **Initial Setup**: Dependencies, environment, and basic structure
- **Admin System**: Complete admin dashboard and user management  
- **Multi-Tenant Core**: Subdomain routing and tenant isolation
- **POS System**: Point of sale with offline capabilities
- **CRM Module**: Customer relationship management
- **HRM Module**: Human resource management
- **Partner System**: Partner onboarding and commission tracking
- **PWA Features**: Progressive web app capabilities

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the ISC License.

## 🆘 Support

For support and questions:
- Check the documentation in `/docs` folder
- Review component documentation in `/components`
- Examine API endpoints in `/api` folders

---

Built with ❤️ using Next.js 15, React 19, and modern web technologies.