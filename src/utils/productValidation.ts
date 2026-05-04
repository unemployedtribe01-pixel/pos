import Fuse from 'fuse.js'
import type { Product } from '../types'
import {
  ImportRow, ImportError, ImportConfidence, ALLOWED_CATEGORIES, ALLOWED_UNITS,
  ALLOWED_GST_RATES,
} from './productImport'
import { getAllProductsForImport } from '../db/queries/products'
import { validateTaxAgainstCategory } from './productTaxRules'
import { validatePriceSanity } from './productPriceRules'

function err(code: string, field: string, message: string, suggestion?: string): ImportError {
  return { code, type: 'error', field, message, suggestion }
}

function warn(code: string, field: string, message: string, suggestion?: string): ImportError {
  return { code, type: 'warning', field, message, suggestion }
}

export function computeConfidence(row: ImportRow): {
  confidence: ImportConfidence
  confidenceScore: number
  confidenceReasons: string[]
} {
  if (row.errors.length > 0) {
    return {
      confidence: 'risky',
      confidenceScore: 0,
      confidenceReasons: ['Row has blocking errors'],
    }
  }

  let score = 100
  const reasons: string[] = []

  if (row.status === 'POSSIBLE_DUPLICATE') {
    score -= 20
    reasons.push('Possible duplicate of existing product')
  }

  for (const w of row.warnings) {
    if (w.code === 'V19' && row.status === 'POSSIBLE_DUPLICATE') continue
    if (w.code.startsWith('TAX_')) {
      score -= 20
      reasons.push(w.message)
    } else if (w.code.startsWith('PRC_')) {
      score -= 15
      reasons.push(w.message)
    } else {
      score -= 10
      reasons.push(w.message)
    }
  }

  if (!row.normalized.aliases?.trim()) {
    score -= 5
    reasons.push('No search aliases (recommended for faster lookup)')
  }

  score = Math.max(0, Math.min(100, score))

  let confidence: ImportConfidence
  if (score >= 80) confidence = 'high'
  else if (score >= 50) confidence = 'medium'
  else confidence = 'risky'

  return { confidence, confidenceScore: score, confidenceReasons: reasons }
}

/** Run after validateAllRows → detectInFileduplicates → checkDuplicatesAgainstDB. */
export function finalizeImportRows(rows: ImportRow[]): ImportRow[] {
  return rows.map(r => {
    if (r.status === 'SKIP') return r
    const c = computeConfidence(r)
    return { ...r, ...c }
  })
}

/** Revalidate without DB (for pure tests and offline preview when DB unavailable). */
export function reprocessImportRowsInMemory(rows: ImportRow[]): ImportRow[] {
  let out = rows.map(validateRow)
  out = detectInFileduplicates(out)
  out = finalizeImportRows(out)
  return out
}

/** Full pipeline including DB duplicate detection (requires initDB). */
export function reprocessImportRows(rows: ImportRow[]): ImportRow[] {
  let out = rows.map(validateRow)
  out = detectInFileduplicates(out)
  try {
    out = checkDuplicatesAgainstDB(out)
  } catch {
    // DB not initialised (e.g. isolated test) — skip DB duplicate pass
  }
  out = finalizeImportRows(out)
  return out
}

