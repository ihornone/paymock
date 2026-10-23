import { NextRequest, NextResponse } from 'next/server';

/**
 * The public OpenAPI document.
 *
 * Only the merchant surface is described here: it is the contract an
 * integrator actually needs, and it exposes no account-scoped endpoint. The
 * admin/account/MCP endpoints live in a separate, session-guarded document
 * (`/api/openapi.internal.json`) — listing them here would hand an anonymous
 * visitor a map of the internal API.
 *
 * The document is assembled from the local types below on purpose: importing
 * anything from `src/server/**` would pull the database and the auth layer
 * into a route that is served to the public.
 */

type JsonSchema = Record<string, unknown>;

type SecurityScheme = {
  type: 'apiKey';
  in: 'header' | 'cookie';
  name: string;
  description?: string;
};

type SecurityRequirement = Record<string, string[]>;

interface OpenApiParameter {
  name: string;
  in: 'header' | 'query' | 'path' | 'cookie';
  required?: boolean;
  description?: string;
  schema: JsonSchema;
  example?: unknown;
}

interface OpenApiRequestBody {
  required?: boolean;
  content: Record<string, { schema: JsonSchema }>;
}

interface OpenApiResponse {
  description: string;
  content?: Record<string, { schema: JsonSchema }>;
}

interface OpenApiOperation {
  summary: string;
  description?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  responses: Record<string, OpenApiResponse>;
  security?: SecurityRequirement[];
}

interface OpenApiDocument {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers: { url: string; description?: string }[];
  tags?: { name: string; description?: string }[];
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: {
    securitySchemes?: Record<string, SecurityScheme>;
  };
  security?: SecurityRequirement[];
}

const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

/**
 * The merchant credential.
 *
 * It is declared as a security scheme (instead of a plain header parameter)
 * so that the generated clients attach it automatically and so that the
 * document states unambiguously which operations are protected.
 */
const TOKEN_SECURITY: SecurityRequirement = { XToken: [] };

/**
 * The token header, kept as an explicit parameter as well: some integrators
 * read the parameters section and never look at the security schemes.
 *
 * The value is a placeholder — a real project token must never end up in a
 * document that is served to anybody.
 */
const TOKEN_HEADER_PARAM: OpenApiParameter = {
  name: 'X-Token',
  in: 'header',
  required: true,
  description: 'Токен проєкту Paymock. Схема безпеки — XToken.',
  schema: { type: 'string' },
  example: '<X-Token>',
};

export async function GET(req: NextRequest) {
  const host = req.headers.get('host') || 'localhost:8787';
  const proto = req.headers.get('x-forwarded-proto') || 'http';
  const baseUrl = `${proto}://${host}`;

  const spec: OpenApiDocument = {
    openapi: '3.0.3',
    info: {
      title: 'Paymock Acquiring API',
      version: '1.0.0',
      description:
        'Публічна частина API mock-сервісу інтернет-еквайрингу Paymock. Повна сумісність контракту запитів/відповідей, підтримка мультипроєктності та вебхуків. Токен проєкту передається в заголовку `X-Token`; внутрішні (account/admin) ендпоїнти в цю специфікацію не входять.',
    },
    servers: [
      {
        url: baseUrl,
        description: 'Поточний сервер Paymock',
      },
    ],
    tags: [
      { name: 'Merchant', description: 'Мерчантське API: інвойси та дані проєкту' },
      { name: 'Checkout', description: 'Публічна сторінка оплати та її дії' },
    ],
    paths: {
      '/api/merchant/details': {
        get: {
          summary: 'Дані поточного мерчанта',
          tags: ['Merchant'],
          parameters: [TOKEN_HEADER_PARAM],
          security: [TOKEN_SECURITY],
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
          tags: ['Merchant'],
          parameters: [TOKEN_HEADER_PARAM],
          security: [TOKEN_SECURITY],
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
                    validity: {
                      type: 'integer',
                      default: 900,
                      description:
                        'Час дії рахунку в секундах (за замовчуванням 900 с / 15 хвилин)',
                    },
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
          description:
            'Статус рахунку читається лише власником проєкту: запит без дійсного `X-Token` повертає 403.',
          tags: ['Merchant'],
          parameters: [
            TOKEN_HEADER_PARAM,
            {
              name: 'invoiceId',
              in: 'query',
              required: true,
              schema: { type: 'string' },
            },
          ],
          security: [TOKEN_SECURITY],
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
            '403': { description: 'Недійсний або відсутній токен' },
            '404': { description: 'Рахунок не знайдено' },
          },
        },
      },
      '/api/merchant/invoice/cancel': {
        post: {
          summary: 'Скасування або повернення коштів за рахунком',
          tags: ['Merchant'],
          parameters: [TOKEN_HEADER_PARAM],
          security: [TOKEN_SECURITY],
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
            '403': { description: 'Недійсний або відсутній токен' },
          },
        },
      },
      '/api/merchant/invoice/remove': {
        post: {
          summary: 'Анулювання неоплаченого рахунку',
          tags: ['Merchant'],
          parameters: [TOKEN_HEADER_PARAM],
          security: [TOKEN_SECURITY],
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
            '403': { description: 'Недійсний або відсутній токен' },
          },
        },
      },

      /*
       * The checkout surface is public by design: the URL is handed to the
       * payer (it arrives in `pageUrl` of the invoice creation response) and
       * must work without any merchant credential — the payer has none.
       */
      '/pay/{invoiceId}': {
        get: {
          summary: 'Сторінка оплати рахунку',
          description:
            'Публічна сторінка оплати. Токен не потрібен: платіжник переходить за посиланням, отриманим у відповідь на створення рахунку.',
          tags: ['Checkout'],
          parameters: [
            {
              name: 'invoiceId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          security: [],
          responses: {
            '200': {
              description: 'Сторінка оплати',
              content: {
                'text/html': {
                  schema: { type: 'string' },
                },
              },
            },
            '404': { description: 'Рахунок не знайдено' },
          },
        },
      },
      '/pay/{invoiceId}/action': {
        post: {
          summary: 'Дія платіжника на сторінці оплати',
          description:
            'Симуляція дії платіжника (успіх / відхилення / прострочення). Токен не потрібен.',
          tags: ['Checkout'],
          parameters: [
            {
              name: 'invoiceId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['action'],
                  properties: {
                    action: { type: 'string', enum: ['success', 'failure', 'expired'] },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Статус рахунку оновлено',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean' },
                      status: { type: 'string' },
                      redirectUrl: { type: 'string', nullable: true },
                    },
                  },
                },
              },
            },
            '400': { description: 'Некоректна дія або рахунок у фінальному статусі' },
            '404': { description: 'Рахунок не знайдено' },
            '429': { description: 'Перевищено ліміт запитів' },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        XToken: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Token',
          description:
            'Токен мерчантського проєкту, який видається в кабінеті. Передається в заголовку `X-Token`. Значення токена — секрет інтегратора, у документації використовується лише плейсхолдер.',
        },
      },
    },
    // The default for the whole document: every operation that does not
    // override it needs the merchant token.
    security: [TOKEN_SECURITY],
  };

  return NextResponse.json(spec, { headers: NO_STORE });
}
