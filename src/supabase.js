import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase-Umgebungsvariablen fehlen. Bitte .env Datei prüfen.')
}

export const supabase = createClient(supabaseUrl, supabaseKey)
