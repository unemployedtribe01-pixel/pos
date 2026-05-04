import { getDB, generateId, now, persistDB } from '../index'
import { Customer } from '../../types'

function rowToCustomer(row: any[]): Customer {
  return { id:row[0], name:row[1], phone:row[2], type:row[3] as any, gstin:row[4], address:row[5], credit_limit:row[6], credit_days:row[7], opening_balance:row[8], created_at:row[9] }
}

export function searchCustomers(query: string, limit = 10): Customer[] {
  const db = getDB()
  const q = `%${query.toLowerCase()}%`
  const result = db.exec(`SELECT * FROM customers WHERE LOWER(name) LIKE ? OR phone LIKE ? LIMIT ?`, [q, q, limit])
  if (!result.length) return []
  return result[0].values.map(rowToCustomer)
}

export function getCustomerById(id: string): Customer | null {
  const db = getDB()
  const result = db.exec('SELECT * FROM customers WHERE id=?', [id])
  if (!result.length || !result[0].values.length) return null
  return rowToCustomer(result[0].values[0])
}

export function getCustomerBalance(customerId: string): number {
  const db = getDB()
  const result = db.exec(`SELECT balance_after FROM ledger_entries WHERE customer_id=? ORDER BY created_at DESC LIMIT 1`, [customerId])
  if (!result.length || !result[0].values.length) {
    const c = getCustomerById(customerId)
    return c?.opening_balance || 0
  }
  return result[0].values[0][0] as number
}

export function upsertCustomer(c: Omit<Customer, 'created_at'>): Customer {
  const db = getDB()
  const existing = getCustomerById(c.id || '')
  const timestamp = now()
  const op = existing ? 'UPDATE' : 'INSERT'
  let id = c.id
  if (existing) {
    db.run(`UPDATE customers SET name=?,phone=?,type=?,gstin=?,address=?,credit_limit=?,credit_days=?,opening_balance=? WHERE id=?`,
      [c.name,c.phone,c.type,c.gstin,c.address,c.credit_limit,c.credit_days,c.opening_balance,c.id])
  } else {
    id = c.id || generateId()
    db.run(`INSERT INTO customers VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id,c.name,c.phone,c.type,c.gstin,c.address,c.credit_limit,c.credit_days,c.opening_balance,now()])
  }
  const payload = {
    id,
    name: c.name,
    phone: c.phone,
    type: c.type,
    gstin: c.gstin,
    address: c.address,
    credit_limit: c.credit_limit,
    credit_days: c.credit_days,
    opening_balance: c.opening_balance,
    created_at: existing?.created_at || timestamp,
  }
  db.run(`INSERT INTO sync_queue VALUES (?,?,?,?,?,?,?)`, [
    generateId(), 'customers', op, JSON.stringify(payload), timestamp, 0, 'pending',
  ])
  persistDB()
  return getCustomerById(id || '')!
}

export function getAllCustomers(): Customer[] {
  const db = getDB()
  const result = db.exec('SELECT * FROM customers ORDER BY name')
  if (!result.length) return []
  return result[0].values.map(rowToCustomer)
}
