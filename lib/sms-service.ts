/**
 * SMS Service for Nigerian Providers
 * Supports BetaSMS, Nigeria Bulk SMS, KudiSMS and other Nigerian SMS providers
 */

export interface SMSProvider {
  name: string;
  sendSMS: (to: string, message: string, options?: any) => Promise<SMSResponse>;
}

export interface SMSResponse {
  success: boolean;
  messageId?: string;
  message: string;
  provider: string;
  cost?: number;
  deliveryStatus?: string;
}

export interface SMSConfig {
  provider: 'betasms' | 'nigeria-bulk-sms' | 'kudisms' | 'bulksmsnigeria' | 'custom';
  apiKey?: string;
  username?: string;
  password?: string;
  senderId: string;
  apiUrl?: string;
}

// BetaSMS Provider (Popular Nigerian SMS service)
class BetaSMSProvider implements SMSProvider {
  name = 'BetaSMS';
  
  constructor(private config: SMSConfig) {}
  
  async sendSMS(to: string, message: string): Promise<SMSResponse> {
    try {
      const url = 'https://api.betasms.com/api/v1/sms/send';
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          sender: this.config.senderId,
          recipients: [to],
          message: message
        })
      });
      
      const result = await response.json();
      
      return {
        success: response.ok,
        messageId: result.message_id,
        message: result.message || 'SMS sent successfully',
        provider: this.name,
        cost: result.cost,
        deliveryStatus: result.status
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to send SMS: ${error instanceof Error ? error.message : 'Unknown error'}`,
        provider: this.name
      };
    }
  }
}

// Nigeria Bulk SMS Provider
class NigeriaBulkSMSProvider implements SMSProvider {
  name = 'Nigeria Bulk SMS';
  
  constructor(private config: SMSConfig) {}
  
  async sendSMS(to: string, message: string): Promise<SMSResponse> {
    try {
      const url = 'https://portal.nigeriabulksms.com/api/';
      const params = new URLSearchParams({
        username: this.config.username || '',
        password: this.config.password || '',
        message: message,
        sender: this.config.senderId,
        mobiles: to
      });
      
      const response = await fetch(`${url}?${params}`, {
        method: 'GET'
      });
      
      const result = await response.text();
      
      return {
        success: response.ok && !result.includes('ERROR'),
        messageId: result.includes('OK') ? result.split('|')[1] : undefined,
        message: result.includes('OK') ? 'SMS sent successfully' : result,
        provider: this.name
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to send SMS: ${error instanceof Error ? error.message : 'Unknown error'}`,
        provider: this.name
      };
    }
  }
}

// KudiSMS Provider (Multi-channel platform)
class KudiSMSProvider implements SMSProvider {
  name = 'KudiSMS';
  
  constructor(private config: SMSConfig) {}
  
  async sendSMS(to: string, message: string): Promise<SMSResponse> {
    try {
      const url = 'https://api.kudisms.net/api/v1/sms/send';
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          sender: this.config.senderId,
          to: to,
          message: message
        })
      });
      
      const result = await response.json();
      
      return {
        success: response.ok,
        messageId: result.message_id,
        message: result.message || 'SMS sent successfully',
        provider: this.name,
        deliveryStatus: result.status
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to send SMS: ${error instanceof Error ? error.message : 'Unknown error'}`,
        provider: this.name
      };
    }
  }
}

// Generic provider for custom APIs
class CustomSMSProvider implements SMSProvider {
  name = 'Custom Provider';
  
  constructor(private config: SMSConfig) {}
  
  async sendSMS(to: string, message: string): Promise<SMSResponse> {
    try {
      if (!this.config.apiUrl) {
        throw new Error('API URL is required for custom provider');
      }
      
      const response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          sender: this.config.senderId,
          to: to,
          message: message
        })
      });
      
      const result = await response.json();
      
      return {
        success: response.ok,
        messageId: result.message_id || result.id,
        message: result.message || 'SMS sent successfully',
        provider: this.name
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to send SMS: ${error instanceof Error ? error.message : 'Unknown error'}`,
        provider: this.name
      };
    }
  }
}

