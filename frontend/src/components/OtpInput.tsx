import { useRef } from "react";

export function OtpInput({
  value,
  onChange,
  onComplete,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  onComplete?: (code: string) => void;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  function set(i: number, v: string) {
    if (!/^\d?$/.test(v)) return;
    const arr = [...value];
    arr[i] = v;
    onChange(arr);
    if (v && i < 5) refs.current[i + 1]?.focus();
    if (arr.every((x) => x) && onComplete) onComplete(arr.join(""));
  }

  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={value[i] || ""}
          onChange={(e) => set(i, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !value[i] && i > 0) refs.current[i - 1]?.focus();
          }}
          maxLength={1}
          inputMode="numeric"
          className="h-12 w-11 text-center text-lg font-semibold border border-border dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-card dark:bg-white/5 dark:text-white"
        />
      ))}
    </div>
  );
}
