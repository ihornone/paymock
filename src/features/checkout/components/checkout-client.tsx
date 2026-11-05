'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Package,
  CreditCard,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  ShoppingBag,
  Clock,
  AlertCircle
} from 'lucide-react';
import { formatCurrencyAmount } from '@/shared/utils/cn';
import type { InvoiceRecord, Project } from '@/shared/types/models';
import type { BasketItem } from '@/shared/types/acquiring';

interface CheckoutClientProps {
  invoice: InvoiceRecord;
  project: Project | null;
}

function ProductImage({ src, alt }: { src?: string | null; alt: string }) {
  const [hasError, setHasError] = React.useState(false);

  if (!src || hasError) {
    return (
      <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg bg-secondary border border-border flex items-center justify-center text-muted-foreground shrink-0 shadow-xs">
        <Package className="h-4 w-4 sm:h-5 sm:w-5" />
      </div>
    );
  }

  return (
    <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg border border-border overflow-hidden bg-background shrink-0 flex items-center justify-center shadow-xs">
      <img
        src={src}
        alt={alt}
        onError={() => setHasError(true)}
        className="h-full w-full object-contain p-0.5"
      />
    </div>
  );
}

function MerchantAvatar({ logoUrl, name }: { logoUrl?: string | null; name?: string }) {
  const [hasError, setHasError] = React.useState(false);

  if (logoUrl && !hasError) {
    return (
      <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-full border border-border bg-background flex items-center justify-center overflow-hidden shadow-xs ring-4 ring-primary/5">
        <img
          src={logoUrl}
          alt={name || 'Логотип'}
          onError={() => setHasError(true)}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  const initial = (name || 'P').trim().charAt(0).toUpperCase();

  return (
    <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-full bg-secondary border border-border text-foreground flex items-center justify-center shadow-xs ring-4 ring-primary/5">
      {name ? (
        <span className="font-mono text-xl sm:text-2xl font-bold text-primary">{initial}</span>
      ) : (
        <Building2 className="h-7 w-7 sm:h-8 sm:w-8 text-primary" />
      )}
    </div>
  );
}

export function CheckoutClient({ invoice, project }: CheckoutClientProps) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = React.useState<string | null>(null);
  const [cardNumber, setCardNumber] = React.useState('4441 1144 5555 1234');
  const [expDate, setExpDate] = React.useState('12/28');
  const [cvc, setCvc] = React.useState('999');
  const [redirectCountdown, setRedirectCountdown] = React.useState<number | null>(null);
  const [redirectTarget, setRedirectTarget] = React.useState<string | null>(null);

  const validitySec = invoice.validity || 900;
  const createdAtMs = React.useMemo(() => new Date(invoice.created_date).getTime(), [invoice.created_date]);
  const expiresAtMs = React.useMemo(() => createdAtMs + validitySec * 1000, [createdAtMs, validitySec]);

  const [timeLeft, setTimeLeft] = React.useState<number>(() => {
    return Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
  });

  React.useEffect(() => {
    if (invoice.status !== 'created') return;

    const updateTimer = () => {
      const remaining = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        handleSimulate('expired');
      }
    };

    updateTimer();
    const timerInterval = setInterval(updateTimer, 1000);
    return () => clearInterval(timerInterval);
  }, [expiresAtMs, invoice.status]);

  const timerMinutes = Math.floor(timeLeft / 60);
  const timerSeconds = timeLeft % 60;
  const formattedCountdown = `${timerMinutes.toString().padStart(2, '0')}:${timerSeconds.toString().padStart(2, '0')}`;

  React.useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applySystemTheme = (isDarkTheme: boolean) => {
      if (isDarkTheme) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    applySystemTheme(mediaQuery.matches);

    const listener = (e: MediaQueryListEvent) => {
      applySystemTheme(e.matches);
    };

    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  const basket: BasketItem[] = React.useMemo(() => {
    if (!invoice.basket_json) return [];
    try {
      return JSON.parse(invoice.basket_json);
    } catch {
      return [];
    }
  }, [invoice.basket_json]);

  const rawBasketTotal = React.useMemo(
    () =>
      basket.reduce(
        (acc, item) =>
          acc +
          (item.total ??
            (item.sum !== undefined
              ? item.sum * (item.qty || 1)
              : (item.price || 0) * (item.qty || 1))),
        0
      ),
    [basket]
  );

  const isMajorUnits =
    rawBasketTotal > 0 && Math.round(rawBasketTotal * 100) === invoice.amount;
  const unitMultiplier = isMajorUnits ? 100 : 1;
  const basketTotal = rawBasketTotal * unitMultiplier;
  const basketMismatch = basket.length > 0 && basketTotal !== invoice.amount;

  const targetUrl = invoice.success_url || invoice.redirect_url;

  React.useEffect(() => {
    if (typeof window !== 'undefined' && invoice.status) {
      const messagePayload = {
        source: 'paymock',
        type: 'payment_status',
        status: invoice.status,
        invoiceId: invoice.id,
        amount: invoice.amount,
        ccy: invoice.ccy,
      };

      if (window.parent && window.parent !== window) {
        window.parent.postMessage(messagePayload, '*');
      }
      if (window.opener) {
        window.opener.postMessage(messagePayload, '*');
      }
    }
  }, [invoice.status, invoice.id, invoice.amount, invoice.ccy]);

  React.useEffect(() => {
    if (invoice.status === 'success' && targetUrl) {
      setRedirectTarget(targetUrl);
      setRedirectCountdown(10);

      const interval = setInterval(() => {
        setRedirectCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(interval);
            window.location.href = targetUrl;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [invoice.status, targetUrl]);

  const handleSimulate = async (action: 'success' | 'failure' | 'processing' | 'expired') => {
    try {
      setLoadingAction(action);
      const res = await fetch(`/pay/${invoice.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();

      if (data.redirectUrl) {
        setRedirectTarget(data.redirectUrl);
      }
      router.refresh();
    } catch (err: any) {
      alert('Помилка обробки платежу: ' + err.message);
    } finally {
      setLoadingAction(null);
    }
  };

  const formattedAmount = formatCurrencyAmount(invoice.amount, invoice.ccy);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-3 sm:p-6 antialiased selection:bg-primary/20 transition-colors duration-200">
      <header className="mb-4 sm:mb-6 flex items-center justify-center gap-2">
        <span className="text-xl sm:text-2xl font-black tracking-tight text-foreground font-mono">paymock</span>
        <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground uppercase">
          Pay
        </span>
      </header>

      <div className="w-full max-w-lg md:max-w-4xl bg-card rounded-xl shadow-xl border border-border overflow-hidden transition-all">
        {invoice.status === 'success' ? (
          <div className="p-6 sm:p-14 text-center space-y-5 animate-in fade-in-0 duration-300">
            <div className="mx-auto flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <CheckCircle2 className="h-10 w-10 sm:h-12 sm:w-12" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Успішна оплата!</h2>
              <p className="text-xs sm:text-sm text-muted-foreground font-medium max-w-md mx-auto">
                Рахунок на суму <strong className="text-foreground font-semibold">{formattedAmount}</strong> успішно сплачено.
                Вебхук надіслано мерчанту.
              </p>
            </div>

            {redirectTarget && (
              <div className="pt-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Автоматичне повернення до магазину через <span className="font-bold text-foreground">{redirectCountdown ?? 10}</span> сек...
                </p>
                <a
                  href={redirectTarget}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-6 py-3 text-xs sm:text-sm font-semibold shadow-xs hover:bg-primary/90 transition cursor-pointer"
                >
                  Повернутися до магазину
                  <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            )}
          </div>
        ) : invoice.status === 'failure' ? (
          <div className="p-6 sm:p-14 text-center space-y-5 animate-in fade-in-0 duration-300">
            <div className="mx-auto flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/20">
              <XCircle className="h-10 w-10 sm:h-12 sm:w-12" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Оплату відхилено</h2>
              <p className="text-xs sm:text-sm text-muted-foreground font-medium max-w-md mx-auto">
                {invoice.failure_reason || 'Банк-емітент відхилив транзакцію (тестова симуляція помилки).'}
              </p>
            </div>
            <div className="pt-4 flex flex-col sm:flex-row justify-center gap-2.5 sm:gap-3">
              <button
                type="button"
                onClick={() => handleSimulate('success')}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-6 py-3 text-xs sm:text-sm font-semibold shadow-xs hover:bg-primary/90 transition cursor-pointer"
              >
                <RefreshCw className="h-4 w-4" />
                Спробувати знову (Успіх)
              </button>
              {invoice.fail_url && (
                <a
                  href={invoice.fail_url}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary text-secondary-foreground px-5 py-3 text-xs sm:text-sm font-semibold hover:bg-accent transition"
                >
                  Повернутися
                </a>
              )}
            </div>
          </div>
        ) : invoice.status === 'expired' ? (
          <div className="p-6 sm:p-14 text-center space-y-5 animate-in fade-in-0 duration-300">
            <div className="mx-auto flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <Clock className="h-10 w-10 sm:h-12 sm:w-12" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Час дії рахунку вичерпано</h2>
              <p className="text-xs sm:text-sm text-muted-foreground font-medium max-w-md mx-auto">
                Термін дії цього платіжного посилання (15 хвилин) закінчився. Будь ласка, поверніться до магазину та сформуйте нове замовлення.
              </p>
            </div>
            <div className="pt-4 flex justify-center">
              {invoice.fail_url || invoice.redirect_url ? (
                <a
                  href={invoice.fail_url || invoice.redirect_url!}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-6 py-3 text-xs sm:text-sm font-semibold shadow-xs hover:bg-primary/90 transition cursor-pointer"
                >
                  Повернутися до магазину
                  <ArrowRight className="h-4 w-4" />
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => router.refresh()}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary text-secondary-foreground px-5 py-2.5 text-xs sm:text-sm font-semibold hover:bg-accent transition cursor-pointer"
                >
                  <RefreshCw className="h-4 w-4" />
                  Оновити сторінку
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
            <div className="p-5 sm:p-8 md:p-10 flex flex-col justify-between space-y-6 sm:space-y-8 bg-card">
              <div className="space-y-5 sm:space-y-6">
                <div className="flex flex-col items-center text-center space-y-3">
                  <MerchantAvatar logoUrl={project?.logo_url} name={project?.name} />
                  <div>
                    <h3 className="text-sm sm:text-base font-semibold text-foreground">
                      {project?.name || 'Тестовий мерчант'}
                    </h3>
                  </div>

                  <div className="flex flex-col items-center gap-2">
                    <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                      Оплата замовлення <span className="font-mono font-semibold text-foreground">#{invoice.id}</span>
                    </p>
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-mono transition-colors ${
                      timeLeft < 120
                        ? 'border-amber-500/50 bg-amber-500/10 text-amber-500 font-semibold animate-pulse'
                        : 'border-border bg-secondary/60 text-muted-foreground'
                    }`}>
                      <Clock className="h-3.5 w-3.5 text-primary" />
                      <span>Дійсний ще {formattedCountdown}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-border">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 sm:mb-4">
                    <ShoppingBag className="h-3.5 w-3.5" />
                    <span>Товари в кошику</span>
                  </div>

                  {basket.length > 0 ? (
                    <div className="space-y-3 divide-y divide-border/60 max-h-56 sm:max-h-72 overflow-y-auto pr-1">
                      {basketMismatch && (
                        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] sm:text-xs text-amber-300">
                          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>
                            Сума позицій кошика ({formatCurrencyAmount(basketTotal, invoice.ccy)}) не збігається
                            із сумою інвойсу ({formatCurrencyAmount(invoice.amount, invoice.ccy)}). Ймовірно,
                            кошик передано в гривнях замість копійок — сума позицій має збігатися з{' '}
                            <code className="font-mono">amount</code>. Платіж буде проведено за сумою інвойсу.
                          </span>
                        </div>
                      )}
                      {basket.map((item, idx) => {
                        const itemPhoto = item.icon || item.img || item.image || item.picture || null;
                        const itemRawTotal =
                          item.total ??
                          (item.sum !== undefined
                            ? item.sum * (item.qty || 1)
                            : (item.price || 0) * (item.qty || 1));
                        const itemAmountInCents = itemRawTotal * unitMultiplier;
                        return (
                          <div key={idx} className="pt-3 first:pt-0 flex items-center justify-between gap-3 text-xs sm:text-sm">
                            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                              <ProductImage src={itemPhoto} alt={item.name} />
                              <div className="min-w-0">
                                <p className="font-medium text-foreground truncate leading-snug">{item.name}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {item.qty} {item.unit || 'шт.'}
                                </p>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-semibold text-foreground font-mono text-xs sm:text-sm">
                                {formatCurrencyAmount(itemAmountInCents, invoice.ccy)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-lg bg-secondary/40 border border-border p-3.5 space-y-2 text-xs text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Номер інвойсу:</span>
                        <span className="font-mono text-foreground font-semibold">{invoice.id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Тип оплати:</span>
                        <span className="font-medium text-foreground uppercase">{invoice.payment_type || 'debit'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Час створення:</span>
                        <span className="text-foreground">{new Date(invoice.created_date).toLocaleTimeString('uk-UA')}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground pt-2 border-t border-border/60">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                <span>Захищено Paymock Acquiring Sandbox</span>
              </div>
            </div>

            <div className="p-5 sm:p-8 md:p-10 flex flex-col justify-start space-y-6 sm:space-y-8 bg-card/60">
              <div className="space-y-5 sm:space-y-6">
                <div className="flex items-center justify-between pb-1 border-b border-border/60">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Оплата карткою
                  </span>
                  <div className="flex gap-2 text-[11px] font-mono text-muted-foreground">
                    <span>Visa</span>
                    <span>•</span>
                    <span>Mastercard</span>
                  </div>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSimulate('success');
                  }}
                  className="space-y-4"
                >
                  <div className="relative rounded-lg border border-input bg-background px-3.5 pt-3.5 pb-2 shadow-xs focus-within:border-primary focus-within:ring-1 focus-within:ring-ring transition">
                    <label
                      htmlFor="checkout-card-number"
                      className="absolute top-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      Номер картки
                    </label>
                    <div className="flex items-center justify-between pt-2">
                      <input
                        id="checkout-card-number"
                        name="cardNumber"
                        autoComplete="cc-number"
                        type="text"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        placeholder="0000 0000 0000 0000"
                        className="w-full bg-transparent font-mono text-sm sm:text-base font-semibold text-foreground focus:outline-none tracking-wider placeholder:text-muted-foreground/40"
                      />
                      <CreditCard className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground shrink-0 ml-2" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                    <div className="relative rounded-lg border border-input bg-background px-3.5 pt-3.5 pb-2 shadow-xs focus-within:border-primary focus-within:ring-1 focus-within:ring-ring transition">
                      <label
                        htmlFor="checkout-exp-date"
                        className="absolute top-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        Строк дії
                      </label>
                      <input
                        id="checkout-exp-date"
                        name="expDate"
                        autoComplete="cc-exp"
                        type="text"
                        value={expDate}
                        onChange={(e) => setExpDate(e.target.value)}
                        placeholder="MM/YY"
                        maxLength={5}
                        className="w-full bg-transparent pt-2 font-mono text-sm sm:text-base font-semibold text-foreground focus:outline-none placeholder:text-muted-foreground/40"
                      />
                    </div>
                    <div className="relative rounded-lg border border-input bg-background px-3.5 pt-3.5 pb-2 shadow-xs focus-within:border-primary focus-within:ring-1 focus-within:ring-ring transition">
                      <label
                        htmlFor="checkout-cvc"
                        className="absolute top-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        CVC2
                      </label>
                      <input
                        id="checkout-cvc"
                        name="cvc"
                        autoComplete="cc-csc"
                        type="password"
                        value={cvc}
                        onChange={(e) => setCvc(e.target.value)}
                        placeholder="•••"
                        maxLength={4}
                        className="w-full bg-transparent pt-2 font-mono text-sm sm:text-base font-semibold text-foreground focus:outline-none tracking-widest placeholder:text-muted-foreground/40"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={invoice.status !== 'created' || !!loadingAction}
                    className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.99] py-3.5 sm:py-4 px-6 text-sm sm:text-base font-semibold shadow-xs transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingAction === 'success' ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>Обробка платежу...</span>
                      </>
                    ) : (
                      <>
                        <span>Оплатити {formattedAmount}</span>
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="mt-4 sm:mt-6 text-center text-xs text-muted-foreground">
        <p>Paymock — емулятор платіжного шлюзу для розробки та тестування.</p>
      </footer>
    </div>
  );
}
