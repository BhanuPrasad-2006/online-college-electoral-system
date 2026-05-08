import { useState, useEffect } from 'react';
import { getTimeRemaining } from '@/lib/helpers';

export function useElectionTimer(endTime?: string) {
  const defaultEnd = endTime || '2025-05-08T18:00:00';
  const [timer, setTimer] = useState(getTimeRemaining(defaultEnd));
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = getTimeRemaining(defaultEnd);
      setTimer(remaining);

      if (remaining.total <= 0) {
        setIsActive(false);
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [defaultEnd]);

  return {
    ...timer,
    isActive,
  };
}
