import { createClient } from '@supabase/supabase-js';
import { env } from './env';

let supabaseInstance: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient(): any { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    return {
      from() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: async () => ({ data: null, error: new Error('Supabase not configured') }),
          insert: async () => ({ error: new Error('Supabase not configured') }),
          update: async () => ({ error: new Error('Supabase not configured') }),
          upsert: async () => ({ error: new Error('Supabase not configured') }),
          delete: async () => ({ error: new Error('Supabase not configured') }),
        };
        return builder;
      },
    };
  }
  if (!supabaseInstance) {
    supabaseInstance = createClient(env.supabaseUrl, env.supabaseAnonKey);
  }
  return supabaseInstance;
}