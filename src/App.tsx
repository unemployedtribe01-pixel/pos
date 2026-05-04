import { BrowserRouter, Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import SellPage from './pages/SellPage'
import ProductsPage from './pages/ProductsPage'
import CustomersPage from './pages/CustomersPage'
import CreditPage from './pages/CreditPage'
import ReportsPage from './pages/ReportsPage'
import SyncStatus from './components/shared/SyncStatus'
import KeyboardHelp from './components/shared/KeyboardHelp'

function AppShell() {
  const navigate = useNavigate()
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const active = document.activeElement?.tagName
      if (active === 'INPUT' || active === 'TEXTAREA' || active === 'SELECT') return
      if (e.key === 'F1') { e.preventDefault(); navigate('/') }
      if (e.key === 'F2') { e.preventDefault(); navigate('/products') }
      if (e.key === 'F3') { e.preventDefault(); navigate('/customers') }
      if (e.key === 'F4') { e.preventDefault(); navigate('/credit') }
      if (e.key === 'F5') { e.preventDefault(); navigate('/reports') }
      if (e.key === 'F8') { e.preventDefault(); setShowHelp(h => !h) }
      if (e.key === 'Escape') { setShowHelp(false) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate, setShowHelp])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-900">
      <aside className="w-16 flex flex-col items-center py-4 bg-slate-950 border-r border-slate-800 gap-1 shrink-0">
        <div className="text-brand-500 font-bold text-xs mb-4 text-center leading-tight">POS</div>
        {[
          { to: '/', label: 'Sell', icon: '🏪', shortcut: 'F1' },
          { to: '/products', label: 'Items', icon: '📦', shortcut: 'F2' },
          { to: '/customers', label: 'Customers', icon: '👤', shortcut: 'F3' },
          { to: '/credit', label: 'Udhaar', icon: '📒', shortcut: 'F4' },
          { to: '/reports', label: 'Reports', icon: '📊', shortcut: 'F5' },
        ].map(({ to, label, icon, shortcut }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `w-12 h-12 flex flex-col items-center justify-center rounded-lg text-xs transition-colors cursor-pointer
              ${isActive ? 'bg-brand-700 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`
            }
            title={`${label} (${shortcut})`}
          >
            <span className="text-lg leading-none">{icon}</span>
            <span className="text-[10px] mt-0.5">{label}</span>
          </NavLink>
        ))}
        <div className="flex-1" />
        <button onClick={() => setShowHelp(true)} title="Keyboard shortcuts (F8)"
          className="w-8 h-8 flex items-center justify-center text-slate-600 hover:text-slate-400 text-sm mb-1 rounded hover:bg-slate-800">
          ?
        </button>
        <SyncStatus />
      </aside>
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<SellPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/credit" element={<CreditPage />} />
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </main>
      {showHelp && <KeyboardHelp onClose={() => setShowHelp(false)} />}
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppShell />
    </BrowserRouter>
  )
}
