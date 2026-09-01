import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://tnegxdhgsvkoqgejrgkd.supabase.co'

const SUPABASE_KEY = 'sb_publishable_t3jH--0uY6U8mIl36Zf6ZA_wy5mgfH-'

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY
)

export const STORAGE_BUCKET = 'flowmeter-files'
