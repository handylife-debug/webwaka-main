'use client'

import { useState, useEffect, useRef } from 'react'
import { Barcode, Copy, Download, RefreshCw, Check, AlertCircle, Search, Filter, Upload } from 'lucide-react'
import inventoryService from '../../lib/inventory-database'

interface GeneratedCode {
  id: string
  type: 'barcode' | 'sku'
  value: string
  format: string
  productName?: string
  category?: string
  createdAt: Date
  isUsed: boolean
}

interface BarcodeGeneratorProps {
  onSelectCode?: (code: string) => void
  mode?: 'standalone' | 'selector'
  initialType?: 'barcode' | 'sku'
}

const BARCODE_FORMATS = [
  { value: 'ean13', label: 'EAN-13', description: '13-digit European/International format' },
  { value: 'upc', label: 'UPC-A', description: '12-digit North American format' },
  { value: 'code128', label: 'Code 128', description: 'Alphanumeric format' },
  { value: 'custom', label: 'Custom', description: 'Custom format based on pattern' }
]

const SKU_PATTERNS = [
  { value: 'cat-prod-var', label: 'CAT-PROD-VAR', description: 'Category-Product-Variant pattern' },
  { value: 'cat-prod-num', label: 'CAT-PROD-###', description: 'Category-Product-Number pattern' },
  { value: 'date-cat-prod', label: 'YYMMDD-CAT-PROD', description: 'Date-Category-Product pattern' },
  { value: 'custom', label: 'Custom Pattern', description: 'Define your own pattern' }
]

