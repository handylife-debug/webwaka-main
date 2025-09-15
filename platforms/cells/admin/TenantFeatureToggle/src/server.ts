import { redis } from '@/lib/redis';
import { safeRedisOperation } from '@/lib/redis';

export interface FeatureConfig {
  id: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  config?: any;
  planRequired?: string;
  isCore?: boolean;
  enabledAt?: number;
  enabledBy?: string;
}

export const tenantFeatureToggleCell = {
  // Get all features for a tenant
  async getTenantFeatures(tenantId: string): Promise<FeatureConfig[]> {
    return await safeRedisOperation(
      async () => {
        const featuresKey = `tenant_features:${tenantId}`;
        const features = await redis.get<FeatureConfig[]>(featuresKey);
        
        if (!features) {
          // Return default features if none configured
          return getDefaultFeatures();
        }
        
        return features;
      },
      getDefaultFeatures()
    );
  },

  // Toggle a specific feature for a tenant
  async toggleFeature(
    tenantId: string, 
    featureId: string, 
    enabled: boolean, 
    config?: any,
    userId?: string
  ): Promise<{ success: boolean; message: string; updatedFeatures: FeatureConfig[] }> {
    return await safeRedisOperation(
      async () => {
        const featuresKey = `tenant_features:${tenantId}`;
        const currentFeatures = await redis.get<FeatureConfig[]>(featuresKey) || getDefaultFeatures();
        
        const featureIndex = currentFeatures.findIndex(f => f.id === featureId);
        
        if (featureIndex === -1) {
          return {
            success: false,
            message: 'Feature not found',
            updatedFeatures: currentFeatures
          };
        }

        // Check if feature is core (cannot be disabled)
        if (currentFeatures[featureIndex].isCore && !enabled) {
          return {
            success: false,
            message: 'Core features cannot be disabled',
            updatedFeatures: currentFeatures
          };
        }

        // Update the feature
        currentFeatures[featureIndex] = {
          ...currentFeatures[featureIndex],
          enabled,
          config: config || currentFeatures[featureIndex].config,
          enabledAt: enabled ? Date.now() : undefined,
          enabledBy: enabled ? userId : undefined
        };

        // Save updated features
        await redis.set(featuresKey, currentFeatures);

        // Log the activity
        await logFeatureActivity(tenantId, featureId, enabled, userId);

        return {
          success: true,
          message: `Feature ${enabled ? 'enabled' : 'disabled'} successfully`,
          updatedFeatures: currentFeatures
        };
      },
      {
        success: false,
        message: 'Failed to toggle feature',
        updatedFeatures: []
      }
    );
  },

  // Apply a feature template (bulk enable/disable)
  async applyFeatureTemplate(
    tenantId: string, 
    templateName: string,
    userId?: string
  ): Promise<{ success: boolean; message: string; updatedFeatures: FeatureConfig[] }> {
    return await safeRedisOperation(
      async () => {
        const templates = getFeatureTemplates();
        const template = templates[templateName];
        
        if (!template) {
          return {
            success: false,
            message: 'Template not found',
            updatedFeatures: []
          };
        }

        const featuresKey = `tenant_features:${tenantId}`;
        const currentFeatures = await redis.get<FeatureConfig[]>(featuresKey) || getDefaultFeatures();
        
        // Apply template
        const updatedFeatures = currentFeatures.map(feature => ({
          ...feature,
          enabled: template.features.includes(feature.id) || feature.isCore,
          enabledAt: template.features.includes(feature.id) ? Date.now() : feature.enabledAt,
          enabledBy: template.features.includes(feature.id) ? userId : feature.enabledBy
        }));

        await redis.set(featuresKey, updatedFeatures);

        // Log template application
        await logFeatureActivity(tenantId, `template:${templateName}`, true, userId);

        return {
          success: true,
          message: `Template "${template.name}" applied successfully`,
          updatedFeatures
        };
      },
      {
        success: false,
        message: 'Failed to apply template',
        updatedFeatures: []
      }
    );
  },

  // Get feature usage analytics
  async getFeatureAnalytics(tenantId: string): Promise<any> {
    return await safeRedisOperation(
      async () => {
        const analyticsKey = `feature_analytics:${tenantId}`;
        return await redis.get(analyticsKey) || {
          totalFeatures: 0,
          enabledFeatures: 0,
          recentlyModified: [],
          mostUsed: []
        };
      },
      {}
    );
  }
};

// Default feature configuration
function getDefaultFeatures(): FeatureConfig[] {
  return [
    {
      id: 'analytics',
      name: 'Advanced Analytics',
      description: 'Detailed usage analytics and reporting dashboards',
      category: 'Analytics',
      enabled: false,
      planRequired: 'Pro'
    },
    {
      id: 'custom_domain',
      name: 'Custom Domain',
      description: 'Use your own domain instead of subdomain',
      category: 'Branding',
      enabled: false,
      planRequired: 'Enterprise'
    },
    {
      id: 'sso',
      name: 'Single Sign-On',
      description: 'SSO integration with SAML, OAuth, and more',
      category: 'Security',
      enabled: false,
      planRequired: 'Enterprise'
    },
    {
      id: 'api_access',
      name: 'API Access',
      description: 'Full REST API access for integrations',
      category: 'Integration',
      enabled: true,
      isCore: true
    },
    {
      id: 'team_management',
      name: 'Team Management',
      description: 'Advanced user roles and permissions',
      category: 'Users',
      enabled: false,
      planRequired: 'Pro'
    },
    {
      id: 'payment_processing',
      name: 'Payment Processing',
      description: 'Accept payments via multiple gateways',
      category: 'Commerce',
      enabled: false,
      config: {
        enabledGateways: ['paystack'],
        currency: 'NGN'
      }
    },
    {
      id: 'email_marketing',
      name: 'Email Marketing',
      description: 'Send newsletters and marketing campaigns',
      category: 'Marketing',
      enabled: false,
      planRequired: 'Pro'
    },
    {
      id: 'push_notifications',
      name: 'Push Notifications',
      description: 'Send real-time notifications to users',
      category: 'Communication',
      enabled: false
    }
  ];
}

// Feature templates for common configurations
function getFeatureTemplates(): Record<string, { name: string; description: string; features: string[] }> {
  return {
    starter: {
      name: 'Starter Package',
      description: 'Basic features for new tenants',
      features: ['api_access', 'push_notifications']
    },
    business: {
      name: 'Business Package',
      description: 'Features for growing businesses',
      features: ['api_access', 'analytics', 'team_management', 'payment_processing', 'email_marketing']
    },
    enterprise: {
      name: 'Enterprise Package',
      description: 'All features for large organizations',
      features: ['analytics', 'custom_domain', 'sso', 'api_access', 'team_management', 'payment_processing', 'email_marketing', 'push_notifications']
    },
    ecommerce: {
      name: 'E-commerce Package',
      description: 'Features optimized for online stores',
      features: ['api_access', 'payment_processing', 'analytics', 'email_marketing', 'push_notifications']
    }
  };
}

// Log feature activity for audit purposes
async function logFeatureActivity(
  tenantId: string, 
  featureId: string, 
  enabled: boolean, 
  userId?: string
): Promise<void> {
  const activityId = `feature_activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const activityData = {
    id: activityId,
    tenantId,
    featureId,
    action: enabled ? 'enabled' : 'disabled',
    userId,
    timestamp: Date.now()
  };

  await redis.set(`activity:${activityId}`, activityData);
  await redis.lpush(`feature_activity:${tenantId}`, activityId);
}