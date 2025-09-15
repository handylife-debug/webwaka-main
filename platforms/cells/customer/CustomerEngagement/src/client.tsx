'use client';

import { useState, useEffect } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
// Progress component fallback
const Progress = ({ value, className }: { value: number; className?: string }) => (
  <div className={`w-full bg-gray-200 rounded-full h-2 ${className}`}>
    <div 
      className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
      style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
    />
  </div>
);
import { 
  Star,
  Trophy,
  Gift,
  TrendingUp,
  TrendingDown,
  Calendar,
  DollarSign,
  MessageSquare,
  ShoppingCart,
  Users,
  Target,
  Award,
  Zap,
  Clock,
  MapPin,
  Phone,
  Mail,
  Heart,
  Sparkles,
  Crown,
  Wallet,
  BarChart3,
  PieChart,
  LineChart,
  Activity,
  RefreshCw,
  Download,
  Send,
  Settings,
  Plus,
  Minus,
  ArrowUp,
  ArrowDown,
  AlertCircle,
  CheckCircle,
  Info,
  Calendar as CalendarIcon,
  Flag
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  BarChart as RechartsBarChart,
  Bar,
  Legend
} from 'recharts';

// Types
interface LoyaltyProfile {
  customerId: string;
  tenantId: string;
  currentPoints: number;
  lifetimePoints: number;
  currentTier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'vip';
  nextTier?: string;
  pointsToNextTier: number;
  expiringPoints: number;
  expirationDate?: string;
  cashbackEarned: number;
  familyPoints: number;
  seasonalBonus: number;
  bulkPurchaseBonus: number;
  engagementScore: number;
  lastEngagement: string;
  totalTransactions: number;
  averageSpend: number;
  visitFrequency: number;
  preferredChannels: string[];
  purchaseSeasonality: {
    month: string;
    transactions: number;
    averageSpend: number;
  }[];
  timeOfDayPreferences: {
    hour: number;
    transactionCount: number;
  }[];
  categoryPreferences: {
    category: string;
    percentage: number;
    lastPurchase: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

interface BehaviorAnalysis {
  purchasePattern: {
    totalPurchases: number;
    totalSpent: number;
    averageOrderValue: number;
    purchaseFrequency: number;
    daysSinceLastPurchase: number;
    firstPurchaseDate: string;
    lastPurchaseDate: string;
  };
  seasonality: {
    monthlySpend: number[];
    monthlyTransactions: number[];
    peakMonths: { month: number; spend: number }[];
  };
  categoryPreferences: {
    category: string;
    percentage: number;
    averageSpend: number;
    lastPurchase: string;
  }[];
  paymentPreferences: {
    preferences: { method: string; percentage: number; averageSpend: number }[];
    cash_percentage: number;
    digital_adoption: number;
  };
  churnRisk: 'low' | 'medium' | 'high';
  lifetimeValuePrediction: number;
  recommendations: string[];
  nigerianMarketInsights: {
    cashPaymentPercentage: number;
    bulkPurchasePattern: {
      frequency: number;
      averageAmount: number;
      percentage: number;
    };
    familyShoppingIndicators: {
      likelihood: number;
      averageBasketSize: number;
    };
    seasonalSpendingPeaks: {
      holiday: string;
      month: number;
      transactions: number;
      totalSpend: number;
    }[];
  };
}

interface CustomerEngagementCellProps {
  mode?: 'view' | 'analytics' | 'campaigns' | 'rewards';
  customerId?: string;
  customer?: any;
  tenantId: string;
  isOpen: boolean;
  onClose: () => void;
  onLoyaltyUpdate?: (loyalty: LoyaltyProfile) => void;
  onEngagementUpdate?: (engagement: any) => void;
}

// Nigerian tier configuration
const TIER_CONFIG = {
  bronze: { 
    color: 'bg-amber-100 text-amber-800 border-amber-200', 
    icon: '🥉', 
    minSpend: 0,
    benefits: ['1x points', 'Basic support', 'Monthly newsletter']
  },
  silver: { 
    color: 'bg-gray-100 text-gray-800 border-gray-200', 
    icon: '🥈', 
    minSpend: 50000,
    benefits: ['1.5x points', 'Priority support', 'Exclusive offers', 'Free delivery']
  },
  gold: { 
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200', 
    icon: '🥇', 
    minSpend: 200000,
    benefits: ['2x points', 'VIP support', 'Early access', 'Birthday rewards']
  },
  platinum: { 
    color: 'bg-purple-100 text-purple-800 border-purple-200', 
    icon: '💎', 
    minSpend: 500000,
    benefits: ['3x points', 'Personal advisor', 'Exclusive events', 'Family rewards']
  },
  vip: { 
    color: 'bg-rose-100 text-rose-800 border-rose-200', 
    icon: '👑', 
    minSpend: 1000000,
    benefits: ['5x points', 'Concierge service', 'Custom rewards', 'Partner benefits']
  }
};

// Chart colors for Nigerian market appeal
const CHART_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

// Nigerian seasonal periods
const NIGERIAN_SEASONS = [
  { name: 'Ramadan', period: 'Mar-Apr', icon: '🌙' },
  { name: 'Eid', period: 'Apr', icon: '🎉' },
  { name: 'Independence', period: 'Oct', icon: '🇳🇬' },
  { name: 'Christmas', period: 'Dec', icon: '🎄' }
];

export function CustomerEngagementCell({
  mode = 'view',
  customerId,
  customer,
  tenantId,
  isOpen,
  onClose,
  onLoyaltyUpdate,
  onEngagementUpdate
}: CustomerEngagementCellProps) {
  const [loyaltyProfile, setLoyaltyProfile] = useState<LoyaltyProfile | null>(null);
  const [behaviorAnalysis, setBehaviorAnalysis] = useState<BehaviorAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('loyalty');
  
  // Points management state
  const [pointsAction, setPointsAction] = useState<'add' | 'deduct'>('add');
  const [pointsAmount, setPointsAmount] = useState('');
  const [pointsReason, setPointsReason] = useState('');

  // Load loyalty data
  useEffect(() => {
    if (isOpen && customerId) {
      loadLoyaltyData();
    }
  }, [isOpen, customerId]);

  const loadLoyaltyData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Load loyalty profile
      const loyaltyResponse = await fetch(`/api/cells/customer/CustomerEngagement?action=getLoyaltyProgram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          customerId,
          includePurchaseHistory: true,
          includeRewardHistory: true,
          includeEngagementMetrics: true
        })
      });

      const loyaltyResult = await loyaltyResponse.json();
      if (loyaltyResult.success && loyaltyResult.loyaltyProfile) {
        setLoyaltyProfile(loyaltyResult.loyaltyProfile);
      }

      // Load behavior analysis
      const behaviorResponse = await fetch(`/api/cells/customer/CustomerEngagement?action=analyzePurchaseBehavior`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          customerId,
          timeRange: '12m',
          includePredictions: true,
          includeRecommendations: true
        })
      });

      const behaviorResult = await behaviorResponse.json();
      if (behaviorResult.success && behaviorResult.behaviorAnalysis) {
        setBehaviorAnalysis(behaviorResult.behaviorAnalysis);
      }

    } catch (err) {
      console.error('Failed to load loyalty data:', err);
      setError('Failed to load loyalty and engagement data');
    } finally {
      setLoading(false);
    }
  };

  const handlePointsUpdate = async () => {
    if (!pointsAmount || !pointsReason) {
      setError('Points amount and reason are required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/cells/customer/CustomerEngagement?action=updateLoyaltyPoints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          customerId,
          points: parseInt(pointsAmount),
          action: pointsAction,
          reason: pointsReason,
          category: 'manual'
        })
      });

      const result = await response.json();
      if (result.success) {
        await loadLoyaltyData(); // Refresh data
        setPointsAmount('');
        setPointsReason('');
        onLoyaltyUpdate?.(loyaltyProfile!);
      } else {
        setError(result.message || 'Failed to update points');
      }
    } catch (err) {
      console.error('Failed to update points:', err);
      setError('Failed to update loyalty points');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `₦${amount.toLocaleString()}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-NG');
  };

  const getTierProgress = () => {
    if (!loyaltyProfile) return 0;
    const tierConfig = TIER_CONFIG[loyaltyProfile.currentTier];
    const nextTierConfig = loyaltyProfile.nextTier ? TIER_CONFIG[loyaltyProfile.nextTier as keyof typeof TIER_CONFIG] : null;
    
    if (!nextTierConfig) return 100;
    
    const currentSpend = loyaltyProfile.averageSpend * loyaltyProfile.totalTransactions;
    const progress = (currentSpend / nextTierConfig.minSpend) * 100;
    return Math.min(100, progress);
  };

  const getEngagementColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    if (score >= 40) return 'text-orange-600';
    return 'text-red-600';
  };

  const getChurnRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'text-green-600 bg-green-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'high': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  if (loading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-center p-8">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            Loading loyalty and engagement data...
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Customer Engagement & Loyalty
            {customer && (
              <span className="text-base font-normal text-gray-600">
                - {customer.firstName} {customer.lastName}
              </span>
            )}
          </DialogTitle>
          
          {loyaltyProfile && (
            <DialogDescription className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1">
                <Star className="h-3 w-3 text-yellow-500" />
                <span>{loyaltyProfile.currentPoints.toLocaleString()} points</span>
              </div>
              
              <Badge className={TIER_CONFIG[loyaltyProfile.currentTier].color}>
                {TIER_CONFIG[loyaltyProfile.currentTier].icon} {loyaltyProfile.currentTier.toUpperCase()}
              </Badge>
              
              <div className="flex items-center gap-1">
                <Activity className="h-3 w-3" />
                <span className={getEngagementColor(loyaltyProfile.engagementScore)}>
                  {loyaltyProfile.engagementScore}% engaged
                </span>
              </div>
              
              {behaviorAnalysis && (
                <Badge className={getChurnRiskColor(behaviorAnalysis.churnRisk)}>
                  {behaviorAnalysis.churnRisk} churn risk
                </Badge>
              )}
            </DialogDescription>
          )}
        </DialogHeader>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
            <div className="flex items-center">
              <AlertCircle className="h-4 w-4 text-red-400 mr-2" />
              <span className="text-red-800 text-sm">{error}</span>
            </div>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="loyalty">Loyalty Program</TabsTrigger>
            <TabsTrigger value="analytics">Purchase Analytics</TabsTrigger>
            <TabsTrigger value="engagement">Engagement</TabsTrigger>
            <TabsTrigger value="rewards">Rewards</TabsTrigger>
          </TabsList>

          {/* Loyalty Program Tab */}
          <TabsContent value="loyalty" className="space-y-6">
            {loyaltyProfile && (
              <>
                {/* Loyalty Overview */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">Current Points</p>
                          <p className="text-2xl font-bold text-blue-600">
                            {loyaltyProfile.currentPoints.toLocaleString()}
                          </p>
                        </div>
                        <Star className="h-8 w-8 text-yellow-500" />
                      </div>
                      {loyaltyProfile.expiringPoints > 0 && (
                        <p className="text-xs text-orange-600 mt-1">
                          {loyaltyProfile.expiringPoints} expiring soon
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">Cash-back Earned</p>
                          <p className="text-2xl font-bold text-green-600">
                            {formatCurrency(loyaltyProfile.cashbackEarned)}
                          </p>
                        </div>
                        <Wallet className="h-8 w-8 text-green-500" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">Family Points</p>
                          <p className="text-2xl font-bold text-purple-600">
                            {loyaltyProfile.familyPoints.toLocaleString()}
                          </p>
                        </div>
                        <Users className="h-8 w-8 text-purple-500" />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Tier Progression */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Crown className="h-5 w-5" />
                      Tier Progression
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Badge className={TIER_CONFIG[loyaltyProfile.currentTier].color}>
                        {TIER_CONFIG[loyaltyProfile.currentTier].icon} Current: {loyaltyProfile.currentTier.toUpperCase()}
                      </Badge>
                      {loyaltyProfile.nextTier && (
                        <Badge variant="outline">
                          Next: {loyaltyProfile.nextTier.toUpperCase()}
                        </Badge>
                      )}
                    </div>
                    
                    {loyaltyProfile.nextTier && (
                      <>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Progress to {loyaltyProfile.nextTier}</span>
                            <span>{Math.round(getTierProgress())}%</span>
                          </div>
                          <Progress value={getTierProgress()} className="h-2" />
                        </div>
                        
                        <div className="text-sm text-gray-600">
                          <p>Spend {formatCurrency(loyaltyProfile.pointsToNextTier * 100)} more to reach {loyaltyProfile.nextTier} tier</p>
                        </div>
                      </>
                    )}

                    {/* Current Tier Benefits */}
                    <div className="mt-4">
                      <h4 className="font-medium mb-2">Current Benefits:</h4>
                      <ul className="text-sm text-gray-600 space-y-1">
                        {TIER_CONFIG[loyaltyProfile.currentTier].benefits.map((benefit, index) => (
                          <li key={index} className="flex items-center gap-2">
                            <CheckCircle className="h-3 w-3 text-green-500" />
                            {benefit}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>

                {/* Points Management */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="h-5 w-5" />
                      Points Management
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <Select value={pointsAction} onValueChange={(value: 'add' | 'deduct') => setPointsAction(value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="add">
                            <span className="flex items-center gap-2">
                              <Plus className="h-3 w-3" />
                              Add Points
                            </span>
                          </SelectItem>
                          <SelectItem value="deduct">
                            <span className="flex items-center gap-2">
                              <Minus className="h-3 w-3" />
                              Deduct Points
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      
                      <Input
                        type="number"
                        placeholder="Points amount"
                        value={pointsAmount}
                        onChange={(e) => setPointsAmount(e.target.value)}
                      />
                      
                      <Input
                        placeholder="Reason for adjustment"
                        value={pointsReason}
                        onChange={(e) => setPointsReason(e.target.value)}
                      />
                      
                      <Button
                        onClick={handlePointsUpdate}
                        disabled={saving || !pointsAmount || !pointsReason}
                      >
                        {saving ? (
                          <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Zap className="h-3 w-3 mr-1" />
                        )}
                        Update
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Nigerian Market Features */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Flag className="h-5 w-5" />
                      Nigerian Market Features
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <h4 className="font-medium">Seasonal Bonuses</h4>
                        <div className="flex items-center justify-between p-2 bg-green-50 rounded">
                          <span className="text-sm">Current Season Points</span>
                          <span className="font-medium text-green-600">
                            +{loyaltyProfile.seasonalBonus.toLocaleString()}
                          </span>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <h4 className="font-medium">Bulk Purchase Rewards</h4>
                        <div className="flex items-center justify-between p-2 bg-blue-50 rounded">
                          <span className="text-sm">Bulk Bonus Points</span>
                          <span className="font-medium text-blue-600">
                            +{loyaltyProfile.bulkPurchaseBonus.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Nigerian Seasonal Calendar */}
                    <div className="mt-4">
                      <h4 className="font-medium mb-2">Upcoming Nigerian Holidays</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {NIGERIAN_SEASONS.map((season) => (
                          <div key={season.name} className="text-center p-2 bg-gray-50 rounded">
                            <div className="text-lg">{season.icon}</div>
                            <div className="text-xs font-medium">{season.name}</div>
                            <div className="text-xs text-gray-600">{season.period}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Purchase Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            {behaviorAnalysis && (
              <>
                {/* Purchase Overview */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">Total Purchases</p>
                          <p className="text-2xl font-bold">{behaviorAnalysis.purchasePattern.totalPurchases}</p>
                        </div>
                        <ShoppingCart className="h-8 w-8 text-blue-500" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">Average Order Value</p>
                          <p className="text-2xl font-bold">{formatCurrency(behaviorAnalysis.purchasePattern.averageOrderValue)}</p>
                        </div>
                        <DollarSign className="h-8 w-8 text-green-500" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">Purchase Frequency</p>
                          <p className="text-2xl font-bold">{behaviorAnalysis.purchasePattern.purchaseFrequency.toFixed(1)}/mo</p>
                        </div>
                        <Calendar className="h-8 w-8 text-purple-500" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">Lifetime Value</p>
                          <p className="text-2xl font-bold">{formatCurrency(behaviorAnalysis.lifetimeValuePrediction)}</p>
                        </div>
                        <TrendingUp className="h-8 w-8 text-orange-500" />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Nigerian Market Insights */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Flag className="h-5 w-5" />
                      Nigerian Market Insights
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="text-center p-4 bg-green-50 rounded-lg">
                        <div className="text-2xl font-bold text-green-600">
                          {behaviorAnalysis.nigerianMarketInsights.cashPaymentPercentage.toFixed(1)}%
                        </div>
                        <div className="text-sm text-gray-600">Cash Payments</div>
                        <div className="text-xs text-gray-500 mt-1">
                          Digital adoption: {behaviorAnalysis.paymentPreferences.digital_adoption.toFixed(1)}%
                        </div>
                      </div>
                      
                      <div className="text-center p-4 bg-blue-50 rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">
                          {behaviorAnalysis.nigerianMarketInsights.familyShoppingIndicators.likelihood.toFixed(1)}%
                        </div>
                        <div className="text-sm text-gray-600">Family Shopping</div>
                        <div className="text-xs text-gray-500 mt-1">
                          Avg basket: {formatCurrency(behaviorAnalysis.nigerianMarketInsights.familyShoppingIndicators.averageBasketSize)}
                        </div>
                      </div>
                      
                      <div className="text-center p-4 bg-purple-50 rounded-lg">
                        <div className="text-2xl font-bold text-purple-600">
                          {behaviorAnalysis.nigerianMarketInsights.bulkPurchasePattern.frequency}
                        </div>
                        <div className="text-sm text-gray-600">Bulk Purchases</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {behaviorAnalysis.nigerianMarketInsights.bulkPurchasePattern.percentage.toFixed(1)}% of all purchases
                        </div>
                      </div>
                    </div>

                    {/* Seasonal Spending Peaks */}
                    <div>
                      <h4 className="font-medium mb-2">Seasonal Spending Patterns</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {behaviorAnalysis.nigerianMarketInsights.seasonalSpendingPeaks.map((peak) => (
                          <div key={peak.holiday} className="p-2 bg-gray-50 rounded text-center">
                            <div className="font-medium text-sm">{peak.holiday}</div>
                            <div className="text-xs text-gray-600">{peak.transactions} purchases</div>
                            <div className="text-xs text-green-600">{formatCurrency(peak.totalSpend)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Payment Preferences */}
                <Card>
                  <CardHeader>
                    <CardTitle>Payment Method Preferences</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsPieChart>
                          <Pie
                            data={behaviorAnalysis.paymentPreferences.preferences.map((pref, index) => ({
                              name: pref.method,
                              value: pref.percentage,
                              fill: CHART_COLORS[index % CHART_COLORS.length]
                            }))}
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            dataKey="value"
                            label={({name, value}: {name: string, value: number}) => `${name}: ${value.toFixed(1)}%`}
                          >
                            {behaviorAnalysis.paymentPreferences.preferences.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </RechartsPieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Recommendations */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="h-5 w-5" />
                      Recommendations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {behaviorAnalysis.recommendations.map((recommendation, index) => (
                        <div key={index} className="flex items-start gap-2 p-2 bg-blue-50 rounded">
                          <Info className="h-4 w-4 text-blue-500 mt-0.5" />
                          <span className="text-sm">{recommendation}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Engagement Tab */}
          <TabsContent value="engagement" className="space-y-6">
            {loyaltyProfile && (
              <>
                {/* Engagement Score */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      Engagement Score
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="flex justify-between text-sm mb-1">
                          <span>Engagement Level</span>
                          <span className={getEngagementColor(loyaltyProfile.engagementScore)}>
                            {loyaltyProfile.engagementScore}%
                          </span>
                        </div>
                        <Progress 
                          value={loyaltyProfile.engagementScore} 
                          className="h-3"
                        />
                      </div>
                      <div className="text-right">
                        <div className={`text-2xl font-bold ${getEngagementColor(loyaltyProfile.engagementScore)}`}>
                          {loyaltyProfile.engagementScore >= 80 ? '🔥' : loyaltyProfile.engagementScore >= 60 ? '💪' : loyaltyProfile.engagementScore >= 40 ? '👍' : '😴'}
                        </div>
                        <div className="text-xs text-gray-600">
                          {loyaltyProfile.engagementScore >= 80 ? 'Highly Engaged' : 
                           loyaltyProfile.engagementScore >= 60 ? 'Engaged' : 
                           loyaltyProfile.engagementScore >= 40 ? 'Moderately Engaged' : 'Low Engagement'}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Communication Preferences */}
                <Card>
                  <CardHeader>
                    <CardTitle>Preferred Communication Channels</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {loyaltyProfile.preferredChannels.map((channel, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                          {channel === 'phone' && <Phone className="h-4 w-4" />}
                          {channel === 'sms' && <MessageSquare className="h-4 w-4" />}
                          {channel === 'email' && <Mail className="h-4 w-4" />}
                          {channel === 'whatsapp' && <MessageSquare className="h-4 w-4 text-green-600" />}
                          <span className="text-sm capitalize">{channel}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Visit Frequency */}
                <Card>
                  <CardHeader>
                    <CardTitle>Visit Patterns</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">
                          {loyaltyProfile.visitFrequency.toFixed(1)}
                        </div>
                        <div className="text-sm text-gray-600">Visits per month</div>
                      </div>
                      
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">
                          {loyaltyProfile.totalTransactions}
                        </div>
                        <div className="text-sm text-gray-600">Total visits</div>
                      </div>
                      
                      <div className="text-center">
                        <div className="text-2xl font-bold text-purple-600">
                          {formatDate(loyaltyProfile.lastEngagement)}
                        </div>
                        <div className="text-sm text-gray-600">Last engagement</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Rewards Tab */}
          <TabsContent value="rewards" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gift className="h-5 w-5" />
                  Available Rewards
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-gray-500">
                  <Gift className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Rewards management coming soon...</p>
                  <p className="text-sm">Customer can redeem points for exclusive Nigerian market rewards</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}