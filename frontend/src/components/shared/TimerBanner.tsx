'use client';

import { useElectionTimer } from '@/hooks/useElectionTimer';

export default function TimerBanner() {
  const { days, hours, minutes, seconds, isActive } = useElectionTimer();

  if (!isActive) return null;

  return (
    <div className="mb-6 p-4 rounded-2xl gradient-primary text-white">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-90">🗳️ Election is LIVE</p>
          <p className="text-xs opacity-70">Cast your vote before time runs out</p>
        </div>
        <div className="flex gap-3">
          {[
            { label: 'Days', value: days },
            { label: 'Hours', value: hours },
            { label: 'Min', value: minutes },
            { label: 'Sec', value: seconds },
          ].map((unit) => (
            <div key={unit.label} className="text-center">
              <p className="text-2xl font-bold font-mono">{String(unit.value).padStart(2, '0')}</p>
              <p className="text-[10px] uppercase opacity-70">{unit.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
