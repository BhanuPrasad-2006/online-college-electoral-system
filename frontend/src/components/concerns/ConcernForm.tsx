'use client';

import { useState } from 'react';
import { CONCERN_CATEGORIES } from '@/lib/constants';

export default function ConcernForm() {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // TODO: Integrate with concern service
    console.log('Concern:', formData);
    setIsLoading(false);
    setFormData({ title: '', description: '', category: '' });
  };

  return (
    <form onSubmit={handleSubmit} className="glass-card space-y-5">
      <h2 className="text-lg font-semibold text-surface-100">Raise a Concern</h2>

      <div>
        <label htmlFor="concern-title" className="block text-sm font-medium text-surface-300 mb-2">Title</label>
        <input
          id="concern-title"
          type="text"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          className="input-field"
          placeholder="Brief title for your concern"
          required
        />
      </div>

      <div>
        <label htmlFor="concern-category" className="block text-sm font-medium text-surface-300 mb-2">Category</label>
        <select
          id="concern-category"
          value={formData.category}
          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
          className="input-field"
          required
        >
          <option value="">Select Category</option>
          {CONCERN_CATEGORIES.map((cat) => (
            <option key={cat.value} value={cat.value}>{cat.icon} {cat.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="concern-desc" className="block text-sm font-medium text-surface-300 mb-2">Description</label>
        <textarea
          id="concern-desc"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="input-field min-h-[120px] resize-y"
          placeholder="Describe your concern in detail..."
          required
        />
      </div>

      <button type="submit" className="btn-primary w-full" disabled={isLoading}>
        {isLoading ? 'Submitting...' : 'Submit Concern'}
      </button>
    </form>
  );
}
