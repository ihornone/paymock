import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface D1QueryResult {
  results: any[];
  changes: number;
}

const QUERY_TIMEOUT_MS = 30_000;

export function getApiToken(): string {
  const fromEnv = process.env.CLOUDFLARE_API_TOKEN;
  if (fromEnv) return fromEnv.trim();

  const configPath = join(homedir(), '.config', '.wrangler', 'config', 'default.toml');
  if (existsSync(configPath)) {
    const content = readFileSync(configPath, 'utf-8');
    const match = content.match(/oauth_token\s*=\s*"([^"]+)"/);
    if (match?.[1]) return match[1];
  }

  throw new Error(
    'No Cloudflare API token found. Set CLOUDFLARE_API_TOKEN or run `wrangler login`.'
  );
}

export function getAccountId(): string {
  return (
    process.env.CLOUDFLARE_ACCOUNT_ID || 'e468b6b0d602ac91b1c044b15a4c4fbe'
  );
}

export function getDatabaseId(): string {
  const id = process.env.CLOUDFLARE_DATABASE_ID;
  if (!id) {
    throw new Error(
      'CLOUDFLARE_DATABASE_ID is not set. Point it at the database to migrate.'
    );
  }
  return id;
}

export async function d1Query(sql: string, params: any[] = []): Promise<D1QueryResult> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${getAccountId()}/d1/database/${getDatabaseId()}/query`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getApiToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
    signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`D1 query failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as any;
  if (!data.success) {
    const message =
      data.errors?.map((e: any) => e.message).join(', ') || 'unknown D1 error';
    throw new Error(`D1 query error: ${message}`);
  }

  const results: any[] = [];
  let changes = 0;

  for (const entry of data.result ?? []) {
    if (entry?.success === false) {
      throw new Error(
        `D1 statement failed: ${entry.error || JSON.stringify(entry).slice(0, 300)}`
      );
    }
    if (Array.isArray(entry?.results)) results.push(...entry.results);
    if (typeof entry?.meta?.changes === 'number') changes += entry.meta.changes;
  }

  return { results, changes };
}

export async function listTables(): Promise<string[]> {
  const { results } = await d1Query(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' ORDER BY name"
  );
  return results.map((row: any) => row.name as string);
}

export async function listColumns(table: string): Promise<string[]> {
  const { results } = await d1Query(`PRAGMA table_info(${table})`);
  return results.map((row: any) => row.name as string);
}
