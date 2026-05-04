import { useState, useEffect } from 'react'
import { isSupabaseConfigured } from '../../sync/client'
import { getPendingSyncItems } from '../../sync/syncQueue'

export default function SyncStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  const [pending, setPending] = useState(0)

  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    const timer = setInterval(() => {
      try { setPending(getPendingSyncItems(1).length) } catch {}
    }, 5000)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      clearInterval(timer)
    }
  }, [])

  if (!isSupabaseConfigured()) return <div title="Offline mode" className="w-3 h-3 rounded-full mb-2 bg-slate-600" />
  const color = !online ? 'bg-warn' : pending > 0 ? 'bg-blue-400 animate-pulse' : 'bg-brand-500'
  const title = !online ? 'Offline' : pending > 0 ? `Syncing (${pending} pending)` : 'Synced'
  return <div title={title} className={`w-3 h-3 rounded-full mb-2 ${color}`} />
}
