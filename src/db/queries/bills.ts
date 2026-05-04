import { getDB, generateId, now, persistDB } from '../index'
import { BillDraft, Bill, BillLine } from '../../types'
import { computeCartTotals, determineSupplyType, getNextInvoiceNo, splitGst } from '../../utils/billing'
import { getStoreConfig } from './storeConfig'
import { updateStock } from './products'

const BILL_COLUMNS = `
  id, invoice_no, customer_id, customer_snapshot, date,
  lines, subtotal, gst_amount, rounding, total,
  payments, credit_amount, change_due, supply_type,
  cgst_amount, sgst_amount, igst_amount,
  place_of_supply_code, place_of_supply_name,
  status, notes, created_at
`

function buildBillLines(draft: BillDraft, billId: string, supply_type: 'intra' | 'inter'): BillLine[] {
  return draft.cart.map(item => {
    const taxable = Math.round(item.qty * (item.unit_price - item.discount_per_unit) * 100) / 100
    const gstAmt = Math.round(taxable * (item.product.gst_rate / 100) * 100) / 100
    const split = splitGst(item.product.gst_rate, gstAmt, supply_type)
    return {
      id: generateId(), bill_id: billId, product_id: item.product.id,
      product_snapshot: { name:item.product.name, brand:item.product.brand, variant:item.product.variant, hsn_code:item.product.hsn_code, unit:item.product.unit },
      qty: item.qty, unit_price: item.unit_price, mrp_at_time: item.product.mrp,
      discount_per_unit: item.discount_per_unit, gst_rate: item.product.gst_rate,
      taxable_value: taxable, gst_amount: gstAmt,
      cgst_rate: split.cgst_rate, sgst_rate: split.sgst_rate, igst_rate: split.igst_rate,
      cgst_amount: split.cgst_amount, sgst_amount: split.sgst_amount, igst_amount: split.igst_amount,
      line_total: taxable + gstAmt, supply_type,
    }
  })
}

