import { createClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://ojqchbmenhskvtlrbuub.supabase.co';
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || 'sb_publishable_oGFpme4yQqr3DG42lsd-rA_uzmXR6SR';

export const supabaseConfigured = Boolean(url && anonKey && url.startsWith('https://'));
export const supabase = supabaseConfigured
  ? createClient(url, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;
