import { getDB, persistDB } from '../db'
import { getSupabase, isSupabaseConfigured } from './client'
import { SyncQueueItem } from '../types'

let syncing = false

export function getPendingSyncItems(limit = 50): SyncQueueItem[] {
  const db = getDB()
  const result = db.exec(
    `SELECT * FROM sync_queue
     WHERE (status='pending' OR status='failed') AND attempts < 10
     ORDER BY created_at ASC
     LIMIT ?`,
    [limit]
  )
  if (!result.length) return []
  return result[0].values.map(r => ({
    id:r[0] as string, entity:r[1] as any, operation:r[2] as any,
    payload:r[3] as string, created_at:r[4] as string, attempts:r[5] as number, status:r[6] as any,
  }))
}

export function getSyncQueueStats(): { pending: number; failed: number; synced: number } {
  const db = getDB()
  const result = db.exec(`
    SELECT
      SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN status='synced' THEN 1 ELSE 0 END) AS synced
    FROM sync_queue
  `)
  if (!result.length || !result[0].values.length) return { pending: 0, failed: 0, synced: 0 }
  const row = result[0].values[0]
  return {
    pending: Number(row[0] || 0),
    failed: Number(row[1] || 0),
    synced: Number(row[2] || 0),
  }
}

function markSynced(id: string): void {
  getDB().run(`UPDATE sync_queue SET status='synced' WHERE id=?`, [id])
}

function markFailed(id: string, attempts: number): void {
  const status = attempts >= 5 ? 'failed' : 'pending'
  getDB().run(`UPDATE sync_queue SET status=?, attempts=? WHERE id=?`, [status, attempts, id])
}

export async function drainSyncQueue(): Promise<void> {
  if (syncing || !navigator.onLine || !isSupabaseConfigured()) return
  const client = getSupabase()
  if (!client) return
  syncing = true
  try {
    const items = getPendingSyncItems(20)
    if (!items.length) return
    for (const item of items) {
      try {
        const payload = JSON.parse(item.payload)
        if (item.operation === 'INSERT' || item.operation === 'UPDATE') {
          const { error } = await client.from(item.entity).upsert(payload)
          if (error) throw error
        } else if (item.operation === 'DELETE') {
          const { error } = await client.from(item.entity).delete().eq('id', payload.id)
          if (error) throw error
        }
        markSynced(item.id)
      } catch (err) {
        markFailed(item.id, item.attempts + 1)
        console.warn(`Sync failed for ${item.entity}:`, err)
      }
    }
    persistDB()
  } finally { syncing = false }
}

export function startSyncWorker(): void {
  if (!isSupabaseConfigured()) { console.log('Sync worker not started — Supabase not configured'); return }
  void drainSyncQueue()
  setInterval(async () => { if (navigator.onLine) await drainSyncQueue() }, 15000)
  window.addEventListener('online', () => drainSyncQueue())
  console.log('Sync worker started')
}
