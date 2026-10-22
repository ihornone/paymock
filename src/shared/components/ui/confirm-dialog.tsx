'use client';

import * as React from 'react';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface ConfirmActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmTextRequired?: string;
  confirmButtonText?: string;
  variant?: 'destructive' | 'warning';
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmTextRequired,
  confirmButtonText = 'Підтвердити',
  variant = 'destructive',
  isLoading = false,
  onConfirm,
}: ConfirmActionDialogProps) {
  const [inputValue, setInputValue] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setInputValue('');
    }
  }, [open]);

  const isConfirmed = confirmTextRequired ? inputValue.trim() === confirmTextRequired.trim() : true;

  const handleConfirm = async () => {
    if (!isConfirmed || isLoading) return;
    await onConfirm();
  };

  const isDestructive = variant === 'destructive';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle className={`flex items-center gap-2 ${isDestructive ? 'text-rose-400' : 'text-amber-400'}`}>
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{title}</span>
        </DialogTitle>
        <div className="pt-2 text-xs text-muted-foreground space-y-2">
          {description}
        </div>
      </DialogHeader>

      {confirmTextRequired && (
        <div className="space-y-2 py-3 border-y border-border/50 my-2">
          <label className="text-xs text-foreground block font-medium">
            Для підтвердження введіть назву <span className="font-mono text-primary font-semibold select-all">"{confirmTextRequired}"</span>:
          </label>
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={confirmTextRequired}
            className="font-mono text-xs h-9 bg-background focus-visible:ring-primary"
            autoFocus
          />
        </div>
      )}

      <DialogFooter>
        <DialogClose asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isLoading}
            onClick={() => onOpenChange(false)}
            className="h-8 text-xs cursor-pointer"
          >
            Скасувати
          </Button>
        </DialogClose>
        <Button
          type="button"
          variant={isDestructive ? 'destructive' : 'default'}
          size="sm"
          disabled={!isConfirmed || isLoading}
          onClick={handleConfirm}
          className={`h-8 text-xs gap-1.5 cursor-pointer ${
            !isDestructive && variant === 'warning'
              ? 'bg-amber-600 hover:bg-amber-700 text-white disabled:bg-amber-600/40'
              : ''
          }`}
        >
          {isLoading ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              <span>Обробка...</span>
            </>
          ) : (
            <>
              {isDestructive ? <Trash2 className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
              <span>{confirmButtonText}</span>
            </>
          )}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
