import { CartItem, PaymentSplit } from '../types'
import { getDB, persistDB } from '../db'
import { getShopStateCode, getStoreConfig } from '../db/queries/storeConfig'

export interface CartTotals {
  subtotal: number
  gst_amount: number
  cgst_amount: number
  sgst_amount: number
  igst_amount: number
  supply_type: 'intra' | 'inter'
  total: number
  amountPaid: number
  creditAmount: number
  balance: number
  change_due: number
  bill_discount_amount: number
  total_line_discounts: number
}

export function determineSupplyType(customerGstin: string | null | undefined): 'intra' | 'inter' {
  if (!customerGstin || customerGstin.trim().length < 2) return 'intra'
  const shopStateCode = getShopStateCode()
  const customerStateCode = customerGstin.trim().substring(0, 2)
  return customerStateCode === shopStateCode ? 'intra' : 'inter'
}

export function splitGst(
  gst_rate: number,
  gst_amount: number,
  supply_type: 'intra' | 'inter'
): { cgst_rate: number; sgst_rate: number; igst_rate: number; cgst_amount: number; sgst_amount: number; igst_amount: number } {
  if (supply_type === 'inter') {
    return {
      cgst_rate: 0, sgst_rate: 0, igst_rate: gst_rate,
      cgst_amount: 0, sgst_amount: 0, igst_amount: gst_amount,
    }
  }
  const half_rate = gst_rate / 2
  const half_amount = Math.round((gst_amount / 2) * 100) / 100
  return {
    cgst_rate: half_rate, sgst_rate: half_rate, igst_rate: 0,
    cgst_amount: half_amount, sgst_amount: half_amount, igst_amount: 0,
  }
}

export function computeCartTotals(
  cart: CartItem[],
  payments: PaymentSplit[],
  rounding: number,
  customerGstin?: string | null,
  bill_discount_pct: number = 0
): CartTotals {
  const supply_type = determineSupplyType(customerGstin)

  // Step 1: compute line-level values WITH line_discount_pct applied
  let gross_subtotal = 0  // before bill-level discount

  const lineData = cart.map(item => {
    const line_disc = (item.line_discount_pct || 0) / 100
    const effective_unit_price = item.unit_price * (1 - line_disc)
    const taxable = Math.round(item.qty * effective_unit_price * 100) / 100
    gross_subtotal += taxable
    return { taxable, gst_rate: item.product.gst_rate }
  })

  // Step 2: apply bill-level discount proportionally
  const bill_discount_amount = Math.round(gross_subtotal * (bill_discount_pct / 100) * 100) / 100
  const net_subtotal = gross_subtotal - bill_discount_amount

  // Step 3: compute GST on post-discount taxable values
  let gst_amount = 0, cgst_amount = 0, sgst_amount = 0, igst_amount = 0

  for (const line of lineData) {
    const bill_disc_on_line = gross_subtotal > 0
      ? (line.taxable / gross_subtotal) * bill_discount_amount
      : 0
    const adjusted_taxable = Math.round((line.taxable - bill_disc_on_line) * 100) / 100
    const gst = Math.round(adjusted_taxable * (line.gst_rate / 100) * 100) / 100
    const split = splitGst(line.gst_rate, gst, supply_type)
    gst_amount += gst
    cgst_amount += split.cgst_amount
    sgst_amount += split.sgst_amount
    igst_amount += split.igst_amount
  }

  gst_amount = Math.round(gst_amount * 100) / 100
  cgst_amount = Math.round(cgst_amount * 100) / 100
  sgst_amount = Math.round(sgst_amount * 100) / 100
  igst_amount = Math.round(igst_amount * 100) / 100

  const pre_round_total = net_subtotal + gst_amount + rounding
  const total = Math.round(pre_round_total * 100) / 100
  const cashAndDigital = payments.filter(p => p.mode !== 'credit').reduce((s, p) => s + p.amount, 0)
  const creditAmount = payments.filter(p => p.mode === 'credit').reduce((s, p) => s + p.amount, 0)
  const amountPaid = cashAndDigital + creditAmount
  const raw_balance = Math.round((total - amountPaid) * 100) / 100
  const balance = raw_balance > 0 ? raw_balance : 0
  const change_due = raw_balance < 0 ? Math.abs(raw_balance) : 0
  return {
    subtotal: net_subtotal,
    gst_amount,
    cgst_amount,
    sgst_amount,
    igst_amount,
    supply_type,
    total,
    amountPaid,
    creditAmount,
    balance,
    change_due,
    bill_discount_amount,
    total_line_discounts: gross_subtotal - net_subtotal,
  }
}

export function getCurrentFY(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const startYear = month >= 4 ? year : year - 1
  return `${String(startYear).slice(2)}${String(startYear + 1).slice(2)}`
}

export function getNextInvoiceNo(): string {
  const db = getDB()
  const fy = getCurrentFY()
  const counterKey = `invoice_counter_${fy}`

  // Get config for prefix
  let prefix = 'INV'
  try {
    prefix = getStoreConfig().invoice_prefix || 'INV'
  } catch { /* use default */ }

  const result = db.exec('SELECT value FROM app_meta WHERE key=?', [counterKey])
  let counter = 1
  if (result.length && result[0].values.length) {
    counter = parseInt(result[0].values[0][0] as string)
    db.run('UPDATE app_meta SET value=? WHERE key=?', [counter + 1, counterKey])
  } else {
    db.run('INSERT INTO app_meta VALUES (?,?)', [counterKey, '2'])
  }

  persistDB()
  return `${prefix}-${fy}-${String(counter).padStart(5, '0')}`
}

export function getNextCreditNoteNo(): string {
  const db = getDB()
  const fy = getCurrentFY()
  const counterKey = `credit_note_counter_${fy}`

  const result = db.exec('SELECT value FROM app_meta WHERE key=?', [counterKey])
  let counter = 1
  if (result.length && result[0].values.length) {
    counter = parseInt(result[0].values[0][0] as string)
    db.run('UPDATE app_meta SET value=? WHERE key=?', [counter + 1, counterKey])
  } else {
    db.run('INSERT INTO app_meta VALUES (?,?)', [counterKey, '2'])
  }

  persistDB()
  return `CN-${fy}-${String(counter).padStart(5, '0')}`
}

export function amountToWords(amount: number): string {
  const num = Math.round(amount)
  if (num === 0) return 'Zero Rupees Only'

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
    'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  function twoDigits(n: number): string {
    if (n < 20) return ones[n]
    return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')
  }

  function threeDigits(n: number): string {
    if (n >= 100) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + twoDigits(n % 100) : '')
    return twoDigits(n)
  }

  let result = ''
  let remaining = num

  const crore = Math.floor(remaining / 10000000)
  remaining %= 10000000
  if (crore) result += threeDigits(crore) + ' Crore '

  const lakh = Math.floor(remaining / 100000)
  remaining %= 100000
  if (lakh) result += twoDigits(lakh) + ' Lakh '

  const thousand = Math.floor(remaining / 1000)
  remaining %= 1000
  if (thousand) result += twoDigits(thousand) + ' Thousand '

  if (remaining) result += threeDigits(remaining)

  return 'Rupees ' + result.trim() + ' Only'
}

export function toExclusivePrice(priceInclusive: number, gstRate: number): number {
  if (gstRate === 0) return priceInclusive
  return Math.round((priceInclusive / (1 + gstRate / 100)) * 100) / 100
}

export function toInclusivePrice(priceExclusive: number, gstRate: number): number {
  return Math.round(priceExclusive * (1 + gstRate / 100) * 100) / 100
}
