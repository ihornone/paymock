export interface DocArticle {
  slug: string;
  title: string;
  category: string;
  badge?: string;
  badgeColor?: string;
  content: string;
}

export const DOCS_ARTICLES: Record<string, DocArticle> = {
  'overview': {
    slug: 'overview',
    title: 'Швидкий старт та Base URL',
    category: 'Швидкий старт',
    content: `# Швидкий старт та Base URL

Paymock — це автономний mock-сервіс еквайрингу з підтримкою мультипроєктності (Multi-tenant) для локальної розробки та тестування платіжних модулів сайтів, інтернет-магазинів, ботів чи мобільних застосунків.

## Головна концепція

У конфігурації вашого платіжного модуля достатньо замінити стандартну базову адресу банку на адресу вашого сервера Paymock:

\`\`\`http
Base URL: {{BASE_URL}}
\`\`\`

Усі маршрути, назви полів, типи даних та статуси залишаються повністю ідентичними офіційній специфікації еквайрингу.

## Переваги сервісу

- **Безпечне тестування**: не потрібно прив'язувати реальні рахунки та витрачати реальні гроші.
- **Мультипроєктність**: окремий \`X-Token\` для кожного вашого магазину чи бота.
- **Інтерактивний чекаут**: платіжна сторінка з симулятором успішних платежів, відхилень та повернень.
- **Webhook Inspector**: перегляд усіх надісланих колбеків у реальному часі.`
  },

  'auth': {
    slug: 'auth',
    title: 'Авторизація X-Token',
    category: 'Швидкий старт',
    content: `# Авторизація через X-Token

Усі звернення до API еквайрингу здійснюються із обов'язковим передаванням секретного токена проєкту в HTTP-заголовку **\`X-Token\`**.

## Як отримати токен

1. Перейдіть у панель керування Paymock.
2. Створіть новий проєкт (або оберіть існуючий).
3. Скопіюйте згенерований ключ виду \`pmk_live_xxxxxxxxxxxxxxxx\`.

## Приклад запиту

\`\`\`bash
curl -X GET "{{BASE_URL}}/api/merchant/details" \\
  -H "X-Token: pmk_live_your_secret_token_here"
\`\`\`

## Можливі помилки авторизації

<details>
<summary><span class="text-rose-400 font-mono font-semibold mr-2">403 FORBIDDEN</span> Токен відсутній або недійсний</summary>

Виникає, коли заголовок \`X-Token\` не передано взагалі, або вказаного токена не існує в базі даних проєктів.

\`\`\`json
{
  "errCode": "FORBIDDEN",
  "errText": "invalid or missing X-Token"
}
\`\`\`
</details>`
  },

  'ep-details': {
    slug: 'ep-details',
    title: 'Дані мерчанта',
    category: 'Ендпоінти API',
    badge: 'GET',
    badgeColor: 'emerald',
    content: `# Дані мерчанта

Отримує інформацію про поточного мерчанта (проєкт), прив'язаного до вказаного токена.

### Запит

\`\`\`http
GET /api/merchant/details HTTP/1.1
Host: {{HOST}}
X-Token: pmk_live_xxxxxxxxxxxx
\`\`\`

### Відповідь (200 OK)

\`\`\`json
{
  "merchantId": "pm_proj_98c17b",
  "merchantName": "Мій інтернет-магазин",
  "edrpou": "12345678"
}
\`\`\`

## Можливі помилки ендпоінта

<details>
<summary><span class="text-rose-400 font-mono font-semibold mr-2">403 FORBIDDEN</span> Недійсний X-Token</summary>

Заголовок \`X-Token\` не переданий або проєкт з таким токеном не знайдено.

\`\`\`json
{
  "errCode": "FORBIDDEN",
  "errText": "invalid or missing X-Token"
}
\`\`\`
</details>

<details>
<summary><span class="text-rose-400 font-mono font-semibold mr-2">500 INTERNAL_ERROR</span> Внутрішня помилка сервера</summary>

Виникає у разі збою підключення до бази даних D1.

\`\`\`json
{
  "errCode": "INTERNAL_ERROR",
  "errText": "unexpected error occurred"
}
\`\`\`
</details>`
  },

  'ep-create': {
    slug: 'ep-create',
    title: 'Створення рахунку (Invoice)',
    category: 'Ендпоінти API',
    badge: 'POST',
    badgeColor: 'blue',
    content: `# Створення рахунку (Invoice Create)

Створює новий платіжний рахунок та повертає посилання на сторінку чекауту для покупця.

### Запит

\`\`\`http
POST /api/merchant/invoice/create HTTP/1.1
Host: {{HOST}}
X-Token: pmk_live_xxxxxxxxxxxx
Content-Type: application/json

{
  "amount": 4200,
  "ccy": 980,
  "merchantPaymInfo": {
    "reference": "ORDER-10023",
    "destination": "Оплата замовлення №10023",
    "comment": "Тестова покупка",
    "basketOrder": [
      {
        "name": "Футболка чорна (Розмір L)",
        "qty": 1,
        "sum": 4200,
        "total": 4200,
        "code": "TSHIRT-BLK-L"
      }
    ]
  },
  "redirectUrl": "https://vash-magazyn.ua/payment/finish",
  "webHookUrl": "https://vash-magazyn.ua/api/payment/webhook",
  "validity": 900,
  "paymentType": "debit"
}
\`\`\`

### Параметри запиту

| Поле | Тип | Опис |
| --- | --- | --- |
| \`amount\` | \`number\` | **Обов'язкове**. Сума в мінімальних одиницях валюти (копійки). |
| \`ccy\` | \`number\` | Код валюти за ISO 4217 (дефолт: \`980\` — гривня). |
| \`merchantPaymInfo\` | \`object\` | Деталізація замовлення, номер чека, товари кошика. |
| \`redirectUrl\` | \`string\` | Посилання для повернення покупця після оплати. |
| \`webHookUrl\` | \`string\` | Адреса для відправки автоматичного колбеку про результат. |
| \`validity\` | \`number\` | Час дії рахунку в секундах (за замовчуванням **900 секунд / 15 хвилин**). |
| \`paymentType\` | \`string\` | Тип операції: \`debit\` або \`hold\`. |

### Термін дії рахунку (Validity & Таймер)

За замовчуванням кожне згенероване посилання на оплату (\`pageUrl\`) дійсне **15 хвилин (900 секунд)**.

- **Живий таймер**: на платіжній сторінці покупцеві відображається зворотний відлік часу дії рахунку (\`Дійсний ще 14:59\`).
- **Авто-експірація**: після закінчення 15 хвилин рахунок автоматично переходить у стан \`expired\`, подальша оплата блокується, а мерчант отримує відповідний вебхук.
- За необхідності мерчант може передати власну тривалість \`validity\` у секундах при створенні рахунку.

### Поведінка перенаправлення (Redirect URLs)

Керування тим, куди потрапляє користувач після оплати, повністю контролюється параметрами вашого API-запиту:

1. **Якщо вказано \`redirectUrl\` або \`successUrl\`**:
   - Покупець бачить стильний екран успішної оплати протягом **10 секунд** для ознайомлення з чеком транзакції.
   - Відображається зворотний відлік повернення до магазину.
   - Покупець може натиснути кнопку «Повернутися до магазину →» миттєво або дочекатися автоматичного переходу за вказаною адресою.

2. **Якщо посилання на повернення НЕ передано**:
   - Paymock **не робить примусових редіректів**. Покупець залишається на підсумковому екрані з деталями сплаченого замовлення.

### Інтеграція у Модальні вікна, iFrame та Popup (window.postMessage)

Якщо ви відкриваєте платіжну сторінку у модалці або спливаючому вікні на своєму сайті, Paymock автоматично транслює подію зміни статусу через браузерний механізм **\`window.postMessage\`** у батьківське вікно (\`window.parent\` / \`window.opener\`).

#### Структура події postMessage:
\`\`\`json
{
  "source": "paymock",
  "type": "payment_status",
  "status": "success",
  "invoiceId": "pm_inv_48f76e21ab",
  "amount": 4200,
  "ccy": 980
}
\`\`\`

#### Приклад слухача на стороні вашого сайту:
\`\`\`javascript
// Слухаємо статус оплати від відкритого iFrame чи Popup Paymock
window.addEventListener('message', (event) => {
  if (event.data?.source === 'paymock') {
    const { status, invoiceId } = event.data;

    if (status === 'success') {
      console.log('Платіж успішний для рахунку:', invoiceId);
      // Закриваємо модалку на сайті, показуємо екран замовлення чи конфеті
      closePaymentModal();
    } else if (status === 'failure') {
      console.warn('Оплату відхилено');
    } else if (status === 'expired') {
      console.warn('Час дії рахунку вичерпано');
    }
  }
});
\`\`\`

### Відповідь (200 OK)

\`\`\`json
{
  "invoiceId": "pm_inv_48f76e21ab",
  "pageUrl": "{{BASE_URL}}/pay/pm_inv_48f76e21ab"
}
\`\`\`

Клієнт переходить за \`pageUrl\` і бачить інтерфейс чекауту.

## Можливі помилки ендпоінта

<details>
<summary><span class="text-rose-400 font-mono font-semibold mr-2">400 BAD_REQUEST</span> Сума відсутня або менша/дорівнює 0</summary>

Виникає, коли в тілі запиту не передано поле \`amount\`, або вказано суму \`<= 0\` для звичайної оплати.

\`\`\`json
{
  "errCode": "BAD_REQUEST",
  "errText": "'amount' must be greater than 0"
}
\`\`\`
</details>

<details>
<summary><span class="text-rose-400 font-mono font-semibold mr-2">400 BAD_REQUEST</span> Некоректний JSON у тілі запиту</summary>

Виникає у разі надсилання невалідної структури JSON.

\`\`\`json
{
  "errCode": "BAD_REQUEST",
  "errText": "invalid json body"
}
\`\`\`
</details>

<details>
<summary><span class="text-rose-400 font-mono font-semibold mr-2">403 FORBIDDEN</span> Недійсний або відсутній X-Token</summary>

\`\`\`json
{
  "errCode": "FORBIDDEN",
  "errText": "invalid or missing X-Token"
}
\`\`\`
</details>`
  },

  'ep-status': {
    slug: 'ep-status',
    title: 'Статус рахунку',
    category: 'Ендпоінти API',
    badge: 'GET',
    badgeColor: 'emerald',
    content: `# Статус рахунку (Invoice Status)

Повертає актуальний стан рахунку, деталі транзакції та інформацію про оплачену картку.

### Запит

\`\`\`http
GET /api/merchant/invoice/status?invoiceId=pm_inv_48f76e21ab HTTP/1.1
Host: {{HOST}}
X-Token: pmk_live_xxxxxxxxxxxx
\`\`\`

### Життєвий цикл статусів

- \`created\` — рахунок створено, очікується дія користувача (дійсний 15 хвилин за замовчуванням).
- \`processing\` — платіж у процесі авторизації.
- \`hold\` — кошти успішно заблоковано (для холду).
- \`success\` — рахунок успішно оплачено.
- \`failure\` — оплата відхилена.
- \`reversed\` — кошти повернуто покупцю.
- \`expired\` — термін дії рахунку закінчився (через 15 хвилин / 900 с за замовчуванням) або його було анульовано.

### Відповідь (200 OK)

\`\`\`json
{
  "invoiceId": "pm_inv_48f76e21ab",
  "status": "success",
  "amount": 4200,
  "ccy": 980,
  "finalAmount": 4200,
  "createdDate": "2026-10-10T12:00:00Z",
  "modifiedDate": "2026-10-10T12:01:15Z",
  "reference": "ORDER-10023",
  "destination": "Оплата замовлення №10023",
  "paymentInfo": {
    "maskedPan": "4441 11** **** 1234",
    "approvalCode": "782194",
    "rrn": "981273918237",
    "paymentMethod": "pan",
    "paymentSystem": "Visa",
    "country": "Ukraine",
    "fee": 0
  }
}
\`\`\`

## Можливі помилки ендпоінта

<details>
<summary><span class="text-rose-400 font-mono font-semibold mr-2">400 BAD_REQUEST</span> Відсутній параметр invoiceId</summary>

Виникає, коли в рядку запиту відсутній обов'язковий query-параметр \`invoiceId\`.

\`\`\`json
{
  "errCode": "BAD_REQUEST",
  "errText": "missing 'invoiceId' parameter"
}
\`\`\`
</details>

<details>
<summary><span class="text-rose-400 font-mono font-semibold mr-2">404 NOT_FOUND</span> Рахунок не знайдено</summary>

Виникає, якщо рахунок із вказаним \`invoiceId\` не існує або належить іншому проєкту/мерчанту.

\`\`\`json
{
  "errCode": "NOT_FOUND",
  "errText": "invoice not found"
}
\`\`\`
</details>

<details>
<summary><span class="text-rose-400 font-mono font-semibold mr-2">403 FORBIDDEN</span> Недійсний X-Token</summary>

\`\`\`json
{
  "errCode": "FORBIDDEN",
  "errText": "invalid or missing X-Token"
}
\`\`\`
</details>`
  },

  'ep-cancel': {
    slug: 'ep-cancel',
    title: 'Скасування та повернення',
    category: 'Ендпоінти API',
    badge: 'POST',
    badgeColor: 'amber',
    content: `# Скасування та повернення коштів (Invoice Cancel)

Дозволяє скасувати успішний платіж або здійснити часткове чи повне повернення коштів.

### Запит

\`\`\`http
POST /api/merchant/invoice/cancel HTTP/1.1
Host: {{HOST}}
X-Token: pmk_live_xxxxxxxxxxxx
Content-Type: application/json

{
  "invoiceId": "pm_inv_48f76e21ab",
  "extRef": "REF-REFUND-001",
  "amount": 4200
}
\`\`\`

### Відповідь (200 OK)

\`\`\`json
{
  "status": "success",
  "createdDate": "2026-10-10T12:05:00Z",
  "modifiedDate": "2026-10-10T12:05:01Z"
}
\`\`\`

Після повернення статус рахунку змінюється на \`reversed\`, а на вказаний \`webHookUrl\` надсилається сповіщення.

## Можливі помилки ендпоінта

<details>
<summary><span class="text-rose-400 font-mono font-semibold mr-2">400 CANCEL_NOT_AVAILABLE</span> Рахунок не можна скасувати</summary>

Виникає, коли рахунок ще не був оплачений (перебуває в статусі \`created\` або \`failure\`) чи вже був скасований раніше. Скасування дозволено лише для статусів \`success\` або \`hold\`.

\`\`\`json
{
  "errCode": "CANCEL_NOT_AVAILABLE",
  "errText": "invoice cannot be cancelled in status: created"
}
\`\`\`
</details>

<details>
<summary><span class="text-rose-400 font-mono font-semibold mr-2">400 WRONG_CANCEL_AMOUNT</span> Сума повернення перевищує залишок</summary>

Виникає, коли передана сума \`amount\` більша за фактично оплачену суму рахунку.

\`\`\`json
{
  "errCode": "WRONG_CANCEL_AMOUNT",
  "errText": "cancel amount exceeds paid amount"
}
\`\`\`
</details>

<details>
<summary><span class="text-rose-400 font-mono font-semibold mr-2">404 NOT_FOUND</span> Рахунок не знайдено</summary>

\`\`\`json
{
  "errCode": "NOT_FOUND",
  "errText": "invoice not found"
}
\`\`\`
</details>

<details>
<summary><span class="text-rose-400 font-mono font-semibold mr-2">403 FORBIDDEN</span> Недійсний X-Token</summary>

\`\`\`json
{
  "errCode": "FORBIDDEN",
  "errText": "invalid or missing X-Token"
}
\`\`\`
</details>`
  },

  'ep-remove': {
    slug: 'ep-remove',
    title: 'Деактивація рахунку',
    category: 'Ендпоінти API',
    badge: 'POST',
    badgeColor: 'rose',
    content: `# Деактивація рахунку (Invoice Remove)

Анулює неоплачений рахунок, роблячи перехід за його платіжним посиланням неможливим.

### Запит

\`\`\`http
POST /api/merchant/invoice/remove HTTP/1.1
Host: {{HOST}}
X-Token: pmk_live_xxxxxxxxxxxx
Content-Type: application/json

{
  "invoiceId": "pm_inv_48f76e21ab"
}
\`\`\`

### Відповідь (200 OK)

\`\`\`json
{
  "status": "success",
  "createdDate": "2026-10-10T12:00:00Z",
  "modifiedDate": "2026-10-10T12:06:00Z"
}
\`\`\`

Статус рахунку переводиться в \`expired\`.

## Можливі помилки ендпоінта

<details>
<summary><span class="text-rose-400 font-mono font-semibold mr-2">400 BAD_REQUEST</span> Рахунок вже оплачено</summary>

Деактивація неможлива для вже оплачених рахунків зі статусом \`success\`. Для них слід використовувати \`/api/merchant/invoice/cancel\`.

\`\`\`json
{
  "errCode": "BAD_REQUEST",
  "errText": "cannot remove invoice in current status"
}
\`\`\`
</details>

<details>
<summary><span class="text-rose-400 font-mono font-semibold mr-2">404 NOT_FOUND</span> Рахунок не знайдено</summary>

\`\`\`json
{
  "errCode": "NOT_FOUND",
  "errText": "invoice not found"
}
\`\`\`
</details>

<details>
<summary><span class="text-rose-400 font-mono font-semibold mr-2">403 FORBIDDEN</span> Недійсний X-Token</summary>

\`\`\`json
{
  "errCode": "FORBIDDEN",
  "errText": "invalid or missing X-Token"
}
\`\`\`
</details>`
  },

  'webhooks': {
    slug: 'webhooks',
    title: 'Webhooks та Callbacks',
    category: 'Зворотні виклики',
    content: `# Webhooks та Callbacks

Щойно стан рахунку змінюється (покупець натиснув «Оплатити», відхилив платіж або здійснено повернення коштів), диспетчер Paymock автоматично надсилає HTTP POST-запит на \`webHookUrl\`.

## Формат Webhook Payload

\`\`\`json
{
  "invoiceId": "pm_inv_48f76e21ab",
  "status": "success",
  "amount": 4200,
  "ccy": 980,
  "finalAmount": 4200,
  "createdDate": "2026-10-10T12:00:00Z",
  "modifiedDate": "2026-10-10T12:01:15Z",
  "reference": "ORDER-10023",
  "destination": "Оплата замовлення №10023",
  "paymentInfo": {
    "maskedPan": "4441 11** **** 1234",
    "approvalCode": "782194",
    "rrn": "981273918237",
    "paymentMethod": "pan",
    "paymentSystem": "Visa",
    "country": "Ukraine",
    "fee": 0
  }
}
\`\`\`

## Вимоги до вашого сервера

- Сервер повинен відповісти HTTP статусом **\`200 OK\`**.
- У разі помилки або таймауту статус запиту логується в панелі керування Paymock у розділі **Webhooks Monitor**.

## Можливі помилки доставки вебхуків

<details>
<summary><span class="text-rose-400 font-mono font-semibold mr-2">500 Webhook Failure</span> Помилка бекенду вашого сайту</summary>

Якщо обробник на вашому сайті повернув код відмінний від 2xx (наприклад 404, 500, 502), запис про це збережеться в журналі зі статусом помилки.
</details>

<details>
<summary><span class="text-amber-400 font-mono font-semibold mr-2">TIMEOUT</span> Таймаут очікування відповіді (7 секунд)</summary>

Якщо бекенд вашого сайту не відповідає протягом 7 секунд, диспетчер зафіксує подію таймауту.
</details>`
  },

  'errors': {
    slug: 'errors',
    title: 'Формати помилок API',
    category: 'Довідка',
    content: `# Формати помилок API

Усі помилки повертаються в уніфікованому JSON форматі із відповідним HTTP статус-кодом:

\`\`\`json
{
  "errCode": "BAD_REQUEST",
  "errText": "missing or invalid 'amount' parameter"
}
\`\`\`

## Зведена таблиця помилок (Інтерактивний FAQ)

<details>
<summary><span class="text-rose-400 font-mono font-semibold mr-2">400 BAD_REQUEST</span> Некоректні параметри або невалідний JSON</summary>

Виникає, якщо передано некоректну структуру запиту, відсутнє поле \`amount\` або вказано від'ємну суму.

\`\`\`json
{
  "errCode": "BAD_REQUEST",
  "errText": "missing or invalid 'amount' parameter"
}
\`\`\`
</details>

<details>
<summary><span class="text-rose-400 font-mono font-semibold mr-2">403 FORBIDDEN</span> Недійсний або відсутній заголовок X-Token</summary>

Виникає, коли заголовок \`X-Token\` відсутній у запиті або вказаного токена не існує в базі даних проєктів.

\`\`\`json
{
  "errCode": "FORBIDDEN",
  "errText": "invalid or missing X-Token"
}
\`\`\`
</details>

<details>
<summary><span class="text-rose-400 font-mono font-semibold mr-2">404 NOT_FOUND</span> Рахунок або мерчант не знайдені</summary>

Виникає під час спроби отримати статус чи скасувати інвойс, якого немає в системі.

\`\`\`json
{
  "errCode": "NOT_FOUND",
  "errText": "invoice not found"
}
\`\`\`
</details>

<details>
<summary><span class="text-rose-400 font-mono font-semibold mr-2">400 CANCEL_NOT_AVAILABLE</span> Неможливо скасувати рахунок</summary>

Виникає при виклику \`/api/merchant/invoice/cancel\` для неоплаченого інвойсу. Скасувати можна тільки успішно оплачені рахунки.

\`\`\`json
{
  "errCode": "CANCEL_NOT_AVAILABLE",
  "errText": "invoice cannot be cancelled in current status"
}
\`\`\`
</details>

<details>
<summary><span class="text-rose-400 font-mono font-semibold mr-2">400 WRONG_CANCEL_AMOUNT</span> Сума скасування перевищує оплачену</summary>

Виникає, коли сума повернення перевищує залишок коштів на рахунку.

\`\`\`json
{
  "errCode": "WRONG_CANCEL_AMOUNT",
  "errText": "cancel amount exceeds paid amount"
}
\`\`\`
</details>

<details>
<summary><span class="text-rose-400 font-mono font-semibold mr-2">405 METHOD_NOT_ALLOWED</span> Непідтримуваний HTTP метод</summary>

Виникає, коли для ендпоінта викликано інший HTTP метод (наприклад, \`GET\` замість \`POST\`).

\`\`\`json
{
  "errCode": "METHOD_NOT_ALLOWED",
  "errText": "method not allowed"
}
\`\`\`
</details>

<details>
<summary><span class="text-rose-400 font-mono font-semibold mr-2">429 TMR</span> Занадто багато запитів (Rate Limit)</summary>

Виникає при перевищенні ліміту частоти звернень до API.

\`\`\`json
{
  "errCode": "TMR",
  "errText": "too many requests"
}
\`\`\`
</details>

    <details>
    <summary><span class="text-rose-400 font-mono font-semibold mr-2">500 INTERNAL_ERROR</span> Внутрішня помилка сервера</summary>

    Виникає при неочікуваних помилках виконання.

    \`\`\`json
    {
      "errCode": "INTERNAL_ERROR",
      "errText": "unexpected error occurred"
    }
    \`\`\`
    </details>`
  },

  'mcp': {
    slug: 'mcp',
    title: 'Paymock MCP Server (AI Асистент)',
    category: 'Швидкий старт',
    badge: 'AI / MCP',
    badgeColor: 'blue',
    content: `# Paymock MCP Server (AI Асистент)

Хмарний сервер протоколу **Model Context Protocol (MCP)** підключає платіжне середовище Paymock безпосередньо до AI-асистентів у **Cursor IDE**, **Claude Desktop**, **Windsurf**, **ZCode** або **Zed**.

Сервер працює у **глобальному режимі акаунта (Account-Level Scope)**: AI не обмежений одним статичним проєктом, а може **самостійно створювати нові проєкти під ваші мікросервіси чи боти**, генерувати рахунки та тестувати вебхуки на льоту!

---

## Швидке підключення

Оскільки Paymock функціонує як віддалений хмарний сервіс, вам **не потрібно встановлювати локальні пакети чи вказувати шляхи до файлів**. Підключення виконується через URL з використанням вашого токена з кабінету.

### 1. Cursor IDE (\`.cursor/mcp.json\`)

Створіть або відредагуйте файл \`.cursor/mcp.json\` у корені вашого проєкту:

\`\`\`json
{
  "mcpServers": {
    "paymock": {
      "url": "{{BASE_URL}}/api/mcp",
      "headers": {
        "X-Token": "pmk_live_ваш_токен_з_налаштувань"
      }
    }
  }
}
\`\`\`

### 2. Claude Desktop / Windsurf (\`claude_desktop_config.json\`)

Додайте конфігурацію сервера до файлу налаштувань:

\`\`\`json
{
  "mcpServers": {
    "paymock": {
      "url": "{{BASE_URL}}/api/mcp",
      "headers": {
        "X-Token": "pmk_live_ваш_токен_з_налаштувань"
      }
    }
  }
}
\`\`\`

> 💡 **Розумна авторизація:** Достатньо вказати токен будь-якого вашого проєкту. Сервер автоматично зв'яже його з вашим акаунтом, надавши асистенту права на перегляд усіх ваших проєктів та створення нових.

---

## Специфікація HTTP Ендпоінта

MCP-клієнти взаємодіють із сервером за стандартом JSON-RPC 2.0:

### Запит

\`\`\`http
POST /api/mcp HTTP/1.1
Host: {{HOST}}
X-Token: pmk_live_xxxxxxxxxxxx
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}
\`\`\`

### Відповідь

\`\`\`json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      { "name": "list_projects", "description": "Отримати перелік усіх проєктів..." },
      { "name": "create_project", "description": "Створити новий мерчант-проєкт..." },
      { "name": "create_invoice", "description": "Створити рахунок на оплату..." },
      { "name": "simulate_payment", "description": "Симулювати проведення оплати..." },
      { "name": "get_webhook_logs", "description": "Журнал доставки вебхуків..." }
    ]
  }
}
\`\`\`

---

## Інструменти керування проєктами (Projects)

<details>
<summary><span class="text-blue-400 font-mono font-semibold mr-2">TOOL</span> list_projects — Список усіх проєктів</summary>

Повертає перелік усіх проєктів вашого акаунта із назвами, ID, налаштуваннями дефолтних вебхуків та активними \`X-Token\`.

**Параметри:** Не потребує вхідних параметрів.

\`\`\`json
[
  {
    "id": "prj_88bdf21a0",
    "name": "Інтернет-магазин одягу",
    "token": "pmk_live_a89f928e01b3",
    "defaultWebhookUrl": "https://myshop.com/api/payment/webhook",
    "createdAt": "2026-10-10T12:00:00Z"
  }
]
\`\`\`
</details>

<details>
<summary><span class="text-emerald-400 font-mono font-semibold mr-2">TOOL</span> create_project — Створення нового проєкту</summary>

Дозволяє асистенту автоматично зареєструвати новий проєкт (наприклад, коли ви розробляєте новий сервіс, бот чи модуль), згенерувати для нього секретний ключ та підготувати змінні для вашого \`.env\`.

**Параметри:**
- \`name\` (*string*, обов'язковий) — назва проєкту (наприклад, \`Telegram Бот Підписок\`).
- \`defaultWebhookUrl\` (*string*, опціонально) — URL бекенду для вебхуків за замовчуванням.
- \`defaultSuccessUrl\` (*string*, опціонально) — адреса перенаправлення після оплати.
- \`edrpou\` (*string*, опціонально) — код ЄДРПОУ компанії.

\`\`\`json
{
  "message": "✅ Проєкт \\"Telegram Бот\\" успішно створено!",
  "project": {
    "id": "prj_91e0fa23",
    "name": "Telegram Бот",
    "token": "pmk_live_83ba91ef3802",
    "defaultWebhookUrl": "http://localhost:3000/api/bot-webhook"
  },
  "envExample": "PAYMOCK_PROJECT_ID=prj_91e0fa23\\nPAYMOCK_TOKEN=pmk_live_83ba91ef3802"
}
\`\`\`
</details>

<details>
<summary><span class="text-blue-400 font-mono font-semibold mr-2">TOOL</span> get_project — Інформація про проєкт</summary>

Отримує повну конфігурацію вказаного або поточного проєкту.

**Параметри:**
- \`projectId\` (*string*, опціонально) — ID проєкту. Якщо не вказано, повертається поточний активний проєкт.
</details>

<details>
<summary><span class="text-amber-400 font-mono font-semibold mr-2">TOOL</span> reset_project_token — Оновлення X-Token</summary>

Генерує новий секретний авторизаційний токен для проєкту замість старого або скомпрометованого.

**Параметри:**
- \`projectId\` (*string*, обов'язковий) — ID проєкту для оновлення токена.
</details>

---

## Інструменти платежів та тестування (Invoices)

<details>
<summary><span class="text-blue-400 font-mono font-semibold mr-2">TOOL</span> create_invoice — Створення рахунку</summary>

Створює новий платіжний рахунок та повертає готові посилання на сторінку чекауту (\`pageUrl\`) і мобільний додаток (\`appUrl\`).

**Параметри:**
- \`projectId\` (*string*, опціонально) — ID проєкту, для якого створюється рахунок. Якщо не вказано, використовується проєкт за замовчуванням.
- \`amount\` (*number*, обов'язковий) — сума в копійках (наприклад, \`15000\` для 150.00 ₴).
- \`destination\` (*string*, обов'язковий) — призначення платежу.
- \`comment\` (*string*, опціонально) — внутрішня примітка.
- \`webHookUrl\` (*string*, опціонально) — адреса вашого бекенду для отримання статусу.
- \`redirectUrl\` (*string*, опціонально) — адреса повернення покупця після оплати.

\`\`\`json
{
  "invoiceId": "p2_Lo7hOQmSTN",
  "status": "created",
  "amount": 15000,
  "pageUrl": "{{BASE_URL}}/pay/p2_Lo7hOQmSTN",
  "appUrl": "paymock://pay?invoiceId=p2_Lo7hOQmSTN",
  "projectId": "prj_88bdf21a0",
  "projectName": "Інтернет-магазин"
}
\`\`\`
</details>

<details>
<summary><span class="text-emerald-400 font-mono font-semibold mr-2">TOOL</span> simulate_payment — Симуляція оплати та Webhook</summary>

Програмно змінює статус рахунку без необхідності відкривати браузер і відправляє реальний HTTP-вебхук на вказаний \`webHookUrl\` вашого сайту.

**Параметри:**
- \`invoiceId\` (*string*, обов'язковий) — ідентифікатор рахунку.
- \`action\` (*string*, обов'язковий) — дія: \`success\`, \`failure\` або \`expired\`.
- \`failureReason\` (*string*, опціонально) — причина відхилення (наприклад, "Недостатньо коштів").

\`\`\`text
✅ Статус рахунку p2_Lo7hOQmSTN оновлено на [success].
Webhook: надіслано на https://myshop.com/api/webhook (HTTP 200, 48ms).
\`\`\`
</details>

<details>
<summary><span class="text-blue-400 font-mono font-semibold mr-2">TOOL</span> get_webhook_logs — Моніторинг відповідей бекенду</summary>

Повертає журнал відправлених вебхуків із кодами відповідей вашого сервера (HTTP 200, 500 тощо), тривалістю виконання у мілісекундах та отриманим тілом відповіді.

**Параметри:**
- \`projectId\` (*string*, опціонально) — фільтрація за проєктом.
- \`invoiceId\` (*string*, опціонально) — фільтр за конкретним рахунком.
- \`limit\` (*number*, дефолт 15) — кількість останніх записів.
</details>

<details>
<summary><span class="text-blue-400 font-mono font-semibold mr-2">TOOL</span> get_invoice — Деталі рахунку</summary>

Отримує повну інформацію про рахунок за його \`invoiceId\` (статус, сума, реквізити картки покупця, час створення та модифікації).

**Параметри:**
- \`invoiceId\` (*string*, обов'язковий) — ідентифікатор рахунку.
</details>

<details>
<summary><span class="text-blue-400 font-mono font-semibold mr-2">TOOL</span> list_invoices — Реєстр транзакцій</summary>

Повертає перелік рахунків проєкту з фільтрацією за статусами (\`created\`, \`success\`, \`failure\`, \`reversed\`, \`expired\` або \`all\`).

**Параметри:**
- \`projectId\` (*string*, опціонально) — фільтр за проєктом.
- \`status\` (*string*, опціонально) — статус фільтрації.
- \`limit\` (*number*, дефолт 20) — ліміт кількості записів.
</details>

<details>
<summary><span class="text-amber-400 font-mono font-semibold mr-2">TOOL</span> retry_webhook — Повторна відправка сповіщення</summary>

Виконує повторну спробу доставки вебхука для перевірки реакції виправленого локального бекенду.

**Параметри:**
- \`invoiceId\` (*string*, обов'язковий) — ідентифікатор рахунку.
- \`customUrl\` (*string*, опціонально) — альтернативна URL-адреса для тестування.
</details>

---

## Контекстні ресурси (Resources)

AI може автоматично підтягувати контекст вашого проєкту через спеціальні URI схеми:

| URI Ресурсу | Опис | Формат |
| :--- | :--- | :--- |
| \`paymock://projects\` | Перелік усіх доступних проєктів користувача | \`application/json\` |
| \`paymock://projects/{id}/stats\` | Фінансові підсумки та лічильники статусів | \`application/json\` |
| \`paymock://projects/{id}/invoices/recent\` | 10 останніх створених рахунків | \`application/json\` |

---

## Приклади запитів до AI-асистента

Завдяки глобальному підключенню ви можете віддавати асистенту комплексні задачі в звичайному чаті:

> **Створення окремого проєкту під новий модуль:**  
> *"Створи в Paymock новий проєкт 'Мобільний додаток' з вебхуком на \`http://localhost:8080/api/hook\` і запиши отриманий токен у мій .env.local."*

> **Автоматизований E2E тест з перевіркою реакції:**  
> *"Створи рахунок на 500 грн у проєкті 'Мобільний додаток', виклич simulate_payment з дією success і перевір у get_webhook_logs, чи повернув мій сервер 200 OK."*

> **Швидкий моніторинг помилок:**  
> *"Покажи останні 5 невдалих вебхуків з get_webhook_logs, щоб я бачив, де саме падає мій обробник."*`
  }
};
