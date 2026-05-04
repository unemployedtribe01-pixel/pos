import { useState, useEffect, useRef } from 'react'
import { getAllProducts, searchProducts, upsertProduct } from '../db/queries/products'
import { Product } from '../types'
import { generateId } from '../db'
import ProductImportModal from '../components/products/ProductImportModal'

const EMPTY_FORM: Omit<Product, 'created_at'|'updated_at'> = {
  id:'', name:'', category:'cement', brand:'', variant:'',
  hsn_code:'2523', gst_rate:18, mrp:0, cost_price:0,
  unit:'bag', stock_qty:0, low_stock_threshold:5, aliases:'', price_inclusive:false, is_active:true,
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [query, setQuery] = useState('')
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [editing, setEditing] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const VALID_GST_RATES = [0, 5, 12, 18, 28]

  const HSN_SUGGESTIONS: Record<string, { hsn: string; rate: number; name: string }[]> = {
    cement: [
      { hsn: '2523', rate: 18, name: 'Portland Cement / PPC / OPC (post Sept 2025)' },
      { hsn: '2521', rate: 5, name: 'Limestone (if sold separately)' },
    ],
    paint: [
      { hsn: '3209', rate: 18, name: 'Emulsion / Exterior Paint (water-based)' },
      { hsn: '3208', rate: 18, name: 'Enamel / Oil-based Paint' },
      { hsn: '3214', rate: 18, name: 'Putty / Fillers / Sealants' },
    ],
    pipe: [
      { hsn: '3917', rate: 18, name: 'CPVC / PVC / UPVC Pipes & Fittings' },
      { hsn: '7307', rate: 18, name: 'GI / Metal Pipe Fittings' },
    ],
    electrical: [
      { hsn: '8544', rate: 18, name: 'Wires / Cables (insulated)' },
      { hsn: '8536', rate: 18, name: 'Switches / Sockets / MCBs' },
      { hsn: '8539', rate: 12, name: 'LED Bulbs / Light Sources' },
    ],
    hardware: [
      { hsn: '8302', rate: 18, name: 'Hinges / Locks / Door Hardware' },
      { hsn: '7318', rate: 18, name: 'Screws / Bolts / Nuts / Washers' },
      { hsn: '7317', rate: 18, name: 'Nails / Iron Pins' },
      { hsn: '6809', rate: 18, name: 'POP / Plaster of Paris' },
    ],
    other: [
      { hsn: '3506', rate: 18, name: 'Adhesives (Fevicol, etc.)' },
      { hsn: '9965', rate: 18, name: 'Transport / Delivery Services' },
    ],
  }

  const reload = () => setProducts(query ? searchProducts(query, 50) : getAllProducts())
  useEffect(() => { reload() }, [query])
  useEffect(() => { searchRef.current?.focus(); reload() }, [])

  function selectProduct(p: Product) { setForm({ ...p }); setEditing(true) }
  function newProduct() { setForm({ ...EMPTY_FORM, id: generateId() }); setEditing(false) }

  function validateProduct(f: typeof form): string | null {
    if (!f.name.trim()) return 'Name is required'
    if (!f.brand.trim()) return 'Brand is required'
    if (f.mrp <= 0) return 'MRP must be greater than 0'
    if (!VALID_GST_RATES.includes(f.gst_rate)) return `GST rate must be one of: ${VALID_GST_RATES.join(', ')}%`
    if (!f.hsn_code.trim()) return 'HSN code is required'
    if (f.hsn_code.replace(/\D/g,'').length < 4) return 'HSN code must be at least 4 digits'
    if (f.category === 'cement' && f.hsn_code !== '2523') {
      return 'Cement HSN code must be 2523 (Portland cement, OPC, PPC, PSC)'
    }
    if (f.category === 'cement' && f.gst_rate !== 18) {
      return 'Cement GST rate is 18% (reduced from 28% effective Sept 2025)'
    }
    return null
  }

  function save() {
    const error = validateProduct(form)
    if (error) { alert(error); return }
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
          <button onClick={() => setShowImport(true)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded">⬆ Import Excel</button>
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
          ] as const).map(({ label, key, type }) => (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-xs text-slate-400 font-medium">{label}</label>
              <input type={type} value={form[key] as string|number}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500" />
            </div>
          ))}
          {HSN_SUGGESTIONS[form.category] && (
            <div className="flex flex-col gap-1 col-span-2">
              <div className="text-xs text-slate-500 mb-1">HSN Suggestions for {form.category}:</div>
              <div className="flex flex-wrap gap-1">
                {HSN_SUGGESTIONS[form.category].map(s => (
                  <button
                    key={s.hsn}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, hsn_code: s.hsn, gst_rate: s.rate }))}
                    className={`text-xs px-2 py-1 rounded border transition-colors
                      ${form.hsn_code === s.hsn
                        ? 'bg-brand-700 text-white border-brand-500'
                        : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600'}`}
                    title={s.name}
                  >
                    {s.hsn} ({s.rate}%) — {s.name.substring(0, 25)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {([
            { label:'GST Rate %', key:'gst_rate', type:'number' },
            { label:'MRP (₹) *', key:'mrp', type:'number' },
            { label:'Cost Price (₹)', key:'cost_price', type:'number' },
            { label:'Stock Qty', key:'stock_qty', type:'number' },
            { label:'Low Stock Alert', key:'low_stock_threshold', type:'number' },
          ] as const).map(({ label, key, type }) => (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-xs text-slate-400 font-medium">{label}</label>
              <input type={type} value={form[key] as string|number}
                onChange={e => setForm(f => ({ ...f, [key]: parseFloat(e.target.value)||0 }))}
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
          <div className="flex items-center gap-2 mt-2">
            <input
              type="checkbox"
              id="price_inclusive"
              checked={form.price_inclusive}
              onChange={e => setForm(f => ({ ...f, price_inclusive: e.target.checked }))}
              className="w-4 h-4 accent-brand-500"
            />
            <label htmlFor="price_inclusive" className="text-xs text-slate-400">
              MRP includes GST (back-calculate taxable value on entry)
            </label>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={save} className="px-5 py-2 bg-brand-700 hover:bg-brand-500 text-white font-semibold rounded">
            {editing ? 'Update' : 'Save Product'}
          </button>
          {editing && <button onClick={newProduct} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm">Clear</button>}
        </div>
      </div>
      {showImport && <ProductImportModal onClose={() => setShowImport(false)} onImportComplete={(c, u) => { reload(); setShowImport(false); alert(`Imported: ${c} added, ${u} updated`) }} />}
    </div>
  )
}
