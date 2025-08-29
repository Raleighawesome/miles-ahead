// Environment variable configuration with fallbacks
// These values are loaded on the client-side, so they must be prefixed with NEXT_PUBLIC_

// Supabase configuration
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Default settings (optional)
export const DEFAULT_VEHICLE_ID = process.env.NEXT_PUBLIC_DEFAULT_VEHICLE_ID || 'truck';
export const DEFAULT_LEASE_START = process.env.NEXT_PUBLIC_DEFAULT_LEASE_START || '2024-05-12';
export const DEFAULT_LEASE_END = process.env.NEXT_PUBLIC_DEFAULT_LEASE_END || '2027-11-12';
export const DEFAULT_ANNUAL_ALLOWANCE = Number(process.env.NEXT_PUBLIC_DEFAULT_ANNUAL_ALLOWANCE || '12000');
export const DEFAULT_OVERAGE_RATE = Number(process.env.NEXT_PUBLIC_DEFAULT_OVERAGE_RATE || '0.11');
