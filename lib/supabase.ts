import { createClient } from '@supabase/supabase-js';
import { env } from './env';

let supabaseInstance: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient() {
  if (!supabaseInstance) {
    supabaseInstance = createClient(env.supabaseUrl, env.supabaseAnonKey);
  }
  return supabaseInstance;
}