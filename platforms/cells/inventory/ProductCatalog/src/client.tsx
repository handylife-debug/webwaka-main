'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Package,
  Plus,
  Edit,
  Search,
  Filter,
  Download,
  Upload,
  Trash2,
  Save,
  X,
  AlertCircle,
  CheckCircle,
  DollarSign,
  ShoppingCart,
  Tag,
  Layers,
  BarChart3,
  Globe,
  Calculator,
  PlusCircle,
  FileText,
  Settings,
  RefreshCw,
  Eye,
  EyeOff,
  Copy,
  Zap,
  TrendingUp,
  Archive
} from 'lucide-react';

// Types for ProductCatalog Cell
interface Product {
  id: string;
  productCode: string;
  productName: string;
  sku?: string;
  barcode?: string;
  categoryId?: string;
  categoryName?: string;
  supplierId?: string;
  supplierName?: string;
  brand?: string;
  unitOfMeasure: string;
  costPrice: number;
  sellingPrice: number;
  currency: 'NGN' | 'USD' | 'GBP';
  bulkPricing?: BulkPricing[];
  unitConversions?: UnitConversions;
  minStockLevel: number;
  maxStockLevel: number;
  reorderPoint: number;
  reorderQuantity: number;
  isTaxable: boolean;
  description?: string;
  imageUrl?: string;
  weight?: number;
  dimensions?: string;
  isActive: boolean;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

interface Category {
  id: string;
  categoryCode: string;
  categoryName: string;
  parentCategoryId?: string;
  description?: string;
  taxRate: number;
  isActive: boolean;
  sortOrder: number;
}

interface ProductVariant {
  id: string;
  productId: string;
  variantCode: string;
  variantName: string;
  sku?: string;
  barcode?: string;
  variantType: 'size' | 'color' | 'style' | 'material' | 'flavor' | 'other';
  variantValue: string;
  costPrice: number;
  sellingPrice?: number;
  weight?: number;
  dimensions?: string;
  imageUrl?: string;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
}

interface BulkPricing {
  minQuantity: number;
  unitPrice: number;
}

interface UnitConversions {
  piecesPerCarton?: number;
  cartonsPerPallet?: number;
  gramPerUnit?: number;
  mlPerUnit?: number;
}

interface ProductCatalogCellProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  onProductUpdate?: (productId: string, updates: Partial<Product>) => void;
}

// Nigerian business constants
const NIGERIAN_CURRENCIES = [
  { value: 'NGN', label: '₦ Nigerian Naira', symbol: '₦' },
  { value: 'USD', label: '$ US Dollar', symbol: '$' },
  { value: 'GBP', label: '£ British Pound', symbol: '£' }
];

const UNITS_OF_MEASURE = [
  'each', 'piece', 'box', 'carton', 'dozen', 'kilogram', 'gram',
  'liter', 'milliliter', 'meter', 'centimeter', 'square meter',
  'cubic meter', 'pair', 'set', 'bundle', 'pack', 'bag', 'bottle'
];

const VARIANT_TYPES = [
  { value: 'size', label: 'Size' },
  { value: 'color', label: 'Color' },
  { value: 'style', label: 'Style' },
  { value: 'material', label: 'Material' },
  { value: 'flavor', label: 'Flavor' },
  { value: 'other', label: 'Other' }
];

