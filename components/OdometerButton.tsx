'use client';

import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { format } from 'date-fns';
import { Plus, X } from 'lucide-react';

interface OdometerButtonProps {
  onAddReading: (reading: { date: string; miles: string; notes: string }) => Promise<void>;
}

export default function OdometerButton({ onAddReading }: OdometerButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newReading, setNewReading] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    miles: '',
    notes: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newReading.miles || !newReading.date) {
      alert('Please enter both date and miles');
      return;
    }

    setIsSubmitting(true);
    try {
      await onAddReading(newReading);
      setNewReading({
        date: format(new Date(), 'yyyy-MM-dd'),
        miles: '',
        notes: ''
      });
      setIsOpen(false);
    } catch (error) {
      console.error('Error adding reading:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setNewReading({
      date: format(new Date(), 'yyyy-MM-dd'),
      miles: '',
      notes: ''
    });
  };

  return (
    <>
      {/* Floating Button */}
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-5 right-5 z-40 shadow-dual"
        size="lg"
      >
        <Plus size={18} />
        Log miles
      </Button>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
          onClick={handleClose}
        >
          {/* Modal - slides up from bottom on mobile, centered on desktop */}
          <div
            className="elev-2 w-full max-w-md rounded-t-[calc(var(--radius)*1.5)] border border-border/40 bg-card/95 p-1 text-foreground max-h-[90vh] overflow-y-auto sm:rounded-[calc(var(--radius)*1.2)] sm:mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 rounded-[calc(var(--radius)*0.9)] bg-secondary/60 px-5 py-4">
              <h2 className="text-base font-semibold">
                Add Reading
              </h2>
              <button
                onClick={handleClose}
                className="text-foreground/60 transition hover:text-foreground p-2 -mr-2"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5 px-5 py-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="modal-date">Date</Label>
                  <Input
                    id="modal-date"
                    type="date"
                    value={newReading.date}
                    onChange={(e) => setNewReading(prev => ({ ...prev, date: e.target.value }))}
                    required
                    className="mt-1.5 h-12 text-base"
                  />
                </div>

                <div>
                  <Label htmlFor="modal-miles">Miles</Label>
                  <Input
                    id="modal-miles"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={newReading.miles}
                    onChange={(e) => setNewReading(prev => ({ ...prev, miles: e.target.value }))}
                    placeholder="25000"
                    required
                    className="mt-1.5 h-12 text-base"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="modal-notes">Notes (optional)</Label>
                <Input
                  id="modal-notes"
                  type="text"
                  value={newReading.notes}
                  onChange={(e) => setNewReading(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Oil change, road trip, etc."
                  className="mt-1.5 h-12 text-base"
                />
              </div>

              <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  className="flex-1 h-12 text-base"
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 h-12 text-base"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Adding...' : 'Add Reading'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
