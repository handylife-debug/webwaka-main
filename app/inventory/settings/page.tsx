'use client'

import { useState } from 'react'
import { Settings, Save, RefreshCw, Download, Upload, Trash2, AlertCircle } from 'lucide-react'

interface InventorySettings {
  autoGenerateSKU: boolean
  skuPattern: string
  lowStockThreshold: number
  enableBarcodeValidation: boolean
  defaultTaxRate: number
  defaultUnitOfMeasure: string
  categoryCodeLength: number
  enableVariants: boolean
  enableSupplierManagement: boolean
  enableStockAlerts: boolean
}

export default function InventorySettingsPage() {
  const [settings, setSettings] = useState<InventorySettings>({
    autoGenerateSKU: true,
    skuPattern: '{cat}-{prod}-{rand}',
    lowStockThreshold: 10,
    enableBarcodeValidation: true,
    defaultTaxRate: 0.085,
    defaultUnitOfMeasure: 'Each',
    categoryCodeLength: 3,
    enableVariants: true,
    enableSupplierManagement: true,
    enableStockAlerts: true
  })

  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setLoading(true)
    setSaved(false)
    
    try {
      // Save settings to localStorage for now - would integrate with backend in production
      localStorage.setItem('inventory-settings', JSON.stringify(settings))
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      
    } catch (error) {
      console.error('Error saving settings:', error)
      alert('Failed to save settings. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    if (window.confirm('Are you sure you want to reset all settings to default values? This action cannot be undone.')) {
      setSettings({
        autoGenerateSKU: true,
        skuPattern: '{cat}-{prod}-{rand}',
        lowStockThreshold: 10,
        enableBarcodeValidation: true,
        defaultTaxRate: 0.085,
        defaultUnitOfMeasure: 'Each',
        categoryCodeLength: 3,
        enableVariants: true,
        enableSupplierManagement: true,
        enableStockAlerts: true
      })
    }
  }

  const handleExport = () => {
    const data = {
      settings,
      exportedAt: new Date().toISOString(),
      version: '1.0'
    }
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inventory-settings-${new Date().toISOString().substring(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string)
        if (data.settings) {
          setSettings({ ...settings, ...data.settings })
        }
      } catch (error) {
        console.error('Error importing settings:', error)
        alert('Invalid settings file. Please check the format and try again.')
      }
    }
    reader.readAsText(file)
    event.target.value = '' // Reset input
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory Settings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Configure your inventory management preferences and defaults
          </p>
        </div>
        
        <div className="flex items-center space-x-2">
          <label className="relative cursor-pointer">
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              className="sr-only"
            />
            <div className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors">
              <Upload className="w-4 h-4 mr-2" />
              Import
            </div>
          </label>
          
          <button
            onClick={handleExport}
            className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Product Management Settings */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            <Settings className="w-5 h-5 inline mr-2" />
            Product Management
          </h3>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700">Auto-generate SKUs</label>
                <p className="text-xs text-gray-500">Automatically generate SKUs for new products</p>
              </div>
              <input
                type="checkbox"
                checked={settings.autoGenerateSKU}
                onChange={(e) => setSettings(prev => ({ ...prev, autoGenerateSKU: e.target.checked }))}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
            </div>

            {settings.autoGenerateSKU && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SKU Pattern</label>
                <input
                  type="text"
                  value={settings.skuPattern}
                  onChange={(e) => setSettings(prev => ({ ...prev, skuPattern: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="{cat}-{prod}-{rand}"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Available variables: {'{cat}'} (category), {'{prod}'} (product), {'{rand}'} (random), {'{date}'} (current date)
                </p>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700">Enable Product Variants</label>
                <p className="text-xs text-gray-500">Allow products to have size, color, and style variants</p>
              </div>
              <input
                type="checkbox"
                checked={settings.enableVariants}
                onChange={(e) => setSettings(prev => ({ ...prev, enableVariants: e.target.checked }))}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700">Enable Supplier Management</label>
                <p className="text-xs text-gray-500">Track and manage product suppliers</p>
              </div>
              <input
                type="checkbox"
                checked={settings.enableSupplierManagement}
                onChange={(e) => setSettings(prev => ({ ...prev, enableSupplierManagement: e.target.checked }))}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Default Unit of Measure</label>
              <select
                value={settings.defaultUnitOfMeasure}
                onChange={(e) => setSettings(prev => ({ ...prev, defaultUnitOfMeasure: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="Each">Each</option>
                <option value="Box">Box</option>
                <option value="Case">Case</option>
                <option value="Dozen">Dozen</option>
                <option value="Kilogram">Kilogram</option>
                <option value="Gram">Gram</option>
                <option value="Liter">Liter</option>
                <option value="Milliliter">Milliliter</option>
                <option value="Pair">Pair</option>
                <option value="Set">Set</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category Code Length</label>
              <input
                type="number"
                min="2"
                max="10"
                value={settings.categoryCodeLength}
                onChange={(e) => setSettings(prev => ({ ...prev, categoryCodeLength: parseInt(e.target.value) || 3 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Number of characters for category codes</p>
            </div>
          </div>
        </div>

        {/* Inventory Tracking Settings */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Inventory Tracking
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Low Stock Threshold</label>
              <input
                type="number"
                min="0"
                value={settings.lowStockThreshold}
                onChange={(e) => setSettings(prev => ({ ...prev, lowStockThreshold: parseInt(e.target.value) || 0 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Alert when stock falls below this level</p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700">Enable Stock Alerts</label>
                <p className="text-xs text-gray-500">Notify when products are running low</p>
              </div>
              <input
                type="checkbox"
                checked={settings.enableStockAlerts}
                onChange={(e) => setSettings(prev => ({ ...prev, enableStockAlerts: e.target.checked }))}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700">Enable Barcode Validation</label>
                <p className="text-xs text-gray-500">Validate barcode format when entering products</p>
              </div>
              <input
                type="checkbox"
                checked={settings.enableBarcodeValidation}
                onChange={(e) => setSettings(prev => ({ ...prev, enableBarcodeValidation: e.target.checked }))}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Default Tax Rate (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.001"
                value={(settings.defaultTaxRate * 100).toFixed(3)}
                onChange={(e) => setSettings(prev => ({ ...prev, defaultTaxRate: parseFloat(e.target.value) / 100 || 0 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Default tax rate for new categories</p>
            </div>
          </div>
        </div>
      </div>

      {/* System Information */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">System Information</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <label className="font-medium text-gray-700">Database Status</label>
            <p className="text-green-600">Connected</p>
          </div>
          <div>
            <label className="font-medium text-gray-700">Last Sync</label>
            <p className="text-gray-900">{new Date().toLocaleString()}</p>
          </div>
          <div>
            <label className="font-medium text-gray-700">Version</label>
            <p className="text-gray-900">1.0.0</p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between items-center pt-6 border-t border-gray-200">
        <button
          onClick={handleReset}
          className="inline-flex items-center px-4 py-2 border border-red-300 rounded-md text-sm font-medium text-red-700 bg-white hover:bg-red-50 transition-colors"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Reset to Defaults
        </button>
        
        <div className="flex items-center space-x-3">
          {saved && (
            <div className="flex items-center text-green-600 text-sm">
              <AlertCircle className="w-4 h-4 mr-1" />
              Settings saved successfully
            </div>
          )}
          
          <button
            onClick={handleSave}
            disabled={loading}
            className="inline-flex items-center px-6 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Settings
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}