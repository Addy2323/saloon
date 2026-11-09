import { createClient } from '@supabase/supabase-js';
import { createLocalSupabaseClient } from './mock-supabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isSupabaseConfigured =
  typeof supabaseUrl === 'string' &&
  typeof supabaseAnonKey === 'string' &&
  supabaseUrl.startsWith('http') &&
  !supabaseUrl.includes('placeholder') &&
  !supabaseUrl.includes('your-project');

export const supabase: any = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    })
  : createLocalSupabaseClient();
