"use client";

import * as React from "react";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  ReferenceLine,
} from "recharts";
import { Plus, X } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const salaryBandData = [
  { period: "Q1 '23", salary: 112000, bandMin: 98000, bandMid: 125000, bandMax: 152000 },
  { period: "Q2 '23", salary: 115500, bandMin: 99000, bandMid: 126000, bandMax: 153000 },
  { period: "Q3 '23", salary: 118000, bandMin: 100500, bandMid: 127500, bandMax: 154500 },
  { period: "Q4 '23", salary: 121000, bandMin: 101500, bandMid: 129000, bandMax: 156000 },
  { period: "Q1 '24", salary: 128000, bandMin: 103000, bandMid: 130500, bandMax: 158500 },
  { period: "Q2 '24", salary: 130000, bandMin: 104500, bandMid: 132000, bandMax: 160000 },
  { period: "Q3 '24", salary: 132500, bandMin: 106000, bandMid: 134000, bandMax: 162500 },
  { period: "Q4 '24", salary: 135000, bandMin: 108000, bandMid: 136500, bandMax: 165000 },
  { period: "Q1 '25", salary: 138500, bandMin: 109000, bandMid: 138000, bandMax: 167000 },
  { period: "Q2 '25", salary: 140000, bandMin: 110500, bandMid: 139500, bandMax: 168500 },
];

const yoyChangeData = [
  { period: "2021", yoy: 3.8 },
  { period: "2022", yoy: 5.4 },
  { period: "2023", yoy: 6.1 },
  { period: "2024", yoy: 7.3 },
  { period: "2025", yoy: 5.9 },
];

const yoyHighlights = [
  {
    label: "Largest Increase",
    value: "+7.3%",
    description: "Equity refresh and band adjustment in 2024",
  },
  {
    label: "12 Mo. Rolling Avg",
    value: "+6.3%",
    description: "Sustained growth across salary + bonus",
  },
];

const salaryBreakdown = [
  {
    label: "Base Salary",
    value: "$140,000",
    helper: "Effective Jan 1, 2025",
  },
  {
    label: "Target Bonus",
    value: "15% ($21,000)",
    helper: "Paid annually each March",
  },
  {
    label: "Equity Refresh",
    value: "$28,000",
    helper: "RSUs vesting quarterly",
  },
  {
    label: "Total Cash Comp",
    value: "$161,000",
    helper: "Base + target bonus",
  },
  {
    label: "Next Review",
    value: "Sept 12, 2025",
    helper: "Mid-cycle calibration",
  },
];

