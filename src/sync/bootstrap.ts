import { getDB, persistDB } from '../db'
import { getSupabase, isSupabaseConfigured } from './client'

function tableCount(table: string): number {
  const db = getDB()
  const result = db.exec(`SELECT COUNT(*) FROM ${table}`)
  if (!result.length || !result[0].values.length) return 0
  return Number(result[0].values[0][0] || 0)
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  return JSON.stringify(value)
}

function asNum(value: unknown): number {
  return Number(value || 0)
}

function asInt(value: unknown): number {
  return Math.floor(Number(value || 0))
}

export async function bootstrapFromSupabaseIfLocalEmpty(): Promise<void> {
  if (!isSupabaseConfigured()) return
  const client = getSupabase()
  if (!client) return

  const db = getDB()
  const localHasData = tableCount('products') > 0 || tableCount('customers') > 0 || tableCount('bills') > 0
  if (localHasData) return

  const [productsRes, customersRes, rateCardsRes, billsRes, ledgerRes, creditPaymentsRes, creditNotesRes] = await Promise.all([
    client.from('products').select('*'),
    client.from('customers').select('*'),
    client.from('rate_cards').select('*'),
    client.from('bills').select('*'),
    client.from('ledger_entries').select('*'),
    client.from('credit_payments').select('*'),
    client.from('credit_notes').select('*'),
  ])

  if (productsRes.error || customersRes.error || rateCardsRes.error || billsRes.error || ledgerRes.error || creditPaymentsRes.error || creditNotesRes.error) {
    console.warn('Supabase bootstrap skipped due to fetch error', {
      products: productsRes.error?.message,
      customers: customersRes.error?.message,
      rateCards: rateCardsRes.error?.message,
      bills: billsRes.error?.message,
      ledger: ledgerRes.error?.message,
      creditPayments: creditPaymentsRes.error?.message,
      creditNotes: creditNotesRes.error?.message,
    })
    return
  }

  db.run('BEGIN')
  try {
    for (const p of productsRes.data || []) {
      db.run(
        `INSERT OR REPLACE INTO products VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          p.id, p.name, p.category, p.brand, p.variant, p.hsn_code,
          asNum(p.gst_rate), asNum(p.mrp), asNum(p.cost_price), p.unit,
          asNum(p.stock_qty), asNum(p.low_stock_threshold), p.aliases || '',
          p.is_active ? 1 : 0, p.created_at, p.updated_at || p.created_at,
        ]
      )
    }

    for (const c of customersRes.data || []) {
      db.run(
        `INSERT OR REPLACE INTO customers VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          c.id, c.name, c.phone, c.type || 'retail', c.gstin || '', c.address || '',
          asNum(c.credit_limit), asInt(c.credit_days), asNum(c.opening_balance), c.created_at,
        ]
      )
    }

    for (const rc of rateCardsRes.data || []) {
      db.run(
        `INSERT OR REPLACE INTO rate_cards VALUES (?,?,?,?,?,?,?,?)`,
        [
          rc.id, rc.customer_id || null, rc.customer_type || null, rc.product_id,
          asNum(rc.special_price), asNum(rc.min_qty), rc.valid_from, rc.valid_to,
        ]
      )
    }

    for (const b of billsRes.data || []) {
      db.run(
        `INSERT OR REPLACE INTO bills VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          b.id, b.invoice_no, b.customer_id || null, asText(b.customer_snapshot), b.date,
          asText(b.lines), asNum(b.subtotal), asNum(b.gst_amount), asNum(b.rounding), asNum(b.total),
          asText(b.payments), asNum(b.credit_amount), b.status || 'confirmed', b.notes || '', b.created_at,
        ]
      )
    }

    for (const l of ledgerRes.data || []) {
      db.run(
        `INSERT OR REPLACE INTO ledger_entries VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          l.id, l.customer_id, l.type, l.ref_type, l.ref_id, asNum(l.amount),
          asNum(l.balance_after), l.date, l.notes || '', l.created_at,
        ]
      )
    }

    for (const cp of creditPaymentsRes.data || []) {
      db.run(
        `INSERT OR REPLACE INTO credit_payments VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          cp.id, cp.customer_id, asNum(cp.amount), cp.mode, cp.ref_no || '', cp.date,
          asText(cp.applied_to_bill_ids), cp.notes || '', cp.created_at,
        ]
      )
    }

    for (const cn of creditNotesRes.data || []) {
      db.run(
        `INSERT OR REPLACE INTO credit_notes VALUES (?,?,?,?,?,?,?,?)`,
        [
          cn.id, cn.credit_note_no, cn.original_bill_id, cn.customer_id || null, cn.date,
          asText(cn.lines), asNum(cn.total_credit), cn.notes || '', cn.created_at,
        ]
      )
    }

    db.run('COMMIT')
  } catch (err) {
    db.run('ROLLBACK')
    throw err
  }

  await persistDB()
}
