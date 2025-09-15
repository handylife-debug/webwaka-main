'use client'

import { useState, useEffect } from 'react'
import { Calculator, Settings, Plus, Trash2, Edit, Check, X } from 'lucide-react'

// Tax and Fee Types
export interface TaxRate {
  id: string
  name: string
  rate: number // percentage (0-100)
  type: 'inclusive' | 'exclusive'
  applicable: 'all' | 'category' | 'product'
  applicableIds?: string[] // category names or product IDs
  active: boolean
  isDefault: boolean
  description?: string
}

export interface CustomFee {
  id: string
  name: string
  amount: number
  type: 'fixed' | 'percentage'
  applicable: 'all' | 'category' | 'product'
  applicableIds?: string[]
  active: boolean
  description?: string
}

export interface CartItem {
  id: string
  name: string
  price: number
  categoryId?: string
  stock: number
  quantity: number
  image?: string
}

export interface TaxCalculation {
  id: string
  name: string
  rate: number
  amount: number
  type: 'inclusive' | 'exclusive'
  itemsAffected: string[]
}

export interface FeeCalculation {
  id: string
  name: string
  amount: number
  type: 'fixed' | 'percentage'
  itemsAffected: string[]
}

interface TaxAndFeeCellProps {
  cartItems: CartItem[]
  subtotal: number
  onTaxAndFeesCalculated: (
    taxes: TaxCalculation[], 
    fees: FeeCalculation[], 
    newSubtotal: number,
    totalTax: number,
    totalFees: number
  ) => void
  isVisible: boolean
  onClose: () => void
}

