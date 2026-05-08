'use client';

import Sidebar from '@/components/shared/Sidebar';

export default function RecommendationsPage() {
  const recommendations = [
    {
      candidateName: 'Ananya Sharma',
      position: 'President',
      matchScore: 92,
      matchingThemes: ['Library Hours', 'Academic Support', 'Campus Wi-Fi'],
      explanation: 'This candidate strongly aligns with your concerns about academic infrastructure and campus facilities.',
    },
    {
      candidateName: 'Rahul Verma',
      position: 'General Secretary',
      matchScore: 85,
      matchingThemes: ['Sports Facilities', 'Campus Events'],
      explanation: 'Strong focus on campus life improvements that match your expressed interests.',
    },
    {
      candidateName: 'Priya Patel',
      position: 'Vice President',
      matchScore: 78,
      matchingThemes: ['Administration Transparency'],
      explanation: 'Advocates for administrative reforms aligned with your concerns.',
    },
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar role="student" />
      <main className="flex-1 p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-surface-100 mb-2">AI Recommendations</h1>
          <p className="text-surface-400">Candidates matched to your concerns using AI analysis.</p>
        </div>

        <div className="space-y-6">
          {recommendations.map((rec, i) => (
            <div key={i} className="glass-card hover:border-primary-500/30 transition-all">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-surface-100">{rec.candidateName}</h3>
                  <p className="text-sm text-surface-400">{rec.position}</p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold gradient-text">{rec.matchScore}%</span>
                  <p className="text-xs text-surface-500">Match Score</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {rec.matchingThemes.map((theme) => (
                  <span key={theme} className="px-3 py-1 rounded-full text-xs bg-primary-500/10 text-primary-300 border border-primary-500/20">
                    {theme}
                  </span>
                ))}
              </div>

              <p className="text-sm text-surface-400">{rec.explanation}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
