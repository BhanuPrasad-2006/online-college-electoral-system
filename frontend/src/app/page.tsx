'use client';

import Link from 'next/link';
import { ROUTES } from '@/lib/constants';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-primary-500/20 rounded-full blur-3xl animate-pulse-soft" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-accent-500/20 rounded-full blur-3xl animate-pulse-soft" />

      <div className="relative z-10 text-center px-6 max-w-4xl mx-auto animate-fade-in">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-500/10 border border-primary-500/20 text-primary-300 text-sm font-medium mb-8">
          🗳️ Secure • Transparent • AI-Powered
        </div>

        {/* Heading */}
        <h1 className="text-5xl md:text-7xl font-display font-extrabold mb-6 tracking-tight">
          <span className="gradient-text">College Election</span>
          <br />
          <span className="text-surface-100">System</span>
        </h1>

        {/* Subtitle */}
        <p className="text-xl text-surface-400 max-w-2xl mx-auto mb-12 text-balance">
          Experience democracy reimagined — vote securely, raise your concerns,
          and shape the future of your campus with AI-driven insights.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href={ROUTES.AUTH.LOGIN} className="btn-primary text-lg">
            Get Started
          </Link>
          <Link href={ROUTES.AUTH.REGISTER} className="btn-secondary text-lg">
            Create Account
          </Link>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20">
          {[
            { icon: '🔐', title: 'Secure Voting', desc: 'End-to-end encrypted with anti-fraud AI' },
            { icon: '📊', title: 'Live Analytics', desc: 'Real-time dashboards and statistics' },
            { icon: '🤖', title: 'AI-Powered', desc: 'Smart recommendations & fraud detection' },
          ].map((feature) => (
            <div key={feature.title} className="glass-card text-center animate-slide-up">
              <div className="text-4xl mb-4">{feature.icon}</div>
              <h3 className="text-lg font-semibold text-surface-100 mb-2">{feature.title}</h3>
              <p className="text-surface-400 text-sm">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
