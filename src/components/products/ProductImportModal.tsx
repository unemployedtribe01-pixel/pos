import { useState, useRef, useCallback } from 'react'
import { ImportSession, ImportRow, ImportMode, computeSessionSummary, generateImportTemplate, parseExcelFile, normalizeRow } from '../../utils/productImport'
import { validateAllRows, detectInFileduplicates, checkDuplicatesAgainstDB, validateRow } from '../../utils/productValidation'
import ImportPreviewTable from './ImportPreviewTable'

interface Props { onClose: () => void; onImportComplete: (created: number, updated: number) => void }

type Step = 'upload' | 'preview' | 'done'

export default function ProductImportModal({ onClose, onImportComplete }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [session, setSession] = useState<ImportSession | null>(null)
  const [importing, setImporting] = useState(false)
  const [parseError, setParseError] = useState('')
  const [importResult, setImportResult] = useState<{ created: number; updated: number } | null>(null)
  const [mode, setMode] = useState<ImportMode>('create_and_update')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  async function handleFile(file: File) {
    setParseError('')
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      setParseError('Please upload an Excel file (.xlsx or .xls) or CSV file')
      return
    }
    try {
      const rawRows = await parseExcelFile(file)
      if (rawRows.length === 0) { setParseError('File appears to be empty. Check the Products sheet.'); return }
      if (rawRows.length > 500) { setParseError('File has too many rows (max 500). Split into smaller files.'); return }

      // Parse → normalize → validate → check DB duplicates
      let rows: ImportRow[] = rawRows.map((raw, i) => normalizeRow(raw, i + 2))
      rows = validateAllRows(rows)
      rows = detectInFileduplicates(rows)
      rows = checkDuplicatesAgainstDB(rows)

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
    const patched = validateRow({ ...updatedRow, _edited: true })
    let newRows = session.rows.map(r => r.rowIndex === patched.rowIndex ? patched : r)
    newRows = detectInFileduplicates(newRows)
    newRows = checkDuplicatesAgainstDB(newRows)
    const summary = computeSessionSummary(newRows, mode)
    setSession({ ...session, rows: newRows, summary })
  }

  function handleModeChange(newMode: ImportMode) {
    if (!session) return
    setMode(newMode)
    const summary = computeSessionSummary(session.rows, newMode)
    setSession({ ...session, mode: newMode, summary })
  }

  async function commitImport() {
    if (!session) return
    setImporting(true)
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
    } catch (err: any) {
      setParseError('Import failed: ' + err.message)
    } finally {
      setImporting(false)
    }
  }

  const hasBlockingErrors = session?.rows.some(r => r.errors.length > 0 && r.status === 'ERROR') ?? false
  const hasUnacknowledgedWarnings = session?.rows.some(
    r => r.warnings.length > 0 && !r.acknowledged && r.status !== 'UPDATE_EXISTING' && r.status !== 'SKIP'
  ) ?? false

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className={`bg-slate-800 rounded-xl border border-slate-700 shadow-2xl flex flex-col
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
          <button onClick={onClose} className="text-slate-400 hover:text-white text-lg">✕</button>
        </div>

        {step === 'upload' && (
          <div className="p-6 flex flex-col gap-5">
            <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
              <div className="text-sm font-semibold text-white mb-1">Step 1: Download Template</div>
              <div className="text-xs text-slate-400 mb-3">
                Use our pre-formatted Excel template with example rows and instructions.
              </div>
              <button onClick={generateImportTemplate}
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
                    <button key={m} onClick={() => handleModeChange(m)}
                      className={`px-2 py-1 rounded ${mode === m ? 'bg-brand-700 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}>
                      {m === 'create_only' ? 'Add new only' : m === 'update_only' ? 'Update only' : 'Both'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              <ImportPreviewTable rows={session.rows} onRowUpdate={handleRowUpdate} />
            </div>

            <div className="px-5 py-3 border-t border-slate-700 flex justify-between items-center shrink-0">
              <button onClick={() => setStep('upload')} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm">
                ← Upload Different File
              </button>
              <div className="flex items-center gap-3">
                {hasBlockingErrors && <span className="text-xs text-red-400">Fix {session.summary.errors} error(s) first</span>}
                {hasUnacknowledgedWarnings && !hasBlockingErrors && (
                  <span className="text-xs text-warn">Some warnings need review (click ✓ on each warning row)</span>
                )}
                <button
                  onClick={() => void commitImport()}
                  disabled={hasBlockingErrors || importing}
                  className="px-5 py-2 bg-brand-700 hover:bg-brand-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold rounded"
                >
                  {importing ? 'Importing...' : `Import ${session.summary.ready} Products →`}
                </button>
              </div>
            </div>
          </>
        )}

        {step === 'done' && importResult && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="text-5xl mb-4">✅</div>
            <div className="text-xl font-bold text-white mb-2">Import Complete!</div>
            <div className="text-slate-300 mb-1">{importResult.created} products added to catalogue</div>
            <div className="text-slate-300 mb-6">{importResult.updated} products updated</div>
            <div className="flex gap-3">
              <button onClick={onClose} className="px-5 py-2 bg-brand-700 hover:bg-brand-500 text-white font-semibold rounded">
                View Products
              </button>
              <button onClick={() => { setStep('upload'); setImportResult(null); setSession(null) }}
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
