import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  className?: string;
};

export function PageHeader({ title, subtitle, badge, className }: PageHeaderProps) {
  return (
    <div className={cn("animate-fade-in-up opacity-0 [animation-fill-mode:forwards]", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-[28px] font-bold tracking-tight">
            <span className="gradient-text">{title}</span>
          </h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        {badge}
      </div>
    </div>
  );
}

export function SectionCard({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <section
      className={cn(
        "interactive-card bg-card rounded-2xl border border-border/60 shadow-sm p-5 md:p-6",
        "animate-fade-in-up opacity-0 [animation-fill-mode:forwards]",
        className,
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </section>
  );
}
