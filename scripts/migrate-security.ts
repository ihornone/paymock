/**
 * Security migration for the production D1 database.
 *
 * What it does:
 *  1. takes a full backup of every table;
 *  2. removes owner-less projects (orphans — their tokens used to work and
 *     they could not be listed by anybody);
 *  3. adds `token_hash` and `webhook_secret` to `projects`;
 *  4. **rotates every merchant token** — the plaintext tokens lived in the
 *     database in the clear, so they are treated as compromised;
 *  5. rebuilds `projects`, `invoices` and `webhook_logs` with the new schema
 *     (`user_id NOT NULL`, no plaintext `token` column) while preserving every
 *     row and every foreign key;
 *  6. creates the `audit_log` table;
 *  7. writes the new tokens to a file that is printed exactly once.
 *
 * Usage:
 *   CLOUDFLARE_DATABASE_ID=<id> tsx scripts/migrate-security.ts
 *
 * Flags:
 *   --keep-orphans   do not delete rows with `user_id IS NULL`
 *   --dry-run        print the plan without touching the database
 */

import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  d1Query,
  getDatabaseId,
  listColumns,
  listTables,
} from './d1-client';

const BACKUP_DIR = 'backups';

interface ProjectRow {
  id: string;
  user_id: string | null;
  name: string;
  token: string | null;
}

const args = process.argv.slice(2);
const keepOrphans = args.includes('--keep-orphans');
const dryRun = args.includes('--dry-run');

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

async function backup(tables: string[]): Promise<string> {
  const dump: Record<string, unknown[]> = {};

  for (const table of tables) {
    const { results } = await d1Query(`SELECT * FROM ${table}`);
    dump[table] = results;
  }

  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = join(BACKUP_DIR, `d1-${stamp}.json`);

  writeFileSync(path, JSON.stringify(dump, null, 2), { mode: 0o600 });
  chmodSync(path, 0o600);

  return path;
}

/**
 * The rebuild.
 *
 * SQLite cannot drop a column that carries a UNIQUE constraint and cannot
 * add a NOT NULL constraint to an existing column, so the three tables are
 * recreated. The new tables are filled first, then the old ones are dropped
 * (in dependency order, so the cascade deletes nothing that still exists)
 * and finally the new ones take their place.
 *
 * The order matters: dropping the old `projects` before the old `invoices`
 * would cascade-delete every invoice.
 */
const REBUILD_SQL = `
CREATE TABLE projects_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  webhook_secret TEXT NOT NULL,
  edrpou TEXT NOT NULL DEFAULT '12345678',
  logo_url TEXT,
  default_webhook_url TEXT,
  default_success_url TEXT,
  default_fail_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO projects_new (
  id, user_id, name, token_hash, webhook_secret, edrpou, logo_url,
  default_webhook_url, default_success_url, default_fail_url, created_at, updated_at
)
  SELECT id, user_id, name, token_hash, webhook_secret, edrpou, logo_url,
         default_webhook_url, default_success_url, default_fail_url, created_at, updated_at
  FROM projects;

CREATE TABLE invoices_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects_new(id) ON DELETE CASCADE,
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
  validity INTEGER DEFAULT 900,
  failure_reason TEXT,
  err_code TEXT,
  payment_info_json TEXT,
  cancel_list_json TEXT,
  created_date TEXT NOT NULL,
  modified_date TEXT NOT NULL
);

INSERT INTO invoices_new (
  id, project_id, amount, ccy, final_amount, status, payment_type, reference,
  destination, comment, basket_json, redirect_url, success_url, fail_url,
  webhook_url, validity, failure_reason, err_code, payment_info_json,
  cancel_list_json, created_date, modified_date
)
  SELECT id, project_id, amount, ccy, final_amount, status, payment_type, reference,
         destination, comment, basket_json, redirect_url, success_url, fail_url,
         webhook_url, validity, failure_reason, err_code, payment_info_json,
         cancel_list_json, created_date, modified_date
  FROM invoices;

CREATE TABLE webhook_logs_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects_new(id) ON DELETE CASCADE,
  invoice_id TEXT NOT NULL REFERENCES invoices_new(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  status_code INTEGER,
  request_body TEXT NOT NULL,
  response_body TEXT,
  duration_ms INTEGER,
  error TEXT,
  created_at TEXT NOT NULL
);

INSERT INTO webhook_logs_new (
  id, project_id, invoice_id, url, status_code, request_body, response_body,
  duration_ms, error, created_at
)
  SELECT id, project_id, invoice_id, url, status_code, request_body, response_body,
         duration_ms, error, created_at
  FROM webhook_logs;

DROP TABLE webhook_logs;
DROP TABLE invoices;
DROP TABLE projects;

ALTER TABLE projects_new RENAME TO projects;
ALTER TABLE invoices_new RENAME TO invoices;
ALTER TABLE webhook_logs_new RENAME TO webhook_logs;

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_token_hash ON projects(token_hash);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_project_created ON invoices(project_id, created_date);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_invoice ON webhook_logs(invoice_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_project ON webhook_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_project_created ON webhook_logs(project_id, created_at);
`;

