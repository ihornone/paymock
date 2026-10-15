import * as React from 'react';
import { TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  isTableRow?: boolean;
  colSpan?: number;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  isTableRow = false,
  colSpan = 1,
  className,
}: EmptyStateProps) {
  const content = (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 text-center',
        className
      )}
    >
      {icon && (
        <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-secondary/80 text-muted-foreground">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1 text-xs text-muted-foreground max-w-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );

  if (isTableRow) {
    return (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={colSpan} className="h-48 text-center p-0">
          {content}
        </TableCell>
      </TableRow>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-border/80 bg-card/40">
      {content}
    </div>
  );
}
