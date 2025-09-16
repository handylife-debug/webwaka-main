import { redis } from '@/lib/redis';
import { safeRedisOperation } from '@/lib/redis';

export interface PredictiveAlert {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  locationId: string;
  locationName: string;
  currentStock: number;
  predictedStockout: string; // ISO date
  daysUntilStockout: number;
  recommendedReorderQuantity: number;
  reorderUrgency: 'critical' | 'high' | 'medium' | 'low';
  salesVelocity: number; // units per day
  leadTimeDays: number;
  seasonalFactor: number;
  category: string;
  supplier?: string;
  costImpact: number;
  confidence: number; // 0-100%
  reasons: string[];
  recommendedActions: string[];
}

export interface InventoryAnalytics {
  totalAlerts: number;
  criticalAlerts: number;
  totalValueAtRisk: number;
  averageVelocity: number;
  slowMovingItems: number;
  overStockedItems: number;
  optimalStockLevel: number;
  forecastAccuracy: number;
  seasonalTrends: {
    product: string;
    trend: 'increasing' | 'decreasing' | 'stable';
    factor: number;
  }[];
  topRisks: {
    productName: string;
    daysUntilStockout: number;
    potentialLoss: number;
  }[];
}

export interface ReorderSuggestion {
  productId: string;
  productName: string;
  supplier: string;
  recommendedQuantity: number;
  estimatedCost: number;
  priority: number;
  deliveryDate: string;
  notes: string[];
}

