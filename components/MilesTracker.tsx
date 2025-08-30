"use client";

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO, differenceInDays, startOfDay, subDays } from 'date-fns';
import { Progress } from './ui/progress';
import { env } from '../lib/env';

// Types
interface OdometerReading {
  id: string;
  reading_date: string;
  reading_miles: number;
  note?: string;
  tags?: string;
  created_at: string;
}

interface MileageData {
  date: string;
  miles: number;
  allowance: number;
  dailyMiles?: number;
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

export default function MilesTracker() {
  const [readings, setReadings] = useState<OdometerReading[]>([]);
  const [tripEvents, setTripEvents] = useState<TripEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [newReading, setNewReading] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    miles: '',
    notes: ''
  });
  const [newTrip, setNewTrip] = useState({
    name: '',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    estimatedMiles: ''
  });

  // Initialize Supabase client
  const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey);

  // Vehicle configuration from environment
  const vehicleConfig: VehicleConfig = {
    leaseStartDate: new Date(env.leaseStartDate),
    leaseEndDate: new Date(env.leaseEndDate),
    annualAllowance: env.annualAllowance
  };

  // Load odometer readings on component mount
  useEffect(() => {
    loadReadings();
  }, []);

  const loadReadings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('odometer_logs')
        .select('*')
        .eq('vehicle_id', env.vehicleId)
        .order('reading_date', { ascending: true });

      if (error) {
        console.error('Error loading readings:', error);
      } else {
        setReadings(data || []);
      }
    } catch (error) {
      console.error('Error loading readings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddReading = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newReading.miles || !newReading.date) {
      alert('Please enter both date and miles');
      return;
    }

    try {
      const { error } = await supabase
        .from('odometer_logs')
        .insert([
          {
            vehicle_id: env.vehicleId,
            reading_date: newReading.date,
            reading_miles: parseInt(newReading.miles),
            note: newReading.notes || null
          }
        ]);

      if (error) {
        console.error('Error adding reading:', error);
        alert('Error adding reading. Please try again.');
      } else {
        setNewReading({
          date: format(new Date(), 'yyyy-MM-dd'),
          miles: '',
          notes: ''
        });
        loadReadings(); // Reload the data
      }
    } catch (error) {
      console.error('Error adding reading:', error);
      alert('Error adding reading. Please try again.');
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
  const calculateStats = () => {
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
        progressPercent: 0,
        blendedPace: null
      };
    }

    const sortedReadings = [...readings].sort((a, b) => 
      new Date(a.reading_date).getTime() - new Date(b.reading_date).getTime()
    );

    const firstReading = sortedReadings[0];
    const latestReading = sortedReadings[sortedReadings.length - 1];
    
    const currentMiles = latestReading.reading_miles;
    const totalMiles = currentMiles - firstReading.reading_miles;
    
    const dailyAllowance = vehicleConfig.annualAllowance / 365.25;
    
    const daysIntoLease = differenceInDays(new Date(), vehicleConfig.leaseStartDate);
    const allowanceToDate = dailyAllowance * Math.max(0, daysIntoLease);
    
    const overUnder = totalMiles - allowanceToDate;
    const overUnderPct = allowanceToDate > 0 ? overUnder / allowanceToDate : 0;
    
    const alertLevel = getAlertLevel(overUnderPct);
    const progressPercent = allowanceToDate > 0 ? Math.min(100, (totalMiles / allowanceToDate) * 100) : 0;
    
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
      progressPercent,
      blendedPace
    };
  };

  // Prepare chart data
  const prepareChartData = (): MileageData[] => {
    if (readings.length === 0) return [];

    const sortedReadings = [...readings].sort((a, b) => 
      new Date(a.reading_date).getTime() - new Date(b.reading_date).getTime()
    );

    const dailyAllowance = vehicleConfig.annualAllowance / 365.25;
    const startMiles = sortedReadings[0].reading_miles;
    
    return sortedReadings.map((reading, index) => {
      const daysFromStart = differenceInDays(parseISO(reading.reading_date), vehicleConfig.leaseStartDate);
      const allowance = dailyAllowance * Math.max(0, daysFromStart);
      const actualMiles = reading.reading_miles - startMiles;
      
      return {
        date: format(parseISO(reading.reading_date), 'MMM dd'),
        miles: actualMiles,
        allowance: allowance
      };
    });
  };

  const stats = calculateStats();
  const chartData = prepareChartData();

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
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold">Miles Ahead 🚗💎</h1>
        <p className="text-gray-600 mt-2">Stay miles ahead of your lease allowance with smart vehicle mileage tracking</p>
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
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{stats.totalMiles.toLocaleString()} miles</span>
                <span>{Math.round(stats.allowanceToDate).toLocaleString()} allowance</span>
              </div>
              <Progress 
                value={stats.progressPercent} 
                className={`h-3 ${
                  stats.alertLevel === 'green' ? '[&>div]:bg-green-500' :
                  stats.alertLevel === 'yellow' ? '[&>div]:bg-yellow-500' :
                  stats.alertLevel === 'orange' ? '[&>div]:bg-orange-500' :
                  '[&>div]:bg-red-500'
                }`}
              />
              <div className="flex justify-between text-xs text-gray-500">
                <span>{stats.progressPercent.toFixed(1)}% of allowance used</span>
                <span>{stats.overUnder > 0 ? `+${Math.round(stats.overUnder)}` : Math.round(stats.overUnder)} miles</span>
              </div>
            </div>
            
            {stats.blendedPace && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
                <div className="text-center">
                  <div className="text-lg font-semibold">{stats.blendedPace.blendedPace.toFixed(1)}</div>
                  <div className="text-xs text-gray-500">Blended Pace</div>
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

      {/* 2. Mileage Tracking Chart with Tabs */}
      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="log">Add Reading</TabsTrigger>
          <TabsTrigger value="trips">Plan Trips</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Mileage Tracking Chart</CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip 
                        formatter={(value: number) => [value.toLocaleString() + ' miles', '']}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="miles" 
                        stroke="#2563eb" 
                        strokeWidth={2}
                        name="Actual Miles"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="allowance" 
                        stroke="#dc2626" 
                        strokeWidth={2}
                        strokeDasharray="5 5"
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
        </TabsContent>

        {/* Add Reading Tab */}
        <TabsContent value="log">
          <Card>
            <CardHeader>
              <CardTitle>Add Odometer Reading</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddReading} className="space-y-4">
                <div>
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={newReading.date}
                    onChange={(e) => setNewReading(prev => ({ ...prev, date: e.target.value }))}
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="miles">Odometer Reading (miles)</Label>
                  <Input
                    id="miles"
                    type="number"
                    value={newReading.miles}
                    onChange={(e) => setNewReading(prev => ({ ...prev, miles: e.target.value }))}
                    placeholder="e.g. 25000"
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Input
                    id="notes"
                    type="text"
                    value={newReading.notes}
                    onChange={(e) => setNewReading(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="e.g. Oil change, road trip, etc."
                  />
                </div>
                
                <Button type="submit" className="w-full">
                  Add Reading
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trip Planning Tab */}
        <TabsContent value="trips">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Plan Future Trips</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-4">
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
                  <CardTitle>Upcoming Trips</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {tripEvents.map((trip) => (
                      <div key={trip.id} className="p-4 border rounded-lg">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-medium">{trip.event_name}</h4>
                            <p className="text-sm text-gray-600">
                              {format(parseISO(trip.start_date), 'MMM dd')} - {format(parseISO(trip.end_date), 'MMM dd, yyyy')}
                            </p>
                            <p className="text-sm text-gray-500">
                              Estimated: {trip.estimated_miles.toLocaleString()} miles
                            </p>
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              // Add delete functionality here
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Trip Impact Forecast</CardTitle>
              </CardHeader>
              <CardContent>
                {tripEvents.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Total Planned Miles:</span>
                      <span className="font-medium">
                        {tripEvents.reduce((sum, trip) => sum + trip.estimated_miles, 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Impact on Mileage Bank:</span>
                      <span className={`font-medium ${
                        (stats.overUnder + tripEvents.reduce((sum, trip) => sum + trip.estimated_miles, 0)) > 0 
                          ? 'text-red-600' 
                          : 'text-green-600'
                      }`}>
                        {stats.overUnder + tripEvents.reduce((sum, trip) => sum + trip.estimated_miles, 0) > 0 ? '+' : ''}
                        {Math.round(stats.overUnder + tripEvents.reduce((sum, trip) => sum + trip.estimated_miles, 0)).toLocaleString()}
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
                          {reading.reading_miles.toLocaleString()} miles
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

      {/* 3. Four Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Current Odometer</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.currentMiles.toLocaleString()}</div>
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
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Allowance to Date</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(stats.allowanceToDate).toLocaleString()}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Over/Under Allowance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.overUnder > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {stats.overUnder > 0 ? '+' : ''}{Math.round(stats.overUnder).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

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
            <span>{Math.max(0, stats.daysIntoLease)} days</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
