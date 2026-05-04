import { getDB, generateId, persistDB } from '../index'
import { RateCard, CustomerType } from '../../types'

export function getSpecialPrice(
  productId: string,
  customerId: string | null,
  customerType: CustomerType | null,
  qty: number
): number | null {
  const db = getDB()
  const today = new Date().toISOString().split('T')[0]

  // Priority 1: customer-specific rate card
  if (customerId) {
    const result = db.exec(
      `SELECT special_price FROM rate_cards
       WHERE product_id=? AND customer_id=? AND min_qty<=? AND valid_from<=? AND valid_to>=?
       ORDER BY min_qty DESC LIMIT 1`,
      [productId, customerId, qty, today, today]
    )
    if (result.length && result[0].values.length) return result[0].values[0][0] as number
  }

  // Priority 2: customer type rate card
  if (customerType) {
    const result = db.exec(
      `SELECT special_price FROM rate_cards
       WHERE product_id=? AND customer_id IS NULL AND customer_type=? AND min_qty<=? AND valid_from<=? AND valid_to>=?
       ORDER BY min_qty DESC LIMIT 1`,
      [productId, customerType, qty, today, today]
    )
    if (result.length && result[0].values.length) return result[0].values[0][0] as number
  }

  return null // fall back to MRP
}

export function upsertRateCard(rc: Omit<RateCard, 'id'>): void {
  const db = getDB()
  // Check for existing rate card for this customer+product combination
  const existing = rc.customer_id
    ? db.exec(`SELECT id FROM rate_cards WHERE customer_id=? AND product_id=?`, [rc.customer_id, rc.product_id])
    : db.exec(`SELECT id FROM rate_cards WHERE customer_id IS NULL AND customer_type=? AND product_id=?`, [rc.customer_type, rc.product_id])

  if (existing.length && existing[0].values.length) {
    const id = existing[0].values[0][0] as string
    db.run(`UPDATE rate_cards SET special_price=?,min_qty=?,valid_from=?,valid_to=? WHERE id=?`,
      [rc.special_price, rc.min_qty, rc.valid_from, rc.valid_to, id])
  } else {
    db.run(`INSERT INTO rate_cards VALUES (?,?,?,?,?,?,?,?)`,
      [generateId(), rc.customer_id, rc.customer_type, rc.product_id, rc.special_price, rc.min_qty, rc.valid_from, rc.valid_to])
  }
  persistDB()
}

export function getRateCardsForCustomer(customerId: string): RateCard[] {
  const db = getDB()
  const result = db.exec(`SELECT * FROM rate_cards WHERE customer_id=?`, [customerId])
  if (!result.length) return []
  return result[0].values.map(r => ({
    id: r[0] as string, customer_id: r[1] as string, customer_type: r[2] as any,
    product_id: r[3] as string, special_price: r[4] as number,
    min_qty: r[5] as number, valid_from: r[6] as string, valid_to: r[7] as string,
  }))
}