export const predictiveInventoryAlertsCell = {
  // Generate predictive inventory alerts using advanced analytics
  async generatePredictiveAlerts(tenantId: string, locationId?: string): Promise<PredictiveAlert[]> {
    return await safeRedisOperation(
      async () => {
        // Check cache first for performance optimization
        const cacheKey = `predictive_alerts:${tenantId}:${locationId || 'all'}`;
        const cachedAlerts = await redis.get<PredictiveAlert[]>(cacheKey);
        
        if (cachedAlerts && cachedAlerts.length > 0) {
          return cachedAlerts;
        }
        
        // Get current stock levels and transaction history
        const stockData = await this.getCurrentStockLevels(tenantId, locationId);
        const transactionHistory = await this.getTransactionHistory(tenantId, 90); // 90 days
        const seasonalData = await this.getSeasonalPatterns(tenantId);
        
        const alerts: PredictiveAlert[] = [];
        
        for (const stock of stockData) {
          const salesVelocity = this.calculateSalesVelocity(stock.productId, transactionHistory);
          const seasonalFactor = this.getSeasonalFactorByCategory(stock.category, seasonalData);
          const adjustedVelocity = salesVelocity * seasonalFactor;
          
          // Predict stockout date
          const daysUntilStockout = adjustedVelocity > 0 ? 
            Math.floor(stock.currentStock / adjustedVelocity) : 999;
          
          // Determine if alert needed based on lead time + safety buffer
          const leadTime = stock.leadTimeDays || 7;
          const safetyBuffer = 3;
          const alertThreshold = leadTime + safetyBuffer;
          
          if (daysUntilStockout <= alertThreshold) {
            const urgency = this.calculateUrgency(daysUntilStockout, leadTime);
            const reorderQuantity = this.calculateOptimalReorderQuantity(
              adjustedVelocity, leadTime, stock.currentStock
            );
            
            alerts.push({
              id: `alert_${stock.productId}_${Date.now()}`,
              productId: stock.productId,
              productName: stock.productName,
              sku: stock.sku,
              locationId: stock.locationId,
              locationName: stock.locationName,
              currentStock: stock.currentStock,
              predictedStockout: new Date(Date.now() + daysUntilStockout * 24 * 60 * 60 * 1000).toISOString(),
              daysUntilStockout,
              recommendedReorderQuantity: reorderQuantity,
              reorderUrgency: urgency,
              salesVelocity: adjustedVelocity,
              leadTimeDays: leadTime,
              seasonalFactor,
              category: stock.category,
              supplier: stock.supplier,
              costImpact: reorderQuantity * (stock.costPrice || 0),
              confidence: this.calculateConfidence(salesVelocity, transactionHistory.length),
              reasons: this.generateAlertReasons(daysUntilStockout, salesVelocity, seasonalFactor),
              recommendedActions: this.generateRecommendedActions(urgency, reorderQuantity, stock.supplier)
            });
          }
        }
        
        // Sort by urgency and days until stockout
        alerts.sort((a, b) => {
          const urgencyOrder = { critical: 4, high: 3, medium: 2, low: 1 };
          if (urgencyOrder[a.reorderUrgency] !== urgencyOrder[b.reorderUrgency]) {
            return urgencyOrder[b.reorderUrgency] - urgencyOrder[a.reorderUrgency];
          }
          return a.daysUntilStockout - b.daysUntilStockout;
        });
        
        // Cache alerts for 1 hour (reuse the cacheKey from above)
        await redis.set(cacheKey, alerts, { ex: 3600 });
        
        return alerts;
      },
      []
    );
  },

  // Get comprehensive inventory analytics
  async getInventoryAnalytics(tenantId: string): Promise<InventoryAnalytics> {
    return await safeRedisOperation(
      async () => {
        const alerts = await this.generatePredictiveAlerts(tenantId);
        const stockData = await this.getCurrentStockLevels(tenantId);
        const transactionHistory = await this.getTransactionHistory(tenantId, 30);
        
        const totalValueAtRisk = alerts
          .filter(a => a.reorderUrgency === 'critical' || a.reorderUrgency === 'high')
          .reduce((sum, alert) => sum + alert.costImpact, 0);
        
        const velocities = stockData.map(stock => 
          this.calculateSalesVelocity(stock.productId, transactionHistory)
        ).filter(v => v > 0);
        
        const slowMovingThreshold = 0.1; // less than 0.1 units per day
        const slowMovingItems = velocities.filter(v => v < slowMovingThreshold).length;
        
        // Calculate overstock (high stock relative to velocity)
        const overStockedItems = stockData.filter(stock => {
          const velocity = this.calculateSalesVelocity(stock.productId, transactionHistory);
          return velocity > 0 && (stock.currentStock / velocity) > 90; // more than 90 days supply
        }).length;
        
        return {
          totalAlerts: alerts.length,
          criticalAlerts: alerts.filter(a => a.reorderUrgency === 'critical').length,
          totalValueAtRisk,
          averageVelocity: velocities.length > 0 ? velocities.reduce((a, b) => a + b, 0) / velocities.length : 0,
          slowMovingItems,
          overStockedItems,
          optimalStockLevel: this.calculateOptimalStockLevel(stockData, transactionHistory),
          forecastAccuracy: 85 + Math.random() * 10, // Simulated 85-95% accuracy
          seasonalTrends: await this.generateSeasonalTrends(tenantId),
          topRisks: alerts.slice(0, 5).map(alert => ({
            productName: alert.productName,
            daysUntilStockout: alert.daysUntilStockout,
            potentialLoss: alert.costImpact * 1.2 // Include opportunity cost
          }))
        };
      },
      {
        totalAlerts: 0,
        criticalAlerts: 0,
        totalValueAtRisk: 0,
        averageVelocity: 0,
        slowMovingItems: 0,
        overStockedItems: 0,
        optimalStockLevel: 0,
        forecastAccuracy: 0,
        seasonalTrends: [],
        topRisks: []
      }
    );
  },

  // Generate automated reorder suggestions
  async generateReorderSuggestions(tenantId: string): Promise<ReorderSuggestion[]> {
    return await safeRedisOperation(
      async () => {
        const alerts = await this.generatePredictiveAlerts(tenantId);
        const urgentAlerts = alerts.filter(a => 
          a.reorderUrgency === 'critical' || a.reorderUrgency === 'high'
        );
        
        return urgentAlerts.map(alert => ({
          productId: alert.productId,
          productName: alert.productName,
          supplier: alert.supplier || 'Default Supplier',
          recommendedQuantity: alert.recommendedReorderQuantity,
          estimatedCost: alert.costImpact,
          priority: alert.reorderUrgency === 'critical' ? 5 : 4,
          deliveryDate: new Date(Date.now() + alert.leadTimeDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          notes: [
            `Predicted stockout in ${alert.daysUntilStockout} days`,
            `Current velocity: ${alert.salesVelocity.toFixed(2)} units/day`,
            `Confidence: ${alert.confidence}%`
          ]
        }));
      },
      []
    );
  },

  // Helper methods for calculations
  async getCurrentStockLevels(tenantId: string, locationId?: string) {
    // Simulate database query - in real implementation, query actual database
    const mockData = Array.from({ length: 50 }, (_, i) => ({
      productId: `prod_${i + 1}`,
      productName: `Product ${i + 1}`,
      sku: `SKU${String(i + 1).padStart(3, '0')}`,
      locationId: locationId || `location_${Math.floor(i / 10) + 1}`,
      locationName: `Store ${Math.floor(i / 10) + 1}`,
      currentStock: Math.floor(Math.random() * 100) + 1,
      costPrice: 10 + Math.random() * 90,
      category: ['Electronics', 'Clothing', 'Books', 'Food', 'Toys'][Math.floor(Math.random() * 5)],
      supplier: ['Supplier A', 'Supplier B', 'Supplier C'][Math.floor(Math.random() * 3)],
      leadTimeDays: Math.floor(Math.random() * 14) + 3 // 3-16 days
    }));
    
    return mockData;
  },

  async getTransactionHistory(tenantId: string, days: number) {
    // Simulate transaction history with realistic patterns
    const transactions = [];
    const products = 50;
    const today = new Date();
    
    for (let d = 0; d < days; d++) {
      const date = new Date(today.getTime() - d * 24 * 60 * 60 * 1000);
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const dayMultiplier = isWeekend ? 0.7 : 1.2;
      
      for (let p = 1; p <= products; p++) {
        // Some products sell more frequently than others
        const baseFrequency = Math.random() < 0.3 ? 2 : Math.random() < 0.6 ? 1 : 0.5;
        const quantity = Math.floor((Math.random() * 3 + 1) * baseFrequency * dayMultiplier);
        
        if (quantity > 0) {
          transactions.push({
            productId: `prod_${p}`,
            quantity,
            date: date.toISOString(),
            price: 10 + Math.random() * 90
          });
        }
      }
    }
    
    return transactions;
  },

  async getSeasonalPatterns(tenantId: string) {
    // Simulate seasonal patterns
    const currentMonth = new Date().getMonth();
    return {
      electronics: 1.0 + Math.sin((currentMonth - 10) * Math.PI / 6) * 0.3, // Peak in Nov-Dec
      clothing: 1.0 + Math.sin((currentMonth - 8) * Math.PI / 3) * 0.4, // Peak in fall/spring
      food: 1.0 + Math.random() * 0.1 - 0.05, // Relatively stable
      toys: 1.0 + Math.sin((currentMonth - 11) * Math.PI / 4) * 0.5, // Peak in Nov-Dec
      books: 1.0 + Math.sin((currentMonth - 8) * Math.PI / 6) * 0.2 // Peak in back-to-school
    };
  },

  calculateSalesVelocity(productId: string, transactions: any[]): number {
    const productTransactions = transactions.filter(t => t.productId === productId);
    if (productTransactions.length === 0) return 0;
    
    const totalQuantity = productTransactions.reduce((sum, t) => sum + t.quantity, 0);
    const uniqueDays = new Set(productTransactions.map(t => t.date.split('T')[0])).size;
    
    return uniqueDays > 0 ? totalQuantity / uniqueDays : 0;
  },

  // Updated to use category-based seasonal factor mapping instead of hardcoded product IDs
  getSeasonalFactorByCategory(category: string, seasonalData: any): number {
    // Normalize category to lowercase for consistent mapping
    const normalizedCategory = category.toLowerCase();
    
    // Map categories to seasonal data with robust fallback handling
    const categorySeasonalFactors: { [key: string]: number } = {
      'electronics': 1.25,
      'clothing': 1.05,
      'toys': 1.4,
      'books': 0.9,
      'food': 1.02,
      'beauty': 1.15,
      'sports': 1.1,
      'home': 1.0,
      'automotive': 0.95,
      'health': 1.05
    };
    
    // Use seasonal data if available, otherwise use default factors
    return seasonalData[normalizedCategory] || categorySeasonalFactors[normalizedCategory] || 1.0;
  },

  calculateUrgency(daysUntilStockout: number, leadTime: number): 'critical' | 'high' | 'medium' | 'low' {
    if (daysUntilStockout <= leadTime / 2) return 'critical';
    if (daysUntilStockout <= leadTime) return 'high';
    if (daysUntilStockout <= leadTime * 1.5) return 'medium';
    return 'low';
  },

  calculateOptimalReorderQuantity(velocity: number, leadTime: number, currentStock: number): number {
    // Economic Order Quantity (EOQ) simplified
    const safetyStock = velocity * 7; // 1 week safety stock
    const reorderPoint = velocity * leadTime + safetyStock;
    const optimalOrderQuantity = Math.max(velocity * leadTime * 2, 10); // At least 2 lead times worth
    
    return Math.max(optimalOrderQuantity - currentStock, 0);
  },

  calculateConfidence(velocity: number, sampleSize: number): number {
    const baseConfidence = Math.min(sampleSize * 2, 90); // More data = higher confidence
    const velocityConfidence = velocity > 0 ? 10 : -20; // Active sales = higher confidence
    return Math.max(Math.min(baseConfidence + velocityConfidence, 95), 20);
  },

  generateAlertReasons(daysUntilStockout: number, velocity: number, seasonalFactor: number): string[] {
    const reasons = [];
    
    if (daysUntilStockout <= 3) reasons.push('Critical: Stock depletes within 3 days');
    if (velocity > 2) reasons.push('High sales velocity detected');
    if (seasonalFactor > 1.2) reasons.push('Seasonal demand increase expected');
    if (velocity > 0 && daysUntilStockout <= 7) reasons.push('Lead time insufficient for reorder');
    
    return reasons.length > 0 ? reasons : ['Regular inventory monitoring alert'];
  },

  generateRecommendedActions(urgency: string, quantity: number, supplier?: string): string[] {
    const actions = [];
    
    if (urgency === 'critical') {
      actions.push('Immediate reorder required');
      actions.push('Consider expedited shipping');
      actions.push('Check alternative suppliers');
    } else if (urgency === 'high') {
      actions.push('Place order within 24 hours');
      actions.push('Verify supplier availability');
    } else {
      actions.push('Schedule reorder this week');
      actions.push('Review demand patterns');
    }
    
    if (supplier) actions.push(`Contact ${supplier} for pricing`);
    actions.push(`Order quantity: ${quantity} units`);
    
    return actions;
  },

  calculateOptimalStockLevel(stockData: any[], transactions: any[]): number {
    // Calculate average optimal stock across all products
    let totalOptimal = 0;
    let count = 0;
    
    for (const stock of stockData) {
      const velocity = this.calculateSalesVelocity(stock.productId, transactions);
      if (velocity > 0) {
        const optimal = velocity * (stock.leadTimeDays || 7) * 2; // 2x lead time
        totalOptimal += optimal;
        count++;
      }
    }
    
    return count > 0 ? totalOptimal / count : 0;
  },

  async generateSeasonalTrends(tenantId: string) {
    // Generate seasonal trend analysis
    return [
      { product: 'Electronics', trend: 'increasing' as const, factor: 1.25 },
      { product: 'Clothing', trend: 'stable' as const, factor: 1.05 },
      { product: 'Toys', trend: 'increasing' as const, factor: 1.4 },
      { product: 'Books', trend: 'decreasing' as const, factor: 0.9 },
      { product: 'Food', trend: 'stable' as const, factor: 1.02 }
    ];
  },

  // Dismiss or acknowledge an alert
  async dismissAlert(tenantId: string, alertId: string, reason?: string): Promise<{ success: boolean; message: string }> {
    return await safeRedisOperation<{ success: boolean; message: string }>(
      async () => {
        const dismissalKey = `dismissed_alerts:${tenantId}`;
        const dismissalData = {
          alertId,
          dismissedAt: Date.now(),
          reason: reason || 'User acknowledged',
          tenantId
        };
        
        await redis.lpush(dismissalKey, JSON.stringify(dismissalData));
        
        return { success: true, message: 'Alert dismissed successfully' };
      },
      { success: false, message: 'Failed to dismiss alert' }
    );
  }
};