import { Fragment, useState } from 'react'
import { ImportRow, ImportError, ALLOWED_CATEGORIES, ALLOWED_UNITS } from '../../utils/productImport'
import { validateRow } from '../../utils/productValidation'

interface Props {
  rows: ImportRow[]
  onRowUpdate: (row: ImportRow) => void
}

const STATUS_COLORS: Record<string, string> = {
  CREATE_NEW: 'text-green-400',
  UPDATE_EXISTING: 'text-blue-400',
  POSSIBLE_DUPLICATE: 'text-warn',
  ERROR: 'text-red-400',
  SKIP: 'text-slate-600',
}

const STATUS_LABELS: Record<string, string> = {
  CREATE_NEW: '✅ NEW',
  UPDATE_EXISTING: '🔵 UPDATE',
  POSSIBLE_DUPLICATE: '⚠ DUPE?',
  ERROR: '❌ ERROR',
  SKIP: '— SKIP',
}

export default function ImportPreviewTable({ rows, onRowUpdate }: Props) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null)

  const visibleRows = rows.filter(r => r.status !== 'SKIP')

  function EditableCell({
    value, field, row, type = 'text', options,
  }: {
    value: string | number, field: string, row: ImportRow,
    type?: 'text' | 'number' | 'select', options?: string[]
  }) {
    const [localVal, setLocalVal] = useState(String(value ?? ''))
    const hasError = row.errors.some(e => e.field === field)

    function commit(val: string) {
      const newNormalized = { ...row.normalized, [field]: type === 'number' ? parseFloat(val) || 0 : val }
      const newRaw = { ...row.raw, [field]: val }
      const newRow: ImportRow = { ...row, normalized: newNormalized as any, raw: newRaw, _edited: true }
      const reValidated = validateRow(newRow)
      onRowUpdate(reValidated)
    }

    const baseClass = `bg-slate-700 border rounded px-1.5 py-0.5 text-xs text-white w-full focus:outline-none
      ${hasError ? 'border-red-500' : 'border-slate-600 focus:border-brand-500'}`

    if (type === 'select' && options) {
      return (
        <select value={localVal}
          onChange={e => { setLocalVal(e.target.value); commit(e.target.value) }}
          className={baseClass}>
          <option value="">— select —</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )
    }

    return (
      <input type={type} value={localVal}
        onChange={e => setLocalVal(e.target.value)}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit((e.target as HTMLInputElement).value) }}
        className={baseClass} />
    )
  }

  function IssuesBadge({ errors, warnings }: { errors: ImportError[]; warnings: ImportError[] }) {
    if (errors.length > 0) return <span className="text-xs text-red-400">{errors[0].message.substring(0, 40)}</span>
    if (warnings.length > 0) return <span className="text-xs text-warn">{warnings[0].message.substring(0, 40)}</span>
    return <span className="text-xs text-slate-500">—</span>
  }

  if (visibleRows.length === 0) {
    return <div className="flex items-center justify-center h-full text-slate-500 text-sm">No rows to display</div>
  }

  return (
    <div className="h-full overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-slate-900 z-10">
          <tr className="text-xs text-slate-500 border-b border-slate-800">
            <th className="px-3 py-2 text-left w-12">Row</th>
            <th className="px-3 py-2 text-left w-20">Status</th>
            <th className="px-3 py-2 text-left min-w-[140px]">Product Name</th>
            <th className="px-3 py-2 text-left w-24">Category</th>
            <th className="px-3 py-2 text-left w-24">Brand</th>
            <th className="px-3 py-2 text-left w-32">Variant</th>
            <th className="px-3 py-2 text-left w-16">Unit</th>
            <th className="px-3 py-2 text-right w-20">MRP (₹)</th>
            <th className="px-3 py-2 text-right w-14">GST%</th>
            <th className="px-3 py-2 text-left w-20">HSN</th>
            <th className="px-3 py-2 text-left">Issues</th>
            <th className="px-3 py-2 text-left w-14">Action</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map(row => {
            const isExpanded = expandedRow === row.rowIndex
            const hasIssues = row.errors.length > 0 || row.warnings.length > 0
            return (
              <Fragment key={row.rowIndex}>
                <tr key={row.rowIndex}
                  className={`border-b border-slate-800/60 transition-colors
                    ${isExpanded ? 'bg-slate-700/50' : 'hover:bg-slate-800/40'}
                    ${row.errors.length > 0 ? 'bg-red-950/20' : ''}
                    ${row.status === 'UPDATE_EXISTING' ? 'bg-blue-950/20' : ''}
                  `}
                  onClick={() => setExpandedRow(isExpanded ? null : row.rowIndex)}
                >
                  <td className="px-3 py-2 text-slate-500 text-xs">{row.rowIndex}</td>
                  <td className={`px-3 py-2 text-xs font-semibold ${STATUS_COLORS[row.status]}`}>
                    {STATUS_LABELS[row.status]}
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-white text-xs font-medium truncate max-w-[140px]">
                      {row.normalized.name || <span className="text-red-400 italic">missing</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-300">{row.normalized.category || '—'}</td>
                  <td className="px-3 py-2 text-xs text-slate-300">{row.normalized.brand || '—'}</td>
                  <td className="px-3 py-2 text-xs text-slate-400 truncate max-w-[128px]">{row.normalized.variant || '—'}</td>
                  <td className="px-3 py-2 text-xs text-slate-400">{row.normalized.unit || '—'}</td>
                  <td className="px-3 py-2 text-right text-xs text-brand-400 font-semibold">
                    {row.normalized.mrp ? `₹${row.normalized.mrp}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-slate-400">{row.normalized.gst_rate ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-slate-400">{row.normalized.hsn_code || '—'}</td>
                  <td className="px-3 py-2 max-w-[200px]">
                    <IssuesBadge errors={row.errors} warnings={row.warnings} />
                  </td>
                  <td className="px-3 py-2">
                    {hasIssues && (
                      <button
                        onClick={e => { e.stopPropagation(); setExpandedRow(isExpanded ? null : row.rowIndex) }}
                        className="text-xs px-2 py-0.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded"
                      >
                        {isExpanded ? 'Close' : 'Fix'}
                      </button>
                    )}
                    {row.status === 'POSSIBLE_DUPLICATE' && (
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          onRowUpdate({ ...row, status: 'CREATE_NEW', acknowledged: true, warnings: [] })
                        }}
                        className="text-xs px-2 py-0.5 bg-slate-700 hover:bg-green-700 text-slate-300 rounded"
                        title="Confirm this is a new product"
                      >
                        ✓ New
                      </button>
                    )}
                    {row.warnings.length > 0 && row.errors.length === 0 && !row.acknowledged && (
                      <button
                        onClick={e => { e.stopPropagation(); onRowUpdate({ ...row, acknowledged: true }) }}
                        className="text-xs px-2 py-0.5 bg-warn/20 hover:bg-warn/40 text-warn rounded"
                      >
                        ✓ OK
                      </button>
                    )}
                  </td>
                </tr>

                {isExpanded && (
                  <tr key={`${row.rowIndex}-edit`} className="bg-slate-800/80 border-b border-slate-700">
                    <td colSpan={12} className="px-4 py-4">
                      <div className="grid grid-cols-4 gap-3 mb-3">
                        {[
                          { label: 'Product Name *', field: 'name', type: 'text' },
                          { label: 'Brand *', field: 'brand', type: 'text' },
                          { label: 'Variant *', field: 'variant', type: 'text' },
                          { label: 'MRP Rs *', field: 'mrp', type: 'number' },
                          { label: 'Cost Price', field: 'cost_price', type: 'number' },
                          { label: 'GST Rate % *', field: 'gst_rate', type: 'number' },
                          { label: 'HSN Code *', field: 'hsn_code', type: 'text' },
                          { label: 'Stock Qty *', field: 'stock_qty', type: 'number' },
                        ].map(f => (
                          <div key={f.field} className="flex flex-col gap-1">
                            <label className="text-xs text-slate-500">{f.label}</label>
                            <EditableCell
                              value={(row.normalized as any)[f.field] ?? ''}
                              field={f.field}
                              row={row}
                              type={f.type as any}
                            />
                          </div>
                        ))}
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-slate-500">Category *</label>
                          <EditableCell value={row.normalized.category ?? ''} field="category" row={row} type="select" options={[...ALLOWED_CATEGORIES]} />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-slate-500">Unit *</label>
                          <EditableCell value={row.normalized.unit ?? ''} field="unit" row={row} type="select" options={[...ALLOWED_UNITS]} />
                        </div>
                        <div className="flex flex-col gap-1 col-span-2">
                          <label className="text-xs text-slate-500">Aliases (search terms)</label>
                          <EditableCell value={row.normalized.aliases ?? ''} field="aliases" row={row} />
                        </div>
                      </div>

                      {row.errors.map((e, i) => (
                        <div key={i} className="text-xs text-red-400 bg-red-900/30 rounded px-2 py-1 mb-1">
                          ❌ [{e.code}] {e.message}
                          {e.suggestion && <span className="text-slate-400"> → Suggestion: {e.suggestion}</span>}
                        </div>
                      ))}

                      {row.warnings.map((w, i) => (
                        <div key={i} className="text-xs text-warn bg-warn/10 rounded px-2 py-1 mb-1 flex justify-between items-center">
                          <span>⚠ [{w.code}] {w.message}</span>
                          {!row.acknowledged && (
                            <button
                              onClick={() => onRowUpdate({ ...row, acknowledged: true })}
                              className="text-xs px-2 py-0.5 bg-warn/20 hover:bg-warn/40 text-warn rounded ml-2"
                            >
                              ✓ Acknowledged
                            </button>
                          )}
                        </div>
                      ))}

                      {row.status === 'UPDATE_EXISTING' && row.existingProduct && (
                        <div className="text-xs text-blue-300 bg-blue-900/30 rounded px-2 py-1 mt-1">
                          🔵 Will update existing: {row.existingProduct.brand} {row.existingProduct.name} — Current MRP: ₹{row.existingProduct.mrp} → New: ₹{row.normalized.mrp}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
