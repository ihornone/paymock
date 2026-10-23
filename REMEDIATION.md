# REMEDIATION — Paymock, аудит 2026-10-23

Документ описывает, что именно изменено в коде после аудита, чем это
проверяется и что осталось ручной операцией.

Проверка: `pnpm run verify:security` (ожидаемые коды 401/403/429 вместо 200),
`pnpm run lint:sql`, `pnpm run typecheck`, `pnpm run test:unit`.

---

## P0 — критично

### P0-1. `POST /api/admin/projects` — запись в БД без авторизации

**Было:** обработчик не вызывал авторизацию; анонимный запрос создавал строку
в `projects`, получал в ответе `pmk_live_…`, а `user_id` записывался `NULL`.

**Стало:**
- `src/server/auth/session.ts` — единая точка определения актора запроса.
  Принимаются: personal access token (`pmk_usr_…`, сверяется с БД),
  Clerk-сессия (`__session` / `Authorization: Bearer`, подпись проверяется по
  JWKS инстанса), в dev — заголовок `x-user-id`.
  **Токен проекта (`pmk_live_…`) актором аккаунта не является** и даёт 401.
- `src/server/auth/admin-guard.ts` — общий гейт для всех мутаций:
  rate limit → аутентификация → CSRF → аудит.
- `src/app/api/admin/projects/route.ts` — `POST` требует сессию (401 иначе),
  `user_id` берётся **только** из сессии, тело валидируется allow-list'ом
  (`name`, `edrpou` — zod-схема отбрасывает всё остальное).
- Токен проекта и webhook-secret возвращаются **ровно один раз** — в ответе
  на создание/ротацию; в БД лежит только SHA-256.

### P0-2. MCP `resources/read paymock://projects` — утечка всех тенантов

**Было:** инструменты проверяли владение, ресурсы — нет.
`projectsRepo.list(scope.userId ?? '')` при пустом `userId` возвращал **все**
строки таблицы вместе с plaintext-токенами.

**Стало:**
- `src/server/auth/scope.ts` — единый guard `assertProjectAccess()` /
  `listAccessibleProjects()`, который используют **и инструменты, и ресурсы**
  (`src/features/mcp/handlers/projects.handler.ts`, `src/features/mcp/server.ts`,
  `src/app/api/mcp/route.ts`).
- `src/server/db/projects.repository.ts` — `listOwned(userId)` требует
  непустой `user_id` и бросает исключение без него; общий «list всего»
  удалён из API.
- Колонки `token` / `token_hash` / `webhook_secret` не попадают ни в один
  SELECT наружу: репозиторий выбирает только публичные колонки.
- Ошибки скоупа нейтральны: `Resource not found or unauthorized` — без id
  чужого проєкта (иначе эндпоинт становится оракулом для перебора).

### P0-3. Секреты в открытом виде

**Было:** `projects.token` — plaintext; токен отдавался в листингах и в MCP.

**Стало:**
- `projects.token_hash` (SHA-256) + `projects.webhook_secret`.
- `src/server/auth/project-token.ts` — генерация и хеширование.
- `src/server/auth/token-cache.ts` — кеш ключуется по хешу, а не по
  plaintext; при ротации запись выбрасывается по id проєкта.
- Миграция `scripts/migrate-security.ts` **ротирует все токены** (старые
  считаются скомпрометированными) и пересобирает таблицы без plaintext-колонки.
  Новые токены печатаются один раз и сохраняются в
  `backups/issued-tokens-<timestamp>.json` (0600).

---

## P1 — высокий

### P1-1. Разнобой авторизации в `/api/admin/*`

**Стало:** нет сессии ⇒ **401 на любом методе** (GET, POST, PATCH, DELETE,
reset-token, `/api/account/tokens*`). Владение проверяется в `WHERE`-условии
UPDATE/DELETE, поэтому чужой id даёт 404, а не 403.

### P1-2. Статический демо-токен в сиде

**Было:** `pmk_demo_test1234567890abcdef` — одинаковый на всех инстансах, в
репозитории и в дампе.

**Стало:** демо-тенант создаётся скриптом `scripts/seed-demo.ts` — токен
генерируется (`pmk_demo_<40 случайных символов>`), в БД хранится только хеш,
значение печатается один раз. В продах тенант отключается переменной
`ENABLE_DEMO_TENANT=false`. Статичный токен удалён из `schema.sql` и ротирован
в проде миграцией.

### P1-3. Rate limit на мутациях

