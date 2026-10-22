import * as React from 'react';
import { cn } from '@/shared/utils/cn';

export interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  icon,
  children,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center justify-between gap-4',
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          {icon}
          <span className="truncate">{title}</span>
        </h1>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      {children && (
        <div className="flex items-center gap-2 shrink-0">{children}</div>
      )}
    </div>
  );
}
