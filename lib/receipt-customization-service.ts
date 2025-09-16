export interface BusinessInfo {
  name: string
  address: string
  phone: string
  email: string
  website?: string
  taxId?: string
}

export interface ReceiptTemplate {
  logoUrl?: string
  headerMessage?: string
  footerMessage?: string
  primaryColor: string
  accentColor: string
  fontFamily: string
  width: 'narrow' | 'standard' | 'wide'
}

export interface ReceiptSettings {
  showLogo: boolean
  showDateTime: boolean
  showTaxBreakdown: boolean
  showItemDetails: boolean
  autoPrint: boolean
  showBarcode: boolean
  emailReceipt: boolean
  smsReceipt: boolean
  printQuality: 'draft' | 'normal' | 'high'
}

export interface ReceiptTransaction {
  id: string
  date: Date
  items: ReceiptItem[]
  subtotal: number
  tax: number
  total: number
  paymentMethod: string
  cardLast4?: string
  customerEmail?: string
  customerPhone?: string
}

export interface ReceiptItem {
  name: string
  sku?: string
  quantity: number
  price: number
  total: number
}

/**
 * WebWaka Biological Cell: Receipt Customization Service
 * 
 * Provides atomic, reusable receipt customization functionality for POS systems.
 * Handles business branding, template design, and receipt generation.
 * Follows WebWaka principles of single responsibility and tenant isolation.
 */
export class ReceiptCustomizationService {
  private tenantId: string

  // In-memory storage for demo purposes (will be replaced with database)
  private static businessInfoStore: Map<string, BusinessInfo> = new Map()
  private static templateStore: Map<string, ReceiptTemplate> = new Map()
  private static settingsStore: Map<string, ReceiptSettings> = new Map()

  constructor(tenantId: string) {
    this.tenantId = tenantId
    this.initializeDefaults()
  }

  /**
   * Initialize default settings for the tenant
   */
  private initializeDefaults(): void {
    const businessKey = `business:${this.tenantId}`
    const templateKey = `template:${this.tenantId}`
    const settingsKey = `settings:${this.tenantId}`

    // Default business info
    if (!ReceiptCustomizationService.businessInfoStore.has(businessKey)) {
      ReceiptCustomizationService.businessInfoStore.set(businessKey, {
        name: 'Your Business Name',
        address: '123 Main Street\nCity, State, ZIP',
        phone: '(555) 123-4567',
        email: 'info@yourbusiness.com',
        website: 'www.yourbusiness.com',
        taxId: '123-45-6789'
      })
    }

    // Default template
    if (!ReceiptCustomizationService.templateStore.has(templateKey)) {
      ReceiptCustomizationService.templateStore.set(templateKey, {
        headerMessage: 'Thank you for your purchase!',
        footerMessage: 'Please visit us again!',
        primaryColor: '#000000',
        accentColor: '#666666',
        fontFamily: 'Arial',
        width: 'standard'
      })
    }

    // Default settings
    if (!ReceiptCustomizationService.settingsStore.has(settingsKey)) {
      ReceiptCustomizationService.settingsStore.set(settingsKey, {
        showLogo: false,
        showDateTime: true,
        showTaxBreakdown: true,
        showItemDetails: true,
        autoPrint: false,
        showBarcode: false,
        emailReceipt: false,
        smsReceipt: false,
        printQuality: 'normal'
      })
    }
  }

  /**
   * Get business information for the tenant
   */
  async getBusinessInfo(): Promise<BusinessInfo> {
    const key = `business:${this.tenantId}`
    return ReceiptCustomizationService.businessInfoStore.get(key) || {
      name: '',
      address: '',
      phone: '',
      email: ''
    }
  }

  /**
   * Update business information
   */
  async updateBusinessInfo(businessInfo: BusinessInfo): Promise<void> {
    const key = `business:${this.tenantId}`
    ReceiptCustomizationService.businessInfoStore.set(key, businessInfo)
  }

  /**
   * Get receipt template for the tenant
   */
  async getReceiptTemplate(): Promise<ReceiptTemplate> {
    const key = `template:${this.tenantId}`
    return ReceiptCustomizationService.templateStore.get(key) || {
      primaryColor: '#000000',
      accentColor: '#666666',
      fontFamily: 'Arial',
      width: 'standard'
    }
  }

