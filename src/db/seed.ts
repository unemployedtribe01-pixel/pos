import { getDB, persistDB } from './index'

const SEED_PRODUCTS: unknown[] = []
const LEGACY_SEED_IDS = [
  'p001', 'p002', 'p003', 'p004', 'p005', 'p006', 'p007', 'p008', 'p009', 'p010',
  'p011', 'p012', 'p013', 'p014', 'p015', 'p016', 'p017', 'p018', 'p019', 'p020',
  'p021', 'p022', 'p023', 'p024', 'p025', 'p026', 'p027', 'p028', 'p029', 'p030',
]

export async function seedIfEmpty(): Promise<void> {
  const db = getDB()
  const cleanupCheck = db.exec(`SELECT value FROM app_meta WHERE key='seed_cleanup_done'`)
  const cleanupDone = cleanupCheck.length > 0 && cleanupCheck[0].values.length > 0
  if (!cleanupDone) {
    const placeholders = LEGACY_SEED_IDS.map(() => '?').join(',')
    db.run(`DELETE FROM products WHERE id IN (${placeholders})`, LEGACY_SEED_IDS)
    db.run(`INSERT OR REPLACE INTO app_meta VALUES ('seed_cleanup_done', '1')`)
    await persistDB()
  }
  const result = db.exec('SELECT COUNT(*) FROM products')
  const count = result[0].values[0][0] as number
  if (count > 0) return
  if (SEED_PRODUCTS.length === 0) return
}
