import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema';
import type { D1Database } from '@cloudflare/workers-types';

/** Timeout for a single query against the remote D1 HTTP bridge. */
export const REMOTE_D1_TIMEOUT_MS = 15_000;

let cachedToken: string | null = null;

/**
 * Reads the Cloudflare API token used by the local D1 HTTP bridge.
 *
 * `node:fs` / `node:path` / `node:os` are imported dynamically: a static
 * import would pull the Node.js filesystem polyfill into the Worker bundle,
 * where it is dead weight but still costs module-evaluation time on every
 * cold start. The lookup only ever runs in local development, where the
 * production D1 binding is not available.
 */
async function getCloudflareToken(): Promise<string> {
  if (cachedToken) return cachedToken;

  if (process.env.CLOUDFLARE_API_TOKEN) {
    cachedToken = process.env.CLOUDFLARE_API_TOKEN;
    return cachedToken;
  }

  try {
    const [{ default: fs }, { default: path }, { default: os }] = await Promise.all([
      import('node:fs'),
      import('node:path'),
      import('node:os'),
    ]);

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
    // Not running in Node.js — the D1 binding is used instead.
  }
  return '';
}

async function queryRemoteD1(
  sql: string,
  params: any[] = []
): Promise<{ results: any[]; changes: number }> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || 'e468b6b0d602ac91b1c044b15a4c4fbe';
  const databaseId = process.env.CLOUDFLARE_DATABASE_ID || '29ae1343-80a1-46ff-a3c6-b521dcfb9e5a';
  const token = await getCloudflareToken();

  // A missing token used to trigger `execSync('npx wrangler whoami')` here.
  // That is a blocking child-process spawn: measured at 3.78s of a fully
  // blocked event loop, during which the isolate serves nothing at all.
  // Fail fast instead — the token must come from the environment.
  if (!token) {
    throw new Error(
      'Cloudflare D1 API token is not configured. Set CLOUDFLARE_API_TOKEN to use the remote D1 bridge.'
    );
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
      signal: AbortSignal.timeout(REMOTE_D1_TIMEOUT_MS),
    });
  };

  const response = await runQuery(token);

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

/**
 * Drizzle instances are cached per underlying D1 binding.
 *
 * The previous implementation built a fresh `drizzle(d1, { schema })` on every
 * repository call, and re-resolved the `@opennextjs/cloudflare` dynamic import
 * each time. With ~15 repository calls per request that is ~1ms of wasted CPU
 * and a fresh object graph per query.
 */
const drizzleInstanceCache = new WeakMap<object, DrizzleD1Database<typeof schema>>();

function getOrCreateDrizzle(d1: D1Database): DrizzleD1Database<typeof schema> {
  const cached = drizzleInstanceCache.get(d1 as unknown as object);
  if (cached) return cached;

  const instance = drizzle(d1, { schema });
  drizzleInstanceCache.set(d1 as unknown as object, instance);
  return instance;
}

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
      return getOrCreateDrizzle(d1);
    }
  } catch {
    // fallback to http bridge
  }

  if (!devDrizzleInstance) {
    const fallbackHttpDb = new HttpD1Database() as unknown as D1Database;
    devDrizzleInstance = drizzle(fallbackHttpDb, { schema });
  }
  return devDrizzleInstance;
}