  /**
   * Update receipt template
   */
  async updateReceiptTemplate(template: ReceiptTemplate): Promise<void> {
    const key = `template:${this.tenantId}`
    ReceiptCustomizationService.templateStore.set(key, template)
  }

  /**
   * Get receipt settings for the tenant
   */
  async getReceiptSettings(): Promise<ReceiptSettings> {
    const key = `settings:${this.tenantId}`
    return ReceiptCustomizationService.settingsStore.get(key) || {
      showLogo: false,
      showDateTime: true,
      showTaxBreakdown: true,
      showItemDetails: true,
      autoPrint: false,
      showBarcode: false,
      emailReceipt: false,
      smsReceipt: false,
      printQuality: 'normal'
    }
  }

  /**
   * Update receipt settings
   */
  async updateReceiptSettings(settings: ReceiptSettings): Promise<void> {
    const key = `settings:${this.tenantId}`
    ReceiptCustomizationService.settingsStore.set(key, settings)
  }

  /**
   * Generate preview data for testing
   */
  async generatePreviewData(): Promise<ReceiptTransaction> {
    return {
      id: 'RCP-001234',
      date: new Date(),
      items: [
        {
          name: 'Sample Product 1',
          sku: 'PROD001',
          quantity: 2,
          price: 12.99,
          total: 25.98
        },
        {
          name: 'Sample Product 2',
          sku: 'PROD002',
          quantity: 1,
          price: 8.50,
          total: 8.50
        }
      ],
      subtotal: 34.48,
      tax: 2.84,
      total: 37.32,
      paymentMethod: 'Credit Card',
      cardLast4: '1234'
    }
  }

