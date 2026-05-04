import { getDB, generateId, now, persistDB } from '../index'
import { Product } from '../../types'

const PRODUCT_COLUMNS = `
  id, name, category, brand, variant,
  hsn_code, gst_rate, mrp, cost_price,
  unit, stock_qty, low_stock_threshold, aliases,
  is_active, created_at, updated_at, price_inclusive
`

function rowToProduct(row: any[]): Product {
  return {
    id: row[0], name: row[1], category: row[2], brand: row[3], variant: row[4],
    hsn_code: row[5], gst_rate: row[6], mrp: row[7], cost_price: row[8],
    unit: row[9], stock_qty: row[10], low_stock_threshold: row[11],
    aliases: row[12], is_active: Boolean(row[13]),
    created_at: row[14], updated_at: row[15], price_inclusive: Boolean(row[16]),
  }
}

export function getAllProducts(): Product[] {
  const db = getDB()
  const result = db.exec(`SELECT ${PRODUCT_COLUMNS} FROM products WHERE is_active=1 ORDER BY name`)
  if (!result.length) return []
  return result[0].values.map(rowToProduct)
}

export function getAllProductsForImport(): Array<{
  id: string
  matchKey: string
  name: string
  brand: string
  variant: string
  unit: string
  mrp: number
}> {
  const db = getDB()
  const result = db.exec('SELECT id, name, brand, variant, unit, mrp FROM products WHERE is_active=1')
  if (!result.length) return []
  return result[0].values.map(r => {
    const brand = (r[2] as string).toLowerCase().trim()
    const name = (r[1] as string).toLowerCase().trim()
    const variant = (r[3] as string).toLowerCase().trim()
    const unit = (r[4] as string).toLowerCase().trim()
    return {
      id: r[0] as string,
      matchKey: [brand, name, variant, unit].join('|'),
      name: r[1] as string,
      brand: r[2] as string,
      variant: r[3] as string,
      unit: r[4] as string,
      mrp: r[5] as number,
    }
  })
}

export function searchProducts(query: string, limit = 20): Product[] {
  if (!query.trim()) return getAllProducts().slice(0, limit)
  const db = getDB()
  const q = `%${query.toLowerCase()}%`
  const result = db.exec(
    `SELECT ${PRODUCT_COLUMNS} FROM products WHERE is_active=1 AND (
      LOWER(name) LIKE ? OR LOWER(brand) LIKE ? OR LOWER(variant) LIKE ? OR LOWER(aliases) LIKE ?
    ) LIMIT ?`,
    [q, q, q, q, limit]
  )
  if (!result.length) return []
  return result[0].values.map(rowToProduct)
}

export function getProductById(id: string): Product | null {
  const db = getDB()
  const result = db.exec(`SELECT ${PRODUCT_COLUMNS} FROM products WHERE id=?`, [id])
  if (!result.length || !result[0].values.length) return null
  return rowToProduct(result[0].values[0])
}

