import { createClient, SupabaseClient } from '@supabase/supabase-js'
let supabase: SupabaseClient | null = null
export function getSupabase(): SupabaseClient | null {
  if (supabase) return supabase
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || url === 'placeholder' || !key || key === 'placeholder') return null
  supabase = createClient(url, key)
  return supabase
}
export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL
  return !!url && url !== 'placeholder'
}