  /**
   * Generate HTML receipt content
   */
  async generateHTMLReceipt(transaction: ReceiptTransaction): Promise<string> {
    const businessInfo = await this.getBusinessInfo()
    const template = await this.getReceiptTemplate()
    const settings = await this.getReceiptSettings()

    const widthStyles = {
      narrow: 'width: 220px',
      standard: 'width: 300px',
      wide: 'width: 400px'
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Receipt</title>
          <style>
            body {
              font-family: ${template.fontFamily}, monospace;
              color: ${template.primaryColor};
              margin: 0;
              padding: 20px;
              line-height: 1.4;
            }
            .receipt {
              ${widthStyles[template.width]};
              margin: 0 auto;
              background: white;
            }
            .center { text-align: center; }
            .right { text-align: right; }
            .bold { font-weight: bold; }
            .separator { border-bottom: 1px dashed ${template.accentColor}; margin: 10px 0; }
            .item-row { display: flex; justify-content: space-between; margin: 5px 0; }
            .item-details { font-size: 12px; color: ${template.accentColor}; }
            .total-row { border-top: 2px solid ${template.primaryColor}; padding-top: 5px; }
            .barcode { font-family: 'Courier New', monospace; background: black; color: white; padding: 5px; display: inline-block; }
            .logo { max-height: 80px; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="receipt">
            ${settings.showLogo && template.logoUrl ? `
              <div class="center">
                <img src="${template.logoUrl}" alt="Logo" class="logo">
              </div>
            ` : ''}
            
            <div class="center">
              <div class="bold" style="font-size: 18px;">${businessInfo.name}</div>
              <div style="font-size: 12px; white-space: pre-line;">${businessInfo.address}</div>
              <div style="font-size: 12px;">${businessInfo.phone} • ${businessInfo.email}</div>
              ${businessInfo.website ? `<div style="font-size: 12px;">${businessInfo.website}</div>` : ''}
              ${businessInfo.taxId ? `<div style="font-size: 12px;">Tax ID: ${businessInfo.taxId}</div>` : ''}
            </div>

            ${template.headerMessage ? `
              <div class="center separator" style="font-size: 14px;">
                ${template.headerMessage}
              </div>
            ` : ''}

            <div class="separator"></div>

            ${settings.showDateTime ? `
              <div class="item-row">
                <span>Date:</span>
                <span>${transaction.date.toLocaleDateString()}</span>
              </div>
              <div class="item-row">
                <span>Time:</span>
                <span>${transaction.date.toLocaleTimeString()}</span>
              </div>
            ` : ''}
            
            <div class="item-row">
              <span>Receipt #:</span>
              <span>${transaction.id}</span>
            </div>

            <div class="separator"></div>

            ${transaction.items.map(item => `
              <div class="item-row">
                <div style="flex: 1;">
                  <div class="bold">${item.name}</div>
                  ${settings.showItemDetails && item.sku ? `<div class="item-details">SKU: ${item.sku}</div>` : ''}
                </div>
                <div class="right">
                  <div>${item.quantity} × $${item.price.toFixed(2)}</div>
                  <div class="bold">$${item.total.toFixed(2)}</div>
                </div>
              </div>
            `).join('')}

            <div class="separator"></div>

            <div class="item-row">
              <span>Subtotal:</span>
              <span>$${transaction.subtotal.toFixed(2)}</span>
            </div>

            ${settings.showTaxBreakdown ? `
              <div class="item-row">
                <span>Tax:</span>
                <span>$${transaction.tax.toFixed(2)}</span>
              </div>
            ` : ''}

            <div class="item-row bold total-row" style="font-size: 16px;">
              <span>TOTAL:</span>
              <span>$${transaction.total.toFixed(2)}</span>
            </div>

            <div class="separator"></div>

            <div class="center">
              <div>Payment: ${transaction.paymentMethod}</div>
              ${transaction.cardLast4 ? `<div>Card: ****${transaction.cardLast4}</div>` : ''}
            </div>

            ${template.footerMessage ? `
              <div class="center separator" style="font-size: 12px;">
                ${template.footerMessage}
              </div>
            ` : ''}

            ${settings.showBarcode ? `
              <div class="center">
                <div class="barcode">||||| |||| | ||||| |||||||| | ||||</div>
                <div style="font-size: 10px; margin-top: 5px;">${transaction.id.replace('-', '')}</div>
              </div>
            ` : ''}
          </div>
        </body>
      </html>
    `

    return html
  }

  /**
   * Generate PDF receipt
   */
  async generatePDFReceipt(transaction: ReceiptTransaction): Promise<Blob> {
    const html = await this.generateHTMLReceipt(transaction)
    
    // In a real implementation, this would use a PDF generation library
    // For demo purposes, we'll create a simple text blob
    const pdfContent = this.htmlToText(html)
    
    return new Blob([pdfContent], { type: 'application/pdf' })
  }

  /**
   * Print receipt (opens print dialog)
   */
  async printReceipt(transaction: ReceiptTransaction): Promise<void> {
    const html = await this.generateHTMLReceipt(transaction)
    
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(html)
      printWindow.document.close()
      printWindow.print()
    }
  }

  /**
   * Send email receipt
   */
  async sendEmailReceipt(transaction: ReceiptTransaction, email: string): Promise<void> {
    // Mock email sending - in production this would call an email service
    console.log(`Sending email receipt to ${email} for transaction ${transaction.id}`)
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  /**
   * Send SMS receipt
   */
  async sendSMSReceipt(transaction: ReceiptTransaction, phone: string): Promise<void> {
    // Mock SMS sending - in production this would call an SMS service
    console.log(`Sending SMS receipt to ${phone} for transaction ${transaction.id}`)
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  /**
   * Convert HTML to plain text (simplified)
   */
  private htmlToText(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .trim()
  }

  /**
   * Get receipt analytics
   */
  getReceiptAnalytics(): {
    totalReceipts: number
    emailReceipts: number
    smsReceipts: number
    printedReceipts: number
  } {
    // Mock analytics for demo
    return {
      totalReceipts: 1547,
      emailReceipts: 423,
      smsReceipts: 189,
      printedReceipts: 1124
    }
  }

  /**
   * Reset to default template
   */
  async resetToDefaults(): Promise<void> {
    const businessKey = `business:${this.tenantId}`
    const templateKey = `template:${this.tenantId}`
    const settingsKey = `settings:${this.tenantId}`

    ReceiptCustomizationService.businessInfoStore.delete(businessKey)
    ReceiptCustomizationService.templateStore.delete(templateKey)
    ReceiptCustomizationService.settingsStore.delete(settingsKey)

    this.initializeDefaults()
  }
}