'use client';

import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { CopyButton } from '@/shared/components/ui/copy-button';
import { cn } from '@/shared/utils/cn';

export interface SecretFieldProps {
  label: string;
  value: string;
  visibleChars?: number;
  icon?: React.ReactNode;
  copyLabel?: string;
  copiedLabel?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function SecretField({
  label,
  value,
  visibleChars = 10,
  icon,
  copyLabel = 'Копіювати токен',
  copiedLabel = 'Скопійовано',
  actions,
  className,
}: SecretFieldProps) {
  const [showSecret, setShowSecret] = React.useState(false);

  const maskedValue = React.useMemo(() => {
    if (!value) return '';
    if (showSecret) return value;
    const prefix = value.slice(0, Math.min(visibleChars, value.length));
    return `${prefix}••••••••••••••••••••••••`;
  }, [value, showSecret, visibleChars]);

  return (
    <div
      className={cn(
        'rounded-lg border border-input bg-secondary/50 p-3.5 transition-colors',
        className
      )}
    >
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        <button
          type="button"
          onClick={() => setShowSecret(!showSecret)}
          className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer transition-colors"
        >
          {showSecret ? (
            <EyeOff className="size-3.5" />
          ) : (
            <Eye className="size-3.5" />
          )}
          <span>{showSecret ? 'Приховати' : 'Показати'}</span>
        </button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
        <div className="font-mono text-xs text-foreground select-all truncate font-medium">
          {maskedValue}
        </div>
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          <CopyButton
            value={value}
            label={copyLabel}
            copiedLabel={copiedLabel}
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
          />
          {actions}
        </div>
      </div>
    </div>
  );
}
