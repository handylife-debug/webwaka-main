'use client'

import { useState, useEffect } from 'react'
import { ShoppingCart, Search, Menu, CreditCard, DollarSign, Package, Users, BarChart3, Minus, Plus, X } from 'lucide-react'
import TransactionProcessingCell, { PaymentResult, SplitPayment, DraftSale } from './components/TransactionProcessingCell'

interface Product {
  id: string
  name: string
  price: number
  category: string
  stock: number
  image?: string
}

interface CartItem extends Product {
  quantity: number
}

const SAMPLE_PRODUCTS: Product[] = [
  { id: '1', name: 'Espresso', price: 3.50, category: 'Beverages', stock: 50 },
  { id: '2', name: 'Latte', price: 4.25, category: 'Beverages', stock: 45 },
  { id: '3', name: 'Croissant', price: 2.75, category: 'Pastries', stock: 20 },
  { id: '4', name: 'Sandwich', price: 8.95, category: 'Food', stock: 15 },
  { id: '5', name: 'Muffin', price: 3.25, category: 'Pastries', stock: 12 },
  { id: '6', name: 'Cappuccino', price: 4.00, category: 'Beverages', stock: 40 },
]

const CATEGORIES = ['All', 'Beverages', 'Food', 'Pastries']

export default function POSPage() {
  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [searchTerm, setSearchTerm] = useState('')
  const [isExpressMode, setIsExpressMode] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [showCart, setShowCart] = useState(false)
  const [products, setProducts] = useState(SAMPLE_PRODUCTS)
  const [showTransactionProcessing, setShowTransactionProcessing] = useState(false)
  const [draftSales, setDraftSales] = useState<DraftSale[]>([])
  const [showDraftSales, setShowDraftSales] = useState(false)

  // Load cart from localStorage on mount
  useEffect(() => {
    const savedCart = localStorage.getItem('pos-cart')
    if (savedCart) {
      setCart(JSON.parse(savedCart))
    }
    
    // Load draft sales from localStorage
    const savedDrafts = localStorage.getItem('pos-draft-sales')
    if (savedDrafts) {
      setDraftSales(JSON.parse(savedDrafts))
    }
  }, [])

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('pos-cart', JSON.stringify(cart))
  }, [cart])

  const filteredProducts = SAMPLE_PRODUCTS.filter(product => {
    const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesCategory && matchesSearch
  })

  const addToCart = (product: Product) => {
    // Check stock availability
    const currentInCart = cart.find(item => item.id === product.id)?.quantity || 0
    if (currentInCart >= product.stock) {
      alert(`Only ${product.stock} ${product.name} available in stock`)
      return
    }

    setCart(prev => {
      const existing = prev.find(item => item.id === product.id)
      if (existing) {
        return prev.map(item =>
          item.id === product.id 
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }
      return [...prev, { ...product, quantity: 1 }]
    })
    
    // Show cart on mobile when item is added
    if (window.innerWidth < 1024) {
      setShowCart(true)
    }
  }

  const updateQuantity = (id: string, change: number) => {
    setCart(prev => 
      prev.map(item => {
        if (item.id === id) {
          const product = products.find(p => p.id === id)
          if (!product) return item
          
          const newQuantity = item.quantity + change
          
          // Enforce stock limits
          if (newQuantity <= 0) return null
          if (newQuantity > product.stock) {
            alert(`Only ${product.stock} ${product.name} available in stock`)
            return item // Keep current quantity
          }
          
          return { ...item, quantity: newQuantity }
        }
        return item
      }).filter(Boolean) as CartItem[]
    )
  }

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id))
  }

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  const clearCart = () => {
    setCart([])
    setShowPayment(false)
    localStorage.removeItem('pos-cart')
  }

  const processPayment = (method: string) => {
    if (cart.length === 0) return
    
    // For express mode, use simple payment processing
    if (isExpressMode && method === 'Express') {
      // Final validation before payment
      const invalidItems = cart.filter(item => {
        const product = products.find(p => p.id === item.id)
        return !product || item.quantity > product.stock
      })
      
      if (invalidItems.length > 0) {
        const itemNames = invalidItems.map(item => item.name).join(', ')
        alert(`Cannot process payment: insufficient stock for ${itemNames}. Please update your cart.`)
        return
      }
      
      // Update stock levels (atomic operation simulation)
      setProducts(prev => 
        prev.map(product => {
          const cartItem = cart.find(item => item.id === product.id)
          if (cartItem && cartItem.quantity <= product.stock) {
            return { ...product, stock: product.stock - cartItem.quantity }
          }
          return product
        })
      )
      
      const total = (cartTotal * 1.085).toFixed(2)
      alert(`Express payment of $${total} processed successfully!\nReceipt will be printed.`)
      clearCart()
      setShowCart(false)
      return
    }
    
    // For regular payments, open the advanced transaction processing
    setShowTransactionProcessing(true)
    setShowPayment(false)
  }

  const handlePaymentComplete = (result: PaymentResult, splitPayments?: SplitPayment[]) => {
    if (!result.success) {
      alert(`Payment failed: ${result.message}`)
      return
    }

    // Final validation before payment
    const invalidItems = cart.filter(item => {
      const product = products.find(p => p.id === item.id)
      return !product || item.quantity > product.stock
    })
    
    if (invalidItems.length > 0) {
      const itemNames = invalidItems.map(item => item.name).join(', ')
      alert(`Cannot process payment: insufficient stock for ${itemNames}. Please update your cart.`)
      return
    }

    // Update stock levels
    setProducts(prev => 
      prev.map(product => {
        const cartItem = cart.find(item => item.id === product.id)
        if (cartItem && cartItem.quantity <= product.stock) {
          return { ...product, stock: product.stock - cartItem.quantity }
        }
        return product
      })
    )

    // Show success message
    const paymentDetails = splitPayments 
      ? `Split payment completed (${splitPayments.length} transactions)`
      : `Payment processed via ${result.message}`
    
    alert(`${paymentDetails}\nTransaction ID: ${result.transactionId}\nReceipt will be printed.`)
    
    clearCart()
    setShowCart(false)
    setShowTransactionProcessing(false)
  }

  const handleSaveDraft = (draft: DraftSale) => {
    setDraftSales(prev => [...prev, draft])
    localStorage.setItem('pos-draft-sales', JSON.stringify([...draftSales, draft]))
    alert(`Draft sale saved for ${draft.customerInfo?.name || 'Customer'}\nSale ID: ${draft.id}`)
  }

  return (
    <div className="h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => setShowCart(true)}
            className="p-2 hover:bg-gray-100 rounded-lg lg:hidden relative"
          >
            <ShoppingCart className="w-6 h-6" />
            {cartItemCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {cartItemCount}
              </span>
            )}
          </button>
          <h1 className="text-xl font-bold text-gray-900">POS Manager</h1>
        </div>
        
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setShowDraftSales(!showDraftSales)}
            className="px-3 py-2 bg-yellow-600 text-white rounded-lg font-medium hover:bg-yellow-700 transition-colors flex items-center text-sm"
          >
            <Package className="w-4 h-4 mr-1" />
            Drafts ({draftSales.length})
          </button>
          
          <button
            onClick={() => setIsExpressMode(!isExpressMode)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              isExpressMode 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Express Mode
          </button>
          
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <div className="flex items-center">
              <Package className="w-4 h-4 mr-1" />
              <span>142 Items</span>
            </div>
            <div className="flex items-center">
              <Users className="w-4 h-4 mr-1" />
              <span>User: Admin</span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Products Section */}
        <div className="flex-1 flex flex-col p-4">
          {/* Search and Categories */}
          <div className="mb-4 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
              />
            </div>
            
            <div className="flex space-x-2 overflow-x-auto pb-2">
              {CATEGORIES.map(category => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
                    selectedCategory === category
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {/* Products Grid */}
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              {products.filter(product => {
                const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory
                const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase())
                return matchesCategory && matchesSearch
              }).map(product => {
                const cartItem = cart.find(item => item.id === product.id)
                const availableStock = product.stock - (cartItem?.quantity || 0)
                return (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  disabled={availableStock <= 0}
                  className={`bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow border text-left touch-manipulation relative ${
                    availableStock <= 0 
                      ? 'border-red-200 opacity-50 cursor-not-allowed' 
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="aspect-square bg-gray-100 rounded-lg mb-3 flex items-center justify-center">
                    <Package className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">{product.name}</h3>
                  <p className="text-sm text-gray-600 mb-2">{product.category}</p>
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold text-blue-600">${product.price.toFixed(2)}</span>
                    <span className={`text-xs ${availableStock <= 0 ? 'text-red-500' : 'text-gray-500'}`}>
                      {availableStock <= 0 ? 'Out of Stock' : `Stock: ${availableStock}`}
                    </span>
                  </div>
                  {cartItem && (
                    <div className="absolute top-2 right-2 bg-blue-600 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
                      {cartItem.quantity}
                    </div>
                  )}
                </button>
              )
            })
          }
            </div>
          </div>
        </div>

        {/* Cart Section - Desktop */}
        <div className="hidden lg:flex w-80 bg-white border-l border-gray-200 flex-col">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Cart</h2>
              <div className="flex items-center space-x-2">
                <ShoppingCart className="w-5 h-5 text-gray-600" />
                <span className="text-sm text-gray-600">{cartItemCount} items</span>
              </div>
            </div>
          </div>

          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto p-4">
            {cart.length === 0 ? (
              <div className="text-center text-gray-500 mt-8">
                <ShoppingCart className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>Cart is empty</p>
                <p className="text-sm">Add items to get started</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map(item => (
                  <div key={item.id} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-medium text-gray-900">{item.name}</h4>
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="text-gray-400 hover:text-red-500 p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => updateQuantity(item.id, -1)}
                          className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center hover:bg-gray-300 touch-manipulation"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="font-medium min-w-[2rem] text-center">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.id, 1)}
                          disabled={(() => {
                            const product = products.find(p => p.id === item.id)
                            return !product || item.quantity >= product.stock
                          })()}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center touch-manipulation ${
                            (() => {
                              const product = products.find(p => p.id === item.id)
                              return !product || item.quantity >= product.stock
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'bg-gray-200 hover:bg-gray-300'
                            })()
                          }`}
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      
                      <span className="font-semibold text-blue-600">
                        ${(item.price * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cart Summary & Checkout */}
          {cart.length > 0 && (
            <div className="border-t border-gray-200 p-4 space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Subtotal:</span>
                  <span>${cartTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Tax (8.5%):</span>
                  <span>${(cartTotal * 0.085).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Total:</span>
                  <span>${(cartTotal * 1.085).toFixed(2)}</span>
                </div>
              </div>

              {isExpressMode ? (
                <button
                  onClick={() => processPayment('Express')}
                  className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors touch-manipulation flex items-center justify-center"
                >
                  <DollarSign className="w-5 h-5 mr-2" />
                  Express Checkout
                </button>
              ) : (
                <div className="space-y-2">
                  <button
                    onClick={() => setShowPayment(!showPayment)}
                    className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors touch-manipulation flex items-center justify-center"
                  >
                    <CreditCard className="w-5 h-5 mr-2" />
                    Proceed to Payment
                  </button>
                  
                  {showPayment && (
                    <div className="space-y-2">
                      <button
                        onClick={() => processPayment('Cash')}
                        className="w-full bg-green-600 text-white py-2 rounded-lg font-medium hover:bg-green-700 transition-colors touch-manipulation"
                      >
                        Cash Payment
                      </button>
                      <button
                        onClick={() => processPayment('Card')}
                        className="w-full bg-purple-600 text-white py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors touch-manipulation"
                      >
                        Card Payment
                      </button>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={clearCart}
                className="w-full bg-gray-200 text-gray-700 py-2 rounded-lg font-medium hover:bg-gray-300 transition-colors touch-manipulation"
              >
                Clear Cart
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Cart Drawer */}
      {showCart && (
        <div className="lg:hidden fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setShowCart(false)} />
          <div className="absolute right-0 top-0 h-full w-80 max-w-full bg-white shadow-xl flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Cart</h2>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <ShoppingCart className="w-5 h-5 text-gray-600" />
                    <span className="text-sm text-gray-600">{cartItemCount} items</span>
                  </div>
                  <button
                    onClick={() => setShowCart(false)}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Mobile Cart Items */}
            <div className="flex-1 overflow-y-auto p-4">
              {cart.length === 0 ? (
                <div className="text-center text-gray-500 mt-8">
                  <ShoppingCart className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p>Cart is empty</p>
                  <p className="text-sm">Add items to get started</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {cart.map(item => (
                    <div key={item.id} className="bg-gray-50 rounded-lg p-3">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-medium text-gray-900">{item.name}</h4>
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="text-gray-400 hover:text-red-500 p-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => updateQuantity(item.id, -1)}
                            className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center hover:bg-gray-300 touch-manipulation"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="font-medium min-w-[2rem] text-center">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id, 1)}
                            disabled={(() => {
                              const product = products.find(p => p.id === item.id)
                              return !product || item.quantity >= product.stock
                            })()}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center touch-manipulation ${
                              (() => {
                                const product = products.find(p => p.id === item.id)
                                return !product || item.quantity >= product.stock
                                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                  : 'bg-gray-200 hover:bg-gray-300'
                              })()
                            }`}
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        
                        <span className="font-semibold text-blue-600">
                          ${(item.price * item.quantity).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Mobile Cart Summary & Checkout */}
            {cart.length > 0 && (
              <div className="border-t border-gray-200 p-4 space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal:</span>
                    <span>${cartTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Tax (8.5%):</span>
                    <span>${(cartTotal * 0.085).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t pt-2">
                    <span>Total:</span>
                    <span>${(cartTotal * 1.085).toFixed(2)}</span>
                  </div>
                </div>

                {isExpressMode ? (
                  <button
                    onClick={() => processPayment('Express')}
                    className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors touch-manipulation flex items-center justify-center"
                  >
                    <DollarSign className="w-5 h-5 mr-2" />
                    Express Checkout
                  </button>
                ) : (
                  <div className="space-y-2">
                    <button
                      onClick={() => setShowPayment(!showPayment)}
                      className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors touch-manipulation flex items-center justify-center"
                    >
                      <CreditCard className="w-5 h-5 mr-2" />
                      Proceed to Payment
                    </button>
                    
                    {showPayment && (
                      <div className="space-y-2">
                        <button
                          onClick={() => processPayment('Cash')}
                          className="w-full bg-green-600 text-white py-2 rounded-lg font-medium hover:bg-green-700 transition-colors touch-manipulation"
                        >
                          Cash Payment
                        </button>
                        <button
                          onClick={() => processPayment('Card')}
                          className="w-full bg-purple-600 text-white py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors touch-manipulation"
                        >
                          Card Payment
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={clearCart}
                  className="w-full bg-gray-200 text-gray-700 py-2 rounded-lg font-medium hover:bg-gray-300 transition-colors touch-manipulation"
                >
                  Clear Cart
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Draft Sales Modal */}
      {showDraftSales && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">Draft Sales</h2>
                <button
                  onClick={() => setShowDraftSales(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6">
              {draftSales.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  <Package className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p>No draft sales</p>
                  <p className="text-sm">Partial payments will appear here</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {draftSales.map((draft) => (
                    <div key={draft.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-semibold text-gray-900">
                            {draft.customerInfo?.name || 'Customer'} - {draft.id.slice(-8)}
                          </h3>
                          <p className="text-sm text-gray-500">
                            {new Date(draft.createdAt).toLocaleDateString()} at {new Date(draft.createdAt).toLocaleTimeString()}
                          </p>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          draft.status === 'partial' 
                            ? 'bg-yellow-100 text-yellow-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {draft.status.toUpperCase()}
                        </span>
                      </div>
                      
                      <div className="text-sm text-gray-600 mb-3">
                        {draft.items.length} items • Total: ${draft.total.toFixed(2)}
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <div className="text-sm">
                          <span className="text-green-600">Paid: ${draft.amountPaid.toFixed(2)}</span>
                          <span className="mx-2 text-gray-400">|</span>
                          <span className="text-red-600">Due: ${draft.amountDue.toFixed(2)}</span>
                        </div>
                        <button 
                          onClick={() => {
                            // Load draft back to cart for completion
                            setCart(draft.items)
                            setShowDraftSales(false)
                            alert('Draft sale loaded to cart')
                          }}
                          className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
                        >
                          Resume
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Transaction Processing Cell */}
      <TransactionProcessingCell
        cartItems={cart}
        total={cartTotal * 1.085}
        onPaymentComplete={handlePaymentComplete}
        onSaveDraft={handleSaveDraft}
        isVisible={showTransactionProcessing}
        onClose={() => setShowTransactionProcessing(false)}
      />
    </div>
  )
}