export default function ProductCatalogCell({
  isOpen,
  onClose,
  tenantId,
  onProductUpdate
}: ProductCatalogCellProps) {
  // State management
  const [activeTab, setActiveTab] = useState('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedCurrency, setSelectedCurrency] = useState<string>('NGN');
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Form states
  const [showProductForm, setShowProductForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showVariantForm, setShowVariantForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Product form data
  const [productForm, setProductForm] = useState({
    productCode: '',
    productName: '',
    sku: '',
    barcode: '',
    categoryId: '',
    supplierId: '',
    brand: '',
    unitOfMeasure: 'each',
    costPrice: 0,
    sellingPrice: 0,
    currency: 'NGN',
    bulkPricing: [] as BulkPricing[],
    unitConversions: {} as UnitConversions,
    minStockLevel: 0,
    maxStockLevel: 1000,
    reorderPoint: 10,
    reorderQuantity: 50,
    isTaxable: true,
    description: '',
    imageUrl: '',
    weight: 0,
    dimensions: '',
    isActive: true
  });

  // Category form data
  const [categoryForm, setCategoryForm] = useState({
    categoryCode: '',
    categoryName: '',
    parentCategoryId: '',
    description: '',
    taxRate: 0.075, // Nigerian standard VAT
    isActive: true
  });

  // Variant form data
  const [variantForm, setVariantForm] = useState({
    productId: '',
    variantCode: '',
    variantName: '',
    sku: '',
    barcode: '',
    variantType: 'size' as const,
    variantValue: '',
    costPrice: 0,
    sellingPrice: 0,
    weight: 0,
    dimensions: '',
    imageUrl: '',
    isDefault: false,
    isActive: true,
    sortOrder: 0
  });

  // Currency exchange rates (would typically come from API)
  const [exchangeRates, setExchangeRates] = useState({
    'NGN-USD': 0.0012,
    'NGN-GBP': 0.0010,
    'USD-NGN': 850.0,
    'USD-GBP': 0.82,
    'GBP-NGN': 1050.0,
    'GBP-USD': 1.22
  });

  // Load data on component mount and when dependencies change
  useEffect(() => {
    if (isOpen) {
      loadProducts();
      loadCategories();
    }
  }, [isOpen, currentPage, searchTerm, selectedCategory, showActiveOnly]);

  // API call functions
  const loadProducts = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        limit: '20',
        offset: ((currentPage - 1) * 20).toString(),
        ...(searchTerm && { query: searchTerm }),
        ...(selectedCategory !== 'all' && { categoryId: selectedCategory }),
        ...(showActiveOnly && { isActive: 'true' })
      });

      const response = await fetch(`/api/cells/inventory/ProductCatalog/actions/searchProducts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cell-Channel': 'stable'
        },
        body: JSON.stringify({
          query: searchTerm,
          categoryId: selectedCategory !== 'all' ? selectedCategory : undefined,
          isActive: showActiveOnly,
          limit: 20,
          offset: (currentPage - 1) * 20
        })
      });

      const result = await response.json();

      if (result.success) {
        setProducts(result.products || []);
        setTotalPages(Math.ceil((result.pagination?.total || 0) / 20));
      } else {
        console.error('Failed to load products:', result.error);
        setProducts([]);
      }
    } catch (error) {
      console.error('Error loading products:', error);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const response = await fetch(`/api/cells/inventory/ProductCatalog/actions/getCategoryHierarchy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cell-Channel': 'stable'
        },
        body: JSON.stringify({})
      });

      const result = await response.json();

      if (result.success) {
        setCategories(result.categories || []);
      } else {
        console.error('Failed to load categories:', result.error);
        setCategories([]);
      }
    } catch (error) {
      console.error('Error loading categories:', error);
      setCategories([]);
    }
  };

  const loadProductVariants = async (productId: string) => {
    try {
      const response = await fetch(`/api/cells/inventory/ProductCatalog/actions/getProductVariants`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cell-Channel': 'stable'
        },
        body: JSON.stringify({ productId })
      });

      const result = await response.json();

      if (result.success) {
        setVariants(result.variants || []);
      } else {
        console.error('Failed to load variants:', result.error);
        setVariants([]);
      }
    } catch (error) {
      console.error('Error loading variants:', error);
      setVariants([]);
    }
  };

  const createProduct = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/cells/inventory/ProductCatalog/actions/createProduct`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cell-Channel': 'stable'
        },
        body: JSON.stringify(productForm)
      });

      const result = await response.json();

      if (result.success) {
        setShowProductForm(false);
        resetProductForm();
        await loadProducts();
        
        if (onProductUpdate && result.product) {
          onProductUpdate(result.product.id, result.product);
        }
      } else {
        console.error('Failed to create product:', result.error);
        alert(`Failed to create product: ${result.error || result.message}`);
      }
    } catch (error) {
      console.error('Error creating product:', error);
      alert('Error creating product. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const updateProduct = async () => {
    if (!editingProduct) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/cells/inventory/ProductCatalog/actions/updateProduct`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cell-Channel': 'stable'
        },
        body: JSON.stringify({
          id: editingProduct.id,
          updates: productForm
        })
      });

      const result = await response.json();

      if (result.success) {
        setShowProductForm(false);
        setEditingProduct(null);
        resetProductForm();
        await loadProducts();
        
        if (onProductUpdate && result.product) {
          onProductUpdate(result.product.id, result.product);
        }
      } else {
        console.error('Failed to update product:', result.error);
        alert(`Failed to update product: ${result.error || result.message}`);
      }
    } catch (error) {
      console.error('Error updating product:', error);
      alert('Error updating product. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const createCategory = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/cells/inventory/ProductCatalog/actions/createCategory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cell-Channel': 'stable'
        },
        body: JSON.stringify(categoryForm)
      });

      const result = await response.json();

      if (result.success) {
        setShowCategoryForm(false);
        resetCategoryForm();
        await loadCategories();
      } else {
        console.error('Failed to create category:', result.error);
        alert(`Failed to create category: ${result.error || result.message}`);
      }
    } catch (error) {
      console.error('Error creating category:', error);
      alert('Error creating category. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const createVariant = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/cells/inventory/ProductCatalog/actions/createVariant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cell-Channel': 'stable'
        },
        body: JSON.stringify(variantForm)
      });

      const result = await response.json();

      if (result.success) {
        setShowVariantForm(false);
        resetVariantForm();
        if (selectedProduct) {
          await loadProductVariants(selectedProduct.id);
        }
      } else {
        console.error('Failed to create variant:', result.error);
        alert(`Failed to create variant: ${result.error || result.message}`);
      }
    } catch (error) {
      console.error('Error creating variant:', error);
      alert('Error creating variant. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const convertCurrency = async (amount: number, fromCurrency: string, toCurrency: string): Promise<number> => {
    try {
      const response = await fetch(`/api/cells/inventory/ProductCatalog/actions/convertCurrency`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cell-Channel': 'stable'
        },
        body: JSON.stringify({
          amount,
          fromCurrency,
          toCurrency
        })
      });

      const result = await response.json();

      if (result.success) {
        return result.convertedAmount;
      } else {
        console.error('Currency conversion failed:', result.error);
        return amount;
      }
    } catch (error) {
      console.error('Error converting currency:', error);
      return amount;
    }
  };

  const calculateVAT = async (amount: number, productId?: string): Promise<any> => {
    try {
      const response = await fetch(`/api/cells/inventory/ProductCatalog/actions/calculateVAT`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cell-Channel': 'stable'
        },
        body: JSON.stringify({
          amount,
          productId,
          region: 'Nigeria'
        })
      });

      const result = await response.json();

      if (result.success) {
        return result;
      } else {
        console.error('VAT calculation failed:', result.error);
        return null;
      }
    } catch (error) {
      console.error('Error calculating VAT:', error);
      return null;
    }
  };

  // Form management functions
  const resetProductForm = () => {
    setProductForm({
      productCode: '',
      productName: '',
      sku: '',
      barcode: '',
      categoryId: '',
      supplierId: '',
      brand: '',
      unitOfMeasure: 'each',
      costPrice: 0,
      sellingPrice: 0,
      currency: 'NGN',
      bulkPricing: [],
      unitConversions: {},
      minStockLevel: 0,
      maxStockLevel: 1000,
      reorderPoint: 10,
      reorderQuantity: 50,
      isTaxable: true,
      description: '',
      imageUrl: '',
      weight: 0,
      dimensions: '',
      isActive: true
    });
  };

  const resetCategoryForm = () => {
    setCategoryForm({
      categoryCode: '',
      categoryName: '',
      parentCategoryId: '',
      description: '',
      taxRate: 0.075,
      isActive: true
    });
  };

  const resetVariantForm = () => {
    setVariantForm({
      productId: selectedProduct?.id || '',
      variantCode: '',
      variantName: '',
      sku: '',
      barcode: '',
      variantType: 'size',
      variantValue: '',
      costPrice: 0,
      sellingPrice: 0,
      weight: 0,
      dimensions: '',
      imageUrl: '',
      isDefault: false,
      isActive: true,
      sortOrder: 0
    });
  };

  const populateProductFormForEdit = (product: Product) => {
    setProductForm({
      productCode: product.productCode,
      productName: product.productName,
      sku: product.sku || '',
      barcode: product.barcode || '',
      categoryId: product.categoryId || '',
      supplierId: product.supplierId || '',
      brand: product.brand || '',
      unitOfMeasure: product.unitOfMeasure,
      costPrice: product.costPrice,
      sellingPrice: product.sellingPrice,
      currency: product.currency,
      bulkPricing: product.bulkPricing || [],
      unitConversions: product.unitConversions || {},
      minStockLevel: product.minStockLevel,
      maxStockLevel: product.maxStockLevel,
      reorderPoint: product.reorderPoint,
      reorderQuantity: product.reorderQuantity,
      isTaxable: product.isTaxable,
      description: product.description || '',
      imageUrl: product.imageUrl || '',
      weight: product.weight || 0,
      dimensions: product.dimensions || '',
      isActive: product.isActive
    });
  };

  // Utility functions
  const formatCurrency = (amount: number, currency: string = 'NGN'): string => {
    const currencyInfo = NIGERIAN_CURRENCIES.find(c => c.value === currency);
    const symbol = currencyInfo?.symbol || '₦';
    return `${symbol}${amount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    populateProductFormForEdit(product);
    setShowProductForm(true);
  };

  const handleViewProduct = (product: Product) => {
    setSelectedProduct(product);
    loadProductVariants(product.id);
  };

  const handleAddBulkPricing = () => {
    setProductForm(prev => ({
      ...prev,
      bulkPricing: [...prev.bulkPricing, { minQuantity: 1, unitPrice: 0 }]
    }));
  };

  const handleRemoveBulkPricing = (index: number) => {
    setProductForm(prev => ({
      ...prev,
      bulkPricing: prev.bulkPricing.filter((_, i) => i !== index)
    }));
  };

  const handleUpdateBulkPricing = (index: number, field: keyof BulkPricing, value: number) => {
    setProductForm(prev => ({
      ...prev,
      bulkPricing: prev.bulkPricing.map((bp, i) =>
        i === index ? { ...bp, [field]: value } : bp
      )
    }));
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-600" />
            Product Catalog Management
            <Badge variant="outline" className="ml-2">Nigerian Market</Badge>
          </DialogTitle>
          <DialogDescription>
            Comprehensive product management with multi-currency support, bulk operations, and VAT compliance for Nigerian businesses.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="products" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Products
            </TabsTrigger>
            <TabsTrigger value="categories" className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Categories
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Products Tab */}
          <TabsContent value="products" className="space-y-4">
            {/* Search and Filter Bar */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                      <Input
                        placeholder="Search products by name, code, SKU, or barcode..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map(category => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.categoryName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NIGERIAN_CURRENCIES.map(currency => (
                        <SelectItem key={currency.value} value={currency.value}>
                          {currency.symbol} {currency.value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={showActiveOnly}
                      onCheckedChange={setShowActiveOnly}
                    />
                    <Label>Active Only</Label>
                  </div>

                  <Button
                    onClick={() => {
                      resetProductForm();
                      setEditingProduct(null);
                      setShowProductForm(true);
                    }}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Product
                  </Button>

                  <Button variant="outline" onClick={loadProducts} disabled={loading}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Products Grid */}
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
                <span className="ml-2">Loading products...</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {products.map(product => (
                  <Card key={product.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg font-semibold line-clamp-1">
                            {product.productName}
                          </CardTitle>
                          <p className="text-sm text-gray-600">
                            {product.productCode} • {product.sku}
                          </p>
                        </div>
                        <div className="flex items-center space-x-1">
                          {product.isActive ? (
                            <Badge variant="secondary" className="bg-green-100 text-green-800">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-gray-100 text-gray-800">
                              Inactive
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="pt-0">
                      {product.imageUrl && (
                        <div className="w-full h-32 bg-gray-100 rounded-lg mb-4 overflow-hidden">
                          <img
                            src={product.imageUrl}
                            alt={product.productName}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}

                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Selling Price:</span>
                          <span className="font-semibold text-green-600">
                            {formatCurrency(product.sellingPrice, product.currency)}
                          </span>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Cost Price:</span>
                          <span className="font-medium">
                            {formatCurrency(product.costPrice, product.currency)}
                          </span>
                        </div>

                        {product.categoryName && (
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Category:</span>
                            <Badge variant="outline">{product.categoryName}</Badge>
                          </div>
                        )}

                        {product.brand && (
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Brand:</span>
                            <span className="text-sm">{product.brand}</span>
                          </div>
                        )}

                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Unit:</span>
                          <span className="text-sm capitalize">{product.unitOfMeasure}</span>
                        </div>

                        {product.description && (
                          <p className="text-sm text-gray-600 line-clamp-2">
                            {product.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center space-x-2 mt-4 pt-4 border-t">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewProduct(product)}
                          className="flex-1"
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditProduct(product)}
                          className="flex-1"
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center space-x-2 mt-6">
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="text-sm">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </TabsContent>

          {/* Categories Tab */}
          <TabsContent value="categories" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Product Categories</CardTitle>
                  <Button
                    onClick={() => {
                      resetCategoryForm();
                      setEditingCategory(null);
                      setShowCategoryForm(true);
                    }}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Category
                  </Button>
                </div>
              </CardHeader>

              <CardContent>
                <div className="space-y-4">
                  {categories.map(category => (
                    <Card key={category.id} className="border-l-4 border-l-blue-500">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg">{category.categoryName}</h3>
                            <p className="text-sm text-gray-600">Code: {category.categoryCode}</p>
                            {category.description && (
                              <p className="text-sm text-gray-700 mt-1">{category.description}</p>
                            )}
                            <div className="flex items-center space-x-4 mt-2">
                              <span className="text-sm">
                                VAT Rate: <strong>{(category.taxRate * 100).toFixed(1)}%</strong>
                              </span>
                              {category.isActive ? (
                                <Badge variant="secondary" className="bg-green-100 text-green-800">
                                  Active
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="bg-gray-100 text-gray-800">
                                  Inactive
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Button variant="outline" size="sm">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Total Products</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{products.length}</div>
                  <p className="text-xs text-gray-500 mt-1">Active products</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Categories</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{categories.length}</div>
                  <p className="text-xs text-gray-500 mt-1">Product categories</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Average Price</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatCurrency(
                      products.reduce((sum, p) => sum + p.sellingPrice, 0) / Math.max(products.length, 1),
                      selectedCurrency
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Across all products</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Currency Mix</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {NIGERIAN_CURRENCIES.map(currency => {
                      const count = products.filter(p => p.currency === currency.value).length;
                      return (
                        <div key={currency.value} className="flex justify-between text-xs">
                          <span>{currency.value}</span>
                          <span>{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Nigerian Market Settings</CardTitle>
                <p className="text-sm text-gray-600">
                  Configure settings specific to Nigerian business operations
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Default Currency</Label>
                      <Select defaultValue="NGN">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {NIGERIAN_CURRENCIES.map(currency => (
                            <SelectItem key={currency.value} value={currency.value}>
                              {currency.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Default VAT Rate</Label>
                      <Input type="number" step="0.001" defaultValue="0.075" />
                      <p className="text-xs text-gray-500 mt-1">Nigerian standard VAT (7.5%)</p>
                    </div>
                  </div>

                  <div>
                    <Label>Auto-generate SKU Pattern</Label>
                    <Input defaultValue="{category}-{product}-{timestamp}" />
                    <p className="text-xs text-gray-500 mt-1">
                      Available variables: {'{category}'}, {'{product}'}, {'{timestamp}'}, {'{random}'}
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch defaultChecked />
                    <Label>Enable multi-currency pricing</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch defaultChecked />
                    <Label>Enable bulk pricing tiers</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch defaultChecked />
                    <Label>Enable unit conversions</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch defaultChecked />
                    <Label>Apply Nigerian VAT regulations</Label>
                  </div>
                </div>

                <div className="pt-4">
                  <Button className="bg-blue-600 hover:bg-blue-700">
                    <Save className="h-4 w-4 mr-2" />
                    Save Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Product Form Dialog */}
        {showProductForm && (
          <Dialog open={showProductForm} onOpenChange={setShowProductForm}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingProduct ? 'Edit Product' : 'Create New Product'}
                </DialogTitle>
                <DialogDescription>
                  {editingProduct ? 'Update product information' : 'Add a new product to your catalog'}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6">
                {/* Basic Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="productCode">Product Code *</Label>
                    <Input
                      id="productCode"
                      value={productForm.productCode}
                      onChange={(e) => setProductForm(prev => ({ ...prev, productCode: e.target.value }))}
                      placeholder="Enter unique product code"
                    />
                  </div>

                  <div>
                    <Label htmlFor="productName">Product Name *</Label>
                    <Input
                      id="productName"
                      value={productForm.productName}
                      onChange={(e) => setProductForm(prev => ({ ...prev, productName: e.target.value }))}
                      placeholder="Enter product name"
                    />
                  </div>

                  <div>
                    <Label htmlFor="sku">SKU</Label>
                    <Input
                      id="sku"
                      value={productForm.sku}
                      onChange={(e) => setProductForm(prev => ({ ...prev, sku: e.target.value }))}
                      placeholder="Will be auto-generated if left empty"
                    />
                  </div>

                  <div>
                    <Label htmlFor="barcode">Barcode</Label>
                    <Input
                      id="barcode"
                      value={productForm.barcode}
                      onChange={(e) => setProductForm(prev => ({ ...prev, barcode: e.target.value }))}
                      placeholder="Enter barcode"
                    />
                  </div>

                  <div>
                    <Label htmlFor="categoryId">Category</Label>
                    <Select
                      value={productForm.categoryId}
                      onValueChange={(value) => setProductForm(prev => ({ ...prev, categoryId: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map(category => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.categoryName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="brand">Brand</Label>
                    <Input
                      id="brand"
                      value={productForm.brand}
                      onChange={(e) => setProductForm(prev => ({ ...prev, brand: e.target.value }))}
                      placeholder="Enter brand name"
                    />
                  </div>
                </div>

                {/* Pricing Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Pricing Information</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="costPrice">Cost Price *</Label>
                      <Input
                        id="costPrice"
                        type="number"
                        step="0.01"
                        value={productForm.costPrice}
                        onChange={(e) => setProductForm(prev => ({ ...prev, costPrice: parseFloat(e.target.value) || 0 }))}
                        placeholder="0.00"
                      />
                    </div>

                    <div>
                      <Label htmlFor="sellingPrice">Selling Price *</Label>
                      <Input
                        id="sellingPrice"
                        type="number"
                        step="0.01"
                        value={productForm.sellingPrice}
                        onChange={(e) => setProductForm(prev => ({ ...prev, sellingPrice: parseFloat(e.target.value) || 0 }))}
                        placeholder="0.00"
                      />
                    </div>

                    <div>
                      <Label htmlFor="currency">Currency</Label>
                      <Select
                        value={productForm.currency}
                        onValueChange={(value) => setProductForm(prev => ({ ...prev, currency: value as any }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {NIGERIAN_CURRENCIES.map(currency => (
                            <SelectItem key={currency.value} value={currency.value}>
                              {currency.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Bulk Pricing */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Bulk Pricing Tiers</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddBulkPricing}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Tier
                      </Button>
                    </div>

                    {productForm.bulkPricing.map((bp, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <Input
                          type="number"
                          placeholder="Min Quantity"
                          value={bp.minQuantity}
                          onChange={(e) => handleUpdateBulkPricing(index, 'minQuantity', parseInt(e.target.value) || 1)}
                        />
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Unit Price"
                          value={bp.unitPrice}
                          onChange={(e) => handleUpdateBulkPricing(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleRemoveBulkPricing(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Inventory Settings */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Inventory Settings</h3>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <Label htmlFor="minStockLevel">Min Stock</Label>
                      <Input
                        id="minStockLevel"
                        type="number"
                        value={productForm.minStockLevel}
                        onChange={(e) => setProductForm(prev => ({ ...prev, minStockLevel: parseInt(e.target.value) || 0 }))}
                      />
                    </div>

                    <div>
                      <Label htmlFor="maxStockLevel">Max Stock</Label>
                      <Input
                        id="maxStockLevel"
                        type="number"
                        value={productForm.maxStockLevel}
                        onChange={(e) => setProductForm(prev => ({ ...prev, maxStockLevel: parseInt(e.target.value) || 1000 }))}
                      />
                    </div>

                    <div>
                      <Label htmlFor="reorderPoint">Reorder Point</Label>
                      <Input
                        id="reorderPoint"
                        type="number"
                        value={productForm.reorderPoint}
                        onChange={(e) => setProductForm(prev => ({ ...prev, reorderPoint: parseInt(e.target.value) || 10 }))}
                      />
                    </div>

                    <div>
                      <Label htmlFor="reorderQuantity">Reorder Qty</Label>
                      <Input
                        id="reorderQuantity"
                        type="number"
                        value={productForm.reorderQuantity}
                        onChange={(e) => setProductForm(prev => ({ ...prev, reorderQuantity: parseInt(e.target.value) || 50 }))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="unitOfMeasure">Unit of Measure</Label>
                      <Select
                        value={productForm.unitOfMeasure}
                        onValueChange={(value) => setProductForm(prev => ({ ...prev, unitOfMeasure: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {UNITS_OF_MEASURE.map(unit => (
                            <SelectItem key={unit} value={unit}>
                              {unit}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center space-x-2 pt-6">
                      <Switch
                        checked={productForm.isTaxable}
                        onCheckedChange={(checked) => setProductForm(prev => ({ ...prev, isTaxable: checked }))}
                      />
                      <Label>Subject to VAT</Label>
                    </div>
                  </div>
                </div>

                {/* Unit Conversions - Nigerian Market Feature */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Unit Conversions (Nigerian Market)</h3>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <Label>Pieces per Carton</Label>
                      <Input
                        type="number"
                        value={productForm.unitConversions?.piecesPerCarton || ''}
                        onChange={(e) => setProductForm(prev => ({
                          ...prev,
                          unitConversions: {
                            ...prev.unitConversions,
                            piecesPerCarton: parseInt(e.target.value) || undefined
                          }
                        }))}
                        placeholder="e.g., 24"
                      />
                    </div>

                    <div>
                      <Label>Cartons per Pallet</Label>
                      <Input
                        type="number"
                        value={productForm.unitConversions?.cartonsPerPallet || ''}
                        onChange={(e) => setProductForm(prev => ({
                          ...prev,
                          unitConversions: {
                            ...prev.unitConversions,
                            cartonsPerPallet: parseInt(e.target.value) || undefined
                          }
                        }))}
                        placeholder="e.g., 40"
                      />
                    </div>

                    <div>
                      <Label>Grams per Unit</Label>
                      <Input
                        type="number"
                        value={productForm.unitConversions?.gramPerUnit || ''}
                        onChange={(e) => setProductForm(prev => ({
                          ...prev,
                          unitConversions: {
                            ...prev.unitConversions,
                            gramPerUnit: parseInt(e.target.value) || undefined
                          }
                        }))}
                        placeholder="e.g., 500"
                      />
                    </div>

                    <div>
                      <Label>ML per Unit</Label>
                      <Input
                        type="number"
                        value={productForm.unitConversions?.mlPerUnit || ''}
                        onChange={(e) => setProductForm(prev => ({
                          ...prev,
                          unitConversions: {
                            ...prev.unitConversions,
                            mlPerUnit: parseInt(e.target.value) || undefined
                          }
                        }))}
                        placeholder="e.g., 500"
                      />
                    </div>
                  </div>
                </div>

                {/* Additional Details */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Additional Details</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="weight">Weight (kg)</Label>
                      <Input
                        id="weight"
                        type="number"
                        step="0.01"
                        value={productForm.weight}
                        onChange={(e) => setProductForm(prev => ({ ...prev, weight: parseFloat(e.target.value) || 0 }))}
                        placeholder="0.00"
                      />
                    </div>

                    <div>
                      <Label htmlFor="dimensions">Dimensions</Label>
                      <Input
                        id="dimensions"
                        value={productForm.dimensions}
                        onChange={(e) => setProductForm(prev => ({ ...prev, dimensions: e.target.value }))}
                        placeholder="L x W x H (cm)"
                      />
                    </div>

                    <div>
                      <Label htmlFor="imageUrl">Image URL</Label>
                      <Input
                        id="imageUrl"
                        value={productForm.imageUrl}
                        onChange={(e) => setProductForm(prev => ({ ...prev, imageUrl: e.target.value }))}
                        placeholder="https://..."
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={productForm.description}
                      onChange={(e) => setProductForm(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Product description..."
                      rows={3}
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={productForm.isActive}
                      onCheckedChange={(checked) => setProductForm(prev => ({ ...prev, isActive: checked }))}
                    />
                    <Label>Active Product</Label>
                  </div>
                </div>

                {/* Form Actions */}
                <div className="flex items-center justify-end space-x-2 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowProductForm(false);
                      setEditingProduct(null);
                      resetProductForm();
                    }}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                  <Button
                    onClick={editingProduct ? updateProduct : createProduct}
                    disabled={loading || !productForm.productCode || !productForm.productName || !productForm.sellingPrice}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {loading ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    {editingProduct ? 'Update Product' : 'Create Product'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Category Form Dialog */}
        {showCategoryForm && (
          <Dialog open={showCategoryForm} onOpenChange={setShowCategoryForm}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {editingCategory ? 'Edit Category' : 'Create New Category'}
                </DialogTitle>
                <DialogDescription>
                  {editingCategory ? 'Update category information' : 'Add a new product category'}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="categoryCode">Category Code *</Label>
                    <Input
                      id="categoryCode"
                      value={categoryForm.categoryCode}
                      onChange={(e) => setCategoryForm(prev => ({ ...prev, categoryCode: e.target.value }))}
                      placeholder="Enter unique category code"
                    />
                  </div>

                  <div>
                    <Label htmlFor="categoryName">Category Name *</Label>
                    <Input
                      id="categoryName"
                      value={categoryForm.categoryName}
                      onChange={(e) => setCategoryForm(prev => ({ ...prev, categoryName: e.target.value }))}
                      placeholder="Enter category name"
                    />
                  </div>

                  <div>
                    <Label htmlFor="parentCategoryId">Parent Category</Label>
                    <Select
                      value={categoryForm.parentCategoryId}
                      onValueChange={(value) => setCategoryForm(prev => ({ ...prev, parentCategoryId: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select parent (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">No Parent</SelectItem>
                        {categories.map(category => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.categoryName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="taxRate">VAT Rate (%)</Label>
                    <Input
                      id="taxRate"
                      type="number"
                      step="0.001"
                      value={categoryForm.taxRate * 100}
                      onChange={(e) => setCategoryForm(prev => ({ ...prev, taxRate: (parseFloat(e.target.value) || 0) / 100 }))}
                      placeholder="7.5"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="categoryDescription">Description</Label>
                  <Textarea
                    id="categoryDescription"
                    value={categoryForm.description}
                    onChange={(e) => setCategoryForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Category description..."
                    rows={3}
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    checked={categoryForm.isActive}
                    onCheckedChange={(checked) => setCategoryForm(prev => ({ ...prev, isActive: checked }))}
                  />
                  <Label>Active Category</Label>
                </div>

                <div className="flex items-center justify-end space-x-2 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowCategoryForm(false);
                      setEditingCategory(null);
                      resetCategoryForm();
                    }}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                  <Button
                    onClick={createCategory}
                    disabled={loading || !categoryForm.categoryCode || !categoryForm.categoryName}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {loading ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    {editingCategory ? 'Update Category' : 'Create Category'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Product Details Dialog */}
        {selectedProduct && (
          <Dialog open={!!selectedProduct} onOpenChange={() => setSelectedProduct(null)}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  {selectedProduct.productName}
                </DialogTitle>
                <DialogDescription>
                  Product details and variants
                </DialogDescription>
              </DialogHeader>

              <Tabs defaultValue="details" className="w-full">
                <TabsList>
                  <TabsTrigger value="details">Product Details</TabsTrigger>
                  <TabsTrigger value="variants">Variants ({variants.length})</TabsTrigger>
                  <TabsTrigger value="pricing">Pricing</TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="space-y-6">
                  {selectedProduct.imageUrl && (
                    <div className="w-full h-64 bg-gray-100 rounded-lg overflow-hidden">
                      <img
                        src={selectedProduct.imageUrl}
                        alt={selectedProduct.productName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <h3 className="font-semibold text-gray-700">Basic Information</h3>
                        <div className="space-y-2 mt-2">
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Product Code:</span>
                            <span className="font-medium">{selectedProduct.productCode}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">SKU:</span>
                            <span className="font-medium">{selectedProduct.sku || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Barcode:</span>
                            <span className="font-medium">{selectedProduct.barcode || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Brand:</span>
                            <span className="font-medium">{selectedProduct.brand || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Unit of Measure:</span>
                            <span className="font-medium capitalize">{selectedProduct.unitOfMeasure}</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h3 className="font-semibold text-gray-700">Inventory Settings</h3>
                        <div className="space-y-2 mt-2">
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Min Stock Level:</span>
                            <span className="font-medium">{selectedProduct.minStockLevel}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Max Stock Level:</span>
                            <span className="font-medium">{selectedProduct.maxStockLevel}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Reorder Point:</span>
                            <span className="font-medium">{selectedProduct.reorderPoint}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Reorder Quantity:</span>
                            <span className="font-medium">{selectedProduct.reorderQuantity}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <h3 className="font-semibold text-gray-700">Pricing Information</h3>
                        <div className="space-y-2 mt-2">
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Cost Price:</span>
                            <span className="font-medium">
                              {formatCurrency(selectedProduct.costPrice, selectedProduct.currency)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Selling Price:</span>
                            <span className="font-medium text-green-600">
                              {formatCurrency(selectedProduct.sellingPrice, selectedProduct.currency)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Currency:</span>
                            <span className="font-medium">{selectedProduct.currency}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Profit Margin:</span>
                            <span className="font-medium">
                              {((selectedProduct.sellingPrice - selectedProduct.costPrice) / selectedProduct.sellingPrice * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">VAT Status:</span>
                            <Badge variant={selectedProduct.isTaxable ? "secondary" : "outline"}>
                              {selectedProduct.isTaxable ? 'Taxable' : 'Exempt'}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      {selectedProduct.unitConversions && (
                        <div>
                          <h3 className="font-semibold text-gray-700">Unit Conversions</h3>
                          <div className="space-y-2 mt-2">
                            {selectedProduct.unitConversions.piecesPerCarton && (
                              <div className="flex justify-between">
                                <span className="text-sm text-gray-600">Pieces per Carton:</span>
                                <span className="font-medium">{selectedProduct.unitConversions.piecesPerCarton}</span>
                              </div>
                            )}
                            {selectedProduct.unitConversions.cartonsPerPallet && (
                              <div className="flex justify-between">
                                <span className="text-sm text-gray-600">Cartons per Pallet:</span>
                                <span className="font-medium">{selectedProduct.unitConversions.cartonsPerPallet}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <div>
                        <h3 className="font-semibold text-gray-700">Physical Properties</h3>
                        <div className="space-y-2 mt-2">
                          {selectedProduct.weight && (
                            <div className="flex justify-between">
                              <span className="text-sm text-gray-600">Weight:</span>
                              <span className="font-medium">{selectedProduct.weight} kg</span>
                            </div>
                          )}
                          {selectedProduct.dimensions && (
                            <div className="flex justify-between">
                              <span className="text-sm text-gray-600">Dimensions:</span>
                              <span className="font-medium">{selectedProduct.dimensions}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {selectedProduct.description && (
                    <div>
                      <h3 className="font-semibold text-gray-700">Description</h3>
                      <p className="text-gray-600 mt-2">{selectedProduct.description}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                    <div>
                      <span className="text-sm text-gray-600">Created:</span>
                      <span className="ml-2">{formatDate(selectedProduct.createdAt)}</span>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600">Last Updated:</span>
                      <span className="ml-2">{formatDate(selectedProduct.updatedAt)}</span>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="variants" className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Product Variants</h3>
                    <Button
                      onClick={() => {
                        setVariantForm(prev => ({ ...prev, productId: selectedProduct.id }));
                        setShowVariantForm(true);
                      }}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Variant
                    </Button>
                  </div>

                  {variants.length === 0 ? (
                    <div className="text-center py-12">
                      <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No variants found</h3>
                      <p className="text-gray-600">Create variants for this product to offer different sizes, colors, or styles.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {variants.map(variant => (
                        <Card key={variant.id}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <h4 className="font-semibold">{variant.variantName}</h4>
                                <p className="text-sm text-gray-600">{variant.variantCode}</p>
                              </div>
                              <div className="flex items-center space-x-1">
                                <Badge variant="outline" className="capitalize">
                                  {variant.variantType}
                                </Badge>
                                {variant.isDefault && (
                                  <Badge variant="secondary">Default</Badge>
                                )}
                                {variant.isActive ? (
                                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                                    Active
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="bg-gray-100 text-gray-800">
                                    Inactive
                                  </Badge>
                                )}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className="flex justify-between">
                                <span className="text-sm text-gray-600">Value:</span>
                                <span className="font-medium">{variant.variantValue}</span>
                              </div>

                              {variant.sku && (
                                <div className="flex justify-between">
                                  <span className="text-sm text-gray-600">SKU:</span>
                                  <span className="font-medium">{variant.sku}</span>
                                </div>
                              )}

                              <div className="flex justify-between">
                                <span className="text-sm text-gray-600">Cost Price:</span>
                                <span className="font-medium">
                                  {formatCurrency(variant.costPrice, selectedProduct.currency)}
                                </span>
                              </div>

                              {variant.sellingPrice && (
                                <div className="flex justify-between">
                                  <span className="text-sm text-gray-600">Selling Price:</span>
                                  <span className="font-medium text-green-600">
                                    {formatCurrency(variant.sellingPrice, selectedProduct.currency)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="pricing" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Base Pricing</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Cost Price:</span>
                          <span className="text-2xl font-bold">
                            {formatCurrency(selectedProduct.costPrice, selectedProduct.currency)}
                          </span>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Selling Price:</span>
                          <span className="text-2xl font-bold text-green-600">
                            {formatCurrency(selectedProduct.sellingPrice, selectedProduct.currency)}
                          </span>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Profit Margin:</span>
                          <span className="text-lg font-semibold">
                            {((selectedProduct.sellingPrice - selectedProduct.costPrice) / selectedProduct.sellingPrice * 100).toFixed(1)}%
                          </span>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Currency:</span>
                          <Badge variant="outline">
                            {NIGERIAN_CURRENCIES.find(c => c.value === selectedProduct.currency)?.label}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">VAT Calculation</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {selectedProduct.isTaxable ? (
                          <>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600">Base Amount:</span>
                              <span className="font-medium">
                                {formatCurrency(selectedProduct.sellingPrice, selectedProduct.currency)}
                              </span>
                            </div>

                            <div className="flex justify-between items-center">
                              <span className="text-gray-600">VAT (7.5%):</span>
                              <span className="font-medium">
                                {formatCurrency(selectedProduct.sellingPrice * 0.075, selectedProduct.currency)}
                              </span>
                            </div>

                            <div className="flex justify-between items-center border-t pt-2">
                              <span className="text-gray-600">Total with VAT:</span>
                              <span className="text-lg font-bold">
                                {formatCurrency(selectedProduct.sellingPrice * 1.075, selectedProduct.currency)}
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="text-center py-4">
                            <Badge variant="outline" className="text-sm">
                              VAT Exempt Product
                            </Badge>
                            <p className="text-sm text-gray-600 mt-2">
                              This product is not subject to VAT charges
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Bulk Pricing */}
                  {selectedProduct.bulkPricing && selectedProduct.bulkPricing.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Bulk Pricing Tiers</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {selectedProduct.bulkPricing.map((bp, index) => (
                            <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                              <span className="font-medium">
                                {bp.minQuantity}+ units
                              </span>
                              <span className="text-green-600 font-bold">
                                {formatCurrency(bp.unitPrice, selectedProduct.currency)} per unit
                              </span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
        )}

        {/* Variant Form Dialog */}
        {showVariantForm && (
          <Dialog open={showVariantForm} onOpenChange={setShowVariantForm}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Product Variant</DialogTitle>
                <DialogDescription>
                  Add a new variant for {selectedProduct?.productName}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="variantCode">Variant Code *</Label>
                    <Input
                      id="variantCode"
                      value={variantForm.variantCode}
                      onChange={(e) => setVariantForm(prev => ({ ...prev, variantCode: e.target.value }))}
                      placeholder="Enter unique variant code"
                    />
                  </div>

                  <div>
                    <Label htmlFor="variantName">Variant Name *</Label>
                    <Input
                      id="variantName"
                      value={variantForm.variantName}
                      onChange={(e) => setVariantForm(prev => ({ ...prev, variantName: e.target.value }))}
                      placeholder="Enter variant name"
                    />
                  </div>

                  <div>
                    <Label htmlFor="variantType">Variant Type *</Label>
                    <Select
                      value={variantForm.variantType}
                      onValueChange={(value) => setVariantForm(prev => ({ ...prev, variantType: value as any }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VARIANT_TYPES.map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="variantValue">Variant Value *</Label>
                    <Input
                      id="variantValue"
                      value={variantForm.variantValue}
                      onChange={(e) => setVariantForm(prev => ({ ...prev, variantValue: e.target.value }))}
                      placeholder="e.g., Large, Red, Cotton"
                    />
                  </div>

                  <div>
                    <Label htmlFor="variantSku">SKU</Label>
                    <Input
                      id="variantSku"
                      value={variantForm.sku}
                      onChange={(e) => setVariantForm(prev => ({ ...prev, sku: e.target.value }))}
                      placeholder="Variant SKU"
                    />
                  </div>

                  <div>
                    <Label htmlFor="variantBarcode">Barcode</Label>
                    <Input
                      id="variantBarcode"
                      value={variantForm.barcode}
                      onChange={(e) => setVariantForm(prev => ({ ...prev, barcode: e.target.value }))}
                      placeholder="Variant barcode"
                    />
                  </div>

                  <div>
                    <Label htmlFor="variantCostPrice">Cost Price *</Label>
                    <Input
                      id="variantCostPrice"
                      type="number"
                      step="0.01"
                      value={variantForm.costPrice}
                      onChange={(e) => setVariantForm(prev => ({ ...prev, costPrice: parseFloat(e.target.value) || 0 }))}
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <Label htmlFor="variantSellingPrice">Selling Price</Label>
                    <Input
                      id="variantSellingPrice"
                      type="number"
                      step="0.01"
                      value={variantForm.sellingPrice}
                      onChange={(e) => setVariantForm(prev => ({ ...prev, sellingPrice: parseFloat(e.target.value) || 0 }))}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="variantWeight">Weight (kg)</Label>
                    <Input
                      id="variantWeight"
                      type="number"
                      step="0.01"
                      value={variantForm.weight}
                      onChange={(e) => setVariantForm(prev => ({ ...prev, weight: parseFloat(e.target.value) || 0 }))}
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <Label htmlFor="variantDimensions">Dimensions</Label>
                    <Input
                      id="variantDimensions"
                      value={variantForm.dimensions}
                      onChange={(e) => setVariantForm(prev => ({ ...prev, dimensions: e.target.value }))}
                      placeholder="L x W x H (cm)"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="variantImageUrl">Image URL</Label>
                  <Input
                    id="variantImageUrl"
                    value={variantForm.imageUrl}
                    onChange={(e) => setVariantForm(prev => ({ ...prev, imageUrl: e.target.value }))}
                    placeholder="https://..."
                  />
                </div>

                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={variantForm.isDefault}
                      onCheckedChange={(checked) => setVariantForm(prev => ({ ...prev, isDefault: checked }))}
                    />
                    <Label>Default Variant</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={variantForm.isActive}
                      onCheckedChange={(checked) => setVariantForm(prev => ({ ...prev, isActive: checked }))}
                    />
                    <Label>Active Variant</Label>
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-2 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowVariantForm(false);
                      resetVariantForm();
                    }}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                  <Button
                    onClick={createVariant}
                    disabled={loading || !variantForm.variantCode || !variantForm.variantName || !variantForm.variantValue}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {loading ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Create Variant
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}