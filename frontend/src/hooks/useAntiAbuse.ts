import { useState, useCallback, useRef, useEffect } from "react";

interface Cooldown {
  remaining: number;
  timer: ReturnType<typeof setInterval> | null;
}

/**
 * Anti-abuse hook that prevents rapid repeated actions.
 * Provides per-action cooldown timers with state tracking.
 */
export function useAntiAbuse() {
  const [cooldowns, setCooldowns] = useState<Record<string, Cooldown>>({});
  const cooldownRefs = useRef<Record<string, Cooldown>>({});

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      Object.values(cooldownRefs.current).forEach((cd) => {
        if (cd.timer) clearInterval(cd.timer);
      });
      cooldownRefs.current = {};
    };
  }, []);

  const isBlocked = useCallback((action: string): boolean => {
    const c = cooldownRefs.current[action];
    return !!(c && c.remaining > 0);
  }, []);

  const startCooldown = useCallback((action: string, seconds: number) => {
    const existing = cooldownRefs.current[action];
    if (existing?.timer) {
      clearInterval(existing.timer);
    }

    const cd: Cooldown = { remaining: seconds, timer: null };
    cd.timer = setInterval(() => {
      cd.remaining = Math.max(0, cd.remaining - 1);
      setCooldowns((prev) => ({
        ...prev,
        [action]: { remaining: cd.remaining, timer: cd.timer },
      }));

      if (cd.remaining <= 0) {
        if (cd.timer) clearInterval(cd.timer);
        cd.timer = null;
        setCooldowns((prev) => {
          const next = { ...prev };
          delete next[action];
          return next;
        });
        delete cooldownRefs.current[action];
      }
    }, 1000);

    cooldownRefs.current[action] = cd;
    setCooldowns((prev) => ({ ...prev, [action]: cd }));
  }, []);

  const getButtonState = useCallback(
    (action: string, _defaultLabel: string): { label: string } => {
      const c = cooldownRefs.current[action];
      if (c && c.remaining > 0) {
        return { label: `${c.remaining}s` };
      }
      return { label: _defaultLabel };
    },
    [],
  );

  const runWithProtection = useCallback(
    (action: string, fn: () => void | Promise<void>, seconds: number) => {
      if (isBlocked(action)) return;
      startCooldown(action, seconds);
      const result = fn();
      if (result instanceof Promise) {
        return result;
      }
    },
    [isBlocked, startCooldown],
  );

  return {
    isBlocked,
    startCooldown,
    runWithProtection,
    getButtonState,
    cooldowns,
  };
}
