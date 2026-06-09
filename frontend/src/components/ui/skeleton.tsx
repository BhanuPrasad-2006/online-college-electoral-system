import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-md bg-gray-100/80 animate-fade-in",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
