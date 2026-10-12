# ⚡ Paymock — Multi-Tenant Acquiring Mock on Cloudflare

**Paymock** — це автономний mock-сервіс еквайрингу з **100% сумісністю з офіційним Acquiring API**, створений для розробників, тестувальників та демонстрацій клієнтам без підключення до реального банку чи реєстрації ФОП.

Працює на **Cloudflare Workers** (edge runtime) з реляційною базою даних **Cloudflare D1** (Serverless SQLite).

---

## 🌟 Основні можливості

- **Повна сумісність з Acquiring API:**
  - `GET /api/merchant/details` — перевірка токена та реквізитів мерчанта.
  - `POST /api/merchant/invoice/create` — створення інвойсу, розрахунок кошика, повернення `pageUrl` та `appUrl`.
  - `GET /api/merchant/invoice/status?invoiceId={id}` — перевірка актуального статусу рахунку.
  - `POST /api/merchant/invoice/cancel` — скасування або повернення коштів (`reversed`).
  - `POST /api/merchant/invoice/remove` — інвалідація неоплаченого рахунку (`expired`).
- **🏢 Мультипроєктність (Multi-Tenant Кабінет):**
  - Створюйте необмежену кількість проєктів (магазини, боти, SaaS).
  - Кожен проєкт має власний персональний `X-Token` (`pmk_live_...`).
  - Ізоляція транзакцій, аналітика обігу та статистика для кожного проєкту окремо.
- **🤖 Глобальний MCP Сервер (Model Context Protocol):**
  - Інтеграція платіжної інфраструктури з Cursor IDE, Claude Desktop, Windsurf та Zed.
  - Робота в області всього акаунта (Account Scope) через Personal Access Token (`pmk_usr_...`).
  - Автоматичне створення проєктів, виставлення рахунків, симуляція платежів та читання логів вебхуків безпосередньо штучним інтелектом.
- **💳 Інтерактивна платіжна сторінка (`/pay/:invoiceId`):**
  - Впізнаваний мінімалістичний темний UI.
  - Деталізація кошика товарів (`basketOrder`).
  - Симуляція Apple Pay / Google Pay та оплати банківською карткою.
  - **Sandbox Simulator Bar:** перемикання статусів в 1 клік (`Success`, `Failure`, `Processing 3s`, `Expired`).
- **📡 Доставка та моніторинг Webhook:**
  - Реальна відправка HTTP POST запитів на `webHookUrl` вашого сайту при зміні статусу.
  - Журнал викликів з кодами відповідей сервера (`200 OK`, `500`, таймаути) та часом виконання.

---

## 🚀 Швидкий старт (Локальна розробка)

### 1. Встановлення залежностей
```bash
pnpm install
```

### 2. Ініціалізація бази Cloudflare D1
```bash
pnpm db:init:local
```

