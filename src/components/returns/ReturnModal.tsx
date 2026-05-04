import { useState } from 'react'
import { Bill } from '../../types'
import { processReturn, getAlreadyReturnedQty, CreditNote } from '../../db/queries/returns'

interface Props { bill: Bill; onClose: () => void; onSuccess: (cn: CreditNote) => void }

export default function ReturnModal({ bill, onClose, onSuccess }: Props) {
  const [qtys, setQtys] = useState<Record<string, number>>(
    Object.fromEntries(bill.lines.map(l => [l.product_id, 0]))
  )
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  const totalCredit = bill.lines.reduce((sum, line) => {
    const alreadyReturned = getAlreadyReturnedQty(bill.id, line.product_id)
    return sum + (qtys[line.product_id] || 0) * line.unit_price
  }, 0)

  function submit() {
    setError('')
    const returnLines = Object.entries(qtys)
      .filter(([_, qty]) => qty > 0)
      .map(([product_id, return_qty]) => ({ product_id, return_qty }))
    if (returnLines.length === 0) { setError('Enter at least one return quantity'); return }
    try {
      const cn = processReturn(bill.id, returnLines, notes)
      onSuccess(cn)
    } catch (err: any) { setError(err.message) }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-slate-800 rounded-xl p-5 w-[500px] border border-slate-700 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-base font-bold text-white">Process Return</h2>
            <div className="text-xs text-slate-400">{bill.invoice_no} · {bill.date}</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-sm">✕</button>
        </div>

        {error && <div className="text-red-400 text-xs bg-red-900/30 rounded px-3 py-2 mb-3">{error}</div>}

        <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
          {bill.lines.map(line => {
            const alreadyReturned = getAlreadyReturnedQty(bill.id, line.product_id)
            const maxReturnable = line.qty - alreadyReturned
            return (
              <div key={line.product_id} className="flex items-center justify-between bg-slate-900 rounded px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{line.product_snapshot.brand} {line.product_snapshot.name}</div>
                  <div className="text-xs text-slate-400">
                    Bought: {line.qty} · Returnable: {maxReturnable} · ₹{line.unit_price}/unit
                    {alreadyReturned > 0 && <span className="text-warn ml-1">({alreadyReturned} already returned)</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-3 shrink-0">
                  <input
                    type="number"
                    min="0"
                    max={maxReturnable}
                    value={qtys[line.product_id] || 0}
                    onChange={e => setQtys(q => ({ ...q, [line.product_id]: Math.min(maxReturnable, Math.max(0, parseInt(e.target.value)||0)) }))}
                    className="w-16 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm text-right focus:outline-none focus:border-brand-500"
                  />
                  <span className="text-xs text-slate-500">{line.product_snapshot.unit}</span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex flex-col gap-2 mb-4">
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Return reason (optional)"
            className="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-brand-500" />
        </div>

        <div className="flex justify-between items-center">
          <div className="text-sm text-white">
            Credit: <span className="font-bold text-green-400">₹{totalCredit.toFixed(2)}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm">Cancel</button>
            <button onClick={submit} className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded text-sm font-semibold">Process Return</button>
          </div>
        </div>
      </div>
    </div>
  )
}
