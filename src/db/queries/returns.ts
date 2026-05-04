import { getDB, generateId, now, persistDB } from '../index'
import { getBillById } from './bills'
import { updateStock } from './products'
import { getNextCreditNoteNo } from '../../utils/billing'

export interface ReturnLine {
  product_id: string
  product_snapshot: { name: string; brand: string; variant: string; unit: string; hsn_code: string }
  original_qty: number
  return_qty: number
  unit_price: number
  credit_amount: number
}

export interface CreditNote {
  id: string
  credit_note_no: string
  original_bill_id: string
  customer_id: string | null
  date: string
  lines: ReturnLine[]
  total_credit: number
  notes: string
  created_at: string
}

export function getAlreadyReturnedQty(billId: string, productId: string): number {
  const db = getDB()
  const result = db.exec(
    `SELECT lines FROM credit_notes WHERE original_bill_id=?`,
    [billId]
  )
  if (!result.length) return 0
  let total = 0
  for (const row of result[0].values) {
    const lines: ReturnLine[] = JSON.parse(row[0] as string)
    for (const line of lines) {
      if (line.product_id === productId) total += line.return_qty
    }
  }
  return total
}

export function processReturn(
  billId: string,
  returnLines: { product_id: string; return_qty: number }[],
  notes: string
): CreditNote {
  const db = getDB()
  const bill = getBillById(billId)
  if (!bill) throw new Error('Bill not found')

  const timestamp = now()
  const dateStr = timestamp.split('T')[0]
  const creditNoteId = generateId()
  const creditNoteNo = getNextCreditNoteNo()

  let totalCredit = 0
  const lines: ReturnLine[] = []

  for (const ret of returnLines) {
    if (ret.return_qty <= 0) continue

    const billLine = bill.lines.find(l => l.product_id === ret.product_id)
    if (!billLine) throw new Error(`Product ${ret.product_id} not in original bill`)

    const alreadyReturned = getAlreadyReturnedQty(billId, ret.product_id)
    const returnable = billLine.qty - alreadyReturned
    if (ret.return_qty > returnable) throw new Error(`Cannot return ${ret.return_qty} — only ${returnable} remaining`)

    const creditAmt = ret.return_qty * billLine.unit_price
    totalCredit += creditAmt

    lines.push({
      product_id: ret.product_id,
      product_snapshot: billLine.product_snapshot,
      original_qty: billLine.qty,
      return_qty: ret.return_qty,
      unit_price: billLine.unit_price,
      credit_amount: creditAmt,
    })

    // Restore stock
    updateStock(ret.product_id, ret.return_qty)
  }

  if (lines.length === 0) throw new Error('No valid return lines')

  // Insert credit note
  db.run(`INSERT INTO credit_notes VALUES (?,?,?,?,?,?,?,?,?)`, [
    creditNoteId, creditNoteNo, billId, bill.customer_id,
    dateStr, JSON.stringify(lines), totalCredit, notes, timestamp,
  ])

  // If customer has udhaar, create ledger credit entry
  if (bill.customer_id && bill.credit_amount > 0) {
    const prevResult = db.exec(
      `SELECT balance_after FROM ledger_entries WHERE customer_id=? ORDER BY created_at DESC LIMIT 1`,
      [bill.customer_id]
    )
    const prevBalance = prevResult.length && prevResult[0].values.length ? (prevResult[0].values[0][0] as number) : 0
    db.run(`INSERT INTO ledger_entries VALUES (?,?,?,?,?,?,?,?,?,?)`, [
      generateId(), bill.customer_id, 'credit', 'adjustment', creditNoteId,
      totalCredit, Math.max(0, prevBalance - totalCredit),
      dateStr, `Return ${creditNoteNo} against ${bill.invoice_no}`, timestamp,
    ])
  }

  persistDB()
  return { id:creditNoteId, credit_note_no:creditNoteNo, original_bill_id:billId, customer_id:bill.customer_id, date:dateStr, lines, total_credit:totalCredit, notes, created_at:timestamp }
}

export function getCreditNotesForBill(billId: string): CreditNote[] {
  const db = getDB()
  const result = db.exec(`SELECT * FROM credit_notes WHERE original_bill_id=? ORDER BY created_at DESC`, [billId])
  if (!result.length) return []
  return result[0].values.map(r => ({
    id:r[0] as string, credit_note_no:r[1] as string, original_bill_id:r[2] as string,
    customer_id:r[3] as string|null, date:r[4] as string, lines:JSON.parse(r[5] as string),
    total_credit:r[6] as number, notes:r[7] as string, created_at:r[8] as string,
  }))
}
