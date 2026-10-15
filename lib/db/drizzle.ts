import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema';
import type { D1Database } from '@cloudflare/workers-types';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let cachedToken: string | null = null;

function getCloudflareToken(): string {
  if (cachedToken) return cachedToken;

  if (process.env.CLOUDFLARE_API_TOKEN) {
    cachedToken = process.env.CLOUDFLARE_API_TOKEN;
    return cachedToken;
  }

  // Try reading from wrangler oauth token if available
  try {
    const configPath = path.join(os.homedir(), '.config', '.wrangler', 'config', 'default.toml');
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      const match = content.match(/oauth_token\s*=\s*"([^"]+)"/);
      if (match && match[1]) {
        cachedToken = match[1];
        return cachedToken;
      }
    }
  } catch {
    // ignore
  }
  return '';
}

async function queryRemoteD1(
  sql: string,
  params: any[] = []
): Promise<{ results: any[]; changes: number }> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || 'e468b6b0d602ac91b1c044b15a4c4fbe';
  const databaseId = process.env.CLOUDFLARE_DATABASE_ID || '29ae1343-80a1-46ff-a3c6-b521dcfb9e5a';
  let token = getCloudflareToken();

  if (!token) {
    try {
      const { execSync } = await import('node:child_process');
      execSync('npx wrangler whoami', { stdio: 'ignore' });
      cachedToken = null;
      token = getCloudflareToken();
    } catch {
      // ignore
    }
  }

  const runQuery = async (authToken: string) => {
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
    return fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    });
  };

  let response = await runQuery(token);

  if (response.status === 401) {
    // Refresh token automatically if expired
    try {
      const { execSync } = await import('node:child_process');
      execSync('npx wrangler whoami', { stdio: 'ignore' });
      cachedToken = null;
      token = getCloudflareToken();
      response = await runQuery(token);
    } catch {
      // ignore
    }
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Cloudflare D1 query failed (${response.status}): ${errText}`);
  }

  const data = (await response.json()) as any;
  if (!data.success) {
    const msg = data.errors?.map((e: any) => e.message).join(', ') || 'Unknown D1 error';
    throw new Error(`Cloudflare D1 query error: ${msg}`);
  }

  const firstResult = data.result?.[0];
  const results = firstResult?.results || [];
  const changes = firstResult?.meta?.changes ?? 0;

  return { results, changes };
}

class HttpD1PreparedStatement {
  constructor(private sqlQuery: string, private boundParams: any[] = []) {}

  bind(...values: any[]): HttpD1PreparedStatement {
    return new HttpD1PreparedStatement(this.sqlQuery, values);
  }

  async first<T = unknown>(colName?: string): Promise<T | null> {
    const { results } = await queryRemoteD1(this.sqlQuery, this.boundParams);
    if (!results || results.length === 0) return null;
    const row = results[0];
    return colName ? row[colName] : row;
  }

  async run<T = unknown>(): Promise<any> {
    const { results, changes } = await queryRemoteD1(this.sqlQuery, this.boundParams);
    return {
      results: results as T[],
      success: true,
      meta: { changes, duration: 0 },
    };
  }

  async all<T = unknown>(): Promise<any> {
    const { results, changes } = await queryRemoteD1(this.sqlQuery, this.boundParams);
    return {
      results: results as T[],
      success: true,
      meta: { changes, duration: 0 },
    };
  }

  async raw<T = unknown>(): Promise<T[]> {
    const { results } = await queryRemoteD1(this.sqlQuery, this.boundParams);
    return results.map((row: any) => Object.values(row)) as T[];
  }
}

class HttpD1Database {
  prepare(sqlQuery: string): HttpD1PreparedStatement {
    return new HttpD1PreparedStatement(sqlQuery);
  }

  async batch<T = unknown>(statements: HttpD1PreparedStatement[]): Promise<any[]> {
    return Promise.all(statements.map((stmt) => stmt.all<T>()));
  }

  async exec(sqlQuery: string): Promise<any> {
    await queryRemoteD1(sqlQuery, []);
    return { count: 1, duration: 0 };
  }

  async dump(): Promise<ArrayBuffer> {
    throw new Error('dump() is not supported over HTTP D1 bridge');
  }
}

let devDrizzleInstance: DrizzleD1Database<typeof schema> | null = null;

export async function getDrizzle(): Promise<DrizzleD1Database<typeof schema>> {
  const isDev = process.env.NODE_ENV === 'development';

  // 1. In development, use HttpD1Database adapter with token caching
  if (isDev) {
    if (!devDrizzleInstance) {
      const httpDb = new HttpD1Database() as unknown as D1Database;
      devDrizzleInstance = drizzle(httpDb, { schema });
    }
    return devDrizzleInstance;
  }

  // 2. In Cloudflare Workers / OpenNext production runtime
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const cfContext = (await getCloudflareContext({ async: true })) as any;
    const d1 = cfContext?.env?.DB as D1Database | undefined;
    if (d1) {
      return drizzle(d1, { schema });
    }
  } catch {
    // fallback to http bridge
  }

  const fallbackHttpDb = new HttpD1Database() as unknown as D1Database;
  return drizzle(fallbackHttpDb, { schema });
}
