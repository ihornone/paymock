export function generateInvoiceId(): string {
  // p2_... acquiring invoice ID
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let str = 'p2_';
  for (let i = 0; i < 10; i++) {
    str += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return str;
}

export function generateProjectId(): string {
  return crypto.randomUUID();
}

export function generateProjectToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let str = 'pmk_live_';
  for (let i = 0; i < 24; i++) {
    str += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return str;
}

export function generateWebhookLogId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let str = 'wh_';
  for (let i = 0; i < 12; i++) {
    str += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return str;
}

export function formatCurrencyAmount(cents: number, ccy: number = 980): string {
  const amount = (cents / 100).toFixed(2);
  switch (ccy) {
    case 980:
      return `${amount} ₴`;
    case 840:
      return `$${amount}`;
    case 978:
      return `€${amount}`;
    case 985:
      return `${amount} zł`;
    default:
      return `${amount} (${ccy})`;
  }
}
