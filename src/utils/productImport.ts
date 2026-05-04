import type { Product } from '../types'
import * as XLSX from 'xlsx'

// ── CONSTANTS ──────────────────────────────────────────────────────────────

export const ALLOWED_CATEGORIES = ['cement', 'paint', 'pipe', 'electrical', 'hardware', 'other'] as const
export const ALLOWED_UNITS = ['bag', 'kg', 'piece', 'metre', 'litre', 'coil', 'tin', 'pair', 'packet', 'trip'] as const
export const ALLOWED_GST_RATES = [0, 5, 12, 18, 28] as const

export const HSN_DEFAULTS: Record<string, { hsn: string; gst: number }> = {
  cement:     { hsn: '2523', gst: 18 },
  paint:      { hsn: '3209', gst: 18 },
  pipe:       { hsn: '3917', gst: 18 },
  electrical: { hsn: '8544', gst: 18 },
  hardware:   { hsn: '7318', gst: 18 },
  other:      { hsn: '9965', gst: 18 },
}

export const HSN_CATEGORY_MAP: Record<string, string[]> = {
  cement:     ['2523', '2521'],
  paint:      ['3208', '3209', '3214'],
  pipe:       ['3917', '7307', '7304'],
  electrical: ['8544', '8536', '8539', '8537'],
  hardware:   ['7318', '7317', '8302', '8301', '6809'],
}

export const EXCEL_COLUMNS = [
  { key: 'product_name',         label: 'product_name',         required: true,  col: 'A' },
  { key: 'category',             label: 'category',             required: true,  col: 'B' },
  { key: 'brand',                label: 'brand',                required: true,  col: 'C' },
  { key: 'variant',              label: 'variant',              required: false, col: 'D' },
  { key: 'unit',                 label: 'unit',                 required: true,  col: 'E' },
  { key: 'mrp',                  label: 'mrp',                  required: true,  col: 'F' },
  { key: 'gst_rate',             label: 'gst_rate',             required: true,  col: 'G' },
  { key: 'hsn_code',             label: 'hsn_code',             required: true,  col: 'H' },
  { key: 'stock_qty',            label: 'stock_qty',            required: true,  col: 'I' },
  { key: 'cost_price',           label: 'cost_price',           required: false, col: 'J' },
  { key: 'low_stock_threshold',  label: 'low_stock_threshold',  required: false, col: 'K' },
  { key: 'aliases',              label: 'aliases',              required: false, col: 'L' },
  { key: 'price_inclusive',      label: 'price_inclusive',      required: false, col: 'M' },
  { key: 'supplier_name',        label: 'supplier_name',        required: false, col: 'N' },
  { key: 'cement_type',          label: 'cement_type',          required: false, col: 'O' },
  { key: 'grade',                label: 'grade',                required: false, col: 'P' },
  { key: 'paint_finish',         label: 'paint_finish',         required: false, col: 'Q' },
  { key: 'shade_code',           label: 'shade_code',           required: false, col: 'R' },
  { key: 'pipe_material',        label: 'pipe_material',        required: false, col: 'S' },
  { key: 'size_spec',            label: 'size_spec',            required: false, col: 'T' },
] as const

// ── IMPORT TYPES ───────────────────────────────────────────────────────────

export type ImportStatus = 'CREATE_NEW' | 'UPDATE_EXISTING' | 'POSSIBLE_DUPLICATE' | 'ERROR' | 'SKIP'
export type ImportMode = 'create_only' | 'update_only' | 'create_and_update'

export interface ImportError {
  code: string
  message: string
  type: 'error' | 'warning'
  field: string
  suggestion?: string
}

export type ImportConfidence = 'high' | 'medium' | 'risky'

export interface ImportRow {
  rowIndex: number
  raw: Record<string, string>
  normalized: Partial<Product> & { price_inclusive?: boolean; supplier_name?: string }
  status: ImportStatus
  errors: ImportError[]
  warnings: ImportError[]
  existingProductId?: string
  existingProduct?: Product
  acknowledged: boolean
  _edited: boolean
  confidence: ImportConfidence
  confidenceScore: number
  confidenceReasons: string[]
}

export interface ImportSession {
  rows: ImportRow[]
  mode: ImportMode
  summary: {
    total: number
    ready: number
    errors: number
    warnings: number
    updates: number
    creates: number
    skips: number
  }
}

