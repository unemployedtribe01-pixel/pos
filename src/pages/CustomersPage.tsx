import { useState, useEffect, useRef } from 'react'
import { getAllCustomers, searchCustomers, upsertCustomer, getCustomerBalance } from '../db/queries/customers'
import { Customer, CustomerType } from '../types'
import { generateId } from '../db'

const EMPTY: Omit<Customer, 'created_at'> = { id:'', name:'', phone:'', type:'retail', gstin:'', address:'', credit_limit:0, credit_days:30, opening_balance:0 }

const TYPE_COLORS: Record<CustomerType, string> = {
  retail: 'bg-slate-700 text-slate-300',
  contractor: 'bg-blue-900 text-blue-300',
  wholesale: 'bg-purple-900 text-purple-300',
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [query, setQuery] = useState('')
  const [form, setForm] = useState({ ...EMPTY })
  const [editing, setEditing] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const reload = () => setCustomers(query ? searchCustomers(query, 50) : getAllCustomers())
  useEffect(() => { reload() }, [query])
  useEffect(() => { searchRef.current?.focus(); reload() }, [])

  function select(c: Customer) { setForm({ ...c }); setEditing(true) }
  function newForm() { setForm({ ...EMPTY, id: generateId() }); setEditing(false) }

  function save() {
    if (!form.name.trim() || !form.phone.trim()) { alert('Name and Phone are required'); return }
    upsertCustomer(form)
    reload()
    newForm()
  }

  return (
    <div className="flex h-screen">
      <div className="w-2/5 border-r border-slate-800 flex flex-col">
        <div className="p-3 border-b border-slate-800 flex gap-2">
          <input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search by name or phone..."
            className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500" />
          <button onClick={newForm} className="px-3 py-1.5 bg-brand-700 text-white text-sm rounded hover:bg-brand-500">+ New</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {customers.map(c => {
            const balance = getCustomerBalance(c.id)
            return (
              <div key={c.id} onClick={() => select(c)}
                className={`px-3 py-2.5 border-b border-slate-800 cursor-pointer hover:bg-slate-800 ${form.id===c.id?'bg-slate-800':''}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm font-medium text-white">{c.name}</div>
                    <div className="text-xs text-slate-400">{c.phone}</div>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${TYPE_COLORS[c.type]}`}>{c.type}</span>
                    {balance > 0 && <div className="text-xs text-red-400 mt-1">₹{balance.toFixed(0)} due</div>}
                    {balance === 0 && <div className="text-xs text-slate-600 mt-1">Clear</div>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex-1 p-5 overflow-y-auto">
        <h2 className="text-lg font-bold text-white mb-4">{editing ? 'Edit Customer' : 'New Customer'}</h2>
        <div className="grid grid-cols-2 gap-3">
          {(['name','phone','address','gstin'] as const).map(k => (
            <div key={k} className={`flex flex-col gap-1 ${k==='address'?'col-span-2':''}`}>
              <label className="text-xs text-slate-400 font-medium">{k==='gstin'?'GSTIN (optional)':k+' *'}</label>
              <input value={form[k]} onChange={e => setForm(f => ({...f,[k]:e.target.value}))}
                className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500" />
            </div>
          ))}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400 font-medium">Customer Type</label>
            <select value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value as CustomerType}))}
              className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500">
              <option value="retail">Retail</option>
              <option value="contractor">Contractor</option>
              <option value="wholesale">Wholesale</option>
            </select>
          </div>
          {(['credit_limit','credit_days','opening_balance'] as const).map(k => (
            <div key={k} className="flex flex-col gap-1">
              <label className="text-xs text-slate-400 font-medium">
                {k==='credit_limit'?'Credit Limit ₹':k==='credit_days'?'Credit Days':'Opening Balance ₹'}
              </label>
              <input type="number" value={form[k]} onChange={e => setForm(f => ({...f,[k]:parseFloat(e.target.value)||0}))}
                className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500" />
            </div>
          ))}
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={save} className="px-5 py-2 bg-brand-700 hover:bg-brand-500 text-white font-semibold rounded">
            {editing ? 'Update' : 'Save Customer'}
          </button>
          {editing && <button onClick={newForm} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm">Clear</button>}
        </div>
      </div>
    </div>
  )
}
