'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ROUTES } from '@/lib/constants';

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    roll_number: '',
    department: '',
    year: '',
    password: '',
    confirmPassword: '',
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // TODO: Integrate with auth service
    console.log('Register:', formData);
    setIsLoading(false);
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-display font-bold gradient-text mb-2">Create Account</h1>
          <p className="text-surface-400">Register to participate in elections</p>
        </div>

        <form onSubmit={handleSubmit} className="glass-card space-y-5">
          <div>
            <label htmlFor="reg-name" className="block text-sm font-medium text-surface-300 mb-2">Full Name</label>
            <input id="reg-name" name="name" type="text" value={formData.name} onChange={handleChange} className="input-field" placeholder="John Doe" required />
          </div>

          <div>
            <label htmlFor="reg-email" className="block text-sm font-medium text-surface-300 mb-2">College Email</label>
            <input id="reg-email" name="email" type="email" value={formData.email} onChange={handleChange} className="input-field" placeholder="john@college.edu" required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="reg-roll" className="block text-sm font-medium text-surface-300 mb-2">Roll Number</label>
              <input id="reg-roll" name="roll_number" type="text" value={formData.roll_number} onChange={handleChange} className="input-field" placeholder="21CS101" required />
            </div>
            <div>
              <label htmlFor="reg-year" className="block text-sm font-medium text-surface-300 mb-2">Year</label>
              <select id="reg-year" name="year" value={formData.year} onChange={handleChange} className="input-field" required>
                <option value="">Select</option>
                <option value="1">1st Year</option>
                <option value="2">2nd Year</option>
                <option value="3">3rd Year</option>
                <option value="4">4th Year</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="reg-dept" className="block text-sm font-medium text-surface-300 mb-2">Department</label>
            <input id="reg-dept" name="department" type="text" value={formData.department} onChange={handleChange} className="input-field" placeholder="Computer Science" required />
          </div>

          <div>
            <label htmlFor="reg-password" className="block text-sm font-medium text-surface-300 mb-2">Password</label>
            <input id="reg-password" name="password" type="password" value={formData.password} onChange={handleChange} className="input-field" placeholder="••••••••" required />
          </div>

          <div>
            <label htmlFor="reg-confirm" className="block text-sm font-medium text-surface-300 mb-2">Confirm Password</label>
            <input id="reg-confirm" name="confirmPassword" type="password" value={formData.confirmPassword} onChange={handleChange} className="input-field" placeholder="••••••••" required />
          </div>

          <button type="submit" className="btn-primary w-full" disabled={isLoading}>
            {isLoading ? 'Creating Account...' : 'Create Account'}
          </button>

          <p className="text-center text-sm text-surface-400">
            Already have an account?{' '}
            <Link href={ROUTES.AUTH.LOGIN} className="text-primary-400 hover:text-primary-300 font-medium">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
