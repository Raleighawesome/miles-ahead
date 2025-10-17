"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import type { Payload, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { format, parseISO, differenceInDays, startOfDay, subDays, startOfWeek, addDays } from 'date-fns';
import { Progress } from './ui/progress';
import { env } from '../lib/env';
import { getSupabaseClient } from '../lib/supabase';
import ThemeToggle from './ThemeToggle';
import Link from 'next/link';
import OdometerButton from './OdometerButton';

// Types
interface OdometerReading {
  id: string;
  reading_date: string;
  reading_miles: number;
  daily_miles?: number;
  note?: string;
  tags?: string;
  created_at: string;
}

interface MileageData {
  date: number;
  label: string;
  miles: number;
  allowance: number;
  dailyMiles?: number;
}

interface WeeklyMileageData {
  weekStart: number;
  label: string;
  miles: number;
  allowance: number;
}

interface WeeklyProjectionPoint {
  weekStart: number;
  label: string;
  projected: number;
}

interface TripEvent {
  id: string;
  vehicle_id: string;
  event_name: string;
  start_date: string;
  end_date: string;
  estimated_miles: number;
  created_at: string;
}

interface VehicleConfig {
  leaseStartDate: Date;
  leaseEndDate: Date;
  annualAllowance: number;
}

const BASE_PROGRESS_RANGE = 660;
const WEEKS_PER_PAGE = 4;

interface CenteredProgress {
  delta: number;
  range: number;
  credit: number;
  debt: number;
}

const calculateCenteredProgress = (value: number): CenteredProgress => {
  const range = BASE_PROGRESS_RANGE;
  const credit = value > 0 ? value : 0;
  const debt = value < 0 ? Math.abs(value) : 0;

  return {
    delta: value,
    range,
    credit,
    debt
  };
};

interface VehicleRecord {
  id: string;
  name?: string;
  mpg?: number;
  lease_start?: string;
  lease_end?: string;
  annual_allowance?: number;
  overage_rate?: number;
}

interface GasPriceRecord {
  price: number;
  recorded_at: string;
}

interface TripEventInsert {
  vehicle_id: string;
  name: string;
  start_date: string;
  end_date: string;
  est_miles: number;
}

interface OdometerLogInsert {
  vehicle_id: string;
  reading_date: string;
  reading_miles: number;
  note?: string | null;
}

interface RawTripEvent {
  id: string;
  vehicle_id: string;
  name: string;
  start_date: string;
  end_date: string;
  est_miles: number;
  created_at: string;
}

