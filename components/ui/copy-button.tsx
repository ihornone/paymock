'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useClipboard } from '@/hooks/use-clipboard';
import { cn } from '@/lib/utils';

export interface CopyButtonProps
  extends Omit<ButtonProps, 'value' | 'onClick'> {
  value: string;
  label?: string;
  copiedLabel?: string;
  timeout?: number;
  onCopy?: () => void;
}

export function CopyButton({
  value,
  label,
  copiedLabel = 'Скопійовано',
  timeout = 2000,
  onCopy,
  variant = 'ghost',
  size = 'icon',
  className,
  ...props
}: CopyButtonProps) {
  const { copied, copy } = useClipboard({ timeout, onCopy });

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    copy(value);
  };

  const isIconOnly = size === 'icon' || !label;

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleCopy}
      aria-label={copied ? copiedLabel : label || 'Копіювати в буфер'}
      title={copied ? copiedLabel : label || 'Копіювати'}
      className={cn('transition-all duration-200', className)}
      {...props}
    >
      {copied ? (
        <Check className={cn('size-3.5 text-emerald-400', !isIconOnly && 'mr-1.5')} />
      ) : (
        <Copy className={cn('size-3.5 text-muted-foreground', !isIconOnly && 'mr-1.5')} />
      )}
      {!isIconOnly && (
        <span className={cn('text-xs', copied && 'text-emerald-400')}>
          {copied ? copiedLabel : label}
        </span>
      )}
    </Button>
  );
}
