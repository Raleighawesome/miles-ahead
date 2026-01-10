# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev       # Start development server at http://localhost:3000
npm run build     # Production build
npm run start     # Start production server
npm run lint      # Run ESLint
```

## Project Overview

Miles Ahead is a vehicle lease mileage tracking application. It helps users stay within their lease allowance by tracking odometer readings, forecasting usage, and providing alerts for potential overage charges.

**Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, shadcn/ui, Supabase (PostgreSQL + Auth), Recharts

## Architecture

### Component Structure

```
app/layout.tsx
  └─ PasswordProtection (Supabase auth wrapper)
     └─ MilesTracker (main component - 1300+ lines)
        ├─ OdometerButton (floating action for quick entry)
        ├─ ThemeToggle (light/dark mode)
        └─ Tabs: Dashboard | Plan Trips | History

app/settings/page.tsx (per-vehicle configuration)
```

### Key Files

- **`components/MilesTracker.tsx`** - Core application logic: mileage calculations, forecasting, charts, all state management
- **`components/PasswordProtection.tsx`** - Auth wrapper using Supabase signInWithPassword
- **`lib/supabase.ts`** - Supabase client singleton with cookie-based session storage
- **`lib/env.ts`** - Environment configuration with defaults
- **`app/api/gas-price/route.ts`** - Scrapes GasBuddy for gas prices

### Database Tables (Supabase)

- **`odometer_logs`** - Vehicle readings (vehicle_id, reading_date, reading_miles, note, tag)
- **`trip_events`** - Future trips (vehicle_id, name, start_date, end_date, est_miles)
- **`vehicles`** - Per-vehicle settings (mpg, lease_start, lease_end, annual_allowance, overage_rate)
- **`gas_prices`** - Cached gas prices from GasBuddy

## Key Algorithms

**Blended Pace Calculation:**
- 50% weight: 30-day pace
- 30% weight: 90-day pace
- 20% weight: lifetime pace

**Alert Levels (based on overage %):**
- Green: ≤0% | Yellow: 0-5% | Orange: 5-10% | Red: >10%

**Progress Bar:**
- Fixed 1000-mile scale showing remaining allowance
- Animated with easeOutQuart over 1.5s
- Color matches alert level

**Multiple readings per day:** Uses max value (end-of-day odometer)

## Environment Variables

All must be prefixed `NEXT_PUBLIC_` for client-side access:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Optional (have defaults in lib/env.ts)
NEXT_PUBLIC_DEFAULT_VEHICLE_ID=truck
NEXT_PUBLIC_DEFAULT_LEASE_START=2024-05-12
NEXT_PUBLIC_DEFAULT_LEASE_END=2027-11-12
NEXT_PUBLIC_DEFAULT_ANNUAL_ALLOWANCE=12000
NEXT_PUBLIC_DEFAULT_OVERAGE_RATE=0.11
```

## Ford Sync Integration

Automated odometer and fuel level sync from Ford vehicles via the unofficial FordPass API, orchestrated through n8n.

### Architecture

```
n8n (self-hosted) ─── FordPass API ─── Supabase (PostgreSQL)
     │                     │                   │
     │ Midnight cron       │ OAuth2 +          │ Store tokens,
     │ trigger             │ refresh           │ readings, fuel
```

### Database Tables (Ford Sync)

- **`ford_credentials`** - OAuth tokens and sync status per vehicle
  - `vehicle_id` (FK to vehicles), `ford_vehicle_id`, `access_token`, `refresh_token`
  - `token_expires_at`, `last_sync_at`, `last_sync_status`, `last_sync_error`

- **`vehicles`** (additional columns)
  - `fuel_level` (0-100%), `distance_to_empty` (miles), `last_ford_sync`

### Files

- **`supabase-ford-sync.sql`** - Migration to run in Supabase SQL Editor
- **`n8n-ford-sync-workflow.json`** - Import into n8n

### Workflow Flow

1. Midnight trigger → Get stored credentials
2. Check if token expired → Refresh or re-auth with password
3. Save new tokens → Get vehicles → Extract vehicle ID
4. Get vehicle status → Extract odometer/fuel
5. Compare with last reading → Insert if changed
6. Update fuel columns → Mark sync success

### FordPass API Endpoints

- Auth: `POST https://usapi.cv.ford.com/api/oauth2/v1/token`
- Vehicles: `GET https://usapi.cv.ford.com/api/users`
- Status: `GET https://usapi.cv.ford.com/api/vehicles/v5/{vehicleId}/status`
- Application-Id header: `71A3AD0A-CF46-4CCF-B473-FC7FE5BC4592`

## Patterns

- **State:** React hooks with localStorage for vehicle selection and theme preference
- **Auth:** Cookie storage for Supabase session persistence
- **Supabase queries:** `.eq()`, `.maybeSingle()`, `.select()`, `.order()`
- **Dates:** date-fns for parsing/formatting (parseISO, format, subDays, differenceInDays)
- **Dark mode:** Class-based ("dark" on html element), initialized in layout head script to prevent flash
