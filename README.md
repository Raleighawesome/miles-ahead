# Miles Tracker

A comprehensive vehicle mileage tracking application for lease management. Track odometer readings, manage allowances, forecast usage, and avoid overage charges.

## Features

- **Manual Odometer Logging**: Record readings with dates, notes, and tags
- **Smart Progress Tracking**: Time-phased vs straight-line allowance calculations
- **Intelligent Forecasting**: Blends 30/90/lifetime pace data for accurate projections
- **Upcoming Events**: Plan for future trips that impact your mileage bank
- **Smart Alerts**: Configurable warnings at 2%, 5%, and 10% over pace
- **Data Export**: CSV export functionality for external analysis
- **Interactive Charts**: Visual pace vs allowance tracking with Recharts

## Tech Stack

- **Frontend**: Next.js 15 with TypeScript
- **UI Components**: shadcn/ui with Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Charts**: Recharts
- **Icons**: Lucide React
- **Date Handling**: date-fns

## Quick Start

### 1. Setup Supabase Database

1. Create a new project at [Supabase](https://supabase.com)
2. Go to the SQL Editor in your Supabase dashboard
3. Run the SQL commands from `supabase-schema.sql` to create the required tables

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

1. Copy the example environment file:
```bash
cp .env.example .env.local
```

2. Edit `.env.local` with your Supabase credentials:
```bash
# Get these from your Supabase project settings:
# https://supabase.com/dashboard/project/YOUR_PROJECT/settings/api

NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# Optional: Configure your default settings
NEXT_PUBLIC_DEFAULT_VEHICLE_ID=truck
NEXT_PUBLIC_DEFAULT_LEASE_START=2024-05-12
NEXT_PUBLIC_DEFAULT_LEASE_END=2027-11-12
NEXT_PUBLIC_DEFAULT_ANNUAL_ALLOWANCE=12000
NEXT_PUBLIC_DEFAULT_OVERAGE_RATE=0.11
```

### 4. Start the App

1. Start the development server:
```bash
npm run dev
```

2. Open [http://localhost:3000](http://localhost:3000)

3. The app will automatically load your environment variables. You can still override them in the Settings section if needed.

### 4. Start Tracking

1. Configure your lease details (start date, end date, annual allowance)
2. Add your first odometer reading
3. The app will automatically calculate your pace and forecast

## Database Schema

The app uses two main tables:

### `odometer_logs`
- Records vehicle odometer readings with dates
- Supports notes and tags for organization
- Indexed by vehicle_id and reading_date

### `trip_events`
- Tracks upcoming trips that will impact mileage
- Helps adjust forecasting for planned travel
- Includes estimated miles for each event

## Usage

### Basic Workflow

1. **Configure Settings**: Enter your lease terms and Supabase credentials
2. **Add Readings**: Record odometer values regularly
3. **Monitor Progress**: View your mileage bank and forecast
4. **Plan Ahead**: Add upcoming events to adjust projections
5. **Export Data**: Download CSV for external analysis

### Key Concepts

- **Mileage Bank**: Difference between your allowance-to-date and actual miles driven
- **Time-phased vs Straight-line**: Different methods for calculating daily allowances
- **Blended Pace**: Smart algorithm combining 30-day, 90-day, and lifetime averages

### Alerts and Forecasting

The app provides intelligent warnings:
- **Green**: Under allowance pace
- **Yellow**: 2-5% over pace
- **Orange**: 5-10% over pace  
- **Red**: 10%+ over pace

## Development

### Project Structure

```
├── app/
│   ├── globals.css          # Global styles with Tailwind
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Main page
├── components/
│   └── ui/                  # shadcn/ui components
├── lib/
│   └── utils.ts             # Utility functions
├── temp_backup/
│   └── miles_tracker_backup.jsx  # Main component
├── supabase-schema.sql      # Database schema
└── README.md
```

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### Adding Features

The main component is in `temp_backup/miles_tracker_backup.jsx`. This is a complete, self-contained React component that handles:

- State management
- Supabase integration
- Data calculations
- UI rendering

## iOS Shortcuts Integration

The app mentions iOS Shortcut compatibility. While not implemented in this version, the Supabase backend supports API calls that could integrate with iOS Shortcuts for quick odometer logging.

## Contributing

Feel free to submit issues and enhancement requests!

## License

ISC
