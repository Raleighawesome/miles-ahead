"use client";

import React from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";

type VehicleSettings = {
  id: string;
  name?: string | null;
  mpg?: number | null;
  lease_start?: string | null; // yyyy-mm-dd
  lease_end?: string | null;
  annual_allowance?: number | null;
  overage_rate?: number | null;
};

export default function SettingsPage() {
  const [loading, setLoading] = React.useState<boolean>(true);
  const [saving, setSaving] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const supabase = React.useMemo(() => createClient(env.supabaseUrl, env.supabaseAnonKey), []);

  const [vehicleId, setVehicleId] = React.useState<string>(env.vehicleId);
  const [name, setName] = React.useState<string>("");
  const [mpg, setMpg] = React.useState<string>("");
  const [leaseStart, setLeaseStart] = React.useState<string>(env.leaseStartDate);
  const [leaseEnd, setLeaseEnd] = React.useState<string>(env.leaseEndDate);
  const [annualAllowance, setAnnualAllowance] = React.useState<string>(String(env.annualAllowance));
  const [overageRate, setOverageRate] = React.useState<string>(String(env.overageRate));

  React.useEffect(() => {
    try {
      const storedId = localStorage.getItem("selectedVehicleId");
      if (storedId) setVehicleId(storedId);
    } catch (_e) {}
  }, []);

  React.useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      setSuccess(null);
      try {
        const { data, error } = await supabase
          .from("vehicles")
          .select("id,name,mpg,lease_start,lease_end,annual_allowance,overage_rate")
          .eq("id", vehicleId)
          .maybeSingle();

        if (error) throw error;

        if (isMounted && data) {
          setName(data.name || "");
          setMpg(data.mpg != null ? String(data.mpg) : "");
          setLeaseStart(data.lease_start || env.leaseStartDate);
          setLeaseEnd(data.lease_end || env.leaseEndDate);
          setAnnualAllowance(data.annual_allowance != null ? String(data.annual_allowance) : String(env.annualAllowance));
          setOverageRate(data.overage_rate != null ? String(data.overage_rate) : String(env.overageRate));
        }
      } catch (e: any) {
        if (isMounted) setError(e?.message || "Failed to load settings");
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [supabase, vehicleId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: VehicleSettings = {
        id: vehicleId.trim(),
        name: name.trim() || null,
        mpg: mpg ? Number(mpg) : null,
        lease_start: leaseStart || null,
        lease_end: leaseEnd || null,
        annual_allowance: annualAllowance ? Number(annualAllowance) : null,
        overage_rate: overageRate ? Number(overageRate) : null,
      };

      const { error } = await supabase.from("vehicles").upsert(payload, { onConflict: "id" });
      if (error) throw error;

      try {
        localStorage.setItem("selectedVehicleId", payload.id);
      } catch (_e) {}

      setSuccess("Settings saved.");
    } catch (e: any) {
      setError(e?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-blue-300 to-orange-300">
            Settings
          </h1>
          <p className="text-muted-foreground mt-2">Configure your vehicle and lease preferences</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" className="glow-orange">
            <Link href="/">Back to Dashboard</Link>
          </Button>
          <ThemeToggle />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vehicle & Lease</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="vehicleId">Vehicle ID</Label>
                <Input id="vehicleId" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} placeholder="e.g. truck" />
              </div>
              <div>
                <Label htmlFor="name">Label (optional)</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. My Truck" />
              </div>
              <div>
                <Label htmlFor="mpg">MPG</Label>
                <Input id="mpg" type="number" step="0.1" value={mpg} onChange={(e) => setMpg(e.target.value)} placeholder="e.g. 17.5" />
              </div>
              <div>
                <Label htmlFor="annualAllowance">Annual Allowance (miles)</Label>
                <Input id="annualAllowance" type="number" value={annualAllowance} onChange={(e) => setAnnualAllowance(e.target.value)} placeholder="e.g. 12000" />
              </div>
              <div>
                <Label htmlFor="leaseStart">Lease Start</Label>
                <Input id="leaseStart" type="date" value={leaseStart} onChange={(e) => setLeaseStart(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="leaseEnd">Lease End</Label>
                <Input id="leaseEnd" type="date" value={leaseEnd} onChange={(e) => setLeaseEnd(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="overageRate">Overage Rate ($/mile)</Label>
                <Input id="overageRate" type="number" step="0.01" value={overageRate} onChange={(e) => setOverageRate(e.target.value)} placeholder="e.g. 0.25" />
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-500">{error}</div>
            )}
            {success && (
              <div className="text-sm text-green-500">{success}</div>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={saving} className="glow-blue">
                {saving ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {loading && (
        <div className="text-sm text-muted-foreground">Loading current settings...</div>
      )}
    </div>
  );
}


