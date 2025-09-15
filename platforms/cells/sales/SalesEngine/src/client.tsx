'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { v4 as uuidv4 } from 'uuid';

// Icons
import { 
  ShoppingCart, 
  Plus, 
  Minus, 
  Trash2, 
  Calculator, 
  CreditCard, 
  Banknote, 
  Smartphone, 
  Receipt, 
  Tag, 
  Users, 
  Package,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Printer,
  Mail,
  MessageSquare,
  QrCode
} from 'lucide-react';

// Types
interface CartItem {
  id: string;
  productId: string;
  variantId?: string;
  productCode: string;
  productName: string;
  sku?: string;
  barcode?: string;
  unitPrice: number;
  quantity: number;
  discountAmount: number;
  taxAmount: number;
  lineTotal: number;
  notes?: string;
  isTaxable: boolean;
  isRefundable: boolean;
  categoryId?: string;
  supplierId?: string;
}

interface CartSession {
  id: string;
  sessionId: string;
  tenantId: string;
  cashierId: string;
  customerId?: string;
  locationId?: string;
  terminalId?: string;
  currency: 'NGN' | 'USD' | 'GBP';
  items: CartItem[];
  subtotal: number;
  discounts: any[];
  taxes: any[];
  fees: any[];
  total: number;
  status: string;
  notes?: string;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

interface PaymentMethod {
  method: 'cash' | 'card' | 'mobile_money' | 'bank_transfer' | 'split_payment';
  amount: number;
  provider?: 'paystack' | 'flutterwave' | 'interswitch' | 'cash';
  reference?: string;
  status: 'pending' | 'completed' | 'failed';
  metadata?: Record<string, any>;
}

interface SalesEngineProps {
  tenantId: string;
  cashierId: string;
  locationId?: string;
  terminalId?: string;
  onTransactionComplete?: (transaction: any) => void;
  onError?: (error: string) => void;
}

// Nigerian Naira formatter
const formatCurrency = (amount: number, currency: string = 'NGN') => {
  if (currency === 'NGN') {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 2
    }).format(amount);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2
  }).format(amount);
};

