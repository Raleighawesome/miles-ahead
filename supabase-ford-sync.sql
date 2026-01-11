-- Ford Sync Integration Schema
-- Run this in your Supabase SQL Editor

-- Table to store Ford API tokens and credentials
CREATE TABLE IF NOT EXISTS ford_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  ford_vehicle_id TEXT,              -- Ford's internal vehicle ID (populated after first sync)
  ford_username TEXT,                -- FordPass account email
  ford_password TEXT,                -- FordPass account password (consider encrypting)
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT DEFAULT 'pending',  -- 'success', 'auth_failed', 'api_error', 'pending'
  last_sync_error TEXT,              -- Error message if sync failed
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(vehicle_id)
);

-- Migration: Add username/password columns if table already exists
ALTER TABLE ford_credentials
  ADD COLUMN IF NOT EXISTS ford_username TEXT,
  ADD COLUMN IF NOT EXISTS ford_password TEXT;

-- Add fuel tracking columns to vehicles table
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS fuel_level INTEGER,           -- percentage 0-100
  ADD COLUMN IF NOT EXISTS distance_to_empty INTEGER,    -- miles remaining
  ADD COLUMN IF NOT EXISTS last_ford_sync TIMESTAMPTZ;

-- Enable RLS on ford_credentials
ALTER TABLE ford_credentials ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all operations for now (adjust based on your auth setup)
CREATE POLICY "Allow all operations on ford_credentials" ON ford_credentials
  FOR ALL USING (true) WITH CHECK (true);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_ford_credentials_vehicle_id ON ford_credentials(vehicle_id);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_ford_credentials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS ford_credentials_updated_at ON ford_credentials;
CREATE TRIGGER ford_credentials_updated_at
  BEFORE UPDATE ON ford_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_ford_credentials_updated_at();

-- Insert initial record for your truck (replace 'truck' with your vehicle_id if different)
INSERT INTO ford_credentials (vehicle_id, last_sync_status)
VALUES ('truck', 'pending')
ON CONFLICT (vehicle_id) DO NOTHING;
