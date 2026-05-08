'use client';

export default function ConcernList() {
  const concerns = [
    { id: '1', title: 'Library needs extended hours', category: 'Academic', status: 'open', upvotes: 45, time: '2 days ago' },
    { id: '2', title: 'Broken water cooler in Block B', category: 'Infrastructure', status: 'in_review', upvotes: 32, time: '3 days ago' },
    { id: '3', title: 'More cultural events needed', category: 'Campus Life', status: 'addressed', upvotes: 28, time: '1 week ago' },
    { id: '4', title: 'Slow campus Wi-Fi', category: 'Infrastructure', status: 'open', upvotes: 67, time: '4 days ago' },
  ];

  const statusColors: Record<string, string> = {
    open: 'bg-blue-500/10 text-blue-400',
    in_review: 'bg-amber-500/10 text-amber-400',
    addressed: 'bg-green-500/10 text-green-400',
    closed: 'bg-surface-700 text-surface-400',
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-surface-100">All Concerns</h2>

      {concerns.map((concern) => (
        <div key={concern.id} className="glass-card hover:border-surface-600 transition-all">
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-medium text-surface-200">{concern.title}</h3>
            <span className={`px-2 py-0.5 rounded-full text-xs ${statusColors[concern.status]}`}>
              {concern.status.replace('_', ' ')}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-surface-500">
            <span>{concern.category}</span>
            <span>•</span>
            <span>{concern.time}</span>
            <span>•</span>
            <button className="flex items-center gap-1 hover:text-primary-400 transition-colors">
              👍 {concern.upvotes}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