export default function BarcodeGenerator({ 
  onSelectCode, 
  mode = 'standalone', 
  initialType = 'barcode' 
}: BarcodeGeneratorProps) {
  const [activeType, setActiveType] = useState<'barcode' | 'sku'>(initialType)
  const [generatedCodes, setGeneratedCodes] = useState<GeneratedCode[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterUsed, setFilterUsed] = useState<'all' | 'used' | 'unused'>('all')
  const [showImportModal, setShowImportModal] = useState(false)
  const [importErrors, setImportErrors] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Barcode generation state
  const [barcodeFormat, setBarcodeFormat] = useState('ean13')
  const [barcodeQuantity, setBarcodeQuantity] = useState(1)
  const [barcodePrefix, setBarcodePrefix] = useState('')
  
  // SKU generation state  
  const [skuPattern, setSkuPattern] = useState('cat-prod-var')
  const [skuQuantity, setSkuQuantity] = useState(1)
  const [customPattern, setCustomPattern] = useState('')
  const [categoryCode, setCategoryCode] = useState('')
  const [productName, setProductName] = useState('')
  const [variantInfo, setVariantInfo] = useState('')

  useEffect(() => {
    loadGeneratedCodes()
  }, [])

  const loadGeneratedCodes = () => {
    // Load from localStorage for now - in production this would come from database
    const saved = localStorage.getItem('generated-codes')
    if (saved) {
      const codes = JSON.parse(saved).map((code: any) => ({
        ...code,
        createdAt: new Date(code.createdAt)
      }))
      setGeneratedCodes(codes)
    }
  }

  const saveGeneratedCodes = (codes: GeneratedCode[]) => {
    localStorage.setItem('generated-codes', JSON.stringify(codes))
  }

  const generateEAN13 = (): string => {
    // Generate 12 digits, then calculate check digit
    let digits = barcodePrefix.padEnd(12, '0').substring(0, 12)
    if (digits.length < 12) {
      digits += Math.random().toString().substring(2, 14 - digits.length)
    }
    
    // Calculate EAN-13 check digit
    let sum = 0
    for (let i = 0; i < 12; i++) {
      sum += parseInt(digits[i]) * (i % 2 === 0 ? 1 : 3)
    }
    const checkDigit = (10 - (sum % 10)) % 10
    
    return digits + checkDigit
  }

  const generateUPC = (): string => {
    // Generate 11 digits, then calculate check digit
    let digits = barcodePrefix.padEnd(11, '0').substring(0, 11)
    if (digits.length < 11) {
      digits += Math.random().toString().substring(2, 13 - digits.length)
    }
    
    // Calculate UPC check digit
    let sum = 0
    for (let i = 0; i < 11; i++) {
      sum += parseInt(digits[i]) * (i % 2 === 0 ? 3 : 1)
    }
    const checkDigit = (10 - (sum % 10)) % 10
    
    return digits + checkDigit
  }

  const generateCode128 = (): string => {
    const length = Math.max(8, Math.min(20, barcodePrefix.length + 6))
    let code = barcodePrefix
    while (code.length < length) {
      code += Math.random().toString(36).substring(2, 4).toUpperCase()
    }
    return code.substring(0, length)
  }

  const generateBarcode = (): string => {
    switch (barcodeFormat) {
      case 'ean13':
        return generateEAN13()
      case 'upc':
        return generateUPC()
      case 'code128':
        return generateCode128()
      default:
        return barcodePrefix + Math.random().toString().substring(2, 10)
    }
  }

  const generateSKU = (): string => {
    switch (skuPattern) {
      case 'cat-prod-var':
        return inventoryService.generateSKU(categoryCode, productName, variantInfo)
      case 'cat-prod-num':
        const num = Math.floor(Math.random() * 999) + 1
        return `${categoryCode.toUpperCase()}-${productName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 4)}-${num.toString().padStart(3, '0')}`
      case 'date-cat-prod':
        const date = new Date()
        const dateStr = date.getFullYear().toString().substring(2) + 
                       (date.getMonth() + 1).toString().padStart(2, '0') + 
                       date.getDate().toString().padStart(2, '0')
        return `${dateStr}-${categoryCode.toUpperCase()}-${productName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 4)}`
      case 'custom':
        return customPattern.replace(/{(\w+)}/g, (match, key) => {
          switch (key) {
            case 'cat': return categoryCode.toUpperCase()
            case 'prod': return productName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 4)
            case 'var': return variantInfo.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 3)
            case 'date': return new Date().toISOString().substring(0, 10).replace(/-/g, '')
            case 'rand': return Math.random().toString(36).substring(2, 6).toUpperCase()
            default: return match
          }
        })
      default:
        return 'SKU-' + Math.random().toString(36).substring(2, 8).toUpperCase()
    }
  }

  const handleGenerate = async () => {
    setLoading(true)
    
    try {
      const quantity = activeType === 'barcode' ? barcodeQuantity : skuQuantity
      const newCodes: GeneratedCode[] = []
      
      for (let i = 0; i < quantity; i++) {
        let code: string
        let isValid = false
        let attempts = 0
        
        // Try to generate unique code
        do {
          if (activeType === 'barcode') {
            code = generateBarcode()
            isValid = inventoryService.validateBarcode(code)
          } else {
            code = generateSKU()
            isValid = code.length > 3
          }
          
          // Check database for duplicates with tenant scoping
          if (isValid) {
            try {
              await inventoryService.init()
              const tenantId = inventoryService.getTenantId()
              
              let existsInDatabase = false
              if (activeType === 'barcode') {
                existsInDatabase = await inventoryService.checkBarcodeExists(code, tenantId)
              } else {
                existsInDatabase = await inventoryService.checkSKUExists(code, tenantId)
              }
              
              if (existsInDatabase) {
                isValid = false // Force regeneration
              }
            } catch (error) {
              console.error('Error checking database for duplicates:', error)
            }
          }
          
          attempts++
        } while ((!isValid || generatedCodes.some(gc => gc.value === code)) && attempts < 10)
        
        if (isValid) {
          newCodes.push({
            id: `${activeType}_${Date.now()}_${i}`,
            type: activeType,
            value: code,
            format: activeType === 'barcode' ? barcodeFormat : skuPattern,
            productName: productName || undefined,
            category: categoryCode || undefined,
            createdAt: new Date(),
            isUsed: false
          })
        }
      }
      
      const updatedCodes = [...generatedCodes, ...newCodes]
      setGeneratedCodes(updatedCodes)
      saveGeneratedCodes(updatedCodes)
      
    } catch (error) {
      console.error('Error generating codes:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      // Show success feedback
    } catch (error) {
      console.error('Failed to copy code:', error)
    }
  }

  const handleSelectCode = (code: GeneratedCode) => {
    if (onSelectCode) {
      onSelectCode(code.value)
      
      // Mark as used
      const updatedCodes = generatedCodes.map(gc => 
        gc.id === code.id ? { ...gc, isUsed: true } : gc
      )
      setGeneratedCodes(updatedCodes)
      saveGeneratedCodes(updatedCodes)
    }
  }

  const handleDownloadCodes = () => {
    const csvContent = [
      'Type,Value,Format,Product,Category,Created,Used',
      ...generatedCodes.map(code => 
        `${code.type},${code.value},${code.format},${code.productName || ''},${code.category || ''},${code.createdAt.toISOString()},${code.isUsed}`
      )
    ].join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `generated-codes-${new Date().toISOString().substring(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportCodes = () => {
    setShowImportModal(true)
    setImportErrors([])
  }

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setLoading(true)
    
    try {
      await inventoryService.init()
      const tenantId = inventoryService.getTenantId()
      
      const text = await file.text()
      const lines = text.split('\n')
      const headers = lines[0].split(',')
      
      if (!headers.includes('Type') || !headers.includes('Value')) {
        setImportErrors(['Invalid CSV format. Required columns: Type, Value'])
        return
      }

      const newCodes: GeneratedCode[] = []
      const errors: string[] = []
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue
        
        const values = line.split(',')
        const typeIndex = headers.indexOf('Type')
        const valueIndex = headers.indexOf('Value')
        const formatIndex = headers.indexOf('Format')
        const productIndex = headers.indexOf('Product')
        const categoryIndex = headers.indexOf('Category')
        
        const type = values[typeIndex]?.toLowerCase()
        const value = values[valueIndex]
        
        if (!type || !value) {
          errors.push(`Line ${i + 1}: Missing type or value`)
          continue
        }
        
        if (type !== 'barcode' && type !== 'sku') {
          errors.push(`Line ${i + 1}: Invalid type '${type}'. Must be 'barcode' or 'sku'`)
          continue
        }
        
        // Validate barcode/SKU format
        let isValid = false
        if (type === 'barcode') {
          isValid = inventoryService.validateBarcode(value)
        } else {
          isValid = value.length > 3
        }
        
        if (!isValid) {
          errors.push(`Line ${i + 1}: Invalid ${type} format: ${value}`)
          continue
        }
        
        // Check for duplicates in existing codes
        if (generatedCodes.some(gc => gc.value === value)) {
          errors.push(`Line ${i + 1}: Duplicate code in generator: ${value}`)
          continue
        }
        
        // Check for duplicates in database with tenant scoping
        try {
          let existsInDatabase = false
          if (type === 'barcode') {
            existsInDatabase = await inventoryService.checkBarcodeExists(value, tenantId)
          } else {
            existsInDatabase = await inventoryService.checkSKUExists(value, tenantId)
          }
          
          if (existsInDatabase) {
            errors.push(`Line ${i + 1}: ${type.toUpperCase()} already exists in database: ${value}`)
            continue
          }
        } catch (error) {
          console.error(`Error checking ${type} ${value}:`, error)
          errors.push(`Line ${i + 1}: Error validating ${type}: ${value}`)
          continue
        }
        
        newCodes.push({
          id: `imported_${Date.now()}_${i}`,
          type: type as 'barcode' | 'sku',
          value,
          format: values[formatIndex] || (type === 'barcode' ? 'imported' : 'imported'),
          productName: values[productIndex] || undefined,
          category: values[categoryIndex] || undefined,
          createdAt: new Date(),
          isUsed: false
        })
      }
      
      if (errors.length > 0) {
        setImportErrors(errors)
      }
      
      if (newCodes.length > 0) {
        const updatedCodes = [...generatedCodes, ...newCodes]
        setGeneratedCodes(updatedCodes)
        saveGeneratedCodes(updatedCodes)
        
        if (errors.length === 0) {
          setShowImportModal(false)
          // Show success message
          alert(`Successfully imported ${newCodes.length} codes!`)
        }
      } else if (errors.length === 0) {
        setImportErrors(['No valid codes found in CSV file'])
      }
      
    } catch (error) {
      console.error('Import error:', error)
      setImportErrors(['Failed to parse CSV file. Please check the format.'])
    } finally {
      setLoading(false)
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const filteredCodes = generatedCodes
    .filter(code => {
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase()
        return code.value.toLowerCase().includes(searchLower) ||
               code.productName?.toLowerCase().includes(searchLower) ||
               code.category?.toLowerCase().includes(searchLower)
      }
      return true
    })
    .filter(code => {
      switch (filterUsed) {
        case 'used': return code.isUsed
        case 'unused': return !code.isUsed
        default: return true
      }
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  return (
    <div className="space-y-6">
      {/* Header */}
      {mode === 'standalone' && (
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Barcode & SKU Generator</h1>
          <p className="mt-1 text-sm text-gray-500">
            Generate unique barcodes and SKUs for your products
          </p>
        </div>
      )}

      {/* Type Selection */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex space-x-4 mb-6">
          <button
            onClick={() => setActiveType('barcode')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeType === 'barcode'
                ? 'bg-blue-100 text-blue-700 border-2 border-blue-200'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Barcode className="w-5 h-5 inline mr-2" />
            Generate Barcodes
          </button>
          <button
            onClick={() => setActiveType('sku')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeType === 'sku'
                ? 'bg-blue-100 text-blue-700 border-2 border-blue-200'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Generate SKUs
          </button>
        </div>

        {/* Barcode Generation Form */}
        {activeType === 'barcode' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Barcode Format
              </label>
              <select
                value={barcodeFormat}
                onChange={(e) => setBarcodeFormat(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {BARCODE_FORMATS.map((format) => (
                  <option key={format.value} value={format.value}>
                    {format.label} - {format.description}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quantity
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={barcodeQuantity}
                onChange={(e) => setBarcodeQuantity(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Prefix (Optional)
              </label>
              <input
                type="text"
                value={barcodePrefix}
                onChange={(e) => setBarcodePrefix(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., company code or product prefix"
                maxLength={8}
              />
            </div>
          </div>
        )}

        {/* SKU Generation Form */}
        {activeType === 'sku' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  SKU Pattern
                </label>
                <select
                  value={skuPattern}
                  onChange={(e) => setSkuPattern(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {SKU_PATTERNS.map((pattern) => (
                    <option key={pattern.value} value={pattern.value}>
                      {pattern.label} - {pattern.description}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={skuQuantity}
                  onChange={(e) => setSkuQuantity(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {skuPattern === 'custom' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Custom Pattern
                </label>
                <input
                  type="text"
                  value={customPattern}
                  onChange={(e) => setCustomPattern(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., {cat}-{prod}-{var}-{rand}"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Available variables: {'{cat}'} (category), {'{prod}'} (product), {'{var}'} (variant), {'{date}'} (current date), {'{rand}'} (random)
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Category Code
                  </label>
                  <input
                    type="text"
                    value={categoryCode}
                    onChange={(e) => setCategoryCode(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., BEV, FOO"
                    maxLength={5}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Product Name
                  </label>
                  <input
                    type="text"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., Coffee Mug"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Variant Info (Optional)
                  </label>
                  <input
                    type="text"
                    value={variantInfo}
                    onChange={(e) => setVariantInfo(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., Large, Red"
                    maxLength={10}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-6">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Generating...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Generate {activeType === 'barcode' ? 'Barcodes' : 'SKUs'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Generated Codes List */}
      {generatedCodes.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <h3 className="text-lg font-medium text-gray-900">Generated Codes</h3>
              
              <div className="flex items-center space-x-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search codes..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <select
                  value={filterUsed}
                  onChange={(e) => setFilterUsed(e.target.value as any)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">All</option>
                  <option value="used">Used</option>
                  <option value="unused">Unused</option>
                </select>
                
                <button
                  onClick={handleImportCodes}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Import
                </button>
                
                <button
                  onClick={handleDownloadCodes}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </button>
              </div>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {filteredCodes.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No codes match your search criteria
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {filteredCodes.map((code) => (
                  <div
                    key={code.id}
                    className="p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-3">
                          <code className="font-mono text-lg font-medium text-gray-900 bg-gray-100 px-2 py-1 rounded">
                            {code.value}
                          </code>
                          
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            code.type === 'barcode' 
                              ? 'bg-blue-100 text-blue-800' 
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {code.type.toUpperCase()}
                          </span>
                          
                          {code.isUsed && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              <Check className="w-3 h-3 mr-1" />
                              Used
                            </span>
                          )}
                        </div>
                        
                        <div className="mt-1 text-sm text-gray-500">
                          Format: {code.format}
                          {code.productName && ` • Product: ${code.productName}`}
                          {code.category && ` • Category: ${code.category}`}
                          • Created: {code.createdAt.toLocaleString()}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleCopyCode(code.value)}
                          className="p-2 text-gray-400 hover:text-gray-600 rounded-md transition-colors"
                          title="Copy to clipboard"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        
                        {mode === 'selector' && onSelectCode && (
                          <button
                            onClick={() => handleSelectCode(code)}
                            className="px-3 py-1 text-sm font-medium text-blue-600 border border-blue-600 rounded-md hover:bg-blue-50 transition-colors"
                          >
                            Select
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Import Codes from CSV
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select CSV File
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileImport}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div className="text-sm text-gray-500">
                  <p className="mb-2">CSV should contain columns:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li><strong>Type</strong> - 'barcode' or 'sku'</li>
                    <li><strong>Value</strong> - The barcode/SKU value</li>
                    <li>Format - Optional format identifier</li>
                    <li>Product - Optional product name</li>
                    <li>Category - Optional category</li>
                  </ul>
                </div>
                
                {importErrors.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-3">
                    <div className="flex">
                      <AlertCircle className="w-5 h-5 text-red-400 mr-2 flex-shrink-0" />
                      <div>
                        <h4 className="text-sm font-medium text-red-800 mb-1">Import Errors:</h4>
                        <ul className="text-sm text-red-700 space-y-1">
                          {importErrors.map((error, index) => (
                            <li key={index}>• {error}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}