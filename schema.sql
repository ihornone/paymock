-- Paymock Cloudflare D1 Database Schema
--
-- Секрети ніколи не зберігаються у відкритому вигляді:
--   * `projects.token_hash`  — SHA-256 від X-Token мерчанта;
--   * `projects.webhook_secret` — ключ HMAC для підпису вебхуків.
-- Токен показується користувачу рівно один раз — при створенні або ротації.

-- 1. Таблиця проєктів (Мерчантів)
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  webhook_secret TEXT NOT NULL,
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

-- 4. Персональні токени доступу (Personal Access Tokens).
-- MCP-сервер та акаунтні API автентифікуються цим токеном.
-- Зберігається лише SHA-256 хеш — значення токена не відновити зі сховища.
CREATE TABLE IF NOT EXISTS personal_access_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT 'default',
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);

-- 5. Журнал аудиту мутацій: хто, звідки, що зробив і з яким результатом.
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

-- Індекси
CREATE INDEX IF NOT EXISTS idx_projects_token_hash ON projects(token_hash);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_invoice ON webhook_logs(invoice_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_project ON webhook_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_pat_user_id ON personal_access_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_pat_token_hash ON personal_access_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);

-- Складені індекси для гарячих запитів дашборду:
--   WHERE project_id = ? ORDER BY created_date DESC LIMIT n
-- Без них SQLite сортує всі рядки проєкту у тимчасовому B-Tree перед LIMIT
-- (виміряно: у 192 рази повільніше на 100 000 рахунках у проєкті).
CREATE INDEX IF NOT EXISTS idx_invoices_project_created ON invoices(project_id, created_date);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_project_created ON webhook_logs(project_id, created_at);

-- Демо-проєкт НЕ сидиться тут: його токен генерується при бутстрапі
-- (scripts/seed-demo.ts) і зберігається лише у вигляді хешу.
-- Статичний токен у репозиторії однаково використовував би всі інстанси.