export default function SalesEngineClient({ 
  tenantId, 
  cashierId, 
  locationId, 
  terminalId,
  onTransactionComplete,
  onError 
}: SalesEngineProps) {
  // State management
  const [cart, setCart] = useState<CartSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentCustomer, setCurrentCustomer] = useState<any>(null);
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [showPayment, setShowPayment] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [showCustomer, setShowCustomer] = useState(false);
  const [receiptPreferences, setReceiptPreferences] = useState({
    printReceipt: true,
    emailReceipt: false,
    smsReceipt: false,
    language: 'en'
  });

  // Generate session ID
  const sessionId = useMemo(() => {
    return uuidv4();
  }, []);

  // Initialize cart on component mount
  useEffect(() => {
    initializeCart();
  }, []);

  // API calls
  const callSalesEngineAPI = async (action: string, data: any) => {
    try {
      const response = await fetch('/api/cells/sales/SalesEngine', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          ...data
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'API call failed');
      }

      return result;
    } catch (error) {
      console.error('SalesEngine API error:', error);
      throw error;
    }
  };

  // Initialize cart session
  const initializeCart = async () => {
    try {
      setLoading(true);
      const result = await callSalesEngineAPI('initializeCart', {
        sessionId,
        cashierId,
        locationId,
        terminalId,
        currency: 'NGN'
      });

      setCart(result.cart);
      setError(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize cart';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Search products
  const searchProducts = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      const response = await fetch(`/api/cells/inventory/ProductCatalog`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'searchProducts',
          query,
          limit: 10
        }),
      });

      const result = await response.json();
      if (result.success) {
        setSearchResults(result.products || []);
      }
    } catch (error) {
      console.error('Product search error:', error);
    }
  };

  // Add item to cart
  const addToCart = async (product: any, quantity: number = 1) => {
    try {
      setLoading(true);
      const result = await callSalesEngineAPI('addToCart', {
        sessionId,
        productId: product.id,
        variantId: product.variantId,
        quantity
      });

      setCart(result.cart);
      setProductSearch('');
      setSearchResults([]);
      setError(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add item to cart';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Update cart item
  const updateCartItem = async (itemId: string, quantity: number) => {
    try {
      setLoading(true);
      const result = await callSalesEngineAPI('updateCartItem', {
        sessionId,
        cartItemId: itemId,
        quantity
      });

      setCart(result.cart);
      setError(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update cart item';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Remove from cart
  const removeFromCart = async (itemId: string) => {
    try {
      setLoading(true);
      const result = await callSalesEngineAPI('removeFromCart', {
        sessionId,
        cartItemId: itemId
      });

      setCart(result.cart);
      setError(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to remove item from cart';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Apply discount
  const applyDiscount = async (discountData: any) => {
    try {
      setLoading(true);
      const result = await callSalesEngineAPI('applyDiscount', {
        sessionId,
        ...discountData
      });

      setCart(result.cart);
      setShowDiscount(false);
      setError(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to apply discount';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Process payment
  const processPayment = async () => {
    if (!cart || paymentMethods.length === 0) return;

    try {
      setLoading(true);
      const result = await callSalesEngineAPI('processPayment', {
        sessionId,
        paymentMethods,
        customerInfo: currentCustomer ? {
          name: currentCustomer.firstName + ' ' + currentCustomer.lastName,
          phone: currentCustomer.primaryPhone,
          email: currentCustomer.email,
          type: currentCustomer.customerType
        } : undefined,
        receiptPreferences
      });

      // Payment successful
      setCart(null);
      setPaymentMethods([]);
      setCurrentCustomer(null);
      setShowPayment(false);
      
      onTransactionComplete?.(result.transaction);
      
      // Initialize new cart for next transaction
      await initializeCart();
      
      setError(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Payment processing failed';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Calculate payment total
  const paymentTotal = paymentMethods.reduce((sum, pm) => sum + pm.amount, 0);
  const remainingAmount = cart ? cart.total - paymentTotal : 0;

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left Panel - Product Search & Cart */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white shadow-sm border-b p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <ShoppingCart className="h-6 w-6 text-blue-600" />
              <h1 className="text-xl font-semibold text-gray-900">POS Terminal</h1>
              {terminalId && (
                <Badge variant="outline">Terminal: {terminalId}</Badge>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCustomer(true)}
              >
                <Users className="h-4 w-4 mr-2" />
                {currentCustomer ? currentCustomer.firstName : 'Add Customer'}
              </Button>
              
              {cart && cart.items.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDiscount(true)}
                >
                  <Tag className="h-4 w-4 mr-2" />
                  Discount
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Product Search */}
        <div className="bg-white border-b p-4">
          <div className="relative">
            <Package className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search products by name, SKU, or barcode..."
              value={productSearch}
              onChange={(e) => {
                setProductSearch(e.target.value);
                searchProducts(e.target.value);
              }}
              className="pl-10"
            />
          </div>
          
          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="mt-2 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
              {searchResults.map((product) => (
                <div
                  key={product.id}
                  className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                  onClick={() => addToCart(product)}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-medium text-gray-900">{product.productName}</div>
                      <div className="text-sm text-gray-500">
                        {product.sku && `SKU: ${product.sku}`}
                        {product.barcode && ` | Barcode: ${product.barcode}`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-gray-900">
                        {formatCurrency(product.sellingPrice, cart?.currency)}
                      </div>
                      <div className="text-sm text-gray-500">Stock: {product.stock || 0}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto">
          {cart && cart.items.length > 0 ? (
            <div className="space-y-2 p-4">
              {cart.items.map((item) => (
                <Card key={item.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{item.productName}</div>
                      <div className="text-sm text-gray-500">
                        {item.sku && `SKU: ${item.sku}`}
                        {item.productCode && ` | Code: ${item.productCode}`}
                      </div>
                      <div className="text-sm font-medium text-gray-700 mt-1">
                        {formatCurrency(item.unitPrice, cart.currency)} x {item.quantity}
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateCartItem(item.id, item.quantity - 1)}
                        disabled={loading}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      
                      <span className="w-8 text-center font-medium">{item.quantity}</span>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateCartItem(item.id, item.quantity + 1)}
                        disabled={loading}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeFromCart(item.id)}
                        disabled={loading}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    
                    <div className="text-right ml-4">
                      <div className="font-semibold text-gray-900">
                        {formatCurrency(item.lineTotal, cart.currency)}
                      </div>
                      {item.discountAmount > 0 && (
                        <div className="text-sm text-green-600">
                          -{formatCurrency(item.discountAmount, cart.currency)}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {item.notes && (
                    <div className="mt-2 text-sm text-gray-600 bg-gray-50 p-2 rounded">
                      Note: {item.notes}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-gray-500">
                <ShoppingCart className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p className="text-lg font-medium">Cart is empty</p>
                <p className="text-sm">Search and add products to get started</p>
              </div>
            </div>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-4">
            <Alert className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-700">{error}</AlertDescription>
            </Alert>
          </div>
        )}
      </div>

      {/* Right Panel - Cart Summary & Payment */}
      <div className="w-96 bg-white border-l flex flex-col">
        {/* Cart Summary */}
        <div className="p-6 border-b">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Summary</h3>
          
          {cart ? (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal ({cart.items.length} items)</span>
                <span className="font-medium">{formatCurrency(cart.subtotal, cart.currency)}</span>
              </div>
              
              {cart.discounts.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Discounts</span>
                  <span className="font-medium text-green-600">
                    -{formatCurrency(cart.discounts.reduce((sum, d) => sum + d.amount, 0), cart.currency)}
                  </span>
                </div>
              )}
              
              {cart.taxes.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Tax (VAT 7.5%)</span>
                  <span className="font-medium">{formatCurrency(cart.taxes.reduce((sum, t) => sum + t.amount, 0), cart.currency)}</span>
                </div>
              )}
              
              {cart.fees.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Fees</span>
                  <span className="font-medium">{formatCurrency(cart.fees.reduce((sum, f) => sum + f.amount, 0), cart.currency)}</span>
                </div>
              )}
              
              <div className="border-t pt-3">
                <div className="flex justify-between text-lg font-semibold">
                  <span>Total</span>
                  <span>{formatCurrency(cart.total, cart.currency)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-500">
              <Calculator className="h-8 w-8 mx-auto mb-2 text-gray-300" />
              <p>No items to calculate</p>
            </div>
          )}
        </div>

        {/* Payment Actions */}
        <div className="flex-1 p-6">
          {cart && cart.items.length > 0 ? (
            <div className="space-y-4">
              <Button
                className="w-full"
                size="lg"
                onClick={() => setShowPayment(true)}
                disabled={loading}
              >
                <CreditCard className="h-5 w-5 mr-2" />
                Process Payment
              </Button>
              
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  // Suspend transaction functionality
                }}
                disabled={loading}
              >
                <Clock className="h-5 w-5 mr-2" />
                Hold Transaction
              </Button>
            </div>
          ) : (
            <div className="text-center text-gray-400">
              <CreditCard className="h-8 w-8 mx-auto mb-2" />
              <p>Add items to enable payment</p>
            </div>
          )}
        </div>

        {/* Current Customer */}
        {currentCustomer && (
          <div className="p-4 bg-gray-50 border-t">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900">
                  {currentCustomer.firstName} {currentCustomer.lastName}
                </div>
                <div className="text-sm text-gray-600">{currentCustomer.primaryPhone}</div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentCustomer(null)}
              >
                <XCircle className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Payment Dialog */}
      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Process Payment</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Payment Summary */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex justify-between items-center text-lg font-semibold">
                <span>Total Amount</span>
                <span>{cart && formatCurrency(cart.total, cart.currency)}</span>
              </div>
            </div>

            {/* Payment Methods */}
            <div>
              <Label className="text-base font-medium">Payment Methods</Label>
              <div className="mt-2 space-y-3">
                {/* Cash Payment */}
                <div className="flex items-center space-x-3 p-3 border rounded-lg">
                  <Banknote className="h-5 w-5 text-green-600" />
                  <span className="flex-1">Cash</span>
                  <Input
                    type="number"
                    placeholder="Amount"
                    className="w-32"
                    min="0"
                    step="0.01"
                    onChange={(e) => {
                      const amount = parseFloat(e.target.value) || 0;
                      const existingIndex = paymentMethods.findIndex(pm => pm.method === 'cash');
                      const newMethods = [...paymentMethods];
                      
                      if (existingIndex >= 0) {
                        if (amount > 0) {
                          newMethods[existingIndex].amount = amount;
                        } else {
                          newMethods.splice(existingIndex, 1);
                        }
                      } else if (amount > 0) {
                        newMethods.push({
                          method: 'cash',
                          amount,
                          provider: 'cash',
                          status: 'pending'
                        });
                      }
                      
                      setPaymentMethods(newMethods);
                    }}
                  />
                </div>

                {/* Card Payment */}
                <div className="flex items-center space-x-3 p-3 border rounded-lg">
                  <CreditCard className="h-5 w-5 text-blue-600" />
                  <span className="flex-1">Card</span>
                  <Select
                    onValueChange={(provider) => {
                      // Set card payment provider
                    }}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="paystack">Paystack</SelectItem>
                      <SelectItem value="flutterwave">Flutterwave</SelectItem>
                      <SelectItem value="interswitch">Interswitch</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    placeholder="Amount"
                    className="w-32"
                    min="0"
                    step="0.01"
                    onChange={(e) => {
                      const amount = parseFloat(e.target.value) || 0;
                      const existingIndex = paymentMethods.findIndex(pm => pm.method === 'card');
                      const newMethods = [...paymentMethods];
                      
                      if (existingIndex >= 0) {
                        if (amount > 0) {
                          newMethods[existingIndex].amount = amount;
                        } else {
                          newMethods.splice(existingIndex, 1);
                        }
                      } else if (amount > 0) {
                        newMethods.push({
                          method: 'card',
                          amount,
                          provider: 'paystack',
                          status: 'pending'
                        });
                      }
                      
                      setPaymentMethods(newMethods);
                    }}
                  />
                </div>

                {/* Mobile Money */}
                <div className="flex items-center space-x-3 p-3 border rounded-lg">
                  <Smartphone className="h-5 w-5 text-purple-600" />
                  <span className="flex-1">Mobile Money</span>
                  <Input
                    type="number"
                    placeholder="Amount"
                    className="w-32"
                    min="0"
                    step="0.01"
                    onChange={(e) => {
                      const amount = parseFloat(e.target.value) || 0;
                      const existingIndex = paymentMethods.findIndex(pm => pm.method === 'mobile_money');
                      const newMethods = [...paymentMethods];
                      
                      if (existingIndex >= 0) {
                        if (amount > 0) {
                          newMethods[existingIndex].amount = amount;
                        } else {
                          newMethods.splice(existingIndex, 1);
                        }
                      } else if (amount > 0) {
                        newMethods.push({
                          method: 'mobile_money',
                          amount,
                          provider: 'flutterwave',
                          status: 'pending'
                        });
                      }
                      
                      setPaymentMethods(newMethods);
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Payment Summary */}
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex justify-between text-sm mb-2">
                <span>Payment Total:</span>
                <span className="font-medium">{cart && formatCurrency(paymentTotal, cart.currency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Remaining:</span>
                <span className={`font-medium ${remainingAmount === 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {cart && formatCurrency(remainingAmount, cart.currency)}
                </span>
              </div>
            </div>

            {/* Receipt Preferences */}
            <div>
              <Label className="text-base font-medium">Receipt Preferences</Label>
              <div className="mt-2 space-y-3">
                <div className="flex items-center space-x-3">
                  <Switch
                    checked={receiptPreferences.printReceipt}
                    onCheckedChange={(checked) =>
                      setReceiptPreferences(prev => ({ ...prev, printReceipt: checked }))
                    }
                  />
                  <Printer className="h-4 w-4" />
                  <span>Print Receipt</span>
                </div>
                
                <div className="flex items-center space-x-3">
                  <Switch
                    checked={receiptPreferences.emailReceipt}
                    onCheckedChange={(checked) =>
                      setReceiptPreferences(prev => ({ ...prev, emailReceipt: checked }))
                    }
                  />
                  <Mail className="h-4 w-4" />
                  <span>Email Receipt</span>
                </div>
                
                <div className="flex items-center space-x-3">
                  <Switch
                    checked={receiptPreferences.smsReceipt}
                    onCheckedChange={(checked) =>
                      setReceiptPreferences(prev => ({ ...prev, smsReceipt: checked }))
                    }
                  />
                  <MessageSquare className="h-4 w-4" />
                  <span>SMS Receipt</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowPayment(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={processPayment}
                disabled={loading || remainingAmount !== 0 || paymentMethods.length === 0}
              >
                {loading ? 'Processing...' : 'Complete Payment'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Discount Dialog */}
      <Dialog open={showDiscount} onOpenChange={setShowDiscount}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply Discount</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Discount Type</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select discount type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage</SelectItem>
                  <SelectItem value="fixed_amount">Fixed Amount</SelectItem>
                  <SelectItem value="product_specific">Product Specific</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Discount Value</Label>
              <Input type="number" placeholder="Enter value" min="0" step="0.01" />
            </div>
            
            <div>
              <Label>Discount Code (Optional)</Label>
              <Input type="text" placeholder="Enter discount code" />
            </div>
            
            <div className="flex space-x-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowDiscount(false)}>
                Cancel
              </Button>
              <Button className="flex-1">Apply Discount</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Customer Dialog */}
      <Dialog open={showCustomer} onOpenChange={setShowCustomer}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Customer</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Search Customer</Label>
              <Input type="text" placeholder="Search by name, phone, or email" />
            </div>
            
            <div className="text-center text-gray-500">
              <Users className="h-8 w-8 mx-auto mb-2" />
              <p>Customer search functionality</p>
              <p className="text-sm">Integration with CustomerProfile cell</p>
            </div>
            
            <div className="flex space-x-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowCustomer(false)}>
                Cancel
              </Button>
              <Button className="flex-1">Add Customer</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}