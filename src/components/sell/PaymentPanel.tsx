import { useState, useEffect, useRef, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useReactToPrint } from 'react-to-print'
import { useBillStore } from '../../store/useBillStore'
import { computeCartTotals } from '../../utils/billing'
import { searchCustomers } from '../../db/queries/customers'
import { Customer, PaymentMode, Bill } from '../../types'
import { confirmBill, getBillById } from '../../db/queries/bills'
import { getCustomerCreditStatus, CustomerCreditStatus } from '../../db/queries/credit'
import BillReceipt from './BillReceipt'

const PAYMENT_MODES: { mode: PaymentMode; label: string }[] = [
  { mode:'cash', label:'Cash' }, { mode:'upi', label:'UPI' },
  { mode:'card', label:'Card' }, { mode:'credit', label:'Udhaar' },
]

export default function PaymentPanel() {
  const { draft, setCustomer, addPayment, removePayment, clearBill, recalculateCartPrices } = useBillStore()
  const { cart, customer, payments, rounding, bill_discount_pct } = draft
  const totals = computeCartTotals(cart, payments, rounding, customer?.gstin, bill_discount_pct)
  const [custQuery, setCustQuery] = useState('')
  const [custResults, setCustResults] = useState<Customer[]>([])
  const [showCustSearch, setShowCustSearch] = useState(false)
  const [payMode, setPayMode] = useState<PaymentMode>('cash')
  const [payAmount, setPayAmount] = useState('')
  const [payRef, setPayRef] = useState('')
  const [creditStatus, setCreditStatus] = useState<CustomerCreditStatus | null>(null)
  const [billConfirmed, setBillConfirmed] = useState(false)
  const [confirmedBill, setConfirmedBill] = useState<Bill | null>(null)
  const [amountFocused, setAmountFocused] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const printRef = useRef<HTMLDivElement>(null)
  const amountInputRef = useRef<HTMLInputElement>(null)
  const handlePrint = useReactToPrint({ contentRef: printRef })

  useEffect(() => {
    if (customer) {
      setCreditStatus(getCustomerCreditStatus(customer.id))
    } else {
      setCreditStatus(null)
    }
  }, [customer])
  useEffect(() => {
    if (!custQuery.trim()) { setCustResults([]); return }
    setCustResults(searchCustomers(custQuery, 8))
  }, [custQuery])
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only fire when no input is focused OR when F9 is pressed
      if (e.key === 'F9') {
        e.preventDefault()
        amountInputRef.current?.focus()
        // Auto-fill balance if amount is empty
        if (!payAmount) setPayAmount(totals.balance > 0 ? totals.balance.toFixed(2) : '')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [totals.balance, payAmount])

  function selectCustomer(c: Customer) {
    setCustomer(c)
    setCustQuery(c.name)
    setShowCustSearch(false)
    setCustResults([])
    recalculateCartPrices()  // ADD THIS
  }
  function clearCustomer() { setCustomer(null); setCustQuery('') }

  function addPaymentEntry() {
    const amount = parseFloat(payAmount)
    if (isNaN(amount) || amount <= 0) return
    addPayment({ mode: payMode, amount, ref_no: payRef })
    setPayAmount(''); setPayRef('')
  }

  function handleAmountKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    // Mode selection — single key when amount field is focused
    if (e.key === 'c' || e.key === 'C') { e.preventDefault(); setPayMode('cash'); setPayAmount(totals.balance > 0 ? totals.balance.toFixed(2) : '') }
    if (e.key === 'u' || e.key === 'U') { e.preventDefault(); setPayMode('upi'); setPayAmount(totals.balance > 0 ? totals.balance.toFixed(2) : '') }
    if (e.key === 'h' || e.key === 'H') { e.preventDefault(); setPayMode('credit'); setPayAmount(totals.balance > 0 ? totals.balance.toFixed(2) : '') }
    if (e.key === 'd' || e.key === 'D') { e.preventDefault(); setPayMode('card'); setPayAmount(totals.balance > 0 ? totals.balance.toFixed(2) : '') }

    // Enter: add payment if amount > 0, then if balance is 0 after adding, auto-confirm
    if (e.key === 'Enter') {
      e.preventDefault()
      const amount = parseFloat(payAmount)
      if (amount > 0) {
        addPayment({ mode: payMode, amount, ref_no: payRef })
        setPayAmount('')
        setPayRef('')
        // Check if bill is now fully paid
        const newBalance = totals.balance - amount
        if (newBalance <= 0.01 && cart.length > 0) {
          // Auto-confirm after 100ms (gives Zustand time to update)
          setTimeout(() => {
            try {
              const billId = confirmBill(useBillStore.getState().draft)
              setConfirmedBill(getBillById(billId))
              setBillConfirmed(true)
            } catch (err: any) { alert('Error: ' + err.message) }
          }, 100)
        }
      } else if (totals.balance <= 0.01 && cart.length > 0) {
        // Balance already zero, Enter confirms
        handleConfirm()
      }
    }

    // Escape: return focus to sell screen search
    if (e.key === 'Escape') {
      e.preventDefault()
      // Find and focus the sell screen search input
      const searchInput = document.querySelector('input[placeholder*="Type to search"]') as HTMLInputElement
      searchInput?.focus()
    }
  }

  function handleConfirm() {
    if (cart.length === 0) { alert('Cart is empty'); return }
    const custBalance = creditStatus?.balance || 0

    // Prevent confirming if balance > 0 and no credit mode payment added
    if (totals.balance > 0.5) {
      if (!draft.customer) {
        alert(`₹${totals.balance.toFixed(2)} unpaid. Select a customer to add to udhaar, or add more payment.`)
        return
      }
      const proceed = confirm(`₹${totals.balance.toFixed(2)} will be added to udhaar for ${draft.customer.name} (current balance: ₹${custBalance.toFixed(0)}). Proceed?`)
      if (!proceed) return
      // Auto-add the balance as credit payment
      addPayment({ mode: 'credit', amount: totals.balance, ref_no: '' })
      // Let Zustand update, then re-run confirm on next tick
      setTimeout(() => {
        const nextDraft = useBillStore.getState().draft
        const nextTotals = computeCartTotals(
          nextDraft.cart,
          nextDraft.payments,
          nextDraft.rounding,
          nextDraft.customer?.gstin,
          nextDraft.bill_discount_pct
        )
        if (nextTotals.balance <= 0.5) {
          try {
            const billId = confirmBill(nextDraft)
            setConfirmedBill(getBillById(billId))
            setBillConfirmed(true)
          } catch (err: any) { alert('Error: ' + err.message) }
        }
      }, 50)
      return
    }

    // Validate UPI ref numbers
    const upiPayments = draft.payments.filter(p => p.mode === 'upi')
    const missingRef = upiPayments.filter(p => !p.ref_no.trim())
    if (missingRef.length > 0) {
      const proceed = confirm(`${missingRef.length} UPI payment(s) have no reference number. Add ref numbers for reconciliation, or proceed anyway?`)
      if (!proceed) return
    }

    const billId = confirmBill(draft)
    setConfirmedBill(getBillById(billId))
    setBillConfirmed(true)
  }

  if (billConfirmed) {
    return (
      <div className="w-64 bg-slate-950 flex flex-col items-center justify-center border-l border-slate-800 gap-3 p-4">
        <div className="text-5xl">✅</div>
        <div className="text-green-400 font-bold text-lg">Bill Saved!</div>
        <div className="text-slate-400 text-sm text-center">{confirmedBill?.invoice_no}</div>
        <button onClick={handlePrint} className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white rounded font-medium text-sm">🖨 Print Bill</button>
        <button onClick={() => { clearBill(); setBillConfirmed(false); setConfirmedBill(null) }} className="w-full py-2 bg-brand-700 hover:bg-brand-500 text-white rounded font-semibold">New Bill</button>
        {confirmedBill && <div className="hidden"><BillReceipt ref={printRef} bill={confirmedBill} /></div>}
      </div>
    )
  }

  return (
    <div ref={panelRef} className="w-64 bg-slate-950 border-l border-slate-800 flex flex-col text-sm">
      <div className="p-3 border-b border-slate-800">
        <div className="text-xs text-slate-500 mb-1.5 font-semibold uppercase tracking-wide">Customer</div>
        {customer ? (
          <div className="bg-slate-800 rounded-lg px-3 py-2">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-white font-semibold text-sm">{customer.name}</div>
                <div className="text-xs text-slate-400">{customer.phone} · {customer.type}</div>
              </div>
              <button onClick={clearCustomer} className="text-slate-500 hover:text-red-400 text-xs">✕</button>
            </div>

            {creditStatus && creditStatus.balance > 0 && (
              <div className={`mt-2 rounded px-2 py-1.5 text-xs font-medium
                ${creditStatus.isOverdue || creditStatus.isOverLimit
                  ? 'bg-red-900/50 text-red-300 border border-red-700'
                  : 'bg-slate-700 text-slate-300'
                }`}>
                {creditStatus.isOverdue && (
                  <div className="flex items-center gap-1 mb-0.5">
                    <span>⚠</span>
                    <span>₹{creditStatus.balance.toFixed(0)} overdue {creditStatus.daysSinceLastActivity}d</span>
                  </div>
                )}
                {creditStatus.isOverLimit && (
                  <div className="flex items-center gap-1 mb-0.5">
                    <span>⚠</span>
                    <span>Over limit (limit: ₹{creditStatus.creditLimit.toFixed(0)})</span>
                  </div>
                )}
                {!creditStatus.isOverdue && !creditStatus.isOverLimit && (
                  <div className="text-slate-400">Owes: ₹{creditStatus.balance.toFixed(0)}</div>
                )}
              </div>
            )}
            {creditStatus && creditStatus.balance <= 0 && (
              <div className="mt-1 text-xs text-green-500">✓ No balance due</div>
            )}
          </div>
        ) : (
          <div className="relative">
            <input value={custQuery} onChange={e => { setCustQuery(e.target.value); setShowCustSearch(true) }}
              onFocus={() => setShowCustSearch(true)} placeholder="Search customer..."
              className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-white text-sm focus:outline-none focus:border-brand-500" />
            {showCustSearch && custResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 bg-slate-800 border border-slate-700 rounded-b z-10 max-h-40 overflow-y-auto">
                {custResults.map(c => (
                  <div key={c.id} onClick={() => selectCustomer(c)}
                    className="px-3 py-2 hover:bg-slate-700 cursor-pointer border-b border-slate-700 last:border-0">
                    <div className="text-white text-sm">{c.name}</div>
                    <div className="text-xs text-slate-400">{c.phone}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="p-3 border-b border-slate-800 flex-1">
        <div className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wide">Payment</div>
        {amountFocused && (
          <div className="text-[10px] text-slate-500 mb-1.5 bg-slate-800 rounded px-2 py-1">
            C=Cash · U=UPI · H=Udhaar · D=Card · Enter=Add · Esc=Search
          </div>
        )}
        <div className="grid grid-cols-4 gap-1 mb-2">
          {PAYMENT_MODES.map(({ mode, label }) => (
            <button key={mode} onClick={() => setPayMode(mode)}
              className={`py-1.5 rounded text-xs font-semibold transition-colors
                ${payMode===mode ? 'bg-brand-700 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 mb-1.5">
          <input
            ref={amountInputRef}
            type="number"
            value={payAmount}
            onChange={e => setPayAmount(e.target.value)}
            onKeyDown={handleAmountKeyDown}
            onFocus={() => setAmountFocused(true)}
            onBlur={() => setAmountFocused(false)}
            placeholder={`₹${totals.balance > 0 ? totals.balance.toFixed(2) : '0.00'}`}
            className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-brand-500"
          />
          <button onClick={() => setPayAmount(totals.balance.toFixed(2))}
            className="px-2 bg-slate-700 hover:bg-slate-600 text-xs text-slate-300 rounded">All</button>
        </div>
        {payMode === 'upi' && (
          <input value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="UPI ref no."
            className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-brand-500 mb-1.5" />
        )}
        <button onClick={addPaymentEntry} className="w-full py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded">+ Add Payment</button>
        {payments.length > 0 && (
          <div className="mt-2 space-y-1">
            {payments.map((p, i) => (
              <div key={i} className="flex justify-between items-center bg-slate-800 rounded px-2 py-1">
                <span className="text-xs text-slate-400 capitalize">{p.mode}{p.ref_no ? ` (${p.ref_no})` : ''}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">₹{p.amount.toFixed(2)}</span>
                  <button onClick={() => removePayment(i)} className="text-slate-500 hover:text-red-400 text-xs">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-slate-700 space-y-1.5">
        <div className="flex justify-between text-sm text-slate-400"><span>Total</span><span className="text-white font-bold">₹{totals.total.toFixed(2)}</span></div>
        <div className="flex justify-between text-sm"><span className="text-slate-400">Paid</span><span className="text-green-400">₹{totals.amountPaid.toFixed(2)}</span></div>
        {totals.balance > 0.01 && (
          <div className="flex justify-between text-sm">
            <span className="text-red-400">Balance Due</span>
            <span className="text-red-400 font-bold">₹{totals.balance.toFixed(2)}</span>
          </div>
        )}
        {totals.change_due > 0.01 && (
          <div className="flex justify-between text-sm">
            <span className="text-warn">Change to Return</span>
            <span className="text-warn font-bold">₹{totals.change_due.toFixed(2)}</span>
          </div>
        )}
        <button onClick={handleConfirm} disabled={cart.length===0}
          className="w-full py-3 bg-brand-700 hover:bg-brand-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold text-base rounded-lg transition-colors mt-1">
          CONFIRM BILL ⏎
        </button>
      </div>
    </div>
  )
}
