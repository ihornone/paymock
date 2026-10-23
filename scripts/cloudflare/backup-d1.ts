#!/usr/bin/env tsx
/**
 * Exports the D1 database to a JSON file.
 *
 * D1 has no built-in "dump" endpoint like a local SQLite file, and the
 * Workers runtime never materialises the database on disk — so the only way
 * to take a backup is to read every table through the API.
 *
 * Two properties matter for this script:
 *
 *   1. It must not fail halfway and leave a half-written file that looks
 *      like a complete backup. The file is written once, at the end, and a
 *      table that could not be read is recorded as an error inside the file.
 *
 *   2. It must not become a secret-leaking artefact. `token_hash`,
 *      `webhook_secret` and the legacy plaintext `token` column are
 *      replaced with a marker by default. The hashes are one-way, but the
 *      webhook secret is not — it signs outgoing webhooks — and a backup
 *      that is committed to Git turns it into a shared credential.
 *
 *      `--include-secrets` keeps the raw values. Use it only for an
 *      encrypted, access-controlled copy.
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=… tsx scripts/cloudflare/backup-d1.ts
 *   … --out /secure/place/d1.json
 *   … --include-secrets
 *
 * The API token is only ever sent in the `Authorization` header.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository root — the scripts live in `scripts/cloudflare/`. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const API_BASE = 'https://api.cloudflare.com/client/v4';

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

/**
 * The database id.
 *
 * It is not a secret, but it differs per environment, so it is read from the
 * environment first and only then from `wrangler.toml` — so the script
 * always targets the database the deployment actually uses.
 */
function getDatabaseId(): string {
  const fromEnv = process.env.CLOUDFLARE_DATABASE_ID;
  if (fromEnv) return fromEnv.trim();

  try {
    const content = readFileSync(join(REPO_ROOT, 'wrangler.toml'), 'utf-8');
    const match = content.match(/database_id\s*=\s*"([^"]+)"/);
    if (match?.[1]) return match[1];
  } catch {
    // No wrangler.toml in the checkout.
  }

  return '263234ee-228e-4b8c-81a9-57777ad70bbc';
}

/**
 * The tables to export.
 *
 * The SQL is written out literally for every table: a template string here
 * would be exactly the string interpolation that `scripts/lint-sql.ts`
 * forbids, and the table list is static anyway.
 */
const TABLES: ReadonlyArray<{ name: string; sql: string }> = [
  { name: 'projects', sql: 'SELECT * FROM projects' },
  { name: 'invoices', sql: 'SELECT * FROM invoices' },
  { name: 'webhook_logs', sql: 'SELECT * FROM webhook_logs' },
  { name: 'personal_access_tokens', sql: 'SELECT * FROM personal_access_tokens' },
  { name: 'audit_log', sql: 'SELECT * FROM audit_log' },
];

/**
 * Columns whose values are replaced with the redaction marker.
 */
const SECRET_COLUMNS = [
  'token',
  'token_hash',
  'webhook_secret',
  'secret',
  'password',
  'api_key',
];

const REDACTION_MARKER = '__redacted__';

const WARNING = [
  'This backup was produced by scripts/cloudflare/backup-d1.ts.',
  '',
  'It may contain personal data (merchant names, ED RPOU numbers, invoice',
  'comments, IP addresses of operators).',
  '',
  'Secret columns (token, token_hash, webhook_secret, …) are replaced with',
  `"${REDACTION_MARKER}" unless the backup was created with --include-secrets.`,
  'A redacted backup cannot be restored into a working system: the affected',
  'credentials have to be rotated instead.',
  '',
  'Do NOT commit this file. The `backups/` directory is in .gitignore for',
  'that reason — keep the copy outside the repository and encrypt it.',
].join('\n');

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

interface Options {
  out: string | undefined;
  includeSecrets: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { out: undefined, includeSecrets: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') {
      options.out = argv[i + 1];
      i += 1;
    } else if (arg === '--include-secrets') {
      options.includeSecrets = true;
    }
  }

  return options;
}

/* ------------------------------------------------------------------ *
 * Redaction
 * ------------------------------------------------------------------ */

type Row = Record<string, unknown>;

/**
 * Replaces the values of the secret columns with a marker.
 *
 * The column names are matched case-insensitively because a migrated schema
 * may still carry the legacy plaintext `token` column.
 */
