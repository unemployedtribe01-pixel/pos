import { useState, useEffect, useRef, useCallback } from 'react'
import { searchProducts } from '../db/queries/products'
import { Product } from '../types'
import { useBillStore } from '../store/useBillStore'
import CartPanel from '../components/sell/CartPanel'
import PaymentPanel from '../components/sell/PaymentPanel'
import Fuse from 'fuse.js'

export default function SellPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const { addToCart, draft, holdCurrentBill, retrieveHeldBill, deleteHeldBill, heldBills } = useBillStore()

  useEffect(() => { searchRef.current?.focus() }, [])

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const raw = searchProducts(query, 30)
    const fuse = new Fuse(raw, {
      keys: [{ name:'name', weight:0.4 }, { name:'brand', weight:0.3 }, { name:'variant', weight:0.2 }, { name:'aliases', weight:0.1 }],
      threshold: 0.45,
    })
    setResults(query.length >= 2 ? fuse.search(query).map(r => r.item) : raw)
    setSelectedIndex(0)
  }, [query])

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i+1, results.length-1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i-1, 0)) }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (results[selectedIndex]) { addToCart(results[selectedIndex]); setQuery(''); setResults([]) }
    }
    if (e.key === 'Escape') { setQuery(''); setResults([]) }
    if (e.key === 'F7') { e.preventDefault(); holdCurrentBill() }
  }, [results, selectedIndex, addToCart, holdCurrentBill])

  return (
    <div className="flex h-screen">
      <div className="w-[30%] border-r border-slate-800 flex flex-col bg-slate-900">
        <div className="p-3 border-b border-slate-800">
          <input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Type to search: ultr, amb, 1inch cpvc..."
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            autoComplete="off" />
          {query && <div className="mt-1 text-xs text-slate-500">{results.length} results · ↑↓ navigate · Enter add</div>}
        </div>

        {(draft.cart.length > 0 || heldBills.length > 0) && (
          <div className="flex flex-wrap gap-1 px-3 py-1.5 border-b border-slate-800 bg-slate-950">
            {draft.cart.length > 0 && (
              <button onClick={holdCurrentBill}
                className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded">
                ⏸ Hold (F7)
              </button>
            )}
            {heldBills.map((held, i) => (
              <div key={i} className="flex items-center gap-0.5">
                <button onClick={() => retrieveHeldBill(i)}
                  className="text-xs px-2 py-1 bg-amber-900 hover:bg-amber-800 text-amber-200 rounded">
                  📋 Bill {i+1} ({held.cart.length}) {held.customer ? `· ${held.customer.name}` : ''}
                </button>
                <button onClick={() => deleteHeldBill(i)} className="text-xs text-slate-500 hover:text-red-400">✕</button>
              </div>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {results.map((p, i) => (
            <div key={p.id} onClick={() => { addToCart(p); setQuery(''); setResults([]) }}
              className={`px-3 py-2.5 border-b border-slate-800 cursor-pointer transition-colors
                ${i===selectedIndex ? 'bg-brand-900 border-l-2 border-l-brand-500' : 'hover:bg-slate-800'}`}>
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-sm font-medium text-white">{p.brand} {p.name}</div>
                  <div className="text-xs text-slate-400">{p.variant} · {p.unit}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-brand-400">₹{p.mrp}</div>
                  <div className={`text-xs ${p.stock_qty<=p.low_stock_threshold?'text-red-400':'text-slate-500'}`}>{p.stock_qty} left</div>
                </div>
              </div>
            </div>
          ))}
          {!query && (
            <div className="p-4 text-center text-slate-600 text-sm mt-8">
              <div className="text-3xl mb-2">🔍</div>Start typing to search
            </div>
          )}
        </div>
      </div>
      <CartPanel />
      <PaymentPanel />
    </div>
  )
}
