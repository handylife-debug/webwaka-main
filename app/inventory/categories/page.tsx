'use client'

import { useState, useEffect } from 'react'
import { Plus, Search, Edit, Trash2, ChevronRight, ChevronDown, FolderOpen, Folder, Tag, Settings } from 'lucide-react'
import Link from 'next/link'
import inventoryService from '../../../lib/inventory-database'
import { ProductCategoryDocument } from '../../../lib/offline-database'

interface CategoryNode extends ProductCategoryDocument {
  children: CategoryNode[]
  productCount: number
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryNode[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingCategory, setEditingCategory] = useState<ProductCategoryDocument | null>(null)

  useEffect(() => {
    loadCategories()
  }, [])

  const loadCategories = async () => {
    try {
      setLoading(true)
      
      await inventoryService.init()
      const categoriesData = await inventoryService.getCategories(inventoryService.getTenantId())
      
      // Build hierarchy tree
      const categoryTree = buildCategoryTree(categoriesData)
      setCategories(categoryTree)
      
    } catch (error) {
      console.error('Error loading categories:', error)
    } finally {
      setLoading(false)
    }
  }

  const buildCategoryTree = (categories: ProductCategoryDocument[]): CategoryNode[] => {
    const categoryMap = new Map<string, CategoryNode>()
    const rootCategories: CategoryNode[] = []

    // Initialize all categories with children array
    categories.forEach(cat => {
      categoryMap.set(cat.id, { ...cat, children: [], productCount: 0 })
    })

    // Build tree structure
    categories.forEach(cat => {
      const node = categoryMap.get(cat.id)!
      if (cat.parentCategoryId) {
        const parent = categoryMap.get(cat.parentCategoryId)
        if (parent) {
          parent.children.push(node)
        } else {
          // Parent not found, treat as root
          rootCategories.push(node)
        }
      } else {
        rootCategories.push(node)
      }
    })

    // Sort categories
    const sortCategories = (cats: CategoryNode[]) => {
      cats.sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) {
          return a.sortOrder - b.sortOrder
        }
        return a.categoryName.localeCompare(b.categoryName)
      })
      cats.forEach(cat => sortCategories(cat.children))
    }

    sortCategories(rootCategories)
    return rootCategories
  }

  const handleDeleteCategory = async (categoryId: string) => {
    if (window.confirm('Are you sure you want to delete this category? All subcategories and associated products will need to be reassigned.')) {
      try {
        await inventoryService.deleteCategory(categoryId)
        await loadCategories()
      } catch (error) {
        console.error('Error deleting category:', error)
        alert('Failed to delete category. It may have subcategories or products assigned.')
      }
    }
  }

  const toggleExpanded = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId)
    } else {
      newExpanded.add(categoryId)
    }
    setExpandedCategories(newExpanded)
  }

  const renderCategoryTree = (categories: CategoryNode[], level: number = 0) => {
    return categories.map(category => {
      const isExpanded = expandedCategories.has(category.id)
      const hasChildren = category.children.length > 0
      
      return (
        <div key={category.id} className="mb-1">
          <div 
            className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg group transition-colors"
            style={{ paddingLeft: `${12 + level * 24}px` }}
          >
            <div className="flex items-center flex-1 min-w-0">
              {hasChildren ? (
                <button
                  onClick={() => toggleExpanded(category.id)}
                  className="p-1 hover:bg-gray-200 rounded mr-2 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  )}
                </button>
              ) : (
                <div className="w-6 h-6 mr-2" />
              )}
              
              <div className="flex items-center mr-3">
                {hasChildren ? (
                  isExpanded ? (
                    <FolderOpen className="w-5 h-5 text-blue-500 mr-2" />
                  ) : (
                    <Folder className="w-5 h-5 text-blue-500 mr-2" />
                  )
                ) : (
                  <Tag className="w-5 h-5 text-gray-400 mr-2" />
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-gray-900 truncate">
                  {category.categoryName}
                </h3>
                {category.description && (
                  <p className="text-xs text-gray-500 truncate">{category.description}</p>
                )}
              </div>
              
              <div className="flex items-center space-x-4 text-sm text-gray-500 mr-4">
                {category.taxRate > 0 && (
                  <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                    Tax: {(category.taxRate * 100).toFixed(1)}%
                  </span>
                )}
                <span className="text-xs">
                  {category.productCount} products
                </span>
              </div>
            </div>
            
            <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => setEditingCategory(category)}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors"
                title="Edit category"
              >
                <Edit className="w-4 h-4 text-gray-600" />
              </button>
              <button
                onClick={() => handleDeleteCategory(category.id)}
                className="p-2 hover:bg-red-100 rounded-full transition-colors"
                title="Delete category"
              >
                <Trash2 className="w-4 h-4 text-red-600" />
              </button>
            </div>
          </div>
          
          {isExpanded && hasChildren && (
            <div className="ml-6 border-l border-gray-200">
              {renderCategoryTree(category.children, level + 1)}
            </div>
          )}
        </div>
      )
    })
  }

  const filteredCategories = categories.filter(category =>
    category.categoryName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    category.description?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading categories...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Category Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Organize your products with hierarchical categories
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateForm(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Category
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search categories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Categories Tree */}
      <div className="bg-white rounded-lg border border-gray-200">
        {filteredCategories.length === 0 ? (
          <div className="text-center py-12">
            <Tag className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No categories found</h3>
            <p className="text-gray-500 mb-4">
              {searchTerm 
                ? `No categories match your search "${searchTerm}"`
                : 'Get started by creating your first category'
              }
            </p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Category
            </button>
          </div>
        ) : (
          <div className="p-4">
            {renderCategoryTree(filteredCategories)}
          </div>
        )}
      </div>

      {/* Create/Edit Category Modal */}
      {(showCreateForm || editingCategory) && (
        <CategoryForm
          category={editingCategory}
          categories={categories}
          onSave={() => {
            setShowCreateForm(false)
            setEditingCategory(null)
            loadCategories()
          }}
          onCancel={() => {
            setShowCreateForm(false)
            setEditingCategory(null)
          }}
        />
      )}
    </div>
  )
}

