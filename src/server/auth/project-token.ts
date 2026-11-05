export const PROJECT_TOKEN_PREFIX = 'pmk_live_';
export const DEMO_TOKEN_PREFIX = 'pmk_demo_';

const TOKEN_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const PROJECT_TOKEN_LENGTH = 40;
export const WEBHOOK_SECRET_LENGTH = 40;

function randomString(alphabet: string, length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet.charAt(bytes[i] % alphabet.length);
  }
  return out;
}

export function generateProjectToken(): string {
  return `${PROJECT_TOKEN_PREFIX}${randomString(TOKEN_ALPHABET, PROJECT_TOKEN_LENGTH)}`;
}

export function generateDemoToken(): string {
  return `${DEMO_TOKEN_PREFIX}${randomString(TOKEN_ALPHABET, PROJECT_TOKEN_LENGTH)}`;
}

export function generateWebhookSecret(): string {
  return `whsec_${randomString(TOKEN_ALPHABET, WEBHOOK_SECRET_LENGTH)}`;
}

export async function hashProjectToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function isProjectToken(token: string): boolean {
  return token.startsWith(PROJECT_TOKEN_PREFIX) || token.startsWith(DEMO_TOKEN_PREFIX);
}

export async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
