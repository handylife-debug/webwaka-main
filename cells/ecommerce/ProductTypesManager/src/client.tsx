'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { 
  ShoppingBox, 
  PackageVariant, 
  Download, 
  Package2, 
  Shield, 
  Plus, 
  Edit, 
  Eye, 
  Trash2,
  AlertCircle,
  CheckCircle,
  Upload,
  X
} from 'lucide-react';

// CELLULAR REUSABILITY: Reuse existing UI patterns and components

export type ProductType = 'simple' | 'variable' | 'digital' | 'bundled' | 'classified';

interface TypedProduct {
  id: string;
  tenantId: string;
  productType: ProductType;
  baseProductData: any;
  typeSpecificData: any;
  variations?: any[];
  digitalAssets?: any[];
  bundleItems?: any[];
  classificationDetails?: any;
  accessControls?: any;
  createdAt: string;
  updatedAt: string;
}

interface ProductTypesManagerProps {
  mode?: 'create' | 'manage' | 'analytics';
  onProductCreated?: (product: TypedProduct) => void;
  onProductUpdated?: (product: TypedProduct) => void;
}

const PRODUCT_TYPE_INFO = {
  simple: {
    icon: ShoppingBox,
    name: 'Simple Product',
    description: 'Single variant physical product with basic inventory management',
    color: 'bg-blue-100 text-blue-800',
    features: ['Basic inventory tracking', 'Single pricing', 'Stock management', 'Nigerian VAT support']
  },
  variable: {
    icon: PackageVariant,
    name: 'Variable Product',
    description: 'Product with multiple variations (size, color, etc.) and complex pricing',
    color: 'bg-green-100 text-green-800',
    features: ['Multiple variations', 'Attribute-based pricing', 'Variation-specific inventory', 'Matrix management']
  },
  digital: {
    icon: Download,
    name: 'Digital Product',
    description: 'Downloadable or streamable digital assets with licensing controls',
    color: 'bg-purple-100 text-purple-800',
    features: ['Digital asset management', 'Download controls', 'License management', 'Auto-fulfillment']
  },
  bundled: {
    icon: Package2,
    name: 'Bundled Product',
    description: 'Combination of multiple products with bundled pricing and inventory',
    color: 'bg-orange-100 text-orange-800',
    features: ['Multi-product bundles', 'Bundle pricing', 'Stock synchronization', 'Optional items']
  },
  classified: {
    icon: Shield,
    name: 'Classified Product',
    description: 'Products with access controls, compliance requirements, and audit trails',
    color: 'bg-red-100 text-red-800',
    features: ['Access controls', 'Compliance tracking', 'Audit trails', 'Role-based access']
  }
};

