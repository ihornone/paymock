#!/usr/bin/env tsx
/**
 * Creates (or lists) the Cloudflare rate-limiting rules that protect the
 * Paymock API.
 *
 * The application has its own in-isolate rate limiter, but that limiter only
 * lives inside one Worker isolate: it is a per-instance counter, so it is
 * both trivially bypassed by spreading the traffic over instances and
 * invisible to the edge. A Cloudflare rate-limiting rule is enforced before
 * the request ever reaches the Worker, which is the only place where the
 * limit actually holds against an attacker.
 *
 * Two rules are managed:
 *
 *   POST /api/admin/projects  — 5 requests/minute per IP.
 *     Creating a project is a rare, human action. Five per minute is far
 *     above any legitimate use and far below anything useful for an attack.
 *
 *   /api/mcp                 — 60 requests/minute per IP.
 *     The MCP endpoint is machine-facing, so the limit is looser; it still
 *     stops the "one request, one invoice" abuse pattern.
 *
 * The rules are identified by their `description`, so re-running the script
 * updates the managed rules and leaves every other rule in the zone alone.
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ZONE_ID=… tsx scripts/cloudflare/waf-rate-limit.ts
 *   … --list       # only print the rules that are currently configured
 *   … --dry-run    # print the JSON payload without calling the API
 *
 * The API token is only ever sent in the `Authorization` header — it is
 * never printed, not even in an error message.
 */

const API_BASE = 'https://api.cloudflare.com/client/v4';

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository root — the scripts live in `scripts/cloudflare/`. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * The Cloudflare API token.
 *
 * `CLOUDFLARE_API_TOKEN` wins. When it is absent, the OAuth token that
 * `wrangler login` wrote into the Wrangler config is used — the same
 * fallback as `scripts/d1-client.ts`, so an operator who is already logged
 * in does not have to export anything.
 *
 * The token is never printed.
 */
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
    // The config is unreadable (missing home directory, permissions) — the
    // environment variable is the only remaining source.
  }

  cachedToken = '';
  return cachedToken;
}

/**
 * The Cloudflare account id.
 *
 * `CLOUDFLARE_ACCOUNT_ID` wins; otherwise the id is taken from
 * `wrangler.toml`, which is where the deployment is configured anyway.
 */
function getAccountId(): string {
  const fromEnv = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (fromEnv) return fromEnv.trim();

  try {
    const content = readFileSync(join(REPO_ROOT, 'wrangler.toml'), 'utf-8');
    const match = content.match(/^\s*account_id\s*=\s*"([^"]+)"/m);
    if (match?.[1]) return match[1];
  } catch {
    // No wrangler.toml in the checkout — the environment variable is the
    // only remaining source.
  }

  return '';
}

/** The phase that holds the rate-limiting rules of a zone. */
const RATE_LIMIT_PHASE = 'http_ratelimit';

/** Prefix that marks a rule as managed by this script. */
const RULE_PREFIX = 'paymock:ratelimit';

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

interface Options {
  dryRun: boolean;
  list: boolean;
  zoneName: string | undefined;
  requestsPerMinute: number;
  mcpRequestsPerMinute: number;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    dryRun: false,
    list: false,
    zoneName: process.env.CLOUDFLARE_ZONE_NAME,
    requestsPerMinute: 5,
    mcpRequestsPerMinute: 60,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--list') options.list = true;
    else if (arg === '--zone') {
      options.zoneName = argv[i + 1];
      i += 1;
    } else if (arg === '--requests-per-minute') {
      options.requestsPerMinute = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--mcp-requests-per-minute') {
      options.mcpRequestsPerMinute = Number(argv[i + 1]);
      i += 1;
    }
  }

  return options;
}

/* ------------------------------------------------------------------ *
 * Cloudflare API
 * ------------------------------------------------------------------ */

interface ApiResult<T> {
  success: boolean;
  errors: Array<{ code?: number; message?: string }>;
  result: T;
}

/**
 * Calls the Cloudflare API and turns a failure into a readable error.
 *
 * The response body is included in the message because the Cloudflare error
 * codes are the only useful diagnostic here ("this plan has no rate limiting"
 * vs. "you are not allowed to edit this zone").
 */
