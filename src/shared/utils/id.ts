/**
 * Identifier generation.
 *
 * All random identifiers use `crypto.getRandomValues` — `Math.random()` is not
 * a CSPRNG and previously produced the merchant `X-Token` credential from only
 * ~36 bits of entropy.
 */

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const TOKEN_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export const INVOICE_ID_LENGTH = 10;
export const PROJECT_TOKEN_LENGTH = 24;
export const WEBHOOK_LOG_ID_LENGTH = 12;

export function randomString(alphabet: string, length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet.charAt(bytes[i] % alphabet.length);
  }
  return out;
}

export function generateInvoiceId(): string {
  // p2_... acquiring invoice ID
  return `p2_${randomString(ID_ALPHABET, INVOICE_ID_LENGTH)}`;
}

export function generateProjectId(): string {
  return crypto.randomUUID();
}

export function generateProjectToken(): string {
  return `pmk_live_${randomString(TOKEN_ALPHABET, PROJECT_TOKEN_LENGTH)}`;
}

export function generateWebhookLogId(): string {
  return `wh_${randomString(TOKEN_ALPHABET, WEBHOOK_LOG_ID_LENGTH)}`;
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
