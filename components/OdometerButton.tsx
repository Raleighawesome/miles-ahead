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
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={handleClose}
        >
          {/* Modal */}
          <div
            className="elev-2 w-full max-w-md rounded-[calc(var(--radius)*1.2)] border border-border/40 bg-card/95 p-1 text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 rounded-[calc(var(--radius)*0.9)] bg-secondary/60 px-5 py-4">
              <h2 className="text-base font-semibold">
                Add Reading
              </h2>
              <button
                onClick={handleClose}
                className="text-foreground/60 transition hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4 px-5 py-6">
              <div>
                <Label htmlFor="modal-date">Date</Label>
                <Input
                  id="modal-date"
                  type="date"
                  value={newReading.date}
                  onChange={(e) => setNewReading(prev => ({ ...prev, date: e.target.value }))}
                  required
                  className="mt-1"
                />
              </div>
              
              <div>
                <Label htmlFor="modal-miles">Odometer Reading (miles)</Label>
                <Input
                  id="modal-miles"
                  type="number"
                  value={newReading.miles}
                  onChange={(e) => setNewReading(prev => ({ ...prev, miles: e.target.value }))}
                  placeholder="e.g. 25000"
                  required
                  className="mt-1"
                />
              </div>
              
              <div>
                <Label htmlFor="modal-notes">Notes (optional)</Label>
                <Input
                  id="modal-notes"
                  type="text"
                  value={newReading.notes}
                  onChange={(e) => setNewReading(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="e.g. Oil change, road trip, etc."
                  className="mt-1"
                />
              </div>
              
              <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  className="flex-1"
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
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