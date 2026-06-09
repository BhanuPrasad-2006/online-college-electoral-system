import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type StatCardProps = {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  subtext?: string;
  tone?: string;
  delay?: number;
  className?: string;
  layout?: "row" | "col";
};

export function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
  tone = "bg-[#D9A441]/10 text-[#D9A441]",
  delay = 0,
  className,
  layout = "row",
}: StatCardProps) {
  const base = cn(
    "premium-card group bg-card rounded-xl border border-border/60 p-5 shadow-sm",
    "animate-fade-in-up opacity-0 [animation-fill-mode:forwards]",
    className,
  );

  if (layout === "col") {
    return (
      <FadeIn className={base} delay={delay}>
        <div
          className={cn(
            "h-10 w-10 rounded-lg flex items-center justify-center transition-transform duration-200 group-hover:scale-110",
            tone,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <p className="text-xs text-muted-foreground mt-3 font-medium">{label}</p>
        <div className="text-2xl font-bold mt-0.5 tabular-nums text-[#1F2937]">{value}</div>
        {subtext && <p className="text-[10px] text-muted-foreground/70 mt-1">{subtext}</p>}
      </FadeIn>
    );
  }

  return (
    <FadeIn className={cn(base, "flex items-center gap-4")} delay={delay}>
      <div
        className={cn(
          "h-12 w-12 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110",
          tone,
        )}
      >
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground font-medium">{label}</p>
        <div className="text-2xl font-bold mt-0.5 tabular-nums text-[#1F2937]">{value}</div>
        {subtext && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{subtext}</p>}
      </div>
    </FadeIn>
  );
}

function FadeIn({
  className,
  delay = 0,
  children,
}: {
  className?: string;
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <div className={className} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
