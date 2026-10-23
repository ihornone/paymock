/**
 * Seeds the demo tenant.
 *
 * The demo token used to be hard-coded in `schema.sql`
 * (`pmk_demo_test1234567890abcdef`) — the same credential on every
 * installation, trivially guessable and readable in the repository. It is
 * generated here instead, stored as a hash, and printed exactly once.
 *
 * The demo tenant is a development convenience. In production it is switched
 * off with `ENABLE_DEMO_TENANT=false`.
 *
 * Usage:
 *   CLOUDFLARE_DATABASE_ID=<id> tsx scripts/seed-demo.ts
 */

import { d1Query, getDatabaseId } from './d1-client';

const DEMO_PROJECT_ID = 'pm_demo_store';
const DEMO_USER_ID = 'demo_user';

const TOKEN_ALPHABET =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randomString(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += TOKEN_ALPHABET.charAt(bytes[i] % TOKEN_ALPHABET.length);
  }
  return out;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function main(): Promise<void> {
  if (process.env.ENABLE_DEMO_TENANT === 'false') {
    console.log('Demo tenant is disabled (ENABLE_DEMO_TENANT=false). Nothing to do.');
    return;
  }

  console.log(`→ database: ${getDatabaseId()}`);

  const { results } = await d1Query(
    'SELECT id FROM projects WHERE id = ?',
    [DEMO_PROJECT_ID]
  );

  if (results.length > 0) {
    console.log('Demo tenant already exists — nothing to do.');
    return;
  }

  const token = `pmk_demo_${randomString(40)}`;
  const webhookSecret = `whsec_${randomString(40)}`;
  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();

  await d1Query(
    `INSERT INTO projects (
       id, user_id, name, token_hash, webhook_secret, edrpou,
       default_webhook_url, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      DEMO_PROJECT_ID,
      DEMO_USER_ID,
      'Демо Магазин (Paymock)',
      tokenHash,
      webhookSecret,
      '38749210',
      'https://webhook.site/paymock-demo',
      now,
      now,
    ]
  );

  console.log('\n=== DEMO TENANT CREATED ===');
  console.log(`X-Token: ${token}`);
  console.log(`webhook secret: ${webhookSecret}`);
  console.log(
    '\nThe token is shown once — only its hash is stored. Set ENABLE_DEMO_TENANT=false in production.'
  );
}

main().catch((err) => {
  console.error('Seeding failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