**Стало:** `src/server/auth/admin-guard.ts` — лимит по IP **до** аутентификации
(иначе анонимный brute-force не throttle'ился бы). Лимиты: 30/мин на мутацию,
10/мин на создание проєкта и на ротацию токена, 10/мин на выпуск PAT.
MCP: 120/мин на всё, 30/мин на мутационные инструменты.
WAF-правило Cloudflare (≤5/мин на IP) — `scripts/cloudflare/waf-rate-limit.ts`,
требует ручного запуска с правами на зону.

### P1-4. Исходящие вебхуки не подписаны

**Стало** (`src/server/webhook.ts`):
- `X-Paymock-Signature: sha256=<HMAC-SHA256(secret, body)>` — секрет проєкта;
- `X-Paymock-Event: invoice.status_changed`;
- редиректы: не более одного, цель редиректа повторно проверяется SSRF-фильтром;
- таймаут 7 с (сохранён), тело ответа читается с лимитом 8 КБ, тело запроса —
  с лимитом 64 КБ.

---

## P2 — средний

### P2-1. `GET /api/mcp` отдаёт каталог анонимно

**Стало:** без токена — 401. В каталоге больше нет примера реального токена.

### P2-2. `/api/openapi.json` и `/docs/*`

- `/api/openapi.json` — публичная спека **только мерчантского API**, с
  `securitySchemes: { XToken: … }` и явным `security: []` на публичных путях;
  admin/account вынесены.
- `/api/openapi.internal.json` — спека admin/account/MCP, **за сессией** (401).
- `/docs/*` — отдаются только авторизованным.
- `Cache-Control: private, no-store`.

### P2-3. Утечка внутренних идентификаторов в ошибках MCP

**Стало:** все scope-ошибки — нейтральный `Resource not found or unauthorized`
(и в HTTP-транспорте, и в stdio-сервере).

### P2-4. Clerk dev-инстанс в проде

**Стало в коде:** `src/server/auth/session.ts` пишет предупреждение
`clerk_dev_instance_in_production`, если в проде используется `pk_test_…`.
**Остаётся ручным:** перевести инстанс на production Clerk (`pk_live_…`),
включить пароль/OTP, задать политику сессий.

### P2-5. CSRF на cookie-мутациях

**Стало:** `src/server/auth/csrf.ts` — проверка `Sec-Fetch-Site`
(`same-origin`/`none`) и `Origin` против собственного хоста и
`NEXT_PUBLIC_APP_URL`. Применяется ко всем cookie-аутентифицированным
мутациям. Токен-аутентифицированные запросы не проверяются (заголовок не
прикрепляется cross-site).

### P2-6. Нет аудит-лога мутаций

**Стало:** таблица `audit_log` (`src/server/db/schema.ts`,
`src/server/db/audit.repository.ts`) — актор, ip, user-agent, действие,
цель, результат, детали. Пишутся: создание/обновление/удаление проєкта,
ротация токена, выпуск/отзыв PAT, вызовы MCP-инструментов и чтение
ресурсов, отказы (включая анонимные). Отказ анонимной мутации дополнительно
логируется как WARN.

---

## P3 — hardening

- **`user_id NOT NULL`** — достигается пересборкой таблицы в миграции;
  сироты (`user_id IS NULL`) удаляются, а их инвойсы каскадно.
- **Бэкапы D1** — `scripts/cloudflare/backup-d1.ts` (выгрузка всех таблиц в
  `backups/`, права 0600, каталог в `.gitignore`); у D1 включён Time Travel.
- **Запрет конкатенации в SQL** — `scripts/lint:sql` в CI
  (`.github/workflows/security-checks.yml`).
- **Версии стека** — обновлены patch-релизы Next.js / Clerk / OpenNext
  (см. `package.json`); `pnpm run typecheck` и `pnpm run test:unit` зелёные.
- **`/docs/*` и OpenAPI** — за авторизацией (см. P2-2).
- **workers.dev** — `scripts/cloudflare/check-workers-dev.ts` проверяет, не
  открыт ли публичный `*.workers.dev` (он обошёл бы WAF-правила).

---

## Что осталось ручным (вне кода)

1. **Clerk production instance** — создать `pk_live_…`, перенести
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` в `wrangler.toml`, включить пароль/OTP,
   задать TTL сессий и leaked-password protection.
2. **WAF / rate limiting на уровне Cloudflare** — скрипт
   `scripts/cloudflare/waf-rate-limit.ts` готов (зона `ihornone.site`,
   `CLOUDFLARE_ZONE_ID=80f0823c1d1de1ed4d2caaa340b1c207`), но **правила не
   применены**: OAuth-токен Wrangler — аккаунтный и не имеет прав
   «Zone → Rate Limiting → Edit» (API отвечает 403). Нужен API-токен с
   правом на зону:
   ```bash
   CLOUDFLARE_API_TOKEN=<токен с правом на зону> \
   CLOUDFLARE_ZONE_NAME=ihornone.site \
   pnpm run waf:rate-limit
   ```
   Правило: `POST /api/admin/projects` — ≤5/хв на IP; `/api/mcp` — 60/хв.
3. **Публичный `workers.dev`-поддомен** — проверено: он **открыт**
   (`paymock.pelykhihor3456.workers.dev` отвечает и обходит правила WAF,
   настроенные на кастомном домене). Отключение намеренно **не выполнено**
   автоматически: поддомен включён на уровне **всего аккаунта**
   (`e468b6b0d602ac91b1c044b15a4c4fbe`), а в нём живёт ещё и второй проект
   (aquacapy) — решение о его отключении должен принять владелец аккаунта.
   Команда (после проверки, что aquacapy workers.dev не нужен):
   ```bash
   curl -X PUT -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"subdomain":"pelykhihor3456","enabled":false}' \
     https://api.cloudflare.com/client/v4/accounts/e468b6b0d602ac91b1c044b15a4c4fbe/workers/subdomain
   ```
4. **Перенести секреты в `wrangler secret`**: `CLERK_SECRET_KEY` (если будет
   использоваться серверный SDK Clerk), `CLOUDFLARE_API_TOKEN` — сейчас
   `wrangler secret list` пуст.
5. **Обновить интеграции**: после ротации токенов старые `pmk_live_…` и
   демо-токен не работают — новые значения в
   `backups/issued-tokens-<timestamp>.json` (каталог вне git).
6. **Версия `compatibility_date` в `wrangler.toml`** осталась `2024-09-23` —
   OpenNext на неё предупреждает. Обновление меняет семантику
   `nodejs_compat`, поэтому это отдельный шаг с проверкой деплоя.
7. **Резервные копии D1** — `pnpm run d1:backup` пишет усечённый (без
   `token_hash`/`webhook_secret`) дамп в `backups/`; файл нужно складывать в
   зашифрованное хранилище за пределами репозитория. Time Travel у D1
   включён (7 дней).

---

## Состояние после внедрения

- Миграция `paymock-db` применена: 16 проектов-сирот удалены (вместе с их
  инвойсами), `pm_demo_store` сохранён, его токен ротирован, таблицы
  пересобраны (`user_id NOT NULL`, `token_hash`, `webhook_secret`),
  `audit_log` создан. Бэкап до миграции: `backups/d1-<timestamp>.json`.
- Worker передеплоен: `https://paymock.ihornone.site`
  (версия `fc78ee49-a093-4e8f-bdad-9381db97c203`).
