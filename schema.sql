-- Paymock Cloudflare D1 Database Schema

-- 1. Таблиця проєктів (Мерчантів)
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

-- 2. Таблиця рахунків (Інвойсів)
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
  validity INTEGER DEFAULT 900,
  failure_reason TEXT,
  err_code TEXT,
  payment_info_json TEXT,
  cancel_list_json TEXT,
  created_date TEXT NOT NULL,
  modified_date TEXT NOT NULL
);

-- 3. Таблиця логів відправки Webhook
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

-- Індекси
CREATE INDEX IF NOT EXISTS idx_projects_token ON projects(token);
CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_invoice ON webhook_logs(invoice_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_project ON webhook_logs(project_id);

-- Початковий демо-проєкт для миттєвого тестування
INSERT OR IGNORE INTO projects (id, name, token, edrpou, default_webhook_url, created_at, updated_at)
VALUES (
  'pm_demo_store',
  'Демо Магазин (Paymock)',
  'pmk_demo_test1234567890abcdef',
  '38749210',
  'https://webhook.site/paymock-demo',
  datetime('now'),
  datetime('now')
);
