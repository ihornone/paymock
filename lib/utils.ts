import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrencyAmount(amountInCents: number, ccy: number = 980): string {
  const major = (amountInCents / 100).toFixed(2);
  const symbol = ccy === 980 ? '₴' : ccy === 840 ? '$' : ccy === 978 ? '€' : '';
  return `${major} ${symbol}`.trim();
}
