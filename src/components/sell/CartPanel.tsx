import { useState, KeyboardEvent } from 'react'
import { useBillStore } from '../../store/useBillStore'
import { computeCartTotals } from '../../utils/billing'

export default function CartPanel() {
  const { draft, removeFromCart, updateCartQty, updateCartPrice, updateLineDiscountPct, setBillDiscountPct, setRounding } = useBillStore()
  const { cart, customer, payments, rounding, bill_discount_pct } = draft
  const totals = computeCartTotals(cart, payments, rounding, customer?.gstin, bill_discount_pct)
  const [editingPrice, setEditingPrice] = useState<string | null>(null)

  function handleQtyKey(e: KeyboardEvent<HTMLInputElement>, productId: string) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const val = parseFloat((e.target as HTMLInputElement).value)
      if (isNaN(val) || val <= 0) { e.preventDefault(); removeFromCart(productId) }
    }
  }

  if (cart.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-900 text-slate-600">
        <div className="text-5xl mb-3">🛒</div>
        <div className="text-sm">Cart is empty</div>
        <div className="text-xs mt-1">Search and press Enter to add items</div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-900">
      <div className="px-4 py-2.5 border-b border-slate-800 flex justify-between items-center">
        <span className="text-sm font-semibold text-white">Bill Items ({cart.length})</span>
        <span className="text-xs text-slate-500">Click rate to override · Del removes line</span>
      </div>
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-2 px-4 py-1.5 text-xs text-slate-500 border-b border-slate-800">
        <span>Product</span><span className="text-right">MRP</span>
        <span className="text-right">Rate</span><span className="text-right">Disc%</span><span className="text-right">Qty</span>
        <span className="text-right">Total</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {cart.map((item) => {
          const lineTotal = item.qty * item.unit_price
          const isPriceOverridden = item.unit_price !== item.product.mrp
          return (
            <div key={item.product.id}
              className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-2 px-4 py-2 border-b border-slate-800/60 items-center hover:bg-slate-800/40 group">
              <div className="min-w-0">
                <div className="text-sm font-medium text-white truncate">{item.product.brand} {item.product.name}</div>
                <div className="text-xs text-slate-500 truncate">{item.product.variant} · {item.product.unit}</div>
                {item.entered_price_inclusive != null && (
                  <div className="text-[10px] text-slate-500">
                    Incl. GST: ₹{item.entered_price_inclusive} → Taxable: ₹{item.unit_price}
                  </div>
                )}
                <div className="text-xs text-slate-600">HSN {item.product.hsn_code} · GST {item.product.gst_rate}%</div>
              </div>
              <div className="text-right text-sm text-slate-400">₹{item.product.mrp}</div>
              <div className="text-right">
                {editingPrice === item.product.id ? (
                  <input type="number" autoFocus defaultValue={item.unit_price}
                    className="w-20 bg-slate-700 border border-brand-500 rounded px-1 py-0.5 text-sm text-white text-right focus:outline-none"
                    onBlur={e => { updateCartPrice(item.product.id, parseFloat(e.target.value)||0); setEditingPrice(null) }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { updateCartPrice(item.product.id, parseFloat((e.target as HTMLInputElement).value)||0); setEditingPrice(null) }
                      if (e.key === 'Escape') setEditingPrice(null)
                    }} />
                ) : (
                  <button onClick={() => setEditingPrice(item.product.id)}
                    className={`text-sm font-semibold px-1 rounded ${isPriceOverridden ? 'text-warn bg-warn/10' : 'text-brand-400 hover:bg-slate-700'}`}
                    title="Click to override price">
                    ₹{item.unit_price}
                  </button>
                )}
                {item._manualOverride && (
                  <div className="text-[10px] text-warn">manual override</div>
                )}
                {!item._manualOverride && item.unit_price !== item.product.mrp && (
                  <div className="text-[10px] text-blue-400">customer rate</div>
                )}
              </div>
              <div className="text-right">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={item.line_discount_pct || 0}
                  onChange={e => updateLineDiscountPct(item.product.id, parseFloat(e.target.value)||0)}
                  className="w-14 bg-slate-700 border border-slate-600 rounded px-1 py-0.5 text-sm text-white text-right focus:outline-none focus:border-brand-500"
                  placeholder="0"
                />
              </div>
              <div className="text-right">
                <input type="number" value={item.qty} min="0.1" step="1"
                  onChange={e => updateCartQty(item.product.id, parseFloat(e.target.value)||1)}
                  onKeyDown={e => handleQtyKey(e, item.product.id)}
                  className="w-16 bg-slate-700 border border-slate-600 rounded px-1 py-0.5 text-sm text-white text-right focus:outline-none focus:border-brand-500" />
              </div>
              <div className="flex items-center gap-2 justify-end">
                <span className="text-sm font-semibold text-white">₹{lineTotal.toFixed(2)}</span>
                <button onClick={() => removeFromCart(item.product.id)}
                  className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs">✕</button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="border-t border-slate-700 px-4 py-3 bg-slate-950 space-y-1">
        <div className="flex justify-between text-sm text-slate-400">
          <span>Subtotal (taxable)</span><span>₹{totals.subtotal.toFixed(2)}</span>
        </div>
        {totals.bill_discount_amount > 0 && (
          <div className="flex justify-between text-sm text-warn">
            <span>Bill Discount ({bill_discount_pct}%)</span>
            <span>-₹{totals.bill_discount_amount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm text-slate-400">
          <span className="flex items-center gap-2">
            Bill Discount %
            <input
              type="number"
              min="0"
              max="100"
              value={bill_discount_pct}
              onChange={e => setBillDiscountPct(parseFloat(e.target.value)||0)}
              className="w-14 bg-slate-700 border border-slate-600 rounded px-1 py-0.5 text-xs text-white focus:outline-none"
            />
          </span>
          <span className="text-slate-500">applied pre-tax</span>
        </div>
        <div className="flex justify-between text-sm text-slate-400">
          <span>GST</span><span>₹{totals.gst_amount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm text-slate-400">
          <span className="flex items-center gap-2">
            Rounding
            <input type="number" value={rounding} step="0.5"
              onChange={e => setRounding(parseFloat(e.target.value)||0)}
              className="w-16 bg-slate-700 border border-slate-600 rounded px-1 py-0.5 text-xs text-white focus:outline-none" />
          </span>
          <span>{rounding >= 0 ? '+' : ''}₹{rounding}</span>
        </div>
        <div className="flex justify-between text-lg font-bold text-white pt-1 border-t border-slate-700">
          <span>TOTAL</span><span>₹{totals.total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  )
}
