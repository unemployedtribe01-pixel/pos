import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import { initDB, startAutoPersist, checkDBHealth } from './db'
import { seedIfEmpty } from './db/seed'
import { startSyncWorker } from './sync/syncQueue'
import { bootstrapFromSupabaseIfLocalEmpty } from './sync/bootstrap'
import ErrorBoundary from './components/shared/ErrorBoundary'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element not found')
const root = ReactDOM.createRoot(rootEl)

root.render(
  <React.StrictMode>
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#e2e8f0', background: '#0f172a', fontFamily: 'IBM Plex Sans, sans-serif' }}>
      Initializing local database...
    </div>
  </React.StrictMode>
)

initDB()
  .then(() => bootstrapFromSupabaseIfLocalEmpty())
  .then(() => seedIfEmpty())
  .then(() => {
    startAutoPersist()
    startSyncWorker()
    console.log('DB Health:', checkDBHealth())
    root.render(
      <React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>
    )
  })
  .catch(err => {
    document.body.innerHTML = `<div style="color:red;padding:20px;font-family:monospace"><b>DB Error</b><br/>${err.message}<br/><br/><button onclick="location.reload()">Reload</button></div>`
  })
