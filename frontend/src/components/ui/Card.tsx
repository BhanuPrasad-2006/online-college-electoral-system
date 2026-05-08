import React from 'react';
import { cn } from '@/lib/helpers';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export default function Card({ children, className, hover = false }: CardProps) {
  return (
    <div
      className={cn(
        'glass-card',
        hover && 'hover:border-primary-500/30 hover:scale-[1.01] transition-all cursor-pointer',
        className
      )}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function CardHeader({ title, subtitle, action }: CardHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h3 className="text-lg font-semibold text-surface-100">{title}</h3>
        {subtitle && <p className="text-sm text-surface-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
