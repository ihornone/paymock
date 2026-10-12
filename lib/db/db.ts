import type { D1Database } from '@cloudflare/workers-types';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface DatabaseAdapter {
  queryAll<T = any>(sql: string, params?: any[]): Promise<T[]>;
  queryFirst<T = any>(sql: string, params?: any[]): Promise<T | null>;
  execute(sql: string, params?: any[]): Promise<{ changes: number }>;
}

function getCloudflareToken(): string {
  if (process.env.CLOUDFLARE_API_TOKEN) {
    return process.env.CLOUDFLARE_API_TOKEN;
  }
  // Try reading from wrangler oauth token if available
  try {
    const configPath = path.join(os.homedir(), '.config', '.wrangler', 'config', 'default.toml');
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      const match = content.match(/oauth_token\s*=\s*"([^"]+)"/);
      if (match && match[1]) {
        return match[1];
      }
    }
  } catch {
    // ignore
  }
  return '';
}

async function queryRemoteD1(sql: string, params: any[] = []): Promise<{ results: any[]; changes: number }> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || 'e468b6b0d602ac91b1c044b15a4c4fbe';
  const databaseId = process.env.CLOUDFLARE_DATABASE_ID || '29ae1343-80a1-46ff-a3c6-b521dcfb9e5a';
  let token = getCloudflareToken();

  if (!token) {
    try {
      const { execSync } = await import('node:child_process');
      execSync('npx wrangler whoami', { stdio: 'ignore' });
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
        'Authorization': `Bearer ${authToken}`,
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

export async function getDb(): Promise<DatabaseAdapter> {
  const isDev = process.env.NODE_ENV === 'development';
  const token = getCloudflareToken();

  // In local development, connect directly to remote Cloudflare D1 via REST API
  if (isDev && token) {
    return {
      async queryAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
        const { results } = await queryRemoteD1(sql, params);
        return results as T[];
      },
      async queryFirst<T = any>(sql: string, params: any[] = []): Promise<T | null> {
        const { results } = await queryRemoteD1(sql, params);
        return (results[0] as T) || null;
      },
      async execute(sql: string, params: any[] = []): Promise<{ changes: number }> {
        const { changes } = await queryRemoteD1(sql, params);
        return { changes };
      },
    };
  }

  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const cfContext = await getCloudflareContext({ async: true });
    const cfEnv = cfContext?.env as any;
    if (cfEnv?.DB) {
      const d1 = cfEnv.DB as D1Database;
      return {
        async queryAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
          const res = await d1.prepare(sql).bind(...params).all<T>();
          return (res.results || []) as T[];
        },
        async queryFirst<T = any>(sql: string, params: any[] = []): Promise<T | null> {
          const res = await d1.prepare(sql).bind(...params).first<T>();
          return res || null;
        },
        async execute(sql: string, params: any[] = []): Promise<{ changes: number }> {
          const res = await d1.prepare(sql).bind(...params).run();
          return { changes: res.meta?.changes ?? 0 };
        },
      };
    }
  } catch {
    // Cloudflare Worker runtime context not available, use remote D1 HTTP API
  }

  // Remote Cloudflare D1 HTTP Adapter
  return {
    async queryAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
      const { results } = await queryRemoteD1(sql, params);
      return results as T[];
    },
    async queryFirst<T = any>(sql: string, params: any[] = []): Promise<T | null> {
      const { results } = await queryRemoteD1(sql, params);
      return (results[0] as T) || null;
    },
    async execute(sql: string, params: any[] = []): Promise<{ changes: number }> {
      const { changes } = await queryRemoteD1(sql, params);
      return { changes };
    },
  };
}
