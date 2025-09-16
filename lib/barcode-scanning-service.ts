export type ScanMode = 'camera' | 'manual' | 'usb'

export interface CameraDevice {
  deviceId: string
  label: string
  kind: string
}

export interface Product {
  id: string
  name: string
  price: number
  sku: string
  barcode: string
  image?: string
}

export interface ScanResult {
  barcode: string
  timestamp: Date
  found: boolean
  product?: Product
  method: ScanMode
}

export interface ScanSettings {
  autoFocus: boolean
  beepOnScan: boolean
  vibrationFeedback: boolean
  continuousScanning: boolean
}

/**
 * WebWaka Biological Cell: Barcode Scanning Service
 * 
 * Provides atomic, reusable barcode scanning functionality for POS systems.
 * Supports multiple input methods: camera, manual entry, and USB scanners.
 * Follows WebWaka principles of single responsibility and tenant isolation.
 */
export class BarcodeScanningService {
  private tenantId: string
  private stream: MediaStream | null = null
  private isScanning: boolean = false
  
  // Mock product database (will be replaced with API calls)
  private static productDatabase: Map<string, Product[]> = new Map()

  constructor(tenantId: string) {
    this.tenantId = tenantId
    this.initializeMockProducts()
  }

  /**
   * Initialize mock products for demo purposes
   */
  private initializeMockProducts(): void {
    const key = `tenant:${this.tenantId}`
    if (!BarcodeScanningService.productDatabase.has(key)) {
      BarcodeScanningService.productDatabase.set(key, [
        {
          id: '1',
          name: 'Coffee - Premium Blend',
          price: 12.99,
          sku: 'CF001',
          barcode: '123456789012',
          image: 'https://images.unsplash.com/photo-1497636577773-f1231844b336?w=400'
        },
        {
          id: '2', 
          name: 'Chocolate Bar - Dark',
          price: 3.49,
          sku: 'CH002',
          barcode: '234567890123',
          image: 'https://images.unsplash.com/photo-1606312619070-d48b4c652a52?w=400'
        },
        {
          id: '3',
          name: 'Water Bottle - 500ml',
          price: 1.99,
          sku: 'WB003',
          barcode: '345678901234',
          image: 'https://images.unsplash.com/photo-1523362628745-0c100150b504?w=400'
        },
        {
          id: '4',
          name: 'Sandwich - Turkey Club',
          price: 8.99,
          sku: 'SW004',
          barcode: '456789012345',
          image: 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=400'
        },
        {
          id: '5',
          name: 'Energy Drink - 250ml',
          price: 2.99,
          sku: 'ED005',
          barcode: '567890123456',
          image: 'https://images.unsplash.com/photo-1570197788417-0e82375c9371?w=400'
        }
      ])
    }
  }

  /**
   * Get available camera devices
   */
  async getAvailableCameras(): Promise<CameraDevice[]> {
    try {
      // Request permission first
      await navigator.mediaDevices.getUserMedia({ video: true })
      
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = devices.filter(device => device.kind === 'videoinput')
      
      return videoDevices.map(device => ({
        deviceId: device.deviceId,
        label: device.label || `Camera ${device.deviceId.slice(0, 8)}`,
        kind: device.kind
      }))
    } catch (error) {
      console.error('Failed to get camera devices:', error)
      return []
    }
  }

  /**
   * Start camera-based barcode scanning
   */
  async startCameraScanning(
    deviceId: string,
    videoElement: HTMLVideoElement,
    onScanResult: (result: ScanResult) => void,
    settings: ScanSettings
  ): Promise<void> {
    try {
      // Stop any existing stream
      await this.stopScanning()

      // Get camera stream
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          facingMode: 'environment', // Back camera preferred
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      })

      videoElement.srcObject = this.stream
      this.isScanning = true

