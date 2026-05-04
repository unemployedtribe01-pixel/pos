interface Props { onClose: () => void }
const SHORTCUTS = [
  { key:'F1', action:'Go to Sell screen' },
  { key:'F2', action:'Go to Products' },
  { key:'F3', action:'Go to Customers' },
  { key:'F4', action:'Go to Udhaar' },
  { key:'F5', action:'Go to Reports' },
  { key:'F7', action:'Hold current bill (park)' },
  { key:'F8', action:'This help overlay' },
  { key:'↑ / ↓', action:'Navigate search results' },
  { key:'Enter', action:'Add selected product to cart' },
  { key:'Escape', action:'Clear search / close overlay' },
  { key:'Del in qty field', action:'Remove item from cart' },
  { key:'Click Rate (₹)', action:'Override price for that line' },
  { key:'All button', action:'Fill full balance amount' },
]
export default function KeyboardHelp({ onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-slate-800 rounded-2xl p-6 w-96 border border-slate-700 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-base font-bold text-white">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-sm">✕ Esc</button>
        </div>
        <div className="space-y-1.5">
          {SHORTCUTS.map(({ key, action }) => (
            <div key={key} className="flex items-center py-1 border-b border-slate-700/50">
              <kbd className="bg-slate-700 text-white px-2 py-0.5 rounded text-xs font-mono font-bold min-w-[100px] text-center mr-3">{key}</kbd>
              <span className="text-sm text-slate-300">{action}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 text-xs text-slate-500 text-center">Press F8 or Escape to close</div>
      </div>
    </div>
  )
}