export function validateRow(row: ImportRow): ImportRow {
  if (row.status === 'SKIP') return row
  const n = row.normalized
  const errors: ImportError[] = []
  const warnings: ImportError[] = []

  // V01: product name required
  if (!n.name?.trim()) errors.push(err('V01', 'product_name', 'Product name is required'))

  // V02: category must be in allowed list
  if (!n.category || !(ALLOWED_CATEGORIES as readonly string[]).includes(n.category)) {
    errors.push(err('V02', 'category',
      `Category must be one of: ${ALLOWED_CATEGORIES.join(', ')}`,
      `Detected: "${n.category || ''}"`)
    )
  }

  // V03: brand required
  if (!n.brand?.trim()) errors.push(err('V03', 'brand', 'Brand is required'))

  // V04: variant required (or buildable)
  if (!n.variant?.trim()) errors.push(err('V04', 'variant', 'Variant is required. Fill column D or use columns O-T for auto-build'))

  // V05: unit must be in allowed list
  if (!n.unit || !(ALLOWED_UNITS as readonly string[]).includes(n.unit)) {
    errors.push(err('V05', 'unit',
      `Unit must be one of: ${ALLOWED_UNITS.join(', ')}`,
      `Detected: "${n.unit || ''}"`)
    )
  }

  // V06: mrp must be positive number
  if (!n.mrp || n.mrp <= 0 || isNaN(n.mrp)) {
    errors.push(err('V06', 'mrp', 'MRP must be a number greater than 0'))
  }

  // V07: gst_rate must be in allowed list
  if (n.gst_rate === undefined || n.gst_rate === -1 || !(ALLOWED_GST_RATES as readonly number[]).includes(n.gst_rate as number)) {
    errors.push(err('V07', 'gst_rate',
      `GST rate must be exactly: ${ALLOWED_GST_RATES.join(', ')}`,
      `Detected: "${row.raw.gst_rate || ''}"`)
    )
  }

  // V08: hsn_code must be at least 4 digits
  const hsnDigits = (n.hsn_code || '').replace(/\D/g, '')
  if (hsnDigits.length < 4) {
    errors.push(err('V08', 'hsn_code', 'HSN code must be at least 4 digits (numbers only)'))
  }

  // V09: stock_qty cannot be negative
  if (n.stock_qty !== undefined && n.stock_qty < 0) {
    errors.push(err('V09', 'stock_qty', 'Stock quantity cannot be negative'))
  }

  // V23: stock_qty must be numeric
  if (row.raw.stock_qty && Number.isNaN(Number(row.raw.stock_qty))) {
    errors.push(err('V23', 'stock_qty', 'Stock quantity must be a number'))
  }

  // V21: hsn_code cannot contain letters
  if (n.hsn_code && /[a-zA-Z]/.test(n.hsn_code)) {
    errors.push(err('V21', 'hsn_code', 'HSN code must contain digits only — no letters'))
  }

  // V22: gst_rate must be whole number
  if (row.raw.gst_rate && String(row.raw.gst_rate).includes('.')) {
    errors.push(err('V22', 'gst_rate', 'GST rate must be a whole number (0, 5, 12, 18, or 28)'))
  }

  const gstOk = n.gst_rate !== undefined && n.gst_rate !== -1 &&
    (ALLOWED_GST_RATES as readonly number[]).includes(n.gst_rate as number)
  const hsnFieldBlocked = errors.some(e => e.field === 'hsn_code')

  // ── Smart tax / HSN (merchant-proof) ─────────────────────────────────
  if (!hsnFieldBlocked && gstOk && n.category && (ALLOWED_CATEGORIES as readonly string[]).includes(n.category)) {
    const tax = validateTaxAgainstCategory(n.category, n.hsn_code || '', Number(n.gst_rate))
    if (tax.severity === 'error') {
      errors.push(err('TAX_E', 'hsn_code', tax.message, `Suggested HSN: ${tax.suggestedHsn || '—'}, GST: ${tax.suggestedGstRate}%`))
    } else if (tax.severity === 'warning') {
      warnings.push(warn('TAX_W', 'hsn_code', tax.message, `Suggested HSN: ${tax.suggestedHsn}, GST: ${tax.suggestedGstRate}%`))
    }
  }

  // ── Price sanity ────────────────────────────────────────────────────────
  const mrpInvalid = errors.some(e => e.field === 'mrp')
  if (!mrpInvalid && n.category && n.mrp !== undefined) {
    const price = validatePriceSanity(n.category, n.unit || '', Number(n.mrp), n.cost_price !== undefined ? Number(n.cost_price) : undefined)
    if (price.severity === 'error') {
      errors.push(err('PRC_E', 'mrp', price.message))
    } else if (price.severity === 'warning') {
      warnings.push(warn('PRC_W', 'mrp', price.message))
    }
  }

  const prior = row.status === 'ERROR' && errors.length === 0 ? 'CREATE_NEW' : row.status
  const nextStatus = errors.length > 0 ? 'ERROR' as const : prior

  return {
    ...row,
    errors,
    warnings,
    status: nextStatus,
  }
}

