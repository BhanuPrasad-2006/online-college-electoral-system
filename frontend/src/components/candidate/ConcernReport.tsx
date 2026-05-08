'use client';

export default function ConcernReport() {
  const categoryData = [
    { category: 'Academic', count: 45, sentiment: 0.3, topConcerns: ['Library hours', 'Course materials', 'Lab access'] },
    { category: 'Infrastructure', count: 38, sentiment: -0.2, topConcerns: ['Wi-Fi speed', 'Water coolers', 'Classroom AC'] },
    { category: 'Campus Life', count: 28, sentiment: 0.5, topConcerns: ['Cultural events', 'Clubs funding', 'Canteen quality'] },
    { category: 'Administration', count: 15, sentiment: -0.4, topConcerns: ['Fee transparency', 'Exam scheduling', 'ID card delays'] },
  ];

  const getSentimentColor = (s: number) => (s > 0 ? 'text-green-400' : s < 0 ? 'text-red-400' : 'text-amber-400');
  const getSentimentLabel = (s: number) => (s > 0 ? 'Positive' : s < 0 ? 'Negative' : 'Neutral');

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {categoryData.map((cat) => (
          <div key={cat.category} className="glass-card">
            <p className="text-sm text-surface-400 mb-1">{cat.category}</p>
            <p className="text-2xl font-bold text-surface-100">{cat.count}</p>
            <p className={`text-xs mt-1 ${getSentimentColor(cat.sentiment)}`}>
              {getSentimentLabel(cat.sentiment)} sentiment
            </p>
          </div>
        ))}
      </div>

      {/* Detailed Breakdown */}
      {categoryData.map((cat) => (
        <div key={cat.category} className="glass-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-surface-100">{cat.category}</h3>
            <span className={`text-sm ${getSentimentColor(cat.sentiment)}`}>
              Sentiment: {cat.sentiment.toFixed(1)}
            </span>
          </div>
          <div className="space-y-2">
            {cat.topConcerns.map((concern, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-surface-900/50">
                <span className="text-xs text-surface-500 font-mono w-6">#{i + 1}</span>
                <span className="text-sm text-surface-300">{concern}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
