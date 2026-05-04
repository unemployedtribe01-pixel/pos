/**
 * Pure import pipeline tests (no DB). Run from dev-only UI or console.
 */
import type { ImportRow } from '../utils/productImport'
import { normalizeRow, computeDryRunConfirmation } from '../utils/productImport'
import {
  reprocessImportRowsInMemory,
  validateRow,
  detectInFileduplicates,
  finalizeImportRows,
} from '../utils/productValidation'
import { validateTaxAgainstCategory } from '../utils/productTaxRules'
import { validatePriceSanity } from '../utils/productPriceRules'

type TestResult = { name: string; pass: boolean; detail?: string }

function row(raw: Record<string, string>, idx = 2): ImportRow {
  return normalizeRow(raw, idx)
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

export function runAllProductImportTests(): { passed: boolean; results: TestResult[] } {
  const results: TestResult[] = []

  function run(name: string, fn: () => void) {
    try {
      fn()
      results.push({ name, pass: true })
    } catch (e) {
      results.push({ name, pass: false, detail: e instanceof Error ? e.message : String(e) })
    }
  }

  run('Cement correct HSN/GST is valid', () => {
    const r = row({
      product_name: 'Test', category: 'cement', brand: 'B', variant: 'v', unit: 'bag',
      mrp: '400', gst_rate: '18', hsn_code: '2523', stock_qty: '1',
    })
    const v = validateRow(r)
    assert(v.errors.length === 0, 'expected no errors')
    const tax = validateTaxAgainstCategory('cement', '2523', 18)
    assert(tax.severity === 'ok', 'tax ok')
  })

  run('Cement 5% GST is error', () => {
    const tax = validateTaxAgainstCategory('cement', '2523', 5)
    assert(tax.severity === 'error', 'cement GST must not be 5%')
  })

  run('Cement row with 5% GST yields TAX_E in validateRow', () => {
    const r = row({
      product_name: 'C', category: 'cement', brand: 'B', variant: 'v', unit: 'bag',
      mrp: '400', gst_rate: '5', hsn_code: '2523', stock_qty: '1',
    })
    const v = validateRow(r)
    assert(v.errors.some(e => e.code === 'TAX_E'), 'TAX_E for cement GST')
  })

  run('Missing name is error', () => {
    const r = row({
      product_name: '', category: 'cement', brand: 'B', variant: 'v', unit: 'bag',
      mrp: '400', gst_rate: '18', hsn_code: '2523', stock_qty: '1',
    })
    const v = validateRow(r)
    assert(v.errors.some(e => e.code === 'V01'), 'V01')
  })

  run('Cost greater than MRP is warning', () => {
    const p = validatePriceSanity('paint', 'tin', 100, 150)
    assert(p.severity === 'warning', 'cost>mrbp warning')
  })

  run('Duplicate in same file is ERROR', () => {
    const a = row({
      product_name: 'X', category: 'hardware', brand: 'Y', variant: 'z', unit: 'kg',
      mrp: '10', gst_rate: '18', hsn_code: '7318', stock_qty: '1',
    }, 2)
    const b = row({
      product_name: 'X', category: 'hardware', brand: 'Y', variant: 'z', unit: 'kg',
      mrp: '10', gst_rate: '18', hsn_code: '7318', stock_qty: '1',
    }, 3)
    let rows = [a, b].map(validateRow)
    rows = detectInFileduplicates(rows)
    assert(rows[1].status === 'ERROR' && rows[1].errors.some(e => e.code === 'V17'), 'dup row error')
  })

  run('Cement MRP ₹40 is warning (price outlier)', () => {
    const p = validatePriceSanity('cement', 'bag', 40, undefined)
    assert(p.severity === 'warning', 'cement low mrp warning')
  })

  run('Bulk GST fix revalidates rows', () => {
    const r1 = row({
      product_name: 'A', category: 'paint', brand: 'B', variant: 'v', unit: 'tin',
      mrp: '500', gst_rate: '12', hsn_code: '3209', stock_qty: '1',
    })
    const r2 = row({
      product_name: 'C', category: 'paint', brand: 'D', variant: 'w', unit: 'tin',
      mrp: '600', gst_rate: '12', hsn_code: '3209', stock_qty: '1',
    })
    const fixed: ImportRow[] = [r1, r2].map(r => ({
      ...r,
      raw: { ...r.raw, gst_rate: '18' },
      normalized: { ...r.normalized, gst_rate: 18 },
    }))
    const out = reprocessImportRowsInMemory(fixed)
    assert(out.every(r => r.normalized.gst_rate === 18), 'gst 18')
    assert(out.every(r => r.errors.length === 0), 'no errors after fix')
  })

  run('Dry-run summary counts', () => {
    const rows: ImportRow[] = [
      row({ product_name: 'N1', category: 'other', brand: 'B', variant: 'v', unit: 'piece', mrp: '10', gst_rate: '18', hsn_code: '9965', stock_qty: '1' }, 2),
      row({ product_name: 'N2', category: 'other', brand: 'B2', variant: 'v2', unit: 'piece', mrp: '20', gst_rate: '18', hsn_code: '9965', stock_qty: '1' }, 3),
    ]
    const processed = finalizeImportRows(rows.map(validateRow))
    const summary = computeDryRunConfirmation(processed, 'create_and_update')
    assert(summary.rowsToCreate === 2, `creates ${summary.rowsToCreate}`)
    assert(summary.rowsBlockedByErrors === 0, 'blocked')
  })

  const passed = results.every(r => r.pass)
  return { passed, results }
}