### 3. Запуск сервера розробки
```bash
pnpm dev
```
Сервер буде доступний за адресою: **[http://localhost:8787](http://localhost:8787)**.
* Відкрийте браузер на `http://localhost:8787`, щоб побачити **Веб-кабінет розробника**, наявні проєкти та створити тестовий рахунок.
* Початковий демо-токен: `pmk_demo_test1234567890abcdef`.

---

## ☁️ Деплой на Cloudflare Workers (Production)

### 1. Створіть D1 базу у своєму акаунті Cloudflare:
```bash
npx wrangler d1 create paymock-db
```
Скопіюйте `database_id` з виводу консолі та оновіть його у файлі `wrangler.toml`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "paymock-db"
database_id = "ваш-database-id-з-cloudflare"
```

### 2. Застосуйте схему таблиць у хмарі:
```bash
pnpm db:init:remote
```

### 3. Опублікуйте Worker:
```bash
pnpm deploy
```
Після цього ваш Paymock буде доступний на глобальному edge домені, наприклад:
`https://paymock.<ваш-субдомен>.workers.dev`

---

## 🔌 Інтеграція з вашим сайтом

Для перемикання вашого сайту чи інтернет-магазину на Paymock потрібно лише:
1. Замінити базовий URL на адресу вашого Paymock:
   - Локально: `http://localhost:8787`
   - На Cloudflare: `https://paymock.<your-subdomain>.workers.dev`
2. Вказати `X-Token` потрібного проєкту з кабінету Paymock.

---

### Приклади запитів:

#### 1. cURL — Створення рахунку
```bash
curl -X POST https://your-paymock.workers.dev/api/merchant/invoice/create \
  -H "Content-Type: application/json" \
  -H "X-Token: pmk_demo_test1234567890abcdef" \
  -d '{
    "amount": 4200,
    "ccy": 980,
    "merchantPaymInfo": {
      "reference": "order_1001",
      "destination": "Оплата замовлення №1001",
      "basketOrder": [
        {
          "name": "Товар 1",
          "qty": 2,
          "sum": 2100,
          "total": 4200
        }
      ]
    },
    "redirectUrl": "https://myshop.ua/order/1001",
    "webHookUrl": "https://myshop.ua/api/payment/webhook",
    "withAppUrl": true
  }'
```

**Відповідь:**
```json
{
  "invoiceId": "p2_9ZgpZVsl3",
  "pageUrl": "https://your-paymock.workers.dev/pay/p2_9ZgpZVsl3",
  "appUrl": "paymock://pay?invoiceId=p2_9ZgpZVsl3"
}
```

#### 2. Node.js / TypeScript
```typescript
const response = await fetch('http://localhost:8787/api/merchant/invoice/create', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Token': process.env.PAYMOCK_TOKEN!,
  },
  body: JSON.stringify({
    amount: 15000, // 150.00 грн у копійках
    ccy: 980,
    merchantPaymInfo: {
      destination: 'Підписка на місяць',
    },
    webHookUrl: 'https://my-backend.com/webhook',
  }),
});

const { pageUrl, invoiceId } = await response.json();
// Перенаправити користувача на pageUrl
```

#### 3. PHP / Laravel
```php
$response = Http::withHeaders([
    'X-Token' => config('services.acquiring.token'),
])->post(config('services.acquiring.url') . '/api/merchant/invoice/create', [
    'amount' => 50000,
    'ccy' => 980,
    'merchantPaymInfo' => [
        'destination' => 'Оплата послуги',
    ],
    'redirectUrl' => route('payment.result'),
    'webHookUrl' => route('payment.webhook'),
]);

$paymentUrl = $response->json('pageUrl');
```

---

## 🤖 Підключення AI Асистентів (Model Context Protocol / MCP)

Paymock має вбудований віддалений хмарний сервер **MCP** (`/api/mcp`), що дозволяє AI-асистентам у **Cursor IDE**, **Claude Desktop**, **Windsurf**, **ZCode** та **Zed** самостійно взаємодіяти з платіжним середовищем.

### 🔑 Два типи токенів:
1. **Глобальний токен акаунта (`pmk_usr_...`) — Рекомендовано для MCP:**
   - Знаходиться на сторінці **[Профіль користувача](/profile)** (іконка ключа внизу сайдбара).
   - Діє на рівні всього вашого облікового запису. Дозволяє асистенту переглядати всі проєкти, створювати нові магазини на льоту (`create_project`), виставляти рахунки в потрібному проєкті за `projectId` та моніторити вебхуки.
2. **Токен проєкту (`pmk_live_...`):**
   - Знаходиться в налаштуваннях конкретного магазину (`/settings`).
   - Використовується насамперед для викликів звичайного Merchant API вашим бекендом.

### Налаштування Cursor IDE (`.cursor/mcp.json`)

Створіть або відредагуйте `.cursor/mcp.json` у проєкті:

```json
{
  "mcpServers": {
    "paymock": {
      "url": "http://localhost:8787/api/mcp",
      "headers": {
        "X-Token": "pmk_usr_ваш_глобальний_токен_з_профілю"
      }
    }
  }
}
```
*(Готовий JSON-конфіг із вашим актуальним токеном можна скопіювати в 1 клік прямо зі сторінки `/profile`).*

### Доступні інструменти MCP:
- `list_projects` — перелік усіх магазинів та ботів акаунта.
- `create_project` — автоматична реєстрація нового проєкту асистентом з генерацією `.env`.
- `get_project` — отримання реквізитів, вебхуків та токена проєкту.
- `reset_project_token` — перевипуск секретного ключа проєкту.
- `create_invoice` — виставлення нового інвойсу з потрібною сумою та призначенням.
- `get_invoice` / `list_invoices` — перевірка статусу та списку платежів.
- `simulate_payment` — миттєва симуляція оплати карткою (`success` / `failure` / `expired`) із тригером вебхука.
- `get_webhook_logs` / `retry_webhook` — інспектування та повторна відправка колбеків на ваш бекенд.

---

## 🧪 Запуск автоматизованих E2E тестів

У проєкті реалізовано повний набір E2E тестів, які перевіряють:
- Авторизацію через `X-Token` (403 при відсутності або невалідному токені)
- Створення рахунків з кошиком
- Перевірку статусів (`created` → `success`)
- Симуляцію оплати карткою через платіжний екран
- Скасування та повернення коштів (`reversed`)
- Інвалідацію рахунків (`remove` → `expired`)
- Створення та ізоляцію мультипроєктів

Для запуску тестів:
```bash
# 1. Переконайтеся, що dev сервер запущено в іншому терміналі: pnpm dev
# 2. Запустіть тести:
pnpm test
```

---

## 📂 Структура проєкту

```text
paymock/
├── wrangler.toml              # Конфігурація Cloudflare Workers та D1
├── schema.sql                 # SQL схема таблиць бази даних
├── package.json
├── tsconfig.json
├── tests/
│   └── api.test.ts            # E2E тести відповідності API
└── src/
    ├── index.ts               # Головна точка входу додатку Hono
    ├── types/
    │   ├── acquiring.ts       # Типізація офіційного Acquiring API
    │   ├── models.ts          # Моделі сутностей D1
    │   └── env.ts             # Cloudflare Bindings
    ├── shared/
    │   ├── errors/            # Ієрархія помилок та мапінг відповідей
    │   ├── logger/            # Структурований JSON логер із маскуванням
    │   ├── utils/             # Генерація id інвойсів, токенів, форматування валют
    │   ├── middleware/        # Авторизація X-Token
    │   └── db/                # Репозиторії D1 (projects, invoices, webhooks)
    └── features/
        ├── merchant/          # GET /api/merchant/details
        ├── invoice/           # /create, /status, /cancel, /remove
        ├── checkout/          # Сторінка оплати /pay/:invoiceId та симулятор
        ├── dashboard/         # Кабінет розробника (/, /dashboard, /admin)
        └── webhook/           # Фоновий диспетчер вебхуків
```