interface CategoryFormProps {
  category?: ProductCategoryDocument | null
  categories: CategoryNode[]
  onSave: () => void
  onCancel: () => void
}

function CategoryForm({ category, categories, onSave, onCancel }: CategoryFormProps) {
  const [formData, setFormData] = useState({
    categoryName: category?.categoryName || '',
    categoryCode: category?.categoryCode || '',
    description: category?.description || '',
    parentCategoryId: category?.parentCategoryId || '',
    taxRate: category?.taxRate || 0,
    sortOrder: category?.sortOrder || 0,
    isActive: category?.isActive !== false
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      await inventoryService.init()
      
      const categoryData = {
        ...formData,
        tenantId: inventoryService.getTenantId(),
        taxRate: formData.taxRate / 100 // Convert percentage to decimal
      }

      if (category) {
        await inventoryService.updateCategory(category.id, categoryData)
      } else {
        await inventoryService.createCategory(categoryData)
      }
      
      onSave()
    } catch (error) {
      console.error('Error saving category:', error)
      alert('Failed to save category. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Generate category code automatically
  useEffect(() => {
    if (!category && formData.categoryName && !formData.categoryCode) {
      const code = formData.categoryName
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .substring(0, 3)
      setFormData(prev => ({ ...prev, categoryCode: code }))
    }
  }, [formData.categoryName, category])

  // Get flat list of categories for parent selection
  const getFlatCategories = (cats: CategoryNode[], level = 0): Array<{ id: string, name: string, level: number }> => {
    const result: Array<{ id: string, name: string, level: number }> = []
    cats.forEach(cat => {
      if (!category || cat.id !== category.id) { // Don't allow selecting self as parent
        result.push({ id: cat.id, name: cat.categoryName, level })
        result.push(...getFlatCategories(cat.children, level + 1))
      }
    })
    return result
  }

  const flatCategories = getFlatCategories(categories)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            {category ? 'Edit Category' : 'Create Category'}
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category Name *
              </label>
              <input
                type="text"
                required
                value={formData.categoryName}
                onChange={(e) => setFormData(prev => ({ ...prev, categoryName: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter category name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category Code *
              </label>
              <input
                type="text"
                required
                value={formData.categoryCode}
                onChange={(e) => setFormData(prev => ({ ...prev, categoryCode: e.target.value.toUpperCase() }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., BEV, FOO"
                maxLength={10}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={3}
                placeholder="Optional description"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Parent Category
              </label>
              <select
                value={formData.parentCategoryId}
                onChange={(e) => setFormData(prev => ({ ...prev, parentCategoryId: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">No parent (root category)</option>
                {flatCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {'  '.repeat(cat.level)}└─ {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tax Rate (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={formData.taxRate}
                  onChange={(e) => setFormData(prev => ({ ...prev, taxRate: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0.0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sort Order
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.sortOrder}
                  onChange={(e) => setFormData(prev => ({ ...prev, sortOrder: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0"
                />
              </div>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="isActive" className="ml-2 text-sm text-gray-700">
                Active category
              </label>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Saving...' : (category ? 'Update Category' : 'Create Category')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}