export function computeSessionSummary(rows: ImportRow[], mode: ImportMode): ImportSession['summary'] {
  const active = rows.filter(r => r.status !== 'SKIP')
  const errors = active.filter(r => r.errors.length > 0)
  const warns = active.filter(r => r.warnings.length > 0 && r.errors.length === 0)
  const updates = active.filter(r => r.status === 'UPDATE_EXISTING')
  const creates = active.filter(r => r.status === 'CREATE_NEW')

  const modeFiltered = active.filter(r => {
    if (mode === 'create_only') return r.status === 'CREATE_NEW'
    if (mode === 'update_only') return r.status === 'UPDATE_EXISTING'
    return r.status === 'CREATE_NEW' || r.status === 'UPDATE_EXISTING'
  })

  const ready = modeFiltered.filter(r =>
    r.errors.length === 0 && (r.warnings.length === 0 || r.acknowledged)
  )

  return {
    total: rows.filter(r => r.status !== 'SKIP').length,
    ready: ready.length,
    errors: errors.length,
    warnings: warns.length,
    updates: updates.length,
    creates: creates.length,
    skips: rows.filter(r => r.status === 'SKIP').length,
  }
}

export function generateImportTemplate(): void {
  const wb = XLSX.utils.book_new()

  // ── SHEET 1: Products (data entry) ─────────────────────────────────────
  const headers = EXCEL_COLUMNS.map(c => c.label)

  const examples = [
    // Cement
    ['UltraTech PPC', 'cement', 'UltraTech', 'PPC 50kg', 'bag', 415, 18, '2523', 100, 398, 20, 'ultra,ultr,ultratech,ppc', 'no', '', 'PPC', '', '', '', '', '50kg'],
    ['Ambuja PPC', 'cement', 'Ambuja', 'PPC 50kg', 'bag', 400, 18, '2523', 80, 383, 15, 'amb,ambuja,ambu', 'no', '', 'PPC', '', '', '', '', '50kg'],
    // Paint
    ['Asian Apex Ultima', 'paint', 'Asian', 'Emulsion 4L', 'tin', 1450, 18, '3209', 15, 1280, 3, 'asian,apex,ultima', 'no', '', '', '', 'Emulsion', 'N101', '', '4L'],
    // Pipe
    ['Astral CPVC Pipe', 'pipe', 'Astral', 'CPVC 1 inch 3m', 'piece', 520, 18, '3917', 40, 460, 5, 'cpvc,1inch,astral', 'no', '', '', '', '', '', 'CPVC', '1 inch'],
    // Electrical
    ['Havells Wire', 'electrical', 'Havells', '1.5 sqmm 90m', 'coil', 1450, 18, '8544', 20, 1320, 3, 'havells,1.5 wire', 'no', '', '', '', '', '', '', '1.5 sqmm'],
    // Hardware
    ['Iron Nail', 'hardware', 'Generic', '2 inch 1kg', 'kg', 85, 18, '7317', 30, 68, 5, 'nail,iron nail', 'no', '', '', '', '', '', '', '2 inch'],
  ]

  const wsData = [headers, ...examples]
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Column widths
  ws['!cols'] = [
    { wch: 25 }, { wch: 12 }, { wch: 15 }, { wch: 20 }, { wch: 8 },
    { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 30 }, { wch: 10 }, { wch: 20 }, { wch: 12 },
    { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
  ]

  // Freeze header row
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }

  XLSX.utils.book_append_sheet(wb, ws, 'Products')

  // ── SHEET 2: Instructions ───────────────────────────────────────────────
  const instructions = [
    ['PRODUCT IMPORT INSTRUCTIONS', ''],
    ['', ''],
    ['HOW TO USE THIS TEMPLATE', ''],
    ['1. Fill your products in the "Products" sheet', ''],
    ['2. Do NOT change column headers (Row 1)', ''],
    ['3. Delete the example rows before uploading', ''],
    ['4. Upload the file in the POS system', ''],
    ['', ''],
    ['REQUIRED FIELDS (must fill)', ''],
    ['product_name', 'Name of the product (e.g. UltraTech PPC)'],
    ['category', 'Must be exactly: cement / paint / pipe / electrical / hardware / other'],
    ['brand', 'Brand name (e.g. Asian, Havells, Astral)'],
    ['variant', 'Size/type description (e.g. PPC 50kg, 1.5 sqmm, 4L)'],
    ['unit', 'Must be exactly: bag / kg / piece / metre / litre / coil / tin / pair / packet / trip'],
    ['mrp', 'Selling price in Rs (number only, no Rs symbol)'],
    ['gst_rate', 'GST percentage: 0 or 5 or 12 or 18 or 28'],
    ['hsn_code', 'HSN code (4+ digits, see reference below)'],
    ['stock_qty', 'Current stock quantity (0 if unknown)'],
    ['', ''],
    ['HSN QUICK REFERENCE', ''],
    ['Cement (all types)', '2523 — GST 18%'],
    ['Paint, Emulsion, Putty', '3209 / 3214 — GST 18%'],
    ['CPVC/PVC/UPVC Pipes', '3917 — GST 18%'],
    ['Insulated Wires, Cables', '8544 — GST 18%'],
    ['Switches, MCBs, Sockets', '8536 — GST 18%'],
    ['Screws, Bolts, Nails', '7318 / 7317 — GST 18%'],
    ['Hinges, Locks, Door Hardware', '8302 — GST 18%'],
    ['POP / Plaster of Paris', '6809 — GST 18%'],
    ['Delivery / Loading charges', '9965 — GST 18%'],
    ['', ''],
    ['CATEGORY-SPECIFIC COLUMNS (Optional — helps auto-fill variant)', ''],
    ['cement_type (Col O)', 'OPC / PPC / PSC / White / SRC'],
    ['grade (Col P)', '33 / 43 / 53'],
    ['paint_finish (Col Q)', 'Emulsion / Enamel / Distemper / Primer / Putty / Exterior'],
    ['shade_code (Col R)', 'Shade reference code from manufacturer'],
    ['pipe_material (Col S)', 'CPVC / UPVC / PVC / GI'],
    ['size_spec (Col T)', 'Any size: 1 inch, 50mm, 1.5 sqmm, 16A, etc.'],
  ]

  const wsInstr = XLSX.utils.aoa_to_sheet(instructions)
  wsInstr['!cols'] = [{ wch: 40 }, { wch: 50 }]
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instructions')

  // ── WRITE FILE ──────────────────────────────────────────────────────────
  XLSX.writeFile(wb, 'HardwarePOS_Import_Template.xlsx')
}

