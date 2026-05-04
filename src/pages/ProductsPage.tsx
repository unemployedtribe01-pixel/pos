import { useState, useEffect, useRef } from 'react'
import { getAllProducts, searchProducts, upsertProduct } from '../db/queries/products'
import { Product } from '../types'
import { generateId } from '../db'

const EMPTY_FORM: Omit<Product, 'created_at'|'updated_at'> = {
  id:'', name:'', category:'cement', brand:'', variant:'',
  hsn_code:'2523', gst_rate:18, mrp:0, cost_price:0,
  unit:'bag', stock_qty:0, low_stock_threshold:5, aliases:'', is_active:true,
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [query, setQuery] = useState('')
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [editing, setEditing] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const reload = () => setProducts(query ? searchProducts(query, 50) : getAllProducts())
  useEffect(() => { reload() }, [query])
  useEffect(() => { searchRef.current?.focus(); reload() }, [])

  function selectProduct(p: Product) { setForm({ ...p }); setEditing(true) }
  function newProduct() { setForm({ ...EMPTY_FORM, id: generateId() }); setEditing(false) }

  function save() {
    if (!form.name.trim() || !form.brand.trim() || form.mrp <= 0) {
      alert('Name, Brand, and MRP are required'); return
    }
    upsertProduct(form)
    reload()
    newProduct()
  }

  return (
    <div className="flex h-screen">
      <div className="w-2/5 border-r border-slate-800 flex flex-col">
        <div className="p-3 border-b border-slate-800 flex gap-2">
          <input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search products..."
            className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500" />
          <button onClick={newProduct} className="px-3 py-1.5 bg-brand-700 text-white text-sm rounded hover:bg-brand-500">+ New</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {products.map(p => (
            <div key={p.id} onClick={() => selectProduct(p)}
              className={`px-3 py-2.5 border-b border-slate-800 cursor-pointer hover:bg-slate-800 ${form.id===p.id?'bg-slate-800':''}`}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-sm font-medium text-white">{p.brand} — {p.name}</div>
                  <div className="text-xs text-slate-400">{p.variant} · {p.unit}</div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <div className="text-sm font-semibold text-brand-400">₹{p.mrp}</div>
                  <div className={`text-xs ${p.stock_qty<=p.low_stock_threshold?'text-red-400':'text-slate-500'}`}>{p.stock_qty} {p.unit}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 p-5 overflow-y-auto">
        <h2 className="text-lg font-bold text-white mb-4">{editing ? 'Edit Product' : 'New Product'}</h2>
        <div className="grid grid-cols-2 gap-3">
          {([
            { label:'Name *', key:'name', type:'text' },
            { label:'Brand *', key:'brand', type:'text' },
            { label:'Variant (e.g. OPC 53 50kg)', key:'variant', type:'text' },
            { label:'HSN Code', key:'hsn_code', type:'text' },
            { label:'GST Rate %', key:'gst_rate', type:'number' },
            { label:'MRP (₹) *', key:'mrp', type:'number' },
            { label:'Cost Price (₹)', key:'cost_price', type:'number' },
            { label:'Stock Qty', key:'stock_qty', type:'number' },
            { label:'Low Stock Alert', key:'low_stock_threshold', type:'number' },
          ] as const).map(({ label, key, type }) => (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-xs text-slate-400 font-medium">{label}</label>
              <input type={type} value={form[key] as string|number}
                onChange={e => setForm(f => ({ ...f, [key]: type==='number' ? parseFloat(e.target.value)||0 : e.target.value }))}
                className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500" />
            </div>
          ))}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400 font-medium">Category</label>
            <select value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value as Product['category']}))}
              className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500">
              {['cement','paint','pipe','electrical','hardware','other'].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400 font-medium">Unit</label>
            <select value={form.unit} onChange={e => setForm(f => ({...f, unit: e.target.value}))}
              className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500">
              {['bag','kg','piece','metre','litre','coil','tin','pair','packet','trip'].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-col gap-1 mt-3">
          <label className="text-xs text-slate-400 font-medium">Search Aliases (comma-separated)</label>
          <input value={form.aliases} onChange={e => setForm(f => ({...f, aliases: e.target.value}))}
            placeholder="e.g. ultra,ultr,opc53"
            className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500" />
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={save} className="px-5 py-2 bg-brand-700 hover:bg-brand-500 text-white font-semibold rounded">
            {editing ? 'Update' : 'Save Product'}
          </button>
          {editing && <button onClick={newProduct} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm">Clear</button>}
        </div>
      </div>
    </div>
  )
}