function redactRows(rows: Row[]): { rows: Row[]; redactedColumns: string[] } {
  const found = new Set<string>();
  const result = rows.map((row) => {
    const copy: Row = { ...row };
    for (const column of SECRET_COLUMNS) {
      for (const key of Object.keys(copy)) {
        if (key.toLowerCase() === column.toLowerCase() && copy[key] !== null) {
          copy[key] = REDACTION_MARKER;
          found.add(key);
        }
      }
    }
    return copy;
  });

  return { rows: result, redactedColumns: [...found].sort() };
}

/* ------------------------------------------------------------------ *
 * Cloudflare API
 * ------------------------------------------------------------------ */

interface QueryResponse {
  result?: Array<{ results?: Row[]; success?: boolean; meta?: { changes?: number } }>;
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
}

/**
 * Runs one SQL statement against the database.
 */
async function query(sql: string): Promise<Row[]> {
  const apiToken = getApiToken();
  const accountId = getAccountId();
  const databaseId = getDatabaseId();

  const response = await fetch(
    `${API_BASE}/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql }),
    }
  );

  const raw = await response.text();

  let payload: QueryResponse;
  try {
    payload = JSON.parse(raw) as QueryResponse;
  } catch {
    throw new Error(`D1 API returned a non-JSON response (${response.status}): ${raw.slice(0, 300)}`);
  }

  if (!response.ok || !payload.success) {
    const messages = (payload.errors || [])
      .map((error) => `${error.code ?? '?'}: ${error.message ?? 'unknown error'}`)
      .join('; ');
    throw new Error(`D1 query failed (${response.status}): ${messages || raw.slice(0, 300)}`);
  }

  return payload.result?.[0]?.results ?? [];
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
    console.error('The token needs at least "Account > D1 > Edit" and "Account > Workers Scripts > Edit".');
    process.exit(1);
  }

  const accountId = getAccountId();
  if (!accountId) {
    console.error('ERROR: no Cloudflare account id found.');
    console.error('Set CLOUDFLARE_ACCOUNT_ID, or make sure wrangler.toml contains an account_id.');
    process.exit(1);
  }

  const databaseId = getDatabaseId();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = options.out
    ? resolve(options.out)
    : resolve(process.cwd(), 'backups', `d1-${timestamp}.json`);

  console.log(`Account: ${accountId}`);
  console.log(`Database: ${databaseId}`);
  console.log(`Secret columns: ${options.includeSecrets ? 'INCLUDED (raw)' : 'redacted'}`);
  console.log('');

  const tables: Record<string, Row[]> = {};
  const errors: Record<string, string> = {};
  const redactedColumns = new Set<string>();

  for (const table of TABLES) {
    try {
      const rows = await query(table.sql);

      if (options.includeSecrets) {
        tables[table.name] = rows;
      } else {
        const redacted = redactRows(rows);
        tables[table.name] = redacted.rows;
        for (const column of redacted.redactedColumns) redactedColumns.add(column);
      }

      console.log(`  ${table.name}: ${rows.length} row(s)`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      errors[table.name] = message;
      tables[table.name] = [];
      console.log(`  ${table.name}: FAILED — ${message}`);
    }
  }

  const document = {
    _warning: WARNING,
    generatedAt: new Date().toISOString(),
    accountId,
    databaseId,
    secretsIncluded: options.includeSecrets,
    redactedColumns: options.includeSecrets ? [] : [...redactedColumns].sort(),
    errors,
    tables,
  };

  try {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`, 'utf-8');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('');
    console.error(`ERROR: could not write the backup to ${outPath}: ${message}`);
    process.exit(1);
  }

  console.log('');
  console.log(`Backup written to: ${outPath}`);
  console.log('');
  console.log('The file contains merchant data and may contain credentials.');
  console.log('Keep it out of version control (backups/ is git-ignored) and encrypt it.');

  const failedTables = Object.keys(errors);
  if (failedTables.length > 0) {
    console.log('');
    console.error(`WARNING: ${failedTables.length} table(s) could not be read: ${failedTables.join(', ')}.`);
    console.error('The backup is INCOMPLETE — do not treat it as a restorable copy.');
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('');
  console.error(`ERROR: ${message}`);
  process.exit(1);
});