export function parseExcelFile(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })

        // Find the Products sheet (first sheet, or sheet named "Products")
        const sheetName = wb.SheetNames.includes('Products') ? 'Products' : wb.SheetNames[0]
        const ws = wb.Sheets[sheetName]

        // Convert to array of objects using first row as headers
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
          defval: '',
          raw: false, // always return strings
        })

        // Normalise keys: lowercase, trim, replace spaces with underscores
        const normalised = rows.map(row => {
          const clean: Record<string, string> = {}
          for (const [k, v] of Object.entries(row)) {
            const key = k.trim().toLowerCase().replace(/\s+/g, '_')
            clean[key] = String(v ?? '').trim()
          }
          return clean
        })

        resolve(normalised)
      } catch {
        reject(new Error('Could not read file. Make sure it is a valid Excel (.xlsx) file.'))
      }
    }
    reader.onerror = () => reject(new Error('File read failed'))
    reader.readAsArrayBuffer(file)
  })
}

function buildVariantFromCategoryFields(raw: Record<string, string>, category: string): string {
  const parts: string[] = []

  if (category === 'cement') {
    if (raw.cement_type) parts.push(raw.cement_type.toUpperCase())
    if (raw.grade) parts.push(raw.grade)
    if (raw.size_spec) parts.push(raw.size_spec)
    else parts.push('50kg')
  } else if (category === 'paint') {
    if (raw.paint_finish) parts.push(raw.paint_finish)
    if (raw.size_spec) parts.push(raw.size_spec)
    if (raw.shade_code) parts.push(raw.shade_code)
  } else if (category === 'pipe') {
    if (raw.pipe_material) parts.push(raw.pipe_material.toUpperCase())
    if (raw.size_spec) parts.push(raw.size_spec)
  } else {
    if (raw.size_spec) parts.push(raw.size_spec)
  }

  return parts.filter(Boolean).join(' ').trim()
}

function buildAliasesFromCategoryFields(raw: Record<string, string>, category: string, existingAliases: string): string {
  const extra: string[] = []
  const base = existingAliases ? existingAliases.split(',').map(s => s.trim()).filter(Boolean) : []

  if (category === 'cement') {
    if (raw.cement_type) extra.push(raw.cement_type.toLowerCase())
    if (raw.grade) extra.push(raw.grade)
    if (raw.brand) extra.push(raw.brand.toLowerCase().substring(0, 5))
  } else if (category === 'paint') {
    if (raw.shade_code) extra.push(raw.shade_code.toLowerCase())
    if (raw.paint_finish) extra.push(raw.paint_finish.toLowerCase())
  } else if (category === 'pipe') {
    if (raw.pipe_material) extra.push(raw.pipe_material.toLowerCase())
    if (raw.size_spec) extra.push(raw.size_spec.replace(/\s+/g, '').toLowerCase())
  }

  const combined = [...new Set([...base, ...extra])].filter(Boolean)
  return combined.join(',')
}

