/**
 * Pure MCP tool schemas and definitions.
 */
export const MCP_TOOLS = [
  // 1. Projects Management (Account Level)
  {
    name: 'list_projects',
    description: 'Отримати перелік усіх проєктів поточного користувача з їхніми ID, назвами, токенами авторизації (X-Token) та налаштуваннями.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'create_project',
    description: 'Створити новий мерчант-проєкт (магазин, бот, SaaS) для поточного користувача та згенерувати для нього окремий X-Token.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Назва проєкту, наприклад "Книжковий магазин" або "Telegram Бот Підписок"',
        },
        defaultWebhookUrl: {
          type: 'string',
          description: 'Опціональна дефолтна адреса вашого бекенду для отримання вебхуків',
        },
        defaultSuccessUrl: {
          type: 'string',
          description: 'Опціональний дефолтний URL повернення клієнта після успішної оплати',
        },
        defaultFailUrl: {
          type: 'string',
          description: 'Опціональний дефолтний URL повернення клієнта у разі відхилення',
        },
        edrpou: {
          type: 'string',
          description: 'ЄДРПОУ компанії мерчанта (за замовчуванням "12345678")',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_project',
    description: 'Отримати детальну інформацію про конкретний проєкт за його ID або поточний активний проєкт.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Опціональний ID проєкту. Якщо не вказано, повертає поточний активний проєкт.',
        },
      },
    },
  },
  {
    name: 'reset_project_token',
    description: 'Згенерувати новий секретний X-Token для проєкту замість скомпрометованого чи старого.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'ID проєкту, для якого потрібно оновити токен',
        },
      },
      required: ['projectId'],
    },
  },

  // 2. Invoices Management
  {
    name: 'create_invoice',
    description: 'Створити рахунок на оплату (інвойс), отримати готове посилання на чекаут (pageUrl) та глибоке посилання (appUrl).',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Опціональний ID проєкту (якщо не вказано, буде використано перший активний проєкт)',
        },
        amount: {
          type: 'number',
          description: 'Сума до сплати в копійках/центах (наприклад, 10000 для 100.00 грн)',
        },
        ccy: {
          type: 'number',
          description: 'Код валюти ISO (980 для UAH, 840 для USD, 978 для EUR). За замовчуванням 980',
        },
        destination: {
          type: 'string',
          description: 'Призначення платежу (наприклад, "Оплата замовлення #1042")',
        },
        comment: {
          type: 'string',
          description: 'Коментар або примітка до рахунку',
        },
        webHookUrl: {
          type: 'string',
          description: 'URL вашого бекенду для отримання вебхука про зміну статусу платежу',
        },
        redirectUrl: {
          type: 'string',
          description: 'URL куди перенаправити клієнта після завершення оплати',
        },
      },
      required: ['amount', 'destination'],
    },
  },
  {
    name: 'get_invoice',
    description: 'Отримати детальну інформацію про рахунок за його invoiceId (статус, сума, реквізити картки тощо).',
    inputSchema: {
      type: 'object',
      properties: {
        invoiceId: {
          type: 'string',
          description: 'Унікальний ідентифікатор рахунку (наприклад, p2_xxxxxxxxxx)',
        },
      },
      required: ['invoiceId'],
    },
  },
  {
    name: 'list_invoices',
    description: 'Отримати список рахунків проєкту з можливістю фільтрації за статусом та проєктом.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Опціональний ID проєкту (за замовчуванням активний проєкт)',
        },
        status: {
          type: 'string',
          enum: ['all', 'created', 'processing', 'hold', 'success', 'failure', 'reversed', 'expired'],
          description: 'Фільтр за статусом рахунку',
        },
        limit: {
          type: 'number',
          description: 'Кількість записів (за замовчуванням 20)',
        },
      },
    },
  },

  // 3. Testing & Webhooks
  {
    name: 'simulate_payment',
    description: 'Симулювати проведення оплати рахунку (успіх або відхилення), автоматично відправити Webhook на бекенд мерчанта.',
    inputSchema: {
      type: 'object',
      properties: {
        invoiceId: {
          type: 'string',
          description: 'ID рахунку для симуляції',
        },
        action: {
          type: 'string',
          enum: ['success', 'failure', 'expired'],
          description: 'Результат оплати: success (успішно), failure (відхилено), expired (прострочено)',
        },
        failureReason: {
          type: 'string',
          description: 'Опціональна причина відхилення при failure (наприклад, "Недостатньо коштів")',
        },
      },
      required: ['invoiceId', 'action'],
    },
  },
  {
    name: 'get_webhook_logs',
    description: 'Переглянути журнал доставки вебхуків (чи відповів ваш бекенд, код статусу HTTP 200/500, тіло відповіді та час затримки).',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Опціональний ID проєкту для фільтрації',
        },
        invoiceId: {
          type: 'string',
          description: 'Опціональний фільтр за конкретним invoiceId',
        },
        limit: {
          type: 'number',
          description: 'Кількість останніх логів (за замовчуванням 15)',
        },
      },
    },
  },
  {
    name: 'retry_webhook',
    description: 'Повторно надіслати вебхук для рахунку на вказаний або збережений webHookUrl.',
    inputSchema: {
      type: 'object',
      properties: {
        invoiceId: {
          type: 'string',
          description: 'ID рахунку для повторної відправки сповіщення',
        },
        customUrl: {
          type: 'string',
          description: 'Опціональний альтернативний URL для перевірки доставки',
        },
      },
      required: ['invoiceId'],
    },
  },
];