      // Start the scanning detection loop
      this.startScanningLoop(onScanResult, settings)

    } catch (error) {
      throw new Error(`Failed to start camera scanning: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Scanning detection loop (simulated for demo)
   */
  private startScanningLoop(
    onScanResult: (result: ScanResult) => void,
    settings: ScanSettings
  ): void {
    if (!this.isScanning) return

    // In a real implementation, this would use a library like ZXing or QuaggaJS
    // For demo purposes, we'll simulate random successful scans
    const scanInterval = setInterval(() => {
      if (!this.isScanning) {
        clearInterval(scanInterval)
        return
      }

      // Simulate finding a barcode (20% chance every 2 seconds)
      if (Math.random() < 0.2) {
        const products = BarcodeScanningService.productDatabase.get(`tenant:${this.tenantId}`) || []
        const randomProduct = products[Math.floor(Math.random() * products.length)]
        
        if (randomProduct) {
          onScanResult({
            barcode: randomProduct.barcode,
            timestamp: new Date(),
            found: true,
            product: randomProduct,
            method: 'camera'
          })

          if (!settings.continuousScanning) {
            this.stopScanning()
          }
        }
      }
    }, 2000)
  }

  /**
   * Stop camera scanning
   */
  async stopScanning(): Promise<void> {
    this.isScanning = false
    
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
      this.stream = null
    }
  }

  /**
   * Process manual barcode input
   */
  async processManualInput(barcode: string): Promise<ScanResult> {
    const product = await this.lookupProduct(barcode)
    
    return {
      barcode,
      timestamp: new Date(),
      found: !!product,
      product,
      method: 'manual'
    }
  }

  /**
   * Look up product by barcode
   */
  private async lookupProduct(barcode: string): Promise<Product | undefined> {
    const products = BarcodeScanningService.productDatabase.get(`tenant:${this.tenantId}`) || []
    return products.find(p => p.barcode === barcode)
  }

  /**
   * Play beep sound for scan feedback
   */
  playBeep(): void {
    try {
      // Create a simple beep using Web Audio API
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()
      
      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      
      oscillator.frequency.value = 800 // Hz
      oscillator.type = 'square'
      
      gainNode.gain.setValueAtTime(0, audioContext.currentTime)
      gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.01)
      gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.1)
      
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.1)
    } catch (error) {
      // Fallback to system beep if Web Audio fails
      console.log('Beep!')
    }
  }

  /**
   * Get scan statistics for the tenant
   */
  getScanStatistics(): {
    totalScans: number
    successfulScans: number
    todayScans: number
    popularProducts: string[]
  } {
    // Mock statistics for demo
    return {
      totalScans: 1247,
      successfulScans: 1189,
      todayScans: 23,
      popularProducts: ['Coffee - Premium Blend', 'Water Bottle - 500ml', 'Sandwich - Turkey Club']
    }
  }

  /**
   * Add new product to barcode database
   */
  addProduct(product: Omit<Product, 'id'>): void {
    const key = `tenant:${this.tenantId}`
    const products = BarcodeScanningService.productDatabase.get(key) || []
    
    const newProduct: Product = {
      ...product,
      id: crypto.randomUUID()
    }
    
    products.push(newProduct)
    BarcodeScanningService.productDatabase.set(key, products)
  }

  /**
   * Update product in barcode database
   */
  updateProduct(productId: string, updates: Partial<Product>): void {
    const key = `tenant:${this.tenantId}`
    const products = BarcodeScanningService.productDatabase.get(key) || []
    
    const index = products.findIndex(p => p.id === productId)
    if (index !== -1) {
      products[index] = { ...products[index], ...updates }
      BarcodeScanningService.productDatabase.set(key, products)
    }
  }

  /**
   * Delete product from barcode database
   */
  deleteProduct(productId: string): void {
    const key = `tenant:${this.tenantId}`
    const products = BarcodeScanningService.productDatabase.get(key) || []
    
    const filteredProducts = products.filter(p => p.id !== productId)
    BarcodeScanningService.productDatabase.set(key, filteredProducts)
  }

  /**
   * Get all products for the tenant
   */
  getAllProducts(): Product[] {
    const key = `tenant:${this.tenantId}`
    return BarcodeScanningService.productDatabase.get(key) || []
  }
}