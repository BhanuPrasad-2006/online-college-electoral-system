'use client';

import { useState } from 'react';
import Sidebar from '@/components/shared/Sidebar';
import { POSITIONS } from '@/lib/constants';

export default function ApplicationPage() {
  const [formData, setFormData] = useState({
    position: '',
    statement: '',
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // TODO: Integrate with candidate service
    console.log('Application:', formData);
    setIsLoading(false);
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar role="candidate" />
      <main className="flex-1 p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-surface-100 mb-2">Candidate Application</h1>
          <p className="text-surface-400">Apply to run for a position in the upcoming election.</p>
        </div>

        <form onSubmit={handleSubmit} className="glass-card max-w-2xl space-y-6">
          <div>
            <label htmlFor="app-position" className="block text-sm font-medium text-surface-300 mb-2">
              Position
            </label>
            <select
              id="app-position"
              value={formData.position}
              onChange={(e) => setFormData({ ...formData, position: e.target.value })}
              className="input-field"
              required
            >
              <option value="">Select Position</option>
              {POSITIONS.map((pos) => (
                <option key={pos} value={pos}>{pos}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="app-statement" className="block text-sm font-medium text-surface-300 mb-2">
              Personal Statement
            </label>
            <textarea
              id="app-statement"
              value={formData.statement}
              onChange={(e) => setFormData({ ...formData, statement: e.target.value })}
              className="input-field min-h-[200px] resize-y"
              placeholder="Why should students vote for you? Describe your vision and goals..."
              required
            />
          </div>

          <button type="submit" className="btn-primary" disabled={isLoading}>
            {isLoading ? 'Submitting...' : 'Submit Application'}
          </button>
        </form>
      </main>
    </div>
  );
}