export function confirmBill(draft: BillDraft): string {
  if (draft.cart.length === 0) throw new Error('Cart is empty')
  const db = getDB()
  const config = getStoreConfig()
  const bill_totals = computeCartTotals(draft.cart, draft.payments, draft.rounding, draft.customer?.gstin, draft.bill_discount_pct || 0)
  const supply_type = determineSupplyType(draft.customer?.gstin)
  const billId = generateId()
  const invoiceNo = getNextInvoiceNo()
  const lines = buildBillLines(draft, billId, supply_type)
  const creditAmount = draft.payments.filter(p => p.mode==='credit').reduce((s,p)=>s+p.amount, 0)
  const timestamp = now()
  const dateStr = timestamp.split('T')[0]
  const customerSnapshot = draft.customer
    ? { name:draft.customer.name, phone:draft.customer.phone, gstin:draft.customer.gstin, address:draft.customer.address }
    : null

  db.run(`INSERT INTO bills (${BILL_COLUMNS}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    billId, invoiceNo, draft.customer?.id || null,
    customerSnapshot ? JSON.stringify(customerSnapshot) : null,
    dateStr, JSON.stringify(lines),
    bill_totals.subtotal, bill_totals.gst_amount, draft.rounding, bill_totals.total,
    JSON.stringify(draft.payments), creditAmount,
    bill_totals.change_due || 0,
    bill_totals.supply_type, bill_totals.cgst_amount, bill_totals.sgst_amount, bill_totals.igst_amount,
    config.shop_state_code, config.shop_state,
    'confirmed', draft.notes, timestamp,
  ])

  for (const item of draft.cart) updateStock(item.product.id, -item.qty)

  if (creditAmount > 0 && draft.customer) {
    const prevResult = db.exec(`SELECT balance_after FROM ledger_entries WHERE customer_id=? ORDER BY created_at DESC LIMIT 1`, [draft.customer.id])
    const prevBalance = prevResult.length && prevResult[0].values.length ? (prevResult[0].values[0][0] as number) : draft.customer.opening_balance
    db.run(`INSERT INTO ledger_entries VALUES (?,?,?,?,?,?,?,?,?,?)`, [
      generateId(), draft.customer.id, 'debit', 'bill', billId,
      creditAmount, prevBalance + creditAmount, dateStr, `Bill ${invoiceNo}`, timestamp,
    ])
  }

  db.run(`INSERT INTO sync_queue VALUES (?,?,?,?,?,?,?)`, [
    generateId(), 'bills', 'INSERT',
    JSON.stringify({
      id: billId,
      invoice_no: invoiceNo,
      customer_id: draft.customer?.id || null,
      customer_snapshot: customerSnapshot,
      date: dateStr,
      lines,
      subtotal: bill_totals.subtotal,
      gst_amount: bill_totals.gst_amount,
      rounding: draft.rounding,
      total: bill_totals.total,
      payments: draft.payments,
      credit_amount: creditAmount,
      change_due: bill_totals.change_due || 0,
      supply_type: bill_totals.supply_type,
      cgst_amount: bill_totals.cgst_amount,
      sgst_amount: bill_totals.sgst_amount,
      igst_amount: bill_totals.igst_amount,
      place_of_supply_code: config.shop_state_code,
      place_of_supply_name: config.shop_state,
      status: 'confirmed',
      notes: draft.notes,
      created_at: timestamp,
    }),
    timestamp, 0, 'pending',
  ])

  persistDB()
  return billId
}

export function getBillById(id: string): Bill | null {
  const db = getDB()
  const result = db.exec(`SELECT ${BILL_COLUMNS} FROM bills WHERE id=?`, [id])
  if (!result.length || !result[0].values.length) return null
  const r = result[0].values[0]
  return {
    id:r[0] as string, invoice_no:r[1] as string, customer_id:r[2] as string|null,
    customer_snapshot: r[3] ? JSON.parse(r[3] as string) : null,
    date:r[4] as string, lines:JSON.parse(r[5] as string),
    subtotal:r[6] as number, gst_amount:r[7] as number, rounding:r[8] as number, total:r[9] as number,
    payments:JSON.parse(r[10] as string), credit_amount:r[11] as number,
    change_due:r[12] as number,
    supply_type: (r[13] as 'intra' | 'inter') || 'intra',
    cgst_amount:r[14] as number, sgst_amount:r[15] as number, igst_amount:r[16] as number,
    place_of_supply_code:r[17] as string, place_of_supply_name:r[18] as string,
    status:r[19] as any, notes:r[20] as string, created_at:r[21] as string,
  }
}

export function getRecentBills(limit = 50): Bill[] {
  const db = getDB()
  const result = db.exec(`SELECT ${BILL_COLUMNS} FROM bills ORDER BY created_at DESC LIMIT ?`, [limit])
  if (!result.length) return []
  return result[0].values.map(r => ({
    id:r[0] as string, invoice_no:r[1] as string, customer_id:r[2] as string|null,
    customer_snapshot:r[3]?JSON.parse(r[3] as string):null, date:r[4] as string,
    lines:JSON.parse(r[5] as string), subtotal:r[6] as number, gst_amount:r[7] as number,
    rounding:r[8] as number, total:r[9] as number, payments:JSON.parse(r[10] as string),
    credit_amount:r[11] as number, change_due:r[12] as number, supply_type:(r[13] as 'intra' | 'inter') || 'intra',
    cgst_amount:r[14] as number, sgst_amount:r[15] as number, igst_amount:r[16] as number,
    place_of_supply_code:r[17] as string, place_of_supply_name:r[18] as string,
    status:r[19] as any, notes:r[20] as string, created_at:r[21] as string,
  }))
}

export function getDailyTotals(date: string) {
  const db = getDB()
  const result = db.exec(`SELECT payments, total FROM bills WHERE date=? AND status='confirmed'`, [date])
  if (!result.length) return { cash:0, upi:0, card:0, credit:0, total:0 }
  let cash=0, upi=0, card=0, credit=0, total=0
  for (const row of result[0].values) {
    for (const p of JSON.parse(row[0] as string)) {
      if (p.mode==='cash') cash+=p.amount
      else if (p.mode==='upi') upi+=p.amount
      else if (p.mode==='card') card+=p.amount
      else if (p.mode==='credit') credit+=p.amount
    }
    total += row[1] as number
  }
  return { cash, upi, card, credit, total }
}
