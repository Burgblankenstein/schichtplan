import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase-Umgebungsvariablen fehlen.')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

// Ruft eine Supabase Edge Function auf
export async function callFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return data
}