export function normalizeRow(raw: Record<string, string>, rowIndex: number): ImportRow {
  const category = raw.category?.toLowerCase().trim() || ''
  const brand = raw.brand?.trim() || ''
  const name = raw.product_name?.trim() || ''
  const unit = raw.unit?.toLowerCase().trim() || ''
  const mrpRaw = parseFloat(raw.mrp || '0')
  const costRaw = raw.cost_price ? parseFloat(raw.cost_price) : undefined
  const gstRaw = raw.gst_rate ? parseInt(raw.gst_rate) : NaN
  const hsnRaw = raw.hsn_code?.trim() || ''
  const stockRaw = parseFloat(raw.stock_qty || '0')
  const lowStockRaw = raw.low_stock_threshold ? parseFloat(raw.low_stock_threshold) : 5

  // Build variant: use D directly if filled, else build from category fields
  let variant = raw.variant?.trim() || ''
  if (!variant) {
    variant = buildVariantFromCategoryFields(raw, category)
  }

  // Build aliases
  const aliases = buildAliasesFromCategoryFields(raw, category, raw.aliases || '')

  // Detect blank row (all key fields empty)
  const isBlank = !name && !brand && !category && !raw.mrp
  if (isBlank) {
    return {
      rowIndex,
      raw,
      normalized: {},
      status: 'SKIP',
      errors: [],
      warnings: [],
      acknowledged: false,
      _edited: false,
      confidence: 'high',
      confidenceScore: 100,
      confidenceReasons: [],
    }
  }

  const normalized: Partial<Product> & { price_inclusive?: boolean; supplier_name?: string } = {
    name,
    category: category as Product['category'],
    brand,
    variant,
    unit,
    mrp: isNaN(mrpRaw) ? 0 : mrpRaw,
    cost_price: costRaw !== undefined && !isNaN(costRaw) ? costRaw : 0,
    gst_rate: isNaN(gstRaw) ? -1 : gstRaw,
    hsn_code: hsnRaw,
    stock_qty: isNaN(stockRaw) ? 0 : stockRaw,
    low_stock_threshold: isNaN(lowStockRaw) ? 5 : lowStockRaw,
    aliases,
    is_active: true,
    price_inclusive: raw.price_inclusive?.toLowerCase() === 'yes',
    supplier_name: raw.supplier_name?.trim() || '',
  }

  return {
    rowIndex,
    raw,
    normalized,
    status: 'CREATE_NEW', // will be overridden by duplicate check
    errors: [],
    warnings: [],
    acknowledged: false,
    _edited: false,
    confidence: 'high',
    confidenceScore: 100,
    confidenceReasons: [],
  }
}

/** Dry-run counts for final confirmation (no DB). */
export interface DryRunConfirmationCounts {
  rowsToCreate: number
  rowsToUpdate: number
  rowsSkipped: number
  rowsBlockedByErrors: number
  rowsWithWarnings: number
  riskyRows: number
  possibleDuplicates: number
}

function rowWouldImport(r: ImportRow, mode: ImportMode): boolean {
  if (r.status === 'SKIP') return false
  if (r.errors.length > 0) return false
  if (r.warnings.length > 0 && !r.acknowledged && r.status !== 'UPDATE_EXISTING') return false
  if (mode === 'create_only' && r.status === 'UPDATE_EXISTING') return false
  if (mode === 'update_only' && r.status === 'CREATE_NEW') return false
  return r.status === 'CREATE_NEW' || r.status === 'UPDATE_EXISTING'
}

export function computeDryRunConfirmation(
  rows: ImportRow[],
  mode: ImportMode
): DryRunConfirmationCounts {
  const active = rows.filter(r => r.status !== 'SKIP')
  const rowsBlockedByErrors = active.filter(r => r.errors.length > 0).length
  const rowsWithWarnings = active.filter(r => r.warnings.length > 0 && r.errors.length === 0).length
  const possibleDuplicates = active.filter(r => r.status === 'POSSIBLE_DUPLICATE').length
  const riskyRows = active.filter(r => r.confidence === 'risky').length

  const rowsToCreate = active.filter(r => rowWouldImport(r, mode) && r.status === 'CREATE_NEW').length
  const rowsToUpdate = active.filter(r => rowWouldImport(r, mode) && r.status === 'UPDATE_EXISTING').length

  const blankSkips = rows.filter(r => r.status === 'SKIP').length
  const skippedActive = active.filter(r => !rowWouldImport(r, mode) && r.errors.length === 0).length
  const rowsSkipped = blankSkips + skippedActive

  return {
    rowsToCreate,
    rowsToUpdate,
    rowsSkipped,
    rowsBlockedByErrors,
    rowsWithWarnings,
    riskyRows,
    possibleDuplicates,
  }
}
