import { getDB, generateId, now, persistDB } from '../index'

export interface ImportSessionRecord {
  id: string
  file_name: string
  mode: string
  total_rows: number
  created_count: number
  updated_count: number
  skipped_count: number
  error_count: number
  warning_count: number
  risky_count: number
  created_at: string
}

export function createImportSession(record: Omit<ImportSessionRecord, 'id' | 'created_at'>): void {
  const db = getDB()
  const id = generateId()
  const ts = now()
  db.run(
    `INSERT INTO import_sessions (
      id, file_name, mode, total_rows, created_count, updated_count, skipped_count,
      error_count, warning_count, risky_count, created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      record.file_name,
      record.mode,
      record.total_rows,
      record.created_count,
      record.updated_count,
      record.skipped_count,
      record.error_count,
      record.warning_count,
      record.risky_count,
      ts,
    ]
  )
  void persistDB()
}

export function getRecentImportSessions(limit = 20): ImportSessionRecord[] {
  const db = getDB()
  const lim = Math.min(100, Math.max(1, Math.floor(limit)))
  const res = db.exec(
    `SELECT id, file_name, mode, total_rows, created_count, updated_count, skipped_count,
     error_count, warning_count, risky_count, created_at
     FROM import_sessions ORDER BY created_at DESC LIMIT ${lim}`
  )
  if (!res.length) return []
  return res[0].values.map((r: unknown[]) => ({
    id: r[0] as string,
    file_name: r[1] as string,
    mode: r[2] as string,
    total_rows: r[3] as number,
    created_count: r[4] as number,
    updated_count: r[5] as number,
    skipped_count: r[6] as number,
    error_count: r[7] as number,
    warning_count: r[8] as number,
    risky_count: r[9] as number,
    created_at: r[10] as string,
  }))
}
