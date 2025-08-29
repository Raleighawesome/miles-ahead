-- Miles Tracker Database Schema
-- Run these commands in your Supabase SQL editor

-- Create odometer_logs table
CREATE TABLE IF NOT EXISTS public.odometer_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    vehicle_id TEXT NOT NULL,
    reading_date DATE NOT NULL,
    reading_miles INTEGER NOT NULL,
    note TEXT,
    tag TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create trip_events table  
CREATE TABLE IF NOT EXISTS public.trip_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    vehicle_id TEXT NOT NULL,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    est_miles INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_odometer_logs_vehicle_date 
ON public.odometer_logs (vehicle_id, reading_date);

CREATE INDEX IF NOT EXISTS idx_trip_events_vehicle_dates 
ON public.trip_events (vehicle_id, start_date, end_date);

-- Enable Row Level Security (RLS)
ALTER TABLE public.odometer_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_events ENABLE ROW LEVEL SECURITY;

-- Create policies allowing anonymous access for development
-- NOTE: In production, you should implement proper authentication and restrict these policies

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow authenticated users to view odometer_logs" ON public.odometer_logs;
DROP POLICY IF EXISTS "Allow authenticated users to insert odometer_logs" ON public.odometer_logs;
DROP POLICY IF EXISTS "Allow authenticated users to update odometer_logs" ON public.odometer_logs;
DROP POLICY IF EXISTS "Allow authenticated users to delete odometer_logs" ON public.odometer_logs;
DROP POLICY IF EXISTS "Allow authenticated users to view trip_events" ON public.trip_events;
DROP POLICY IF EXISTS "Allow authenticated users to insert trip_events" ON public.trip_events;
DROP POLICY IF EXISTS "Allow authenticated users to update trip_events" ON public.trip_events;
DROP POLICY IF EXISTS "Allow authenticated users to delete trip_events" ON public.trip_events;

-- Odometer logs policies (allowing anonymous access for development)
CREATE POLICY "Allow anonymous access to odometer_logs" 
ON public.odometer_logs FOR ALL 
TO anon, authenticated 
USING (true) WITH CHECK (true);

-- Trip events policies (allowing anonymous access for development)
CREATE POLICY "Allow anonymous access to trip_events" 
ON public.trip_events FOR ALL 
TO anon, authenticated 
USING (true) WITH CHECK (true);

-- Grant necessary permissions
GRANT ALL ON public.odometer_logs TO authenticated;
GRANT ALL ON public.trip_events TO authenticated;
GRANT ALL ON public.odometer_logs TO anon;
GRANT ALL ON public.trip_events TO anon;