async function cfFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const apiToken = getApiToken();
  if (!apiToken) {
    throw new Error(
      'No Cloudflare API token found. Set CLOUDFLARE_API_TOKEN, or run `wrangler login` so the OAuth token in ~/.config/.wrangler/config/default.toml can be used.'
    );
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  const raw = await response.text();

  let payload: ApiResult<T>;
  try {
    payload = JSON.parse(raw) as ApiResult<T>;
  } catch {
    throw new Error(`Cloudflare API returned a non-JSON response (${response.status}): ${raw.slice(0, 500)}`);
  }

  if (!response.ok || !payload.success) {
    const messages = (payload.errors || [])
      .map((error) => `${error.code ?? '?'}: ${error.message ?? 'unknown error'}`)
      .join('; ');
    throw new Error(`Cloudflare API ${init.method || 'GET'} ${path} failed (${response.status}): ${messages || raw.slice(0, 500)}`);
  }

  return payload.result;
}

/**
 * Resolves the zone id.
 *
 * `CLOUDFLARE_ZONE_ID` wins; otherwise the zone is looked up by name — a
 * zone id is not a secret, but hard-coding one per developer is a pain.
 */
async function resolveZoneId(options: Options): Promise<string> {
  const explicit = process.env.CLOUDFLARE_ZONE_ID;
  if (explicit) return explicit;

  if (!options.zoneName) {
    throw new Error(
      'Set CLOUDFLARE_ZONE_ID, or CLOUDFLARE_ZONE_NAME (or pass --zone <name>) so the zone can be looked up.'
    );
  }

  const zones = await cfFetch<Array<{ id: string; name: string }>>(
    `/zones?name=${encodeURIComponent(options.zoneName)}&status=active`
  );

  if (!zones || zones.length === 0) {
    throw new Error(`No active zone named "${options.zoneName}" was found for this token.`);
  }

  return zones[0].id;
}

/* ------------------------------------------------------------------ *
 * Rules
 * ------------------------------------------------------------------ */

interface RateLimitRule {
  description: string;
  expression: string;
  action: string;
  ratelimit: {
    characteristics: string[];
    period: number;
    requests_per_period: number;
    requests_to_origin: boolean;
  };
  action_parameters: { http: { status_code: number } };
}

interface Ruleset {
  id: string;
  name: string;
  kind: string;
  phase: string;
  rules: RateLimitRule[];
}

/**
 * Builds the rules this script manages.
 */
function buildManagedRules(options: Options): RateLimitRule[] {
  return [
    {
      description: `${RULE_PREFIX}:POST /api/admin/projects`,
      expression:
        '(http.request.method eq "POST" and http.request.uri.path eq "/api/admin/projects")',
      action: 'block',
      ratelimit: {
        characteristics: ['ip.src'],
        period: 60,
        requests_per_period: options.requestsPerMinute,
        requests_to_origin: false,
      },
      action_parameters: { http: { status_code: 429 } },
    },
    {
      description: `${RULE_PREFIX}:/api/mcp`,
      expression: '(http.request.uri.path eq "/api/mcp")',
      action: 'block',
      ratelimit: {
        characteristics: ['ip.src'],
        period: 60,
        requests_per_period: options.mcpRequestsPerMinute,
        requests_to_origin: false,
      },
      action_parameters: { http: { status_code: 429 } },
    },
  ];
}

/**
 * Reads the entry-point ruleset of the rate-limiting phase.
 *
 * Cloudflare answers 404 when the zone has no such ruleset yet — that is the
 * normal starting point, not an error.
 */