export default function TaxAndFeeCell({
  cartItems,
  subtotal,
  onTaxAndFeesCalculated,
  isVisible,
  onClose
}: TaxAndFeeCellProps) {
  // State management
  const [taxRates, setTaxRates] = useState<TaxRate[]>([])
  const [customFees, setCustomFees] = useState<CustomFee[]>([])
  const [calculatedTaxes, setCalculatedTaxes] = useState<TaxCalculation[]>([])
  const [calculatedFees, setCalculatedFees] = useState<FeeCalculation[]>([])
  
  // UI state
  const [activeTab, setActiveTab] = useState<'taxes' | 'fees' | 'settings'>('taxes')
  const [showNewTax, setShowNewTax] = useState(false)
  const [showNewFee, setShowNewFee] = useState(false)
  const [editingTax, setEditingTax] = useState<TaxRate | null>(null)
  const [editingFee, setEditingFee] = useState<CustomFee | null>(null)
  
  // Form state
  const [newTax, setNewTax] = useState<Partial<TaxRate>>({
    type: 'exclusive',
    applicable: 'all',
    active: true,
    isDefault: false
  })
  const [newFee, setNewFee] = useState<Partial<CustomFee>>({
    type: 'fixed',
    applicable: 'all',
    active: true
  })

  // Sample data initialization
  useEffect(() => {
    // Initialize with Nigerian tax rates
    setTaxRates([
      {
        id: 'vat',
        name: 'VAT (Value Added Tax)',
        rate: 7.5,
        type: 'exclusive',
        applicable: 'all',
        active: true,
        isDefault: true,
        description: 'Standard Nigerian VAT rate'
      },
      {
        id: 'service_tax',
        name: 'Service Tax',
        rate: 5.0,
        type: 'exclusive',
        applicable: 'category',
        applicableIds: ['Food'],
        active: false,
        isDefault: false,
        description: 'Service tax on food items'
      },
      {
        id: 'luxury_tax',
        name: 'Luxury Tax',
        rate: 10.0,
        type: 'exclusive',
        applicable: 'product',
        active: false,
        isDefault: false,
        description: 'Tax on luxury items'
      }
    ])

    // Initialize with sample fees
    setCustomFees([
      {
        id: 'service_fee',
        name: 'Service Fee',
        amount: 2.50,
        type: 'fixed',
        applicable: 'all',
        active: false,
        description: 'General service fee'
      },
      {
        id: 'delivery_fee',
        name: 'Delivery Fee',
        amount: 5.00,
        type: 'fixed',
        applicable: 'all',
        active: false,
        description: 'Delivery service charge'
      },
      {
        id: 'processing_fee',
        name: 'Processing Fee',
        amount: 2.0,
        type: 'percentage',
        applicable: 'all',
        active: false,
        description: '2% processing fee'
      }
    ])
  }, [])

  // Calculate taxes and fees when data changes
  useEffect(() => {
    calculateTaxesAndFees()
  }, [cartItems, subtotal, taxRates, customFees])

  const calculateTaxesAndFees = () => {
    const taxes: TaxCalculation[] = []
    const fees: FeeCalculation[] = []
    
    let workingSubtotal = subtotal
    let totalTaxAmount = 0
    let totalFeeAmount = 0

    // Calculate taxes
    taxRates.forEach(taxRate => {
      if (!taxRate.active) return

      const taxCalc = calculateTax(taxRate, cartItems, workingSubtotal)
      if (taxCalc.amount > 0) {
        taxes.push(taxCalc)
        totalTaxAmount += taxCalc.amount
        
        // For inclusive taxes, we need to adjust the working subtotal
        if (taxRate.type === 'inclusive') {
          workingSubtotal -= taxCalc.amount
        }
      }
    })

    // Calculate fees
    customFees.forEach(fee => {
      if (!fee.active) return

      const feeCalc = calculateFee(fee, cartItems, workingSubtotal)
      if (feeCalc.amount > 0) {
        fees.push(feeCalc)
        totalFeeAmount += feeCalc.amount
      }
    })

    setCalculatedTaxes(taxes)
    setCalculatedFees(fees)
    onTaxAndFeesCalculated(taxes, fees, workingSubtotal, totalTaxAmount, totalFeeAmount)
  }

  const calculateTax = (taxRate: TaxRate, items: CartItem[], currentSubtotal: number): TaxCalculation => {
    let taxableAmount = 0
    let itemsAffected: string[] = []

    switch (taxRate.applicable) {
      case 'all':
        taxableAmount = currentSubtotal
        itemsAffected = items.map(item => item.id)
        break

      case 'category':
        const categoryItems = items.filter(item => 
          taxRate.applicableIds?.includes(item.categoryId || '')
        )
        taxableAmount = categoryItems.reduce((sum, item) => 
          sum + (item.price * item.quantity), 0
        )
        itemsAffected = categoryItems.map(item => item.id)
        break

      case 'product':
        const productItems = items.filter(item => 
          taxRate.applicableIds?.includes(item.id)
        )
        taxableAmount = productItems.reduce((sum, item) => 
          sum + (item.price * item.quantity), 0
        )
        itemsAffected = productItems.map(item => item.id)
        break
    }

    let taxAmount = 0
    if (taxRate.type === 'exclusive') {
      // Tax calculated on top of price
      taxAmount = taxableAmount * (taxRate.rate / 100)
    } else {
      // Tax included in price (VAT inclusive)
      taxAmount = taxableAmount * (taxRate.rate / (100 + taxRate.rate))
    }

    return {
      id: taxRate.id,
      name: taxRate.name,
      rate: taxRate.rate,
      amount: taxAmount,
      type: taxRate.type,
      itemsAffected
    }
  }

  const calculateFee = (fee: CustomFee, items: CartItem[], currentSubtotal: number): FeeCalculation => {
    let applicableAmount = 0
    let itemsAffected: string[] = []

    switch (fee.applicable) {
      case 'all':
        applicableAmount = currentSubtotal
        itemsAffected = items.map(item => item.id)
        break

      case 'category':
        const categoryItems = items.filter(item => 
          fee.applicableIds?.includes(item.categoryId || '')
        )
        applicableAmount = categoryItems.reduce((sum, item) => 
          sum + (item.price * item.quantity), 0
        )
        itemsAffected = categoryItems.map(item => item.id)
        break

      case 'product':
        const productItems = items.filter(item => 
          fee.applicableIds?.includes(item.id)
        )
        applicableAmount = productItems.reduce((sum, item) => 
          sum + (item.price * item.quantity), 0
        )
        itemsAffected = productItems.map(item => item.id)
        break
    }

    let feeAmount = 0
    if (fee.type === 'fixed') {
      feeAmount = fee.amount
    } else {
      feeAmount = applicableAmount * (fee.amount / 100)
    }

    return {
      id: fee.id,
      name: fee.name,
      amount: feeAmount,
      type: fee.type,
      itemsAffected
    }
  }

  const addTaxRate = () => {
    if (!newTax.name || !newTax.rate) {
      alert('Please fill in tax name and rate')
      return
    }

    const taxRate: TaxRate = {
      id: `tax_${Date.now()}`,
      name: newTax.name!,
      rate: newTax.rate!,
      type: newTax.type!,
      applicable: newTax.applicable!,
      applicableIds: newTax.applicableIds,
      active: newTax.active!,
      isDefault: newTax.isDefault!,
      description: newTax.description
    }

    setTaxRates(prev => [...prev, taxRate])
    setNewTax({
      type: 'exclusive',
      applicable: 'all',
      active: true,
      isDefault: false
    })
    setShowNewTax(false)
  }

  const addCustomFee = () => {
    if (!newFee.name || !newFee.amount) {
      alert('Please fill in fee name and amount')
      return
    }

    const fee: CustomFee = {
      id: `fee_${Date.now()}`,
      name: newFee.name!,
      amount: newFee.amount!,
      type: newFee.type!,
      applicable: newFee.applicable!,
      applicableIds: newFee.applicableIds,
      active: newFee.active!,
      description: newFee.description
    }

    setCustomFees(prev => [...prev, fee])
    setNewFee({
      type: 'fixed',
      applicable: 'all',
      active: true
    })
    setShowNewFee(false)
  }

  const toggleTaxActive = (taxId: string) => {
    setTaxRates(prev => 
      prev.map(tax => 
        tax.id === taxId ? { ...tax, active: !tax.active } : tax
      )
    )
  }

  const toggleFeeActive = (feeId: string) => {
    setCustomFees(prev => 
      prev.map(fee => 
        fee.id === feeId ? { ...fee, active: !fee.active } : fee
      )
    )
  }

  const deleteTaxRate = (taxId: string) => {
    setTaxRates(prev => prev.filter(tax => tax.id !== taxId))
  }

  const deleteCustomFee = (feeId: string) => {
    setCustomFees(prev => prev.filter(fee => fee.id !== feeId))
  }

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Tax & Fee Management</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              ×
            </button>
          </div>

          {/* Tabs */}
          <div className="flex space-x-1 mt-4 bg-gray-100 rounded-lg p-1">
            {[
              { id: 'taxes', label: 'Tax Rates', icon: Calculator },
              { id: 'fees', label: 'Custom Fees', icon: Plus },
              { id: 'settings', label: 'Settings', icon: Settings }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-md font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {/* Tax and Fee Summary */}
          {(calculatedTaxes.length > 0 || calculatedFees.length > 0) && (
            <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-800 mb-3">Applied Taxes & Fees</h3>
              <div className="space-y-2">
                {calculatedTaxes.map(tax => (
                  <div key={tax.id} className="flex justify-between items-center text-sm">
                    <span className="text-blue-700">
                      {tax.name} ({tax.rate}% {tax.type})
                    </span>
                    <span className="font-medium text-blue-800">
                      ${tax.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
                {calculatedFees.map(fee => (
                  <div key={fee.id} className="flex justify-between items-center text-sm">
                    <span className="text-blue-700">
                      {fee.name} ({fee.type})
                    </span>
                    <span className="font-medium text-blue-800">
                      ${fee.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
                <div className="border-t border-blue-200 pt-2">
                  <div className="flex justify-between items-center font-semibold">
                    <span>Total Taxes & Fees:</span>
                    <span className="text-blue-800">
                      ${(
                        calculatedTaxes.reduce((sum, t) => sum + t.amount, 0) +
                        calculatedFees.reduce((sum, f) => sum + f.amount, 0)
                      ).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab Content */}
          {activeTab === 'taxes' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Tax Rates</h3>
                <button
                  onClick={() => setShowNewTax(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Tax Rate</span>
                </button>
              </div>

              {/* Tax Rates List */}
              <div className="space-y-3">
                {taxRates.map(tax => (
                  <div key={tax.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <h4 className="font-medium text-gray-900">{tax.name}</h4>
                          {tax.isDefault && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                              Default
                            </span>
                          )}
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            tax.type === 'inclusive' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-orange-100 text-orange-800'
                          }`}>
                            {tax.type.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {tax.rate}% • {tax.applicable === 'all' ? 'All items' : 
                           tax.applicable === 'category' ? `Categories: ${tax.applicableIds?.join(', ')}` :
                           `Products: ${tax.applicableIds?.join(', ')}`}
                        </p>
                        {tax.description && (
                          <p className="text-sm text-gray-500 mt-1">{tax.description}</p>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => toggleTaxActive(tax.id)}
                          className={`px-3 py-1 rounded-lg text-sm font-medium ${
                            tax.active
                              ? 'bg-green-100 text-green-800 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {tax.active ? 'Active' : 'Inactive'}
                        </button>
                        {!tax.isDefault && (
                          <button
                            onClick={() => deleteTaxRate(tax.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* New Tax Rate Form */}
              {showNewTax && (
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <h4 className="font-medium mb-4">Add New Tax Rate</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="text"
                      placeholder="Tax Name (e.g., VAT)"
                      value={newTax.name || ''}
                      onChange={(e) => setNewTax(prev => ({ ...prev, name: e.target.value }))}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="number"
                      placeholder="Rate (%)"
                      step="0.1"
                      value={newTax.rate || ''}
                      onChange={(e) => setNewTax(prev => ({ ...prev, rate: parseFloat(e.target.value) }))}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <select
                      value={newTax.type}
                      onChange={(e) => setNewTax(prev => ({ ...prev, type: e.target.value as any }))}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="exclusive">Exclusive (added to price)</option>
                      <option value="inclusive">Inclusive (included in price)</option>
                    </select>
                    <select
                      value={newTax.applicable}
                      onChange={(e) => setNewTax(prev => ({ ...prev, applicable: e.target.value as any }))}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">All Items</option>
                      <option value="category">Specific Category</option>
                      <option value="product">Specific Products</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Description (optional)"
                      value={newTax.description || ''}
                      onChange={(e) => setNewTax(prev => ({ ...prev, description: e.target.value }))}
                      className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex space-x-2 mt-4">
                    <button
                      onClick={addTaxRate}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                    >
                      Add Tax Rate
                    </button>
                    <button
                      onClick={() => setShowNewTax(false)}
                      className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'fees' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Custom Fees</h3>
                <button
                  onClick={() => setShowNewFee(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Custom Fee</span>
                </button>
              </div>

              {/* Custom Fees List */}
              <div className="space-y-3">
                {customFees.map(fee => (
                  <div key={fee.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">{fee.name}</h4>
                        <p className="text-sm text-gray-600 mt-1">
                          {fee.type === 'fixed' ? `$${fee.amount.toFixed(2)}` : `${fee.amount}%`} • 
                          {fee.applicable === 'all' ? 'All items' : 
                           fee.applicable === 'category' ? `Categories: ${fee.applicableIds?.join(', ')}` :
                           `Products: ${fee.applicableIds?.join(', ')}`}
                        </p>
                        {fee.description && (
                          <p className="text-sm text-gray-500 mt-1">{fee.description}</p>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => toggleFeeActive(fee.id)}
                          className={`px-3 py-1 rounded-lg text-sm font-medium ${
                            fee.active
                              ? 'bg-green-100 text-green-800 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {fee.active ? 'Active' : 'Inactive'}
                        </button>
                        <button
                          onClick={() => deleteCustomFee(fee.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* New Custom Fee Form */}
              {showNewFee && (
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <h4 className="font-medium mb-4">Add Custom Fee</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="text"
                      placeholder="Fee Name (e.g., Service Fee)"
                      value={newFee.name || ''}
                      onChange={(e) => setNewFee(prev => ({ ...prev, name: e.target.value }))}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="number"
                      placeholder="Amount"
                      step="0.01"
                      value={newFee.amount || ''}
                      onChange={(e) => setNewFee(prev => ({ ...prev, amount: parseFloat(e.target.value) }))}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <select
                      value={newFee.type}
                      onChange={(e) => setNewFee(prev => ({ ...prev, type: e.target.value as any }))}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="fixed">Fixed Amount ($)</option>
                      <option value="percentage">Percentage (%)</option>
                    </select>
                    <select
                      value={newFee.applicable}
                      onChange={(e) => setNewFee(prev => ({ ...prev, applicable: e.target.value as any }))}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">All Items</option>
                      <option value="category">Specific Category</option>
                      <option value="product">Specific Products</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Description (optional)"
                      value={newFee.description || ''}
                      onChange={(e) => setNewFee(prev => ({ ...prev, description: e.target.value }))}
                      className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex space-x-2 mt-4">
                    <button
                      onClick={addCustomFee}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                    >
                      Add Fee
                    </button>
                    <button
                      onClick={() => setShowNewFee(false)}
                      className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold">Tax & Fee Settings</h3>
              
              <div className="grid grid-cols-1 gap-6">
                {/* Tax Calculation Method */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h4 className="font-medium mb-3">Tax Calculation Method</h4>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <input type="radio" id="exclusive" name="taxMethod" defaultChecked />
                      <label htmlFor="exclusive" className="text-sm">
                        <strong>Exclusive Pricing:</strong> Tax added to displayed prices
                      </label>
                    </div>
                    <div className="flex items-center space-x-3">
                      <input type="radio" id="inclusive" name="taxMethod" />
                      <label htmlFor="inclusive" className="text-sm">
                        <strong>Inclusive Pricing:</strong> Tax included in displayed prices
                      </label>
                    </div>
                  </div>
                </div>

                {/* Default Tax Rates */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h4 className="font-medium mb-3">Default Tax Rates</h4>
                  <div className="space-y-2">
                    {taxRates.filter(tax => tax.isDefault).map(tax => (
                      <div key={tax.id} className="flex justify-between items-center py-2">
                        <span>{tax.name}</span>
                        <span className="font-medium">{tax.rate}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Fee Application Order */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h4 className="font-medium mb-3">Calculation Order</h4>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>1. Apply promotions and discounts</p>
                    <p>2. Calculate taxes on discounted amount</p>
                    <p>3. Apply custom fees</p>
                    <p>4. Generate final total</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}