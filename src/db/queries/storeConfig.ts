import { getDB, persistDB } from '../index'

export interface StoreConfig {
  shop_name: string
  shop_trade_name: string
  shop_address_line1: string
  shop_address_line2: string
  shop_city: string
  shop_state: string
  shop_state_code: string
  shop_pincode: string
  shop_gstin: string
  shop_phone: string
  invoice_prefix: string
  is_gstin_registered: boolean
}

let configCache: StoreConfig | null = null

export function getStoreConfig(): StoreConfig {
  if (configCache) return configCache
  const db = getDB()
  const result = db.exec('SELECT key, value FROM store_config')
  if (!result.length) throw new Error('Store config not initialised')
  const map: Record<string, string> = {}
  for (const row of result[0].values) map[row[0] as string] = row[1] as string
  configCache = {
    shop_name: map.shop_name || '',
    shop_trade_name: map.shop_trade_name || '',
    shop_address_line1: map.shop_address_line1 || '',
    shop_address_line2: map.shop_address_line2 || '',
    shop_city: map.shop_city || '',
    shop_state: map.shop_state || '',
    shop_state_code: map.shop_state_code || '00',
    shop_pincode: map.shop_pincode || '',
    shop_gstin: map.shop_gstin || '',
    shop_phone: map.shop_phone || '',
    invoice_prefix: map.invoice_prefix || 'INV',
    is_gstin_registered: map.is_gstin_registered === 'true',
  }
  return configCache
}

export function updateStoreConfig(updates: Partial<StoreConfig>): void {
  const db = getDB()
  for (const [key, value] of Object.entries(updates)) {
    const strVal = typeof value === 'boolean' ? String(value) : (value as string)
    db.run('INSERT OR REPLACE INTO store_config VALUES (?,?)', [key, strVal])
  }
  configCache = null  // invalidate cache
  persistDB()
}

export function getShopStateCode(): string {
  return getStoreConfig().shop_state_code
}