export function validateAllRows(rows: ImportRow[]): ImportRow[] {
  return rows.map(validateRow)
}

export function detectInFileduplicates(rows: ImportRow[]): ImportRow[] {
  const keyCount = new Map<string, number[]>()

  rows.forEach((row, idx) => {
    if (row.status === 'SKIP') return
    const key = [
      row.normalized.brand?.toLowerCase().trim(),
      row.normalized.name?.toLowerCase().trim(),
      row.normalized.variant?.toLowerCase().trim(),
      row.normalized.unit?.toLowerCase().trim(),
    ].join('|')
    if (!keyCount.has(key)) keyCount.set(key, [])
    keyCount.get(key)?.push(idx)
  })

  return rows.map((row, idx) => {
    if (row.status === 'SKIP') return row
    const key = [
      row.normalized.brand?.toLowerCase().trim(),
      row.normalized.name?.toLowerCase().trim(),
      row.normalized.variant?.toLowerCase().trim(),
      row.normalized.unit?.toLowerCase().trim(),
    ].join('|')
    const dupeIndices = keyCount.get(key) || []
    if (dupeIndices.length > 1 && dupeIndices[0] !== idx) {
      return {
        ...row,
        status: 'ERROR' as const,
        errors: [...row.errors, err('V17', 'product_name',
          `Duplicate row in file — same as row ${dupeIndices[0] + 2} in Excel`)],
      }
    }
    return row
  })
}

export function checkDuplicatesAgainstDB(rows: ImportRow[]): ImportRow[] {
  const existing = getAllProductsForImport()

  if (existing.length === 0) return rows

  const fuse = new Fuse(existing, {
    keys: [
      { name: 'name', weight: 0.5 },
      { name: 'brand', weight: 0.3 },
      { name: 'variant', weight: 0.2 },
    ],
    threshold: 0.35,
    includeScore: true,
  })

  return rows.map(row => {
    if (row.status === 'SKIP' || row.status === 'ERROR') return row
    if (!row.normalized.name) return row

    const rowKey = [
      row.normalized.brand?.toLowerCase().trim(),
      row.normalized.name?.toLowerCase().trim(),
      row.normalized.variant?.toLowerCase().trim(),
      row.normalized.unit?.toLowerCase().trim(),
    ].join('|')

    const exactMatch = existing.find(e => e.matchKey === rowKey)
    if (exactMatch) {
      return {
        ...row,
        status: 'UPDATE_EXISTING' as const,
        existingProductId: exactMatch.id,
        existingProduct: {
          id: exactMatch.id,
          name: exactMatch.name,
          brand: exactMatch.brand,
          variant: exactMatch.variant,
          unit: exactMatch.unit,
          mrp: exactMatch.mrp,
        } as Product,
        warnings: [...row.warnings, {
          code: 'V18',
          type: 'warning' as const,
          field: 'product_name',
          message: `Already exists in system. Will UPDATE: "${exactMatch.brand} ${exactMatch.name}" (₹${exactMatch.mrp} → ₹${row.normalized.mrp})`,
        }],
      }
    }

    const fuzzyResults = fuse.search(`${row.normalized.brand} ${row.normalized.name}`)
    if (fuzzyResults.length > 0 && (fuzzyResults[0].score || 1) < 0.35) {
      const match = fuzzyResults[0].item
      return {
        ...row,
        status: 'POSSIBLE_DUPLICATE' as const,
        existingProductId: match.id,
        warnings: [...row.warnings, {
          code: 'V19',
          type: 'warning' as const,
          field: 'product_name',
          message: `Possible duplicate of existing product: "${match.brand} ${match.name} ${match.variant}". Confirm this is a different product.`,
        }],
      }
    }

    return row
  })
}
