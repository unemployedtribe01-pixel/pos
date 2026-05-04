import { useState, useEffect } from 'react'
import { getAllCustomerCreditSummaries, CustomerCreditSummary, getLedgerForCustomer, recordCreditPayment, generateWhatsAppStatement } from '../db/queries/credit'
import { LedgerEntry, PaymentMode } from '../types'

export default function CreditPage() {
  const [summaries, setSummaries] = useState<CustomerCreditSummary[]>([])
  const [selected, setSelected] = useState<CustomerCreditSummary | null>(null)
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [payAmount, setPayAmount] = useState('')
  const [payMode, setPayMode] = useState<PaymentMode>('cash')
  const [payRef, setPayRef] = useState('')
  const [payNotes, setPayNotes] = useState('')
  const [msg, setMsg] = useState('')
  const [previewMsg, setPreviewMsg] = useState<{msg: string; phone: string} | null>(null)

  const reload = () => {
    const s = getAllCustomerCreditSummaries()
    setSummaries(s)
    if (selected) {
      const updated = s.find(x => x.customerId === selected.customerId)
      if (updated) { setSelected(updated); setLedger(getLedgerForCustomer(updated.customerId)) }
      else { setSelected(null); setLedger([]) }
    }
  }

  useEffect(() => { reload() }, [])

  function selectCustomer(s: CustomerCreditSummary) {
    setSelected(s)
    setLedger(getLedgerForCustomer(s.customerId))
  }

  function receivePayment() {
    if (!selected) return
    const amt = parseFloat(payAmount)
    if (isNaN(amt) || amt <= 0) { alert('Enter a valid amount'); return }
    if (amt > selected.balance + 0.01) {
      if (!confirm(`Payment ₹${amt} exceeds balance ₹${selected.balance.toFixed(2)}. Record as advance?`)) return
    }
    try {
      recordCreditPayment(selected.customerId, amt, payMode, payRef, payNotes)
      setPayAmount(''); setPayRef(''); setPayNotes('')
      setMsg(`✅ ₹${amt} recorded`)
      reload()
      setTimeout(() => setMsg(''), 3000)
    } catch (err: any) { alert('Error: ' + err.message) }
  }

  function sendWhatsApp(s: CustomerCreditSummary) {
    if (!s.phone) { alert('No phone number for this customer. Add it in the Customers page.'); return }
    const msg = generateWhatsAppStatement(
      s.customerId, s.customerName, s.phone,
      'Shri Hardware Store', '9800000000'
    )
    setPreviewMsg({ msg, phone: s.phone })
  }

  function confirmSendWhatsApp() {
    if (!previewMsg) return
    const clean = previewMsg.phone.replace(/\D/g, '')
    const url = `https://wa.me/91${clean}?text=${encodeURIComponent(previewMsg.msg)}`
    window.open(url, '_blank')
    setPreviewMsg(null)
  }

  return (
    <div className="flex h-screen">
      <div className="w-[35%] border-r border-slate-800 flex flex-col bg-slate-900">
        <div className="px-4 py-3 border-b border-slate-800">
          <h2 className="text-base font-bold text-white">Udhaar Outstanding</h2>
          <div className="text-xs text-slate-500 mt-0.5">
            {summaries.length} customers · ₹{summaries.reduce((s,x)=>s+x.balance,0).toFixed(0)} total
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {summaries.length === 0 && (
            <div className="p-6 text-center text-slate-600"><div className="text-4xl mb-2">📒</div><div className="text-sm">No outstanding balances</div></div>
          )}
          {summaries.map(s => (
            <div key={s.customerId} onClick={() => selectCustomer(s)}
              className={`px-4 py-3 border-b border-slate-800 cursor-pointer hover:bg-slate-800 transition-colors
                ${selected?.customerId===s.customerId?'bg-slate-800 border-l-2 border-l-brand-500':''}`}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-sm font-semibold text-white">{s.customerName}</div>
                  <div className="text-xs text-slate-400">{s.phone}</div>
                  <div className="text-xs text-slate-500 mt-0.5">Last: {s.lastActivityDate}</div>
                </div>
                <div className="text-right">
                  <div className="text-base font-bold text-red-400">₹{s.balance.toFixed(0)}</div>
                  {s.overdueFlag && <div className="text-xs bg-red-900 text-red-300 px-1.5 py-0.5 rounded mt-1">Overdue 30d+</div>}
                  <button
                    onClick={e => { e.stopPropagation(); sendWhatsApp(s) }}
                    className="text-xs px-2 py-1 bg-green-900 hover:bg-green-800 text-green-300 rounded mt-1 w-full text-left"
                    title="Send WhatsApp statement"
                  >
                    📱 WhatsApp
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selected ? (
        <div className="flex-1 flex flex-col">
          <div className="px-5 py-3 border-b border-slate-800 bg-slate-900 flex justify-between items-center">
            <div>
              <div className="text-base font-bold text-white">{selected.customerName}</div>
              <div className="text-xs text-slate-400">{selected.phone}</div>
            </div>
            <div className="text-2xl font-bold text-red-400">
              ₹{selected.balance.toFixed(2)}
              <div className="text-xs font-normal text-slate-500 text-right">Outstanding</div>
            </div>
          </div>
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900">
                  <tr className="text-xs text-slate-500 border-b border-slate-800">
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-left">Details</th>
                    <th className="px-4 py-2 text-right">Debit</th>
                    <th className="px-4 py-2 text-right">Credit</th>
                    <th className="px-4 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map(entry => (
                    <tr key={entry.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                      <td className="px-4 py-2 text-slate-400 text-xs whitespace-nowrap">{entry.date}</td>
                      <td className="px-4 py-2">
                        <div className="text-white text-xs">{entry.notes}</div>
                        <div className="text-slate-500 text-[10px] capitalize">{entry.ref_type}</div>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {entry.type==='debit' && <span className="text-red-400 font-semibold">₹{entry.amount.toFixed(2)}</span>}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {entry.type==='credit' && <span className="text-green-400 font-semibold">₹{entry.amount.toFixed(2)}</span>}
                      </td>
                      <td className={`px-4 py-2 text-right font-bold ${entry.balance_after>0?'text-red-400':'text-green-400'}`}>
                        ₹{entry.balance_after.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {ledger.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500 text-sm">No ledger entries yet</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="w-56 border-l border-slate-800 p-4 flex flex-col gap-3 bg-slate-950 shrink-0">
              <div className="text-sm font-bold text-white">Receive Payment</div>
              {msg && <div className="text-xs text-green-400 bg-green-900/30 rounded px-2 py-1">{msg}</div>}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Amount (₹)</label>
                <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                  placeholder={selected.balance.toFixed(2)}
                  className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-brand-500"
                  onKeyDown={e => { if (e.key==='Enter') receivePayment() }} />
                <button onClick={() => setPayAmount(selected.balance.toFixed(2))}
                  className="text-xs text-brand-400 hover:text-brand-300 text-left mt-0.5">
                  Full: ₹{selected.balance.toFixed(2)}
                </button>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Mode</label>
                <div className="grid grid-cols-3 gap-1">
                  {(['cash','upi','card'] as PaymentMode[]).map(m => (
                    <button key={m} onClick={() => setPayMode(m)}
                      className={`py-1.5 rounded text-xs font-semibold capitalize ${payMode===m?'bg-brand-700 text-white':'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              {payMode==='upi' && (
                <input value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="UPI Ref No."
                  className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-brand-500" />
              )}
              <input value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="Notes (optional)"
                className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-brand-500" />
              <button onClick={receivePayment}
                className="w-full py-2.5 bg-green-700 hover:bg-green-600 text-white font-bold rounded text-sm">
                Record Payment
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
          <div className="text-5xl mb-3">📒</div>
          <div className="text-sm">Select a customer to view their ledger</div>
        </div>
      )}
      {previewMsg && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center" onClick={() => setPreviewMsg(null)}>
          <div className="bg-slate-800 rounded-xl p-5 w-[420px] border border-slate-700" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-white">Preview — WhatsApp Statement</h3>
              <button onClick={() => setPreviewMsg(null)} className="text-slate-400 hover:text-white text-xs">✕</button>
            </div>
            <div className="bg-slate-900 rounded-lg p-3 text-xs text-slate-300 font-mono whitespace-pre-wrap max-h-64 overflow-y-auto mb-4 leading-relaxed">
              {previewMsg.msg}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPreviewMsg(null)}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm">
                Cancel
              </button>
              <button onClick={confirmSendWhatsApp}
                className="px-4 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded text-sm font-semibold">
                Open WhatsApp →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
