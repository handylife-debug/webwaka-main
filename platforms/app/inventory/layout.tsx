'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Package, Tags, Layers, Barcode, Settings, Plus, Home } from 'lucide-react'

const navigation = [
  {
    name: 'Product Catalog',
    href: '/inventory',
    icon: Package
  },
  {
    name: 'Categories',
    href: '/inventory/categories',
    icon: Tags
  },
  {
    name: 'Variants',
    href: '/inventory/variants',
    icon: Layers
  },
  {
    name: 'Barcode Manager',
    href: '/inventory/barcodes',
    icon: Barcode
  },
  {
    name: 'Settings',
    href: '/inventory/settings',
    icon: Settings
  }
]

const quickActions = [
  {
    name: 'Add Product',
    href: '/inventory/products/new',
    icon: Plus,
    color: 'bg-blue-600 hover:bg-blue-700'
  },
  {
    name: 'Add Category',
    href: '/inventory/categories/new',
    icon: Tags,
    color: 'bg-green-600 hover:bg-green-700'
  }
]

export default function InventoryLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link href="/" className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 mr-6">
                <Home className="w-5 h-5" />
                <span>Home</span>
              </Link>
              <h1 className="text-xl font-semibold text-gray-900">Inventory Management</h1>
            </div>
            
            {/* Quick Actions */}
            <div className="flex items-center space-x-2">
              {quickActions.map((action) => (
                <Link
                  key={action.name}
                  href={action.href}
                  className={`inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white ${action.color} transition-colors`}
                >
                  <action.icon className="w-4 h-4 mr-2" />
                  {action.name}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <nav className="w-64 bg-white border-r border-gray-200 min-h-screen">
          <div className="p-4">
            <div className="space-y-1">
              {navigation.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/inventory' && pathname.startsWith(item.href))
                
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      isActive
                        ? 'bg-blue-100 text-blue-700 border-r-2 border-blue-700'
                        : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <item.icon className="w-5 h-5 mr-3" />
                    {item.name}
                  </Link>
                )
              })}
            </div>
          </div>
        </nav>

        {/* Main content */}
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  )
}