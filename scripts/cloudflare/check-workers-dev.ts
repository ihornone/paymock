#!/usr/bin/env tsx

const API_BASE = 'https://api.cloudflare.com/client/v4';

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const STRICT = process.argv.includes('--strict');

interface SubdomainResponse {
  enabled?: boolean;
  subdomain?: string;
}

let cachedToken: string | null = null;

function getApiToken(): string {
  if (cachedToken !== null) return cachedToken;

  const fromEnv = process.env.CLOUDFLARE_API_TOKEN;
  if (fromEnv) {
    cachedToken = fromEnv.trim();
    return cachedToken;
  }

  try {
    const configPath = join(
      homedir(),
      '.config',
      '.wrangler',
      'config',
      'default.toml'
    );
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, 'utf-8');
      const match = content.match(/oauth_token\s*=\s*"([^"]+)"/);
      if (match?.[1]) {
        cachedToken = match[1];
        return cachedToken;
      }
    }
  } catch {
  }

  cachedToken = '';
  return cachedToken;
}

function getAccountId(): string {
  const fromEnv = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (fromEnv) return fromEnv.trim();

  try {
    const content = readFileSync(join(REPO_ROOT, 'wrangler.toml'), 'utf-8');
    const match = content.match(/^\s*account_id\s*=\s*"([^"]+)"/m);
    if (match?.[1]) return match[1];
  } catch {
  }

  return '';
}

async function main(): Promise<void> {
  if (!getApiToken()) {
    console.error('ERROR: no Cloudflare API token found.');
    console.error('');
    console.error('Either export CLOUDFLARE_API_TOKEN, or run `wrangler login` — the OAuth');
    console.error('token in ~/.config/.wrangler/config/default.toml is then used.');
    console.error('');
    console.error('The token needs at least "Account > Workers Scripts > Edit".');
    process.exit(1);
  }

  const accountId = getAccountId();
  if (!accountId) {
    console.error('ERROR: no Cloudflare account id found.');
    console.error('Set CLOUDFLARE_ACCOUNT_ID, or make sure wrangler.toml contains an account_id.');
    process.exit(1);
  }

  const response = await fetch(`${API_BASE}/accounts/${accountId}/workers/subdomain`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${getApiToken()}`,
      'Content-Type': 'application/json',
    },
  });

  const raw = await response.text();

  let payload: { success?: boolean; result?: SubdomainResponse; errors?: Array<{ message?: string }> };

  try {
    payload = JSON.parse(raw) as typeof payload;
  } catch {
    console.error(`ERROR: Cloudflare API returned a non-JSON response (${response.status}): ${raw.slice(0, 300)}`);
    process.exit(1);
  }

  if (!response.ok || !payload.success) {
    const messages = (payload.errors || [])
      .map((error) => error.message ?? 'unknown error')
      .join('; ');
    console.error(`ERROR: Cloudflare API request failed (${response.status}): ${messages || raw.slice(0, 300)}`);
    process.exit(1);
  }

  const result = payload.result ?? {};
  const subdomain = (result.subdomain ?? '').trim();

  const enabled = subdomain.length > 0;

  if (!enabled) {
    console.log('OK: the public *.workers.dev subdomain is disabled.');
    console.log('The Worker can only be reached through the custom domain,');
    console.log('so the zone WAF and rate-limiting rules apply to every request.');
    return;
  }

  const host = subdomain ? `${subdomain}.workers.dev` : '<account>.workers.dev';

  console.log('');
  console.log('*** WARNING: the public *.workers.dev subdomain is ENABLED ***');
  console.log('');
  console.log(`Public Worker URL: https://${host}`);
  console.log('');
  console.log('This hostname bypasses every edge control configured for the');
  console.log('custom domain:');
  console.log('  - the zone rate-limiting rules (scripts/cloudflare/waf-rate-limit.ts)');
  console.log('  - the zone WAF rules and bot management');
  console.log('  - any Cloudflare Access policy in front of the custom domain');
  console.log('');
  console.log('Requests sent to that hostname still reach the Worker, so the');
  console.log('application-level limiter is the only thing left in front of it.');
  console.log('');
  console.log('Fix — either disable the subdomain:');
  console.log('  Dashboard: Workers & Pages → your Worker → Settings → Domains');
  console.log('  API:       DELETE /accounts/' + accountId + '/workers/subdomain');
  console.log('');
  console.log('…or put a Cloudflare Access policy in front of the workers.dev');
  console.log('hostname so that the bypass is authenticated as well.');
  console.log('');

  if (STRICT) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('');
  console.error(`ERROR: ${message}`);
  process.exit(1);
});

export {};
