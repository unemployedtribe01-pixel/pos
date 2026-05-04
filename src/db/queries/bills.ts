import { getDB, generateId, now, persistDB } from '../index'
import { BillDraft, Bill, BillLine } from '../../types'
import { computeCartTotals, getNextInvoiceNo } from '../../utils/billing'
import { updateStock } from './products'

function buildBillLines(draft: BillDraft, billId: string): BillLine[] {
  return draft.cart.map(item => {
    const taxable = item.qty * (item.unit_price - item.discount_per_unit)
    const gstAmt = taxable * (item.product.gst_rate / 100)
    return {
      id: generateId(), bill_id: billId, product_id: item.product.id,
      product_snapshot: { name:item.product.name, brand:item.product.brand, variant:item.product.variant, hsn_code:item.product.hsn_code, unit:item.product.unit },
      qty: item.qty, unit_price: item.unit_price, mrp_at_time: item.product.mrp,
      discount_per_unit: item.discount_per_unit, gst_rate: item.product.gst_rate,
      taxable_value: taxable, gst_amount: gstAmt, line_total: taxable + gstAmt,
    }
  })
}

export function confirmBill(draft: BillDraft): string {
  if (draft.cart.length === 0) throw new Error('Cart is empty')
  const db = getDB()
  const totals = computeCartTotals(draft.cart, draft.payments, draft.rounding)
  const billId = generateId()
  const invoiceNo = getNextInvoiceNo()
  const lines = buildBillLines(draft, billId)
  const creditAmount = draft.payments.filter(p => p.mode==='credit').reduce((s,p)=>s+p.amount, 0)
  const timestamp = now()
  const dateStr = timestamp.split('T')[0]
  const customerSnapshot = draft.customer
    ? { name:draft.customer.name, phone:draft.customer.phone, gstin:draft.customer.gstin, address:draft.customer.address }
    : null

  db.run(`INSERT INTO bills VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    billId, invoiceNo, draft.customer?.id || null,
    customerSnapshot ? JSON.stringify(customerSnapshot) : null,
    dateStr, JSON.stringify(lines),
    totals.subtotal, totals.gst_amount, draft.rounding, totals.total,
    JSON.stringify(draft.payments), creditAmount, 'confirmed', draft.notes, timestamp,
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
      subtotal: totals.subtotal,
      gst_amount: totals.gst_amount,
      rounding: draft.rounding,
      total: totals.total,
      payments: draft.payments,
      credit_amount: creditAmount,
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
  const result = db.exec('SELECT * FROM bills WHERE id=?', [id])
  if (!result.length || !result[0].values.length) return null
  const r = result[0].values[0]
  return {
    id:r[0] as string, invoice_no:r[1] as string, customer_id:r[2] as string|null,
    customer_snapshot: r[3] ? JSON.parse(r[3] as string) : null,
    date:r[4] as string, lines:JSON.parse(r[5] as string),
    subtotal:r[6] as number, gst_amount:r[7] as number, rounding:r[8] as number, total:r[9] as number,
    payments:JSON.parse(r[10] as string), credit_amount:r[11] as number,
    status:r[12] as any, notes:r[13] as string, created_at:r[14] as string,
  }
}

export function getRecentBills(limit = 50): Bill[] {
  const db = getDB()
  const result = db.exec('SELECT * FROM bills ORDER BY created_at DESC LIMIT ?', [limit])
  if (!result.length) return []
  return result[0].values.map(r => ({
    id:r[0] as string, invoice_no:r[1] as string, customer_id:r[2] as string|null,
    customer_snapshot:r[3]?JSON.parse(r[3] as string):null, date:r[4] as string,
    lines:JSON.parse(r[5] as string), subtotal:r[6] as number, gst_amount:r[7] as number,
    rounding:r[8] as number, total:r[9] as number, payments:JSON.parse(r[10] as string),
    credit_amount:r[11] as number, status:r[12] as any, notes:r[13] as string, created_at:r[14] as string,
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
