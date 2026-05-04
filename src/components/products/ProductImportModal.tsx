import { useState, useRef, useCallback, useEffect } from 'react'
import {
  ImportSession, ImportRow, ImportMode,
  computeSessionSummary, generateImportTemplate, parseExcelFile, normalizeRow,
  computeDryRunConfirmation,
} from '../../utils/productImport'
import { reprocessImportRows } from '../../utils/productValidation'
import ImportPreviewTable from './ImportPreviewTable'
import { createImportSession, getRecentImportSessions, type ImportSessionRecord } from '../../db/queries/importSessions'
import { runAllProductImportTests } from '../../tests/productImportTests'
import type { Product } from '../../types'

interface Props { onClose: () => void; onImportComplete: (created: number, updated: number) => void }

type Step = 'upload' | 'preview' | 'done'

type BulkField = 'gst_rate' | 'hsn_code' | 'category' | 'unit' | 'acknowledge_warnings'

export default function ProductImportModal({ onClose, onImportComplete }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [session, setSession] = useState<ImportSession | null>(null)
  const [importing, setImporting] = useState(false)
  const [parseError, setParseError] = useState('')
  const [importResult, setImportResult] = useState<{ created: number; updated: number } | null>(null)
  const [mode, setMode] = useState<ImportMode>('create_and_update')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [lastFileName, setLastFileName] = useState('uploaded.xlsx')
  const [dryRunOpen, setDryRunOpen] = useState(false)
  const [bulkField, setBulkField] = useState<BulkField>('gst_rate')
  const [bulkValue, setBulkValue] = useState('18')
  const [recentImports, setRecentImports] = useState<ImportSessionRecord[]>([])

  useEffect(() => {
    if (step === 'done') {
      try {
        setRecentImports(getRecentImportSessions(10))
      } catch {
        setRecentImports([])
      }
    }
  }, [step])

  async function handleFile(file: File) {
    setParseError('')
    setLastFileName(file.name || 'uploaded.xlsx')
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      setParseError('Please upload an Excel file (.xlsx or .xls) or CSV file')
      return
    }
    try {
      const rawRows = await parseExcelFile(file)
      if (rawRows.length === 0) { setParseError('File appears to be empty. Check the Products sheet.'); return }
      if (rawRows.length > 500) { setParseError('File has too many rows (max 500). Split into smaller files.'); return }

      let rows: ImportRow[] = rawRows.map((raw, i) => normalizeRow(raw, i + 2))
      rows = reprocessImportRows(rows)

      const summary = computeSessionSummary(rows, mode)
      setSession({ rows, mode, summary })
      setStep('preview')
    } catch (err: any) {
      setParseError(err.message || 'Failed to parse file')
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) void handleFile(file)
  }, [])

  function handleRowUpdate(updatedRow: ImportRow) {
    if (!session) return
    const merged = session.rows.map(r => r.rowIndex === updatedRow.rowIndex ? { ...updatedRow, _edited: true } : r)
    const newRows = reprocessImportRows(merged)
    const summary = computeSessionSummary(newRows, mode)
    setSession({ ...session, rows: newRows, summary })
  }

  function handleBulkApply() {
    if (!session) return
    const newRows = session.rows.map(r => {
      if (r.status === 'SKIP') return r
      if (bulkField === 'acknowledge_warnings') {
        return { ...r, acknowledged: true }
      }
      const v = bulkValue.trim()
      if (!v && bulkField !== 'gst_rate') return r
      const raw = { ...r.raw }
      const n = { ...r.normalized }
      if (bulkField === 'gst_rate') {
        raw.gst_rate = v
        n.gst_rate = parseInt(v, 10) || -1
      } else if (bulkField === 'hsn_code') {
        raw.hsn_code = v
        n.hsn_code = v
      } else if (bulkField === 'category') {
        raw.category = v.toLowerCase()
        n.category = v.toLowerCase() as Product['category']
      } else if (bulkField === 'unit') {
        raw.unit = v.toLowerCase()
        n.unit = v.toLowerCase()
      }
      return { ...r, raw, normalized: n, _edited: true }
    })
    const processed = reprocessImportRows(newRows)
    const summary = computeSessionSummary(processed, mode)
    setSession({ ...session, rows: processed, summary })
  }

  function handleModeChange(newMode: ImportMode) {
    if (!session) return
    setMode(newMode)
    const summary = computeSessionSummary(session.rows, newMode)
    setSession({ ...session, mode: newMode, summary })
  }

  function openDryRun() {
    if (!session) return
    setDryRunOpen(true)
  }

  async function commitImport() {
    if (!session) return
    setImporting(true)
    setDryRunOpen(false)
    try {
      const { bulkUpsertProducts } = await import('../../db/queries/products')
      const { generateId } = await import('../../db')

      const creates: any[] = []
      const updates: any[] = []

      for (const row of session.rows) {
        if (row.status === 'SKIP' || row.status === 'ERROR') continue
        if (row.warnings.length > 0 && !row.acknowledged && row.status !== 'UPDATE_EXISTING') continue

        const p = {
          ...row.normalized,
          id: row.existingProductId || generateId(),
          supplier_name: undefined,
          is_active: true,
          aliases: row.normalized.aliases || '',
          price_inclusive: Boolean(row.normalized.price_inclusive),
        }

        if (session.mode === 'create_only' && row.status === 'UPDATE_EXISTING') continue
        if (session.mode === 'update_only' && row.status === 'CREATE_NEW') continue

        if (row.status === 'UPDATE_EXISTING') updates.push({ ...p, id: row.existingProductId! })
        else creates.push(p)
      }

      const result = bulkUpsertProducts(creates, updates)
      setImportResult(result)
      setStep('done')
      onImportComplete(result.created, result.updated)

      const dry = computeDryRunConfirmation(session.rows, session.mode)
      const active = session.rows.filter(r => r.status !== 'SKIP')
      try {
        createImportSession({
          file_name: lastFileName,
          mode: session.mode,
          total_rows: session.summary.total,
          created_count: result.created,
          updated_count: result.updated,
          skipped_count: dry.rowsSkipped,
          error_count: dry.rowsBlockedByErrors,
          warning_count: dry.rowsWithWarnings,
          risky_count: dry.riskyRows,
        })
      } catch (e) {
        console.warn('import_sessions insert failed', e)
      }
    } catch (err: any) {
      setParseError('Import failed: ' + err.message)
    } finally {
      setImporting(false)
    }
  }

  function runDevImportTests() {
    const { passed, results } = runAllProductImportTests()
    console.log('Product import tests:', results)
    alert(passed ? 'Import tests: PASS' : `Import tests: FAIL\n${results.filter(r => !r.pass).map(r => `${r.name}: ${r.detail}`).join('\n')}`)
  }

  const hasBlockingErrors = session?.rows.some(r => r.errors.length > 0 && r.status === 'ERROR') ?? false
  const hasUnacknowledgedWarnings = session?.rows.some(
    r => r.warnings.length > 0 && !r.acknowledged && r.status !== 'UPDATE_EXISTING' && r.status !== 'SKIP'
  ) ?? false

  const dryCounts = session ? computeDryRunConfirmation(session.rows, mode) : null
  const canConfirmImport = session && !hasBlockingErrors && !hasUnacknowledgedWarnings && !importing

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className={`bg-slate-800 rounded-xl border border-slate-700 shadow-2xl flex flex-col relative
        ${step === 'preview' ? 'w-full max-w-6xl h-[90vh]' : 'w-[500px]'}`}>

        <div className="flex justify-between items-center px-5 py-4 border-b border-slate-700 shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">Import Products from Excel</h2>
            <div className="text-xs text-slate-400 mt-0.5">
              {step === 'upload' && 'Download template → Fill → Upload'}
              {step === 'preview' && `${session?.summary.total} rows parsed · ${session?.summary.errors} errors · ${session?.summary.warnings} warnings`}
              {step === 'done' && 'Import complete'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {import.meta.env.DEV && step === 'preview' && (
              <button type="button" onClick={runDevImportTests} className="text-xs px-2 py-1 bg-amber-900/50 text-amber-200 rounded border border-amber-700">
                Run Import Tests
              </button>
            )}
            <button type="button" onClick={onClose} className="text-slate-400 hover:text-white text-lg">✕</button>
          </div>
        </div>

        {step === 'upload' && (
          <div className="p-6 flex flex-col gap-5">
            <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
              <div className="text-sm font-semibold text-white mb-1">Step 1: Download Template</div>
              <div className="text-xs text-slate-400 mb-3">
                Use our pre-formatted Excel template with example rows and instructions.
              </div>
              <button type="button" onClick={generateImportTemplate}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded font-medium">
                ⬇ Download Template (.xlsx)
              </button>
            </div>

            <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
              <div className="text-sm font-semibold text-white mb-1">Step 2: Upload Filled File</div>
              <div
                onDrop={onDrop}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors mt-2
                  ${dragOver ? 'border-brand-500 bg-brand-900/20' : 'border-slate-600 hover:border-slate-400'}`}
              >
                <div className="text-3xl mb-2">📂</div>
                <div className="text-sm text-white font-medium">Drop Excel file here</div>
                <div className="text-xs text-slate-400 mt-1">or click to browse — .xlsx, .xls, .csv accepted</div>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f) }} />
              </div>
              {parseError && <div className="text-red-400 text-xs mt-2 bg-red-900/30 rounded px-3 py-2">{parseError}</div>}
            </div>
          </div>
        )}

        {step === 'preview' && session && (
          <>
            <div className="px-5 py-3 border-b border-slate-700 bg-slate-900 shrink-0">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-xs text-green-400">✅ {session.summary.creates} new</span>
                <span className="text-xs text-blue-400">🔵 {session.summary.updates} updates</span>
                {session.summary.errors > 0 && <span className="text-xs text-red-400">❌ {session.summary.errors} errors</span>}
                {session.summary.warnings > 0 && <span className="text-xs text-warn">⚠ {session.summary.warnings} warnings</span>}
                <div className="flex-1" />
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>Mode:</span>
                  {(['create_only', 'update_only', 'create_and_update'] as ImportMode[]).map(m => (
                    <button type="button" key={m} onClick={() => handleModeChange(m)}
                      className={`px-2 py-1 rounded ${mode === m ? 'bg-brand-700 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}>
                      {m === 'create_only' ? 'Add new only' : m === 'update_only' ? 'Update only' : 'Both'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-4 py-2 border-b border-slate-800 bg-slate-900/80 shrink-0">
              <div className="text-xs font-semibold text-slate-300 mb-2">Bulk fix (all non-skipped rows)</div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] text-slate-500">Field</label>
                  <select value={bulkField} onChange={e => setBulkField(e.target.value as BulkField)}
                    className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white">
                    <option value="gst_rate">GST rate %</option>
                    <option value="hsn_code">HSN code</option>
                    <option value="category">Category</option>
                    <option value="unit">Unit</option>
                    <option value="acknowledge_warnings">Acknowledge all warnings</option>
                  </select>
                </div>
                {bulkField !== 'acknowledge_warnings' && (
                  <div className="flex flex-col gap-0.5 min-w-[100px]">
                    <label className="text-[10px] text-slate-500">Value</label>
                    <input value={bulkValue} onChange={e => setBulkValue(e.target.value)}
                      className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white" placeholder="e.g. 18" />
                  </div>
                )}
                <button type="button" onClick={handleBulkApply}
                  className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white text-xs rounded">
                  Apply to all
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden min-h-0">
              <ImportPreviewTable rows={session.rows} onRowUpdate={handleRowUpdate} />
            </div>

            <div className="px-5 py-3 border-t border-slate-700 flex justify-between items-center shrink-0">
              <button type="button" onClick={() => setStep('upload')} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm">
                ← Upload Different File
              </button>
              <div className="flex items-center gap-3">
                {hasBlockingErrors && <span className="text-xs text-red-400">Fix {session.summary.errors} error(s) first</span>}
                {hasUnacknowledgedWarnings && !hasBlockingErrors && (
                  <span className="text-xs text-warn">Some warnings need review (click ✓ OK or bulk acknowledge)</span>
                )}
                <button
                  type="button"
                  onClick={openDryRun}
                  disabled={hasBlockingErrors || importing}
                  className="px-5 py-2 bg-brand-700 hover:bg-brand-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold rounded"
                >
                  {importing ? 'Importing...' : `Import ${session.summary.ready} Products →`}
                </button>
              </div>
            </div>

            {dryRunOpen && dryCounts && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 p-4">
                <div className="bg-slate-800 border border-slate-600 rounded-xl max-w-md w-full p-5 shadow-2xl">
                  <h3 className="text-lg font-bold text-white mb-3">Confirm import</h3>
                  <p className="text-xs text-slate-400 mb-4">Review counts below. Nothing is saved until you confirm.</p>
                  <pre className="text-xs text-slate-200 bg-slate-900 rounded p-3 mb-4 whitespace-pre-wrap font-mono leading-relaxed">
{`Rows to create:     ${dryCounts.rowsToCreate}
Rows to update:     ${dryCounts.rowsToUpdate}
Rows skipped:       ${dryCounts.rowsSkipped}
Blocked by errors:  ${dryCounts.rowsBlockedByErrors}
Rows with warnings: ${dryCounts.rowsWithWarnings}
Risky rows:         ${dryCounts.riskyRows}
Possible duplicates: ${dryCounts.possibleDuplicates}`}
                  </pre>
                  {!canConfirmImport && (
                    <p className="text-xs text-red-400 mb-3">Fix errors or acknowledge warnings before confirming.</p>
                  )}
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setDryRunOpen(false)} className="px-4 py-2 bg-slate-700 text-white rounded text-sm">
                      Back
                    </button>
                    <button type="button" onClick={() => void commitImport()} disabled={!canConfirmImport}
                      className="px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold rounded text-sm">
                      Confirm Import
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {step === 'done' && importResult && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center overflow-y-auto">
            <div className="text-5xl mb-4">✅</div>
            <div className="text-xl font-bold text-white mb-2">Import Complete!</div>
            <div className="text-slate-300 mb-1">{importResult.created} products added to catalogue</div>
            <div className="text-slate-300 mb-6">{importResult.updated} products updated</div>

            {recentImports.length > 0 && (
              <div className="w-full max-w-md text-left mb-6 border border-slate-700 rounded-lg p-3 bg-slate-900/50">
                <div className="text-xs font-semibold text-slate-300 mb-2">Recent imports</div>
                <ul className="text-[11px] text-slate-400 space-y-1 max-h-32 overflow-y-auto">
                  {recentImports.map(r => (
                    <li key={r.id} className="truncate">
                      {r.file_name} · +{r.created_count} / ~{r.updated_count} · {new Date(r.created_at).toLocaleString()}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="px-5 py-2 bg-brand-700 hover:bg-brand-500 text-white font-semibold rounded">
                View Products
              </button>
              <button type="button" onClick={() => { setStep('upload'); setImportResult(null); setSession(null); setDryRunOpen(false) }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm">
                Import Another File
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