export function ProductTypesManagerCell({
  mode = 'create',
  onProductCreated,
  onProductUpdated
}: ProductTypesManagerProps) {
  const [selectedType, setSelectedType] = useState<ProductType>('simple');
  const [products, setProducts] = useState<TypedProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === 'manage') {
      loadProducts();
    }
  }, [mode]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      // This would call the getProductsByType action
      const response = await fetch(`/api/cells/ecommerce/ProductTypesManager?action=getProducts`);
      const result = await response.json();
      if (result.success) {
        setProducts(result.products || []);
      } else {
        setError(result.error || 'Failed to load products');
      }
    } catch (err) {
      setError('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'create') {
    return (
      <div className="space-y-6">
        <ProductTypeSelector
          selectedType={selectedType}
          onTypeSelect={setSelectedType}
        />
        
        <ProductTypeCreator
          productType={selectedType}
          onProductCreated={(product) => {
            onProductCreated?.(product);
            setError(null);
          }}
          onError={setError}
        />

        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2 text-red-800">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{error}</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  if (mode === 'manage') {
    return (
      <div className="space-y-6">
        <ProductTypeFilters onFilterChange={loadProducts} />
        <ProductTypeList 
          products={products}
          loading={loading}
          onProductUpdate={(product) => {
            onProductUpdated?.(product);
            loadProducts();
          }}
        />
      </div>
    );
  }

  return <div>Product Analytics Mode - Coming Soon</div>;
}

// Product Type Selector Component
function ProductTypeSelector({ 
  selectedType, 
  onTypeSelect 
}: {
  selectedType: ProductType;
  onTypeSelect: (type: ProductType) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Select Product Type</CardTitle>
        <CardDescription>
          Choose the type of product you want to create
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(PRODUCT_TYPE_INFO).map(([type, info]) => {
            const Icon = info.icon;
            const isSelected = selectedType === type;
            
            return (
              <Card
                key={type}
                className={`cursor-pointer transition-all ${
                  isSelected 
                    ? 'ring-2 ring-blue-500 border-blue-200' 
                    : 'hover:shadow-md'
                }`}
                onClick={() => onTypeSelect(type as ProductType)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className={`p-2 rounded-lg ${info.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-medium">{info.name}</h4>
                      <Badge className={info.color}>{type}</Badge>
                    </div>
                  </div>
                  
                  <p className="text-sm text-gray-600 mb-3">
                    {info.description}
                  </p>
                  
                  <div className="space-y-1">
                    {info.features.slice(0, 2).map((feature, index) => (
                      <div key={index} className="flex items-center space-x-2 text-xs text-gray-500">
                        <CheckCircle className="h-3 w-3" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// Product Type Creator Component
function ProductTypeCreator({
  productType,
  onProductCreated,
  onError
}: {
  productType: ProductType;
  onProductCreated: (product: TypedProduct) => void;
  onError: (error: string) => void;
}) {
  const [formData, setFormData] = useState({
    productCode: '',
    productName: '',
    description: '',
    price: 0,
    currency: 'NGN',
    sku: '',
    barcode: '',
    weight: 0,
    dimensions: '',
    taxable: true,
    stockManaged: true,
    tags: [] as string[],
    images: [] as string[]
  });

  const [typeSpecificData, setTypeSpecificData] = useState<any>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const payload = {
        baseProduct: formData,
        ...typeSpecificData
      };

      const response = await fetch('/api/cells/ecommerce/ProductTypesManager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: `create${productType.charAt(0).toUpperCase() + productType.slice(1)}Product`,
          ...payload
        })
      });

      const result = await response.json();
      
      if (result.success && result.product) {
        onProductCreated(result.product);
        // Reset form
        setFormData({
          productCode: '',
          productName: '',
          description: '',
          price: 0,
          currency: 'NGN',
          sku: '',
          barcode: '',
          weight: 0,
          dimensions: '',
          taxable: true,
          stockManaged: true,
          tags: [],
          images: []
        });
        setTypeSpecificData({});
      } else {
        onError(result.error || 'Failed to create product');
      }
    } catch (err) {
      onError('Failed to create product');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          {React.createElement(PRODUCT_TYPE_INFO[productType].icon, { className: "h-5 w-5" })}
          <span>Create {PRODUCT_TYPE_INFO[productType].name}</span>
        </CardTitle>
        <CardDescription>
          {PRODUCT_TYPE_INFO[productType].description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Product Information */}
          <BaseProductForm 
            formData={formData}
            onChange={setFormData}
          />

          {/* Type-Specific Forms */}
          {productType === 'variable' && (
            <VariableProductForm
              data={typeSpecificData}
              onChange={setTypeSpecificData}
            />
          )}

          {productType === 'digital' && (
            <DigitalProductForm
              data={typeSpecificData}
              onChange={setTypeSpecificData}
            />
          )}

          {productType === 'bundled' && (
            <BundledProductForm
              data={typeSpecificData}
              onChange={setTypeSpecificData}
            />
          )}

          {productType === 'classified' && (
            <ClassifiedProductForm
              data={typeSpecificData}
              onChange={setTypeSpecificData}
            />
          )}

          <div className="flex space-x-4">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating...' : `Create ${PRODUCT_TYPE_INFO[productType].name}`}
            </Button>
            <Button type="button" variant="outline">
              Save as Draft
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// Base Product Form Component
function BaseProductForm({ 
  formData, 
  onChange 
}: {
  formData: any;
  onChange: (data: any) => void;
}) {
  return (
    <div className="space-y-4">
      <h4 className="font-medium text-lg">Basic Information</h4>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="productCode">Product Code *</Label>
          <Input
            id="productCode"
            value={formData.productCode}
            onChange={(e) => onChange({...formData, productCode: e.target.value})}
            placeholder="PROD-001"
            required
          />
        </div>
        
        <div>
          <Label htmlFor="productName">Product Name *</Label>
          <Input
            id="productName"
            value={formData.productName}
            onChange={(e) => onChange({...formData, productName: e.target.value})}
            placeholder="Enter product name"
            required
          />
        </div>
        
        <div>
          <Label htmlFor="price">Price *</Label>
          <Input
            id="price"
            type="number"
            min="0"
            step="0.01"
            value={formData.price}
            onChange={(e) => onChange({...formData, price: parseFloat(e.target.value) || 0})}
            required
          />
        </div>
        
        <div>
          <Label htmlFor="currency">Currency</Label>
          <Select 
            value={formData.currency}
            onValueChange={(value) => onChange({...formData, currency: value})}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NGN">NGN (Nigerian Naira)</SelectItem>
              <SelectItem value="USD">USD (US Dollar)</SelectItem>
              <SelectItem value="GBP">GBP (British Pound)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => onChange({...formData, description: e.target.value})}
          placeholder="Enter product description"
          rows={3}
        />
      </div>

      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-2">
          <Switch
            id="taxable"
            checked={formData.taxable}
            onCheckedChange={(checked) => onChange({...formData, taxable: checked})}
          />
          <Label htmlFor="taxable">Taxable</Label>
        </div>
        
        <div className="flex items-center space-x-2">
          <Switch
            id="stockManaged"
            checked={formData.stockManaged}
            onCheckedChange={(checked) => onChange({...formData, stockManaged: checked})}
          />
          <Label htmlFor="stockManaged">Stock Managed</Label>
        </div>
      </div>
    </div>
  );
}

// Type-specific form components (simplified implementations)
function VariableProductForm({ data, onChange }: { data: any; onChange: (data: any) => void }) {
  return (
    <div className="space-y-4">
      <h4 className="font-medium text-lg">Product Variations</h4>
      <p className="text-sm text-gray-600">Configure product variations like size, color, etc.</p>
      {/* Implementation would include variation attribute builder */}
    </div>
  );
}

function DigitalProductForm({ data, onChange }: { data: any; onChange: (data: any) => void }) {
  return (
    <div className="space-y-4">
      <h4 className="font-medium text-lg">Digital Assets</h4>
      <p className="text-sm text-gray-600">Upload and configure digital assets for this product.</p>
      {/* Implementation would include file upload and license configuration */}
    </div>
  );
}

function BundledProductForm({ data, onChange }: { data: any; onChange: (data: any) => void }) {
  return (
    <div className="space-y-4">
      <h4 className="font-medium text-lg">Bundle Configuration</h4>
      <p className="text-sm text-gray-600">Select products to include in this bundle.</p>
      {/* Implementation would include product selector and bundle configuration */}
    </div>
  );
}

function ClassifiedProductForm({ data, onChange }: { data: any; onChange: (data: any) => void }) {
  return (
    <div className="space-y-4">
      <h4 className="font-medium text-lg">Classification & Access Controls</h4>
      <p className="text-sm text-gray-600">Configure security classification and access restrictions.</p>
      {/* Implementation would include classification level selector and access controls */}
    </div>
  );
}

// Product management components (simplified)
function ProductTypeFilters({ onFilterChange }: { onFilterChange: () => void }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center space-x-4">
          <Select onValueChange={onFilterChange}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="simple">Simple</SelectItem>
              <SelectItem value="variable">Variable</SelectItem>
              <SelectItem value="digital">Digital</SelectItem>
              <SelectItem value="bundled">Bundled</SelectItem>
              <SelectItem value="classified">Classified</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

function ProductTypeList({ 
  products, 
  loading, 
  onProductUpdate 
}: {
  products: TypedProduct[];
  loading: boolean;
  onProductUpdate: (product: TypedProduct) => void;
}) {
  if (loading) {
    return <div className="text-center py-8">Loading products...</div>;
  }

  if (products.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <ShoppingBox className="h-12 w-12 mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">No products found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          onUpdate={onProductUpdate}
        />
      ))}
    </div>
  );
}

function ProductCard({ 
  product, 
  onUpdate 
}: {
  product: TypedProduct;
  onUpdate: (product: TypedProduct) => void;
}) {
  const typeInfo = PRODUCT_TYPE_INFO[product.productType];
  const Icon = typeInfo.icon;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-2">
            <div className={`p-2 rounded-lg ${typeInfo.color}`}>
              <Icon className="h-4 w-4" />
            </div>
            <Badge className={typeInfo.color}>{product.productType}</Badge>
          </div>
          <div className="flex space-x-1">
            <Button size="sm" variant="ghost">
              <Eye className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost">
              <Edit className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <h4 className="font-medium mb-1">{product.baseProductData.productName}</h4>
        <p className="text-sm text-gray-600 mb-2">{product.baseProductData.productCode}</p>
        
        <div className="flex items-center justify-between">
          <span className="font-medium">
            {product.baseProductData.currency} {product.baseProductData.sellingPrice?.toFixed(2)}
          </span>
          <span className="text-xs text-gray-500">
            {new Date(product.updatedAt).toLocaleDateString()}
          </span>
        </div>

        {/* Type-specific indicators */}
        {product.variations && (
          <div className="mt-2 text-xs text-gray-500">
            {product.variations.length} variations
          </div>
        )}
        
        {product.digitalAssets && (
          <div className="mt-2 text-xs text-gray-500">
            {product.digitalAssets.length} digital assets
          </div>
        )}

        {product.bundleItems && (
          <div className="mt-2 text-xs text-gray-500">
            {product.bundleItems.length} bundle items
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ProductTypesManagerCell;