const currencyFormatter = (value: number) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function CompensationDashboard() {
  const [showAddComp, setShowAddComp] = React.useState(false);
  const [formData, setFormData] = React.useState({
    type: "Base Salary",
    effectiveDate: "",
    amount: "",
    notes: "",
  });

  React.useEffect(() => {
    if (!showAddComp) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowAddComp(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showAddComp]);

  const handleChange = (field: "type" | "effectiveDate" | "amount" | "notes") =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const { value } = event.target;
      setFormData((prev) => ({ ...prev, [field]: value }));
    };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setShowAddComp(false);
    setFormData({ type: "Base Salary", effectiveDate: "", amount: "", notes: "" });
  };

  return (
    <div className="relative min-h-screen bg-background">
      <div className="container mx-auto space-y-8 py-10">
        <header className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Total Rewards</p>
          <h1 className="text-3xl font-bold tracking-tight">Compensation Overview</h1>
          <p className="text-muted-foreground">
            Track how your salary, bonus, and band positioning evolve over time to stay prepared for upcoming reviews.
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card className="lg:col-span-1">
            <CardHeader className="space-y-1">
              <CardTitle>Salary vs Compensation Band</CardTitle>
              <p className="text-sm text-muted-foreground">
                Compare your actual salary progression against band expectations.
              </p>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={salaryBandData} margin={{ top: 16, right: 24, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--muted))" />
                    <XAxis dataKey="period" tick={{ fill: "hsl(var(--muted-foreground))" }} tickMargin={12} />
                    <YAxis
                      tick={{ fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={currencyFormatter}
                      width={90}
                    />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      formatter={(value: number, name: string) => [currencyFormatter(value), name]}
                      labelClassName="text-xs"
                    />
                    <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
                    <Line
                      type="monotone"
                      dataKey="salary"
                      name="Actual Salary"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="bandMin"
                      name="Band Min"
                      stroke="hsl(var(--destructive))"
                      strokeDasharray="6 6"
                      strokeWidth={1.8}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="bandMid"
                      name="Band Mid"
                      stroke="hsl(var(--secondary))"
                      strokeDasharray="6 6"
                      strokeWidth={1.8}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="bandMax"
                      name="Band Max"
                      stroke="hsl(var(--ring))"
                      strokeDasharray="6 6"
                      strokeWidth={1.8}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-1">
            <CardHeader className="space-y-1">
              <CardTitle>Year-over-Year Change</CardTitle>
              <p className="text-sm text-muted-foreground">
                Keep tabs on annual adjustments across salary, bonus, and equity.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={yoyChangeData}>
                    <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--muted))" />
                    <XAxis dataKey="period" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis
                      tick={{ fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={(value) => `${value}%`}
                      width={60}
                    />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted) / 0.15)" }}
                      formatter={(value: number) => [`${value.toFixed(1)}%`, "YoY Change"]}
                    />
                    <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
                    <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                    <Bar dataKey="yoy" name="YoY Change" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {yoyHighlights.map((item) => (
                  <div key={item.label} className="rounded-lg border bg-background p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {item.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-emerald-500">{item.value}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
              <CardTitle>Current Salary Snapshot</CardTitle>
              <p className="text-sm text-muted-foreground">
                Last updated July 2, 2025 · Next merit review September 2025
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {salaryBreakdown.map((item) => (
                <div key={item.label} className="rounded-lg border bg-accent/10 p-4">
                  <p className="text-sm font-medium text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-2xl font-semibold">{item.value}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{item.helper}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="fixed bottom-6 right-6 z-50">
        <Button
          type="button"
          size="icon"
          className="h-12 w-12 rounded-full shadow-lg shadow-primary/40"
          onClick={() => setShowAddComp((prev) => !prev)}
          aria-expanded={showAddComp}
          aria-haspopup="dialog"
          aria-label="Add compensation data"
        >
          {showAddComp ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
        </Button>
      </div>

      {showAddComp && (
        <div className="fixed inset-0 z-40 flex items-end justify-end bg-black/40 px-4 pb-6 pt-12 sm:items-center sm:justify-center">
          <div
            className="absolute inset-0"
            role="presentation"
            onClick={() => setShowAddComp(false)}
          />
          <Card className="relative z-10 w-full max-w-md">
            <CardHeader>
              <CardTitle>Add Compensation Data</CardTitle>
              <p className="text-sm text-muted-foreground">
                Log a new salary adjustment, bonus payout, or equity refresh.
              </p>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="comp-type">Compensation Type</Label>
                  <Input
                    id="comp-type"
                    placeholder="e.g. Base Salary, Bonus, Equity"
                    value={formData.type}
                    onChange={handleChange("type")}
                    autoFocus
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="comp-date">Effective Date</Label>
                    <Input
                      id="comp-date"
                      type="date"
                      value={formData.effectiveDate}
                      onChange={handleChange("effectiveDate")}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="comp-amount">Amount</Label>
                    <Input
                      id="comp-amount"
                      type="number"
                      min="0"
                      step="100"
                      placeholder="USD"
                      value={formData.amount}
                      onChange={handleChange("amount")}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="comp-notes">Notes</Label>
                  <Input
                    id="comp-notes"
                    placeholder="Add context or approvals"
                    value={formData.notes}
                    onChange={handleChange("notes")}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowAddComp(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Save Entry</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
