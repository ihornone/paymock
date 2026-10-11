import type { D1Database } from '@cloudflare/workers-types';

export interface DatabaseAdapter {
  queryAll<T = any>(sql: string, params?: any[]): Promise<T[]>;
  queryFirst<T = any>(sql: string, params?: any[]): Promise<T | null>;
  execute(sql: string, params?: any[]): Promise<{ changes: number }>;
}

let _localDb: any = null;

async function getLocalDatabase(): Promise<any> {
  if (!_localDb) {
    const { default: Database } = await import('better-sqlite3');
    const path = await import('path');
    const dbPath = path.join(process.cwd(), 'data.sqlite');
    _localDb = new Database(dbPath);
    _localDb.pragma('journal_mode = WAL');
    initLocalTables(_localDb);
  }
  return _localDb;
}

function initLocalTables(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      edrpou TEXT NOT NULL DEFAULT '12345678',
      logo_url TEXT,
      default_webhook_url TEXT,
      default_success_url TEXT,
      default_fail_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      ccy INTEGER NOT NULL DEFAULT 980,
      final_amount INTEGER,
      status TEXT NOT NULL DEFAULT 'created',
      payment_type TEXT DEFAULT 'debit',
      reference TEXT,
      destination TEXT,
      comment TEXT,
      basket_json TEXT,
      redirect_url TEXT,
      success_url TEXT,
      fail_url TEXT,
      webhook_url TEXT,
      validity INTEGER DEFAULT 86400,
      failure_reason TEXT,
      err_code TEXT,
      payment_info_json TEXT,
      cancel_list_json TEXT,
      created_date TEXT NOT NULL,
      modified_date TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS webhook_logs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      status_code INTEGER,
      request_body TEXT NOT NULL,
      response_body TEXT,
      duration_ms INTEGER,
      error TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_projects_token ON projects(token);
    CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoices(project_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
    CREATE INDEX IF NOT EXISTS idx_webhook_logs_invoice ON webhook_logs(invoice_id);
  `);
}

export async function getDb(): Promise<DatabaseAdapter> {
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
    // Fall back to local SQLite if not in Cloudflare runtime
  }

  const localDb = await getLocalDatabase();
  return {
    async queryAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
      return localDb.prepare(sql).all(...params) as T[];
    },
    async queryFirst<T = any>(sql: string, params: any[] = []): Promise<T | null> {
      return (localDb.prepare(sql).get(...params) as T) || null;
    },
    async execute(sql: string, params: any[] = []): Promise<{ changes: number }> {
      const res = localDb.prepare(sql).run(...params);
      return { changes: res.changes };
    },
  };
}
