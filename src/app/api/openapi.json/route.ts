import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const host = req.headers.get('host') || 'localhost:8787';
  const proto = req.headers.get('x-forwarded-proto') || 'http';
  const baseUrl = `${proto}://${host}`;

  const spec = {
    openapi: '3.0.3',
    info: {
      title: 'Paymock Acquiring API',
      version: '1.0.0',
      description: 'API mock-сервісу інтернет-еквайрингу Paymock. Повна сумісність контракту запитів/відповідей, підтримка мультипроєктності та вебхуків.',
    },
    servers: [
      {
        url: baseUrl,
        description: 'Поточний сервер Paymock',
      },
    ],
    paths: {
      '/api/merchant/details': {
        get: {
          summary: 'Дані поточного мерчанта',
          parameters: [
            {
              name: 'X-Token',
              in: 'header',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Успішна відповідь',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      merchantId: { type: 'string' },
                      merchantName: { type: 'string' },
                      edrpou: { type: 'string' },
                    },
                  },
                },
              },
            },
            '403': { description: 'Недійсний або відсутній токен' },
          },
        },
      },
      '/api/merchant/invoice/create': {
        post: {
          summary: 'Створення рахунку (інвойсу)',
          parameters: [
            {
              name: 'X-Token',
              in: 'header',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['amount'],
                  properties: {
                    amount: { type: 'integer' },
                    ccy: { type: 'integer', default: 980 },
                    merchantPaymInfo: { type: 'object' },
                    redirectUrl: { type: 'string' },
                    webHookUrl: { type: 'string' },
                    validity: { type: 'integer', default: 900, description: 'Час дії рахунку в секундах (за замовчуванням 900 с / 15 хвилин)' },
                    paymentType: { type: 'string', enum: ['debit', 'hold'] },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Рахунок створено',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      invoiceId: { type: 'string' },
                      pageUrl: { type: 'string' },
                    },
                  },
                },
              },
            },
            '400': { description: 'Помилка валідації параметрів' },
            '403': { description: 'Недійсний токен' },
          },
        },
      },
      '/api/merchant/invoice/status': {
        get: {
          summary: 'Перевірка статусу рахунку',
          parameters: [
            {
              name: 'X-Token',
              in: 'header',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'invoiceId',
              in: 'query',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Стан рахунку',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      invoiceId: { type: 'string' },
                      status: { type: 'string' },
                      amount: { type: 'integer' },
                      ccy: { type: 'integer' },
                    },
                  },
                },
              },
            },
            '404': { description: 'Рахунок не знайдено' },
          },
        },
      },
      '/api/merchant/invoice/cancel': {
        post: {
          summary: 'Скасування або повернення коштів за рахунком',
          parameters: [
            {
              name: 'X-Token',
              in: 'header',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['invoiceId'],
                  properties: {
                    invoiceId: { type: 'string' },
                    extRef: { type: 'string' },
                    amount: { type: 'integer' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Повернення успішне' },
            '400': { description: 'Неприпустимий стан рахунку або параметри' },
          },
        },
      },
      '/api/merchant/invoice/remove': {
        post: {
          summary: 'Анулювання неоплаченого рахунку',
          parameters: [
            {
              name: 'X-Token',
              in: 'header',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['invoiceId'],
                  properties: {
                    invoiceId: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Рахунок успішно анульовано' },
            '400': { description: 'Неможливо анулювати цей рахунок' },
          },
        },
      },

      '/api/mcp': {
        post: {
          summary: 'MCP-сервер (Model Context Protocol)',
          description:
            'JSON-RPC 2.0 ендпоїнт для підключення AI-асистентів. Підтримує initialize, server/discover, notifications/initialized, ping, tools/list, tools/call, resources/list, resources/read та prompts/list. Токен проєкту (`pmk_live_…`) обмежує сесію одним проєктом, глобальний токен акаунта (`pmk_usr_…`) — усіма проєктами акаунта.',
          tags: ['MCP'],
          parameters: [
            {
              name: 'X-Token',
              in: 'header',
              required: true,
              description: 'Токен проєкту (`pmk_live_…`) або глобальний токен акаунта (`pmk_usr_…`)',
              schema: { type: 'string' },
            },
            {
              name: 'mcp-protocol-version',
              in: 'header',
              required: false,
              schema: { type: 'string', example: '2024-11-05' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['jsonrpc', 'method'],
                  properties: {
                    jsonrpc: { type: 'string', enum: ['2.0'] },
                    id: { type: ['string', 'number', 'null'] },
                    method: {
                      type: 'string',
                      examples: ['initialize', 'tools/list', 'tools/call', 'resources/list', 'resources/read', 'ping'],
                    },
                    params: { type: 'object' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'JSON-RPC відповідь (result або error)' },
            '204': { description: 'Сповіщення прийнято без відповіді' },
            '400': { description: 'Невірний JSON' },
            '401': { description: 'Недійсний або відсутній токен' },
            '429': { description: 'Перевищено ліміт запитів' },
          },
        },
      },
      '/api/admin/projects': {
        get: {
          summary: 'Проєкти акаунта, рахунки, вебхуки та статистика',
          tags: ['Account'],
          parameters: [
            { name: 'projectId', in: 'query', required: false, schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'Дані кабінету' },
            '401': { description: 'Недійсний або відсутній токен' },
          },
        },
        post: {
          summary: 'Створення проєкту',
          tags: ['Account'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string', minLength: 1, maxLength: 120 },
                    edrpou: { type: 'string', maxLength: 32 },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Створений проєкт разом із його X-Token' },
            '400': { description: 'Некоректна назва проєкту' },
          },
        },
        patch: {
          summary: 'Оновлення проєкту',
          tags: ['Account'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['id'],
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string', maxLength: 120 },
                    logo_url: { type: 'string', nullable: true },
                    default_webhook_url: { type: 'string', nullable: true },
                    default_success_url: { type: 'string', nullable: true },
                    default_fail_url: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Оновлений проєкт' },
            '400': { description: 'Некоректні параметри' },
            '404': { description: 'Проєкт не знайдено або немає доступу' },
          },
        },
        delete: {
          summary: 'Видалення проєкту разом із його рахунками',
          tags: ['Account'],
          parameters: [{ name: 'id', in: 'query', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Проєкт видалено' },
            '404': { description: 'Проєкт не знайдено або немає доступу' },
          },
        },
      },
      '/api/admin/projects/reset-token': {
        post: {
          summary: 'Ротація X-Token проєкту',
          description: 'Старий токен перестає працювати одразу після ротації.',
          tags: ['Account'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['projectId'],
                  properties: { projectId: { type: 'string' } },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Проєкт із новим токеном' },
            '404': { description: 'Проєкт не знайдено або немає доступу' },
          },
        },
      },
      '/api/account/tokens': {
        get: {
          summary: 'Активні персональні токени доступу',
          description: 'Повертає лише метадані — значення токена не відновлюється зі сховища.',
          tags: ['Account'],
          responses: {
            '200': { description: 'Список активних токенів' },
            '401': { description: 'Недійсний або відсутній токен' },
          },
        },
        post: {
          summary: 'Випуск персонального токена доступу',
          description: 'Значення токена показується один раз — зберігається лише SHA-256 хеш.',
          tags: ['Account'],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { name: { type: 'string', maxLength: 64 } },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Новий токен (показується один раз)' },
            '401': { description: 'Недійсний або відсутній токен' },
          },
        },
        delete: {
          summary: 'Відкликання персональних токенів',
          tags: ['Account'],
          parameters: [{ name: 'name', in: 'query', required: false, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Кількість відкликаних токенів' },
            '401': { description: 'Недійсний або відсутній токен' },
          },
        },
      },
    },
  };

  return NextResponse.json(spec);
}
