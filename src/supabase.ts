import { createClient } from '@supabase/supabase-js'

// Supabase publishable key is intended for browser-side use.
// For a GitHub Pages static build, keeping these as public runtime config is acceptable.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://tnegxdhgsvkoqgejrgkd.supabase.co'
const publishableKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || 'sb_publishable_t3jH--0uY6U8mIl36Zf6ZA_wy5mgfH-'

export const supabase = createClient(url, publishableKey)
export const STORAGE_BUCKET = 'flowmeter-files'
