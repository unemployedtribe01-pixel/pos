import { CartItem, PaymentSplit } from '../types'
import { getDB, persistDB } from '../db'

export interface CartTotals {
  subtotal: number
  gst_amount: number
  total: number
  amountPaid: number
  creditAmount: number
  balance: number
}

export function computeCartTotals(cart: CartItem[], payments: PaymentSplit[], rounding: number): CartTotals {
  let subtotal = 0
  let gst_amount = 0
  for (const item of cart) {
    const taxable = item.qty * (item.unit_price - item.discount_per_unit)
    subtotal += taxable
    gst_amount += taxable * (item.product.gst_rate / 100)
  }
  const total = Math.round((subtotal + gst_amount + rounding) * 100) / 100
  const cashAndDigital = payments.filter(p => p.mode !== 'credit').reduce((s, p) => s + p.amount, 0)
  const creditAmount = payments.filter(p => p.mode === 'credit').reduce((s, p) => s + p.amount, 0)
  const amountPaid = cashAndDigital + creditAmount
  return { subtotal, gst_amount, total, amountPaid, creditAmount, balance: Math.round((total - amountPaid) * 100) / 100 }
}

export function getNextInvoiceNo(): string {
  const db = getDB()
  const result = db.exec("SELECT value FROM app_meta WHERE key='invoice_counter'")
  const counter = parseInt(result[0].values[0][0] as string)
  const year = new Date().getFullYear().toString().slice(2)
  const invoiceNo = `INV-${year}-${String(counter).padStart(5, '0')}`
  db.run("UPDATE app_meta SET value=? WHERE key='invoice_counter'", [counter + 1])
  persistDB()
  return invoiceNo
}