// SMS Service Factory
export class SMSService {
  private provider: SMSProvider;
  
  constructor(config: SMSConfig) {
    switch (config.provider) {
      case 'betasms':
        this.provider = new BetaSMSProvider(config);
        break;
      case 'nigeria-bulk-sms':
        this.provider = new NigeriaBulkSMSProvider(config);
        break;
      case 'kudisms':
        this.provider = new KudiSMSProvider(config);
        break;
      case 'custom':
        this.provider = new CustomSMSProvider(config);
        break;
      default:
        this.provider = new BetaSMSProvider(config); // Default to BetaSMS
    }
  }
  
  async sendSMS(to: string, message: string): Promise<SMSResponse> {
    // Format Nigerian phone numbers
    const formattedPhone = this.formatNigerianPhoneNumber(to);
    return this.provider.sendSMS(formattedPhone, message);
  }
  
  async sendBulkSMS(recipients: string[], message: string): Promise<SMSResponse[]> {
    const promises = recipients.map(phone => this.sendSMS(phone, message));
    return Promise.all(promises);
  }
  
  private formatNigerianPhoneNumber(phone: string): string {
    // Remove any non-digit characters
    const cleanPhone = phone.replace(/\D/g, '');
    
    // Handle different Nigerian phone number formats
    if (cleanPhone.startsWith('234')) {
      return cleanPhone; // Already in international format
    } else if (cleanPhone.startsWith('0')) {
      return '234' + cleanPhone.substring(1); // Remove leading 0 and add country code
    } else if (cleanPhone.length === 10) {
      return '234' + cleanPhone; // Add country code to 10-digit number
    }
    
    return cleanPhone; // Return as-is if format is unclear
  }
}

// Convenience functions for different message types
export class CustomerCommunicationService {
  constructor(private smsService: SMSService) {}
  
  async sendReceiptSMS(customerPhone: string, receiptDetails: {
    orderId: string;
    amount: number;
    items: string[];
    businessName: string;
  }): Promise<SMSResponse> {
    const message = `Thank you for your purchase from ${receiptDetails.businessName}!\n\nOrder #${receiptDetails.orderId}\nTotal: ₦${receiptDetails.amount.toLocaleString()}\nItems: ${receiptDetails.items.join(', ')}\n\nThank you for your business!`;
    
    return this.smsService.sendSMS(customerPhone, message);
  }
  
  async sendAppointmentReminder(customerPhone: string, appointmentDetails: {
    date: string;
    time: string;
    service: string;
    businessName: string;
  }): Promise<SMSResponse> {
    const message = `Reminder: Your ${appointmentDetails.service} appointment with ${appointmentDetails.businessName} is scheduled for ${appointmentDetails.date} at ${appointmentDetails.time}. See you then!`;
    
    return this.smsService.sendSMS(customerPhone, message);
  }
  
  async sendPromotionalSMS(customerPhone: string, promotion: {
    offer: string;
    validUntil: string;
    businessName: string;
  }): Promise<SMSResponse> {
    const message = `Special offer from ${promotion.businessName}!\n\n${promotion.offer}\n\nValid until ${promotion.validUntil}. Don't miss out!`;
    
    return this.smsService.sendSMS(customerPhone, message);
  }
}

// Default configuration (can be overridden via environment variables)
export function createSMSService(): SMSService {
  const config: SMSConfig = {
    provider: (process.env.SMS_PROVIDER as any) || 'betasms',
    apiKey: process.env.SMS_API_KEY || '',
    username: process.env.SMS_USERNAME || '',
    password: process.env.SMS_PASSWORD || '',
    senderId: process.env.SMS_SENDER_ID || 'YourBusiness',
    apiUrl: process.env.SMS_API_URL
  };
  
  return new SMSService(config);
}

export function createCustomerCommunicationService(): CustomerCommunicationService {
  const smsService = createSMSService();
  return new CustomerCommunicationService(smsService);
}