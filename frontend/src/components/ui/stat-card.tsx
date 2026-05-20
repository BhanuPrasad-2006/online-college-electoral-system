import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type StatCardProps = {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  tone?: string;
  delay?: number;
  className?: string;
  layout?: "row" | "col";
};

export function StatCard({
  icon: Icon,
  label,
  value,
  tone = "bg-[#6C63FF]/10 text-[#6C63FF]",
  delay = 0,
  className,
  layout = "row",
}: StatCardProps) {
  const base = cn(
    "interactive-card group bg-card rounded-2xl border border-border/60 p-5",
    "animate-fade-in-up opacity-0 [animation-fill-mode:forwards]",
    className,
  );

  if (layout === "col") {
    return (
      <FadeIn className={base} delay={delay}>
        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110", tone)}>
          <Icon className="h-5 w-5" />
        </div>
        <p className="text-xs text-muted-foreground mt-3">{label}</p>
        <div className="text-2xl font-bold mt-0.5 tabular-nums">{value}</div>
      </FadeIn>
    );
  }

  return (
    <FadeIn className={cn(base, "flex items-center gap-4")} delay={delay}>
      <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3", tone)}>
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="text-2xl font-bold mt-0.5 tabular-nums">{value}</div>
      </div>
    </FadeIn>
  );
}

function FadeIn({ className, delay = 0, children }: { className?: string; delay?: number; children: React.ReactNode }) {
  return (
    <div className={className} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
