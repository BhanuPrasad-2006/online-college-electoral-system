import { useEffect, useState } from "react";

export function Countdown({ seconds, onEnd }: { seconds: number; onEnd?: () => void }) {
  const [s, setS] = useState(seconds);
  useEffect(() => {
    setS(seconds);
  }, [seconds]);
  useEffect(() => {
    if (s <= 0) {
      onEnd?.();
      return;
    }
    const i = setTimeout(() => setS((v) => v - 1), 1000);
    return () => clearTimeout(i);
  }, [s, onEnd]);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return (
    <span className="tabular-nums">
      {String(m).padStart(2, "0")}:{String(sec).padStart(2, "0")}
    </span>
  );
}
