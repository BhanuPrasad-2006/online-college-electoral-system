'use client';

export default function FraudAlertPanel() {
  const alerts = [
    { id: '1', type: 'Multiple Login Attempts', severity: 'high', description: 'User attempted 15 logins from different IPs within 5 minutes', time: '10 min ago', resolved: false },
    { id: '2', type: 'Unusual Voting Pattern', severity: 'medium', description: 'Burst of 50 votes from same subnet in 2 minutes', time: '30 min ago', resolved: false },
    { id: '3', type: 'Session Anomaly', severity: 'low', description: 'User session transferred between devices mid-vote', time: '1 hour ago', resolved: true },
    { id: '4', type: 'Rate Limit Exceeded', severity: 'critical', description: 'API rate limit exceeded from IP 10.0.0.45 — possible bot activity', time: '15 min ago', resolved: false },
  ];

  const severityColors: Record<string, string> = {
    low: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  };

  return (
    <div className="space-y-4">
      {alerts.map((alert) => (
        <div key={alert.id} className={`glass-card ${alert.resolved ? 'opacity-50' : ''}`}>
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${severityColors[alert.severity]}`}>
                {alert.severity.toUpperCase()}
              </span>
              <h3 className="font-medium text-surface-200">{alert.type}</h3>
            </div>
            <span className="text-xs text-surface-500">{alert.time}</span>
          </div>
          <p className="text-sm text-surface-400 mb-4">{alert.description}</p>
          <div className="flex gap-2">
            {!alert.resolved && (
              <>
                <button className="text-xs px-3 py-1 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors">
                  Resolve
                </button>
                <button className="text-xs px-3 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
                  Escalate
                </button>
              </>
            )}
            {alert.resolved && (
              <span className="text-xs text-green-500">✓ Resolved</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
