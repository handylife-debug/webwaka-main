'use client'

import BarcodeGenerator from '../../../components/inventory/barcode-generator'

export default function BarcodesPage() {
  return (
    <div>
      <BarcodeGenerator mode="standalone" />
    </div>
  )
}