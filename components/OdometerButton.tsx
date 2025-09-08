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
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white rounded-full px-4 py-3 shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-2 z-50 font-medium text-sm"
      >
        <Plus size={16} />
        Odometer
      </button>

      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          onClick={handleClose}
        >
          {/* Modal */}
          <div 
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md transform transition-all duration-200 scale-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Add Reading
              </h2>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
              
              <div className="flex gap-3 pt-4">
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