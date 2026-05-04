import { getDB, generateId, now, persistDB } from '../index'
import { LedgerEntry, CreditPayment, PaymentMode } from '../../types'
import { getCustomerById } from './customers'

export function getLedgerForCustomer(customerId: string): LedgerEntry[] {
  const db = getDB()
  const result = db.exec(`SELECT * FROM ledger_entries WHERE customer_id=? ORDER BY created_at ASC`, [customerId])
  if (!result.length) return []
  return result[0].values.map(r => ({
    id:r[0] as string, customer_id:r[1] as string, type:r[2] as any, ref_type:r[3] as any,
    ref_id:r[4] as string, amount:r[5] as number, balance_after:r[6] as number,
    date:r[7] as string, notes:r[8] as string, created_at:r[9] as string,
  }))
}

export function getCustomerBalanceFromLedger(customerId: string): number {
  const db = getDB()
  const result = db.exec(`SELECT balance_after FROM ledger_entries WHERE customer_id=? ORDER BY created_at DESC LIMIT 1`, [customerId])
  if (!result.length || !result[0].values.length) {
    const c = getCustomerById(customerId)
    return c?.opening_balance || 0
  }
  return result[0].values[0][0] as number
}

export function recordCreditPayment(customerId: string, amount: number, mode: PaymentMode, refNo: string, notes: string): CreditPayment {
  if (amount <= 0) throw new Error('Payment amount must be positive')
  const db = getDB()
  const timestamp = now()
  const dateStr = timestamp.split('T')[0]
  const prevBalance = getCustomerBalanceFromLedger(customerId)
  const newBalance = prevBalance - amount
  const paymentId = generateId()

  db.run(`INSERT INTO credit_payments VALUES (?,?,?,?,?,?,?,?,?)`, [
    paymentId, customerId, amount, mode, refNo, dateStr, '[]', notes, timestamp,
  ])
  db.run(`INSERT INTO ledger_entries VALUES (?,?,?,?,?,?,?,?,?,?)`, [
    generateId(), customerId, 'credit', 'payment', paymentId,
    amount, newBalance, dateStr, notes || 'Payment received', timestamp,
  ])
  db.run(`INSERT INTO sync_queue VALUES (?,?,?,?,?,?,?)`, [
    generateId(), 'credit_payments', 'INSERT',
    JSON.stringify({ id:paymentId, customer_id:customerId, amount, mode, ref_no:refNo, date:dateStr, notes, created_at:timestamp }),
    timestamp, 0, 'pending',
  ])

  persistDB()
  return { id:paymentId, customer_id:customerId, amount, mode, ref_no:refNo, date:dateStr, applied_to_bill_ids:[], notes, created_at:timestamp }
}

export interface CustomerCreditSummary {
  customerId: string
  customerName: string
  phone: string
  balance: number
  lastActivityDate: string
  overdueFlag: boolean
}

export function getAllCustomerCreditSummaries(): CustomerCreditSummary[] {
  const db = getDB()
  const result = db.exec(`
    SELECT * FROM (
      SELECT c.id, c.name, c.phone,
        COALESCE((SELECT l.balance_after FROM ledger_entries l WHERE l.customer_id=c.id ORDER BY l.created_at DESC LIMIT 1), c.opening_balance) AS balance,
        COALESCE((SELECT l.date FROM ledger_entries l WHERE l.customer_id=c.id ORDER BY l.created_at DESC LIMIT 1), c.created_at) AS last_date
      FROM customers c
    ) t
    WHERE t.balance > 0
    ORDER BY t.balance DESC
  `)
  if (!result.length) return []
  const today = new Date()
  return result[0].values.map(r => {
    const daysDiff = Math.floor((today.getTime() - new Date(r[4] as string).getTime()) / 86400000)
    return { customerId:r[0] as string, customerName:r[1] as string, phone:r[2] as string, balance:r[3] as number, lastActivityDate:r[4] as string, overdueFlag:daysDiff>30 }
  })
}

export interface CustomerCreditStatus {
  balance: number
  daysSinceLastActivity: number
  isOverdue: boolean           // balance > 0 AND daysSinceLastActivity > 30
  isOverLimit: boolean         // balance > credit_limit AND credit_limit > 0
  creditLimit: number
  lastActivityDate: string
}

export function getCustomerCreditStatus(customerId: string): CustomerCreditStatus {
  const db = getDB()

  const ledgerResult = db.exec(
    `SELECT balance_after, date FROM ledger_entries WHERE customer_id=? ORDER BY created_at DESC LIMIT 1`,
    [customerId]
  )

  const customerResult = db.exec(
    `SELECT opening_balance, credit_limit FROM customers WHERE id=?`,
    [customerId]
  )
  if (!customerResult.length || !customerResult[0].values.length) {
    return { balance:0, daysSinceLastActivity:0, isOverdue:false, isOverLimit:false, creditLimit:0, lastActivityDate:'' }
  }

  const openingBalance = customerResult[0].values[0][0] as number
  const creditLimit = customerResult[0].values[0][1] as number

  let balance = openingBalance
  let lastActivityDate = ''
  let daysSinceLastActivity = 0

  if (ledgerResult.length && ledgerResult[0].values.length) {
    balance = ledgerResult[0].values[0][0] as number
    lastActivityDate = ledgerResult[0].values[0][1] as string
    const last = new Date(lastActivityDate)
    daysSinceLastActivity = Math.floor((Date.now() - last.getTime()) / 86400000)
  }

  return {
    balance,
    daysSinceLastActivity,
    lastActivityDate,
    isOverdue: balance > 0 && daysSinceLastActivity > 30,
    isOverLimit: creditLimit > 0 && balance > creditLimit,
    creditLimit,
  }
}

export function generateWhatsAppStatement(
  customerId: string,
  customerName: string,
  phone: string,
  shopName: string,
  shopPhone: string
): string {
  const db = getDB()
  const today = new Date().toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })
  const balance = getCustomerBalanceFromLedger(customerId)

  // Get last 5 ledger entries
  const result = db.exec(
    `SELECT type, amount, date, notes FROM ledger_entries WHERE customer_id=? ORDER BY created_at DESC LIMIT 5`,
    [customerId]
  )

  let txLines = ''
  if (result.length && result[0].values.length) {
    const rows = [...result[0].values].reverse() // show oldest first
    txLines = rows.map(r => {
      const type = r[0] as string
      const amount = (r[1] as number).toFixed(0)
      const date = new Date(r[2] as string).toLocaleDateString('en-IN', { day:'numeric', month:'short' })
      const notes = (r[3] as string).substring(0, 30)
      const arrow = type === 'debit' ? '🔴' : '🟢'
      const label = type === 'debit' ? `+₹${amount} (bill)` : `-₹${amount} (payment)`
      return `  ${arrow} ${date} — ${label}`
    }).join('\n')
  }

  const message = `*${shopName}*
Namaste ${customerName} ji,

Aapka khata vivaran (Account Statement):

📋 Recent transactions:
${txLines || '  No recent transactions'}

💰 *Outstanding Balance: ₹${balance.toFixed(0)}*
📅 As on: ${today}

Kripya apna balance jald se jald clear karein.
Dhanyavaad! 🙏

— ${shopName}
📞 ${shopPhone}`

  return message
}
