'use client'

import { useState, useEffect } from 'react'
import { Search, Calendar, DollarSign, CreditCard, Smartphone, Receipt, RefreshCw, AlertCircle, CheckCircle, XCircle, Clock } from 'lucide-react'

export interface TransactionHistoryItem {
  id: string
  transactionNumber: string
  reference?: string
  amount: number
  paymentMethod: string
  status: 'pending' | 'completed' | 'failed' | 'refunded' | 'partially_refunded'
  customerInfo?: {
    name?: string
    email?: string
    phone?: string
  }
  items: Array<{
    name: string
    quantity: number
    price: number
  }>
  fees?: number
  refunds?: Array<{
    id: string
    amount: number
    reason?: string
    status: 'pending' | 'completed' | 'failed'
    processedAt: string
  }>
  cashier: string
  createdAt: string
  refundable?: boolean
}

interface TransactionHistoryCellProps {
  isVisible: boolean
  onClose: () => void
}

export default function TransactionHistoryCell({
  isVisible,
  onClose
}: TransactionHistoryCellProps) {
  const [transactions, setTransactions] = useState<TransactionHistoryItem[]>([])
  const [filteredTransactions, setFilteredTransactions] = useState<TransactionHistoryItem[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [isLoading, setIsLoading] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionHistoryItem | null>(null)
  const [showRefundModal, setShowRefundModal] = useState(false)
  const [refundAmount, setRefundAmount] = useState('')
  const [refundReason, setRefundReason] = useState('')
  const [isProcessingRefund, setIsProcessingRefund] = useState(false)

  // Load transaction history
  useEffect(() => {
    if (isVisible) {
      loadTransactionHistory()
    }
  }, [isVisible])

  // Filter transactions based on search and status
  useEffect(() => {
    let filtered = transactions

    if (searchTerm) {
      filtered = filtered.filter(transaction =>
        transaction.transactionNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        transaction.customerInfo?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        transaction.customerInfo?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        transaction.reference?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(transaction => transaction.status === statusFilter)
    }

    setFilteredTransactions(filtered)
  }, [transactions, searchTerm, statusFilter])

  const loadTransactionHistory = async () => {
    setIsLoading(true)
    try {
      // Mock transaction history - in real app, load from database
      const mockTransactions: TransactionHistoryItem[] = [
        {
          id: 'txn_001',
          transactionNumber: 'TXN-001',
          reference: 'ps_2025091500001',
          amount: 15.75,
          paymentMethod: 'Paystack',
          status: 'completed',
          customerInfo: {
            name: 'John Doe',
            email: 'john.doe@email.com'
          },
          items: [
            { name: 'Espresso', quantity: 2, price: 2.50 },
            { name: 'Blueberry Muffin', quantity: 1, price: 2.75 }
          ],
          fees: 0.24,
          cashier: 'Admin User',
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          refundable: true
        },
        {
          id: 'txn_002',
          transactionNumber: 'TXN-002',
          reference: 'cash_2025091500002',
          amount: 8.50,
          paymentMethod: 'Cash',
          status: 'completed',
          customerInfo: {
            name: 'Jane Smith'
          },
          items: [
            { name: 'Cappuccino', quantity: 1, price: 4.50 },
            { name: 'BBQ Chips', quantity: 1, price: 2.25 }
          ],
          cashier: 'Admin User',
          createdAt: new Date(Date.now() - 7200000).toISOString(),
          refundable: true
        },
        {
          id: 'txn_003',
          transactionNumber: 'TXN-003',
          reference: 'mw_2025091500003',
          amount: 12.25,
          paymentMethod: 'Mobile Wallet',
          status: 'refunded',
          customerInfo: {
            name: 'Bob Johnson',
            phone: '+234-801-234-5678'
          },
          items: [
            { name: 'Cappuccino', quantity: 2, price: 4.50 }
          ],
          refunds: [
            {
              id: 'ref_001',
              amount: 12.25,
              reason: 'Customer requested full refund',
              status: 'completed',
              processedAt: new Date(Date.now() - 1800000).toISOString()
            }
          ],
          cashier: 'Admin User',
          createdAt: new Date(Date.now() - 10800000).toISOString(),
          refundable: false
        }
      ]

      setTransactions(mockTransactions)
    } catch (error) {
      console.error('Error loading transaction history:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRefund = async () => {
    if (!selectedTransaction || !refundAmount) return

    setIsProcessingRefund(true)
    try {
      const amount = parseFloat(refundAmount)
      
      if (amount <= 0 || amount > selectedTransaction.amount) {
        alert('Invalid refund amount')
        return
      }

      // Call refund API
      const response = await fetch('/api/payments/refund', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transactionReference: selectedTransaction.reference,
          amount: amount,
          reason: refundReason
        })
      })

      const result = await response.json()

      if (result.success) {
        // Update transaction in local state
        setTransactions(prev => prev.map(txn => {
          if (txn.id === selectedTransaction.id) {
            const newRefund = {
              id: result.data?.refund?.id || `ref_${Date.now()}`,
              amount: amount,
              reason: refundReason,
              status: 'completed' as const,
              processedAt: new Date().toISOString()
            }

            const totalRefunded = (txn.refunds || []).reduce((sum, ref) => sum + ref.amount, 0) + amount
            const newStatus = totalRefunded >= txn.amount ? 'refunded' : 'partially_refunded'

            return {
              ...txn,
              status: newStatus,
              refunds: [...(txn.refunds || []), newRefund],
              refundable: newStatus !== 'refunded'
            }
          }
          return txn
        }))

        alert(`Refund of $${amount.toFixed(2)} processed successfully!`)
        setShowRefundModal(false)
        setRefundAmount('')
        setRefundReason('')
        setSelectedTransaction(null)
      } else {
        alert(`Refund failed: ${result.message}`)
      }
    } catch (error) {
      console.error('Refund error:', error)
      alert('Refund processing failed. Please try again.')
    } finally {
      setIsProcessingRefund(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-500" />
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />
      case 'refunded':
        return <RefreshCw className="w-5 h-5 text-blue-500" />
      case 'partially_refunded':
        return <RefreshCw className="w-5 h-5 text-orange-500" />
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />
    }
  }

  const getPaymentMethodIcon = (method: string) => {
    switch (method.toLowerCase()) {
      case 'paystack':
      case 'card':
        return <CreditCard className="w-4 h-4" />
      case 'mobile wallet':
      case 'mobile_wallet':
        return <Smartphone className="w-4 h-4" />
      case 'cash':
        return <DollarSign className="w-4 h-4" />
      default:
        return <Receipt className="w-4 h-4" />
    }
  }

  if (!isVisible) return null

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Transaction History</h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {/* Filters */}
            <div className="mt-4 flex flex-col sm:flex-row gap-4">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search by transaction number, customer, or reference..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
                <option value="refunded">Refunded</option>
                <option value="partially_refunded">Partially Refunded</option>
              </select>

              <button
                onClick={loadTransactionHistory}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </button>
            </div>
          </div>

          {/* Transaction List */}
          <div className="flex-1 overflow-y-auto p-6">
            {isLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-600">Loading transactions...</p>
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div className="text-center py-8">
                <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600">No transactions found</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredTransactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          {getStatusIcon(transaction.status)}
                          <span className="font-semibold text-gray-900">
                            {transaction.transactionNumber}
                          </span>
                          <span className="text-sm text-gray-500">
                            {new Date(transaction.createdAt).toLocaleString()}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                          <div>
                            <p className="text-sm text-gray-600">Customer</p>
                            <p className="font-medium">
                              {transaction.customerInfo?.name || 'Walk-in Customer'}
                            </p>
                            {transaction.customerInfo?.email && (
                              <p className="text-sm text-gray-500">{transaction.customerInfo.email}</p>
                            )}
                          </div>

                          <div>
                            <p className="text-sm text-gray-600">Payment Method</p>
                            <div className="flex items-center space-x-2">
                              {getPaymentMethodIcon(transaction.paymentMethod)}
                              <span className="font-medium">{transaction.paymentMethod}</span>
                            </div>
                            {transaction.reference && (
                              <p className="text-sm text-gray-500">Ref: {transaction.reference}</p>
                            )}
                          </div>

                          <div>
                            <p className="text-sm text-gray-600">Amount</p>
                            <p className="font-bold text-lg">${transaction.amount.toFixed(2)}</p>
                            {transaction.fees && (
                              <p className="text-sm text-gray-500">Fee: ${transaction.fees.toFixed(2)}</p>
                            )}
                          </div>
                        </div>

                        {/* Items */}
                        <div className="mb-3">
                          <p className="text-sm text-gray-600 mb-1">Items</p>
                          <div className="text-sm space-y-1">
                            {transaction.items.map((item, index) => (
                              <div key={index} className="flex justify-between">
                                <span>{item.quantity}x {item.name}</span>
                                <span>${(item.quantity * item.price).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Refunds */}
                        {transaction.refunds && transaction.refunds.length > 0 && (
                          <div className="mb-3">
                            <p className="text-sm text-gray-600 mb-1">Refunds</p>
                            <div className="text-sm space-y-1">
                              {transaction.refunds.map((refund) => (
                                <div key={refund.id} className="flex justify-between text-blue-600">
                                  <span>
                                    -{refund.amount.toFixed(2)} ({refund.reason || 'No reason'})
                                  </span>
                                  <span>{new Date(refund.processedAt).toLocaleDateString()}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="ml-4 flex flex-col space-y-2">
                        {transaction.refundable && transaction.status === 'completed' && (
                          <button
                            onClick={() => {
                              setSelectedTransaction(transaction)
                              setShowRefundModal(true)
                            }}
                            className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition-colors"
                          >
                            Refund
                          </button>
                        )}

                        <button
                          onClick={() => {
                            // Print receipt functionality
                            alert('Receipt printing not implemented yet')
                          }}
                          className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700 transition-colors"
                        >
                          Print
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Refund Modal */}
      {showRefundModal && selectedTransaction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                Process Refund - {selectedTransaction.transactionNumber}
              </h3>

              <div className="mb-4">
                <p className="text-sm text-gray-600">Original Amount: ${selectedTransaction.amount.toFixed(2)}</p>
                {selectedTransaction.refunds && selectedTransaction.refunds.length > 0 && (
                  <p className="text-sm text-gray-600">
                    Already Refunded: $
                    {selectedTransaction.refunds.reduce((sum, ref) => sum + ref.amount, 0).toFixed(2)}
                  </p>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Refund Amount
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    max={selectedTransaction.amount}
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Refund Reason
                  </label>
                  <textarea
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={3}
                    placeholder="Reason for refund..."
                  />
                </div>
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowRefundModal(false)
                    setRefundAmount('')
                    setRefundReason('')
                    setSelectedTransaction(null)
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRefund}
                  disabled={isProcessingRefund || !refundAmount}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessingRefund ? 'Processing...' : 'Process Refund'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}