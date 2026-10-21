import { createClient } from '@supabase/supabase-js'

// Adresa proiectului și cheia PUBLICĂ (publishable). Sunt făcute să stea în aplicație:
// accesul la date e protejat de politicile RLS din baza de date, nu de această cheie.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://ecfehopapvxngnxecetg.supabase.co'
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable__X0T3eKwVwWhl5Qylz8plg_mpT9S4Sf'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'bf-auth' },
})
