'use client'

import { useState, useEffect } from 'react'
import { Search, Plus, Edit, Trash2, Check, X } from 'lucide-react'
import inventoryService from '../../lib/inventory-database'

interface BrandSelectorProps {
  value?: string
  onChange: (brand: string) => void
  placeholder?: string
  allowCreate?: boolean
  disabled?: boolean
}

export default function BrandSelector({ 
  value = '', 
  onChange, 
  placeholder = 'Select or create brand...', 
  allowCreate = true,
  disabled = false 
}: BrandSelectorProps) {
  const [brands, setBrands] = useState<string[]>([])
  const [filteredBrands, setFilteredBrands] = useState<string[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [newBrandName, setNewBrandName] = useState('')

  useEffect(() => {
    loadBrands()
  }, [])

  useEffect(() => {
    if (searchTerm.trim()) {
      const filtered = brands.filter(brand =>
        brand.toLowerCase().includes(searchTerm.toLowerCase())
      )
      setFilteredBrands(filtered)
    } else {
      setFilteredBrands(brands)
    }
  }, [searchTerm, brands])

  const loadBrands = async () => {
    try {
      setLoading(true)
      await inventoryService.init()
      const tenantId = inventoryService.getTenantId()
      const brandsData = await inventoryService.getBrands(tenantId)
      setBrands(brandsData)
      setFilteredBrands(brandsData)
    } catch (error) {
      console.error('Error loading brands:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectBrand = (brand: string) => {
    onChange(brand)
    setIsOpen(false)
    setSearchTerm('')
  }

  const handleCreateBrand = async () => {
    if (!newBrandName.trim()) return

    try {
      const tenantId = inventoryService.getTenantId()
      await inventoryService.createBrand(newBrandName.trim(), tenantId)
      await loadBrands()
      onChange(newBrandName.trim())
      setNewBrandName('')
      setIsCreating(false)
      setIsOpen(false)
    } catch (error) {
      console.error('Error creating brand:', error)
      alert('Failed to create brand. Please try again.')
    }
  }

  const canCreateBrand = allowCreate && searchTerm.trim() && 
    !brands.some(brand => brand.toLowerCase() === searchTerm.toLowerCase())

  return (
    <div className="relative">
      <div className="relative">
        <input
          type="text"
          value={isOpen ? searchTerm : value}
          onChange={(e) => {
            if (isOpen) {
              setSearchTerm(e.target.value)
            } else {
              onChange(e.target.value)
            }
          }}
          onFocus={() => {
            setIsOpen(true)
            setSearchTerm(value)
          }}
          onBlur={() => {
            // Delay closing to allow for clicks
            setTimeout(() => {
              if (!isCreating) {
                setIsOpen(false)
                setSearchTerm('')
              }
            }, 200)
          }}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
        />
        
        {loading && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
          </div>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {filteredBrands.length > 0 ? (
            <div className="py-1">
              {filteredBrands.map((brand) => (
                <button
                  key={brand}
                  type="button"
                  onClick={() => handleSelectBrand(brand)}
                  className="w-full px-4 py-2 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
                >
                  <span className="block text-sm text-gray-900">{brand}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-4 py-2 text-sm text-gray-500">
              No brands found
            </div>
          )}

          {canCreateBrand && (
            <div className="border-t border-gray-200">
              {!isCreating ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(true)
                    setNewBrandName(searchTerm)
                  }}
                  className="w-full px-4 py-2 text-left hover:bg-blue-50 focus:bg-blue-50 focus:outline-none text-blue-600"
                >
                  <Plus className="w-4 h-4 inline mr-2" />
                  Create brand "{searchTerm}"
                </button>
              ) : (
                <div className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newBrandName}
                      onChange={(e) => setNewBrandName(e.target.value)}
                      placeholder="Brand name"
                      className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleCreateBrand()
                        } else if (e.key === 'Escape') {
                          setIsCreating(false)
                          setNewBrandName('')
                        }
                      }}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleCreateBrand}
                      className="p-1 text-green-600 hover:text-green-700"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreating(false)
                        setNewBrandName('')
                      }}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}