export default function MilesTracker() {
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year'>('month');
  const [weekPage, setWeekPage] = useState(0);
  const [readings, setReadings] = useState<OdometerReading[]>([]);
  const [tripEvents, setTripEvents] = useState<TripEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTrip, setNewTrip] = useState({
    name: '',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    estimatedMiles: ''
  });
  const [stationId, setStationId] = useState('26449');
  const [mpg, setMpg] = useState('30');
  const [gasPrice, setGasPrice] = useState<number | null>(null);
  const [priceHistory, setPriceHistory] = useState<{ price: number; recorded_at: string }[]>([]);
  const [gasStats, setGasStats] = useState({
    spentWeek: 0,
    spentMonth: 0,
    spentQuarter: 0,
    forecastWeek: 0,
    forecastMonth: 0,
    forecastQuarter: 0
  });

  // Initialize Supabase client
  const supabase = getSupabaseClient();

  // Vehicle selection and configuration (env defaults; override from Supabase/localStorage)
  const [vehicleId, setVehicleId] = useState(env.vehicleId);
  const [vehicleConfig, setVehicleConfig] = useState<VehicleConfig>({
    leaseStartDate: new Date(env.leaseStartDate),
    leaseEndDate: new Date(env.leaseEndDate),
    annualAllowance: env.annualAllowance
  });

  // Load selected vehicle from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('selectedVehicleId');
      if (stored) setVehicleId(stored);
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Load data whenever the selected vehicle changes
  useEffect(() => {
    loadReadings();
    loadTripEvents();
    loadVehicle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId]);

  // Load lease/config for current vehicle
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('vehicles')
          .select('lease_start, lease_end, annual_allowance')
          .eq('id', vehicleId)
          .maybeSingle();
        
        if (error) {
          console.error('Error loading vehicle config:', error);
          return;
        }
        
        if (!isMounted) return;
        
        // Cast data to the proper type since TypeScript doesn't know about the extended columns
        const vehicleData = data as VehicleRecord | null;
        
        // Set config from database or fall back to env defaults
        setVehicleConfig({
          leaseStartDate: vehicleData?.lease_start ? new Date(vehicleData.lease_start) : new Date(env.leaseStartDate),
          leaseEndDate: vehicleData?.lease_end ? new Date(vehicleData.lease_end) : new Date(env.leaseEndDate),
          annualAllowance: vehicleData?.annual_allowance ?? env.annualAllowance
        });
      } catch {
        // Ignore errors loading vehicle config
      }
    })();
    return () => { isMounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId]);

  useEffect(() => {
    loadGasPrice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationId]);

  const loadReadings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('odometer_logs')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .order('reading_date', { ascending: true });

      if (error) {
        console.error('Error loading readings:', error);
      } else {
        // Aggregate multiple readings per day correctly:
        // For each date, use the last (max) odometer reading of the day.
        // This ensures daily deltas = (max - min) for that date and
        // preserves odometer semantics for downstream calculations.
        const perDay: Record<string, { min: number; max: number }> = {};
        (data || []).forEach((r: OdometerReading) => {
          const d = r.reading_date;
          const val = r.reading_miles;
          if (!perDay[d]) perDay[d] = { min: val, max: val };
          else {
            if (val < perDay[d].min) perDay[d].min = val;
            if (val > perDay[d].max) perDay[d].max = val;
          }
        });

        const sortedDates = Object.keys(perDay).sort(
          (a, b) => new Date(a).getTime() - new Date(b).getTime()
        );

        const aggregated: OdometerReading[] = sortedDates.map((date, index) => {
          const previousDate = index > 0 ? sortedDates[index - 1] : null;
          const previousMax = previousDate ? perDay[previousDate].max : null;
          const dailyMiles = previousMax !== null ? perDay[date].max - previousMax : 0;

          return {
            id: date,
            reading_date: date,
            reading_miles: perDay[date].max, // end-of-day odometer
            daily_miles: Math.max(0, dailyMiles),
            note: undefined,
            tags: undefined,
            created_at: new Date(date).toISOString(),
          };
        });

        setReadings(aggregated);
      }
    } catch (error) {
      console.error('Error loading readings:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadVehicle = async () => {
    try {
      const { data, error } = await supabase
        .from('vehicles')
        .select('mpg')
        .eq('id', vehicleId)
        .single();

      if (error) {
        console.error('Error loading vehicle:', error);
      } else {
        // Cast data to the proper type since TypeScript doesn't know about the vehicle columns
        const vehicleData = data as VehicleRecord | null;
        if (vehicleData && vehicleData.mpg) {
          setMpg(vehicleData.mpg.toString());
        }
      }
    } catch (error) {
      console.error('Error loading vehicle:', error);
    }
  };

  const loadGasPrice = async () => {
    try {
      // Get today's date in YYYY-MM-DD format
      const today = format(new Date(), 'yyyy-MM-dd');
      
      // Check if we already have a price for today
      const { data: todayPrice } = await supabase
        .from('gas_prices')
        .select('price, recorded_at')
        .eq('station_id', stationId)
        .gte('recorded_at', `${today}T00:00:00.000Z`)
        .lt('recorded_at', `${today}T23:59:59.999Z`)
        .order('recorded_at', { ascending: false })
        .limit(1);

      // Get price history for charts (last 90 days)
      const { data: history } = await supabase
        .from('gas_prices')
        .select('price, recorded_at')
        .eq('station_id', stationId)
        .gte('recorded_at', subDays(new Date(), 90).toISOString())
        .order('recorded_at', { ascending: true });
      setPriceHistory(history || []);

      let currentPrice: number | null = null;

      if (todayPrice && todayPrice.length > 0) {
        // Use today's already scraped price
        currentPrice = (todayPrice as GasPriceRecord[])[0].price;
      } else {
        // No price for today, scrape new one
        const res = await fetch(`/api/gas-price?stationId=${stationId}`);
        const fetchedData = res.ok ? await res.json() : null;
        const fetched = fetchedData?.price as number | undefined;
        
        if (fetched) {
          currentPrice = fetched;
          // Save the new price to database
          await supabase.from('gas_prices').insert({
            station_id: stationId, 
            price: fetched,
            recorded_at: new Date().toISOString()
          });
          // Update history with new price
          setPriceHistory(prev => [...prev, { price: fetched, recorded_at: new Date().toISOString() }]);
        } else {
          // Fallback to latest historical price if scraping fails
          const latest = history && history.length > 0 ? (history as GasPriceRecord[])[history.length - 1].price : null;
          currentPrice = latest;
        }
      }

      if (currentPrice != null) {
        setGasPrice(currentPrice);
      }
    } catch (err) {
      console.error('Error loading gas price:', err);
    }
  };

  const loadTripEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('trip_events')
        .select('id, vehicle_id, name, start_date, end_date, est_miles, created_at')
        .eq('vehicle_id', vehicleId)
        .order('start_date', { ascending: true });

      if (error) {
        console.error('Error loading trip events:', error);
      } else {
        const raw = (data || []) as RawTripEvent[];
        const validTrips = raw
          .filter((trip) => trip && trip.id && trip.name && trip.start_date && trip.end_date)
          .map((trip) => ({
            id: trip.id,
            vehicle_id: trip.vehicle_id,
            event_name: trip.name,
            start_date: trip.start_date,
            end_date: trip.end_date,
            estimated_miles: Number(trip.est_miles) || 0,
            created_at: trip.created_at,
          }));
        setTripEvents(validTrips as TripEvent[]);
      }
    } catch (error) {
      console.error('Error loading trip events:', error);
    }
  };


  const handleOdometerButtonAdd = async (reading: { date: string; miles: string; notes: string }) => {
    try {
      const insertData: OdometerLogInsert = {
        vehicle_id: vehicleId,
        reading_date: reading.date,
        reading_miles: parseInt(reading.miles),
        note: reading.notes || null
      };
      const { error } = await supabase
        .from('odometer_logs')
        .insert([insertData]);

      if (error) {
        console.error('Error adding reading:', error);
        alert('Error adding reading. Please try again.');
        throw error;
      } else {
        loadReadings(); // Reload the data
      }
    } catch (error) {
      console.error('Error adding reading:', error);
      alert('Error adding reading. Please try again.');
      throw error;
    }
  };

  const handleAddTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newTrip.name || !newTrip.startDate || !newTrip.endDate || !newTrip.estimatedMiles) {
      alert('Please fill in all trip fields');
      return;
    }

    const estimatedMiles = parseInt(newTrip.estimatedMiles);
    if (isNaN(estimatedMiles) || estimatedMiles < 0) {
      alert('Please enter a valid number for estimated miles');
      return;
    }

    try {
      const insertData: TripEventInsert = {
        vehicle_id: vehicleId,
        name: newTrip.name,
        start_date: newTrip.startDate,
        end_date: newTrip.endDate,
        est_miles: estimatedMiles
      };
      const { error } = await supabase
        .from('trip_events')
        .insert([insertData]);

      if (error) {
        console.error('Error adding trip:', error);
        alert('Error adding trip. Please try again.');
      } else {
        setNewTrip({
          name: '',
          startDate: format(new Date(), 'yyyy-MM-dd'),
          endDate: format(new Date(), 'yyyy-MM-dd'),
          estimatedMiles: ''
        });
        loadTripEvents(); // Reload the data
      }
    } catch (error) {
      console.error('Error adding trip:', error);
      alert('Error adding trip. Please try again.');
    }
  };

  const handleDeleteTrip = async (tripId: string) => {
    try {
      const { error } = await supabase
        .from('trip_events')
        .delete()
        .eq('id', tripId);

      if (error) {
        console.error('Error deleting trip:', error);
        alert('Error deleting trip. Please try again.');
      } else {
        loadTripEvents(); // Reload the data
      }
    } catch (error) {
      console.error('Error deleting trip:', error);
      alert('Error deleting trip. Please try again.');
    }
  };

  // Calculate blended pace (30/90/lifetime day averages)
  const calculateBlendedPace = () => {
    if (readings.length < 2) return null;

    const sortedReadings = [...readings].sort((a, b) => 
      new Date(a.reading_date).getTime() - new Date(b.reading_date).getTime()
    );

    const now = new Date();
    const firstReading = sortedReadings[0];
    const latestReading = sortedReadings[sortedReadings.length - 1];
    
    // Get readings for different time periods
    const thirtyDaysAgo = subDays(now, 30);
    const ninetyDaysAgo = subDays(now, 90);
    
    const thirtyDayReadings = sortedReadings.filter(r => 
      new Date(r.reading_date) >= thirtyDaysAgo
    );
    const ninetyDayReadings = sortedReadings.filter(r => 
      new Date(r.reading_date) >= ninetyDaysAgo
    );
    
    // Calculate paces
    let thirtyDayPace = 0;
    let ninetyDayPace = 0;
    let lifetimePace = 0;
    
    if (thirtyDayReadings.length >= 2) {
      const start = thirtyDayReadings[0];
      const end = thirtyDayReadings[thirtyDayReadings.length - 1];
      const miles = end.reading_miles - start.reading_miles;
      const days = differenceInDays(new Date(end.reading_date), new Date(start.reading_date));
      thirtyDayPace = days > 0 ? miles / days : 0;
    }
    
    if (ninetyDayReadings.length >= 2) {
      const start = ninetyDayReadings[0];
      const end = ninetyDayReadings[ninetyDayReadings.length - 1];
      const miles = end.reading_miles - start.reading_miles;
      const days = differenceInDays(new Date(end.reading_date), new Date(start.reading_date));
      ninetyDayPace = days > 0 ? miles / days : 0;
    }
    
    const totalMiles = latestReading.reading_miles - firstReading.reading_miles;
    const totalDays = differenceInDays(new Date(latestReading.reading_date), new Date(firstReading.reading_date));
    lifetimePace = totalDays > 0 ? totalMiles / totalDays : 0;
    
    // Blended pace algorithm (weighted average)
    const weights = {
      thirty: thirtyDayReadings.length >= 2 ? 0.5 : 0,
      ninety: ninetyDayReadings.length >= 2 ? 0.3 : 0,
      lifetime: 0.2
    };
    
    const totalWeight = weights.thirty + weights.ninety + weights.lifetime;
    if (totalWeight === 0) return null;
    
    const blendedPace = (
      (thirtyDayPace * weights.thirty) + 
      (ninetyDayPace * weights.ninety) + 
      (lifetimePace * weights.lifetime)
    ) / totalWeight;
    
    return {
      thirtyDayPace,
      ninetyDayPace,
      lifetimePace,
      blendedPace
    };
  };

  // Get alert level based on pace vs allowance
  const getAlertLevel = (overUnderPct: number) => {
    if (overUnderPct <= 0) return 'green'; // Under allowance
    if (overUnderPct <= 0.05) return 'yellow'; // 2-5% over
    if (overUnderPct <= 0.10) return 'orange'; // 5-10% over
    return 'red'; // 10%+ over
  };

  // Calculate mileage statistics
  const calculateStats = (): StatsObject => {
    if (readings.length === 0) {
      return {
        currentMiles: 0,
        totalMiles: 0,
        dailyAllowance: 0,
        allowanceToDate: 0,
        overUnder: 0,
        overUnderPct: 0,
        daysIntoLease: 0,
        alertLevel: 'green' as const,
        blendedPace: null,
        todaysMiles: 0
      };
    }

    const sortedReadings = [...readings].sort((a, b) =>
      new Date(a.reading_date).getTime() - new Date(b.reading_date).getTime()
    );

    const firstReading = sortedReadings[0];
    const latestReading = sortedReadings[sortedReadings.length - 1];

    const todayKey = format(new Date(), 'yyyy-MM-dd');
    const todaysReading = sortedReadings.find(r => r.reading_date === todayKey);
    const todaysMiles = todaysReading?.daily_miles ?? 0;

    const currentMiles = latestReading.reading_miles;
    const totalMiles = currentMiles - firstReading.reading_miles;
    
    const dailyAllowance = vehicleConfig.annualAllowance / 365.25;
    
    const daysIntoLease = differenceInDays(new Date(), vehicleConfig.leaseStartDate);
    const allowanceToDate = dailyAllowance * Math.max(0, daysIntoLease);
    
    const overUnder = totalMiles - allowanceToDate;
    const overUnderPct = allowanceToDate > 0 ? overUnder / allowanceToDate : 0;
    
    const alertLevel = getAlertLevel(overUnderPct);
    const blendedPace = calculateBlendedPace();

    return {
      currentMiles,
      totalMiles,
      dailyAllowance,
      allowanceToDate,
      overUnder,
      overUnderPct,
      daysIntoLease,
      alertLevel,
      blendedPace,
      todaysMiles
    };
  };

  // Prepare chart data
  const prepareChartData = (range: 'week' | 'month' | 'year'): MileageData[] => {
    if (readings.length === 0) return [];

    const sortedReadings = [...readings].sort((a, b) =>
      new Date(a.reading_date).getTime() - new Date(b.reading_date).getTime()
    );

    const dailyAllowance = vehicleConfig.annualAllowance / 365.25;
    const startMiles = sortedReadings[0].reading_miles;

    const endDate = new Date();
    let startDate = vehicleConfig.leaseStartDate;
    if (range === 'week') startDate = subDays(endDate, 7);
    else if (range === 'month') startDate = subDays(endDate, 30);
    else if (range === 'year') startDate = subDays(endDate, 365);

    const filtered = sortedReadings.filter(r => parseISO(r.reading_date) >= startDate);

    const labelFormat = range === 'year' ? 'MMM dd, yyyy' : 'MMM dd';

    return filtered.map(reading => {
      const readingDate = parseISO(reading.reading_date);
      const daysFromStart = differenceInDays(readingDate, vehicleConfig.leaseStartDate);
      const allowance = dailyAllowance * Math.max(0, daysFromStart);
      const actualMiles = reading.reading_miles - startMiles;

      return {
        date: readingDate.getTime(),
        label: format(readingDate, labelFormat),
        miles: actualMiles,
        allowance: allowance
      };
    });
  };


  interface StatsObject {
    currentMiles: number;
    totalMiles: number;
    dailyAllowance: number;
    allowanceToDate: number;
    overUnder: number;
    overUnderPct: number;
    daysIntoLease: number;
    alertLevel: string;
    blendedPace: {
      thirtyDayPace: number;
      ninetyDayPace: number;
      lifetimePace: number;
      blendedPace: number;
    } | null;
    todaysMiles: number;
  }

  const calculateGasStats = (statsObj: StatsObject) => {
    if (!gasPrice || readings.length === 0) return;

    const mpgValue = parseFloat(mpg) || 1;
    if (mpgValue <= 0) return;

    const milesInRange = (days: number) => {
      const cutoff = subDays(new Date(), days);
      const filtered = readings.filter(r => parseISO(r.reading_date) >= cutoff);
      if (filtered.length < 2) return 0;
      return filtered[filtered.length - 1].reading_miles - filtered[0].reading_miles;
    };

    const averagePrice = (days: number) => {
      const cutoff = subDays(new Date(), days);
      const relevant = priceHistory.filter(p => new Date(p.recorded_at) >= cutoff);
      if (relevant.length === 0) return gasPrice;
      return relevant.reduce((sum, p) => sum + p.price, 0) / relevant.length;
    };

    const spentWeek = (milesInRange(7) / mpgValue) * averagePrice(7);
    const spentMonth = (milesInRange(30) / mpgValue) * averagePrice(30);
    const spentQuarter = (milesInRange(90) / mpgValue) * averagePrice(90);

    const dailyPace = statsObj.blendedPace ? statsObj.blendedPace.blendedPace : 0;
    const forecastWeek = (dailyPace * 7 / mpgValue) * gasPrice;
    const forecastMonth = (dailyPace * 30 / mpgValue) * gasPrice;
    const forecastQuarter = (dailyPace * 90 / mpgValue) * gasPrice;

    setGasStats(prev => {
      const newStats = {
        spentWeek,
        spentMonth,
        spentQuarter,
        forecastWeek,
        forecastMonth,
        forecastQuarter
      };
      
      // Only update if values have actually changed
      if (JSON.stringify(prev) !== JSON.stringify(newStats)) {
        return newStats;
      }
      return prev;
    });
  };

  // Filter to only show future/active trips (end_date hasn't passed)
  const futureTripEvents = tripEvents.filter(trip => {
    const endDate = parseISO(trip.end_date);
    const today = startOfDay(new Date());
    return endDate >= today;
  });

  const stats: StatsObject = calculateStats();
  const futureTripMiles = futureTripEvents.reduce(
    (sum, trip) => sum + (trip.estimated_miles || 0),
    0
  );

  const availableMiles = stats.allowanceToDate - stats.totalMiles;
  const projectedAvailableMiles = availableMiles - futureTripMiles;

  const currentProgress = React.useMemo(
    () => calculateCenteredProgress(availableMiles),
    [availableMiles]
  );
  const projectedProgress = React.useMemo(
    () => calculateCenteredProgress(projectedAvailableMiles),
    [projectedAvailableMiles]
  );

  const formatMiles = (value: number) => {
    const rounded = Math.round(value);
    return Math.abs(rounded) === 0 ? '0' : rounded.toLocaleString();
  };

  const getAvailabilityColor = (value: number) => {
    if (value > 0) return 'text-emerald-400';
    if (value < 0) return 'text-rose-400';
    return 'text-foreground/70';
  };

  const renderCenteredProgress = (
    label: string,
    progress: CenteredProgress,
    description?: string
  ) => {
    const balanceLabel = progress.delta === 0
      ? 'On allowance'
      : progress.delta > 0
        ? `${formatMiles(progress.delta)} miles credit`
        : `${formatMiles(progress.debt)} miles debt`;
    const balanceClass = progress.delta === 0
      ? 'text-foreground/70'
      : progress.delta > 0
        ? 'text-emerald-400'
        : 'text-rose-400';

    const creditWidth = progress.range === 0 ? 0 : Math.min(50, (progress.credit / progress.range) * 50);
    const debtWidth = progress.range === 0 ? 0 : Math.min(50, (progress.debt / progress.range) * 50);

    return (
      <div className="space-y-3 rounded-[calc(var(--radius)*1.05)] bg-secondary/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-wide text-foreground/60">
          <span className="font-semibold text-foreground/80">{label}</span>
          <span>
            Scale: ±{progress.range.toLocaleString()} miles
          </span>
        </div>
        {description && (
          <div className="text-xs text-foreground/60">{description}</div>
        )}
        <div className={`text-sm font-semibold text-center ${balanceClass}`}>
          {balanceLabel}
        </div>
        <div className="relative h-3 overflow-hidden rounded-full bg-card/70 hairline-top hairline-bottom">
          <div className="absolute inset-y-0 left-1/2 w-px bg-foreground/10" />
          {debtWidth > 0 && (
            <div
              className="absolute right-1/2 top-0 h-full rounded-l-full bg-rose-500/80 transition-all duration-500"
              style={{ width: `${debtWidth}%` }}
            />
          )}
          {creditWidth > 0 && (
            <div
              className="absolute left-1/2 top-0 h-full rounded-r-full bg-emerald-400/90 transition-all duration-500"
              style={{ width: `${creditWidth}%` }}
            />
          )}
        </div>
        <div className="flex justify-between text-xs text-foreground/60">
          <span className="text-rose-400">Debt: {formatMiles(progress.debt)} mi</span>
          <span className="text-emerald-400">Credit: {formatMiles(progress.credit)} mi</span>
        </div>
      </div>
    );
  };

  const availableColor = getAvailabilityColor(availableMiles);
  const projectedAvailableColor = getAvailabilityColor(projectedAvailableMiles);
  const totalLeaseDays = differenceInDays(
    vehicleConfig.leaseEndDate,
    vehicleConfig.leaseStartDate
  );
  const leaseProgressPercent = Math.min(
    100,
    Math.max(0, (stats.daysIntoLease / totalLeaseDays) * 100)
  );
  const chartData = prepareChartData(timeRange);
  const weeklyTrend = React.useMemo<WeeklyMileageData[]>(() => {
    if (readings.length < 2) return [] as WeeklyMileageData[];

    const sortedReadings = [...readings].sort(
      (a, b) => new Date(a.reading_date).getTime() - new Date(b.reading_date).getTime()
    );
    const dailyAllowance = vehicleConfig.annualAllowance / 365.25;
    const weekMap = new Map<number, { start: Date; miles: number }>();

    for (let i = 1; i < sortedReadings.length; i += 1) {
      const previous = sortedReadings[i - 1];
      const current = sortedReadings[i];
      const delta = current.reading_miles - previous.reading_miles;
      if (!Number.isFinite(delta) || delta <= 0) continue;

      const currentDate = parseISO(current.reading_date);
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
      const key = weekStart.getTime();
      if (!weekMap.has(key)) {
        weekMap.set(key, { start: weekStart, miles: 0 });
      }
      const entry = weekMap.get(key);
      if (entry) {
        entry.miles += delta;
      }
    }

    return Array.from(weekMap.values())
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .map(({ start, miles }) => {
        const weekEnd = addDays(start, 6);
        return {
          weekStart: start.getTime(),
          label: `${format(start, 'MMM d')} - ${format(weekEnd, 'MMM d')}`,
          miles,
          allowance: dailyAllowance * 7
        };
      });
  }, [readings, vehicleConfig.annualAllowance]);
  const totalWeeklyPages = Math.ceil(weeklyTrend.length / WEEKS_PER_PAGE);

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(weeklyTrend.length / WEEKS_PER_PAGE) - 1);
    if (weekPage > maxPage) {
      setWeekPage(maxPage);
    }
  }, [weekPage, weeklyTrend.length]);

  const visibleWeeklyData = React.useMemo(() => {
    if (weeklyTrend.length === 0) return [];
    const total = weeklyTrend.length;
    const start = Math.max(0, total - (weekPage + 1) * WEEKS_PER_PAGE);
    const end = Math.max(start, total - weekPage * WEEKS_PER_PAGE);
    return weeklyTrend.slice(start, end);
  }, [weekPage, weeklyTrend]);

  const canGoToPreviousWeeks = weekPage < Math.max(0, totalWeeklyPages - 1);
  const canGoToNextWeeks = weekPage > 0;
  const weeklyProjectionData = React.useMemo<WeeklyProjectionPoint[]>(() => {
    if (weeklyTrend.length === 0) {
      return [];
    }

    const sorted = [...weeklyTrend].sort((a, b) => a.weekStart - b.weekStart);
    const recentWeeks = sorted.slice(-4);

    if (recentWeeks.length === 0) {
      return [];
    }

    const averageMiles = recentWeeks.reduce((acc, week) => acc + week.miles, 0) / recentWeeks.length;

    let slope = 0;
    let intercept = averageMiles;

    if (recentWeeks.length >= 2) {
      const indices = recentWeeks.map((_, index) => index);
      const sumX = indices.reduce((acc, value) => acc + value, 0);
      const sumY = recentWeeks.reduce((acc, value) => acc + value.miles, 0);
      const sumXY = recentWeeks.reduce((acc, value, index) => acc + index * value.miles, 0);
      const sumX2 = indices.reduce((acc, value) => acc + value * value, 0);
      const denominator = recentWeeks.length * sumX2 - sumX * sumX;

      if (denominator !== 0) {
        slope = (recentWeeks.length * sumXY - sumX * sumY) / denominator;
        intercept = (sumY - slope * sumX) / recentWeeks.length;
      }
    }

    const lastWeekStartDate = new Date(sorted[sorted.length - 1].weekStart);

    return Array.from({ length: 4 }, (_, index) => {
      const projectionIndex = recentWeeks.length + index;
      const projectedWeekStart = addDays(lastWeekStartDate, (index + 1) * 7);
      const projectedWeekEnd = addDays(projectedWeekStart, 6);
      const projectedMiles = Math.max(0, intercept + slope * projectionIndex);

      return {
        weekStart: projectedWeekStart.getTime(),
        label: `${format(projectedWeekStart, 'MMM d')} - ${format(projectedWeekEnd, 'MMM d')}`,
        projected: projectedMiles
      };
    });
  }, [weeklyTrend]);
  const lineDomain = React.useMemo(() => {
    if (!chartData.length) return undefined;
    const last = chartData[chartData.length - 1];
    const minVal = Math.max(0, Math.min(last.miles, last.allowance) - 1000);
    const maxVal = Math.max(last.miles, last.allowance) + 1000;
    return [minVal, maxVal] as [number, number];
  }, [chartData]);
  const gasChartData = [
    { label: 'Week', spent: gasStats.spentWeek, forecast: gasStats.forecastWeek },
    { label: 'Month', spent: gasStats.spentMonth, forecast: gasStats.forecastMonth },
    { label: 'Quarter', spent: gasStats.spentQuarter, forecast: gasStats.forecastQuarter }
  ];
  const gasPriceTrend = React.useMemo(() => {
    if (!priceHistory.length) {
      return [];
    }

    const cutoff = subDays(new Date(), 30);
    const dailyBuckets = new Map<string, { date: Date; total: number; count: number }>();

    priceHistory.forEach((entry) => {
      const recordedAt = new Date(entry.recorded_at);

      if (recordedAt < cutoff) {
        return;
      }

      const key = format(recordedAt, 'yyyy-MM-dd');
      const bucket = dailyBuckets.get(key);

      if (bucket) {
        bucket.total += entry.price;
        bucket.count += 1;
      } else {
        dailyBuckets.set(key, { date: recordedAt, total: entry.price, count: 1 });
      }
    });

    return Array.from(dailyBuckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, bucket]) => ({
        label: format(bucket.date, 'MMM d'),
        price: bucket.total / bucket.count
      }));
  }, [priceHistory]);

  useEffect(() => {
    calculateGasStats(stats);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gasPrice, priceHistory, readings, mpg]);


  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-foreground/70">Loading mileage data...</div>
      </div>
    );
  }

  const hasReadings = readings.length > 0;
  const alertKey = (['green', 'yellow', 'orange', 'red'].includes(stats.alertLevel)
    ? stats.alertLevel
    : 'green') as 'green' | 'yellow' | 'orange' | 'red';

  const alertStyles: Record<
    'green' | 'yellow' | 'orange' | 'red',
    { label: string; description: string; chipClass: string; accentClass: string }
  > = {
    green: {
      label: 'On Track',
      description: 'Your mileage is pacing comfortably within your allowance.',
      chipClass: 'bg-emerald-500/15 text-emerald-300',
      accentClass: 'from-emerald-500/25 to-transparent'
    },
    yellow: {
      label: 'Slightly Over',
      description: 'You are nudging past the allowance—consider easing mileage soon.',
      chipClass: 'bg-amber-400/20 text-amber-200',
      accentClass: 'from-amber-400/25 to-transparent'
    },
    orange: {
      label: 'Warning',
      description: 'Mileage pace is trending high. Plan a lighter driving stretch.',
      chipClass: 'bg-orange-500/20 text-orange-200',
      accentClass: 'from-orange-500/25 to-transparent'
    },
    red: {
      label: 'Over Limit',
      description: 'You are tracking over the allowance. Adjust upcoming trips to recover.',
      chipClass: 'bg-rose-500/20 text-rose-200',
      accentClass: 'from-rose-500/25 to-transparent'
    }
  };

  const statusTokens = alertStyles[alertKey];

  return (
    <div className="relative min-h-screen">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 pb-20 pt-12 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="space-y-4">
              <span className="inline-flex w-fit items-center rounded-full bg-secondary/70 px-4 py-1 text-xs font-semibold uppercase tracking-[0.35em] text-foreground/60">
                Miles Ahead
              </span>
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold leading-tight md:text-4xl">Mileage Command Center</h1>
                <p className="max-w-xl text-sm text-foreground/70">
                  A calm overview of your driving life—snapshot summaries, forecasts, and planning in one place.
                </p>
              </div>
            </div>
            <div className="flex w-full flex-col gap-3 rounded-[calc(var(--radius)*1.05)] bg-secondary/50 p-4 shadow-ambient backdrop-blur md:w-auto md:flex-row md:items-center md:justify-end md:bg-transparent md:p-0 md:shadow-none">
              <Button asChild variant="outline" className="w-full md:w-auto">
                <Link href="/settings">Settings</Link>
              </Button>
              <ThemeToggle />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="elev-2 space-y-2 p-5 sm:p-6">
              <div className="text-xs font-semibold uppercase tracking-wide text-foreground/60">Current balance</div>
              <div className={`text-3xl font-semibold ${availableColor}`}>
                {formatMiles(availableMiles)}
              </div>
              <div className="text-xs text-foreground/60">vs. allowance to date</div>
            </Card>
            <Card className="elev-2 space-y-2 p-5 sm:p-6">
              <div className="text-xs font-semibold uppercase tracking-wide text-foreground/60">After planned trips</div>
              <div className={`text-3xl font-semibold ${projectedAvailableColor}`}>
                {formatMiles(projectedAvailableMiles)}
              </div>
              <div className="text-xs text-foreground/60">
                Includes {formatMiles(futureTripMiles)} mi of scheduled driving
              </div>
            </Card>
            <Card className="elev-2 space-y-2 p-5 sm:p-6">
              <div className="text-xs font-semibold uppercase tracking-wide text-foreground/60">Miles driven</div>
              <div className="text-3xl font-semibold text-foreground">
                {stats.totalMiles.toLocaleString()}
              </div>
              <div className="text-xs text-foreground/60">Allowance to date: {Math.round(stats.allowanceToDate).toLocaleString()} mi</div>
            </Card>
            <Card className="elev-2 space-y-2 p-5 sm:p-6">
              <div className="text-xs font-semibold uppercase tracking-wide text-foreground/60">Today&apos;s pace</div>
              <div className="text-3xl font-semibold text-foreground">
                {stats.todaysMiles.toLocaleString()}
              </div>
              <div className="text-xs text-foreground/60">Daily allowance {Math.round(stats.dailyAllowance).toLocaleString()} mi</div>
            </Card>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.6fr,1fr]">
          <Card className="elev-2 overflow-hidden shadow-dual">
            <CardHeader className="flex flex-col gap-4 pb-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-xl font-semibold text-foreground">Mileage posture</CardTitle>
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusTokens.chipClass}`}>
                  {statusTokens.label}
                </span>
              </div>
              <p className="text-sm text-foreground/70">{statusTokens.description}</p>
            </CardHeader>
            <CardContent className="space-y-8 pb-8">
              <div className={`rounded-[calc(var(--radius)*1.2)] bg-gradient-to-r ${statusTokens.accentClass} p-[1px]`}>
                <div className="rounded-[calc(var(--radius)*1.2)] bg-card/80 p-6 backdrop-blur">
                  <div className="space-y-6">
                    {renderCenteredProgress('Current balance', currentProgress)}
                    {renderCenteredProgress(
                      'Planned trip outlook',
                      projectedProgress,
                      futureTripMiles > 0
                        ? `Includes ${formatMiles(futureTripMiles)} mi of planned trips`
                        : 'No planned trips scheduled'
                    )}
                  </div>
                </div>
              </div>

              {hasReadings && stats.blendedPace && (
                <div className="grid gap-4 rounded-[calc(var(--radius)*1.1)] bg-secondary/60 p-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="text-center sm:text-left">
                    <div className="text-xs uppercase tracking-wide text-foreground/60">Today&apos;s miles</div>
                    <div className="mt-1 text-xl font-semibold text-foreground">{stats.todaysMiles.toLocaleString()}</div>
                  </div>
                  <div className="text-center sm:text-left">
                    <div className="text-xs uppercase tracking-wide text-foreground/60">30-day pace</div>
                    <div className="mt-1 text-xl font-semibold text-foreground">{stats.blendedPace.thirtyDayPace.toFixed(1)}</div>
                  </div>
                  <div className="text-center sm:text-left">
                    <div className="text-xs uppercase tracking-wide text-foreground/60">90-day pace</div>
                    <div className="mt-1 text-xl font-semibold text-foreground">{stats.blendedPace.ninetyDayPace.toFixed(1)}</div>
                  </div>
                  <div className="text-center sm:text-left">
                    <div className="text-xs uppercase tracking-wide text-foreground/60">Lifetime pace</div>
                    <div className="mt-1 text-xl font-semibold text-foreground">{stats.blendedPace.lifetimePace.toFixed(1)}</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="elev-2 shadow-ambient">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-foreground">Lease timeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-foreground/70">
                <div className="flex items-center justify-between text-foreground">
                  <span>Lease start</span>
                  <span>{format(vehicleConfig.leaseStartDate, 'MMM dd, yyyy')}</span>
                </div>
                <div className="flex items-center justify-between text-foreground">
                  <span>Lease end</span>
                  <span>{format(vehicleConfig.leaseEndDate, 'MMM dd, yyyy')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Annual allowance</span>
                  <span>{vehicleConfig.annualAllowance.toLocaleString()} mi</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Daily allowance</span>
                  <span>{Math.round(stats.dailyAllowance).toLocaleString()} mi</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Lease progress</span>
                  <span>{Math.max(0, stats.daysIntoLease)} / {totalLeaseDays} days</span>
                </div>
                <Progress value={leaseProgressPercent} className="h-2" />
              </CardContent>
            </Card>

            <Card className="elev-2 shadow-ambient">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-foreground">Trip impact</CardTitle>
              </CardHeader>
              <CardContent>
                {futureTripEvents.length > 0 ? (
                  <div className="space-y-4 text-sm">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-foreground/60">Planned miles</div>
                      <div className="mt-1 text-2xl font-semibold text-foreground">
                        {futureTripMiles.toLocaleString()} mi
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-foreground/60">Projected balance</div>
                      <div className={`mt-1 text-lg font-semibold ${
                        (stats.overUnder + futureTripMiles) > 0 ? 'text-rose-300' : 'text-emerald-300'
                      }`}>
                        {(stats.overUnder + futureTripMiles) > 0 ? '+' : ''}
                        {Math.round(stats.overUnder + futureTripMiles).toLocaleString()} mi
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-foreground/60">No upcoming trips. Add a plan to see its effect.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="space-y-5">
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-foreground">Mileage intelligence</h2>
            <p className="text-sm text-foreground/70">Dive deeper into your trends, plan new journeys, or revisit your odometer history.</p>
          </div>

          <Tabs defaultValue="dashboard" className="space-y-5">
            <TabsList className="grid w-full grid-cols-3 gap-1 rounded-full bg-secondary/60 p-1 shadow-ambient">
              <TabsTrigger className="text-xs font-semibold uppercase tracking-wide" value="dashboard">
                Dashboard
              </TabsTrigger>
              <TabsTrigger className="text-xs font-semibold uppercase tracking-wide" value="trips">
                Plan Trips
              </TabsTrigger>
              <TabsTrigger className="text-xs font-semibold uppercase tracking-wide" value="history">
                History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard" className="space-y-5">
              <Card className="elev-2 shadow-ambient">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-base font-semibold text-foreground">Mileage tracking chart</CardTitle>
                  <div className="flex items-center gap-1 rounded-full bg-secondary/60 p-1">
                    <button
                      onClick={() => setTimeRange('week')}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        timeRange === 'week'
                          ? 'bg-background text-foreground shadow-dual'
                          : 'text-foreground/60 hover:text-foreground'
                      }`}
                      type="button"
                    >
                      Week
                    </button>
                    <button
                      onClick={() => setTimeRange('month')}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        timeRange === 'month'
                          ? 'bg-background text-foreground shadow-dual'
                          : 'text-foreground/60 hover:text-foreground'
                      }`}
                      type="button"
                    >
                      Month
                    </button>
                    <button
                      onClick={() => setTimeRange('year')}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        timeRange === 'year'
                          ? 'bg-background text-foreground shadow-dual'
                          : 'text-foreground/60 hover:text-foreground'
                      }`}
                      type="button"
                    >
                      Year
                    </button>
                  </div>
                </CardHeader>
                <CardContent>
                  {chartData.length > 0 ? (
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                          <XAxis
                            dataKey="date"
                            type="number"
                            domain={['dataMin', 'dataMax']}
                            scale="time"
                            stroke="rgba(148,163,184,0.6)"
                            tick={{ fill: '#cbd5f5' }}
                            tickFormatter={(value: number) => {
                              const date = new Date(value);
                              return timeRange === 'year'
                                ? format(date, 'MMM yy')
                                : format(date, 'MMM dd');
                            }}
                            allowDuplicatedCategory={false}
                          />
                          <YAxis stroke="rgba(148,163,184,0.6)" tick={{ fill: '#cbd5f5' }} domain={lineDomain as [number, number] | undefined} />
                          <Tooltip
                            labelFormatter={(value: number, payload) => {
                              const fromPayload = payload?.[0]?.payload?.label;
                              if (fromPayload) return fromPayload;
                              const date = new Date(value);
                              return timeRange === 'year'
                                ? format(date, 'MMM dd, yyyy')
                                : format(date, 'MMM dd');
                            }}
                            formatter={(value: number, name: string) => [
                              `${Math.round(value).toLocaleString()} miles`,
                              name
                            ]}
                          />
                          <Line
                            type="monotone"
                            dataKey="miles"
                            stroke="#60a5fa"
                            strokeWidth={2}
                            dot={false}
                            name="Actual Miles"
                          />
                          <Line
                            type="monotone"
                            dataKey="allowance"
                            stroke="#fb923c"
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            dot={false}
                            name="Allowance"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="flex h-80 items-center justify-center text-sm text-foreground/60">
                      No mileage data available. Add your first odometer reading to get started!
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="elev-2 shadow-ambient">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-base font-semibold text-foreground">Weekly mileage trend</CardTitle>
                  {weeklyTrend.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-xs text-foreground/60 sm:text-sm">
                        Page {Math.min(weekPage + 1, Math.max(totalWeeklyPages, 1))} of {Math.max(totalWeeklyPages, 1)}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setWeekPage(prev => Math.min(prev + 1, Math.max(totalWeeklyPages - 1, 0)))}
                          disabled={!canGoToPreviousWeeks}
                        >
                          Previous 4 Weeks
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setWeekPage(prev => Math.max(prev - 1, 0))}
                          disabled={!canGoToNextWeeks}
                        >
                          Next 4 Weeks
                        </Button>
                      </div>
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  {visibleWeeklyData.length > 0 ? (
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={visibleWeeklyData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                          <XAxis dataKey="label" stroke="rgba(148,163,184,0.6)" tick={{ fill: '#cbd5f5' }} />
                          <YAxis stroke="rgba(148,163,184,0.6)" tick={{ fill: '#cbd5f5' }} />
                          <Tooltip
                            formatter={(value: number, _name: string, info?: Payload<number, string>) => [
                              `${Math.round(value).toLocaleString()} miles`,
                              info?.dataKey === 'allowance' ? 'Weekly Allowance' : 'Actual Miles'
                            ]}
                          />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="miles"
                            stroke="#34d399"
                            strokeWidth={2}
                            dot
                            name="Actual Miles"
                          />
                          <Line
                            type="monotone"
                            dataKey="allowance"
                            stroke="#fb923c"
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            dot={false}
                            name="Weekly Allowance"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="flex h-80 items-center justify-center text-sm text-foreground/60">
                      Not enough mileage data to calculate week-over-week trends.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="elev-2 shadow-ambient">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-base font-semibold text-foreground">Projected weekly mileage</CardTitle>
                  <div className="text-xs text-foreground/60 sm:text-sm">
                    Projection for the next 4 weeks using the most recent 4 weeks of mileage data.
                  </div>
                </CardHeader>
                <CardContent>
                  {weeklyProjectionData.length > 0 ? (
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={weeklyProjectionData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                          <XAxis dataKey="label" stroke="rgba(148,163,184,0.6)" tick={{ fill: '#cbd5f5' }} interval={0} angle={-20} textAnchor="end" height={80} />
                          <YAxis stroke="rgba(148,163,184,0.6)" tick={{ fill: '#cbd5f5' }} />
                          <Tooltip
                            formatter={(value: ValueType) => {
                              if (typeof value !== 'number') {
                                return value;
                              }
                              return [`${Math.round(value).toLocaleString()} miles`, 'Projected pace'];
                            }}
                          />
                          <Line type="monotone" dataKey="projected" stroke="#818cf8" strokeWidth={2} dot />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="flex h-80 items-center justify-center text-sm text-foreground/60">
                      Add a few weeks of readings to unlock projections.
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="trips">
              <div className="grid gap-5 lg:grid-cols-[1.3fr,1fr]">
                <Card className="elev-2 shadow-ambient">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold text-foreground">Add planned trip</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleAddTrip} className="space-y-4">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <Label htmlFor="trip-name">Trip name</Label>
                          <Input
                            id="trip-name"
                            value={newTrip.name}
                            onChange={(e) => setNewTrip(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="Family vacation, road trip, etc."
                          />
                        </div>
                        <div>
                          <Label htmlFor="trip-start">Start date</Label>
                          <Input
                            id="trip-start"
                            type="date"
                            value={newTrip.startDate}
                            onChange={(e) => setNewTrip(prev => ({ ...prev, startDate: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="trip-end">End date</Label>
                          <Input
                            id="trip-end"
                            type="date"
                            value={newTrip.endDate}
                            onChange={(e) => setNewTrip(prev => ({ ...prev, endDate: e.target.value }))}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Label htmlFor="trip-miles">Estimated miles</Label>
                          <Input
                            id="trip-miles"
                            value={newTrip.estimatedMiles}
                            onChange={(e) => setNewTrip(prev => ({ ...prev, estimatedMiles: e.target.value }))}
                            placeholder="Enter miles"
                          />
                        </div>
                      </div>
                      <Button type="submit" className="w-full rounded-full px-6 sm:w-auto">
                        Add trip
                      </Button>
                    </form>
                  </CardContent>
                </Card>

                <Card className="elev-2 shadow-ambient">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold text-foreground">Upcoming trips</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {futureTripEvents.length > 0 ? (
                      <div className="space-y-3">
                        {futureTripEvents.map((trip) => (
                          <div key={trip.id} className="flex items-start justify-between gap-3 rounded-[calc(var(--radius)*0.9)] bg-secondary/60 p-3">
                            <div className="space-y-1">
                              <div className="text-sm font-medium text-foreground">{trip.event_name}</div>
                              <div className="text-xs text-foreground/60">
                                {format(parseISO(trip.start_date), 'MMM dd')} - {format(parseISO(trip.end_date), 'MMM dd, yyyy')}
                              </div>
                              <div className="text-xs text-foreground/60">
                                {trip.estimated_miles.toLocaleString()} miles planned
                              </div>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteTrip(trip.id)}>
                              Remove
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-[calc(var(--radius)*0.9)] border border-dashed border-border/50 p-6 text-center text-sm text-foreground/60">
                        No upcoming trips.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="history">
              <Card className="elev-2 shadow-ambient">
                <CardHeader>
                  <CardTitle className="text-base font-semibold text-foreground">Reading history</CardTitle>
                </CardHeader>
                <CardContent>
                  {readings.length > 0 ? (
                    <div className="space-y-3">
                      {readings.slice().reverse().map((reading) => (
                        <div key={reading.id} className="rounded-[calc(var(--radius)*0.9)] bg-secondary/60 p-4">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <div className="text-sm font-medium text-foreground">
                              {(reading.daily_miles ?? 0).toLocaleString()} miles
                            </div>
                            <div className="text-xs text-foreground/60">{reading.reading_miles.toLocaleString()} total</div>
                          </div>
                          <div className="mt-1 text-xs text-foreground/60">
                            {format(parseISO(reading.reading_date), 'MMM dd, yyyy')}
                          </div>
                          {reading.note && (
                            <div className="mt-2 text-xs italic text-foreground/60">{reading.note}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-[calc(var(--radius)*0.9)] border border-dashed border-border/50 p-8 text-center text-sm text-foreground/60">
                      No readings recorded yet. Add your first reading to get started!
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr,1fr]">
          <Card className="elev-2 shadow-ambient">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base font-semibold text-foreground">Gas costs</CardTitle>
              <div className="flex items-center gap-3">
                <Input
                  value={stationId}
                  onChange={(e) => setStationId(e.target.value)}
                  placeholder="Station ID"
                  className="w-28"
                />
                {gasPrice && (
                  <div className="text-lg font-semibold text-foreground">
                    ${gasPrice.toFixed(2)}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-4 text-center sm:grid-cols-3">
                <div>
                  <div className="text-lg font-semibold text-foreground">${gasStats.spentWeek.toFixed(2)}</div>
                  <div className="text-xs text-foreground/60">Spent last week</div>
                </div>
                <div>
                  <div className="text-lg font-semibold text-foreground">${gasStats.spentMonth.toFixed(2)}</div>
                  <div className="text-xs text-foreground/60">Spent last month</div>
                </div>
                <div>
                  <div className="text-lg font-semibold text-foreground">${gasStats.spentQuarter.toFixed(2)}</div>
                  <div className="text-xs text-foreground/60">Spent last quarter</div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 text-center sm:grid-cols-3">
                <div>
                  <div className="text-lg font-semibold text-foreground">${gasStats.forecastWeek.toFixed(2)}</div>
                  <div className="text-xs text-foreground/60">Forecast next week</div>
                </div>
                <div>
                  <div className="text-lg font-semibold text-foreground">${gasStats.forecastMonth.toFixed(2)}</div>
                  <div className="text-xs text-foreground/60">Forecast next month</div>
                </div>
                <div>
                  <div className="text-lg font-semibold text-foreground">${gasStats.forecastQuarter.toFixed(2)}</div>
                  <div className="text-xs text-foreground/60">Forecast next quarter</div>
                </div>
              </div>
              <div className="h-40">
                {gasPriceTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={gasPriceTrend} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                      <XAxis dataKey="label" minTickGap={16} stroke="rgba(148,163,184,0.6)" tick={{ fill: '#cbd5f5' }} />
                      <YAxis
                        width={40}
                        domain={["dataMin", "dataMax"]}
                        tickFormatter={(value) => `$${(value as number).toFixed(2)}`}
                        stroke="rgba(148,163,184,0.6)"
                        tick={{ fill: '#cbd5f5' }}
                      />
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                      <Tooltip
                        formatter={(value: number | string) => [`$${Number(value).toFixed(2)}`, 'Price']}
                        labelFormatter={(label) => `Recorded ${label}`}
                      />
                      <Line type="monotone" dataKey="price" stroke="#60a5fa" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-foreground/60">
                    No gas price data for the past month.
                  </div>
                )}
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={gasChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                    <XAxis dataKey="label" stroke="rgba(148,163,184,0.6)" tick={{ fill: '#cbd5f5' }} />
                    <YAxis stroke="rgba(148,163,184,0.6)" tick={{ fill: '#cbd5f5' }} />
                    <Tooltip formatter={(value: number) => [`$${(value as number).toFixed(2)}`, '']} />
                    <Legend />
                    <Bar dataKey="spent" fill="#8884d8" name="Spent" />
                    <Bar dataKey="forecast" fill="#82ca9d" name="Forecast" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="elev-2 shadow-ambient">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-foreground">Quick notes</CardTitle>
              <CardDescription className="text-foreground/60">Keep an eye on spend and balance at a glance.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-foreground/70">
              <div className="rounded-[calc(var(--radius)*0.9)] bg-secondary/60 p-4">
                <div className="text-xs uppercase tracking-wide text-foreground/60">Allowance balance</div>
                <div className={`mt-1 text-lg font-semibold ${availableColor}`}>
                  {formatMiles(availableMiles)} mi remaining
                </div>
              </div>
              <div className="rounded-[calc(var(--radius)*0.9)] bg-secondary/60 p-4">
                <div className="text-xs uppercase tracking-wide text-foreground/60">Planned trips</div>
                <div className="mt-1 text-lg font-semibold text-foreground">
                  {futureTripEvents.length} scheduled
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <OdometerButton onAddReading={handleOdometerButtonAdd} />
      </div>
    </div>
  );
}