const AUDIT_LOG_SQL = `
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  actor_user_id TEXT,
  actor_kind TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  ip TEXT,
  user_agent TEXT,
  result TEXT NOT NULL,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
`;

async function main(): Promise<void> {
  const databaseId = getDatabaseId();
  console.log(`→ database: ${databaseId}`);

  const tables = await listTables();
  console.log(`→ tables: ${tables.join(', ')}`);

  if (!tables.includes('projects')) {
    throw new Error('The `projects` table does not exist — wrong database?');
  }

  const projectColumns = await listColumns('projects');

  if (projectColumns.includes('token_hash') && !projectColumns.includes('token')) {
    console.log('→ the database is already migrated. Nothing to do.');
    return;
  }

  if (!projectColumns.includes('token')) {
    throw new Error(
      'Unexpected schema: `projects.token` is missing but `token_hash` is present.'
    );
  }

  const { results: projectRows } = await d1Query(
    'SELECT id, user_id, name, token FROM projects'
  );
  const projects = projectRows as ProjectRow[];

  const orphans = projects.filter((p) => !p.user_id);
  console.log(`→ projects: ${projects.length}, orphans (user_id IS NULL): ${orphans.length}`);

  if (dryRun) {
    console.log('\n[dry-run] no changes were made.');
    return;
  }

  // 1. Backup first — always.
  const backupPath = await backup(tables);
  console.log(`→ backup written: ${backupPath}`);

  // 2. Orphans.
  if (orphans.length > 0 && !keepOrphans) {
    const ids = orphans.map((p) => p.id);
    const { changes } = await d1Query(
      `DELETE FROM projects WHERE user_id IS NULL OR id IN (${ids
        .map(() => '?')
        .join(',')})`,
      ids
    );
    console.log(`→ deleted ${changes} orphan project(s) (their invoices went with them)`);
  } else if (orphans.length > 0) {
    console.log('→ orphans kept (--keep-orphans)');
  }

  // 3. New columns.
  const columnsAfterCleanup = await listColumns('projects');
  if (!columnsAfterCleanup.includes('token_hash')) {
    await d1Query('ALTER TABLE projects ADD COLUMN token_hash TEXT');
    console.log('→ added projects.token_hash');
  }
  if (!columnsAfterCleanup.includes('webhook_secret')) {
    await d1Query('ALTER TABLE projects ADD COLUMN webhook_secret TEXT');
    console.log('→ added projects.webhook_secret');
  }

  // 4. Rotate every token. The plaintext tokens were readable in the
  //    database, so every one of them is considered compromised.
  const issued: Array<{ id: string; name: string; token: string; webhookSecret: string }> = [];

  const { results: liveRows } = await d1Query(
    'SELECT id, name FROM projects'
  );

  for (const row of liveRows as Array<{ id: string; name: string }>) {
    const token = `pmk_live_${randomString(40)}`;
    const webhookSecret = `whsec_${randomString(40)}`;
    const tokenHash = await sha256Hex(token);

    await d1Query(
      'UPDATE projects SET token_hash = ?, webhook_secret = ? WHERE id = ?',
      [tokenHash, webhookSecret, row.id]
    );

    issued.push({ id: row.id, name: row.name, token, webhookSecret });
  }

  // 5. Rebuild the tables with the new schema.
  await d1Query(REBUILD_SQL);
  console.log('→ projects / invoices / webhook_logs rebuilt with the new schema');

  // 6. Audit log.
  await d1Query(AUDIT_LOG_SQL);
  console.log('→ audit_log created');

  // 7. The new tokens, exactly once.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const issuedPath = join(BACKUP_DIR, `issued-tokens-${stamp}.json`);
  writeFileSync(
    issuedPath,
    JSON.stringify(
      issued.map((entry) => ({
        projectId: entry.id,
        name: entry.name,
        token: entry.token,
        webhookSecret: entry.webhookSecret,
      })),
      null,
      2
    ),
    { mode: 0o600 }
  );
  chmodSync(issuedPath, 0o600);

  console.log(`\n=== NEW TOKENS (shown once, also saved to ${issuedPath}) ===`);
  for (const entry of issued) {
    console.log(`${entry.name} [${entry.id}]\n  X-Token: ${entry.token}\n  webhook secret: ${entry.webhookSecret}`);
  }
  console.log('\nThe previous tokens are dead: only the new hashes are stored.');
}

main().catch((err) => {
  console.error('Migration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
