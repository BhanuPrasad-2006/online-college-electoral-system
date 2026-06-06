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
  title,
  subtitle,
  icon: Icon,
  action,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  title?: string;
  subtitle?: string;
  icon?: React.ElementType;
  action?: React.ReactNode;
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
      {(title || subtitle || Icon || action) && (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            {Icon && (
              <div className="h-8 w-8 rounded-lg bg-[#1F3A6E]/10 flex items-center justify-center shrink-0">
                <Icon className="h-4 w-4 text-[#1F3A6E]" />
              </div>
            )}
            <div>
              {title && <p className="font-semibold text-sm">{title}</p>}
              {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
