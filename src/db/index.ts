import { get, set } from 'idb-keyval'
import { SCHEMA_SQL } from './schema'

let db: any = null
let initSqlJsFn: ((config?: Record<string, unknown>) => Promise<any>) | null = null
let initSqlJsLoader: Promise<((config?: Record<string, unknown>) => Promise<any>)> | null = null

declare global {
  interface Window {
    initSqlJs?: (config?: Record<string, unknown>) => Promise<any>
  }
}

async function loadInitSqlJs(): Promise<(config?: Record<string, unknown>) => Promise<any>> {
  if (initSqlJsFn) return initSqlJsFn
  if (!initSqlJsLoader) {
    initSqlJsLoader = new Promise(async (resolve, reject) => {
      try {
        if (typeof window.initSqlJs === 'function') {
          initSqlJsFn = window.initSqlJs
          resolve(window.initSqlJs)
          return
        }
        const { default: sqlJsScriptUrl } = await import('sql.js/dist/sql-wasm.js?url')
        const script = document.createElement('script')
        script.src = sqlJsScriptUrl
        script.async = true
        script.onload = () => {
          if (typeof window.initSqlJs === 'function') {
            initSqlJsFn = window.initSqlJs
            resolve(window.initSqlJs)
            return
          }
          reject(new Error('sql.js loaded but initSqlJs was not found'))
        }
        script.onerror = () => reject(new Error('Failed to load sql.js script'))
        document.head.appendChild(script)
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }
  return initSqlJsLoader
}

function wasmLocateFile(file: string): string {
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    return new URL(file, window.location.href).href
  }
  return `/${file}`
}

export async function initDB(): Promise<any> {
  if (db) return db
  const initSqlJs = await loadInitSqlJs()
  const SQL = await initSqlJs({ locateFile: wasmLocateFile })
  const saved = await get<Uint8Array>('pos_db')
  db = saved ? new SQL.Database(saved) : new SQL.Database()
  db.run(SCHEMA_SQL)
  const migrations = [
    `CREATE TABLE IF NOT EXISTS import_sessions (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      mode TEXT NOT NULL,
      total_rows INTEGER NOT NULL,
      created_count INTEGER NOT NULL,
      updated_count INTEGER NOT NULL,
      skipped_count INTEGER NOT NULL,
      error_count INTEGER NOT NULL,
      warning_count INTEGER NOT NULL,
      risky_count INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )`,
    "ALTER TABLE products ADD COLUMN price_inclusive INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE bills ADD COLUMN change_due REAL NOT NULL DEFAULT 0",
    "ALTER TABLE bills ADD COLUMN supply_type TEXT NOT NULL DEFAULT 'intra'",
    "ALTER TABLE bills ADD COLUMN cgst_amount REAL NOT NULL DEFAULT 0",
    "ALTER TABLE bills ADD COLUMN sgst_amount REAL NOT NULL DEFAULT 0",
    "ALTER TABLE bills ADD COLUMN igst_amount REAL NOT NULL DEFAULT 0",
    "ALTER TABLE bills ADD COLUMN place_of_supply_code TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE bills ADD COLUMN place_of_supply_name TEXT NOT NULL DEFAULT ''",
  ]
  for (const m of migrations) {
    try { db.run(m) } catch { /* column already exists */ }
  }
  await persistDB()
  return db
}

export async function persistDB(): Promise<void> {
  if (!db) return
  await set('pos_db', db.export())
}

export function getDB(): any {
  if (!db) throw new Error('DB not initialised. Call initDB() first.')
  return db
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function now(): string {
  return new Date().toISOString()
}

let persistTimer: ReturnType<typeof setInterval> | null = null

export function startAutoPersist(): void {
  if (persistTimer) return
  persistTimer = setInterval(() => {
    persistDB().catch(err => console.error('Auto-persist failed:', err))
  }, 30000)
  console.log('Auto-persist started')
}

export function checkDBHealth(): { ok: boolean; productCount: number; billCount: number; customerCount: number } {
  try {
    const d = getDB()
    const p = d.exec('SELECT COUNT(*) FROM products')[0].values[0][0] as number
    const b = d.exec('SELECT COUNT(*) FROM bills')[0].values[0][0] as number
    const c = d.exec('SELECT COUNT(*) FROM customers')[0].values[0][0] as number
    return { ok:true, productCount:p, billCount:b, customerCount:c }
  } catch { return { ok:false, productCount:0, billCount:0, customerCount:0 } }
}

export function exportDatabaseBackup(): void {
  if (!db) return
  const data = db.export()
  const blob = new Blob([data], { type:'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `pos-backup-${new Date().toISOString().split('T')[0]}.db`
  a.click()
  URL.revokeObjectURL(url)
}