async function getRateLimitRuleset(zoneId: string): Promise<Ruleset | null> {
  try {
    const ruleset = await cfFetch<Ruleset>(
      `/zones/${zoneId}/rulesets/phases/${RATE_LIMIT_PHASE}/entrypoint`
    );
    return ruleset || null;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('(404)')) return null;
    throw error;
  }
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (!getApiToken()) {
    console.error('ERROR: no Cloudflare API token found.');
    console.error('');
    console.error('Either export CLOUDFLARE_API_TOKEN, or run `wrangler login` — the OAuth');
    console.error('token in ~/.config/.wrangler/config/default.toml is then used.');
    console.error('');
    console.error('The token needs at least:');
    console.error('  - Zone > Rate Limiting > Edit');
    console.error('  - Zone > Zone > Edit   (only when the zone id has to be looked up)');
    console.error('');
    process.exit(1);
  }

  const zoneId = await resolveZoneId(options);
  console.log(`Account: ${getAccountId() || '(not resolved)'}`);
  console.log(`Zone: ${zoneId}${options.zoneName ? ` (${options.zoneName})` : ''}`);

  let existing: Ruleset | null = null;
  let rulesetReadError: string | null = null;

  try {
    existing = await getRateLimitRuleset(zoneId);
  } catch (error: unknown) {
    // A dry run has to work even when the token cannot read the zone — the
    // payload is exactly what the operator wants to see, and that is often
    // the moment when the token is not (yet) allowed to touch the zone.
    if (!options.dryRun) throw error;
    rulesetReadError = error instanceof Error ? error.message : String(error);
    console.log('');
    console.log(`Warning: the existing ruleset could not be read (${rulesetReadError}).`);
    console.log('The payload below is what would be submitted; the rules that are');
    console.log('already in the zone are not part of it.');
    console.log('');
  }

  if (options.list) {
    if (!existing) {
      console.log('No rate-limiting ruleset exists for this zone yet.');
    } else {
      console.log(`Ruleset ${existing.id} "${existing.name}" (${existing.kind}/${existing.phase}):`);
      if (!existing.rules || existing.rules.length === 0) {
        console.log('  (no rules)');
      }
      for (const rule of existing.rules || []) {
        const managed = rule.description?.startsWith(RULE_PREFIX) ? ' [managed by this script]' : '';
        console.log(`  - ${rule.description || '(no description)'}${managed}`);
        console.log(`    action: ${rule.action}`);
        console.log(`    ratelimit: ${rule.ratelimit?.requests_per_period ?? '?'} requests / ${rule.ratelimit?.period ?? '?'}s per ${(rule.ratelimit?.characteristics || []).join(', ')}`);
        console.log(`    expression: ${rule.expression}`);
      }
    }
    console.log('');
    return;
  }

  const managedRules = buildManagedRules(options);

  // Keep every rule this script does not own, and replace the ones it does.
  const foreignRules = (existing?.rules || []).filter(
    (rule) => !rule.description?.startsWith(RULE_PREFIX)
  );
  const rules = [...foreignRules, ...managedRules];

  const payload = {
    name: existing?.name || 'Paymock rate limiting',
    kind: 'zone',
    phase: RATE_LIMIT_PHASE,
    rules,
  };

  if (options.dryRun) {
    console.log('Dry run — nothing was sent to Cloudflare. Payload:');
    console.log(JSON.stringify(payload, null, 2));
    console.log('');
    return;
  }

  if (existing) {
    console.log(`Updating ruleset ${existing.id}…`);
    await cfFetch(`/zones/${zoneId}/rulesets/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    console.log(`Ruleset ${existing.id} updated.`);
  } else {
    console.log('Creating a new rate-limiting ruleset…');
    const created = await cfFetch<Ruleset>(`/zones/${zoneId}/rulesets`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    console.log(`Ruleset ${created?.id ?? '(unknown id)'} created.`);
  }

  console.log('');
  console.log('Managed rules:');
  for (const rule of managedRules) {
    console.log(`  - ${rule.description}`);
    console.log(
      `    ${rule.ratelimit.requests_per_period} requests / ${rule.ratelimit.period}s per IP, action: ${rule.action}`
    );
  }
  console.log('');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('');
  console.error(`ERROR: ${message}`);
  console.error('');

  const options = parseArgs(process.argv.slice(2));

  // A `--list` run changes nothing, so there is no payload to fall back to.
  if (!options.list) {
    console.error('The rules were not applied. The payload below can be pasted into');
    console.error('the Cloudflare dashboard (Rules → Rate limiting) as a fallback:');
    console.error('');
    try {
      console.log(
        JSON.stringify(
          {
            name: 'Paymock rate limiting',
            kind: 'zone',
            phase: RATE_LIMIT_PHASE,
            rules: buildManagedRules(options),
          },
          null,
          2
        )
      );
    } catch {
      // The fallback payload is a convenience; the error above is the real report.
    }
    console.error('');
  }

  process.exit(1);
});
