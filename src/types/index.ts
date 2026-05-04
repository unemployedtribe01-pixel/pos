export interface Product {
  id: string
  name: string
  category: 'cement' | 'paint' | 'pipe' | 'electrical' | 'hardware' | 'other'
  brand: string
  variant: string
  hsn_code: string
  gst_rate: number
  mrp: number
  cost_price: number
  unit: string
  stock_qty: number
  low_stock_threshold: number
  aliases: string
  price_inclusive: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export type CustomerType = 'retail' | 'contractor' | 'wholesale'

export interface Customer {
  id: string
  name: string
  phone: string
  type: CustomerType
  gstin: string
  address: string
  credit_limit: number
  credit_days: number
  opening_balance: number
  created_at: string
}

export interface RateCard {
  id: string
  customer_id: string | null
  customer_type: CustomerType | null
  product_id: string
  special_price: number
  min_qty: number
  valid_from: string
  valid_to: string
}

export type PaymentMode = 'cash' | 'upi' | 'card' | 'credit'
export type BillStatus = 'draft' | 'confirmed' | 'cancelled'

export interface BillLine {
  id: string
  bill_id: string
  product_id: string
  product_snapshot: Pick<Product, 'name' | 'brand' | 'variant' | 'hsn_code' | 'unit'>
  qty: number
  unit_price: number
  mrp_at_time: number
  discount_per_unit: number
  gst_rate: number
  taxable_value: number
  gst_amount: number
  cgst_rate: number
  sgst_rate: number
  igst_rate: number
  cgst_amount: number
  sgst_amount: number
  igst_amount: number
  supply_type: 'intra' | 'inter'
  line_total: number
}

export interface PaymentSplit {
  mode: PaymentMode
  amount: number
  ref_no: string
}

export interface Bill {
  id: string
  invoice_no: string
  customer_id: string | null
  customer_snapshot: Pick<Customer, 'name' | 'phone' | 'gstin' | 'address'> | null
  date: string
  lines: BillLine[]
  subtotal: number
  gst_amount: number
  cgst_amount: number
  sgst_amount: number
  igst_amount: number
  supply_type: 'intra' | 'inter'
  place_of_supply_code: string
  place_of_supply_name: string
  rounding: number
  total: number
  payments: PaymentSplit[]
  credit_amount: number
  change_due: number
  status: BillStatus
  notes: string
  created_at: string
}

export type LedgerEntryType = 'debit' | 'credit' | 'opening' | 'adjustment'

export interface LedgerEntry {
  id: string
  customer_id: string
  type: LedgerEntryType
  ref_type: 'bill' | 'payment' | 'opening' | 'adjustment'
  ref_id: string
  amount: number
  balance_after: number
  date: string
  notes: string
  created_at: string
}

export interface CreditPayment {
  id: string
  customer_id: string
  amount: number
  mode: PaymentMode
  ref_no: string
  date: string
  applied_to_bill_ids: string[]
  notes: string
  created_at: string
}

export interface SyncQueueItem {
  id: string
  entity: 'products' | 'customers' | 'bills' | 'ledger_entries' | 'credit_payments'
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  payload: string
  created_at: string
  attempts: number
  status: 'pending' | 'synced' | 'failed'
}

export interface CartItem {
  product: Product
  qty: number
  unit_price: number
  discount_per_unit: number
  line_discount_pct: number
  entered_price_inclusive: number | null
  _manualOverride?: boolean
}

export interface BillDraft {
  cart: CartItem[]
  customer: Customer | null
  payments: PaymentSplit[]
  rounding: number
  bill_discount_pct: number
  notes: string
}
