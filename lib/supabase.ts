import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// Simple cookie-based storage to persist Supabase sessions across browser restarts
const cookieStorage = {
  getItem: (key: string) => {
    const match = document.cookie.match(new RegExp(`(^| )${key}=([^;]+)`));
    return match ? decodeURIComponent(match[2]) : null;
  },
  setItem: (key: string, value: string) => {
    // Store cookie for one year
    document.cookie = `${key}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
  },
  removeItem: (key: string) => {
    document.cookie = `${key}=; path=/; max-age=0;`;
  },
};

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
    supabaseInstance = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        storage: cookieStorage as never,
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return supabaseInstance;
}