- Проверка по боевому инстансу: `10/10 PASS` (одна проверка пропущена — ей
  нужен `pmk_usr_…`).
- Стек обновлён: Next.js `15.5.28`, `@clerk/nextjs` `7.9.20`,
  `@opennextjs/cloudflare` `1.20.13`.

### Побочные находки (исправлены)

- **Dev-мост D1 указывал на несуществующую базу** (`29ae1343-…`): каждый
  локальный запрос падал с 404, и дашборд показывал пустую таблицу.
  Теперь для разработки создана отдельная база **`paymock-dev-db`**
  (`2abd6467-dcfc-4fca-974b-7af75c3d4537`) со своей схемой и демо-тенантом.
  Прод-база `paymock-db` доступна только через binding в `wrangler.toml` —
  dev-сервер в неё больше не пишет (раньше мог: E2E-тест создавал в ней
  тестовые проекты).
- **OAuth-токен Cloudflare кэшировался навсегда**: после истечения все
  локальные запросы падали с 403 до перезапуска dev-сервера. Теперь токен
  перечитывается из конфига Wrangler, а запрос повторяется один раз.
- **`pnpm dev` поднимался на порту 8787**, который занят вторым приложением
  (aquacapy) — dev-сервер Paymock не стартовал. Порт перенесён на **8788**
  (README и `.env.example` обновлены).
- **Проверка `check-workers-dev` врала**: Cloudflare не возвращает поле
  `enabled` для `/workers/subdomain`, поэтому скрипт всегда рапортовал
  «отключено». Исправлено на проверку непустого `subdomain` — теперь
  скрипт честно показывает, что `workers.dev` открыт (и `--strict` даёт
  exit 1).
- **E2E-тесты** переведены на новую модель: токен демо-проекта передаётся
  через `PAYMOCK_DEMO_TOKEN`, аккаунтные вызовы — через
  `PAYMOCK_ACCOUNT_TOKEN` (или dev-заголовок `x-user-id`), а актуальный
  токен после ротации используется в дальнейших MCP-вызовах.


## Не сломано намеренно

- **Mass assignment закрыт корректно**: в `projects` попадают только `name`
  и `edrpou` (allow-list в zod-схеме), `id`, `user_id`, `token`,
  `created_at`, `role` игнорируются. Не расширять allow-list без нужды.
- **SSRF-фильтр** вебхуков и `retry_webhook.customUrl` оставлен как был.
- **IDOR на admin** закрыт проверкой владения в `WHERE`-условии.
- **Параметризация SQL** — все запросы через `?`-плейсхолдеры; линтер
  `lint:sql` не даёт это сломать.
