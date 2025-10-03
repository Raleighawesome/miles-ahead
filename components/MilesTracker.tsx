"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
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

  const prepareForecastData = () => {
    if (!stats.blendedPace) return [];
    const horizons = [
      { label: '1M', days: 30 },
      { label: '3M', days: 90 },
      { label: '6M', days: 182 },
      { label: '1Y', days: 365 }
    ];
    return horizons.map(h => {
      const projected = stats.currentMiles + stats.blendedPace!.blendedPace * h.days;
      const allowance = stats.dailyAllowance * (stats.daysIntoLease + h.days);
      return { horizon: h.label, projected, allowance };
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
    if (value > 0) return 'text-green-600';
    if (value < 0) return 'text-red-600';
    return 'text-gray-600';
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
      ? 'text-gray-600'
      : progress.delta > 0
        ? 'text-green-600'
        : 'text-red-600';

    const creditWidth = progress.range === 0 ? 0 : Math.min(50, (progress.credit / progress.range) * 50);
    const debtWidth = progress.range === 0 ? 0 : Math.min(50, (progress.debt / progress.range) * 50);

    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-medium">{label}</span>
          <span className="text-xs text-gray-500">
            Scale: ±{progress.range.toLocaleString()} miles
          </span>
        </div>
        {description && (
          <div className="text-xs text-gray-500">{description}</div>
        )}
        <div className={`text-sm font-semibold text-center ${balanceClass}`}>
          {balanceLabel}
        </div>
        <div className="relative h-3 overflow-hidden rounded-full bg-muted">
          <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
          {debtWidth > 0 && (
            <div
              className="absolute right-1/2 top-0 h-full rounded-l-full bg-red-500 transition-all duration-500"
              style={{ width: `${debtWidth}%` }}
            />
          )}
          {creditWidth > 0 && (
            <div
              className="absolute left-1/2 top-0 h-full rounded-r-full bg-green-500 transition-all duration-500"
              style={{ width: `${creditWidth}%` }}
            />
          )}
        </div>
        <div className="flex justify-between text-xs text-gray-500">
          <span className="text-red-600">Debt: {formatMiles(progress.debt)} mi</span>
          <span className="text-green-600">Credit: {formatMiles(progress.credit)} mi</span>
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
  const forecastData = prepareForecastData();
  const lineDomain = React.useMemo(() => {
    if (!chartData.length) return undefined;
    const last = chartData[chartData.length - 1];
    const minVal = Math.max(0, Math.min(last.miles, last.allowance) - 1000);
    const maxVal = Math.max(last.miles, last.allowance) + 1000;
    return [minVal, maxVal] as [number, number];
  }, [chartData]);
  const forecastDomain = React.useMemo(() => {
    if (!forecastData.length) return undefined;
    interface ForecastDataItem {
      horizon: string;
      projected: number;
      allowance: number;
    }
    const last = forecastData[forecastData.length - 1] as ForecastDataItem;
    const minVal = Math.max(0, Math.min(last.projected ?? 0, last.allowance ?? 0) - 1000);
    const maxVal = Math.max(last.projected ?? 0, last.allowance ?? 0) + 1000;
    return [minVal, maxVal] as [number, number];
  }, [forecastData]);
  const gasChartData = [
    { label: 'Week', spent: gasStats.spentWeek, forecast: gasStats.forecastWeek },
    { label: 'Month', spent: gasStats.spentMonth, forecast: gasStats.forecastMonth },
    { label: 'Quarter', spent: gasStats.spentQuarter, forecast: gasStats.forecastQuarter }
  ];

  useEffect(() => {
    calculateGasStats(stats);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gasPrice, priceHistory, readings, mpg]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading mileage data...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="hidden md:block text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-300">
              Miles Ahead 🚗💎
            </h1>
            <p className="hidden md:block text-muted-foreground mt-2">
              Stay miles ahead of your lease allowance with smart vehicle mileage tracking
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline"><Link href="/settings">Settings</Link></Button>
            <ThemeToggle />
          </div>
        </div>
      </div>

      {/* 1. Mileage Progress */}
      {readings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Mileage Progress</span>
              <span className={`text-sm font-medium px-2 py-1 rounded ${
                stats.alertLevel === 'green' ? 'bg-green-100 text-green-800' :
                stats.alertLevel === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                stats.alertLevel === 'orange' ? 'bg-orange-100 text-orange-800' :
                'bg-red-100 text-red-800'
              }`}>
                {stats.alertLevel === 'green' ? 'On Track' :
                 stats.alertLevel === 'yellow' ? 'Slightly Over' :
                 stats.alertLevel === 'orange' ? 'Warning' :
                 'Over Limit'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-6">
              <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
                <span>{stats.totalMiles.toLocaleString()} miles driven</span>
                <span>{Math.round(stats.allowanceToDate).toLocaleString()} miles allowance to date</span>
              </div>
              {renderCenteredProgress('Current Balance', currentProgress)}
              {renderCenteredProgress(
                'Planned Trip Forecast',
                projectedProgress,
                futureTripMiles > 0
                  ? `Includes ${formatMiles(futureTripMiles)} mi of planned trips`
                  : 'No planned trips scheduled'
              )}
            </div>

            {stats.blendedPace && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
                <div className="text-center">
                  <div className="text-lg font-semibold">{stats.todaysMiles.toLocaleString()}</div>
                  <div className="text-xs text-gray-500">Today&apos;s Miles</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold">{stats.blendedPace.thirtyDayPace.toFixed(1)}</div>
                  <div className="text-xs text-gray-500">30-Day Pace</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold">{stats.blendedPace.ninetyDayPace.toFixed(1)}</div>
                  <div className="text-xs text-gray-500">90-Day Pace</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold">{stats.blendedPace.lifetimePace.toFixed(1)}</div>
                  <div className="text-xs text-gray-500">Lifetime Pace</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Over/Under Allowance and Total Miles Cards */}
      {readings.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Available</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className={`text-2xl font-bold ${availableColor}`}>
                  {formatMiles(availableMiles)}
                </div>
                <div className="text-xs text-gray-500">Planned trip forecast</div>
                <div className={`text-sm font-medium ${projectedAvailableColor}`}>
                  {formatMiles(projectedAvailableMiles)} projected
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Miles Driven</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalMiles.toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 2. Mileage Tracking Chart with Tabs */}
      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="trips">Plan Trips</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Mileage Tracking Chart</CardTitle>
              <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1 mt-3 sm:mt-0">
                <button
                  onClick={() => setTimeRange('week')}
                  className={`px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all duration-200 ${
                    timeRange === 'week'
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  Week
                </button>
                <button
                  onClick={() => setTimeRange('month')}
                  className={`px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all duration-200 ${
                    timeRange === 'month'
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  Month
                </button>
                <button
                  onClick={() => setTimeRange('year')}
                  className={`px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all duration-200 ${
                    timeRange === 'year'
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
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
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis
                        dataKey="date"
                        type="number"
                        domain={['dataMin', 'dataMax']}
                        scale="time"
                        stroke="#94a3b8"
                        tick={{ fill: '#94a3b8' }}
                        tickFormatter={(value: number) => {
                          const date = new Date(value);
                          return timeRange === 'year'
                            ? format(date, 'MMM yy')
                            : format(date, 'MMM dd');
                        }}
                        allowDuplicatedCategory={false}
                      />
                      <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} domain={lineDomain as [number, number] | undefined} />
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
                <div className="h-80 flex items-center justify-center text-gray-500">
                  No mileage data available. Add your first odometer reading to get started!
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Weekly Mileage Trend</CardTitle>
              {weeklyTrend.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-xs text-muted-foreground sm:text-sm">
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
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="label" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                      <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                      <Tooltip
                        formatter={(value: number, _name: string, info: any) => [
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
                <div className="h-80 flex items-center justify-center text-gray-500">
                  Not enough mileage data to calculate week-over-week trends.
                </div>
              )}
            </CardContent>
          </Card>

          {forecastData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Mileage Forecast</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={forecastData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="horizon" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                      <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} domain={forecastDomain as [number, number] | undefined} />
                      <Tooltip formatter={(value: number) => [value.toLocaleString() + ' miles', '']} />
                      <Legend />
                      <Bar dataKey="projected" fill="#60a5fa" name="Projected" />
                      <Bar dataKey="allowance" fill="#fb923c" name="Allowance" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>


        {/* Trip Planning Tab */}
        <TabsContent value="trips">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Plan Future Trips</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddTrip} className="space-y-4">
                  <div>
                    <Label htmlFor="tripName">Trip Name</Label>
                    <Input
                      id="tripName"
                      type="text"
                      value={newTrip.name}
                      onChange={(e) => setNewTrip(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g. Weekend getaway, business trip"
                      required
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="startDate">Start Date</Label>
                      <Input
                        id="startDate"
                        type="date"
                        value={newTrip.startDate}
                        onChange={(e) => setNewTrip(prev => ({ ...prev, startDate: e.target.value }))}
                        required
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="endDate">End Date</Label>
                      <Input
                        id="endDate"
                        type="date"
                        value={newTrip.endDate}
                        onChange={(e) => setNewTrip(prev => ({ ...prev, endDate: e.target.value }))}
                        required
                      />
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="estimatedMiles">Estimated Miles</Label>
                    <Input
                      id="estimatedMiles"
                      type="number"
                      value={newTrip.estimatedMiles}
                      onChange={(e) => setNewTrip(prev => ({ ...prev, estimatedMiles: e.target.value }))}
                      placeholder="e.g. 500"
                      required
                    />
                  </div>
                  
                  <Button type="submit" className="w-full">
                    Add Trip
                  </Button>
                </form>
              </CardContent>
            </Card>

            {tripEvents.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Trip Events</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {tripEvents.map((trip) => {
                      const endDate = parseISO(trip.end_date);
                      const today = startOfDay(new Date());
                      const isPastTrip = endDate < today;
                      
                      return (
                        <div key={trip.id} className={`p-4 border rounded-lg ${isPastTrip ? 'opacity-50 bg-gray-50' : ''}`}>
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className={`font-medium ${isPastTrip ? 'text-gray-500' : ''}`}>
                                {trip.event_name} {isPastTrip && '(Completed)'}
                              </h4>
                              <p className={`text-sm ${isPastTrip ? 'text-gray-400' : 'text-gray-600'}`}>
                                {format(parseISO(trip.start_date), 'MMM dd')} - {format(parseISO(trip.end_date), 'MMM dd, yyyy')}
                              </p>
                              <p className={`text-sm ${isPastTrip ? 'text-gray-400' : 'text-gray-500'}`}>
                                Estimated: {(trip.estimated_miles || 0).toLocaleString()} miles
                              </p>
                            </div>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleDeleteTrip(trip.id)}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Trip Impact Forecast</CardTitle>
              </CardHeader>
              <CardContent>
                {futureTripEvents.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Total Planned Miles:</span>
                      <span className="font-medium">
                        {futureTripEvents.reduce((sum, trip) => sum + (trip.estimated_miles || 0), 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Impact on Mileage Bank:</span>
                      <span className={`font-medium ${
                        (stats.overUnder + futureTripEvents.reduce((sum, trip) => sum + (trip.estimated_miles || 0), 0)) > 0 
                          ? 'text-red-600' 
                          : 'text-green-600'
                      }`}>
                        {stats.overUnder + futureTripEvents.reduce((sum, trip) => sum + (trip.estimated_miles || 0), 0) > 0 ? '+' : ''}
                        {Math.round(stats.overUnder + futureTripEvents.reduce((sum, trip) => sum + (trip.estimated_miles || 0), 0)).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">
                    No trips planned. Add a trip above to see its impact on your mileage allowance.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Reading History</CardTitle>
            </CardHeader>
            <CardContent>
              {readings.length > 0 ? (
                <div className="space-y-2">
                  {readings.slice().reverse().map((reading) => (
                    <div key={reading.id} className="flex justify-between items-center p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">
                          {(reading.daily_miles ?? 0).toLocaleString()} miles ({reading.reading_miles.toLocaleString()} miles)
                        </div>
                        <div className="text-sm text-gray-600">
                          {format(parseISO(reading.reading_date), 'MMM dd, yyyy')}
                        </div>
                        {reading.note && (
                          <div className="text-sm text-gray-500 italic">
                            {reading.note}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-8">
                  No readings recorded yet. Add your first reading to get started!
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 3. Trip Impact Forecast Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Trip Impact Forecast</CardTitle>
        </CardHeader>
        <CardContent>
          {futureTripEvents.length > 0 ? (
            <div className="space-y-2">
              <div className="text-lg font-semibold">
                {futureTripEvents.reduce((sum, trip) => sum + (trip.estimated_miles || 0), 0).toLocaleString()} mi
              </div>
              <div className="text-xs text-gray-500">Planned Miles</div>
              <div className={`text-sm font-medium ${
                (stats.overUnder + futureTripEvents.reduce((sum, trip) => sum + (trip.estimated_miles || 0), 0)) > 0 
                  ? 'text-red-600' 
                  : 'text-green-600'
              }`}>
                {stats.overUnder + futureTripEvents.reduce((sum, trip) => sum + (trip.estimated_miles || 0), 0) > 0 ? '+' : ''}
                {Math.round(stats.overUnder + futureTripEvents.reduce((sum, trip) => sum + (trip.estimated_miles || 0), 0)).toLocaleString()} projected
              </div>
            </div>
          ) : (
            <div className="text-gray-500 text-center">
              <div className="text-lg font-semibold">0 mi</div>
              <div className="text-xs">No trips planned</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gas Cost Forecast */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Gas Costs</CardTitle>
          <div className="flex items-center gap-3 mt-2 sm:mt-0">
            <Input
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
              placeholder="Station ID"
              className="w-24"
            />
            {gasPrice && (
              <div className="text-lg font-semibold text-gray-900 dark:text-white">
                ${gasPrice.toFixed(2)}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center mb-4">
            <div>
              <div className="text-lg font-semibold">${gasStats.spentWeek.toFixed(2)}</div>
              <div className="text-xs text-gray-500">Spent last week</div>
            </div>
            <div>
              <div className="text-lg font-semibold">${gasStats.spentMonth.toFixed(2)}</div>
              <div className="text-xs text-gray-500">Spent last month</div>
            </div>
            <div>
              <div className="text-lg font-semibold">${gasStats.spentQuarter.toFixed(2)}</div>
              <div className="text-xs text-gray-500">Spent last quarter</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center mb-4">
            <div>
              <div className="text-lg font-semibold">${gasStats.forecastWeek.toFixed(2)}</div>
              <div className="text-xs text-gray-500">Forecast next week</div>
            </div>
            <div>
              <div className="text-lg font-semibold">${gasStats.forecastMonth.toFixed(2)}</div>
              <div className="text-xs text-gray-500">Forecast next month</div>
            </div>
            <div>
              <div className="text-lg font-semibold">${gasStats.forecastQuarter.toFixed(2)}</div>
              <div className="text-xs text-gray-500">Forecast next quarter</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={gasChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip formatter={(value: number) => [`$${(value as number).toFixed(2)}`, '']} />
              <Legend />
              <Bar dataKey="spent" fill="#8884d8" name="Spent" />
              <Bar dataKey="forecast" fill="#82ca9d" name="Forecast" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 4. Lease Information */}
      <Card>
        <CardHeader>
          <CardTitle>Lease Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between">
            <span>Lease Start:</span>
            <span>{format(vehicleConfig.leaseStartDate, 'MMM dd, yyyy')}</span>
          </div>
          <div className="flex justify-between">
            <span>Lease End:</span>
            <span>{format(vehicleConfig.leaseEndDate, 'MMM dd, yyyy')}</span>
          </div>
          <div className="flex justify-between">
            <span>Annual Allowance:</span>
            <span>{vehicleConfig.annualAllowance.toLocaleString()} miles</span>
          </div>
          <div className="flex justify-between">
            <span>Daily Allowance:</span>
            <span>{Math.round(stats.dailyAllowance)} miles</span>
          </div>
          <div className="flex justify-between">
            <span>Days into Lease:</span>
            <span>{Math.max(0, stats.daysIntoLease)} days of {totalLeaseDays} days</span>
          </div>
          <Progress value={leaseProgressPercent} className="h-2" />
        </CardContent>
      </Card>

      {/* Floating Odometer Button */}
      <OdometerButton onAddReading={handleOdometerButtonAdd} />
    </div>
  );
}