export function upsertProduct(p: Omit<Product, 'created_at' | 'updated_at'>): Product {
  const VALID_GST_RATES = [0, 5, 12, 18, 28]
  if (!VALID_GST_RATES.includes(p.gst_rate)) {
    throw new Error(`Invalid GST rate ${p.gst_rate}. Must be one of: 0, 5, 12, 18, 28`)
  }
  if (!p.hsn_code.trim()) {
    throw new Error('HSN code is required for all products')
  }
  const db = getDB()
  const existing = getProductById(p.id || '')
  const timestamp = now()
  const op = existing ? 'UPDATE' : 'INSERT'
  let id = p.id
  if (existing) {
    db.run(
      `UPDATE products SET name=?,category=?,brand=?,variant=?,hsn_code=?,gst_rate=?,mrp=?,
       cost_price=?,unit=?,stock_qty=?,low_stock_threshold=?,aliases=?,price_inclusive=?,is_active=?,updated_at=? WHERE id=?`,
      [p.name,p.category,p.brand,p.variant,p.hsn_code,p.gst_rate,p.mrp,p.cost_price,
       p.unit,p.stock_qty,p.low_stock_threshold,p.aliases,p.price_inclusive?1:0,p.is_active?1:0,timestamp,p.id]
    )
  } else {
    id = p.id || generateId()
    db.run(
      `INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id,p.name,p.category,p.brand,p.variant,p.hsn_code,p.gst_rate,p.mrp,p.cost_price,
       p.unit,p.stock_qty,p.low_stock_threshold,p.aliases,p.price_inclusive?1:0,p.is_active?1:0,timestamp,timestamp]
    )
  }
  const payload = {
    id,
    name: p.name,
    category: p.category,
    brand: p.brand,
    variant: p.variant,
    hsn_code: p.hsn_code,
    gst_rate: p.gst_rate,
    mrp: p.mrp,
    cost_price: p.cost_price,
    unit: p.unit,
    stock_qty: p.stock_qty,
    low_stock_threshold: p.low_stock_threshold,
    aliases: p.aliases,
    price_inclusive: p.price_inclusive,
    is_active: p.is_active,
    created_at: existing?.created_at || timestamp,
    updated_at: timestamp,
  }
  db.run(`INSERT INTO sync_queue VALUES (?,?,?,?,?,?,?)`, [
    generateId(), 'products', op, JSON.stringify(payload), timestamp, 0, 'pending',
  ])
  persistDB()
  return getProductById(id || '')!
}

export function bulkUpsertProducts(
  creates: Array<Omit<Product, 'created_at' | 'updated_at'>>,
  updates: Array<Omit<Product, 'created_at' | 'updated_at'> & { id: string }>
): { created: number; updated: number } {
  let created = 0
  let updated = 0

  const db = getDB()
  const timestamp = now()

  for (const p of creates) {
    const id = p.id || generateId()
    db.run(
      'INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [id, p.name, p.category, p.brand, p.variant, p.hsn_code, p.gst_rate, p.mrp,
        p.cost_price, p.unit, p.stock_qty, p.low_stock_threshold, p.aliases,
        p.price_inclusive ? 1 : 0, p.is_active ? 1 : 0, timestamp, timestamp]
    )
    // Add to sync queue
    db.run('INSERT INTO sync_queue VALUES (?,?,?,?,?,?,?)', [
      generateId(), 'products', 'INSERT',
      JSON.stringify({ id, name: p.name, brand: p.brand, variant: p.variant, mrp: p.mrp }),
      timestamp, 0, 'pending',
    ])
    created++
  }

  for (const p of updates) {
    db.run(
      `UPDATE products SET name=?,category=?,brand=?,variant=?,hsn_code=?,gst_rate=?,mrp=?,
       cost_price=?,unit=?,stock_qty=?,low_stock_threshold=?,aliases=?,price_inclusive=?,is_active=?,updated_at=?
       WHERE id=?`,
      [p.name, p.category, p.brand, p.variant, p.hsn_code, p.gst_rate, p.mrp,
        p.cost_price, p.unit, p.stock_qty, p.low_stock_threshold, p.aliases,
        p.price_inclusive ? 1 : 0, p.is_active ? 1 : 0, timestamp, p.id]
    )
    db.run('INSERT INTO sync_queue VALUES (?,?,?,?,?,?,?)', [
      generateId(), 'products', 'UPDATE',
      JSON.stringify({ id: p.id, name: p.name, mrp: p.mrp }),
      timestamp, 0, 'pending',
    ])
    updated++
  }

  void persistDB()
  return { created, updated }
}

export function updateStock(productId: string, delta: number): void {
  const db = getDB()
  const timestamp = now()
  db.run('UPDATE products SET stock_qty=stock_qty+?, updated_at=? WHERE id=?', [delta, timestamp, productId])
  const updated = getProductById(productId)
  if (updated) {
    db.run(`INSERT INTO sync_queue VALUES (?,?,?,?,?,?,?)`, [
      generateId(), 'products', 'UPDATE', JSON.stringify(updated), timestamp, 0, 'pending',
    ])
  }
  persistDB()
}
