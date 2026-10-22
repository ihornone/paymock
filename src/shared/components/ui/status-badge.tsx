'use client';

import * as React from 'react';
import {
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { Badge } from '@/shared/components/ui/badge';
import { cn } from '@/shared/utils/cn';
import type { InvoiceStatus } from '@/shared/types/acquiring';

export interface StatusBadgeProps {
  status: InvoiceStatus | string | number;
  type?: 'invoice' | 'webhook' | 'http';
  showIcon?: boolean;
  className?: string;
}

export function StatusBadge({
  status,
  type = 'invoice',
  showIcon = true,
  className,
}: StatusBadgeProps) {
  if (type === 'webhook') {
    const code = Number(status);
    const isSuccess = code >= 200 && code < 300;

    return (
      <Badge
        variant="outline"
        className={cn(
          'text-[10px] font-mono font-medium gap-1 px-1.5 py-0.5 rounded',
          isSuccess
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            : 'bg-rose-500/10 text-rose-400 border-rose-500/20',
          className
        )}
      >
        {showIcon &&
          (isSuccess ? (
            <CheckCircle2 className="size-3 shrink-0" />
          ) : (
            <XCircle className="size-3 shrink-0" />
          ))}
        <span>{code > 0 ? `HTTP ${code}` : 'FAILED'}</span>
      </Badge>
    );
  }

  if (type === 'http') {
    const method = String(status).toUpperCase();
    const isGet = method === 'GET';
    const isPost = method === 'POST';

    return (
      <span
        className={cn(
          'font-mono text-[10px] font-bold px-1.5 py-0.5 rounded leading-none select-none',
          isGet
            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            : isPost
            ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
            : 'bg-primary/10 text-primary border border-primary/20',
          className
        )}
      >
        {method}
      </span>
    );
  }

  // Invoice status
  const normalizedStatus = String(status).toLowerCase();

  switch (normalizedStatus) {
    case 'success':
      return (
        <Badge
          variant="outline"
          className={cn(
            'text-[10px] font-medium gap-1 bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
            className
          )}
        >
          {showIcon && <CheckCircle2 className="size-3 shrink-0" />}
          <span>успішно</span>
        </Badge>
      );
    case 'created':
      return (
        <Badge
          variant="outline"
          className={cn(
            'text-[10px] font-medium gap-1 bg-sky-500/10 text-sky-400 border-sky-500/20',
            className
          )}
        >
          {showIcon && <Clock className="size-3 shrink-0" />}
          <span>створено</span>
        </Badge>
      );
    case 'failure':
      return (
        <Badge
          variant="outline"
          className={cn(
            'text-[10px] font-medium gap-1 bg-rose-500/10 text-rose-400 border-rose-500/20',
            className
          )}
        >
          {showIcon && <XCircle className="size-3 shrink-0" />}
          <span>відхилено</span>
        </Badge>
      );
    case 'expired':
      return (
        <Badge
          variant="outline"
          className={cn(
            'text-[10px] font-medium gap-1 bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
            className
          )}
        >
          {showIcon && <AlertCircle className="size-3 shrink-0" />}
          <span>вичерпано</span>
        </Badge>
      );
    default:
      return (
        <Badge
          variant="outline"
          className={cn('text-[10px] font-medium gap-1', className)}
        >
          {showIcon && <HelpCircle className="size-3 shrink-0" />}
          <span>{normalizedStatus}</span>
        </Badge>
      );
  }
}
