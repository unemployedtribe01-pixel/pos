import { exportDatabaseBackup, checkDBHealth } from '../db'
import { getDailyTotals, getRecentBills } from '../db/queries/bills'
import { useState, useEffect, useRef } from 'react'
import { getSyncQueueStats } from '../sync/syncQueue'
import { Bill } from '../types'
import ReturnModal from '../components/returns/ReturnModal'
import { CreditNote } from '../db/queries/returns'
import { useReactToPrint } from 'react-to-print'
import BillReceipt from '../components/sell/BillReceipt'

export default function ReportsPage() {
  const today = new Date().toISOString().split('T')[0]
  const [totals, setTotals] = useState({ cash:0, upi:0, card:0, credit:0, total:0 })
  const [syncStats, setSyncStats] = useState({ pending: 0, failed: 0, synced: 0 })
  const [bills, setBills] = useState<Bill[]>([])
  const [billSearch, setBillSearch] = useState('')
  const [returnBill, setReturnBill] = useState<Bill | null>(null)
  const [lastCN, setLastCN] = useState<CreditNote | null>(null)
  const [printBill, setPrintBill] = useState<Bill | null>(null)
  const printRef = useRef<HTMLDivElement>(null)
  const handlePrint = useReactToPrint({ content: () => printRef.current } as any)
  const [dateFilter, setDateFilter] = useState<'today'|'yesterday'|'week'|'all'>('all')
  const health = checkDBHealth()
  useEffect(() => {
    const refresh = () => {
      setTotals(getDailyTotals(today))
      setSyncStats(getSyncQueueStats())
    }
    refresh()
    const timer = setInterval(refresh, 5000)
    return () => clearInterval(timer)
  }, [today])
  useEffect(() => { setBills(getRecentBills(100)) }, [])

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-6">Reports & Settings</h1>
      <div className="bg-slate-800 rounded-xl p-5 mb-5">
        <h2 className="text-base font-semibold text-white mb-3">Today — {today}</h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label:'Cash', value:totals.cash, color:'text-green-400' },
            { label:'UPI', value:totals.upi, color:'text-blue-400' },
            { label:'Card', value:totals.card, color:'text-purple-400' },
            { label:'Udhaar Issued', value:totals.credit, color:'text-red-400' },
            { label:'Total Billed', value:totals.total, color:'text-white' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-slate-900 rounded-lg p-3">
              <div className="text-xs text-slate-500">{label}</div>
              <div className={`text-xl font-bold ${color}`}>₹{value.toFixed(2)}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-slate-800 rounded-xl p-5 mb-5">
        <h2 className="text-base font-semibold text-white mb-3">Database</h2>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[{ label:'Products', count:health.productCount },{ label:'Bills', count:health.billCount },{ label:'Customers', count:health.customerCount }].map(({ label, count }) => (
            <div key={label} className="bg-slate-900 rounded p-3 text-center">
              <div className="text-2xl font-bold text-brand-400">{count}</div>
              <div className="text-xs text-slate-500">{label}</div>
            </div>
          ))}
        </div>
        <button onClick={exportDatabaseBackup}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm font-medium">
          ⬇ Export Backup (.db file)
        </button>
      </div>
      <div className="bg-slate-800 rounded-xl p-5">
        <h2 className="text-base font-semibold text-white mb-3">Sync Diagnostics</h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Pending', value: syncStats.pending, color: 'text-blue-400' },
            { label: 'Failed', value: syncStats.failed, color: 'text-red-400' },
            { label: 'Synced', value: syncStats.synced, color: 'text-green-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-slate-900 rounded-lg p-3">
              <div className="text-xs text-slate-500">{label}</div>
              <div className={`text-xl font-bold ${color}`}>{value}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-slate-800 rounded-xl p-5 mt-5">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-base font-semibold text-white">Bill History</h2>
          <input value={billSearch} onChange={e => setBillSearch(e.target.value)}
            placeholder="Search invoice or customer..."
            className="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500 w-52" />
        </div>
        {lastCN && (
          <div className="text-xs text-green-400 bg-green-900/30 rounded px-3 py-2 mb-3">
            ✅ Credit Note {lastCN.credit_note_no} issued · ₹{lastCN.total_credit.toFixed(2)} credited
          </div>
        )}
        <div className="flex gap-1 mb-2">
          {(['today','yesterday','week','all'] as const).map(f => (
            <button key={f} onClick={() => setDateFilter(f)}
              className={`text-xs px-2 py-1 rounded capitalize ${dateFilter===f ? 'bg-brand-700 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}>
              {f}
            </button>
          ))}
        </div>
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {bills
            .filter(b => {
              if (dateFilter === 'all') return true
              const today = new Date().toISOString().split('T')[0]
              const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
              const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
              if (dateFilter === 'today') return b.date === today
              if (dateFilter === 'yesterday') return b.date === yesterday
              if (dateFilter === 'week') return b.date >= weekAgo
              return true
            })
            .filter(b => !billSearch || b.invoice_no.toLowerCase().includes(billSearch.toLowerCase()) ||
              (b.customer_snapshot?.name || '').toLowerCase().includes(billSearch.toLowerCase()))
            .map(bill => (
              <div key={bill.id} className="flex items-center justify-between bg-slate-900 rounded px-3 py-2">
                <div>
                  <div className="text-sm font-medium text-white">{bill.invoice_no}</div>
                  <div className="text-xs text-slate-400">
                    {bill.customer_snapshot?.name || 'Walk-in'} · {bill.date} · ₹{bill.total.toFixed(0)}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => { setPrintBill(bill); setTimeout(() => handlePrint(), 100) }}
                    className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded"
                  >
                    🖨 Print
                  </button>
                  <button onClick={() => { setLastCN(null); setReturnBill(bill) }}
                    className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded">
                    ↩ Return
                  </button>
                </div>
              </div>
            ))
          }
        </div>
      </div>
      <div className="hidden">
        {printBill && <BillReceipt ref={printRef} bill={printBill} />}
      </div>
      {returnBill && (
        <ReturnModal
          bill={returnBill}
          onClose={() => setReturnBill(null)}
          onSuccess={(cn) => { setLastCN(cn); setReturnBill(null); setBills(getRecentBills(100)) }}
        />
      )}
    </div>
  )
}
